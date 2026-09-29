import { zValidator } from '@hono/zod-validator';
import type { Hono } from 'hono';
import { z } from 'zod';

import { createAuthorizationService } from '@pymekit/cms-auth/services';
import { isProtectedSchema } from '@pymekit/cms-data-explorer-core';
import {
  getLookupRelations,
  getOneToManyRelations,
} from '@pymekit/cms-data-explorer-core/utils';
import { getPublicErrorMessage } from '@pymekit/cms-shared/utils';
import { getLogger } from '@pymekit/shared/logger';

import { createDataExplorerService } from '../services/data-explorer.service';
import {
  CreateSavedViewSchema,
  UpdateSavedViewSchema,
  createSavedViewsService,
} from '../services/saved-views.service';
import {
  registerM2MLinkRoute,
  registerM2MRoutes,
  registerM2MUnlinkRoute,
} from './m2m-routes';

// M2M route types for type-safe client usage
export type M2MLinkRoute = ReturnType<typeof registerM2MLinkRoute>;
export type M2MUnlinkRoute = ReturnType<typeof registerM2MUnlinkRoute>;

declare module 'hono' {
  interface ContextVariableMap {
    accessToken: string | undefined;
  }
}

/**
 * @name registerDataExplorerRoutes
 * @param router
 */
export function registerDataExplorerRoutes(router: Hono) {
  registerGetTableDataRoute(router);
  registerGetRecordRoute(router);
  registerGetTableMetadataRoute(router);
  registerSavedViewsRoutes(router);
  registerUpdateRecordByConditionsRoute(router);
  registerDeleteRecordByConditionsRoute(router);

  registerUpdateRecordRoute(router);
  registerInsertRecordRoute(router);
  registerDeleteRecordRoute(router);
  registerBatchDeleteRecordsRoute(router);
  registerGetDataRecordPermissionsRoute(router);
  registerGetFieldValuesRoute(router);

  // M2M relationship management routes
  registerM2MRoutes(router);
}

/**
 * Get table route
 */
export type GetTableRoute = ReturnType<typeof registerGetTableDataRoute>;

/**
 * @name DEFAULT_PAGE_SIZE
 * @description Default page size
 */
const DEFAULT_PAGE_SIZE = 25;

/**
 * @name MAX_PAGE_SIZE
 * @description Maximum allowed page size to prevent performance issues
 */
const MAX_PAGE_SIZE = 500;

/**
 * @name ParamsSchema
 * @description Schema for the table parameters
 */
const ParamsSchema = z.object({
  schema: z.string(),
  table: z.string(),
});

/**
 * @name registerGetTableDataRoute
 * @description Register a route for the table
 * @param router
 */
function registerGetTableDataRoute(router: Hono) {
  return router.get(
    '/v1/tables/:schema/:table',
    zValidator('param', ParamsSchema),
    zValidator(
      'query',
      z.object({
        page: z.coerce.number().optional().default(1),
        page_size: z.coerce
          .number()
          .min(1)
          .max(MAX_PAGE_SIZE)
          .optional()
          .default(DEFAULT_PAGE_SIZE),
        search: z.string().optional(),
        properties: z.string().optional(),
        sort_column: z.string().optional(),
        sort_direction: z.enum(['asc', 'desc']).optional(),
      }),
    ),
    async (c) => {
      const logger = await getLogger();
      const service = createDataExplorerService(c);

      const { schema: schemaName, table: tableName } = c.req.valid('param');

      const {
        page,
        page_size,
        search,
        properties,
        sort_column,
        sort_direction,
      } = c.req.valid('query');

      const pageSize = page_size;

      try {
        // Security: never expose Supabase/CMS-managed schemas here.
        if (isProtectedSchema(schemaName)) {
          return c.json({ success: false, error: 'Access denied' }, 403);
        }

        // Security: Check SELECT permission before querying
        // Use hasDataPermission for single action check (more efficient than getTableCRUDPermissions)
        const authorizationService = createAuthorizationService(c);
        const canSelect = await authorizationService.hasDataPermission(
          'select',
          schemaName,
          tableName,
        );

        if (!canSelect) {
          return c.json({ success: false, error: 'Access denied' }, 403);
        }

        const response = await service.queryTableData({
          schemaName,
          tableName,
          page,
          pageSize,
          properties: properties ? JSON.parse(properties) : undefined,
          search,
          sortColumn: sort_column,
          sortDirection: sort_direction,
          // Skip permission check in service since we already verified above
          skipPermissionCheck: true,
        });

        if (!response.data) {
          return c.json(
            {
              success: false,
              error: 'No data found',
            },
            404,
          );
        }

        const pageCount = Math.ceil(response.totalCount / pageSize);
        const pageIndex = page - 1;

        return c.json({
          ...response,
          pagination: {
            pageCount,
            pageIndex,
            pageSize,
          },
        });
      } catch (error) {
        logger.error(
          {
            schemaName,
            tableName,
            error,
          },
          'Error getting table data',
        );

        return c.json(
          {
            success: false,
            error: getPublicErrorMessage(error),
          },
          500,
        );
      }
    },
  );
}

