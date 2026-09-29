# Requisitos de PymeKit

Estos requisitos se derivan de la propuesta del TFG (apartados *Objetivo*, *Descripción* y *Alcance*). Los identificadores se citan en el código (`[TFG] RF-xx`), en `TRAZABILIDAD.md` y en la memoria. **No se renumeran**: si un requisito se descarta, se marca como ~~tachado~~ con el motivo.

Prioridad: **M** = imprescindible (prototipo mínimo de la propuesta) · **D** = deseable.

## Requisitos funcionales (RF)

| ID | Requisito | Prioridad | Módulo |
|---|---|---|---|
| RF-01 | Interfaz web para el usuario final: landing pública, página de precios y área privada con navegación | M | `apps/web` |
| RF-02 | API de backend para la lógica de negocio y el acceso a datos, mediante *server functions* tipadas y validadas | M | `apps/web`, `packages/*` |
| RF-03 | Registro e inicio de sesión (contraseña y enlace mágico), recuperación de contraseña y verificación de email | M | `packages/features/auth` |
| RF-04 | Segundo factor de autenticación (MFA) y proveedores OAuth configurables | D | `packages/features/auth` |
| RF-05 | Gestión de cuenta personal: perfil, email, contraseña, preferencias de idioma y baja | M | `packages/features/accounts` |
| RF-06 | Cuentas de equipo (una por pyme cliente): crear equipos, invitar miembros, asignar roles y aplicar permisos por funcionalidad | M | `packages/features/team-accounts` |
| RF-07 | Suscripciones con pasarela de pago (Stripe): planes, *checkout*, portal de cliente y sincronización mediante *webhooks* | M | `packages/billing/*` |
| RF-08 | Panel de super-administración de la plataforma: listar y gestionar usuarios y cuentas, bloquear, suplantar y restablecer | M | `packages/features/admin` |
| RF-09 | CMS de administración de datos, integrado en la consola de administración: explorar y editar tablas de la BD, gestionar usuarios y almacenamiento, con permisos propios | M | `packages/cms/*`, `/admin/cms` |
| RF-10 | Registro de auditoría de las acciones realizadas desde el CMS | D | `packages/cms/audit-logs` |
| RF-11 | Paneles (*dashboards*) configurables en el CMS | D | `packages/cms/dashboards` |
| RF-12 | Notificaciones dentro de la aplicación y emails transaccionales | D | `packages/features/notifications`, `packages/mailers` |
| RF-13 | Interfaz multidioma: español por defecto e inglés | M | `packages/i18n` |

## Requisitos no funcionales (RNF)

| ID | Requisito | Cómo se verifica |
|---|---|---|
| RNF-01 | **Reutilización y configurabilidad**: la plataforma se adapta a un nuevo SaaS cambiando la configuración (`*.config.ts`, variables de entorno), sin tocar el núcleo | Evaluación de reutilización (F6): pasos y tiempo para arrancar un proyecto nuevo |
| RNF-02 | **Seguridad**: la autorización se aplica en la BD (RLS) además de en la aplicación. Secretos fuera del repositorio y validación de todas las entradas | pgTAP, `/rls-review`, `/bug-hunt-lite` |
| RNF-03 | **Aislamiento multi-tenant**: los datos de una cuenta no son accesibles desde otra | pgTAP específicos de aislamiento |
| RNF-04 | **Modularidad**: monorepo de paquetes desacoplados con dependencias explícitas y exports separados cliente/servidor | Estructura del monorepo, `manypkg`, typecheck |
| RNF-05 | **Mantenibilidad**: TypeScript estricto, lint y formato automáticos, y código comentado en español didáctico | CI, `revisor-comentarios` |
| RNF-06 | **Calidad verificable**: pruebas unitarias, de BD y E2E de los casos de uso principales | CI en verde |
| RNF-07 | **Desplegabilidad**: despliegue reproducible con Docker y en la nube (Railway), con manual de instalación | Despliegue de prueba (F7) |
| RNF-08 | **Usabilidad y accesibilidad**: interfaz responsive, componentes accesibles y tema claro/oscuro | Revisión manual y E2E |
| RNF-09 | **Rendimiento razonable**: carga de datos en el servidor (*loaders*), caché de consultas y paginación en el CMS | Revisión manual |

## Casos de uso principales (para validación en F6)

| CU | Actor | Descripción | Requisitos |
|---|---|---|---|
| CU-01 | Visitante | Se registra, verifica el email y accede al área privada | RF-01, RF-03 |
| CU-02 | Usuario | Crea un equipo para su pyme e invita a un empleado con rol «member» | RF-06 |
| CU-03 | Propietario del equipo | Contrata un plan con Stripe (modo test) y el estado de la suscripción se refleja en la app | RF-07 |
| CU-04 | Miembro sin permiso | Intenta gestionar la facturación y se le deniega (tanto en la UI como en la BD) | RF-06, RNF-02, RNF-03 |
| CU-05 | Super-admin | Busca un usuario, lo bloquea y lo suplanta para dar soporte | RF-08 |
| CU-06 | Gestor de contenidos | Entra en el CMS y edita registros de una tabla según sus permisos. La acción queda auditada | RF-09, RF-10 |
| CU-07 | Desarrollador | Arranca un nuevo SaaS a partir de PymeKit siguiendo el manual | RNF-01, RNF-07 |
