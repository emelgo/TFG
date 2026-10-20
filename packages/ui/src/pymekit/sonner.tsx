'use client';

/**
 * Avisos emergentes (sonner) con el tema de la app y textos en español.
 *
 * sonner pone por defecto en inglés la etiqueta accesible de la región de
 * avisos («Notifications») y la del botón de cerrar («Close toast»); aquí se
 * sustituyen por textos de i18n (ADR-021).
 */
import type { ToasterProps } from 'sonner';
import { useTranslations } from 'use-intl';

import { Toaster as ShadcnToaster } from '../shadcn/sonner';
import { useTheme } from './theme-provider';

export { toast } from 'sonner';

export function Toaster(props: ToasterProps) {
  const { theme } = useTheme();
  const t = useTranslations('common');

  return (
    <ShadcnToaster
      theme={theme}
      containerAriaLabel={t('notifications')}
      {...props}
      toastOptions={{
        closeButtonAriaLabel: t('ui.closeNotification'),
        ...props.toastOptions,
      }}
    />
  );
}
