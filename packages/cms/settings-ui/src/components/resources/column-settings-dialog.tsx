/**
 * Diálogo de edición de una columna en Ajustes > Recursos (F2.7c): etiqueta,
 * descripción, visibilidad en el listado y en la ficha, búsqueda, orden,
 * filtro, si es editable y el formateador (`ui_data_type`). En las columnas
 * de tipo enumerado también las etiquetas visibles de cada valor
 * (`ui_config.value_labels`, F3b).
 *
 * Solo se ofrecen los formateadores válidos para el tipo de PostgreSQL de la
 * columna (`getUiDataTypeOptions`, la misma lista que valida la API) y solo
 * se envía lo que ha cambiado (`buildColumnUpdate`).
 */
import { Fragment } from 'react';

import { useForm } from '@tanstack/react-form';
import { useTranslations } from 'use-intl';

import { getUiDataTypeOptions } from '@pymekit/cms-shared/resource-config';
import { useEnumLabel } from '@pymekit/i18n/enum-labels';
import { Button } from '@pymekit/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@pymekit/ui/dialog';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
} from '@pymekit/ui/field';
import { FieldLabelWithHelp } from '@pymekit/ui/field-help';
import { useAsyncDialog } from '@pymekit/ui/hooks/use-async-dialog';
import { Input } from '@pymekit/ui/input';
import { NativeSelect, NativeSelectOption } from '@pymekit/ui/native-select';
import { Spinner } from '@pymekit/ui/spinner';
import { Switch } from '@pymekit/ui/switch';
import { Textarea } from '@pymekit/ui/textarea';

import {
  type ColumnSettings,
  ColumnSettingsFormSchema,
  buildColumnUpdate,
} from '../../utils/resource-settings';

const FLAGS = [
  'isVisibleInTable',
  'isVisibleInDetail',
  'isSearchable',
  'isSortable',
  'isFilterable',
  'isEditable',
] as const;

