/**
 * *Server functions* del panel de superadministración (`/admin`).
 *
 * Todas usan `adminFunctionMiddleware`, que exige rol `super-admin` y sesión
 * MFA, de modo que son seguras aunque se llamen sin pasar por el `beforeLoad`
 * de la ruta. Las lecturas se hacen con el cliente del usuario: las
 * políticas RLS de superadministrador (14-super-admin.sql) le dan acceso de
 * solo lectura a todas las cuentas.
 *
 * [TFG] RF-08 Panel de superadministración.
 */
import { createServerFn } from '@tanstack/react-start';
import * as z from 'zod';

import { createAdminDashboardService } from '@pymekit/admin';
import type { AdminAccountPageData } from '@pymekit/admin/components/admin-account-page';
import type { AdminDashboardData } from '@pymekit/admin/components/admin-dashboard';
import { adminFunctionMiddleware } from '@pymekit/function-middleware/functions';
import type { Tables } from '@pymekit/supabase/database';
import { getSupabaseServerAdminClient } from '@pymekit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@pymekit/supabase/server-client';

const PAGE_SIZE = 10;

/** Carga los recuentos agregados del panel de administración. */
export const fetchAdminDashboard = createServerFn({ method: 'GET' })
  .middleware(adminFunctionMiddleware)
  .handler(async (): Promise<AdminDashboardData> => {
    const client = getSupabaseServerClient();
    const service = createAdminDashboardService(client);

    return service.getDashboardData();
  });

const AdminAccountsSearchSchema = z.object({
  page: z.number().int().positive().default(1),
  account_type: z.enum(['all', 'team', 'personal']).default('all'),
  query: z.string().default(''),
});

/**
 * Carga una página de cuentas para `/admin/accounts`, con paginación (10 por
 * página y recuento exacto) y filtros por tipo y texto.
 */
export const fetchAdminAccounts = createServerFn({ method: 'GET' })
  .middleware(adminFunctionMiddleware)
  .validator(AdminAccountsSearchSchema)
  .handler(async ({ data }) => {
    const client = getSupabaseServerClient();
    const { page, account_type, query } = data;

    let queryBuilder = client
      .from('accounts')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (account_type !== 'all') {
      queryBuilder = queryBuilder.eq(
        'is_personal_account',
        account_type === 'personal',
      );
    }

    if (query) {
      // El término se envuelve en comillas dobles y se escapan las comillas y
      // barras que contenga, para que los caracteres reservados de PostgREST
      // (`,` `.` `(` `)`) se traten como texto y no alteren la gramática del
      // filtro (inyección en el filtro `or`).
      const safeQuery = `"%${query.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}%"`;

      queryBuilder = queryBuilder.or(
        `name.ilike.${safeQuery},email.ilike.${safeQuery}`,
      );
    }

    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data: accounts, count, error } = await queryBuilder.range(from, to);

    if (error) {
      throw error;
    }

    const pageCount = Math.ceil((count ?? 0) / PAGE_SIZE);

    return {
      data: accounts,
      page,
      pageSize: PAGE_SIZE,
      pageCount,
      filters: { type: account_type, query },
    };
  });

const AdminAccountParamsSchema = z.object({
  id: z.uuid(),
});

/**
 * Carga los datos de la ficha `/admin/accounts/$id`: la cuenta, su
 * suscripción con sus líneas y, según el tipo, el estado de bloqueo y las
 * membresías (cuenta personal) o la lista de miembros (equipo).
 */
export const fetchAdminAccountPage = createServerFn({ method: 'GET' })
  .middleware(adminFunctionMiddleware)
  .validator(AdminAccountParamsSchema)
  .handler(async ({ data }): Promise<AdminAccountPageData> => {
    const client = getSupabaseServerClient();
    // El cliente administrador solo se usa para auth.admin.getUserById (saber
    // si el usuario está bloqueado), que exige la clave secreta; el
    // middleware ya ha verificado que quien llama es superadministrador.
    const adminClient = getSupabaseServerAdminClient();
    const { id } = data;

    const { data: account, error } = await client
      .from('accounts')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      throw error;
    }

    const { data: subscription } = await client
      .from('subscriptions')
      .select('*, subscription_items !inner (*)')
      .eq('account_id', id)
      .maybeSingle();

    const resolvedSubscription =
      (subscription as AdminAccountPageData['subscription']) ?? null;

    if (account.is_personal_account) {
      const [userResult, memberships] = await Promise.all([
        adminClient.auth.admin.getUserById(id),
        client
          .from('accounts_memberships')
          .select<
            string,
            Tables<'accounts_memberships'> & {
              account: { id: string; name: string };
            }
          >('*, account: account_id !inner (id, name)')
          .eq('user_id', id),
      ]);

      if (userResult.error) {
        throw userResult.error;
      }

      if (memberships.error) {
        throw memberships.error;
      }

      const isBanned =
        'banned_until' in userResult.data.user &&
        userResult.data.user.banned_until !== 'none';

      return {
        type: 'personal',
        account,
        subscription: resolvedSubscription,
        isBanned,
        memberships: memberships.data,
      };
    }

    const members = await client.rpc('get_account_members', {
      account_slug: account.slug ?? '',
    });

    if (members.error) {
      throw members.error;
    }

    return {
      type: 'team',
      account,
      subscription: resolvedSubscription,
      members: members.data,
    };
  });
