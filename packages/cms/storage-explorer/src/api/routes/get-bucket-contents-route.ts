import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { getPublicErrorMessage } from '@pymekit/cms-shared/utils';
import { getLogger } from '@pymekit/shared/logger';

import { createStorageService } from '../services/storage.service';

const BucketContentsParamsSchema = z.object({
  bucket: z.string().min(1),
});

const BucketContentsQuerySchema = z.object({
  path: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().min(1).default(1).optional(),
  limit: z.coerce.number().min(1).max(25).default(25).optional(),
});

/**
 * Register the bucket contents router
 * @param router
 */
export function registerBucketContentsRouter(router: Hono) {
  return router.get(
    '/v1/storage/buckets/:bucket/contents',
    zValidator('param', BucketContentsParamsSchema),
    zValidator('query', BucketContentsQuerySchema),
    async (c) => {
      const service = createStorageService(c);
      const logger = await getLogger();

      const { bucket } = c.req.valid('param');
      const { path, search, page = 1, limit = 25 } = c.req.valid('query');

      try {
        const result = await service.getBucketContents({
          bucket,
          path,
          search,
          page,
          limit,
        });

        return c.json(result);
      } catch (error) {
        logger.error(
          {
            error,
            bucket,
            path,
          },
          'Error getting bucket contents',
        );

        return c.json(
          { error: getPublicErrorMessage(error), success: false },
          { status: 500 },
        );
      }
    },
  );
}

/**
 * Get bucket contents route type
 */
export type GetBucketContentsRoute = ReturnType<
  typeof registerBucketContentsRouter
>;
