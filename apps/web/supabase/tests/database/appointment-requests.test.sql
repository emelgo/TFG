-- Pruebas de las solicitudes de cita (escenario de evaluación F6, CU-07).
--
-- Comprueba el modelo de seguridad de `schemas/56-appointment-requests.sql`:
--
--  1. Estructura: la tabla existe, tiene RLS activo y está registrada en el
--     CMS dentro del área «Citas».
--  2. Sin acceso por la API de datos: ni `anon` ni `authenticated` pueden
--     leer, insertar, modificar ni borrar (no tienen ningún privilegio), y
--     ningún rol de la API tiene TRUNCATE, TRIGGER ni REFERENCES.
--  3. Alta del servidor: `service_role` (el que usa la server function del
--     formulario) inserta; el estado nace en `pending` y las restricciones
--     rechazan datos mal formados.
--  4. Gestión desde el CMS: Root (el super-admin) lee y cambia el estado y
--     las notas internas con las funciones del CMS, y el cambio queda en la
--     auditoría; el personal de soporte, sin permiso sobre la tabla, no
--     puede ni leerla ni modificarla.
--
-- [TFG] RNF-01 · RNF-02 · CU-07.

begin;

select no_plan();

-- ---------------------------------------------------------------------------
-- 1. Estructura
-- ---------------------------------------------------------------------------

select has_table('public', 'appointment_requests', 'Existe la tabla de solicitudes de cita');

select tests.rls_enabled('public', 'appointment_requests');

select is(
    (select ui_config ->> 'navigation_group' from cms.table_metadata
     where schema_name = 'public' and table_name = 'appointment_requests'),
    'Citas',
    'La tabla está registrada en el CMS, en el área «Citas»'
);

select is(
    (select columns_config -> 'internal_notes' ->> 'display_name' from cms.table_metadata
     where schema_name = 'public' and table_name = 'appointment_requests'),
    'Notas internas',
    'Las columnas tienen nombre visible en español'
);

-- ---------------------------------------------------------------------------
-- 2. Sin acceso por la API de datos
-- ---------------------------------------------------------------------------

select ok(
    not has_table_privilege(api_role, 'public.appointment_requests', privilege),
    format('%s no tiene %s sobre appointment_requests', api_role, privilege)
)
from unnest(array['anon', 'authenticated']) as api_role,
     unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) as privilege;

select ok(
    not has_table_privilege(api_role, 'public.appointment_requests', privilege),
    format('%s no tiene %s sobre appointment_requests', api_role, privilege)
)
from unnest(array['anon', 'authenticated', 'service_role']) as api_role,
     unnest(array['TRUNCATE', 'TRIGGER', 'REFERENCES']) as privilege;

-- Un visitante anónimo no puede saltarse el formulario hablando con la API
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);

select throws_ok(
    $$ insert into public.appointment_requests (full_name, email, phone, service, preferred_date)
       values ('Intruso', 'intruso@example.com', '600000000', 'back_pain', current_date + 1) $$,
    '42501',
    null,
    'anon no puede insertar directamente'
);

select throws_ok(
    $$ select 1 from public.appointment_requests $$,
    '42501',
    null,
    'anon no puede leer las solicitudes'
);

-- Un usuario con sesión (cualquier cliente de la web) tampoco
set local role postgres;
select pymekit.set_identifier('ar_staff', 'cms-staff@pymekit.test');
select tests.authenticate_as('ar_staff');

select throws_ok(
    $$ select 1 from public.appointment_requests $$,
    '42501',
    null,
    'authenticated no puede leer las solicitudes por la API de datos'
);

select throws_ok(
    $$ update public.appointment_requests set status = 'confirmed' $$,
    '42501',
    null,
    'authenticated no puede modificar las solicitudes por la API de datos'
);

-- ---------------------------------------------------------------------------
-- 3. Alta desde el servidor (service_role)
-- ---------------------------------------------------------------------------

set local role postgres;
set local role service_role;

