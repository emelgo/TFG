'use client';

import { useState } from 'react';

import { Eye, EyeOff, Lock } from 'lucide-react';
import { useTranslations } from 'use-intl';

import { Button } from '@pymekit/ui/button';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@pymekit/ui/input-group';

export function PasswordInput(props: React.ComponentProps<'input'>) {
  const [showPassword, setShowPassword] = useState(false);
  const t = useTranslations('auth');

  return (
    <InputGroup className="dark:bg-background">
      <InputGroupAddon>
        <Lock className="h-4 w-4" />
      </InputGroupAddon>

      <InputGroupInput
        data-testid="password-input"
        type={showPassword ? 'text' : 'password'}
        placeholder={'************'}
        {...props}
      />

      <InputGroupAddon align="inline-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowPassword(!showPassword)}
          // El botón solo tiene un icono: sin nombre accesible, un lector de
          // pantalla lo anunciaría como «botón» sin decir para qué sirve.
          aria-label={showPassword ? t('hidePassword') : t('showPassword')}
          aria-pressed={showPassword}
        >
          {showPassword ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </Button>
      </InputGroupAddon>
    </InputGroup>
  );
}
