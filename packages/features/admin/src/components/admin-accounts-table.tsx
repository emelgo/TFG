'use client';

import { useState } from 'react';

import { useForm } from '@tanstack/react-form';
import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { EllipsisVertical } from 'lucide-react';
import * as z from 'zod';

import type { Tables } from '@pymekit/supabase/database';
import { Button } from '@pymekit/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@pymekit/ui/dropdown-menu';
import { DataTable } from '@pymekit/ui/enhanced-data-table';
import { Field } from '@pymekit/ui/field';
import { Input } from '@pymekit/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@pymekit/ui/select';

import { AdminDeleteAccountDialog } from './admin-delete-account-dialog';
import { AdminDeleteUserDialog } from './admin-delete-user-dialog';
import { AdminImpersonateUserDialog } from './admin-impersonate-user-dialog';
import { AdminResetPasswordDialog } from './admin-reset-password-dialog';

type Account = Tables<'accounts'>;

const FiltersSchema = z.object({
  type: z.enum(['all', 'team', 'personal']),
  query: z.string().optional(),
});

export function AdminAccountsTable(
  props: React.PropsWithChildren<{
    data: Account[];
    pageCount: number;
    pageSize: number;
    page: number;
    filters: {
      type: 'all' | 'team' | 'personal';
      query: string;
    };
  }>,
) {
  return (
    <div className={'flex flex-col space-y-4'}>
      <div className={'flex justify-end'}>
        <AccountsTableFilters filters={props.filters} />
      </div>

      <div className={'rounded-lg border p-2'}>
        <DataTable
          pageSize={props.pageSize}
          pageIndex={props.page - 1}
          pageCount={props.pageCount}
          data={props.data}
          columns={getColumns()}
        />
      </div>
    </div>
  );
}

function AccountsTableFilters(props: {
  filters: z.output<typeof FiltersSchema>;
}) {
  const navigate = useNavigate();
  const location = useLocation();

  const onSubmit = ({ type, query }: z.output<typeof FiltersSchema>) => {
    const params = new URLSearchParams({
      account_type: type,
      query: query ?? '',
    });

    void navigate({ href: `${location.pathname}?${params.toString()}` });
  };

  const form = useForm({
    defaultValues: {
      type: props.filters?.type ?? 'all',
      query: props.filters?.query ?? '',
    } as z.input<typeof FiltersSchema>,
    validators: {
      onChange: FiltersSchema,
      onSubmit: FiltersSchema,
    },
    onSubmit: ({ value }) => onSubmit(value),
  });

  const options = {
    all: 'All Accounts',
    team: 'Team',
    personal: 'Personal',
  };

  return (
    <form
      className={'flex gap-2.5'}
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <form.Field name={'type'}>
        {(field) => (
          <Select
            value={field.state.value}
            onValueChange={(value) => {
              const type = value as z.output<typeof FiltersSchema>['type'];

              field.handleChange(type);

              onSubmit({ type, query: form.state.values.query });
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder={'Account Type'}>
                {(value: keyof typeof options) => options[value]}
              </SelectValue>
            </SelectTrigger>

            <SelectContent>
              <SelectGroup>
                <SelectLabel>Account Type</SelectLabel>

                {Object.entries(options).map(([key, value]) => (
                  <SelectItem key={key} value={key}>
                    {value}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        )}
      </form.Field>

      <form.Field name={'query'}>
        {(field) => (
          <Field className={'w-full min-w-36 md:min-w-80'}>
            <Input
              data-testid={'admin-accounts-table-filter-input'}
              className={'w-full'}
              placeholder={`Search account...`}
              name={field.name}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
            />
          </Field>
        )}
      </form.Field>

      <button type="submit" hidden />
    </form>
  );
}

function getColumns(): ColumnDef<Account>[] {
  return [
    {
      id: 'name',
      header: 'Name',
      cell: ({ row }) => {
        return (
          <Link
            className={'hover:underline'}
            to={`/admin/accounts/${row.original.id}` as string}
          >
            {row.original.name}
          </Link>
        );
      },
    },
    {
      id: 'email',
      header: 'Email',
      accessorKey: 'email',
    },
    {
      id: 'type',
      header: 'Type',
      cell: ({ row }) => {
        return row.original.is_personal_account ? 'Personal' : 'Team';
      },
    },
    {
      id: 'created_at',
      header: 'Created At',
      cell: ({ row }) => {
        return new Date(row.original.created_at!).toLocaleDateString(
          undefined,
          {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          },
        );
      },
    },
    {
      id: 'updated_at',
      header: 'Updated At',
      cell: ({ row }) => {
        return row.original.updated_at
          ? new Date(row.original.updated_at).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })
          : '-';
      },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => <ActionsCell account={row.original} />,
    },
  ];
}

type ActiveDialog =
  | 'reset-password'
  | 'impersonate'
  | 'delete-user'
  | 'delete-account'
  | null;

function ActionsCell({ account }: { account: Account }) {
  const [activeDialog, setActiveDialog] = useState<ActiveDialog>(null);
  const isPersonalAccount = account.is_personal_account;

  return (
    <div className={'flex justify-end'}>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant={'outline'} size={'icon'}>
              <EllipsisVertical className={'h-4'} />
            </Button>
          }
        />

        <DropdownMenuContent className="min-w-52">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Actions</DropdownMenuLabel>

            <DropdownMenuItem
              render={
                <Link
                  className={'h-full w-full'}
                  to={`/admin/accounts/${account.id}` as string}
                >
                  View
                </Link>
              }
            />

            {isPersonalAccount && (
              <>
                <DropdownMenuItem
                  onClick={() => setActiveDialog('reset-password')}
                >
                  Send Reset Password link
                </DropdownMenuItem>

                <DropdownMenuItem
                  onClick={() => setActiveDialog('impersonate')}
                >
                  Impersonate User
                </DropdownMenuItem>

                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setActiveDialog('delete-user')}
                >
                  Delete Personal Account
                </DropdownMenuItem>
              </>
            )}

            {!isPersonalAccount && (
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setActiveDialog('delete-account')}
              >
                Delete Team Account
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {isPersonalAccount && (
        <>
          <AdminResetPasswordDialog
            userId={account.id}
            open={activeDialog === 'reset-password'}
            onOpenChange={(open) => !open && setActiveDialog(null)}
          />

          <AdminImpersonateUserDialog
            userId={account.id}
            open={activeDialog === 'impersonate'}
            onOpenChange={(open) => !open && setActiveDialog(null)}
          />

          <AdminDeleteUserDialog
            userId={account.id}
            open={activeDialog === 'delete-user'}
            onOpenChange={(open) => !open && setActiveDialog(null)}
          />
        </>
      )}

      {!isPersonalAccount && (
        <AdminDeleteAccountDialog
          accountId={account.id}
          open={activeDialog === 'delete-account'}
          onOpenChange={(open) => !open && setActiveDialog(null)}
        />
      )}
    </div>
  );
}
