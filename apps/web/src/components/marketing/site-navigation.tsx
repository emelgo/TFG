import {
  NavigationMenu,
  NavigationMenuList,
} from '@pymekit/ui/navigation-menu';
import { Trans } from '@pymekit/ui/trans';

import { marketingNavigationLinks } from '#/config/marketing-navigation.config.tsx';

import { MobileSiteNavigation } from './mobile-site-navigation.tsx';
import { SiteNavigationItem } from './site-navigation-item.tsx';

export function SiteNavigation() {
  const desktopItems = marketingNavigationLinks
    .filter((item) => item.showOn !== 'mobile')
    .map((item) => (
      <SiteNavigationItem key={item.path} path={item.path}>
        <Trans i18nKey={item.label} />
      </SiteNavigationItem>
    ));

  return (
    <>
      <div className={'hidden items-center justify-center md:flex'}>
        <NavigationMenu>
          <NavigationMenuList className={'gap-x-2.5'}>
            {desktopItems}
          </NavigationMenuList>
        </NavigationMenu>
      </div>

      <div className={'flex justify-start sm:items-center md:hidden'}>
        <MobileSiteNavigation links={marketingNavigationLinks} />
      </div>
    </>
  );
}
