# Patrones E2E de PymeKit

Ejemplos reales: `apps/e2e/tests/` (web) y `apps/e2e/tests/cms/` (CMS, p. ej. `cms-settings-general.spec.ts` con `settings.po.ts`). Referencia externa (solo lectura): `../makerkit/apps/e2e/tests/`.

## Estructura de `apps/e2e` (paquete `web-e2e`)

Una sola configuración de Playwright: proyecto `setup` (`tests/auth.setup.ts`, genera las sesiones en `.auth/`) y proyecto `chromium`, que depende de él. `baseURL` es `http://localhost:3100`.

```
apps/e2e/
├── playwright.config.ts
├── .auth/                        # storageState generados por el setup (en .gitignore)
└── tests/
    ├── auth.setup.ts             # test, owner, super-admin (MFA) y cms-staff
    ├── authentication/           # auth.po.ts + *.spec.ts
    ├── account/  admin/  team-accounts/  invitations/
    ├── user-billing/  team-billing/   # *-billing.spec.ts: solo con ENABLE_BILLING_TESTS=true
    ├── cms/                      # cms-*.spec.ts + *.po.ts (settings, data-explorer, dashboards…)
    └── utils/                    # auth-state.ts, server-fn.ts, mailbox.ts, otp.po.ts…
```

## Selectores

Usa siempre el atributo **`data-testid`** (es el que se usa en toda la web y el CMS; nunca `data-test`):

```typescript
await page.getByTestId('submit-button').click();
await page.click('[data-testid="submit-button"]');
```

### Web (`apps/web`)

```typescript
// Menú del espacio de trabajo (cabecera de la barra lateral)
'[data-testid="workspace-dropdown-trigger"]'   // Abre el menú
'[data-testid="workspace-switch-submenu"]'     // Submenú para cambiar de espacio
'[data-testid="workspace-switch-content"]'     // Lista de espacios
'[data-testid="workspace-team-item"]'          // Cada equipo de la lista
'[data-testid="create-team-trigger"]'          // Botón de crear equipo
'[data-testid="workspace-sign-out"]'           // Cerrar sesión

// Formularios de equipo y cuenta
'[data-testid="create-team-form"]'
'[data-testid="team-name-input"]'
'[data-testid="update-team-account-name-form"]'
'[data-testid="update-account-name-form"]'

// MFA
'[data-input-otp]'
'[data-testid="submit-mfa-button"]'
```

### CMS (`/admin/cms`)

```typescript
// Ajustes
'[data-testid="general-settings-form"]'
'[data-testid="general-settings-submit"]'
'[data-testid="member-manage-role"]'
'[data-testid="member-role-dialog"]'

// Explorador de datos: una celda por columna
'[data-testid="cell-created_at"]'
```

En el CMS muchas vistas son tablas: combina roles y filtros en lugar de índices frágiles.

```typescript
getMemberRow(name: string) {
  return this.page.getByRole('table').getByRole('row').filter({ hasText: name });
}
```

## Usuarios de prueba y sesiones

### Web

Los usuarios vienen de la semilla de Supabase (`apps/web/supabase/seed.sql`). La contraseña por defecto es `testingpassword`.

```typescript
/**
 * Rutas de los `storageState` generados por `auth.setup.ts`.
 *
 * Se reutilizan en los specs para no repetir el inicio de sesión en cada
 * test, que es la parte más lenta y más propensa a fallos intermitentes.
 */
export const AUTH_STATES = {
  TEST_USER: join(cwd(), '.auth/test@pymekit.test.json'),
  OWNER_USER: join(cwd(), '.auth/owner@pymekit.test.json'),
  SUPER_ADMIN: join(cwd(), '.auth/super-admin@pymekit.test.json'),
  // Personal de soporte del CMS con MFA verificado (ver el seed).
  CMS_STAFF: join(cwd(), '.auth/cms-staff@pymekit.test.json'),
} as const;

// En un spec:
AuthPageObject.setupSession(AUTH_STATES.OWNER_USER);
```

