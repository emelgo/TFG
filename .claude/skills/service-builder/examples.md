# Ejemplos de servicios

Parte A: variante **web** (Supabase + *server functions*). Parte B: variante **API del CMS** (Drizzle + Hono + cliente RPC). Parte C: patrones comunes y tests.

---

## A. Web: servicio Supabase + *server function*

### A.1 Servicio

```typescript
/**
 * Servicio de proyectos de una cuenta.
 *
 * Concentra las lecturas y escrituras sobre la tabla `projects` para que
 * las server functions, los loaders y los tests compartan las mismas
 * reglas. Recibe el cliente Supabase ya creado: quien lo llama decide si
 * es el cliente con RLS (lo habitual) o el administrador.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@pymekit/supabase/database';

import type { CreateProjectInput } from '../../schema/project.schema';

export function createProjectService(client: SupabaseClient<Database>) {
  return new ProjectService(client);
}

class ProjectService {
  constructor(private readonly client: SupabaseClient<Database>) {}

  /**
   * Crea un proyecto en la cuenta indicada.
   *
   * No comprueba la pertenencia a la cuenta: de eso se encarga la política
   * RLS de inserción de `projects` cuando se usa el cliente del usuario.
   */
  async create(data: CreateProjectInput) {
    const { data: project, error } = await this.client
      .from('projects')
      .insert({ name: data.name, account_id: data.accountId })
      .select('id, name, account_id, created_at')
      .single();

    if (error) {
      throw error;
    }

    return project;
  }

  /**
   * Devuelve los proyectos de una cuenta, del más reciente al más antiguo.
   */
  async list(accountId: string) {
    const { data, error } = await this.client
      .from('projects')
      .select('id, name, account_id, created_at')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return data;
  }
}
```

### A.2 Adaptador: *server function*

```typescript
/**
 * Server functions de proyectos.
 *
 * Son el punto de entrada desde la UI: autentican, validan la entrada y
 * delegan en `ProjectService`. La llamada `createServerFn(...)` debe ser
 * literal en este fichero para que el compilador de TanStack Start elimine
 * el handler (y el cliente Supabase) del bundle del navegador.
 */
import { createServerFn } from '@tanstack/react-start';

import { teamAccountFunctionMiddleware } from '@pymekit/function-middleware/functions';
import { getLogger } from '@pymekit/shared/logger';
import { getSupabaseServerClient } from '@pymekit/supabase/server-client';

import { CreateProjectSchema } from '../../schema/project.schema';
import { createProjectService } from '../services/project.service.server';

export const createProjectFunction = createServerFn({ method: 'POST' })
  // Comprueba que el usuario es miembro de `data.accountId` e inyecta
  // `context.user` y `context.accountId`. Exige que el esquema tenga
  // un campo `accountId`.
  .middleware(teamAccountFunctionMiddleware)
  .validator(CreateProjectSchema)
  .handler(async ({ data, context }) => {
    const logger = await getLogger();
    const ctx = { name: 'projects.create', accountId: context.accountId };

    logger.info(ctx, 'Creating project...');

    const service = createProjectService(getSupabaseServerClient());

    try {
      const project = await service.create(data);

      logger.info({ ...ctx, projectId: project.id }, 'Project created');

      return { success: true as const, project };
    } catch (error) {
      logger.error({ ...ctx, error }, 'Failed to create project');

      // Devolvemos una clave i18n en lugar del error interno: la UI la
      // muestra traducida y no filtra detalles de la base de datos.
      return { success: false as const, error: 'projects.errors.createFailed' };
    }
  });
```

Para permisos más finos, se añade una puerta al *middleware*:

```typescript
import { withFeaturePermission } from '@pymekit/function-middleware/server';

.middleware([...teamAccountFunctionMiddleware, withFeaturePermission('projects.manage')])
```

### A.3 Consumidores

```typescript
// Loader de ruta (lectura): apps/web/src/routes/_authenticated/projects.tsx
export const Route = createFileRoute('/_authenticated/projects')({
  loader: () => fetchProjectsPageData(),
  component: ProjectsPage,
});

// Componente (mutación): ver la skill react-form-builder
const createProject = useServerFn(createProjectFunction);

const mutation = useMutation({
  mutationFn: (data: CreateProjectInput) => createProject({ data }),
  onSuccess: async (res) => {
    if (res.success) {
      await router.invalidate(); // vuelve a ejecutar los loaders activos
    }
  },
});
```

