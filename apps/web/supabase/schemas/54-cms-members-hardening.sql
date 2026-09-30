/*
 * -------------------------------------------------------
 * Sección: endurecimiento de Ajustes > Miembros y Autenticación (F2.7a)
 *
 * Reúne las piezas nuevas que necesitan las pantallas de ajustes del CMS y
 * que no pertenecen a un fichero heredado concreto:
 *
 *  1. `cms.is_root_managed_account`: identifica las cuentas raíz, las de los
 *     super-admins de la plataforma que crea el pegamento de ADR-014
 *     (`53-cms-super-admin.sql`). Las usan `can_action_account`,
 *     `can_modify_account_role` y `set_account_active` para que esas cuentas
 *     nunca se desactiven ni cambien de rol desde el CMS.
 *  2. `cms.guard_mfa_requirement_change`: *trigger* sobre
 *     `cms.configuration` que solo deja relajar la obligación de MFA
 *     (`requires_mfa`) a una cuenta raíz con sesión aal2.
 *
 * [TFG] RF-09 · RNF-02 · ADR-014 · ADR-016.
 * -------------------------------------------------------
 */

/*
 * cms.is_root_managed_account
 *
 * Devuelve `true` si la cuenta del CMS pertenece a un super-admin de la
 * plataforma (`app_metadata.role = 'super-admin'`) o tiene el rol de sistema
 * `Root` (marca `system_role = root`). Ese acceso lo gobierna la plataforma:
 * al dejar de ser super-admin se retira solo (ver `cms.revoke_root_access`),
 * así que el CMS no debe poder desactivar la cuenta ni cambiarle el rol.
 *
 * SECURITY DEFINER porque consulta `auth.users`, que los roles de la API no
 * pueden leer. Solo devuelve sí/no sobre una cuenta; que una cuenta tiene el
 * rol Root ya es visible para cualquier miembro del personal (políticas
 * `view_roles` y `view_account_roles`), así que no revela nada nuevo.
 */
create or replace function cms.is_root_managed_account (p_account_id uuid) returns boolean
language sql
stable
security definer
set
  search_path = '' as $$
    -- Sin acceso vigente al CMS no responde (evita usarla como oráculo de
    -- «¿es super-admin?»). Devolver `false` nunca abre nada: quien la usa
    -- como guardia (`guard_mfa_requirement_change`) exige `true`, y las
    -- demás (`can_action_account`…) ya deniegan sin acceso vigente.
    select cms.verify_admin_access() and (exists (select 1
                   from cms.accounts a
                            join auth.users u on u.id = a.auth_user_id
                   where a.id = p_account_id
                     and u.raw_app_meta_data ->> 'role' = 'super-admin')
        or exists (select 1
                   from cms.account_roles ar
                            join cms.roles r on r.id = ar.role_id
                   where ar.account_id = p_account_id
                     and r.metadata @> '{"system_role": "root"}'::jsonb));
$$;

comment on function cms.is_root_managed_account (uuid) is
  'Indica si una cuenta del CMS es raíz (super-admin de la plataforma o rol Root): no se desactiva ni cambia de rol desde el CMS';

revoke all on function cms.is_root_managed_account (uuid) from public, anon;

grant execute on function cms.is_root_managed_account (uuid) to authenticated, service_role;

/*
 * cms.guard_mfa_requirement_change (trigger BEFORE sobre cms.configuration)
 *
 * [TFG] RNF-02 · ADR-014 · F2.7a. `requires_mfa` decide si todo el personal
 * del CMS tiene que entrar con segundo factor. Desactivarlo rebaja la
 * seguridad de toda la consola, así que, además del permiso
 * `system_setting:update` que ya exige la política RLS de la tabla, solo
 * puede hacerlo:
 *
 *  - una sesión aal2 (quien la relaja ha demostrado su segundo factor), y
 *  - una cuenta raíz (`cms.is_root_managed_account`): un super-admin de la
 *    plataforma, no un administrador delegado del CMS.
 *
 * Volver a exigirlo (o borrar la fila, que el CMS interpreta como
 * «obligatorio», ver `cms.verify_admin_access`) no rebaja nada y no se
 * limita aquí. El cambio queda en la auditoría como aviso (`warning`) gracias
 * al *trigger* genérico de `50-cms-triggers.sql`.
 *
 * Es SECURITY INVOKER a propósito: se aplica a cualquier rol salvo los de
 * mantenimiento (`postgres`, `supabase_admin`), con los que escriben las
 * migraciones, el *seed* y los tests. Si fuera SECURITY DEFINER, `current_user` sería siempre el
 * propietario y la comprobación no distinguiría a quien llama.
 */
create or replace function cms.guard_mfa_requirement_change () returns trigger
language plpgsql
set
  search_path = '' as $$
begin
    -- Solo se salta para los roles de mantenimiento (migraciones, *seed*,
    -- tests); cualquier otro rol, incluido `service_role`, pasa la regla.
    -- Límite conocido: una función SECURITY DEFINER propiedad de `postgres`
    -- también se ejecutaría como `postgres`; hoy ninguna escribe en
    -- `cms.configuration`.
    if current_user in ('postgres', 'supabase_admin') then
        return new;
    end if;

    if new.key = 'requires_mfa' and lower(new.value) = 'false'
        and (tg_op = 'INSERT' or old.key <> 'requires_mfa' or lower(old.value) <> 'false') then
        if not cms.is_aal2()
            or not cms.is_root_managed_account(cms.get_current_user_account_id()) then
            raise exception 'MFA_DISABLE_REQUIRES_ROOT_AAL2'
                using errcode = 'insufficient_privilege';
        end if;
    end if;

    return new;
end;
$$;

comment on function cms.guard_mfa_requirement_change () is
  'Trigger: solo una cuenta raíz con sesión aal2 puede desactivar la obligación de MFA del CMS';

revoke all on function cms.guard_mfa_requirement_change () from public, anon, authenticated, service_role;

create trigger guard_mfa_requirement_change
  before insert or update on cms.configuration
  for each row
execute function cms.guard_mfa_requirement_change ();
