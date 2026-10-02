# Componentes de formulario

Parte A: **web** (TanStack Form + `@pymekit/ui/field`). Parte B: lo propio del **CMS** (mismos componentes; envío con el cliente RPC y errores por código). Todos los textos son claves i18n `ns.clave` (en el CMS, `cms.*`).

---

## A. Web

### Imports

```typescript
import { useForm } from '@tanstack/react-form';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useTranslations } from 'use-intl';

import { Alert, AlertDescription, AlertTitle } from '@pymekit/ui/alert';
import { Button } from '@pymekit/ui/button';
import { Checkbox } from '@pymekit/ui/checkbox';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@pymekit/ui/field';
import { useAsyncDialog } from '@pymekit/ui/hooks/use-async-dialog';
import { If } from '@pymekit/ui/if';
import { Input } from '@pymekit/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@pymekit/ui/select';
import { toast } from '@pymekit/ui/sonner';
import { Switch } from '@pymekit/ui/switch';
import { Textarea } from '@pymekit/ui/textarea';
import { Trans } from '@pymekit/ui/trans';
```

### Campo de texto con descripción

```tsx
<form.Field name="name">
  {(field) => {
    const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

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

        <FieldDescription>
          <Trans i18nKey="projects.nameDescription" />
        </FieldDescription>

        <FieldError errors={field.state.meta.errors} />
      </Field>
    );
  }}
</form.Field>
```

### Área de texto

```tsx
<Textarea
  id={field.name}
  data-testid="project-description-textarea"
  rows={4}
  value={field.state.value}
  onBlur={field.handleBlur}
  onChange={(e) => field.handleChange(e.target.value)}
  aria-invalid={isInvalid}
/>
```

### Select (Base UI)

`onValueChange` de Base UI puede entregar `null`; conviértelo antes de guardarlo en el formulario.

```tsx
<form.Field name="category">
  {(field) => (
    <Field>
      <FieldLabel>
        <Trans i18nKey="projects.categoryLabel" />
      </FieldLabel>

      <Select
        value={field.state.value}
        onValueChange={(value) => field.handleChange(value ?? '')}
      >
        <SelectTrigger data-testid="project-category-select">
          <SelectValue />
        </SelectTrigger>

        <SelectContent>
          {CATEGORIES.map((category) => (
            <SelectItem key={category} value={category}>
              <Trans i18nKey={`projects.categories.${category}`} />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <FieldError errors={field.state.meta.errors} />
    </Field>
  )}
</form.Field>
```

### Checkbox

```tsx
<form.Field name="acceptTerms">
  {(field) => (
    <Field orientation="horizontal">
      <Checkbox
        id={field.name}
        data-testid="accept-terms-checkbox"
        checked={field.state.value}
        // `checked` puede ser "indeterminate": lo reducimos a booleano.
        onCheckedChange={(checked) => field.handleChange(checked === true)}
      />

      <FieldLabel htmlFor={field.name}>
        <Trans i18nKey="auth.acceptTerms" />
      </FieldLabel>

      <FieldError errors={field.state.meta.errors} />
    </Field>
  )}
</form.Field>
```

### Switch

```tsx
<Field orientation="horizontal" className="justify-between">
  <div>
    <FieldLabel htmlFor={field.name}>
      <Trans i18nKey="account.notificationsLabel" />
    </FieldLabel>
    <FieldDescription>
      <Trans i18nKey="account.notificationsDescription" />
    </FieldDescription>
  </div>

  <Switch
    id={field.name}
    data-testid="notifications-switch"
    checked={field.state.value}
    onCheckedChange={field.handleChange}
  />
</Field>
```

### Campo condicional (lectura reactiva)

```tsx
// Nunca `form.state.values.type` en el render: no se volvería a pintar.
<form.Subscribe selector={(state) => state.values.type}>
  {(type) => (
    <If condition={type === 'company'}>
      <form.Field name="taxId">{(field) => /* … */ null}</form.Field>
    </If>
  )}
</form.Subscribe>
```

### Formulario dentro de un diálogo

