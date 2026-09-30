/**
 * `/admin/cms/settings`: redirige a la pestaña «General», la única que ve
 * todo el personal del CMS (preferencias personales).
 */
import { createFileRoute, redirect } from '@tanstack/react-router';

import { CMS_SETTINGS_TAB_PATHS } from '@pymekit/cms-ui-core/sections';

export const Route = createFileRoute('/admin/cms/settings/')({
  beforeLoad: () => {
    throw redirect({ to: CMS_SETTINGS_TAB_PATHS.general, replace: true });
  },
});
