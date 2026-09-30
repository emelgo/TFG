/**
 * Búsqueda global del CMS: paleta de comandos que se abre con Cmd/Ctrl+K o
 * con su botón y busca un texto en todas las tablas que el usuario puede leer.
 *
 * - Espera `GLOBAL_SEARCH_DEBOUNCE_MS` tras la última pulsación antes de
 *   pedir `GET /v1/resources/search` (con TanStack Query: repetir una
 *   búsqueda reciente no vuelve a llamar a la API).
 * - Agrupa los resultados por tabla; cada uno enlaza a la ficha del registro.
 * - Navegación con teclado (flechas, Intro, Esc) de `cmdk`, que ya implementa
 *   el patrón *combobox* accesible.
 * - Estados de texto corto, cargando, sin resultados y error (sin el texto
 *   del servidor).
 *
 * Qué tablas y filas aparecen lo decide la base de datos (`cms.global_search`:
 * acceso vigente, esquemas no protegidos y permiso `select` por tabla); la
 * paleta solo muestra lo que llega.
 *
 * Necesita `CmsApiProvider` por encima (la web lo pone en la barra lateral de
 * la consola).
 *
 * [TFG] RF-09: búsqueda transversal en los datos gestionados por el CMS.
 */
import { useEffect, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { SearchIcon, TableIcon } from 'lucide-react';
import { useTranslations } from 'use-intl';

import { useCmsApi } from '@pymekit/cms-ui-core/api-context';
import { useIsHydrated } from '@pymekit/cms-ui-core/hydration';
import { Button } from '@pymekit/ui/button';
import {
  Command,
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@pymekit/ui/command';
import { Kbd } from '@pymekit/ui/kbd';
import { Skeleton } from '@pymekit/ui/skeleton';

import {
  GLOBAL_SEARCH_DEBOUNCE_MS,
  GLOBAL_SEARCH_MAX_LENGTH,
  getGlobalSearchResultUrl,
  groupGlobalSearchResults,
  normalizeGlobalSearchQuery,
} from '../utils/global-search';

type GlobalSearchState = { open: boolean; text: string };

/**
 * Paleta de búsqueda global con su atajo de teclado.
 *
 * @param props.renderTrigger Botón que la abre (por defecto, uno propio). La
 *   web lo sustituye por una entrada de la barra lateral.
 */
export function GlobalSearch(props: {
  renderTrigger?: (trigger: {
    onOpen: () => void;
    hydrated: boolean;
  }) => React.ReactNode;
}) {
  const t = useTranslations('cms.globalSearch');
  const hydrated = useIsHydrated();
  const [state, setState] = useState<GlobalSearchState>({
    open: false,
    text: '',
  });

  const setOpen = (open: boolean) =>
    // Al cerrar se olvida el texto: la próxima vez se empieza de cero.
    setState((previous) => ({ open, text: open ? previous.text : '' }));

  useGlobalSearchShortcut(setState);

  const trigger = props.renderTrigger ? (
    props.renderTrigger({ onOpen: () => setOpen(true), hydrated })
  ) : (
    <Button
      type="button"
      variant="outline"
      size="sm"
      data-testid="global-search-trigger"
      data-hydrated={hydrated}
      onClick={() => setOpen(true)}
    >
      <SearchIcon className="h-3.5 w-3.5" />
      {t('trigger')}
      <Kbd>{t('shortcut')}</Kbd>
    </Button>
  );

  return (
    <>
      {trigger}

      <CommandDialog
        open={state.open}
        onOpenChange={setOpen}
        title={t('title')}
        description={t('description')}
        className="sm:max-w-2xl"
      >
        {state.open ? (
          <GlobalSearchPalette
            text={state.text}
            onTextChange={(text) =>
              setState((previous) => ({ ...previous, text }))
            }
            onNavigate={() => setOpen(false)}
          />
        ) : null}
      </CommandDialog>
    </>
  );
}

function GlobalSearchPalette(props: {
  text: string;
  onTextChange: (text: string) => void;
  onNavigate: () => void;
}) {
  const t = useTranslations('cms.globalSearch');
  const navigate = useNavigate();
  const { queries } = useCmsApi();

  const query = normalizeGlobalSearchQuery(props.text);
  const debouncedQuery = useDebouncedValue(query, GLOBAL_SEARCH_DEBOUNCE_MS);
  const isDebouncing = query !== debouncedQuery;

  const search = useQuery({
    ...queries.globalSearch(debouncedQuery ?? ''),
    enabled: debouncedQuery !== null,
  });

  const groups = search.data
    ? groupGlobalSearchResults(search.data.results)
    : [];

  const renderStatus = () => {
    if (query === null) {
      return (
        <StatusText testId="global-search-min-chars">
          {t('minChars')}
        </StatusText>
      );
    }

    if (isDebouncing || search.isPending) {
      return (
        <div
          className="flex flex-col gap-2 p-3"
          data-testid="global-search-loading"
          aria-label={t('loading')}
        >
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-7 w-full" />
          ))}
        </div>
      );
    }

    if (search.isError) {
      return (
        <StatusText testId="global-search-error" destructive>
          {t('error')}
        </StatusText>
      );
    }

    if (groups.length === 0) {
      return (
        <StatusText testId="global-search-no-results">
          {t('noResults')}
        </StatusText>
      );
    }

    return null;
  };

  const status = renderStatus();

  return (
    // El filtrado lo hace el servidor: `shouldFilter={false}` evita que
    // `cmdk` oculte resultados que no contienen el texto literal.
    <Command shouldFilter={false} loop data-testid="global-search-dialog">
      <CommandInput
        data-testid="global-search-input"
        placeholder={t('placeholder')}
        value={props.text}
        maxLength={GLOBAL_SEARCH_MAX_LENGTH}
        onValueChange={props.onTextChange}
      />

      <CommandList className="max-h-[60vh]" data-testid="global-search-results">
        {status ??
          groups.map((group) => (
            <CommandGroup
              key={group.key}
              heading={group.tableDisplay}
              data-testid="global-search-group"
              data-table={group.key}
            >
              {group.items.map((item) => {
                const url = getGlobalSearchResultUrl(item);

                return (
                  <CommandItem
                    key={url}
                    value={url}
                    data-testid="global-search-result"
                    data-table={group.key}
                    onSelect={() => {
                      props.onNavigate();
                      void navigate({ href: url });
                    }}
                  >
                    <TableIcon className="text-muted-foreground" />
                    <span
                      className="truncate"
                      data-testid="global-search-result-title"
                    >
                      {item.title}
                    </span>
                    <span className="text-muted-foreground ml-auto shrink-0 font-mono text-xs">
                      {group.key}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ))}
      </CommandList>

      <div className="text-muted-foreground flex flex-wrap justify-between gap-2 border-t px-3 py-2 text-xs">
        <span>{t('hint')}</span>
        {!status && search.data?.hasMore ? (
          <span>{t('moreResults')}</span>
        ) : null}
      </div>
    </Command>
  );
}

function StatusText(
  props: React.PropsWithChildren<{ testId: string; destructive?: boolean }>,
) {
  return (
    <p
      data-testid={props.testId}
      className={
        props.destructive
          ? 'text-destructive py-6 text-center text-sm'
          : 'text-muted-foreground py-6 text-center text-sm'
      }
    >
      {props.children}
    </p>
  );
}

/**
 * Abre o cierra la paleta con Cmd+K (macOS) o Ctrl+K.
 *
 * Usa `useEffect` porque tiene que suscribirse a un sistema externo (los
 * eventos de teclado de `window`) y darse de baja al desmontarse; no hay
 * forma de expresarlo con estado derivado.
 */
function useGlobalSearchShortcut(
  setState: React.Dispatch<React.SetStateAction<GlobalSearchState>>,
) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        // Sin esto, Ctrl+K lleva al buscador del navegador en algunos.
        event.preventDefault();
        setState((previous) => ({ ...previous, open: !previous.open }));
      }
    };

    window.addEventListener('keydown', onKeyDown);

    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setState]);
}

/**
 * Devuelve `value` cuando lleva `delay` ms sin cambiar.
 *
 * Usa `useEffect` para programar y cancelar un temporizador (un efecto con
 * limpieza, que es su uso previsto); el valor anterior se mantiene mientras
 * tanto para no lanzar una búsqueda por cada tecla.
 */
function useDebouncedValue<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);

    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
