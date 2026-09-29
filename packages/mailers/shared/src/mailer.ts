import * as z from 'zod';

import { MailerSchema } from './schema/mailer.schema';

export abstract class Mailer<Res = unknown> {
  abstract sendEmail(data: z.output<typeof MailerSchema>): Promise<Res>;
}
