/**
 * Ajustes > Permisos: roles, grupos de permisos y permisos del CMS (F2.7b).
 *
 * Recibe el resumen ya cargado por la ruta (`useSuspenseQuery`) y lo
 * presenta en tres pestañas. La pestaña y el filtro de texto viven en la
 * URL (`RbacSearchSchema`), así que cambiarlos es navegar
 * (`onSearchChange`). Cada pestaña solo aparece con su permiso (roles:
 * `role:select`; grupos y permisos: `permission:select`) y los botones de
 * crear, según lo que devuelve la API en `access`; un clic en una fila abre
 * su ficha.
 *
 * [TFG] RF-09 · ADR-013 · ADR-014: pantalla portada y reescrita con la pila
 * de la web (TanStack Router/Query/Form, use-intl, `@pymekit/ui`).
 */
import { useState } from 'react';

import { useNavigate } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { PlusIcon, SearchIcon, ShieldCheckIcon } from 'lucide-react';
import { useTranslations } from 'use-intl';

import type {
  CmsRbacGroupListItem,
  CmsRbacOverview,
  CmsRbacPermission,
  CmsRbacRoleListItem,
} from '@pymekit/cms-ui-core/api';
import { useIsHydrated } from '@pymekit/cms-ui-core/hydration';
import { Badge } from '@pymekit/ui/badge';
import { Button } from '@pymekit/ui/button';
import { DataTable } from '@pymekit/ui/enhanced-data-table';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@pymekit/ui/input-group';
import { Tabs, TabsList, TabsTrigger } from '@pymekit/ui/tabs';

import {
  RBAC_TABS,
  type RbacSearch,
  type RbacTab,
  filterByQuery,
  resolveRbacTab,
} from '../../utils/rbac-forms';
import { PermissionFormDialog } from './permission-form-dialog';
import { GroupFormDialog, RoleFormDialog } from './rbac-form-dialogs';
import { PermissionSummary, SystemBadge } from './rbac-shared';

