// Project-specific Badge variants. Apply via `className` so that
// `shadcn/badge.tsx` stays upstream-equivalent and CLI-replaceable, e.g.:
//   <Badge className={badgeExtras.success}>OK</Badge>

export const badgeExtras = {
  info: 'bg-primary text-primary-foreground [a]:hover:bg-primary/80',
  // Tonos 700/800 sobre fondo claro y 400 sobre el oscuro: los 600 originales
  // no llegaban al contraste mínimo de 4,5:1 (WCAG 1.4.3).
  success:
    'bg-green-600/10 text-green-700 dark:bg-green-600/20 dark:text-green-400 [&>svg]:text-green-700 dark:[&>svg]:text-green-400',
  warning:
    'bg-transparent border-yellow-700 text-yellow-800 dark:border-yellow-500 dark:text-yellow-400 [&>svg]:text-yellow-800 dark:[&>svg]:text-yellow-400',
} as const;

export type BadgeExtraVariant = keyof typeof badgeExtras;
