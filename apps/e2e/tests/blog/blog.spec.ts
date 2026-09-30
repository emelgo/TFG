/**
 * Pruebas E2E del blog gestionado desde el CMS (F2.6b, ADR-017).
 *
 *  1. **Visitante anónimo:** ve en `/blog` las entradas publicadas del
 *     *seed* (no el borrador), abre una entrada con su Markdown renderizado
 *     de forma segura, filtra por categoría y recibe 404 al pedir el slug del
 *     borrador. El *sitemap* incluye lo publicado y no el borrador.
 *  2. **Super-admin con MFA:** crea una entrada publicada desde el explorador
 *     del CMS y aparece en la web; en la ficha de una entrada vincula y
 *     desvincula una etiqueta (relación muchos a muchos, pendiente de la
 *     F2.4c).
 *
 * Las entradas que crean las pruebas llevan un prefijo único por *worker* y
 * `afterAll` las borra con la clave de servicio.
 *
 * [TFG] RF-01 · RF-09 · RNF-02 · ADR-017.
 */
import { createClient } from '@supabase/supabase-js';

import { expect, test } from '@playwright/test';

import { AuthPageObject } from '../authentication/auth.po';
import { RecordFormPageObject } from '../cms/record-form.po';
import { RecordPageObject } from '../cms/record.po';
import { AUTH_STATES } from '../utils/auth-state';
import { BlogPageObject } from './blog.po';

/** Entradas del *seed* (ver apps/web/supabase/seed.sql). */
const PUBLISHED_SLUGS = [
  'por-que-una-pyme-necesita-un-saas',
  'facturacion-electronica-para-pymes',
  'proteger-los-datos-de-tus-clientes',
];

const DRAFT_SLUG = 'guia-para-migrar-a-la-nube';

