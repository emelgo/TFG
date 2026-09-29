# Guía de comentarios de PymeKit

> Parte del TFG *«Diseño e implementación de una arquitectura software reutilizable para el desarrollo ágil de aplicaciones SaaS orientadas a pymes»*
> (Grado en Ingeniería Informática, ESI – Universidad de Cádiz).

El código de PymeKit forma parte de un Trabajo Fin de Grado, así que lo leerán el tutor y el tribunal, y también el desarrollador que reutilice la plataforma en el futuro. Los comentarios tienen que servir de **explicación didáctica**: alguien que abra un fichero por primera vez debe entender qué hace, por qué existe y cómo encaja en la arquitectura sin tener que leer la memoria.

## 1. Reglas generales

1. **Los comentarios se escriben en español** con una redacción correcta, frases completas y tildes. Los términos técnicos que no tienen una traducción natural se mantienen en inglés y en cursiva o entre comillas la primera vez que aparecen en un fichero (por ejemplo: *server function*, *middleware*, *Row Level Security*).
2. **Los identificadores van en inglés**: variables, funciones, tipos, tablas, columnas, claves i18n y nombres de fichero. Es la convención del ecosistema y evita mezclar idiomas en las API.
3. **Se explica el porqué, no el qué.** El código ya dice lo que hace. El comentario aclara la intención, la decisión de diseño, la restricción de seguridad o el caso límite.
4. **No se nombra la procedencia del código.** Nunca aparecen «Makerkit», «Supamode» ni enlaces a sus webs. El origen solo se documenta internamente en `docs/tfg/ATRIBUCION.md`.
5. **Densidad proporcional.** Hay que comentar más donde hay decisiones de arquitectura (seguridad, RLS, pagos, multi-tenant, middleware) y menos en los componentes de presentación triviales. No se comenta lo evidente (`// incrementa i`).
6. **Los comentarios se mantienen al día.** Si cambia el código, también cambia su comentario. Un comentario desactualizado es peor que no tener ninguno.

## 2. Cabecera de fichero

Todo fichero con lógica relevante lleva una cabecera. Esto incluye servicios, *server functions*, *middleware*, esquemas SQL, configuración, rutas con *loader* y los paquetes de `packages/*`. Los componentes puramente visuales y los ficheros índice (`index.ts` de reexportación) pueden omitirla.

```ts
/**
 * Servicio de cuentas de equipo.
 *
 * Centraliza las operaciones de lectura y escritura sobre las cuentas de
 * equipo (los "espacios de trabajo" de una pyme) y sus miembros. Las
 * funciones de servidor lo usan en lugar de consultar las tablas
 * directamente, para que las reglas de negocio vivan en un único sitio.
 *
 * [TFG] Arquitectura multi-tenant: ver Memoria §Diseño > Modelo de datos (RF-05, RNF-03).
 */
```

La cabecera responde a tres preguntas:
- **Qué** es el módulo, en una línea.
- **Por qué existe** o qué problema resuelve dentro de PymeKit.
- **Cómo encaja**: quién lo usa y de qué depende. Opcionalmente incluye la referencia `[TFG]`.

## 3. Documentación de funciones y tipos exportados (JSDoc)

```ts
/**
 * Crea una cuenta de equipo y asigna al usuario actual como propietario.
 *
 * La creación se delega en la función SQL `create_team_account`, que se
 * ejecuta como `security definer`: así la inserción en `accounts` y en
 * `accounts_memberships` ocurre en una única transacción y no depende de
 * que el cliente tenga permisos directos sobre ambas tablas.
 *
 * @param data.name Nombre visible del equipo.
 * @returns La cuenta creada, con su `slug` para construir la URL.
 * @throws Si el usuario ha alcanzado el límite de equipos de su plan.
 */
```

- En la primera línea va un verbo en tercera persona («Crea», «Devuelve», «Comprueba»).
- `@param`, `@returns` y `@throws` solo se ponen cuando aportan información que no dan los tipos.

## 4. Comentarios en línea

