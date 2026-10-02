import type { Hono } from 'hono';

import {
  registerBucketContentsRouter,
  registerFileOperationsRouter,
  registerStorageBucketsRouter,
} from './api/routes';

/**
 * Register storage explorer routes with the Hono router
 * @param app - The Hono app instance
 */
export function registerStorageExplorerRoutes(app: Hono) {
  registerStorageBucketsRouter(app);
  registerBucketContentsRouter(app);
  registerFileOperationsRouter(app);
}
