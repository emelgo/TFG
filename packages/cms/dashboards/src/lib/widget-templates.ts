// Imported from the dedicated subpath, not the package root: the root barrel
// re-exports the services, which pull the server-only drizzle/postgres client
// into whatever imports them. This module is reached from client components.
import { isProtectedSchema } from '@pymekit/cms-data-explorer-core/protected-schemas';

import type {
  WidgetTemplate,
  WidgetTemplateRegistry,
} from '../types/widget-templates';

/**
 * User Activity Overview Template
 *
 * Pre-configured dashboard template for monitoring user activity metrics
 * from the auth.users table. Includes:
 * - Active users count (last 7 days)
 * - New registrations (last 24 hours)
 * - Total users count
 * - Daily Active Users (DAU)
 * - Inactive users (30+ days)
 * - Daily registrations chart (30 days)
 * - Recent activity table
 */
export const USER_ACTIVITY_TEMPLATE: WidgetTemplate = {
  id: 'user-activity-overview',
  name: 'User Activity Overview',
  description:
    'Monitor user engagement with key metrics including active users, DAU, inactive users, new registrations, and activity trends.',
  category: 'analytics',
  icon: 'Users',
  metadata: {
    author: 'PymeKit CMS',
    version: '1.0.0',
    tags: ['users', 'analytics', 'activity', 'auth'],
    requiredTables: [
      {
        schema: 'auth',
        table: 'users',
      },
    ],
    widgetCount: 7,
  },
  widgets: [
    // Widget 1: Active Users (last 7 days) - Metric
    {
      type: 'metric',
      title: 'Active Users (7d)',
      schemaName: 'auth',
      tableName: 'users',
      position: {
        x: 0,
        y: 0,
        w: 3,
        h: 2,
      },
      config: {
        metric: 'id',
        aggregation: 'count',
        format: 'number',
        showTrend: false,
        size: 'md',
        color: 'blue',
        filters: [
          {
            column: 'last_sign_in_at',
            operator: 'gte',
            value: '__rel_date:last7Days',
            logic: 'and',
          },
        ],
      },
    },

    // Widget 2: New Users (last 24 hours) - Metric
    {
      type: 'metric',
      title: 'New Users (24h)',
      schemaName: 'auth',
      tableName: 'users',
      position: {
        x: 3,
        y: 0,
        w: 3,
        h: 2,
      },
      config: {
        metric: 'id',
        aggregation: 'count',
        format: 'number',
        showTrend: false,
        size: 'md',
        color: 'green',
        filters: [
          {
            column: 'created_at',
            operator: 'gte',
            value: '__rel_date:yesterday',
            logic: 'and',
          },
        ],
      },
    },

    // Widget 3: Total Users - Metric
    {
      type: 'metric',
      title: 'Total Users',
      schemaName: 'auth',
      tableName: 'users',
      position: {
        x: 6,
        y: 0,
        w: 3,
        h: 2,
      },
      config: {
        metric: 'id',
        aggregation: 'count',
        format: 'number',
        showTrend: false,
        size: 'md',
        color: 'purple',
        filters: [],
      },
    },

    // Widget 4: Daily Active Users (DAU) - Metric
    {
      type: 'metric',
      title: 'Daily Active Users',
      schemaName: 'auth',
      tableName: 'users',
      position: {
        x: 0,
        y: 2,
        w: 3,
        h: 2,
      },
      config: {
        metric: 'id',
        aggregation: 'count',
        format: 'number',
        showTrend: false,
        size: 'md',
        color: 'cyan',
        filters: [
          {
            column: 'last_sign_in_at',
            operator: 'gte',
            value: '__rel_date:today',
            logic: 'and',
          },
        ],
      },
    },

    // Widget 5: Inactive Users (30+ days) - Metric
    {
      type: 'metric',
      title: 'Inactive Users (30d+)',
      schemaName: 'auth',
      tableName: 'users',
      position: {
        x: 3,
        y: 2,
        w: 3,
        h: 2,
      },
      config: {
        metric: 'id',
        aggregation: 'count',
        format: 'number',
        showTrend: false,
        size: 'md',
        color: 'orange',
        filters: [
          {
            column: 'last_sign_in_at',
            operator: 'lt',
            value: '__rel_date:last30Days',
            logic: 'and',
          },
        ],
      },
    },

    // Widget 6: Daily Registrations (30 days) - Chart
    {
      type: 'chart',
      title: 'Daily Registrations (30d)',
      schemaName: 'auth',
      tableName: 'users',
      position: {
        x: 0,
        y: 4,
        w: 6,
        h: 4,
      },
      config: {
        chartType: 'line',
        xAxis: 'created_at',
        yAxis: 'id',
        aggregation: 'count',
        timeAggregation: 'day',
        showLegend: true,
        showGrid: true,
        tension: 0.4,
        colors: ['#3b82f6'],
        filters: [
          {
            column: 'created_at',
            operator: 'gte',
            value: '__rel_date:last30Days',
            logic: 'and',
          },
        ],
      },
    },

    // Widget 7: Recent Activity - Table
    {
      type: 'table',
      title: 'Recent User Activity',
      schemaName: 'auth',
      tableName: 'users',
      position: {
        x: 6,
        y: 4,
        w: 6,
        h: 4,
      },
      config: {
        columns: [
          'id',
          'email',
          'created_at',
          'last_sign_in_at',
          'email_confirmed_at',
        ],
        pageSize: 10,
        showPagination: true,
        showSearch: true,
        sortable: true,
        searchable: true,
        columnWidth: 'auto',
        zebra: true,
        compact: false,
        filters: [],
        orderBy: [
          {
            column: 'last_sign_in_at',
            direction: 'desc',
          },
        ],
        limit: 50,
      },
    },
  ],
};

/**
 * Widget Template Registry
 *
 * Central registry of all available widget templates.
 * Add new templates here to make them available in the UI.
 */
export const WIDGET_TEMPLATES: WidgetTemplateRegistry = {
  [USER_ACTIVITY_TEMPLATE.id]: USER_ACTIVITY_TEMPLATE,
};

/**
 * Widgets on a protected schema can be created but never read, so a template
 * referencing one would only ever produce broken widgets.
 */
export function isTemplateApplicable(template: WidgetTemplate): boolean {
  const requiredTables = template.metadata?.requiredTables ?? [];

  const referencedSchemas = [
    ...requiredTables.map((table) => table.schema),
    ...template.widgets.map((widget) => widget.schemaName),
  ];

  return !referencedSchemas.some((schema) => isProtectedSchema(schema));
}

/**
 * Get all available widget templates
 */
export function getWidgetTemplates(): WidgetTemplate[] {
  return Object.values(WIDGET_TEMPLATES).filter(isTemplateApplicable);
}

/**
 * Get a specific widget template by ID
 */
export function getWidgetTemplate(id: string): WidgetTemplate | undefined {
  const template = WIDGET_TEMPLATES[id];

  return template && isTemplateApplicable(template) ? template : undefined;
}

/**
 * Get widget templates by category
 */
export function getWidgetTemplatesByCategory(
  category: WidgetTemplate['category'],
): WidgetTemplate[] {
  return getWidgetTemplates().filter(
    (template) => template.category === category,
  );
}
