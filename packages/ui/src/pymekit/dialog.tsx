'use client';

/**
 * Diálogo de shadcn con los textos accesibles en español.
 *
 * `src/shadcn/dialog.tsx` se mantiene igual que el original (su CLI puede
 * sobrescribirlo), pero trae escrito en inglés el texto del botón de cierre
 * («Close»), que leen los lectores de pantalla. Aquí se reexporta todo y se
 * sustituyen `DialogContent` y `DialogFooter`: se desactiva su botón de
 * cierre y se añade uno equivalente con el texto de i18n
 * (`common.ui.close`). `@pymekit/ui/dialog` apunta a este fichero.
 *
 * [TFG] ADR-021: nada visible (ni accesible) en inglés.
 */
import * as React from 'react';

import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { XIcon } from 'lucide-react';
import { useTranslations } from 'use-intl';

import { Button } from '../shadcn/button';
import {
  DialogContent as ShadcnDialogContent,
  DialogFooter as ShadcnDialogFooter,
} from '../shadcn/dialog';

export * from '../shadcn/dialog';

function DialogContent({
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof ShadcnDialogContent>) {
  const t = useTranslations('common.ui');

  return (
    <ShadcnDialogContent showCloseButton={false} {...props}>
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close
          data-slot="dialog-close"
          render={
            <Button
              variant="ghost"
              className="absolute top-2 right-2"
              size="icon-sm"
            />
          }
        >
          <XIcon />
          <span className="sr-only">{t('close')}</span>
        </DialogPrimitive.Close>
      )}
    </ShadcnDialogContent>
  );
}

function DialogFooter({
  children,
  showCloseButton = false,
  ...props
}: React.ComponentProps<typeof ShadcnDialogFooter>) {
  const t = useTranslations('common.ui');

  return (
    <ShadcnDialogFooter {...props}>
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>
          {t('close')}
        </DialogPrimitive.Close>
      )}
    </ShadcnDialogFooter>
  );
}

export { DialogContent, DialogFooter };
