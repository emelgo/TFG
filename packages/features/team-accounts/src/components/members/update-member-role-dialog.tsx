'use client';

import { useForm } from '@tanstack/react-form';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useTranslations } from 'use-intl';

import { Alert, AlertDescription, AlertTitle } from '@pymekit/ui/alert';
import { AlertDialogCancel } from '@pymekit/ui/alert-dialog';
import { Button } from '@pymekit/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@pymekit/ui/dialog';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@pymekit/ui/field';
import { useAsyncDialog } from '@pymekit/ui/hooks/use-async-dialog';
import { If } from '@pymekit/ui/if';
import { Trans } from '@pymekit/ui/trans';

import { RoleSchema } from '../../schema/update-member-role.schema';
import { updateMemberRoleFunction } from '../../server/functions/team-members.functions';
import { MembershipRoleSelector } from './membership-role-selector';
import { RolesDataProvider } from './roles-data-provider';

type Role = string;

export function UpdateMemberRoleDialog({
  open,
  onOpenChange,
  userId,
  teamAccountId,
  userRole,
  userRoleHierarchy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  teamAccountId: string;
  userRole: Role;
  userRoleHierarchy: number;
}) {
  const { dialogProps, isPending, setIsPending, setOpen } = useAsyncDialog({
    open,
    onOpenChange,
  });

  return (
    <Dialog {...dialogProps}>
      <DialogContent showCloseButton={!isPending}>
        <DialogHeader>
          <DialogTitle>
            <Trans i18nKey={'teams.updateMemberRoleModalHeading'} />
          </DialogTitle>

          <DialogDescription>
            <Trans i18nKey={'teams.updateMemberRoleModalDescription'} />
          </DialogDescription>
        </DialogHeader>

        <RolesDataProvider maxRoleHierarchy={userRoleHierarchy}>
          {(data) => (
            <UpdateMemberForm
              userId={userId}
              teamAccountId={teamAccountId}
              userRole={userRole}
              roles={data}
              isPending={isPending}
              setIsPending={setIsPending}
              onSuccess={() => {
                setIsPending(false);
                setOpen(false);
              }}
            />
          )}
        </RolesDataProvider>
      </DialogContent>
    </Dialog>
  );
}

function UpdateMemberForm({
  userId,
  userRole,
  teamAccountId,
  roles,
  isPending,
  setIsPending,
  onSuccess,
}: React.PropsWithChildren<{
  userId: string;
  userRole: Role;
  teamAccountId: string;
  roles: Role[];
  isPending: boolean;
  setIsPending: (pending: boolean) => void;
  onSuccess: () => unknown;
}>) {
  const t = useTranslations('teams');

  const router = useRouter();
  const updateMemberRole = useServerFn(updateMemberRoleFunction);

  const mutation = useMutation({
    mutationFn: (data: { accountId: string; userId: string; role: string }) =>
      updateMemberRole({ data }),
    onMutate: () => setIsPending(true),
    onSuccess: async () => {
      await router.invalidate();
      onSuccess();
    },
    onSettled: () => setIsPending(false),
  });

  const schema = RoleSchema.refine(
    (data) => {
      return data.role !== userRole;
    },
    {
      message: t(`roleMustBeDifferent`),
      path: ['role'],
    },
  );

  const form = useForm({
    defaultValues: {
      role: userRole,
    },
    validators: {
      onChange: schema,
      onSubmit: schema,
    },
    onSubmit: ({ value }) => {
      mutation.mutate({
        accountId: teamAccountId,
        userId,
        role: value.role,
      });
    },
  });

  return (
    <form
      data-testid={'update-member-role-form'}
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void form.handleSubmit();
      }}
      className={'flex w-full flex-col space-y-6'}
    >
      <If condition={mutation.isError}>
        <UpdateRoleErrorAlert />
      </If>

      <form.Field name={'role'}>
        {(field) => {
          const isInvalid =
            field.state.meta.isTouched && !field.state.meta.isValid;

          return (
            <Field data-invalid={isInvalid}>
              <FieldLabel>{t('roleLabel')}</FieldLabel>

              <MembershipRoleSelector
                triggerClassName={'w-full'}
                roles={roles}
                currentUserRole={userRole}
                value={field.state.value}
                onChange={(newRole) => {
                  if (newRole) {
                    field.handleChange(newRole);
                  }
                }}
              />

              <FieldDescription>{t('updateRoleDescription')}</FieldDescription>

              <FieldError errors={field.state.meta.errors} />
            </Field>
          );
        }}
      </form.Field>

      <div className="flex justify-end gap-x-2">
        <AlertDialogCancel disabled={isPending}>
          <Trans i18nKey={'common.cancel'} />
        </AlertDialogCancel>

        <Button
          type="submit"
          data-testid={'confirm-update-member-role'}
          disabled={isPending}
        >
          <Trans i18nKey={'teams.updateRoleSubmitLabel'} />
        </Button>
      </div>
    </form>
  );
}

function UpdateRoleErrorAlert() {
  return (
    <Alert variant={'destructive'}>
      <AlertTitle>
        <Trans i18nKey={'teams.updateRoleErrorHeading'} />
      </AlertTitle>

      <AlertDescription>
        <Trans i18nKey={'teams.updateRoleErrorMessage'} />
      </AlertDescription>
    </Alert>
  );
}
