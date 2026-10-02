/**
 * Vincular y desvincular registros en una sección muchos a muchos.
 *
 * Un vínculo M2M es una fila de la tabla intermedia (por ejemplo,
 * `post_tags(post_id, tag_id)`): vincular la crea y desvincular la borra, con
 * las rutas `POST /v1/data-explorer/:schema/:table/m2m/link|unlink`. Por eso
 * los permisos que cuentan son los de la **tabla intermedia**: `insert` para
 * vincular y `delete` para desvincular (`queries.tablePermissions`). La API
 * los vuelve a comprobar y la función SQL solo escribe si sus columnas están
 * marcadas como editables en el metadato.
 *
 * El buscador del diálogo usa el listado de la tabla destino (misma consulta
 * y caché que el explorador) y marca las filas que ya están vinculadas.
 */
import { useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import { Link2, Link2Off } from 'lucide-react';
import { useTranslations } from 'use-intl';

import { useDebouncedValue } from '@pymekit/cms-filters/hooks';
import type { M2MRelationConfig } from '@pymekit/cms-types';
import { useCmsApi } from '@pymekit/cms-ui-core/api-context';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@pymekit/ui/alert-dialog';
import { Button } from '@pymekit/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@pymekit/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@pymekit/ui/dialog';
import { useAsyncDialog } from '@pymekit/ui/hooks/use-async-dialog';
import { Spinner } from '@pymekit/ui/spinner';

import {
  useLinkRecordsMutation,
  useUnlinkRecordsMutation,
} from '../../hooks/use-record-mutations';
import { getRecordDisplayName } from '../../utils/record-relations';

const PAGE_SIZE = 10;

/** Permisos de escritura sobre la tabla intermedia de una relación M2M. */
export function useJunctionPermissions(relation: M2MRelationConfig) {
  const { queries } = useCmsApi();

  const { data } = useQuery(
    queries.tablePermissions(relation.junctionSchema, relation.junctionTable),
  );

  return {
    canLink: data?.canInsert === true,
    canUnlink: data?.canDelete === true,
  };
}

/** Botón y diálogo para vincular un registro de la tabla destino. */
export function M2MLinkButton(props: {
  schema: string;
  table: string;
  relation: M2MRelationConfig;
  sourceId: string | number;
  linkedIds: string[];
  label: string;
}) {
  const t = useTranslations('cms.dataExplorer');
  const { dialogProps, setIsPending, setOpen } = useAsyncDialog();

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        data-testid="m2m-link-button"
        onClick={() => setOpen(true)}
      >
        <Link2 className="h-3.5 w-3.5" />
        {t('record.related.link')}
      </Button>

      <Dialog {...dialogProps}>
        <DialogContent data-testid="m2m-link-dialog">
          <DialogHeader>
            <DialogTitle>
              {t('record.related.linkTitle', { table: props.label })}
            </DialogTitle>

            <DialogDescription>
              {t('record.related.linkDescription')}
            </DialogDescription>
          </DialogHeader>

          {dialogProps.open ? (
            <M2MLinkSearch
              {...props}
              onPendingChange={setIsPending}
              onLinked={() => setOpen(false)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function M2MLinkSearch(props: {
  schema: string;
  table: string;
  relation: M2MRelationConfig;
  sourceId: string | number;
  linkedIds: string[];
  onPendingChange: (pending: boolean) => void;
  onLinked: () => void;
}) {
  const t = useTranslations('cms.dataExplorer');
  const { queries } = useCmsApi();
  const mutation = useLinkRecordsMutation();
  const { relation } = props;

  const [input, setInput] = useState('');
  const debouncedQuery = useDebouncedValue(input.trim(), 300);

  const options = useQuery(
    queries.tableData({
      schema: relation.targetSchema,
      table: relation.targetTable,
      search: debouncedQuery || undefined,
      pageSize: PAGE_SIZE,
    }),
  );

  const displayFormat = options.data?.table.displayFormat;
  const linked = new Set(props.linkedIds);

  const items = (options.data?.data ?? [])
    .map((row) => {
      const value = row[relation.targetColumn];

      return {
        id: value === null || value === undefined ? '' : String(value),
        rawId: value as string | number,
        label: getRecordDisplayName(displayFormat, row, value),
      };
    })
    .filter((item) => item.id !== '');

  const onSelect = async (targetId: string | number) => {
    props.onPendingChange(true);

    try {
      await mutation.mutateAsync({
        schema: props.schema,
        table: props.table,
        sourceId: props.sourceId,
        targetId,
        relation,
      });

      props.onLinked();
    } catch {
      // El aviso de error ya lo muestra la mutación.
    } finally {
      props.onPendingChange(false);
    }
  };

  return (
    <Command shouldFilter={false} className="rounded-md border">
      <CommandInput
        data-testid="m2m-link-search"
        placeholder={t('filters.search')}
        value={input}
        onValueChange={setInput}
      />

      <CommandList>
        {options.isPending || input.trim() !== debouncedQuery ? (
          <div className="text-muted-foreground p-2 text-xs">
            {t('filters.loading')}
          </div>
        ) : options.isError || items.length === 0 ? (
          <CommandEmpty className="text-muted-foreground p-2 text-xs">
            {t('filters.noResultsFound')}
          </CommandEmpty>
        ) : (
          <CommandGroup>
            {items.map((item) => {
              const isLinked = linked.has(item.id);

              return (
                <CommandItem
                  key={item.id}
                  value={item.id}
                  disabled={isLinked || mutation.isPending}
                  data-testid="m2m-link-option"
                  data-value={item.id}
                  className="flex cursor-pointer items-center justify-between gap-2"
                  onSelect={() => void onSelect(item.rawId)}
                >
                  <span className="truncate">{item.label}</span>

                  {isLinked ? (
                    <span className="text-muted-foreground text-xs">
                      {t('record.related.alreadyLinked')}
                    </span>
                  ) : mutation.isPending &&
                    mutation.variables?.targetId === item.rawId ? (
                    <Spinner className="h-3.5 w-3.5" />
                  ) : null}
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}
      </CommandList>
    </Command>
  );
}

/** Botón y confirmación para desvincular un registro. */
export function M2MUnlinkButton(props: {
  schema: string;
  table: string;
  relation: M2MRelationConfig;
  sourceId: string | number;
  targetId: string | number;
  targetLabel: string;
}) {
  const t = useTranslations('cms.dataExplorer');
  const mutation = useUnlinkRecordsMutation();
  const { dialogProps, isPending, setIsPending, setOpen } = useAsyncDialog();

  const onConfirm = async () => {
    setIsPending(true);

    try {
      await mutation.mutateAsync({
        schema: props.schema,
        table: props.table,
        sourceId: props.sourceId,
        targetId: props.targetId,
        relation: props.relation,
      });

      setOpen(false);
    } catch {
      // El aviso de error ya lo muestra la mutación.
    } finally {
      setIsPending(false);
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        aria-label={t('record.related.unlinkLabel', {
          name: props.targetLabel,
        })}
        data-testid="m2m-unlink-button"
        onClick={() => setOpen(true)}
      >
        <Link2Off className="h-3.5 w-3.5" />
      </Button>

      <AlertDialog {...dialogProps}>
        <AlertDialogContent data-testid="m2m-unlink-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('record.related.unlinkTitle')}
            </AlertDialogTitle>

            <AlertDialogDescription>
              {t('record.related.unlinkDescription', {
                name: props.targetLabel,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>
              {t('record.delete.cancel')}
            </AlertDialogCancel>

            <Button
              variant="destructive"
              data-testid="confirm-m2m-unlink"
              disabled={isPending}
              onClick={() => void onConfirm()}
            >
              {isPending ? <Spinner className="h-3.5 w-3.5" /> : null}
              {t('record.related.unlink')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
