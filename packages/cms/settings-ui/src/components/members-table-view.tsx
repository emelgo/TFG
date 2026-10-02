/**
 * Ajustes > Miembros: listado de las cuentas del personal del CMS (F2.7a).
 *
 * Recibe la página ya cargada por la ruta (`useSuspenseQuery`) y se limita a
 * presentarla: búsqueda y paginación son cambios de la URL
 * (`onSearchChange`) y un clic en una fila abre la ficha del miembro. Cada
 * fila muestra el rol, el estado y si la cuenta es raíz (super-admin de la
 * plataforma, gestionado fuera del CMS). El correo es el de Auth, no uno
 * escrito en los metadatos de la cuenta.
 */
import { useState } from 'react';

import { useNavigate } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { SearchIcon, ShieldIcon, UsersIcon, XIcon } from 'lucide-react';
import { useTranslations } from 'use-intl';

import { useDateFormatter } from '@pymekit/cms-formatters/hooks';
import type {
  CmsMemberListItem,
  CmsMembersList,
} from '@pymekit/cms-ui-core/api';
import { useIsHydrated } from '@pymekit/cms-ui-core/hydration';
import { CMS_SETTINGS_TAB_PATHS } from '@pymekit/cms-ui-core/sections';
import { Badge } from '@pymekit/ui/badge';
import { DataTable } from '@pymekit/ui/enhanced-data-table';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@pymekit/ui/input-group';
import { cn } from '@pymekit/ui/utils';

import { type MembersSearch, withMembersSearch } from '../utils/members-search';
import { MemberStatusBadge } from './member-badges';

export function MembersTableView(props: {
  data: CmsMembersList;
  search: MembersSearch;
  onSearchChange: (search: MembersSearch) => void;
  isLoading?: boolean;
}) {
  const t = useTranslations('cms.settings.members');
  const hydrated = useIsHydrated();
  const navigate = useNavigate();
  const formatDate = useDateFormatter();

  const columns: ColumnDef<CmsMemberListItem>[] = [
    {
      id: 'member',
      header: t('table.member'),
      cell: ({ row }) => (
        <span className="flex flex-col">
          <span className="font-medium" data-testid="member-display-name">
            {row.original.displayName ?? row.original.email ?? '—'}
          </span>
          {row.original.email ? (
            <span
              className="text-muted-foreground text-xs"
              data-testid="member-email"
            >
              {row.original.email}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      id: 'role',
      header: t('table.role'),
      cell: ({ row }) => (
        <span className="flex items-center gap-1.5">
          <Badge variant="secondary" data-testid="member-role">
            {row.original.role?.name ?? t('noRole')}
          </Badge>
          {row.original.isProtected ? (
            <Badge variant="outline" data-testid="member-protected">
              <ShieldIcon className="h-3 w-3" />
              {t('platformManaged')}
            </Badge>
          ) : null}
        </span>
      ),
    },
    {
      id: 'status',
      header: t('table.status'),
      cell: ({ row }) => <MemberStatusBadge active={row.original.isActive} />,
    },
    {
      id: 'createdAt',
      header: t('table.joined'),
      cell: ({ row }) =>
        formatDate(new Date(row.original.createdAt), 'dd MMM yyyy'),
    },
  ];

  return (
    <div
      className="flex flex-col gap-3"
      data-testid="members-view"
      data-hydrated={hydrated}
    >
      <h1 className="flex items-center gap-2 text-sm font-medium">
        <UsersIcon className="text-muted-foreground h-4 w-4" />
        {t('title')}
      </h1>

      <MembersSearchInput
        // La clave reinicia el campo cuando la búsqueda cambia desde fuera
        // (por ejemplo, con «atrás»), sin sincronizar estado con efectos.
        key={props.search.search ?? ''}
        value={props.search.search ?? ''}
        onSearch={(term) => props.onSearchChange(withMembersSearch(term))}
      />

      <DataTable<CmsMemberListItem>
        className={cn(
          'transition-opacity duration-300',
          props.isLoading && 'opacity-50',
        )}
        columns={columns}
        data={props.data.members}
        getRowId={(member) => member.id}
        pageIndex={props.data.page - 1}
        pageSize={props.data.pageSize}
        pageCount={props.data.pageCount}
        tableProps={{ 'data-testid': 'members-table' }}
        onPaginationChange={({ pageIndex }) =>
          props.onSearchChange({
            ...props.search,
            page: pageIndex > 0 ? pageIndex + 1 : undefined,
          })
        }
        onClick={({ row }) =>
          void navigate({
            href: `${CMS_SETTINGS_TAB_PATHS.members}/${row.original.id}`,
          })
        }
        noResultsMessage={t('table.noResults')}
      />
    </div>
  );
}

function MembersSearchInput(props: {
  value: string;
  onSearch: (term: string) => void;
}) {
  const t = useTranslations('cms.settings.members');
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
          data-testid="members-search-input"
          placeholder={t('table.searchPlaceholder')}
          maxLength={100}
          value={term}
          onChange={(event) => setTerm(event.target.value)}
        />

        {props.value ? (
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              data-testid="members-search-clear"
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
