'use client';

import { Mail } from 'lucide-react';
import { useTranslations } from 'use-intl';

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@pymekit/ui/input-group';

export function EmailInput(props: React.ComponentProps<'input'>) {
  const t = useTranslations('auth');

  return (
    <InputGroup className="dark:bg-background">
      <InputGroupAddon>
        <Mail className="h-4 w-4" />
      </InputGroupAddon>

      <InputGroupInput
        data-testid={'email-input'}
        required
        type="email"
        placeholder={t('emailPlaceholder')}
        {...props}
      />
    </InputGroup>
  );
}