```ts
// Usamos el cliente administrador (que ignora RLS) solo porque el usuario
// aún no es miembro del equipo en este punto; validamos la invitación a mano
// justo antes para no abrir un agujero de seguridad.
const adminClient = getSupabaseServerAdminClient();
```

Los comentarios en línea se usan para explicar decisiones no evidentes, requisitos de seguridad, soluciones a errores de librerías y casos límite. Las líneas se cortan en torno a 80 caracteres.

## 5. SQL (esquemas, migraciones, pruebas pgTAP)

```sql
/*
 * -------------------------------------------------------
 * Sección: Membresías de cuentas
 * Relaciona usuarios con cuentas de equipo y les asigna un rol.
 * Es la pieza central del aislamiento multi-tenant: casi todas las
 * políticas RLS de la plataforma preguntan "¿es este usuario miembro
 * de esta cuenta?" a través de esta tabla.
 * -------------------------------------------------------
 */

-- Solo los miembros de la cuenta pueden ver quién más pertenece a ella.
create policy accounts_memberships_read on public.accounts_memberships
  for select to authenticated using (...);

comment on table public.accounts_memberships is
  'Membresías de usuarios en cuentas de equipo, con su rol';
```

- Los `comment on table/column/function` también van en español, porque aparecen en el CMS y en los tipos generados.
- Cada política RLS lleva un comentario que explica **quién** puede hacer **qué** y **por qué**.
- En `security definer`, `grant` y `revoke` es obligatorio justificar la decisión de seguridad.

## 6. React / TSX

```tsx
/**
 * Diálogo para invitar miembros a un equipo.
 *
 * Solo lo ven los usuarios con el permiso `invites.manage`; la comprobación
 * real se repite en el servidor (nunca confiamos en la UI para autorizar).
 */
export function InviteMembersDialog() { ... }
```

- Los componentes de presentación simples no necesitan comentario.
- Se comentan los *hooks* no triviales, los `useEffect` (que siempre deben justificarse) y la lógica de permisos en la UI.
- Los textos visibles **no** van en el código, sino en los ficheros de mensajes i18n (primero `es`, después `en`).

## 7. Referencias al TFG `[TFG]`

La etiqueta `[TFG]` enlaza un fragmento de código con la memoria o con un requisito. Se usa con moderación, en puntos que el tribunal podría querer revisar:

```ts
// [TFG] RNF-02 Seguridad: la autorización se aplica en la base de datos (RLS),
// no solo en la aplicación. Ver Memoria §Diseño > Seguridad.
```

- Los identificadores de requisitos (`RF-xx`, `RNF-xx`) son los de `docs/tfg/REQUISITOS.md`.
- Las secciones de la memoria se citan por nombre, porque los números cambian mientras se redacta.
- Cada `[TFG]` que se añade se refleja en `docs/tfg/TRAZABILIDAD.md`.

## 8. Qué NO hacer

- ❌ Dejar comentarios en inglés heredados del código de referencia.
- ❌ Traducir literalmente sin entender («// Obtener el usuario» encima de `getUser()`). Si el comentario original era obvio, se elimina.
- ❌ Poner comentarios de historial («cambiado el 3/10 por Enrique»). Para eso está git.
- ❌ Dejar código comentado. Se borra; git lo conserva.
- ❌ Poner `TODO` sin contexto. Se usa `// TODO(F5): <qué falta y por qué>`, indicando la fase del plan.

## 9. Checklist rápida (la usa el agente `revisor-comentarios`)

- [ ] Cabecera presente en los ficheros con lógica.
- [ ] Todos los comentarios están en español correcto (tildes, puntuación).
- [ ] Ninguna referencia a Makerkit o Supamode ni a sus URLs.
- [ ] Explican el porqué y no repiten el código.
- [ ] Las decisiones de seguridad (RLS, admin client, security definer) están justificadas.
- [ ] Las etiquetas `[TFG]` son coherentes con `REQUISITOS.md` y `TRAZABILIDAD.md`.
