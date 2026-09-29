import * as z from 'zod';

export const SmtpConfigSchema = z.object({
  user: z.string({
    error: `Please provide the variable EMAIL_USER`,
  }),
  pass: z.string({
    error: `Please provide the variable EMAIL_PASSWORD`,
  }),
  host: z.string({
    error: `Please provide the variable EMAIL_HOST`,
  }),
  port: z.number({
    error: `Please provide the variable EMAIL_PORT`,
  }),
  secure: z.boolean({
    error: `Please provide the variable EMAIL_TLS`,
  }),
});
