/**
 * Servicio de lectura de roles del CMS.
 *
 * Da las listas de roles que usan otras pantallas: todos los roles
 * (`GET /v1/roles`) y los roles con los que el usuario puede compartir una
 * vista guardada o un panel (`GET /v1/roles/sharing`: rango estrictamente
 * inferior al suyo). La gestión de roles (crear, editar, borrar y asignar
 * grupos y permisos) está en `RbacService` (F2.7b); las operaciones de
 * escritura sin comprobaciones que tenía este servicio se retiraron al
 * unificar la gestión en un solo sitio.
 *
 * Las consultas usan el cliente Drizzle de la petición, así que RLS
 * (`view_roles`: acceso de administración vigente) filtra el resultado.
 *
 * [TFG] RF-09 · ADR-014.
 */
import { desc, sql } from 'drizzle-orm';
import type { Context } from 'hono';

import { rolesInCms } from '@pymekit/cms-supabase/schema';

/** Crea el servicio de lectura de roles para la petición actual. */
export function createRolesService(context: Context) {
  return new RolesService(context);
}

class RolesService {
  constructor(private readonly context: Context) {}

  /** Devuelve todos los roles visibles, de mayor a menor rango. */
  async getRoles() {
    const client = this.context.get('drizzle');

    return client.runTransaction(async (tx) => {
      return tx
        .select({
          id: rolesInCms.id,
          name: rolesInCms.name,
          description: rolesInCms.description,
          rank: rolesInCms.rank,
        })
        .from(rolesInCms)
        .orderBy(desc(rolesInCms.rank));
    });
  }

  /**
   * Devuelve los roles vigentes con los que el usuario puede compartir
   * (rango estrictamente inferior al suyo), ordenados por nombre.
   */
  async getRolesForSharing() {
    const client = this.context.get('drizzle');

    return client.runTransaction(async (tx) => {
      const result = await tx.execute<{
        id: string;
        name: string;
        description: string | null;
        rank: number;
      }>(
        sql`
          select id, name, description, rank
          from cms.roles
          where rank < (select cms.get_user_max_role_rank(cms.get_current_user_account_id()))
            and (valid_until is null or valid_until > now())
          order by name
        `,
      );

      return result.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        rank: row.rank,
      }));
    });
  }
}
