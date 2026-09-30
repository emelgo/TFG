-- WEBHOOKS SEED
-- PLEASE NOTE: These webhooks are only for development purposes. Leave them as they are or add new ones.

-- These webhooks are only for development purposes.
-- In production, you should manually create webhooks in the Supabase dashboard (or create a migration to do so).
-- We don't do it because you'll need to manually add your webhook URL and secret key.

-- this webhook will be triggered after a delete on the subscriptions table
-- which should happen when a user deletes their account (and all their subscriptions)
create trigger "subscriptions_delete"
    after delete
    on "public"."subscriptions"
    for each row
execute function "supabase_functions"."http_request"(
        'http://host.docker.internal:3100/api/db/webhook',
        'POST',
        '{"Content-Type":"application/json", "X-Supabase-Event-Signature":"WEBHOOKSECRET"}',
        '{}',
        '5000'
                 );

-- DATA SEED
-- This is a data dump for testing purposes. It should be used to seed the database with data for testing.


--
-- Data for Name: flow_state; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--


--
-- Data for Name: users; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."users" ("instance_id", "id", "aud", "role", "email", "encrypted_password", "email_confirmed_at",
                            "invited_at", "confirmation_token", "confirmation_sent_at", "recovery_token",
                            "recovery_sent_at", "email_change_token_new", "email_change", "email_change_sent_at",
                            "last_sign_in_at", "raw_app_meta_data", "raw_user_meta_data", "is_super_admin",
                            "created_at", "updated_at", "phone", "phone_confirmed_at", "phone_change",
                            "phone_change_token", "phone_change_sent_at", "email_change_token_current",
                            "email_change_confirm_status", "banned_until", "reauthentication_token",
                            "reauthentication_sent_at", "is_sso_user", "deleted_at", "is_anonymous")
VALUES ('00000000-0000-0000-0000-000000000000', 'b73eb03e-fb7a-424d-84ff-18e2791ce0b4', 'authenticated',
        'authenticated', 'custom@pymekit.test', '$2a$10$b3ZPpU6TU3or30QzrXnZDuATPAx2pPq3JW.sNaneVY3aafMSuR4yi',
        '2024-04-20 08:38:00.860548+00', NULL, '', '2024-04-20 08:37:43.343769+00', '', NULL, '', '', NULL,
        '2024-04-20 08:38:00.93864+00', '{"provider": "email", "providers": ["email"]}',
        '{"sub": "b73eb03e-fb7a-424d-84ff-18e2791ce0b4", "email": "custom@pymekit.test", "email_verified": false, "phone_verified": false}',
        NULL, '2024-04-20 08:37:43.3385+00', '2024-04-20 08:38:00.942809+00', NULL, NULL, '', '', NULL, '', 0, NULL, '',
        NULL, false, NULL, false),
       ('00000000-0000-0000-0000-000000000000', '31a03e74-1639-45b6-bfa7-77447f1a4762', 'authenticated',
        'authenticated', 'test@pymekit.test', '$2a$10$NaMVRrI7NyfwP.AfAVWt6O/abulGnf9BBqwa6DqdMwXMvOCGpAnVO',
        '2024-04-20 08:20:38.165331+00', NULL, '', NULL, '', NULL, '', '', NULL, '2024-04-20 09:36:02.521776+00',
        '{"provider": "email", "providers": ["email"], "role": "super-admin"}',
        '{"sub": "31a03e74-1639-45b6-bfa7-77447f1a4762", "email": "test@pymekit.test", "email_verified": false, "phone_verified": false}',
        NULL, '2024-04-20 08:20:34.459113+00', '2024-04-20 10:07:48.554125+00', NULL, NULL, '', '', NULL, '', 0, NULL,
        '', NULL, false, NULL, false),
       ('00000000-0000-0000-0000-000000000000', '5c064f1b-78ee-4e1c-ac3b-e99aa97c99bf', 'authenticated',
        'authenticated', 'owner@pymekit.test', '$2a$10$D6arGxWJShy8q4RTW18z7eW0vEm2hOxEUovUCj5f3NblyHfamm5/a',
        '2024-04-20 08:36:37.517993+00', NULL, '', '2024-04-20 08:36:27.639648+00', '', NULL, '', '', NULL,
        '2024-04-20 08:36:37.614337+00', '{"provider": "email", "providers": ["email"]}',
        '{"sub": "5c064f1b-78ee-4e1c-ac3b-e99aa97c99bf", "email": "owner@pymekit.test", "email_verified": false, "phone_verified": false}',
        NULL, '2024-04-20 08:36:27.630379+00', '2024-04-20 08:36:37.617955+00', NULL, NULL, '', '', NULL, '', 0, NULL,
        '', NULL, false, NULL, false),
       ('00000000-0000-0000-0000-000000000000', '6b83d656-e4ab-48e3-a062-c0c54a427368', 'authenticated',
        'authenticated', 'member@pymekit.test', '$2a$10$6h/x.AX.6zzphTfDXIJMzuYx13hIYEi/Iods9FXH19J2VxhsLycfa',
        '2024-04-20 08:41:15.376778+00', NULL, '', '2024-04-20 08:41:08.689674+00', '', NULL, '', '', NULL,
        '2024-04-20 08:41:15.484606+00', '{"provider": "email", "providers": ["email"]}',
        '{"sub": "6b83d656-e4ab-48e3-a062-c0c54a427368", "email": "member@pymekit.test", "email_verified": false, "phone_verified": false}',
        NULL, '2024-04-20 08:41:08.683395+00', '2024-04-20 08:41:15.485494+00', NULL, NULL, '', '', NULL, '', 0, NULL,
        '', NULL, false, NULL, false),
       ('00000000-0000-0000-0000-000000000000', 'c5b930c9-0a76-412e-a836-4bc4849a3270', 'authenticated',
        'authenticated', 'super-admin@pymekit.test',
        '$2a$10$gzxQw3vaVni8Ke9UVcn6ueWh674.6xImf6/yWYNc23BSeYdE9wmki', '2025-02-24 13:25:11.176987+00', null, '',
        '2025-02-24 13:25:01.649714+00', '', null, '', '', null, '2025-02-24 13:25:11.17957+00',
        '{"provider": "email", "providers": ["email"], "role": "super-admin"}',
        '{"sub": "c5b930c9-0a76-412e-a836-4bc4849a3270", "email": "super-admin@pymekit.test", "email_verified": true, "phone_verified": false}',
        null, '2025-02-24 13:25:01.646641+00', '2025-02-24 13:25:11.181332+00', null, null, '', '', null
           , '', '0', null, '', null, 'false', null, 'false');

