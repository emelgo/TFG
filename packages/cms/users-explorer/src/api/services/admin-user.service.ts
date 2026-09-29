import { sql } from 'drizzle-orm';
import { Context } from 'hono';

import { getSupabaseAdminClient } from '@pymekit/cms-supabase/hono';
import { getLogger } from '@pymekit/shared/logger';

import { createAuthUsersService } from './auth-users.service';

/**
 * @name createAdminUserService
 * @description Creates a service for admin operations on users
 * @param context - The Hono context
 */
export function createAdminUserService(context: Context) {
  return new AdminUserService(context);
}

/**
 * @name AdminUserService
 * @description Service for admin operations on users
 */
class AdminUserService {
  private readonly userService: ReturnType<typeof createAuthUsersService>;
  private readonly context: Context;

  constructor(context: Context) {
    this.context = context;
    this.userService = createAuthUsersService(context);
  }

  /**
   * @name inviteUser
   * @description Invite a new user to the platform
   * @param user - The user to invite
   */
  async inviteUser(user: { email: string }) {
    const logger = await getLogger();

    logger.info({ user }, 'Inviting user...');

    const canInviteUser = await this.userService.canInsertAuthUser();

    if (!canInviteUser) {
      logger.error({ user }, 'User does not have permission to invite users');

      throw new Error('You do not have permission to invite users');
    }

    const client = this.getAdminClient();

    try {
      const { error } = await client.auth.admin.inviteUserByEmail(user.email);

      if (error) {
        logger.error({ user, error }, 'Failed to invite user');

        throw new Error(`Failed to invite user: ${error.message}`);
      }

      logger.info({ user }, 'User invited successfully');

      await this.recordAudit('invite_auth_user', user.email, {
        email: user.email,
      });

      return { success: true };
    } catch (error) {
      logger.error({ user, error }, 'Error inviting user');

      throw error;
    }
  }

  /**
   * @name createUser
   * @description Create a new user
   * @param user - The user to create
   */
  async createUser(user: {
    email: string;
    password: string;
    autoConfirm: boolean;
  }) {
    const logger = await getLogger();

    logger.info({ user }, 'Creating user...');

    const canCreateUser = await this.userService.canInsertAuthUser();

    if (!canCreateUser) {
      logger.error({ user }, 'User does not have permission to create users');

      throw new Error('You do not have permission to create users');
    }

    const client = this.getAdminClient();

    try {
      const { error } = await client.auth.admin.createUser({
        email: user.email,
        password: user.password,
        email_confirm: user.autoConfirm,
      });

      if (error) {
        logger.error({ user, error }, 'Failed to create user');

        throw new Error(`Failed to create user: ${error.message}`);
      }

      logger.info({ user }, 'User created successfully');

      await this.recordAudit('create_auth_user', user.email, {
        email: user.email,
        auto_confirm: user.autoConfirm,
      });

      return {
        success: true,
      };
    } catch (error) {
      logger.error({ user, error }, 'Error creating user');

      throw error;
    }
  }

  /**
   * @name banUser
   * @description Ban a user by setting their banned_until date to 100 years in the future
   * @param userId - The ID of the user to ban
   */
  async banUser(userId: string) {
    const result = await this.banUsers([userId]);
    return result;
  }

  /**
   * @name banUsers
   * @description Ban multiple users by setting their banned_until date to 100 years in the future
   * @param userIds - The IDs of the users to ban
   */
  async banUsers(userIds: string[]) {
    return this._banUsers(userIds);
  }

  /**
   * @name unbanUser
   * @description Unban a user by setting their banned_until date to null
   * @param userId - The ID of the user to unban
   */
  async unbanUser(userId: string) {
    const result = await this.unbanUsers([userId]);
    return result;
  }

  /**
   * @name unbanUsers
   * @description Unban multiple users by setting their banned_until date to null
   * @param userIds - The IDs of the users to unban
   */
  async unbanUsers(userIds: string[]) {
    return this._unbanUsers(userIds);
  }

  /**
   * @name resetPassword
   * @description Send a password reset email to the user
   * @param userId - The ID of the user
   */
  async resetPassword(userId: string) {
    const result = await this.resetPasswords([userId]);
    return result;
  }

  /**
   * @name resetPasswords
   * @description Send password reset emails to multiple users
   * @param userIds - The IDs of the users
   */
  async resetPasswords(userIds: string[]) {
    return this._resetPasswords(userIds);
  }

  /**
   * @name deleteUser
   * @description Delete a user
   * @param userId - The ID of the user to delete
   */
  async deleteUser(userId: string) {
    const result = await this.deleteUsers([userId]);
    return result;
  }

