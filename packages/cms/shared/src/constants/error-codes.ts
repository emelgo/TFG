/**
 * Códigos de error estables de la API del CMS.
 *
 * La API acompaña sus respuestas de error con un `errorCode` además del
 * mensaje. La interfaz (`/admin/cms`) decide qué pantalla mostrar a partir de
 * este código y nunca a partir del texto, que puede cambiar. Vive en
 * `@pymekit/cms-shared` porque lo importan tanto el servidor (Hono) como el
 * cliente: es un módulo sin dependencias, seguro en el *bundle* del navegador.
 */
export const CMS_API_ERROR_CODES = {
  /** No hay sesión válida (401). */
  NOT_AUTHENTICATED: 'NOT_AUTHENTICATED',
  /** Sesión anónima o sin rol `authenticated` (403). */
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  /** Falta el *claim* `cms_access`: no es personal del CMS (403). */
  NO_CMS_ACCESS: 'NO_CMS_ACCESS',
  /** El usuario está bloqueado en Auth (403). */
  USER_BANNED: 'USER_BANNED',
  /**
   * Tiene el *claim*, pero la base de datos (`cms.verify_admin_access()`)
   * rechaza el acceso: su cuenta del CMS está desactivada o la sesión no ha
   * verificado el segundo factor (aal2) y el MFA es obligatorio (403).
   */
  MFA_OR_INACTIVE_ACCOUNT: 'CMS_MFA_OR_INACTIVE_ACCOUNT',

  // Escrituras del explorador de datos (crear, editar y borrar registros).
  // La API traduce el SQLSTATE de las funciones `cms.*_record*` a uno de
  // estos códigos y a un mensaje genérico: nunca devuelve el texto de
  // PostgreSQL, que revela nombres de tablas, columnas o restricciones.

  /** Sin permiso para la acción sobre la tabla o esquema protegido (403). */
  RECORD_PERMISSION_DENIED: 'RECORD_PERMISSION_DENIED',
  /** La clave no identifica ningún registro (404). */
  RECORD_NOT_FOUND: 'RECORD_NOT_FOUND',
  /** Ya existe un registro con esos valores únicos (409). */
  RECORD_DUPLICATE: 'RECORD_DUPLICATE',
  /**
   * Viola una clave foránea: apunta a un registro que no existe o se quiere
   * borrar un registro al que otros apuntan (409).
   */
  RECORD_REFERENCE_VIOLATION: 'RECORD_REFERENCE_VIOLATION',
  /** Datos no válidos: tipo, formato, obligatorio o restricción `check` (400). */
  RECORD_INVALID_DATA: 'RECORD_INVALID_DATA',
  /**
   * Una regla de la propia tabla (un *trigger* que lanza una excepción)
   * rechaza el cambio (400).
   */
  RECORD_RULE_VIOLATION: 'RECORD_RULE_VIOLATION',
  /** Error inesperado al escribir (500). */
  RECORD_WRITE_FAILED: 'RECORD_WRITE_FAILED',

  // Explorador de usuarios (F2.5). Sus acciones usan la API de administración
  // de Auth con la clave de servicio, así que la autorización se decide en el
  // código antes de llamarla; estos códigos explican el rechazo sin devolver
  // el texto de Auth ni de PostgreSQL.

  /** Sin el permiso del CMS para esa acción sobre usuarios (403). */
  AUTH_USER_PERMISSION_DENIED: 'AUTH_USER_PERMISSION_DENIED',
  /** El usuario no existe (404). */
  AUTH_USER_NOT_FOUND: 'AUTH_USER_NOT_FOUND',
  /** Nadie puede bloquearse, borrarse ni cambiar su propio acceso (403). */
  AUTH_USER_SELF_ACTION: 'AUTH_USER_SELF_ACTION',
  /**
   * El destino es un super-admin de la plataforma o personal del CMS: hay que
   * retirarle antes el acceso al CMS (con la jerarquía de rangos) o, si es
   * super-admin, gestionarlo desde la consola de la plataforma (403).
   */
  AUTH_USER_PROTECTED: 'AUTH_USER_PROTECTED',
  /** Ya existe un usuario con ese correo (409). */
  AUTH_USER_ALREADY_EXISTS: 'AUTH_USER_ALREADY_EXISTS',
  /** Datos no válidos (correo, contraseña débil…) (400). */
  AUTH_USER_INVALID_DATA: 'AUTH_USER_INVALID_DATA',
  /** Error inesperado al actuar sobre el usuario (500). */
  AUTH_USER_ACTION_FAILED: 'AUTH_USER_ACTION_FAILED',

  // Explorador de almacenamiento (F2.5). Cada operación se comprueba con
  // `cms.has_storage_permission` antes de usar el cliente de servicio.

  /** Sin permiso de almacenamiento para ese *bucket* y ruta (403). */
  STORAGE_PERMISSION_DENIED: 'STORAGE_PERMISSION_DENIED',
  /** Nombre de *bucket*, ruta o nombre de fichero no válido (400). */
  STORAGE_INVALID_PATH: 'STORAGE_INVALID_PATH',
  /** El fichero o la carpeta no existe (404). */
  STORAGE_NOT_FOUND: 'STORAGE_NOT_FOUND',
  /** Ya existe un fichero o carpeta con ese nombre (409). */
  STORAGE_ALREADY_EXISTS: 'STORAGE_ALREADY_EXISTS',
  /** El fichero supera el tamaño máximo de subida (413). */
  STORAGE_FILE_TOO_LARGE: 'STORAGE_FILE_TOO_LARGE',
  /** Demasiados ficheros en una operación (borrar una carpeta enorme) (400). */
  STORAGE_TOO_MANY_FILES: 'STORAGE_TOO_MANY_FILES',
  /** Error inesperado del almacenamiento (500). */
  STORAGE_OPERATION_FAILED: 'STORAGE_OPERATION_FAILED',

  // Registro de auditoría (F2.6). La lectura la filtra RLS con
  // `cms.can_read_audit_log` (permiso `log:select` y jerarquía de rangos).

  /** Sin el permiso `log:select`, o la cuenta pedida es de rango superior (403). */
  AUDIT_LOG_PERMISSION_DENIED: 'AUDIT_LOG_PERMISSION_DENIED',
  /**
   * La entrada no existe o el usuario no puede leerla: no se distingue, para
   * no confirmar la existencia de entradas ajenas (404).
   */
  AUDIT_LOG_NOT_FOUND: 'AUDIT_LOG_NOT_FOUND',
  /** Filtro, cursor o parámetro no válido (400). */
  AUDIT_LOG_INVALID_FILTER: 'AUDIT_LOG_INVALID_FILTER',
  /** Error inesperado al leer la auditoría (500). */
  AUDIT_LOG_READ_FAILED: 'AUDIT_LOG_READ_FAILED',

  // Búsqueda global (F2.6).

  /** Texto o paginación no válidos (400). */
  GLOBAL_SEARCH_INVALID_QUERY: 'GLOBAL_SEARCH_INVALID_QUERY',
  /** Error inesperado al buscar (500). */
  GLOBAL_SEARCH_FAILED: 'GLOBAL_SEARCH_FAILED',

  // Ajustes (F2.7a): preferencias personales y configuración global.

  /** Sin el permiso `system_setting` necesario, o sin cuenta del CMS (403). */
  SETTINGS_PERMISSION_DENIED: 'SETTINGS_PERMISSION_DENIED',
  /** Preferencia no válida (zona horaria o idioma desconocidos) (400). */
  SETTINGS_INVALID_DATA: 'SETTINGS_INVALID_DATA',
  /**
   * Cambiar la obligación de MFA exige una sesión con segundo factor (aal2)
   * (403).
   */
  SETTINGS_MFA_VERIFICATION_REQUIRED: 'SETTINGS_MFA_VERIFICATION_REQUIRED',
  /**
   * Desactivar la obligación de MFA solo lo puede hacer una cuenta raíz
   * (super-admin de la plataforma) con sesión aal2 (403).
   */
  SETTINGS_MFA_DISABLE_REQUIRES_ROOT: 'SETTINGS_MFA_DISABLE_REQUIRES_ROOT',
  /** Error inesperado al leer o guardar los ajustes (500). */
  SETTINGS_ACTION_FAILED: 'SETTINGS_ACTION_FAILED',

  // Ajustes > Miembros (F2.7a). Las reglas de rango las aplica la base de
  // datos (`can_action_account`, `can_modify_account_role`,
  // `set_account_active`); la API las comprueba antes para responder con el
  // motivo exacto.

  /** Sin el permiso `account`/`role` necesario (403). */
  MEMBER_PERMISSION_DENIED: 'MEMBER_PERMISSION_DENIED',
  /** La cuenta del CMS no existe (404). */
  MEMBER_NOT_FOUND: 'MEMBER_NOT_FOUND',
  /** Nadie cambia sus propios roles ni su propio estado (403). */
  MEMBER_SELF_ACTION: 'MEMBER_SELF_ACTION',
  /**
   * Cuenta raíz (super-admin de la plataforma): se gestiona desde la
   * plataforma, no desde el CMS (403).
   */
  MEMBER_PROTECTED: 'MEMBER_PROTECTED',
  /**
   * La cuenta o el rol son de rango igual o superior al de quien actúa
   * (403).
   */
  MEMBER_RANK_DENIED: 'MEMBER_RANK_DENIED',
  /** No se asignan roles a una cuenta desactivada (409). */
  MEMBER_INACTIVE: 'MEMBER_INACTIVE',
  /** Petición no válida: rol inexistente, ya asignado o más de uno (400). */
  MEMBER_INVALID_DATA: 'MEMBER_INVALID_DATA',
  /** Error inesperado al gestionar el miembro (500). */
  MEMBER_ACTION_FAILED: 'MEMBER_ACTION_FAILED',
} as const;

export type CmsApiErrorCode =
  (typeof CMS_API_ERROR_CODES)[keyof typeof CMS_API_ERROR_CODES];