/**
 * Tipo de la ruta de la ficha de un registro, para el cliente RPC.
 */
export type GetRecordRoute = ReturnType<typeof registerGetRecordRoute>;

/**
 * Códigos SQLSTATE que indican que la clave pedida no identifica ninguna fila:
 * `cms.get_record_by_keys` no la encuentra (`P0002`, `no_data_found`), el
 * valor no tiene un formato válido para su tipo (clase `22`, por ejemplo un
 * UUID mal escrito) o la columna no existe (`42703`). Para quien pide la
 * ficha es lo mismo que un registro inexistente: se responde 404 y no 500.
 */
function isRecordKeyError(error: unknown) {
  let current: unknown = error;

  // Drizzle envuelve el error de `postgres` en `cause`: se recorre la cadena.
  for (let depth = 0; depth < 5 && current; depth++) {
    const code = (current as { code?: unknown }).code;

    if (typeof code === 'string') {
      return code === 'P0002' || code === '42703' || code.startsWith('22');
    }

    current = (current as { cause?: unknown }).cause;
  }

  return false;
}

/**
 * Registra `GET /v1/tables/:schema/:table/record?<columna>=<valor>...`: la
 * ficha de un registro identificado por su clave (una o varias columnas), con
 * el metadato de la tabla, los permisos del usuario, las filas a las que
 * apuntan sus claves foráneas (solo las de tablas que puede leer) y el
 * metadato de las tablas intermedias (M2M) legibles.
 *
 * Respuestas: 403 sin permiso `select` (o esquema protegido), 404 si la clave
 * no identifica ninguna fila. La interfaz muestra ambos como «no encontrado».
 */
