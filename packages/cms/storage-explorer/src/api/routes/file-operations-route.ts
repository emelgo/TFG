import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { getPublicErrorMessage } from '@pymekit/cms-shared/utils';
import { getLogger } from '@pymekit/shared/logger';

import { validateFilePath } from '../../utils/path-security';
import { createStorageService } from '../services/storage.service';

const FileOperationParamsSchema = z.object({
  bucket: z.string().min(1),
});

const RenameFileSchema = z.object({
  fromPath: z
    .string()
    .min(1)
    .max(1024)
    .refine(
      (path) => {
        try {
          validateFilePath(path);
          return true;
        } catch {
          return false;
        }
      },
      { message: 'Invalid source file path' },
    ),
  toPath: z
    .string()
    .min(1)
    .max(1024)
    .refine(
      (path) => {
        try {
          validateFilePath(path);
          return true;
        } catch {
          return false;
        }
      },
      { message: 'Invalid destination file path' },
    ),
});

const DeleteFileSchema = z.object({
  paths: z
    .array(
      z
        .string()
        .min(1)
        .max(1024)
        .refine(
          (path) => {
            try {
              validateFilePath(path);
              return true;
            } catch {
              return false;
            }
          },
          { message: 'Invalid file path' },
        ),
    )
    .min(1)
    .max(20),
});

const DownloadFileSchema = z.object({
  path: z
    .string()
    .min(1)
    .max(1024)
    .refine(
      (path) => {
        try {
          validateFilePath(path);
          return true;
        } catch {
          return false;
        }
      },
      { message: 'Invalid file path' },
    ),
});

const CreateFolderSchema = z.object({
  folderName: z
    .string()
    .min(1)
    .max(255)
    .refine(
      (name) => {
        try {
          validateFilePath(name);
          return true;
        } catch {
          return false;
        }
      },
      { message: 'Invalid folder name' },
    ),
  parentPath: z.string().optional(),
});

/**
 * Register file operations router
 * @param router
 */
export function registerFileOperationsRouter(router: Hono) {
  registerRenameFileRouter(router);
  registerDeleteFileRouter(router);
  registerDownloadFileRouter(router);
  registerCreateFolderRouter(router);
}

/**
 * Register the rename file router
 */
function registerRenameFileRouter(router: Hono) {
  return router.put(
    '/v1/storage/buckets/:bucket/rename',
    zValidator('param', FileOperationParamsSchema),
    zValidator('json', RenameFileSchema),
    async (c) => {
      const service = createStorageService(c);
      const logger = await getLogger();
      const { bucket } = c.req.valid('param');
      const { fromPath, toPath } = c.req.valid('json');

      try {
        const result = await service.renameFile({
          bucket,
          fromPath,
          toPath,
        });

        return c.json(result);
      } catch (error) {
        logger.error(
          {
            error,
            bucket,
            fromPath,
            toPath,
          },
          'Error renaming file',
        );

        return c.json({ error: getPublicErrorMessage(error) }, 500);
      }
    },
  );
}

/**
 * Register the delete file router
 */
function registerDeleteFileRouter(router: Hono) {
  return router.delete(
    '/v1/storage/buckets/:bucket/delete',
    zValidator('param', FileOperationParamsSchema),
    zValidator('json', DeleteFileSchema),
    async (c) => {
      const service = createStorageService(c);
      const logger = await getLogger();
      const { bucket } = c.req.valid('param');
      const { paths } = c.req.valid('json');

      try {
        const result = await service.deleteFile({
          bucket,
          paths,
        });

        return c.json(result);
      } catch (error) {
        logger.error(
          {
            error,
            bucket,
            paths,
          },
          'Error deleting file',
        );

        return c.json({ error: getPublicErrorMessage(error) }, 500);
      }
    },
  );
}

/**
 * Register the download file router
 */
function registerDownloadFileRouter(router: Hono) {
  return router.post(
    '/v1/storage/buckets/:bucket/download',
    zValidator('param', FileOperationParamsSchema),
    zValidator('json', DownloadFileSchema),
    async (c) => {
      const service = createStorageService(c);
      const logger = await getLogger();
      const { bucket } = c.req.valid('param');
      const { path } = c.req.valid('json');

      try {
        const downloadUrl = await service.getDownloadUrl({
          bucket,
          path,
        });

        return c.json({ downloadUrl });
      } catch (error) {
        logger.error(
          {
            error,
            bucket,
            path,
          },
          'Error getting download URL',
        );

        return c.json({ error: getPublicErrorMessage(error) }, 500);
      }
    },
  );
}

/**
 * Register the create folder router
 */
function registerCreateFolderRouter(router: Hono) {
  return router.post(
    '/v1/storage/buckets/:bucket/create-folder',
    zValidator('param', FileOperationParamsSchema),
    zValidator('json', CreateFolderSchema),
    async (c) => {
      const service = createStorageService(c);
      const logger = await getLogger();
      const { bucket } = c.req.valid('param');
      const { folderName, parentPath } = c.req.valid('json');

      try {
        const result = await service.createFolder({
          bucket,
          folderName,
          parentPath,
        });

        return c.json(result);
      } catch (error) {
        logger.error(
          {
            error,
            bucket,
            folderName,
            parentPath,
          },
          'Error creating folder',
        );

        return c.json({ error: getPublicErrorMessage(error) }, 500);
      }
    },
  );
}

/**
 * File operations route types
 */
export type RenameFileRoute = ReturnType<typeof registerRenameFileRouter>;
export type DeleteFileRoute = ReturnType<typeof registerDeleteFileRouter>;
export type DownloadFileRoute = ReturnType<typeof registerDownloadFileRouter>;
export type CreateFolderRoute = ReturnType<typeof registerCreateFolderRouter>;