export function ColumnSettingsDialog(props: {
  column: ColumnSettings;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submit: (update: Record<string, Record<string, unknown>>) => Promise<unknown>;
}) {
  const t = useTranslations('cms.settings.resources.column');
  const { dialogProps, isPending, setIsPending, setOpen } = useAsyncDialog({
    open: props.open,
    onOpenChange: props.onOpenChange,
  });

  const { column } = props;
  const uiTypes = getUiDataTypeOptions(column.dataType);
  // Etiqueta por defecto (traducción o humanizador) que se ve si se deja
  // vacío el campo; se muestra como `placeholder`.
  const enumLabel = useEnumLabel();

  const form = useForm({
    defaultValues: {
      displayName: column.displayName,
      description: column.description,
      isVisibleInTable: column.isVisibleInTable,
      isVisibleInDetail: column.isVisibleInDetail,
      isSearchable: column.isSearchable,
      isSortable: column.isSortable,
      isFilterable: column.isFilterable,
      isEditable: column.isEditable,
      uiDataType: column.uiDataType,
      valueLabels: column.valueLabels,
    },
    validators: {
      onChange: ColumnSettingsFormSchema,
      onSubmit: ColumnSettingsFormSchema,
    },
    onSubmit: async ({ value }) => {
      const update = buildColumnUpdate(column, value);

      if (!update) {
        setOpen(false);
        return;
      }

      setIsPending(true);

      try {
        await props.submit(update);
        setOpen(false);
      } catch {
        // El aviso de error ya lo muestra la mutación.
      } finally {
        setIsPending(false);
      }
    },
  });

  return (
    <Dialog {...dialogProps}>
      <DialogContent data-testid="column-settings-dialog">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <DialogHeader>
            <DialogTitle>{t('title', { column: column.name })}</DialogTitle>
            <DialogDescription>
              {t('description', { type: column.dataType || '—' })}
            </DialogDescription>
          </DialogHeader>

          <FieldGroup>
            <form.Field name="displayName">
              {(field) => (
                <Field data-invalid={!field.state.meta.isValid}>
                  <FieldLabelWithHelp
                    htmlFor="column-settings-label"
                    help={t('labelHelp')}
                  >
                    {t('label')}
                  </FieldLabelWithHelp>
                  <Input
                    id="column-settings-label"
                    data-testid="column-settings-label"
                    value={field.state.value}
                    maxLength={255}
                    placeholder={column.name}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                  <FieldError errors={field.state.meta.errors} />
                </Field>
              )}
            </form.Field>

            <form.Field name="description">
              {(field) => (
                <Field>
                  <FieldLabelWithHelp
                    htmlFor="column-settings-description"
                    help={t('columnDescriptionHelp')}
                  >
                    {t('columnDescription')}
                  </FieldLabelWithHelp>
                  <Textarea
                    id="column-settings-description"
                    value={field.state.value}
                    maxLength={2000}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                </Field>
              )}
            </form.Field>

            <form.Field name="uiDataType">
              {(field) => (
                <Field>
                  <FieldLabelWithHelp
                    htmlFor="column-settings-formatter"
                    help={t('formatterHelp')}
                  >
                    {t('formatter')}
                  </FieldLabelWithHelp>
                  <NativeSelect
                    id="column-settings-formatter"
                    data-testid="column-settings-formatter"
                    className="w-full"
                    value={field.state.value}
                    disabled={uiTypes.length === 0}
                    onChange={(event) => field.handleChange(event.target.value)}
                  >
                    <NativeSelectOption value="">
                      {t('formatterDefault')}
                    </NativeSelectOption>
                    {uiTypes.map((type) => (
                      <NativeSelectOption key={type} value={type}>
                        {t(`formatters.${type}`)}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
              )}
            </form.Field>

            <div className="grid grid-cols-2 gap-3">
              {FLAGS.map((flag) => (
                <form.Field key={flag} name={flag}>
                  {(field) => (
                    <Field orientation="horizontal">
                      <Switch
                        id={`column-settings-${flag}`}
                        data-testid={`column-settings-${flag}`}
                        checked={field.state.value}
                        onCheckedChange={(checked) =>
                          field.handleChange(checked)
                        }
                      />
                      <FieldLabelWithHelp
                        htmlFor={`column-settings-${flag}`}
                        help={t(`flags.${flag}Help`)}
                      >
                        {t(`flags.${flag}`)}
                      </FieldLabelWithHelp>
                    </Field>
                  )}
                </form.Field>
              ))}
            </div>
            {column.enumValues.length > 0 ? (
              <form.Field name="valueLabels">
                {(field) => (
                  <Field data-testid="column-settings-value-labels">
                    <FieldLabelWithHelp help={t('valueLabelsHelp')}>
                      {t('valueLabels')}
                    </FieldLabelWithHelp>
                    <FieldDescription>
                      {t('valueLabelsDescription')}
                    </FieldDescription>
                    <div className="grid max-h-56 grid-cols-[auto_1fr] items-center gap-2 overflow-y-auto">
                      {column.enumValues.map((value) => (
                        <Fragment key={value}>
                          <code className="text-muted-foreground text-xs">
                            {value}
                          </code>
                          <Input
                            aria-label={value}
                            data-testid={`column-settings-value-label-${value}`}
                            value={field.state.value[value] ?? ''}
                            maxLength={100}
                            placeholder={enumLabel(value, {
                              enumName: column.enumType,
                            })}
                            onBlur={field.handleBlur}
                            onChange={(event) =>
                              field.handleChange({
                                ...field.state.value,
                                [value]: event.target.value,
                              })
                            }
                          />
                        </Fragment>
                      ))}
                    </div>
                  </Field>
                )}
              </form.Field>
            ) : null}
          </FieldGroup>

          <DialogFooter>
            <Button
              type="submit"
              data-testid="column-settings-submit"
              disabled={isPending}
            >
              {isPending ? <Spinner className="h-3.5 w-3.5" /> : null}
              {t('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
