'use client';

import { useForm } from '@tanstack/react-form';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useTranslations } from 'use-intl';

import { Alert, AlertDescription, AlertTitle } from '@pymekit/ui/alert';
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
import { updateInvitationFunction } from '../../server/functions/team-invitations.functions';
import { MembershipRoleSelector } from '../members/membership-role-selector';
import { RolesDataProvider } from '../members/roles-data-provider';

type Role = string;

export function UpdateInvitationDialog({
  isOpen,
  setIsOpen,
  invitationId,
  userRole,
  userRoleHierarchy,
}: {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  invitationId: number;
  userRole: Role;
  userRoleHierarchy: number;
}) {
  const { dialogProps, isPending, setIsPending, setOpen } = useAsyncDialog({
    open: isOpen,
    onOpenChange: setIsOpen,
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

        <UpdateInvitationForm
          invitationId={invitationId}
          userRole={userRole}
          userRoleHierarchy={userRoleHierarchy}
          isPending={isPending}
          setIsPending={setIsPending}
          onSuccess={() => {
            setIsPending(false);
            setOpen(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function UpdateInvitationForm({
  invitationId,
  userRole,
  userRoleHierarchy,
  isPending,
  setIsPending,
  onSuccess,
}: React.PropsWithChildren<{
  invitationId: number;
  userRole: Role;
  userRoleHierarchy: number;
  isPending: boolean;
  setIsPending: (pending: boolean) => void;
  onSuccess: () => void;
}>) {
  const t = useTranslations('teams');

  const router = useRouter();
  const updateInvitation = useServerFn(updateInvitationFunction);

  const mutation = useMutation({
    mutationFn: (data: { invitationId: number; role: string }) =>
      updateInvitation({ data }),
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
      message: t('roleMustBeDifferent'),
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
      mutation.mutate({ invitationId, role: value.role });
    },
  });

  return (
    <form
      data-testid={'update-invitation-form'}
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void form.handleSubmit();
      }}
      className={'flex flex-col space-y-6'}
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
              <FieldLabel>
                <Trans i18nKey={'teams.roleLabel'} />
              </FieldLabel>

              <RolesDataProvider maxRoleHierarchy={userRoleHierarchy}>
                {(roles) => (
                  <MembershipRoleSelector
                    roles={roles}
                    currentUserRole={userRole}
                    value={field.state.value}
                    onChange={(newRole) => {
                      if (newRole) {
                        field.handleChange(newRole);
                      }
                    }}
                  />
                )}
              </RolesDataProvider>

              <FieldDescription>
                <Trans i18nKey={'teams.updateRoleDescription'} />
              </FieldDescription>

              <FieldError errors={field.state.meta.errors} />
            </Field>
          );
        }}
      </form.Field>

      <Button type={'submit'} disabled={isPending}>
        <Trans i18nKey={'teams.updateRoleSubmitLabel'} />
      </Button>
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
