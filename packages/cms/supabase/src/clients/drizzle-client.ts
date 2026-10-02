/**
 * Clientes Drizzle de la API del CMS.
 *
 * El CMS consulta Postgres directamente con Drizzle + postgres.js (en lugar de
 * PostgREST) porque necesita SQL dinámico sobre cualquier tabla: explorador de
 * datos, paneles, metadatos, etc. Hay dos clientes:
 *
 *  - **Cliente RLS** (`getDrizzleSupabaseClient(c)`): cada transacción fija los
 *    *claims* JWT del usuario (`request.jwt.claims`) y el rol `authenticated`
 *    antes de ejecutar nada. Así Postgres evalúa las mismas políticas RLS y
 *    funciones (`cms.verify_admin_access()`, MFA, cuenta activa…) que si la
 *    petición llegara por la API de Supabase.
 *  - **Cliente administrador** (`getDrizzleSupabaseAdminClient()`): ignora RLS.
 *    Solo se usa para leer catálogos o metadatos después de comprobar permisos.
 *
 * La conexión se configura con `SUPABASE_DATABASE_URL`. Los *pools* se crean
 * de forma perezosa en la primera petición: si la variable falta, el servidor
 * arranca igual y solo fallan (con un error claro) las rutas del CMS.
 *
 * [TFG] RNF-02 Seguridad: la autorización del CMS se aplica en la base de
 * datos (RLS del esquema `cms`), no solo en la API. Ver ADR-014 y ADR-015.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import { type DrizzleConfig, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import type { Context } from 'hono';
import { type JwtPayload, jwtDecode } from 'jwt-decode';
import postgres from 'postgres';
import { z } from 'zod';

import { getLogger } from '@pymekit/shared/logger';

import * as schema from '../drizzle/schema';

declare module 'hono' {
  // Variables que el *router* del CMS deja en el contexto de cada petición
  // `/v1/*`. Se declaran aquí, junto al tipo del cliente, para que cualquier
  // paquete que use `c.get('drizzle')` o `c.get('supabase')` las vea tipadas.
  interface ContextVariableMap {
    drizzle: DrizzleSupabaseClient;
    supabase: SupabaseClient;
  }
}

const config = {
  casing: 'snake_case',
  schema,
  logger: process.env['PERF_LOG_LEVEL'] === 'on',
} satisfies DrizzleConfig<typeof schema>;

/**
 * Roles de Postgres que un *token* de usuario puede activar. `service_role` y
 * `postgres` son solo de *backend*: nunca se aceptan desde un JWT de petición.
 */
const ALLOWED_DB_ROLES = new Set(['authenticated', 'anon']);

type DrizzleClients = {
  admin: ReturnType<typeof createDrizzle>;
  rls: ReturnType<typeof createDrizzle>;
};

// Se guardan en `globalThis` para que la recarga en caliente de Vite en
// desarrollo no abra un *pool* nuevo en cada cambio (agotaría las conexiones
// de la base de datos local).
const globalForDrizzle = globalThis as typeof globalThis & {
  __cmsDrizzleClients?: DrizzleClients;
};

/**
 * Lee `SUPABASE_DATABASE_URL` en el momento de usarla (no al importar el
 * módulo), para que una *build* de producción sin la variable no falle al
 * arrancar: solo falla la petición al CMS, con un mensaje explícito.
 */
function getDatabaseUrl() {
  return z
    .string({
      error:
        'Falta la variable de entorno SUPABASE_DATABASE_URL (cadena de conexión a Postgres que usa la API del CMS).',
    })
    .min(1, 'La variable de entorno SUPABASE_DATABASE_URL está vacía')
    .parse(process.env['SUPABASE_DATABASE_URL']);
}

function createDrizzle(url: string) {
  return drizzle({
    client: postgres(url, {
      // `prepare: false` es necesario con el *pooler* de Supabase en modo
      // transacción, que no admite sentencias preparadas.
      prepare: false,
      // Cierra las conexiones ociosas: sin esto, los *sockets* abiertos
      // impiden que el proceso termine tras un SIGTERM (despliegues, tests).
      idle_timeout: 20,
    }),
    ...config,
  });
}

