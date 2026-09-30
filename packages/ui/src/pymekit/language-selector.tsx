'use client';

import { useCallback, useMemo, useState } from 'react';

import { useLocale } from 'use-intl';

import { useChangeLocale } from '@pymekit/i18n/navigation';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../shadcn/select';

interface LanguageSelectorProps {
  locales?: string[];
  onChange?: (locale: string) => unknown;
}

export function LanguageSelector({
  locales = [],
  onChange,
}: LanguageSelectorProps) {
  const currentLocale = useLocale();
  const handleChangeLocale = useChangeLocale();
  const [value, setValue] = useState(currentLocale);

  const languageNames = useMemo(() => {
    return new Intl.DisplayNames([currentLocale], {
      type: 'language',
    });
  }, [currentLocale]);

  const languageChanged = useCallback(
    (locale: string | null) => {
      if (!locale) return;

      setValue(locale);

      if (onChange) {
        onChange(locale);
      }

      handleChangeLocale(locale);
    },
    [onChange, handleChangeLocale],
  );

  if (locales.length <= 1) {
    return null;
  }

  return (
    <Select value={value} onValueChange={languageChanged}>
      <SelectTrigger>
        <SelectValue className="capitalize">
          {(value) => (value ? languageNames.of(value) : value)}
        </SelectValue>
      </SelectTrigger>

      <SelectContent>
        {locales.map((locale) => {
          const label = languageNames.of(locale) ?? locale;

          return (
            <SelectItem value={locale} key={locale} className="capitalize">
              {label}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
