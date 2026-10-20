'use client';

import { useForm } from '@tanstack/react-form';
import { useMutation } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useSelector } from '@tanstack/react-store';
import * as z from 'zod';

import { VerifyOtpForm } from '@pymekit/otp/components';
import { useUser } from '@pymekit/supabase/hooks/use-user';
import { Alert, AlertDescription, AlertTitle } from '@pymekit/ui/alert';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@pymekit/ui/alert-dialog';
import { Button } from '@pymekit/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@pymekit/ui/card';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@pymekit/ui/field';
import { If } from '@pymekit/ui/if';
import { Input } from '@pymekit/ui/input';
import { LoadingOverlay } from '@pymekit/ui/loading-overlay';
import { Trans } from '@pymekit/ui/trans';

import { deleteTeamAccountFunction } from '../../server/functions/delete-team-account.functions';
import { leaveTeamAccountFunction } from '../../server/functions/leave-team-account.functions';

export function TeamAccountDangerZone({
  account,
  primaryOwnerUserId,
  features,
}: React.PropsWithChildren<{
  account: {
    name: string;
    id: string;
  };

  features: {
    enableTeamDeletion: boolean;
  };

  primaryOwnerUserId: string;
}>) {
  const { data: user } = useUser();

  if (!user) {
    return <LoadingOverlay fullPage={false} />;
  }

  // Only the primary owner can delete the team account
  const userIsPrimaryOwner = user.id === primaryOwnerUserId;

  if (userIsPrimaryOwner) {
    if (features.enableTeamDeletion) {
      return (
        <DangerZoneCard>
          <DeleteTeamContainer account={account} />
        </DangerZoneCard>
      );
    }

    return;
  }

  // A primary owner can't leave the team account
  // but other members can
  return (
    <DangerZoneCard>
      <LeaveTeamContainer account={account} />
    </DangerZoneCard>
  );
}

