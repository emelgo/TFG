'use client';

import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { Mail, Plus, X } from 'lucide-react';
import { useTranslations } from 'use-intl';

import { Alert, AlertDescription } from '@pymekit/ui/alert';
import { Button } from '@pymekit/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@pymekit/ui/dialog';
import { Field, FieldError } from '@pymekit/ui/field';
import { useAsyncDialog } from '@pymekit/ui/hooks/use-async-dialog';
import { If } from '@pymekit/ui/if';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@pymekit/ui/input-group';
import { toast } from '@pymekit/ui/sonner';
import { Spinner } from '@pymekit/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@pymekit/ui/tooltip';
import { Trans } from '@pymekit/ui/trans';

import { InviteMembersSchema } from '../../schema/invite-members.schema';
import { createInvitationsFunction } from '../../server/functions/team-invitations.functions';
import { MembershipRoleSelector } from './membership-role-selector';
import { RolesDataProvider } from './roles-data-provider';

type InviteModel = ReturnType<typeof createEmptyInviteModel>;

type Role = string;

/**
 * The maximum number of invites that can be sent at once.
 * Useful to avoid spamming the server with too large payloads
 */
const MAX_INVITES = 5;

export function InviteMembersDialogContainer({
  accountSlug,
  userRoleHierarchy,
  children,
}: React.PropsWithChildren<{
  accountSlug: string;
  userRoleHierarchy: number;
}>) {
  const { dialogProps, isPending, setIsPending, setOpen } = useAsyncDialog();
  const t = useTranslations('teams');
  const router = useRouter();

  const createInvitations = useServerFn(createInvitationsFunction);

  const mutation = useMutation({
    mutationFn: (data: { accountSlug: string; invitations: InviteModel[] }) =>
      createInvitations({ data }),
    onMutate: () => setIsPending(true),
    onSuccess: async (res) => {
      if (res?.success) {
        await router.invalidate();
        toast.success(t('inviteMembersSuccessMessage'));
      } else {
        toast.error(t('inviteMembersErrorMessage'));
      }
    },
    onError: () => {
      toast.error(t('inviteMembersErrorMessage'));
    },
    onSettled: () => {
      setIsPending(false);
      setOpen(false);
    },
  });

  // Evaluate policies when dialog is open
  const {
    data: policiesResult,
    isLoading: isLoadingPolicies,
    error: policiesError,
  } = useFetchInvitationsPolicies({ accountSlug, isOpen: dialogProps.open });

  return (
    <Dialog {...dialogProps}>
      <DialogTrigger render={children as React.ReactElement} />

      <DialogContent showCloseButton={!isPending}>
        <DialogHeader>
          <DialogTitle>
            <Trans i18nKey={'teams.inviteMembersHeading'} />
          </DialogTitle>

          <DialogDescription>
            <Trans i18nKey={'teams.inviteMembersDescription'} />
          </DialogDescription>
        </DialogHeader>

        <If condition={isLoadingPolicies}>
          <div className="flex flex-col items-center justify-center gap-y-4 py-8">
            <Spinner className="h-6 w-6" />

            <span className="text-muted-foreground text-sm">
              <Trans i18nKey="teams.checkingPolicies" />
            </span>
          </div>
        </If>

        <If condition={policiesError}>
          <Alert variant="destructive">
            <AlertDescription>
              <Trans
                i18nKey="teams.policyCheckError"
                values={{ error: policiesError?.message }}
              />
            </AlertDescription>
          </Alert>
        </If>

        <If condition={policiesResult && !policiesResult.allowed}>
          <Alert variant="destructive">
            <AlertDescription>
              <Trans
                i18nKey={policiesResult?.reasons[0]}
                defaults={policiesResult?.reasons[0]}
              />
            </AlertDescription>
          </Alert>
        </If>

        <If condition={policiesResult?.allowed}>
          <RolesDataProvider maxRoleHierarchy={userRoleHierarchy}>
            {(roles) => (
              <InviteMembersForm
                pending={isPending}
                roles={roles}
                onSubmit={(data) => {
                  mutation.mutate({
                    accountSlug,
                    invitations: data.invitations,
                  });
                }}
              />
            )}
          </RolesDataProvider>
        </If>
      </DialogContent>
    </Dialog>
  );
}

