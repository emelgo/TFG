import type { Enums } from '@pymekit/supabase/database';
import { Alert, AlertDescription, AlertTitle } from '@pymekit/ui/alert';
import { alertExtras } from '@pymekit/ui/alert-extras';
import { Trans } from '@pymekit/ui/trans';

type Tone = 'success' | 'warning' | 'destructive';

const statusToneMap: Record<Enums<'subscription_status'>, Tone> = {
  active: 'success',
  trialing: 'success',
  past_due: 'destructive',
  canceled: 'destructive',
  unpaid: 'destructive',
  incomplete: 'warning',
  incomplete_expired: 'destructive',
  paused: 'warning',
};

export function CurrentPlanAlert(
  props: React.PropsWithoutRef<{
    status: Enums<'subscription_status'>;
  }>,
) {
  const prefix = 'billing.status';

  const text = `${prefix}.${props.status}.description`;
  const title = `${prefix}.${props.status}.heading`;
  const tone = statusToneMap[props.status];

  return (
    <Alert
      variant={tone === 'destructive' ? 'destructive' : undefined}
      className={tone === 'destructive' ? undefined : alertExtras[tone]}
    >
      <AlertTitle>
        <Trans i18nKey={title} />
      </AlertTitle>

      <AlertDescription>
        <Trans i18nKey={text} />
      </AlertDescription>
    </Alert>
  );
}
