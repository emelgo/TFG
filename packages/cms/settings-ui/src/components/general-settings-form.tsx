/**
 * Formulario de Ajustes > General: preferencias personales del usuario del
 * CMS (idioma y zona horaria), guardadas en `cms.accounts.preferences`.
 *
 * La zona horaria decide cómo se muestran TODAS las fechas del CMS: al
 * guardar, la mutación invalida la cuenta, el *layout* `/admin/cms` la
 * vuelve a leer y `FormatterPreferencesProvider` aplica la zona nueva a las
 * tablas del explorador, la auditoría, etc. El idioma solo puede ser uno de
 * los que tiene la interfaz (`locales`); si cambia, quien usa el formulario
 * aplica el cambio (`onLanguageChange`), porque el idioma de la web vive en
 * una *cookie*.
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
  FieldLabel,
} from '@pymekit/ui/field';
import { NativeSelect, NativeSelectOption } from '@pymekit/ui/native-select';
import { Spinner } from '@pymekit/ui/spinner';

import { useUpdatePreferencesMutation } from '../hooks/use-settings-mutations';
import {
  DEFAULT_CMS_TIME_ZONE,
  GeneralSettingsSchema,
} from '../utils/general-settings';
import { TimezoneSelector } from './timezone-selector';

export function GeneralSettingsForm(props: {
  preferences: { language?: string; timezone?: string };
  /** Idiomas de la interfaz (`@pymekit/i18n/config`). */
  locales: string[];
  /** Idioma actual de la interfaz. */
  currentLocale: string;
  /** Se llama tras guardar si el idioma elegido es distinto del actual. */
  onLanguageChange?: (locale: string) => void;
}) {
  const t = useTranslations('cms.settings.general');
  const mutation = useUpdatePreferencesMutation();

  const initialLanguage = props.preferences.language?.split('-')[0];

  const form = useForm({
    defaultValues: {
      language:
        initialLanguage && props.locales.includes(initialLanguage)
          ? initialLanguage
          : props.currentLocale,
      timezone: props.preferences.timezone || DEFAULT_CMS_TIME_ZONE,
    },
    validators: {
      onChange: GeneralSettingsSchema,
      onSubmit: GeneralSettingsSchema,
    },
    onSubmit: async ({ value }) => {
      await mutation.mutateAsync(value);

      if (value.language !== props.currentLocale) {
        props.onLanguageChange?.(value.language);
      }
    },
  });

  const languageNames = new Intl.DisplayNames([props.currentLocale], {
    type: 'language',
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
        <form.Field name="language">
          {(field) => {
            const isInvalid =
              field.state.meta.isTouched && !field.state.meta.isValid;

            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor="cms-settings-language">
                  {t('language')}
                </FieldLabel>

                <NativeSelect
                  id="cms-settings-language"
                  data-testid="language-select"
                  className="w-full max-w-sm"
                  value={field.state.value}
                  disabled={props.locales.length <= 1}
                  aria-invalid={isInvalid}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                >
                  {props.locales.map((locale) => (
                    <NativeSelectOption key={locale} value={locale}>
                      {languageNames.of(locale) ?? locale}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>

                <FieldDescription>{t('languageDescription')}</FieldDescription>
                <FieldError errors={field.state.meta.errors} />
              </Field>
            );
          }}
        </form.Field>

        <form.Field name="timezone">
          {(field) => {
            const isInvalid =
              field.state.meta.isTouched && !field.state.meta.isValid;

            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor="cms-settings-timezone">
                  {t('timezone')}
                </FieldLabel>

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
