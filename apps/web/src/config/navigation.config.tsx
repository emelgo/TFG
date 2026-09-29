import { Home } from 'lucide-react';
import * as z from 'zod';

import { NavigationConfigSchema } from '@pymekit/ui/navigation-schema';

import pathsConfig from '#/config/paths.config.ts';

const iconClasses = 'w-4';

const routes = [
  {
    label: 'common.routes.application',
    children: [
      {
        label: 'common.routes.dashboard',
        path: pathsConfig.app.home,
        Icon: <Home className={iconClasses} />,
        highlightMatch: `${pathsConfig.app.home}$`,
      },
    ],
  },
] satisfies z.output<typeof NavigationConfigSchema>['routes'];

/**
 * Navigation for the dashboard shell. The active account (personal or team) is
 * resolved from the DB, so a single slug-free config serves both.
 */
export const workspaceNavigationConfig = NavigationConfigSchema.parse({
  routes,
  style: import.meta.env.VITE_USER_NAVIGATION_STYLE,
  sidebarCollapsed: import.meta.env.VITE_HOME_SIDEBAR_COLLAPSED,
  sidebarCollapsedStyle: import.meta.env.VITE_SIDEBAR_COLLAPSIBLE_STYLE,
});
