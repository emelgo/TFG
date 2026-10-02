/**
 * Esquemas y utilidades puras del blog público (`/blog`).
 *
 * Se comparten entre las rutas (validación tolerante de la URL) y las
 * *server functions* (validación estricta de la entrada), así que no importan
 * nada del servidor.
 *
 * [TFG] RF-01 · ADR-017.
 */
import * as z from 'zod';

/** Entradas por página del listado. */
export const BLOG_PAGE_SIZE = 9;

/** Página máxima admitida: evita desplazamientos absurdos en la consulta. */
export const BLOG_MAX_PAGE = 1000;

/**
 * Formato de los slugs del blog: el mismo `CHECK` que en la base de datos
 * (`blog_posts_slug_format`). Validarlo antes de consultar evita viajes
 * inútiles a la base de datos con valores imposibles.
 */
export const BlogSlugSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

export const BlogPostsQuerySchema = z.object({
  page: z.number().int().min(1).max(BLOG_MAX_PAGE),
  category: BlogSlugSchema.optional(),
});

export const BlogPostQuerySchema = z.object({
  slug: BlogSlugSchema,
});

/** Parámetros de búsqueda de `/blog` ya normalizados. */
export type BlogSearch = {
  page?: number;
  category?: string;
};

/**
 * Normaliza los parámetros de `/blog?page=&category=` sin lanzar nunca: un
 * valor no válido (página decimal, negativa o enorme, categoría con otro
 * formato) se ignora y el listado vuelve a su valor por defecto, en lugar de
 * romper la página.
 */
export function parseBlogSearch(search: Record<string, unknown>): BlogSearch {
  const page = Number(search['page']);
  const category = BlogSlugSchema.safeParse(search['category']);

  return {
    page:
      Number.isInteger(page) && page > 1 && page <= BLOG_MAX_PAGE
        ? page
        : undefined,
    category: category.success ? category.data : undefined,
  };
}

/** Rango de filas (`from`, `to` inclusivos) de una página del listado. */
export function getBlogPageRange(page: number, pageSize = BLOG_PAGE_SIZE) {
  const from = (page - 1) * pageSize;

  return { from, to: from + pageSize - 1 };
}

/** Número total de páginas (al menos una, aunque no haya entradas). */
export function getBlogPageCount(total: number, pageSize = BLOG_PAGE_SIZE) {
  return Math.max(1, Math.ceil(total / pageSize));
}
