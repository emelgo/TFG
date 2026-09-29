/**
 * Formulario de un registro (crear y editar), construido a partir del
 * metadato de las columnas.
 *
 * Usa TanStack Form con el esquema Zod que genera `createRecordFormSchema`
 * (ver `utils/record-form.ts`): una entrada por columna editable, con sus
 * reglas de obligatoriedad, formato y longitud. Se divide en dos piezas:
 *
 *  - `useRecordForm`: crea el formulario y, al enviarlo, construye el cuerpo
 *    de la petición (`buildRecordPayload`: solo lo modificado al editar).
 *    Lo usan las páginas y diálogos, que así pueden leer del mismo `form`
 *    si hay cambios sin guardar (`useRecordFormDirty`).
 *  - `RecordFormFields`: pinta los campos con la distribución de edición
 *    guardada de la tabla (`recordLayout.edit`) o, si no hay, en una lista.
 *
 * El envío real (la mutación) lo hace quien usa el formulario.
 *
 * [TFG] RF-09: formularios del CMS con TanStack Form y Zod (ADR-013).
 */
import { useMemo, useState } from 'react';

import { useForm, useStore } from '@tanstack/react-form';
import { useTranslations } from 'use-intl';

import type { RecordLayoutConfig, RelationConfig } from '@pymekit/cms-types';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@pymekit/ui/field';
import { toast } from '@pymekit/ui/sonner';
import { cn } from '@pymekit/ui/utils';

import {
  type FieldPlaceholder,
  type FormField,
  type RecordFormMode,
  type RecordFormValues,
  buildRecordPayload,
  createRecordFormSchema,
  getDirtyFields,
  getFieldPlaceholder,
  isFieldRequired,
} from '../../utils/record-form';
import { getLayoutColumnFlexBasis } from '../../utils/record-layout';
import { RecordFieldInput } from './record-field-input';

type RecordForm = ReturnType<typeof useRecordForm>['form'];

/**
 * Crea el formulario de un registro. `onSubmit` recibe el cuerpo que hay que
 * enviar a la API; si al editar no hay cambios, no se llama y se avisa.
 */
export function useRecordForm(params: {
  fields: FormField[];
  mode: RecordFormMode;
  initialValues: RecordFormValues;
  timeZone: string;
  /** Valores que se añaden siempre al crear (claves foráneas fijadas). */
  fixedValues?: Record<string, unknown>;
  onSubmit: (payload: Record<string, unknown>) => Promise<unknown>;
}) {
  const t = useTranslations('cms.dataExplorer');
  const { fields, mode, initialValues, timeZone } = params;

  // El esquema y los valores iniciales se fijan al montar: el formulario no
  // se reconstruye si el metadato se vuelve a pedir en segundo plano.
  const [schema] = useState(() => createRecordFormSchema(fields, mode));
  const [initial] = useState(initialValues);

  const form = useForm({
    defaultValues: initial,
    validators: { onChange: schema, onSubmit: schema },
    onSubmit: async ({ value }) => {
      const payload = buildRecordPayload({
        fields,
        initial,
        current: value,
        mode,
        timeZone,
        fixedValues: params.fixedValues,
      });

      if (Object.keys(payload).length === 0) {
        toast.info(t('record.form.noChanges'));
        return;
      }

      await params.onSubmit(payload);
    },
  });

  return { form, initial };
}

/** `true` si algún campo del formulario difiere de su valor inicial. */
export function useRecordFormDirty(
  form: RecordForm,
  fields: FormField[],
  initial: RecordFormValues,
) {
  return useStore(
    form.store,
    (state) => getDirtyFields(fields, initial, state.values).length > 0,
  );
}

