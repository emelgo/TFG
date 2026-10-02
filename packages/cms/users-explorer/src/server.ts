import { Hono } from 'hono';

import { registerUsersExplorerRoutes } from './api/routes';

/**
 * @name createUsersExplorerServer
 * @description Create a Hono server for users explorer
 * @returns A Hono server with users explorer routes registered
 */
export function createUsersExplorerServer() {
  const app = new Hono();

  registerUsersExplorerRoutes(app);

  return app;
}
