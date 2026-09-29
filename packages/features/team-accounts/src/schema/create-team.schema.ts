import * as z from 'zod';

/**
 * @name RESERVED_NAMES_ARRAY
 * @description Array of reserved names for team accounts
 * This is a list of names that cannot be used for team accounts as they are reserved for other purposes.
 * Please include any new reserved names here.
 */
const RESERVED_NAMES_ARRAY = [
  'settings',
  'billing',
  // please add more reserved names here
];

const SPECIAL_CHARACTERS_REGEX = /[!@#$%^&*()+=[\]{};':"\\|,.<>/?]/;

/**
 * Regex that detects non-Latin scripts (Korean, Japanese, Chinese, Cyrillic, Arabic, Hebrew, Thai)
 * Does NOT match extended Latin characters like café, naïve, Zürich
 */
export const NON_LATIN_REGEX =
  /[\u0400-\u04FF\u0590-\u05FF\u0600-\u06FF\u0E00-\u0E7F\u1100-\u11FF\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF]/;

/**
 * Regex for valid slugs: lowercase letters, numbers, and hyphens
 * Must start and end with alphanumeric, hyphens only in middle
 */
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * @name containsNonLatinCharacters
 * @description Checks if a string contains non-Latin characters
 */
export function containsNonLatinCharacters(value: string): boolean {
  return NON_LATIN_REGEX.test(value);
}

/**
 * @name SlugSchema
 * @description Schema for validating URL-friendly slugs
 */
export const SlugSchema = z
  .string()
  .min(2, { message: 'teams.slugMinLength' })
  .max(50, { message: 'teams.slugMaxLength' })
  .regex(SLUG_REGEX, {
    message: 'teams.invalidSlugError',
  })
  .refine(
    (slug) => {
      return !RESERVED_NAMES_ARRAY.includes(slug.toLowerCase());
    },
    {
      message: 'teams.reservedNameError',
    },
  );

/**
 * @name TeamNameSchema
 * @description Schema for team name - allows non-Latin characters
 */
export const TeamNameSchema = z
  .string()
  .min(2, { message: 'teams.teamNameMinLength' })
  .max(50, { message: 'teams.teamNameMaxLength' })
  .refine(
    (name) => {
      return !SPECIAL_CHARACTERS_REGEX.test(name);
    },
    {
      message: 'teams.specialCharactersError',
    },
  )
  .refine(
    (name) => {
      return !RESERVED_NAMES_ARRAY.includes(name.toLowerCase());
    },
    {
      message: 'teams.reservedNameError',
    },
  );

/**
 * @name CreateTeamSchema
 * @description Schema for creating a team account
 * When the name contains non-Latin characters, a slug is required
 */
export const CreateTeamSchema = z
  .object({
    name: TeamNameSchema,
    // Transform empty strings to undefined before validation
    slug: z
      .string()
      .optional()
      .transform((val) => (val === '' ? undefined : val))
      .pipe(SlugSchema.optional()),
  })
  .refine(
    (data) => {
      if (containsNonLatinCharacters(data.name)) {
        return !!data.slug;
      }

      return true;
    },
    {
      message: 'teams.slugRequiredForNonLatinName',
      path: ['slug'],
    },
  );
