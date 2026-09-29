'use client';

import type { ToasterProps } from 'sonner';

import { Toaster as ShadcnToaster } from '../shadcn/sonner';
import { useTheme } from './theme-provider';

export { toast } from 'sonner';

export function Toaster(props: ToasterProps) {
  const { theme } = useTheme();

  return <ShadcnToaster theme={theme} {...props} />;
}
