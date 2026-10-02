import { Loader2Icon } from 'lucide-react';
import { useTranslations } from 'use-intl';

import { cn } from '../lib/utils/cn';

function Spinner({ className, ...props }: React.ComponentProps<'svg'>) {
  const t = useTranslations('common.ui');
  return (
    <Loader2Icon
      role="status"
      aria-label={t('loadingShort')}
      className={cn('text-muted-foreground size-6 animate-spin', className)}
      {...props}
    />
  );
}

export { Spinner };
