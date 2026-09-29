import { Hono } from 'hono';

import { registerDashboardsRoutes } from './dashboards-routes';
import { registerWidgetsRoutes } from './widgets-routes';

/**
 * @name registerDashboardRoutes
 * @param router
 */
export function registerDashboardRoutes(router: Hono) {
  registerDashboardsRoutes(router);
  registerWidgetsRoutes(router);
}
