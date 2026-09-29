import type { Context } from 'hono';

import type { CreateWidgetType } from '../api/services/widgets.service';
import { createWidgetsService } from '../api/services/widgets.service';
import type {
  ApplyTemplateResponse,
  WidgetTemplate,
  WidgetTemplateItem,
} from '../types/widget-templates';
import { getWidgetTemplate } from './widget-templates';

/**
 * Options for applying a widget template
 */
export interface ApplyTemplateOptions {
  dashboardId: string;
  templateId: string;
}

/**
 * Result of applying a widget template
 */
export interface ApplyTemplateResult {
  widgetIds: string[];
  widgetCount: number;
  adjustedWidgets: number;
}

/**
 * Apply a widget template to a dashboard
 *
 * Creates all widgets from the template in a batch operation.
 * Automatically handles position conflicts using the existing
 * widget positioning logic.
 *
 * @param context - Hono context with database connection
 * @param options - Template application options
 * @returns Template application result with created widget IDs
 * @throws Error if template not found or widget creation fails
 */
export async function applyWidgetTemplate(
  context: Context,
  options: ApplyTemplateOptions,
): Promise<ApplyTemplateResult> {
  const { dashboardId, templateId } = options;

  // Get the template
  const template = getWidgetTemplate(templateId);

  if (!template) {
    throw new Error(`Template not found: ${templateId}`);
  }

  // Validate template has widgets
  if (!template.widgets || template.widgets.length === 0) {
    throw new Error(`Template ${templateId} has no widgets`);
  }

  // Create widgets service
  const widgetsService = createWidgetsService(context);

  // Create all widgets sequentially to handle position adjustments properly
  // (Position detection requires knowing about previously created widgets)
  const results: Array<{
    id: string;
    wasAdjusted: boolean;
  }> = [];

  try {
    for (const widgetTemplate of template.widgets) {
      const widgetData = convertTemplateItemToWidgetData(
        widgetTemplate,
        dashboardId,
      );

      const result = await widgetsService.createWidget(widgetData);

      results.push({
        id: result.id,
        wasAdjusted: result._positionAdjusted || false,
      });
    }

    return {
      widgetIds: results.map((r) => r.id),
      widgetCount: results.length,
      adjustedWidgets: results.filter((r) => r.wasAdjusted).length,
    };
  } catch (error) {
    // If any widget creation fails, the error will propagate
    // Individual widgets already created will remain (no atomic rollback across multiple service calls)
    // This is acceptable as users can manually delete failed template attempts
    throw new Error(
      `Failed to apply template: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

/**
 * Convert a template widget item to widget creation data
 */
function convertTemplateItemToWidgetData(
  templateItem: WidgetTemplateItem,
  dashboardId: string,
): CreateWidgetType {
  return {
    dashboardId,
    widgetType: templateItem.type,
    title: templateItem.title,
    schemaName: templateItem.schemaName,
    tableName: templateItem.tableName,
    config: templateItem.config as Record<string, unknown>,
    position: templateItem.position,
  };
}

/**
 * Validate that a template can be applied to a dashboard
 *
 * Checks:
 * - Template exists
 * - Required tables are accessible
 * - User has permissions
 *
 * Note: Full permission validation happens during widget creation
 * This is a preliminary check only
 */
export function validateTemplateApplication(templateId: string): {
  valid: boolean;
  error?: string;
} {
  const template = getWidgetTemplate(templateId);

  if (!template) {
    return {
      valid: false,
      error: `Template not found: ${templateId}`,
    };
  }

  if (!template.widgets || template.widgets.length === 0) {
    return {
      valid: false,
      error: `Template ${templateId} has no widgets`,
    };
  }

  // Additional validation could be added here:
  // - Check if required tables exist
  // - Check if user has permissions on required tables
  // For now, we let the widget creation handle these checks

  return { valid: true };
}

/**
 * Get template application preview
 *
 * Returns information about what will be created without actually creating anything
 */
export function previewTemplateApplication(
  templateId: string,
): ApplyTemplateResponse & { template: WidgetTemplate | undefined } {
  const template = getWidgetTemplate(templateId);

  if (!template) {
    return {
      success: false,
      widgetIds: [],
      widgetCount: 0,
      message: `Template not found: ${templateId}`,
      template: undefined,
    };
  }

  return {
    success: true,
    widgetIds: [], // Preview doesn't create widgets
    widgetCount: template.widgets.length,
    message: `Will create ${template.widgets.length} widgets from template "${template.name}"`,
    template,
  };
}
