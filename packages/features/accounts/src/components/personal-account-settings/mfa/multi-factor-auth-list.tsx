'use client';

import { useCallback, useState } from 'react';

import type { Factor } from '@supabase/supabase-js';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, TriangleAlert, X } from 'lucide-react';
import { useTranslations } from 'use-intl';

import { useFetchAuthFactors } from '@pymekit/supabase/hooks/use-fetch-mfa-factors';
import { useSupabase } from '@pymekit/supabase/hooks/use-supabase';
import { useFactorsMutationKey } from '@pymekit/supabase/hooks/use-user-factors-mutation-key';
import { Alert, AlertDescription, AlertTitle } from '@pymekit/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@pymekit/ui/alert-dialog';
import { Badge } from '@pymekit/ui/badge';
import { badgeExtras } from '@pymekit/ui/badge-extras';
import { Button } from '@pymekit/ui/button';
import { If } from '@pymekit/ui/if';
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from '@pymekit/ui/item';
import { toast } from '@pymekit/ui/sonner';
import { Spinner } from '@pymekit/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@pymekit/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@pymekit/ui/tooltip';
import { Trans } from '@pymekit/ui/trans';
import { cn } from '@pymekit/ui/utils';

import { MultiFactorAuthSetupDialog } from './multi-factor-auth-setup-dialog';

export function MultiFactorAuthFactorsList(props: { userId: string }) {
  return (
    <div className={'flex flex-col space-y-4'}>
      <FactorsTableContainer userId={props.userId} />

      <div>
        <MultiFactorAuthSetupDialog userId={props.userId} />
      </div>
    </div>
  );
}

function FactorsTableContainer(props: { userId: string }) {
  const {
    data: factors,
    isLoading,
    isError,
  } = useFetchAuthFactors(props.userId);

  if (isLoading) {
    return (
      <div className={'flex items-center space-x-4'}>
        <Spinner />

        <div>
          <Trans i18nKey={'account.loadingFactors'} />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div>
        <Alert variant={'destructive'}>
          <TriangleAlert className={'h-4'} />

          <AlertTitle>
            <Trans i18nKey={'account.factorsListError'} />
          </AlertTitle>

          <AlertDescription>
            <Trans i18nKey={'account.factorsListErrorDescription'} />
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const allFactors = factors?.all ?? [];

  if (!allFactors.length) {
    return (
      <div className={'flex flex-col space-y-4'}>
        <Item variant="outline">
          <ItemMedia>
            <ShieldCheck className={'h-4'} />
          </ItemMedia>

          <ItemContent>
            <ItemTitle>
              <Trans i18nKey={'account.multiFactorAuthHeading'} />
            </ItemTitle>

            <ItemDescription>
              <Trans i18nKey={'account.multiFactorAuthDescription'} />
            </ItemDescription>
          </ItemContent>
        </Item>
      </div>
    );
  }

  return <FactorsTable factors={allFactors} userId={props.userId} />;
}

function ConfirmUnenrollFactorModal(
  props: React.PropsWithChildren<{
    factorId: string;
    userId: string;
    setIsModalOpen: (isOpen: boolean) => void;
  }>,
) {
  const t = useTranslations();
  const unEnroll = useUnenrollFactor(props.userId);

  const onUnenrollRequested = useCallback(
    (factorId: string) => {
      if (unEnroll.isPending) return;

      const promise = unEnroll.mutateAsync(factorId).then((response) => {
        props.setIsModalOpen(false);

        if (!response.success) {
          const errorCode = response.data;

          // use-intl has no i18next-style `defaultValue` option, so we check
          // catalog membership and fall back to a generic error message.
          const errorKey = `auth.errors.${errorCode}` as never;

          throw t.has(errorKey)
            ? t(errorKey)
            : t(`account.unenrollFactorError` as never);
        }
      });

      toast.promise(promise, {
        loading: t(`account.unenrollingFactor` as never),
        success: t(`account.unenrollFactorSuccess` as never),
        error: (error: string) => {
          return error;
        },
      });
    },
    [props, t, unEnroll],
  );

  return (
    <AlertDialog open={!!props.factorId} onOpenChange={props.setIsModalOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            <Trans i18nKey={'account.unenrollFactorModalHeading'} />
          </AlertDialogTitle>

          <AlertDialogDescription>
            <Trans i18nKey={'account.unenrollFactorModalDescription'} />
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel>
            <Trans i18nKey={'common.cancel'} />
          </AlertDialogCancel>

          <AlertDialogAction
            type={'button'}
            disabled={unEnroll.isPending}
            onClick={() => onUnenrollRequested(props.factorId)}
          >
            <Trans i18nKey={'account.unenrollFactorModalButtonLabel'} />
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function FactorsTable({
  factors,
  userId,
}: React.PropsWithChildren<{
  factors: Factor[];
  userId: string;
}>) {
  const [unEnrolling, setUnenrolling] = useState<string>();

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <Trans i18nKey={'account.factorName'} />
            </TableHead>
            <TableHead>
              <Trans i18nKey={'account.factorType'} />
            </TableHead>
            <TableHead>
              <Trans i18nKey={'account.factorStatus'} />
            </TableHead>

            <TableHead />
          </TableRow>
        </TableHeader>

        <TableBody>
          {factors.map((factor) => (
            <TableRow key={factor.id}>
              <TableCell>
                <span className={'block truncate'}>{factor.friendly_name}</span>
              </TableCell>

              <TableCell>
                <Badge
                  className={cn('inline-flex uppercase', badgeExtras.info)}
                >
                  {factor.factor_type}
                </Badge>
              </TableCell>

              <td>
                <Badge
                  variant={factor.status === 'verified' ? undefined : 'outline'}
                  className={cn(
                    'inline-flex capitalize',
                    factor.status === 'verified' && badgeExtras.success,
                  )}
                >
                  {factor.status}
                </Badge>
              </td>

              <td className={'flex justify-end'}>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant={'ghost'}
                        size={'icon'}
                        onClick={() => setUnenrolling(factor.id)}
                      >
                        <X className={'h-4'} />
                      </Button>
                    }
                  />

                  <TooltipContent>
                    <Trans i18nKey={'account.unenrollTooltip'} />
                  </TooltipContent>
                </Tooltip>
              </td>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <If condition={unEnrolling}>
        {(factorId) => (
          <ConfirmUnenrollFactorModal
            userId={userId}
            factorId={factorId}
            setIsModalOpen={() => setUnenrolling(undefined)}
          />
        )}
      </If>
    </>
  );
}

function useUnenrollFactor(userId: string) {
  const queryClient = useQueryClient();
  const client = useSupabase();
  const mutationKey = useFactorsMutationKey(userId);

  const mutationFn = async (factorId: string) => {
    const { data, error } = await client.auth.mfa.unenroll({
      factorId,
    });

    if (error) {
      return {
        success: false as const,
        data: error.code as string,
      };
    }

    return {
      success: true as const,
      data,
    };
  };

  return useMutation({
    mutationFn,
    mutationKey,
    onSuccess: () => {
      return queryClient.refetchQueries({
        queryKey: mutationKey,
      });
    },
  });
}
