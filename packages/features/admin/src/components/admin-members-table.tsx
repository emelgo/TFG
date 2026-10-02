'use client';

import { Link } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { useTranslations } from 'use-intl';

import type { Database } from '@pymekit/supabase/database';
import { DataTable } from '@pymekit/ui/enhanced-data-table';
import { ProfileAvatar } from '@pymekit/ui/profile-avatar';

type Translator = ReturnType<typeof useTranslations>;

type Memberships =
  Database['public']['Functions']['get_account_members']['Returns'][number];

export function AdminMembersTable(props: { members: Memberships[] }) {
  const t = useTranslations('admin');

  return <DataTable data={props.members} columns={getColumns(t)} />;
}

function getColumns(t: Translator): ColumnDef<Memberships>[] {
  return [
    {
      header: t('name'),
      enableSorting: false,
      cell: ({ row }) => {
        const name = row.original.name ?? row.original.email;

        return (
          <div className={'flex items-center space-x-2'}>
            <div>
              <ProfileAvatar
                pictureUrl={row.original.picture_url}
                displayName={name}
              />
            </div>

            <Link
              className={'hover:underline'}
              to={`/admin/accounts/${row.original.id}` as string}
            >
              <span>{name}</span>
            </Link>
          </div>
        );
      },
    },
    {
      header: t('email'),
      accessorKey: 'email',
      enableSorting: false,
    },
    {
      header: t('role'),
      enableSorting: false,
      cell: ({ row }) => {
        return row.original.role;
      },
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
