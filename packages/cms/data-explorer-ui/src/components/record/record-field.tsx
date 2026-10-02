/**
 * Campo de la ficha de un registro (solo lectura).
 *
 * Muestra el nombre de la columna (con el icono de su tipo y su descripción)
 * y su valor formateado. El formato se decide como en las celdas del
 * listado, pero con el valor completo y más espacio:
 *
 *  1. **Clave foránea legible**: la etiqueta de la fila destino con un enlace
 *     a su ficha. Si el usuario no puede leer la tabla destino, la API no
 *     manda la fila y se muestra el valor tal cual, sin enlace.
 *  2. **Tipo de interfaz** (`ui_config.ui_data_type`, configurable en los
 *     ajustes): correo, URL, moneda, porcentaje, color, imagen…
 *  3. **Tipo de PostgreSQL**: booleanos, fechas, números, JSON, UUID,
 *     enumerados y texto.
 *
 * Seguridad: el contenido de la base de datos no es de confianza. El HTML y
 * el Markdown se muestran como texto (nunca con `dangerouslySetInnerHTML`,
 * que permitiría inyectar *scripts* en la consola de administración) y las
 * URL solo se enlazan o cargan si son `http(s)`, para evitar `javascript:`.
 *
 * La edición en línea de cada campo llega con la edición de registros
 * (F2.4c).
 */
import { Link } from '@tanstack/react-router';
import {
  CheckCircle,
  ExternalLink,
  Link as LinkIcon,
  Mail,
  XCircle,
} from 'lucide-react';
import { useTranslations } from 'use-intl';

import {
  useDateFormatter,
  useNumberFormatter,
} from '@pymekit/cms-formatters/hooks';
import type { ColumnMetadata, EnumBadgeVariant } from '@pymekit/cms-types';
import { type EnumValueLabels, useEnumLabel } from '@pymekit/i18n/enum-labels';
import { Badge } from '@pymekit/ui/badge';
import { badgeExtras } from '@pymekit/ui/badge-extras';
import { Button } from '@pymekit/ui/button';
import { CopyToClipboard } from '@pymekit/ui/copy-to-clipboard';
import { DataTypeIcon } from '@pymekit/ui/datatype-icon';
import { cn } from '@pymekit/ui/utils';

const NUMERIC_TYPES = [
  'integer',
  'bigint',
  'smallint',
  'real',
  'double precision',
  'numeric',
];

const DATE_TIME_TYPES = ['timestamp', 'timestamp with time zone'];

/** Etiqueta y enlace de la fila a la que apunta una clave foránea. */
export type ForeignKeyLinkData = { label: string; href: string };

export function RecordField(props: {
  column: ColumnMetadata;
  value: unknown;
  foreignKey?: ForeignKeyLinkData | null;
}) {
  const { column } = props;
  const type = (
    column.ui_config?.ui_data_type ||
    column.ui_config?.data_type ||
    ''
  ).toLowerCase();

  return (
    <div
      className="text-muted-foreground flex flex-col gap-y-3 border-b border-dashed py-5 last:border-b-0"
      data-testid="record-field"
      data-column={column.name}
    >
      <div className="flex flex-col gap-y-1">
        <div className="flex items-center gap-x-2">
          <DataTypeIcon
            type={column.ui_config?.data_type ?? type}
            className="text-muted-foreground h-3.5 w-3.5"
          />

          <span className="text-foreground text-sm font-semibold">
            {column.display_name || column.name}
          </span>
        </div>

        {column.description ? (
          <span className="text-muted-foreground text-xs">
            {column.description}
          </span>
        ) : null}
      </div>

      <div className="text-foreground min-w-0" data-testid="record-field-value">
        <RecordFieldValue
          column={column}
          value={props.value}
          foreignKey={props.foreignKey}
        />
      </div>
    </div>
  );
}

