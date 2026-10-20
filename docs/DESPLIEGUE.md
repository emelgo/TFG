# Manual de instalación y despliegue de PymeKit

Esta guía explica cómo poner en marcha PymeKit fuera del entorno de desarrollo. PymeKit es una única aplicación web (`apps/web`) que incluye el CMS en `/admin/cms` y su API en `/api/cms`. Se apoya en un proyecto de **Supabase** (Postgres, Auth y Storage) y, si se activan los pagos, en **Stripe**.

| Pieza | Qué es | Dónde se configura |
|---|---|---|
| App web + CMS | Servidor Node (Nitro) generado con `vite build` | `apps/web/Dockerfile`, `docker-compose.yml`, `railway.json` |
| Base de datos, Auth y Storage | Proyecto Supabase (nube o local) | `apps/web/supabase/` (migraciones y `config.toml`) |
| Pagos | Stripe en modo test | Panel de Stripe + variables `STRIPE_*` |

## 1. Requisitos

- **Docker** 24 o superior con Docker Compose v2.24 o superior.
- **Node.js** 20.10 o superior y **pnpm** 10 o superior (con `corepack enable` basta). Solo hacen falta para aplicar migraciones o para el despliegue sin Docker.
- **CLI de Supabase**. Viene como dependencia de `apps/web`, así que se ejecuta con `pnpm --filter web supabase …`.
- Una cuenta de Supabase y otra de Stripe (en modo test) para el despliegue en la nube.

## 2. Variables de entorno

Hay dos tipos de variables y conviene no confundirlas:

- **De build (`VITE_*`)**: son públicas. Vite las **incrusta** en el código al construir, así que cambiarlas obliga a reconstruir la imagen. Se pasan como `--build-arg` (Docker) o como variables del servicio (Railway).
- **De runtime (el resto)**: son de servidor y algunas son secretas. Se leen al arrancar y nunca se meten en la imagen.

La plantilla comentada con todas las variables está en **`.env.docker.example`**. Las imprescindibles son estas:

| Variable | Tipo | Para qué |
|---|---|---|
| `VITE_SITE_URL` | build | URL pública de la app. En producción debe ser `https://` |
| `VITE_SUPABASE_URL` | build | URL del proyecto Supabase |
| `VITE_SUPABASE_PUBLIC_KEY` | build | Clave pública (`sb_publishable_…`) |
| `VITE_STRIPE_PUBLISHABLE_KEY` | build | Clave publicable de Stripe (`pk_test_…`) |
| `VITE_CI` | build | `true` solo para probar en local con `http://` (desactiva la exigencia de HTTPS) |
| `SUPABASE_SECRET_KEY` | runtime, secreta | Clave secreta (`sb_secret_…`). Ignora RLS |
| `SUPABASE_DATABASE_URL` | runtime, secreta | Conexión Postgres que usa la API del CMS |
| `SUPABASE_DB_WEBHOOK_SECRET` | runtime, secreta | Firma de los *webhooks* de base de datos |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | runtime, secretas | API de Stripe y firma de su *webhook* |
| `MAILER_PROVIDER`, `EMAIL_*`, `CONTACT_EMAIL` | runtime | Envío de correo (SMTP con `nodemailer` o `resend` + `RESEND_API_KEY`) |

Los valores por defecto que no son secretos (nombre del producto, idioma, *feature flags*…) están en `apps/web/.env` y `apps/web/.env.production`, que sí se versionan.

## 3. Despliegue local con Docker

### 3.1 Contra la Supabase local

1. Levanta Supabase y aplica migraciones y *seed*:
   ```bash
   pnpm i
   pnpm supabase:web:start      # muestra las URLs y claves de desarrollo
   pnpm supabase:web:reset      # opcional: BD limpia con datos de ejemplo
   ```
2. Crea `.env.docker` a partir de la plantilla y rellénalo con lo que imprime `pnpm --filter web supabase status`:
   ```bash
   cp .env.docker.example .env.docker
   ```
   - `VITE_SITE_URL=http://localhost:3200` y `VITE_CI=true`.
   - `VITE_SUPABASE_URL=http://127.0.0.1:54321` y la clave *publishable*.
   - `SUPABASE_SECRET_KEY` (clave *secret* de `supabase status`).
   - `SUPABASE_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres`.
   - Correo: `EMAIL_HOST=localhost`, `EMAIL_PORT=54325`, `EMAIL_TLS=false` (el buzón de pruebas de la Supabase local).