---

## B. API del CMS: servicio Drizzle + ruta Hono + cliente RPC

Basado en el código real de `packages/cms/settings/src/api/` (Ajustes > General). Lee antes `packages/cms/AGENTS.md`.

### B.1 Servicio (`packages/cms/settings/src/api/services/account.service.ts`)

```typescript
/**
 * Servicio de la cuenta del CMS del usuario de la sesión.
 *
 * Todas las consultas pasan por `runTransaction`, que fija en la transacción
 * los *claims* del JWT y el rol `authenticated`: Postgres aplica las
 * políticas RLS del esquema `cms` igual que si consultara el propio usuario.
 */
import { eq, sql } from 'drizzle-orm';

import { CMS_API_ERROR_CODES } from '@pymekit/cms-shared/error-codes';
import { mergeCmsPreferences } from '@pymekit/cms-shared/preferences';
import type { DrizzleSupabaseClient } from '@pymekit/cms-supabase/client';
import { accountsInCms } from '@pymekit/cms-supabase/schema';

import { SettingsError } from '../utils/settings-errors';

// Se inyecta solo el cliente Drizzle: el servicio se prueba sin montar Hono.
export function createAccountService(db: DrizzleSupabaseClient) {
  return new AccountService(db);
}

class AccountService {
  constructor(private readonly db: DrizzleSupabaseClient) {}

  /**
   * Combina las preferencias nuevas con las guardadas. Si RLS no deja ver
   * la fila (sin cuenta del CMS), lanza un error con código estable.
   */
  async updatePreferences(update: { language?: string; timezone?: string }) {
    const saved = await this.db.runTransaction(async (tx) => {
      const [current] = await tx
        .select({ preferences: accountsInCms.preferences })
        .from(accountsInCms)
        .where(eq(accountsInCms.authUserId, sql`auth.uid()`))
        .limit(1)
        .for('update'); // bloquea la fila: dos guardados no se pisan

      if (!current) return null;

      const [row] = await tx
        .update(accountsInCms)
        .set({ preferences: mergeCmsPreferences(current.preferences, update) })
        .where(eq(accountsInCms.authUserId, sql`auth.uid()`))
        .returning({ preferences: accountsInCms.preferences });

      return row ?? null;
    });

    if (!saved) {
      throw new SettingsError(
        CMS_API_ERROR_CODES.SETTINGS_PERMISSION_DENIED,
        'The CMS account of the session could not be updated',
      );
    }

    return saved.preferences;
  }
}
```

> El código real usa la variante `createAccountService(c: Context)` (lee `c.get('drizzle')`). Ambas son válidas; la inyección del cliente es preferible en servicios nuevos.

### B.2 Adaptador: ruta Hono (`routes/update-preferences-route.ts`)

```typescript
/**
 * `POST /v1/account/preferences`: guarda las preferencias del usuario.
 *
 * SOLO SERVIDOR. El esquema es estricto (rechaza claves desconocidas) y los
 * errores salen como `{ success: false, error, errorCode }`: nunca el texto
 * de PostgreSQL. La autenticación la hace antes `registerAuthMiddleware`.
 */
import { zValidator } from '@hono/zod-validator';
import type { Hono } from 'hono';
import * as z from 'zod';

import { isValidTimeZone } from '@pymekit/cms-shared/preferences';

import { createAccountService } from '../services/account.service';
import {
  invalidSettingsInput,
  respondWithSettingsError,
} from './settings-responses';

const UpdatePreferencesSchema = z
  .object({ timezone: z.string().max(64).refine(isValidTimeZone) })
  .strict();

export function registerUpdatePreferencesRouter(router: Hono) {
  return router.post(
    '/v1/account/preferences',
    // Entrada no válida → 400 con `SETTINGS_INVALID_DATA`, no el volcado de Zod.
    zValidator('json', UpdatePreferencesSchema, invalidSettingsInput('SETTINGS')),
    async (c) => {
      try {
        const preferences = await createAccountService(
          c.get('drizzle'),
        ).updatePreferences(c.req.valid('json'));

        return c.json({ success: true as const, data: { preferences } });
      } catch (error) {
        // Traduce el error a estado + código estable y deja el detalle en el log.
        return respondWithSettingsError(c, error, {
          fallback: 'SETTINGS_ACTION_FAILED',
          logContext: { route: 'preferences' },
        });
      }
    },
  );
}

// El tipo de la ruta alimenta al cliente RPC (solo con `import type`).
export type UpdatePreferencesRoute = ReturnType<
  typeof registerUpdatePreferencesRouter
>;
```