  /**
   * @name deleteUsers
   * @description Delete multiple users
   * @param userIds - The IDs of the users to delete
   */
  async deleteUsers(userIds: string[]) {
    return this._deleteUsers(userIds);
  }

  /**
   * @name sendMagicLink
   * @description Send a magic link to a user for passwordless login
   * @param userId - The ID of the user
   * @param type - The type of magic link (signup, recovery, etc.)
   */
  async sendMagicLink(
    userId: string,
    type: 'signup' | 'recovery' | 'invite' = 'recovery',
  ) {
    const logger = await getLogger();

    logger.info({ userId, type }, 'Sending magic link...');

    const canUpdateUser = await this.userService.canUpdateAuthUser();

    if (!canUpdateUser) {
      logger.error(
        { userId },
        'User does not have permission to send magic links',
      );
      throw new Error('You do not have permission to send magic links');
    }

    try {
      await this.userService.assertUserIsNotActioningItself(userId);
      // Do not allow minting a login/recovery link for another admin account.
      await this.userService.assertUserIsNotAdminAccount(userId);

      const client = this.getAdminClient();

      // Get user details to get their email
      const { data: userData, error: userError } =
        await client.auth.admin.getUserById(userId);

      if (userError || !userData.user || !userData.user.email) {
        const errorMessage = 'User not found or has no email';
        logger.error({ userId, userError }, errorMessage);
        throw new Error(errorMessage);
      }

      // Deliver the link to the target user's own email out-of-band.
      // We intentionally do NOT use admin.generateLink + return the
      // action_link: that hands the caller a working single-use credential
      // for the target user (account takeover). The email-sending APIs send
      // the link to the user's inbox where only they can action it.
      let error;

      if (type === 'invite') {
        ({ error } = await client.auth.admin.inviteUserByEmail(
          userData.user.email,
        ));
      } else {
        // Both 'recovery' and 'signup' resolve to a recovery email the user
        // actions from their own inbox.
        ({ error } = await client.auth.resetPasswordForEmail(
          userData.user.email,
        ));
      }

      if (error) {
        logger.error({ userId, error }, 'Failed to send magic link');
        throw new Error(`Failed to send magic link: ${error.message}`);
      }

      logger.info({ userId, type }, 'Magic link sent successfully');

      await this.recordAudit('send_magic_link', userId, { type });

      // Never return the action_link to the caller; it is delivered to the
      // target user's email above.
      return {
        success: true,
      };
    } catch (error) {
      logger.error({ userId, error }, 'Error sending magic link');
      throw error;
    }
  }

  /**
   * @name removeMfaFactor
   * @description Remove an MFA factor from a user
   * @param userId - The ID of the user
   * @param factorId - The ID of the MFA factor to remove
   */
  async removeMfaFactor(userId: string, factorId: string) {
    const logger = await getLogger();

    logger.info({ userId, factorId }, 'Removing MFA factor...');

    const canUpdateUser = await this.userService.canUpdateAuthUser();

    if (!canUpdateUser) {
      logger.error(
        { userId },
        'User does not have permission to remove MFA factors',
      );
      throw new Error('You do not have permission to remove MFA factors');
    }

    try {
      await this.userService.assertUserIsNotActioningItself(userId);
      // Do not allow stripping MFA from another admin account.
      await this.userService.assertUserIsNotAdminAccount(userId);

      const client = this.getAdminClient();

      // Remove the MFA factor
      const { error } = await client.auth.admin.mfa.deleteFactor({
        id: factorId,
        userId,
      });

      if (error) {
        logger.error(
          { userId, factorId, error },
          'Failed to remove MFA factor',
        );
        throw new Error(`Failed to remove MFA factor: ${error.message}`);
      }

      logger.info({ userId, factorId }, 'MFA factor removed successfully');

      await this.recordAudit('remove_mfa_factor', userId, {
        factor_id: factorId,
      });

      return { success: true };
    } catch (error) {
      logger.error({ userId, factorId, error }, 'Error removing MFA factor');
      throw error;
    }
  }

