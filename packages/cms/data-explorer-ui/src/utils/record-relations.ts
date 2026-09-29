/**
 * Relaciones de la ficha de un registro, en las dos direcciones.
 *
 *  - **Hacia fuera (muchos a uno):** las claves foráneas del registro. La
 *    API devuelve en `foreignKeyRecords` la fila a la que apunta cada una,
 *    pero solo si el usuario puede leer la tabla destino (la base de datos lo
 *    comprueba al leerla). Con ella se muestra su etiqueta y un enlace a su
 *    ficha; si no está, el campo muestra el valor tal cual, sin enlace.
 *  - **Hacia dentro (uno a muchos y muchos a muchos):** las filas de otras
 *    tablas que apuntan a este registro, directamente o a través de una
 *    tabla intermedia. Se muestran en secciones que piden al listado de la
 *    tabla destino las filas filtradas por la clave.
 *
 * Solo se muestran relaciones con tablas que el usuario puede leer (las de
 * `GET /v1/navigation`): una sección que siempre respondería 403 no aporta
 * nada y revelaría la existencia de la tabla. La API vuelve a comprobar el
 * permiso en cada petición; esto solo evita pedir lo que se va a rechazar.
 *
 * [TFG] RF-09: navegación entre registros relacionados con permisos del RBAC.
 */
import {
  deriveM2MRelations,
  getLookupRelations,
  getOneToManyRelations,
  getRelationKey,
  toJunctionMetadata,
} from '@pymekit/cms-data-explorer-core/utils';
import { formatRecord } from '@pymekit/cms-formatters';
import type {
  JunctionMetadata,
  M2MRelationConfig,
  RelationConfig,
} from '@pymekit/cms-types';

import { buildResourceUrl } from './build-resource-url';
import { toTableKeysConfig } from './record-keys';

type RecordData = Record<string, unknown>;

/** Fila a la que apunta una clave foránea, tal como la devuelve la API. */
export type ForeignKeyRecord = {
  /** Columna de la clave foránea en el registro que se está viendo. */
  column: string;
  data: RecordData;
  metadata: {
    table: {
      schemaName: string;
      tableName: string;
      displayFormat: string | null;
      uiConfig: unknown;
    };
  };
};

/** Metadato de las tablas intermedias legibles (`junctionMetadataMap`). */
export type JunctionMetadataMap = Record<
  string,
  { ui_config?: unknown; relations_config?: unknown }
>;

/** Columnas que se prueban, en orden, para nombrar un registro sin formato. */
const DISPLAY_FALLBACK_COLUMNS = [
  'name',
  'title',
  'display_name',
  'label',
  'subject',
  'email',
  'slug',
  'description',
];

/** Clave `esquema.tabla` con la que se comparan tablas. */
export function toTableKey(schema: string, table: string) {
  return `${schema}.${table}`;
}

/** Conjunto de tablas legibles a partir de `GET /v1/navigation`. */
export function getReadableTableKeys(
  resources: Array<{ schemaName: string; tableName: string }>,
) {
  return new Set(
    resources.map((resource) =>
      toTableKey(resource.schemaName, resource.tableName),
    ),
  );
}

/**
 * Nombre legible de un registro: el formato de la tabla
 * (`display_format`, por ejemplo `{name} ({email})`) si lo tiene y produce
 * texto; si no, la primera columna habitual con valor (`name`, `title`…) y,
 * en último caso, la clave. Devuelve `''` si no hay nada que mostrar.
 */
export function getRecordDisplayName(
  displayFormat: string | null | undefined,
  data: RecordData,
  fallbackKey?: unknown,
) {
  if (displayFormat) {
    const formatted = formatRecord(displayFormat, data)?.trim();

    if (formatted) {
      return formatted;
    }
  }

  for (const column of DISPLAY_FALLBACK_COLUMNS) {
    const value = data[column];

    if (typeof value === 'string' && value.trim() !== '') {
      return value;
    }
  }

  const key = fallbackKey ?? data['id'];

  return key === null || key === undefined ? '' : String(key);
}

/** Fila relacionada de una clave foránea del registro, si es legible. */
export function findForeignKeyRecord(
  records: ForeignKeyRecord[],
  column: string,
) {
  return records.find((record) => record.column === column);
}

/**
 * Etiqueta y enlace de una clave foránea: la etiqueta de la fila destino
 * (con su formato) y la URL de su ficha. Sin fila legible devuelve `null` y
 * el campo se muestra sin enlace.
 */
