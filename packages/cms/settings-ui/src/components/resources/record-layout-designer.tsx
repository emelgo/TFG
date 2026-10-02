/**
 * Diseñador de la ficha de un registro (F2.7c,
 * `/admin/cms/settings/resources/$schema/$table/layout`).
 *
 * Permite organizar en grupos y filas los campos que muestra la ficha
 * (`display`) y el formulario de edición (`edit`) de una tabla, y guardar
 * el resultado en `ui_config.recordLayout`, que usan `RecordView` y el
 * formulario del explorador (F2.4b/F2.4c).
 *
 * **Arrastrar y soltar con la API nativa de HTML5** (`draggable`,
 * `onDragStart`/`onDrop`): el catálogo de dependencias del monorepo no
 * incluye ninguna biblioteca de *drag and drop* y el gesto que se necesita
 * es sencillo (soltar un campo en una fila). Como alternativa accesible con
 * teclado, pulsar un campo disponible lo añade a la última fila con hueco, y
 * cada campo tiene su selector de ancho y su botón de quitar. Toda la lógica
 * (capacidad de las filas, mover, quitar…) está en
 * `utils/layout-designer.ts`, con tests.
 *
 * [TFG] RF-09 · ADR-013.
 */
import { useState } from 'react';

import { Link } from '@tanstack/react-router';
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowUpIcon,
  GripVerticalIcon,
  PlusIcon,
  RotateCcwIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react';
import { useTranslations } from 'use-intl';

import type { LayoutGroup, RecordLayoutConfig } from '@pymekit/cms-types';
import type { CmsResourceSettings } from '@pymekit/cms-ui-core/api';
import { useIsHydrated } from '@pymekit/cms-ui-core/hydration';
import { Button } from '@pymekit/ui/button';
import { Input } from '@pymekit/ui/input';
import { NativeSelect, NativeSelectOption } from '@pymekit/ui/native-select';
import { Spinner } from '@pymekit/ui/spinner';
import { Tabs, TabsList, TabsTrigger } from '@pymekit/ui/tabs';
import { cn } from '@pymekit/ui/utils';

import { useSaveRecordLayoutMutation } from '../../hooks/use-resource-settings-mutations';
import {
  type DesignerColumn,
  type FieldSize,
  type FieldTarget,
  type LayoutMode,
  ROW_CAPACITY,
  addGroup,
  addRow,
  createDefaultRecordLayout,
  getUnplacedFields,
  moveField,
  moveGroup,
  placeField,
  prepareLayoutForSave,
  readRecordLayout,
  removeField,
  removeGroup,
  removeRow,
  renameGroup,
  rowUsedSize,
  setFieldSize,
} from '../../utils/layout-designer';
import { readColumnsSettings } from '../../utils/resource-settings';

/** Lo que viaja en `dataTransfer` al arrastrar. */
type DragPayload =
  | { kind: 'palette'; fieldName: string }
  | { kind: 'field'; fieldId: string };

const DRAG_TYPE = 'application/x-cms-layout-field';

function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function readDrag(event: React.DragEvent): DragPayload | null {
  try {
    return JSON.parse(event.dataTransfer.getData(DRAG_TYPE)) as DragPayload;
  } catch {
    return null;
  }
}

