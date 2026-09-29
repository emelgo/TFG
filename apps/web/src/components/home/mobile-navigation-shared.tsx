'use client';

import { Link } from '@tanstack/react-router';
import { LogOut } from 'lucide-react';

import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@pymekit/ui/dropdown-menu';
import { Trans } from '@pymekit/ui/trans';

export function MobileNavDropdownLink(
  props: React.PropsWithChildren<{
    path: string;
    label: string;
    Icon?: React.ReactNode;
  }>,
) {
  return (
    <DropdownMenuItem
      render={
        <Link
          to={props.path}
          className={'flex h-12 w-full items-center space-x-4'}
        >
          {props.Icon}

          <span>
            <Trans i18nKey={props.label} defaults={props.label} />
          </span>
        </Link>
      }
    />
  );
}

export function MobileNavSignOutItem(props: { onSignOut: () => unknown }) {
  return (
    <DropdownMenuItem
      className={'flex h-12 w-full items-center space-x-4'}
      onClick={props.onSignOut}
    >
      <LogOut className={'h-5'} />

      <span>
        <Trans i18nKey={'auth.signOut'} defaults={'Sign out'} />
      </span>
    </DropdownMenuItem>
  );
}

export function MobileNavRouteLinks(props: {
  routes: Array<
    | {
        children: Array<{
          path: string;
          label: string;
          Icon?: React.ReactNode;
        }>;
      }
    | { divider: true }
  >;
}) {
  return props.routes.map((item, index) => {
    if ('children' in item) {
      return item.children.map((child) => (
        <MobileNavDropdownLink
          key={child.path}
          Icon={child.Icon}
          path={child.path}
          label={child.label}
        />
      ));
    }

    if ('divider' in item) {
      return <DropdownMenuSeparator key={index} />;
    }
  });
}