--
-- Data for Name: identities; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."identities" ("provider_id", "user_id", "identity_data", "provider", "last_sign_in_at", "created_at",
                                 "updated_at", "id")
VALUES ('31a03e74-1639-45b6-bfa7-77447f1a4762', '31a03e74-1639-45b6-bfa7-77447f1a4762',
        '{"sub": "31a03e74-1639-45b6-bfa7-77447f1a4762", "email": "test@pymekit.test", "email_verified": false, "phone_verified": false}',
        'email', '2024-04-20 08:20:34.46275+00', '2024-04-20 08:20:34.462773+00', '2024-04-20 08:20:34.462773+00',
        '9bb58bad-24a4-41a8-9742-1b5b4e2d8abd'),
       ('5c064f1b-78ee-4e1c-ac3b-e99aa97c99bf', '5c064f1b-78ee-4e1c-ac3b-e99aa97c99bf',
        '{"sub": "5c064f1b-78ee-4e1c-ac3b-e99aa97c99bf", "email": "owner@pymekit.test", "email_verified": false, "phone_verified": false}',
        'email', '2024-04-20 08:36:27.637388+00', '2024-04-20 08:36:27.637409+00', '2024-04-20 08:36:27.637409+00',
        '090598a1-ebba-4879-bbe3-38d517d5066f'),
       ('b73eb03e-fb7a-424d-84ff-18e2791ce0b4', 'b73eb03e-fb7a-424d-84ff-18e2791ce0b4',
        '{"sub": "b73eb03e-fb7a-424d-84ff-18e2791ce0b4", "email": "custom@pymekit.test", "email_verified": false, "phone_verified": false}',
        'email', '2024-04-20 08:37:43.342194+00', '2024-04-20 08:37:43.342218+00', '2024-04-20 08:37:43.342218+00',
        '4392e228-a6d8-4295-a7d6-baed50c33e7c'),
       ('6b83d656-e4ab-48e3-a062-c0c54a427368', '6b83d656-e4ab-48e3-a062-c0c54a427368',
        '{"sub": "6b83d656-e4ab-48e3-a062-c0c54a427368", "email": "member@pymekit.test", "email_verified": false, "phone_verified": false}',
        'email', '2024-04-20 08:41:08.687948+00', '2024-04-20 08:41:08.687982+00', '2024-04-20 08:41:08.687982+00',
        'd122aca5-4f29-43f0-b1b1-940b000638db'),
        ('c5b930c9-0a76-412e-a836-4bc4849a3270', 'c5b930c9-0a76-412e-a836-4bc4849a3270',
        '{"sub": "c5b930c9-0a76-412e-a836-4bc4849a3270", "email": "super-admin@pymekit.test", "email_verified": true, "phone_verified": false}',
        'email', '2025-02-24 13:25:01.646641+00', '2025-02-24 13:25:11.181332+00', '2025-02-24 13:25:11.181332+00',
        'c5b930c9-0a76-412e-a836-4bc4849a3270');

--
-- Data for Name: instances; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--


--
-- Data for Name: sessions; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

--
-- Data for Name: mfa_amr_claims; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--


--
-- Data for Name: mfa_factors; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--


--
-- Data for Name: mfa_challenges; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--


--
-- Data for Name: refresh_tokens; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

--
-- Data for Name: sso_providers; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--


--
-- Data for Name: saml_providers; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--


--
-- Data for Name: saml_relay_states; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--


--
-- Data for Name: sso_domains; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--


--
-- Data for Name: key; Type: TABLE DATA; Schema: pgsodium; Owner: supabase_admin
--


--
-- Data for Name: accounts; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."accounts" ("id", "primary_owner_user_id", "name", "slug", "email", "is_personal_account",
                                 "updated_at", "created_at", "created_by", "updated_by", "picture_url", "public_data")
VALUES ('5deaa894-2094-4da3-b4fd-1fada0809d1c', '31a03e74-1639-45b6-bfa7-77447f1a4762', 'PymeKit', 'pymekit', NULL,
        false, NULL, NULL, NULL, NULL, NULL, '{}');

--
-- Data for Name: roles; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."roles" ("name", "hierarchy_level")
VALUES ('custom-role', 4);

--
-- Data for Name: accounts_memberships; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."accounts_memberships" ("user_id", "account_id", "account_role", "created_at", "updated_at",
                                             "created_by", "updated_by")
VALUES ('31a03e74-1639-45b6-bfa7-77447f1a4762', '5deaa894-2094-4da3-b4fd-1fada0809d1c', 'owner',
        '2024-04-20 08:21:16.802867+00', '2024-04-20 08:21:16.802867+00', NULL, NULL),
       ('5c064f1b-78ee-4e1c-ac3b-e99aa97c99bf', '5deaa894-2094-4da3-b4fd-1fada0809d1c', 'owner',
        '2024-04-20 08:36:44.21028+00', '2024-04-20 08:36:44.21028+00', NULL, NULL),
       ('b73eb03e-fb7a-424d-84ff-18e2791ce0b4', '5deaa894-2094-4da3-b4fd-1fada0809d1c', 'custom-role',
        '2024-04-20 08:38:02.50993+00', '2024-04-20 08:38:02.50993+00', NULL, NULL),
       ('6b83d656-e4ab-48e3-a062-c0c54a427368', '5deaa894-2094-4da3-b4fd-1fada0809d1c', 'member',
        '2024-04-20 08:41:17.833709+00', '2024-04-20 08:41:17.833709+00', NULL, NULL);

-- MFA Factors
INSERT INTO "auth"."mfa_factors" ("id", "user_id", "friendly_name", "factor_type", "status", "created_at", "updated_at",
                                  "secret", "phone", "last_challenged_at")
