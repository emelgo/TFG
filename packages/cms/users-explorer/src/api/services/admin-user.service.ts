/**
 * Servicio de acciones sobre usuarios del explorador de usuarios del CMS.
 *
 * Crea, invita, bloquea, desbloquea, borra y envía correos de recuperación a
 * usuarios de Supabase Auth, quita factores MFA y concede o retira el acceso
 * al CMS. Todas las acciones sobre usuarios existentes siguen el mismo orden:
 *
 *  1. **permiso** del RBAC del CMS sobre `auth_user` (`update`, `delete` o
 *     `insert`), con los *claims* del usuario;
 *  2. **protección** del usuario de destino (`assertCanActionUser`): nadie
 *     actúa sobre sí mismo, sobre un super-admin de la plataforma ni sobre
 *     personal del CMS con acceso;
 *  3. solo entonces, la API de administración de Auth con la **clave de
 *     servicio**, que no sabe nada de roles y por eso nunca se llama antes;
 *  4. una entrada de auditoría a nombre del operador.
 *
 * Ninguna acción escribe `app_metadata` (donde viven `role` y `cms_access`):
 * crear un usuario solo acepta correo, contraseña y confirmación, y el
 * acceso al CMS cambia únicamente con `cms.grant_admin_access` y
 * `cms.revoke_admin_access`, que comprueban el permiso `account` y la
 * jerarquía de rangos. El super-admin de la plataforma no se puede conceder
 * ni retirar desde aquí: se gestiona en la consola de la plataforma.
 *
 * [TFG] RF-09 · RNF-02: acciones sobre usuarios con autorización en el código
 * antes del cliente de servicio de Auth. Ver Memoria §Diseño > Seguridad.
 */
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';

import { CMS_API_ERROR_CODES } from '@pymekit/cms-shared/error-codes';
import { getSupabaseAdminClient } from '@pymekit/cms-supabase/hono';
import { getLogger } from '@pymekit/shared/logger';

import { isPlatformSuperAdmin } from '../utils/user-protection';
import {
  UsersExplorerError,
  fromAdminAccessFailure,
  fromAuthAdminError,
  getUsersErrorCode,
  protectionError,
} from '../utils/users-errors';
import { createAuthUsersService } from './auth-users.service';

/** Duración del bloqueo: en la práctica, indefinido (100 años). */
const BAN_DURATION = '876600h';

type AuthUser = Awaited<
  ReturnType<ReturnType<typeof createAuthUsersService>['getAuthUser']>
>;

/** Resultado de una acción sobre varios usuarios. */
export type BatchResult = {
  success: boolean;
  processed: number;
  failed: number;
  /** Usuarios que no se pudieron procesar, con el código del motivo. */
  errors: Array<{ userId: string; errorCode: string }>;
};

/** Crea el servicio de acciones sobre usuarios de una petición. */
export function createAdminUserService(context: Context) {
  return new AdminUserService(context);
}

class AdminUserService {
  private readonly users: ReturnType<typeof createAuthUsersService>;

  constructor(private readonly context: Context) {
    this.users = createAuthUsersService(context);
  }

  /** Invita a un usuario nuevo por correo. */
  async inviteUser(params: { email: string }) {
    await this.users.requirePermission('insert');

    const { data, error } =
      await getSupabaseAdminClient().auth.admin.inviteUserByEmail(params.email);

    if (error) {
      throw fromAuthAdminError(error, 'inviteUserByEmail');
    }

    await this.recordAudit('invite_auth_user', data.user?.id ?? params.email, {
      email: params.email,
    });

    return { success: true, userId: data.user?.id ?? null };
  }

  /**
   * Crea un usuario con correo y contraseña. A propósito no acepta metadatos:
   * el `app_metadata` de un usuario nuevo es el que pone Auth (proveedor), así
   * que no se puede crear un super-admin ni personal del CMS por esta vía.
   */
  async createUser(params: {
    email: string;
    password: string;
    autoConfirm: boolean;
  }) {
    await this.users.requirePermission('insert');

    const { data, error } =
      await getSupabaseAdminClient().auth.admin.createUser({
        email: params.email,
        password: params.password,
        email_confirm: params.autoConfirm,
      });

    if (error || !data.user) {
      throw fromAuthAdminError(error, 'createUser');
    }

    await this.recordAudit('create_auth_user', data.user.id, {
      email: params.email,
      auto_confirm: params.autoConfirm,
    });

    return { success: true, userId: data.user.id };
  }

  /** Bloquea usuarios (sin fecha de fin práctica). */
  banUsers(userIds: string[]) {
    return this.runForEach(userIds, 'update', async (user) => {
      const { error } =
        await getSupabaseAdminClient().auth.admin.updateUserById(user.id, {
          ban_duration: BAN_DURATION,
        });

      if (error) {
        throw fromAuthAdminError(error, 'ban');
      }

      await this.recordAudit('ban_user', user.id, { banned: true });
    });
  }

  /** Desbloquea usuarios. */
  unbanUsers(userIds: string[]) {
    return this.runForEach(userIds, 'update', async (user) => {
      const { error } =
        await getSupabaseAdminClient().auth.admin.updateUserById(user.id, {
          ban_duration: 'none',
        });

      if (error) {
        throw fromAuthAdminError(error, 'unban');
      }

      await this.recordAudit('unban_user', user.id, { banned: false });
    });
  }

  /**
   * Envía a cada usuario un correo de restablecimiento de contraseña. El
   * enlace llega a su propio buzón: el operador nunca lo ve.
   */
  resetPasswords(userIds: string[]) {
    return this.runForEach(userIds, 'update', async (user) => {
      await this.sendRecoveryEmail(user);
      await this.recordAudit('reset_password', user.id);
    });
  }

