import { useState } from 'react';

import { useTranslations } from 'use-intl';

import { useDateFormatter } from '@pymekit/cms-formatters/hooks';
import { Button } from '@pymekit/ui/button';
import { Calendar } from '@pymekit/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@pymekit/ui/popover';
import { cn } from '@pymekit/ui/utils';

import { useTimezone } from '../hooks/use-filter-labels';

/**
 * Botón con calendario desplegable para elegir un extremo de un rango de
 * fechas. Devuelve la fecha en ISO 8601, que es lo que guarda la URL.
 */
export function CalendarPopover(props: {
  testId?: string;
  date: Date | undefined;
  onChange: (date: string) => void;
  disabled: (date: Date) => boolean;
}) {
  const t = useTranslations('cms.dataExplorer');
  const timezone = useTimezone();
  const dateFormatter = useDateFormatter();
  const [open, setOpen] = useState(false);

  return (
    <Popover modal open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            data-testid={props.testId}
            variant="secondary"
            size="sm"
            className={cn(
              'w-full justify-start text-left font-normal',
              !props.date && 'text-muted-foreground',
            )}
          />
        }
      >
        {props.date ? dateFormatter(props.date) : t('filters.pickADate')}
      </PopoverTrigger>

      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          timeZone={timezone}
          mode="single"
          selected={props.date}
          onSelect={(date) => {
            props.onChange(date ? date.toISOString() : '');
            setOpen(false);
          }}
          disabled={props.disabled}
        />
      </PopoverContent>
    </Popover>
  );
}