VALUES ('659e3b57-1128-4d26-8757-f714fd073fc4', 'c5b930c9-0a76-412e-a836-4bc4849a3270', 'iPhone', 'totp', 'verified',
        '2025-02-24 13:23:55.5805+00', '2025-02-24 13:24:32.591999+00', 'NHOHJVGPO3R3LKVPRMNIYLCDMBHUM2SE', null,
        '2025-02-24 13:24:32.563314+00');

--
-- Data for Name: billing_customers; Type: TABLE DATA; Schema: public; Owner: postgres
--


--
-- Data for Name: invitations; Type: TABLE DATA; Schema: public; Owner: postgres
--


--
-- Data for Name: orders; Type: TABLE DATA; Schema: public; Owner: postgres
--


--
-- Data for Name: order_items; Type: TABLE DATA; Schema: public; Owner: postgres
--


--
-- Data for Name: subscriptions; Type: TABLE DATA; Schema: public; Owner: postgres
--


--
-- Data for Name: subscription_items; Type: TABLE DATA; Schema: public; Owner: postgres
--


--
-- Data for Name: buckets; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

--
-- Data for Name: objects; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--


--
-- Data for Name: s3_multipart_uploads; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--


--
-- Data for Name: s3_multipart_uploads_parts; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--


--
-- Data for Name: hooks; Type: TABLE DATA; Schema: supabase_functions; Owner: supabase_functions_admin
--

--
-- Data for Name: secrets; Type: TABLE DATA; Schema: vault; Owner: supabase_admin
--

--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE SET; Schema: auth; Owner: supabase_auth_admin
--

SELECT pg_catalog.setval('"auth"."refresh_tokens_id_seq"', 5, true);


--
-- Name: billing_customers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('"public"."billing_customers_id_seq"', 1, false);


--
-- Name: invitations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('"public"."invitations_id_seq"', 19, true);


--
-- Name: role_permissions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('"public"."role_permissions_id_seq"', 7, true);


--
-- Name: hooks_id_seq; Type: SEQUENCE SET; Schema: supabase_functions; Owner: supabase_functions_admin
--

SELECT pg_catalog.setval('"supabase_functions"."hooks_id_seq"', 19, true);


--
-- CMS: registro de las tablas de la plataforma en el explorador de datos
--
-- El explorador del CMS solo muestra las tablas descritas en
-- `cms.table_metadata`. `cms.sync_managed_tables` lee el catálogo de
-- PostgreSQL (columnas, claves y relaciones) y crea o actualiza esa
-- descripción. Aquí se registran las tablas de `public` y `auth.users` (para
-- el explorador de usuarios) en el entorno local.
--
-- En producción hay que ejecutar las mismas llamadas una vez aplicadas las
-- migraciones (y de nuevo cada vez que se añadan tablas), con un rol
-- propietario como `postgres`: la función no está concedida a los roles de
-- la API.
--
-- [TFG] RF-09, RF-10.

select cms.sync_managed_tables('public');

select cms.sync_managed_tables('auth', 'users');

--
-- CMS: personal de soporte de demostración (acceso limitado al CMS)
--
-- El super-admin de la plataforma es la raíz del CMS sin configuración
-- adicional (ver 53-cms-super-admin.sql). Para poder probar a mano y con E2E
-- el otro perfil que contempla ADR-014, el del personal con permisos
-- LIMITADOS, se crea aquí un usuario de soporte:
--
--  - `cms-staff@pymekit.test`, con la misma contraseña de pruebas que el resto
--    de usuarios del *seed* (`testingpassword`) y el *claim*
--    `cms_access = 'true'` en `app_metadata` (en producción lo escribe
--    `cms.grant_admin_access`; el *seed* se ejecuta sin sesión, por eso se
--    inserta directamente);
--  - un factor TOTP verificado con el MISMO secreto que el super-admin, para
--    que las pruebas E2E generen el código con la misma clave y obtengan una
--    sesión aal2 (el CMS exige MFA por defecto);
--  - una cuenta activa en `cms.accounts` con el rol «Soporte» (rango 30, muy
--    por debajo de Root, 100), que solo puede LEER dos tablas de `public`
--    (`accounts` y `accounts_memberships`) y el registro de auditoría.
--
-- Todo se inserta como `postgres` (propietario de las tablas), por eso las
-- políticas RLS no intervienen; los identificadores son fijos para que las
-- pruebas puedan referirse a ellos.
--
-- [TFG] RF-09 · ADR-014: RBAC del CMS para el personal que no es super-admin.

INSERT INTO "auth"."users" ("instance_id", "id", "aud", "role", "email", "encrypted_password", "email_confirmed_at",
                            "invited_at", "confirmation_token", "confirmation_sent_at", "recovery_token",
                            "recovery_sent_at", "email_change_token_new", "email_change", "email_change_sent_at",
                            "last_sign_in_at", "raw_app_meta_data", "raw_user_meta_data", "is_super_admin",
                            "created_at", "updated_at", "phone", "phone_confirmed_at", "phone_change",
                            "phone_change_token", "phone_change_sent_at", "email_change_token_current",
                            "email_change_confirm_status", "banned_until", "reauthentication_token",
                            "reauthentication_sent_at", "is_sso_user", "deleted_at", "is_anonymous")
VALUES ('00000000-0000-0000-0000-000000000000', 'd3c1a6f2-7b54-4e0a-9c8d-2f6e5b4a3c21', 'authenticated',
        'authenticated', 'cms-staff@pymekit.test',
        '$2a$10$gzxQw3vaVni8Ke9UVcn6ueWh674.6xImf6/yWYNc23BSeYdE9wmki', '2025-02-24 13:25:11.176987+00', null, '',
        '2025-02-24 13:25:01.649714+00', '', null, '', '', null, '2025-02-24 13:25:11.17957+00',
        '{"provider": "email", "providers": ["email"], "cms_access": "true"}',
        '{"sub": "d3c1a6f2-7b54-4e0a-9c8d-2f6e5b4a3c21", "email": "cms-staff@pymekit.test", "email_verified": true, "phone_verified": false}',
        null, '2025-02-24 13:25:01.646641+00', '2025-02-24 13:25:11.181332+00', null, null, '', '', null,
        '', 0, null, '', null, false, null, false);

