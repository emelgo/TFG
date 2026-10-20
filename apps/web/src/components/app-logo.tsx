import { Link } from '@tanstack/react-router';
import { useTranslations } from 'use-intl';

import { cn } from '@pymekit/ui/utils';

/**
 * Símbolo de PymeKit: una «P» sobre un bloque redondeado, que evoca una pieza
 * de un kit. Se dibuja con un solo trazo (regla par-impar para el hueco de la
 * «P») para que se vea nítido a cualquier tamaño; es el mismo diseño que los
 * favicons de `public/images/favicon`.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={cn('size-7 shrink-0', className)}
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="100" height="100" rx="24" className="fill-primary" />
      <path
        fillRule="evenodd"
        className="fill-primary-foreground"
        d="M30 22H58A16 16 0 0 1 58 54H44V78H30ZM44 33V43H57A5 5 0 0 0 57 33Z"
      />
    </svg>
  );
}

/**
 * Logo completo de PymeKit: el símbolo y el nombre del producto como texto
 * (no como trazos), para que sea accesible y se adapte al tema claro/oscuro.
 *
 * @param className - Clases adicionales para el contenedor.
 * @param width - Se conserva por compatibilidad con la firma anterior; el
 *   tamaño lo marca la tipografía.
 */
export function LogoImage({
  className,
}: {
  className?: string;
  width?: number;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 text-lg font-semibold tracking-tight whitespace-nowrap',
        className,
      )}
    >
      <LogoMark />
      <span>
        Pyme<span className="text-primary">Kit</span>
      </span>
    </span>
  );
}

/**
 * App Logo
 * @param label - The accessible label for the logo link
 * @param className - The class name to apply to the logo
 */
export function AppLogo({
  label,
  className,
}: {
  className?: string;
  label?: string;
}) {
  const t = useTranslations('common.ui');

  return (
    <Link aria-label={label ?? t('homePage')} to="/">
      <LogoImage className={className} />
    </Link>
  );
}
