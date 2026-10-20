import type { Button } from '@pymekit/ui/button';

type NavLink = {
  label: string;
  path: string;
  showOn?: 'mobile';
  variant?: React.ComponentProps<typeof Button>['variant'];
};

/**
 * Marketing site navigation links. `showOn: 'mobile'` items (sign in / sign up)
 * only appear in the mobile drawer — the desktop header shows the account
 * section instead.
 */
export const marketingNavigationLinks: NavLink[] = [
  { label: 'marketing.pricing', path: '/pricing' },
  { label: 'marketing.blog', path: '/blog' },
  { label: 'marketing.faq', path: '/faq' },
  // [Escenario de evaluación F6] Formulario de solicitud de cita de la clínica
  { label: 'marketing.appointments.navLabel', path: '/appointments' },
  { label: 'auth.signIn', path: '/auth/sign-in', showOn: 'mobile' },
  {
    label: 'auth.signUp',
    path: '/auth/sign-up',
    showOn: 'mobile',
    variant: 'default',
  },
];
