import { SearchIcon, X } from 'lucide-react';
import { useTranslations } from 'use-intl';

import { Button } from '@pymekit/ui/button';
import { If } from '@pymekit/ui/if';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@pymekit/ui/input-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@pymekit/ui/tooltip';

/**
 * Búsqueda global dentro de la tabla (en todas las columnas marcadas como
 * «buscables» en el metadato). Se aplica al pulsar Intro para no lanzar una
 * consulta por cada tecla.
 *
 * El campo no es controlado: `key={props.search}` lo vuelve a montar cuando
 * la búsqueda cambia desde fuera (vista guardada, «Limpiar filtros», botón
 * atrás), de modo que siempre refleja la URL sin copiar estado.
 */
export function SearchInput(props: {
  search: string;
  onSearchChange: (search: string) => void;
  onClear: () => void;
}) {
  const t = useTranslations('cms.dataExplorer');

  return (
    <InputGroup key={props.search}>
      <InputGroupAddon>
        <SearchIcon className="text-muted-foreground h-3.5 w-3.5" />
      </InputGroupAddon>

      <InputGroupInput
        data-testid="filters-search-input"
        aria-label={t('filters.searchAll')}
        placeholder={t('filters.searchAll')}
        className="hover:border-border h-7 border-transparent pl-6 text-sm"
        defaultValue={props.search}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            props.onSearchChange(e.currentTarget.value.trim());
          }
        }}
      />

      <If condition={props.search}>
        <InputGroupAddon align="inline-end">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  data-testid="filters-search-clear"
                  aria-label={t('filters.clearSearch')}
                  onClick={props.onClear}
                />
              }
            >
              <X className="h-3.5 w-3.5" />
            </TooltipTrigger>

            <TooltipContent>{t('filters.clearSearch')}</TooltipContent>
          </Tooltip>
        </InputGroupAddon>
      </If>
    </InputGroup>
  );
}
