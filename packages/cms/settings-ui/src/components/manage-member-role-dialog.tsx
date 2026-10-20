/**
 * Diálogo para cambiar el rol de un miembro del CMS (F2.7a).
 *
 * Solo ofrece los roles que la API dice que el usuario puede asignar
 * (`assignableRoles`: rango estrictamente inferior al suyo, y vacío si no
 * puede asignar) y la opción «sin rol» si puede quitarlo. Una cuenta tiene como mucho un rol, así que se elige cuál
 * tendrá y `buildMemberRolesChange` calcula qué quitar y qué asignar. La
 * API y la política RLS de `cms.account_roles` vuelven a comprobar el rango
 * del rol y de la cuenta.
 */
import { useForm } from '@tanstack/react-form';
import { useTranslations } from 'use-intl';
import * as z from 'zod';

import type { CmsMemberDetails } from '@pymekit/cms-ui-core/api';
import { Button } from '@pymekit/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@pymekit/ui/dialog';
import { Field, FieldDescription, FieldError } from '@pymekit/ui/field';
import { FieldLabelWithHelp } from '@pymekit/ui/field-help';
import { useAsyncDialog } from '@pymekit/ui/hooks/use-async-dialog';
import { NativeSelect, NativeSelectOption } from '@pymekit/ui/native-select';
import { Spinner } from '@pymekit/ui/spinner';

import { useMemberRolesMutation } from '../hooks/use-settings-mutations';
import { buildMemberRolesChange } from '../utils/member-roles';

const RoleSchema = z.object({ roleId: z.string() });

export function ManageMemberRoleDialog(props: {
  member: CmsMemberDetails['member'];
  assignableRoles: CmsMemberDetails['assignableRoles'];
  /** Si se puede dejar sin rol (permiso `role:delete`). */
  canRemoveRole: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('cms.settings.members.role');
  const mutation = useMemberRolesMutation(props.member.id);
  const { dialogProps, isPending, setIsPending, setOpen } = useAsyncDialog({
    open: props.open,
    onOpenChange: props.onOpenChange,
  });

  const currentRoleId = props.member.role?.id ?? null;

  const form = useForm({
    defaultValues: { roleId: currentRoleId ?? '' },
    validators: { onSubmit: RoleSchema },
    onSubmit: async ({ value }) => {
      const change = buildMemberRolesChange(
        currentRoleId,
        value.roleId || null,
      );

      if (!change) {
        setOpen(false);
        return;
      }

      setIsPending(true);

      try {
        await mutation.mutateAsync(change);
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
      <DialogContent data-testid="member-role-dialog">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <DialogHeader>
            <DialogTitle>{t('title')}</DialogTitle>
            <DialogDescription>{t('description')}</DialogDescription>
          </DialogHeader>

          <form.Field name="roleId">
            {(field) => (
              <Field>
                <FieldLabelWithHelp
                  htmlFor="member-role-select"
                  help={t('labelHelp')}
                >
                  {t('label')}
                </FieldLabelWithHelp>

                <NativeSelect
                  id="member-role-select"
                  data-testid="member-role-select"
                  className="w-full"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                >
                  {/* El rol actual siempre aparece (seleccionado); «sin
                      rol» solo si se puede quitar. */}
                  {props.member.role &&
                  !props.assignableRoles.some(
                    (role) => role.id === props.member.role?.id,
                  ) ? (
                    <NativeSelectOption value={props.member.role.id}>
                      {t('option', {
                        name: props.member.role.name,
                        rank: props.member.role.rank ?? 0,
                      })}
                    </NativeSelectOption>
                  ) : null}
                  {!props.member.role || props.canRemoveRole ? (
                    <NativeSelectOption value="">
                      {t('none')}
                    </NativeSelectOption>
                  ) : null}
                  {props.assignableRoles.map((role) => (
                    <NativeSelectOption key={role.id} value={role.id}>
                      {t('option', { name: role.name, rank: role.rank })}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>

                <FieldDescription>{t('help')}</FieldDescription>
                <FieldError errors={field.state.meta.errors} />
              </Field>
            )}
          </form.Field>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => setOpen(false)}
            >
              {t('cancel')}
            </Button>

            <form.Subscribe selector={(state) => state.values.roleId}>
              {(roleId) => (
                <Button
                  type="submit"
                  data-testid="member-role-save"
                  disabled={isPending || roleId === (currentRoleId ?? '')}
                >
                  {isPending ? <Spinner className="h-3.5 w-3.5" /> : null}
                  {t('save')}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
