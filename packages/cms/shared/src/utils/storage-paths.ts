/**
 * Reglas de nombres y rutas del explorador de almacenamiento del CMS.
 *
 * El explorador trabaja con el cliente de servicio de Supabase Storage (que
 * ignora las políticas RLS), así que la API **tiene** que validar cada nombre
 * de *bucket* y cada ruta antes de usarlo: una ruta con `..`, absoluta o con
 * caracteres codificados (`%2F`) podría comprobarse contra un permiso y
 * ejecutarse sobre otro objeto. Estas reglas son funciones puras sin
 * dependencias, por eso viven en `@pymekit/cms-shared`: las usa el servidor
 * (autoridad) y la interfaz (para avisar antes de enviar), sin que el
 * navegador cargue código de servidor.
 *
 * La política es una lista **cerrada**: se rechaza todo lo que no encaja en
 * lo esperado en lugar de intentar «limpiarlo», porque una ruta saneada ya
 * no es la que el usuario pidió y podría caer en otra carpeta.
 *
 * [TFG] RNF-02 Seguridad: validación de rutas antes de usar el cliente de
 * servicio del almacenamiento (RF-09).
 */

/** Límites del explorador de almacenamiento. */
export const STORAGE_LIMITS = {
  /** Tamaño máximo de un fichero subido desde el CMS (5 MB). */
  maxUploadBytes: 5 * 1024 * 1024,
  /** Longitud máxima de una ruta completa dentro del *bucket*. */
  maxPathLength: 1024,
  /** Longitud máxima de cada segmento (nombre de fichero o carpeta). */
  maxNameLength: 255,
  /** Máximo de elementos por borrado múltiple. */
  maxBatchSize: 20,
} as const;

/**
 * Motivo por el que se rechaza un nombre o una ruta. La interfaz lo traduce
 * a un mensaje; el servidor responde con `STORAGE_INVALID_PATH`.
 */
export type StoragePathError =
  | 'empty'
  | 'too_long'
  | 'traversal'
  | 'absolute'
  | 'invalid_characters'
  | 'reserved_name'
  | 'trailing_dot_or_space';

// Nombres reservados de Windows: un fichero descargado con ese nombre no se
// puede guardar en ese sistema. Se conserva la regla del código de partida.
const RESERVED_NAMES = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  ...Array.from({ length: 9 }, (_, index) => `COM${index + 1}`),
  ...Array.from({ length: 9 }, (_, index) => `LPT${index + 1}`),
]);

// Caracteres de control, separadores y los que cambian el significado de una
// URL. `%` se rechaza para que nadie pueda colar una barra o un `..`
// codificados (`%2F`, `%2e%2e`) que otra capa decodifique después; `?` y `#`
// porque cortarían la URL de la API de Storage.
// eslint-disable-next-line no-control-regex
const FORBIDDEN_NAME_CHARACTERS = /[\u0000-\u001f\u007f/\\%?#]/;

/**
 * Comprueba un nombre de fichero o carpeta (un único segmento de la ruta).
 *
 * @returns `null` si es válido o el motivo del rechazo.
 */
export function getFileNameError(name: string): StoragePathError | null {
  if (typeof name !== 'string' || name.length === 0) {
    return 'empty';
  }

  if (name.length > STORAGE_LIMITS.maxNameLength) {
    return 'too_long';
  }

  if (name === '.' || name === '..' || name.includes('..')) {
    return 'traversal';
  }

  if (FORBIDDEN_NAME_CHARACTERS.test(name)) {
    return 'invalid_characters';
  }

  const baseName = name.split('.')[0]?.toUpperCase() ?? '';

  if (RESERVED_NAMES.has(baseName)) {
    return 'reserved_name';
  }

  if (name.endsWith('.') || name.endsWith(' ')) {
    return 'trailing_dot_or_space';
  }

  return null;
}

/**
 * Comprueba la ruta de un objeto dentro de un *bucket* (`carpeta/fichero.png`).
 *
 * Una ruta válida es relativa, no tiene segmentos vacíos (`a//b`, `/a` o
 * `a/`) y cada segmento es un nombre válido.
 *
 * @returns `null` si es válida o el motivo del rechazo.
 */
export function getFilePathError(path: string): StoragePathError | null {
  if (typeof path !== 'string' || path.length === 0) {
    return 'empty';
  }

  if (path.length > STORAGE_LIMITS.maxPathLength) {
    return 'too_long';
  }

  if (path.startsWith('/') || /^[a-zA-Z]:/.test(path)) {
    return 'absolute';
  }

  for (const segment of path.split('/')) {
    // Un segmento vacío (`a//b`, `a/`) haría que la ruta comprobada y la
    // ruta real del objeto no coincidieran.
    const error = segment === '' ? 'empty' : getFileNameError(segment);

    if (error) {
      return error;
    }
  }

  return null;
}

/** Indica si `path` es una ruta de objeto válida. */
export function isValidFilePath(path: string) {
  return getFilePathError(path) === null;
}

/**
 * Indica si `path` es una carpeta válida para listar: la raíz del *bucket*
 * (cadena vacía) o una ruta válida.
 */
export function isValidFolderPath(path: string) {
  return path === '' || isValidFilePath(path);
}

/**
 * Indica si `name` es un nombre de *bucket* aceptable. Los nombres de Supabase
 * solo llevan letras, números, puntos, guiones y guiones bajos; cualquier otra
 * cosa (una barra, `..`) cambiaría la URL de la API de Storage.
 */
export function isValidBucketName(name: string) {
  return (
    typeof name === 'string' &&
    /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,99}$/.test(name) &&
    !name.includes('..')
  );
}

/** Une una carpeta (o la raíz, `''`) y un nombre en una ruta de objeto. */
export function joinStoragePath(folder: string, name: string) {
  return folder ? `${folder}/${name}` : name;
}

/** Devuelve la carpeta que contiene `path` (`''` si está en la raíz). */
export function getParentPath(path: string) {
  const index = path.lastIndexOf('/');

  return index === -1 ? '' : path.slice(0, index);
}

/** Categoría de un fichero según su extensión (para el icono y la vista previa). */
export type StorageFileType =
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'archive'
  | 'code'
  | 'file';

/**
 * Imágenes que se pueden previsualizar en el CMS, con su tipo MIME. SVG queda
 * fuera a propósito: puede llevar *script* y, abierto como documento, lo
 * ejecutaría. Solo se previsualizan con `<img>`, que nunca ejecuta código.
 */
export const PREVIEWABLE_IMAGE_TYPES: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

const FILE_TYPE_EXTENSIONS: Array<[StorageFileType, string[]]> = [
  ['video', ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v']],
  ['audio', ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a']],
  ['document', ['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt', 'csv']],
  ['archive', ['zip', 'rar', '7z', 'tar', 'gz', 'bz2']],
  ['code', ['js', 'ts', 'json', 'html', 'css', 'svg', 'xml']],
];

/** Devuelve la extensión en minúsculas de un nombre, o `''` si no tiene. */
export function getFileExtension(name: string) {
  const index = name.lastIndexOf('.');

  return index <= 0 ? '' : name.slice(index + 1).toLowerCase();
}

/** Devuelve la categoría de un fichero a partir de su extensión. */
export function getStorageFileType(name: string): StorageFileType {
  const extension = getFileExtension(name);

  if (extension in PREVIEWABLE_IMAGE_TYPES) {
    return 'image';
  }

  for (const [type, extensions] of FILE_TYPE_EXTENSIONS) {
    if (extensions.includes(extension)) {
      return type;
    }
  }

  return 'file';
}
