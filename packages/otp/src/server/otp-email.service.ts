import * as z from 'zod';

import { renderOtpEmail } from '@pymekit/email-templates';
import { getMailer } from '@pymekit/mailers';
import { getLogger } from '@pymekit/shared/logger';

const EMAIL_SENDER = z
  .string({
    error: 'EMAIL_SENDER is required',
  })
  .min(1)
  .parse(process.env.EMAIL_SENDER);

// Falls back to 'Makerkit' so an unset value never crashes the OTP send path
// at module load.
const PRODUCT_NAME = z
  .string()
  .min(1)
  .default('Makerkit')
  .parse(import.meta.env.VITE_PRODUCT_NAME);

/**
 * @name createOtpEmailService
 * @description Creates a new OtpEmailService
 * @returns {OtpEmailService}
 */
export function createOtpEmailService() {
  return new OtpEmailService();
}

/**
 * @name OtpEmailService
 * @description Service for sending OTP emails
 */
class OtpEmailService {
  async sendOtpEmail(params: { email: string; otp: string }) {
    const logger = await getLogger();
    const { email, otp } = params;
    const mailer = await getMailer();

    const { html, subject } = await renderOtpEmail({
      otp,
      productName: PRODUCT_NAME,
    });

    try {
      logger.info({ email }, 'Sending OTP email...');

      await mailer.sendEmail({
        to: email,
        subject,
        html,
        from: EMAIL_SENDER,
      });

      logger.info({ email }, 'OTP email sent');
    } catch (error) {
      logger.error({ email, error }, 'Error sending OTP email');

      throw error;
    }
  }
}
