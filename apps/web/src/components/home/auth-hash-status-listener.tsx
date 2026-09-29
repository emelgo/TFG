'use client';

import { useEffect, useEffectEvent } from 'react';

import { useTranslations } from 'use-intl';

import { toast } from '@pymekit/ui/sonner';

/**
 * @name AuthHashStatusListener
 * @description Reads the URL hash to surface any success or error messages
 * from Supabase Auth redirects, then cleans the hash from the URL.
 */
export function AuthHashStatusListener() {
  const t = useTranslations('auth');

  const showToast = useEffectEvent(() => {
    const hash = window.location.hash.slice(1);

    if (!hash) {
      return;
    }

    const params = new URLSearchParams(hash);
    const message = params.get('message');
    const error = params.get('error');
    const errorCode = params.get('error_code');
    const errorDescription = params.get('error_description');

    if (!message && !error && !errorCode && !errorDescription) {
      return;
    }

    if (error || errorCode || errorDescription) {
      const fallback = errorDescription ?? error ?? '';
      const translationKey = errorCode ? `errors.${errorCode}` : null;

      const description =
        translationKey && t.has(translationKey as never)
          ? t(translationKey as never)
          : fallback;

      toast.error(description);
    } else if (message) {
      toast.success(message);
    }

    const cleaned = `${window.location.pathname}${window.location.search}`;
    window.history.replaceState(null, '', cleaned);
  });

  useEffect(() => showToast(), []);

  return null;
}