Si la acción necesita un permiso del RBAC del CMS, compruébalo antes para responder un 403 con código (la RLS lo vuelve a impedir):

```typescript
const canUpdate = await createAuthorizationService(c).hasAdminPermission(
  'system_setting',
  'update',
);

if (!canUpdate) {
  return c.json(
    { success: false as const, error: 'Forbidden', errorCode: CMS_API_ERROR_CODES.SETTINGS_PERMISSION_DENIED },
    403,
  );
}
```

Registro: exporta la ruta desde `src/api/routes/index.ts` (export `./routes` del paquete) y llama a su `register...` dentro de `registerFeatureRoutes()` en `packages/cms/api/src/server.ts`. La web la sirve en `/api/cms/v1/...` desde `apps/web/src/routes/api/cms/$.ts`.

### B.3 Consumidor: cliente RPC (`packages/cms/ui-core/src/settings-api.ts`)

```typescript
/**
 * Llamadas de la interfaz a Ajustes. Solo importa el TIPO de la ruta: el
 * código de servidor no llega al navegador. El `fetch` se inyecta desde la
 * web (`cmsFetch`, isomorfo: en el SSR llama a Hono en el mismo proceso).
 */
import {
  createHonoClient,
  handleHonoClientResponse,
} from '@pymekit/cms-api/client';
import type { UpdatePreferencesRoute } from '@pymekit/cms-settings/routes';

export function createSettingsApi(clientOptions: { fetch?: typeof fetch }) {
  return {
    /** Lanza `ApiError` (con `status` y `errorCode`) si la API falla. */
    async updatePreferences(data: { timezone?: string }) {
      const client = createHonoClient<UpdatePreferencesRoute>(clientOptions);

      return handleHonoClientResponse(
        await client.v1.account.preferences.$post({ json: data }),
      );
    },
  };
}
```

`createCmsApi` incorpora estas funciones; los componentes las usan con `useCmsApi().api` dentro de `useMutation` y las rutas con `cmsQueries.*` (`queryOptions`) en sus `loader`. Ver la skill `react-form-builder`.

```

---

## C. Patrones comunes

### C.1 Servicio con varias dependencias

```typescript
/**
 * Servicio de facturas en PDF.
 *
 * Necesita la base de datos y el almacenamiento; ambos se inyectan para
 * poder sustituirlos por dobles en los tests.
 */
interface InvoiceServiceDeps {
  client: SupabaseClient<Database>;
  storage: SupabaseClient<Database>['storage'];
}

export function createInvoiceService(deps: InvoiceServiceDeps) {
  return new InvoiceService(deps);
}

// Adaptador:
const client = getSupabaseServerClient();
const service = createInvoiceService({ client, storage: client.storage });
```

### C.2 Servicio que compone otros servicios

El árbol de dependencias se monta en el adaptador; el servicio compuesto solo conoce los tipos.

```typescript
interface OnboardingServiceDeps {
  projects: ReturnType<typeof createProjectService>;
  notifications: ReturnType<typeof createNotificationService>;
}

class OnboardingService {
  constructor(private readonly deps: OnboardingServiceDeps) {}

  /**
   * Prepara una cuenta nueva: crea su primer proyecto y avisa al usuario.
   */
  async onboardAccount(params: { accountId: string; projectName: string }) {
    const project = await this.deps.projects.create({
      name: params.projectName, // viene traducido desde la UI
      accountId: params.accountId,
    });

    await this.deps.notifications.send({
      accountId: params.accountId,
      type: 'welcome',
      data: { projectId: project.id },
    });

    return { project };
  }
}

