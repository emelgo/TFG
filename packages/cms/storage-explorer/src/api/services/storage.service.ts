/**
 * Servicio del explorador de almacenamiento del CMS.
 *
 * Lista *buckets* y carpetas, genera URL firmadas de vista previa y de
 * descarga, sube ficheros, crea carpetas, renombra (mueve) y borra objetos de
 * Supabase Storage.
 *
 * Usa el **cliente de servicio** de Storage (`getSupabaseAdminClient`), que
 * ignora las políticas RLS de `storage.objects`: así el CMS puede gestionar
 * *buckets* cuyas políticas solo contemplan a los usuarios de la app (como
 * `account_image`, las fotos de perfil de los *tenants*). A cambio, cada
 * método sigue siempre el mismo orden, sin excepciones:
 *
 *  1. valida el *bucket* y las rutas (`path-security`: sin `..`, absolutas
 *     ni codificaciones);
 *  2. comprueba `cms.has_storage_permission` sobre la ruta **exacta** de
 *     cada objeto que se va a leer, crear o borrar;
 *  3. solo entonces usa el cliente de servicio.
 *
 * Además:
 *  - las URL firmadas son de corta duración (10 minutos para las vistas
 *    previas, 1 minuto para las descargas) y las descargas fuerzan
 *    `Content-Disposition: attachment`;
 *  - solo se previsualizan imágenes (PNG, JPEG, GIF, WebP), y la interfaz
 *    las muestra con `<img>`, que nunca ejecuta código;
 *  - las subidas tienen un tamaño máximo y se guardan con un tipo de
 *    contenido decidido por el servidor (`upload-content-type`).
 *
 * [TFG] RF-09 · RNF-02: almacenamiento del CMS con autorización propia antes
 * del cliente de servicio. Ver Memoria §Diseño > Seguridad del CMS.
 */
import type { Context } from 'hono';

import {
  STORAGE_LIMITS,
  getStorageFileType,
  joinStoragePath,
} from '@pymekit/cms-shared/storage-paths';
import { getSupabaseAdminClient } from '@pymekit/cms-supabase/hono';
import { getLogger } from '@pymekit/shared/logger';

import {
  validateBatchFilePaths,
  validateBucketName,
  validateFileName,
  validateFilePath,
  validateFolderPath,
} from '../../utils/path-security';
import { StorageError, fromStorageApiError } from '../../utils/storage-errors';
import { getUploadContentType } from '../../utils/upload-content-type';
import {
  type StorageObjectPermissions,
  createStoragePermissionsService,
} from './storage-permissions.service';

/** Validez de las URL firmadas de vista previa (segundos). */
export const PREVIEW_URL_TTL_SECONDS = 10 * 60;

/** Validez de las URL firmadas de descarga (segundos). */
export const DOWNLOAD_URL_TTL_SECONDS = 60;

/**
 * Máximo de elementos que se leen de una carpeta para listarla. La API de
 * Storage no devuelve el total, así que se lee hasta este límite y se pagina
 * en memoria (carpetas primero); si se alcanza, la respuesta lo indica
 * (`truncated`).
 */
const MAX_LISTED_ITEMS = 1000;

/** Máximo de ficheros que puede borrar una sola operación (carpetas incluidas). */
const MAX_DELETION_FILES = 1000;

/** Marcador que crea Supabase para representar una carpeta vacía. */
const FOLDER_PLACEHOLDER = '.emptyFolderPlaceholder';

/** Un elemento de una carpeta tal como lo recibe la interfaz. */
export type StorageItem = {
  name: string;
  /** Ruta completa dentro del *bucket*. */
  path: string;
  isDirectory: boolean;
  fileType: ReturnType<typeof getStorageFileType>;
  size: number | null;
  mimeType: string | null;
  updatedAt: string | null;
  /** URL firmada de corta duración, solo para imágenes legibles. */
  previewUrl?: string;
  permissions: StorageObjectPermissions;
};

/** Crea el servicio de almacenamiento de una petición. */
export function createStorageService(c: Context) {
  return new StorageService(c);
}

class StorageService {
  private readonly permissions: ReturnType<
    typeof createStoragePermissionsService
  >;

