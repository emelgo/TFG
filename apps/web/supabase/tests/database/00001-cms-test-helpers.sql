-- Utilidades de prueba del CMS (esquema `cms_tests`).
--
-- Se cargan después del fichero de helpers generales (prefijo `00000-`), que ya define los
-- helpers `tests.*` (creación de usuarios, `authenticate_as`, etc.). Aquí se
-- añaden los específicos del CMS: UUID deterministas, usuarios con el claim
-- `cms_access` y funciones para simular el nivel AAL o el acceso de
-- administración en los claims JWT de la sesión.
--
-- Igual que el fichero anterior, las definiciones se crean FUERA de una
-- transacción para que persistan en los ficheros `*.test.sql` siguientes.

create schema if not exists cms_tests;

-- anon, authenticated, and service_role should have access to cms_tests schema
grant USAGE on schema cms_tests to anon, authenticated, service_role;

-- Don't allow public to execute any functions in the cms_tests schema
alter default PRIVILEGES in schema cms_tests revoke execute on FUNCTIONS from public;

-- Grant execute to anon, authenticated, and service_role for testing purposes
alter default PRIVILEGES in schema cms_tests grant execute on FUNCTIONS to anon,
    authenticated, service_role;

-- Helper function to create deterministic UUIDs for testing
CREATE OR REPLACE FUNCTION cms_tests.test_uuid(suffix int) RETURNS uuid AS $$
BEGIN
    RETURN ('00000000-0000-0000-0000-' || lpad(suffix::text, 12, '0'))::uuid;
END;
$$ LANGUAGE plpgsql;

-- Override the create_supabase_user function to use a deterministic UUID
CREATE OR REPLACE FUNCTION cms_tests.create_supabase_user(user_id uuid, identifier text, email text default null, phone text default null, metadata jsonb default null)
RETURNS uuid
    SECURITY DEFINER
    SET search_path = auth, pg_temp
AS $$
BEGIN
    -- create the user
    INSERT INTO auth.users (id, email, phone, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
    VALUES (user_id, coalesce(email, concat(user_id, '@test.com')), phone, jsonb_build_object('test_identifier', identifier), '{"cms_access": "true"}'::jsonb, now(), now())
    RETURNING id INTO user_id;

    RETURN user_id;
END;
$$ LANGUAGE plpgsql;

create or replace function cms_tests.set_admin_access(
    p_email text,
    p_admin_access text
)

    returns void
    security definer
as
$$
begin
    update auth.users
    set raw_app_meta_data = raw_app_meta_data || jsonb_build_object('cms_access', p_admin_access)
    where email = p_email;

    perform cms_tests.set_session_admin_access(p_admin_access);
end;
$$ language PLPGSQL;

create or replace function cms_tests.get_id_by_identifier(
    identifier text
)
    returns uuid
as $$
begin

    return (select id from auth.users where raw_user_meta_data->>'test_identifier' = identifier);

end;

$$ language PLPGSQL;

create or replace function cms_tests.set_identifier(
    identifier text,
    user_email text
)
    returns text
    security definer
    set search_path = auth, pg_temp
as
$$
begin
    update auth.users
    set raw_user_meta_data = jsonb_build_object('test_identifier', identifier)
    where email = user_email;

    return identifier;

end;

$$ language PLPGSQL;

create or replace function cms_tests.authenticate_as(
    identifier text
) returns void
as
$$
begin
    perform tests.authenticate_as(identifier);
    perform cms_tests.set_session_aal('aal1');
    perform cms_tests.set_session_admin_access('true');
end;
$$ language plpgsql;

create or replace function cms_tests.set_mfa_factor(
    identifier text = gen_random_uuid()
)
    returns void
as
$$
begin
    insert into "auth"."mfa_factors" ("id", "user_id", "friendly_name", "factor_type", "status", "created_at", "updated_at", "secret")
    values (gen_random_uuid(), auth.uid(), identifier, 'totp', 'verified', '2025-02-24 09:48:18.402031+00', '2025-02-24 09:48:18.402031+00',
            'HOWQFBA7KBDDRSBNMGFYZAFNPRSZ62I5');
end;
$$ language plpgsql security definer;

create or replace function cms_tests.set_session_aal(session_aal auth.aal_level)
    returns void
as
$$
begin
    perform set_config('request.jwt.claims', json_build_object(
            'sub', current_setting('request.jwt.claims')::json ->> 'sub',
            'email', current_setting('request.jwt.claims')::json ->> 'email',
            'phone', current_setting('request.jwt.claims')::json ->> 'phone',
            'user_metadata', current_setting('request.jwt.claims')::json ->> 'user_metadata',
            'app_metadata', current_setting('request.jwt.claims')::json ->> 'app_metadata',
            'aal', session_aal)::text, true);
end;
$$ language plpgsql;

create or replace function cms_tests.set_session_admin_access(admin_access text)
    returns void
as
$$
begin
    perform set_config('request.jwt.claims', json_build_object(
            'sub', current_setting('request.jwt.claims')::json ->> 'sub',
            'email', current_setting('request.jwt.claims')::json ->> 'email',
            'phone', current_setting('request.jwt.claims')::json ->> 'phone',
            'user_metadata', current_setting('request.jwt.claims')::json ->> 'user_metadata',
            'app_metadata', jsonb_build_object('cms_access', admin_access),
            'aal', current_setting('request.jwt.claims')::json ->> 'aal')::text, true);
end;
$$ language plpgsql;

create or replace function cms_tests.set_super_admin() returns void
as
$$
begin
    perform set_config('request.jwt.claims', json_build_object(
            'sub', current_setting('request.jwt.claims')::json ->> 'sub',
            'email', current_setting('request.jwt.claims')::json ->> 'email',
            'phone', current_setting('request.jwt.claims')::json ->> 'phone',
            'user_metadata', current_setting('request.jwt.claims')::json ->> 'user_metadata',
            'app_metadata', json_build_object('cms_access', 'true'),
            'aal', current_setting('request.jwt.claims')::json ->> 'aal'
                                             )::text, true);
end;
$$ language plpgsql;

CREATE OR REPLACE FUNCTION cms_tests.nowish()
      RETURNS timestamp with time zone
      AS
      $$
      BEGIN
      RETURN timeofday()::timestamptz + interval '0.1 second';
      END;
      $$
      LANGUAGE plpgsql STABLE PARALLEL SAFE STRICT;

begin;

select plan(1);

select has_column(
    'auth',
    'users',
    'id',
    'id should exist'
);

select *
from
    finish();

rollback;
