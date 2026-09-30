'use client';

// Wraps the shadcn `FieldError` to translate error messages via i18n,
// mirroring the previous `FormMessage` behavior. Lives outside
// `shadcn/field.tsx` so that file stays upstream-equivalent and can be
// replaced by the shadcn CLI (e.g. when switching themes).
//
// TanStack Form exposes `field.state.meta.errors` as an array of Standard
// Schema issues (`{ message?: string }`), so error strings are treated as
// i18n keys and passed through `Trans` — call sites stay translation-free.

import * as React from 'react';

import { cn } from '../lib/utils';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle,
} from '../shadcn/field';
import { Trans } from './trans';

const FieldError: React.FC<
  React.ComponentProps<'div'> & {
    errors?: Array<{ message?: string } | undefined>;
    params?: Record<string, unknown>;
  }
> = ({ className, children, errors, params = {}, ...props }) => {
  const content = React.useMemo(() => {
    if (children) {
      return children;
    }

    const messages = [
      ...new Set(
        (errors ?? [])
          .map((error) => error?.message)
          .filter((message): message is string => Boolean(message)),
      ),
    ];

    if (messages.length === 0) {
      return null;
    }

    if (messages.length === 1) {
      const message = messages[0]!;

      return <Trans i18nKey={message} defaults={message} values={params} />;
    }

    return (
      <ul className="ml-4 flex list-disc flex-col gap-1">
        {messages.map((message) => (
          <li key={message}>
            <Trans i18nKey={message} defaults={message} values={params} />
          </li>
        ))}
      </ul>
    );
  }, [children, errors, params]);

  if (!content) {
    return null;
  }

  return (
    <div
      role="alert"
      data-slot="field-error"
      className={cn('text-destructive text-sm font-normal', className)}
      {...props}
    >
      {content}
    </div>
  );
};
FieldError.displayName = 'FieldError';

export {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle,
};
