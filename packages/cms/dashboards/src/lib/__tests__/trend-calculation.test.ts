import { describe, expect, it } from 'vitest';

import {
  calculatePercentageDifference,
  calculateTrendPercentage,
  determineTrendDirection,
  roundToDecimalPlaces,
} from '../trend-calculation';

describe('Trend Calculation', () => {
  describe('calculateTrendPercentage', () => {
    it('should calculate positive trend correctly', () => {
      const result = calculateTrendPercentage(120, 100);

      expect(result).toEqual({
        trendPercentage: 20,
        trendDirection: 'up',
      });
    });

    it('should calculate negative trend correctly', () => {
      const result = calculateTrendPercentage(80, 100);

      expect(result).toEqual({
        trendPercentage: -20,
        trendDirection: 'down',
      });
    });

    it('should handle stable trend within threshold', () => {
      const result = calculateTrendPercentage(100.5, 100);

      expect(result).toEqual({
        trendPercentage: 0.5,
        trendDirection: 'stable',
      });
    });

    it('should handle zero previous value', () => {
      const result = calculateTrendPercentage(50, 0);

      expect(result).toEqual({
        trendPercentage: 100,
        trendDirection: 'up',
      });
    });

    it('should handle zero current and previous values', () => {
      const result = calculateTrendPercentage(0, 0);

      expect(result).toEqual({
        trendPercentage: 0,
        trendDirection: 'stable',
      });
    });

    it('should handle edge case near threshold', () => {
      // Just above 1% threshold
      const result1 = calculateTrendPercentage(101.1, 100);
      expect(result1.trendDirection).toBe('up');

      // Just below 1% threshold
      const result2 = calculateTrendPercentage(100.9, 100);
      expect(result2.trendDirection).toBe('stable');
    });

    it('should handle large numbers correctly', () => {
      const result = calculateTrendPercentage(1000000, 500000);

      expect(result).toEqual({
        trendPercentage: 100,
        trendDirection: 'up',
      });
    });

    it('should handle decimal values correctly', () => {
      const result = calculateTrendPercentage(12.5, 10.3);

      expect(result.trendPercentage).toBeCloseTo(21.36, 2);
      expect(result.trendDirection).toBe('up');
    });

    it('should handle negative current value', () => {
      const result = calculateTrendPercentage(-10, 5);

      expect(result).toEqual({
        trendPercentage: -300,
        trendDirection: 'down',
      });
    });

    // |previous| as the denominator, so the sign always agrees with direction.
    it('should handle negative previous value', () => {
      const result = calculateTrendPercentage(10, -5);

      expect(result).toEqual({
        trendPercentage: 300, // (10 - (-5)) / |-5| * 100
        trendDirection: 'up',
      });
    });

    it('reports a shrinking loss as up', () => {
      const result = calculateTrendPercentage(-100, -200);

      expect(result).toEqual({
        trendPercentage: 50, // (-100 - (-200)) / |-200| * 100
        trendDirection: 'up',
      });
    });

    it('reports a fall from zero into loss as down', () => {
      const result = calculateTrendPercentage(-5000, 0);

      expect(result).toEqual({
        trendPercentage: 100,
        trendDirection: 'down',
      });
    });
  });

  describe('calculatePercentageDifference', () => {
    it('should calculate positive percentage difference', () => {
      const result = calculatePercentageDifference(120, 100);
      expect(result).toBe(20);
    });

    it('should calculate negative percentage difference', () => {
      const result = calculatePercentageDifference(80, 100);
      expect(result).toBe(-20);
    });

    it('should handle zero previous value', () => {
      const result = calculatePercentageDifference(50, 0);
      expect(result).toBe(100);
    });

    it('should handle zero current value with non-zero previous', () => {
      const result = calculatePercentageDifference(0, 50);
      expect(result).toBe(-100);
    });

    it('should handle both values being zero', () => {
      const result = calculatePercentageDifference(0, 0);
      expect(result).toBe(0);
    });

    it('should handle negative previous value correctly', () => {
      const result = calculatePercentageDifference(10, -5);
      expect(result).toBe(300); // (10 - (-5)) / |(-5)| * 100 = 15/5 * 100 = 300
    });

    it('should handle very small numbers', () => {
      const result = calculatePercentageDifference(0.002, 0.001);
      expect(result).toBe(100);
    });
  });

  describe('determineTrendDirection', () => {
    it('should return up for positive percentage above threshold', () => {
      const result = determineTrendDirection(5, 1);
      expect(result).toBe('up');
    });

    it('should return down for negative percentage below threshold', () => {
      const result = determineTrendDirection(-5, 1);
      expect(result).toBe('down');
    });

    it('should return stable for percentage within threshold', () => {
      const result1 = determineTrendDirection(0.5, 1);
      expect(result1).toBe('stable');

      const result2 = determineTrendDirection(-0.8, 1);
      expect(result2).toBe('stable');
    });

    it('should handle exact threshold values', () => {
      const result1 = determineTrendDirection(1, 1);
      expect(result1).toBe('up');

      const result2 = determineTrendDirection(-1, 1);
      expect(result2).toBe('down');
    });

    it('should use custom threshold', () => {
      const result1 = determineTrendDirection(2, 5);
      expect(result1).toBe('stable');

      const result2 = determineTrendDirection(6, 5);
      expect(result2).toBe('up');
    });

    it('should handle zero percentage', () => {
      const result = determineTrendDirection(0, 1);
      expect(result).toBe('stable');
    });
  });

  describe('roundToDecimalPlaces', () => {
    it('should round to 2 decimal places', () => {
      expect(roundToDecimalPlaces(3.14159, 2)).toBe(3.14);
      expect(roundToDecimalPlaces(3.146, 2)).toBe(3.15);
    });

    it('should round to 0 decimal places', () => {
      expect(roundToDecimalPlaces(3.7, 0)).toBe(4);
      expect(roundToDecimalPlaces(3.4, 0)).toBe(3);
    });

    it('should handle integers', () => {
      expect(roundToDecimalPlaces(5, 2)).toBe(5);
    });

    it('should handle negative numbers', () => {
      expect(roundToDecimalPlaces(-3.14159, 2)).toBe(-3.14);
      expect(roundToDecimalPlaces(-3.146, 2)).toBe(-3.15);
    });

    it('should handle edge cases', () => {
      expect(roundToDecimalPlaces(0, 2)).toBe(0);
      expect(roundToDecimalPlaces(0.1 + 0.2, 2)).toBe(0.3); // Floating point precision issue
    });

    it('should handle rounding to many decimal places', () => {
      expect(roundToDecimalPlaces(1.23456789, 5)).toBe(1.23457);
    });
  });

  describe('Integration Tests', () => {
    it('should handle real-world trend calculation scenario', () => {
      const currentUsers = 1547;
      const previousUsers = 1203;

      const result = calculateTrendPercentage(currentUsers, previousUsers);

      expect(result.trendDirection).toBe('up');
      expect(result.trendPercentage).toBeCloseTo(28.59, 1);
    });

    it('should handle declining metrics correctly', () => {
      const currentRevenue = 45230.5;
      const previousRevenue = 52100.25;

      const result = calculateTrendPercentage(currentRevenue, previousRevenue);

      expect(result.trendDirection).toBe('down');
      expect(result.trendPercentage).toBeCloseTo(-13.18, 1);
    });

    it('should handle very small changes as stable', () => {
      const currentClicks = 10005;
      const previousClicks = 10000;

      const result = calculateTrendPercentage(currentClicks, previousClicks);

      expect(result.trendDirection).toBe('stable');
      expect(result.trendPercentage).toBe(0.05);
    });

    it('should handle launching from zero (new metric)', () => {
      const currentSignups = 25;
      const previousSignups = 0;

      const result = calculateTrendPercentage(currentSignups, previousSignups);

      expect(result.trendDirection).toBe('up');
      expect(result.trendPercentage).toBe(100);
    });
  });
});
