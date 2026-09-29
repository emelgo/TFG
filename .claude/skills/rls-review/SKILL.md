---
name: rls-review
description: Revisión adversarial profunda de Row-Level Security (RLS review). Audita de forma estática cada política RLS, grant, función SECURITY DEFINER, vista y restricción de MFA/super-admin en busca de huecos de aislamiento entre tenants (esquema public y esquema del CMS) y después DEMUESTRA los huecos, o su ausencia, con tests pgTAP ejecutables que atacan entre tenants como usuarios reales. Úsala cuando se pida "review RLS", "auditar el aislamiento multi-tenant", "tenant isolation", "¿puede un usuario ver datos de otra cuenta?", o tras cualquier cambio de esquema o migration que toque políticas, grants o funciones security definer. Invócala con /rls-review.
---

# Revisión adversarial profunda de RLS

Eres un *tenant* hostil. Tu objetivo es **escapar de tu propia cuenta** —leer, escribir o borrar filas de otro *tenant*— y seguir intentándolo hasta conseguirlo o agotar todas las clases de ataque. No validas el esquema: intentas romperlo y **demuestras cada conclusión con un test que se ejecuta**.

**El principio que hay que conservar: la lectura estática es una hipótesis; un ataque pgTAP que pasa es una prueba.** Una política que *parece* segura no lo es hasta que una sonda entre *tenants*, ejecutada como el usuario atacante, no consigue llegar a los datos. Nunca des por bueno un aislamiento que solo has leído.

PymeKit es multi-tenant (ver `AGENTS.md`): cuentas personales (`auth.users.id = accounts.id`) y cuentas de equipo (miembros + roles + permisos), todo enlazado por `account_id`. Para el cliente estándar, RLS es la única capa de control de acceso: no hay comprobaciones manuales. Un solo `WITH CHECK` ausente o un `UPDATE` concedido a nivel de tabla es una brecha total entre *tenants*.

Además, la misma base de datos aloja el **esquema del CMS** (cuentas de administración, roles, permisos, vistas guardadas, auditoría). La API del CMS (`apps/cms-api`) consulta con Drizzle fijando `role` y `request.jwt.claims` por transacción, así que **RLS también es su frontera de seguridad**. Su nombre definitivo se fija en F2 (ver `docs/tfg/DECISIONES.md`); aquí se escribe `<cms>`, sustitúyelo por el vigente.

---

## Etapa 0 — Alcance

Decide qué vas a revisar:

- **Modo diff (por defecto).** Políticas, *grants* y funciones modificadas, y su radio de impacto.
  ```bash
  git diff HEAD -- 'apps/web/supabase/**'
  git status --short -- 'apps/web/supabase/**'
  ```
  Si no hay nada sin confirmar, usa el último commit (`git show HEAD -- 'apps/web/supabase/**'`).
- **Modo auditoría completa** (cuando se pide auditar todo el esquema o llega una tabla nueva): todos los ficheros de `apps/web/supabase/schemas/`, incluidos los del esquema del CMS.

Anuncia el modo y las tablas o políticas en alcance antes de seguir.

---

## Etapa 1 — Inventario de aislamiento

Para cada tabla en alcance, extrae la verdad de los ficheros de `apps/web/supabase/schemas/` (numerados por dependencia) y anota:

| Dato | Dónde mirar | Por qué importa |
|---|---|---|
| ¿RLS activado? | `alter table ... enable row level security` | Sin RLS, cualquier usuario autenticado lo lee todo. |
| *Grants* a `authenticated` | `grant ... to authenticated` | Un `UPDATE` a nivel de tabla permite el ataque de re-asignación (ver Etapa 2 n.º 2). |
| *Grants* a `anon` / `public` | cualquier `grant ... to anon`, políticas `to public` | Fuga sin autenticar. |
| Políticas y sus `for` / `to` / `using` / `with check` | `create policy` | El predicado real: atácalo. |
| PERMISSIVE frente a RESTRICTIVE | `as restrictive` | Las barreras de MFA y de *tenant* DEBEN ser restrictivas (AND), no permisivas (OR). |
| Funciones SECURITY DEFINER | `security definer` | Saltan RLS; deben validar y fijar `search_path`. |
| Vistas sobre tablas con RLS | `create ... view` | Necesitan `security_invoker = true` o se ejecutan como el propietario y saltan RLS. |

