/**
 * Formulario de Ajustes > General: preferencias personales del usuario del
 * CMS (la zona horaria), guardadas en `cms.accounts.preferences`.
 *
 * La zona horaria decide cómo se muestran TODAS las fechas del CMS: al
 * guardar, la mutación invalida la cuenta, el *layout* `/admin/cms` la
 * vuelve a leer y `FormatterPreferencesProvider` aplica la zona nueva a las
 * tablas del explorador, la auditoría, etc. No hay campo de idioma: la
 * interfaz solo está en español (ADR-021).
 *
 * TanStack Form con el mismo esquema Zod que valida la API
 * (`GeneralSettingsSchema`). Para empezar de cero tras guardar, quien lo usa
 * lo monta con una `key` que depende de las preferencias guardadas.
 */
import { useForm } from '@tanstack/react-form';
import { useTranslations } from 'use-intl';

import { Button } from '@pymekit/ui/button';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
} from '@pymekit/ui/field';
import { FieldLabelWithHelp } from '@pymekit/ui/field-help';
import { Spinner } from '@pymekit/ui/spinner';

import { useUpdatePreferencesMutation } from '../hooks/use-settings-mutations';
import {
  DEFAULT_CMS_TIME_ZONE,
  GeneralSettingsSchema,
} from '../utils/general-settings';
import { TimezoneSelector } from './timezone-selector';

export function GeneralSettingsForm(props: {
  preferences: { timezone?: string };
}) {
  const t = useTranslations('cms.settings.general');
  const mutation = useUpdatePreferencesMutation();

  const form = useForm({
    defaultValues: {
      timezone: props.preferences.timezone || DEFAULT_CMS_TIME_ZONE,
    },
    validators: {
      onChange: GeneralSettingsSchema,
      onSubmit: GeneralSettingsSchema,
    },
    onSubmit: async ({ value }) => {
      await mutation.mutateAsync(value);
    },
  });

  return (
    <form
      data-testid="general-settings-form"
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit().catch(() => {
          // El aviso de error ya lo muestra la mutación.
        });
      }}
    >
      <FieldGroup>
        <form.Field name="timezone">
          {(field) => {
            const isInvalid =
              field.state.meta.isTouched && !field.state.meta.isValid;

            return (
              <Field data-invalid={isInvalid}>
                <FieldLabelWithHelp
                  htmlFor="cms-settings-timezone"
                  help={t('timezoneHelp')}
                >
                  {t('timezone')}
                </FieldLabelWithHelp>

                <TimezoneSelector
                  id="cms-settings-timezone"
                  value={field.state.value}
                  invalid={isInvalid}
                  onBlur={field.handleBlur}
                  onChange={field.handleChange}
                />

                <FieldDescription>{t('timezoneDescription')}</FieldDescription>
                <FieldError errors={field.state.meta.errors} />
              </Field>
            );
          }}
        </form.Field>
      </FieldGroup>

      <form.Subscribe
        selector={(state) => [state.isDirty, state.isSubmitting] as const}
      >
        {([isDirty, isSubmitting]) => (
          <div>
            <Button
              type="submit"
              data-testid="general-settings-submit"
              disabled={!isDirty || isSubmitting}
            >
              {isSubmitting ? <Spinner className="h-3.5 w-3.5" /> : null}
              {t('save')}
            </Button>
          </div>
        )}
      </form.Subscribe>
    </form>
  );
}