El superadministrador tiene MFA obligatorio: `loginAsSuperAdmin` rellena el código TOTP a partir de `AuthPageObject.MFA_KEY`.

### CMS

No hay *setup* propio: el CMS usa las sesiones de la web. `SUPER_ADMIN` (MFA verificado, acceso total) y `CMS_STAFF` (`cms-staff@pymekit.test`, rol «Soporte», MFA verificado) están en `AUTH_STATES`.

```typescript
test.describe('Ajustes > General: personal de soporte', () => {
  AuthPageObject.setupSession(AUTH_STATES.CMS_STAFF);
  // …
});
```

**No cambies los usuarios de la semilla** (rol, estado, MFA): otros tests en paralelo dependen de ellos. Crea un miembro temporal con prefijo único y bórralo al final:

```typescript
// Prefijo único por ejecución: la limpieza solo borra lo de este fichero.
const RUN_ID = `e2e-cms-members-${Date.now()}`;

// Usuario de Auth con la clave de servicio LOCAL (ignora RLS).
const { data: created } = await getAdminClient().auth.admin.createUser({
  email: `${RUN_ID}-member@pymekit.test`,
  password: 'Passw0rdE2E',
  email_confirm: true,
});

// El acceso al CMS se concede por la API: así se crea su cuenta del CMS.
const grant = await page.request.put(
  `/api/cms/v1/admin/users/${created.user!.id}/admin-access`,
  { data: { adminAccess: true } },
);
expect(grant.status()).toBe(200);

test.afterAll(async () => {
  // Borra los usuarios cuyo email empieza por RUN_ID.
});
```

## Page Object de autenticación

### Web

```typescript
/**
 * Page Object de autenticación de `apps/web`.
 *
 * Agrupa los pasos de registro, inicio de sesión y MFA para que los specs
 * describan el flujo de negocio y no los detalles del formulario.
 */
export class AuthPageObject {
  static MFA_KEY = '<clave TOTP del superadministrador de la semilla>';

  constructor(private readonly page: Page) {}

  static setupSession(state: string) {
    test.use({ storageState: state });
  }

  async signIn(params: { email: string; password: string }) {
    await this.page.fill('input[name="email"]', params.email);
    await this.page.fill('input[name="password"]', params.password);
    await this.page.click('button[type="submit"]');
  }

  async loginAsUser(params: { email: string; password?: string; next?: string }) {
    await this.page.goto(`/auth/sign-in${params.next ? `?next=${params.next}` : ''}`);
    await this.signIn({ email: params.email, password: params.password ?? 'testingpassword' });
    await this.page.waitForURL(params.next ?? '**/dashboard');
  }

  /**
   * Crea un usuario ya confirmado con la API de administración de Supabase.
   *
   * Evita pasar por el flujo de registro y el correo de confirmación cuando
   * el test no trata sobre ellos. Usa la clave secreta LOCAL de Supabase:
   * nunca apuntes esto a un entorno real.
   */
  async bootstrapUser({ email, password, name }: { email: string; password?: string; name: string }) {
    const client = createClient('http://127.0.0.1:54321', '<SUPABASE_SECRET_KEY local>');

    const { data, error } = await client.auth.admin.createUser({
      email,
      password: password ?? 'testingpassword',
      email_confirm: true,
      user_metadata: { name },
    });

    if (error) {
      throw new Error(`Failed to create user: ${error.message}`);
    }

    return data;
  }

  createRandomEmail() {
    return `${(Math.random() * 1e13).toFixed(0)}@pymekit.test`;
  }
}
```

### CMS

El CMS no tiene inicio de sesión propio: usa la sesión de la web (`loginAsSuperAdmin`, `loginAsCmsStaff` de `AuthPageObject`). El acceso exige `app_metadata.cms_access` y MFA (aal2); para crear usuarios del CMS concede el acceso con la API (`PUT /api/cms/v1/admin/users/:id/admin-access`), nunca escribiendo `app_metadata` a mano.

