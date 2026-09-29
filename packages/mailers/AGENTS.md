# @pymekit/mailers: servicio de email

`@pymekit/mailers` (`core/`) elige el proveedor de envío según la variable `MAILER_PROVIDER` (`nodemailer` por defecto, o `resend`) mediante un registro. Cada proveedor vive en su propio paquete (`@pymekit/nodemailer`, `@pymekit/resend`) y la interfaz común `Mailer` está en `@pymekit/mailers-shared`.

## Reglas obligatorias

1. Se usa SIEMPRE la fábrica `getMailer()` de `@pymekit/mailers`; nunca se instancia un proveedor directamente.
2. Se usan SIEMPRE las funciones de renderizado de `@pymekit/email-templates` para el HTML de los emails dirigidos a usuarios; no se escribe HTML en línea.
3. Primero se renderiza la plantilla (`renderXxxEmail()`) y después se pasa `{ html, subject }` a `sendEmail()`.
4. NUNCA se escriben a mano las direcciones de remitente o destinatario: se leen de la configuración de entorno (por ejemplo, `EMAIL_SENDER`).
5. `getMailer()` solo se llama en el servidor: el proveedor Nodemailer depende de módulos de Node y lanza un error en el navegador.

## Flujo

1. Renderizar: `const { html, subject } = await renderXxxEmail(props)`
2. Obtener el proveedor: `const mailer = await getMailer()`
3. Enviar: `await mailer.sendEmail({ to, from, subject, html })`

## Ejemplos de referencia

- Envío de invitaciones: `packages/features/team-accounts/src/server/services/account-invitations-dispatcher.service.ts`.
- Borrado de cuenta personal: `packages/features/accounts/src/server/services/delete-personal-account.service.server.ts`.
- Formulario de contacto (`apps/web/src/lib/server/contact.functions.ts`): muestra cómo leer remitente y destinatario del entorno. Es una notificación interna con HTML en línea escapado con `escapeHtml`; no sirve de modelo para emails a usuarios.
