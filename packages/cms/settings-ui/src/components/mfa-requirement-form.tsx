/**
 * Ajustes > Autenticación: obligación de MFA para todo el personal del CMS
 * (`cms.configuration.requires_mfa`, F2.7a).
 *
 * Desactivarla rebaja la seguridad de toda la consola (bastaría la
 * contraseña de un miembro del personal para entrar), así que:
 *
 *  - siempre se muestra un aviso con las consecuencias;
 *  - desactivarla pide confirmación explícita;
 *  - el interruptor solo se habilita si la API dice que el usuario puede
 *    (`canUpdate`, y para desactivar `canDisable`: cuenta raíz con sesión
 *    aal2). Si no, se explica por qué.
 *
 * Quien lo usa lo monta con una `key` que depende del valor guardado, para
 * que el formulario empiece de cero cuando la configuración cambia.
 *
 * La API y la base de datos vuelven a comprobarlo todo (política RLS y
 * *trigger* `cms.guard_mfa_requirement_change`) y el cambio queda en la
 * auditoría como aviso.
 */
import { useState } from 'react';

import { useForm } from '@tanstack/react-form';
import { ShieldAlertIcon, TriangleAlertIcon } from 'lucide-react';
import { useTranslations } from 'use-intl';
import * as z from 'zod';

import type { CmsMfaConfiguration } from '@pymekit/cms-ui-core/api';
import { Alert, AlertDescription, AlertTitle } from '@pymekit/ui/alert';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@pymekit/ui/alert-dialog';
import { alertExtras } from '@pymekit/ui/alert-extras';
import { Button } from '@pymekit/ui/button';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@pymekit/ui/field';
import { Spinner } from '@pymekit/ui/spinner';
import { Switch } from '@pymekit/ui/switch';

import { useUpdateMfaConfigurationMutation } from '../hooks/use-settings-mutations';

const MfaRequirementSchema = z.object({ requiresMfa: z.boolean() });

export function MfaRequirementForm(props: { config: CmsMfaConfiguration }) {
  const t = useTranslations('cms.settings.authentication');
  const mutation = useUpdateMfaConfigurationMutation();
  const [confirmingDisable, setConfirmingDisable] = useState(false);
  const { config } = props;

  // Se puede tocar el interruptor si se puede activar (canUpdate) o, estando
  // activado, si además se puede desactivar (canDisable).
  const switchEnabled =
    config.canUpdate && (!config.requiresMfa || config.canDisable);

  const form = useForm({
    defaultValues: { requiresMfa: config.requiresMfa },
    validators: { onSubmit: MfaRequirementSchema },
    onSubmit: async ({ value }) => {
      // Desactivarla nunca se envía directamente: primero se confirma.
      if (!value.requiresMfa) {
        setConfirmingDisable(true);
        return;
      }

      await mutation.mutateAsync(true);
    },
  });

  const submit = () =>
    void form.handleSubmit().catch(() => {
      // El aviso de error ya lo muestra la mutación.
    });

  const confirmDisable = () =>
    void mutation
      .mutateAsync(false)
      .then(() => setConfirmingDisable(false))
      .catch(() => {
        // El aviso de error ya lo muestra la mutación; el diálogo sigue
        // abierto para poder cancelar.
      });

  return (
    <form
      data-testid="mfa-requirement-form"
      data-requires-mfa={config.requiresMfa}
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Alert
        className={alertExtras.warning}
        data-testid="mfa-requirement-warning"
      >
        <TriangleAlertIcon className="h-4 w-4" />
        <AlertTitle>{t('warningTitle')}</AlertTitle>
        <AlertDescription>{t('warningText')}</AlertDescription>
      </Alert>

      <form.Field name="requiresMfa">
        {(field) => (
          <Field orientation="horizontal" className="rounded-lg border p-4">
            <FieldContent>
              <FieldLabel htmlFor="cms-requires-mfa">
                {t('requireMfa')}
              </FieldLabel>
              <FieldDescription>{t('requireMfaDescription')}</FieldDescription>
              <FieldError errors={field.state.meta.errors} />
            </FieldContent>

            <Switch
              id="cms-requires-mfa"
              data-testid="mfa-requirement-switch"
              checked={field.state.value}
              disabled={!switchEnabled || mutation.isPending}
              onCheckedChange={(checked) => field.handleChange(checked)}
            />
          </Field>
        )}
      </form.Field>

      {!config.canUpdate ? (
        <Alert data-testid="mfa-requirement-read-only">
          <ShieldAlertIcon className="h-4 w-4" />
          <AlertDescription>{t('readOnly')}</AlertDescription>
        </Alert>
      ) : config.requiresMfa && !config.canDisable ? (
        <Alert data-testid="mfa-requirement-root-only">
          <ShieldAlertIcon className="h-4 w-4" />
          <AlertDescription>
            {config.isRoot ? t('verifyToDisable') : t('rootOnly')}
          </AlertDescription>
        </Alert>
      ) : null}

      <form.Subscribe
        selector={(state) => [state.isDirty, state.isSubmitting] as const}
      >
        {([isDirty, isSubmitting]) => (
          <div>
            <Button
              type="submit"
              data-testid="mfa-requirement-submit"
              disabled={!isDirty || isSubmitting || !switchEnabled}
            >
              {isSubmitting ? <Spinner className="h-3.5 w-3.5" /> : null}
              {t('save')}
            </Button>
          </div>
        )}
      </form.Subscribe>

      <AlertDialog
        open={confirmingDisable}
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) {
            setConfirmingDisable(false);
          }
        }}
      >
        <AlertDialogContent data-testid="mfa-disable-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('confirmDisableTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('confirmDisableText')}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>
              {t('cancel')}
            </AlertDialogCancel>

            <Button
              type="button"
              variant="destructive"
              data-testid="mfa-disable-confirm"
              disabled={mutation.isPending}
              onClick={confirmDisable}
            >
              {mutation.isPending ? <Spinner className="h-3.5 w-3.5" /> : null}
              {t('confirmDisable')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
