import type { Database } from '@pymekit/supabase/database';
import type { JWTUserData } from '@pymekit/supabase/types';

export type TeamAccountSummaryRow =
  Database['public']['Views']['user_accounts']['Row'];

export type TeamAccountWorkspaceAccount =
  Database['public']['Functions']['team_account_workspace']['Returns'][number];

export interface TeamAccountWorkspaceShape {
  account: TeamAccountWorkspaceAccount;
  accounts: TeamAccountSummaryRow[];
  user: JWTUserData;
}
