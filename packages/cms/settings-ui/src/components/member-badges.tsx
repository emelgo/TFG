import { useTranslations } from 'use-intl';

import { Badge } from '@pymekit/ui/badge';
import { badgeExtras } from '@pymekit/ui/badge-extras';

/** Estado de la cuenta del CMS de un miembro (activa o desactivada). */
export function MemberStatusBadge(props: { active: boolean }) {
  const t = useTranslations('cms.settings.members');

  return props.active ? (
    <Badge
      className={badgeExtras.success}
      data-testid="member-status"
      data-status="active"
    >
      {t('status.active')}
    </Badge>
  ) : (
    <Badge
      variant="destructive"
      data-testid="member-status"
      data-status="inactive"
    >
      {t('status.inactive')}
    </Badge>
  );
}