INSERT INTO "auth"."identities" ("provider_id", "user_id", "identity_data", "provider", "last_sign_in_at", "created_at",
                                 "updated_at", "id")
VALUES ('d3c1a6f2-7b54-4e0a-9c8d-2f6e5b4a3c21', 'd3c1a6f2-7b54-4e0a-9c8d-2f6e5b4a3c21',
        '{"sub": "d3c1a6f2-7b54-4e0a-9c8d-2f6e5b4a3c21", "email": "cms-staff@pymekit.test", "email_verified": true, "phone_verified": false}',
        'email', '2025-02-24 13:25:01.646641+00', '2025-02-24 13:25:11.181332+00', '2025-02-24 13:25:11.181332+00',
        'd3c1a6f2-7b54-4e0a-9c8d-2f6e5b4a3c21');

-- Mismo secreto TOTP que el super-admin (ver `AuthPageObject.MFA_KEY` en
-- apps/e2e): solo es válido en local. `last_challenged_at` queda a NULL
-- porque Auth exige que sea único entre factores.
INSERT INTO "auth"."mfa_factors" ("id", "user_id", "friendly_name", "factor_type", "status", "created_at", "updated_at",
                                  "secret", "phone", "last_challenged_at")
VALUES ('4f2b7c1e-8a3d-4b6f-9e2c-5d1a7b3c9e80', 'd3c1a6f2-7b54-4e0a-9c8d-2f6e5b4a3c21', 'iPhone', 'totp', 'verified',
        '2025-02-24 13:23:55.5805+00', '2025-02-24 13:24:32.591999+00', 'NHOHJVGPO3R3LKVPRMNIYLCDMBHUM2SE', null,
        null);

insert into cms.accounts (id, auth_user_id, is_active, metadata)
values ('6a0f3e2d-1c4b-4a59-8e7d-3b2c1a0f9e8d', 'd3c1a6f2-7b54-4e0a-9c8d-2f6e5b4a3c21', true,
        '{"username": "Soporte (demo)", "picture_url": ""}');

-- Rol «Soporte»: rango 30. El rango es único en `cms.roles` y decide la
-- jerarquía (un rol solo gestiona a los de rango inferior), así que este
-- personal no puede tocar a nadie con Root.
insert into cms.roles (id, name, description, rank)
values ('9b8c7d6e-5f4a-4b3c-8d2e-1f0a9b8c7d6e', 'Soporte',
        'Personal de soporte: lectura de cuentas y del registro de auditoría', 30);

-- Permisos de solo lectura (`select`). Los de datos van por tabla concreta,
-- sin comodines: el explorador solo le mostrará estas dos tablas.
insert into cms.permissions (id, name, description, permission_type, system_resource, scope, schema_name, table_name,
                             action)
values ('1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d', 'Soporte: leer public.accounts',
        'Lectura de las cuentas (personales y de equipo)', 'data', null, 'table', 'public', 'accounts', 'select'),
       ('2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e', 'Soporte: leer public.accounts_memberships',
        'Lectura de los miembros de las cuentas de equipo', 'data', null, 'table', 'public', 'accounts_memberships',
        'select'),
       ('3c4d5e6f-7a8b-4c9d-8e1f-2a3b4c5d6e7f', 'Soporte: leer auditoría',
        'Lectura del registro de auditoría del CMS', 'system', 'log', null, null, null, 'select');

insert into cms.role_permissions (role_id, permission_id)
values ('9b8c7d6e-5f4a-4b3c-8d2e-1f0a9b8c7d6e', '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'),
       ('9b8c7d6e-5f4a-4b3c-8d2e-1f0a9b8c7d6e', '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e'),
       ('9b8c7d6e-5f4a-4b3c-8d2e-1f0a9b8c7d6e', '3c4d5e6f-7a8b-4c9d-8e1f-2a3b4c5d6e7f');

insert into cms.account_roles (account_id, role_id)
values ('6a0f3e2d-1c4b-4a59-8e7d-3b2c1a0f9e8d', '9b8c7d6e-5f4a-4b3c-8d2e-1f0a9b8c7d6e');

--
-- Blog: contenido de ejemplo (solo desarrollo)
--
-- Tres categorías, cinco etiquetas y cuatro entradas en español sobre SaaS
-- para pymes: tres publicadas (con fecha en el pasado, relativa a `now()`
-- para que sigan visibles cuando se vuelva a crear la base de datos) y un
-- borrador, que la web no debe mostrar (`/blog/<slug>` → 404). Las firma el
-- super-admin del *seed* (su cuenta personal comparte id con su usuario).
--
-- [TFG] RF-01 · ADR-017: contenido gestionado desde el CMS.

insert into public.blog_categories (name, slug)
values ('Gestión', 'gestion'),
       ('Finanzas', 'finanzas'),
       ('Seguridad', 'seguridad');

insert into public.blog_tags (name, slug)
values ('SaaS', 'saas'),
       ('Pymes', 'pymes'),
       ('Productividad', 'productividad'),
       ('Facturación', 'facturacion'),
       ('Seguridad', 'seguridad');

insert into public.blog_posts (slug, title, excerpt, content, status, published_at, author_id, category_id,
                               seo_title, seo_description)