## Patrones de fiabilidad

### Server functions (web)

Las *server functions* de TanStack Start no se envían a la URL de la página, sino a `/_serverFn/<id>`. Usa el ayudante `tests/utils/server-fn.ts`:

```typescript
const response = page.waitForResponse((res) =>
  isServerFnResponse(res, { method: 'POST', status: 200 }),
);

await page.getByTestId('update-account-submit').click();
await response;
```

Si la función lanza `redirect()`, responde `307`: en ese caso omite `status`.

### API del CMS

Al esperar una mutación desde la UI, registra la espera **antes** del clic:

```typescript
const saved = page.waitForResponse(
  (res) =>
    res.url().includes('/api/cms/v1/account/preferences') &&
    res.request().method() === 'POST',
);
await page.getByTestId('general-settings-submit').click();
expect((await saved).status()).toBe(200);
```

Al probar la API directamente con `page.request` (usa las *cookies* de la sesión), comprueba el **código estable** además del estado: dos rechazos distintos pueden compartir 400/403.

```typescript
const response = await page.request.post('/api/cms/v1/account/preferences', {
  data: { timezone: 'Mars/Olympus_Mons' },
});

expect(response.status()).toBe(400);
expect(await response.json()).toMatchObject({
  errorCode: 'SETTINGS_INVALID_DATA',
});
```

Escrituras **sin cuerpo JSON** (`DELETE`, `POST` vacío) o **`multipart`**: el filtro CSRF de Hono exige `Origin`.

```typescript
// Sin cuerpo, el navegador enviaría Origin; `page.request` no lo hace.
const SAME_ORIGIN = { origin: 'http://localhost:3100' };

await page.request.delete(`/api/cms/v1/permissions/roles/${roleId}`, {
  headers: SAME_ORIGIN,
});
```

Si una prueba cambia algo compartido (p. ej. las preferencias del super-admin), restáuralo en `finally` y marca el `describe` como `serial`.

### Correo y OTP (Mailpit en `http://127.0.0.1:54324`)

```typescript
await expect(async () => {
  const otpCode = await this.getOtpCodeFromEmail(email);
  expect(otpCode).not.toBeNull();
  await this.enterOtpCode(otpCode);
}).toPass();
```

### Verificación MFA

```typescript
// El código TOTP caduca cada 30 s; reintentamos con intervalos crecientes
// por si el test cae justo en el cambio de ventana.
await expect(async () => {
  await auth.submitMFAVerification(AuthPageObject.MFA_KEY);
}).toPass({
  intervals: [500, 2500, 5000, 7500, 10_000, 15_000, 20_000],
});
```

## Ejecución

**Siempre contra la build de test**, no contra `pnpm dev` (el *setup* de autenticación falla en desarrollo). Requisitos: Supabase local levantado.

```bash
# 1. Build y servidor de test (puerto 3100)
pnpm --filter web build:test
pnpm --filter web start:test          # o PLAYWRIGHT_SERVER_COMMAND para que lo arranque Playwright

# 2. Un fichero o carpeta (forma preferida)
pnpm --filter web-e2e exec playwright test cms/cms-settings-general --workers=1

# Modo UI / depuración
pnpm --filter web-e2e exec playwright test --ui
pnpm --filter web-e2e exec playwright test --debug

# Tests de facturación (desactivados por defecto)
ENABLE_BILLING_TESTS=true pnpm --filter web-e2e exec playwright test billing
```

Vuelve a hacer `build:test` tras cambiar código de la web o de `packages/*`: el servidor de test no recarga.

### Inestables conocidos (*flaky*) bajo `--workers=4`

Pasan en serie (`--workers=1`) y están pendientes de estabilizar (ver `docs/tfg/PROGRESO.md`): admin «ban user flow», «MFA configured but not verified», «delete team account flow», dos de autenticación y `cms-display-formats` › membresía enlazada a la cuenta. Si falla uno de ellos con carga, repítelo en serie antes de investigar.
