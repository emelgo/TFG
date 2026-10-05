/**
 * Listado de usuarios de Auth del CMS (`/admin/cms/users`).
 *
 * Recibe la página ya cargada por la ruta (`useSuspenseQuery`) y se limita a
 * presentarla: búsqueda y paginación son cambios de la URL (`onSearchChange`),
 * un clic en una fila abre la ficha del usuario y, con permisos, ofrece:
 *
 *  - «Añadir usuario» (crear o invitar) con `auth_user:insert`;
 *  - selección y acciones múltiples (bloquear, desbloquear, restablecer
 *    contraseña con `update`; borrar con `delete`). Los usuarios protegidos
 *    (uno mismo, super-admins y personal del CMS) no se pueden seleccionar.
 *
 * Qué se muestra lo deciden los `permissions` que devuelve la API; la API
 * vuelve a comprobar el permiso y la protección de cada usuario al actuar.
 */
import { useMemo, useState } from 'react';

import { useNavigate } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import {
  BanIcon,
  ChevronDownIcon,
  MailIcon,
  SearchIcon,
  ShieldIcon,
  TrashIcon,
  UnlockIcon,
  UserPlusIcon,
  UsersIcon,
  XIcon,
} from 'lucide-react';
import { useTranslations } from 'use-intl';

import { useDateFormatter } from '@pymekit/cms-formatters/hooks';
import type { CmsUserListItem, CmsUsersList } from '@pymekit/cms-ui-core/api';
import { useIsHydrated } from '@pymekit/cms-ui-core/hydration';
import { CMS_SECTION_PATHS } from '@pymekit/cms-ui-core/sections';
import type { UsersBatchAction } from '@pymekit/cms-ui-core/users-api';
import { Badge } from '@pymekit/ui/badge';
import { Button } from '@pymekit/ui/button';
import { Checkbox } from '@pymekit/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@pymekit/ui/dropdown-menu';
import { DataTable } from '@pymekit/ui/enhanced-data-table';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@pymekit/ui/input-group';
import { PageSummary } from '@pymekit/ui/page';
import { cn } from '@pymekit/ui/utils';

import { getBatchActionTargets, isUserActionable } from '../utils/user-status';
import { type UsersSearch, withUsersSearch } from '../utils/users-search';
import { BatchUsersActionDialog } from './batch-users-action-dialog';
import { CreateUserDialog } from './create-user-dialog';
import { InviteUserDialog } from './invite-user-dialog';

type DialogState =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'invite' }
  | { kind: 'batch'; action: UsersBatchAction };