function registerGetRecordRoute(router: Hono) {
  return router.get(
    '/v1/tables/:schema/:table/record',
    zValidator('param', ParamsSchema),
    zValidator('query', z.record(z.string(), z.any())),
    async (c) => {
      const logger = await getLogger();
      const service = createDataExplorerService(c);
      const { schema: schemaName, table: tableName } = c.req.valid('param');

      // Cada parámetro de la URL es una columna de la clave (`?id=…`).
      const keyValues = Object.fromEntries(Object.entries(c.req.query()));

      try {
        // Seguridad: los esquemas gestionados (`auth`, `cms`…) nunca se exponen.
        if (isProtectedSchema(schemaName)) {
          return c.json({ success: false, error: 'Access denied' }, 403);
        }

        // Se comprueba el permiso antes de leer nada, igual que el listado:
        // así una tabla sin permiso responde 403 y no un error genérico.
        // (`get_record_by_keys` lo vuelve a comprobar en la base de datos.)
        const permissions = await service.getDataPermissions({
          schemaName,
          tableName,
        });

        if (!permissions.canSelect) {
          return c.json({ success: false, error: 'Access denied' }, 403);
        }

        const [recordData, tableMetadata] = await Promise.all([
          service.getRecordByKeys({
            schemaName,
            tableName,
            keyValues,
          }),
          service.getTableMetadata({
            schemaName,
            tableName,
          }),
        ]);

        if (!recordData || Object.keys(recordData).length === 0) {
          return c.json({ success: false, error: 'Record not found' }, 404);
        }

        // Filas a las que apuntan las claves foráneas del registro, para que
        // la ficha muestre su etiqueta y enlace a ellas.
        const foreignKeyColumns = getLookupRelations(
          tableMetadata.table.relationsConfig,
        );

        const foreignKeyRecords = (
          await Promise.all(
            foreignKeyColumns.map(async (column) => {
              try {
                const value = recordData[column.source_column];

                // Los esquemas protegidos (`auth.users`…) nunca se leen: se
                // evita la consulta, que la base de datos rechazaría igualmente.
                if (
                  value === null ||
                  value === undefined ||
                  isProtectedSchema(column.target_schema)
                ) {
                  return null;
                }

                // `get_record_by_keys` exige `select` sobre la tabla destino:
                // si el usuario no puede leerla, lanza y la fila no se incluye.
                const [data, tableMetadata] = await Promise.all([
                  service.getRecordByKeys({
                    schemaName: column.target_schema,
                    tableName: column.target_table,
                    keyValues: {
                      [column.target_column]: value,
                    },
                  }),
                  service.getTableMetadata({
                    schemaName: column.target_schema,
                    tableName: column.target_table,
                  }),
                ]);

                if (!data || Object.keys(data).length === 0) {
                  return null;
                }

                // `column` indica de qué clave foránea sale la fila: una tabla
                // puede apuntar varias veces a la misma tabla destino.
                return {
                  column: column.source_column,
                  data,
                  metadata: tableMetadata,
                };
              } catch (error) {
                logger.debug(
                  { error, relation: column.source_column },
                  'Related record not readable',
                );

                return null;
              }
            }),
          )
        ).filter((record) => record !== null);

        // Metadato de las tablas hijas (uno a muchos): la interfaz lo usa para
        // detectar tablas intermedias y mostrar relaciones muchos a muchos.
        const o2mRelations = getOneToManyRelations(
          tableMetadata.table.relationsConfig,
        );

        // Varias relaciones pueden apuntar a la misma tabla: se piden una vez.
        const uniqueJunctionTables = new Map<
          string,
          { schema: string; table: string }
        >();
        for (const rel of o2mRelations) {
          const key = `${rel.target_schema}.${rel.target_table}`;
          if (!uniqueJunctionTables.has(key)) {
            uniqueJunctionTables.set(key, {
              schema: rel.target_schema,
              table: rel.target_table,
            });
          }
        }

        // Seguridad: solo se devuelve el metadato de las tablas que el
        // usuario puede leer (una comprobación de permisos en bloque).
        const authorizationService = createAuthorizationService(c);
        const junctionPermissionChecks = Array.from(
          uniqueJunctionTables.entries(),
        ).map(([key, { schema, table }]) => ({
          key,
          action: 'select' as const,
          schema,
          table,
        }));

        const junctionPermissions =
          junctionPermissionChecks.length > 0
            ? await authorizationService.checkBulkDataPermissions(
                junctionPermissionChecks,
              )
            : {};

        const junctionMetadataEntries = await Promise.all(
          Array.from(uniqueJunctionTables.entries()).map(
            async ([key, { schema, table }]) => {
              if (!junctionPermissions[key]) {
                return null;
              }

              try {
                const meta = await service.getTableMetadata({
                  schemaName: schema,
                  tableName: table,
                });

                return [
                  key,
                  {
                    ui_config: meta.table.uiConfig,
                    relations_config: meta.table.relationsConfig,
                  },
                ] as const;
              } catch (error) {
                // No es grave: la tabla simplemente no se tratará como M2M.
                logger.warn(
                  { error, schema, table },
                  'Failed to fetch junction metadata',
                );

                return null;
              }
            },
          ),
        );

        const junctionMetadataMap = Object.fromEntries(
          junctionMetadataEntries.filter(
            (entry): entry is NonNullable<typeof entry> => entry != null,
          ),
        );

        return c.json({
          data: recordData,
          metadata: tableMetadata,
          foreignKeyRecords,
          permissions,
          junctionMetadataMap,
        });
      } catch (error) {
        if (isRecordKeyError(error)) {
          return c.json({ success: false, error: 'Record not found' }, 404);
        }

        logger.error(
          {
            schemaName,
            tableName,
            error,
          },
          'Error getting record',
        );

        return c.json(
          {
            success: false,
            error: getPublicErrorMessage(error),
          },
          500,
        );
      }
    },
  );
}

/**
 * @name registerGetTableMetadataRoute
 * @description Register a route for the table metadata
 * @param router
 */
