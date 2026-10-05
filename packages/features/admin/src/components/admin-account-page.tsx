import { BadgeX, Ban, ShieldPlus, VenetianMask } from 'lucide-react';

import { EnumLabel } from '@pymekit/i18n/enum-labels';
import type { Database, Tables } from '@pymekit/supabase/database';
import { AppBreadcrumbs } from '@pymekit/ui/app-breadcrumbs';
import { Badge } from '@pymekit/ui/badge';
import { Button } from '@pymekit/ui/button';
import { Heading } from '@pymekit/ui/heading';
import { If } from '@pymekit/ui/if';
import { PageBody, PageHeader } from '@pymekit/ui/page';
import { ProfileAvatar } from '@pymekit/ui/profile-avatar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@pymekit/ui/table';
import { Trans } from '@pymekit/ui/trans';

import { AdminBanUserDialog } from './admin-ban-user-dialog';
import { AdminDeleteAccountDialog } from './admin-delete-account-dialog';
import { AdminDeleteUserDialog } from './admin-delete-user-dialog';
import { AdminImpersonateUserDialog } from './admin-impersonate-user-dialog';
import { AdminMembersTable } from './admin-members-table';
import { AdminMembershipsTable } from './admin-memberships-table';
import { AdminReactivateUserDialog } from './admin-reactivate-user-dialog';

type Account = Tables<'accounts'>;
type Subscription = Tables<'subscriptions'> & {
  subscription_items: Tables<'subscription_items'>[];
};
type MembershipWithTeam = Tables<'accounts_memberships'> & {
  account: {
    id: string;
    name: string;
  };
};
type Member =
  Database['public']['Functions']['get_account_members']['Returns'][number];

/**
 * Data resolved by the route loader for the account detail page. All Supabase
 * reads that used to live inline in the (async) server component now run in the
 * loader; this component is purely presentational.
 */
export type AdminAccountPageData = {
  account: Account;
  subscription: Subscription | null;
} & (
  | { type: 'personal'; isBanned: boolean; memberships: MembershipWithTeam[] }
  | { type: 'team'; members: Member[] }
);

export function AdminAccountPage(props: { data: AdminAccountPageData }) {
  if (props.data.type === 'personal') {
    return (
      <PersonalAccountPage
        account={props.data.account}
        subscription={props.data.subscription}
        isBanned={props.data.isBanned}
        memberships={props.data.memberships}
      />
    );
  }

  return (
    <TeamAccountPage
      account={props.data.account}
      subscription={props.data.subscription}
      members={props.data.members}
    />
  );
}

function PersonalAccountPage(props: {
  account: Account;
  subscription: Subscription | null;
  isBanned: boolean;
  memberships: MembershipWithTeam[];
}) {
  const { account, isBanned } = props;

  return (
    <PageBody className="gap-y-4">
      <PageHeader
        description={
          <AppBreadcrumbs
            values={{
              [account.id]: account.name ?? account.email ?? 'Account',
            }}
          />
        }
        summary={<Trans i18nKey={'admin.personalAccountSummary'} />}
      >
        <div className={'flex gap-x-2.5'}>
          <If condition={isBanned}>
            <AdminReactivateUserDialog userId={account.id}>
              <Button
                size={'sm'}
                variant={'secondary'}
                data-testid={'admin-reactivate-account-button'}
              >
                <ShieldPlus className={'mr-1 h-4'} />
                <Trans i18nKey={'admin.reactivate'} />
              </Button>
            </AdminReactivateUserDialog>
          </If>

          <If condition={!isBanned}>
            <AdminBanUserDialog userId={account.id}>
              <Button
                size={'sm'}
                variant={'secondary'}
                data-testid={'admin-ban-account-button'}
              >
                <Ban className={'text-destructive mr-1 h-3'} />
                <Trans i18nKey={'admin.ban'} />
              </Button>
            </AdminBanUserDialog>

            <AdminImpersonateUserDialog userId={account.id}>
              <Button
                size={'sm'}
                variant={'secondary'}
                data-testid={'admin-impersonate-button'}
              >
                <VenetianMask className={'mr-1 h-4 text-blue-500'} />
                <Trans i18nKey={'admin.impersonate'} />
              </Button>
            </AdminImpersonateUserDialog>
          </If>

          <AdminDeleteUserDialog userId={account.id}>
            <Button
              size={'sm'}
              variant={'destructive'}
              data-testid={'admin-delete-account-button'}
            >
              <BadgeX className={'mr-1 h-4'} />
              <Trans i18nKey={'admin.delete'} />
            </Button>
          </AdminDeleteUserDialog>
        </div>
      </PageHeader>

      <div className={'flex items-center justify-between'}>
        <div className={'flex items-center gap-x-4'}>
          <div className={'flex items-center gap-x-2.5'}>
            <ProfileAvatar
              pictureUrl={account.picture_url}
              displayName={account.name}
            />

            <span className={'text-sm font-semibold capitalize'}>
              {account.name}
            </span>
          </div>

          <Badge variant={'outline'}>
            <Trans i18nKey={'admin.personalAccount'} />
          </Badge>

          <If condition={isBanned}>
            <Badge variant={'destructive'}>
              <Trans i18nKey={'admin.banned'} />
            </Badge>
          </If>
        </div>
      </div>

      <div className={'flex flex-col gap-y-8'}>
        <SubscriptionsTable subscription={props.subscription} />

        <div className={'divider-divider-x flex flex-col gap-y-2.5'}>
          <Heading level={6}>
            <Trans i18nKey={'admin.teams'} />
          </Heading>

          <div className={'rounded-lg border p-2'}>
            <AdminMembershipsTable memberships={props.memberships} />
          </div>
        </div>
      </div>
    </PageBody>
  );
}

