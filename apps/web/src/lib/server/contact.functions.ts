import { createServerFn } from '@tanstack/react-start';
import * as z from 'zod';

import { verifyCaptchaToken } from '@pymekit/auth/captcha/server';
import { errorMiddleware } from '@pymekit/function-middleware/server';
import { getMailer } from '@pymekit/mailers';

import { ContactEmailSchema } from '#/lib/contact/contact-email.schema.ts';

// Neutralize HTML injection: the submitter controls `name`/`email`/`message`,
// which are interpolated into the email body sent to the site owner.
function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Public server fn for the marketing contact form. Sends the submission to the
 * configured `CONTACT_EMAIL` via the active mailer. Env vars are resolved at
 * call time (not module load) so a missing value surfaces as a request error
 * instead of crashing SSR.
 */
export const sendContactEmail = createServerFn({ method: 'POST' })
  // Normalize failures so raw mailer/captcha errors are not serialized to the
  // browser.
  .middleware([errorMiddleware])
  .validator(ContactEmailSchema)
  .handler(async ({ data }) => {
    // When a CAPTCHA is configured, verify the token before dispatching an
    // email. This gates the public endpoint against automated abuse
    // (inbox-flooding / mailer-cost amplification). No-op when unconfigured.
    if (process.env.CAPTCHA_SECRET_TOKEN) {
      await verifyCaptchaToken(data.captchaToken ?? '');
    }

    const contactEmail = z
      .string({
        error:
          'Contact email is required. Please set the CONTACT_EMAIL environment variable.',
      })
      .parse(process.env.CONTACT_EMAIL);

    const emailFrom = z
      .string({
        error:
          'Sender email is required. Please set the EMAIL_SENDER environment variable.',
      })
      .parse(process.env.EMAIL_SENDER);

    const mailer = await getMailer();

    await mailer.sendEmail({
      to: contactEmail,
      from: emailFrom,
      subject: 'Contact Form Submission',
      html: `
        <p>You have received a new contact form submission.</p>
        <p>Name: ${escapeHtml(data.name)}</p>
        <p>Email: ${escapeHtml(data.email)}</p>
        <p>Message: ${escapeHtml(data.message)}</p>
      `,
    });

    return { success: true as const };
  });
