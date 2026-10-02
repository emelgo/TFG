/**
 * Configuración de una tabla en Ajustes > Recursos (F2.7c):
 *
 *  1. **Tabla**: nombre visible, área de negocio (agrupa la barra lateral;
 *     se sugieren las áreas que ya existen), descripción, formato de
 *     visualización (la plantilla `{columna}` con la que otras tablas
 *     muestran sus registros al enlazarlos), visibilidad en el explorador y
 *     búsqueda.
 *  2. **Columnas**: etiqueta, visibilidad en el listado y en la ficha,
 *     editable, formateador y orden; los cambios rápidos se hacen en la
 *     propia fila y el resto en `ColumnSettingsDialog`.
 *  3. **Relaciones**: activar o etiquetar las secciones de registros
 *     relacionados (uno a muchos) que muestra la ficha.
 *
 * Desde aquí se abre el diseñador de la ficha. Sin `table:update` todo se
 * muestra en solo lectura; la API lo vuelve a comprobar.
 *
 * [TFG] RF-09 · ADR-013 · ADR-014.
 */
import { useState } from 'react';

import { useForm } from '@tanstack/react-form';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowUpIcon,
  LayoutTemplateIcon,
  PencilIcon,
} from 'lucide-react';
import { useTranslations } from 'use-intl';

import type { CmsResourceSettings } from '@pymekit/cms-ui-core/api';
import { useCmsApi } from '@pymekit/cms-ui-core/api-context';
import { useIsHydrated } from '@pymekit/cms-ui-core/hydration';
import {
  NAVIGATION_GROUP_MAX_LENGTH,
  getAreaNames,
  getResourceArea,
} from '@pymekit/cms-ui-core/resources';
import { Button } from '@pymekit/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@pymekit/ui/card';
import { Field, FieldError, FieldGroup, FieldLabel } from '@pymekit/ui/field';
import { Input } from '@pymekit/ui/input';
import { Spinner } from '@pymekit/ui/spinner';
import { Switch } from '@pymekit/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@pymekit/ui/table';
import { Textarea } from '@pymekit/ui/textarea';

import {
  useUpdateColumnsConfigMutation,
  useUpdateRelationsConfigMutation,
  useUpdateTableMetadataMutation,
} from '../../hooks/use-resource-settings-mutations';
import {
  type ColumnSettings,
  type InlineRelation,
  TableSettingsFormSchema,
  moveColumn,
  readColumnsSettings,
  readRelationsSettings,
} from '../../utils/resource-settings';
import { ColumnSettingsDialog } from './column-settings-dialog';

type Ref = { schema: string; table: string };

export function ResourceSettingsView(props: {
  data: CmsResourceSettings;
  schema: string;
  table: string;
}) {
  const t = useTranslations('cms.settings.resources');
  const hydrated = useIsHydrated();
  const ref = { schema: props.schema, table: props.table };
  const canUpdate = props.data.permissions.canUpdate;
  const { data } = props;

  return (
    <div
      className="flex flex-col gap-4"
      data-testid="resource-settings-view"
      data-hydrated={hydrated}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link
            to="/admin/cms/settings/resources"
            aria-label={t('back')}
            className="hover:bg-muted inline-flex size-8 items-center justify-center rounded-md"
          >
            <ArrowLeftIcon className="h-4 w-4" />
          </Link>
          <h1 className="text-sm font-medium">
            {data.data.displayName || props.table}{' '}
            <span className="text-muted-foreground font-mono text-xs">
              {props.schema}.{props.table}
            </span>
          </h1>
        </div>

        <Link
          to="/admin/cms/settings/resources/$schema/$table/layout"
          params={ref}
          data-testid="resource-layout-link"
          className="hover:bg-muted inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm"
        >
          <LayoutTemplateIcon className="h-3.5 w-3.5" />
          {t('layout.open')}
        </Link>
      </div>

      <TableSettingsForm
        key={data.data.updatedAt}
        resource={ref}
        canUpdate={canUpdate}
        initial={{
          displayName: data.data.displayName ?? '',
          navigationGroup:
            getResourceArea({
              ...data.data,
              metadata: { isVisible: true, uiConfig: data.data.uiConfig },
            }) ?? '',
          description: data.data.description ?? '',
          displayFormat: data.data.displayFormat ?? '',
          isVisible: data.data.isVisible !== false,
          isSearchable: data.data.isSearchable !== false,
        }}
      />

      <ColumnsSettings
        resource={ref}
        canUpdate={canUpdate}
        columns={readColumnsSettings(data.data.columnsConfig)}
      />

      <RelationsSettings
        resource={ref}
        canUpdate={canUpdate}
        relations={readRelationsSettings(data.data.relationsConfig).filter(
          (relation) => relation.type === 'one_to_many',
        )}
      />
    </div>
  );
}