/** Prefijo de los slugs que crea esta suite (minúsculas, dígitos y guiones). */
const RUN_ID = `e2e-blog-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** Cliente con la clave de servicio del Supabase local (ignora RLS). */
function getAdminClient() {
  return createClient(
    'http://127.0.0.1:54321',
    'sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz',
  );
}

test.afterAll(async () => {
  await getAdminClient().from('blog_posts').delete().like('slug', `${RUN_ID}%`);
});

test.describe('Blog: visitante anónimo', () => {
  test('el listado muestra las entradas publicadas y no el borrador', async ({
    page,
  }) => {
    const blog = new BlogPageObject(page);

    await blog.gotoList();
    await expect(blog.listPage()).toBeVisible();

    for (const slug of PUBLISHED_SLUGS) {
      await expect(blog.preview(slug)).toBeVisible();
    }

    await expect(blog.preview(DRAFT_SLUG)).toHaveCount(0);
  });

  test('una entrada muestra su Markdown de forma segura', async ({ page }) => {
    const blog = new BlogPageObject(page);

    await blog.gotoPost(PUBLISHED_SLUGS[0]!);

    await expect(blog.postTitle()).toHaveText(
      'Por qué una pyme necesita una aplicación SaaS',
    );

    // El Markdown se convierte en HTML (encabezados, listas, negrita)
    await expect(
      blog.postContent().getByRole('heading', { name: 'Del Excel a la nube' }),
    ).toBeVisible();
    await expect(blog.postContent().locator('li')).toHaveCount(3);

    // Los enlaces externos se abren aparte y sin ceder reputación
    const external = blog
      .postContent()
      .locator('a[href^="https://digital-strategy.ec.europa.eu"]');

    await expect(external).toHaveAttribute(
      'rel',
      'noopener noreferrer nofollow',
    );
    await expect(external).toHaveAttribute('target', '_blank');

    // Etiquetas de la entrada (relación muchos a muchos)
    await expect(blog.postTags()).toHaveCount(3);

    // Etiquetas SEO de la entrada
    await expect(page).toHaveTitle(/Por qué una pyme necesita un SaaS/);
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute(
      'content',
      'article',
    );
  });

  test('el filtro por categoría solo muestra esa categoría', async ({
    page,
  }) => {
    const blog = new BlogPageObject(page);

    await blog.gotoList('?category=seguridad');

    await expect(
      blog.preview('proteger-los-datos-de-tus-clientes'),
    ).toBeVisible();
    await expect(
      blog.preview('facturacion-electronica-para-pymes'),
    ).toHaveCount(0);
  });

  test('el slug de un borrador responde 404', async ({ page }) => {
    const blog = new BlogPageObject(page);

    const response = await blog.gotoPost(DRAFT_SLUG);

    expect(response?.status()).toBe(404);
    await expect(blog.notFound()).toBeVisible();
    await expect(blog.postPage()).toHaveCount(0);
  });

  test('un slug inexistente o con formato imposible responde 404', async ({
    page,
  }) => {
    const blog = new BlogPageObject(page);

    expect((await blog.gotoPost('no-existe-esta-entrada'))?.status()).toBe(404);
    expect((await blog.gotoPost('Formato_Invalido'))?.status()).toBe(404);
  });

  test('una página del listado más allá de la última responde 404', async ({
    page,
  }) => {
    const blog = new BlogPageObject(page);

    expect((await blog.gotoList('?page=999'))?.status()).toBe(404);
  });

  test('el sitemap incluye las entradas publicadas y no el borrador', async ({
    request,
  }) => {
    const response = await request.get('/sitemap.xml');
    const body = await response.text();

    expect(response.ok()).toBe(true);
    expect(body).toContain('/blog</loc>');

    for (const slug of PUBLISHED_SLUGS) {
      expect(body).toContain(`/blog/${slug}</loc>`);
    }

    expect(body).not.toContain(DRAFT_SLUG);
  });

  test('la API de datos no deja escribir en el blog con la clave pública', async ({
    request,
  }) => {
    // Clave pública del Supabase local: equivale a un visitante anónimo
    const response = await request.post(
      'http://127.0.0.1:54321/rest/v1/blog_posts',
      {
        headers: {
          apikey: 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH',
          'Content-Type': 'application/json',
        },
        data: { slug: `${RUN_ID}-anon`, title: 'Anon' },
      },
    );

    expect(response.status()).toBe(401);
  });
});

test.describe('Blog: gestión desde el CMS (super-admin con MFA)', () => {
  AuthPageObject.setupSession(AUTH_STATES.SUPER_ADMIN);

  test('una entrada publicada desde el CMS aparece en la web', async ({
    page,
  }) => {
    const form = new RecordFormPageObject(page);
    const record = new RecordPageObject(page);
    const blog = new BlogPageObject(page);
    const slug = `${RUN_ID}-crear`;
    const title = `Entrada E2E ${RUN_ID}`;

    await page.goto('/admin/cms/resources/public/blog_posts/new');
    await form.waitForForm();

    await form.fill('title', title);
    await form.fill('slug', slug);
    await form.fill('content', '## Creada desde el CMS\n\nTexto de prueba.');

    await form.field('status').getByTestId('record-field-select').click();
    await page
      .locator('[data-testid="record-field-option"]', { hasText: 'published' })
      .click();

    await form.submit().click();

    await page.waitForURL('**/public/blog_posts/record/*');
    await expect(record.recordPage()).toBeVisible();

    // Aparece en el listado de la web y su página se puede abrir
    await blog.gotoList();
    await expect(blog.preview(slug)).toBeVisible();

    await blog.preview(slug).click();
    await expect(blog.postTitle()).toHaveText(title);
    await expect(
      blog.postContent().getByRole('heading', { name: 'Creada desde el CMS' }),
    ).toBeVisible();
  });

  test('vincula y desvincula etiquetas desde la ficha de una entrada', async ({
    page,
  }) => {
    const record = new RecordPageObject(page);
    const slug = `${RUN_ID}-etiquetas`;

    const { data, error } = await getAdminClient()
      .from('blog_posts')
      .insert({ slug, title: `Etiquetas ${RUN_ID}`, content: 'Texto' })
      .select('id')
      .single();

    expect(error).toBeNull();

    await record.goto(`public/blog_posts/record/${data!.id}`);
    await record.waitForHydration();

    const section = record.relatedSection('public.blog_tags');

    await expect(section).toBeVisible();
    await expect(section.getByTestId('related-records-empty')).toBeVisible();

    // Vincular «Pymes»
    await section.getByTestId('m2m-link-button').click();

    const dialog = page.getByTestId('m2m-link-dialog');

    await expect(dialog).toBeVisible();
    await dialog.getByTestId('m2m-link-search').fill('Pymes');
    await dialog
      .getByTestId('m2m-link-option')
      .filter({ hasText: 'Pymes' })
      .click();

    const linked = section.getByTestId('related-linked-record');

    await expect(linked).toHaveCount(1);
    await expect(linked).toContainText('Pymes');

    // Desvincular
    await linked.getByTestId('m2m-unlink-button').click();
    await page.getByTestId('confirm-m2m-unlink').click();

    await expect(section.getByTestId('related-records-empty')).toBeVisible();
  });
});
