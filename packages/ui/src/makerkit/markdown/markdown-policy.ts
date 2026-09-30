/**
 * Política de enlaces e imágenes del Markdown público.
 *
 * El contenido del blog lo escribe el personal desde el CMS y lo lee
 * cualquier visitante, así que se trata como no confiable: una cuenta del CMS
 * comprometida no debe poder inyectar código en la web pública. El
 * componente `SafeMarkdown` ya no renderiza HTML crudo; estas funciones
 * puras deciden además qué URL se aceptan en enlaces e imágenes y con qué
 * atributos se pintan. Están separadas del componente para probarlas sin
 * React (`__tests__/markdown-policy.test.ts`).
 *
 * Reglas:
 *  - **Enlaces:** rutas relativas (`/pricing`, `#seccion`, `?page=2`),
 *    `http(s)` y `mailto:`. Cualquier otro esquema (`javascript:`, `data:`,
 *    `vbscript:`, `file:`…) se descarta y el texto queda sin enlace.
 *  - **Enlaces externos** (a otro origen): se abren en una pestaña nueva con
 *    `rel="noopener noreferrer nofollow"`, para que la página enlazada no
 *    controle la nuestra (`window.opener`), no reciba la URL de origen y no
 *    herede reputación SEO de contenido que no hemos revisado.
 *  - **Imágenes:** solo URL absolutas `https://`. Una imagen `http://`
 *    provoca contenido mixto, y las URL `data:` o relativas permitirían
 *    incrustar contenido que no pasa por la revisión de la portada.
 *
 * [TFG] RNF-02 · ADR-017: el Markdown del blog se renderiza de forma segura.
 */

/** Valor de `rel` de los enlaces externos. */
export const EXTERNAL_LINK_REL = 'noopener noreferrer nofollow';

const ALLOWED_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

// Esquema al principio de la URL (`javascript:`, `https:`…), según RFC 3986.
const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;

// Caracteres de control y espacios que los navegadores ignoran dentro del
// esquema (`java\tscript:`): se eliminan antes de comprobarlo.
// oxlint-disable-next-line no-control-regex
const IGNORED_CHARACTERS = /[\u0000- \u007f-\u009f]/g;

/**
 * Devuelve la URL de un enlace si la política la acepta, o `null` si hay que
 * pintar el texto sin enlace.
 */
export function sanitizeMarkdownHref(href: string | null | undefined) {
  if (!href) {
    return null;
  }

  const value = href.trim();
  const compact = value.replace(IGNORED_CHARACTERS, '');

  if (!compact) {
    return null;
  }

  // `//dominio` (o `/\dominio`, que los navegadores tratan igual) es una
  // URL absoluta sin esquema: se normaliza a https y cuenta como externa.
  if (/^[\\/]{2}/.test(compact)) {
    return `https://${compact.replace(/^[\\/]+/, '')}`;
  }

  if (!SCHEME_PATTERN.test(compact)) {
    // Ruta relativa, ancla o consulta: se queda en nuestro origen.
    return value;
  }

  try {
    const url = new URL(value);

    return ALLOWED_LINK_PROTOCOLS.has(url.protocol) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Indica si un enlace (ya aceptado por `sanitizeMarkdownHref`) sale de
 * nuestro sitio: tiene esquema `http(s)` y un origen distinto de `siteOrigin`.
 * Sin `siteOrigin`, cualquier URL absoluta cuenta como externa.
 */
export function isExternalHref(href: string, siteOrigin?: string) {
  if (!/^https?:/i.test(href)) {
    return false;
  }

  if (!siteOrigin) {
    return true;
  }

  try {
    return new URL(href).origin !== new URL(siteOrigin).origin;
  } catch {
    return true;
  }
}

/**
 * Atributos del `<a>` de un enlace aceptado: pestaña nueva y `rel` para los
 * externos, ninguno extra para los internos y `mailto:`.
 */
export function getMarkdownLinkAttributes(href: string, siteOrigin?: string) {
  if (isExternalHref(href, siteOrigin)) {
    return { target: '_blank', rel: EXTERNAL_LINK_REL } as const;
  }

  return {} as const;
}

/**
 * Devuelve la URL de una imagen si es `https://` absoluta, o `null` si la
 * imagen no debe pintarse.
 */
export function sanitizeMarkdownImageSrc(src: string | null | undefined) {
  if (!src) {
    return null;
  }

  try {
    const url = new URL(src.trim());

    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}
