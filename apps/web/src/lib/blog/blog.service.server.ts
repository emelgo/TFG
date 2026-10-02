/**
 * Servicio de lectura del blog público.
 *
 * Reúne las consultas del blog (listado paginado, entrada por slug,
 * categorías y entradas del *sitemap*) para que las *server functions* y la
 * ruta del *sitemap* no repitan SQL. Recibe el cliente de Supabase como
 * dependencia y NO decide quién puede leer qué: esa regla vive en las
 * políticas RLS de `schemas/19-blog.sql` (solo lo publicado con fecha
 * alcanzada). Por eso se usa siempre el cliente con RLS
 * (`getSupabaseServerClient`), nunca el administrador: un visitante anónimo
 * consulta como `anon` y un usuario con sesión como `authenticated`, y en
 * ambos casos los borradores no existen.
 *
 * Los filtros por estado que se añaden aquí no son la autorización, solo
 * ayudan al planificador a usar el índice `(status, published_at)`.
 *
 * [TFG] RF-01 · RNF-02 · ADR-017: la web lee el contenido gestionado desde el
 * CMS con la autorización aplicada en la base de datos.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@pymekit/supabase/database';

import { BLOG_PAGE_SIZE, getBlogPageRange } from './blog.schema';

// Columnas públicas: coinciden con el `grant select (...)` por columnas de
// `blog_posts`. Pedir otra (p. ej. `author_id`) fallaría con 42501.
const POST_SUMMARY_COLUMNS =
  'id, slug, title, excerpt, cover_image_url, published_at, category:blog_categories(name, slug)';

const POST_DETAIL_COLUMNS = `${POST_SUMMARY_COLUMNS}, content, seo_title, seo_description, updated_at, tags:blog_post_tags(tag:blog_tags(name, slug))`;

export function createBlogService(client: SupabaseClient<Database>) {
  return new BlogService(client);
}

class BlogService {
  constructor(private readonly client: SupabaseClient<Database>) {}

  /**
   * Devuelve una página de entradas publicadas, de la más reciente a la más
   * antigua, filtrada opcionalmente por el slug de una categoría.
   *
   * Una categoría que no existe no es un error: el listado sale vacío y
   * `category` es `null`, para que la página lo muestre sin lanzar un 500.
   */
  async listPublishedPosts(params: { page: number; categorySlug?: string }) {
    let categoryId: string | null = null;

    if (params.categorySlug) {
      const { data, error } = await this.client
        .from('blog_categories')
        .select('id')
        .eq('slug', params.categorySlug)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data) {
        return { items: [], total: 0, categoryFound: false };
      }

      categoryId = data.id;
    }

    const { from, to } = getBlogPageRange(params.page, BLOG_PAGE_SIZE);

    let query = this.client
      .from('blog_posts')
      .select(POST_SUMMARY_COLUMNS, { count: 'exact' })
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, to);

    if (categoryId) {
      query = query.eq('category_id', categoryId);
    }

    const { data, error, count } = await query;

    // PostgREST responde 416 si la página pedida supera el total: no es un
    // fallo del sistema, simplemente no hay entradas en esa página.
    if (error && error.code !== 'PGRST103') {
      throw error;
    }

    return { items: data ?? [], total: count ?? 0, categoryFound: true };
  }

  /** Devuelve la entrada publicada con ese slug, o `null` si no es visible. */
  async getPublishedPost(slug: string) {
    const { data, error } = await this.client
      .from('blog_posts')
      .select(POST_DETAIL_COLUMNS)
      .eq('slug', slug)
      .eq('status', 'published')
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data;
  }

  /** Categorías, por nombre, para el filtro del listado. */
  async listCategories() {
    const { data, error } = await this.client
      .from('blog_categories')
      .select('name, slug')
      .order('name');

    if (error) {
      throw error;
    }

    return data;
  }

  /**
   * Slugs y fecha de actualización de todas las entradas publicadas, para el
   * *sitemap*. Se limita a un máximo razonable (el protocolo admite 50 000).
   */
  async listSitemapEntries() {
    const { data, error } = await this.client
      .from('blog_posts')
      .select('slug, updated_at, published_at')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(5000);

    if (error) {
      throw error;
    }

    return data;
  }
}
