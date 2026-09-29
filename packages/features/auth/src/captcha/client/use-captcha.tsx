'use client';

import { useCallback, useMemo, useRef, useState } from 'react';

import type {
  TurnstileInstance,
  TurnstileProps,
} from '@marsidev/react-turnstile';

import { cn } from '@pymekit/ui/utils';

import { CaptchaField } from './captcha-field';

/**
 * @name useCaptcha
 * @description Zero-boilerplate hook for captcha integration.
 * Manages token state and instance internally, exposing a clean API.
 *
 * @example
 * ```tsx
 * function SignInForm({ captchaSiteKey }) {
 *   const captcha = useCaptcha({ siteKey: captchaSiteKey });
 *
 *   const handleSubmit = async (data) => {
 *     await signIn({ ...data, captchaToken: captcha.token });
 *     captcha.reset();
 *   };
 *
 *   return (
 *     <form onSubmit={handleSubmit}>
 *       {captcha.field}
 *       <button>Submit</button>
 *     </form>
 *   );
 * }
 * ```
 */
export function useCaptcha(
  {
    siteKey,
    nonce,
    options,
  }: {
    siteKey?: string;
    nonce?: string;
    options?: TurnstileProps;
  } = {
    siteKey: undefined,
    nonce: undefined,
  },
) {
  const [token, setToken] = useState('');
  const instanceRef = useRef<TurnstileInstance | null>(null);

  const reset = useCallback(() => {
    instanceRef.current?.reset();
    setToken('');
  }, []);

  const handleTokenChange = useCallback((newToken: string) => {
    setToken(newToken);
  }, []);

  const handleInstanceChange = useCallback(
    (instance: TurnstileInstance | null) => {
      instanceRef.current = instance;
    },
    [],
  );

  const isInvisible = options?.options?.size === 'invisible';

  // fix for removing the "gap" for invisible widgets
  const className = cn({
    'mt-[-8px]': isInvisible,
  });

  const field = useMemo(
    () => (
      <CaptchaField
        siteKey={siteKey}
        onTokenChange={handleTokenChange}
        onInstanceChange={handleInstanceChange}
        nonce={nonce}
        options={options}
        className={className}
      />
    ),
    [
      siteKey,
      nonce,
      options,
      className,
      handleTokenChange,
      handleInstanceChange,
    ],
  );

  // Ready when captcha is not configured (no siteKey) or token is available
  const isReady = !siteKey || token !== '';

  return useMemo(
    () => ({
      /** The current captcha token */
      token,
      /** Whether the captcha is ready (not configured or token available) */
      isReady,
      /** Reset the captcha (clears token and resets widget) */
      reset,
      /** The captcha field component to render */
      field,
    }),
    [token, isReady, reset, field],
  );
}
