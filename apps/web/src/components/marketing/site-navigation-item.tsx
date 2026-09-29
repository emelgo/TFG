import { Link, useLocation } from '@tanstack/react-router';

import { NavigationMenuItem } from '@pymekit/ui/navigation-menu';
import { cn, isRouteActive } from '@pymekit/ui/utils';

const getClassName = (path: string, currentPathName: string) => {
  const isActive = isRouteActive(path, currentPathName);

  return cn(
    `inline-flex w-max text-sm font-medium transition-colors duration-300`,
    {
      'dark:text-gray-300 dark:hover:text-white': !isActive,
      'text-current dark:text-white': isActive,
    },
  );
};

export function SiteNavigationItem({
  path,
  children,
}: React.PropsWithChildren<{
  path: string;
}>) {
  const { pathname } = useLocation();
  const className = getClassName(path, pathname);

  return (
    <NavigationMenuItem key={path}>
      <Link className={className} to={path}>
        {children}
      </Link>
    </NavigationMenuItem>
  );
}