3. Construye y arranca. En Linux se añade el fichero de ajuste, que usa la red del anfitrión para que `127.0.0.1` signifique lo mismo dentro y fuera del contenedor:
   ```bash
   docker compose --env-file .env.docker \
     -f docker-compose.yml -f docker-compose.supabase-local.yml up -d --build
   ```
4. Abre `http://localhost:3200`. Para que el inicio de sesión redirija bien, añade `http://localhost:3200/**` a `additional_redirect_urls` en `apps/web/supabase/config.toml` (y reinicia Supabase), o usa `WEB_PORT=3100` si no está en marcha el servidor de desarrollo.

### 3.2 Contra Supabase en la nube

Igual que antes, pero con las URLs y claves del proyecto (apartado 4) y **sin** el fichero `docker-compose.supabase-local.yml`:

```bash
docker compose --env-file .env.docker up -d --build
docker compose ps          # el estado pasa a «healthy» con /api/healthcheck
docker compose logs -f web
```

Sin Compose, la imagen se construye desde la raíz del monorepo:

```bash
docker build -f apps/web/Dockerfile -t pymekit-web \
  --build-arg VITE_SITE_URL=https://mi-dominio.es \
  --build-arg VITE_SUPABASE_URL=https://<ref>.supabase.co \
  --build-arg VITE_SUPABASE_PUBLIC_KEY=sb_publishable_... .
docker run -d --name pymekit-web -p 3200:3000 --env-file .env.docker pymekit-web
```

## 4. Proyecto Supabase en la nube

1. Crea el proyecto en el panel de Supabase y apunta su *Project ref*, la URL, la clave *publishable* y la *secret* (Project Settings → API Keys).
2. Aplica todas las migraciones de `apps/web/supabase/migrations` (incluyen el esquema `cms` del CMS):
   ```bash
   cd apps/web
   pnpm supabase login
   pnpm supabase link --project-ref <ref>
   pnpm supabase db push
   ```
   Equivale a `SUPABASE_PROJECT_REF=<ref> pnpm --filter web supabase:deploy`. El *seed* (`seed.sql`) es solo para desarrollo y **no** se aplica en la nube.
3. **Auth → URL Configuration**: `Site URL` = `VITE_SITE_URL`, y en *Redirect URLs* añade `https://mi-dominio.es/auth/callback` y `https://mi-dominio.es/update-password`.
4. **Auth → Emails / SMTP**: configura un SMTP propio (el de Supabase tiene un límite muy bajo de envíos) y, si quieres, las plantillas de correo.
5. **Database → Webhooks**: crea un *webhook* `AFTER DELETE` sobre `public.subscriptions` que haga `POST` a `https://mi-dominio.es/api/db/webhook` con la cabecera `X-Supabase-Event-Signature: <SUPABASE_DB_WEBHOOK_SECRET>`.
6. `SUPABASE_DATABASE_URL`: copia la cadena **Session pooler** (Connect → ORMs/Session pooler) con la contraseña de la BD.
7. **Primer super-administrador**: regístrate en la app y, desde el editor SQL, dale el rol en los metadatos de la aplicación (después debe activar MFA, que se exige para la consola):
   ```sql
   update auth.users
      set raw_app_meta_data = raw_app_meta_data || '{"role": "super-admin"}'
    where email = 'tu-correo@example.com';
   ```

## 5. Stripe en modo test

1. En el panel de Stripe, en **modo test**, copia `pk_test_…` (→ `VITE_STRIPE_PUBLISHABLE_KEY`) y `sk_test_…` (→ `STRIPE_SECRET_KEY`).
2. Crea los productos y precios y pon sus identificadores en `apps/web/src/config/billing.config.ts`.
3. **Webhook público**: Developers → Webhooks → *Add endpoint* con la URL `https://mi-dominio.es/api/billing/webhook` y, como mínimo, los eventos `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted` e `invoice.paid` (los que trata el manejador del *webhook*). Copia el *signing secret* (`whsec_…`) a `STRIPE_WEBHOOK_SECRET`.
4. En local, en lugar del webhook público se usa la CLI de Stripe: `pnpm stripe:listen`, que reenvía los eventos a la app y muestra el `whsec_…` temporal.
5. Para probar un pago, usa la tarjeta `4242 4242 4242 4242` con cualquier fecha futura y CVC.

