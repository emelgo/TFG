/**
 * Diálogos de crear y editar roles y grupos de permisos (F2.7b).
 *
 * Formularios TanStack Form + `@pymekit/ui/field` validados con Zod
 * (`createRoleFormSchema`, `GroupFormSchema`). El selector de rango solo
 * ofrece rangos libres y ESTRICTAMENTE inferiores al del usuario
 * (`getAvailableRanks`), la misma regla que aplican la API
 * (`ROLE_RANK_DENIED`) y la base de datos (política `insert_roles` y
 * *trigger* `update_account_roles_rank_check`).
 */
import { useForm } from '@tanstack/react-form';
import { useTranslations } from 'use-intl';

import { Button } from '@pymekit/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@pymekit/ui/dialog';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@pymekit/ui/field';
import { useAsyncDialog } from '@pymekit/ui/hooks/use-async-dialog';
import { Input } from '@pymekit/ui/input';
import { NativeSelect, NativeSelectOption } from '@pymekit/ui/native-select';
import { Spinner } from '@pymekit/ui/spinner';
import { Textarea } from '@pymekit/ui/textarea';

import {
  useCreateGroupMutation,
  useCreateRoleMutation,
  useUpdateGroupMutation,
  useUpdateRoleMutation,
} from '../../hooks/use-rbac-mutations';
import {
  GroupFormSchema,
  createRoleFormSchema,
  getAvailableRanks,
  toNullableDescription,
} from '../../utils/rbac-forms';

type DialogControl = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Crear un rol (sin `role`) o editarlo (con `role`). */
export function RoleFormDialog(
  props: DialogControl & {
    role?: {
      id: string;
      name: string;
      description: string | null;
      rank: number;
    };
    maxRank: number | null;
    takenRanks: number[];
    onSaved?: (id: string) => void;
  },
) {
  return props.role ? (
    <EditRoleDialog {...props} role={props.role} />
  ) : (
    <CreateRoleDialog {...props} />
  );
}

function CreateRoleDialog(
  props: DialogControl & {
    maxRank: number | null;
    takenRanks: number[];
    onSaved?: (id: string) => void;
  },
) {
  const mutation = useCreateRoleMutation();

  return (
    <RoleFormDialogBody
      {...props}
      mode="create"
      initial={{ name: '', description: '', rank: '' }}
      submit={async (values) => {
        const result = await mutation.mutateAsync({
          name: values.name.trim(),
          description: toNullableDescription(values.description),
          rank: Number(values.rank),
        });

        props.onSaved?.(result.data.id);
      }}
    />
  );
}

function EditRoleDialog(
  props: DialogControl & {
    role: {
      id: string;
      name: string;
      description: string | null;
      rank: number;
    };
    maxRank: number | null;
    takenRanks: number[];
    onSaved?: (id: string) => void;
  },
) {
  const mutation = useUpdateRoleMutation(props.role.id);

  return (
    <RoleFormDialogBody
      {...props}
      mode="edit"
      currentRank={props.role.rank}
      initial={{
        name: props.role.name,
        description: props.role.description ?? '',
        rank: String(props.role.rank),
      }}
      submit={async (values) => {
        await mutation.mutateAsync({
          name: values.name.trim(),
          description: toNullableDescription(values.description),
          rank: Number(values.rank),
        });

        props.onSaved?.(props.role.id);
      }}
    />
  );
}

type RoleValues = { name: string; description: string; rank: string };

