import { createClient } from '@supabase/supabase-js';

/**
 * Pruebas E2E del explorador de almacenamiento del CMS (F2.5).
 *
 * Con el super-admin (raíz del CMS, sesión con MFA), sobre el *bucket*
 * `account_image` (las fotos de perfil de los *tenants*) y siempre dentro de
 * una carpeta de prueba propia de cada ejecución:
 *  - lista los *buckets* y abre `account_image`;
 *  - sube un PNG, lo previsualiza, lo renombra y lo borra desde la interfaz.
 *
 * Seguridad de la API (usa el cliente de servicio de Storage, que ignora
 * RLS, así que todo se comprueba antes en el código):
 *  - rutas con `..`, absolutas o codificadas → 400 `STORAGE_INVALID_PATH`;
 *  - un HTML disfrazado de `.png` se guarda como `application/octet-stream`
 *    (nunca como `text/html` ni como imagen) y un fichero de más de 5 MB se
 *    rechaza con 413;
 *  - la descarga es una URL firmada que fuerza `Content-Disposition`;
 *  - el personal de soporte (sin permisos de almacenamiento) no ve ningún
 *    *bucket* y la API le responde 403 a listar, subir, renombrar y borrar.
 *
 * `afterAll` borra la carpeta de prueba con la clave de servicio.
 *
 * [TFG] RF-09 · RNF-02 · ADR-014.
 */
import { expect, test } from '@playwright/test';

import { AuthPageObject } from '../authentication/auth.po';
import { AUTH_STATES } from '../utils/auth-state';
import { CmsPageObject } from './cms.po';
import { StorageExplorerPageObject } from './storage-explorer.po';

const BUCKET = 'account_image';

/** Cabecera `Origin` de la web (la que envía el navegador). */
const SAME_ORIGIN = { origin: 'http://localhost:3100' };

const RUN_ID = `e2e-cms-storage-${Date.now()}-${Math.random()
  .toString(36)
  .slice(2, 8)}`;

/** PNG válido de 1×1 píxel. */
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

/** Cliente con la clave de servicio del Supabase local (ignora RLS). */
function getAdminClient() {
  return createClient(
    'http://127.0.0.1:54321',
    'sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz',
  );
}

/** Nombres de los objetos de una carpeta de prueba (con la clave de servicio). */
async function listFolder(folder: string) {
  const { data } = await getAdminClient().storage.from(BUCKET).list(folder);

  return data ?? [];
}

test.afterAll(async () => {
  const client = getAdminClient();

  // Cada prueba usa una subcarpeta de `RUN_ID`: se borran todas.
  const { data: folders } = await client.storage.from(BUCKET).list(RUN_ID);

  for (const folder of folders ?? []) {
    const path = `${RUN_ID}/${folder.name}`;
    const files = folder.id
      ? [path]
      : (await listFolder(path)).map((f) => `${path}/${f.name}`);

    if (files.length > 0) {
      await client.storage.from(BUCKET).remove(files);
    }
  }
});

test.describe('Explorador de almacenamiento: super-admin con MFA', () => {
  AuthPageObject.setupSession(AUTH_STATES.SUPER_ADMIN);

  test('lista los buckets y abre account_image', async ({ page }) => {
    const storage = new StorageExplorerPageObject(page);

    await storage.gotoBuckets();
    await page.getByTestId(`storage-bucket-${BUCKET}`).click();

    await page.waitForURL(`**/admin/cms/storage/${BUCKET}`);
    await storage.waitForHydration('storage-file-explorer');
    await expect(page.getByTestId('storage-breadcrumb-root')).toHaveText(
      BUCKET,
    );
  });

  test('sube, previsualiza, renombra y borra una imagen', async ({ page }) => {
    const storage = new StorageExplorerPageObject(page);
    const folder = `${RUN_ID}/ui`;

    await storage.gotoFolder(BUCKET, folder);

    // Subir un PNG pequeño.
    await page.getByTestId('storage-upload-button').click();
    await expect(page.getByTestId('storage-upload-dialog')).toBeVisible();

    await page.getByTestId('storage-upload-input').setInputFiles({
      name: 'avatar.png',
      mimeType: 'image/png',
      buffer: PNG_BYTES,
    });
    await page.getByTestId('storage-upload-submit').click();

    await expect(storage.item('avatar.png')).toBeVisible();

    // Se guarda como imagen porque su contenido es realmente un PNG.
    const [uploaded] = await listFolder(folder);

    expect(uploaded?.metadata?.['mimetype']).toBe('image/png');

    // Vista previa con la URL firmada de corta duración.
    await storage.item('avatar.png').getByTestId('storage-item-open').click();

    const preview = page.getByTestId('storage-image-preview');

    await expect(preview).toBeVisible();
    await expect
      .poll(() => preview.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBe(1);
    expect(await preview.getAttribute('src')).toContain('token=');

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('storage-image-preview-dialog')).toBeHidden();

    // Renombrar desde el menú del fichero.
    await storage.openItemMenu('avatar.png');
    await page.getByTestId('storage-item-rename').click();
    await page.getByTestId('storage-rename-input').fill('renamed.png');
    await page.getByTestId('storage-rename-submit').click();

    await expect(storage.item('renamed.png')).toBeVisible();
    await expect(storage.item('avatar.png')).toHaveCount(0);

    // Borrar.
    await storage.openItemMenu('renamed.png');
    await page.getByTestId('storage-item-delete').click();
    await page.getByTestId('storage-delete-confirm').click();

    await expect(page.getByTestId('storage-empty-folder')).toBeVisible();
    expect(await listFolder(folder)).toHaveLength(0);
  });
});

