/**
 * Renderizador de Markdown seguro para contenido público (el blog).
 *
 * Convierte el Markdown en elementos de React con `react-markdown`, que
 * construye el árbol de la página sin `dangerouslySetInnerHTML`: el texto
 * siempre se escapa. Encima se aplican tres barreras:
 *
 *  1. **Sin HTML crudo** (`skipHtml`): las etiquetas escritas dentro del
 *     Markdown (`<script>`, `<iframe>`, `<img onerror=…>`) se descartan en
 *     lugar de mostrarse. No se usa `rehype-raw`.
 *  2. **URL filtradas** (`urlTransform`): enlaces e imágenes pasan por la
 *     política de `markdown-policy.ts` (solo `http(s)`/`mailto:`/relativas en
 *     enlaces y solo `https://` en imágenes).
 *  3. **Atributos seguros**: los enlaces externos se abren en otra pestaña
 *     con `rel="noopener noreferrer nofollow"`; las imágenes se cargan en
 *     diferido y sin enviar la URL de origen (`referrerPolicy`).
 *
 * [TFG] RNF-02 · ADR-017: el contenido del CMS se muestra en la web sin
 * abrir una vía de XSS.
 */
import Markdown, { type Components, defaultUrlTransform } from 'react-markdown';

import { cn } from '../../lib/utils';
import {
  getMarkdownLinkAttributes,
  sanitizeMarkdownHref,
  sanitizeMarkdownImageSrc,
} from './markdown-policy';

type SafeMarkdownProps = {
  /** Texto en Markdown (CommonMark). */
  children: string;
  className?: string;
  /**
   * Origen del sitio (`https://ejemplo.com`): los enlaces absolutos a este
   * origen se tratan como internos. Sin él, toda URL absoluta es externa.
   */
  siteOrigin?: string;
};

/**
 * Aplica la política a cada URL del documento. `react-markdown` llama a esta
 * función con el nombre del atributo (`href`, `src`…); devolver `null` hace
 * que el atributo no se pinte.
 */
function transformUrl(url: string, key: string) {
  if (key === 'href') {
    return sanitizeMarkdownHref(url);
  }

  if (key === 'src') {
    return sanitizeMarkdownImageSrc(url);
  }

  return defaultUrlTransform(url);
}

/**
 * Muestra un documento Markdown aplicando la política de seguridad del
 * contenido público. Úsalo siempre que el Markdown venga de la base de datos.
 */
export function SafeMarkdown(props: SafeMarkdownProps) {
  const components: Components = {
    a: ({ href, children }) => {
      // Enlace rechazado por la política: se conserva solo el texto.
      if (!href) {
        return <span>{children}</span>;
      }

      return (
        <a href={href} {...getMarkdownLinkAttributes(href, props.siteOrigin)}>
          {children}
        </a>
      );
    },
    img: ({ src, alt }) => {
      // Imagen que no es https: no se pinta nada (ni un icono roto).
      if (typeof src !== 'string' || !src) {
        return null;
      }

      return (
        <img
          src={src}
          alt={alt ?? ''}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="rounded-md"
        />
      );
    },
  };

  return (
    <div
      data-testid="safe-markdown"
      className={cn('prose dark:prose-invert max-w-none', props.className)}
    >
      <Markdown skipHtml urlTransform={transformUrl} components={components}>
        {props.children}
      </Markdown>
    </div>
  );
}
