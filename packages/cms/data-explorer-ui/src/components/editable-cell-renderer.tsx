/**
 * Edición en línea de una celda del listado.
 *
 * Envuelve la celda de solo lectura (`DataExplorerCellRenderer` de
 * `@pymekit/cms-table`) y, al pasar el ratón, muestra un lápiz que abre un
 * pequeño formulario con el control de esa columna (`RecordFieldInput`). Al
 * guardar, actualiza solo esa columna del registro con
 * `PUT /v1/tables/:schema/:table/record/conditions`, identificándolo por su
 * clave (`getRecordKeyConditions`).
 *
 * La tabla genérica no sabe nada de permisos ni de la API: el listado le
 * pasa este componente como `CellRenderer` y publica en
 * `InlineEditContext` la tabla y su configuración de claves solo si el
 * usuario tiene permiso `update`. Sin contexto, o si la columna no es
 * editable, la celda es de solo lectura.
 */
import { createContext, useContext, useMemo, useState } from 'react';

import { CheckIcon, PencilIcon, XIcon } from 'lucide-react';
import { useTranslations } from 'use-intl';

import { useFormatterContext } from '@pymekit/cms-formatters/hooks';
import {
  type CellRendererProps,
  DataExplorerCellRenderer,
} from '@pymekit/cms-table/components';
import { Button } from '@pymekit/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@pymekit/ui/popover';
import { Spinner } from '@pymekit/ui/spinner';

import { useUpdateRecordMutation } from '../hooks/use-record-mutations';
import {
  type FormField,
  getFieldKind,
  getInitialFormValues,
} from '../utils/record-form';
import type { TableKeysConfig } from '../utils/record-keys';
import {
  getRecordKeyConditions,
  toRecordKeys,
} from '../utils/record-selection';
import { RecordFormFields, useRecordForm } from './record/record-form';

type InlineEditContextValue = {
  schema: string;
  table: string;
  keysConfig: TableKeysConfig;
};

/** Tabla editable en línea; `null` si el usuario no puede actualizarla. */
export const InlineEditContext = createContext<InlineEditContextValue | null>(
  null,
);

export function EditableCellRenderer(props: CellRendererProps) {
  const t = useTranslations('cms.dataExplorer');
  const context = useContext(InlineEditContext);
  const [open, setOpen] = useState(false);

  const conditions = context
    ? getRecordKeyConditions(props.record, context.keysConfig)
    : null;

  if (!context || !conditions || !props.column.is_editable) {
    return <DataExplorerCellRenderer {...props} />;
  }

  return (
    <div className="group/cell flex w-full items-center justify-between gap-1">
      <div className="min-w-0 flex-1">
        <DataExplorerCellRenderer {...props} />
      </div>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              size="icon"
              variant="ghost"
              aria-label={t('table.editCell', {
                column: props.column.display_name || props.column.name,
              })}
              data-testid="inline-edit-button"
              data-column={props.column.name}
              className="h-6 w-6 opacity-0 group-hover/cell:opacity-100 focus-visible:opacity-100"
              // La celda abre la ficha al pulsarla: el lápiz no debe hacerlo.
              onClick={(event) => event.stopPropagation()}
            />
          }
        >
          <PencilIcon className="h-3 w-3" />
        </PopoverTrigger>

        <PopoverContent
          align="start"
          className="w-96"
          data-testid="inline-edit-popover"
          // Los eventos de React atraviesan el portal: sin esto, un clic en
          // el formulario llegaría a la celda y abriría la ficha.
          onClick={(event) => event.stopPropagation()}
        >
          {open ? (
            <InlineCellEditor
              {...props}
              schema={context.schema}
              table={context.table}
              keys={toRecordKeys(conditions)}
              onDone={() => setOpen(false)}
            />
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  );
}

function InlineCellEditor(
  props: CellRendererProps & {
    schema: string;
    table: string;
    keys: Record<string, string>;
    onDone: () => void;
  },
) {
  const t = useTranslations('cms.dataExplorer');
  const { timezone } = useFormatterContext();
  const mutation = useUpdateRecordMutation();
  const { column } = props;

  const fields = useMemo<FormField[]>(
    () => [
      { column, kind: getFieldKind(column, Boolean(props.relationConfig)) },
    ],
    [column, props.relationConfig],
  );

  const formId = `inline-edit-${column.name}`;

  const { form, initial } = useRecordForm({
    fields,
    mode: 'edit',
    initialValues: getInitialFormValues(fields, props.record, timezone),
    timeZone: timezone,
    onSubmit: async (payload) => {
      try {
        await mutation.mutateAsync({
          schema: props.schema,
          table: props.table,
          keys: props.keys,
          data: payload,
        });

        props.onDone();
      } catch {
        // El aviso de error ya lo muestra la mutación.
      }
    },
  });

  return (
    <div className="flex flex-col gap-2" data-testid="inline-edit-form">
      <RecordFormFields
        formId={formId}
        form={form}
        fields={fields}
        mode="edit"
        initial={initial}
        relationsConfig={props.relationConfig ? [props.relationConfig] : []}
        relationLabels={
          props.relation?.formatted
            ? { [column.name]: props.relation.formatted }
            : undefined
        }
        disabled={mutation.isPending}
        className="[&_[data-testid=record-form-field]]:p-0"
      />

      <div className="flex justify-end gap-1">
        <Button
          size="sm"
          variant="ghost"
          type="button"
          data-testid="inline-edit-cancel"
          disabled={mutation.isPending}
          onClick={props.onDone}
        >
          <XIcon className="h-3.5 w-3.5" />
          {t('record.delete.cancel')}
        </Button>

        <Button
          size="sm"
          type="submit"
          form={formId}
          data-testid="inline-edit-save"
          disabled={mutation.isPending}
        >
          {mutation.isPending ? (
            <Spinner className="h-3.5 w-3.5" />
          ) : (
            <CheckIcon className="h-3.5 w-3.5" />
          )}
          {t('record.form.save')}
        </Button>
      </div>
    </div>
  );
}
