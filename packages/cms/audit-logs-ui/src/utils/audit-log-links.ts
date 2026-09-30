/**
 * Enlaces desde una entrada de auditoría al elemento afectado.
 *
 * - `auth.users` → ficha del usuario en el explorador de usuarios.
 * - Tablas de la aplicación → ficha del registro en el explorador de datos,
 *   solo si la entrada guarda un identificador simple (las claves compuestas
 *   de las tablas del propio CMS se guardan como `a|b` y no tienen ficha).
 * - Esquema `cms` → sin enlace: sus tablas no se exploran como datos.
 *
 * El enlace es solo una ayuda: la página de destino vuelve a comprobar el
 * permiso y responde «no encontrado» si el usuario no puede verla.
 */
import { CMS_SECTION_PATHS } from '@pymekit/cms-ui-core/sections';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ruta de la ficha de una entrada del registro. */
export function getAuditLogHref(id: string) {
  return `${CMS_SECTION_PATHS.auditLogs}/${id}`;
}

/** Ruta del elemento afectado por una entrada, o `null` si no tiene. */
export function getAuditLogRecordHref(log: {
  schemaName: string;
  tableName: string;
  recordId: string | null;
}) {
  const { schemaName, tableName, recordId } = log;

  if (!recordId || schemaName === 'cms') {
    return null;
  }

  if (schemaName === 'auth') {
    return tableName === 'users' && UUID_PATTERN.test(recordId)
      ? `${CMS_SECTION_PATHS.users}/${recordId}`
      : null;
  }

  if (recordId.includes('|')) {
    return null;
  }

  return `${CMS_SECTION_PATHS.resources}/${encodeURIComponent(schemaName)}/${encodeURIComponent(tableName)}/record/${encodeURIComponent(recordId)}`;
}