function registerGetTableMetadataRoute(router: Hono) {
  return router.get(
    '/v1/tables/:schema/:table/metadata',
    zValidator('param', ParamsSchema),
    async (c) => {
      const service = createDataExplorerService(c);
      const { schema: schemaName, table: tableName } = c.req.valid('param');

      try {
        // Security: never expose Supabase/CMS-managed schemas here.
        if (isProtectedSchema(schemaName)) {
          return c.json({ success: false, error: 'Access denied' }, 403);
        }

        // Security: Require SELECT permission to view table metadata
        const authorizationService = createAuthorizationService(c);
        const permissions = await authorizationService.getTableCRUDPermissions(
          schemaName,
          tableName,
        );

        if (!permissions.canSelect) {
          return c.json({ success: false, error: 'Access denied' }, 403);
        }

        const tableMetadata = await service.getTableMetadata({
          schemaName,
          tableName,
        });

        return c.json(tableMetadata);
      } catch (error) {
        const logger = await getLogger();

        logger.error(
          {
            schemaName,
            tableName,
            error,
          },
          'Error getting table metadata',
        );

        return c.json(
          {
            success: false,
            error: getPublicErrorMessage(error),
          },
          500,
        );
      }
    },
  );
}

/**
 * Get table metadata route
 */
export type GetTableMetadataRoute = ReturnType<
  typeof registerGetTableMetadataRoute
>;

/**
 * Saved views routes
 */
export type GetSavedViewsRoute = ReturnType<typeof registerGetSavedViewsRoute>;

export type CreateSavedViewRoute = ReturnType<
  typeof registerCreateSavedViewRoute
>;

export type UpdateSavedViewRoute = ReturnType<
  typeof registerUpdateSavedViewRoute
>;

export type DeleteSavedViewRoute = ReturnType<
  typeof registerDeleteSavedViewRoute
>;

/**
 * @name registerSavedViewsRoutes
 * @description Register all saved views routes
 * @param router
 */
function registerSavedViewsRoutes(router: Hono) {
  registerGetSavedViewsRoute(router);
  registerCreateSavedViewRoute(router);
  registerUpdateSavedViewRoute(router);
  registerDeleteSavedViewRoute(router);
}

/**
 * @name registerGetSavedViewsRoute
 * @description Register a route for getting saved views
 * @param router
 */
function registerGetSavedViewsRoute(router: Hono) {
  return router.get(
    '/v1/tables/:schema/:table/views',
    zValidator('param', ParamsSchema),
    async (c) => {
      const logger = await getLogger();
      const { schema, table } = c.req.valid('param');
      const service = createSavedViewsService(c);

      try {
        const views = await service.getSavedViews({ schema, table });

        return c.json(views);
      } catch (error) {
        logger.error(
          {
            schema,
            table,
            error,
          },
          'Error getting saved views',
        );

        return c.json(
          {
            success: false,
            error: 'Failed to get saved views',
          },
          500,
        );
      }
    },
  );
}

/**
 * @name registerCreateSavedViewRoute
 * @description Register a route for creating a saved view
 * @param router
 */
function registerCreateSavedViewRoute(router: Hono) {
  return router.post(
    '/v1/tables/:schema/:table/views',
    zValidator('param', ParamsSchema),
    zValidator('json', CreateSavedViewSchema),
    async (c) => {
      const logger = await getLogger();

      const { schema, table } = c.req.valid('param');
      const data = c.req.valid('json');
      const service = createSavedViewsService(c);

      logger.info(
        {
          schema,
          table,
        },
        'Creating saved view...',
      );

      try {
        // Create the saved view
        const view = await service.createSavedView({ schema, table, data });

        logger.info(
          {
            schema,
            table,
          },
          'Saved view created',
        );

        return c.json({
          success: true,
          data: view,
        });
      } catch (error) {
        logger.error(
          {
            schema,
            table,
            error,
          },
          'Error creating saved view',
        );

        return c.json(
          {
            success: false,
            error: getPublicErrorMessage(error),
          },
          500,
        );
      }
    },
  );
}

/**
 * @name registerUpdateSavedViewRoute
 * @description Register a route for updating a saved view
 * @param router
 */
