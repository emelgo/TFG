'use client';

import { Moon, Sun } from 'lucide-react';
import { useTranslations } from 'use-intl';

import { cn } from '../lib/utils';
import { Button } from '../shadcn/button';
import { useTheme } from './theme-provider';

export function MobileModeToggle(props: { className?: string }) {
  const t = useTranslations('common');
  const { resolvedTheme, setTheme } = useTheme();

  const toggleTheme = () => {
    const next = resolvedTheme === 'dark' ? 'light' : 'dark';
    setTheme(next);
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={t('toggleTheme')}
      className={cn(props.className)}
      onClick={toggleTheme}
    >
      <Sun className="h-[0.9rem] w-[0.9rem] scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
      <Moon className="absolute h-[0.9rem] w-[0.9rem] scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
      <span className="sr-only">{t('toggleTheme')}</span>
    </Button>
  );
}