## 6. Railway

`railway.json` (en la raíz) ya define el despliegue:

- **Build**: `pnpm exec turbo run build --filter=web` con el constructor automático de Railway.
- **Arranque**: `pnpm run --filter=web start` (`node .output/server/index.mjs`). Railway inyecta `PORT` y el servidor lo respeta.
- **Salud**: `/api/healthcheck`, con reinicio automático si falla (`ON_FAILURE`, 10 reintentos).

Pasos:

1. Crea un proyecto en Railway y conéctalo al repositorio de GitHub (rama `main`).
2. En **Variables** del servicio, añade **todas** las de `.env.docker.example` (las `VITE_*` también: Railway las expone durante la build). `VITE_SITE_URL` debe ser el dominio público con `https://` y `VITE_CI` debe quedar vacía.
3. En **Settings → Networking**, genera un dominio público (o añade uno propio) y úsalo en `VITE_SITE_URL`, en las URLs de Auth de Supabase y en los *webhooks*.
4. Cada *push* a `main` vuelve a desplegar. Si cambia una variable `VITE_*`, lanza un *redeploy* para reconstruir.

> Alternativa: si se prefiere que Railway use la imagen Docker, basta con cambiar `build.builder` a `DOCKERFILE` y añadir `"dockerfilePath": "apps/web/Dockerfile"`. En ese caso, las `VITE_*` se pasan como variables del servicio y Railway las entrega como *build args*.

## 7. Actualización

1. `git pull` (o *merge* en `main`).
2. Si hay migraciones nuevas: `pnpm --filter web supabase db push` contra el proyecto enlazado. Aplícalas **antes** de desplegar el código que las necesita.
3. Reconstruye y reinicia: `docker compose --env-file .env.docker up -d --build` (en Railway es automático).
4. Comprueba `docker compose ps` (estado *healthy*) o `curl https://mi-dominio.es/api/healthcheck`.

Para volver a la versión anterior, haz `git checkout <etiqueta>` y reconstruye. Si se aplicó una migración, hace falta otra migración que la revierta: no se edita la ya aplicada.

## 8. Copias de seguridad

- **Supabase en la nube**: el plan de pago hace copias diarias automáticas (Database → Backups). En cualquier plan se puede hacer una copia manual:
  ```bash
  pnpm --filter web supabase db dump --linked -f backup-esquema.sql
  pnpm --filter web supabase db dump --linked --data-only -f backup-datos.sql
  ```
- **Restauración**: `psql "$SUPABASE_DATABASE_URL" -f backup-esquema.sql` y después el fichero de datos, sobre un proyecto vacío.
- **Storage**: los ficheros de los *buckets* no van en el volcado SQL. Se descargan desde el panel o con la API S3 de Supabase.
- **Local**: `pnpm --filter web supabase:db:dump:local > datos-local.sql`.
- La app no guarda estado en el contenedor, así que no hay volúmenes de Docker que copiar.

## 9. Problemas frecuentes

| Síntoma | Causa probable |
|---|---|
| La build falla con «Faltan build args obligatorios» | No se pasaron `VITE_SITE_URL`, `VITE_SUPABASE_URL` o `VITE_SUPABASE_PUBLIC_KEY` |
| Error «Please provide a valid HTTPS URL» al arrancar | `VITE_SITE_URL` con `http://` sin `VITE_CI=true` |
| La web carga, pero el inicio de sesión no redirige | Falta la URL en *Redirect URLs* de Supabase Auth |
| `/admin/cms` da error de conexión | Falta `SUPABASE_DATABASE_URL` o no es accesible desde el servidor |
| Los pagos no actualizan la suscripción | El *webhook* de Stripe no llega o `STRIPE_WEBHOOK_SECRET` no coincide |
| Con la Supabase local, el servidor no llega a `127.0.0.1:54321` | Falta `-f docker-compose.supabase-local.yml` (solo Linux) |