function registerUpdateSavedViewRoute(router: Hono) {
  return router.put(
    '/v1/tables/:schema/:table/views/:id',
    zValidator('param', ParamsSchema.extend({ id: z.string().uuid() })),
    zValidator('json', UpdateSavedViewSchema),
    async (c) => {
      const logger = await getLogger();

      const { id } = c.req.valid('param');
      const data = c.req.valid('json');

      const service = createSavedViewsService(c);

      logger.info(
        {
          id,
          data,
        },
        'Updating saved view...',
      );

      try {
        const view = await service.updateSavedView({ id, data });

        logger.info(
          {
            id,
            data,
          },
          'Saved view updated',
        );

        return c.json({
          success: true,
          data: view,
        });
      } catch (error) {
        logger.error(
          {
            id,
            data,
            error,
          },
          'Error updating saved view',
        );

        return c.json(
          {
            success: false,
            error: getPublicErrorMessage(error),
          },
          500,
        );
      }
    },
  );
}

/**
 * @name registerDeleteSavedViewRoute
 * @description Register a route for deleting a saved view
 * @param router
 */
function registerDeleteSavedViewRoute(router: Hono) {
  return router.delete(
    '/v1/tables/:schema/:table/views/:id',
    zValidator('param', ParamsSchema.extend({ id: z.string().uuid() })),
    async (c) => {
      const logger = await getLogger();
      const { id } = c.req.valid('param');

      logger.info(
        {
          id,
        },
        'Deleting saved view...',
      );

      try {
        const service = createSavedViewsService(c);

        // Delete the saved view
        const result = await service.deleteSavedView({ id });

        logger.info(
          {
            id,
          },
          'Saved view deleted',
        );

        return c.json({
          success: true,
          data: result,
        });
      } catch (error) {
        logger.error(
          {
            id,
            error,
          },
          'Error deleting saved view',
        );

        return c.json(
          {
            success: false,
            error: getPublicErrorMessage(error),
          },
          500,
        );
      }
    },
  );
}

/**
 * @name registerUpdateRecordRoute
 * @description Register a route for editing a record
 * @param router
 */
function registerUpdateRecordRoute(router: Hono) {
  return router.put(
    '/v1/tables/:schema/:table/record/:id',
    zValidator('param', ParamsSchema.extend({ id: z.string().min(1) })),
    zValidator('json', z.record(z.string(), z.any())),
    async (c) => {
      const logger = await getLogger();

      const service = createDataExplorerService(c);
      const { id, schema, table } = c.req.valid('param');
      const data = c.req.valid('json');

      logger.info(
        {
          id,
          schema,
          table,
        },
        'Updating record...',
      );

      try {
        const record = await service.updateRecord({
          schemaName: schema,
          tableName: table,
          id,
          data,
        });

        logger.info(
          {
            id,
            schema,
            table,
          },
          'Record updated',
        );

        return c.json({
          success: true,
          data: record,
        });
      } catch (error) {
        logger.error(
          {
            id,
            schema,
            table,
            error,
          },
          'Error updating record',
        );

        return c.json(
          {
            success: false,
            error: getPublicErrorMessage(error),
          },
          500,
        );
      }
    },
  );
}

export type UpdateRecordRoute = ReturnType<typeof registerUpdateRecordRoute>;

/**
 * @name registerInsertRecordRoute
 * @description Register a route for inserting a record
 * @param router
 */
function registerInsertRecordRoute(router: Hono) {
  return router.post(
    '/v1/tables/:schema/:table/record',
    zValidator('param', ParamsSchema),
    zValidator('json', z.record(z.string(), z.any())),
    async (c) => {
      const logger = await getLogger();
      const { schema, table } = c.req.valid('param');
      const data = c.req.valid('json');

      logger.info(
        {
          schema,
          table,
        },
        'Inserting record...',
      );

      try {
        const service = createDataExplorerService(c);

        const record = await service.insertRecord({
          schemaName: schema,
          tableName: table,
          data,
        });

        logger.info(
          {
            schema,
            table,
          },
          'Record inserted',
        );

        return c.json({
          success: true,
          data: record,
        });
      } catch (error) {
        logger.error(
          {
            schema,
            table,
            error,
          },
          'Error inserting record',
        );

        return c.json(
          {
            success: false,
            error: getPublicErrorMessage(error),
          },
          500,
        );
      }
    },
  );
}

