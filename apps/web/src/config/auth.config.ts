import type { Provider } from '@supabase/supabase-js';

import * as z from 'zod';

const providers: z.ZodType<Provider> = getProviders();

const AuthConfigSchema = z.object({
  captchaTokenSiteKey: z.string().optional(),
  displayTermsCheckbox: z.boolean().optional(),
  enableIdentityLinking: z.boolean().optional().default(false),
  providers: z.object({
    password: z.boolean(),
    magicLink: z.boolean(),
    otp: z.boolean(),
    passkey: z.boolean(),
    oAuth: providers.array(),
  }),
});

const authConfig = AuthConfigSchema.parse({
  // NB: This is a public key, so it's safe to expose.
  // Copy the value from the Supabase Dashboard.
  captchaTokenSiteKey: import.meta.env.VITE_CAPTCHA_SITE_KEY,

  // whether to display the terms checkbox during sign-up
  displayTermsCheckbox:
    import.meta.env.VITE_DISPLAY_TERMS_AND_CONDITIONS_CHECKBOX === 'true',

  // whether to enable identity linking:
  // This needs to be enabled in the Supabase Console as well for it to work.
  enableIdentityLinking: import.meta.env.VITE_AUTH_IDENTITY_LINKING === 'true',

  // NB: Enable the providers below in the Supabase Console
  // in your production project
  providers: {
    password: import.meta.env.VITE_AUTH_PASSWORD === 'true',
    magicLink: import.meta.env.VITE_AUTH_MAGIC_LINK === 'true',
    otp: import.meta.env.VITE_AUTH_OTP === 'true',

    // NB: Passkeys are disabled by default. Enable WebAuthn in the Supabase
    // Console (Authentication > Sign In / Providers) for this to work.
    passkey: import.meta.env.VITE_AUTH_PASSKEY === 'true',
    oAuth: ['google'],
  },
} satisfies z.output<typeof AuthConfigSchema>);

export default authConfig;

function getProviders() {
  return z.enum([
    'apple',
    'azure',
    'bitbucket',
    'discord',
    'facebook',
    'figma',
    'github',
    'gitlab',
    'google',
    'kakao',
    'keycloak',
    'linkedin',
    'linkedin_oidc',
    'notion',
    'slack',
    'spotify',
    'twitch',
    'twitter',
    'workos',
    'zoom',
    'fly',
  ]);
}