select lives_ok(
    $$ insert into public.appointment_requests
         (full_name, email, phone, service, preferred_date, message)
       values ('Paciente de prueba', 'ar-paciente@example.com', '+34 600 111 222',
               'sports_injury', current_date + 3, 'Esguince de tobillo') $$,
    'service_role puede registrar una solicitud'
);

select is(
    (select status::text from public.appointment_requests where email = 'ar-paciente@example.com'),
    'pending',
    'La solicitud nace en estado pendiente'
);

-- Se guarda el id en un ajuste de la transacción: los usuarios del CMS no
-- pueden leer la tabla directamente para obtenerlo
select set_config(
    'ar_tests.request_id',
    (select id::text from public.appointment_requests where email = 'ar-paciente@example.com'),
    true
);

select throws_ok(
    $$ insert into public.appointment_requests (full_name, email, phone, service, preferred_date)
       values ('Sin arroba', 'no-es-un-correo', '600111222', 'back_pain', current_date + 1) $$,
    '23514',
    null,
    'Se rechaza un correo mal formado'
);

select throws_ok(
    $$ insert into public.appointment_requests (full_name, email, phone, service, preferred_date)
       values ('Teléfono corto', 'corto@example.com', '123', 'back_pain', current_date + 1) $$,
    '23514',
    null,
    'Se rechaza un teléfono demasiado corto'
);

select throws_ok(
    $$ insert into public.appointment_requests (full_name, email, phone, service, preferred_date)
       values ('   ', 'vacio@example.com', '600111222', 'back_pain', current_date + 1) $$,
    '23514',
    null,
    'Se rechaza un nombre vacío'
);

-- ---------------------------------------------------------------------------
-- 4. Gestión desde el CMS
-- ---------------------------------------------------------------------------

set local role postgres;
select pymekit.set_identifier('ar_root', 'super-admin@pymekit.test');
select tests.authenticate_as('ar_root');
select pymekit.set_session_aal('aal2');

select ok(
    cms.has_data_permission('select'::cms.system_action, 'public', 'appointment_requests')
    and cms.has_data_permission('update'::cms.system_action, 'public', 'appointment_requests'),
    'Root tiene permiso de lectura y modificación sobre las solicitudes'
);

select is(
    cms.get_record_by_keys(
        'public',
        'appointment_requests',
        jsonb_build_object('id', current_setting('ar_tests.request_id'))
    ) ->> 'full_name',
    'Paciente de prueba',
    'Root lee la solicitud desde el CMS'
);

select is(
    (cms.update_record(
        'public',
        'appointment_requests',
        current_setting('ar_tests.request_id'),
        '{"status": "confirmed", "internal_notes": "Jueves a las 10:00 con Lucía"}'::jsonb
    ) ->> 'success')::boolean,
    true,
    'Root confirma la cita y anota la hora con cms.update_record'
);

set local role postgres;

select is(
    (select status::text from public.appointment_requests where email = 'ar-paciente@example.com'),
    'confirmed',
    'El estado queda confirmado'
);

select isnt_empty(
    $$ select 1 from cms.audit_logs
       where schema_name = 'public' and table_name = 'appointment_requests'
         and operation = 'UPDATE' $$,
    'El cambio queda registrado en la auditoría del CMS'
);

-- Soporte: acceso al CMS, pero sin permiso sobre las citas
select tests.authenticate_as('ar_staff');
select pymekit.set_session_aal('aal2');

select ok(
    not cms.has_data_permission('select'::cms.system_action, 'public', 'appointment_requests'),
    'Soporte no tiene permiso de lectura sobre las solicitudes'
);

select is(
    (cms.update_record(
        'public',
        'appointment_requests',
        current_setting('ar_tests.request_id'),
        '{"status": "cancelled"}'::jsonb
    ) ->> 'success')::boolean,
    false,
    'Soporte no puede modificar solicitudes con cms.update_record'
);

select * from finish();

rollback;
