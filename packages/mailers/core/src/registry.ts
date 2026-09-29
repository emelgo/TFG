import { Mailer } from '@pymekit/mailers-shared';
import { createRegistry } from '@pymekit/shared/registry';

import type { MailerProvider } from './provider-enum';

const mailerRegistry = createRegistry<Mailer, MailerProvider>();

mailerRegistry.register('nodemailer', async () => {
  // Nodemailer relies on Node built-ins, so it must only load server-side. In
  // the TanStack Start (Vite/Nitro) runtime there is no `NEXT_RUNTIME`; a
  // missing `window` is the portable "am I on the server?" signal.
  if (typeof window === 'undefined') {
    const { createNodemailerService } = await import('@pymekit/nodemailer');

    return createNodemailerService();
  } else {
    throw new Error(
      'Nodemailer is not available in the browser. Please use another mailer.',
    );
  }
});

mailerRegistry.register('resend', async () => {
  const { createResendMailer } = await import('@pymekit/resend');

  return createResendMailer();
});

export { mailerRegistry };
