# Patrones E2E de PymeKit

Referencias de código real (solo lectura): `../makerkit/apps/e2e/tests/` para la web y `../supamode/apps/e2e/src/` para el CMS.

## Estructura de `apps/e2e`

Una sola configuración de Playwright con un proyecto por app. Cada proyecto tiene su propio `setup` (que genera las sesiones) y su propia `baseURL`.

```
apps/e2e/
├── playwright.config.ts
├── .env                          # TEST_* del CMS (ver .env.template)
├── .auth/                        # storageState generados por los setup (en .gitignore)
└── tests/
    ├── web/
    │   ├── auth.setup.ts
    │   ├── authentication/       # auth.po.ts + *.spec.ts
    │   ├── account/
    │   ├── team-accounts/
    │   ├── invitations/
    │   ├── user-billing/         # *-billing.spec.ts: solo con ENABLE_BILLING_TESTS=true
    │   ├── team-billing/
    │   └── utils/                # auth-state.ts, server-fn.ts, mailbox.ts, otp.po.ts…
    └── cms/
        ├── setup/auth.setup.ts   # resetea la BD de demo y genera sesiones
        ├── auth/                 # auth.po.ts + auth.spec.ts
        ├── data-explorer/
        ├── settings/             # members/, permissions/, resources/, general/
        └── audit-logs/
```

```typescript
/**
 * Configuración de Playwright para las dos apps de PymeKit.
 *
 * Cada app tiene su propio proyecto de `setup` porque las sesiones no son
 * intercambiables: la web usa cookies de TanStack Start y el CMS exige
 * además el permiso de acceso al panel en `app_metadata`.
 */
projects: [
  { name: 'setup-web', testMatch: /web\/.*\.setup\.ts/ },
  {
    name: 'web',
    testDir: './tests/web',
    testMatch: /.*\.spec\.ts/,
    use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:3000' },
    dependencies: ['setup-web'],
  },
  { name: 'setup-cms', testMatch: /cms\/.*\.setup\.ts/ },
  {
    name: 'cms',
    testDir: './tests/cms',
    testMatch: /.*\.spec\.ts/,
    use: {
      ...devices['Desktop Chrome'],
      baseURL: 'http://localhost:5173',
      // Las animaciones de diálogos y menús provocan clics fallidos.
      contextOptions: { reducedMotion: 'reduce' },
    },
    dependencies: ['setup-cms'],
  },
],
```

> Puertos: en las referencias `apps/web` y la API del CMS usan ambos el `3000`. En PymeKit `apps/cms-api` debe usar otro puerto (y el *proxy* `/api` de Vite en `apps/cms` debe apuntar a él). Comprueba el valor real en `apps/cms-api` antes de fijarlo en los tests.

## Selectores

Usa siempre el atributo **`data-testid`** (es el que emplean las dos apps; nunca `data-test`):

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

### CMS (`apps/cms`)

```typescript
// Inicio de sesión
'[data-testid="email-input"]'
'[data-testid="password-input"]'
'[data-testid="auth-submit-button"]'

// Miembros
'[data-testid="members-search-input"]'
'[data-testid="member-actions"]'
'[data-testid="member-details-edit-account-form"]'
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
} as const;

// En un spec:
AuthPageObject.setupSession(AUTH_STATES.OWNER_USER);
```

El superadministrador tiene MFA obligatorio: `loginAsSuperAdmin` rellena el código TOTP a partir de `AuthPageObject.MFA_KEY`.

### CMS

Las credenciales se leen de `apps/e2e/.env` (`TEST_ROOT_EMAIL`, `TEST_ADMIN_EMAIL`, `TEST_READONLY_EMAIL`, `TEST_PASSWORD`), con valores de ejemplo como `root@pymekit.test`. El `setup` resetea antes la base de datos de demostración.

```typescript
test.describe('Gestión de miembros', () => {
  test.use({ storageState: '.auth/cms/root.json' });
  // …
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

```typescript
async loginAsUser(email: string, password: string) {
  await this.page.goto('/auth/sign-in', { waitUntil: 'commit' });

  await this.page.getByTestId('email-input').fill(email);
  await this.page.getByTestId('password-input').fill(password);
  await this.page.getByTestId('auth-submit-button').click();

  await this.page.waitForURL('/', { waitUntil: 'commit' });
}
```

Para crear usuarios del CMS no basta con `auth.admin.createUser`: hay que marcar el acceso al panel en `app_metadata` e insertar la cuenta del CMS con el cliente Drizzle de administración (ver `../supamode/apps/e2e/src/auth/auth.po.ts`).

## Patrones de fiabilidad

### Server functions (web)

Las *server functions* de TanStack Start no se envían a la URL de la página, sino a `/_serverFn/<id>`. Usa el ayudante `tests/web/utils/server-fn.ts`:

```typescript
const response = page.waitForResponse((res) =>
  isServerFnResponse(res, { method: 'POST', status: 200 }),
);

await page.getByTestId('update-account-submit').click();
await response;
```

Si la función lanza `redirect()`, responde `307`: en ese caso omite `status`.

### API del CMS

```typescript
const response = page.waitForResponse(
  (res) => res.url().includes('/api/v1/members/') && res.request().method() === 'PUT',
);
```

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

Requisitos: Supabase local levantado y las apps en marcha (`pnpm dev`), o `PLAYWRIGHT_SERVER_COMMAND` definido para que Playwright las arranque.

```bash
# Un fichero o carpeta, solo la web (forma preferida)
pnpm --filter e2e exec playwright test --project=web authentication --workers=1

# Solo el CMS
pnpm --filter e2e exec playwright test --project=cms settings/members --workers=1

# Modo UI / depuración
pnpm --filter e2e exec playwright test --ui
pnpm --filter e2e exec playwright test --debug

# Tests de facturación (desactivados por defecto)
ENABLE_BILLING_TESTS=true pnpm --filter e2e exec playwright test --project=web billing
```

> El nombre del paquete (`e2e`) y los nombres de proyecto se fijan al crear `apps/e2e` en F1/F2. Si cambian, actualiza esta sección.