export type InsertRecordRoute = ReturnType<typeof registerInsertRecordRoute>;

/**
 * @name registerDeleteRecordRoute
 * @description Register a route for deleting a record
 * @param router
 */
function registerDeleteRecordRoute(router: Hono) {
  return router.delete(
    '/v1/tables/:schema/:table/record/:id',
    zValidator('param', ParamsSchema.extend({ id: z.string().min(1) })),
    async (c) => {
      const service = createDataExplorerService(c);
      const { id, schema, table } = c.req.valid('param');
      const logger = await getLogger();

      logger.info(
        {
          id,
          schema,
          table,
        },
        'Deleting record...',
      );

      try {
        const result = await service.deleteRecordById({
          schemaName: schema,
          tableName: table,
          id,
        });

        logger.info(
          {
            id,
            schema,
            table,
          },
          'Record deleted',
        );

        return c.json({
          success: true,
          data: result,
        });
      } catch (error) {
        logger.error(
          {
            id,
            schema,
            table,
            error,
          },
          'Error deleting record',
        );

        return c.json(
          {
            success: false,
            error: getPublicErrorMessage(error),
          },
          500,
        );
      }
    },
  );
}

export type DeleteRecordRoute = ReturnType<typeof registerDeleteRecordRoute>;

/**
 * @name registerUpdateRecordByConditionsRoute
 * @description Register a route for updating a record by conditions
 * @param router
 */
function registerUpdateRecordByConditionsRoute(router: Hono) {
  return router.put(
    '/v1/tables/:schema/:table/record/conditions',
    zValidator('param', ParamsSchema),
    zValidator(
      'json',
      z.object({
        conditions: z.record(z.string(), z.any()),
        data: z.record(z.string(), z.any()),
      }),
    ),
    async (c) => {
      const logger = await getLogger();

      const { schema, table } = c.req.valid('param');
      const { conditions, data } = c.req.valid('json');

      const service = createDataExplorerService(c);

      logger.info(
        {
          schema,
          table,
          conditions,
        },
        'Updating record by conditions...',
      );

      try {
        const result = await service.updateRecordByConditions({
          schemaName: schema,
          tableName: table,
          conditions,
          data,
        });

        logger.info(
          {
            schema,
            table,
          },
          'Record updated by conditions',
        );

        return c.json({
          success: true,
          data: result,
        });
      } catch (error) {
        logger.error(
          {
            schema,
            table,
            error,
          },
          'Error updating record by conditions',
        );

        return c.json(
          {
            success: false,
            error: getPublicErrorMessage(error),
          },
          500,
        );
      }
    },
  );
}

export type UpdateRecordByConditionsRoute = ReturnType<
  typeof registerUpdateRecordByConditionsRoute
>;

/**
 * @name registerDeleteRecordByConditionsRoute
 * @description Register a route for deleting a record by conditions
 * @param router
 */
function registerDeleteRecordByConditionsRoute(router: Hono) {
  return router.delete(
    '/v1/tables/:schema/:table/record/conditions',
    zValidator('param', ParamsSchema),
    zValidator('json', z.object({ conditions: z.record(z.string(), z.any()) })),
    async (c) => {
      const logger = await getLogger();

      const { schema, table } = c.req.valid('param');
      const { conditions } = c.req.valid('json');

      const service = createDataExplorerService(c);

      logger.info(
        {
          schema,
          table,
          conditions,
        },
        'Deleting record by conditions...',
      );

      try {
        // Delete the record by conditions
        const result = await service.deleteRecordByConditions({
          schemaName: schema,
          tableName: table,
          conditions,
        });

        logger.info(
          {
            schema,
            table,
          },
          'Record deleted by conditions',
        );

        return c.json({
          success: true,
          data: result,
        });
      } catch (error) {
        logger.error(
          {
            schema,
            table,
            error,
          },
          'Error deleting record by conditions',
        );

        return c.json(
          {
            success: false,
            error: getPublicErrorMessage(error),
          },
          500,
        );
      }
    },
  );
}

export type DeleteRecordByConditionsRoute = ReturnType<
  typeof registerDeleteRecordByConditionsRoute
>;

/**
 * @name registerBatchDeleteRecordsRoute
 * @description Register a route for batch deleting records
 * @param router
 */