  /** Borra usuarios de Auth (y, en cascada, sus cuentas personales). */
  deleteUsers(userIds: string[]) {
    return this.runForEach(userIds, 'delete', async (user) => {
      const { error } = await getSupabaseAdminClient().auth.admin.deleteUser(
        user.id,
      );

      if (error) {
        throw fromAuthAdminError(error, 'deleteUser');
      }

      await this.recordAudit('delete_auth_user', user.id);
    });
  }

  /**
   * Envía un enlace de acceso al correo del usuario (recuperación o
   * invitación). Nunca se genera el enlace para devolverlo
   * (`admin.generateLink`): quien lo recibiera podría entrar en la cuenta.
   */
  async sendMagicLink(userId: string, type: 'recovery' | 'invite') {
    await this.users.requirePermission('update');

    const user = await this.users.assertCanActionUser(userId);

    if (type === 'invite') {
      if (!user.email) {
        throw invalidData('User has no email');
      }

      const { error } =
        await getSupabaseAdminClient().auth.admin.inviteUserByEmail(user.email);

      if (error) {
        throw fromAuthAdminError(error, 'inviteUserByEmail');
      }
    } else {
      await this.sendRecoveryEmail(user);
    }

    await this.recordAudit('send_magic_link', userId, { type });

    return { success: true };
  }

  /** Quita un factor MFA de un usuario (por ejemplo, si perdió el móvil). */
  async removeMfaFactor(userId: string, factorId: string) {
    await this.users.requirePermission('update');
    await this.users.assertCanActionUser(userId);

    const { error } =
      await getSupabaseAdminClient().auth.admin.mfa.deleteFactor({
        id: factorId,
        userId,
      });

    if (error) {
      throw fromAuthAdminError(error, 'deleteFactor');
    }

    await this.recordAudit('remove_mfa_factor', userId, {
      factor_id: factorId,
    });

    return { success: true };
  }

  /**
   * Concede o retira el acceso al CMS. La decisión final la toman las
   * funciones SQL (`security definer`), que exigen el permiso `account` y
   * que el operador tenga más rango que la cuenta del CMS de destino; aquí se
   * añaden las barreras de la aplicación: permiso `auth_user:update`, no a
   * uno mismo y nunca sobre un super-admin de la plataforma.
   */
  async updateAdminAccess(userId: string, grant: boolean) {
    await this.users.requirePermission('update');

    const actorId = await this.users.getCurrentUserId();

    if (actorId === userId) {
      throw protectionError('self');
    }

    const target = await this.users.getAuthUser(userId);

    if (isPlatformSuperAdmin(target.app_metadata)) {
      throw protectionError('super_admin');
    }

    const client = this.context.get('drizzle');

    const result = await client.runTransaction(async (tx) => {
      const rows = grant
        ? await tx.execute(
            sql`SELECT cms.grant_admin_access(${userId}) AS result`,
          )
        : await tx.execute(
            sql`SELECT cms.revoke_admin_access(${userId}, false) AS result`,
          );

      return rows[0]?.['result'] as
        | { success?: boolean; error?: string }
        | undefined;
    });

    if (!result?.success) {
      throw fromAdminAccessFailure(result?.error);
    }

    return { success: true };
  }

  /**
   * Ejecuta `action` sobre cada usuario tras comprobar el permiso (una vez) y
   * la protección de cada uno. Los fallos individuales no detienen al resto:
   * se devuelven con su código. Si no se procesa ninguno, se lanza el primer
   * error, para que una acción sobre un solo usuario responda con su estado
   * (403, 404…) en vez de con un 200 vacío.
   */
  private async runForEach(
    userIds: string[],
    permission: 'update' | 'delete',
    action: (user: AuthUser) => Promise<void>,
  ): Promise<BatchResult> {
    await this.users.requirePermission(permission);

    const logger = await getLogger();
    const failures: Array<{ userId: string; error: unknown }> = [];

    await Promise.all(
      userIds.map(async (userId) => {
        try {
          const user = await this.users.assertCanActionUser(userId);

          await action(user);
        } catch (error) {
          logger.warn({ userId, error }, 'User action skipped or failed');
          failures.push({ userId, error });
        }
      }),
    );

    const processed = userIds.length - failures.length;

    if (processed === 0 && failures[0]) {
      throw failures[0].error;
    }

    return {
      success: true,
      processed,
      failed: failures.length,
      errors: failures.map(({ userId, error }) => ({
        userId,
        errorCode: getUsersErrorCode(error),
      })),
    };
  }

  /** Envía el correo de recuperación de contraseña al propio usuario. */
  private async sendRecoveryEmail(user: AuthUser) {
    if (!user.email) {
      throw invalidData('User has no email');
    }

    const { error } = await getSupabaseAdminClient().auth.resetPasswordForEmail(
      user.email,
    );

    if (error) {
      throw fromAuthAdminError(error, 'resetPasswordForEmail');
    }
  }

  /**
   * Deja una entrada de auditoría del CMS a nombre del operador.
   *
   * Auth guarda su propio registro, pero todas las llamadas con la clave de
   * servicio aparecen como `service_role` y un restablecimiento pedido por un
   * operador se atribuye al propio usuario. Esta entrada se escribe con los
   * *claims* del operador, así que `cms.create_audit_log` sabe quién actuó.
   * Si falla, se registra en el *log* sin deshacer la acción, que ya ocurrió.
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
}

function invalidData(detail: string) {
  return new UsersExplorerError(
    CMS_API_ERROR_CODES.AUTH_USER_INVALID_DATA,
    detail,
  );
}
