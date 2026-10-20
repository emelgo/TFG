/*
 * Escenario de evaluación «Fisioterapia Bahía» (F6, CU-07, RNF-01):
 * solicitudes de cita y su área «Citas» en el CMS.
 *
 * La migración tiene dos partes, igual que las de la plataforma:
 *
 *  1. ESQUEMA: la tabla `public.appointment_requests` y sus enumerados,
 *     idéntica a `schemas/56-appointment-requests.sql` (allí se explica el
 *     modelo de seguridad). Se escribe a mano porque incluye lo que el
 *     generador de diferencias no produce: el `revoke` por tabla.
 *  2. DATOS DEL CMS: se registra la tabla con `cms.sync_managed_tables` y se
 *     le dan nombre, descripción, área de navegación, orden y textos de
 *     ayuda en español, con el mismo criterio que
 *     `20261002130000_cms_spanish_display_names.sql`,
 *     `20261002140000_cms_navigation_groups.sql` y
 *     `20261002160000_cms_column_descriptions.sql`. Son datos editables
 *     después en Ajustes → Recursos; no hace falta código de interfaz.
 *
 * [TFG] RNF-01 · CU-07.
 */

-- 1. Esquema --------------------------------------------------------------

create type public.appointment_service as enum(
  'physiotherapy',
  'sports_injury',
  'back_pain',
  'pelvic_floor',
  'rehabilitation'
);

comment on type public.appointment_service is
  'Servicio de la clínica para el que se pide cita';

create type public.appointment_request_status as enum(
  'pending',
  'confirmed',
  'cancelled',
  'completed'
);

comment on type public.appointment_request_status is
  'Estado de una solicitud de cita: pendiente, confirmada, cancelada o atendida';

create table if not exists public.appointment_requests (
  id uuid not null default extensions.uuid_generate_v4(),
  full_name varchar(150) not null,
  email varchar(320) not null,
  phone varchar(20) not null,
  service public.appointment_service not null,
  preferred_date date not null,
  message varchar(1000),
  status public.appointment_request_status not null default 'pending',
  internal_notes varchar(2000),
  privacy_accepted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id),
  constraint appointment_requests_full_name_not_blank check (
    length(trim(full_name)) > 0
  ),
  constraint appointment_requests_email_format check (
    email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  constraint appointment_requests_phone_format check (
    phone ~ '^\+?[0-9 ]{9,19}$'
  )
);

comment on table public.appointment_requests is
  'Solicitudes de cita recibidas desde el formulario público «Pedir cita»';

comment on column public.appointment_requests.full_name is 'Nombre y apellidos del paciente';

comment on column public.appointment_requests.email is 'Correo de contacto del paciente';

comment on column public.appointment_requests.phone is 'Teléfono de contacto del paciente';

comment on column public.appointment_requests.service is 'Servicio para el que se pide cita';

comment on column public.appointment_requests.preferred_date is
  'Día que prefiere el paciente (la clínica confirma la hora)';

comment on column public.appointment_requests.message is
  'Comentario opcional del paciente sobre el motivo de la consulta';

comment on column public.appointment_requests.status is
  'Estado de la solicitud; solo lo cambia el personal desde el CMS';

comment on column public.appointment_requests.internal_notes is
  'Notas internas del personal; el paciente nunca las ve';

comment on column public.appointment_requests.privacy_accepted_at is
  'Momento en que el paciente aceptó la política de privacidad';

alter table public.appointment_requests enable row level security;

-- Sin privilegios para anon ni authenticated (ver el esquema declarativo)
revoke all on public.appointment_requests from anon, authenticated, service_role;

grant select, insert, update, delete on table public.appointment_requests to service_role;

create trigger appointment_requests_set_timestamps
  before insert or update on public.appointment_requests
  for each row execute function public.trigger_set_timestamps();

create index if not exists ix_appointment_requests_status_preferred_date
  on public.appointment_requests (status, preferred_date);

-- 2. Datos del CMS --------------------------------------------------------

-- Registro en el CMS: crea la fila de `cms.table_metadata` con la
-- descripción de columnas, claves y enumerados. Es idempotente.
select cms.sync_managed_tables('public', 'appointment_requests');

-- Tabla: nombre, descripción, área propia «Citas», orden (antes que el
-- Blog: es el área principal del negocio) y formato con el que la citan
-- otras pantallas. Solo se rellena lo que sigue vacío o generado.
update cms.table_metadata as meta
set display_name = 'Solicitudes de cita',
    description = coalesce(
        meta.description,
        'Peticiones de cita recibidas desde el formulario «Pedir cita» de la web'
    ),
    ui_config = coalesce(meta.ui_config, '{}'::jsonb)
        || jsonb_build_object('navigation_group', 'Citas'),
    ordering = coalesce(meta.ordering, 50),
    display_format = coalesce(meta.display_format, '{full_name} ({preferred_date})')
where meta.schema_name = 'public'
  and meta.table_name = 'appointment_requests'
  and meta.display_name is not distinct from cms.generate_display_name('appointment_requests');

-- Columnas: nombre visible, ayuda «?» del formulario y, para las que rellena
-- el sistema, solo lectura. Mismo diccionario por columna que las
-- migraciones de la plataforma.
create temporary table cms_appointment_columns (
    column_name text primary key,
    display_name text not null,
    description text not null,
    is_editable boolean not null
) on commit drop;

insert into cms_appointment_columns (column_name, display_name, description, is_editable)
values
    ('id', 'ID', 'Identificador único de la solicitud. Lo genera el sistema.', false),
    ('full_name', 'Paciente', 'Nombre y apellidos de quien pide la cita.', true),
    ('email', 'Correo electrónico', 'Correo para confirmar la cita con el paciente.', true),
    ('phone', 'Teléfono', 'Teléfono para llamar al paciente si hay que cambiar la cita.', true),
    ('service', 'Servicio', 'Tratamiento para el que se pide cita.', true),
    ('preferred_date', 'Fecha preferida', 'Día que prefiere el paciente. La hora se acuerda al confirmar.', true),
    ('message', 'Comentario del paciente', 'Lo que el paciente cuenta sobre el motivo de la consulta (opcional).', true),
    ('status', 'Estado', 'Pendiente: aún sin contestar. Confirmada: cita dada. Cancelada: no se atenderá. Atendida: el paciente ya vino.', true),
    ('internal_notes', 'Notas internas', 'Apuntes del personal (hora acordada, fisioterapeuta asignado…). El paciente no los ve.', true),
    ('privacy_accepted_at', 'Privacidad aceptada', 'Momento en que el paciente aceptó la política de privacidad. Lo guarda el sistema.', false),
    ('created_at', 'Recibida', 'Fecha y hora en que llegó la solicitud. Se rellena sola.', false),
    ('updated_at', 'Actualizada', 'Fecha y hora del último cambio. Se actualiza sola.', false);

update cms.table_metadata as meta
set columns_config = (
    select jsonb_object_agg(
        col.key,
        case
            when names.column_name is null then col.value
            else col.value || jsonb_build_object(
                'display_name', names.display_name,
                'description', coalesce(
                    nullif(trim(col.value ->> 'description'), ''),
                    names.description
                ),
                'is_editable', names.is_editable
            )
        end
    )
    from jsonb_each(meta.columns_config) as col (key, value)
    left join cms_appointment_columns as names on names.column_name = col.key
)
where meta.schema_name = 'public'
  and meta.table_name = 'appointment_requests'
  and meta.columns_config is not null
  and meta.columns_config <> '{}'::jsonb;
