import type { LayoutItem } from '../types';

export interface WidgetSize {
  w: number;
  h: number;
}

export interface WidgetPosition {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Check if two widgets overlap
 */
export function checkWidgetOverlap(a: LayoutItem, b: LayoutItem): boolean {
  return !(
    a.x >= b.x + b.w ||
    b.x >= a.x + a.w ||
    a.y >= b.y + b.h ||
    b.y >= a.y + a.h
  );
}

/**
 * Check if a position would overlap with any existing widgets
 */
export function wouldOverlap(
  position: WidgetPosition,
  existingWidgets: LayoutItem[],
): boolean {
  const testItem: LayoutItem = {
    i: 'test',
    ...position,
  };

  return existingWidgets.some((widget) => checkWidgetOverlap(testItem, widget));
}

/**
 * Find the next available position for a widget
 * Uses a grid-based placement algorithm
 */
export function findNextAvailablePosition(
  size: WidgetSize,
  existingWidgets: LayoutItem[],
  gridCols: number = 12,
  startX: number = 0,
  startY: number = 0,
): WidgetPosition {
  const { w, h } = size;

  // Start from the specified position and search in a systematic way
  for (let y = startY; y < 1000; y++) {
    // Arbitrary max rows to prevent infinite loop
    for (let x = startX; x <= gridCols - w; x++) {
      const testPosition: WidgetPosition = { x, y, w, h };

      if (!wouldOverlap(testPosition, existingWidgets)) {
        return testPosition;
      }
    }
    // Reset x to 0 for next row
    startX = 0;
  }

  // Fallback: place at bottom-right if no position found (shouldn't happen)
  const maxY = Math.max(0, ...existingWidgets.map((w) => w.y + w.h));
  return { x: 0, y: maxY, w, h };
}

/**
 * Find the optimal position by trying different strategies
 */
export function findOptimalPosition(
  size: WidgetSize,
  existingWidgets: LayoutItem[],
  preferredPosition?: { x: number; y: number },
  gridCols: number = 12,
): { position: WidgetPosition; wasAdjusted: boolean } {
  const { w, h } = size;

  // Strategy 1: Try preferred position if provided. Clamped to the grid as in
  // strategies 2 and 3 — returning it verbatim stored widgets past the last
  // column while reporting `wasAdjusted: false`.
  if (preferredPosition) {
    const clampedX = Math.max(0, Math.min(gridCols - w, preferredPosition.x));
    const clampedY = Math.max(0, preferredPosition.y);

    const testPosition: WidgetPosition = {
      x: clampedX,
      y: clampedY,
      w,
      h,
    };

    if (!wouldOverlap(testPosition, existingWidgets)) {
      const wasAdjusted =
        clampedX !== preferredPosition.x || clampedY !== preferredPosition.y;

      return { position: testPosition, wasAdjusted };
    }
  }

  // Strategy 2: Try to place near the preferred position
  if (preferredPosition) {
    // Try positions around the preferred location
    const searchRadius = 3;
    for (let radius = 1; radius <= searchRadius; radius++) {
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
          if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue; // Only check perimeter

          const x = Math.max(
            0,
            Math.min(gridCols - w, preferredPosition.x + dx),
          );
          const y = Math.max(0, preferredPosition.y + dy);

          const testPosition: WidgetPosition = { x, y, w, h };

          if (!wouldOverlap(testPosition, existingWidgets)) {
            return { position: testPosition, wasAdjusted: true };
          }
        }
      }
    }
  }

  // Strategy 3: Find next available position using systematic search
  const position = findNextAvailablePosition(size, existingWidgets, gridCols);
  const wasAdjusted = preferredPosition
    ? position.x !== preferredPosition.x || position.y !== preferredPosition.y
    : true;

  return { position, wasAdjusted };
}

/**
 * Compact the layout by moving widgets up to fill empty spaces
 */
export function compactLayout(widgets: LayoutItem[]): LayoutItem[] {
  // Sort by y position, then x position
  const sortedWidgets = [...widgets].sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y;
    return a.x - b.x;
  });

  const result: LayoutItem[] = [];

  for (const widget of sortedWidgets) {
    // Find the highest available position for this widget
    let bestY = 0;

    // Check each row from top to bottom
    for (let y = 0; y <= widget.y; y++) {
      const testPosition: LayoutItem = { ...widget, y };

      if (
        !result.some((existing) => checkWidgetOverlap(testPosition, existing))
      ) {
        bestY = y;
        break;
      } else {
        // Find the next possible position after the blocking widget
        const blockingWidget = result.find((existing) =>
          checkWidgetOverlap(testPosition, existing),
        );
        if (blockingWidget) {
          bestY = Math.max(bestY, blockingWidget.y + blockingWidget.h);
        }
      }
    }

    result.push({ ...widget, y: bestY });
  }

  return result;
}
