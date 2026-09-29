# Progreso del TFG

<!-- El hook SessionStart lee la línea «Fase actual» y las casillas sin marcar de la fase actual. Mantén este formato. -->

**Fase actual:** F1

## F0 · Harness y planificación
- [x] Directrices (`AGENTS.md`, `CLAUDE.md`)
- [x] Plan, requisitos, guías y registros en `docs/tfg/`
- [x] Configuración de Claude Code (permisos, hooks, skills y agentes)
- [x] Scripts `check-branding` y `report-comments`
- [x] CI mínima
- [x] Repositorio remoto en GitHub configurado (P-05)
- [x] Primer commit y push a `main`

## Pendientes transversales (no bloquean el avance de fase)
- [ ] P-04 · Plantilla LaTeX de Overleaf: el autor pasará el `.zip` → integrarla en `memoria/` (ver `memoria/README.md`)
- [ ] P-01 · Escenario de ejemplo para evaluar la reutilización: se abordará más adelante (a más tardar, antes de F6)
- [ ] P-06 · Confirmar con el tutor cómo presenta la memoria la parte reutilizada sin nombrar las referencias (ADR-007)
- [ ] P-02 · Nombre del esquema SQL del CMS (se decide en F2)
- [ ] P-03 · Qué hacer con el servidor MCP heredado (se decide en F1)
- [ ] F2 · Resolver el choque de puertos: la web y la API del CMS usan ambas el :3000 en las referencias
- [ ] F2 · Confirmar los nombres de los paquetes del CMS marcados en las skills (`@pymekit/cms-supabase`, el filtro de e2e)

## F1 · Base SaaS importada y funcionando
- [ ] Copia de la referencia SaaS (sin excluidos)
- [ ] Renombrado `@kit/*` → `@pymekit/*`
- [ ] Retirados el CMS de contenidos, el blog, la documentación y el changelog
- [ ] ADR sobre el servidor MCP (P-03)
- [ ] Entorno local arrancando (Supabase + dev)
- [ ] Typecheck, lint, pgTAP y E2E en verde
- [ ] CI completa

## F2 · Integración del CMS
- [ ] Copia de `apps/cms`, `apps/cms-api` y `packages/cms/*`
- [ ] Catálogo de dependencias unificado
- [ ] Migraciones integradas en la BD única (ADR P-02)
- [ ] ADR sobre la convivencia entre el acceso al CMS y el super-admin
- [ ] `pnpm dev` levanta los tres servicios
- [ ] `/rls-review` del esquema del CMS
- [ ] E2E del CMS integrados

## F3 · Desmarcado e i18n
- [ ] `check-branding` a cero
- [ ] Locale `es` por defecto (web, emails, CMS)
- [ ] Plantillas y `config.toml` de Supabase
- [ ] Marca visual (logo, favicon, landing)
- [ ] Helpers pgTAP `pymekit.*`

## F4 · Comentarios en español
| Módulo | Estado | Revisado |
|---|---|---|
| `apps/web/supabase` | ⬜ | ⬜ |
| `packages/function-middleware`, `supabase`, `policies` | ⬜ | ⬜ |
| `packages/features/*` | ⬜ | ⬜ |
| `packages/billing/*` | ⬜ | ⬜ |
| `apps/web/src` | ⬜ | ⬜ |
| `packages/cms/*`, `apps/cms-api`, `apps/cms` | ⬜ | ⬜ |
| Resto de `packages/*` | ⬜ | ⬜ |
| `apps/e2e`, `tooling` | ⬜ | ⬜ |

## F5 · Adaptación a pymes
- [ ] Roles y permisos (ADR + pgTAP)
- [ ] Planes de Stripe (ADR)
- [ ] Plantilla de permisos del CMS
- [ ] Configuración reutilizable documentada
- [ ] Generadores revisados

## F6 · Validación
- [ ] E2E de CU-01 a CU-06
- [ ] pgTAP de aislamiento
- [ ] Integración con Stripe
- [ ] Evaluación de la reutilización (CU-07)
- [ ] Resultados documentados

## F7 · Despliegue
- [ ] Dockerfiles + docker-compose
- [ ] Railway + Supabase en la nube
- [ ] Manual de instalación probado

## F8 · Memoria
- [ ] Capítulos 1–9 (borradores)
- [ ] Anexos: manuales
- [ ] Revisión final con el tutor

---

## Registro de sesiones
| Fecha | Fase | Resumen |
|---|---|---|
| 2026-09-29 | F0 | Creado el harness: directrices, plan, requisitos, guías, skills, agentes, hooks, scripts y CI |
| 2026-09-29 | F0 | La memoria no nombrará las referencias (ADR-007). Remoto configurado. F0 cerrada; se pasa a F1 |
