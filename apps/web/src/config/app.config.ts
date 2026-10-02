import * as z from 'zod';

const production = import.meta.env.PROD;

const AppConfigSchema = z
  .object({
    name: z
      .string({ error: `Please provide the variable VITE_PRODUCT_NAME` })
      .min(1),
    title: z
      .string({ error: `Please provide the variable VITE_SITE_TITLE` })
      .min(1),
    description: z.string({
      error: `Please provide the variable VITE_SITE_DESCRIPTION`,
    }),
    url: z.url({
      message: `Please provide the variable VITE_SITE_URL with a valid URL, such as: 'https://example.com'`,
    }),
    locale: z
      .string({ error: `Please provide the variable VITE_DEFAULT_LOCALE` })
      .default('es'),
    theme: z.enum(['light', 'dark', 'system']),
    production: z.boolean(),
    themeColor: z.string(),
    themeColorDark: z.string(),
    appHomePath: z
      .string({ error: `Please provide the variable VITE_APP_HOME_PATH` })
      .startsWith('/', 'Path must start with /')
      .min(1)
      .optional()
      .default('/dashboard'),
  })
  .refine(
    (schema) => {
      const isCI = import.meta.env.VITE_CI === 'true';

      if (isCI || !schema.production) {
        return true;
      }

      return !schema.url.startsWith('http:');
    },
    {
      message: `Please provide a valid HTTPS URL. Set the variable VITE_SITE_URL with a valid URL, such as: 'https://example.com'`,
      path: ['url'],
    },
  )
  .refine((schema) => schema.themeColor !== schema.themeColorDark, {
    message: `Please provide different theme colors for light and dark themes.`,
    path: ['themeColor'],
  });

const appConfig = AppConfigSchema.parse({
  name: import.meta.env.VITE_PRODUCT_NAME,
  title: import.meta.env.VITE_SITE_TITLE,
  description: import.meta.env.VITE_SITE_DESCRIPTION,
  url: import.meta.env.VITE_SITE_URL,
  locale: import.meta.env.VITE_DEFAULT_LOCALE,
  theme: import.meta.env.VITE_DEFAULT_THEME_MODE,
  themeColor: import.meta.env.VITE_THEME_COLOR,
  themeColorDark: import.meta.env.VITE_THEME_COLOR_DARK,
  appHomePath: import.meta.env.VITE_APP_HOME_PATH,
  production,
});

export default appConfig;
