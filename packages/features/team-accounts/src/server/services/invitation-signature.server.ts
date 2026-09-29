import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Invitation-link signatures.
 *
 * The invite_token stored in `public.invitations` is readable by members of the
 * inviting account (RLS / data API). On its own it must therefore NOT be enough
 * to authenticate as the invited identity. We additionally sign the token with a
 * server-only key and require the signature on the accept route, so that only a
 * link that originated from the server (i.e. the one emailed to the invitee) can
 * trigger one-click authentication. A party who can merely read the token from
 * the database cannot forge a valid signature.
 *
 * The signing key is DERIVED from the Supabase secret key rather than using it
 * directly, so the invitation-link purpose is cryptographically separated from
 * the database credential (and HMAC never exposes the underlying key).
 */
const SIGNATURE_PURPOSE = 'makerkit:invitation-link:v1';

const SIGNATURE_REGEX = /^[a-f0-9]{64}$/;

function getSigningKey() {
  const secret = process.env.SUPABASE_SECRET_KEY;

  if (!secret) {
    throw new Error(
      'SUPABASE_SECRET_KEY is not set; cannot sign/verify invitation links',
    );
  }

  // derive a dedicated sub-key so we never use the raw DB credential as a
  // signing key (purpose separation + rotation independence at the call site)
  return createHmac('sha256', secret).update(SIGNATURE_PURPOSE).digest();
}

/**
 * @name signInvitationToken
 * @description Returns the hex HMAC signature for an invitation token. Append it
 * to the accept link as the `sig` query parameter.
 */
export function signInvitationToken(token: string): string {
  return createHmac('sha256', getSigningKey()).update(token).digest('hex');
}

/**
 * @name verifyInvitationToken
 * @description Constant-time verification of an invitation token signature.
 * Returns false for a missing or malformed signature.
 */
export function verifyInvitationToken(
  token: string,
  signature: string | null | undefined,
): boolean {
  if (!signature || !SIGNATURE_REGEX.test(signature)) {
    return false;
  }

  const expected = Buffer.from(signInvitationToken(token), 'hex');
  const provided = Buffer.from(signature, 'hex');

  if (expected.length !== provided.length) {
    return false;
  }

  return timingSafeEqual(expected, provided);
}
