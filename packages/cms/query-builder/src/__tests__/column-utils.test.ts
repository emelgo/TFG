import { describe, expect, it } from 'vitest';

import {
  getAggregationTypeFromColumn,
  isAggregationColumn,
  isTimeBucketColumn,
} from '../utils/column-utils';

describe('Column Utils', () => {
  describe('isAggregationColumn', () => {
    describe('exact matches', () => {
      const exactMatches = [
        'value', // Common metric alias
        'count',
        'sum',
        'avg',
        'average',
        'min',
        'max',
      ];

      exactMatches.forEach((columnName) => {
        it(`should identify "${columnName}" as aggregation column`, () => {
          expect(isAggregationColumn(columnName)).toBe(true);
        });

        it(`should identify "${columnName.toUpperCase()}" as aggregation column (case insensitive)`, () => {
          expect(isAggregationColumn(columnName.toUpperCase())).toBe(true);
        });
      });
    });

    describe('prefix matches', () => {
      const prefixTests = [
        ['count_users', true],
        ['count_orders', true],
        ['sum_revenue', true],
        ['sum_sales', true],
        ['avg_rating', true],
        ['avg_score', true],
        ['min_price', true],
        ['min_date', true],
        ['max_value', true],
        ['max_timestamp', true],
      ];

      prefixTests.forEach(([columnName, expected]) => {
        it(`should ${expected ? 'identify' : 'not identify'} "${columnName}" as aggregation column`, () => {
          expect(isAggregationColumn(columnName as string)).toBe(expected);
        });
      });
    });

    describe('contains matches', () => {
      const containsTests = [
        ['total_count', true],
        ['user_count', true],
        ['revenue_sum', true],
        ['rating_avg', true],
        ['rating_average', true],
        ['price_min', true],
        ['value_max', true],
        ['total count', true], // Space acts as word boundary
        ['item count', true], // Space acts as word boundary
      ];

      containsTests.forEach(([columnName, expected]) => {
        it(`should ${expected ? 'identify' : 'not identify'} "${columnName}" as aggregation column`, () => {
          expect(isAggregationColumn(columnName as string)).toBe(expected);
        });
      });
    });

    describe('non-aggregation columns', () => {
      const nonAggregationColumns = [
        'id',
        'name',
        'email',
        'created_at',
        'updated_at',
        'user_id',
        'order_id',
        'description',
        'title',
        'status',
        'type',
        'category',
        'price', // Just 'price' without aggregation context
        'date', // Just 'date' without aggregation context
        'account', // Contains 'count' but not in aggregation context
        'discount', // Contains 'count' but not in aggregation context
        'encounter', // Contains 'count' but not in aggregation context
        'item_count_today', // Contains 'count' but not as a standalone word
      ];

      nonAggregationColumns.forEach((columnName) => {
        it(`should not identify "${columnName}" as aggregation column`, () => {
          expect(isAggregationColumn(columnName)).toBe(false);
        });
      });
    });

    describe('edge cases', () => {
      it('should handle empty string', () => {
        expect(isAggregationColumn('')).toBe(false);
      });

      it('should handle single characters', () => {
        expect(isAggregationColumn('a')).toBe(false);
        expect(isAggregationColumn('1')).toBe(false);
      });

      it('should handle special characters', () => {
        expect(isAggregationColumn('count_')).toBe(true);
        expect(isAggregationColumn('_count')).toBe(true);
        expect(isAggregationColumn('count-users')).toBe(true);
        expect(isAggregationColumn('count.users')).toBe(true);
      });
    });
  });

  describe('getAggregationTypeFromColumn', () => {
    describe('exact matches', () => {
      const exactMatches = [
        ['count', 'count'],
        ['sum', 'sum'],
        ['avg', 'avg'],
        ['average', 'avg'],
        ['min', 'min'],
        ['max', 'max'],
        ['value', 'value'],
      ];

      exactMatches.forEach(([columnName, expectedType]) => {
        it(`should extract "${expectedType}" from "${columnName}"`, () => {
          expect(getAggregationTypeFromColumn(columnName as string)).toBe(
            expectedType,
          );
        });

        it(`should extract "${expectedType}" from "${(columnName as string).toUpperCase()}" (case insensitive)`, () => {
          expect(
            getAggregationTypeFromColumn((columnName as string).toUpperCase()),
          ).toBe(expectedType);
        });
      });
    });

    describe('prefix matches', () => {
      const prefixTests = [
        ['count_users', 'count'],
        ['sum_revenue', 'sum'],
        ['avg_rating', 'avg'],
        ['min_price', 'min'],
        ['max_value', 'max'],
      ];

      prefixTests.forEach(([columnName, expectedType]) => {
        it(`should extract "${expectedType}" from "${columnName}"`, () => {
          expect(getAggregationTypeFromColumn(columnName as string)).toBe(
            expectedType,
          );
        });
      });
    });

    describe('contains matches', () => {
      const containsTests = [
        ['total_count', 'count'],
        ['revenue_sum', 'sum'],
        ['rating_avg', 'avg'],
        ['rating_average', 'avg'],
        ['price_min', 'min'],
        ['value_max', 'max'],
        ['total count', 'count'], // Space acts as word boundary
        ['item count', 'count'], // Space acts as word boundary
      ];

      containsTests.forEach(([columnName, expectedType]) => {
        it(`should extract "${expectedType}" from "${columnName}"`, () => {
          expect(getAggregationTypeFromColumn(columnName as string)).toBe(
            expectedType,
          );
        });
      });
    });

    describe('non-aggregation columns', () => {
      const nonAggregationColumns = [
        'id',
        'name',
        'email',
        'user_id',
        'description',
        'account', // Contains 'count' but not in aggregation context
        'discount', // Contains 'count' but not in aggregation context
        'item_count_today', // Contains 'count' but not as a standalone word
      ];

      nonAggregationColumns.forEach((columnName) => {
        it(`should return null for "${columnName}"`, () => {
          expect(getAggregationTypeFromColumn(columnName)).toBe(null);
        });
      });
    });

    describe('precedence testing', () => {
      it('should prioritize exact matches over contains matches', () => {
        expect(getAggregationTypeFromColumn('count')).toBe('count');
        expect(getAggregationTypeFromColumn('sum')).toBe('sum');
      });

      it('should prioritize prefix matches over contains matches', () => {
        expect(getAggregationTypeFromColumn('count_with_sum')).toBe('count'); // Prefix wins
        expect(getAggregationTypeFromColumn('sum_with_count')).toBe('sum'); // Prefix wins
      });
    });
  });

  describe('isTimeBucketColumn', () => {
    describe('exact matches', () => {
      const exactMatches = [
        'bucket',
        'time_bucket',
        'date_trunc',
        'date_bucket',
        'period',
        'interval',
      ];

      exactMatches.forEach((columnName) => {
        it(`should identify "${columnName}" as time bucket column`, () => {
          expect(isTimeBucketColumn(columnName)).toBe(true);
        });

        it(`should identify "${columnName.toUpperCase()}" as time bucket column (case insensitive)`, () => {
          expect(isTimeBucketColumn(columnName.toUpperCase())).toBe(true);
        });
      });
    });

    describe('contains matches', () => {
      const containsTests = [
        ['hourly_bucket', true],
        ['time_bucket_hour', true],
        ['daily_period', true],
        ['week_interval', true],
        ['date_trunc_day', true],
        ['monthly_bucket', true],
        ['bucket_by_hour', true],
      ];

      containsTests.forEach(([columnName, expected]) => {
        it(`should ${expected ? 'identify' : 'not identify'} "${columnName}" as time bucket column`, () => {
          expect(isTimeBucketColumn(columnName as string)).toBe(expected);
        });
      });
    });

    describe('non-time-bucket columns', () => {
      const nonTimeBucketColumns = [
        'id',
        'name',
        'date', // Just 'date' without bucket context
        'time', // Just 'time' without bucket context
        'created_at',
        'timestamp',
        'user_id',
        'count',
        'sum_revenue',
      ];

      nonTimeBucketColumns.forEach((columnName) => {
        it(`should not identify "${columnName}" as time bucket column`, () => {
          expect(isTimeBucketColumn(columnName)).toBe(false);
        });
      });
    });
  });

  describe('integration scenarios', () => {
    describe('typical dashboard query columns', () => {
      const dashboardColumns = [
        {
          name: 'date_trunc',
          isAggregation: false,
          isTimeBucket: true,
          aggregationType: null,
        },
        {
          name: 'count',
          isAggregation: true,
          isTimeBucket: false,
          aggregationType: 'count',
        },
        {
          name: 'sum_revenue',
          isAggregation: true,
          isTimeBucket: false,
          aggregationType: 'sum',
        },
        {
          name: 'avg_rating',
          isAggregation: true,
          isTimeBucket: false,
          aggregationType: 'avg',
        },
        {
          name: 'time_bucket',
          isAggregation: false,
          isTimeBucket: true,
          aggregationType: null,
        },
        {
          name: 'value',
          isAggregation: true,
          isTimeBucket: false,
          aggregationType: 'value',
        },
      ];

      dashboardColumns.forEach(
        ({ name, isAggregation, isTimeBucket, aggregationType }) => {
          it(`should correctly classify "${name}"`, () => {
            expect(isAggregationColumn(name)).toBe(isAggregation);
            expect(isTimeBucketColumn(name)).toBe(isTimeBucket);
            expect(getAggregationTypeFromColumn(name)).toBe(aggregationType);
          });
        },
      );
    });

    describe('time-series aggregation queries', () => {
      const timeSeriesColumns = [
        'date_trunc', // Time bucket
        'bucket', // Time bucket
        'count_orders', // Aggregation
        'sum_revenue', // Aggregation
        'avg_order_value', // Aggregation
      ];

      timeSeriesColumns.forEach((columnName) => {
        it(`should properly classify time-series column "${columnName}"`, () => {
          const isAgg = isAggregationColumn(columnName);
          const isTime = isTimeBucketColumn(columnName);
          const aggType = getAggregationTypeFromColumn(columnName);

          // Should be either aggregation or time bucket (or both in theory)
          expect(isAgg || isTime).toBe(true);

          if (isAgg) {
            expect(aggType).toBeTruthy();
          } else {
            expect(aggType).toBe(null);
          }
        });
      });
    });
  });
});
