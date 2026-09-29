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
  { label: 'marketing.faq', path: '/faq' },
  { label: 'auth.signIn', path: '/auth/sign-in', showOn: 'mobile' },
  {
    label: 'auth.signUp',
    path: '/auth/sign-up',
    showOn: 'mobile',
    variant: 'default',
  },
];
