/**
 * Pintado de las celdas del explorador de datos según el metadato de la
 * columna.
 *
 * El tipo de la celda se decide en este orden:
 *
 *  1. **Relación**: si la API trae la etiqueta de la fila relacionada (clave
 *     foránea), se muestra esa etiqueta con un enlace a su ficha.
 *  2. **Tipo de interfaz** (`ui_config.ui_data_type`, configurable en los
 *     ajustes del recurso): correo, teléfono, URL, color, moneda, porcentaje.
 *  3. **Tipo de PostgreSQL** (`ui_config.data_type`): números, fechas,
 *     booleanos, UUID, JSON, enumerados y texto.
 *
 * Los formatos de número, moneda y fecha usan el idioma de la interfaz y la
 * zona horaria de las preferencias del CMS (`@pymekit/cms-formatters/hooks`).
 * Es de solo lectura: la edición en línea la añade el explorador de datos
 * (`EditableCellRenderer` de `@pymekit/cms-data-explorer-ui`), que envuelve
 * este componente cuando el usuario tiene permiso `update`.
 */
import { Link } from '@tanstack/react-router';
import {
  CalendarIcon,
  CheckCircle,
  CodeIcon,
  ExternalLinkIcon,
  LinkIcon,
  MailIcon,
  PhoneIcon,
  XCircle,
} from 'lucide-react';
import { useTranslations } from 'use-intl';

import {
  useDataFormatter,
  useDateFormatter,
  useNumberFormatter,
} from '@pymekit/cms-formatters/hooks';
import type { EnumBadgeVariant } from '@pymekit/cms-types';
import { type EnumValueLabels, useEnumLabel } from '@pymekit/i18n/enum-labels';
import { Badge } from '@pymekit/ui/badge';
import { badgeExtras } from '@pymekit/ui/badge-extras';
import { Button } from '@pymekit/ui/button';
import { CopyToClipboard } from '@pymekit/ui/copy-to-clipboard';
import { cn } from '@pymekit/ui/utils';

import type { CellRendererProps } from './advanced-data-table';

const NUMERIC_TYPES = [
  'integer',
  'bigint',
  'smallint',
  'real',
  'double precision',
  'numeric',
];

const DATE_TYPES = ['date', 'timestamp', 'timestamp with time zone'];

export function DataExplorerCellRenderer(props: CellRendererProps) {
  const { value, column, relation } = props;

  const uiConfig = column.ui_config;
  const uiDataType = uiConfig.ui_data_type;
  const dataType = uiConfig.data_type?.toLowerCase();

  let content: React.ReactNode;

  if (relation?.formatted) {
    content = relation.link ? (
      <RelationCell label={relation.formatted} link={relation.link} />
    ) : (
      <Ellipsify>{relation.formatted}</Ellipsify>
    );
  } else if (value === null || value === undefined) {
    content = <EmptyCell />;
  } else if (uiDataType === 'email') {
    content = <EmailCell data={String(value)} />;
  } else if (uiDataType === 'phone') {
    content = <PhoneCell data={String(value)} />;
  } else if (uiDataType === 'url') {
    content = <URLCell data={String(value)} />;
  } else if (uiDataType === 'color') {
    content = <ColorCell data={String(value)} />;
  } else if (uiDataType === 'currency') {
    content = <CurrencyCell data={value} currency={uiConfig.currency} />;
  } else if (uiDataType === 'percentage') {
    content = <PercentageCell data={value} />;
  } else if (dataType === 'json' || dataType === 'jsonb') {
    content = <JSONCell />;
  } else if (NUMERIC_TYPES.includes(dataType)) {
    content = <NumberCell data={value} />;
  } else if (dataType === 'uuid') {
    content = <UUIDCell data={String(value)} />;
  } else if (DATE_TYPES.includes(dataType)) {
    content = <DateCell data={String(value)} />;
  } else if (dataType === 'boolean') {
    content = (
      <BooleanCell data={Boolean(value)} labels={uiConfig.boolean_labels} />
    );
  } else if (dataType === 'user-defined' || uiConfig.is_enum) {
    content = (
      <EnumCell
        value={String(value)}
        enumName={uiConfig.enum_type}
        valueLabels={uiConfig.value_labels}
        variant={uiConfig.enum_badges?.[String(value)]?.variant}
      />
    );
  } else {
    content = <TextCell data={value} />;
  }

  return <span data-testid={`cell-${column.name}`}>{content}</span>;
}

/** Recorta el texto largo a una sola línea con puntos suspensivos. */
function Ellipsify(props: React.PropsWithChildren) {
  return (
    <span className="block w-max max-w-48 truncate text-xs">
      {props.children}
    </span>
  );
}

function EmptyCell() {
  return <span className="text-muted-foreground text-xs">-</span>;
}

/**
 * Enlace a la ficha de la fila relacionada. `stopPropagation` evita que el
 * clic abra además la ficha de la fila de la tabla.
 */
function RelationCell(props: { label: string; link: string }) {
  return (
    <Button
      nativeButton={false}
      data-testid="relation-cell-link"
      className="text-muted-foreground active:bg-muted hover:text-secondary-foreground hover:border-primary inline-flex cursor-pointer items-center gap-x-1.5"
      render={<Link to={props.link} />}
      variant="outline"
      size="sm"
      onClick={(e) => e.stopPropagation()}
    >
      <Ellipsify>{props.label}</Ellipsify>

      <ExternalLinkIcon className="h-3 min-h-3 w-3 min-w-3" />
    </Button>
  );
}

