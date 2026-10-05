/**
 * Páginas de creación y edición de un registro del explorador de datos.
 *
 * Como el listado y la ficha, no cargan datos ni conocen la ruta: la ruta de
 * la web les pasa el metadato de la tabla (crear) o la ficha ya cargada
 * (editar) y la URL de la ficha a la que volver. Aquí se decide:
 *
 *  - qué campos se muestran (`getFormFields`: solo los editables) y sus
 *    valores iniciales (los del registro o los valores por defecto);
 *  - el envío con `useMutation` (`use-record-mutations.ts`), el aviso de
 *    éxito o error y la navegación posterior (a la ficha creada o editada);
 *  - el aviso de cambios sin guardar si se sale de la página
 *    (`useUnsavedChangesBlocker`).
 *
 * Mostrar estas páginas no concede nada: la ruta solo las abre si el usuario
 * tiene el permiso (`canInsert`/`canUpdate`) y la API lo vuelve a comprobar
 * al guardar.
 *
 * [TFG] RF-09: creación y edición de registros del CMS.
 */
import { useMemo, useRef } from 'react';

import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeftIcon, CheckCircleIcon, Grid2X2 } from 'lucide-react';
import { useTranslations } from 'use-intl';

import { getLookupRelations } from '@pymekit/cms-data-explorer-core/utils';
import { useFormatterContext } from '@pymekit/cms-formatters/hooks';
import type { ColumnMetadata, RecordLayoutConfig } from '@pymekit/cms-types';
import type { CmsRecordData, CmsTableMetadata } from '@pymekit/cms-ui-core/api';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@pymekit/ui/breadcrumb';
import { Button } from '@pymekit/ui/button';
import { PageSummary } from '@pymekit/ui/page';
import { Spinner } from '@pymekit/ui/spinner';

import { useTableTabManagement } from '../../hooks/use-data-explorer-tabs';
import {
  useInsertRecordMutation,
  useUpdateRecordMutation,
} from '../../hooks/use-record-mutations';
import {
  UnsavedChangesDialog,
  useUnsavedChangesBlocker,
} from '../../hooks/use-unsaved-changes-blocker';
import { buildResourceUrl } from '../../utils/build-resource-url';
import { DATA_EXPLORER_BASE_PATH } from '../../utils/paths';
import {
  type FormField,
  type RecordFormMode,
  getFormFields,
  getInitialFormValues,
} from '../../utils/record-form';
import { toTableKeysConfig } from '../../utils/record-keys';
import { hasRenderableFields } from '../../utils/record-layout';
import {
  type ForeignKeyRecord,
  getForeignKeyLink,
  getRecordDisplayName,
} from '../../utils/record-relations';
import { DataExplorerTabs } from '../data-explorer-tabs';
import {
  RecordFormFields,
  useRecordForm,
  useRecordFormDirty,
} from './record-form';

const FORM_ID = 'record-form';

/** Página «Nuevo registro» de una tabla. */
export function RecordCreateView(props: {
  schema: string;
  table: string;
  metadata: CmsTableMetadata;
}) {
  const t = useTranslations('cms.dataExplorer');
  const navigate = useNavigate();
  const mutation = useInsertRecordMutation();
  const { schema, table, metadata } = props;

  const columns = metadata.columns as ColumnMetadata[];
  const tableName = metadata.table.displayName || metadata.table.tableName;

  useTableTabManagement(`${tableName} · ${t('record.form.newRecord')}`);

  return (
    <RecordFormPage
      mode="create"
      schema={schema}
      table={table}
      columns={columns}
      relationsConfig={metadata.table.relationsConfig}
      uiConfig={metadata.table.uiConfig}
      record={null}
      tableName={tableName}
      tableDescription={metadata.table.description}
      title={t('record.form.newRecord')}
      backHref={listHref(schema, table)}
      isPending={mutation.isPending}
      onSubmit={async (payload, allowNavigation) => {
        const result = await mutation.mutateAsync({
          schema,
          table,
          data: payload,
        });

        allowNavigation();

        // A la ficha del registro creado; si la tabla no permite
        // identificarlo (sin clave), al listado.
        const href = buildResourceUrl({
          schema,
          table,
          record: result.data,
          tableMetadata: toTableKeysConfig(metadata.table.uiConfig),
        });

        await navigate({ href: href || listHref(schema, table) });
      }}
    />
  );
}

