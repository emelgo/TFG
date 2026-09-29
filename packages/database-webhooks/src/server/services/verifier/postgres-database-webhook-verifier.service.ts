import * as z from 'zod';

import { DatabaseWebhookVerifierService } from './database-webhook-verifier.service';

import { timingSafeEqual } from 'node:crypto';

const webhooksSecret = z
  .string({
    error: `Provide the variable SUPABASE_DB_WEBHOOK_SECRET. This is used to authenticate the webhook event from Supabase.`,
  })
  .min(1)
  .parse(process.env.SUPABASE_DB_WEBHOOK_SECRET);

export function createDatabaseWebhookVerifierService() {
  return new PostgresDatabaseWebhookVerifierService();
}

class PostgresDatabaseWebhookVerifierService implements DatabaseWebhookVerifierService {
  verifySignatureOrThrow(signature: string) {
    if (!constantTimeEqual(signature, webhooksSecret)) {
      throw new Error('Invalid signature');
    }

    return Promise.resolve(true);
  }
}

function constantTimeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}
