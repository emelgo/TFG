/**
 * Portada del CMS (`/admin/cms`): tablas que el usuario puede leer.
 *
 * Lista los recursos de `GET /v1/navigation` (las tablas de
 * `cms.table_metadata` que las políticas RLS dejan ver al usuario según su
 * rol del CMS), agrupados por esquema y en el orden configurado. Cada tabla
 * enlaza con su explorador de datos (`/admin/cms/resources/$schema/$table`).
 * Encima se muestran las pestañas abiertas del explorador y las tablas
 * recientes, para retomar el trabajo. Es también la página a la que se
 * redirige al personal del CMS que entra en `/admin`.
 *
 * [TFG] RF-09: el explorador de datos solo ofrece lo que el RBAC del CMS
 * permite leer.
 */
import { useSuspenseQuery } from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';
import { Database, Table2 } from 'lucide-react';

import {
  DataExplorerRecentTables,
  DataExplorerTabs,
} from '@pymekit/cms-data-explorer-ui/components';
import { groupResourcesBySchema } from '@pymekit/cms-ui-core/resources';
import { Badge } from '@pymekit/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@pymekit/ui/card';
import {
  EmptyMedia,
  EmptyState,
  EmptyStateHeading,
  EmptyStateText,
} from '@pymekit/ui/empty-state';
import { PageBody, PageHeader } from '@pymekit/ui/page';
import { Trans } from '@pymekit/ui/trans';

import { cmsQueries } from '#/lib/cms/cms-queries.ts';
import { getTranslator } from '#/lib/i18n/translator.ts';

export const Route = createFileRoute('/admin/cms/')({
  loader: async ({ context }) => {
    // Sin acceso válido (aviso de MFA) el *layout* no renderiza esta página:
    // no tiene sentido pedir datos que la API va a rechazar.
    if (context.cmsAccess.status !== 'ok') {
      return;
    }

    await context.queryClient.ensureQueryData(cmsQueries.navigation());
  },
  head: ({ match }) => ({
    meta: [
      { title: getTranslator(match.context.locale)('cms.overview.title') },
    ],
  }),
  component: CmsOverviewPage,
});

function CmsOverviewPage() {
  const { data } = useSuspenseQuery(cmsQueries.navigation());
  const groups = groupResourcesBySchema(data);

  return (
    <PageBody>
      {/* Pestañas y tablas recientes del explorador (solo en el navegador). */}
      <DataExplorerTabs />

      <PageHeader
        title={<Trans i18nKey="cms.overview.title" />}
        description={<Trans i18nKey="cms.overview.description" />}
      />

      <div className="pb-6 empty:hidden">
        <DataExplorerRecentTables />
      </div>

      {groups.length === 0 ? (
        <EmptyState data-testid="cms-resources-empty" className="min-h-64 p-6">
          <EmptyMedia variant="icon">
            <Database />
          </EmptyMedia>

          <EmptyStateHeading>
            <Trans i18nKey="cms.overview.emptyHeading" />
          </EmptyStateHeading>

          <EmptyStateText>
            <Trans i18nKey="cms.overview.emptyText" />
          </EmptyStateText>
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-6 pb-8" data-testid="cms-resources">
          {groups.map((group) => (
            <Card
              key={group.schemaName}
              data-testid={`cms-schema-${group.schemaName}`}
            >
              <CardHeader className="flex flex-row items-center gap-2">
                <CardTitle className="font-mono">{group.schemaName}</CardTitle>

                <Badge variant="secondary">
                  <Trans
                    i18nKey="cms.overview.tablesCount"
                    values={{ count: group.items.length }}
                  />
                </Badge>
              </CardHeader>

              <CardContent>
                <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {group.items.map((resource) => (
                    <li key={`${resource.schemaName}.${resource.tableName}`}>
                      <Link
                        to="/admin/cms/resources/$schema/$table"
                        params={{
                          schema: resource.schemaName,
                          table: resource.tableName,
                        }}
                        data-testid={`cms-resource-${resource.schemaName}.${resource.tableName}`}
                        className="hover:bg-muted flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors"
                      >
                        <Table2 className="text-muted-foreground size-4 shrink-0" />

                        <span className="truncate">{resource.displayName}</span>

                        <span className="text-muted-foreground ml-auto truncate font-mono text-xs">
                          {resource.tableName}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </PageBody>
  );
}