/** Valor de un campo según su tipo (ver la cabecera del fichero). */
function RecordFieldValue(props: {
  column: ColumnMetadata;
  value: unknown;
  foreignKey?: ForeignKeyLinkData | null;
}) {
  const { column, value, foreignKey } = props;
  const uiConfig = column.ui_config ?? { data_type: 'text' };
  const uiType = uiConfig.ui_data_type?.toLowerCase() ?? '';
  const pgType = uiConfig.data_type?.toLowerCase() ?? '';

  if (value === null || value === undefined) {
    return <EmptyValue />;
  }

  if (foreignKey?.href) {
    return <ForeignKeyValue {...foreignKey} value={value} />;
  }

  const text = typeof value === 'string' ? value : null;

  switch (uiType) {
    case 'email':
      return text ? <EmailValue value={text} /> : <TextValue value={value} />;
    case 'url':
    case 'file':
      return text ? <UrlValue value={text} /> : <TextValue value={value} />;
    case 'switch':
      return <BooleanValue value={value} labels={uiConfig.boolean_labels} />;
    case 'date':
      return <DateValue value={value} pattern="dd MMM yyyy" />;
    case 'time':
    case 'datetime':
      return <DateValue value={value} pattern="dd MMM yyyy, HH:mm:ss" />;
    case 'currency':
      return <CurrencyValue value={value} currency={uiConfig.currency} />;
    case 'percentage':
      return <PercentageValue value={value} />;
    case 'number':
      return <NumberValue value={value} />;
    case 'code':
    case 'markdown':
    case 'html':
      return <CodeValue value={value} />;
    case 'image':
    case 'audio':
    case 'video':
      return text ? (
        <MediaValue value={text} kind={uiType} />
      ) : (
        <TextValue value={value} />
      );
    case 'phone':
      return <CopyValue value={String(value)}>{String(value)}</CopyValue>;
    case 'color':
      return text ? <ColorValue value={text} /> : <TextValue value={value} />;
  }

  if (pgType === 'boolean') {
    return <BooleanValue value={value} labels={uiConfig.boolean_labels} />;
  }

  if (pgType === 'date') {
    return <DateValue value={value} pattern="dd MMM yyyy" />;
  }

  if (DATE_TIME_TYPES.includes(pgType)) {
    return <DateValue value={value} pattern="dd MMM yyyy, HH:mm:ss" />;
  }

  if (pgType === 'json' || pgType === 'jsonb') {
    return <CodeValue value={value} />;
  }

  if (NUMERIC_TYPES.includes(pgType) && !Number.isNaN(Number(value))) {
    return <NumberValue value={value} />;
  }

  if (pgType === 'uuid') {
    return <UuidValue value={String(value)} />;
  }

  if (pgType === 'user-defined' || uiConfig.is_enum) {
    return (
      <EnumValue
        value={String(value)}
        enumName={uiConfig.enum_type}
        valueLabels={uiConfig.value_labels}
        variant={uiConfig.enum_badges?.[String(value)]?.variant}
      />
    );
  }

  return <TextValue value={value} />;
}

function EmptyValue() {
  const t = useTranslations('cms.dataExplorer');

  return (
    <span className="text-muted-foreground text-sm italic">
      {t('record.empty')}
    </span>
  );
}

function TextValue(props: { value: unknown }) {
  const text =
    typeof props.value === 'object'
      ? JSON.stringify(props.value)
      : String(props.value);

  if (text === '') {
    return <EmptyValue />;
  }

  return (
    <span className="text-sm break-words whitespace-pre-wrap">{text}</span>
  );
}

/** Enlace a la ficha de la fila a la que apunta la clave foránea. */
function ForeignKeyValue(props: ForeignKeyLinkData & { value: unknown }) {
  return (
    <Button
      nativeButton={false}
      variant="secondary"
      size="sm"
      className="max-w-full hover:underline"
      data-testid="record-field-relation-link"
      title={String(props.value)}
      render={<Link to={props.href} />}
    >
      <span className="truncate">{props.label || String(props.value)}</span>

      <ExternalLink className="h-3 w-3 shrink-0" />
    </Button>
  );
}

/** Texto copiable al portapapeles con los mensajes traducidos. */
function CopyValue(
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
        'inline-flex items-center gap-x-1.5 text-sm',
        props.className,
      )}
    >
      {props.children}
    </CopyToClipboard>
  );
}

function EmailValue(props: { value: string }) {
  return (
    <span className="flex items-center gap-x-2">
      <Mail className="text-muted-foreground h-3.5 w-3.5" />
      <CopyValue value={props.value}>{props.value}</CopyValue>
    </span>
  );
}

