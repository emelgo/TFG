/**
 * Editor de *widgets*: crear, editar o duplicar (F2.8).
 *
 * El usuario elige el tipo (métrica, gráfico o tabla), una de las tablas
 * que puede leer (`/v1/navigation`, ya filtrada por permisos) y, según el
 * tipo, la agregación, las columnas y un filtro opcional. Las columnas salen
 * del metadato de la tabla (`/v1/tables/:schema/:table/metadata`): solo se
 * ofrecen columnas numéricas para sumar o promediar y de fecha para agrupar
 * por día, semana… No hay SQL libre en ningún sitio.
 *
 * El formulario (TanStack Form + `@pymekit/ui/field`) se valida con la misma
 * `WidgetDefinitionSchema` que la API (`toWidgetDefinition`); la API vuelve a
 * comprobar la tabla, las columnas y el permiso de lectura.
 *
 * [TFG] RF-11 · ADR-013.
 */
import { useForm, useStore } from '@tanstack/react-form';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';

import {
  WIDGET_AGGREGATIONS,
  WIDGET_CHART_TYPES,
  WIDGET_FILTER_OPERATORS,
  WIDGET_TYPES,
} from '@pymekit/cms-shared/dashboards';
import { useCmsApi } from '@pymekit/cms-ui-core/api-context';
import {
  getResourceArea,
  getResourceLabel,
  groupByArea,
} from '@pymekit/cms-ui-core/resources';
import { Button } from '@pymekit/ui/button';
import { Checkbox } from '@pymekit/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@pymekit/ui/dialog';
import { Field, FieldError, FieldLabel } from '@pymekit/ui/field';
import { useAsyncDialog } from '@pymekit/ui/hooks/use-async-dialog';
import { Input } from '@pymekit/ui/input';
import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from '@pymekit/ui/native-select';
import { Spinner } from '@pymekit/ui/spinner';

import {
  useCreateWidgetMutation,
  useUpdateWidgetMutation,
} from '../hooks/use-dashboard-mutations';
import { DEFAULT_WIDGET_SIZE, getNextFreeRow } from '../utils/grid-layout';
import {
  type WidgetFormValues,
  getDefaultWidgetFormValues,
  isDateDataType,
  isNumericDataType,
  splitTableKey,
  toWidgetDefinition,
} from '../utils/widget-form';