function TeamAccountPage(props: {
  account: Account;
  subscription: Subscription | null;
  members: Member[];
}) {
  const { account } = props;

  return (
    <PageBody className={'gap-y-6'}>
      <PageHeader
        description={
          <AppBreadcrumbs
            values={{
              [account.id]: account.name ?? account.email ?? 'Account',
            }}
          />
        }
        summary={<Trans i18nKey={'admin.teamAccountSummary'} />}
      >
        <AdminDeleteAccountDialog accountId={account.id}>
          <Button
            size={'sm'}
            variant={'destructive'}
            data-testid={'admin-delete-account-button'}
          >
            <BadgeX className={'mr-1 h-4'} />
            <Trans i18nKey={'admin.delete'} />
          </Button>
        </AdminDeleteAccountDialog>
      </PageHeader>

      <div className={'flex justify-between'}>
        <div className={'flex items-center gap-x-4'}>
          <div className={'flex items-center gap-x-2.5'}>
            <ProfileAvatar
              pictureUrl={account.picture_url}
              displayName={account.name}
            />

            <span className={'text-sm font-semibold capitalize'}>
              {account.name}
            </span>
          </div>

          <Badge variant={'outline'}>
            <Trans i18nKey={'admin.teamAccount'} />
          </Badge>
        </div>
      </div>

      <div>
        <div className={'flex flex-col gap-y-8'}>
          <SubscriptionsTable subscription={props.subscription} />

          <div className={'flex flex-col gap-y-2.5'}>
            <Heading level={6}>
              <Trans i18nKey={'admin.teamMembers'} />
            </Heading>

            <div className={'rounded-lg border p-2'}>
              <AdminMembersTable members={props.members} />
            </div>
          </div>
        </div>
      </div>
    </PageBody>
  );
}

function SubscriptionsTable(props: { subscription: Subscription | null }) {
  return (
    <div className={'flex flex-col gap-y-1'}>
      <Heading level={6}>
        <Trans i18nKey={'admin.subscription'} />
      </Heading>

      <If
        condition={props.subscription}
        fallback={
          <span className={'text-muted-foreground text-sm'}>
            <Trans i18nKey={'admin.noSubscription'} />
          </span>
        }
      >
        {(subscription) => {
          return (
            <div className={'flex flex-col space-y-4'}>
              <Table>
                <TableHeader>
                  <TableHead>
                    <Trans i18nKey={'admin.subscriptionId'} />
                  </TableHead>

                  <TableHead>
                    <Trans i18nKey={'admin.provider'} />
                  </TableHead>

                  <TableHead>
                    <Trans i18nKey={'admin.customerId'} />
                  </TableHead>

                  <TableHead>
                    <Trans i18nKey={'admin.status'} />
                  </TableHead>

                  <TableHead>
                    <Trans i18nKey={'admin.createdAt'} />
                  </TableHead>

                  <TableHead>
                    <Trans i18nKey={'admin.periodStartsAt'} />
                  </TableHead>

                  <TableHead>
                    <Trans i18nKey={'admin.endsAt'} />
                  </TableHead>
                </TableHeader>

                <TableBody>
                  <TableRow>
                    <TableCell>
                      <span>{subscription.id}</span>
                    </TableCell>

                    <TableCell>
                      <span>
                        <EnumLabel
                          value={subscription.billing_provider}
                          enumName="billing_provider"
                        />
                      </span>
                    </TableCell>

                    <TableCell>
                      <span>{subscription.billing_customer_id}</span>
                    </TableCell>

                    <TableCell>
                      <span>
                        <EnumLabel
                          value={subscription.status}
                          enumName="subscription_status"
                        />
                      </span>
                    </TableCell>

                    <TableCell>
                      <span>{subscription.created_at}</span>
                    </TableCell>

                    <TableCell>
                      <span>{subscription.period_starts_at}</span>
                    </TableCell>

                    <TableCell>
                      <span>{subscription.period_ends_at}</span>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>

              <Table>
                <TableHeader>
                  <TableHead>
                    <Trans i18nKey={'admin.productId'} />
                  </TableHead>

                  <TableHead>
                    <Trans i18nKey={'admin.variantId'} />
                  </TableHead>

                  <TableHead>
                    <Trans i18nKey={'admin.quantity'} />
                  </TableHead>

                  <TableHead>
                    <Trans i18nKey={'admin.price'} />
                  </TableHead>

                  <TableHead>
                    <Trans i18nKey={'admin.interval'} />
                  </TableHead>

                  <TableHead>
                    <Trans i18nKey={'admin.type'} />
                  </TableHead>
                </TableHeader>

                <TableBody>
                  {subscription.subscription_items.map((item) => {
                    return (
                      <TableRow key={item.variant_id}>
                        <TableCell>
                          <span>{item.product_id}</span>
                        </TableCell>

                        <TableCell>
                          <span>{item.variant_id}</span>
                        </TableCell>

                        <TableCell>
                          <span>{item.quantity}</span>
                        </TableCell>

                        <TableCell>
                          <span>{item.price_amount}</span>
                        </TableCell>

                        <TableCell>
                          <span>
                            <EnumLabel value={item.interval} />
                          </span>
                        </TableCell>

                        <TableCell>
                          <span>
                            <EnumLabel
                              value={item.type}
                              enumName="subscription_item_type"
                            />
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          );
        }}
      </If>
    </div>
  );
}
