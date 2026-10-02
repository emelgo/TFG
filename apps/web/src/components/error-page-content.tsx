import { Link } from '@tanstack/react-router';
import { ArrowLeft, RefreshCw } from 'lucide-react';

import { Button } from '@pymekit/ui/button';
import { Trans } from '@pymekit/ui/trans';

/**
 * Shared error / not-found screen. Keys are `namespace:key` strings resolved by
 * `Trans`. Pass `reset` for recoverable route errors (renders a retry button),
 * otherwise a "back home" link is shown.
 */
export function ErrorPageContent({
  statusCode,
  heading,
  subtitle,
  reset,
  backLink = '/',
  backLabel = 'common.backToHomePage',
}: {
  statusCode?: string;
  heading: string;
  subtitle: string;
  reset?: () => void;
  backLink?: string;
  backLabel?: string;
}) {
  return (
    <div className="relative flex w-full flex-1 flex-col items-center justify-center overflow-hidden px-4">
      {statusCode ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-1/2 z-0 -translate-x-1/2 -translate-y-1/2 text-[16rem] leading-none font-extrabold tracking-tighter opacity-[0.02] select-none sm:text-[22rem] lg:text-[28rem]"
        >
          {/* El código de estado (404, 500…) es un número decorativo, no un
              texto traducible: tratarlo como clave i18n provocaba el aviso
              MISSING_MESSAGE en la consola. */}
          {statusCode}
        </span>
      ) : null}

      <div className="relative z-10 flex max-w-md flex-col items-center gap-4 text-center">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          <Trans i18nKey={heading} />
        </h1>

        <p className="text-muted-foreground max-w-sm text-sm leading-relaxed">
          <Trans i18nKey={subtitle} />
        </p>

        <div className="mt-2 flex items-center gap-3">
          {reset ? (
            <Button onClick={reset} data-testid="error-retry-button">
              <RefreshCw className="h-4 w-4" />
              <Trans i18nKey="common.goBack" />
            </Button>
          ) : (
            <Button
              nativeButton={false}
              render={<Link to={backLink} />}
              data-testid="error-back-button"
            >
              <ArrowLeft className="h-4 w-4" />
              <Trans i18nKey={backLabel} />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