values ('por-que-una-pyme-necesita-un-saas',
        'Por qué una pyme necesita una aplicación SaaS',
        'Hojas de cálculo, correos y papeles sueltos: cuándo compensa pasar a una herramienta en la nube.',
        E'## Del Excel a la nube\n\nMuchas pymes gestionan clientes, pedidos y facturas con **hojas de cálculo** y correos. Funciona hasta que el equipo crece y la información se duplica.\n\nUna aplicación SaaS ofrece:\n\n- Datos centralizados y accesibles desde cualquier lugar.\n- Copias de seguridad y actualizaciones sin intervención.\n- Pago por uso, sin inversión inicial en servidores.\n\n> La clave no es la tecnología, sino dedicar menos tiempo a tareas repetitivas.\n\nSi quieres profundizar, la [Comisión Europea](https://digital-strategy.ec.europa.eu/es) publica guías sobre digitalización de pymes.',
        'published', now() - interval '20 days', 'c5b930c9-0a76-412e-a836-4bc4849a3270',
        (select id from public.blog_categories where slug = 'gestion'),
        'Por qué una pyme necesita un SaaS',
        'Ventajas de pasar de las hojas de cálculo a una aplicación SaaS en una pyme.'),
       ('facturacion-electronica-para-pymes',
        'Facturación electrónica: lo que una pyme debe saber',
        'Plazos, formatos y cómo prepararse para la obligación de emitir facturas electrónicas.',
        E'## Una obligación que llega\n\nLa facturación electrónica será obligatoria entre empresas. Conviene prepararse con tiempo.\n\n### Pasos recomendados\n\n1. Revisar el programa de facturación actual.\n2. Comprobar que genera formatos estructurados.\n3. Formar al equipo de administración.\n\nUn SaaS de facturación se actualiza solo cuando cambia la normativa, así que la pyme no tiene que hacerlo.',
        'published', now() - interval '10 days', 'c5b930c9-0a76-412e-a836-4bc4849a3270',
        (select id from public.blog_categories where slug = 'finanzas'),
        null, null),
       ('proteger-los-datos-de-tus-clientes',
        'Cómo proteger los datos de tus clientes',
        'Buenas prácticas de seguridad para pymes: contraseñas, segundo factor y copias de seguridad.',
        E'## La seguridad también es cosa de pymes\n\nUn incidente de seguridad puede costar la confianza de tus clientes. Algunas medidas sencillas:\n\n- Activa la **verificación en dos pasos** en todas las herramientas.\n- Da a cada persona solo los permisos que necesita.\n- Comprueba que tu proveedor cifra los datos y hace copias de seguridad.\n\n`Acceso mínimo` es la regla de oro: quien no necesita ver un dato, no debe poder verlo.',
        'published', now() - interval '3 days', 'c5b930c9-0a76-412e-a836-4bc4849a3270',
        (select id from public.blog_categories where slug = 'seguridad'),
        'Seguridad de datos en pymes',
        'Medidas sencillas para proteger los datos de los clientes de una pyme.'),
       ('guia-para-migrar-a-la-nube',
        'Guía para migrar a la nube (borrador)',
        'Borrador en preparación: no debe aparecer en la web.',
        E'## Borrador\n\nEsta entrada aún no está publicada.',
        'draft', null, 'c5b930c9-0a76-412e-a836-4bc4849a3270',
        (select id from public.blog_categories where slug = 'gestion'),
        null, null);

insert into public.blog_post_tags (post_id, tag_id)
select post.id, tag.id
from (values ('por-que-una-pyme-necesita-un-saas', 'saas'),
             ('por-que-una-pyme-necesita-un-saas', 'pymes'),
             ('por-que-una-pyme-necesita-un-saas', 'productividad'),
             ('facturacion-electronica-para-pymes', 'facturacion'),
             ('facturacion-electronica-para-pymes', 'pymes'),
             ('proteger-los-datos-de-tus-clientes', 'seguridad'),
             ('proteger-los-datos-de-tus-clientes', 'saas'),
             ('guia-para-migrar-a-la-nube', 'saas')) as link (post_slug, tag_slug)
         join public.blog_posts as post on post.slug = link.post_slug
         join public.blog_tags as tag on tag.slug = link.tag_slug;

--
-- Esquema de demostración de una pyme (solo desarrollo)
--
-- Tablas de ejemplo de un negocio pequeño (clientes, productos, pedidos con
-- sus líneas, facturas y empleados) para enseñar y probar el CMS con datos
-- realistas, y como escenario de reutilización de la plataforma (P-01): una
-- pyme que adopte PymeKit gestionaría sus propias tablas igual que estas.
-- Van en un esquema propio (`demo`) y SOLO en el *seed*, nunca en las
-- migraciones: en producción no existen.
--
-- Seguridad: RLS activo y SIN políticas, y ningún privilegio para `anon` ni
-- `authenticated` (el esquema tampoco se expone en la API de datos). Solo el
-- CMS las lee y escribe, con sus funciones `security definer`, que
-- comprueban los permisos del RBAC del CMS tabla a tabla; `service_role`
-- conserva el DML para tareas de servidor.
--
-- [TFG] RF-09 · RNF-01 (P-01) · ADR-017.

create schema if not exists demo;

comment on schema demo is 'Datos de demostración de una pyme (solo desarrollo)';

revoke all on schema demo from public, anon, authenticated;

grant usage on schema demo to service_role;

create type demo.customer_type as enum ('individual', 'company');

create type demo.order_status as enum ('pending', 'paid', 'shipped', 'delivered', 'cancelled');

create type demo.invoice_status as enum ('draft', 'issued', 'paid', 'overdue', 'void');

create type demo.employment_type as enum ('full_time', 'part_time', 'contractor');

create table demo.customers (
    id bigint generated always as identity primary key,
    customer_type demo.customer_type not null default 'company',
    name varchar(200) not null check (length(trim(name)) > 0),
    tax_id varchar(20) not null unique,
    email varchar(320),
    phone varchar(30),
    city varchar(100),
    province varchar(100),
    postal_code varchar(10),
    created_at timestamptz not null default now()
);

create table demo.products (
    id bigint generated always as identity primary key,
    sku varchar(40) not null unique,
    name varchar(200) not null check (length(trim(name)) > 0),
    category varchar(100),
    unit_price numeric(10, 2) not null check (unit_price >= 0),
    vat_rate numeric(4, 2) not null default 21 check (vat_rate >= 0),
    stock integer not null default 0 check (stock >= 0),
    is_active boolean not null default true,
    created_at timestamptz not null default now()
);

create table demo.employees (
    id bigint generated always as identity primary key,
    first_name varchar(100) not null,
    last_name varchar(150) not null,
    email varchar(320) not null unique,
    job_title varchar(150),
    department varchar(100),
    employment_type demo.employment_type not null default 'full_time',
    hire_date date not null,
    monthly_salary numeric(10, 2) check (monthly_salary >= 0),
    is_active boolean not null default true
);

create table demo.orders (
    id bigint generated always as identity primary key,
    order_number varchar(20) not null unique,
    customer_id bigint not null references demo.customers (id) on delete restrict,
    sales_rep_id bigint references demo.employees (id) on delete set null,
    status demo.order_status not null default 'pending',
    order_date date not null default current_date,
    shipping_city varchar(100),
    total_amount numeric(12, 2) not null default 0 check (total_amount >= 0),
    notes text
);