function InviteMembersForm({
  onSubmit,
  roles,
  pending,
}: {
  onSubmit: (data: { invitations: InviteModel[] }) => void;
  pending: boolean;
  roles: string[];
}) {
  const t = useTranslations('teams');

  const form = useForm({
    defaultValues: {
      invitations: [createEmptyInviteModel()],
    },
    validators: {
      onSubmit: InviteMembersSchema,
    },
    onSubmit: ({ value }) => onSubmit(value),
  });

  return (
    <form
      className={'flex flex-col space-y-8'}
      data-testid={'invite-members-form'}
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <form.Field name="invitations" mode="array">
        {(invitationsField) => (
          <div className="flex flex-col gap-y-2.5">
            {invitationsField.state.value.map((_, index) => (
              <div data-testid={'invite-member-form-item'} key={index}>
                <div className={'flex items-end gap-x-2'}>
                  <form.Field name={`invitations[${index}].email`}>
                    {(field) => {
                      const isInvalid =
                        field.state.meta.isTouched && !field.state.meta.isValid;

                      return (
                        <Field data-invalid={isInvalid} className="w-full">
                          <InputGroup className={'bg-background w-full'}>
                            <InputGroupAddon align="inline-start">
                              <Mail className="h-4 w-4" />
                            </InputGroupAddon>

                            <InputGroupInput
                              data-testid={'invite-email-input'}
                              placeholder={t('emailPlaceholder')}
                              type="email"
                              required
                              name={field.name}
                              value={field.state.value}
                              onBlur={field.handleBlur}
                              onChange={(e) =>
                                field.handleChange(e.target.value)
                              }
                              aria-invalid={isInvalid}
                            />
                          </InputGroup>

                          <FieldError errors={field.state.meta.errors} />
                        </Field>
                      );
                    }}
                  </form.Field>

                  <form.Field name={`invitations[${index}].role`}>
                    {(field) => {
                      const isInvalid =
                        field.state.meta.isTouched && !field.state.meta.isValid;

                      return (
                        <Field data-invalid={isInvalid}>
                          <MembershipRoleSelector
                            triggerClassName={'m-0 bg-muted'}
                            roles={roles}
                            value={field.state.value}
                            onChange={(role) => {
                              if (role) {
                                field.handleChange(role);
                              }
                            }}
                          />

                          <FieldError errors={field.state.meta.errors} />
                        </Field>
                      );
                    }}
                  </form.Field>

                  <div className={'flex items-end justify-end'}>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            variant={'ghost'}
                            size={'icon'}
                            type={'button'}
                            disabled={invitationsField.state.value.length <= 1}
                            data-testid={'remove-invite-button'}
                            aria-label={t('removeInviteButtonLabel')}
                            onClick={() => {
                              invitationsField.removeValue(index);
                            }}
                          >
                            <X className={'h-4'} />
                          </Button>
                        }
                      />

                      <TooltipContent>
                        {t('removeInviteButtonLabel')}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </div>
            ))}

            <If condition={invitationsField.state.value.length < MAX_INVITES}>
              <div>
                <Button
                  data-testid={'add-new-invite-button'}
                  type={'button'}
                  variant={'link'}
                  size={'sm'}
                  disabled={pending}
                  onClick={() => {
                    invitationsField.pushValue(createEmptyInviteModel());
                  }}
                >
                  <Plus className={'mr-1 h-3'} />

                  <span>
                    <Trans i18nKey={'teams.addAnotherMemberButtonLabel'} />
                  </span>
                </Button>
              </div>
            </If>
          </div>
        )}
      </form.Field>

      <Button type={'submit'} disabled={pending}>
        <Trans
          i18nKey={
            pending ? 'teams.invitingMembers' : 'teams.inviteMembersButtonLabel'
          }
        />
      </Button>
    </form>
  );
}

function createEmptyInviteModel() {
  return { email: '', role: 'member' as Role };
}

function useFetchInvitationsPolicies({
  accountSlug,
  isOpen,
}: {
  accountSlug: string;
  isOpen: boolean;
}) {
  return useQuery({
    queryKey: ['invitation-policies', accountSlug],
    queryFn: async () => {
      const response = await fetch(`./members/policies`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return response.json();
    },
    enabled: isOpen,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
