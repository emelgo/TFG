export const teamAccountKeys = {
  detail: (slug: string) => ['team-account:detail', slug] as const,
  members: (slug: string) => ['team-account:members', slug] as const,
  invitations: (slug: string) => ['team-account:invitations', slug] as const,
};
