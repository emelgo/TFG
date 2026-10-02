/**
 * Control de un campo del formulario de un registro, según su tipo.
 *
 * Recibe el tipo de control ya decidido (`getFieldKind`, ver
 * `utils/record-form.ts`) y pinta el control nativo o de `@pymekit/ui` que
 * corresponde: interruptor para booleanos, desplegable para enumerados,
 * selectores de fecha y hora del navegador, área de texto para JSON y textos
 * largos, y el buscador de filas para las claves foráneas. Todos trabajan con
 * el valor «de formulario» (texto, o booleano/`null`); la conversión al tipo
 * de la base de datos se hace al enviar.
 *
 * Se usa en el formulario completo (crear y editar) y en la edición en línea
 * de una celda del listado.
 */
import { useTranslations } from 'use-intl';

import type { RelationConfig } from '@pymekit/cms-types';
import { Input } from '@pymekit/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@pymekit/ui/select';
import { Switch } from '@pymekit/ui/switch';
import { Textarea } from '@pymekit/ui/textarea';

import type { FormField, FormFieldValue } from '../../utils/record-form';
import { RelationFieldPicker } from './relation-field-picker';

/** Valor del desplegable que representa «vacío» (un enumerado a `null`). */
const EMPTY_OPTION = '__empty__';

export function RecordFieldInput(props: {
  id: string;
  field: FormField;
  value: FormFieldValue;
  onChange: (value: FormFieldValue) => void;
  onBlur?: () => void;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  relationConfig?: RelationConfig;
  /** Etiqueta de la fila relacionada del valor actual (claves foráneas). */
  relationLabel?: string | null;
}) {
  const t = useTranslations('cms.dataExplorer');
  const { field, value, onChange } = props;
  const { column, kind } = field;
  const text = typeof value === 'string' ? value : '';

  const common = {
    id: props.id,
    name: column.name,
    disabled: props.disabled,
    'aria-invalid': props.invalid,
    onBlur: props.onBlur,
    'data-testid': 'record-field-input',
    'data-field-kind': kind,
  };

  switch (kind) {
    case 'relation':
      return props.relationConfig ? (
        <RelationFieldPicker
          id={props.id}
          value={text}
          relation={props.relationConfig}
          initialLabel={props.relationLabel}
          placeholder={props.placeholder}
          disabled={props.disabled}
          invalid={props.invalid}
          onBlur={props.onBlur}
          onChange={onChange}
        />
      ) : (
        <Input
          {...common}
          value={text}
          placeholder={props.placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      );

    case 'boolean': {
      const labels = column.ui_config?.boolean_labels;

      return (
        <div className="flex h-9 items-center gap-2">
          <Switch
            id={props.id}
            name={column.name}
            disabled={props.disabled}
            data-testid="record-field-switch"
            checked={value === true}
            onCheckedChange={(checked) => onChange(checked)}
          />

          <span className="text-muted-foreground text-sm">
            {value === null
              ? t('record.empty')
              : value
                ? labels?.true_label || t('record.yes')
                : labels?.false_label || t('record.no')}
          </span>
        </div>
      );
    }

    case 'enum':
      return (
        <Select
          value={text === '' ? EMPTY_OPTION : text}
          disabled={props.disabled}
          onValueChange={(next) =>
            onChange(!next || next === EMPTY_OPTION ? '' : String(next))
          }
        >
          <SelectTrigger
            id={props.id}
            className="w-full"
            aria-invalid={props.invalid}
            data-testid="record-field-select"
            onBlur={props.onBlur}
          >
            <SelectValue>
              {(selected: string) =>
                !selected || selected === EMPTY_OPTION ? (
                  <span className="text-muted-foreground">
                    {t('record.empty')}
                  </span>
                ) : (
                  selected
                )
              }
            </SelectValue>
          </SelectTrigger>

          <SelectContent>
            <SelectItem value={EMPTY_OPTION}>
              <span className="text-muted-foreground">{t('record.empty')}</span>
            </SelectItem>

            <SelectSeparator />

            {(column.ui_config.enum_values ?? []).map((option) => (
              <SelectItem
                key={option}
                value={option}
                data-testid="record-field-option"
              >
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    case 'json':
    case 'array':
    case 'textarea':
      return (
        <Textarea
          {...common}
          rows={kind === 'textarea' ? 4 : 6}
          className={
            kind === 'textarea'
              ? 'min-h-24 resize-y'
              : 'min-h-32 resize-y font-mono text-xs'
          }
          value={text}
          placeholder={props.placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      );

    case 'date':
      return (
        <Input
          {...common}
          type="date"
          value={text}
          onChange={(event) => onChange(event.target.value)}
        />
      );

    case 'datetime':
    case 'timestamp':
      return (
        <Input
          {...common}
          type="datetime-local"
          step={1}
          value={text}
          onChange={(event) => onChange(event.target.value)}
        />
      );

    case 'time':
      return (
        <Input
          {...common}
          type="time"
          step={1}
          value={text}
          onChange={(event) => onChange(event.target.value)}
        />
      );

    case 'integer':
    case 'decimal':
      // Texto con teclado numérico en lugar de `type="number"`: así no se
      // pierde precisión en los `bigint` ni se aceptan valores a medias.
      return (
        <Input
          {...common}
          inputMode={kind === 'integer' ? 'numeric' : 'decimal'}
          value={text}
          placeholder={props.placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      );

    case 'color':
      return (
        <div className="flex items-center gap-2">
          <input
            type="color"
            aria-label={column.display_name || column.name}
            className="h-9 w-9 cursor-pointer rounded-md border"
            disabled={props.disabled}
            value={text || '#000000'}
            onChange={(event) => onChange(event.target.value)}
          />

          <Input
            {...common}
            value={text}
            placeholder="#000000"
            onChange={(event) => onChange(event.target.value)}
          />
        </div>
      );

    default:
      return (
        <Input
          {...common}
          type={kind === 'email' ? 'email' : kind === 'url' ? 'url' : 'text'}
          value={text}
          placeholder={props.placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      );
  }
}
