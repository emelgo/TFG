/**
 * Contenido de un *widget*: pide sus datos y los pinta como métrica,
 * gráfico (líneas, barras o sectores con `@pymekit/ui/chart`, sobre
 * Recharts) o tabla (F2.8).
 *
 * Cada *widget* pide sus datos por separado (`queries.widgetData`), así que
 * uno lento o fallido no bloquea al resto. Si la API responde
 * `DASHBOARD_WIDGET_NO_ACCESS` (quien mira el panel no puede leer la tabla
 * del *widget*) se muestra «sin acceso» en lugar de un error: el panel
 * compartido sigue siendo útil sin filtrar ningún dato.
 *
 * [TFG] RF-11 · ADR-013.
 */
import { useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from 'recharts';
import { useTranslations } from 'use-intl';

import { useNumberFormatter } from '@pymekit/cms-formatters/hooks';
import type { WidgetType } from '@pymekit/cms-shared/dashboards';
import { useCmsApi } from '@pymekit/cms-ui-core/api-context';
import { Button } from '@pymekit/ui/button';
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@pymekit/ui/chart';
import { Skeleton } from '@pymekit/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@pymekit/ui/table';

import { getMetricValue, toChartPoints } from '../utils/chart-data';
import { isWidgetNoAccessError } from '../utils/dashboard-errors';

/** Lo que necesita el contenido de un *widget* guardado. */
export type WidgetContentProps = {
  id: string;
  widgetType: WidgetType;
  config: Record<string, unknown>;
};

const PIE_COLORS = [1, 2, 3, 4, 5].map((n) => `var(--chart-${n})`);

export function WidgetContent(props: WidgetContentProps) {
  const t = useTranslations('cms.dashboards.widget');
  const { queries } = useCmsApi();
  const [page, setPage] = useState(1);
  const { data, error, isLoading } = useQuery(
    queries.widgetData(props.id, page),
  );

  if (isLoading) {
    return <Skeleton className="h-full min-h-16 w-full" />;
  }

  if (error) {
    return isWidgetNoAccessError(error) ? (
      <div
        className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 text-center text-sm"
        data-testid="widget-no-access"
      >
        <Lock className="h-5 w-5" />
        {t('noAccess')}
      </div>
    ) : (
      <div
        className="text-destructive flex h-full items-center justify-center text-sm"
        data-testid="widget-error"
      >
        {t('loadError')}
      </div>
    );
  }

  const rows = data?.data.rows ?? [];

  switch (props.widgetType) {
    case 'metric':
      return <MetricContent rows={rows} config={props.config} />;
    case 'chart':
      return <ChartContent rows={rows} config={props.config} />;
    case 'table':
      return (
        <TableContent
          rows={rows}
          config={props.config}
          page={page}
          totalCount={data?.data.totalCount ?? 0}
          onPageChange={setPage}
        />
      );
  }
}

type ContentProps = {
  rows: Array<Record<string, unknown>>;
  config: Record<string, unknown>;
};

function MetricContent(props: ContentProps) {
  const t = useTranslations('cms.dashboards.widget');
  const { formatNumber, formatCurrency, formatPercentage } =
    useNumberFormatter();
  const value = getMetricValue(props.rows);
  const format = props.config['format'];
  const text = (key: string) =>
    typeof props.config[key] === 'string' ? (props.config[key] as string) : '';

  const formatted =
    value === null
      ? '—'
      : format === 'currency'
        ? formatCurrency(value)
        : format === 'percentage'
          ? formatPercentage(value)
          : formatNumber(value, {
              maximumFractionDigits: format === 'decimal' ? 2 : 0,
            });

  return (
    <div className="flex h-full flex-col justify-center">
      <span
        className="text-3xl font-semibold tabular-nums"
        data-testid="widget-metric-value"
      >
        {text('prefix')}
        {formatted}
        {text('suffix')}
      </span>
      <span className="text-muted-foreground text-xs">
        {t(`aggregation.${String(props.config['aggregation'] ?? 'COUNT')}`)}
      </span>
    </div>
  );
}

function ChartContent(props: ContentProps) {
  const t = useTranslations('cms.dashboards.widget');
  const points = toChartPoints(props.rows, {
    xAxis: props.config['xAxis'] as string | undefined,
    timeAggregation: props.config['timeAggregation'] as string | undefined,
  });
  const chartConfig = {
    value: { label: t('value'), color: 'var(--chart-1)' },
  } satisfies ChartConfig;

  if (points.length === 0) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
        {t('noData')}
      </div>
    );
  }

  const chartType = props.config['chartType'];

  return (
    <ChartContainer
      config={chartConfig}
      className="aspect-auto h-full w-full"
      data-testid="widget-chart"
    >
      {chartType === 'pie' ? (
        <PieChart>
          <ChartTooltip content={<ChartTooltipContent nameKey="label" />} />
          <Pie data={points} dataKey="value" nameKey="label" innerRadius="40%">
            {points.map((point, index) => (
              <Cell
                key={point.label}
                fill={PIE_COLORS[index % PIE_COLORS.length]}
              />
            ))}
          </Pie>
        </PieChart>
      ) : chartType === 'line' ? (
        <LineChart data={points} accessibilityLayer>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} />
          <YAxis tickLine={false} axisLine={false} width={40} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Line
            dataKey="value"
            type="monotone"
            stroke="var(--color-value)"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      ) : (
        <BarChart data={points} accessibilityLayer>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} />
          <YAxis tickLine={false} axisLine={false} width={40} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar dataKey="value" fill="var(--color-value)" radius={4} />
        </BarChart>
      )}
    </ChartContainer>
  );
}

/** Texto de una celda: objetos como JSON, nulos como «—». */
function formatCell(value: unknown) {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);

  return String(value);
}

function TableContent(
  props: ContentProps & {
    page: number;
    totalCount: number;
    onPageChange: (page: number) => void;
  },
) {
  const t = useTranslations('cms.dashboards.widget');
  const columns = Array.isArray(props.config['columns'])
    ? (props.config['columns'] as string[])
    : Object.keys(props.rows[0] ?? {});
  const pageSize = Number(props.config['pageSize'] ?? 10);
  const pageCount = Math.max(1, Math.ceil(props.totalCount / pageSize));

  return (
    <div className="flex h-full flex-col gap-2" data-testid="widget-table">
      <div className="min-h-0 flex-1 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead key={column}>{column}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {props.rows.map((row, index) => (
              <TableRow key={index}>
                {columns.map((column) => (
                  <TableCell key={column} className="max-w-48 truncate">
                    {formatCell(row[column])}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {pageCount > 1 ? (
        <div className="flex items-center justify-end gap-2 text-xs">
          <span className="text-muted-foreground">
            {t('page', { page: props.page, pageCount })}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={props.page <= 1}
            onClick={() => props.onPageChange(props.page - 1)}
          >
            {t('previous')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={props.page >= pageCount}
            onClick={() => props.onPageChange(props.page + 1)}
          >
            {t('next')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
