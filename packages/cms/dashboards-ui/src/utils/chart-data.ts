/**
 * Datos de los *widgets* listos para pintar (F2.8).
 *
 * La API devuelve filas agregadas: `{ value }` en una métrica y
 * `{ <eje X> | time_bucket, value }` en un gráfico. Estas funciones puras las
 * convierten en lo que esperan los componentes (un número o una serie de
 * puntos `{ label, value }` para Recharts), sin depender de React.
 *
 * [TFG] RF-11.
 */

/** Máximo de puntos que se pintan en un gráfico (el resto se descarta). */
export const MAX_CHART_POINTS = 50;

export type ChartPoint = { label: string; value: number };

function toNumber(value: unknown) {
  const number = typeof value === 'number' ? value : Number(value);

  return Number.isFinite(number) ? number : 0;
}

/** Valor de una métrica (la primera fila, columna `value`), o `null`. */
export function getMetricValue(rows: Array<Record<string, unknown>>) {
  const value = rows[0]?.['value'];

  if (value === null || value === undefined) {
    return null;
  }

  return toNumber(value);
}

/** Etiqueta de una fecha según la unidad (día, semana, mes, año). */
export function formatBucketLabel(value: unknown, bucket: string | undefined) {
  const date = new Date(String(value));

  if (Number.isNaN(date.getTime())) {
    return String(value ?? '');
  }

  const iso = date.toISOString();

  if (bucket === 'year') return iso.slice(0, 4);
  if (bucket === 'month') return iso.slice(0, 7);

  return iso.slice(0, 10);
}

/**
 * Serie de un gráfico. Con agrupación por fecha la etiqueta sale de
 * `time_bucket` y los puntos se ordenan cronológicamente; si no, del eje X.
 * Los nulos se muestran como «—».
 */
export function toChartPoints(
  rows: Array<Record<string, unknown>>,
  config: { xAxis?: string; timeAggregation?: string },
): ChartPoint[] {
  const byTime = Boolean(config.timeAggregation);
  const labelKey = byTime ? 'time_bucket' : (config.xAxis ?? '');

  const points = rows.map((row) => {
    const raw = row[labelKey];

    return {
      sortKey: byTime ? new Date(String(raw)).getTime() : 0,
      label:
        raw === null || raw === undefined
          ? '—'
          : byTime
            ? formatBucketLabel(raw, config.timeAggregation)
            : String(raw),
      value: toNumber(row['value']),
    };
  });

  if (byTime) {
    points.sort((a, b) => a.sortKey - b.sortKey);
  }

  return points
    .slice(0, MAX_CHART_POINTS)
    .map(({ label, value }) => ({ label, value }));
}
