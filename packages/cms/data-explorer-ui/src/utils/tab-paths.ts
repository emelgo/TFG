/**
 * Interpretación de una ruta del explorador para las pestañas.
 *
 * A partir de la ruta actual (`/admin/cms/resources/public/accounts?...`) se
 * decide si corresponde a una tabla o a un registro y qué título mostrar en
 * su pestaña. Es una función pura para poder probarla sin navegador.
 */
import { DATA_EXPLORER_BASE_PATH } from './paths';

export type TabPathInfo = {
  type: 'table' | 'record';
  schema: string;
  table: string;
  /** Título por defecto: el nombre visible de la tabla o `schema.tabla`. */
  title: string;
};

/**
 * Devuelve la información de pestaña de una ruta del explorador, o `null` si
 * la ruta no es de una tabla (por ejemplo, la portada del CMS).
 */
export function getTabPathInfo(
  fullPath: string,
  displayName?: string | null,
): TabPathInfo | null {
  const [pathname = ''] = fullPath.split('?');
  const prefix = `${DATA_EXPLORER_BASE_PATH}/`;

  if (!pathname.startsWith(prefix)) {
    return null;
  }

  const parts = pathname.slice(prefix.length).split('/').filter(Boolean);
  const [schema, table, section] = parts;

  if (!schema || !table) {
    return null;
  }

  return {
    type: section === 'record' ? 'record' : 'table',
    schema: decodeURIComponent(schema),
    table: decodeURIComponent(table),
    title:
      displayName ||
      `${decodeURIComponent(schema)}.${decodeURIComponent(table)}`,
  };
}
