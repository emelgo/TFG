# Pruebas end-to-end (`apps/e2e`)

Pruebas Playwright de los flujos de usuario de la app web. El paquete se llama `web-e2e`.

## Skills

Para implementar pruebas E2E:
- `/playwright-e2e`: patrones de prueba y *Page Objects*.

## Ejecución

```bash
# Un solo fichero (preferible)
pnpm --filter web-e2e exec playwright test <nombre> --workers=1

# Todas las pruebas
pnpm test
```

- Las pruebas de facturación solo se ejecutan con `ENABLE_BILLING_TESTS=true` (si no, `playwright.config.ts` ignora `*-billing.spec.ts`).
- Las pruebas de equipos e invitaciones se desactivan con `ENABLE_TEAM_ACCOUNT_TESTS=false`.
- `tests/auth.setup.ts` prepara el estado de sesión (`pnpm --filter web-e2e test:setup`).

## Patrón Page Object (obligatorio)

Cada área tiene su *Page Object* en un fichero `*.po.ts` que encapsula los selectores y las acciones; las especificaciones (`*.spec.ts`) solo lo usan.

```typescript
export class AuthPageObject {
  constructor(private readonly page: Page) {}

  async signIn(params: { email: string; password: string }) {
    await this.page.fill('input[name="email"]', params.email);
    await this.page.fill('input[name="password"]', params.password);
    await this.page.click('button[type="submit"]');
  }
}
```

## Selectores

Se usan siempre atributos `data-testid`:

```typescript
await this.page.click('[data-testid="submit-button"]');
await this.page.getByTestId('submit-button').click();
```

## Fiabilidad con `toPass()`

Las esperas sobre respuestas de red o estados asíncronos se envuelven en `toPass()` para que Playwright las reintente:

```typescript
await expect(async () => {
  const response = await this.page.waitForResponse(
    (resp) => resp.url().includes('auth/v1/user'),
  );
  expect(response.status()).toBe(200);
}).toPass();
```

## Organización

```
tests/
├── account/ authentication/ admin/ invitations/
├── team-accounts/ team-billing/ user-billing/
├── auth.setup.ts      # Estado de sesión compartido
├── <área>/*.po.ts     # Page Objects
└── utils/             # Utilidades comunes (buzón de correo, OTP, Stripe, …)
```
