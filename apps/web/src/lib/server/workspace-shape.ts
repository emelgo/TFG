import type { Database } from '@pymekit/supabase/database';
import type { JWTUserData } from '@pymekit/supabase/types';

/**
 * The active account (personal or team) resolved from the DB-backed active
 * account pointer. Superset shape returned by the `active_account_workspace`
 * function — it carries `is_personal_account` plus the team-only role /
 * permission fields (null / empty for personal accounts).
 */
export type ActiveAccount =
  Database['public']['Functions']['active_account_workspace']['Returns'][number];

/**
 * A team the user belongs to, used to populate the workspace switcher.
 */
export type WorkspaceAccountSummary =
  Database['public']['Views']['user_accounts']['Row'];

/**
 * Workspace data flowed to the authenticated shell: the active account, the
 * teams the user can switch to, and the current user.
 */
export interface WorkspaceShape {
  account: ActiveAccount;
  accounts: WorkspaceAccountSummary[];
  user: JWTUserData;
}
