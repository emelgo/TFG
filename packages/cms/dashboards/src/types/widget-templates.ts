import type { WidgetType } from './index';
import type {
  ChartWidgetConfig,
  MetricWidgetConfig,
  TableWidgetConfig,
} from './index';

/**
 * Widget template definition - represents a single widget in a template bundle
 */
export interface WidgetTemplateItem {
  type: WidgetType;
  title: string;
  schemaName: string;
  tableName: string;
  config: ChartWidgetConfig | MetricWidgetConfig | TableWidgetConfig;
  position: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
}

/**
 * Widget template bundle - collection of pre-configured widgets
 */
export interface WidgetTemplate {
  id: string;
  name: string;
  description: string;
  category: 'analytics' | 'operations' | 'sales' | 'support' | 'system';
  icon?: string; // Lucide icon name
  previewImage?: string; // Base64 or URL
  widgets: WidgetTemplateItem[];
  metadata: {
    author?: string;
    version: string;
    tags: string[];
    requiredTables: Array<{
      schema: string;
      table: string;
    }>;
    widgetCount: number;
  };
}

/**
 * Template application request
 */
export interface ApplyTemplateRequest {
  templateId: string;
  dashboardId: string;
}

/**
 * Template application response
 */
export interface ApplyTemplateResponse {
  success: boolean;
  widgetIds: string[];
  widgetCount: number;
  message?: string;
}

/**
 * Template registry - maps template IDs to template definitions
 */
export type WidgetTemplateRegistry = Record<string, WidgetTemplate>;
