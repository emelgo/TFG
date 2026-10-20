# Guía de configuración de PymeKit

Esta guía explica cómo adaptar PymeKit a una pyme concreta **sin tocar el código de la plataforma**: qué ficheros de configuración hay, qué variables de entorno existen, qué módulos se pueden activar o desactivar, cómo cambiar la identidad visual, cómo añadir tablas propias al CMS y cómo crear paquetes nuevos con los generadores.

Para desplegar (Docker, Railway, Supabase en la nube, Stripe) consulta [`DESPLIEGUE.md`](DESPLIEGUE.md).

## Índice

1. [Ficheros de configuración (`apps/web/src/config`)](#1-ficheros-de-configuración-appswebsrcconfig)
2. [Variables de entorno](#2-variables-de-entorno)
3. [Interruptores de módulos](#3-interruptores-de-módulos)
4. [Identidad: nombre, logo y colores](#4-identidad-nombre-logo-y-colores)
5. [Roles y permisos](#5-roles-y-permisos)
6. [Planes de pago](#6-planes-de-pago)
7. [Añadir una tabla de negocio al CMS](#7-añadir-una-tabla-de-negocio-al-cms)
8. [Generadores de código](#8-generadores-de-código)

---

## 1. Ficheros de configuración (`apps/web/src/config`)

Cada fichero valida sus valores con Zod al arrancar, así que un valor erróneo hace fallar la *build* con un mensaje claro en lugar de romper la web en producción. La mayoría lee variables de entorno: lo normal es cambiar la variable, no el fichero.

| Fichero | Qué configura | Se cambia con |
|---|---|---|
| `app.config.ts` | Nombre del producto, título y descripción del sitio, URL pública, idioma, tema por defecto, colores del navegador y ruta de inicio tras el login | `VITE_PRODUCT_NAME`, `VITE_SITE_TITLE`, `VITE_SITE_DESCRIPTION`, `VITE_SITE_URL`, `VITE_DEFAULT_LOCALE`, `VITE_DEFAULT_THEME_MODE`, `VITE_THEME_COLOR`, `VITE_THEME_COLOR_DARK`, `VITE_APP_HOME_PATH` |
| `auth.config.ts` | Métodos de inicio de sesión (contraseña, enlace mágico, código OTP, *passkeys*, OAuth), CAPTCHA, casilla de términos y vinculación de identidades | `VITE_AUTH_*`, `VITE_CAPTCHA_SITE_KEY`, `VITE_DISPLAY_TERMS_AND_CONDITIONS_CHECKBOX`. Los proveedores OAuth (`oAuth: ['google']`) se editan en el fichero y se activan también en Supabase |
| `account-mode.config.ts` | Qué tipos de cuenta existen: solo personales, solo equipos o ambos | `VITE_ACCOUNT_MODE` (ver §3) |
| `feature-flags.config.ts` | Interruptores de funcionalidades derivados del modo de cuentas (borrado de cuentas, facturación, creación de equipos, notificaciones, tema…) | `VITE_ENABLE_*`, `VITE_REALTIME_NOTIFICATIONS`, `VITE_LANGUAGE_PRIORITY` |
| `billing.config.ts` | Proveedor de pago y catálogo de productos y planes | `VITE_BILLING_PROVIDER`, `VITE_STRIPE_PRICE_*`; los planes se editan en el fichero (ver §6) |
| `paths.config.ts` | Rutas de la aplicación (login, registro, ajustes, facturación…) | Editando el fichero, si se renombran rutas |
| `navigation.config.tsx` | Menú del área privada | Editando el fichero; estilo con `VITE_USER_NAVIGATION_STYLE`, `VITE_HOME_SIDEBAR_COLLAPSED` y `VITE_SIDEBAR_COLLAPSIBLE_STYLE` |
| `marketing-navigation.config.tsx` | Menú de la web pública (inicio, blog, precios, contacto…) | Editando el fichero |
| `tfg.config.ts` | Bloque «Proyecto académico» y recorrido de la demo en la landing | `VITE_SHOW_TFG_INFO` |

Los textos visibles **no** van en estos ficheros: son claves de traducción de `packages/i18n/src/messages/es/*.json` (la interfaz solo está en español, ADR-021).

## 2. Variables de entorno

Hay dos clases:

- **Públicas (`VITE_*`)**: Vite las incrusta en el código al construir. No pueden ser secretos y cambiarlas obliga a reconstruir.
- **De servidor (sin prefijo)**: se leen al arrancar, nunca llegan al navegador y algunas son secretas.

Ficheros versionados (sin secretos): `apps/web/.env` (común), `.env.development`, `.env.production` y `.env.test`. Los secretos reales van en `apps/web/.env.local` (no se versiona) o en las variables del servicio de despliegue. La plantilla para Docker es `.env.docker.example`.

### 2.1 Públicas (`VITE_*`)

| Variable | Por defecto | Para qué |
|---|---|---|
| `VITE_SITE_URL` | `http://localhost:3100` | URL pública. En producción debe ser `https://` |
| `VITE_PRODUCT_NAME` | `PymeKit` | Nombre que se muestra en el logo, los títulos y los correos |
| `VITE_SITE_TITLE`, `VITE_SITE_DESCRIPTION` | — | Título y descripción para buscadores y redes sociales |
| `VITE_DEFAULT_THEME_MODE` | `light` | Tema inicial: `light`, `dark` o `system` |
| `VITE_THEME_COLOR`, `VITE_THEME_COLOR_DARK` | `#ffffff`, `#0a0a0a` | Color de la barra del navegador en cada tema (deben ser distintos) |
| `VITE_APP_HOME_PATH` | `/dashboard` | Página a la que se llega tras iniciar sesión |
| `VITE_DEFAULT_LOCALE` | `es` | Idioma. Hoy solo existe `es` (ver `packages/i18n/README.md` para añadir otro) |
| `VITE_LANGUAGE_PRIORITY` | `application` | `application` (manda el idioma de la app) o `user` (el del navegador) |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLIC_KEY` | local | Proyecto Supabase y su clave pública |
| `VITE_AUTH_PASSWORD`, `VITE_AUTH_MAGIC_LINK`, `VITE_AUTH_OTP`, `VITE_AUTH_PASSKEY` | `true`, `false`, `false`, `false` | Métodos de inicio de sesión |
| `VITE_AUTH_IDENTITY_LINKING` | `false` | Permitir vincular varias identidades a una cuenta (también hay que activarlo en Supabase) |
| `VITE_DISPLAY_TERMS_AND_CONDITIONS_CHECKBOX` | `false` | Casilla de aceptación de términos en el registro |
| `VITE_PASSWORD_REQUIRE_UPPERCASE`, `…_NUMBERS`, `…_SPECIAL_CHARS` | `false` | Requisitos de la contraseña |
| `VITE_CAPTCHA_SITE_KEY`, `VITE_CAPTCHA_WIDGET_SIZE` | vacío, `invisible` | CAPTCHA (Cloudflare Turnstile) en formularios públicos; la clave secreta es `CAPTCHA_SECRET_TOKEN` |
| `VITE_ACCOUNT_MODE` | `hybrid` | Modo de cuentas (ver §3) |
| `VITE_ENABLE_*` | ver `.env` | Interruptores de módulos (ver §3) |
| `VITE_BILLING_PROVIDER` | `stripe` | Proveedor de pago. Debe coincidir con `public.config.billing_provider` en la BD |
| `VITE_STRIPE_PUBLISHABLE_KEY` | vacío | Clave publicable de Stripe (`pk_test_…` en modo test) |
| `VITE_STRIPE_PRICE_BASIC_MONTHLY`, `…_BASIC_YEARLY`, `…_PRO_MONTHLY`, `…_PRO_YEARLY`, `…_ENTERPRISE_MONTHLY`, `…_ENTERPRISE_YEARLY` | vacío | Id de precio de Stripe de cada plan (ver §6) |
| `VITE_USER_NAVIGATION_STYLE`, `VITE_HOME_SIDEBAR_COLLAPSED`, `VITE_SIDEBAR_COLLAPSIBLE_STYLE` | — | Aspecto del menú del área privada (barra lateral o cabecera, plegada o no) |
| `VITE_MONITORING_PROVIDER` | vacío | Proveedor de monitorización de errores; vacío = consola |
| `VITE_SHOW_TFG_INFO` | `true` | Información académica del TFG en la landing (ver §3) |
| `VITE_CI` | — | Solo pruebas: `true` permite `http://` en una *build* de producción |

### 2.2 De servidor

| Variable | Secreta | Para qué |
|---|---|---|
| `PORT` | no | Puerto del servidor (3100 por defecto, ADR-009). Para una segunda copia local: `PORT=3300` |
| `SUPABASE_SECRET_KEY` | **sí** | Clave de servicio de Supabase. Ignora RLS: solo la usa el servidor en casos justificados |
| `SUPABASE_DATABASE_URL` | **sí** | Conexión Postgres directa que usa la API del CMS. Sin ella la web arranca, pero `/api/cms/*` falla con un error explícito |
| `SUPABASE_DB_WEBHOOK_SECRET` | **sí** | Firma de los *webhooks* de base de datos |
| `WEBHOOK_SENDER_PROVIDER` | no | Origen de esos *webhooks* (`postgres` por defecto) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | **sí** | API de Stripe y firma de su *webhook* |
| `STRIPE_UI_MODE` | no | Pago incrustado en la web (`embedded_page`, por defecto) o en la página de Stripe (`hosted_page`) |
| `STRIPE_ENABLE_TRIAL_WITHOUT_CC` | no | Periodo de prueba sin pedir tarjeta |
| `MAILER_PROVIDER` | no | `nodemailer` (SMTP) o `resend` |
| `EMAIL_SENDER`, `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASSWORD`, `EMAIL_TLS` | contraseña sí | Servidor SMTP y remitente |
| `RESEND_API_KEY` | **sí** | Clave de Resend, si `MAILER_PROVIDER=resend` |
| `CONTACT_EMAIL` | no | Buzón que recibe el formulario de contacto |
| `CAPTCHA_SECRET_TOKEN` | **sí** | Clave secreta del CAPTCHA |
| `ENABLE_STRICT_CSP` | no | `true` activa una política de seguridad de contenidos estricta con *nonce* por petición |
| `LOGGER` | no | Implementación de los *logs* (`pino` por defecto) |
| `E2E_BASE_URL` | no | Solo pruebas: URL del servidor contra el que corre Playwright (por defecto `http://localhost:3100`). Para una segunda copia: `VITE_CI=true VITE_SITE_URL=http://localhost:3300 vite build --mode test`, `PORT=3300 pnpm --filter web start:test` y `E2E_BASE_URL=http://localhost:3300` |

`VITE_KEYSTATIC_CONTENT_PATH` y `VITE_LOCALES_PATH` del `.env` son restos sin uso (el blog vive en la base de datos desde ADR-017 y los mensajes se empaquetan con el código).

## 3. Interruptores de módulos

PymeKit es la base de la web de **una** pyme: landing, blog y un inicio de sesión que puede ser de super-admin, de personal o de cliente. Los equipos, las invitaciones y los pagos son módulos opcionales.

| Módulo | Interruptor | Notas |
|---|---|---|
| **Modo de cuentas** | `VITE_ACCOUNT_MODE` = `personal-only` \| `organizations-only` \| `hybrid` | `personal-only`: cada cliente tiene su cuenta y no hay equipos (lo más simple para una pyme con área de clientes). `organizations-only`: solo equipos (por ejemplo, una cuenta por tienda o local). `hybrid`: ambos. El modo manda: ningún interruptor puede reactivar una superficie que el modo desactiva |
| Creación de equipos | `VITE_ENABLE_TEAM_ACCOUNTS_CREATION` | Con `false`, solo el super-admin crea equipos |
| Borrado de cuentas | `VITE_ENABLE_PERSONAL_ACCOUNT_DELETION`, `VITE_ENABLE_TEAM_ACCOUNTS_DELETION` | |
| **Facturación** | `VITE_ENABLE_PERSONAL_ACCOUNT_BILLING`, `VITE_ENABLE_TEAM_ACCOUNTS_BILLING` | Con las dos a `false` la web no muestra pagos. La tabla `public.config` de la BD tiene los mismos interruptores para las comprobaciones del servidor |
| **Notificaciones** | `VITE_ENABLE_NOTIFICATIONS`, `VITE_REALTIME_NOTIFICATIONS` | Campana de avisos del área privada; la segunda las recibe en tiempo real (Supabase Realtime) |
| **Tema** | `VITE_ENABLE_THEME_TOGGLE`, `VITE_DEFAULT_THEME_MODE` | Selector claro/oscuro y tema inicial |
| Aviso de versión nueva | `VITE_ENABLE_VERSION_UPDATER` | Pide recargar cuando se despliega una versión nueva |
| **Información del TFG** | `VITE_SHOW_TFG_INFO` | Con `false` desaparecen el bloque «Proyecto académico» y el recorrido de la demo. Una pyme real lo pone a `false` |

## 4. Identidad: nombre, logo y colores

1. **Nombre**: `VITE_PRODUCT_NAME` (logo, títulos, correos) y `VITE_SITE_TITLE`/`VITE_SITE_DESCRIPTION`. El remitente de los correos es `EMAIL_SENDER`.
2. **Logo**: `apps/web/src/components/app-logo.tsx`. `LogoMark` es el símbolo (un SVG que toma el color primario del tema) y `LogoImage` lo acompaña del nombre de `VITE_PRODUCT_NAME` como texto. Para usar un logo propio, se sustituye el SVG de `LogoMark` o se cambia por un `<img src="/images/logo.svg">` en `apps/web/public/images/`.
3. **Favicons**: `apps/web/public/images/favicon/` (se pueden generar a partir del logo con cualquier generador de *favicons*).
4. **Colores**: `apps/web/src/styles/theme.css`. Las variables CSS de `:root` (tema claro) y `.dark` (tema oscuro) usan el formato `oklch`. Para una marca basta con cambiar `--primary` y `--primary-foreground` (botones, enlaces, logo) y, si se quiere, `--accent`, `--ring` y `--radius`. `shadcn-ui.css` las expone a Tailwind y `pymekit.css` tiene ajustes propios de componentes; normalmente no hace falta tocarlos.
5. **Capturas y textos de la landing**: los textos están en `packages/i18n/src/messages/es/marketing.json`; las capturas en `apps/web/public/images/` (se regeneran con `apps/e2e/scripts/capture-marketing-screenshots.mjs`).

## 5. Roles y permisos

Hay dos modelos de permisos independientes:

**Equipos de la web** (`public.roles` y `public.role_permissions`, ADR-024). Se aplican dentro de cada equipo:

| Rol | Nombre visible | Nivel | Permisos |
|---|---|---|---|
| `owner` | Propietario | 1 | Todo: facturación, ajustes, miembros, roles e invitaciones |
| `manager` | Encargado | 2 | Ajustes, miembros, roles e invitaciones. **No** facturación. Solo actúa sobre roles inferiores |
| `member` | Miembro | 3 | Ajustes del equipo e invitaciones (de rango inferior al suyo) |

Borrar el equipo y transferir su propiedad están reservados al **propietario principal**, sea cual sea su rol. Para añadir un rol: insertarlo en `public.roles` con un nivel libre, darle permisos en `public.role_permissions` (enumerado `public.app_permissions`) en una migración, y añadir su nombre visible en `common.roles.<rol>.label` de `packages/i18n/src/messages/es/common.json`.

**Personal de la consola** (RBAC del esquema `cms`, ADR-014 y ADR-026). El super-admin de la plataforma es la raíz y lo ve todo. Para el resto del personal hay dos roles de partida, sin nadie asignado:

| Rol del CMS | Rango | Permisos |
|---|---|---|
| Soporte | 30 | Leer cuentas, miembros de equipos, usuarios y el registro de auditoría. Sin modificar ni borrar |
| Gestor de contenidos | 35 | Grupo «Contenidos»: todo sobre las tablas del blog y sobre los archivos. Sin cuentas, usuarios ni facturación |

Se asignan y se editan desde **Consola → Ajustes → Miembros** y **Ajustes → Permisos**.

## 6. Planes de pago

Los planes están en `apps/web/src/config/billing.config.ts` (ADR-025). Vienen tres productos de ejemplo pensados para una pyme, en euros y con pago mensual o anual:

| Producto | Mensual | Anual | Para quién |
|---|---|---|---|
| Básico | 19 € | 190 € | Web, blog, área de clientes y consola |
| Profesional (destacado) | 49 € | 490 € | Añade equipos (varios locales), roles y personal con permisos |
| Empresa | 99 € | 990 € | Añade paneles, soporte prioritario y acompañamiento |

**Los precios son ficticios.** Para cobrar de verdad:

1. Crea en Stripe (modo test primero) un producto por plan y un precio recurrente mensual y otro anual.
2. Copia cada id de precio (`price_…`) en su variable `VITE_STRIPE_PRICE_*` (ver §2.1). Sin ellas la página de precios funciona con ids `price_ejemplo_*`, pero Stripe rechazará el pago.
3. Ajusta en el fichero los importes (`cost`), que solo sirven para mostrarlos: el importe real lo cobra Stripe según el precio.
4. Los textos (descripción y características de cada plan) son claves `billing.plans.*` de `packages/i18n/src/messages/es/billing.json`.

Para añadir o quitar un plan basta con editar el array `products`. El *webhook* de Stripe y el resto del flujo se configuran como indica `DESPLIEGUE.md` §5.

## 7. Añadir una tabla de negocio al CMS

Resumen del procedimiento validado con el escenario «Fisioterapia Bahía» (tabla de solicitudes de cita):

1. **Tabla**: un fichero nuevo `apps/web/supabase/schemas/NN-<tabla>.sql` copiado de la «Plantilla de tabla» de `apps/web/supabase/AGENTS.md` (RLS, `revoke all` a los tres roles, solo los `grant` necesarios, *triggers* de fechas y autoría, política MFA). Genera la migración con `pnpm --filter web run supabase:db:diff -f <nombre>`, aplícala y regenera los tipos (`pnpm supabase:web:typegen`).
2. **Registrarla en el CMS**: en la misma migración, `select cms.sync_managed_tables('public', '<tabla>');` crea su descripción a partir del catálogo de PostgreSQL.
3. **Área y nombres en español**: un `update cms.table_metadata` fija el nombre visible, la descripción, el área de la barra lateral (`ui_config.navigation_group`, por ejemplo `'Citas'`: si el área no existe, se crea sola), el orden, el `display_format` de sus filas y el nombre, la ayuda «?» y el «solo lectura» de cada columna. Ver como modelo `20261002130000_cms_spanish_display_names.sql`, `20261002140000_cms_navigation_groups.sql` y `20261002160000_cms_column_descriptions.sql`. Todo esto también se puede hacer sin código desde **Ajustes → Recursos**.
4. **Etiquetas de enumerados**: en `common.enums.<tipo>.<valor>` de `common.json`.
5. **Permisos del personal**: crear permisos de datos sobre la tabla (o añadirlos a un grupo) y asignarlos a un rol desde **Ajustes → Permisos**.
6. **Pruebas**: un fichero pgTAP para las políticas y, si hay formulario público, un E2E corto.

Fricciones conocidas (ver `docs/tfg/EVALUACION.md` §7): el E2E `cms-sidebar-areas.spec.ts` cuenta las áreas exactas, y un alta pública sin lectura exige una *server function* con el cliente de servicio, porque `anon` solo puede leer el blog (ADR-017).

## 8. Generadores de código

El monorepo usa los generadores de Turborepo (`turbo/generators`, basados en Plop). Hoy hay uno:

```bash
pnpm turbo gen package
# o sin preguntas: tipo (feature | package), nombre y dependencias
pnpm turbo gen package --args feature bookings "zod"
```

Pregunta si es una **funcionalidad de negocio** (`packages/features/<nombre>`, como `accounts` o `team-accounts`) o un **paquete de infraestructura** (`packages/<nombre>`), el nombre (en inglés, *kebab-case*, sin `@pymekit/`) y las dependencias. Crea `package.json` (`@pymekit/<nombre>`, privado, módulo ES, *script* `typecheck`), `tsconfig.json` (hereda de `@pymekit/tsconfig`) y `src/index.ts` con una cabecera que hay que completar, instala las dependencias con `pnpm add` (usa la versión del catálogo de `pnpm-workspace.yaml` si existe) y formatea.

Después, para usarlo desde la web: añade `"@pymekit/<nombre>": "workspace:*"` a `apps/web/package.json`, ejecuta `pnpm install` y documenta el paquete según `docs/tfg/GUIA-COMENTARIOS.md`.
