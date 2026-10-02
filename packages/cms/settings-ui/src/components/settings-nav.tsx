/**
 * Navegación entre las pestañas de Ajustes del CMS (F2.7a).
 *
 * Recibe qué pestañas puede ver el usuario (`getCmsSettingsTabVisibility`,
 * calculado a partir de `GET /v1/account`) y solo pinta esas. Ocultarlas es
 * ayuda visual: cada ruta vuelve a comprobar el permiso (404) y la API
 * responde 403 con su código si alguien la llama igualmente.
 */
import { Link } from '@tanstack/react-router';
import {
  DatabaseIcon,
  KeyRoundIcon,
  SettingsIcon,
  ShieldIcon,
  UsersIcon,
} from 'lucide-react';
import { useTranslations } from 'use-intl';

import {
  CMS_SETTINGS_TABS,
  CMS_SETTINGS_TAB_PATHS,
  type CmsSettingsTab,
} from '@pymekit/cms-ui-core/sections';
import { cn } from '@pymekit/ui/utils';

const TAB_ICONS = {
  general: SettingsIcon,
  authentication: ShieldIcon,
  members: UsersIcon,
  permissions: KeyRoundIcon,
  resources: DatabaseIcon,
} satisfies Record<CmsSettingsTab, unknown>;

export function SettingsNav(props: {
  visibility: Record<CmsSettingsTab, boolean>;
}) {
  const t = useTranslations('cms.settings.tabs');

  return (
    <nav
      aria-label={t('label')}
      data-testid="cms-settings-tabs"
      className="flex shrink-0 flex-row gap-1 overflow-x-auto md:w-48 md:flex-col"
    >
      {CMS_SETTINGS_TABS.filter((tab) => props.visibility[tab]).map((tab) => {
        const Icon = TAB_ICONS[tab];

        return (
          <Link
            key={tab}
            to={CMS_SETTINGS_TAB_PATHS[tab]}
            data-testid={`cms-settings-tab-${tab}`}
            className={cn(
              'text-muted-foreground hover:bg-muted hover:text-foreground flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors',
            )}
            activeProps={{
              className: 'bg-muted text-foreground',
              'aria-current': 'page',
            }}
          >
            <Icon className="h-3.5 w-3.5" />
            {t(tab)}
          </Link>
        );
      })}
    </nav>
  );
}