/** Página «Editar» de un registro. */
export function RecordEditView(props: {
  schema: string;
  table: string;
  keys: Record<string, string>;
  data: CmsRecordData;
  /** URL de la ficha del registro, a la que se vuelve al guardar. */
  recordHref: string;
}) {
  const t = useTranslations('cms.dataExplorer');
  const navigate = useNavigate();
  const mutation = useUpdateRecordMutation();
  const { schema, table, keys, data } = props;
  const { metadata, data: record } = data;

  const columns = metadata.columns as ColumnMetadata[];
  const tableName = metadata.table.displayName || metadata.table.tableName;
  const recordName = getRecordDisplayName(
    metadata.table.displayFormat,
    record,
    Object.values(keys).join(' · '),
  );

  useTableTabManagement(`${tableName} · ${recordName}`);

  // Etiqueta de cada clave foránea legible, para que el selector muestre el
  // nombre de la fila relacionada y no su identificador.
  const relationLabels = useMemo(() => {
    const records = data.foreignKeyRecords as ForeignKeyRecord[];

    return Object.fromEntries(
      records
        .map((item) => [
          item.column,
          getForeignKeyLink(records, item.column, record[item.column])?.label,
        ])
        .filter((entry): entry is [string, string] => Boolean(entry[1])),
    );
  }, [data.foreignKeyRecords, record]);

  return (
    <RecordFormPage
      mode="edit"
      schema={schema}
      table={table}
      columns={columns}
      relationsConfig={metadata.table.relationsConfig}
      uiConfig={metadata.table.uiConfig}
      record={record}
      relationLabels={relationLabels}
      tableName={tableName}
      tableDescription={metadata.table.description}
      recordName={recordName || t('record.noName')}
      recordHref={props.recordHref}
      title={t('record.form.editRecord')}
      backHref={props.recordHref}
      isPending={mutation.isPending}
      onSubmit={async (payload, allowNavigation) => {
        await mutation.mutateAsync({ schema, table, keys, data: payload });

        allowNavigation();

        await navigate({ href: props.recordHref });
      }}
    />
  );
}

/**
 * Estructura común de las dos páginas: pestañas, migas de pan, indicador de
 * cambios sin guardar, botones de volver y guardar, y el formulario.
 */
