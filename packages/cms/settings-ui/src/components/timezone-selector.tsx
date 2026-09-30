/**
 * Selector de zona horaria con búsqueda (Ajustes > General).
 *
 * Ofrece las zonas IANA que reconoce el navegador (`getSelectableTimeZones`)
 * en un desplegable con búsqueda, porque son más de cuatrocientas.
 */
import { useMemo, useState } from 'react';

import { ChevronsUpDownIcon, GlobeIcon } from 'lucide-react';
import { useTranslations } from 'use-intl';

import { Button } from '@pymekit/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@pymekit/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@pymekit/ui/popover';

import { getSelectableTimeZones } from '../utils/general-settings';

export function TimezoneSelector(props: {
  id: string;
  value: string;
  invalid?: boolean;
  onChange: (value: string) => void;
  onBlur?: () => void;
}) {
  const t = useTranslations('cms.settings.general');
  const [open, setOpen] = useState(false);
  const zones = useMemo(
    () => getSelectableTimeZones(props.value),
    [props.value],
  );

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);

        if (!next) {
          props.onBlur?.();
        }
      }}
    >
      <PopoverTrigger
        render={
          <Button
            id={props.id}
            type="button"
            variant="outline"
            aria-invalid={props.invalid}
            data-testid="timezone-selector-trigger"
            className="flex w-full max-w-sm justify-between gap-2 font-normal"
          />
        }
      >
        <span className="flex min-w-0 items-center gap-2">
          <GlobeIcon className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate" data-testid="timezone-selector-value">
            {props.value}
          </span>
        </span>
        <ChevronsUpDownIcon className="h-3.5 w-3.5 shrink-0" />
      </PopoverTrigger>

      <PopoverContent align="start" className="w-80 p-0">
        <Command>
          <CommandInput
            data-testid="timezone-selector-input"
            placeholder={t('findTimezone')}
          />

          <CommandList className="max-h-72">
            <CommandEmpty className="text-muted-foreground p-2 text-xs">
              {t('noTimezone')}
            </CommandEmpty>

            <CommandGroup>
              {zones.map((zone) => (
                <CommandItem
                  key={zone}
                  value={zone}
                  data-testid={`timezone-selector-item-${zone}`}
                  className="cursor-pointer"
                  onSelect={() => {
                    props.onChange(zone);
                    setOpen(false);
                  }}
                >
                  {zone}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
