# Imagen de producción de la app web de PymeKit (incluye el CMS en /admin/cms
# y su API en /api/cms, porque forman parte de la misma app; ADR-011).
#
# Se construye SIEMPRE desde la raíz del monorepo, que es el contexto:
#
#   docker build -f apps/web/Dockerfile -t pymekit-web \
#     --build-arg VITE_SITE_URL=https://mi-dominio.es \
#     --build-arg VITE_SUPABASE_URL=https://xxxx.supabase.co \
#     --build-arg VITE_SUPABASE_PUBLIC_KEY=sb_publishable_... .
#
# Es multi-etapa para que la imagen final solo lleve lo imprescindible:
#   1. pruner  → `turbo prune` recorta el monorepo a `web` y sus dependencias.
#   2. builder → instala dependencias y ejecuta `vite build` (Nitro).
#   3. runner  → solo Node y la carpeta `.output`, que Nitro deja autocontenida
#                (el servidor y las librerías que usa ya van empaquetados), así
#                que no hace falta copiar `node_modules`.
#
# Variables: las `VITE_*` son públicas y Vite las INCRUSTA en el código durante
# la build, por eso llegan como `--build-arg`. Los secretos de servidor
# (SUPABASE_SECRET_KEY, STRIPE_SECRET_KEY…) NUNCA se pasan aquí: se inyectan al
# arrancar el contenedor (`docker run -e` o `env_file` en docker-compose).

ARG NODE_VERSION=24

# ---------------------------------------------------------------------------
# Etapa 1 · pruner: recorte del monorepo
# ---------------------------------------------------------------------------
# Se usa la variante slim (glibc) en las etapas de build porque algunas
# dependencias nativas de la build (Tailwind, LightningCSS) se resuelven sin
# sorpresas con glibc; la imagen final sí es Alpine.
FROM node:${NODE_VERSION}-slim AS pruner
WORKDIR /app
RUN corepack enable
COPY . .
# `turbo prune --docker` separa en `out/json` solo los package.json (para
# cachear la instalación) y en `out/full` el código de los paquetes que `web`
# necesita. Si cambia el código pero no las dependencias, Docker reutiliza la
# capa de `pnpm install`.
RUN pnpm dlx turbo@2.11.3 prune web --docker

# ---------------------------------------------------------------------------
# Etapa 2 · builder: instalación y build
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-slim AS builder
WORKDIR /app
RUN corepack enable
ENV CI=true

COPY --from=pruner /app/out/json/ ./
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
# `--ignore-scripts` evita los hooks del monorepo (preinstall de requisitos y
# `manypkg fix`), pensados para el puesto de desarrollo y que aquí fallarían
# porque el árbol recortado no incluye `tooling/scripts`. La CLI de Supabase,
# que sí tiene script de instalación, no se usa en la imagen.
# (No se usa `RUN --mount=type=cache` para que la imagen también se construya
# con el constructor clásico de Docker, sin BuildKit/buildx.)
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY --from=pruner /app/out/full/ ./

# Variables públicas de build. Solo se escriben las que llegan con valor: si se
# exportaran vacías como ENV, Vite les daría prioridad sobre `apps/web/.env` y
# borraría los valores por defecto (nombre del producto, idioma, flags…).
ARG VITE_SITE_URL
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLIC_KEY
ARG VITE_STRIPE_PUBLISHABLE_KEY
ARG VITE_BILLING_PROVIDER
ARG VITE_PRODUCT_NAME
ARG VITE_DEFAULT_LOCALE
ARG VITE_ACCOUNT_MODE
ARG VITE_AUTH_PASSWORD
ARG VITE_AUTH_MAGIC_LINK
ARG VITE_CAPTCHA_SITE_KEY
ARG VITE_MONITORING_PROVIDER
# VITE_CI=true relaja la validación que exige HTTPS en VITE_SITE_URL; solo
# tiene sentido para probar la imagen en local con http://localhost.
ARG VITE_CI

RUN set -eu; \
    if [ -z "${VITE_SUPABASE_URL:-}" ] || [ -z "${VITE_SUPABASE_PUBLIC_KEY:-}" ] || [ -z "${VITE_SITE_URL:-}" ]; then \
      echo "Faltan build args obligatorios: VITE_SITE_URL, VITE_SUPABASE_URL y VITE_SUPABASE_PUBLIC_KEY" >&2; \
      exit 1; \
    fi; \
    out=apps/web/.env.production.local; : > "$out"; \
    for name in VITE_SITE_URL VITE_SUPABASE_URL VITE_SUPABASE_PUBLIC_KEY \
                VITE_STRIPE_PUBLISHABLE_KEY VITE_BILLING_PROVIDER VITE_PRODUCT_NAME \
                VITE_DEFAULT_LOCALE VITE_ACCOUNT_MODE VITE_AUTH_PASSWORD \
                VITE_AUTH_MAGIC_LINK VITE_CAPTCHA_SITE_KEY VITE_MONITORING_PROVIDER VITE_CI; do \
      value="$(printenv "$name" || true)"; \
      if [ -n "$value" ]; then printf '%s=%s\n' "$name" "$value" >> "$out"; fi; \
    done

# `.env.production.local` tiene la máxima prioridad entre los ficheros que
# Vite carga en modo producción, así que estos valores ganan a los del repo.
RUN pnpm exec turbo run build --filter=web

# ---------------------------------------------------------------------------
# Etapa 3 · runner: imagen final mínima
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

# La imagen oficial de Node ya trae el usuario sin privilegios `node`; el
# servidor no necesita root y así se limita el daño si se compromete.
COPY --from=builder --chown=node:node /app/apps/web/.output ./.output
USER node

EXPOSE 3000

# Sonda de salud: la ruta /api/healthcheck responde 200 si el servidor está
# vivo (el cuerpo indica además si la base de datos responde). Se usa `wget`
# porque viene en BusyBox y evita instalar curl.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/api/healthcheck" || exit 1

CMD ["node", ".output/server/index.mjs"]
