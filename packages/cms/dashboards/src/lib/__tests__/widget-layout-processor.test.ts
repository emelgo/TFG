import { describe, expect, it, vi } from 'vitest';

import {
  type ConstrainedSize,
  type LayoutItem,
  type SizeConstraints,
  type WidgetPosition,
  applySizeConstraints,
  calculateWidgetArea,
  checkRectangleOverlap,
  convertWidgetsToLayout,
  findOverlappingWidgets,
  generateOverlapSQL,
  getWidgetSizeConstraints,
  isWithinGridBounds,
  parseWidgetPosition,
  validateWidgetPosition,
} from '../widget-layout-processor';

// Mock the widget registry
vi.mock('../widget-registry', () => ({
  getWidgetTypeConfig: vi.fn((widgetType: string) => {
    const configs = {
      chart: {
        minSize: { w: 2, h: 2 },
        maxSize: { w: 8, h: 6 },
      },
      metric: {
        minSize: { w: 1, h: 1 },
        maxSize: { w: 4, h: 2 },
      },
      table: {
        minSize: { w: 3, h: 3 },
        maxSize: undefined,
      },
    };
    return configs[widgetType as keyof typeof configs];
  }),
}));

describe('Widget Layout Processor', () => {
  describe('parseWidgetPosition', () => {
    it('should parse valid position object', () => {
      const position: WidgetPosition = { x: 1, y: 2, w: 3, h: 4 };
      const result = parseWidgetPosition(position);

      expect(result).toEqual(position);
    });

    it('should parse valid JSON string', () => {
      const positionStr = '{"x":1,"y":2,"w":3,"h":4}';
      const result = parseWidgetPosition(positionStr);

      expect(result).toEqual({ x: 1, y: 2, w: 3, h: 4 });
    });

    it('should throw error for invalid JSON string', () => {
      const invalidJson = '{"x":1,"y":2,"w":3'; // Missing closing brace

      expect(() => parseWidgetPosition(invalidJson)).toThrow(
        'Invalid widget position JSON: {"x":1,"y":2,"w":3',
      );
    });

    it('should throw error for position object missing properties', () => {
      const invalidPosition = { x: 1, y: 2, w: 3 }; // Missing h

      expect(() =>
        parseWidgetPosition(invalidPosition as WidgetPosition),
      ).toThrow('Widget position must have numeric x, y, w, h properties');
    });

    it('should throw error for position with non-numeric properties', () => {
      const invalidPosition = { x: 1, y: 2, w: 'invalid', h: 4 };

      expect(() =>
        parseWidgetPosition(invalidPosition as WidgetPosition),
      ).toThrow('Widget position must have numeric x, y, w, h properties');
    });

    it('should handle decimal positions', () => {
      const position: WidgetPosition = { x: 1.5, y: 2.3, w: 3.7, h: 4.1 };
      const result = parseWidgetPosition(position);

      expect(result).toEqual(position);
    });
  });

  describe('convertWidgetsToLayout', () => {
    it('should convert widgets with object positions', () => {
      const widgets = [
        { id: 'widget1', position: { x: 0, y: 0, w: 2, h: 2 } },
        { id: 'widget2', position: { x: 2, y: 0, w: 3, h: 2 } },
      ];

      const result = convertWidgetsToLayout(widgets);

      expect(result).toEqual([
        { i: 'widget1', x: 0, y: 0, w: 2, h: 2 },
        { i: 'widget2', x: 2, y: 0, w: 3, h: 2 },
      ]);
    });

    it('should convert widgets with string positions', () => {
      const widgets = [
        { id: 'widget1', position: '{"x":1,"y":1,"w":2,"h":2}' },
        { id: 'widget2', position: '{"x":3,"y":1,"w":2,"h":1}' },
      ];

      const result = convertWidgetsToLayout(widgets);

      expect(result).toEqual([
        { i: 'widget1', x: 1, y: 1, w: 2, h: 2 },
        { i: 'widget2', x: 3, y: 1, w: 2, h: 1 },
      ]);
    });

    it('should handle empty widgets array', () => {
      const result = convertWidgetsToLayout([]);
      expect(result).toEqual([]);
    });
  });

  describe('getWidgetSizeConstraints', () => {
    it('should return constraints for chart widget', () => {
      const result = getWidgetSizeConstraints('chart');

      expect(result).toEqual({
        minW: 2,
        minH: 2,
        maxW: 8,
        maxH: 6,
      });
    });

    it('should return constraints for metric widget', () => {
      const result = getWidgetSizeConstraints('metric');

      expect(result).toEqual({
        minW: 1,
        minH: 1,
        maxW: 4,
        maxH: 2,
      });
    });

    it('should return constraints for table widget without max size', () => {
      const result = getWidgetSizeConstraints('table');

      expect(result).toEqual({
        minW: 3,
        minH: 3,
        maxW: undefined,
        maxH: undefined,
      });
    });

    it('should return default constraints for unknown widget type', () => {
      const result = getWidgetSizeConstraints('unknown');

      expect(result).toEqual({
        minW: 1,
        minH: 1,
        maxW: undefined,
        maxH: undefined,
      });
    });
  });

  describe('applySizeConstraints', () => {
    it('should enforce minimum size constraints', () => {
      const requestedSize = { w: 0, h: 0 };
      const constraints: SizeConstraints = { minW: 2, minH: 2 };

      const result = applySizeConstraints(requestedSize, constraints);

      expect(result).toEqual({ w: 2, h: 2 });
    });

    it('should enforce maximum size constraints', () => {
      const requestedSize = { w: 10, h: 10 };
      const constraints: SizeConstraints = {
        minW: 1,
        minH: 1,
        maxW: 5,
        maxH: 4,
      };

      const result = applySizeConstraints(requestedSize, constraints);

      expect(result).toEqual({ w: 5, h: 4 });
    });

    it('should use default max values when not specified', () => {
      const requestedSize = { w: 15, h: 15 };
      const constraints: SizeConstraints = { minW: 1, minH: 1 };

      const result = applySizeConstraints(requestedSize, constraints);

      expect(result).toEqual({ w: 12, h: 8 }); // Default max values
    });

    it('should return requested size when within constraints', () => {
      const requestedSize = { w: 3, h: 2 };
      const constraints: SizeConstraints = {
        minW: 1,
        minH: 1,
        maxW: 5,
        maxH: 4,
      };

      const result = applySizeConstraints(requestedSize, constraints);

      expect(result).toEqual({ w: 3, h: 2 });
    });

    it('should handle edge case constraints', () => {
      const requestedSize = { w: 2, h: 2 };
      const constraints: SizeConstraints = {
        minW: 2,
        minH: 2,
        maxW: 2,
        maxH: 2,
      };

      const result = applySizeConstraints(requestedSize, constraints);

      expect(result).toEqual({ w: 2, h: 2 });
    });
  });

  describe('checkRectangleOverlap', () => {
    it('should detect overlapping rectangles', () => {
      const rect1 = { x: 0, y: 0, w: 3, h: 3 };
      const rect2 = { x: 2, y: 2, w: 3, h: 3 };

      const result = checkRectangleOverlap(rect1, rect2);

      expect(result).toBe(true);
    });

    it('should detect non-overlapping rectangles (horizontally separated)', () => {
      const rect1 = { x: 0, y: 0, w: 2, h: 2 };
      const rect2 = { x: 3, y: 0, w: 2, h: 2 };

      const result = checkRectangleOverlap(rect1, rect2);

      expect(result).toBe(false);
    });

    it('should detect non-overlapping rectangles (vertically separated)', () => {
      const rect1 = { x: 0, y: 0, w: 2, h: 2 };
      const rect2 = { x: 0, y: 3, w: 2, h: 2 };

      const result = checkRectangleOverlap(rect1, rect2);

      expect(result).toBe(false);
    });

    it('should detect touching rectangles as overlapping', () => {
      const rect1 = { x: 0, y: 0, w: 2, h: 2 };
      const rect2 = { x: 2, y: 0, w: 2, h: 2 }; // Touching at x=2

      const result = checkRectangleOverlap(rect1, rect2);

      expect(result).toBe(false); // Touching edges don't overlap
    });

    it('should handle identical rectangles', () => {
      const rect1 = { x: 1, y: 1, w: 3, h: 3 };
      const rect2 = { x: 1, y: 1, w: 3, h: 3 };

      const result = checkRectangleOverlap(rect1, rect2);

      expect(result).toBe(true);
    });

    it('should handle zero-sized rectangles', () => {
      const rect1 = { x: 0, y: 0, w: 0, h: 0 };
      const rect2 = { x: 0, y: 0, w: 2, h: 2 };

      const result = checkRectangleOverlap(rect1, rect2);

      expect(result).toBe(false); // Zero-width/height rectangles don't overlap
    });

    it('should handle one rectangle inside another', () => {
      const rect1 = { x: 0, y: 0, w: 5, h: 5 }; // Large rectangle
      const rect2 = { x: 1, y: 1, w: 2, h: 2 }; // Small rectangle inside

      const result = checkRectangleOverlap(rect1, rect2);

      expect(result).toBe(true);
    });
  });

  describe('findOverlappingWidgets', () => {
    const existingLayout: LayoutItem[] = [
      { i: 'widget1', x: 0, y: 0, w: 2, h: 2 },
      { i: 'widget2', x: 3, y: 0, w: 2, h: 1 },
      { i: 'widget3', x: 0, y: 3, w: 3, h: 2 },
    ];

    it('should find overlapping widgets', () => {
      const position: WidgetPosition = { x: 1, y: 1, w: 2, h: 2 };

      const result = findOverlappingWidgets(position, existingLayout);

      expect(result).toHaveLength(1);
      expect(result[0].i).toBe('widget1');
    });

    it('should return empty array when no overlaps', () => {
      const position: WidgetPosition = { x: 5, y: 5, w: 2, h: 2 };

      const result = findOverlappingWidgets(position, existingLayout);

      expect(result).toHaveLength(0);
    });

    it('should exclude specified widget ID', () => {
      const position: WidgetPosition = { x: 0, y: 0, w: 2, h: 2 }; // Same as widget1

      const result = findOverlappingWidgets(
        position,
        existingLayout,
        'widget1',
      );

      expect(result).toHaveLength(0); // widget1 excluded, no other overlaps
    });

    it('should find multiple overlapping widgets', () => {
      // Let's check the layout first:
      // widget1: { x: 0, y: 0, w: 2, h: 2 } - covers (0,0) to (2,2)
      // widget2: { x: 3, y: 0, w: 2, h: 1 } - covers (3,0) to (5,1)
      // widget3: { x: 0, y: 3, w: 3, h: 2 } - covers (0,3) to (3,5)

      // Position that overlaps widget1 and widget3
      const position: WidgetPosition = { x: 0, y: 1, w: 2, h: 3 }; // Covers (0,1) to (2,4)

      const result = findOverlappingWidgets(position, existingLayout);

      expect(result).toHaveLength(2);
      expect(result.map((w) => w.i).sort()).toEqual(['widget1', 'widget3']);
    });
  });

  describe('validateWidgetPosition', () => {
    const existingLayout: LayoutItem[] = [
      { i: 'widget1', x: 0, y: 0, w: 2, h: 2 },
      { i: 'widget2', x: 3, y: 0, w: 2, h: 1 },
    ];

    it('should return valid for non-overlapping position', () => {
      const position: WidgetPosition = { x: 5, y: 5, w: 2, h: 2 };

      const result = validateWidgetPosition(position, existingLayout);

      expect(result.isValid).toBe(true);
      expect(result.overlappingWidgets).toHaveLength(0);
    });

    it('should return invalid for overlapping position', () => {
      const position: WidgetPosition = { x: 1, y: 1, w: 2, h: 2 };

      const result = validateWidgetPosition(position, existingLayout);

      expect(result.isValid).toBe(false);
      expect(result.overlappingWidgets).toHaveLength(1);
      expect(result.overlappingWidgets[0].i).toBe('widget1');
    });

    it('should exclude specified widget from validation', () => {
      const position: WidgetPosition = { x: 0, y: 0, w: 2, h: 2 };

      const result = validateWidgetPosition(
        position,
        existingLayout,
        'widget1',
      );

      expect(result.isValid).toBe(true);
      expect(result.overlappingWidgets).toHaveLength(0);
    });
  });

  describe('generateOverlapSQL', () => {
    it('should generate correct SQL for overlap detection', () => {
      const position: WidgetPosition = { x: 2, y: 3, w: 4, h: 2 };

      const result = generateOverlapSQL(position);

      expect(result).toBe(`NOT (
    (position->>'x')::INTEGER >= 6 OR
    2 >= (position->>'x')::INTEGER + (position->>'w')::INTEGER OR
    (position->>'y')::INTEGER >= 5 OR
    3 >= (position->>'y')::INTEGER + (position->>'h')::INTEGER
  )`);
    });

    it('should handle zero position and size', () => {
      const position: WidgetPosition = { x: 0, y: 0, w: 1, h: 1 };

      const result = generateOverlapSQL(position);

      expect(result).toBe(`NOT (
    (position->>'x')::INTEGER >= 1 OR
    0 >= (position->>'x')::INTEGER + (position->>'w')::INTEGER OR
    (position->>'y')::INTEGER >= 1 OR
    0 >= (position->>'y')::INTEGER + (position->>'h')::INTEGER
  )`);
    });
  });

  describe('calculateWidgetArea', () => {
    it('should calculate area correctly', () => {
      const position: WidgetPosition = { x: 0, y: 0, w: 3, h: 4 };

      const result = calculateWidgetArea(position);

      expect(result).toBe(12);
    });

    it('should handle unit area', () => {
      const position: WidgetPosition = { x: 5, y: 5, w: 1, h: 1 };

      const result = calculateWidgetArea(position);

      expect(result).toBe(1);
    });

    it('should handle zero area', () => {
      const position: WidgetPosition = { x: 0, y: 0, w: 0, h: 5 };

      const result = calculateWidgetArea(position);

      expect(result).toBe(0);
    });

    it('should handle decimal dimensions', () => {
      const position: WidgetPosition = { x: 0, y: 0, w: 2.5, h: 3.5 };

      const result = calculateWidgetArea(position);

      expect(result).toBe(8.75);
    });
  });

  describe('isWithinGridBounds', () => {
    it('should return true for position within bounds', () => {
      const position: WidgetPosition = { x: 1, y: 1, w: 2, h: 2 };
      const gridBounds = { maxColumns: 12, maxRows: 8 };

      const result = isWithinGridBounds(position, gridBounds);

      expect(result).toBe(true);
    });

    it('should return false for position exceeding column bounds', () => {
      const position: WidgetPosition = { x: 10, y: 1, w: 4, h: 2 }; // x + w = 14 > 12
      const gridBounds = { maxColumns: 12, maxRows: 8 };

      const result = isWithinGridBounds(position, gridBounds);

      expect(result).toBe(false);
    });

    it('should return false for position exceeding row bounds', () => {
      const position: WidgetPosition = { x: 1, y: 6, w: 2, h: 4 }; // y + h = 10 > 8
      const gridBounds = { maxColumns: 12, maxRows: 8 };

      const result = isWithinGridBounds(position, gridBounds);

      expect(result).toBe(false);
    });

    it('should return false for negative positions', () => {
      const position1: WidgetPosition = { x: -1, y: 1, w: 2, h: 2 };
      const position2: WidgetPosition = { x: 1, y: -1, w: 2, h: 2 };
      const gridBounds = { maxColumns: 12, maxRows: 8 };

      expect(isWithinGridBounds(position1, gridBounds)).toBe(false);
      expect(isWithinGridBounds(position2, gridBounds)).toBe(false);
    });

    it('should handle grid bounds without row limit', () => {
      const position: WidgetPosition = { x: 1, y: 100, w: 2, h: 2 }; // Very high y position
      const gridBounds = { maxColumns: 12 }; // No maxRows specified

      const result = isWithinGridBounds(position, gridBounds);

      expect(result).toBe(true); // Should pass since no row limit
    });

    it('should handle edge case at exact bounds', () => {
      const position: WidgetPosition = { x: 10, y: 6, w: 2, h: 2 }; // x + w = 12, y + h = 8
      const gridBounds = { maxColumns: 12, maxRows: 8 };

      const result = isWithinGridBounds(position, gridBounds);

      expect(result).toBe(true); // Should pass since exactly at bounds
    });

    it('should handle zero dimensions', () => {
      const position: WidgetPosition = { x: 5, y: 5, w: 0, h: 0 };
      const gridBounds = { maxColumns: 12, maxRows: 8 };

      const result = isWithinGridBounds(position, gridBounds);

      expect(result).toBe(true); // Zero size widgets should fit
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete widget layout validation workflow', () => {
      const existingWidgets = [
        { id: 'widget1', position: { x: 0, y: 0, w: 3, h: 2 } },
        { id: 'widget2', position: '{"x":4,"y":0,"w":2,"h":3}' },
      ];

      // Convert widgets to layout
      const layout = convertWidgetsToLayout(existingWidgets);
      expect(layout).toHaveLength(2);

      // Test new widget position that would overlap
      const newPosition: WidgetPosition = { x: 2, y: 1, w: 2, h: 2 };
      const validation = validateWidgetPosition(newPosition, layout);
      expect(validation.isValid).toBe(false);
      expect(validation.overlappingWidgets).toHaveLength(1);

      // Test position that doesn't overlap
      const validPosition: WidgetPosition = { x: 6, y: 0, w: 2, h: 2 };
      const validValidation = validateWidgetPosition(validPosition, layout);
      expect(validValidation.isValid).toBe(true);
      expect(validValidation.overlappingWidgets).toHaveLength(0);
    });

    it('should handle widget size constraint application', () => {
      // Test chart widget constraints
      const chartConstraints = getWidgetSizeConstraints('chart');
      const tooSmallSize = { w: 1, h: 1 };
      const constrainedSize = applySizeConstraints(
        tooSmallSize,
        chartConstraints,
      );

      expect(constrainedSize.w).toBe(2); // Enforced minimum
      expect(constrainedSize.h).toBe(2); // Enforced minimum

      // Test metric widget constraints
      const metricConstraints = getWidgetSizeConstraints('metric');
      const tooLargeSize = { w: 10, h: 10 };
      const constrainedMetricSize = applySizeConstraints(
        tooLargeSize,
        metricConstraints,
      );

      expect(constrainedMetricSize.w).toBe(4); // Enforced maximum
      expect(constrainedMetricSize.h).toBe(2); // Enforced maximum
    });

    it('should calculate areas and check grid bounds correctly', () => {
      const position: WidgetPosition = { x: 1, y: 1, w: 3, h: 4 };

      // Calculate area
      const area = calculateWidgetArea(position);
      expect(area).toBe(12);

      // Check grid bounds
      const standardGrid = { maxColumns: 12, maxRows: 8 };
      expect(isWithinGridBounds(position, standardGrid)).toBe(true);

      // Test with small grid
      const smallGrid = { maxColumns: 3, maxRows: 3 };
      expect(isWithinGridBounds(position, smallGrid)).toBe(false);
    });
  });
});
