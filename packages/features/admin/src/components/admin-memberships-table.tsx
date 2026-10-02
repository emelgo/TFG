'use client';

import { Link } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { useTranslations } from 'use-intl';

import type { Tables } from '@pymekit/supabase/database';
import { DataTable } from '@pymekit/ui/enhanced-data-table';

type Translator = ReturnType<typeof useTranslations>;

type Membership = Tables<'accounts_memberships'> & {
  account: {
    id: string;
    name: string;
  };
};

export function AdminMembershipsTable(props: { memberships: Membership[] }) {
  const t = useTranslations('admin');

  return <DataTable data={props.memberships} columns={getColumns(t)} />;
}

function getColumns(t: Translator): ColumnDef<Membership>[] {
  return [
    {
      header: t('team'),
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
      header: t('role'),
      accessorKey: 'account_role',
      enableSorting: false,
    },
    {
      header: t('createdAt'),
      accessorKey: 'created_at',
      enableSorting: false,
      cell: ({ row }) => {
        return renderDate(row.original.created_at);
      },
    },
    {
      header: t('updatedAt'),
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
