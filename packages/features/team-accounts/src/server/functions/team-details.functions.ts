import { createServerFn } from '@tanstack/react-start';

import { authFunctionMiddleware } from '@pymekit/function-middleware/functions';
import { getLogger } from '@pymekit/shared/logger';
import { getSafeRedirectPath } from '@pymekit/shared/utils';
import { getSupabaseServerClient } from '@pymekit/supabase/server-client';

import { UpdateTeamNameSchema } from '../../schema/update-team-name.schema';

export const updateTeamAccountName = createServerFn({ method: 'POST' })
  .middleware(authFunctionMiddleware)
  .validator(UpdateTeamNameSchema)
  .handler(async ({ data: params }) => {
    const client = getSupabaseServerClient();
    const logger = await getLogger();
    const { name, path, slug, newSlug } = params;

    const slugToUpdate = newSlug ?? slug;

    const ctx = {
      name: 'team-accounts.update',
      accountName: name,
    };

    logger.info(ctx, `Updating team name...`);

    // RLS enforces that the caller is allowed to update this account
    const { error, data } = await client
      .from('accounts')
      .update({
        name,
        slug: slugToUpdate,
      })
      .match({
        slug,
      })
      .select('slug')
      .single();

    if (error) {
      // Handle duplicate slug error
      if (error.code === '23505') {
        return {
          success: false,
          error: 'teams.duplicateSlugError',
        };
      }

      logger.error({ ...ctx, error }, `Failed to update team name`);

      throw error;
    }

    const updatedSlug = data.slug;

    logger.info(ctx, `Team name updated`);

    if (updatedSlug && updatedSlug !== slug) {
      // The caller passes a `path` template using the router token `$account`
      // (and the legacy Next token `[account]`); both are replaced with the new
      // slug. The template is client-supplied, so validate it to prevent open
      // redirects. We return the target instead of throwing `redirect()`: this
      // server fn is called from a `useMutation` with an `onError` handler, and
      // a thrown redirect rejects the mutation and surfaces as an error toast.
      // The client navigates on success instead.
      const nextPath = getSafeRedirectPath(
        path.replace('$account', updatedSlug).replace('[account]', updatedSlug),
        '/dashboard',
      );

      return { success: true, redirectTo: nextPath };
    }

    return { success: true };
  });
