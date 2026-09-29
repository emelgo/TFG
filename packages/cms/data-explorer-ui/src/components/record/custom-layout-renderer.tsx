/**
 * Distribución guardada de la ficha de un registro.
 *
 * Pinta la distribución que se configura en los ajustes de la tabla
 * (`ui_config.recordLayout.display`): grupos con título, filas y campos de
 * ancho 1–4 (cuartos de la fila). Los campos que ya no existen o que están
 * ocultos en la ficha se saltan, y los grupos marcados como plegados no se
 * muestran. Solo se usa si `getCustomRecordLayout` ha comprobado que tiene
 * algún campo visible.
 */
import { useMemo } from 'react';

import type { ColumnMetadata, RecordLayoutConfig } from '@pymekit/cms-types';
import { Heading } from '@pymekit/ui/heading';

import { getLayoutColumnFlexBasis } from '../../utils/record-layout';
import {
  type ForeignKeyRecord,
  getForeignKeyLink,
} from '../../utils/record-relations';
import { RecordField } from './record-field';

export function CustomLayoutRenderer(props: {
  layout: RecordLayoutConfig;
  columns: ColumnMetadata[];
  data: Record<string, unknown>;
  foreignKeyRecords: ForeignKeyRecord[];
}) {
  const { layout, columns, data, foreignKeyRecords } = props;

  const columnMap = useMemo(
    () => new Map(columns.map((column) => [column.name, column])),
    [columns],
  );

  return (
    <div className="flex flex-col gap-y-2" data-testid="record-custom-layout">
      {layout.display
        .filter((group) => !group.isCollapsed)
        .map((group) => (
          <section
            key={group.id}
            className="bg-background rounded-md border px-4 pt-4"
            data-testid="record-field-group"
            data-group={group.id}
          >
            <div className="border-b pb-3">
              <Heading
                level={6}
                className="text-muted-foreground text-xs font-medium uppercase"
              >
                {group.label}
              </Heading>
            </div>

            {(group.rows ?? []).map((row) => (
              <div
                key={row.id}
                className="flex gap-4 border-b border-dashed last:border-b-transparent"
              >
                {(row.columns ?? []).map((layoutColumn) => {
                  const column = columnMap.get(layoutColumn.fieldName);

                  if (!column || !column.is_visible_in_detail) {
                    return null;
                  }

                  return (
                    <div
                      key={layoutColumn.id}
                      className="min-w-0"
                      style={{
                        flexBasis: getLayoutColumnFlexBasis(layoutColumn.size),
                      }}
                    >
                      <RecordField
                        column={column}
                        value={data[column.name]}
                        foreignKey={getForeignKeyLink(
                          foreignKeyRecords,
                          column.name,
                          data[column.name],
                        )}
                      />
                    </div>
                  );
                })}
              </div>
            ))}
          </section>
        ))}
    </div>
  );
}
