/**
 * *Server functions* del blog público (`/blog` y `/blog/$slug`).
 *
 * Son públicas: no llevan `authFunctionMiddleware`, porque el blog se lee
 * sin sesión. Aun así no abren nada: consultan con el cliente de Supabase
 * con RLS (`getSupabaseServerClient`), que usa la sesión del visitante si la
 * hay y `anon` si no, y las políticas de `blog_posts` solo devuelven lo
 * publicado. `errorMiddleware` evita que un error interno llegue tal cual al
 * navegador; aquí además se registra y se sustituye por un mensaje genérico.
 *
 * [TFG] RF-01 · RNF-02 · ADR-017.
 */
import { createServerFn } from '@tanstack/react-start';

import { errorMiddleware } from '@pymekit/function-middleware/server';
import { getLogger } from '@pymekit/shared/logger';
import { getSupabaseServerClient } from '@pymekit/supabase/server-client';

import {
  BLOG_PAGE_SIZE,
  BlogPostQuerySchema,
  BlogPostsQuerySchema,
} from './blog.schema';
import { createBlogService } from './blog.service.server';

/** Mensaje que ve el navegador si la base de datos falla. */
const BLOG_UNAVAILABLE = 'The blog is temporarily unavailable';

/**
 * Carga una página del listado del blog: entradas publicadas (filtradas por
 * categoría si se indica), total para la paginación y categorías para el
 * filtro.
 */
export const getBlogPostsFunction = createServerFn({ method: 'GET' })
  .middleware([errorMiddleware])
  .validator(BlogPostsQuerySchema)
  .handler(async ({ data }) => {
    const service = createBlogService(getSupabaseServerClient());

    try {
      const [posts, categories] = await Promise.all([
        service.listPublishedPosts({
          page: data.page,
          categorySlug: data.category,
        }),
        service.listCategories(),
      ]);

      return {
        ...posts,
        categories,
        page: data.page,
        pageSize: BLOG_PAGE_SIZE,
        category: data.category ?? null,
      };
    } catch (error) {
      const logger = await getLogger();

      logger.error({ error, name: 'blog.list' }, 'Failed to load blog posts');

      throw new Error(BLOG_UNAVAILABLE);
    }
  });

/**
 * Carga una entrada publicada por su slug. Devuelve `null` si no existe o no
 * es visible (borrador, archivada o programada); la ruta lo convierte en 404.
 */
export const getBlogPostFunction = createServerFn({ method: 'GET' })
  .middleware([errorMiddleware])
  .validator(BlogPostQuerySchema)
  .handler(async ({ data }) => {
    const service = createBlogService(getSupabaseServerClient());

    try {
      return await service.getPublishedPost(data.slug);
    } catch (error) {
      const logger = await getLogger();

      logger.error(
        { error, name: 'blog.post', slug: data.slug },
        'Failed to load blog post',
      );

      throw new Error(BLOG_UNAVAILABLE);
    }
  });
