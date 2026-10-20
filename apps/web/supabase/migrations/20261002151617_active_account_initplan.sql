-- Rendimiento (BITACORA B-55): `public.active_account_id()` es volátil, así
-- que en un WHERE se evaluaba una vez por cada fila de `accounts`. Con unos
-- cientos de cuentas, la lista de miembros e invitaciones superaba el tiempo
-- máximo de sentencia. Envolverla en `(select …)` hace que Postgres la
-- evalúe una sola vez (*InitPlan*). Las funciones conservan sus permisos:
-- `create or replace` no toca los `grant`.

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_active_account_invitations()
 RETURNS TABLE(id integer, email character varying, account_id uuid, invited_by uuid, role character varying, created_at timestamp with time zone, updated_at timestamp with time zone, sent_at timestamp with time zone, last_send_attempt_at timestamp with time zone, resend_count integer, expires_at timestamp with time zone, inviter_name character varying, inviter_email character varying)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  return query
  select * from public.get_account_invitations(
    -- `(select …)`: la función es volátil y, sin la subconsulta, Postgres
    -- la evaluaría una vez por cada fila de `accounts` (BITACORA B-55)
    (select accounts.slug from public.accounts
     where accounts.id = (select public.active_account_id()))
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_active_account_members()
 RETURNS TABLE(id uuid, user_id uuid, account_id uuid, role character varying, role_hierarchy_level integer, primary_owner_user_id uuid, name character varying, email character varying, picture_url character varying, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  return query
  select * from public.get_account_members(
    -- `(select …)`: la función es volátil y, sin la subconsulta, Postgres
    -- la evaluaría una vez por cada fila de `accounts` (BITACORA B-55)
    (select accounts.slug from public.accounts
     where accounts.id = (select public.active_account_id()))
  );
end;
$function$
;


