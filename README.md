# PymeKit

**Plataforma base reutilizable para el desarrollo ágil de aplicaciones SaaS orientadas a pymes.**

Trabajo Fin de Grado · Grado en Ingeniería Informática · Escuela Superior de Ingeniería · Universidad de Cádiz
Tutor: Juan Carlos de la Torre Macías

---

PymeKit reúne en un único monorepo los componentes que casi cualquier SaaS para pymes necesita:

- **Aplicación web** (frontend + backend con *server functions*).
- **Autenticación y autorización**: contraseña, enlace mágico, MFA y seguridad a nivel de fila en la base de datos.
- **Multi-tenant**: cuentas de equipo con miembros, roles y permisos.
- **Pagos y suscripciones** con Stripe.
- **Panel de super-administración**.
- **CMS de datos** para administrar la base de datos, los usuarios y el almacenamiento, con permisos propios y auditoría.

## Estado

🚧 **Fase 1: base SaaS importada.** Queda pendiente la integración del CMS (Fase 2). Consulta:

- [`docs/tfg/PLAN.md`](docs/tfg/PLAN.md): fases del proyecto.
- [`docs/tfg/PROGRESO.md`](docs/tfg/PROGRESO.md): estado actual.
- [`docs/tfg/REQUISITOS.md`](docs/tfg/REQUISITOS.md): requisitos funcionales y no funcionales.
- [`docs/tfg/DECISIONES.md`](docs/tfg/DECISIONES.md): decisiones de diseño.
- [`AGENTS.md`](AGENTS.md): directrices de desarrollo (para personas y agentes de IA).

## Stack previsto

TanStack Start · React 19 · TypeScript · Supabase (Postgres, Auth, Storage) · Stripe · Hono · Drizzle · Tailwind CSS 4 · Turborepo + pnpm · Playwright · pgTAP

## Arranque rápido

Requisitos: Node ≥ 20 (se recomienda 24), pnpm 11 y Docker (lo usa Supabase local).

```bash
pnpm install                 # dependencias del monorepo
pnpm supabase:web:start      # Supabase local (Postgres, Auth, Storage) en Docker
pnpm dev                     # app web en http://localhost:3100
```

Otros comandos útiles:

```bash
pnpm typecheck               # comprobación de tipos de todos los paquetes
pnpm lint:fix && pnpm format:fix
pnpm test:unit               # tests unitarios (Vitest)
pnpm supabase:web:test       # tests de base de datos (pgTAP)
pnpm supabase:web:reset      # recrea la BD desde las migraciones y el seed
pnpm supabase:web:typegen    # regenera los tipos TypeScript de la BD
```

El manual de instalación completo se entrega en la Fase 7.

## Scripts del TFG

```bash
node scripts/tfg/check-branding.mjs        # Verifica que no quedan referencias al código de origen
node scripts/tfg/report-comments.mjs       # Informe de comentarios pendientes de traducir (Fase 4)
```

## Licencia y atribución

Repositorio privado. PymeKit se basa en código de terceros con licencia; consulta [`docs/tfg/ATRIBUCION.md`](docs/tfg/ATRIBUCION.md).
