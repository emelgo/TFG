# Ejemplos de servicios

Parte A: variante **web** (Supabase + *server functions*). Parte B: variante **CMS API** (Drizzle + Hono). Parte C: patrones comunes y tests.

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

## B. CMS API: servicio Drizzle + ruta Hono

### B.1 Servicio

```typescript
/**
 * Servicio de cuentas de miembros del CMS.
 *
 * Lee y modifica las cuentas del panel con Drizzle. Todas las consultas
 * pasan por `runTransaction`, que fija en la transacción los *claims* del
 * JWT del usuario y su rol: así las políticas RLS se aplican igual que si
 * la consulta viniera del cliente Supabase.
 */
import { eq } from 'drizzle-orm';

import type { DrizzleSupabaseClient } from '@pymekit/cms-supabase/client';
import { accountsInCms } from '@pymekit/cms-supabase/schema';

export function createMemberAccountService(db: DrizzleSupabaseClient) {
  return new MemberAccountService(db);
}

class MemberAccountService {
  constructor(private readonly db: DrizzleSupabaseClient) {}

  /**
   * Actualiza el nombre visible y el email mostrado de una cuenta.
   *
   * Si el usuario no tiene permiso, RLS no actualiza ninguna fila y se
   * lanza un error para que la ruta responda con un código adecuado.
   */
  async updateAccount(id: string, data: { displayName: string; email: string }) {
    const updated = await this.db.runTransaction((tx) =>
      tx
        .update(accountsInCms)
        .set({ metadata: { display_name: data.displayName, email: data.email } })
        .where(eq(accountsInCms.id, id))
        .returning({ id: accountsInCms.id }),
    );

    if (updated.length === 0) {
      throw new Error('Account not found or not allowed');
    }
  }
}
```

> Los nombres `@pymekit/cms-supabase` y `accountsInCms` dependen de cómo se porten el paquete y el esquema SQL del CMS en F2 (ver `docs/tfg/DECISIONES.md`). Compruébalos antes de copiar el ejemplo.

### B.2 Adaptador: ruta Hono

```typescript
/**
 * Ruta de actualización de la cuenta de un miembro del CMS.
 *
 * Es código SOLO de servidor: se registra en `apps/cms-api` y la SPA la
 * consume a través del cliente RPC tipado con `UpdateAccountRoute`.
 */
import { zValidator } from '@hono/zod-validator';
import type { Hono } from 'hono';
import * as z from 'zod';

import { createAuthorizationService } from '@pymekit/cms-auth/services';
import { getLogger } from '@pymekit/cms-shared/logger';
import { getErrorMessage } from '@pymekit/cms-shared/utils';

import { createMemberAccountService } from '../services/member-account.service';

const UpdateAccountSchema = z.object({
  displayName: z.string().max(500),
  email: z.email(),
});

export function registerUpdateAccountRouter(router: Hono) {
  return router.put(
    '/v1/members/:id',
    zValidator('json', UpdateAccountSchema),
    async (c) => {
      const logger = await getLogger();
      const { id } = c.req.param();
      const body = c.req.valid('json');

      // Además de RLS, comprobamos el permiso del CMS para devolver un 403
      // claro en lugar de un fallo genérico de la transacción.
      const canUpdate = await createAuthorizationService(c).hasAdminPermission(
        'account',
        'update',
      );

      if (!canUpdate) {
        return c.json({ error: 'Forbidden' }, 403);
      }

      try {
        await createMemberAccountService(c.get('drizzle')).updateAccount(id, body);

        return c.json({ success: true });
      } catch (error) {
        logger.error({ id, error }, 'Error updating account');

        return c.json({ error: getErrorMessage(error) }, 500);
      }
    },
  );
}

// El tipo de la ruta alimenta al cliente RPC de la SPA.
export type UpdateAccountRoute = ReturnType<typeof registerUpdateAccountRouter>;
```

Registro en el servidor (nunca en la SPA):

```typescript
// apps/cms-api/app/routes.ts
import { registerUpdateAccountRouter } from '@pymekit/cms-settings/routes';

registerUpdateAccountRouter(router);
```

### B.3 Consumidor: *action* de la SPA

```typescript
/**
 * Llama a la ruta de actualización de cuentas desde la SPA del CMS.
 *
 * Solo importa el TIPO de la ruta; el código de servidor no llega al bundle.
 * `@pymekit/cms-api` es el paquete del cliente RPC (packages/cms/api), no
 * la app `apps/cms-api`.
 */
import { createHonoClient, handleHonoClientResponse } from '@pymekit/cms-api';

import type { UpdateAccountRoute } from '../api/routes';

export async function updateAccountAction(
  accountId: string,
  data: { displayName: string; email: string },
) {
  const client = createHonoClient<UpdateAccountRoute>();

  const response = await client['v1']['members'][':id']['$put']({
    param: { id: accountId },
    json: data,
  });

  return handleHonoClientResponse(response);
}
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

Es el caso más simple: una función, sin clase ni dependencias. En el CMS va en `src/utils/`.

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
it('falla si RLS no deja actualizar ninguna fila', async () => {
  const tx = {
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
  };

  const db = {
    runTransaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  } as unknown as DrizzleSupabaseClient;

  await expect(
    createMemberAccountService(db).updateAccount('acc-1', {
      displayName: 'Ana',
      email: 'ana@pymekit.test',
    }),
  ).rejects.toThrow();
});
```

Las consultas complejas (filtros dinámicos, SQL generado) se prueban mejor como funciones puras en `src/utils/__tests__/`, y el comportamiento de RLS con tests pgTAP en `apps/web/supabase/tests`.