/**
 * Los enumerados se muestran como insignias. La variante se configura por
 * valor en los ajustes del recurso; `success`, `warning` e `info` no existen
 * en la insignia base y se aplican con las clases de `badgeExtras`.
 */
function EnumCell(props: {
  value: string;
  enumName?: string | null;
  valueLabels?: EnumValueLabels | null;
  variant?: EnumBadgeVariant;
}) {
  // Etiqueta legible (columna → traducción → humanizador); el valor real
  // no cambia y es el que usan los filtros y la URL.
  const label = useEnumLabel()(props.value, {
    enumName: props.enumName,
    overrides: props.valueLabels,
  });
  const variant = props.variant ?? 'secondary';
  const isExtra =
    variant === 'success' || variant === 'warning' || variant === 'info';

  return (
    <Badge
      className={cn(
        'inline-flex min-w-max gap-x-1',
        isExtra && badgeExtras[variant],
      )}
      variant={isExtra ? 'secondary' : variant}
      title={props.value}
    >
      <span className="max-w-sm truncate font-normal">{label}</span>
    </Badge>
  );
}

/** Muestra solo el final del UUID; al pulsarlo se copia completo. */
function UUIDCell(props: { data: string }) {
  return (
    <CopyCell value={props.data} className="gap-x-1">
      {props.data.substring(24)}
    </CopyCell>
  );
}

function JSONCell() {
  return <CodeIcon className="text-muted-foreground h-3 w-3" />;
}

function TextCell(props: { data: unknown }) {
  const text =
    typeof props.data === 'object'
      ? JSON.stringify(props.data)
      : String(props.data);

  return <Ellipsify>{text}</Ellipsify>;
}

function NumberCell(props: { data: unknown }) {
  const { formatNumber } = useNumberFormatter();

  return (
    <span className="text-muted-foreground text-xs">
      {formatNumber(props.data, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      })}
    </span>
  );
}

function DateCell(props: { data: string }) {
  const formatDate = useDateFormatter();

  return (
    <span className="text-muted-foreground flex min-w-30 items-center gap-x-1 text-xs">
      <CalendarIcon className="h-3 w-3" />

      {formatDate(new Date(props.data), 'dd MMM yyyy, HH:mm')}
    </span>
  );
}

function BooleanCell(props: {
  data: boolean;
  labels: { true_label?: string; false_label?: string } | undefined;
}) {
  const t = useTranslations('cms.dataExplorer');

  const label = props.data
    ? props.labels?.true_label || t('record.yes')
    : props.labels?.false_label || t('record.no');

  return (
    <Badge
      className={cn(
        'inline-flex gap-x-1 truncate font-normal',
        props.data && badgeExtras.success,
      )}
      variant={props.data ? 'secondary' : 'destructive'}
    >
      {props.data ? (
        <CheckCircle className="h-3 w-3" />
      ) : (
        <XCircle className="h-3 w-3" />
      )}

      {label}
    </Badge>
  );
}

/** Texto copiable al portapapeles con los mensajes traducidos. */
function CopyCell(
  props: React.PropsWithChildren<{ value: string; className?: string }>,
) {
  const t = useTranslations('cms.dataExplorer');

  return (
    <CopyToClipboard
      value={props.value}
      tooltipText={t('table.copyToClipboard')}
      successMessage={t('table.copied')}
      errorMessage={t('table.copyFailed')}
      className={cn(
        'text-muted-foreground hover:bg-muted/50 active:bg-muted inline-flex items-center gap-x-1.5 text-xs',
        props.className,
      )}
    >
      {props.children}
    </CopyToClipboard>
  );
}

function URLCell(props: { data: string }) {
  const { formatText } = useDataFormatter();

  return (
    <CopyCell value={props.data}>
      <LinkIcon className="h-3 min-h-3 w-3 min-w-3" />

      <Ellipsify>
        {formatText(props.data, {
          type: 'url',
          maxLength: 48,
          truncatePosition: 'middle',
        })}
      </Ellipsify>
    </CopyCell>
  );
}

function EmailCell(props: { data: string }) {
  const { formatText } = useDataFormatter();

  return (
    <CopyCell value={props.data}>
      <MailIcon className="h-3 min-h-3 w-3 min-w-3" />

      <Ellipsify>
        {formatText(props.data, {
          type: 'email',
          maxLength: 48,
          truncatePosition: 'middle',
        })}
      </Ellipsify>
    </CopyCell>
  );
}

function PhoneCell(props: { data: string }) {
  const { formatText } = useDataFormatter();

  return (
    <CopyCell value={props.data} className="hover:underline">
      <PhoneIcon className="h-3 min-h-3 w-3 min-w-3" />

      <Ellipsify>{formatText(props.data, { type: 'phone' })}</Ellipsify>
    </CopyCell>
  );
}

function CurrencyCell(props: { data: unknown; currency: string | undefined }) {
  const { formatCurrency } = useNumberFormatter();

  return (
    <span className="text-muted-foreground text-xs">
      {formatCurrency(props.data, props.currency, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}
    </span>
  );
}

function PercentageCell(props: { data: unknown }) {
  const { formatPercentage } = useNumberFormatter();

  return (
    <span className="text-muted-foreground text-xs">
      {formatPercentage(props.data, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 1,
      })}
    </span>
  );
}

function ColorCell(props: { data: string }) {
  return (
    <span className="flex items-center gap-x-1 text-xs">
      <span
        className="h-3.5 w-3.5 rounded border"
        style={{ backgroundColor: props.data }}
      />
      <span className="text-muted-foreground">{props.data}</span>
    </span>
  );
}
