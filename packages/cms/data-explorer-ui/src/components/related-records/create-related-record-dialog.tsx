/**
 * «Añadir» en una sección uno a muchos de la ficha: crea un registro en la
 * tabla hija ya enlazado con el registro que se está viendo.
 *
 * El formulario es el mismo que el de «Nuevo registro» (`useRecordForm`),
 * con la clave foránea oculta y fijada al valor del registro padre
 * (`fixedValues`), de modo que el usuario no puede enlazarlo con otro.
 *
 * Solo se ofrece si el usuario puede insertar en la tabla hija
 * (`queries.tablePermissions`) y si su columna de clave foránea es editable
 * en el metadato: si no lo fuera, la base de datos la descartaría y el
 * registro quedaría sin enlazar. La API vuelve a comprobar el permiso.
 */
import { useMemo } from 'react';

import { useQuery } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import { useTranslations } from 'use-intl';

import { getLookupRelations } from '@pymekit/cms-data-explorer-core/utils';
import { useFormatterContext } from '@pymekit/cms-formatters/hooks';
import type { ColumnMetadata, RelationConfig } from '@pymekit/cms-types';
import type { CmsTableMetadata } from '@pymekit/cms-ui-core/api';
import { useCmsApi } from '@pymekit/cms-ui-core/api-context';
import { Button } from '@pymekit/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@pymekit/ui/dialog';
import { useAsyncDialog } from '@pymekit/ui/hooks/use-async-dialog';
import { Spinner } from '@pymekit/ui/spinner';

import { useInsertRecordMutation } from '../../hooks/use-record-mutations';
import { getFormFields, getInitialFormValues } from '../../utils/record-form';
import { RecordFormFields, useRecordForm } from '../record/record-form';

export function CreateRelatedRecordButton(props: {
  relation: RelationConfig;
  /** Valor de la columna origen del registro padre. */
  parentValue: string | number;
  label: string;
}) {
  const t = useTranslations('cms.dataExplorer');
  const { queries } = useCmsApi();
  const { relation } = props;
  // Mientras se guarda, el diálogo no se cierra con Escape ni clic fuera.
  const { dialogProps, setIsPending, setOpen } = useAsyncDialog();

  const permissions = useQuery(
    queries.tablePermissions(relation.target_schema, relation.target_table),
  );

  const metadata = useQuery({
    ...queries.tableMetadata(relation.target_schema, relation.target_table),
    enabled: permissions.data?.canInsert === true,
  });

  const foreignKeyColumn = (
    metadata.data?.columns as ColumnMetadata[] | undefined
  )?.find((column) => column.name === relation.target_column);

  if (!permissions.data?.canInsert || !foreignKeyColumn?.is_editable) {
    return null;
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        data-testid="create-related-record-button"
        onClick={() => setOpen(true)}
      >
        <PlusIcon className="h-3.5 w-3.5" />
        {t('record.related.add')}
      </Button>

      <Dialog {...dialogProps}>
        <DialogContent
          className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
          data-testid="create-related-record-dialog"
        >
          <DialogHeader>
            <DialogTitle>
              {t('record.related.createTitle', { table: props.label })}
            </DialogTitle>

            <DialogDescription>
              {t('record.related.createDescription')}
            </DialogDescription>
          </DialogHeader>

          {dialogProps.open && metadata.data ? (
            <CreateRelatedRecordForm
              relation={relation}
              parentValue={props.parentValue}
              metadata={metadata.data}
              onPendingChange={setIsPending}
              onCreated={() => setOpen(false)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function CreateRelatedRecordForm(props: {
  relation: RelationConfig;
  parentValue: string | number;
  metadata: CmsTableMetadata;
  onPendingChange: (pending: boolean) => void;
  onCreated: () => void;
}) {
  const t = useTranslations('cms.dataExplorer');
  const { timezone } = useFormatterContext();
  const mutation = useInsertRecordMutation();
  const { relation, metadata } = props;

  const relationsConfig = useMemo(
    () => getLookupRelations(metadata.table.relationsConfig),
    [metadata.table.relationsConfig],
  );

  const fields = useMemo(
    () =>
      getFormFields(
        metadata.columns as ColumnMetadata[],
        new Set(relationsConfig.map((item) => item.source_column)),
        new Set([relation.target_column]),
      ),
    [metadata.columns, relationsConfig, relation.target_column],
  );

  const formId = `create-related-${relation.target_schema}-${relation.target_table}-${relation.target_column}`;

  const { form, initial } = useRecordForm({
    fields,
    mode: 'create',
    initialValues: getInitialFormValues(fields, null, timezone),
    timeZone: timezone,
    fixedValues: { [relation.target_column]: String(props.parentValue) },
    onSubmit: async (payload) => {
      props.onPendingChange(true);

      try {
        await mutation.mutateAsync({
          schema: relation.target_schema,
          table: relation.target_table,
          data: payload,
        });

        props.onCreated();
      } catch {
        // El aviso de error ya lo muestra la mutación.
      } finally {
        props.onPendingChange(false);
      }
    },
  });

  return (
    <>
      <RecordFormFields
        formId={formId}
        form={form}
        fields={fields}
        mode="create"
        initial={initial}
        relationsConfig={relationsConfig}
        disabled={mutation.isPending}
      />

      <DialogFooter>
        <Button
          type="submit"
          form={formId}
          data-testid="create-related-record-submit"
          disabled={mutation.isPending}
        >
          {mutation.isPending ? <Spinner className="h-3.5 w-3.5" /> : null}
          {t('record.form.create')}
        </Button>
      </DialogFooter>
    </>
  );
}