export function UsersTableView(props: {
  data: CmsUsersList;
  search: UsersSearch;
  onSearchChange: (search: UsersSearch) => void;
  isLoading?: boolean;
}) {
  const t = useTranslations('cms.usersExplorer');
  const hydrated = useIsHydrated();
  const navigate = useNavigate();
  const formatDate = useDateFormatter();
  const { users, permissions, pagination } = props.data;

  // Un único objeto de estado para el diálogo abierto y otro para la
  // selección (id → usuario), que se conserva al cambiar de página.
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });
  const [selected, setSelected] = useState<Record<string, CmsUserListItem>>({});

  const selectedUsers = useMemo(() => Object.values(selected), [selected]);
  const canSelect = permissions.can_update || permissions.can_delete;
  const selectableOnPage = users.filter(isUserActionable);

  const allOnPageSelected =
    selectableOnPage.length > 0 &&
    selectableOnPage.every((user) => selected[user.id]);

  const toggleUser = (user: CmsUserListItem, checked: boolean) => {
    setSelected((previous) => {
      const next = { ...previous };

      if (checked) {
        next[user.id] = user;
      } else {
        delete next[user.id];
      }

      return next;
    });
  };

  const togglePage = (checked: boolean) => {
    setSelected((previous) => {
      const next = { ...previous };

      for (const user of selectableOnPage) {
        if (checked) {
          next[user.id] = user;
        } else {
          delete next[user.id];
        }
      }

      return next;
    });
  };

  const batchActions: Array<{
    action: UsersBatchAction;
    icon: React.ReactNode;
    allowed: boolean;
  }> = [
    { action: 'ban', icon: <BanIcon />, allowed: permissions.can_update },
    { action: 'unban', icon: <UnlockIcon />, allowed: permissions.can_update },
    {
      action: 'resetPassword',
      icon: <MailIcon />,
      allowed: permissions.can_update,
    },
    { action: 'delete', icon: <TrashIcon />, allowed: permissions.can_delete },
  ];

  // Las columnas dependen de la selección, así que se recalculan en cada
  // render; son pocas y baratas.
  const columns: ColumnDef<CmsUserListItem>[] = [
    ...(canSelect
      ? [
          {
            id: 'select',
            header: () => (
              <Checkbox
                data-testid="users-select-page"
                aria-label={t('table.selectPage')}
                checked={allOnPageSelected}
                disabled={selectableOnPage.length === 0}
                onCheckedChange={(checked) => togglePage(checked === true)}
              />
            ),
            cell: ({ row }: { row: { original: CmsUserListItem } }) => (
              <span onClick={(event) => event.stopPropagation()}>
                <Checkbox
                  data-testid="users-select-row"
                  aria-label={t('table.selectRow')}
                  disabled={!isUserActionable(row.original)}
                  checked={Boolean(selected[row.original.id])}
                  onCheckedChange={(checked) =>
                    toggleUser(row.original, checked === true)
                  }
                />
              </span>
            ),
            size: 32,
          } satisfies ColumnDef<CmsUserListItem>,
        ]
      : []),
    {
      id: 'email',
      header: t('table.email'),
      cell: ({ row }) => (
        <span className="flex items-center gap-2">
          <span data-testid="user-email">
            {row.original.email ?? row.original.phone ?? row.original.id}
          </span>
          <UserBadges user={row.original} />
        </span>
      ),
    },
    {
      id: 'status',
      header: t('table.status'),
      cell: ({ row }) =>
        row.original.is_banned ? (
          <Badge variant="destructive">{t('status.banned')}</Badge>
        ) : (
          <Badge variant="outline">{t('status.active')}</Badge>
        ),
    },
    {
      id: 'created_at',
      header: t('table.createdAt'),
      cell: ({ row }) =>
        formatDate(new Date(row.original.created_at), 'dd MMM yyyy, HH:mm'),
    },
    {
      id: 'last_sign_in_at',
      header: t('table.lastSignIn'),
      cell: ({ row }) =>
        row.original.last_sign_in_at
          ? formatDate(
              new Date(row.original.last_sign_in_at),
              'dd MMM yyyy, HH:mm',
            )
          : t('common.never'),
    },
  ];

  const closeDialog = () => setDialog({ kind: 'none' });

  return (
    <div
      className="flex flex-col gap-3"
      data-testid="users-explorer"
      data-hydrated={hydrated}
    >
      <div className="flex items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-sm font-medium">
          <UsersIcon className="text-muted-foreground h-4 w-4" />
          {t('title')}
        </h1>

        {permissions.can_insert ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button size="sm" data-testid="add-user-button" />}
            >
              <UserPlusIcon className="h-3.5 w-3.5" />
              {t('actions.addUser')}
              <ChevronDownIcon className="h-3.5 w-3.5" />
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end">
              <DropdownMenuItem
                data-testid="create-user-menu-item"
                onClick={() => setDialog({ kind: 'create' })}
              >
                <UserPlusIcon className="h-3.5 w-3.5" />
                {t('actions.createUser')}
              </DropdownMenuItem>
              <DropdownMenuItem
                data-testid="invite-user-menu-item"
                onClick={() => setDialog({ kind: 'invite' })}
              >
                <MailIcon className="h-3.5 w-3.5" />
                {t('actions.inviteUser')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>

      <PageSummary>{t('summary')}</PageSummary>

      <UsersSearchInput
        // La clave reinicia el campo cuando la búsqueda cambia desde fuera
        // (por ejemplo, con «atrás»), sin sincronizar estado con efectos.
        key={props.search.search ?? ''}
        value={props.search.search ?? ''}
        onSearch={(term) => props.onSearchChange(withUsersSearch(term))}
      />

      {selectedUsers.length > 0 ? (
        <div
          data-testid="users-batch-toolbar"
          className="bg-muted/50 flex flex-wrap items-center gap-2 rounded-md border px-2 py-1.5"
        >
          <span className="text-muted-foreground text-xs">
            {t('batch.selected', { count: selectedUsers.length })}
          </span>

          {batchActions
            .filter(
              (item) =>
                item.allowed &&
                getBatchActionTargets(selectedUsers, item.action).length > 0,
            )
            .map((item) => (
              <Button
                key={item.action}
                size="sm"
                variant={item.action === 'delete' ? 'destructive' : 'outline'}
                data-testid={`users-batch-${item.action}`}
                onClick={() =>
                  setDialog({ kind: 'batch', action: item.action })
                }
              >
                {item.icon}
                {t(`batch.actions.${item.action}`)}
              </Button>
            ))}

          <Button
            size="sm"
            variant="ghost"
            data-testid="users-batch-clear"
            onClick={() => setSelected({})}
          >
            <XIcon className="h-3.5 w-3.5" />
            {t('batch.clear')}
          </Button>
        </div>
      ) : null}

      <DataTable<CmsUserListItem>
        className={cn(
          'transition-opacity duration-300',
          props.isLoading && 'opacity-50',
        )}
        columns={columns}
        data={users}
        getRowId={(user) => user.id}
        pageIndex={pagination.pageIndex}
        pageSize={pagination.pageSize}
        pageCount={pagination.pageCount}
        onPaginationChange={({ pageIndex }) =>
          props.onSearchChange({
            ...props.search,
            page: pageIndex > 0 ? pageIndex + 1 : undefined,
          })
        }
        onClick={({ row }) =>
          void navigate({
            href: `${CMS_SECTION_PATHS.users}/${row.original.id}`,
          })
        }
        noResultsMessage={t('table.noResults')}
      />

      <CreateUserDialog
        open={dialog.kind === 'create'}
        onOpenChange={(open) => (open ? null : closeDialog())}
      />

      <InviteUserDialog
        open={dialog.kind === 'invite'}
        onOpenChange={(open) => (open ? null : closeDialog())}
      />

      {dialog.kind === 'batch' ? (
        <BatchUsersActionDialog
          action={dialog.action}
          users={getBatchActionTargets(selectedUsers, dialog.action)}
          onOpenChange={(open) => (open ? null : closeDialog())}
          onDone={() => {
            setSelected({});
            closeDialog();
          }}
        />
      ) : null}
    </div>
  );
}

