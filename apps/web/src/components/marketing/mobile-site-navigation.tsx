'use client';

import { useState } from 'react';

import { Link } from '@tanstack/react-router';
import { Menu } from 'lucide-react';
import { useTranslations } from 'use-intl';

import { Button } from '@pymekit/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@pymekit/ui/drawer';

export function MobileSiteNavigation({
  links,
}: {
  links: {
    path: string;
    label: string;
    variant?: React.ComponentProps<typeof Button>['variant'];
  }[];
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger aria-label={'Open Menu'}>
        <Menu className={'h-8 w-8'} />
      </DrawerTrigger>

      <DrawerContent className={'flex w-full flex-col gap-y-2 px-8! py-8'}>
        <DrawerHeader className={'hidden'}>
          <DrawerTitle>Menu</DrawerTitle>
        </DrawerHeader>

        {links.map((item) => {
          const className = 'flex w-full items-center h-12';
          const variant = item.variant ?? 'ghost';

          return (
            <Button
              variant={variant}
              key={item.path}
              className={className}
              nativeButton={false}
              onClick={() => setOpen(false)}
              render={
                <Link className={className} to={item.path}>
                  {t(item.label)}
                </Link>
              }
            />
          );
        })}
      </DrawerContent>
    </Drawer>
  );
}
