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
- [ ] P-07 · Idea: integrar el CMS en la consola de super-admin (`/admin`). Evaluar las opciones antes de portar nada en F2 (ver `PLAN.md`)
- [ ] P-02 · Nombre del esquema SQL del CMS (se decide en F2)
- [ ] F2 · Asignar los puertos del CMS en la franja 31xx (la web ya usa el 3100, ADR-009; el 3000 está ocupado en el equipo de desarrollo)
- [ ] F2 · Confirmar los nombres de los paquetes del CMS marcados en las skills (`@pymekit/cms-supabase`, el filtro de e2e)

## F1 · Base SaaS importada y funcionando
- [x] Copia de la referencia SaaS (sin excluidos)
- [x] Renombrado `@kit/*` → `@pymekit/*` (0 referencias; bloqueante en la CI)
- [x] Retirados el CMS de contenidos, el blog, la documentación y el changelog
- [x] ADR sobre el servidor MCP (ADR-008)
- [x] Typecheck (25 paquetes), lint, formato, tests unitarios (61) y build de producción en verde
- [x] CI unificada (`.github/workflows/ci.yml`)
- [x] `AGENTS.md` de cada paquete traducidos y adaptados (11) y corregidas sus discrepancias con el código
- [x] Docker accesible (usuario en el grupo `docker`)
- [x] Supabase local arrancando: `project_id = "pymekit"`, 4 migraciones y seed
- [x] Web en el puerto 3100 (ADR-009)
- [x] pgTAP: 27 ficheros, 396 tests en verde
- [x] E2E: 43 pasan, 1 omitido (billing desactivado) y 1 inestable (*flaky*: `admin.spec.ts` › «ban user flow», pasa al reintentar)
- [x] Corregido un fallo del renombrado: la regex `noExternal` de `vite.config.ts` conservaba el scope original escapado (`check-branding` ya detecta esa forma)
- [ ] CU-01 probado a mano por el autor (`pnpm dev` → http://localhost:3100)
- [x] Job de E2E activado en GitHub (`ENABLE_E2E_JOB` y secretos de Supabase). Para ahorrar minutos, solo se ejecuta en PR a `main` y a mano (*Run workflow*). Los secretos de Stripe se añadirán en F5
- [ ] Estabilizar el test inestable de admin (o documentarlo) antes de F6

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
- [ ] Carpeta `packages/ui/src/makerkit/` → `src/pymekit/` (y sus exports)
- [ ] Plantillas de email solo tienen locale `en`: añadir `es`; revisar `EMAIL_TEMPLATE_RENDERERS` (no tiene consumidores)

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
| 2026-09-29 | F1 | Docker operativo: Supabase local, pgTAP (396 ✔) y E2E (43 ✔, 1 flaky). Web movida al 3100 (ADR-009) |
| 2026-09-29 | F1 | Base SaaS importada en la rama `fase-1/base`: scope `@pymekit/*`, retirados blog/changelog/CMS de contenidos/MCP/licencia; typecheck, lint, unit y build en verde. Pendiente Docker para Supabase |
