import { redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';

import { adminFunctionMiddleware } from '@pymekit/function-middleware/functions';
import { getLogger } from '@pymekit/shared/logger';
import { getSupabaseServerAdminClient } from '@pymekit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@pymekit/supabase/server-client';

import {
  BanUserSchema,
  DeleteAccountSchema,
  DeleteUserSchema,
  ImpersonateUserSchema,
  ReactivateUserSchema,
} from './schema/admin-actions.schema';
import { CreateUserSchema } from './schema/create-user.schema';
import { ResetPasswordSchema } from './schema/reset-password.schema';
import { createAdminAccountsService } from './services/admin-accounts.service';
import { createAdminAuthUserService } from './services/admin-auth-user.service';

/**
 * @name banUserFunction
 * @description Ban a user from the system. Gated on `is_superadmin` by the
 * `adminFunctionMiddleware`.
 */
export const banUserFunction = createServerFn({ method: 'POST' })
  .middleware(adminFunctionMiddleware)
  .validator(BanUserSchema)
  .handler(async ({ data: { userId } }) => {
    const service = getAdminAuthService();
    const logger = await getLogger();

    logger.info({ userId }, `Super Admin is banning user...`);

    const { error } = await service.banUser(userId);

    if (error) {
      logger.error({ error }, `Error banning user`);
      throw new Error('Error banning user');
    }

    logger.info({ userId }, `Super Admin has successfully banned user`);

    return { success: true as const };
  });

/**
 * @name reactivateUserFunction
 * @description Reactivate a user in the system.
 */
export const reactivateUserFunction = createServerFn({ method: 'POST' })
  .middleware(adminFunctionMiddleware)
  .validator(ReactivateUserSchema)
  .handler(async ({ data: { userId } }) => {
    const service = getAdminAuthService();
    const logger = await getLogger();

    logger.info({ userId }, `Super Admin is reactivating user...`);

    const { error } = await service.reactivateUser(userId);

    if (error) {
      logger.error({ error }, `Error reactivating user`);
      throw new Error('Error reactivating user');
    }

    logger.info({ userId }, `Super Admin has successfully reactivated user`);

    return { success: true as const };
  });

/**
 * @name impersonateUserFunction
 * @description Impersonate a user in the system. Returns the impersonation
 * access/refresh tokens for the client to set the session.
 */
export const impersonateUserFunction = createServerFn({ method: 'POST' })
  .middleware(adminFunctionMiddleware)
  .validator(ImpersonateUserSchema)
  .handler(async ({ data: { userId } }) => {
    const service = getAdminAuthService();
    const logger = await getLogger();

    logger.info({ userId }, `Super Admin is impersonating user...`);

    return await service.impersonateUser(userId);
  });

/**
 * @name deleteUserFunction
 * @description Delete a user from the system, then redirect to the accounts
 * list. The thrown redirect is handled automatically by `useServerFn`.
 */
export const deleteUserFunction = createServerFn({ method: 'POST' })
  .middleware(adminFunctionMiddleware)
  .validator(DeleteUserSchema)
  .handler(async ({ data: { userId } }) => {
    const service = getAdminAuthService();
    const logger = await getLogger();

    logger.info({ userId }, `Super Admin is deleting user...`);

    await service.deleteUser(userId);

    logger.info({ userId }, `Super Admin has successfully deleted user`);

    throw redirect({ to: '/admin/accounts' });
  });

/**
 * @name deleteAccountFunction
 * @description Delete a team account from the system, then redirect to the
 * accounts list.
 */
export const deleteAccountFunction = createServerFn({ method: 'POST' })
  .middleware(adminFunctionMiddleware)
  .validator(DeleteAccountSchema)
  .handler(async ({ data: { accountId } }) => {
    const service = getAdminAccountsService();
    const logger = await getLogger();

    logger.info({ accountId }, `Super Admin is deleting account...`);

    await service.deleteAccount(accountId);

    logger.info({ accountId }, `Super Admin has successfully deleted account`);

    throw redirect({ to: '/admin/accounts' });
  });

/**
 * @name createUserFunction
 * @description Create a new user in the system.
 */
export const createUserFunction = createServerFn({ method: 'POST' })
  .middleware(adminFunctionMiddleware)
  .validator(CreateUserSchema)
  .handler(async ({ data: { email, password, emailConfirm } }) => {
    const adminClient = getSupabaseServerAdminClient();
    const logger = await getLogger();

    logger.info({ email }, `Super Admin is creating a new user...`);

    const { data, error } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: emailConfirm,
    });

    if (error) {
      logger.error({ error }, `Error creating user`);
      throw new Error(`Error creating user: ${error.message}`);
    }

    logger.info(
      { userId: data.user.id },
      `Super Admin has successfully created a new user`,
    );

    return { success: true as const, userId: data.user.id };
  });

/**
 * @name resetPasswordFunction
 * @description Reset a user's password by sending a password reset email.
 */
export const resetPasswordFunction = createServerFn({ method: 'POST' })
  .middleware(adminFunctionMiddleware)
  .validator(ResetPasswordSchema)
  .handler(async ({ data: { userId } }) => {
    const service = getAdminAuthService();
    const logger = await getLogger();

    logger.info({ userId }, `Super Admin is resetting user password...`);

    const result = await service.resetPassword(userId);

    logger.info(
      { userId },
      `Super Admin has successfully sent password reset email`,
    );

    return result;
  });

function getAdminAuthService() {
  const client = getSupabaseServerClient();
  const adminClient = getSupabaseServerAdminClient();

  return createAdminAuthUserService(client, adminClient);
}

function getAdminAccountsService() {
  const client = getSupabaseServerClient();
  const adminClient = getSupabaseServerAdminClient();

  return createAdminAccountsService(adminClient, client);
}
