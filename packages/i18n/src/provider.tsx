import type { ReactNode } from 'react';

import { IntlProvider, type Messages } from 'use-intl';

const isDevelopment = process.env.NODE_ENV !== 'production';

interface I18nProviderProps {
  locale: string;
  messages: Messages;
  timeZone?: string;
  children: ReactNode;
}

/**
 * Provides translation context to the app. Missing keys fall back to the key
 * itself; missing translations are logged in development only.
 */
export function I18nProvider({
  locale,
  messages,
  timeZone = 'UTC',
  children,
}: I18nProviderProps) {
  return (
    <IntlProvider
      locale={locale}
      messages={messages}
      timeZone={timeZone}
      getMessageFallback={(info) => info.key}
      onError={(error) => {
        if (isDevelopment) {
          console.warn(`i18n: ${error.message}`);
        }
      }}
    >
      {children}
    </IntlProvider>
  );
}
