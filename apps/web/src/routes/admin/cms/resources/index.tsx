/**
 * `/admin/cms/resources`: enlace «Todas las tablas» de la barra lateral.
 *
 * El listado de todas las tablas legibles, agrupadas por área, vive en la
 * portada del CMS, así que esta ruta redirige allí.
 */
import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/admin/cms/resources/')({
  beforeLoad: () => {
    throw redirect({ to: '/admin/cms' });
  },
});