function RoleFormDialogBody(
  props: DialogControl & {
    mode: 'create' | 'edit';
    maxRank: number | null;
    takenRanks: number[];
    currentRank?: number;
    initial: RoleValues;
    submit: (values: RoleValues) => Promise<void>;
  },
) {
  const t = useTranslations('cms.settings.permissions.roles');
  const { dialogProps, isPending, setIsPending, setOpen } = useAsyncDialog({
    open: props.open,
    onOpenChange: props.onOpenChange,
  });

  const schema = createRoleFormSchema(props.maxRank);
  const ranks = getAvailableRanks({
    maxRank: props.maxRank,
    takenRanks: props.takenRanks,
    currentRank: props.currentRank,
  });

  const form = useForm({
    defaultValues: props.initial,
    validators: { onChange: schema, onSubmit: schema },
    onSubmit: async ({ value }) => {
      setIsPending(true);

      try {
        await props.submit(value);
        setOpen(false);
      } catch {
        // El aviso de error ya lo muestra la mutación.
      } finally {
        setIsPending(false);
      }
    },
  });

  return (
    <Dialog {...dialogProps}>
      <DialogContent data-testid="role-form-dialog">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {props.mode === 'create' ? t('createTitle') : t('editTitle')}
            </DialogTitle>
            <DialogDescription>{t('formDescription')}</DialogDescription>
          </DialogHeader>

          <FieldGroup>
            <form.Field name="name">
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid;

                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor="role-form-name">
                      {t('name')}
                    </FieldLabel>
                    <Input
                      id="role-form-name"
                      data-testid="role-form-name"
                      value={field.state.value}
                      maxLength={50}
                      aria-invalid={isInvalid}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                    />
                    <FieldError errors={field.state.meta.errors} />
                  </Field>
                );
              }}
            </form.Field>

            <form.Field name="description">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor="role-form-description">
                    {t('description')}
                  </FieldLabel>
                  <Textarea
                    id="role-form-description"
                    data-testid="role-form-description"
                    value={field.state.value}
                    maxLength={500}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                  <FieldError errors={field.state.meta.errors} />
                </Field>
              )}
            </form.Field>

            <form.Field name="rank">
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid;

                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor="role-form-rank">
                      {t('rank')}
                    </FieldLabel>
                    <NativeSelect
                      id="role-form-rank"
                      data-testid="role-form-rank"
                      className="w-full"
                      value={field.state.value}
                      aria-invalid={isInvalid}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                    >
                      <NativeSelectOption value="">
                        {t('rankPlaceholder')}
                      </NativeSelectOption>
                      {ranks.map((rank) => (
                        <NativeSelectOption key={rank} value={String(rank)}>
                          {rank}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                    <FieldDescription>
                      {t('rankHelp', { max: props.maxRank ?? 0 })}
                    </FieldDescription>
                    <FieldError errors={field.state.meta.errors} />
                  </Field>
                );
              }}
            </form.Field>
          </FieldGroup>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => setOpen(false)}
            >
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              data-testid="role-form-submit"
              disabled={isPending}
            >
              {isPending ? <Spinner className="h-3.5 w-3.5" /> : null}
              {props.mode === 'create' ? t('create') : t('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Crear un grupo (sin `group`) o editarlo (con `group`). */
export function GroupFormDialog(
  props: DialogControl & {
    group?: { id: string; name: string; description: string | null };
    onSaved?: (id: string) => void;
  },
) {
  return props.group ? (
    <EditGroupDialog {...props} group={props.group} />
  ) : (
    <CreateGroupDialog {...props} />
  );
}

function CreateGroupDialog(
  props: DialogControl & { onSaved?: (id: string) => void },
) {
  const mutation = useCreateGroupMutation();

  return (
    <GroupFormDialogBody
      {...props}
      mode="create"
      initial={{ name: '', description: '' }}
      submit={async (values) => {
        const result = await mutation.mutateAsync({
          name: values.name.trim(),
          description: toNullableDescription(values.description),
        });

        props.onSaved?.(result.data.id);
      }}
    />
  );
}

function EditGroupDialog(
  props: DialogControl & {
    group: { id: string; name: string; description: string | null };
    onSaved?: (id: string) => void;
  },
) {
  const mutation = useUpdateGroupMutation(props.group.id);

  return (
    <GroupFormDialogBody
      {...props}
      mode="edit"
      initial={{
        name: props.group.name,
        description: props.group.description ?? '',
      }}
      submit={async (values) => {
        await mutation.mutateAsync({
          name: values.name.trim(),
          description: toNullableDescription(values.description),
        });

        props.onSaved?.(props.group.id);
      }}
    />
  );
}

type GroupValues = { name: string; description: string };

function GroupFormDialogBody(
  props: DialogControl & {
    mode: 'create' | 'edit';
    initial: GroupValues;
    submit: (values: GroupValues) => Promise<void>;
  },
) {
  const t = useTranslations('cms.settings.permissions.groups');
  const { dialogProps, isPending, setIsPending, setOpen } = useAsyncDialog({
    open: props.open,
    onOpenChange: props.onOpenChange,
  });

  const form = useForm({
    defaultValues: props.initial,
    validators: { onChange: GroupFormSchema, onSubmit: GroupFormSchema },
    onSubmit: async ({ value }) => {
      setIsPending(true);

      try {
        await props.submit(value);
        setOpen(false);
      } catch {
        // El aviso de error ya lo muestra la mutación.
      } finally {
        setIsPending(false);
      }
    },
  });

  return (
    <Dialog {...dialogProps}>
      <DialogContent data-testid="group-form-dialog">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {props.mode === 'create' ? t('createTitle') : t('editTitle')}
            </DialogTitle>
            <DialogDescription>{t('formDescription')}</DialogDescription>
          </DialogHeader>

          <FieldGroup>
            <form.Field name="name">
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid;

                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor="group-form-name">
                      {t('name')}
                    </FieldLabel>
                    <Input
                      id="group-form-name"
                      data-testid="group-form-name"
                      value={field.state.value}
                      maxLength={100}
                      aria-invalid={isInvalid}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                    />
                    <FieldError errors={field.state.meta.errors} />
                  </Field>
                );
              }}
            </form.Field>

            <form.Field name="description">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor="group-form-description">
                    {t('description')}
                  </FieldLabel>
                  <Textarea
                    id="group-form-description"
                    data-testid="group-form-description"
                    value={field.state.value}
                    maxLength={1000}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                  <FieldError errors={field.state.meta.errors} />
                </Field>
              )}
            </form.Field>
          </FieldGroup>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => setOpen(false)}
            >
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              data-testid="group-form-submit"
              disabled={isPending}
            >
              {isPending ? <Spinner className="h-3.5 w-3.5" /> : null}
              {props.mode === 'create' ? t('create') : t('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
