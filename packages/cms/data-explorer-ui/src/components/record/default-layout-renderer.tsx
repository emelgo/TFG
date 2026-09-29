/**
 * Distribución por defecto de la ficha de un registro.
 *
 * Se usa cuando la tabla no tiene una distribución guardada (o la guardada
 * no tiene campos visibles). Reparte las columnas visibles en la ficha en
 * tres tarjetas —datos, relaciones y sistema— con
 * `groupColumnsForDefaultLayout` (ver `utils/record-layout.ts`).
 */
import { useMemo } from 'react';

import { useTranslations } from 'use-intl';

import type { ColumnMetadata, RelationConfig } from '@pymekit/cms-types';
import { Heading } from '@pymekit/ui/heading';

import { groupColumnsForDefaultLayout } from '../../utils/record-layout';
import {
  type ForeignKeyRecord,
  getForeignKeyLink,
} from '../../utils/record-relations';
import { RecordField } from './record-field';

export function DefaultLayoutRenderer(props: {
  columns: ColumnMetadata[];
  relationsConfig: RelationConfig[];
  data: Record<string, unknown>;
  foreignKeyRecords: ForeignKeyRecord[];
}) {
  const t = useTranslations('cms.dataExplorer');
  const { columns, relationsConfig, data, foreignKeyRecords } = props;

  const groups = useMemo(
    () => groupColumnsForDefaultLayout(columns, relationsConfig),
    [columns, relationsConfig],
  );

  return (
    <div className="flex flex-col gap-y-2" data-testid="record-default-layout">
      {groups.map((group) => (
        <section
          key={group.key}
          className="bg-background rounded-md border px-4 pt-4"
          data-testid="record-field-group"
          data-group={group.key}
        >
          <div className="border-b pb-3">
            <Heading
              level={6}
              className="text-muted-foreground text-xs font-medium uppercase"
            >
              {t(`record.groups.${group.key}`)}
            </Heading>
          </div>

          {group.columns.map((column) => (
            <RecordField
              key={column.name}
              column={column}
              value={data[column.name]}
              foreignKey={getForeignKeyLink(
                foreignKeyRecords,
                column.name,
                data[column.name],
              )}
            />
          ))}
        </section>
      ))}
    </div>
  );
}