export function getForeignKeyLink(
  records: ForeignKeyRecord[],
  column: string,
  value: unknown,
) {
  const record = findForeignKeyRecord(records, column);

  if (!record) {
    return null;
  }

  const { schemaName, tableName, displayFormat, uiConfig } =
    record.metadata.table;

  return {
    label: getRecordDisplayName(displayFormat, record.data, value),
    href: buildResourceUrl({
      schema: schemaName,
      table: tableName,
      record: record.data,
      tableMetadata: toTableKeysConfig(uiConfig),
    }),
  };
}

/** Normaliza el valor de una clave a texto o número; `null` si no sirve. */
export function normalizeRecordId(value: unknown): string | number | null {
  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (typeof value === 'number' || typeof value === 'string') {
    return value;
  }

  return null;
}

/**
 * Filtro del listado de la tabla hija para una relación uno a muchos:
 * `{ "<columna destino>.eq": "<valor de la columna origen>" }`, o `null` si
 * el registro no tiene valor en la columna origen (o es compuesto).
 */
export function buildOneToManyFilters(
  relation: RelationConfig,
  record: RecordData,
) {
  const value = normalizeRecordId(record[relation.source_column]);

  if (value === null) {
    return null;
  }

  return { [`${relation.target_column}.eq`]: String(value) };
}

/**
 * Filtro del listado de la tabla intermedia de una relación muchos a muchos
 * (las filas que apuntan a este registro), o `null` si no hay valor.
 */
export function buildJunctionFilters(
  relation: M2MRelationConfig,
  record: RecordData,
) {
  const value = normalizeRecordId(record[relation.sourceColumn]);

  if (value === null) {
    return null;
  }

  return { [`${relation.junctionSourceColumn}.eq`]: String(value) };
}

/**
 * Filtro del listado de la tabla destino de una relación muchos a muchos:
 * las filas cuyas claves aparecen en la tabla intermedia. El valor va como
 * array JSON, que el servidor interpreta para el operador `in`.
 */
export function buildM2MTargetFilters(
  relation: M2MRelationConfig,
  ids: Array<string | number>,
) {
  return { [`${relation.targetColumn}.in`]: JSON.stringify(ids) };
}

/**
 * Relaciones que apuntan al registro y que se muestran en la ficha:
 *
 *  - **M2M**: se deducen de las uno a muchos cuya tabla destino es una tabla
 *    intermedia (dos claves foráneas que forman su clave). Solo si el usuario
 *    puede leer la tabla intermedia (la API solo devuelve su metadato en ese
 *    caso) y la tabla del otro extremo.
 *  - **O2M**: el resto de uno a muchos hacia tablas legibles, salvo las que
 *    se han desactivado en los ajustes (`inline_config.enabled = false`) y
 *    las tablas intermedias ya representadas como M2M.
 */
export function getVisibleRelatedRelations(params: {
  schema: string;
  table: string;
  relationsConfig: unknown;
  junctionMetadataMap: JunctionMetadataMap | undefined;
  readableTables: Set<string>;
}) {
  const { schema, table, relationsConfig, readableTables } = params;
  const oneToMany = getOneToManyRelations(relationsConfig);

  const junctionRelations = new Map<string, RelationConfig[]>();
  const junctionMetadata = new Map<string, JunctionMetadata>();

  for (const [key, meta] of Object.entries(params.junctionMetadataMap ?? {})) {
    const lookups = getLookupRelations(meta.relations_config);

    if (lookups.length > 0) {
      junctionRelations.set(key, lookups);
    }

    junctionMetadata.set(
      key,
      toJunctionMetadata(meta as Parameters<typeof toJunctionMetadata>[0]),
    );
  }

  const manyToMany = deriveM2MRelations(
    schema,
    table,
    oneToMany,
    junctionRelations,
    junctionMetadata,
  ).filter(
    (relation) =>
      readableTables.has(
        toTableKey(relation.junctionSchema, relation.junctionTable),
      ) &&
      readableTables.has(
        toTableKey(relation.targetSchema, relation.targetTable),
      ),
  );

  const junctionKeys = new Set(
    manyToMany.map((relation) =>
      toTableKey(relation.junctionSchema, relation.junctionTable),
    ),
  );

  const oneToManyVisible = oneToMany.filter((relation) => {
    const key = toTableKey(relation.target_schema, relation.target_table);

    return (
      relation.inline_config?.enabled !== false &&
      readableTables.has(key) &&
      !junctionKeys.has(key)
    );
  });

  return { oneToMany: oneToManyVisible, manyToMany };
}

export { getRelationKey };
