'use client';

/**
 * Ayuda contextual de un campo de formulario: un botón «?» junto a la
 * etiqueta que abre una explicación breve del campo.
 *
 * Por qué un *popover* y no un *tooltip*: el *tooltip* solo aparece al pasar
 * el ratón o al enfocar, así que en un móvil (sin ratón) no se puede leer.
 * El *popover* se abre con un toque, con el ratón y con el teclado
 * (Intro/Espacio sobre el botón) y se cierra con Escape o tocando fuera.
 *
 * El botón es `type="button"` para que, al estar dentro de un `<form>`,
 * pulsarlo no envíe el formulario. Su nombre accesible se compone a partir
 * de la etiqueta del campo («Ayuda: Zona horaria») para que un lector de
 * pantalla sepa a qué campo se refiere cada «?».
 *
 * `src/shadcn/` no se toca (su CLI puede sobrescribirlo): este envoltorio
 * vive en `src/pymekit/` y se importa como `@pymekit/ui/field-help`.
 *
 * [TFG] RNF-08 (usabilidad) · ADR-021 (textos solo en español con i18n).
 */
import * as React from 'react';

import { CircleHelp } from 'lucide-react';
import { useTranslations } from 'use-intl';

import { cn } from '../lib/utils';
import { FieldLabel } from '../shadcn/field';
import { Popover, PopoverContent, PopoverTrigger } from '../shadcn/popover';

interface FieldHelpProps {
  /** Texto de ayuda (una o dos frases en lenguaje llano). */
  children: React.ReactNode;
  /**
   * Nombre del campo, para el nombre accesible del botón («Ayuda: <campo>»).
   * Si no se pasa, se usa `labelId` o, en último caso, un texto genérico.
   */
  label?: string;
  /**
   * `id` del elemento que contiene la etiqueta del campo. El nombre
   * accesible del botón se compone con `aria-labelledby` («Ayuda:» + la
   * etiqueta), útil cuando la etiqueta no es una cadena (p. ej. un `<Trans>`).
   */
  labelId?: string;
  className?: string;
  'data-testid'?: string;
}

/**
 * Botón «?» que abre la ayuda de un campo en un *popover*.
 *
 * @example
 * <FieldHelp label="Zona horaria">Se usa para mostrar las fechas…</FieldHelp>
 */
export function FieldHelp({
  children,
  label,
  labelId,
  className,
  'data-testid': testId = 'field-help',
}: FieldHelpProps) {
  const t = useTranslations('common.ui');
  const prefixId = React.useId();

  // Tres formas de nombrar el botón, de la más a la menos concreta.
  const accessibleName = label
    ? { 'aria-label': t('fieldHelp', { field: label }) }
    : labelId
      ? { 'aria-labelledby': `${prefixId} ${labelId}` }
      : { 'aria-label': t('fieldHelpGeneric') };

  return (
    <Popover>
      {labelId && !label ? (
        // Prefijo oculto («Ayuda:») que se combina con la etiqueta visible.
        <span id={prefixId} hidden>
          {t('fieldHelpPrefix')}
        </span>
      ) : null}

      <PopoverTrigger
        type="button"
        data-testid={testId}
        {...accessibleName}
        className={cn(
          'text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full outline-none focus-visible:ring-3',
          className,
        )}
      >
        <CircleHelp className="size-3.5" aria-hidden="true" />
      </PopoverTrigger>

      <PopoverContent
        side="top"
        align="start"
        data-testid={`${testId}-content`}
        className="text-muted-foreground w-72 max-w-[calc(100vw-2rem)] leading-relaxed"
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}

type FieldLabelWithHelpProps = React.ComponentProps<typeof FieldLabel> & {
  /**
   * Ayuda del campo. Si es vacía o no se pasa, se pinta solo la etiqueta
   * (así se puede pasar una descripción opcional sin condicionales).
   */
  help?: React.ReactNode;
  /** Clases del contenedor de etiqueta + «?». */
  wrapperClassName?: string;
};

/**
 * `FieldLabel` de `@pymekit/ui/field` con el botón «?» al lado.
 *
 * El botón va **fuera** del `<label>` (un elemento interactivo dentro de una
 * etiqueta es HTML inválido y, al pulsarlo, enfocaría el campo).
 *
 * @example
 * <FieldLabelWithHelp htmlFor="tz" help={t('timezoneHelp')}>
 *   {t('timezone')}
 * </FieldLabelWithHelp>
 */
export function FieldLabelWithHelp({
  help,
  wrapperClassName,
  id,
  ...props
}: FieldLabelWithHelpProps) {
  const generatedId = React.useId();
  const labelId = id ?? `${generatedId}-label`;

  if (help === undefined || help === null || help === '') {
    return <FieldLabel id={id} {...props} />;
  }

  return (
    <div className={cn('flex items-center gap-1', wrapperClassName)}>
      <FieldLabel id={labelId} {...props} />
      <FieldHelp labelId={labelId}>{help}</FieldHelp>
    </div>
  );
}
