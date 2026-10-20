/*
 * F5 · Plantilla inicial de roles del CMS para el personal de una pyme
 * (ADR-026)
 *
 * El super-admin es la raíz del CMS (ADR-014). El resto del personal entra
 * con un rol del RBAC propio del CMS (`cms.roles`, `cms.permissions`,
 * grupos). Para que una instalación nueva no empiece con el RBAC vacío, esta
 * migración deja preparados dos roles de partida, sin nadie asignado:
 *
 *  - «Soporte» (rango 30): atiende a los clientes. LEE las cuentas, sus
 *    miembros, los usuarios de Auth y el registro de auditoría. No puede
 *    crear, modificar ni borrar nada.
 *  - «Gestor de contenidos» (rango 35): mantiene la web pública. Tiene CRUD
 *    completo sobre las cuatro tablas del blog y sobre los archivos
 *    (almacenamiento), agrupado en el grupo de permisos «Contenidos». No ve
 *    cuentas, usuarios ni facturación.
 *
 * Por qué una migración y no el *seed*: el *seed* solo se ejecuta en local
 * (`supabase db reset`), así que la plantilla no llegaría a producción. Es
 * configuración, no datos de prueba. Para que sea segura sobre una base de
 * datos ya en uso:
 *
 *  - es idempotente: identificadores fijos y `on conflict do nothing` (sin
 *    columna objetivo, para cubrir también los `unique` de `name` y `rank`).
 *    Si la pyme ya tenía un rol con ese nombre o ese rango, se respeta el
 *    suyo y la plantilla no se aplica a medias sobre él;
 *  - no lleva la marca `system_role`/`system_group`/`system_permission`: la
 *    raíz del CMS puede editarlos o borrarlos desde Ajustes → Permisos;
 *  - se ejecuta como `postgres`, sin sesión, igual que el *seed*: la guardia
 *    de objetos de sistema (`55-cms-rbac-hardening.sql`) no interviene.
 *
 * Los identificadores de «Soporte» y de sus tres primeros permisos son los
 * que ya usaba el *seed* para el usuario de pruebas `cms-staff`, de modo que
 * en local el *seed* solo tiene que asignarle el rol.
 *
 * [TFG] RF-09 · ADR-014: personal con acceso limitado al CMS.
 */

-- Roles
insert into cms.roles (id, name, description, rank)
values
  ('9b8c7d6e-5f4a-4b3c-8d2e-1f0a9b8c7d6e', 'Soporte',
   'Atención al cliente: lectura de cuentas, miembros, usuarios y auditoría, sin modificar ni borrar', 30),
  ('5e1d2c3b-4a59-4f68-8e7d-6c5b4a392817', 'Gestor de contenidos',
   'Web pública: gestión completa del blog y de los archivos, sin acceso a cuentas, usuarios ni facturación', 35)
on conflict do nothing;

-- Permisos. Los de datos van por tabla concreta, sin comodines de esquema:
-- el explorador solo mostrará estas tablas a quien los tenga.
insert into cms.permissions (id, name, description, permission_type, system_resource, scope, schema_name,
                             table_name, action, metadata)
