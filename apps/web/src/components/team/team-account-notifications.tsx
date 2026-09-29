import { NotificationsPopover } from '@pymekit/notifications/components';

import featuresFlagConfig from '#/config/feature-flags.config.ts';

export function TeamAccountNotifications(props: {
  userId: string;
  accountId: string;
}) {
  if (!featuresFlagConfig.enableNotifications) {
    return null;
  }

  return (
    <NotificationsPopover
      accountIds={[props.userId, props.accountId]}
      realtime={featuresFlagConfig.realtimeNotifications}
    />
  );
}