/** Insignias de super-admin y de personal del CMS. */
export function UserBadges(props: {
  user: Pick<CmsUserListItem, 'is_super_admin' | 'has_cms_access' | 'is_self'>;
}) {
  const t = useTranslations('cms.usersExplorer');

  return (
    <>
      {props.user.is_super_admin ? (
        <Badge variant="outline" data-testid="user-badge-super-admin">
          <ShieldIcon className="h-3 w-3" />
          {t('badges.superAdmin')}
        </Badge>
      ) : props.user.has_cms_access ? (
        <Badge variant="outline" data-testid="user-badge-cms-staff">
          <ShieldIcon className="h-3 w-3" />
          {t('badges.cmsStaff')}
        </Badge>
      ) : null}

      {props.user.is_self ? (
        <Badge variant="secondary">{t('badges.you')}</Badge>
      ) : null}
    </>
  );
}

function UsersSearchInput(props: {
  value: string;
  onSearch: (term: string) => void;
}) {
  const t = useTranslations('cms.usersExplorer');
  const [term, setTerm] = useState(props.value);

  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        props.onSearch(term);
      }}
    >
      <InputGroup>
        <InputGroupAddon>
          <SearchIcon className="h-4 w-4" />
        </InputGroupAddon>

        <InputGroupInput
          name="search"
          data-testid="users-search-input"
          placeholder={t('table.searchPlaceholder')}
          value={term}
          onChange={(event) => setTerm(event.target.value)}
        />

        {props.value ? (
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              data-testid="users-search-clear"
              onClick={() => props.onSearch('')}
            >
              <XIcon className="h-3 w-3" />
              {t('table.clearSearch')}
            </InputGroupButton>
          </InputGroupAddon>
        ) : null}
      </InputGroup>
    </form>
  );
}
