import * as z from 'zod';

export const UpdatePersonalAccountSchema = z
  .object({
    name: z.string().min(2).max(100).optional(),
    picture_url: z.url().max(1000).nullable().optional(),
    public_data: z.record(z.string(), z.unknown()).optional(),
  })
  .refine(
    (values) => {
      return (
        values.name !== undefined ||
        values.picture_url !== undefined ||
        values.public_data !== undefined
      );
    },
    {
      message: 'At least one field is required',
    },
  );

export type UpdatePersonalAccountPayload = z.infer<
  typeof UpdatePersonalAccountSchema
>;
