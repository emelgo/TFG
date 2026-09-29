'use client';

import { Link } from '@tanstack/react-router';
import { Menu } from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@pymekit/ui/dropdown-menu';

export function AdminMobileNavigation() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Menu className={'h-8 w-8'} />
      </DropdownMenuTrigger>

      <DropdownMenuContent>
        <DropdownMenuItem render={<Link to={'/admin'}>Home</Link>} />

        <DropdownMenuItem
          render={<Link to={'/admin/accounts'}>Accounts</Link>}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