export function WidgetEditorDialog(props: {
  dashboardId: string;
  /** Si se edita un *widget*, su id; si no, se crea uno nuevo. */
  widgetId?: string;
  initialValues?: WidgetFormValues;
  /** Posiciones actuales, para colocar el nuevo debajo de todo. */
  positions: Array<{ x: number; y: number; w: number; h: number }>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('cms.dashboards.editor');
  const { queries } = useCmsApi();
  const createWidget = useCreateWidgetMutation();
  const updateWidget = useUpdateWidgetMutation();
  const { dialogProps, isPending, setIsPending, setOpen } = useAsyncDialog({
    open: props.open,
    onOpenChange: props.onOpenChange,
  });

  const form = useForm({
    defaultValues: props.initialValues ?? getDefaultWidgetFormValues(),
    validators: {
      onSubmit: ({ value }) =>
        toWidgetDefinition(value) ? undefined : t('invalid'),
    },
    onSubmit: async ({ value }) => {
      const definition = toWidgetDefinition(value);

      if (!definition) {
        return;
      }

      setIsPending(true);

      try {
        if (props.widgetId) {
          await updateWidget.mutateAsync({ id: props.widgetId, definition });
        } else {
          await createWidget.mutateAsync({
            ...definition,
            dashboardId: props.dashboardId,
            position: {
              x: 0,
              y: getNextFreeRow(props.positions),
              ...DEFAULT_WIDGET_SIZE[definition.widgetType],
            },
          });
        }

        setOpen(false);
      } catch {
        // El aviso de error ya lo muestra la mutación.
      } finally {
        setIsPending(false);
      }
    },
  });

  const values = useStore(form.store, (state) => state.values);
  const formErrors = useStore(form.store, (state) => state.errors);
  const source = splitTableKey(values.table);

  const { data: resources = [] } = useQuery({
    ...queries.navigation(),
    enabled: props.open,
  });
  // Tablas agrupadas por área, igual que en la barra lateral. Se incluyen
  // también las ocultas del explorador: un *widget* ya guardado puede usar
  // una y su opción tiene que seguir existiendo.
  const resourceGroups = groupByArea(resources, {
    area: getResourceArea,
    ordering: (resource) => resource.metadata.ordering,
    label: getResourceLabel,
  });
  const { data: metadata, isFetching: isLoadingColumns } = useQuery({
    ...queries.tableMetadata(source?.schemaName ?? '', source?.tableName ?? ''),
    enabled: props.open && source !== null,
  });

  const columns = metadata?.columns ?? [];
  const dataTypeOf = (name: string) =>
    columns.find((column) => column.name === name)?.ui_config?.data_type;
  // SUM/AVG/MIN/MAX solo sobre columnas numéricas; COUNT también sobre `*`.
  const valueColumns =
    values.aggregation === 'COUNT'
      ? columns
      : columns.filter((column) =>
          isNumericDataType(column.ui_config?.data_type),
        );

  return (
    <Dialog {...dialogProps}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-lg"
        data-testid="widget-editor-dialog"
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {t(props.widgetId ? 'editTitle' : 'createTitle')}
            </DialogTitle>
            <DialogDescription>{t('description')}</DialogDescription>
          </DialogHeader>

          <form.Field name="title">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="widget-title">{t('title')}</FieldLabel>
                <Input
                  id="widget-title"
                  data-testid="widget-title-input"
                  maxLength={255}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
              </Field>
            )}
          </form.Field>

          <div className="grid grid-cols-2 gap-3">
            <form.Field name="widgetType">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor="widget-type">{t('type')}</FieldLabel>
                  <NativeSelect
                    id="widget-type"
                    data-testid="widget-type-select"
                    className="w-full"
                    value={field.state.value}
                    onChange={(event) =>
                      field.handleChange(
                        event.target.value as WidgetFormValues['widgetType'],
                      )
                    }
                  >
                    {WIDGET_TYPES.map((type) => (
                      <NativeSelectOption key={type} value={type}>
                        {t(`types.${type}`)}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
              )}
            </form.Field>

            <form.Field
              name="table"
              listeners={{
                // Otra tabla: las columnas elegidas dejan de tener sentido.
                onChange: () => {
                  form.setFieldValue('valueColumn', '*');
                  form.setFieldValue('xAxis', '');
                  form.setFieldValue('columns', []);
                  form.setFieldValue('filterColumn', '');
                },
              }}
            >
              {(field) => (
                <Field>
                  <FieldLabel htmlFor="widget-table">{t('table')}</FieldLabel>
                  <NativeSelect
                    id="widget-table"
                    data-testid="widget-table-select"
                    className="w-full"
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                  >
                    <NativeSelectOption value="">
                      {t('chooseTable')}
                    </NativeSelectOption>
                    {resourceGroups.map((group) => (
                      <NativeSelectOptGroup
                        key={group.name ?? ''}
                        label={group.name ?? t('otherArea')}
                      >
                        {group.items.map((resource) => (
                          <NativeSelectOption
                            key={`${resource.schemaName}.${resource.tableName}`}
                            value={`${resource.schemaName}.${resource.tableName}`}
                          >
                            {getResourceLabel(resource)} ({resource.tableName})
                          </NativeSelectOption>
                        ))}
                      </NativeSelectOptGroup>
                    ))}
                  </NativeSelect>
                </Field>
              )}
            </form.Field>
          </div>

          {source && isLoadingColumns && columns.length === 0 ? (
            <Spinner className="h-4 w-4" />
          ) : null}

          {source && columns.length > 0 ? (
            <>
              {values.widgetType === 'chart' ? (
                <div className="grid grid-cols-2 gap-3">
                  <form.Field name="chartType">
                    {(field) => (
                      <Field>
                        <FieldLabel htmlFor="widget-chart-type">
                          {t('chartType')}
                        </FieldLabel>
                        <NativeSelect
                          id="widget-chart-type"
                          data-testid="widget-chart-type-select"
                          className="w-full"
                          value={field.state.value}
                          onChange={(event) =>
                            field.handleChange(
                              event.target
                                .value as WidgetFormValues['chartType'],
                            )
                          }
                        >
                          {WIDGET_CHART_TYPES.map((type) => (
                            <NativeSelectOption key={type} value={type}>
                              {t(`chartTypes.${type}`)}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </Field>
                    )}
                  </form.Field>

                  <form.Field
                    name="xAxis"
                    listeners={{
                      onChange: ({ value }) => {
                        if (!isDateDataType(dataTypeOf(value))) {
                          form.setFieldValue('timeBucket', '');
                        }
                      },
                    }}
                  >
                    {(field) => (
                      <Field>
                        <FieldLabel htmlFor="widget-x-axis">
                          {t('xAxis')}
                        </FieldLabel>
                        <NativeSelect
                          id="widget-x-axis"
                          data-testid="widget-x-axis-select"
                          className="w-full"
                          value={field.state.value}
                          onChange={(event) =>
                            field.handleChange(event.target.value)
                          }
                        >
                          <NativeSelectOption value="">
                            {t('chooseColumn')}
                          </NativeSelectOption>
                          {columns.map((column) => (
                            <NativeSelectOption
                              key={column.name}
                              value={column.name}
                            >
                              {column.display_name || column.name}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </Field>
                    )}
                  </form.Field>

                  {isDateDataType(dataTypeOf(values.xAxis)) ? (
                    <form.Field name="timeBucket">
                      {(field) => (
                        <Field>
                          <FieldLabel htmlFor="widget-time-bucket">
                            {t('timeBucket')}
                          </FieldLabel>
                          <NativeSelect
                            id="widget-time-bucket"
                            data-testid="widget-time-bucket-select"
                            className="w-full"
                            value={field.state.value}
                            onChange={(event) =>
                              field.handleChange(
                                event.target
                                  .value as WidgetFormValues['timeBucket'],
                              )
                            }
                          >
                            <NativeSelectOption value="">
                              {t('timeBuckets.none')}
                            </NativeSelectOption>
                            {(['day', 'week', 'month', 'year'] as const).map(
                              (bucket) => (
                                <NativeSelectOption key={bucket} value={bucket}>
                                  {t(`timeBuckets.${bucket}`)}
                                </NativeSelectOption>
                              ),
                            )}
                          </NativeSelect>
                        </Field>
                      )}
                    </form.Field>
                  ) : null}
                </div>
              ) : null}

              {values.widgetType !== 'table' ? (
                <div className="grid grid-cols-2 gap-3">
                  <form.Field
                    name="aggregation"
                    listeners={{
                      onChange: ({ value }) => {
                        const current = form.getFieldValue('valueColumn');
                        if (
                          value !== 'COUNT' &&
                          (current === '*' ||
                            !isNumericDataType(dataTypeOf(current)))
                        ) {
                          form.setFieldValue('valueColumn', '');
                        }
                      },
                    }}
                  >
                    {(field) => (
                      <Field>
                        <FieldLabel htmlFor="widget-aggregation">
                          {t('aggregation')}
                        </FieldLabel>
                        <NativeSelect
                          id="widget-aggregation"
                          data-testid="widget-aggregation-select"
                          className="w-full"
                          value={field.state.value}
                          onChange={(event) =>
                            field.handleChange(
                              event.target
                                .value as WidgetFormValues['aggregation'],
                            )
                          }
                        >
                          {WIDGET_AGGREGATIONS.map((aggregation) => (
                            <NativeSelectOption
                              key={aggregation}
                              value={aggregation}
                            >
                              {t(`aggregations.${aggregation}`)}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </Field>
                    )}
                  </form.Field>

                  <form.Field name="valueColumn">
                    {(field) => (
                      <Field>
                        <FieldLabel htmlFor="widget-value-column">
                          {t('valueColumn')}
                        </FieldLabel>
                        <NativeSelect
                          id="widget-value-column"
                          data-testid="widget-value-column-select"
                          className="w-full"
                          value={field.state.value}
                          onChange={(event) =>
                            field.handleChange(event.target.value)
                          }
                        >
                          {values.aggregation === 'COUNT' ? (
                            <NativeSelectOption value="*">
                              {t('allRows')}
                            </NativeSelectOption>
                          ) : (
                            <NativeSelectOption value="">
                              {t('chooseColumn')}
                            </NativeSelectOption>
                          )}
                          {valueColumns.map((column) => (
                            <NativeSelectOption
                              key={column.name}
                              value={column.name}
                            >
                              {column.display_name || column.name}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </Field>
                    )}
                  </form.Field>
                </div>
              ) : (
                <form.Field name="columns">
                  {(field) => (
                    <Field>
                      <FieldLabel>{t('columns')}</FieldLabel>
                      <div className="grid max-h-48 grid-cols-2 gap-2 overflow-y-auto rounded-md border p-2">
                        {columns.map((column) => {
                          const checked = field.state.value.includes(
                            column.name,
                          );

                          return (
                            <label
                              key={column.name}
                              className="flex items-center gap-2 text-sm"
                            >
                              <Checkbox
                                checked={checked}
                                data-testid={`widget-column-${column.name}`}
                                onCheckedChange={(next) =>
                                  field.handleChange(
                                    next
                                      ? [...field.state.value, column.name]
                                      : field.state.value.filter(
                                          (name) => name !== column.name,
                                        ),
                                  )
                                }
                              />
                              {column.display_name || column.name}
                            </label>
                          );
                        })}
                      </div>
                    </Field>
                  )}
                </form.Field>
              )}

              {/* Filtro opcional: columna, operador de la lista cerrada y valor. */}
              <div className="grid grid-cols-3 gap-3">
                <form.Field name="filterColumn">
                  {(field) => (
                    <Field>
                      <FieldLabel htmlFor="widget-filter-column">
                        {t('filter')}
                      </FieldLabel>
                      <NativeSelect
                        id="widget-filter-column"
                        data-testid="widget-filter-column-select"
                        className="w-full"
                        value={field.state.value}
                        onChange={(event) =>
                          field.handleChange(event.target.value)
                        }
                      >
                        <NativeSelectOption value="">
                          {t('noFilter')}
                        </NativeSelectOption>
                        {columns.map((column) => (
                          <NativeSelectOption
                            key={column.name}
                            value={column.name}
                          >
                            {column.display_name || column.name}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </Field>
                  )}
                </form.Field>

                {values.filterColumn ? (
                  <>
                    <form.Field name="filterOperator">
                      {(field) => (
                        <Field>
                          <FieldLabel htmlFor="widget-filter-operator">
                            {t('operator')}
                          </FieldLabel>
                          <NativeSelect
                            id="widget-filter-operator"
                            data-testid="widget-filter-operator-select"
                            className="w-full"
                            value={field.state.value}
                            onChange={(event) =>
                              field.handleChange(
                                event.target
                                  .value as WidgetFormValues['filterOperator'],
                              )
                            }
                          >
                            {WIDGET_FILTER_OPERATORS.map((operator) => (
                              <NativeSelectOption
                                key={operator}
                                value={operator}
                              >
                                {t(`operators.${operator}`)}
                              </NativeSelectOption>
                            ))}
                          </NativeSelect>
                        </Field>
                      )}
                    </form.Field>

                    {values.filterOperator !== 'isNull' &&
                    values.filterOperator !== 'notNull' ? (
                      <form.Field name="filterValue">
                        {(field) => (
                          <Field>
                            <FieldLabel htmlFor="widget-filter-value">
                              {t('value')}
                            </FieldLabel>
                            <Input
                              id="widget-filter-value"
                              data-testid="widget-filter-value-input"
                              maxLength={200}
                              value={field.state.value}
                              onChange={(event) =>
                                field.handleChange(event.target.value)
                              }
                            />
                          </Field>
                        )}
                      </form.Field>
                    ) : null}
                  </>
                ) : null}
              </div>
            </>
          ) : null}

          <FieldError
            errors={formErrors
              .filter(Boolean)
              .map((error) => ({ message: String(error) }))}
          />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => setOpen(false)}
            >
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              data-testid="widget-editor-submit"
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