test.describe('API del explorador de almacenamiento: validación', () => {
  AuthPageObject.setupSession(AUTH_STATES.SUPER_ADMIN);

  test('rechaza rutas con recorrido, absolutas o codificadas', async ({
    page,
  }) => {
    await page.goto('/admin/cms');

    const base = `/api/cms/v1/storage/buckets/${BUCKET}`;

    const responses = await Promise.all([
      page.request.get(`${base}/contents?path=${encodeURIComponent('../x')}`),
      page.request.get(`${base}/contents?path=${encodeURIComponent('/etc')}`),
      page.request.get(
        `${base}/contents?path=${encodeURIComponent('a%2F..%2Fb')}`,
      ),
      page.request.post(`${base}/download`, {
        data: { path: `${RUN_ID}/../secret.png` },
      }),
      page.request.put(`${base}/rename`, {
        data: { fromPath: `${RUN_ID}/a.png`, toPath: '../a.png' },
      }),
      page.request.delete(`${base}/delete`, {
        data: { paths: ['a/../../b'] },
      }),
      page.request.post(`${base}/create-folder`, {
        data: { folderName: '..', parentPath: '' },
      }),
      page.request.get(
        `/api/cms/v1/storage/buckets/${encodeURIComponent('a/../b')}/contents`,
      ),
    ]);

    for (const response of responses) {
      expect(response.status(), response.url()).toBe(400);
      expect(await response.json()).toMatchObject({
        errorCode: 'STORAGE_INVALID_PATH',
      });
    }
  });

  test('guarda un HTML disfrazado de PNG como binario y limita el tamaño', async ({
    page,
  }) => {
    await page.goto('/admin/cms');

    const folder = `${RUN_ID}/api`;
    const upload = (name: string, buffer: Buffer, mimeType: string) =>
      page.request.post(`/api/cms/v1/storage/buckets/${BUCKET}/upload`, {
        // El filtro CSRF exige `Origin` en los envíos `multipart`; el
        // navegador siempre la envía.
        headers: SAME_ORIGIN,
        multipart: { folder, file: { name, mimeType, buffer } },
      });

    const html = await upload(
      'fake.png',
      Buffer.from('<html><script>alert(1)</script></html>'),
      'text/html',
    );

    expect(html.status()).toBe(200);

    const [stored] = await listFolder(folder);

    expect(stored?.name).toBe('fake.png');
    expect(stored?.metadata?.['mimetype']).toBe('application/octet-stream');

    // La descarga fuerza `Content-Disposition: attachment`.
    const download = await page.request.post(
      `/api/cms/v1/storage/buckets/${BUCKET}/download`,
      { data: { path: `${folder}/fake.png` } },
    );

    expect(download.status()).toBe(200);
    expect((await download.json()).downloadUrl).toContain('download=');

    const tooLarge = await upload(
      'big.png',
      Buffer.alloc(6 * 1024 * 1024),
      'image/png',
    );

    expect(tooLarge.status()).toBe(413);
    expect(await tooLarge.json()).toMatchObject({
      errorCode: 'STORAGE_FILE_TOO_LARGE',
    });
  });
});

test.describe('Explorador de almacenamiento: personal de soporte', () => {
  AuthPageObject.setupSession(AUTH_STATES.CMS_STAFF);

  test('la sección no existe para él', async ({ page }) => {
    const cms = new CmsPageObject(page);

    await page.goto('/admin/cms/storage');
    await expect(cms.notFound()).toBeVisible();

    await page.goto(`/admin/cms/storage/${BUCKET}`);
    await expect(cms.notFound()).toBeVisible();
  });

  test('no ve buckets y la API responde 403 a leer y escribir', async ({
    page,
  }) => {
    await page.goto('/admin/cms');

    const buckets = await page.request.get('/api/cms/v1/storage/buckets');

    expect(buckets.status()).toBe(200);
    expect((await buckets.json()).buckets).toEqual([]);

    const base = `/api/cms/v1/storage/buckets/${BUCKET}`;

    const responses = await Promise.all([
      page.request.get(`${base}/contents`),
      page.request.post(`${base}/download`, {
        data: { path: `${RUN_ID}/x.png` },
      }),
      page.request.post(`${base}/upload`, {
        headers: SAME_ORIGIN,
        multipart: {
          folder: `${RUN_ID}/staff`,
          file: { name: 'x.png', mimeType: 'image/png', buffer: PNG_BYTES },
        },
      }),
      page.request.put(`${base}/rename`, {
        data: { fromPath: `${RUN_ID}/x.png`, toPath: `${RUN_ID}/y.png` },
      }),
      page.request.delete(`${base}/delete`, {
        data: { paths: [`${RUN_ID}/x.png`] },
      }),
      page.request.post(`${base}/create-folder`, {
        data: { folderName: 'staff', parentPath: RUN_ID },
      }),
    ]);

    for (const response of responses) {
      expect(response.status(), response.url()).toBe(403);
      expect(await response.json()).toMatchObject({
        errorCode: 'STORAGE_PERMISSION_DENIED',
      });
    }

    // No se ha escrito nada.
    expect(await listFolder(`${RUN_ID}/staff`)).toHaveLength(0);
  });
});