export function RecordFormFields(props: {
  formId: string;
  form: RecordForm;
  fields: FormField[];
  mode: RecordFormMode;
  relationsConfig: RelationConfig[];
  /** Etiqueta de la fila a la que apunta cada clave foránea (valor inicial). */
  relationLabels?: Record<string, string>;
  initial: RecordFormValues;
  customLayout?: RecordLayoutConfig | null;
  disabled?: boolean;
  className?: string;
}) {
  const t = useTranslations('cms.dataExplorer');
  const { form, fields, customLayout } = props;

  const fieldMap = useMemo(
    () => new Map(fields.map((field) => [field.column.name, field])),
    [fields],
  );

  const placeholderText = (placeholder: FieldPlaceholder) =>
    'literal' in placeholder
      ? t('record.placeholder.defaultValue', { value: placeholder.literal })
      : t(placeholder.key, placeholder.values);

  const renderField = (field: FormField) => {
    const { column } = field;
    const inputId = `${props.formId}-${column.name}`;
    const maxLength = column.ui_config?.max_length;

    return (
      <form.Field key={column.name} name={column.name}>
        {(formField) => {
          // Al enviar, TanStack Form marca todos los campos como tocados, así
          // que los errores de los campos sin tocar también aparecen.
          const isInvalid =
            formField.state.meta.isTouched && !formField.state.meta.isValid;

          const value = formField.state.value;
          const initialValue = props.initial[column.name];

          return (
            <Field
              data-invalid={isInvalid}
              data-testid="record-form-field"
              data-column={column.name}
              className="px-3 py-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <FieldLabel htmlFor={inputId} className="text-muted-foreground">
                  {column.display_name || column.name}

                  {isFieldRequired(column, props.mode) ? (
                    <span className="text-destructive text-xs">*</span>
                  ) : null}
                </FieldLabel>

                {maxLength && typeof value === 'string' ? (
                  <span
                    className={cn('text-muted-foreground text-xs', {
                      'text-destructive': value.length > maxLength,
                    })}
                  >
                    {value.length}/{maxLength}
                  </span>
                ) : null}
              </div>

              <RecordFieldInput
                id={inputId}
                field={field}
                value={value}
                disabled={props.disabled}
                invalid={isInvalid}
                placeholder={placeholderText(getFieldPlaceholder(column))}
                relationConfig={props.relationsConfig.find(
                  (relation) => relation.source_column === column.name,
                )}
                relationLabel={
                  value === initialValue
                    ? props.relationLabels?.[column.name]
                    : undefined
                }
                onBlur={formField.handleBlur}
                onChange={(next) => formField.handleChange(next)}
              />

              {column.description ? (
                <FieldDescription>{column.description}</FieldDescription>
              ) : null}

              <FieldError
                data-testid="record-form-field-error"
                errors={formField.state.meta.errors}
                params={{ maxLength: String(maxLength ?? '') }}
              />
            </Field>
          );
        }}
      </form.Field>
    );
  };

  // Distribución de edición guardada: grupos con filas de hasta 4 cuartos.
  const layoutGroups = (customLayout?.edit ?? [])
    .map((group) => ({
      ...group,
      rows: (group.rows ?? [])
        .map((row) => ({
          ...row,
          columns: (row.columns ?? []).filter((layoutColumn) =>
            fieldMap.has(layoutColumn.fieldName),
          ),
        }))
        .filter((row) => row.columns.length > 0),
    }))
    .filter((group) => group.rows.length > 0);

  // Los campos editables que la distribución no menciona se añaden al final,
  // para que ninguno quede fuera del formulario.
  const placed = new Set(
    layoutGroups.flatMap((group) =>
      group.rows.flatMap((row) => row.columns.map((col) => col.fieldName)),
    ),
  );

  const remaining = fields.filter((field) => !placed.has(field.column.name));

  return (
    <form
      id={props.formId}
      noValidate
      data-testid="record-form"
      className={cn('flex flex-col gap-3', props.className)}
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      {layoutGroups.map((group) => (
        <section
          key={group.id}
          className="bg-background rounded-md border py-1"
          data-testid="record-form-group"
        >
          {group.label ? (
            <h3 className="text-muted-foreground px-3 pt-3 text-xs font-medium uppercase">
              {group.label}
            </h3>
          ) : null}

          {group.rows.map((row) => (
            <div key={row.id} className="flex flex-wrap">
              {row.columns.map((layoutColumn) => (
                <div
                  key={layoutColumn.id}
                  className="min-w-0"
                  style={{
                    flexBasis: getLayoutColumnFlexBasis(layoutColumn.size),
                  }}
                >
                  {renderField(fieldMap.get(layoutColumn.fieldName)!)}
                </div>
              ))}
            </div>
          ))}
        </section>
      ))}

      {remaining.length > 0 ? (
        <div className="bg-background flex flex-col rounded-md border py-1">
          {remaining.map(renderField)}
        </div>
      ) : null}
    </form>
  );
}
