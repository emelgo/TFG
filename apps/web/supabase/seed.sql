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
-- CMS: personal de soporte (acceso limitado al CMS)
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
        '{"username": "Soporte", "picture_url": ""}');

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