// En la server function:
const client = getSupabaseServerClient();
const service = createOnboardingService({
  projects: createProjectService(client),
  notifications: createNotificationService(client),
});
```

### C.3 Lógica pura (sin E/S)

Es el caso más simple: una función, sin clase ni dependencias. En el CMS va en `src/api/utils/` (servidor) o en `packages/cms/<feature>-ui/src/utils/` (cliente), siempre con tests.

```typescript
/**
 * Calcula el precio de un plan según asientos y periodicidad.
 *
 * Los importes están en céntimos para evitar errores de coma flotante.
 */
export function calculatePricing(input: {
  plan: 'starter' | 'pro' | 'enterprise';
  seats: number;
  billingPeriod: 'monthly' | 'yearly';
}) {
  const basePrices = { starter: 900, pro: 2900, enterprise: 9900 };
  const unitPrice = basePrices[input.plan];
  const yearlyDiscount = input.billingPeriod === 'yearly' ? 0.2 : 0;
  const seatDiscount = input.seats >= 10 ? 0.1 : 0;
  // El descuento acumulado se limita al 30 % por política comercial.
  const discount = Math.min(yearlyDiscount + seatDiscount, 0.3);
  const total = Math.round(unitPrice * input.seats * (1 - discount));

  return { unitPrice, total, discount, currency: 'eur' };
}

it('aplica el descuento anual', () => {
  const result = calculatePricing({ plan: 'pro', seats: 1, billingPeriod: 'yearly' });

  expect(result.discount).toBe(0.2);
  expect(result.total).toBe(2320); // 2900 * 0,8
});
```

### C.4 Tests con cliente Supabase simulado (web)

```typescript
/**
 * Doble del cliente Supabase para tests unitarios de servicios.
 *
 * Imita el *query builder* encadenable: cada método devuelve la propia
 * cadena y, al hacer `await` (o llamar a `single`/`maybeSingle`), se
 * resuelve con `resolvedValue`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { vi } from 'vitest';

export function createMockSupabaseClient(
  resolvedValue: { data: unknown; error: unknown } = { data: null, error: null },
) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};

  const methods = [
    'select', 'insert', 'update', 'upsert', 'delete',
    'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in',
    'like', 'ilike', 'is', 'order', 'limit', 'range',
  ];

  for (const method of methods) {
    chain[method] = vi.fn().mockReturnThis();
  }

  chain.single = vi.fn().mockResolvedValue(resolvedValue);
  chain.maybeSingle = vi.fn().mockResolvedValue(resolvedValue);

  // Las cadenas que no terminan en single/maybeSingle se resuelven al
  // hacer `await`, así que simulamos un *thenable*.
  const chainProxy = new Proxy(chain, {
    get(target, prop) {
      if (prop === 'then') {
        return (resolve: (value: unknown) => void) => resolve(resolvedValue);
      }

      return target[prop as string];
    },
  });

  return {
    from: vi.fn(() => chainProxy),
    chain,
  } as unknown as SupabaseClient & { chain: typeof chain };
}

it('lista los proyectos de una cuenta', async () => {
  const projects = [{ id: '1', name: 'Alfa', account_id: 'acc-1' }];
  const client = createMockSupabaseClient({ data: projects, error: null });

  const result = await createProjectService(client).list('acc-1');

  expect(result).toEqual(projects);
  expect(client.from).toHaveBeenCalledWith('projects');
  expect(client.chain.eq).toHaveBeenCalledWith('account_id', 'acc-1');
});
```

### C.5 Tests con cliente Drizzle simulado (CMS)

Como el servicio recibe `DrizzleSupabaseClient`, basta con un `runTransaction` que ejecute el *callback* con una transacción falsa:

```typescript
it('lanza SETTINGS_PERMISSION_DENIED si RLS no deja ver la cuenta', async () => {
  // La consulta encadenada termina en `.for('update')`, que devuelve 0 filas.
  const tx = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    for: vi.fn().mockResolvedValue([]),
  };

  const db = {
    runTransaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  } as unknown as DrizzleSupabaseClient;

  await expect(
    createAccountService(db).updatePreferences({ timezone: 'UTC' }),
  ).rejects.toMatchObject({ code: 'SETTINGS_PERMISSION_DENIED' });
});
```

Las consultas complejas (filtros dinámicos, SQL generado) se prueban mejor como funciones puras en `src/utils/__tests__/`, y el comportamiento de RLS con tests pgTAP en `apps/web/supabase/tests`.
