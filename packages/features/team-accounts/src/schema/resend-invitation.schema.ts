import * as z from 'zod';

export const INVITATION_RESEND_COOLDOWN_MINUTES = 15;

export const MAX_INVITATION_RESENDS = 5;

export const ResendInvitationSchema = z.object({
  invitationId: z.number().int().positive(),
});

export function getCanResendInvitation(invitation: {
  expires_at: string;
  last_send_attempt_at: string | null;
  resend_count: number;
}) {
  if (new Date(invitation.expires_at) <= new Date()) {
    return false;
  }

  if (invitation.resend_count >= MAX_INVITATION_RESENDS) {
    return false;
  }

  if (!invitation.last_send_attempt_at) {
    return true;
  }

  const cooldownMs = INVITATION_RESEND_COOLDOWN_MINUTES * 60 * 1000;
  const lastAttemptAt = new Date(invitation.last_send_attempt_at).getTime();

  return Date.now() - lastAttemptAt >= cooldownMs;
}
