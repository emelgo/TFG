/**
 * Comparación de los datos antiguos y nuevos de una entrada de auditoría.
 *
 * La ficha de una entrada muestra, campo a campo, qué había antes y qué hay
 * después del cambio. Se calcula aquí con funciones puras (probadas en
 * `__tests__/audit-logs-utils.test.ts`) para que el componente solo pinte:
 *
 *  - `added`: el campo solo existe en los datos nuevos (por ejemplo, INSERT);
 *  - `removed`: solo en los antiguos (DELETE);
 *  - `changed` / `unchanged`: existe en ambos, con valor distinto o igual.
 *
 * La igualdad es estructural: dos objetos JSON con las mismas claves en otro
 * orden se consideran iguales (PostgreSQL no garantiza el orden en `jsonb`).
 */

export type AuditLogDiffStatus = 'added' | 'removed' | 'changed' | 'unchanged';

export type AuditLogDiffEntry = {
  key: string;
  oldValue: unknown;
  newValue: unknown;
  status: AuditLogDiffStatus;
};

type JsonObject = Record<string, unknown>;

const STATUS_ORDER: Record<AuditLogDiffStatus, number> = {
  changed: 0,
  added: 1,
  removed: 2,
  unchanged: 3,
};

/**
 * Compara los datos antiguos y nuevos de una entrada.
 *
 * @returns Una fila por campo: primero los cambiados, añadidos y quitados, y
 *   al final los que no cambian; dentro de cada grupo, por orden alfabético.
 */
export function buildAuditLogDiff(
  oldData: JsonObject | null | undefined,
  newData: JsonObject | null | undefined,
): AuditLogDiffEntry[] {
  const oldObject = isObject(oldData) ? oldData : null;
  const newObject = isObject(newData) ? newData : null;

  const keys = new Set([
    ...Object.keys(oldObject ?? {}),
    ...Object.keys(newObject ?? {}),
  ]);

  return [...keys]
    .map((key) => {
      const inOld = oldObject !== null && key in oldObject;
      const inNew = newObject !== null && key in newObject;
      const oldValue = inOld ? oldObject[key] : undefined;
      const newValue = inNew ? newObject[key] : undefined;

      let status: AuditLogDiffStatus;

      if (inOld && inNew) {
        status = isSameValue(oldValue, newValue) ? 'unchanged' : 'changed';
      } else {
        status = inNew ? 'added' : 'removed';
      }

      return { key, oldValue, newValue, status };
    })
    .sort(
      (a, b) =>
        STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
        a.key.localeCompare(b.key),
    );
}

/** Cuenta los campos cambiados, añadidos y quitados. */
export function countAuditLogChanges(diff: AuditLogDiffEntry[]) {
  return diff.filter((entry) => entry.status !== 'unchanged').length;
}

/** Valor listo para mostrar en una celda de la comparación. */
export type AuditLogDisplayValue =
  | { kind: 'empty' }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'json'; text: string }
  | { kind: 'text'; text: string; truncated: boolean };

/**
 * Prepara un valor para mostrarlo: `null`/ausente, booleano, JSON con sangría
 * (objetos y listas) o texto recortado a `maxLength` caracteres.
 */
export function toAuditLogDisplayValue(
  value: unknown,
  maxLength = 200,
): AuditLogDisplayValue {
  if (value === null || value === undefined) {
    return { kind: 'empty' };
  }

  if (typeof value === 'boolean') {
    return { kind: 'boolean', value };
  }

  if (typeof value === 'object') {
    return { kind: 'json', text: JSON.stringify(value, null, 2) };
  }

  const text = String(value);

  return text.length > maxLength
    ? { kind: 'text', text: `${text.slice(0, maxLength)}…`, truncated: true }
    : { kind: 'text', text, truncated: false };
}

/** Igualdad estructural de dos valores JSON (sin depender del orden). */
export function isSameValue(a: unknown, b: unknown) {
  return stableStringify(a) === stableStringify(b);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  if (isObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }

  return JSON.stringify(value) ?? 'undefined';
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
