'use client';

/**
 * Barra lateral de shadcn con los textos accesibles en español.
 *
 * `src/shadcn/sidebar.tsx` queda igual que el original, que trae en inglés
 * «Toggle Sidebar» (botón, carril y su `title`, visible al pasar el ratón) y
 * el título oculto de la versión móvil («Sidebar»). Aquí se reexporta todo y
 * se sustituyen esas piezas con textos de i18n (`common.ui.*`). En el móvil
 * la barra se pinta dentro de un panel lateral (`Sheet`), igual que en el
 * original. `@pymekit/ui/sidebar` apunta a este fichero.
 *
 * [TFG] ADR-021: nada visible (ni accesible) en inglés.
 */
import * as React from 'react';

import { PanelLeftIcon } from 'lucide-react';
import { useTranslations } from 'use-intl';

import { cn } from '../lib/utils';
import { Button } from '../shadcn/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '../shadcn/sheet';
import {
  Sidebar as ShadcnSidebar,
  SidebarRail as ShadcnSidebarRail,
  useSidebar,
} from '../shadcn/sidebar';

export * from '../shadcn/sidebar';

/** Ancho de la barra en el móvil (el mismo valor que usa shadcn). */
const SIDEBAR_WIDTH_MOBILE = '18rem';

function Sidebar({
  side = 'left',
  collapsible = 'offcanvas',
  children,
  dir,
  ...props
}: React.ComponentProps<typeof ShadcnSidebar>) {
  const t = useTranslations('common.ui');
  const { isMobile, openMobile, setOpenMobile } = useSidebar();

  // En escritorio (o sin plegado) no hay textos: se usa la de shadcn tal cual.
  if (!isMobile || collapsible === 'none') {
    return (
      <ShadcnSidebar side={side} collapsible={collapsible} dir={dir} {...props}>
        {children}
      </ShadcnSidebar>
    );
  }

  return (
    <Sheet open={openMobile} onOpenChange={setOpenMobile} {...props}>
      <SheetContent
        dir={dir}
        data-sidebar="sidebar"
        data-slot="sidebar"
        data-mobile="true"
        className="bg-sidebar text-sidebar-foreground w-(--sidebar-width) p-0 [&>button]:hidden"
        style={
          {
            '--sidebar-width': SIDEBAR_WIDTH_MOBILE,
          } as React.CSSProperties
        }
        side={side}
      >
        <SheetHeader className="sr-only">
          <SheetTitle>{t('sidebar')}</SheetTitle>
          <SheetDescription>{t('sidebarDescription')}</SheetDescription>
        </SheetHeader>
        <div className="flex h-full w-full flex-col">{children}</div>
      </SheetContent>
    </Sheet>
  );
}

function SidebarTrigger({
  className,
  onClick,
  ...props
}: React.ComponentProps<typeof Button>) {
  const t = useTranslations('common.ui');
  const { toggleSidebar } = useSidebar();

  return (
    <Button
      data-sidebar="trigger"
      data-slot="sidebar-trigger"
      variant="ghost"
      size="icon-sm"
      className={cn(className)}
      onClick={(event) => {
        onClick?.(event);
        toggleSidebar();
      }}
      {...props}
    >
      <PanelLeftIcon />
      <span className="sr-only">{t('toggleSidebar')}</span>
    </Button>
  );
}

function SidebarRail(props: React.ComponentProps<typeof ShadcnSidebarRail>) {
  const t = useTranslations('common.ui');

  return (
    <ShadcnSidebarRail
      aria-label={t('toggleSidebar')}
      title={t('toggleSidebar')}
      {...props}
    />
  );
}

export { Sidebar, SidebarRail, SidebarTrigger };