function DeleteTeamContainer(props: {
  account: {
    name: string;
    id: string;
  };
}) {
  return (
    <div className={'flex flex-col space-y-4'}>
      <div className={'flex flex-col space-y-1'}>
        <span className={'text-sm font-medium'}>
          <Trans i18nKey={'teams.deleteTeam'} />
        </span>

        <p className={'text-muted-foreground text-sm'}>
          <Trans
            i18nKey={'teams.deleteTeamDescription'}
            values={{
              teamName: props.account.name,
            }}
          />
        </p>
      </div>

      <div>
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button
                data-testid={'delete-team-trigger'}
                type={'button'}
                variant={'destructive'}
              >
                <Trans i18nKey={'teams.deleteTeam'} />
              </Button>
            }
          />

          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                <Trans i18nKey={'teams.deletingTeam'} />
              </AlertDialogTitle>

              <AlertDialogDescription>
                <Trans
                  i18nKey={'teams.deletingTeamDescription'}
                  values={{
                    teamName: props.account.name,
                  }}
                />
              </AlertDialogDescription>
            </AlertDialogHeader>

            <DeleteTeamConfirmationForm
              name={props.account.name}
              id={props.account.id}
            />
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

function DeleteTeamConfirmationForm({
  name,
  id,
}: {
  name: string;
  id: string;
}) {
  const { data: user } = useUser();

  const deleteTeamAccount = useServerFn(deleteTeamAccountFunction);

  const mutation = useMutation({
    mutationFn: (data: { accountId: string; otp: string }) =>
      deleteTeamAccount({ data }),
  });

  const form = useForm({
    defaultValues: {
      otp: '',
    },
    validators: {
      onChange: z.object({
        otp: z.string().min(6).max(6),
      }),
      onSubmit: z.object({
        otp: z.string().min(6).max(6),
      }),
    },
    onSubmit: ({ value }) => {
      mutation.mutate({ accountId: id, otp: value.otp });
    },
  });

  const otp = useSelector(form.store, (state) => state.values.otp);

  if (!user?.email) {
    return <LoadingOverlay fullPage={false} />;
  }

  if (!otp) {
    return (
      <VerifyOtpForm
        purpose={`delete-team-account-${id}`}
        email={user.email}
        onSuccess={(otp) => form.setFieldValue('otp', otp)}
        CancelButton={
          <AlertDialogCancel className={'m-0'}>
            <Trans i18nKey={'common.cancel'} />
          </AlertDialogCancel>
        }
      />
    );
  }

  return (
    <form
      data-testid={'delete-team-form'}
      className={'flex flex-col space-y-4'}
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <If condition={mutation.isError}>
        <DeleteTeamErrorAlert />
      </If>

      <div className={'flex flex-col space-y-2'}>
        <div
          className={
            'border-destructive text-destructive my-4 flex flex-col space-y-2 rounded-md border-2 p-4 text-sm'
          }
        >
          <div>
            <Trans
              i18nKey={'teams.deleteTeamDisclaimer'}
              values={{
                teamName: name,
              }}
            />
          </div>

          <div className={'text-sm'}>
            <Trans i18nKey={'common.modalConfirmationQuestion'} />
          </div>
        </div>
      </div>

      <AlertDialogFooter>
        <AlertDialogCancel>
          <Trans i18nKey={'common.cancel'} />
        </AlertDialogCancel>

        <Button
          type="submit"
          data-testid={'delete-team-form-confirm-button'}
          disabled={mutation.isPending}
          variant={'destructive'}
        >
          <Trans i18nKey={'teams.deleteTeam'} />
        </Button>
      </AlertDialogFooter>
    </form>
  );
}

function LeaveTeamContainer(props: {
  account: {
    name: string;
    id: string;
  };
}) {
  const leaveTeamAccount = useServerFn(leaveTeamAccountFunction);

  const mutation = useMutation({
    mutationFn: (data: { accountId: string; confirmation: string }) =>
      leaveTeamAccount({ data }),
  });

  const LeaveTeamSchema = z.object({
    confirmation: z.string().refine((value) => value === 'SALIR', {
      message: 'common.validation.confirmationRequired',
      path: ['confirmation'],
    }),
  });

  const form = useForm({
    defaultValues: {
      confirmation: '',
    },
    validators: {
      onChange: LeaveTeamSchema,
      onSubmit: LeaveTeamSchema,
    },
    onSubmit: ({ value }) => {
      mutation.mutate({
        accountId: props.account.id,
        confirmation: value.confirmation,
      });
    },
  });

  return (
    <div className={'flex flex-col space-y-4'}>
      <p className={'text-muted-foreground text-sm'}>
        <Trans
          i18nKey={'teams.leaveTeamDescription'}
          values={{
            teamName: props.account.name,
          }}
        />
      </p>

      <AlertDialog>
        <AlertDialogTrigger
          render={
            <Button
              data-testid={'leave-team-button'}
              type={'button'}
              variant={'destructive'}
            >
              <Trans i18nKey={'teams.leaveTeam'} />
            </Button>
          }
        />

        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <Trans i18nKey={'teams.leavingTeamModalHeading'} />
            </AlertDialogTitle>

            <AlertDialogDescription>
              <Trans i18nKey={'teams.leavingTeamModalDescription'} />
            </AlertDialogDescription>
          </AlertDialogHeader>

          <form
            className={'flex flex-col space-y-4'}
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void form.handleSubmit();
            }}
          >
            <If condition={mutation.isError}>
              <LeaveTeamErrorAlert />
            </If>

            <form.Field name={'confirmation'}>
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid;

                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>
                      <Trans i18nKey={'teams.leaveTeamInputLabel'} />
                    </FieldLabel>

                    <Input
                      id={field.name}
                      data-testid="leave-team-input-field"
                      type="text"
                      className="w-full"
                      autoComplete={'off'}
                      placeholder=""
                      pattern="SALIR"
                      required
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      aria-invalid={isInvalid}
                    />

                    <FieldDescription>
                      <Trans i18nKey={'teams.leaveTeamInputDescription'} />
                    </FieldDescription>

                    <FieldError errors={field.state.meta.errors} />
                  </Field>
                );
              }}
            </form.Field>

            <AlertDialogFooter>
              <AlertDialogCancel>
                <Trans i18nKey={'common.cancel'} />
              </AlertDialogCancel>

              <Button
                type="submit"
                data-testid={'confirm-leave-organization-button'}
                disabled={mutation.isPending}
                variant={'destructive'}
              >
                <Trans i18nKey={'teams.leaveTeam'} />
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function LeaveTeamErrorAlert() {
  return (
    <Alert variant={'destructive'}>
      <AlertTitle>
        <Trans i18nKey={'teams.leaveTeamErrorHeading'} />
      </AlertTitle>

      <AlertDescription>
        <Trans i18nKey={'common.genericError'} />
      </AlertDescription>
    </Alert>
  );
}

function DeleteTeamErrorAlert() {
  return (
    <Alert variant={'destructive'}>
      <AlertTitle>
        <Trans i18nKey={'teams.deleteTeamErrorHeading'} />
      </AlertTitle>

      <AlertDescription>
        <Trans i18nKey={'common.genericError'} />
      </AlertDescription>
    </Alert>
  );
}

function DangerZoneCard({ children }: React.PropsWithChildren) {
  return (
    <Card className={'border-destructive border'}>
      <CardHeader>
        <CardTitle>
          <Trans i18nKey={'teams.settings.dangerZone'} />
        </CardTitle>

        <CardDescription>
          <Trans i18nKey={'teams.settings.dangerZoneDescription'} />
        </CardDescription>
      </CardHeader>

      <CardContent>{children}</CardContent>
    </Card>
  );
}
