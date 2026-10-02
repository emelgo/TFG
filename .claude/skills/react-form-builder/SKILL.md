---
name: react-form-builder
description: Crea o modifica forms de React en PymeKit con `@tanstack/react-form`, `@pymekit/ui/field` y validación Zod, gestión de errores, estados de carga y tipado estricto. Dos variantes de envío — web (`useServerFn` + `useMutation`) y CMS en `/admin/cms` (cliente RPC de `@pymekit/cms-ui-core` + `useMutation` + códigos de error de la API). Úsala para formularios de registro, perfil, ajustes, diálogos con form o para arreglar problemas de formularios. Invócala con /react-form-builder o cuando se mencionen forms o validación.
---

# Constructor de formularios React

Eres experto en formularios React robustos, accesibles y con tipos seguros. Toda la web, **incluido el CMS** (`/admin/cms`, ADR-011 y ADR-013), usa la misma pila: `@tanstack/react-form`, componentes de `@pymekit/ui/field`, Zod y use-intl. **No se usa react-hook-form.** Solo cambia cómo se envía el formulario:

| | **Web** (`apps/web`, `packages/features/*`) | **CMS** (`apps/web/src/routes/admin/cms/**`, `packages/cms/*-ui`) |
|---|---|---|
| Envío | `useServerFn(fn)` + `useMutation` | `useCmsApi().api.<método>` (cliente RPC tipado de `@pymekit/cms-ui-core`) + `useMutation` |
| Recarga de datos | `await router.invalidate()` en `onSuccess` | `queryClient.invalidateQueries({ queryKey: cmsQueryKeys.<x>() })` |
| Errores | El servidor devuelve `{ success: false, error: 'clave.i18n' }` | `ApiError` con `errorCode` estable (`@pymekit/cms-shared/error-codes`) → clave i18n con una tabla `utils/<feature>-errors.ts` |
| i18n | `useTranslations('ns')`; claves `ns.clave` | `useTranslations('cms.<feature>')`; claves `cms.*` |
| Dónde vive | `packages/features/<feature>/src/components` | `packages/cms/<feature>-ui/src/components` (solo cliente) |

Componentes y plantillas en [components.md](components.md). Ejemplos reales: `packages/features/team-accounts/src/components/settings/update-team-account-name-form.tsx` (web) y `packages/cms/settings-ui/src/components/general-settings-form.tsx` (CMS).

> No uses `next-safe-action`, `useAction`, *server actions* de Next.js, `useFetcher` ni react-hook-form. **No existe** `@pymekit/ui/form`.

## Reglas comunes

1. **Esquema Zod en un fichero propio** (`src/schema/*.schema.ts` en web, `src/utils/<feature>.ts` en `packages/cms/<feature>-ui`) para reutilizarlo; en el CMS debe coincidir con el esquema estricto (`.strict()`) de la ruta Hono, que vuelve a validar. Importa Zod como `import * as z from 'zod'`.
2. **Sin genéricos redundantes**: los tipos se infieren del esquema.
3. **Ningún texto visible en el código**: etiquetas, descripciones, *placeholders*, mensajes de error de Zod y *toasts* son claves i18n. Añádelas en cada idioma de `packages/i18n/src/messages/<locale>/` (hoy solo `en`).
4. **`data-testid`** en el `<form>`, en cada control y en el botón de envío (lo usa la skill `playwright-e2e`).
5. **Botón de envío deshabilitado** mientras hay un envío en curso.
6. **Errores legibles**: nunca muestres errores internos. El servidor devuelve claves i18n y la UI las traduce.
7. **Sin `useEffect`** salvo necesidad justificada con un comentario. Un único objeto de estado mejor que varios `useState`.
8. **Formularios dentro de diálogos**: usa `useAsyncDialog` para impedir cerrar el diálogo (Escape o clic fuera) mientras se envía. Extiende `dialogProps` en `Dialog`, usa `setIsPending` durante el envío y `setOpen(false)` al terminar.
9. **Contenedor/presentador**: no mezcles la carga de datos y el formulario en el mismo componente; carga arriba y pasa los datos por *props*.
10. Comprueba en `@pymekit/ui` que el componente existe (las primitivas que falten se añaden ahí, nunca en `packages/cms/*`) antes de añadir dependencias. Los componentes son **Base UI**: usa la *prop* `render`, nunca `asChild`.

## Variante web: TanStack Form

### Estructura

```
packages/features/<feature>/src/
├── schema/feature.schema.ts                 # Zod compartido cliente/servidor
├── server/functions/feature.functions.ts    # createServerFn (skill service-builder)
└── components/feature-form.tsx
```