create table demo.order_items (
    id bigint generated always as identity primary key,
    order_id bigint not null references demo.orders (id) on delete cascade,
    product_id bigint not null references demo.products (id) on delete restrict,
    quantity integer not null check (quantity > 0),
    unit_price numeric(10, 2) not null check (unit_price >= 0),
    discount_pct numeric(5, 2) not null default 0 check (discount_pct between 0 and 100)
);

create table demo.invoices (
    id bigint generated always as identity primary key,
    invoice_number varchar(20) not null unique,
    order_id bigint references demo.orders (id) on delete set null,
    customer_id bigint not null references demo.customers (id) on delete restrict,
    issue_date date not null,
    due_date date not null,
    subtotal numeric(12, 2) not null check (subtotal >= 0),
    vat_amount numeric(12, 2) not null check (vat_amount >= 0),
    total numeric(12, 2) not null check (total >= 0),
    status demo.invoice_status not null default 'issued',
    check (due_date >= issue_date)
);

create index ix_demo_orders_customer_id on demo.orders (customer_id);
create index ix_demo_orders_sales_rep_id on demo.orders (sales_rep_id);
create index ix_demo_order_items_order_id on demo.order_items (order_id);
create index ix_demo_order_items_product_id on demo.order_items (product_id);
create index ix_demo_invoices_order_id on demo.invoices (order_id);
create index ix_demo_invoices_customer_id on demo.invoices (customer_id);

-- RLS activo y sin políticas: nadie lee por la API de datos, ni siquiera
-- con un `grant` concedido por error. El CMS entra con sus funciones
-- `security definer` y `service_role` ignora RLS.
alter table demo.customers enable row level security;
alter table demo.products enable row level security;
alter table demo.employees enable row level security;
alter table demo.orders enable row level security;
alter table demo.order_items enable row level security;
alter table demo.invoices enable row level security;

-- Los valores por defecto de Supabase conceden privilegios (TRUNCATE
-- incluido, que ignora RLS) a los roles de la API: se retiran todos y
-- `service_role` recibe solo el DML
revoke all on all tables in schema demo from anon, authenticated, service_role;
revoke all on all sequences in schema demo from anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema demo to service_role;

insert into demo.customers (customer_type, name, tax_id, email, phone, city, province, postal_code)
values ('company', 'Talleres Mecánicos Guadalete S.L.', 'B11234567', 'administracion@talleresguadalete.example', '956 123 401', 'Jerez de la Frontera', 'Cádiz', '11401'),
       ('company', 'Bodegas del Estrecho S.A.', 'A11876543', 'pedidos@bodegasestrecho.example', '956 223 402', 'Sanlúcar de Barrameda', 'Cádiz', '11540'),
       ('company', 'Panadería La Espiga S.L.', 'B41567890', 'info@laespiga.example', '954 332 403', 'Sevilla', 'Sevilla', '41003'),
       ('individual', 'María José Ruiz Moreno', '31245678K', 'mjruiz@correo.example', '600 111 404', 'Cádiz', 'Cádiz', '11002'),
       ('company', 'Clínica Dental Sonrisas S.L.P.', 'B11987654', 'recepcion@sonrisas.example', '956 443 405', 'El Puerto de Santa María', 'Cádiz', '11500'),
       ('company', 'Construcciones Hermanos Pérez S.L.', 'B29345671', 'obras@hermanosperez.example', '952 554 406', 'Málaga', 'Málaga', '29004'),
       ('individual', 'Antonio Jiménez Castro', '44556677L', 'ajimenez@correo.example', '611 222 407', 'Chiclana de la Frontera', 'Cádiz', '11130'),
       ('company', 'Librería El Faro S.C.', 'J11223344', 'libros@elfaro.example', '956 665 408', 'Rota', 'Cádiz', '11520'),
       ('company', 'Asesoría Fiscal Andaluza S.L.', 'B41998877', 'contacto@asesoriaandaluza.example', '954 776 409', 'Dos Hermanas', 'Sevilla', '41700'),
       ('company', 'Frutas y Verduras Campo Sur S.L.', 'B04112233', 'ventas@camposur.example', '950 887 410', 'Almería', 'Almería', '04001'),
       ('individual', 'Lucía Fernández Gómez', '52334455M', 'lucia.fernandez@correo.example', '622 333 411', 'San Fernando', 'Cádiz', '11100'),
       ('company', 'Hotel Bahía Azul S.L.', 'B11445566', 'reservas@bahiaazul.example', '956 998 412', 'Conil de la Frontera', 'Cádiz', '11140'),
       ('company', 'Transportes Rápidos del Sur S.L.', 'B14667788', 'logistica@rapidossur.example', '957 109 413', 'Córdoba', 'Córdoba', '14005'),
       ('company', 'Óptica Visión Clara S.L.', 'B18778899', 'tienda@visionclara.example', '958 210 414', 'Granada', 'Granada', '18001'),
       ('individual', 'Javier Morales Díaz', '75889900N', 'jmorales@correo.example', '633 444 415', 'Puerto Real', 'Cádiz', '11510'),
       ('company', 'Academia de Idiomas Babel S.L.', 'B21990011', 'secretaria@babel.example', '959 321 416', 'Huelva', 'Huelva', '21001'),
       ('company', 'Ferretería Industrial Arcos S.L.', 'B11001122', 'pedidos@ferreteriaarcos.example', '956 432 417', 'Arcos de la Frontera', 'Cádiz', '11630'),
       ('company', 'Estudio de Arquitectura Luz S.L.P.', 'B23112233', 'estudio@arquitecturaluz.example', '953 543 418', 'Jaén', 'Jaén', '23001'),
       ('individual', 'Carmen López Sánchez', '31667788P', 'carmen.lopez@correo.example', '644 555 419', 'Algeciras', 'Cádiz', '11201'),
       ('company', 'Cooperativa Olivarera San José S.C.A.', 'F23223344', 'cooperativa@olivarerasj.example', '953 654 420', 'Úbeda', 'Jaén', '23400');