values
  -- Soporte: solo lectura (`select`)
  ('1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d', 'Soporte: leer public.accounts',
   'Lectura de las cuentas (personales y de equipo)', 'data', null, 'table', 'public', 'accounts', 'select', '{}'),
  ('2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e', 'Soporte: leer public.accounts_memberships',
   'Lectura de los miembros de las cuentas de equipo', 'data', null, 'table', 'public', 'accounts_memberships',
   'select', '{}'),
  ('3c4d5e6f-7a8b-4c9d-8e1f-2a3b4c5d6e7f', 'Soporte: leer auditoría',
   'Lectura del registro de auditoría del CMS', 'system', 'log', null, null, null, 'select', '{}'),
  ('4d5e6f7a-8b9c-4d0e-9f1a-3b4c5d6e7f80', 'Soporte: leer usuarios',
   'Lectura de los usuarios de la plataforma (explorador de usuarios), sin bloquear ni borrar', 'system',
   'auth_user', null, null, null, 'select', '{}'),
  -- Gestor de contenidos: todas las acciones (`*`) sobre el blog
  ('6f7a8b9c-0d1e-4f2a-8b3c-5d6e7f8091a2', 'Contenidos: gestionar public.blog_posts',
   'Crear, leer, modificar y borrar entradas del blog', 'data', null, 'table', 'public', 'blog_posts', '*', '{}'),
  ('7a8b9c0d-1e2f-4a3b-9c4d-6e7f8091a2b3', 'Contenidos: gestionar public.blog_categories',
   'Crear, leer, modificar y borrar categorías del blog', 'data', null, 'table', 'public', 'blog_categories', '*',
   '{}'),
  ('8b9c0d1e-2f3a-4b4c-8d5e-7f8091a2b3c4', 'Contenidos: gestionar public.blog_tags',
   'Crear, leer, modificar y borrar etiquetas del blog', 'data', null, 'table', 'public', 'blog_tags', '*', '{}'),
  ('9c0d1e2f-3a4b-4c5d-9e6f-8091a2b3c4d5', 'Contenidos: gestionar public.blog_post_tags',
   'Asignar y quitar etiquetas a las entradas del blog', 'data', null, 'table', 'public', 'blog_post_tags', '*',
   '{}'),
  -- Archivos: cualquier bucket y ruta. Hoy el único bucket es el de las
  -- imágenes de cuenta; si la pyme crea uno propio para la web (por
  -- ejemplo, `contenidos`), conviene acotar aquí `bucket_name` a ese bucket.
  ('a0d1e2f3-4b5c-4d6e-8f70-91a2b3c4d5e6', 'Contenidos: gestionar archivos',
   'Subir, ver, renombrar y borrar archivos del almacenamiento', 'data', null, 'storage', null, null, '*',
   '{"bucket_name": "*", "path_pattern": "*"}')
on conflict do nothing;

-- «Soporte» recibe sus permisos directamente
insert into cms.role_permissions (role_id, permission_id)
values
  ('9b8c7d6e-5f4a-4b3c-8d2e-1f0a9b8c7d6e', '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'),
  ('9b8c7d6e-5f4a-4b3c-8d2e-1f0a9b8c7d6e', '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e'),
  ('9b8c7d6e-5f4a-4b3c-8d2e-1f0a9b8c7d6e', '3c4d5e6f-7a8b-4c9d-8e1f-2a3b4c5d6e7f'),
  ('9b8c7d6e-5f4a-4b3c-8d2e-1f0a9b8c7d6e', '4d5e6f7a-8b9c-4d0e-9f1a-3b4c5d6e7f80')
on conflict do nothing;

-- «Gestor de contenidos» los recibe a través de un grupo: así la pyme puede
-- dar los mismos permisos a otro rol (por ejemplo, «Marketing») colgándole
-- el grupo, sin repetirlos uno a uno
insert into cms.permission_groups (id, name, description, created_by)
values ('b1e2f3a4-5c6d-4e7f-9081-a2b3c4d5e6f7', 'Contenidos',
        'Blog completo (entradas, categorías y etiquetas) y archivos del almacenamiento', null)
on conflict do nothing;

insert into cms.permission_group_permissions (group_id, permission_id)
values
  ('b1e2f3a4-5c6d-4e7f-9081-a2b3c4d5e6f7', '6f7a8b9c-0d1e-4f2a-8b3c-5d6e7f8091a2'),
  ('b1e2f3a4-5c6d-4e7f-9081-a2b3c4d5e6f7', '7a8b9c0d-1e2f-4a3b-9c4d-6e7f8091a2b3'),
  ('b1e2f3a4-5c6d-4e7f-9081-a2b3c4d5e6f7', '8b9c0d1e-2f3a-4b4c-8d5e-7f8091a2b3c4'),
  ('b1e2f3a4-5c6d-4e7f-9081-a2b3c4d5e6f7', '9c0d1e2f-3a4b-4c5d-9e6f-8091a2b3c4d5'),
  ('b1e2f3a4-5c6d-4e7f-9081-a2b3c4d5e6f7', 'a0d1e2f3-4b5c-4d6e-8f70-91a2b3c4d5e6')
on conflict do nothing;

insert into cms.role_permission_groups (role_id, group_id)
values ('5e1d2c3b-4a59-4f68-8e7d-6c5b4a392817', 'b1e2f3a4-5c6d-4e7f-9081-a2b3c4d5e6f7')
on conflict do nothing;
