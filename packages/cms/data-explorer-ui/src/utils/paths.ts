/**
 * Rutas de la interfaz del explorador de datos.
 *
 * El CMS vive dentro de la consola de administración de la web (ADR-011), en
 * `/admin/cms`. Los componentes de este paquete construyen enlaces a las
 * fichas de los registros y a las pestañas con esta base; si algún día se
 * moviera el CMS, solo habría que cambiarla aquí.
 */

/** Portada del CMS: lista de tablas legibles. */
export const CMS_HOME_PATH = '/admin/cms';

/** Base del explorador: `/admin/cms/resources/:schema/:table`. */
export const DATA_EXPLORER_BASE_PATH = '/admin/cms/resources';

/**
 * Convierte el enlace relativo que devuelve la API para una fila relacionada
 * (`/public/accounts/record/<id>`) en una ruta de la web.
 */
export function toResourceHref(link: string) {
  return `${DATA_EXPLORER_BASE_PATH}${link.startsWith('/') ? '' : '/'}${link}`;
}
