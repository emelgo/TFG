/*
 * -------------------------------------------------------
 * Sección: Solicitudes de cita (escenario de evaluación «Fisioterapia Bahía»)
 *
 * Tabla de negocio propia de una pyme que adopta PymeKit: una clínica de
 * fisioterapia recibe desde su web pública el formulario «Pedir cita» y su
 * personal gestiona las solicitudes desde la consola del CMS (área «Citas»).
 *
 * Es el experimento de la Fase 6 (evaluación de la reutilización, CU-07 y
 * RNF-01): demuestra que una tabla nueva se integra en la plataforma sin
 * tocar sus paquetes. La plataforma aporta, sin código adicional, el
 * explorador de datos, los formularios de edición, la auditoría y el control
 * de acceso del CMS.
 *
 * Modelo de seguridad (la autorización vive en PostgreSQL):
 *
 *  - **Nadie de la API de datos lee ni escribe directamente.** `anon` y
 *    `authenticated` no reciben ningún privilegio: con RLS activo y sin
 *    `grant`, PostgREST devuelve 42501 a cualquier intento. Así la superficie
 *    de `anon` sigue siendo exactamente la lectura del blog (ADR-017) y
 *    `anon-surface.test.sql` no cambia.
 *  - **Alta pública solo por el servidor.** La web inserta con una *server
 *    function* que valida con Zod (y CAPTCHA si está configurado) y usa el
 *    cliente `service_role`, que solo escribe las columnas que rellena el
 *    visitante. El estado y las notas internas nunca vienen del formulario:
 *    el estado toma su valor por defecto (`pending`).
 *  - **Gestión solo por el personal del CMS.** El CMS lee y modifica con sus
 *    funciones `security definer` (`cms.get_record_by_keys`,
 *    `cms.update_record`…), que comprueban el permiso de datos del RBAC del
 *    CMS (`cms.has_data_permission`) y dejan rastro en `cms.audit_logs`. El
 *    super-admin de la plataforma es la raíz del CMS (ADR-014).
 *  - Las restricciones `check` repiten en la BD las reglas del formulario,
 *    para que ni un error del servidor ni un acceso con `service_role` puedan
 *    guardar datos mal formados.
 *
 * [TFG] RNF-01 · RNF-02 · CU-07: escenario de ejemplo de reutilización.
 * -------------------------------------------------------
 */

-- Servicios que ofrece la clínica. Las etiquetas visibles están en
-- `common.enums.appointment_service` (i18n), no en la BD.
create type public.appointment_service as enum(
  'physiotherapy',
  'sports_injury',
  'back_pain',
  'pelvic_floor',
  'rehabilitation'
);

comment on type public.appointment_service is
  'Servicio de la clínica para el que se pide cita';

-- Ciclo de vida de una solicitud; solo el personal la cambia desde el CMS.
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
  -- Momento en que el visitante aceptó la política de privacidad: la clínica
  -- trata datos de salud y debe poder demostrar el consentimiento (RGPD)
  privacy_accepted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id),
  constraint appointment_requests_full_name_not_blank check (
    length(trim(full_name)) > 0
  ),
  -- Comprobación básica de formato; la validación completa la hace Zod
  constraint appointment_requests_email_format check (
    email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  -- Prefijo internacional opcional y entre 9 y 15 dígitos (con espacios)
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

-- anon también: los valores por defecto de Supabase le conceden TRUNCATE,
-- que ignora RLS
revoke all on public.appointment_requests from anon, authenticated, service_role;

-- service_role: la server function del formulario inserta con él y las
-- tareas de servidor conservan el acceso completo. Ni anon ni authenticated
-- reciben nada (ver «Modelo de seguridad»): sin grant no hay acceso por la
-- API de datos aunque se añadiera una política por error.
grant select, insert, update, delete on table public.appointment_requests to service_role;

create trigger appointment_requests_set_timestamps
  before insert or update on public.appointment_requests
  for each row execute function public.trigger_set_timestamps();

-- El personal trabaja la bandeja por estado y por fecha preferida
create index if not exists ix_appointment_requests_status_preferred_date
  on public.appointment_requests (status, preferred_date);