### Reglas específicas

- `useForm({ defaultValues, validators: { onChange: Schema, onSubmit: Schema }, onSubmit })`. **Nunca** genéricos en `useForm`.
- Si el esquema tiene campos opcionales o con `default`, tipa `defaultValues` con `as z.input<typeof Schema>`.
- Cada campo con `<form.Field name="...">{(field) => ...}</form.Field>`, calculando `isInvalid = field.state.meta.isTouched && !field.state.meta.isValid` y pasándolo a `Field data-invalid` y al control con `aria-invalid`.
- **Siempre** `<FieldError errors={field.state.meta.errors} />` en cada campo. `FieldError` trata los mensajes como claves i18n, por eso los mensajes de Zod son claves.
- Para leer un valor de forma reactiva usa `<form.Subscribe selector={(s) => s.values.x}>` o `useStore(form.store, ...)`; **nunca** `form.state.values.x` en el render.
- Envío: `onSubmit` en el `<form>` con `e.preventDefault(); e.stopPropagation(); void form.handleSubmit();`.
- Llamada al servidor: `const fn = useServerFn(myFunction)` y `useMutation({ mutationFn: (data) => fn({ data }) })`. Maneja las tres salidas: `onSuccess` con `{ success: true }`, `onSuccess` con `{ success: false, error }` (error de negocio) y `onError` (fallo inesperado).
- Tras mutar: `await router.invalidate()` (vuelve a ejecutar los *loaders*). Si hay que navegar, la *server function* devuelve `redirectTo` y el cliente hace `router.navigate(...)`; no lances `redirect()` desde una función llamada con `useMutation`.
- Avisos con `toast` de `@pymekit/ui/sonner` (`toast.loading` en `onMutate` y el mismo `id` para `success`/`error`) o con `Alert` de `@pymekit/ui/alert` para errores en línea.

### Plantilla mínima

```tsx
/**
 * Formulario para crear un proyecto dentro de la cuenta activa.
 *
 * Valida en el cliente con el mismo esquema Zod que usa la server function,
 * de modo que el usuario ve los errores al escribir y el servidor nunca
 * confía en esa validación.
 */
import { useRef } from 'react';

import { useForm } from '@tanstack/react-form';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useTranslations } from 'use-intl';
import type { z } from 'zod';

import { Button } from '@pymekit/ui/button';
import { Field, FieldError, FieldLabel } from '@pymekit/ui/field';
import { Input } from '@pymekit/ui/input';
import { toast } from '@pymekit/ui/sonner';
import { Trans } from '@pymekit/ui/trans';

import { CreateProjectSchema } from '../schema/project.schema';
import { createProjectFunction } from '../server/functions/project.functions';

export function CreateProjectForm(props: { accountId: string }) {
  const t = useTranslations('projects');
  const router = useRouter();
  const toastId = useRef<string | number>('');
  const createProject = useServerFn(createProjectFunction);

  const mutation = useMutation({
    mutationFn: (data: z.input<typeof CreateProjectSchema>) =>
      createProject({ data }),
    onMutate: () => {
      toastId.current = toast.loading(t('createLoading'));
    },
    onSuccess: async (res) => {
      if (!res.success) {
        // Error de negocio: el servidor devuelve una clave i18n.
        toast.error(t(res.error), { id: toastId.current });
        return;
      }

      await router.invalidate();
      toast.success(t('createSuccess'), { id: toastId.current });
    },
    onError: () => {
      toast.error(t('createError'), { id: toastId.current });
    },
  });

  const form = useForm({
    defaultValues: { name: '', accountId: props.accountId },
    validators: { onChange: CreateProjectSchema, onSubmit: CreateProjectSchema },
    onSubmit: ({ value }) => mutation.mutate(value),
  });

  return (
    <form
      data-testid="create-project-form"
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <form.Field name="name">
        {(field) => {
          const isInvalid =
            field.state.meta.isTouched && !field.state.meta.isValid;

          return (
            <Field data-invalid={isInvalid}>
              <FieldLabel htmlFor={field.name}>
                <Trans i18nKey="projects.nameLabel" />
              </FieldLabel>

              <Input
                id={field.name}
                name={field.name}
                data-testid="project-name-input"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                aria-invalid={isInvalid}
              />

              <FieldError errors={field.state.meta.errors} />
            </Field>
          );
        }}
      </form.Field>

      <Button
        type="submit"
        data-testid="create-project-submit"
        disabled={mutation.isPending}
      >
        <Trans i18nKey="projects.createSubmit" />
      </Button>
    </form>
  );
}
```

