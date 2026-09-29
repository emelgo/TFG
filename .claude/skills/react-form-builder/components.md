# Componentes de formulario

Parte A: **web** (TanStack Form + `@pymekit/ui/field`). Parte B: **CMS** (react-hook-form + `@pymekit/cms-ui/form`). Todos los textos son claves i18n: web con `ns.clave`, CMS con `ns:clave`.

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

## B. CMS

### Imports

```typescript
import { useFetcher } from 'react-router';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { useAsyncDialog } from '@pymekit/cms-shared/hooks';
import { Alert, AlertDescription, AlertTitle } from '@pymekit/cms-ui/alert';
import { Button } from '@pymekit/cms-ui/button';
import { Checkbox } from '@pymekit/cms-ui/checkbox';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@pymekit/cms-ui/form';
import { If } from '@pymekit/cms-ui/if';
import { Input } from '@pymekit/cms-ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@pymekit/cms-ui/select';
import { Switch } from '@pymekit/cms-ui/switch';
import { Textarea } from '@pymekit/cms-ui/textarea';
import { Trans } from '@pymekit/cms-ui/trans';
```

### Campo de texto

```tsx
<FormField
  control={form.control}
  name="displayName"
  render={({ field }) => (
    <FormItem>
      <FormLabel>
        <Trans i18nKey="settings:displayName" />
      </FormLabel>

      <FormControl>
        <Input {...field} data-testid="member-display-name-input" />
      </FormControl>

      <FormDescription>
        <Trans i18nKey="settings:member.displayNameDescription" />
      </FormDescription>

      <FormMessage />
    </FormItem>
  )}
/>
```

### Select

```tsx
<FormField
  control={form.control}
  name="roleId"
  render={({ field }) => (
    <FormItem>
      <FormLabel>
        <Trans i18nKey="settings:roles.role" />
      </FormLabel>

      <Select value={field.value} onValueChange={field.onChange}>
        <FormControl>
          <SelectTrigger data-testid="role-select">
            <SelectValue />
          </SelectTrigger>
        </FormControl>

        <SelectContent>
          {roles.map((role) => (
            <SelectItem key={role.id} value={role.id}>
              {role.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <FormMessage />
    </FormItem>
  )}
/>
```

Los nombres de rol vienen de la base de datos, por eso no pasan por i18n.

### Checkbox y Switch

```tsx
<FormField
  control={form.control}
  name="isActive"
  render={({ field }) => (
    <FormItem className="flex items-center justify-between">
      <div>
        <FormLabel>
          <Trans i18nKey="settings:member.activeLabel" />
        </FormLabel>
        <FormDescription>
          <Trans i18nKey="settings:member.activeDescription" />
        </FormDescription>
      </div>

      <FormControl>
        <Switch
          data-testid="member-active-switch"
          checked={field.value}
          onCheckedChange={field.onChange}
        />
      </FormControl>
    </FormItem>
  )}
/>
```

`Checkbox` se enlaza igual: `checked={field.value}` y `onCheckedChange={field.onChange}`.

### Resultado del envío

```tsx
const fetcher = useFetcher<{ success: boolean }>();

<If condition={fetcher.data?.success}>
  <Alert variant="success">
    <AlertTitle>
      <Trans i18nKey="settings:member.accountUpdated" />
    </AlertTitle>
    <AlertDescription>
      <Trans i18nKey="settings:member.accountUpdatedDescription" />
    </AlertDescription>
  </Alert>
</If>

<Button
  type="submit"
  data-testid="submit-button"
  disabled={!form.formState.isDirty || fetcher.state === 'submitting'}
>
  <Trans i18nKey={fetcher.state === 'submitting' ? 'common:saving' : 'common:save'} />
</Button>
```

### *Action* que recibe el formulario

```typescript
/**
 * Action de React Router para la ficha de un miembro.
 *
 * Despacha por `intent` a la llamada RPC correspondiente e invalida las
 * consultas afectadas para que la tabla y la ficha se refresquen solas.
 */
export const memberDetailsBridgeAction = createAction({
  mutationFn: async ({ request, params }) => {
    const formData = await request.formData();
    const { id: accountId } = IdParamsSchema.parse(params);

    switch (formData.get('intent')) {
      case 'update-account':
        return updateAccountAction(
          accountId,
          UpdateAccountSchema.parse(JSON.parse(formData.get('data') as string)),
        );

      default:
        throw new Error('Invalid intent');
    }
  },
  invalidateKeys: ({ params }) => {
    const { id } = IdParamsSchema.parse(params);

    return [settingsQueryKeys.memberDetails(id), settingsQueryKeys.members()];
  },
});
```
