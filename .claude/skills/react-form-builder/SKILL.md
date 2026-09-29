---
name: react-form-builder
description: Crea o modifica forms de React en PymeKit con validación Zod, gestión de errores, estados de carga y tipado estricto. Dos variantes — web (`@tanstack/react-form` + `@pymekit/ui/field` + `useServerFn`/`useMutation`) y cms (react-hook-form + `@pymekit/cms-ui/form` + `useFetcher`). Úsala para formularios de registro, perfil, ajustes, diálogos con form o para arreglar problemas de formularios. Invócala con /react-form-builder o cuando se mencionen forms, validación o react-hook-form.
---

> **Aviso (F2, ADR-011 y ADR-013):** el CMS ya no es una app separada. Se integra en la web: API Hono montada en `/api/cms` desde `apps/web/src/routes/api/cms`, pantallas en `apps/web/src/routes/admin/cms` y lógica en `packages/cms/*`. En el CMS se usan TanStack Router, TanStack Form y use-intl, igual que en el resto de la web. Las indicaciones de esta skill sobre React Router, `useFetcher` o react-hook-form **están obsoletas** hasta que se reescriba en F2.9.


# Constructor de formularios React

Eres experto en formularios React robustos, accesibles y con tipos seguros. PymeKit tiene **dos variantes que no se mezclan**; identifica primero en qué app estás.

| | **Web** (`apps/web`, `packages/*`) | **CMS** (`apps/cms`, `packages/cms/*`) |
|---|---|---|
| Librería | `@tanstack/react-form` | `react-hook-form` + `zodResolver` |
| Componentes | `Field`, `FieldLabel`, `FieldDescription`, `FieldError` de `@pymekit/ui/field` | `Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormDescription`, `FormMessage` de `@pymekit/cms-ui/form` |
| Envío | `useServerFn(fn)` + `useMutation` de TanStack Query | `useFetcher()` → `fetcher.submit(...)` hacia la `action` de React Router, que llama a la API Hono |
| Carga | `mutation.isPending` | `fetcher.state === 'submitting'` |
| Recarga de datos | `await router.invalidate()` en `onSuccess` | `invalidateKeys` de la *action* (`createAction`) |
| i18n | `useTranslations('ns')` de `use-intl`; claves `ns.clave` | `useTranslation()` de `react-i18next`; claves `ns:clave` |
| Diálogo asíncrono | `useAsyncDialog` de `@pymekit/ui/hooks/use-async-dialog` | `useAsyncDialog` de `@pymekit/cms-shared/hooks` |

Componentes y plantillas completas en [components.md](components.md). Ejemplos reales (solo lectura): `../makerkit/packages/features/team-accounts/src/components/settings/update-team-account-name-form.tsx` (web) y `../supamode/packages/features/settings/src/components/permissions/dialogs/create-role-dialog.tsx` (CMS).

> No uses `next-safe-action`, `useAction`, `enhanceAction` ni *server actions* de Next.js: PymeKit no usa Next.js. En la web **no existe** `@pymekit/ui/form`.

## Reglas comunes

1. **Esquema Zod en un fichero propio** (`src/schema/*.schema.ts` en web, `src/schemas/` en CMS) para reutilizarlo en el servidor. Importa Zod como `import * as z from 'zod'`.
2. **Sin genéricos redundantes**: los tipos se infieren del esquema.
3. **Ningún texto visible en el código**: etiquetas, descripciones, *placeholders*, mensajes de error de Zod y *toasts* son claves i18n. Añádelas primero en `es` y después en `en`.
4. **`data-testid`** en el `<form>`, en cada control y en el botón de envío (lo usa la skill `playwright-e2e`).
5. **Botón de envío deshabilitado** mientras hay un envío en curso.
6. **Errores legibles**: nunca muestres errores internos. El servidor devuelve claves i18n y la UI las traduce.
7. **Sin `useEffect`** salvo necesidad justificada con un comentario. Un único objeto de estado mejor que varios `useState`.
8. **Formularios dentro de diálogos**: usa `useAsyncDialog` para impedir cerrar el diálogo (Escape o clic fuera) mientras se envía. Extiende `dialogProps` en `Dialog`, usa `setIsPending` durante el envío y `setOpen(false)` al terminar.
9. **Contenedor/presentador**: no mezcles la carga de datos y el formulario en el mismo componente; carga arriba y pasa los datos por *props*.
10. Comprueba en `@pymekit/ui` (web) o `@pymekit/cms-ui` (CMS) que el componente existe antes de añadir dependencias. Los componentes son **Base UI**: usa la *prop* `render`, nunca `asChild`.

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

