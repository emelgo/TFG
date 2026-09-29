'use client';

import { useRef } from 'react';

import {
  Turnstile,
  type TurnstileInstance,
  type TurnstileProps,
  type WidgetSize,
} from '@marsidev/react-turnstile';

// VITE_CAPTCHA_WIDGET_SIZE controls the default Turnstile widget size.
// Set to 'normal' or 'compact' when using a Managed site key so the checkbox
// is visible. Defaults to 'invisible' for non-interactive / invisible keys.
const DEFAULT_WIDGET_SIZE =
  (import.meta.env.VITE_CAPTCHA_WIDGET_SIZE as WidgetSize | undefined) ??
  'invisible';

interface CaptchaFieldProps {
  siteKey: string | undefined;
  options?: Omit<TurnstileProps, 'siteKey' | 'onSuccess'>;
  nonce?: string;
  className?: string;
  onTokenChange: (token: string) => void;
  onInstanceChange?: (instance: TurnstileInstance | null) => void;
}

/**
 * @name CaptchaField
 * @description Self-contained captcha component. Reports the token via
 * `onTokenChange`; callers wire the token into their form/submit flow.
 *
 * ```tsx
 * <CaptchaField siteKey={siteKey} onTokenChange={setToken} />
 * ```
 */
export function CaptchaField({
  siteKey,
  options,
  nonce,
  className,
  onTokenChange,
  onInstanceChange,
}: CaptchaFieldProps) {
  const instanceRef = useRef<TurnstileInstance | null>(null);

  if (!siteKey) {
    return null;
  }

  return (
    <CaptchaWidget
      siteKey={siteKey}
      options={options}
      nonce={nonce}
      className={className}
      onSuccess={onTokenChange}
      onInstanceChange={(instance) => {
        instanceRef.current = instance;
        onInstanceChange?.(instance);
      }}
    />
  );
}

interface CaptchaWidgetProps {
  siteKey: string;
  options?: Omit<TurnstileProps, 'siteKey' | 'onSuccess'>;
  nonce?: string;
  className?: string;
  onSuccess: (token: string) => void;
  onInstanceChange?: (instance: TurnstileInstance | null) => void;
}

function CaptchaWidget({
  siteKey,
  options,
  nonce,
  className,
  onSuccess,
  onInstanceChange,
}: CaptchaWidgetProps) {
  const widgetOptions = {
    size: DEFAULT_WIDGET_SIZE,
    ...options?.options,
  };

  return (
    <Turnstile
      className={className}
      ref={(instance) => {
        if (instance) {
          onInstanceChange?.(instance);
        }
      }}
      siteKey={siteKey}
      onSuccess={onSuccess}
      scriptOptions={{ nonce }}
      {...options}
      options={widgetOptions}
    />
  );
}