function TableSettingsForm(props: {
  resource: Ref;
  canUpdate: boolean;
  initial: {
    displayName: string;
    navigationGroup: string;
    description: string;
    displayFormat: string;
    isVisible: boolean;
    isSearchable: boolean;
  };
}) {
  const t = useTranslations('cms.settings.resources.table');
  const mutation = useUpdateTableMetadataMutation(props.resource);
  const areaSuggestions = useAreaSuggestions();

  const form = useForm({
    defaultValues: props.initial,
    validators: {
      onChange: TableSettingsFormSchema,
      onSubmit: TableSettingsFormSchema,
    },
    onSubmit: async ({ value }) => {
      await mutation.mutateAsync({
        display_name: value.displayName,
        // Vacío → `null` en la API: la tabla pasa a «Otros datos».
        navigation_group: value.navigationGroup,
        description: value.description,
        display_format: value.displayFormat,
        is_visible: value.isVisible,
        is_searchable: value.isSearchable,
      });
    },
  });

  const texts = [
    { name: 'displayName', max: 255 },
    { name: 'displayFormat', max: 500 },
  ] as const;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          data-testid="table-settings-form"
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit().catch(() => {
              // El aviso de error ya lo muestra la mutación.
            });
          }}
        >
          <FieldGroup>
            {texts.map(({ name, max }) => (
              <form.Field key={name} name={name}>
                {(field) => (
                  <Field data-invalid={!field.state.meta.isValid}>
                    <FieldLabel htmlFor={`table-settings-${name}`}>
                      {t(name)}
                    </FieldLabel>
                    <Input
                      id={`table-settings-${name}`}
                      data-testid={`table-settings-${name}`}
                      value={field.state.value}
                      maxLength={max}
                      disabled={!props.canUpdate}
                      placeholder={
                        name === 'displayFormat'
                          ? '{name} ({email})'
                          : undefined
                      }
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                    />
                    <FieldError errors={field.state.meta.errors} />
                  </Field>
                )}
              </form.Field>
            ))}

            <form.Field name="navigationGroup">
              {(field) => (
                <Field data-invalid={!field.state.meta.isValid}>
                  <FieldLabel htmlFor="table-settings-navigationGroup">
                    {t('navigationGroup')}
                  </FieldLabel>
                  {/* `datalist` sugiere las áreas existentes sin impedir
                      escribir una nueva. */}
                  <Input
                    id="table-settings-navigationGroup"
                    data-testid="table-settings-navigationGroup"
                    list="table-settings-navigationGroup-options"
                    value={field.state.value}
                    maxLength={NAVIGATION_GROUP_MAX_LENGTH}
                    disabled={!props.canUpdate}
                    placeholder={t('navigationGroupPlaceholder')}
                    aria-describedby="table-settings-navigationGroup-help"
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                  <datalist id="table-settings-navigationGroup-options">
                    {areaSuggestions.map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                  <p
                    id="table-settings-navigationGroup-help"
                    className="text-muted-foreground text-xs"
                  >
                    {t('navigationGroupHelp')}
                  </p>
                  <FieldError errors={field.state.meta.errors} />
                </Field>
              )}
            </form.Field>

            <form.Field name="description">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor="table-settings-description">
                    {t('tableDescription')}
                  </FieldLabel>
                  <Textarea
                    id="table-settings-description"
                    value={field.state.value}
                    maxLength={2000}
                    disabled={!props.canUpdate}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                </Field>
              )}
            </form.Field>

            <div className="flex flex-wrap gap-6">
              {(['isVisible', 'isSearchable'] as const).map((name) => (
                <form.Field key={name} name={name}>
                  {(field) => (
                    <Field orientation="horizontal">
                      <Switch
                        id={`table-settings-${name}`}
                        checked={field.state.value}
                        disabled={!props.canUpdate}
                        onCheckedChange={(checked) =>
                          field.handleChange(checked)
                        }
                      />
                      <FieldLabel htmlFor={`table-settings-${name}`}>
                        {t(name)}
                      </FieldLabel>
                    </Field>
                  )}
                </form.Field>
              ))}
            </div>
          </FieldGroup>

          {props.canUpdate ? (
            <form.Subscribe
              selector={(state) => [state.isDirty, state.isSubmitting] as const}
            >
              {([isDirty, isSubmitting]) => (
                <div>
                  <Button
                    type="submit"
                    data-testid="table-settings-submit"
                    disabled={!isDirty || isSubmitting}
                  >
                    {isSubmitting ? <Spinner className="h-3.5 w-3.5" /> : null}
                    {t('save')}
                  </Button>
                </div>
              )}
            </form.Subscribe>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}

/**
 * Áreas que ya existen, para sugerirlas al editar. Se leen de la
 * navegación (las tablas que el usuario puede leer), que ya está en caché
 * porque la barra lateral la usa.
 */
function useAreaSuggestions() {
  const { queries } = useCmsApi();
  const { data = [] } = useQuery(queries.navigation());

  return getAreaNames(
    data.map((resource) =>
      getResourceArea({ ...resource, metadata: resource.metadata }),
    ),
  );
}

function ColumnsSettings(props: {
  resource: Ref;
  canUpdate: boolean;
  columns: ColumnSettings[];
}) {
  const t = useTranslations('cms.settings.resources.column');
  const mutation = useUpdateColumnsConfigMutation(props.resource);
  const [editing, setEditing] = useState<string | null>(null);
  const busy = !props.canUpdate || mutation.isPending;
  const editingColumn = props.columns.find((column) => column.name === editing);

  const toggles = [
    ['isVisibleInTable', 'is_visible_in_table'],
    ['isVisibleInDetail', 'is_visible_in_detail'],
    ['isEditable', 'is_editable'],
  ] as const;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('sectionTitle')}</CardTitle>
        <CardDescription>{t('sectionDescription')}</CardDescription>
      </CardHeader>
      <CardContent>
        <Table data-testid="columns-settings-table">
          <TableHeader>
            <TableRow>
              <TableHead>{t('name')}</TableHead>
              <TableHead>{t('label')}</TableHead>
              {toggles.map(([key]) => (
                <TableHead key={key} className="w-20">
                  {t(`short.${key}`)}
                </TableHead>
              ))}
              <TableHead>{t('formatter')}</TableHead>
              <TableHead className="w-28" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {props.columns.map((column, index) => (
              <TableRow
                key={column.name}
                data-testid={`column-row-${column.name}`}
              >
                <TableCell className="font-mono text-xs">
                  {column.name}
                </TableCell>
                <TableCell>{column.displayName}</TableCell>
                {toggles.map(([key, apiKey]) => (
                  <TableCell key={key}>
                    <Switch
                      aria-label={t(`flags.${key}`)}
                      data-testid={`column-${key}-${column.name}`}
                      checked={column[key]}
                      disabled={busy}
                      onCheckedChange={(checked) =>
                        mutation.mutate({
                          [column.name]: { [apiKey]: checked },
                        })
                      }
                    />
                  </TableCell>
                ))}
                <TableCell className="text-xs">
                  {column.uiDataType
                    ? t(`formatters.${column.uiDataType}`)
                    : t('formatterDefault')}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {([-1, 1] as const).map((direction) => {
                      const next = moveColumn(props.columns, index, direction);
                      const Icon =
                        direction === -1 ? ArrowUpIcon : ArrowDownIcon;

                      return (
                        <Button
                          key={direction}
                          size="icon-sm"
                          variant="ghost"
                          aria-label={t(
                            direction === -1 ? 'moveUp' : 'moveDown',
                          )}
                          disabled={busy || !next}
                          onClick={() => next && mutation.mutate(next)}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </Button>
                      );
                    })}
                    {props.canUpdate ? (
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={t('edit')}
                        data-testid={`column-edit-${column.name}`}
                        onClick={() => setEditing(column.name)}
                      >
                        <PencilIcon className="h-3.5 w-3.5" />
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {editingColumn ? (
          <ColumnSettingsDialog
            key={editingColumn.name}
            column={editingColumn}
            open
            onOpenChange={(open) => (open ? null : setEditing(null))}
            submit={(update) => mutation.mutateAsync(update)}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

function RelationsSettings(props: {
  resource: Ref;
  canUpdate: boolean;
  relations: InlineRelation[];
}) {
  const t = useTranslations('cms.settings.resources.relations');

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {props.relations.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('empty')}</p>
        ) : null}

        {props.relations.map((relation) => (
          <RelationRow
            key={`${relation.target_schema}.${relation.target_table}.${relation.target_column}`}
            resource={props.resource}
            canUpdate={props.canUpdate}
            relation={relation}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function RelationRow(props: {
  resource: Ref;
  canUpdate: boolean;
  relation: InlineRelation;
}) {
  const t = useTranslations('cms.settings.resources.relations');
  const mutation = useUpdateRelationsConfigMutation(props.resource);
  const { relation } = props;
  const id = `${relation.target_schema}.${relation.target_table}.${relation.target_column}`;

  const form = useForm({
    defaultValues: {
      enabled: relation.enabled,
      sectionLabel: relation.sectionLabel,
    },
    onSubmit: async ({ value }) => {
      await mutation.mutateAsync([
        {
          source_column: relation.source_column,
          target_schema: relation.target_schema,
          target_table: relation.target_table,
          target_column: relation.target_column,
          inline_config: {
            enabled: value.enabled,
            section_label: value.sectionLabel.trim() || undefined,
          },
        },
      ]);
    },
  });

  return (
    <form
      data-testid={`relation-row-${id}`}
      className="flex flex-wrap items-end gap-3 border-b pb-3 last:border-0"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit().catch(() => {
          // El aviso de error ya lo muestra la mutación.
        });
      }}
    >
      <div className="min-w-40 flex-1 font-mono text-xs">{id}</div>

      <form.Field name="enabled">
        {(field) => (
          <Field orientation="horizontal" className="w-auto">
            <Switch
              id={`relation-enabled-${id}`}
              checked={field.state.value}
              disabled={!props.canUpdate}
              onCheckedChange={(checked) => field.handleChange(checked)}
            />
            <FieldLabel htmlFor={`relation-enabled-${id}`}>
              {t('enabled')}
            </FieldLabel>
          </Field>
        )}
      </form.Field>

      <form.Field name="sectionLabel">
        {(field) => (
          <Input
            aria-label={t('sectionLabel')}
            placeholder={t('sectionLabel')}
            className="w-56"
            value={field.state.value}
            maxLength={100}
            disabled={!props.canUpdate}
            onChange={(event) => field.handleChange(event.target.value)}
          />
        )}
      </form.Field>

      {props.canUpdate ? (
        <form.Subscribe
          selector={(state) => [state.isDirty, state.isSubmitting] as const}
        >
          {([isDirty, isSubmitting]) => (
            <Button
              type="submit"
              size="sm"
              variant="outline"
              disabled={!isDirty || isSubmitting}
            >
              {t('save')}
            </Button>
          )}
        </form.Subscribe>
      ) : null}
    </form>
  );
}
