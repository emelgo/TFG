import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@pymekit/ui/card';
import { Trans } from '@pymekit/ui/trans';

export type AdminDashboardData = {
  accounts: number | null;
  teamAccounts: number | null;
  subscriptions: number | null;
  trials: number | null;
};

export function AdminDashboard(props: { data: AdminDashboardData }) {
  const { data } = props;

  return (
    <div
      className={
        'grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3' +
        ' xl:grid-cols-4'
      }
    >
      <Card>
        <CardHeader>
          <CardTitle>
            <Trans i18nKey={'admin.dashUsers'} />
          </CardTitle>

          <CardDescription>
            <Trans i18nKey={'admin.dashUsersDescription'} />
          </CardDescription>
        </CardHeader>

        <CardContent>
          <div className={'flex justify-between'}>
            <Figure>{data.accounts}</Figure>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <Trans i18nKey={'admin.dashTeamAccounts'} />
          </CardTitle>

          <CardDescription>
            <Trans i18nKey={'admin.dashTeamAccountsDescription'} />
          </CardDescription>
        </CardHeader>

        <CardContent>
          <div className={'flex justify-between'}>
            <Figure>{data.teamAccounts}</Figure>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <Trans i18nKey={'admin.dashPayingCustomers'} />
          </CardTitle>
          <CardDescription>
            <Trans i18nKey={'admin.dashPayingCustomersDescription'} />
          </CardDescription>
        </CardHeader>

        <CardContent>
          <div className={'flex justify-between'}>
            <Figure>{data.subscriptions}</Figure>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <Trans i18nKey={'admin.dashTrials'} />
          </CardTitle>

          <CardDescription>
            <Trans i18nKey={'admin.dashTrialsDescription'} />
          </CardDescription>
        </CardHeader>

        <CardContent>
          <div className={'flex justify-between'}>
            <Figure>{data.trials}</Figure>
          </div>
        </CardContent>
      </Card>

      <div>
        <p className={'text-muted-foreground w-max text-xs'}>
          <Trans i18nKey={'admin.dashEstimated'} />
        </p>
      </div>
    </div>
  );
}

function Figure(props: React.PropsWithChildren) {
  return <div className={'text-3xl font-bold'}>{props.children}</div>;
}