```tsx
/**
 * Diálogo que aloja el formulario de creación de proyectos.
 *
 * `useAsyncDialog` bloquea el cierre (Escape, clic fuera, botón X)
 * mientras la mutación está en curso, para que el usuario no pierda
 * el resultado de la operación.
 */
export function CreateProjectDialog(
  props: React.PropsWithChildren<{ open: boolean; onOpenChange: (open: boolean) => void }>,
) {
  const { dialogProps, isPending, setIsPending, setOpen } = useAsyncDialog({
    open: props.open,
    onOpenChange: props.onOpenChange,
  });

  return (
    <Dialog {...dialogProps}>
      <DialogContent showCloseButton={!isPending}>
        <DialogHeader>
          <DialogTitle>
            <Trans i18nKey="projects.createDialogTitle" />
          </DialogTitle>
        </DialogHeader>

        {/* El formulario llama a setIsPending(true) en onMutate,
            a setIsPending(false) en onSettled y a onClose() al tener éxito. */}
        <CreateProjectForm setIsPending={setIsPending} onClose={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
```

### Error en línea y botón de envío

```tsx
<If condition={error}>
  <Alert variant="destructive">
    <AlertTitle>
      <Trans i18nKey="common.genericError" />
    </AlertTitle>
    <AlertDescription>
      <Trans i18nKey={error?.message ?? 'common.genericErrorDescription'} />
    </AlertDescription>
  </Alert>
</If>

<Button type="submit" data-testid="submit-button" disabled={mutation.isPending}>
  <Trans i18nKey={mutation.isPending ? 'common.saving' : 'common.save'} />
</Button>
```

---

## B. CMS (`/admin/cms`)

El CMS usa **los mismos componentes de la parte A** (`@tanstack/react-form` + `@pymekit/ui/field`). Solo cambian el envío (API Hono en vez de *server function*) y los mensajes de error (códigos estables de la API).

### Imports propios del CMS

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useCmsApi } from '@pymekit/cms-ui-core/api-context';
import { cmsQueryKeys } from '@pymekit/cms-ui-core/queries';
import { CMS_API_ERROR_CODES } from '@pymekit/cms-shared/error-codes';
```

### Mutación (en `hooks/use-<feature>-mutations.ts`)

```tsx
/** Guarda las preferencias personales del usuario del CMS. */
export function useUpdatePreferencesMutation() {
  const { api } = useCmsApi();
  const queryClient = useQueryClient();
  const t = useTranslations('cms.settings');

  return useMutation({
    // `api` es el cliente RPC tipado: misma caché y `fetch` que los loaders.
    mutationFn: (data: { timezone?: string }) => api.updatePreferences(data),
    onSuccess: async () => {
      toast.success(t('general.saved'));
      // Se invalida solo lo que ha cambiado.
      await queryClient.invalidateQueries({ queryKey: cmsQueryKeys.account() });
    },
    // El mensaje sale del `errorCode` de la API, nunca de su texto.
    onError: (error) => toast.error(t(getSettingsErrorKey(error, 'general.saveError'))),
  });
}
```

### Mensajes por código de error (en `utils/<feature>-errors.ts`, con test)

```ts
// Claves (relativas a `cms.settings`) por código estable de la API.
const ERROR_KEYS: Record<string, string> = {
  [CMS_API_ERROR_CODES.SETTINGS_PERMISSION_DENIED]: 'errors.permissionDenied',
  [CMS_API_ERROR_CODES.SETTINGS_INVALID_DATA]: 'errors.invalidData',
};

export function getSettingsErrorKey(error: unknown, fallback: string) {
  // `ApiError` del cliente RPC trae `errorCode` y `status`.
  const code = (error as { errorCode?: string } | null)?.errorCode;

  return (code && ERROR_KEYS[code]) || fallback;
}
```

### Botón de envío solo con cambios

```tsx
<form.Subscribe selector={(s) => [s.isDirty, s.isSubmitting] as const}>
  {([isDirty, isSubmitting]) => (
    <Button type="submit" data-testid="general-settings-submit" disabled={!isDirty || isSubmitting}>
      {isSubmitting ? <Spinner className="h-3.5 w-3.5" /> : null}
      {t('save')}
    </Button>
  )}
</form.Subscribe>
```

### Acción visible solo con permiso

```tsx
// Los permisos llegan de la API (`GET /v1/account`, `permissions` de una
// ficha…). Ocultar el botón es comodidad: la API y la RLS vuelven a decidir.
{permissions.canUpdate ? (
  <Button data-testid="member-manage-role" onClick={openDialog}>{t('manageRole')}</Button>
) : null}
```

Ejemplo real completo: `packages/cms/settings-ui/src/components/general-settings-form.tsx` con `hooks/use-settings-mutations.ts` y `utils/settings-errors.ts`.
