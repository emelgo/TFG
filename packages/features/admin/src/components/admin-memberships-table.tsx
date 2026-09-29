'use client';

import { Link } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';

import type { Tables } from '@pymekit/supabase/database';
import { DataTable } from '@pymekit/ui/enhanced-data-table';

type Membership = Tables<'accounts_memberships'> & {
  account: {
    id: string;
    name: string;
  };
};

export function AdminMembershipsTable(props: { memberships: Membership[] }) {
  return <DataTable data={props.memberships} columns={getColumns()} />;
}

function getColumns(): ColumnDef<Membership>[] {
  return [
    {
      header: 'Team',
      enableSorting: false,
      cell: ({ row }) => {
        return (
          <Link
            className={'hover:underline'}
            to={`/admin/accounts/${row.original.account_id}` as string}
          >
            {row.original.account.name}
          </Link>
        );
      },
    },
    {
      header: 'Role',
      accessorKey: 'account_role',
      enableSorting: false,
    },
    {
      header: 'Created At',
      accessorKey: 'created_at',
      enableSorting: false,
      cell: ({ row }) => {
        return renderDate(row.original.created_at);
      },
    },
    {
      header: 'Updated At',
      accessorKey: 'updated_at',
      enableSorting: false,
      cell: ({ row }) => {
        return renderDate(row.original.updated_at);
      },
    },
  ];
}

function renderDate(date: string) {
  return <span className={'text-xs'}>{new Date(date).toTimeString()}</span>;
}
