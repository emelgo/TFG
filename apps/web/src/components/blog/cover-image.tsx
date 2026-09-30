/**
 * Imagen de portada de una entrada del blog. Ocupa todo su contenedor
 * (posicionado en relativo), que es quien fija la altura.
 *
 * La URL ya la valida la base de datos (`CHECK` https), pero se vuelve a
 * filtrar con la misma política que las imágenes del Markdown por si el dato
 * llegara por otra vía: una URL que no sea `https://` no se pinta.
 */
import { useTranslations } from 'use-intl';

import { sanitizeMarkdownImageSrc } from '@pymekit/ui/markdown-policy';
import { cn } from '@pymekit/ui/utils';

export function CoverImage(props: {
  title: string;
  src: string | null;
  className?: string;
}) {
  const t = useTranslations('marketing');
  const src = sanitizeMarkdownImageSrc(props.src);

  if (!src) {
    return null;
  }

  return (
    <img
      className={cn(
        'absolute inset-0 block h-full w-full rounded-md object-cover',
        props.className,
      )}
      src={src}
      alt={t('blogCoverImageAlt', { title: props.title })}
      loading="lazy"
      referrerPolicy="no-referrer"
    />
  );
}
