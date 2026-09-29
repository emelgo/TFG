import * as z from 'zod';

const TimeFilter = z.object({
  startTime: z.number(),
  endTime: z.number(),
});

const PageFilter = z.object({
  page: z.number(),
  size: z.number(),
});

export const QueryBillingUsageSchema = z.object({
  id: z.string(),
  customerId: z.string(),
  filter: z.union([TimeFilter, PageFilter]),
});
