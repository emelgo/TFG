/**
 * `/admin/cms/resources`: entrada «Explorador de datos» de la barra lateral.
 *
 * Mientras no exista la pantalla propia del explorador (F2.4), el listado de
 * tablas legibles vive en la portada del CMS, así que esta ruta redirige allí.
 */
import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/admin/cms/resources/')({
  beforeLoad: () => {
    throw redirect({ to: '/admin/cms' });
  },
});
