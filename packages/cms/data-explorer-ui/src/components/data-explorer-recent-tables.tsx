/**
 * Accesos rápidos a las tablas abiertas recientemente en pestañas.
 *
 * Es el «estado vacío» del explorador: se muestra en la portada del CMS
 * (donde se elige una tabla) junto a la barra de pestañas, para retomar el
 * trabajo con los filtros que se tenían. Solo aparece en el navegador y si
 * hay alguna pestaña con tabla.
 */
import { Link } from '@tanstack/react-router';
import { History } from 'lucide-react';
import { useTranslations } from 'use-intl';

import { Button } from '@pymekit/ui/button';

import { useDataExplorerTabs } from '../hooks/use-data-explorer-tabs';

const MAX_RECENT_TABLES = 5;

export function DataExplorerRecentTables() {
  const t = useTranslations('cms.dataExplorer');
  const { tabs } = useDataExplorerTabs();

  const recent = tabs.filter((tab) => !tab.isEmpty).slice(-MAX_RECENT_TABLES);

  if (recent.length === 0) {
    return null;
  }

  return (
    <section className="flex flex-col gap-3" data-testid="recent-tables">
      <h2 className="text-muted-foreground flex items-center gap-2 text-sm">
        <History className="h-3.5 w-3.5" />
        <span>{t('emptyState.recentTables')}</span>
      </h2>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {recent.map((tab) => (
          <Button
            key={tab.id}
            nativeButton={false}
            variant="outline"
            className="h-auto w-full flex-col items-start justify-start px-3 py-2 text-left"
            render={<Link to={tab.path} />}
          >
            <span className="text-sm font-medium">{tab.title}</span>

            {tab.schema && tab.table && (
              <span className="text-muted-foreground font-mono text-xs">
                {tab.schema}.{tab.table}
              </span>
            )}
          </Button>
        ))}
      </div>
    </section>
  );
}