Funciones auxiliares conocidas (NO audites su interior salvo que hayan cambiado; confía, pero tenlo en cuenta):

- `public`: `has_role_on_account`, `has_permission`, `is_account_owner`, `has_active_subscription`, `is_team_member`, `can_action_account_member`, `is_super_admin`, `is_aal2`, `is_mfa_compliant`, `is_set`.
- `<cms>`: `verify_admin_access`, `account_has_admin_access` (lee la marca de acceso al CMS en `app_metadata` del JWT), `has_admin_permission`, `has_data_permission`, `has_storage_permission`, `can_action_account`, `can_action_role`, `is_mfa_compliant`.

Si el diff cambia una de ellas, entra en el alcance y todas las políticas que la llaman quedan afectadas.

---

## Etapa 2 — Auditoría estática adversarial (catálogo de ataques)

Recorre cada objeto en alcance con este catálogo. Cada punto es un ataque, no una nota de estilo. Para cada acierto, escribe el *exploit* concreto (qué usuario, qué sentencia, qué fila): los plausibles se convertirán en pgTAP en la Etapa 3.

### A. Exposición de tablas
1. **RLS sin activar.** La tabla tiene `grant ... to authenticated` pero no `enable row level security`: exposición total. Para tablas que solo escribe `service_role` es lo esperado; para lecturas de `authenticated`, no.
2. **`UPDATE` a nivel de tabla para `authenticated`**: la brecha de re-asignación. Con `grant update on table X to authenticated`, un usuario puede hacer `UPDATE X SET account_id = '<otro tenant>'` y mover una fila a otra cuenta (o robarla); `WITH CHECK` por sí solo no lo impide de forma fiable. Según `apps/web/supabase/AGENTS.md`, el `UPDATE` debe concederse **por columnas** (`grant update (col1, col2) ...`) excluyendo `id`, `account_id` y cualquier FK de propiedad. Todo `UPDATE` a nivel de tabla es un FAIL.
3. **Privilegios residuales.** Los valores por defecto de Supabase conceden `TRUNCATE`, `TRIGGER` y `REFERENCES` a `anon`, `authenticated` y `service_role`, y `TRUNCATE` salta RLS. Cada tabla nueva necesita su `revoke all ... from anon, authenticated, service_role`. Es invisible en pruebas normales: compruébalo en pgTAP (ver `privileges.test.sql`).
4. ***Grants* a `anon` o políticas `to public`** sobre datos de un *tenant*. `to public` incluye `anon`. Los datos personales o de equipo deben ir `to authenticated` (o más restringidos).

### B. Huecos en los predicados
5. **Falta `WITH CHECK` en escritura.** `for insert` y `for update` necesitan `with check` para restringir la fila *nueva*. Un `for update ... using (has_role_on_account(account_id))` sin `with check` deja que el usuario cambie `account_id` a una cuenta ajena. `for all` hereda `using` como `with check` por defecto: aceptable, pero verifica que el predicado sirve también para escribir.
6. **`INSERT` con `account_id` sin restringir.** El `with check` debe atar la fila a una cuenta que controla el usuario (`has_role_on_account(account_id)` / `= (select auth.uid())`), no a `true`.
7. **`using (true)` o predicados demasiado amplios.** Solo son legítimos en tablas de referencia globales (por ejemplo `roles`). Para cualquier tabla con `account_id` es una brecha de lectura.
8. **Rol o permiso comprobado sobre el `account_id` equivocado.** El predicado debe usar el `account_id` de la propia fila. Vigila el **sombreado de argumentos y columnas**: los *helpers* desambiguan (`has_role_on_account.account_id`) y una política que pasa la columna equivocada comprueba otra cuenta sin avisar.
9. **Membresía usada como autorización de escrituras destructivas.** `has_role_on_account` no basta para `update`/`delete`: deben ir condicionados por `public.has_permission(...)`, como en `07-invitations.sql` y `17-storage.sql`.

