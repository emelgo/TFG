import * as z from 'zod';

export const ContactEmailSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.email(),
  message: z.string().min(1).max(5000),
  captchaToken: z.string().optional(),
});

export type ContactEmail = z.infer<typeof ContactEmailSchema>;