function getClients() {
  if (!globalForDrizzle.__cmsDrizzleClients) {
    const url = getDatabaseUrl();

    globalForDrizzle.__cmsDrizzleClients = {
      admin: createDrizzle(url),
      rls: createDrizzle(url),
    };
  }

  return globalForDrizzle.__cmsDrizzleClients;
}

/**
 * Devuelve el cliente Drizzle administrador (ignora RLS).
 *
 * Seguridad: solo se usa después de comprobar a mano los permisos del usuario
 * (cada llamada lo justifica en su servicio).
 */
export function getDrizzleSupabaseAdminClient() {
  return getClients().admin;
}

/**
 * Devuelve un cliente Drizzle que ejecuta cada transacción con la identidad
 * del usuario de la petición, de forma que se aplican las políticas RLS.
 *
 * El *token* sale de la sesión del cliente Supabase del contexto, que el
 * *middleware* de autenticación ya ha verificado con `getClaims()`.
 */
export async function getDrizzleSupabaseClient(c: Context) {
  const client = c.get('supabase');
  const { data, error } = await client.auth.getSession();
  const accessToken = data.session?.access_token;

  if (error) {
    throw new Error('Failed to get session');
  }

  if (!accessToken) {
    throw new Error('No access token found');
  }

  const token = decode(accessToken);

  // The Postgres role driving RLS comes from the (Supabase-signed) JWT, but we
  // never interpolate it into SQL. Constrain it to the roles a user token may
  // ever carry; anything else is downgraded to the least-privileged role.
  const role = ALLOWED_DB_ROLES.has(token.role) ? token.role : 'anon';
  const claims = JSON.stringify(token);
  const sub = token.sub ?? '';
  const rlsClient = getClients().rls;

  const runTransaction = ((transaction, transactionConfig) => {
    return rlsClient.transaction(async (tx) => {
      try {
        // Set up the Supabase auth context using BOUND PARAMETERS only — never
        // string interpolation — so attacker-controlled claim values (e.g.
        // user_metadata) cannot break out of the SQL literal. `set_config('role', …)`
        // is the parameterizable, transaction-local equivalent of `SET LOCAL ROLE`.
        await tx.execute(
          sql`select set_config('request.jwt.claims', ${claims}, true)`,
        );
        await tx.execute(
          sql`select set_config('request.jwt.claim.sub', ${sub}, true)`,
        );
        await tx.execute(sql`select set_config('role', ${role}, true)`);

        return await transaction(tx);
      } catch (error) {
        const logger = await getLogger();

        logger.error({ error }, 'Error in Drizzle transaction');

        const formatErrorMessage = (error: unknown) => {
          const message =
            error instanceof Error ? error.message : 'Unknown error';

          return `Error in Drizzle transaction: \n\n"${message}".\n\nPlease check the logs for more details.`;
        };

        // Se conserva el error original en `cause`: las rutas lo necesitan
        // para distinguir por su código SQLSTATE (por ejemplo, «no existe la
        // fila» → 404) sin depender del texto del mensaje.
        throw new Error(formatErrorMessage(error), { cause: error });
      } finally {
        try {
          // Clean up (settings above are transaction-local, but reset defensively)
          await tx.execute(
            sql`select set_config('request.jwt.claims', NULL, true)`,
          );
          await tx.execute(
            sql`select set_config('request.jwt.claim.sub', NULL, true)`,
          );
          await tx.execute(sql`reset role`);
        } catch {
          // Ignore errors during cleanup
        }
      }
    }, transactionConfig);
  }) as DrizzleClients['rls']['transaction'];

  return {
    runTransaction,
  };
}

function decode(accessToken: string) {
  try {
    return jwtDecode<JwtPayload & { role: string }>(accessToken);
  } catch {
    return { role: 'anon' } as JwtPayload & { role: string };
  }
}

export type DrizzleSupabaseClient = Awaited<
  ReturnType<typeof getDrizzleSupabaseClient>
>;

export type { SupabaseClient };