### C. Capas RESTRICTIVE / defensa en profundidad
10. **La barrera de MFA debe ser RESTRICTIVE.** Las políticas `restrict_mfa_*` (`13-mfa.sql` y las equivalentes del esquema del CMS) son `as restrictive` para combinarse con AND. Una tabla sensible nueva sin su política MFA restrictiva, **o una política MFA escrita como permisiva** (que suma acceso con OR), anula la garantía de MFA.
11. **Políticas de super-admin** (`14-super-admin.sql`) dependen de `is_super_admin()`, que exige AAL2. Las tablas nuevas que deban verse desde administración necesitan su `super_admins_access_*`; las que no, no deben heredarla por accidente.

### D. Funciones SECURITY DEFINER (superficie que salta RLS)
12. **Falta `set search_path = ''`.** Una función *definer* sin `search_path` vacío se puede secuestrar con un esquema controlado por quien llama. Una función nueva sin él es un FAIL.
13. **Sin comprobación de permisos antes del trabajo privilegiado.** Deben validar (`is_account_owner`, `has_permission`, `<cms>.verify_admin_access`, `raise exception` explícito) *antes* de tocar datos. Una función *definer* concedida a `authenticated` que lee o escribe por un `account_id` recibido sin comprobar la membresía es un agujero RPC entre *tenants*.
14. **`grant execute` demasiado amplio.** ¿Debe poder llamarla `authenticated` o solo `service_role`?
15. **Identidad recibida por parámetro.** `auth.uid()` dentro de una función *definer* sigue resolviendo a quien llama; verifica que la función no acepta un `user_id` en el que confía en lugar de derivarlo de `auth.uid()`.
16. **Justificación en español.** Cada `security definer`, `grant` y `revoke` lleva un comentario en español que explica la decisión de seguridad (`docs/tfg/GUIA-COMENTARIOS.md` §5). Su ausencia es un ⚠️.

### E. Vistas y rendimiento
17. **Vistas sin `security_invoker = true`.** Una vista sobre una tabla con RLS se ejecuta con los privilegios del propietario y salta el RLS de quien consulta. Las dos vistas de `16-account-views.sql` lo fijan; cualquier vista nueva sobre datos de *tenants* debe hacerlo.
18. **`auth.uid()` sin envolver como `(select auth.uid())`.** No afecta a la corrección, pero sí al rendimiento (se reevalúa por fila) y rompe la convención.

### F. Storage
19. **Las políticas de `storage.objects`** (`17-storage.sql`) deben filtrar por `bucket_id` Y por propiedad (`kit.get_storage_filename_as_uuid(name)` → cuenta). Sin `bucket_id` hay fuga entre *buckets*; sin la propiedad, fuga entre *tenants* del mismo *bucket*.

### G. Esquema del CMS (`<cms>`)
20. **Aislamiento entre ambos mundos.** Un usuario de la app SaaS sin la marca de acceso al CMS en `app_metadata` no debe leer ni escribir nada del esquema `<cms>`, y un administrador del CMS no gana acceso a datos de *tenants* de `public` salvo por los permisos de datos que conceda el RBAC del CMS (`has_data_permission`).
21. **Escalada de privilegios en el RBAC.** Un administrador no puede concederse ni asignar roles, permisos o grupos de rango superior al suyo (`can_action_role`, `can_modify_account_role`, `get_user_max_role_rank`).
22. **SQL dinámico.** Las funciones CRUD y de búsqueda (`26-crud-functions.sql`, `28-global-search.sql`) construyen SQL con identificadores recibidos: deben pasar por `sanitize_identifier` / `validate_schema_access` y usar `format('%I')` / parámetros enlazados, nunca concatenación.

