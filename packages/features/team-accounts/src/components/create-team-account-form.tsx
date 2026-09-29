'use client';

import { useState } from 'react';

import { useForm } from '@tanstack/react-form';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import type { z } from 'zod';

import { Alert, AlertDescription, AlertTitle } from '@pymekit/ui/alert';
import { Button } from '@pymekit/ui/button';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@pymekit/ui/field';
import { If } from '@pymekit/ui/if';
import { Input } from '@pymekit/ui/input';
import { Trans } from '@pymekit/ui/trans';

import {
  CreateTeamSchema,
  NON_LATIN_REGEX,
} from '../schema/create-team.schema';
import { createTeamAccountFunction } from '../server/functions/create-team-account.functions';

export function CreateTeamAccountForm(props: {
  onClose?: () => void;
  isPending?: boolean;
  setIsPending?: (isPending: boolean) => void;
  submitLabel?: string;
}) {
  const [error, setError] = useState<{ message?: string } | undefined>();

  const router = useRouter();
  const createTeamAccount = useServerFn(createTeamAccountFunction);

  const mutation = useMutation({
    mutationFn: (data: { name: string; slug?: string }) =>
      createTeamAccount({ data }),
    onMutate: () => {
      setError(undefined);

      if (props.setIsPending) {
        props.setIsPending(true);
      }
    },
    onSuccess: async (res) => {
      if (res && 'error' in res && res.error) {
        setError({ message: res.message });
        return;
      }

      // Close the hosting dialog (if any) before navigating. The dialog lives in
      // the persistent dashboard sidebar, so closing it is what actually
      // dismisses the modal — navigation alone would not.
      props.onClose?.();

      // Land on the dashboard and re-run loaders so the freshly created,
      // now-active account is reflected.
      await router.navigate({ to: '/dashboard' });
      await router.invalidate();
    },
    onError: () => {
      setError({});
    },
    onSettled: () => {
      if (props.setIsPending) {
        props.setIsPending(false);
      }
    },
  });

  const form = useForm({
    defaultValues: {
      name: '',
      slug: '',
    } as z.input<typeof CreateTeamSchema>,
    validators: {
      onChange: CreateTeamSchema,
      onSubmit: CreateTeamSchema,
    },
    onSubmit: ({ value }) => mutation.mutate(value),
  });

  return (
    <form
      data-testid={'create-team-form'}
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <div className={'flex flex-col space-y-4'}>
        <If condition={error}>
          <CreateTeamAccountErrorAlert message={error?.message} />
        </If>

        <form.Field name={'name'}>
          {(field) => {
            const isInvalid =
              field.state.meta.isTouched && !field.state.meta.isValid;

            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>
                  <Trans i18nKey={'teams.teamNameLabel'} />
                </FieldLabel>

                <Input
                  id={field.name}
                  data-testid={'team-name-input'}
                  required
                  minLength={2}
                  maxLength={50}
                  placeholder={''}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  aria-invalid={isInvalid}
                />

                <FieldDescription>
                  <Trans i18nKey={'teams.teamNameDescription'} />
                </FieldDescription>

                <FieldError errors={field.state.meta.errors} />
              </Field>
            );
          }}
        </form.Field>

        <form.Subscribe selector={(state) => state.values.name}>
          {(nameValue) => (
            <If condition={NON_LATIN_REGEX.test(nameValue ?? '')}>
              <form.Field name={'slug'}>
                {(field) => {
                  const isInvalid =
                    field.state.meta.isTouched && !field.state.meta.isValid;

                  return (
                    <Field data-invalid={isInvalid}>
                      <FieldLabel htmlFor={field.name}>
                        <Trans i18nKey={'teams.teamSlugLabel'} />
                      </FieldLabel>

                      <Input
                        id={field.name}
                        data-testid={'team-slug-input'}
                        required
                        minLength={2}
                        maxLength={50}
                        placeholder={'my-team'}
                        name={field.name}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        aria-invalid={isInvalid}
                      />

                      <FieldDescription>
                        <Trans i18nKey={'teams.teamSlugDescription'} />
                      </FieldDescription>

                      <FieldError errors={field.state.meta.errors} />
                    </Field>
                  );
                }}
              </form.Field>
            </If>
          )}
        </form.Subscribe>

        <div className={'flex justify-end space-x-2'}>
          <If condition={!!props.onClose}>
            <Button
              variant={'outline'}
              type={'button'}
              disabled={mutation.isPending || props.isPending}
              onClick={props.onClose}
            >
              <Trans i18nKey={'common.cancel'} />
            </Button>
          </If>

          <Button
            type="submit"
            data-testid={'confirm-create-team-button'}
            disabled={mutation.isPending || props.isPending}
          >
            {mutation.isPending || props.isPending ? (
              <Trans i18nKey={'teams.creatingTeam'} />
            ) : (
              <Trans
                i18nKey={props.submitLabel ?? 'teams.createTeamSubmitLabel'}
              />
            )}
          </Button>
        </div>
      </div>
    </form>
  );
}

function CreateTeamAccountErrorAlert(props: { message?: string }) {
  return (
    <Alert variant={'destructive'}>
      <AlertTitle>
        <Trans i18nKey={'teams.createTeamErrorHeading'} />
      </AlertTitle>

      <AlertDescription>
        {props.message ? (
          <Trans i18nKey={props.message} defaults={props.message} />
        ) : (
          <Trans i18nKey={'teams.createTeamErrorMessage'} />
        )}
      </AlertDescription>
    </Alert>
  );
}
