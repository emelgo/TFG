/**
 * Registro de las rutas de paneles y *widgets* del CMS (F2.8, RF-11).
 */
import { Hono } from 'hono';

import { registerDashboardsRoutes } from './dashboards-routes';
import { registerWidgetsRoutes } from './widgets-routes';

export type * from './dashboards-routes';
export type * from './widgets-routes';

/** Registra las rutas de paneles y de *widgets*. */
export function registerDashboardRoutes(router: Hono) {
  registerDashboardsRoutes(router);
  registerWidgetsRoutes(router);
}