---

## Etapa 3 — Demostrarlo con pgTAP (la parte profunda)

**Esto es lo que diferencia esta skill de una lectura.** Para cada hallazgo plausible de la Etapa 2, y para cada garantía de aislamiento que quieras *confirmar*, escribe un test pgTAP que ejecute el ataque como el usuario atacante y compruebe que falla. Los tests viven en `apps/web/supabase/tests/database/*.test.sql`.

Tómalos como modelo de la suite existente (por ejemplo `invitations.test.sql`, `memberships.test.sql`, `active-account.test.sql`; para el CMS, `rbac-hardening.test.sql` o `has-data-permission.test.sql`). Usa los *helpers* de `00000-pymekit-helpers.sql`:

- `tests.create_supabase_user('handle', 'email')`: crea usuarios de prueba aislados (no dependas de los usuarios del *seed*; los e2e los modifican).
- `set local role service_role;` y después `public.create_team_account('Nombre', tests.get_supabase_uid('handle'), 'slug');`: crea una cuenta de equipo con propietario (NO te autentiques antes o el *trigger* de cuenta nueva duplicará la membresía del propietario).
- `pymekit.authenticate_as('handle')`: actúa como ese usuario (fija el JWT y AAL1). `pymekit.set_session_aal('aal2')` / `pymekit.set_mfa_factor()` para probar las barreras de MFA; `pymekit.set_super_admin()` para las rutas de administración.
- `tests.get_supabase_uid('handle')`, `pymekit.get_account_id_by_slug('slug')`: resuelven identificadores.
- Aserciones: `results_eq`, `is_empty`, `throws_ok`, `throws_like`, `lives_ok`, `ok`. Envuelve el fichero en `begin; select no_plan(); ... select * from finish(); rollback;`.

**Plantilla de ataque con dos *tenants***, la columna vertebral de una prueba de aislamiento:

```sql
begin;
select no_plan();

select tests.create_supabase_user('attacker', 'attacker@pymekit.test');
select tests.create_supabase_user('victim',   'victim@pymekit.test');

set local role service_role;
select public.create_team_account('Victim Co', tests.get_supabase_uid('victim'), 'victim-co');
set local role postgres;

-- Sembramos una fila de la víctima en la tabla revisada (como service_role o como la víctima)
-- insert into public.<table> (account_id, ...) values (pymekit.get_account_id_by_slug('victim-co'), ...);

-- Pasamos a ser el atacante: un usuario válido SIN membresía en victim-co
select pymekit.authenticate_as('attacker');

-- Aislamiento de lectura: el atacante no ve ninguna fila de la víctima
select is_empty(
  $$ select 1 from public.<table>
     where account_id = pymekit.get_account_id_by_slug('victim-co') $$,
  'attacker cannot read victim rows'
);

-- Aislamiento de escritura: el atacante no puede re-asignar filas a la víctima
select throws_ok(
  $$ update public.<table> set account_id = pymekit.get_account_id_by_slug('victim-co')
     where account_id = (select auth.uid()) $$,
  null, null,
  'attacker cannot re-parent a row into victim account'
);

-- DELETE: el atacante no puede borrar filas de la víctima (0 filas afectadas también
-- es un aprobado: compruébalo contando).
-- INSERT: el with check rechaza un account_id ajeno.

select * from finish();
rollback;
```

Instancia la plantilla para cada clase de ataque señalada. Cubre como mínimo **SELECT, INSERT (with check), UPDATE (incluida la re-asignación `SET account_id`) y DELETE**, y cuando proceda **la barrera MFA restrictiva** (autenticado en AAL1, la lectura sensible sale vacía; en AAL2 con factor, funciona), las rutas de **super-admin** y, para el CMS, un usuario sin la marca de acceso al CMS frente a uno con ella.

Ejecútalos:

