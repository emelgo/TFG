import { useForm } from '@tanstack/react-form';
import { useSelector } from '@tanstack/react-store';
import { User } from 'lucide-react';
import { useTranslations } from 'use-intl';

import type { Database } from '@pymekit/supabase/database';
import { Button } from '@pymekit/ui/button';
import { Field, FieldError } from '@pymekit/ui/field';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@pymekit/ui/input-group';
import { toast } from '@pymekit/ui/sonner';
import { Trans } from '@pymekit/ui/trans';

import { useUpdateAccountData } from '../../hooks/use-update-account';
import { AccountDetailsSchema } from '../../schema/account-details.schema';

type UpdateUserDataParams = Database['public']['Tables']['accounts']['Update'];

export function UpdateAccountDetailsForm({
  displayName,
  onUpdate,
  userId,
}: {
  displayName: string;
  userId: string;
  onUpdate: (user: Partial<UpdateUserDataParams>) => void;
}) {
  const updateAccountMutation = useUpdateAccountData(userId);
  const t = useTranslations('account');

  const form = useForm({
    defaultValues: {
      displayName,
    },
    validators: {
      onChange: AccountDetailsSchema,
      onSubmit: AccountDetailsSchema,
    },
    onSubmit: ({ value }) => {
      const data = { name: value.displayName };

      const promise = updateAccountMutation.mutateAsync(data).then(() => {
        onUpdate(data);
      });

      return toast.promise(() => promise, {
        success: t(`updateProfileSuccess`),
        error: t(`updateProfileError`),
        loading: t(`updateProfileLoading`),
      });
    },
  });

  // Only surface validation errors once the user has attempted to submit.
  const submissionAttempts = useSelector(
    form.store,
    (state) => state.submissionAttempts,
  );

  return (
    <div className={'flex flex-col space-y-8'}>
      <form
        data-testid={'update-account-name-form'}
        className={'flex flex-col space-y-4'}
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void form.handleSubmit();
        }}
      >
        <form.Field name={'displayName'}>
          {(field) => {
            const isInvalid =
              submissionAttempts > 0 && !field.state.meta.isValid;

            return (
              <Field data-invalid={isInvalid}>
                <InputGroup className="dark:bg-background">
                  <InputGroupAddon align="inline-start">
                    <User className="h-4 w-4" />
                  </InputGroupAddon>

                  <InputGroupInput
                    data-testid={'account-display-name'}
                    minLength={2}
                    placeholder={t('name')}
                    maxLength={100}
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    aria-invalid={isInvalid}
                  />
                </InputGroup>

                <FieldError errors={isInvalid ? field.state.meta.errors : []} />
              </Field>
            );
          }}
        </form.Field>

        <div>
          <Button type="submit" disabled={updateAccountMutation.isPending}>
            <Trans i18nKey={'account.updateProfileSubmitLabel'} />
          </Button>
        </div>
      </form>
    </div>
  );
}