export function RecordLayoutDesigner(props: {
  data: CmsResourceSettings;
  schema: string;
  table: string;
}) {
  const t = useTranslations('cms.settings.resources.layout');
  const hydrated = useIsHydrated();
  const ref = { schema: props.schema, table: props.table };
  const mutation = useSaveRecordLayoutMutation(ref);
  const canUpdate = props.data.permissions.canUpdate;

  const settings = readColumnsSettings(props.data.data.columnsConfig);
  const columns: DesignerColumn[] = settings.map((column) => ({
    name: column.name,
    isVisibleInDetail: column.isVisibleInDetail,
    isEditable: column.isEditable,
  }));
  const labels = new Map(
    settings.map((column) => [column.name, column.displayName || column.name]),
  );

  const defaults = { layout: t('defaultName'), group: t('defaultGroup') };
  const saved = readRecordLayout(props.data.data.uiConfig, columns);

  const [state, setState] = useState<{
    mode: LayoutMode;
    layout: RecordLayoutConfig;
  }>(() => ({
    mode: 'display',
    layout: saved ?? createDefaultRecordLayout(columns, defaults),
  }));

  const groups = state.layout[state.mode];
  const unplaced = getUnplacedFields(groups, columns, state.mode);

  /** Aplica una operación al modo actual; `null` significa «no cabe». */
  const update = (next: LayoutGroup[] | null) => {
    if (!next) return;

    setState((current) => ({
      ...current,
      layout: { ...current.layout, [current.mode]: next },
    }));
  };

  const dropOn = (event: React.DragEvent, target: FieldTarget) => {
    event.preventDefault();
    event.stopPropagation();

    const payload = readDrag(event);

    if (payload?.kind === 'palette') {
      update(placeField(groups, payload.fieldName, target, newId('field')));
    } else if (payload?.kind === 'field') {
      update(moveField(groups, payload.fieldId, target));
    }
  };

  /** Alternativa al arrastre: añade el campo a la última fila con hueco. */
  const appendField = (fieldName: string) => {
    let current = groups.length
      ? groups
      : addGroup(
          [],
          { groupId: newId('group'), rowId: newId('row') },
          defaults.group,
        );
    const group = current[current.length - 1]!;
    let row = [...group.rows]
      .reverse()
      .find(
        (candidate) =>
          candidate.columns.length < ROW_CAPACITY &&
          rowUsedSize(candidate) < ROW_CAPACITY,
      );

    if (!row) {
      const rowId = newId('row');
      current = addRow(current, group.id, rowId);
      row = { id: rowId, columns: [] };
    }

    update(
      placeField(
        current,
        fieldName,
        { groupId: group.id, rowId: row.id },
        newId('field'),
      ),
    );
  };

  const save = (layout: RecordLayoutConfig | null) =>
    mutation.mutate(layout ? prepareLayoutForSave(layout) : null, {
      onSuccess: () => {
        if (!layout) {
          setState((current) => ({
            ...current,
            layout: createDefaultRecordLayout(columns, defaults),
          }));
        }
      },
    });

  return (
    <div
      className="flex flex-col gap-4"
      data-testid="record-layout-designer"
      data-hydrated={hydrated}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link
            to="/admin/cms/settings/resources/$schema/$table"
            params={ref}
            aria-label={t('back')}
            className="hover:bg-muted inline-flex size-8 items-center justify-center rounded-md"
          >
            <ArrowLeftIcon className="h-4 w-4" />
          </Link>
          <h1 className="text-sm font-medium">
            {t('title')}{' '}
            <span className="text-muted-foreground font-mono text-xs">
              {props.schema}.{props.table}
            </span>
          </h1>
        </div>

        {canUpdate ? (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              data-testid="layout-reset"
              disabled={mutation.isPending || !saved}
              onClick={() => save(null)}
            >
              <RotateCcwIcon className="h-3.5 w-3.5" />
              {t('reset')}
            </Button>
            <Button
              size="sm"
              data-testid="layout-save"
              disabled={mutation.isPending}
              onClick={() => save(state.layout)}
            >
              {mutation.isPending ? <Spinner className="h-3.5 w-3.5" /> : null}
              {t('save')}
            </Button>
          </div>
        ) : null}
      </div>

      <p className="text-muted-foreground text-xs">
        {saved ? t('descriptionSaved') : t('descriptionDefault')}
      </p>

      <Tabs
        value={state.mode}
        onValueChange={(mode) =>
          setState((current) => ({ ...current, mode: mode as LayoutMode }))
        }
      >
        <TabsList variant="line">
          {(['display', 'edit'] as const).map((mode) => (
            <TabsTrigger
              key={mode}
              value={mode}
              data-testid={`layout-mode-${mode}`}
            >
              {t(`modes.${mode}`)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="flex flex-col gap-4 lg:flex-row">
        <aside
          className="flex flex-col gap-2 lg:w-56"
          data-testid="layout-palette"
        >
          <h2 className="text-muted-foreground text-xs font-medium uppercase">
            {t('available')}
          </h2>

          {unplaced.length === 0 ? (
            <p className="text-muted-foreground text-xs">{t('allPlaced')}</p>
          ) : null}

          {unplaced.map((column) => (
            <button
              key={column.name}
              type="button"
              draggable={canUpdate}
              disabled={!canUpdate}
              data-testid={`layout-palette-${column.name}`}
              title={t('paletteHint')}
              className="hover:bg-muted flex items-center gap-2 rounded-md border px-2 py-1.5 text-left text-sm"
              onDragStart={(event) =>
                event.dataTransfer.setData(
                  DRAG_TYPE,
                  JSON.stringify({ kind: 'palette', fieldName: column.name }),
                )
              }
              onClick={() => appendField(column.name)}
            >
              <GripVerticalIcon className="text-muted-foreground h-3.5 w-3.5" />
              {labels.get(column.name)}
            </button>
          ))}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {groups.map((group, groupIndex) => (
            <section
              key={group.id}
              className="flex flex-col gap-2 rounded-lg border p-3"
              data-testid={`layout-group-${groupIndex}`}
            >
              <div className="flex items-center gap-2">
                <Input
                  aria-label={t('groupLabel')}
                  data-testid={`layout-group-label-${groupIndex}`}
                  className="h-8 max-w-xs"
                  value={group.label}
                  maxLength={100}
                  disabled={!canUpdate}
                  onChange={(event) =>
                    update(renameGroup(groups, group.id, event.target.value))
                  }
                />
                <div className="ml-auto flex gap-1">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={t('moveUp')}
                    disabled={!canUpdate || groupIndex === 0}
                    onClick={() => update(moveGroup(groups, group.id, -1))}
                  >
                    <ArrowUpIcon className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={t('moveDown')}
                    disabled={!canUpdate || groupIndex === groups.length - 1}
                    onClick={() => update(moveGroup(groups, group.id, 1))}
                  >
                    <ArrowDownIcon className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={t('removeGroup')}
                    disabled={!canUpdate}
                    onClick={() => update(removeGroup(groups, group.id))}
                  >
                    <Trash2Icon className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {group.rows.map((row, rowIndex) => (
                <div
                  key={row.id}
                  data-testid={`layout-row-${groupIndex}-${rowIndex}`}
                  className={cn(
                    'bg-muted/30 flex min-h-12 items-stretch gap-2 rounded-md border border-dashed p-2',
                  )}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) =>
                    dropOn(event, { groupId: group.id, rowId: row.id })
                  }
                >
                  {row.columns.map((field, fieldIndex) => (
                    <div
                      key={field.id}
                      draggable={canUpdate}
                      data-testid={`layout-field-${field.fieldName}`}
                      style={{
                        flexBasis: `${(field.size / ROW_CAPACITY) * 100}%`,
                      }}
                      className="bg-background flex min-w-0 items-center gap-1 rounded-md border px-2 py-1 text-sm"
                      onDragStart={(event) => {
                        event.stopPropagation();
                        event.dataTransfer.setData(
                          DRAG_TYPE,
                          JSON.stringify({ kind: 'field', fieldId: field.id }),
                        );
                      }}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) =>
                        dropOn(event, {
                          groupId: group.id,
                          rowId: row.id,
                          index: fieldIndex,
                        })
                      }
                    >
                      <GripVerticalIcon className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">
                        {labels.get(field.fieldName) ?? field.fieldName}
                      </span>
                      <NativeSelect
                        aria-label={t('size')}
                        size="sm"
                        className="ml-auto w-16"
                        value={String(field.size)}
                        disabled={!canUpdate}
                        onChange={(event) =>
                          update(
                            setFieldSize(
                              groups,
                              field.id,
                              Number(event.target.value) as FieldSize,
                            ),
                          )
                        }
                      >
                        {[1, 2, 3, 4].map((size) => (
                          <NativeSelectOption key={size} value={String(size)}>
                            {size}/4
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        aria-label={t('removeField')}
                        data-testid={`layout-remove-${field.fieldName}`}
                        disabled={!canUpdate}
                        onClick={() => update(removeField(groups, field.id))}
                      >
                        <XIcon className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}

                  {row.columns.length === 0 ? (
                    <span className="text-muted-foreground self-center text-xs">
                      {t('dropHere')}
                    </span>
                  ) : null}

                  <Button
                    size="icon-xs"
                    variant="ghost"
                    className="ml-auto self-center"
                    aria-label={t('removeRow')}
                    disabled={!canUpdate}
                    onClick={() => update(removeRow(groups, group.id, row.id))}
                  >
                    <Trash2Icon className="h-3 w-3" />
                  </Button>
                </div>
              ))}

              <div>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!canUpdate}
                  data-testid={`layout-add-row-${groupIndex}`}
                  onClick={() => update(addRow(groups, group.id, newId('row')))}
                >
                  <PlusIcon className="h-3.5 w-3.5" />
                  {t('addRow')}
                </Button>
              </div>
            </section>
          ))}

          <div>
            <Button
              size="sm"
              variant="outline"
              disabled={!canUpdate}
              data-testid="layout-add-group"
              onClick={() =>
                update(
                  addGroup(
                    groups,
                    { groupId: newId('group'), rowId: newId('row') },
                    t('newGroup'),
                  ),
                )
              }
            >
              <PlusIcon className="h-3.5 w-3.5" />
              {t('addGroup')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