  /**
   * @name _banUsers
   * @description Private method to ban multiple users
   * @param userIds - The IDs of the users to ban
   */
  private async _banUsers(userIds: string[]) {
    const logger = await getLogger();

    logger.info({ userIds, count: userIds.length }, 'Banning users...');

    if (userIds.length === 0) {
      return { success: true, processed: 0, skipped: 0 };
    }

    // Check permissions for batch operation
    const canBanUser = await this.userService.canUpdateAuthUser();

    if (!canBanUser) {
      logger.error({ userIds }, 'User does not have permission to ban users');
      throw new Error('You do not have permission to ban users');
    }

    const client = this.getAdminClient();

    const errors: Array<{ userId: string; error: string }> = [];

    try {
      const banPromises = userIds.map(async (userId) => {
        try {
          await this.userService.assertUserIsNotActioningItself(userId);
          await this.userService.assertUserIsNotAdminAccount(userId);

          const { error } = await client.auth.admin.updateUserById(userId, {
            ban_duration: '876600h', // 100 years
          });

          if (error) {
            errors.push({ userId, error: error.message });
            logger.error({ userId, error }, 'Failed to ban user');
          } else {
            await this.recordAudit('ban_user', userId, { banned: true });
          }

          return null; // Indicate success
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';

          errors.push({ userId, error: errorMessage });
          logger.error({ userId, error }, 'Error banning user');
          return null; // Indicate failure, but don't throw
        }
      });

      await Promise.all(banPromises);

      const processed = userIds.length - errors.length;
      const skipped = errors.length;

      logger.info(
        {
          total: userIds.length,
          processed,
          skipped,
          errors: errors.length,
        },
        'Batch ban operation completed',
      );

      if (errors.length > 0 && processed === 0) {
        throw new Error(
          `Failed to ban any users. First error: ${errors[0]?.error || 'Unknown error'}`,
        );
      }

      return {
        success: true,
        processed,
        skipped,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      logger.error({ userIds, error }, 'Error in batch ban operation');
      throw error;
    }
  }

  /**
   * @name _unbanUsers
   * @description Private method to unban multiple users
   * @param userIds - The IDs of the users to unban
   */
  private async _unbanUsers(userIds: string[]) {
    const logger = await getLogger();

    logger.info({ userIds, count: userIds.length }, 'Unbanning users...');

    if (userIds.length === 0) {
      return { success: true, processed: 0, skipped: 0 };
    }

    // Check permissions for batch operation
    const canUnbanUser = await this.userService.canUpdateAuthUser();

    if (!canUnbanUser) {
      logger.error({ userIds }, 'User does not have permission to unban users');
      throw new Error('You do not have permission to unban users');
    }

    const client = this.getAdminClient();

    try {
      // Validate each user before processing
      const validUsers: string[] = [];
      const errors: Array<{ userId: string; error: string }> = [];

      for (const userId of userIds) {
        try {
          await this.userService.assertUserIsNotActioningItself(userId);
          await this.userService.assertUserIsNotAdminAccount(userId);

          validUsers.push(userId);
        } catch (error) {
          logger.warn(
            { userId, error: (error as Error).message },
            'Skipping user due to validation error',
          );

          errors.push({ userId, error: (error as Error).message });
        }
      }

      const unbanPromises = validUsers.map(async (userId) => {
        try {
          const { error } = await client.auth.admin.updateUserById(userId, {
            ban_duration: 'none',
          });

          if (error) {
            errors.push({ userId, error: error.message });
            logger.error({ userId, error }, 'Failed to unban user');
          } else {
            await this.recordAudit('unban_user', userId, { banned: false });
          }

          return null; // Indicate success
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';

          errors.push({ userId, error: errorMessage });
          logger.error({ userId, error }, 'Error unbanning user');
          return null; // Indicate failure, but don't throw
        }
      });

      await Promise.all(unbanPromises);

      const executionErrors = errors.filter((e) =>
        validUsers.includes(e.userId),
      );

      const processed = validUsers.length - executionErrors.length;
      const skipped = userIds.length - processed;

      logger.info(
        {
          total: userIds.length,
          processed,
          skipped,
          errors: errors.length,
        },
        'Batch unban operation completed',
      );

      if (errors.length > 0 && processed === 0) {
        throw new Error(
          `Failed to unban any users. First error: ${errors[0]?.error || 'Unknown error'}`,
        );
      }

      return {
        success: true,
        processed,
        skipped,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      logger.error({ userIds, error }, 'Error in batch unban operation');
      throw error;
    }
  }

  /**
   * @name _resetPasswords
   * @description Private method to reset passwords for multiple users
   * @param userIds - The IDs of the users
   */
  private async _resetPasswords(userIds: string[]) {
    const logger = await getLogger();

    logger.info({ userIds, count: userIds.length }, 'Resetting passwords...');

    if (userIds.length === 0) {
      return { success: true, processed: 0, skipped: 0 };
    }

    // Check permissions for batch operation
    const canResetPassword = await this.userService.canUpdateAuthUser();

    if (!canResetPassword) {
      logger.error(
        { userIds },
        'User does not have permission to reset passwords',
      );
      throw new Error('You do not have permission to reset passwords');
    }

    const client = this.getAdminClient();

    try {
      const validUsers: string[] = [];
      const errors: Array<{ userId: string; error: string }> = [];

      // Validate users
      await Promise.all(
        userIds.map(async (userId) => {
          try {
            await this.userService.assertUserIsNotActioningItself(userId);
            await this.userService.assertUserIsNotAdminAccount(userId);

            validUsers.push(userId);
          } catch (error) {
            logger.warn(
              { userId, error: (error as Error).message },
              'Skipping user due to validation error',
            );
            errors.push({ userId, error: (error as Error).message });
          }
        }),
      );

      // Reset passwords for valid users
      const resetPasswordPromises = validUsers.map(async (userId) => {
        try {
          // Get user details to get their email
          const { data: userData, error: userError } =
            await client.auth.admin.getUserById(userId);

          if (userError || !userData.user || !userData.user.email) {
            const errorMessage = 'User not found or has no email';

            errors.push({ userId, error: errorMessage });
            logger.error({ userId, userError }, errorMessage);

            return;
          }

          // Send password reset email
          const { error } = await client.auth.resetPasswordForEmail(
            userData.user.email,
          );

          if (error) {
            errors.push({ userId, error: error.message });

            logger.error(
              { userId, error },
              'Failed to send password reset email',
            );
          } else {
            // GoTrue books this against the target user's own id, so without this
            // record an admin-triggered reset looks like a self-service one.
            await this.recordAudit('reset_password', userId);
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';

          errors.push({ userId, error: errorMessage });
          logger.error({ userId, error }, 'Error resetting password');
        }
      });

      await Promise.all(resetPasswordPromises);

      const processed =
        validUsers.length -
        errors.filter((e) => validUsers.includes(e.userId)).length;

      const skipped = userIds.length - processed;

      logger.info(
        {
          total: userIds.length,
          processed,
          skipped,
          errors: errors.length,
        },
        'Batch password reset operation completed',
      );

      if (errors.length > 0 && processed === 0) {
        throw new Error(
          `Failed to reset passwords for any users. First error: ${errors[0]?.error || 'Unknown error'}`,
        );
      }

      return {
        success: true,
        processed,
        skipped,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      logger.error(
        { userIds, error },
        'Error in batch password reset operation',
      );
      throw error;
    }
  }

  /**
   * @name _deleteUsers
   * @description Private method to delete multiple users
   * @param userIds - The IDs of the users to delete
   */
  private async _deleteUsers(userIds: string[]) {
    const logger = await getLogger();

    logger.info({ userIds, count: userIds.length }, 'Deleting users...');

    if (userIds.length === 0) {
      return { success: true, processed: 0, skipped: 0 };
    }

    // Check permissions for batch operation
    const canDeleteUser = await this.userService.canDeleteAuthUser();

    // if the user does not have permission to delete users, throw an error
    if (!canDeleteUser) {
      logger.error(
        { userIds },
        'User does not have permission to delete users',
      );

      throw new Error('You do not have permission to delete users');
    }

    const client = this.getAdminClient();

    try {
      // Validate each user before processing
      const validationResults = await Promise.all(
        userIds.map(async (userId) => {
          try {
            await Promise.all([
              this.userService.assertUserIsNotActioningItself(userId),
              this.userService.assertUserIsNotAdminAccount(userId),
            ]);

            return {
              userId,
              valid: true,
              error: undefined,
            };
          } catch (error) {
            logger.warn(
              { userId, error: (error as Error).message },
              'Skipping user due to validation error',
            );

            return {
              userId,
              valid: false,
              error: (error as Error).message,
            };
          }
        }),
      );

      // Collect valid users from validation results
      const validUsers = validationResults
        .filter((result) => result.valid)
        .map((result) => result.userId);

      // Collect errors from validation results
      const errors: Array<{ userId: string; error: string }> = validationResults
        .filter((result) => !result.valid)
        .map((result) => ({ userId: result.userId, error: result.error! }));

      // Process users in batches to avoid overwhelming the API
      const deletePromises = validUsers.map(async (userId) => {
        try {
          const { error } = await client.auth.admin.deleteUser(userId);

          if (error) {
            errors.push({ userId, error: error.message });
            logger.error({ userId, error }, 'Failed to delete user');

            return false; // Indicate failure
          } else {
            await this.recordAudit('delete_auth_user', userId);

            return true; // Indicate success
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';

          errors.push({ userId, error: errorMessage });
          logger.error({ userId, error }, 'Error deleting user');

          return false; // Indicate failure
        }
      });

      // Wait for all delete promises to complete
      const results = await Promise.all(deletePromises);

      // Count the number of users that were successfully deleted
      const processed = results.filter((result) => result).length;
      const skipped = userIds.length - processed;

      logger.info(
        {
          total: userIds.length,
          processed,
          skipped,
          errors: errors.length,
        },
        'Batch delete operation completed',
      );

      if (errors.length > 0 && processed === 0) {
        throw new Error(
          `Failed to delete any users. First error: ${errors[0]?.error || 'Unknown error'}`,
        );
      }

      return {
        success: true,
        processed,
        skipped,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      logger.error({ userIds, error }, 'Error in batch delete operation');
      throw error;
    }
  }

  /**
   * @name updateAdminAccess
   * @description Update admin access status for a user using PostgreSQL functions that handle both JWT and account creation
   * @param userId - The ID of the user to update
   * @param hasAdminAccess - Whether the user should have admin access
   */
  async updateAdminAccess(userId: string, hasAdminAccess: boolean) {
    const logger = await getLogger();

    logger.info({ userId, hasAdminAccess }, 'Updating admin access...');

    try {
      // Defense-in-depth: require auth-user update permission at the app layer.
      // The SQL grant/revoke functions enforce the authoritative `account`
      // permission + rank checks, but this route must not be the only place
      // without an application-level gate.
      const canUpdateUser = await this.userService.canUpdateAuthUser();

      if (!canUpdateUser) {
        logger.error(
          { userId, hasAdminAccess },
          'User does not have permission to update admin access',
        );

        throw new Error('You do not have permission to update admin access');
      }

      // Prevent users from actioning themselves
      await this.userService.assertUserIsNotActioningItself(userId);

      const client = this.context.get('drizzle');

      let result;

      if (hasAdminAccess) {
        // Use PostgreSQL function to grant admin access (handles both JWT and account creation)
        result = await client.runTransaction(async (tx) => {
          const queryResult = await tx.execute(
            sql`SELECT cms.grant_admin_access(${userId})`,
          );

          return queryResult[0]?.['grant_admin_access'];
        });
      } else {
        // Use PostgreSQL function to revoke admin access (handles both JWT and optional account deactivation)
        result = await client.runTransaction(async (tx) => {
          const queryResult = await tx.execute(
            sql`SELECT cms.revoke_admin_access(${userId}, false)`,
          );

          return queryResult[0]?.['revoke_admin_access'];
        });
      }

      // Parse the result from the PostgreSQL function
      if (!result || typeof result !== 'object') {
        throw new Error('Invalid response from database function');
      }

      // Type assertion for the PostgreSQL function result
      const functionResult = result as {
        success: boolean;
        error?: string;
        message?: string;
      };

      if (!functionResult.success) {
        logger.error(
          { userId, hasAdminAccess, error: functionResult.error },
          'Database function failed to update admin access',
        );

        throw new Error(
          functionResult.error || 'Failed to update admin access',
        );
      }

      logger.info(
        { userId, hasAdminAccess, message: functionResult.message },
        'Admin access updated successfully',
      );

      return {
        success: true,
        message: functionResult.message,
      };
    } catch (error) {
      logger.error(
        { userId, hasAdminAccess, error },
        'Error updating admin access',
      );

      throw error;
    }
  }

  /**
   * @name recordAudit
   * @description Write an attributed CMS audit record for an auth-admin action.
   *
   * GoTrue keeps its own auth.audit_log_entries, but every service-role call lands there
   * as `service_role` with no IP, so it cannot say which operator acted — and recovery
   * mails are attributed to the target user, making an admin-triggered reset
   * indistinguishable from a self-service one. This runs on the RLS-scoped client, where
   * the caller's JWT is present, so create_audit_log resolves the acting account.
   *
   * A failure here must not roll back an action that already happened, so it is logged
   * rather than thrown.
   */
  private async recordAudit(
    operation: string,
    recordId: string,
    metadata: Record<string, unknown> = {},
  ) {
    try {
      const client = this.context.get('drizzle');

      const newData = JSON.stringify({ operation, ...metadata });

      await client.runTransaction(async (tx) => {
        await tx.execute(
          sql`select cms.create_audit_log(${operation}, 'auth', 'users', ${recordId}, null, ${newData}::jsonb, 'info'::cms.audit_log_severity, ${'{"operation_type":"auth_user_management"}'}::jsonb)`,
        );
      });
    } catch (error) {
      const logger = await getLogger();

      logger.error(
        { operation, recordId, error },
        'Failed to write audit record for auth admin action',
      );
    }
  }

  private getAdminClient() {
    return getSupabaseAdminClient();
  }
}
