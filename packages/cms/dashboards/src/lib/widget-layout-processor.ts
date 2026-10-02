/**
 * Widget Layout Processor
 *
 * Handles widget positioning, layout conversion, and size constraint enforcement.
 * Extracted from widgets service for better testability and reusability.
 */
import type { WidgetType } from '../types';
import { getWidgetTypeConfig } from './widget-registry';

export interface WidgetPosition {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SizeConstraints {
  minW: number;
  minH: number;
  maxW?: number;
  maxH?: number;
}

export interface ConstrainedSize {
  w: number;
  h: number;
}

/**
 * Convert widget data to layout items for position checking
 */
export function convertWidgetsToLayout(
  widgets: Array<{
    id: string;
    position: WidgetPosition | string;
  }>,
): LayoutItem[] {
  return widgets.map((widget) => {
    const position = parseWidgetPosition(widget.position);
    return {
      i: widget.id,
      x: position.x,
      y: position.y,
      w: position.w,
      h: position.h,
    };
  });
}

/**
 * Parse widget position from either object or JSON string
 */
export function parseWidgetPosition(
  position: WidgetPosition | string,
): WidgetPosition {
  if (typeof position === 'string') {
    try {
      return JSON.parse(position) as WidgetPosition;
    } catch {
      throw new Error(`Invalid widget position JSON: ${position}`);
    }
  }

  // Validate position object
  const pos = position as WidgetPosition;
  if (
    typeof pos.x !== 'number' ||
    typeof pos.y !== 'number' ||
    typeof pos.w !== 'number' ||
    typeof pos.h !== 'number'
  ) {
    throw new Error('Widget position must have numeric x, y, w, h properties');
  }

  return pos;
}

/**
 * Get size constraints for a widget type
 */
export function getWidgetSizeConstraints(
  widgetType: WidgetType,
): SizeConstraints {
  const widgetTypeConfig = getWidgetTypeConfig(widgetType);

  return {
    minW: widgetTypeConfig?.minSize.w ?? 1,
    minH: widgetTypeConfig?.minSize.h ?? 1,
    maxW: widgetTypeConfig?.maxSize?.w,
    maxH: widgetTypeConfig?.maxSize?.h,
  };
}

/**
 * Apply size constraints to a requested widget size
 */
export function applySizeConstraints(
  requestedSize: { w: number; h: number },
  constraints: SizeConstraints,
): ConstrainedSize {
  const { minW, minH, maxW, maxH } = constraints;

  return {
    w: Math.min(Math.max(requestedSize.w, minW), maxW ?? 12),
    h: Math.min(Math.max(requestedSize.h, minH), maxH ?? 8),
  };
}

/**
 * Check if two rectangles overlap
 */
export function checkRectangleOverlap(
  rect1: { x: number; y: number; w: number; h: number },
  rect2: { x: number; y: number; w: number; h: number },
): boolean {
  // Two rectangles don't overlap if one is completely to the left, right, above, or below the other
  return !(
    rect1.x >= rect2.x + rect2.w || // rect1 is to the right of rect2
    rect2.x >= rect1.x + rect1.w || // rect2 is to the right of rect1
    rect1.y >= rect2.y + rect2.h || // rect1 is below rect2
    rect2.y >= rect1.y + rect1.h // rect2 is below rect1
  );
}

/**
 * Find widgets that overlap with a given position
 */
export function findOverlappingWidgets(
  position: WidgetPosition,
  existingLayout: LayoutItem[],
  excludeId?: string,
): LayoutItem[] {
  return existingLayout.filter((item) => {
    if (excludeId && item.i === excludeId) {
      return false;
    }

    return checkRectangleOverlap(position, item);
  });
}

/**
 * Validate that a widget position doesn't overlap with existing widgets
 */
export function validateWidgetPosition(
  position: WidgetPosition,
  existingLayout: LayoutItem[],
  excludeId?: string,
): { isValid: boolean; overlappingWidgets: LayoutItem[] } {
  const overlapping = findOverlappingWidgets(
    position,
    existingLayout,
    excludeId,
  );

  return {
    isValid: overlapping.length === 0,
    overlappingWidgets: overlapping,
  };
}

/**
 * Generate SQL WHERE clause for overlap detection
 */
export function generateOverlapSQL(position: WidgetPosition): string {
  const { x, y, w, h } = position;

  return `NOT (
    (position->>'x')::INTEGER >= ${x + w} OR
    ${x} >= (position->>'x')::INTEGER + (position->>'w')::INTEGER OR
    (position->>'y')::INTEGER >= ${y + h} OR
    ${y} >= (position->>'y')::INTEGER + (position->>'h')::INTEGER
  )`;
}

/**
 * Calculate the area of a widget
 */
export function calculateWidgetArea(position: WidgetPosition): number {
  return position.w * position.h;
}

/**
 * Check if a position is within grid bounds
 */
export function isWithinGridBounds(
  position: WidgetPosition,
  gridBounds: { maxColumns: number; maxRows?: number },
): boolean {
  const { maxColumns, maxRows } = gridBounds;

  // Check if widget fits within column constraints
  if (position.x + position.w > maxColumns) {
    return false;
  }

  // Check if widget fits within row constraints (if specified)
  if (maxRows && position.y + position.h > maxRows) {
    return false;
  }

  // Check for negative positions
  if (position.x < 0 || position.y < 0) {
    return false;
  }

  return true;
}
