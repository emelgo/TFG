import * as z from 'zod';

const PathsSchema = z.object({
  auth: z.object({
    signIn: z.string().min(1),
    signUp: z.string().min(1),
    verifyMfa: z.string().min(1),
    callback: z.string().min(1),
    passwordReset: z.string().min(1),
    passwordUpdate: z.string().min(1),
  }),
  app: z.object({
    home: z.string().min(1),
    joinTeam: z.string().min(1),
    createTeam: z.string().min(1),
    // Slug-free settings section: the active account (personal or team) is
    // resolved from the DB, so these paths are stable across workspaces.
    settings: z.string().min(1),
    settingsProfile: z.string().min(1),
    settingsMembers: z.string().min(1),
    settingsBilling: z.string().min(1),
    settingsBillingReturn: z.string().min(1),
  }),
});

const pathsConfig = PathsSchema.parse({
  auth: {
    signIn: '/auth/sign-in',
    signUp: '/auth/sign-up',
    verifyMfa: '/auth/verify',
    callback: '/auth/callback',
    passwordReset: '/auth/password-reset',
    passwordUpdate: '/update-password',
  },
  app: {
    // `home` is the post-login landing (the dashboard). Kept as `home` since it
    // is the canonical "app home" referenced by every auth redirect.
    home: '/dashboard',
    joinTeam: '/join',
    createTeam: '/create-team',
    // Top-level, slug-free settings section: the active account (personal or
    // team) is resolved from the DB, so these paths are stable across
    // workspaces.
    settings: '/settings',
    // User-scoped personal profile. Unlike the other settings paths (which
    // reflect the active account), this always renders the signed-in user's own
    // profile, so it stays reachable even when a team is the active account
    // (e.g. organizations-only mode).
    settingsProfile: '/settings/profile',
    settingsMembers: '/settings/members',
    settingsBilling: '/settings/billing',
    settingsBillingReturn: '/settings/billing/return',
  },
} satisfies z.output<typeof PathsSchema>);

export default pathsConfig;
