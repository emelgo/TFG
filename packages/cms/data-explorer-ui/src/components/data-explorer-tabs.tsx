/**
 * Barra de pestañas del explorador de datos.
 *
 * Cada pestaña recuerda una tabla con sus filtros (su ruta completa). Pulsar
 * una pestaña navega a esa ruta; la «x» la cierra y, si era la activa, se
 * pasa a la última que quede o a la portada del CMS. «Nueva pestaña» abre la
 * portada para elegir otra tabla sin perder las abiertas.
 *
 * Las pestañas se leen de `localStorage` (ver `store/tabs-store.ts`), así que
 * en el primer render del servidor la barra no aparece y se muestra justo
 * después de hidratar.
 */
import { useNavigate } from '@tanstack/react-router';
import { Plus, X } from 'lucide-react';
import { useTranslations } from 'use-intl';

import { Button } from '@pymekit/ui/button';
import { cn } from '@pymekit/ui/utils';

import { useDataExplorerTabs } from '../hooks/use-data-explorer-tabs';
import type { DataExplorerTab } from '../store/tabs-store';
import { CMS_HOME_PATH } from '../utils/paths';

export function DataExplorerTabs() {
  const t = useTranslations('cms.dataExplorer');
  const navigate = useNavigate();
  const { tabs, store } = useDataExplorerTabs();

  if (!store || tabs.length === 0) {
    return null;
  }

  const onNewTab = () => {
    const emptyTab = tabs.find((tab) => tab.isEmpty);

    if (emptyTab) {
      store.activateTab(emptyTab.id);
    } else {
      store.createTab({
        title: t('tabs.newTab'),
        path: CMS_HOME_PATH,
        isEmpty: true,
      });
    }

    void navigate({ href: CMS_HOME_PATH });
  };

  const onCloseTab = (tab: DataExplorerTab) => {
    const remaining = tabs.filter((item) => item.id !== tab.id);

    store.closeTab(tab.id);

    if (tab.isActive) {
      const next = remaining[remaining.length - 1];

      void navigate({ href: next?.path ?? CMS_HOME_PATH });
    }
  };

  return (
    <div
      data-testid="tabs-container"
      className="border-border/30 flex h-10 min-h-10 items-center border-b"
    >
      <div className="flex flex-1 items-center gap-1 overflow-x-auto">
        <Button
          data-testid="new-tab-button"
          variant="outline"
          size="sm"
          onClick={onNewTab}
          title={t('tabs.newTab')}
        >
          <Plus className="h-3 w-3" />
          <span className="hidden sm:inline">{t('tabs.newTab')}</span>
        </Button>

        {tabs.map((tab) => (
          <div
            key={tab.id}
            data-testid="tab-item"
            data-active={tab.isActive}
            className={cn(
              'group flex h-6 max-w-48 min-w-8 shrink-0 items-center gap-1 rounded-md border px-1.5 text-sm transition-colors',
              tab.isActive
                ? 'bg-background text-foreground border-foreground/20'
                : 'text-muted-foreground hover:bg-background/80 hover:text-foreground border-transparent',
              tab.isEmpty && 'italic opacity-75',
            )}
          >
            <button
              type="button"
              className="truncate text-xs font-medium"
              aria-current={tab.isActive ? 'page' : undefined}
              onClick={() => {
                if (!tab.isActive) {
                  void navigate({ href: tab.path });
                }
              }}
            >
              {tab.isEmpty ? t('tabs.newTab') : tab.title}
            </button>

            <button
              type="button"
              data-testid="tab-close-button"
              aria-label={t('tabs.closeTab', {
                title: tab.isEmpty ? t('tabs.newTab') : tab.title,
              })}
              onClick={() => onCloseTab(tab)}
              className="hover:bg-muted flex h-3.5 w-3.5 items-center justify-center rounded opacity-50 transition-opacity hover:opacity-100"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