insert into demo.products (sku, name, category, unit_price, vat_rate, stock, is_active)
values ('SW-CRM-BAS', 'Licencia CRM básica (mensual)', 'Software', 29.00, 21, 999, true),
       ('SW-CRM-PRO', 'Licencia CRM profesional (mensual)', 'Software', 59.00, 21, 999, true),
       ('SW-FAC-BAS', 'Módulo de facturación electrónica', 'Software', 19.90, 21, 999, true),
       ('SW-INV-001', 'Módulo de inventario', 'Software', 24.50, 21, 999, true),
       ('SRV-IMP-01', 'Implantación y puesta en marcha', 'Servicios', 450.00, 21, 50, true),
       ('SRV-FOR-01', 'Formación presencial (jornada)', 'Servicios', 320.00, 21, 40, true),
       ('SRV-SOP-12', 'Soporte prioritario (12 meses)', 'Servicios', 590.00, 21, 100, true),
       ('SRV-MIG-01', 'Migración de datos desde Excel', 'Servicios', 280.00, 21, 60, true),
       ('HW-TPV-001', 'Terminal punto de venta táctil', 'Hardware', 699.00, 21, 12, true),
       ('HW-IMP-TCK', 'Impresora de tiques térmica', 'Hardware', 149.00, 21, 25, true),
       ('HW-LEC-COD', 'Lector de códigos de barras', 'Hardware', 89.90, 21, 30, true),
       ('HW-CAJ-001', 'Cajón portamonedas', 'Hardware', 65.00, 21, 18, true),
       ('HW-TAB-10', 'Tableta de 10 pulgadas para comandas', 'Hardware', 229.00, 21, 15, true),
       ('SW-WEB-BAS', 'Tienda online básica (mensual)', 'Software', 39.00, 21, 999, true),
       ('SW-RES-001', 'Módulo de reservas', 'Software', 22.00, 21, 999, true),
       ('SRV-DIS-01', 'Diseño de logotipo e identidad', 'Servicios', 390.00, 21, 20, true),
       ('SRV-SEO-01', 'Auditoría SEO', 'Servicios', 250.00, 21, 20, true),
       ('LIB-MAN-01', 'Manual de usuario impreso', 'Material', 12.00, 4, 200, true),
       ('SW-NOM-001', 'Módulo de nóminas', 'Software', 34.00, 21, 999, true),
       ('HW-RTR-001', 'Router 4G de respaldo (descatalogado)', 'Hardware', 119.00, 21, 0, false);

insert into demo.employees (first_name, last_name, email, job_title, department, employment_type, hire_date, monthly_salary, is_active)
values ('Rocío', 'Márquez Vega', 'rocio.marquez@demo.example', 'Directora general', 'Dirección', 'full_time', '2018-03-01', 3900.00, true),
       ('Manuel', 'Ortega Ramos', 'manuel.ortega@demo.example', 'Responsable comercial', 'Ventas', 'full_time', '2019-01-15', 2800.00, true),
       ('Elena', 'Serrano Gil', 'elena.serrano@demo.example', 'Comercial', 'Ventas', 'full_time', '2020-06-01', 2100.00, true),
       ('David', 'Navarro Blanco', 'david.navarro@demo.example', 'Comercial', 'Ventas', 'full_time', '2021-09-13', 2050.00, true),
       ('Inmaculada', 'Delgado Rubio', 'inma.delgado@demo.example', 'Técnica de implantación', 'Operaciones', 'full_time', '2019-11-04', 2300.00, true),
       ('Francisco', 'Molina Cruz', 'fran.molina@demo.example', 'Técnico de soporte', 'Soporte', 'full_time', '2022-02-01', 1850.00, true),
       ('Laura', 'Castillo Herrera', 'laura.castillo@demo.example', 'Técnica de soporte', 'Soporte', 'part_time', '2023-04-17', 1100.00, true),
       ('Sergio', 'Romero Vargas', 'sergio.romero@demo.example', 'Desarrollador', 'Tecnología', 'full_time', '2020-10-05', 2600.00, true),
       ('Marta', 'Iglesias Peña', 'marta.iglesias@demo.example', 'Administrativa', 'Administración', 'full_time', '2018-05-21', 1750.00, true),
       ('Alejandro', 'Cabrera León', 'alejandro.cabrera@demo.example', 'Formador', 'Operaciones', 'contractor', '2024-01-08', 1500.00, true),
       ('Pilar', 'Santos Medina', 'pilar.santos@demo.example', 'Contable', 'Administración', 'part_time', '2021-03-01', 1200.00, true),
       ('Raúl', 'Guerrero Prieto', 'raul.guerrero@demo.example', 'Comercial', 'Ventas', 'full_time', '2019-07-01', 2000.00, false),
       ('Nuria', 'Méndez Calvo', 'nuria.mendez@demo.example', 'Diseñadora', 'Marketing', 'contractor', '2023-09-11', 1400.00, true),
       ('Óscar', 'Reyes Fuentes', 'oscar.reyes@demo.example', 'Responsable de marketing', 'Marketing', 'full_time', '2020-02-17', 2450.00, true),
       ('Beatriz', 'Pastor Aguilar', 'beatriz.pastor@demo.example', 'Técnica de implantación', 'Operaciones', 'full_time', '2022-06-06', 2150.00, true);

-- 30 pedidos con datos deterministas (el mismo *seed* genera siempre lo
-- mismo): cliente, comercial, fecha y estado se derivan del número de pedido
insert into demo.orders (order_number, customer_id, sales_rep_id, status, order_date, shipping_city, notes)
select format('PED-2026-%s', lpad(n::text, 4, '0')),
       customer.id,
       (array [2, 3, 4, 12])[1 + n % 4],
       (array ['pending', 'paid', 'shipped', 'delivered', 'delivered', 'delivered', 'cancelled'])[1 + n % 7]::demo.order_status,
       date '2026-01-05' + (n * 8),
       customer.city,
       case when n % 5 = 0 then 'Entrega en horario de mañana' end
from generate_series(1, 30) as n
         join demo.customers as customer on customer.id = 1 + (n * 7) % 20;

