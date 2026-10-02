'use client';

/**
 * Paleta de comandos de shadcn con los textos en español.
 *
 * `src/shadcn/command.tsx` queda igual que el original, cuyo `CommandDialog`
 * trae por defecto un título y una descripción (ocultos, para lectores de
 * pantalla) en inglés. Aquí se reexporta todo y se dan esos valores por
 * defecto desde i18n. `@pymekit/ui/command` apunta a este fichero.
 *
 * [TFG] ADR-021: nada visible (ni accesible) en inglés.
 */
import * as React from 'react';

import { useTranslations } from 'use-intl';

import { CommandDialog as ShadcnCommandDialog } from '../shadcn/command';

export * from '../shadcn/command';

function CommandDialog({
  title,
  description,
  ...props
}: React.ComponentProps<typeof ShadcnCommandDialog>) {
  const t = useTranslations('common.ui');

  return (
    <ShadcnCommandDialog
      title={title ?? t('commandPalette')}
      description={description ?? t('commandPaletteDescription')}
      {...props}
    />
  );
}

export { CommandDialog };