/** Solo se enlazan URL absolutas `http(s)`; el resto se muestra como texto. */
function isSafeHttpUrl(value: string) {
  try {
    const url = new URL(value);

    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function UrlValue(props: { value: string }) {
  const t = useTranslations('cms.dataExplorer');

  if (!isSafeHttpUrl(props.value)) {
    return <TextValue value={props.value} />;
  }

  return (
    <span className="flex min-w-0 items-center gap-x-2">
      <LinkIcon className="text-muted-foreground h-3.5 w-3.5 shrink-0" />

      <a
        href={props.value}
        target="_blank"
        rel="noopener noreferrer"
        className="truncate text-sm underline"
        title={t('record.openInNewTab')}
      >
        {props.value}
      </a>
    </span>
  );
}

/**
 * Imagen, audio o vídeo desde una URL `http(s)`. Las rutas de Storage
 * (`bucket/ruta`) se muestran como texto hasta el explorador de
 * almacenamiento, que sabrá firmarlas según los permisos del usuario.
 */
function MediaValue(props: { value: string; kind: string }) {
  if (!isSafeHttpUrl(props.value)) {
    return <TextValue value={props.value} />;
  }

  if (props.kind === 'audio') {
    return <audio controls src={props.value} className="max-h-64" />;
  }

  if (props.kind === 'video') {
    return (
      <video controls src={props.value} className="max-h-64 rounded border" />
    );
  }

  return (
    <img
      loading="lazy"
      decoding="async"
      src={props.value}
      alt=""
      className="max-h-64 rounded border"
    />
  );
}

function BooleanValue(props: {
  value: unknown;
  labels?: { true_label?: string; false_label?: string };
}) {
  const t = useTranslations('cms.dataExplorer');
  const checked = props.value === true || props.value === 'true';

  const label = checked
    ? props.labels?.true_label || t('record.yes')
    : props.labels?.false_label || t('record.no');

  return (
    <Badge
      className={cn(
        'inline-flex gap-x-1 font-normal',
        checked && badgeExtras.success,
      )}
      variant={checked ? 'secondary' : 'destructive'}
    >
      {checked ? (
        <CheckCircle className="h-3 w-3" />
      ) : (
        <XCircle className="h-3 w-3" />
      )}

      {label}
    </Badge>
  );
}

/**
 * Fecha en la zona horaria de las preferencias del CMS. No se muestra el
 * tiempo relativo («hace 3 días») porque dependería del reloj de quien
 * renderiza y el HTML del SSR no coincidiría con el del navegador.
 */
function DateValue(props: { value: unknown; pattern: string }) {
  const formatDate = useDateFormatter();
  const date = new Date(String(props.value));

  if (Number.isNaN(date.getTime())) {
    return <TextValue value={props.value} />;
  }

  return (
    <span className="text-sm tabular-nums">
      {formatDate(date, props.pattern)}
    </span>
  );
}

function NumberValue(props: { value: unknown }) {
  const { formatNumber } = useNumberFormatter();

  return (
    <span className="text-sm font-medium tabular-nums">
      {formatNumber(props.value, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      })}
    </span>
  );
}

function CurrencyValue(props: { value: unknown; currency?: string }) {
  const { formatCurrency } = useNumberFormatter();

  return (
    <span className="text-sm tabular-nums">
      {formatCurrency(props.value, props.currency, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}
    </span>
  );
}

function PercentageValue(props: { value: unknown }) {
  const { formatPercentage } = useNumberFormatter();

  return (
    <span className="text-sm tabular-nums">
      {formatPercentage(props.value, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 1,
      })}
    </span>
  );
}

/** JSON, código, HTML o Markdown: texto preformateado, sin interpretar. */
function CodeValue(props: { value: unknown }) {
  const text =
    typeof props.value === 'string'
      ? props.value
      : JSON.stringify(props.value, null, 2);

  return (
    <pre className="bg-muted max-h-96 overflow-auto rounded-md p-3 font-mono text-xs whitespace-pre-wrap">
      {text}
    </pre>
  );
}

/** UUID abreviado (principio y final); al pulsarlo se copia completo. */
function UuidValue(props: { value: string }) {
  const short =
    props.value.length > 20
      ? `${props.value.slice(0, 8)}…${props.value.slice(-8)}`
      : props.value;

  return (
    <CopyValue value={props.value}>
      <span
        className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs"
        title={props.value}
      >
        {short}
      </span>
    </CopyValue>
  );
}

function ColorValue(props: { value: string }) {
  return (
    <span className="flex items-center gap-x-1.5 text-sm">
      <span
        className="h-3.5 w-3.5 rounded border"
        style={{ backgroundColor: props.value }}
      />
      {props.value}
    </span>
  );
}

/**
 * Enumerado como insignia. Las variantes `success`, `warning` e `info` no
 * existen en la insignia base y se aplican con `badgeExtras`.
 */
function EnumValue(props: {
  value: string;
  enumName?: string | null;
  valueLabels?: EnumValueLabels | null;
  variant?: EnumBadgeVariant;
}) {
  // Etiqueta legible: configurada en la columna, traducida o humanizada.
  const label = useEnumLabel()(props.value, {
    enumName: props.enumName,
    overrides: props.valueLabels,
  });
  const variant = props.variant ?? 'secondary';
  const isExtra =
    variant === 'success' || variant === 'warning' || variant === 'info';

  return (
    <Badge
      className={cn('inline-flex font-normal', isExtra && badgeExtras[variant])}
      variant={isExtra ? 'secondary' : variant}
      title={props.value}
    >
      {label}
    </Badge>
  );
}
