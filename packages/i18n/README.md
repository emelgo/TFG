# `@pymekit/i18n` — textos de la interfaz

Este paquete reúne todo lo que la interfaz necesita para mostrar textos: la configuración de idiomas (`src/config.ts`), los catálogos de mensajes (`src/messages/<idioma>/*.json`), el proveedor de `use-intl` (`src/provider.tsx`), las etiquetas de los enumerados (`src/enum-labels.ts`) y la ayuda para cambiar de idioma (`src/navigation.ts`).

## Por qué PymeKit viene solo en español

PymeKit se dirige a pymes españolas, así que la aplicación se ofrece **solo en español** y no muestra nada en inglés (ADR-021). Aun así, ningún texto visible se escribe directamente en el código: todos salen de claves i18n. Así, traducir la aplicación a otro idioma no exige reescribir componentes, solo añadir un catálogo. Es un **punto de extensión** documentado de la plataforma.

Cómo se resuelve el idioma hoy:

- `supportedLocales` vale `['es']`, y `defaultLocale` es `es`.
- Cualquier otro valor (una *cookie* `locale` antigua, la variable `VITE_DEFAULT_LOCALE`, una preferencia guardada) se resuelve a `es`. La cabecera `Accept-Language` no se usa.
- Los mensajes de validación de Zod también salen en español (`apps/web/src/lib/i18n/zod-locale.ts`).
- Las primitivas de shadcn con textos en inglés se envuelven en `@pymekit/ui` (claves `common.ui.*`).

## Cómo añadir un idioma

Ejemplo con el inglés (`en`):

1. **Mensajes.** Copia `src/messages/es/` en `src/messages/en/` y traduce los valores (nunca las claves). Conserva los marcadores ICU (`{count}`, `{name}`…) con el mismo nombre.
2. **Catálogo.** Importa los ficheros nuevos en `src/messages/index.ts` y añade la entrada `en` al objeto `registry`.
3. **Configuración.** Añade el idioma a `supportedLocales` en `src/config.ts`. Si debe ser el idioma por defecto de una instalación, fija `VITE_DEFAULT_LOCALE=en` en su `.env`.
4. **Correos.** Crea `packages/email-templates/src/locales/en/` con las mismas claves que `es/` y añade `en` a `EMAIL_LANGUAGES` en `packages/email-templates/src/lib/i18n.ts`. Las plantillas de Supabase Auth (`apps/web/supabase/templates/*.html` y los asuntos de `config.toml`) son de un solo idioma: habría que decidir cuál se usa.
5. **Validación.** Elige el idioma de Zod según el *locale* activo en `apps/web/src/lib/i18n/zod-locale.ts`.
6. **Selector.** Vuelve a mostrar `LanguageSelector` (`@pymekit/ui/language-selector`), que escribe la *cookie* `locale` y recarga la página; por ejemplo, en Ajustes de la cuenta o en el pie de la web. Con un solo idioma no se pinta.
7. **Pruebas.** Ejecuta `pnpm --filter @pymekit/i18n test:unit`. El test `src/messages/__tests__/messages.test.ts` comprueba que el nuevo idioma tiene exactamente las mismas claves y marcadores que el español (también en los correos) y que toda clave literal usada en el código existe.

## Reglas al escribir textos

- La clave se añade en `src/messages/es/<namespace>.json`; las claves van en inglés y los textos en español.
- Tampoco se escriben a mano `aria-label`, `title`, `alt` ni `placeholder`: también los leen las personas (o sus lectores de pantalla).
- Los valores de los enumerados de la base de datos tienen su etiqueta en `common.enums.<enumerado>.<valor>`.