## Variante CMS: react-hook-form

### Estructura

```
packages/cms/<feature>/src/
├── schemas/index.ts                    # Zod compartido
├── actions/feature-action.ts           # cliente RPC Hono (skill service-builder)
├── api/actions/bridge-actions.ts       # action de React Router (createAction)
└── components/feature-form.tsx
```

### Reglas específicas

- `useForm({ resolver: zodResolver(Schema), mode: 'onChange', reValidateMode: 'onChange', defaultValues })`, sin genéricos.
- Si el esquema necesita mensajes traducidos o límites dinámicos (por ejemplo, `maxRank`), constrúyelo dentro del componente con `t('ns:clave')`, como en el código de referencia.
- Cada campo con `<FormField control={form.control} name="..." render={({ field }) => (...)} />` y **siempre** `<FormMessage />`.
- Envío: `form.handleSubmit((data) => fetcher.submit({ intent: 'create-x', data: JSON.stringify(data) }, { method: 'POST' }))`. La *action* de la ruta lee `intent`, valida `data` con Zod y llama a la función RPC.
- Los *toasts* (`toast.promise`) y la invalidación de consultas viven en la *action* (`createAction` de `@pymekit/cms-shared/router-query-bridge`), no en el componente.
- Muestra el resultado con `fetcher.data` (por ejemplo, `<If condition={fetcher.data?.success}>` con un `Alert variant="success"`).
- Usa `form.formState.isDirty` para no enviar formularios sin cambios.

### Plantilla mínima

```tsx
/**
 * Diálogo del CMS para crear un rol del panel.
 *
 * El envío no llama a la API directamente: pasa por la `action` de React
 * Router, que centraliza los avisos y la invalidación de la caché de
 * TanStack Query para toda la sección de permisos.
 */
import { useFetcher } from 'react-router';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import * as z from 'zod';

import { Button } from '@pymekit/cms-ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@pymekit/cms-ui/form';
import { Input } from '@pymekit/cms-ui/input';
import { Trans } from '@pymekit/cms-ui/trans';

export function CreateRoleForm() {
  const { t } = useTranslation();
  const fetcher = useFetcher<{ success: boolean }>();
  const isSubmitting = fetcher.state === 'submitting';

  const FormSchema = z.object({
    name: z
      .string()
      .min(1, { message: t('settings:errors.nameRequired') })
      .max(50, { message: t('settings:errors.nameLength') }),
  });

  const form = useForm({
    resolver: zodResolver(FormSchema),
    mode: 'onChange',
    reValidateMode: 'onChange',
    defaultValues: { name: '' },
  });

  return (
    <Form {...form}>
      <form
        data-testid="create-role-form"
        className="space-y-4"
        onSubmit={form.handleSubmit((data) =>
          fetcher.submit(
            { intent: 'create-role', data: JSON.stringify(data) },
            { method: 'POST' },
          ),
        )}
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                <Trans i18nKey="settings:roles.name" />
              </FormLabel>

              <FormControl>
                <Input {...field} data-testid="create-role-name-input" />
              </FormControl>

              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type="submit"
          disabled={isSubmitting}
          data-testid="create-role-submit"
        >
          <Trans i18nKey={isSubmitting ? 'common:saving' : 'common:save'} />
        </Button>
      </form>
    </Form>
  );
}
```

## Accesibilidad y experiencia de uso

- Todo control tiene etiqueta (`FieldLabel` / `FormLabel`) asociada por `id`/`htmlFor`.
- Añade una descripción (`FieldDescription` / `FormDescription`) cuando el campo no sea obvio.
- Los errores se anuncian (`FieldError` ya lleva `role="alert"`).
- Indica la carga en el botón (texto o `Spinner`) y deshabilítalo.
- Usa HTML semántico y atributos ARIA cuando haga falta.

Antes de terminar, comprueba que todas las claves i18n nuevas existen en `es` y en `en` (web: `packages/i18n/src/messages/<locale>/<ns>.json`; CMS: `apps/cms/src/i18n/locales/<locale>/<ns>.json`).
