import { useRouterState } from '@tanstack/react-router';

/**
 * Indica si el *router* está cargando una navegación (por ejemplo, la nueva
 * página de resultados tras aplicar un filtro). Mientras tanto se deshabilitan
 * los controles de los filtros para no encadenar cambios sobre datos viejos.
 */
export function useIsNavigating() {
  return useRouterState({ select: (state) => state.status === 'pending' });
}
