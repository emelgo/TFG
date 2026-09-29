'use client';

import { useRef } from 'react';

import { useForm } from '@tanstack/react-form';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { Building, Link } from 'lucide-react';
import { useTranslations } from 'use-intl';
import type { z } from 'zod';

import { Button } from '@pymekit/ui/button';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@pymekit/ui/field';
import { If } from '@pymekit/ui/if';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@pymekit/ui/input-group';
import { toast } from '@pymekit/ui/sonner';
import { Trans } from '@pymekit/ui/trans';

import { containsNonLatinCharacters } from '../../schema/create-team.schema';
import { TeamNameFormSchema } from '../../schema/update-team-name.schema';
import { updateTeamAccountName } from '../../server/functions/team-details.functions';

export const UpdateTeamAccountNameForm = (props: {
  account: {
    name: string;
    slug: string;
  };

  path: string;
}) => {
  const t = useTranslations('teams');

  const toastId = useRef<string | number>('');

  const router = useRouter();
  const updateTeamName = useServerFn(updateTeamAccountName);

  const mutation = useMutation({
    mutationFn: (data: {
      slug: string;
      name: string;
      newSlug?: string;
      path: string;
    }) => updateTeamName({ data }),
    onMutate: () => {
      toastId.current = toast.loading(t('updateTeamLoadingMessage'));
    },
    onSuccess: async (res) => {
      if (res?.success) {
        await router.invalidate();

        toast.success(t('updateTeamSuccessMessage'), {
          id: toastId.current,
        });

        // When the slug changed (renaming regenerates it) the current URL no
        // longer resolves — navigate to the new slug-based path.
        if (res.redirectTo) {
          await router.navigate({ href: res.redirectTo });
        }
      } else if (res?.error) {
        toast.error(t(res.error), { id: toastId.current });
      } else {
        toast.error(t('updateTeamErrorMessage'), { id: toastId.current });
      }
    },
    onError: () => {
      toast.error(t('updateTeamErrorMessage'), { id: toastId.current });
    },
  });

  const form = useForm({
    defaultValues: {
      name: props.account.name,
      newSlug: '',
    } as z.input<typeof TeamNameFormSchema>,
    validators: {
      onChange: TeamNameFormSchema,
      onSubmit: TeamNameFormSchema,
    },
    onSubmit: ({ value }) => {
      mutation.mutate({
        slug: props.account.slug,
        name: value.name,
        newSlug: (value.newSlug as string) || undefined,
        path: props.path,
      });
    },
  });

  return (
    <div className={'space-y-8'}>
      <form
        data-testid={'update-team-account-name-form'}
        className={'flex flex-col space-y-4'}
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void form.handleSubmit();
        }}
      >
        <form.Field name={'name'}>
          {(field) => {
            const isInvalid =
              field.state.meta.isTouched && !field.state.meta.isValid;

            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>
                  <Trans i18nKey={'teams.teamNameLabel'} />
                </FieldLabel>

                <InputGroup className="dark:bg-background">
                  <InputGroupAddon align="inline-start">
                    <Building className="h-4 w-4" />
                  </InputGroupAddon>

                  <InputGroupInput
                    id={field.name}
                    data-testid={'team-name-input'}
                    required
                    placeholder={t('teamNameInputLabel')}
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    aria-invalid={isInvalid}
                  />
                </InputGroup>

                <FieldError errors={field.state.meta.errors} />
              </Field>
            );
          }}
        </form.Field>

        <form.Subscribe selector={(state) => state.values.name}>
          {(nameValue) => (
            <If condition={containsNonLatinCharacters(nameValue || '')}>
              <form.Field name={'newSlug'}>
                {(field) => {
                  const isInvalid =
                    field.state.meta.isTouched && !field.state.meta.isValid;

                  return (
                    <Field data-invalid={isInvalid}>
                      <FieldLabel htmlFor={field.name}>
                        <Trans i18nKey={'teams.teamSlugLabel'} />
                      </FieldLabel>

                      <InputGroup className="dark:bg-background">
                        <InputGroupAddon align="inline-start">
                          <Link className="h-4 w-4" />
                        </InputGroupAddon>

                        <InputGroupInput
                          id={field.name}
                          data-testid={'team-slug-input'}
                          required
                          placeholder={'my-team'}
                          name={field.name}
                          value={field.state.value as string}
                          onBlur={field.handleBlur}
                          onChange={(e) => field.handleChange(e.target.value)}
                          aria-invalid={isInvalid}
                        />
                      </InputGroup>

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

        <div>
          <Button
            type="submit"
            className={'w-full md:w-auto'}
            data-testid={'update-team-submit-button'}
            disabled={mutation.isPending}
          >
            <Trans i18nKey={'teams.updateTeamSubmitLabel'} />
          </Button>
        </div>
      </form>
    </div>
  );
};
