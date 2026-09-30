/**
 * Tipos de las entradas del blog tal como las devuelven las *server
 * functions* (`blog.functions.ts`). Se derivan de su valor de retorno para
 * que el esquema de la consulta sea la única fuente de verdad. Solo se
 * importan tipos: ningún código de servidor llega al navegador.
 */
import type {
  getBlogPostFunction,
  getBlogPostsFunction,
} from '#/lib/blog/blog.functions.ts';

export type BlogPostsPage = Awaited<ReturnType<typeof getBlogPostsFunction>>;

export type BlogPostSummary = BlogPostsPage['items'][number];

export type BlogPostDetail = NonNullable<
  Awaited<ReturnType<typeof getBlogPostFunction>>
>;
