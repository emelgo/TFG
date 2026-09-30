/**
 * Comprobación de permisos de almacenamiento del CMS.
 *
 * Toda operación del explorador de almacenamiento pasa por aquí **antes** de
 * usar el cliente de servicio de Supabase Storage, que ignora RLS. La
 * decisión la toma la base de datos con `cms.has_storage_permission(bucket,
 * acción, ruta)`, ejecutada con los *claims* del usuario (Drizzle con
 * contexto RLS): comprueba el acceso al CMS (cuenta activa, MFA) y los
 * permisos de almacenamiento de sus roles (*bucket* y patrón de ruta).
 *
 * Cada comprobación se hace sobre la ruta **exacta** del objeto afectado. El
 * código de partida heredaba los permisos de la carpeta padre a sus hijos
 * como «optimización», lo que podía conceder de más con patrones de ruta
 * exactos (un permiso sobre `a/b` no cubre `a/b/c.png`); se ha retirado.
 *
 * Si la comprobación falla por un error, se deniega (falla en cerrado).
 *
 * [TFG] RNF-02 · RF-09: autorización del almacenamiento en la base de datos.
 */
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';

// Solo tipos: trae la ampliación de `ContextVariableMap` (`drizzle`).
import type {} from '@pymekit/cms-supabase/client';
import { getLogger } from '@pymekit/shared/logger';

import { StorageError } from '../../utils/storage-errors';

/** Acciones de almacenamiento que se autorizan. */
export type StorageAction = 'select' | 'update' | 'delete' | 'insert';

/** Permisos de un objeto tal como los usa la interfaz. */
export type StorageObjectPermissions = {
  canRead: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canUpload: boolean;
};

const NO_PERMISSIONS: StorageObjectPermissions = {
  canRead: false,
  canUpdate: false,
  canDelete: false,
  canUpload: false,
};

class StoragePermissionsService {
  constructor(private readonly context: Context) {}

  /**
   * Indica si el usuario puede realizar `action` sobre `objectPath` del
   * *bucket*. Ante cualquier error devuelve `false`.
   */
  async hasStoragePermission(
    bucketName: string,
    action: StorageAction,
    objectPath: string,
  ) {
    try {
      const db = this.context.get('drizzle');

      const result = await db.runTransaction(async (tx) => {
        return tx.execute(
          sql`SELECT cms.has_storage_permission(${bucketName}, ${action}::cms.system_action, ${objectPath}) as has_permission`,
        );
      });

      return result[0]?.['has_permission'] === true;
    } catch (error) {
      const logger = await getLogger();

      logger.error({ error }, 'Error checking storage permission');

      return false;
    }
  }

  /** Indica si el usuario puede leer la raíz de un *bucket* (para listarlo). */
  async canReadBucket(bucketName: string) {
    return this.hasStoragePermission(bucketName, 'select', '/');
  }

  /**
   * Exige el permiso o lanza `StorageError` (403). El detalle del rechazo
   * solo va al *log*.
   */
  async validateStoragePermission(
    bucketName: string,
    action: StorageAction,
    objectPath: string,
  ) {
    const allowed = await this.hasStoragePermission(
      bucketName,
      action,
      objectPath,
    );

    if (!allowed) {
      throw StorageError.permissionDenied(
        `Storage ${action} denied on ${bucketName}/${objectPath}`,
      );
    }
  }

  /**
   * Exige el permiso sobre **todas** las rutas, con una sola consulta.
   *
   * Las rutas viajan como **un único** parámetro JSON que se despliega en
   * SQL (`jsonb_array_elements_text`), nunca interpoladas. El código de
   * partida pasaba el *array* tal cual (`unnest(${paths}::text[])`), pero
   * Drizzle expande un *array* en una lista de parámetros (`($1, $2)`), así
   * que la consulta fallaba siempre («malformed array literal»): los permisos
   * por fichero salían todos a `false` y el borrado nunca se autorizaba.
   */
  async validateBulkStoragePermission(
    bucketName: string,
    action: StorageAction,
    objectPaths: string[],
  ) {
    if (objectPaths.length === 0) {
      return;
    }

    let rows: Array<Record<string, unknown>>;

    try {
      const db = this.context.get('drizzle');

      rows = await db.runTransaction(async (tx) => {
        return tx.execute(
          sql`
            SELECT
              path,
              cms.has_storage_permission(${bucketName}, ${action}::cms.system_action, path) as has_permission
            FROM jsonb_array_elements_text(${JSON.stringify(objectPaths)}::jsonb) as path
          `,
        );
      });
    } catch (error) {
      const logger = await getLogger();

      logger.error({ error }, 'Error checking bulk storage permissions');

      throw StorageError.failed('Could not verify storage permissions');
    }

    const allowed = new Set(
      rows
        .filter((row) => row['has_permission'] === true)
        .map((row) => row['path'] as string),
    );

    const denied = objectPaths.filter((path) => !allowed.has(path));

    if (denied.length > 0) {
      throw StorageError.permissionDenied(
        `Storage ${action} denied on ${bucketName} for ${denied.length} path(s)`,
      );
    }
  }

  /** Devuelve los cuatro permisos de un objeto (para la interfaz). */
  async getUserStoragePermissions(
    bucketName: string,
    objectPath: string,
  ): Promise<StorageObjectPermissions> {
    const map = await this.getBulkUserStoragePermissions(bucketName, [
      objectPath,
    ]);

    return map.get(objectPath) ?? { ...NO_PERMISSIONS };
  }

  /**
   * Devuelve los permisos de varios objetos con una sola consulta, cada uno
   * calculado sobre su ruta exacta. Ante un error, ningún permiso.
   */
  async getBulkUserStoragePermissions(
    bucketName: string,
    objectPaths: string[],
  ) {
    const permissionsMap = new Map<string, StorageObjectPermissions>();

    if (objectPaths.length === 0) {
      return permissionsMap;
    }

    try {
      const db = this.context.get('drizzle');

      const result = await db.runTransaction(async (tx) => {
        return tx.execute(
          sql`
            SELECT
              path,
              cms.has_storage_permission(${bucketName}, 'select'::cms.system_action, path) as can_read,
              cms.has_storage_permission(${bucketName}, 'update'::cms.system_action, path) as can_update,
              cms.has_storage_permission(${bucketName}, 'delete'::cms.system_action, path) as can_delete,
              cms.has_storage_permission(${bucketName}, 'insert'::cms.system_action, path) as can_upload
            FROM jsonb_array_elements_text(${JSON.stringify(objectPaths)}::jsonb) as path
          `,
        );
      });

      for (const row of result) {
        permissionsMap.set(row['path'] as string, {
          canRead: row['can_read'] === true,
          canUpdate: row['can_update'] === true,
          canDelete: row['can_delete'] === true,
          canUpload: row['can_upload'] === true,
        });
      }
    } catch (error) {
      const logger = await getLogger();

      logger.error({ error }, 'Error reading bulk storage permissions');
    }

    for (const path of objectPaths) {
      if (!permissionsMap.has(path)) {
        permissionsMap.set(path, { ...NO_PERMISSIONS });
      }
    }

    return permissionsMap;
  }
}

/** Crea el servicio de permisos de almacenamiento de una petición. */
export function createStoragePermissionsService(context: Context) {
  return new StoragePermissionsService(context);
}
