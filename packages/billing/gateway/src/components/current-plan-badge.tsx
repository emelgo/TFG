import type { Enums } from '@pymekit/supabase/database';
import { Badge } from '@pymekit/ui/badge';
import { badgeExtras } from '@pymekit/ui/badge-extras';
import { Trans } from '@pymekit/ui/trans';

type Status = Enums<'subscription_status'> | Enums<'payment_status'>;
type Tone = 'success' | 'warning' | 'destructive';

const statusToneMap: Record<Status, Tone> = {
  active: 'success',
  succeeded: 'success',
  trialing: 'success',
  past_due: 'destructive',
  failed: 'destructive',
  canceled: 'destructive',
  unpaid: 'destructive',
  incomplete: 'warning',
  pending: 'warning',
  incomplete_expired: 'destructive',
  paused: 'warning',
};

export function CurrentPlanBadge(
  props: React.PropsWithoutRef<{
    status: Status;
  }>,
) {
  const text = `billing.status.${props.status}.badge`;
  const tone = statusToneMap[props.status];

  return (
    <Badge
      data-testid={'current-plan-card-status-badge'}
      variant={tone === 'destructive' ? 'destructive' : undefined}
      className={tone === 'destructive' ? undefined : badgeExtras[tone]}
    >
      <Trans i18nKey={text} />
    </Badge>
  );
}