```bash
pnpm supabase:web:test    # supabase db test: ejecuta todos los *.test.sql
```

- Un test que **no rechaza** una acción entre *tenants* = **brecha confirmada** (máxima gravedad).
- Un test que pasa = aislamiento demostrado para ese vector. Dilo explícitamente.
- Si Supabase no está arrancado: `pnpm supabase:web:start` (y `pnpm supabase:web:reset` para aplicar el esquema pendiente; resetea siempre antes de fiarte de una ejecución pgTAP, porque la deriva local puede ocultar un *grant* ausente). Si de verdad no puedes ejecutar la base de datos, marca el hallazgo como **solo estático / sin verificar**; nunca insinúes una prueba que no has ejecutado.

Deja los tests de sondeo desechables en el *scratchpad*; incorpora a la suite solo los que documentan una garantía real o una regresión, con comentarios en español que expliquen qué ataque cubren (y sigue el flujo esquema → migración de `apps/web/supabase/AGENTS.md` si el arreglo te corresponde).

---

## Etapa 4 — Redundancia adversarial (refuta tus propios hallazgos)

El contexto que produjo un hallazgo no puede confirmarlo. Para cada **brecha confirmada** y cada **veredicto de «aislamiento correcto»**, consigue una comprobación independiente:

- Lanza un subagente `general-purpose` (o `postgres-expert`) que reciba solo el texto de la política, el resultado pgTAP y la afirmación. Su única tarea es **refutarla**: encontrar la política que en realidad salva la situación, la capa RESTRICTIVE que se pasó por alto, el *trigger* que bloquea la escritura o, en un veredicto de «seguro», el tipo de sentencia, rol o nivel AAL sin probar que todavía filtra. Parte de que «la afirmación es falsa» hasta que no pueda refutarla.
- Una brecha sobrevive solo si el refutador también la reproduce (o no consigue explicarla). Un aprobado sobrevive solo si el refutador no encuentra un vector abierto.

Así se evitan los dos errores clásicos: (a) declarar brecha algo que una capa RESTRICTIVE, un *trigger* o un *grant* por columnas bloquea, y (b) declarar seguro algo porque solo se probó SELECT.

---

## Etapa 5 — Informe

Empieza por el veredicto. Después, por hallazgo:

- ❌ **BREACH** `fichero:línea` — el atacante X puede {leer/escribir/borrar} datos del *tenant* Y mediante `<sentencia>`. **Prueba:** el test pgTAP `<nombre>` no lo rechaza (o: solo estático, sin verificar, con el motivo). **Arreglo:** el cambio concreto de política, *grant*, `with check` o capa restrictiva.
- ⚠️ **WEAKNESS** `fichero:línea` — hueco de defensa en profundidad (política MFA restrictiva ausente, `auth.uid()` sin envolver, `grant execute` demasiado amplio, `security definer` sin justificar en español) que hoy no es una brecha activa pero elimina una capa. Incluye el porqué y el arreglo.
- ✅ **PROVEN** `tabla` — el aislamiento se mantiene para SELECT/INSERT/UPDATE/DELETE (+ MFA/admin cuando proceda); nombra los tests que lo demuestran.

Matriz de aislamiento (solo tablas en alcance):

| Tabla | SELECT | INSERT (with check) | UPDATE (re-asignación) | DELETE | Barrera MFA | Admin |
|---|---|---|---|---|---|---|
| … | ✅/❌/— | | | | | |

**Veredicto global:** ISOLATED / LEAKS / UNVERIFIED. Redáctalo como una decisión seca de publicar o no. Enumera cada ❌ BREACH en una lista numerada a resolver antes del merge, con su test fallido y el arreglo en una línea.

Si has cambiado algo, ejecuta la verificación estándar: `pnpm supabase:web:test`, indica si hace falta `pnpm supabase:web:typegen`, comprueba que `node scripts/tfg/check-branding.mjs` pasa y registra en `docs/tfg/DECISIONES.md` cualquier decisión de seguridad no trivial.
