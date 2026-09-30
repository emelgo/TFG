/**
 * Formulario de filtros del registro de auditoría: autor, operaciones, tabla,
 * gravedad y rango de días (UTC).
 *
 * Mantiene los valores en un único estado local mientras se editan y solo los
 * lleva a la URL al pulsar «Aplicar» (`onApply`), que vuelve a la primera
 * página. Quien lo monta le pone una `key` con los filtros de la URL para
 * reiniciarlo cuando cambian desde fuera (por ejemplo, con «atrás»), sin
 * sincronizar estado con efectos.
 */
import { useState } from 'react';

import { CheckIcon, ChevronDownIcon, SearchIcon, XIcon } from 'lucide-react';
import { useTranslations } from 'use-intl';

import { Button } from '@pymekit/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@pymekit/ui/dropdown-menu';
import { Input } from '@pymekit/ui/input';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@pymekit/ui/input-group';
import { Label } from '@pymekit/ui/label';
import { NativeSelect, NativeSelectOption } from '@pymekit/ui/native-select';

import {
  AUDIT_LOG_OPERATIONS,
  AUDIT_LOG_SEVERITIES,
  type AuditLogsFilterValues,
  parseResourceFilter,
} from '../utils/audit-logs-search';

export function AuditLogsFilters(props: {
  initialValues: AuditLogsFilterValues;
  hasActiveFilters: boolean;
  onApply: (values: AuditLogsFilterValues) => void;
  onClear: () => void;
}) {
  const t = useTranslations('cms.auditLogs.filters');
  const tSeverity = useTranslations('cms.auditLogs.severity');
  const [values, setValues] = useState(props.initialValues);

  const update = (patch: Partial<AuditLogsFilterValues>) =>
    setValues((previous) => ({ ...previous, ...patch }));

  const toggleOperation = (operation: string, checked: boolean) =>
    update({
      actions: checked
        ? [...values.actions, operation]
        : values.actions.filter((action) => action !== operation),
    });

  const resourceInvalid =
    values.resource.trim() !== '' &&
    parseResourceFilter(values.resource) === null;

  return (
    <form
      role="search"
      data-testid="audit-logs-filters"
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();

        if (!resourceInvalid) {
          props.onApply(values);
        }
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <InputGroup className="max-w-sm min-w-48 flex-1">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            data-testid="audit-logs-filter-author"
            aria-label={t('author')}
            placeholder={t('authorPlaceholder')}
            value={values.author}
            maxLength={36}
            onChange={(event) => update({ author: event.target.value })}
          />
        </InputGroup>

        <Button
          type="submit"
          size="sm"
          data-testid="audit-logs-apply"
          disabled={resourceInvalid}
        >
          <CheckIcon className="h-3.5 w-3.5" />
          {t('apply')}
        </Button>

        {props.hasActiveFilters ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            data-testid="audit-logs-clear"
            onClick={props.onClear}
          >
            <XIcon className="h-3.5 w-3.5" />
            {t('clear')}
          </Button>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="flex flex-col gap-1.5">
          <Label>{t('operations')}</Label>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="justify-between"
                  data-testid="audit-logs-filter-operations"
                />
              }
            >
              {values.actions.length > 0
                ? t('selectedOperations', { count: values.actions.length })
                : t('allOperations')}
              <ChevronDownIcon className="h-3.5 w-3.5" />
            </DropdownMenuTrigger>

            <DropdownMenuContent align="start" className="w-56">
              {AUDIT_LOG_OPERATIONS.map((operation) => (
                <DropdownMenuCheckboxItem
                  key={operation}
                  data-testid={`audit-logs-operation-${operation}`}
                  className="font-mono text-xs"
                  checked={values.actions.includes(operation)}
                  onCheckedChange={(checked) =>
                    toggleOperation(operation, checked === true)
                  }
                >
                  {operation}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="audit-logs-filter-resource">{t('resource')}</Label>
          <Input
            id="audit-logs-filter-resource"
            data-testid="audit-logs-filter-resource"
            className="h-8"
            placeholder={t('resourcePlaceholder')}
            value={values.resource}
            maxLength={127}
            aria-invalid={resourceInvalid}
            onChange={(event) => update({ resource: event.target.value })}
          />
          {resourceInvalid ? (
            <span className="text-destructive text-xs">
              {t('invalidResource')}
            </span>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="audit-logs-filter-severity">{t('severity')}</Label>
          <NativeSelect
            id="audit-logs-filter-severity"
            data-testid="audit-logs-filter-severity"
            className="w-full"
            value={values.severity}
            onChange={(event) =>
              update({
                severity: event.target
                  .value as AuditLogsFilterValues['severity'],
              })
            }
          >
            <NativeSelectOption value="">
              {t('allSeverities')}
            </NativeSelectOption>
            {AUDIT_LOG_SEVERITIES.map((severity) => (
              <NativeSelectOption key={severity} value={severity}>
                {tSeverity(severity)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="audit-logs-filter-from">{t('from')}</Label>
          <Input
            id="audit-logs-filter-from"
            data-testid="audit-logs-filter-from"
            type="date"
            className="h-8"
            value={values.from}
            max={values.to || undefined}
            onChange={(event) => update({ from: event.target.value })}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="audit-logs-filter-to">{t('to')}</Label>
          <Input
            id="audit-logs-filter-to"
            data-testid="audit-logs-filter-to"
            type="date"
            className="h-8"
            value={values.to}
            min={values.from || undefined}
            onChange={(event) => update({ to: event.target.value })}
          />
        </div>
      </div>
    </form>
  );
}
