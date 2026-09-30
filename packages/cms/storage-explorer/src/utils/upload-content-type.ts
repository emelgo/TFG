/**
 * Tipo de contenido con el que se guarda un fichero subido desde el CMS.
 *
 * Supabase Storage sirve cada objeto con el `Content-Type` que se guardó al
 * subirlo. Si se aceptara el que envía el navegador, bastaría subir
 * `foto.png` declarado como `text/html` (o un SVG con *script*) para que la
 * URL pública del objeto ejecutara código al abrirse. Por eso el servidor no
 * confía ni en el tipo declarado ni solo en la extensión:
 *
 *  - un fichero se guarda como imagen únicamente si su extensión está en la
 *    lista de imágenes previsualizables (PNG, JPEG, GIF, WebP) **y** sus
 *    primeros bytes (la «firma» del formato) coinciden con ese formato;
 *  - todo lo demás (HTML, SVG, PDF, lo que sea) se guarda como
 *    `application/octet-stream`, que el navegador descarga en vez de
 *    interpretar.
 *
 * [TFG] RNF-02 Seguridad: ningún contenido subido desde el CMS se sirve como
 * documento activo (XSS almacenado).
 */
import {
  PREVIEWABLE_IMAGE_TYPES,
  getFileExtension,
} from '@pymekit/cms-shared/storage-paths';

/** Tipo genérico que los navegadores descargan sin interpretar. */
export const SAFE_BINARY_CONTENT_TYPE = 'application/octet-stream';

/** Comprueba si `bytes` empieza por la secuencia `signature`. */
function startsWith(bytes: Uint8Array, signature: number[], offset = 0) {
  return signature.every((value, index) => bytes[offset + index] === value);
}

/**
 * Detecta el formato de imagen por su firma binaria.
 *
 * @returns El tipo MIME de la imagen o `null` si no es PNG, JPEG, GIF ni WebP.
 */
export function sniffImageContentType(bytes: Uint8Array): string | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png';
  }

  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return 'image/jpeg';
  }

  // «GIF87a» o «GIF89a».
  if (
    startsWith(bytes, [0x47, 0x49, 0x46, 0x38]) &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return 'image/gif';
  }

  // «RIFF» + tamaño (4 bytes) + «WEBP».
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return 'image/webp';
  }

  return null;
}

/**
 * Decide el `Content-Type` con el que se guarda un fichero subido.
 *
 * @param fileName Nombre del fichero (ya validado).
 * @param bytes Contenido del fichero (basta con los primeros 12 bytes).
 */
export function getUploadContentType(fileName: string, bytes: Uint8Array) {
  const expected = PREVIEWABLE_IMAGE_TYPES[getFileExtension(fileName)];

  if (expected && sniffImageContentType(bytes) === expected) {
    return expected;
  }

  return SAFE_BINARY_CONTENT_TYPE;
}
