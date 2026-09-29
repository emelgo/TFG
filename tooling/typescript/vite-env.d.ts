/**
 * Ambient typings for Vite's `import.meta.env`, shared across every workspace
 * package via `@pymekit/tsconfig`'s `base.json` (`compilerOptions.types`).
 *
 * Vite statically inlines `import.meta.env.VITE_*` (and its built-ins) into
 * every module it bundles, including workspace packages. The values only exist
 * as types here — there is no runtime cost. Because `apps/web` was the only
 * project pulling in `vite/client`, packages previously cast
 * `import.meta as unknown as { env: ... }` at each call site. Declaring the
 * shape here once removes those casts and gives autocomplete + a single source
 * of truth for the public (client-inlined) env vars.
 *
 * NOTE: only `VITE_`-prefixed vars are exposed to bundled code. Server-only
 * secrets are read from `process.env` and must NOT be added here.
 */
interface ImportMetaEnv {
  // Vite built-ins
  readonly MODE: string;
  readonly BASE_URL: string;
  readonly PROD: boolean;
  readonly DEV: boolean;
  readonly SSR: boolean;

  // App / site
  readonly VITE_PRODUCT_NAME?: string;
  readonly VITE_SITE_TITLE?: string;
  readonly VITE_SITE_DESCRIPTION?: string;
  readonly VITE_SITE_URL?: string;
  readonly VITE_APP_HOME_PATH?: string;
  readonly VITE_DEFAULT_LOCALE?: string;
  readonly VITE_LANGUAGE_PRIORITY?: string;
  readonly VITE_CI?: string;

  // Theme
  readonly VITE_DEFAULT_THEME_MODE?: string;
  readonly VITE_ENABLE_THEME_TOGGLE?: string;
  readonly VITE_THEME_COLOR?: string;
  readonly VITE_THEME_COLOR_DARK?: string;

  // Layout / navigation
  readonly VITE_SIDEBAR_COLLAPSIBLE_STYLE?: string;
  readonly VITE_HOME_SIDEBAR_COLLAPSED?: string;
  readonly VITE_USER_NAVIGATION_STYLE?: string;

  // Auth
  readonly VITE_AUTH_PASSWORD?: string;
  readonly VITE_AUTH_MAGIC_LINK?: string;
  readonly VITE_AUTH_OTP?: string;
  readonly VITE_AUTH_PASSKEY?: string;
  readonly VITE_AUTH_IDENTITY_LINKING?: string;
  readonly VITE_CAPTCHA_SITE_KEY?: string;
  readonly VITE_CAPTCHA_WIDGET_SIZE?: string;
  readonly VITE_DISPLAY_TERMS_AND_CONDITIONS_CHECKBOX?: string;
  readonly VITE_PASSWORD_REQUIRE_UPPERCASE?: string;
  readonly VITE_PASSWORD_REQUIRE_NUMBERS?: string;
  readonly VITE_PASSWORD_REQUIRE_SPECIAL_CHARS?: string;

  // Account mode: personal-only | organizations-only | hybrid (default hybrid).
  // Single source of truth for which account surfaces exist; the team-account
  // feature flags are derived from it.
  readonly VITE_ACCOUNT_MODE?:
    | 'personal-only'
    | 'organizations-only'
    | 'hybrid';

  // Feature flags
  readonly VITE_ENABLE_PERSONAL_ACCOUNT_DELETION?: string;
  readonly VITE_ENABLE_PERSONAL_ACCOUNT_BILLING?: string;
  readonly VITE_ENABLE_TEAM_ACCOUNTS_CREATION?: string;
  readonly VITE_ENABLE_TEAM_ACCOUNTS_DELETION?: string;
  readonly VITE_ENABLE_TEAM_ACCOUNTS_BILLING?: string;
  readonly VITE_ENABLE_NOTIFICATIONS?: string;
  readonly VITE_REALTIME_NOTIFICATIONS?: string;
  readonly VITE_ENABLE_VERSION_UPDATER?: string;
  readonly VITE_VERSION_UPDATER_REFETCH_INTERVAL_SECONDS?: string;

  // Supabase (public keys only)
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLIC_KEY?: string;

  // Billing / monitoring
  readonly VITE_BILLING_PROVIDER?: string;
  readonly VITE_STRIPE_PUBLISHABLE_KEY?: string;
  readonly VITE_MONITORING_PROVIDER?: string;

  // Keystatic (public keys only)
  readonly VITE_KEYSTATIC_CONTENT_PATH?: string;
  readonly VITE_KEYSTATIC_STORAGE_KIND?: string;
  readonly VITE_KEYSTATIC_STORAGE_REPO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