## Variante CMS: TanStack Form + cliente RPC

### Estructura

```
packages/cms/<feature>-ui/src/          # SOLO CLIENTE (@pymekit/cms-<feature>-ui)
├── utils/<feature>.ts                   # esquema Zod + mensajes por código (con tests)
├── hooks/use-<feature>-mutations.ts     # useMutation sobre useCmsApi().api
└── components/<feature>-form.tsx
apps/web/src/routes/admin/cms/<sección>/<página>.tsx   # carga datos y monta el form
```

### Reglas específicas

- El formulario es igual que en la web (`useForm`, `form.Field`, `FieldError`, `form.Subscribe`). Los mensajes de Zod son claves `cms.*`.
- **Nunca** importes rutas, servicios ni `@pymekit/cms-api/server` desde un componente: arrastran Drizzle y la clave secreta (`serverLeakGuard` rompe la *build*). Solo `@pymekit/cms-ui-core` y tipos con `import type`.
- La mutación vive en un *hook* aparte: `useMutation({ mutationFn: (d) => api.x(d), onSuccess: invalidar + toast, onError: toast con la clave del `errorCode` })`.
- Muestra cada acción solo si el usuario tiene permiso (flags de `GET /v1/account`, `permissions` de la respuesta). Es comodidad: la API y la RLS deciden.
- La ruta (`createFileRoute('/admin/cms/...')`) carga con `ensureQueryData(cmsQueries.x())` en el `loader` o lee la caché con `useSuspenseQuery`, y monta el formulario con una `key` que dependa de lo guardado para reiniciarlo tras guardar.

### Plantilla mínima

```tsx
/**
 * Formulario de Ajustes > General del CMS: zona horaria del usuario.
 *
 * Mismo esquema Zod que la API, para avisar antes de enviar; la API vuelve
 * a validar y responde con un código estable si algo falla.
 */
import { useForm } from '@tanstack/react-form';
import { useTranslations } from 'use-intl';

import { Button } from '@pymekit/ui/button';
import { Field, FieldError, FieldLabel } from '@pymekit/ui/field';
import { Input } from '@pymekit/ui/input';

import { useUpdatePreferencesMutation } from '../hooks/use-settings-mutations';
import { GeneralSettingsSchema } from '../utils/general-settings';

export function TimezoneForm(props: { timezone: string }) {
  const t = useTranslations('cms.settings.general');
  const mutation = useUpdatePreferencesMutation();

  const form = useForm({
    defaultValues: { timezone: props.timezone },
    validators: {
      onChange: GeneralSettingsSchema,
      onSubmit: GeneralSettingsSchema,
    },
    onSubmit: ({ value }) => mutation.mutateAsync(value),
  });

  return (
    <form
      data-testid="general-settings-form"
      onSubmit={(event) => {
        event.preventDefault();
        // El aviso de error ya lo muestra la mutación (onError).
        void form.handleSubmit().catch(() => undefined);
      }}
    >
      <form.Field name="timezone">
        {(field) => {
          const isInvalid =
            field.state.meta.isTouched && !field.state.meta.isValid;

          return (
            <Field data-invalid={isInvalid}>
              <FieldLabel htmlFor="cms-timezone">{t('timezone')}</FieldLabel>
              <Input
                id="cms-timezone"
                data-testid="timezone-input"
                value={field.state.value}
                aria-invalid={isInvalid}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
              />
              <FieldError errors={field.state.meta.errors} />
            </Field>
          );
        }}
      </form.Field>

      <form.Subscribe selector={(s) => [s.isDirty, s.isSubmitting] as const}>
        {([isDirty, isSubmitting]) => (
          <Button
            type="submit"
            data-testid="general-settings-submit"
            disabled={!isDirty || isSubmitting}
          >
            {t('save')}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}
```

## Accesibilidad y experiencia de uso

- Todo control tiene etiqueta (`FieldLabel`) asociada por `id`/`htmlFor`.
- Añade una descripción (`FieldDescription`) cuando el campo no sea obvio.
- Los errores se anuncian (`FieldError` ya lleva `role="alert"`).
- Indica la carga en el botón (texto o `Spinner`) y deshabilítalo.
- Usa HTML semántico y atributos ARIA cuando haga falta.

Antes de terminar, comprueba que todas las claves i18n nuevas existen en cada `packages/i18n/src/messages/<locale>/<ns>.json` (el CMS usa `cms.json`).
