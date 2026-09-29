import type { Tables } from '@pymekit/supabase/database';
import type { JWTUserData } from '@pymekit/supabase/types';

export interface UserAccountSummary {
  label: string | null;
  value: string | null;
  image: string | null;
}

export interface UserWorkspaceShape {
  accounts: UserAccountSummary[];
  workspace: Tables<'user_account_workspace'>;
  user: JWTUserData;
  canCreateTeamAccount: {
    allowed: boolean;
    reason: string | undefined;
  };
}
