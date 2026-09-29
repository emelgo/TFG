/**
 * Comprueba si el usuario puede leer una tabla, a partir de la lista de
 * tablas legibles del CMS (`GET /v1/navigation`, ya en caché porque la usa la
 * barra lateral).
 *
 * El filtro de una clave foránea solo ofrece el autocompletado con las filas
 * de la tabla relacionada si el usuario puede leerla; si no, se queda en un
 * campo de texto. La API volvería a rechazar la búsqueda de todos modos: esto
 * solo evita mostrar un control que va a fallar.
 */
import { useQuery } from '@tanstack/react-query';

import { useCmsApi } from '@pymekit/cms-ui-core/api-context';

export function useTableAccessCheck(schemaName: string, tableName: string) {
  const { queries } = useCmsApi();

  const { data, isLoading } = useQuery({
    ...queries.navigation(),
    enabled: Boolean(schemaName && tableName),
  });

  const hasAccess = (data ?? []).some(
    (resource) =>
      resource.schemaName === schemaName && resource.tableName === tableName,
  );

  return { hasAccess, isLoading };
}