export function PermissionsSettingsView(props: {
  data: CmsRbacOverview;
  search: RbacSearch;
  onSearchChange: (search: RbacSearch) => void;
}) {
  const t = useTranslations('cms.settings.permissions');
  const hydrated = useIsHydrated();
  const navigate = useNavigate();
  const { access } = props.data;
  const [dialog, setDialog] = useState<'none' | RbacTab>('none');
  const closeDialog = (open: boolean) => (open ? null : setDialog('none'));

  const tab = resolveRbacTab(props.search.tab, access);
  const visibleTabs = RBAC_TABS.filter((item) =>
    item === 'roles' ? access.canReadRoles : access.canReadPermissions,
  );

  const canCreate =
    tab === 'roles'
      ? access.canCreateRole
      : tab === 'groups'
        ? access.canCreateGroup
        : access.canCreatePermission;

  return (
    <div
      className="flex flex-col gap-3"
      data-testid="rbac-view"
      data-hydrated={hydrated}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-sm font-medium">
          <ShieldCheckIcon className="text-muted-foreground h-4 w-4" />
          {t('title')}
        </h1>

        {canCreate ? (
          <Button
            size="sm"
            data-testid={`rbac-create-${tab === 'roles' ? 'role' : tab === 'groups' ? 'group' : 'permission'}`}
            onClick={() => setDialog(tab)}
          >
            <PlusIcon className="h-3.5 w-3.5" />
            {t(`create.${tab}`)}
          </Button>
        ) : null}
      </div>

      <p className="text-muted-foreground text-xs">{t('description')}</p>

      <Tabs
        value={tab}
        onValueChange={(value) =>
          props.onSearchChange({ tab: value as RbacTab, q: undefined })
        }
      >
        <TabsList variant="line" data-testid="rbac-tabs">
          {visibleTabs.map((item) => (
            <TabsTrigger
              key={item}
              value={item}
              data-testid={`rbac-tab-${item}`}
            >
              {t(`tabs.${item}`)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <SearchInput
        key={`${tab}:${props.search.q ?? ''}`}
        value={props.search.q ?? ''}
        onSearch={(q) => props.onSearchChange({ tab, q: q || undefined })}
      />

      {tab === 'roles' ? (
        <RolesTable
          roles={filterByQuery(props.data.roles, props.search.q, (role) => [
            role.name,
            role.description,
          ])}
          onOpen={(id) =>
            void navigate({
              to: '/admin/cms/settings/permissions/roles/$id',
              params: { id },
            })
          }
        />
      ) : null}

      {tab === 'groups' ? (
        <GroupsTable
          groups={filterByQuery(props.data.groups, props.search.q, (group) => [
            group.name,
            group.description,
          ])}
          onOpen={(id) =>
            void navigate({
              to: '/admin/cms/settings/permissions/groups/$id',
              params: { id },
            })
          }
        />
      ) : null}

      {tab === 'permissions' ? (
        <PermissionsTable
          permissions={filterByQuery(
            props.data.permissions,
            props.search.q,
            (permission) => [
              permission.name,
              permission.description,
              permission.schemaName,
              permission.tableName,
              permission.systemResource,
              permission.bucketName,
            ],
          )}
          onOpen={(id) =>
            void navigate({
              to: '/admin/cms/settings/permissions/$id',
              params: { id },
            })
          }
        />
      ) : null}

      {dialog === 'roles' ? (
        <RoleFormDialog
          open
          onOpenChange={closeDialog}
          maxRank={access.maxRank}
          takenRanks={props.data.roles.map((role) => role.rank)}
          onSaved={(id) =>
            void navigate({
              to: '/admin/cms/settings/permissions/roles/$id',
              params: { id },
            })
          }
        />
      ) : null}

      {dialog === 'groups' ? (
        <GroupFormDialog
          open
          onOpenChange={closeDialog}
          onSaved={(id) =>
            void navigate({
              to: '/admin/cms/settings/permissions/groups/$id',
              params: { id },
            })
          }
        />
      ) : null}

      {dialog === 'permissions' ? (
        <PermissionFormDialog
          open
          onOpenChange={closeDialog}
          onSaved={(id) =>
            void navigate({
              to: '/admin/cms/settings/permissions/$id',
              params: { id },
            })
          }
        />
      ) : null}
    </div>
  );
}

function SearchInput(props: { value: string; onSearch: (q: string) => void }) {
  const t = useTranslations('cms.settings.permissions');
  const [term, setTerm] = useState(props.value);

  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        props.onSearch(term.trim());
      }}
    >
      <InputGroup>
        <InputGroupAddon>
          <SearchIcon className="h-4 w-4" />
        </InputGroupAddon>
        <InputGroupInput
          name="q"
          data-testid="rbac-search-input"
          placeholder={t('searchPlaceholder')}
          maxLength={100}
          value={term}
          onChange={(event) => setTerm(event.target.value)}
        />
      </InputGroup>
    </form>
  );
}

function RolesTable(props: {
  roles: CmsRbacRoleListItem[];
  onOpen: (id: string) => void;
}) {
  const t = useTranslations('cms.settings.permissions');

  const columns: ColumnDef<CmsRbacRoleListItem>[] = [
    {
      id: 'name',
      header: t('table.name'),
      cell: ({ row }) => (
        <span className="flex flex-col">
          <span
            className="flex items-center gap-2 font-medium"
            data-testid="rbac-role-name"
          >
            {row.original.name}
            {row.original.isSystem ? <SystemBadge /> : null}
          </span>
          {row.original.description ? (
            <span className="text-muted-foreground text-xs">
              {row.original.description}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      id: 'rank',
      header: t('table.rank'),
      cell: ({ row }) => <Badge variant="secondary">{row.original.rank}</Badge>,
    },
    {
      id: 'members',
      header: t('table.members'),
      cell: ({ row }) => row.original.memberCount,
    },
  ];

  return (
    <DataTable<CmsRbacRoleListItem>
      columns={columns}
      data={props.roles}
      getRowId={(role) => role.id}
      tableProps={{ 'data-testid': 'rbac-roles-table' }}
      onClick={({ row }) => props.onOpen(row.original.id)}
      noResultsMessage={t('table.noResults')}
    />
  );
}

function GroupsTable(props: {
  groups: CmsRbacGroupListItem[];
  onOpen: (id: string) => void;
}) {
  const t = useTranslations('cms.settings.permissions');

  const columns: ColumnDef<CmsRbacGroupListItem>[] = [
    {
      id: 'name',
      header: t('table.name'),
      cell: ({ row }) => (
        <span className="flex flex-col">
          <span
            className="flex items-center gap-2 font-medium"
            data-testid="rbac-group-name"
          >
            {row.original.name}
            {row.original.isSystem ? <SystemBadge /> : null}
          </span>
          {row.original.description ? (
            <span className="text-muted-foreground text-xs">
              {row.original.description}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      id: 'permissions',
      header: t('table.permissions'),
      cell: ({ row }) => row.original.permissionCount,
    },
  ];

  return (
    <DataTable<CmsRbacGroupListItem>
      columns={columns}
      data={props.groups}
      getRowId={(group) => group.id}
      tableProps={{ 'data-testid': 'rbac-groups-table' }}
      onClick={({ row }) => props.onOpen(row.original.id)}
      noResultsMessage={t('table.noResults')}
    />
  );
}

function PermissionsTable(props: {
  permissions: CmsRbacPermission[];
  onOpen: (id: string) => void;
}) {
  const t = useTranslations('cms.settings.permissions');

  const columns: ColumnDef<CmsRbacPermission>[] = [
    {
      id: 'name',
      header: t('table.name'),
      cell: ({ row }) => (
        <span className="flex flex-col">
          <span
            className="flex items-center gap-2 font-medium"
            data-testid="rbac-permission-name"
          >
            {row.original.name}
            {row.original.isSystem ? <SystemBadge /> : null}
          </span>
          {row.original.description ? (
            <span className="text-muted-foreground text-xs">
              {row.original.description}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      id: 'definition',
      header: t('table.definition'),
      cell: ({ row }) => <PermissionSummary permission={row.original} />,
    },
  ];

  return (
    <DataTable<CmsRbacPermission>
      columns={columns}
      data={props.permissions}
      getRowId={(permission) => permission.id}
      tableProps={{ 'data-testid': 'rbac-permissions-table' }}
      onClick={({ row }) => props.onOpen(row.original.id)}
      noResultsMessage={t('table.noResults')}
    />
  );
}
