import * as z from 'zod';

import { SlugSchema, TeamNameSchema } from './create-team.schema';

// All fields optional — the same logic backs both the name form and
// the picture controls — with a refine requiring at least one. Mirrors
// `UpdatePersonalAccountSchema`.
export const UpdateTeamAccountSchema = z
  .object({
    name: TeamNameSchema.optional(),
    // Empty string from the form means "no slug change" — normalize to undefined.
    newSlug: z.preprocess(
      (val) => (val === '' ? undefined : val),
      SlugSchema.optional(),
    ),
    picture_url: z.url().max(1000).nullable().optional(),
  })
  .refine(
    (values) => {
      return (
        values.name !== undefined ||
        values.newSlug !== undefined ||
        values.picture_url !== undefined
      );
    },
    {
      message: 'At least one field is required',
    },
  );

export type UpdateTeamAccountPayload = z.infer<typeof UpdateTeamAccountSchema>;