function registerBatchDeleteRecordsRoute(router: Hono) {
  return router.delete(
    '/v1/tables/:schema/:table/records',
    zValidator('param', ParamsSchema),
    zValidator(
      'json',
      z.object({
        items: z.array(z.record(z.string(), z.any())),
      }),
    ),
    async (c) => {
      const logger = await getLogger();

      const { schema, table } = c.req.valid('param');
      const { items } = c.req.valid('json');

      logger.info(
        {
          schema,
          table,
          items,
        },
        'Batch deleting records...',
      );

      const service = createDataExplorerService(c);

      try {
        const result = await service.batchDeleteRecords({
          schemaName: schema,
          tableName: table,
          items,
        });

        logger.info(
          {
            schema,
            table,
            total: result.total,
            successCount: result.successCount,
            failureCount: result.failureCount,
          },
          'Batch delete completed',
        );

        return c.json({
          success: true,
          data: result,
        });
      } catch (error) {
        logger.error(
          {
            schema,
            table,
            error,
          },
          'Error batch deleting records',
        );

        return c.json(
          {
            success: false,
            error: getPublicErrorMessage(error),
          },
          500,
        );
      }
    },
  );
}

export type BatchDeleteRecordsRoute = ReturnType<
  typeof registerBatchDeleteRecordsRoute
>;

/**
 * @name registerGetDataRecordPermissionsRoute
 * @description Register a route for getting data record permissions
 * @param router
 */
export function registerGetDataRecordPermissionsRoute(router: Hono) {
  return router.get(
    '/v1/data/:schema/:table/permissions',
    zValidator('param', ParamsSchema),
    async (c) => {
      const service = createDataExplorerService(c);

      const { schema, table } = c.req.valid('param');

      // Security: never expose Supabase/CMS-managed schemas here.
      if (isProtectedSchema(schema)) {
        return c.json({ success: false, error: 'Access denied' }, 403);
      }

      const permissions = await service.getDataPermissions({
        schemaName: schema,
        tableName: table,
      });

      return c.json(permissions);
    },
  );
}

export type GetDataRecordPermissionsRoute = ReturnType<
  typeof registerGetDataRecordPermissionsRoute
>;

/**
 * @name registerGetFieldValuesRoute
 * @description Register a route for getting unique field values
 * @param router
 */
function registerGetFieldValuesRoute(router: Hono) {
  return router.get(
    '/v1/tables/:schema/:table/fields/:field/values',
    zValidator(
      'param',
      ParamsSchema.extend({
        field: z.string().min(1),
      }),
    ),
    zValidator(
      'query',
      z.object({
        search: z.string().optional(),
        limit: z.coerce.number().optional().default(10),
        include_top_hits: z.coerce.boolean().optional().default(false),
      }),
    ),
    async (c) => {
      const logger = await getLogger();
      const service = createDataExplorerService(c);

      const { schema, table, field } = c.req.valid('param');
      const { search, limit, include_top_hits } = c.req.valid('query');

      try {
        // Security: never expose Supabase/CMS-managed schemas here.
        if (isProtectedSchema(schema)) {
          return c.json({ success: false, error: 'Access denied' }, 403);
        }

        // Security: enforce SELECT permission on the table before reading any of
        // its column values. This route runs on the RLS-off admin client, so the
        // explicit check is the only authorization gate — without it any
        // authenticated user could enumerate values of any column of any table.
        const authorizationService = createAuthorizationService(c);
        const canSelect = await authorizationService.hasDataPermission(
          'select',
          schema,
          table,
        );

        if (!canSelect) {
          return c.json({ success: false, error: 'Access denied' }, 403);
        }

        const values = await service.getFieldValues({
          schemaName: schema,
          tableName: table,
          fieldName: field,
          search,
          limit,
          includeTopHits: include_top_hits,
        });

        return c.json({
          success: true,
          data: values,
        });
      } catch (error) {
        logger.error(
          {
            schema,
            table,
            field,
            error,
          },
          'Error getting field values',
        );

        return c.json(
          {
            success: false,
            error: getPublicErrorMessage(error),
          },
          500,
        );
      }
    },
  );
}

export type GetFieldValuesRoute = ReturnType<
  typeof registerGetFieldValuesRoute
>;
