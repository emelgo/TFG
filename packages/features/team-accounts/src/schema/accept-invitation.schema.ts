import * as z from 'zod';

import { isSafeRedirectPath } from '@pymekit/shared/utils';

export const AcceptInvitationSchema = z.object({
  inviteToken: z.uuid(),
  nextPath: z.string().min(1).refine(isSafeRedirectPath, {
    message: 'Invalid redirect path',
  }),
});