-- Dos o tres líneas por pedido, con productos y cantidades deterministas
insert into demo.order_items (order_id, product_id, quantity, unit_price, discount_pct)
select o.id,
       product.id,
       1 + (o.id + line) % 4,
       product.unit_price,
       case when (o.id + line) % 6 = 0 then 10 else 0 end
from demo.orders as o
         cross join generate_series(1, 3) as line
         join demo.products as product on product.id = 1 + (o.id * 3 + line * 5) % 19
where line <= 2 + o.id % 2;

update demo.orders as o
set total_amount = totals.total
from (select item.order_id,
             round(sum(item.quantity * item.unit_price * (1 - item.discount_pct / 100)
                 * (1 + product.vat_rate / 100)), 2) as total
      from demo.order_items as item
               join demo.products as product on product.id = item.product_id
      group by item.order_id) as totals
where totals.order_id = o.id;

-- Una factura por pedido pagado, enviado o entregado
insert into demo.invoices (invoice_number, order_id, customer_id, issue_date, due_date, subtotal, vat_amount, total, status)
select format('FAC-2026-%s', lpad((row_number() over (order by o.id))::text, 4, '0')),
       o.id,
       o.customer_id,
       o.order_date + 1,
       o.order_date + 31,
       sums.subtotal,
       o.total_amount - sums.subtotal,
       o.total_amount,
       case
           when o.status = 'delivered' then 'paid'
           when o.order_date + 31 < date '2026-09-30' then 'overdue'
           else 'issued'
           end::demo.invoice_status
from demo.orders as o
         join (select order_id, round(sum(quantity * unit_price * (1 - discount_pct / 100)), 2) as subtotal
               from demo.order_items
               group by order_id) as sums on sums.order_id = o.id
where o.status in ('paid', 'shipped', 'delivered');

-- Registro en el CMS y visualización legible: nombres en español y
-- formatos que muestran el nombre del cliente, del producto o el número de
-- pedido en lugar del id numérico
select cms.sync_managed_tables('demo');

update cms.table_metadata as meta
set display_name = config.display_name,
    description = config.description,
    display_format = config.display_format,
    ordering = config.ordering
from (values ('customers', 'Demo: clientes', 'Clientes de la pyme de demostración', '{name}', 1),
             ('products', 'Demo: productos', 'Catálogo de productos y servicios', '{name} ({sku})', 2),
             ('orders', 'Demo: pedidos', 'Pedidos de los clientes', '{order_number}', 3),
             ('order_items', 'Demo: líneas de pedido', 'Productos de cada pedido', 'Línea {id}', 4),
             ('invoices', 'Demo: facturas', 'Facturas emitidas', '{invoice_number}', 5),
             ('employees', 'Demo: empleados', 'Plantilla de la pyme de demostración', '{first_name} {last_name}', 6))
         as config (table_name, display_name, description, display_format, ordering)
where meta.schema_name = 'demo'
  and meta.table_name = config.table_name;

-- Nombres de columna en español (tabla → columna → nombre visible)
update cms.table_metadata as meta
set columns_config = (select jsonb_object_agg(
                                 col.key,
                                 case
                                     when labels.value ? col.key
                                         then col.value || jsonb_build_object('display_name', labels.value ->> col.key)
                                     else col.value
                                     end)
                      from jsonb_each(meta.columns_config) as col)
from jsonb_each('{
  "customers": {"customer_type": "Tipo", "name": "Nombre", "tax_id": "NIF/CIF", "email": "Email",
                "phone": "Teléfono", "city": "Ciudad", "province": "Provincia", "postal_code": "Código postal",
                "created_at": "Alta"},
  "products": {"sku": "Referencia", "name": "Nombre", "category": "Categoría", "unit_price": "Precio unitario",
               "vat_rate": "IVA (%)", "stock": "Existencias", "is_active": "Activo", "created_at": "Alta"},
  "employees": {"first_name": "Nombre", "last_name": "Apellidos", "email": "Email", "job_title": "Puesto",
                "department": "Departamento", "employment_type": "Tipo de contrato",
                "hire_date": "Fecha de alta", "monthly_salary": "Salario mensual", "is_active": "Activo"},
  "orders": {"order_number": "Número", "customer_id": "Cliente", "sales_rep_id": "Comercial", "status": "Estado",
             "order_date": "Fecha", "shipping_city": "Ciudad de envío", "total_amount": "Importe total",
             "notes": "Notas"},
  "order_items": {"order_id": "Pedido", "product_id": "Producto", "quantity": "Cantidad",
                  "unit_price": "Precio unitario", "discount_pct": "Descuento (%)"},
  "invoices": {"invoice_number": "Número", "order_id": "Pedido", "customer_id": "Cliente",
               "issue_date": "Fecha de emisión", "due_date": "Vencimiento", "subtotal": "Base imponible",
               "vat_amount": "IVA", "total": "Total", "status": "Estado"}
}'::jsonb) as labels
where meta.schema_name = 'demo'
  and meta.table_name = labels.key;

-- RBAC de demostración: el rol «Soporte» puede LEER clientes y pedidos, pero
-- no productos, facturas, líneas ni empleados (datos salariales). Sirve para
-- comprobar a mano y con E2E que el CMS solo ofrece lo que el rol permite.
insert into cms.permissions (id, name, description, permission_type, system_resource, scope, schema_name, table_name,
                             action)
values ('4d5e6f7a-8b9c-4dad-9e0f-3b4c5d6e7f80', 'Soporte: leer demo.customers',
        'Lectura de los clientes de la demo', 'data', null, 'table', 'demo', 'customers', 'select'),
       ('5e6f7a8b-9c0d-4ebe-8f1a-4c5d6e7f8091', 'Soporte: leer demo.orders',
        'Lectura de los pedidos de la demo', 'data', null, 'table', 'demo', 'orders', 'select');

insert into cms.role_permissions (role_id, permission_id)
values ('9b8c7d6e-5f4a-4b3c-8d2e-1f0a9b8c7d6e', '4d5e6f7a-8b9c-4dad-9e0f-3b4c5d6e7f80'),
       ('9b8c7d6e-5f4a-4b3c-8d2e-1f0a9b8c7d6e', '5e6f7a8b-9c0d-4ebe-8f1a-4c5d6e7f8091');
