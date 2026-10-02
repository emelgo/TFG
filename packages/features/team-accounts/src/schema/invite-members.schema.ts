import * as z from 'zod';

/**
 * Maximum number of outstanding (non-expired) invitations allowed per account.
 * Enforced atomically in the `add_invitations_to_account` Postgres function.
 * Keep in sync with the value hardcoded in `07-invitations.sql`.
 */
export const MAX_PENDING_INVITATIONS_PER_ACCOUNT = 50;

/**
 * Maximum number of invitations that can be created per account within
 * `INVITATION_CREATE_RATE_WINDOW_MINUTES`. Throttles bulk invitation-email
 * sending. Enforced atomically in the `add_invitations_to_account` Postgres
 * function. Keep in sync with the value hardcoded in `07-invitations.sql`.
 */
export const INVITATION_CREATE_RATE_LIMIT = 20;

export const INVITATION_CREATE_RATE_WINDOW_MINUTES = 60;

const InviteSchema = z.object({
  // normalize to lowercase so stored invitation emails are canonical and
  // match the lowercase email Supabase Auth issues in the user's JWT
  email: z
    .string()
    .email()
    .transform((email) => email.toLowerCase()),
  role: z.string().min(1).max(100),
});

export const InviteMembersSchema = z
  .object({
    invitations: InviteSchema.array().min(1).max(5),
  })
  .refine(
    (data) => {
      const emails = data.invitations.map((member) =>
        member.email.toLowerCase(),
      );

      const uniqueEmails = new Set(emails);

      return emails.length === uniqueEmails.size;
    },
    {
      message: 'teams.duplicateInviteEmailError',
      path: ['invitations'],
    },
  );
