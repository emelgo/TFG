/**
 * Pure trend calculation functions
 *
 * These functions handle the mathematical calculations for trend analysis
 * without any external dependencies, making them easy to test in isolation.
 */

/**
 * Calculate trend percentage and direction from current and previous values
 */
export function calculateTrendPercentage(
  currentValue: number,
  previousValue: number,
): { trendPercentage: number; trendDirection: 'up' | 'down' | 'stable' } {
  let trendPercentage = 0;
  let trendDirection: 'up' | 'down' | 'stable' = 'stable';

  if (previousValue !== 0) {
    // Magnitude, not the signed value: a negative baseline would invert the
    // sign, emitting a loss shrinking from -200 to -100 as a -50% "up".
    trendPercentage =
      ((currentValue - previousValue) / Math.abs(previousValue)) * 100;

    const threshold = 1; // 1% threshold for "stable"

    if (Math.abs(trendPercentage) >= threshold) {
      trendDirection = currentValue > previousValue ? 'up' : 'down';
    }
  } else if (currentValue !== 0) {
    // No defined percentage off a zero baseline; report direction and a
    // nominal 100%. Handles the negative case too, which used to read "stable".
    trendPercentage = 100;
    trendDirection = currentValue > 0 ? 'up' : 'down';
  }

  return { trendPercentage, trendDirection };
}

/**
 * Round a number to specified decimal places
 */
export function roundToDecimalPlaces(value: number, places: number): number {
  const factor = Math.pow(10, places);
  return Math.round(value * factor) / factor;
}

/**
 * Calculate the percentage difference between two values
 */
export function calculatePercentageDifference(
  currentValue: number,
  previousValue: number,
): number {
  if (previousValue === 0) {
    return currentValue > 0 ? 100 : 0;
  }

  return ((currentValue - previousValue) / Math.abs(previousValue)) * 100;
}

/**
 * Determine trend direction based on percentage difference and threshold
 */
export function determineTrendDirection(
  percentageDifference: number,
  threshold: number = 1,
): 'up' | 'down' | 'stable' {
  if (Math.abs(percentageDifference) < threshold) {
    return 'stable';
  }

  return percentageDifference > 0 ? 'up' : 'down';
}