function RecordFormPage(props: {
  mode: RecordFormMode;
  schema: string;
  table: string;
  columns: ColumnMetadata[];
  relationsConfig: unknown;
  uiConfig: unknown;
  record: Record<string, unknown> | null;
  relationLabels?: Record<string, string>;
  tableName: string;
  /** Descripción de la tabla en los metadatos del CMS, como resumen. */
  tableDescription?: string | null;
  recordName?: string;
  recordHref?: string;
  title: string;
  backHref: string;
  isPending: boolean;
  onSubmit: (
    payload: Record<string, unknown>,
    allowNavigation: () => void,
  ) => Promise<void>;
}) {
  const t = useTranslations('cms.dataExplorer');
  const { timezone } = useFormatterContext();
  const navigationAllowed = useRef(false);

  const relationsConfig = useMemo(
    () => getLookupRelations(props.relationsConfig),
    [props.relationsConfig],
  );

  const fields = useMemo<FormField[]>(
    () =>
      getFormFields(
        props.columns,
        new Set(relationsConfig.map((relation) => relation.source_column)),
      ),
    [props.columns, relationsConfig],
  );

  const customLayout = useMemo(() => {
    const layout = (props.uiConfig as { recordLayout?: RecordLayoutConfig })
      ?.recordLayout;

    return layout && hasRenderableFields(layout, props.columns, 'edit')
      ? layout
      : null;
  }, [props.uiConfig, props.columns]);

  const { form, initial } = useRecordForm({
    fields,
    mode: props.mode,
    initialValues: getInitialFormValues(fields, props.record, timezone),
    timeZone: timezone,
    onSubmit: (payload) =>
      // El error ya lo avisa la mutación; aquí solo se evita que la promesa
      // rechazada llegue al formulario como error sin tratar.
      props
        .onSubmit(payload, () => {
          navigationAllowed.current = true;
        })
        .catch(() => undefined),
  });

  const isDirty = useRecordFormDirty(form, fields, initial);

  const blocker = useUnsavedChangesBlocker({
    hasUnsavedChanges: isDirty,
    isSubmitting: props.isPending,
    allowed: navigationAllowed,
  });

  return (
    <div
      className="flex flex-1 flex-col gap-2 pb-16"
      data-testid="record-form-page"
      data-mode={props.mode}
      data-schema={props.schema}
      data-table={props.table}
    >
      <DataExplorerTabs />

      <div className="bg-background sticky top-0 z-10 flex h-12 items-center justify-between gap-2">
        <Breadcrumb className="min-w-0">
          <BreadcrumbList>
            <BreadcrumbItem>
              <Link
                to={listHref(props.schema, props.table)}
                className="hover:bg-muted/30 text-secondary-foreground flex items-center gap-x-1.5 rounded-md py-1 hover:underline"
              >
                <Grid2X2 className="text-muted-foreground h-3.5 w-3.5" />
                <span>{props.tableName}</span>
              </Link>
            </BreadcrumbItem>

            {props.recordName && props.recordHref ? (
              <>
                <BreadcrumbSeparator />

                <BreadcrumbItem className="min-w-0">
                  <Link
                    to={props.recordHref}
                    className="max-w-64 truncate hover:underline"
                  >
                    {props.recordName}
                  </Link>
                </BreadcrumbItem>
              </>
            ) : null}

            <BreadcrumbSeparator />

            <BreadcrumbItem>
              <BreadcrumbPage data-testid="record-form-title">
                {props.title}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex items-center gap-2">
          {isDirty ? (
            <span
              className="text-muted-foreground text-xs"
              data-testid="record-form-unsaved"
            >
              {t('record.form.unsavedChanges')}
            </span>
          ) : null}

          <Button
            nativeButton={false}
            size="sm"
            variant="outline"
            data-testid="record-form-back"
            render={<Link to={props.backHref} />}
          >
            <ArrowLeftIcon className="h-3.5 w-3.5" />
            {t('record.form.back')}
          </Button>

          <Button
            type="submit"
            form={FORM_ID}
            size="sm"
            data-testid="record-form-submit"
            disabled={props.isPending || (props.mode === 'edit' && !isDirty)}
          >
            {props.isPending ? (
              <Spinner className="h-3.5 w-3.5" />
            ) : (
              <CheckCircleIcon className="h-3.5 w-3.5" />
            )}
            {props.isPending ? t('record.form.saving') : t('record.form.save')}
          </Button>
        </div>
      </div>

      {props.tableDescription ? (
        <PageSummary>{props.tableDescription}</PageSummary>
      ) : null}

      {fields.length === 0 ? (
        <p
          className="text-muted-foreground px-2 text-sm"
          data-testid="record-form-no-fields"
        >
          {t('record.form.noEditableFields')}
        </p>
      ) : (
        <RecordFormFields
          formId={FORM_ID}
          form={form}
          fields={fields}
          mode={props.mode}
          initial={initial}
          relationsConfig={relationsConfig}
          relationLabels={props.relationLabels}
          customLayout={customLayout}
          disabled={props.isPending}
        />
      )}

      <UnsavedChangesDialog blocker={blocker} />
    </div>
  );
}

function listHref(schema: string, table: string) {
  return `${DATA_EXPLORER_BASE_PATH}/${encodeURIComponent(
    schema,
  )}/${encodeURIComponent(table)}`;
}
