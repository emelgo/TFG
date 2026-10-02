/**
 * *Page Object* del blog público (`/blog` y `/blog/$slug`).
 *
 * Reúne los selectores `data-testid` del listado, la página de una entrada y
 * el filtro por categoría, para que las especificaciones solo describan el
 * comportamiento esperado.
 */
import type { Page } from '@playwright/test';

export class BlogPageObject {
  constructor(private readonly page: Page) {}

  gotoList(query = '') {
    return this.page.goto(`/blog${query}`);
  }

  gotoPost(slug: string) {
    return this.page.goto(`/blog/${slug}`);
  }

  listPage() {
    return this.page.getByTestId('blog-page');
  }

  previews() {
    return this.page.getByTestId('blog-post-preview');
  }

  /** Tarjeta de una entrada en el listado, por su slug. */
  preview(slug: string) {
    return this.page.locator(
      `[data-testid="blog-post-preview"][data-slug="${slug}"]`,
    );
  }

  categoryPill(slug: string) {
    return this.page.getByTestId(`blog-category-${slug}`);
  }

  postPage() {
    return this.page.getByTestId('blog-post-page');
  }

  postTitle() {
    return this.page.getByTestId('blog-post-title');
  }

  postContent() {
    return this.page.getByTestId('blog-post-content');
  }

  postTags() {
    return this.page.getByTestId('blog-post-tag');
  }

  notFound() {
    return this.page.getByTestId('root-not-found');
  }
}