  constructor(context: Context) {
    this.permissions = createStoragePermissionsService(context);
  }

  /**
   * Devuelve los *buckets* cuya raíz puede leer el usuario. Sin ningún
   * permiso de almacenamiento (el personal de soporte del *seed*), la lista
   * está vacía.
   */
  async getBuckets() {
    const client = getSupabaseAdminClient();
    const { data: buckets, error } = await client.storage.listBuckets();

    if (error) {
      throw fromStorageApiError(error, 'listBuckets');
    }

    const readable = await Promise.all(
      buckets.map(async (bucket) =>
        (await this.permissions.canReadBucket(bucket.name)) ? bucket : null,
      ),
    );

    return readable
      .filter((bucket) => bucket !== null)
      .map((bucket) => ({
        id: bucket.id,
        name: bucket.name,
        public: bucket.public,
        createdAt: bucket.created_at,
        updatedAt: bucket.updated_at,
      }));
  }

  /**
   * Devuelve una página del contenido de una carpeta, con los permisos del
   * usuario sobre cada elemento y sobre la propia carpeta.
   */
  async getBucketContents(params: {
    bucket: string;
    path: string;
    search?: string;
    page: number;
    limit: number;
  }) {
    validateBucketName(params.bucket);
    validateFolderPath(params.path);

    // La raíz del *bucket* se autoriza como `/`, igual que en la lista de
    // *buckets*.
    await this.permissions.validateStoragePermission(
      params.bucket,
      'select',
      params.path || '/',
    );

    const client = getSupabaseAdminClient();
    const search = params.search?.trim();

    const { data: files, error } = await client.storage
      .from(params.bucket)
      .list(params.path, {
        limit: MAX_LISTED_ITEMS,
        sortBy: { column: 'name', order: 'asc' },
        ...(search ? { search } : {}),
      });

    if (error) {
      throw fromStorageApiError(error, 'list');
    }

    const items = files
      .filter((file) => file.name !== FOLDER_PLACEHOLDER)
      .map((file) => {
        // En la API de Storage las carpetas no tienen `id`.
        const isDirectory = !file.id;
        const metadata = (file.metadata ?? {}) as {
          size?: number;
          mimetype?: string;
        };

        return {
          name: file.name,
          path: joinStoragePath(params.path, file.name),
          isDirectory,
          fileType: getStorageFileType(file.name),
          size: isDirectory ? null : (metadata.size ?? null),
          mimeType: isDirectory ? null : (metadata.mimetype ?? null),
          updatedAt: file.updated_at ?? null,
        };
      })
      .sort((a, b) =>
        a.isDirectory === b.isDirectory
          ? a.name.localeCompare(b.name)
          : a.isDirectory
            ? -1
            : 1,
      );

    const total = items.length;
    const totalPages = Math.max(1, Math.ceil(total / params.limit));
    const page = Math.min(params.page, totalPages);
    const pageItems = items.slice(
      (page - 1) * params.limit,
      page * params.limit,
    );

    // Permisos solo de la página visible, cada uno sobre su ruta exacta. El
    // permiso de subir a la carpeta se calcula sobre el marcador de carpeta,
    // que es un objeto real de esa carpeta (no hay otra forma de preguntar
    // por «cualquier objeto dentro de…» con un patrón de ruta).
    const folderProbe = joinStoragePath(params.path, FOLDER_PLACEHOLDER);

    const permissionsMap = await this.permissions.getBulkUserStoragePermissions(
      params.bucket,
      [...pageItems.map((item) => item.path), folderProbe],
    );

    const previewUrls = await this.createPreviewUrls(
      params.bucket,
      pageItems
        .filter(
          (item) =>
            !item.isDirectory &&
            item.fileType === 'image' &&
            permissionsMap.get(item.path)?.canRead,
        )
        .map((item) => item.path),
    );

    const contents: StorageItem[] = pageItems.map((item) => ({
      ...item,
      previewUrl: previewUrls.get(item.path),
      permissions: permissionsMap.get(item.path)!,
    }));

    const folderPermissions = permissionsMap.get(folderProbe)!;

    return {
      contents,
      folderPermissions: {
        canUpload: folderPermissions.canUpload,
      },
      truncated: files.length >= MAX_LISTED_ITEMS,
      pagination: {
        page,
        limit: params.limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  /**
   * Crea las URL firmadas de vista previa de varias imágenes con una sola
   * llamada. Un fallo no impide listar: esas imágenes se ven con su icono.
   */
  private async createPreviewUrls(bucket: string, paths: string[]) {
    const urls = new Map<string, string>();

    if (paths.length === 0) {
      return urls;
    }

    const client = getSupabaseAdminClient();

    const { data, error } = await client.storage
      .from(bucket)
      .createSignedUrls(paths, PREVIEW_URL_TTL_SECONDS);

    if (error) {
      const logger = await getLogger();

      logger.warn({ error, bucket }, 'Could not sign storage preview URLs');

      return urls;
    }

    for (const entry of data) {
      if (entry.path && entry.signedUrl && !entry.error) {
        urls.set(entry.path, entry.signedUrl);
      }
    }

    return urls;
  }

  /**
   * Devuelve una URL firmada de descarga (1 minuto) que fuerza
   * `Content-Disposition: attachment`: aunque el objeto sea HTML o SVG, el
   * navegador lo descarga en lugar de abrirlo como documento. Se firma
   * también en los *buckets* públicos, para que la descarga sea siempre igual
   * de segura y caduque.
   */
  async getDownloadUrl(params: { bucket: string; path: string }) {
    validateBucketName(params.bucket);
    validateFilePath(params.path);

    await this.permissions.validateStoragePermission(
      params.bucket,
      'select',
      params.path,
    );

    const client = getSupabaseAdminClient();
    const fileName = params.path.split('/').pop() || 'download';

    const { data, error } = await client.storage
      .from(params.bucket)
      .createSignedUrl(params.path, DOWNLOAD_URL_TTL_SECONDS, {
        download: fileName,
      });

    if (error) {
      throw fromStorageApiError(error, 'createSignedUrl');
    }

    return data.signedUrl;
  }

  /**
   * Renombra o mueve un fichero. Mover borra el objeto de origen y lo crea en
   * el destino, así que se exige exactamente eso: `delete` sobre el origen e
   * `insert` sobre el destino (comprobar solo `update` permitiría sacar un
   * objeto de una carpeta protegida o colocarlo en otra ajena).
   */
  async renameFile(params: {
    bucket: string;
    fromPath: string;
    toPath: string;
  }) {
    validateBucketName(params.bucket);
    validateFilePath(params.fromPath);
    validateFilePath(params.toPath);

    if (params.fromPath === params.toPath) {
      throw StorageError.invalidPath('Source and destination are the same');
    }

    await Promise.all([
      this.permissions.validateStoragePermission(
        params.bucket,
        'delete',
        params.fromPath,
      ),
      this.permissions.validateStoragePermission(
        params.bucket,
        'insert',
        params.toPath,
      ),
    ]);

    const client = getSupabaseAdminClient();

    const { error } = await client.storage
      .from(params.bucket)
      .move(params.fromPath, params.toPath);

    if (error) {
      throw fromStorageApiError(error, 'move');
    }

    return { success: true };
  }

  /**
   * Borra ficheros y carpetas. Una carpeta se borra fichero a fichero (Storage
   * no tiene carpetas reales): se recorre su contenido y se exige `delete`
   * sobre **cada** objeto que se va a borrar, no solo sobre la carpeta.
   */
  async deleteFiles(params: { bucket: string; paths: string[] }) {
    validateBucketName(params.bucket);
    validateBatchFilePaths(params.paths);

    // Primera barrera, barata: permiso sobre lo que el usuario ha elegido.
    await this.permissions.validateBulkStoragePermission(
      params.bucket,
      'delete',
      params.paths,
    );

    const client = getSupabaseAdminClient();
    const pathsToDelete = new Set<string>();

    for (const path of params.paths) {
      const nested = await this.listFilesRecursively(params.bucket, path);

      if (nested.length === 0) {
        // Un fichero (o una carpeta vacía sin marcador).
        pathsToDelete.add(path);
      }

      for (const file of nested) {
        pathsToDelete.add(file);
      }

      if (pathsToDelete.size > MAX_DELETION_FILES) {
        throw StorageError.tooManyFiles();
      }
    }

    const allPaths = [...pathsToDelete];

    // Segunda barrera: permiso exacto sobre cada objeto de las carpetas.
    await this.permissions.validateBulkStoragePermission(
      params.bucket,
      'delete',
      allPaths,
    );

    const { error } = await client.storage.from(params.bucket).remove(allPaths);

    if (error) {
      throw fromStorageApiError(error, 'remove');
    }

    return { success: true, deleted: allPaths.length };
  }

  /**
   * Devuelve las rutas de todos los ficheros bajo `folderPath` (vacío si es
   * un fichero). Recorre la carpeta por niveles con límites para no
   * agotar la base de datos con una carpeta enorme.
   */
  private async listFilesRecursively(bucket: string, folderPath: string) {
    const client = getSupabaseAdminClient();
    const files: string[] = [];
    const pending = [folderPath];
    let foldersVisited = 0;

    while (pending.length > 0) {
      const folder = pending.shift()!;

      foldersVisited += 1;

      if (foldersVisited > 100) {
        throw StorageError.tooManyFiles('Too many nested folders');
      }

      const { data, error } = await client.storage
        .from(bucket)
        .list(folder, { limit: MAX_DELETION_FILES });

      if (error) {
        throw fromStorageApiError(error, 'list');
      }

      for (const item of data) {
        const itemPath = joinStoragePath(folder, item.name);

        if (item.id) {
          files.push(itemPath);
        } else {
          pending.push(itemPath);
        }

        if (files.length > MAX_DELETION_FILES) {
          throw StorageError.tooManyFiles();
        }
      }
    }

    return files;
  }

  /**
   * Crea una carpeta subiendo el marcador vacío que usa Supabase. El permiso
   * `insert` se comprueba sobre ese objeto exacto, que es lo que se escribe.
   */
  async createFolder(params: {
    bucket: string;
    folderName: string;
    parentPath: string;
  }) {
    validateBucketName(params.bucket);
    validateFileName(params.folderName);
    validateFolderPath(params.parentPath);

    const folderPath = joinStoragePath(params.parentPath, params.folderName);
    const placeholderPath = joinStoragePath(folderPath, FOLDER_PLACEHOLDER);

    await this.permissions.validateStoragePermission(
      params.bucket,
      'insert',
      placeholderPath,
    );

    const client = getSupabaseAdminClient();

    const { error } = await client.storage
      .from(params.bucket)
      .upload(placeholderPath, new Uint8Array(0), {
        contentType: 'text/plain',
        upsert: false,
      });

    if (error) {
      throw fromStorageApiError(error, 'createFolder');
    }

    return { success: true, path: folderPath };
  }

  /**
   * Sube un fichero a una carpeta. No sobrescribe (`upsert: false`): para
   * reemplazar hay que borrar antes, que exige su propio permiso.
   */
  async uploadFile(params: { bucket: string; folder: string; file: File }) {
    validateBucketName(params.bucket);
    validateFolderPath(params.folder);
    validateFileName(params.file.name);

    if (params.file.size > STORAGE_LIMITS.maxUploadBytes) {
      throw StorageError.fileTooLarge();
    }

    const objectPath = joinStoragePath(params.folder, params.file.name);

    validateFilePath(objectPath);

    await this.permissions.validateStoragePermission(
      params.bucket,
      'insert',
      objectPath,
    );

    const bytes = new Uint8Array(await params.file.arrayBuffer());

    // Se vuelve a medir el contenido real: `File.size` lo declara el cliente.
    if (bytes.byteLength > STORAGE_LIMITS.maxUploadBytes) {
      throw StorageError.fileTooLarge();
    }

    const client = getSupabaseAdminClient();

    const { error } = await client.storage
      .from(params.bucket)
      .upload(objectPath, bytes, {
        contentType: getUploadContentType(params.file.name, bytes),
        upsert: false,
      });

    if (error) {
      throw fromStorageApiError(error, 'upload');
    }

    return { success: true, path: objectPath };
  }
}
