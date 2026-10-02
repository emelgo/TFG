import { Param, eq, sql } from 'drizzle-orm';
import { Context } from 'hono';
import { z } from 'zod';

import { savedViewsInCms } from '@pymekit/cms-supabase/schema';

const SavedViewConfigSchema = z.object({
  filters: z.array(z.any()),
  sort: z
    .object({
      column: z.string().optional(),
      direction: z.enum(['asc', 'desc']).optional(),
    })
    .optional(),
  search: z.string().optional(),
});

/**
 * Schema for creating a saved view
 */
export const CreateSavedViewSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  config: SavedViewConfigSchema,
  roles: z.array(z.string().uuid()).max(10).optional(),
});

export type CreateSavedViewType = z.infer<typeof CreateSavedViewSchema>;

/**
 * Schema for updating a saved view
 */
export const UpdateSavedViewSchema = CreateSavedViewSchema.partial();

export type UpdateSavedViewType = z.infer<typeof UpdateSavedViewSchema>;

/**
 * Create a saved views service
 */
export function createSavedViewsService(context: Context) {
  return new SavedViewsService(context);
}

/**
 * Service class for managing saved views
 */
class SavedViewsService {
  constructor(private readonly context: Context) {}

  /**
   * Get all saved views for a specific schema and table
   */
  async getSavedViews(params: { schema: string; table: string }) {
    const { schema, table } = params;
    const db = this.context.get('drizzle');

    const result = await db.runTransaction(async (tx) => {
      return tx.execute(sql`
        SELECT *
        FROM cms.get_user_views(${schema}, ${table})
      `);
    });

    if (!result[0] || !result[0]['get_user_views']) {
      return {
        personal: [],
        team: [],
      };
    }

    return result[0]['get_user_views'] as {
      personal: (typeof savedViewsInCms.$inferSelect)[];
      team: (typeof savedViewsInCms.$inferSelect)[];
    };
  }

  /**
   * Create a new saved view
   */
  async createSavedView(params: {
    schema: string;
    table: string;
    data: CreateSavedViewType;
  }) {
    const { schema, table, data } = params;
    const db = this.context.get('drizzle');

    // Prepare the view type constant
    const viewType = 'filter';

    // Prepare the config as JSON
    const configJson = JSON.stringify(data.config);

    // Use the RPC via raw SQL to create a view
    // If there are multiple roles, we'll need to call the function for each role
    const roles = data.roles;

    // No specific roles - create view without role
    const result = await db.runTransaction((tx) => {
      return tx.execute(sql`
          SELECT *
          FROM cms.insert_saved_view(
            ${data.name},
            ${data.description || null},
            ${viewType},
            ${configJson}::jsonb,
            ${schema},
            ${table},
            ${roles && roles.length > 0 ? new Param(roles) : null}
               )
        `);
    });

    // Get the created view ID
    if (
      result &&
      result.length > 0 &&
      result[0] &&
      'insert_saved_view' in result[0]
    ) {
      const viewId = result[0]['insert_saved_view'] as string;

      // Now fetch the complete view details
      return this.getViewById({ id: viewId });
    }

    throw new Error('Failed to create saved view');
  }

  /**
   * Get a view by ID
   */
  private async getViewById(params: { id: string }) {
    const { id } = params;
    const db = this.context.get('drizzle');

    const result = await db.runTransaction(async (tx) => {
      return tx
        .select()
        .from(savedViewsInCms)
        .where(eq(savedViewsInCms.id, id))
        .limit(1);
    });

    return result[0];
  }

  /**
   * Update an existing saved view
   */
  async updateSavedView(params: { id: string; data: UpdateSavedViewType }) {
    const { id, data } = params;

    const db = this.context.get('drizzle');

    const { roles: _, ...updateData } = data;

    // Update the view
    const result = await db.runTransaction(async (tx) => {
      return tx
        .update(savedViewsInCms)
        .set(updateData)
        .where(eq(savedViewsInCms.id, id))
        .returning();
    });

    return result[0];
  }

  /**
   * Delete a saved view
   */
  async deleteSavedView(params: { id: string }) {
    const { id } = params;

    const db = this.context.get('drizzle');

    await db.runTransaction(async (tx) => {
      return tx.delete(savedViewsInCms).where(eq(savedViewsInCms.id, id));
    });

    return { success: true };
  }
}
