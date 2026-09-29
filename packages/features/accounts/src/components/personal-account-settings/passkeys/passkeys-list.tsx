'use client';

import { useCallback, useState } from 'react';

import type { PasskeyListItem } from '@supabase/supabase-js';

import { Fingerprint, Plus, TriangleAlert, X } from 'lucide-react';
import { useTranslations } from 'use-intl';

import { useDeletePasskey } from '@pymekit/supabase/hooks/use-delete-passkey';
import { useFetchPasskeys } from '@pymekit/supabase/hooks/use-fetch-passkeys';
import { useRegisterPasskey } from '@pymekit/supabase/hooks/use-register-passkey';
import { isPasskeyCeremonyCancelled } from '@pymekit/supabase/passkey-errors';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@pymekit/ui/tooltip';
import { Trans } from '@pymekit/ui/trans';

export function PasskeysList(props: { userId: string }) {
  return (
    <div className={'flex flex-col space-y-4'}>
      <PasskeysListContainer userId={props.userId} />

      <div>
        <RegisterPasskeyButton userId={props.userId} />
      </div>
    </div>
  );
}

function PasskeysListContainer(props: { userId: string }) {
  const { data: passkeys, isLoading, isError } = useFetchPasskeys(props.userId);

  if (isLoading) {
    return (
      <div className={'flex items-center space-x-4'}>
        <Spinner />

        <div>
          <Trans i18nKey={'account.loadingPasskeys'} />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <Alert variant={'destructive'}>
        <TriangleAlert className={'h-4'} />

        <AlertTitle>
          <Trans i18nKey={'account.passkeysListError'} />
        </AlertTitle>

        <AlertDescription>
          <Trans i18nKey={'account.passkeysListErrorDescription'} />
        </AlertDescription>
      </Alert>
    );
  }

  if (!passkeys?.length) {
    return (
      <Item variant="outline">
        <ItemMedia>
          <Fingerprint className={'h-4'} />
        </ItemMedia>

        <ItemContent>
          <ItemTitle>
            <Trans i18nKey={'account.passkeysEmptyHeading'} />
          </ItemTitle>

          <ItemDescription>
            <Trans i18nKey={'account.passkeysEmptyDescription'} />
          </ItemDescription>
        </ItemContent>
      </Item>
    );
  }

  return (
    <div className={'flex flex-col space-y-2'}>
      {passkeys.map((passkey) => (
        <PasskeyItem key={passkey.id} passkey={passkey} userId={props.userId} />
      ))}
    </div>
  );
}

function PasskeyItem(props: { passkey: PasskeyListItem; userId: string }) {
  const t = useTranslations();
  const [isDeleting, setIsDeleting] = useState(false);

  const friendlyName =
    props.passkey.friendly_name ?? t('account.passkeyDefaultName');

  return (
    <>
      <Item variant="outline">
        <ItemMedia>
          <Fingerprint className={'h-4'} />
        </ItemMedia>

        <ItemContent>
          <ItemTitle>{friendlyName}</ItemTitle>

          <ItemDescription>
            <Trans
              i18nKey={'account.passkeyCreatedAt'}
              values={{
                date: new Date(props.passkey.created_at).toLocaleDateString(),
              }}
            />
          </ItemDescription>
        </ItemContent>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant={'ghost'}
                size={'icon'}
                onClick={() => setIsDeleting(true)}
              >
                <X className={'h-4'} />
              </Button>
            }
          />

          <TooltipContent>
            <Trans i18nKey={'account.deletePasskeyTooltip'} />
          </TooltipContent>
        </Tooltip>
      </Item>

      <If condition={isDeleting}>
        <ConfirmDeletePasskeyModal
          userId={props.userId}
          passkeyId={props.passkey.id}
          setIsModalOpen={setIsDeleting}
        />
      </If>
    </>
  );
}

function ConfirmDeletePasskeyModal(props: {
  userId: string;
  passkeyId: string;
  setIsModalOpen: (isOpen: boolean) => void;
}) {
  const t = useTranslations();
  const deletePasskey = useDeletePasskey(props.userId);

  const onDeleteRequested = useCallback(() => {
    if (deletePasskey.isPending) return;

    const promise = deletePasskey
      .mutateAsync(props.passkeyId)
      .then(() => props.setIsModalOpen(false));

    toast.promise(promise, {
      loading: t('account.deletingPasskey'),
      success: t('account.deletePasskeySuccess'),
      error: t('account.deletePasskeyError'),
    });
  }, [deletePasskey, props, t]);

  return (
    <AlertDialog open={true} onOpenChange={props.setIsModalOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            <Trans i18nKey={'account.deletePasskeyModalHeading'} />
          </AlertDialogTitle>

          <AlertDialogDescription>
            <Trans i18nKey={'account.deletePasskeyModalDescription'} />
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel>
            <Trans i18nKey={'common.cancel'} />
          </AlertDialogCancel>

          <AlertDialogAction
            type={'button'}
            disabled={deletePasskey.isPending}
            onClick={onDeleteRequested}
          >
            <Trans i18nKey={'account.deletePasskeyModalButtonLabel'} />
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function RegisterPasskeyButton(props: { userId: string }) {
  const t = useTranslations();
  const registerPasskey = useRegisterPasskey(props.userId);

  const onRegister = useCallback(() => {
    if (registerPasskey.isPending) return;

    const toastId = toast.loading(t('account.registeringPasskey'));

    registerPasskey
      .mutateAsync(undefined)
      .then(() => {
        toast.success(t('account.registerPasskeySuccess'), { id: toastId });
      })
      .catch((error: unknown) => {
        // dismissing the browser prompt is routine — don't show an error toast
        if (isPasskeyCeremonyCancelled(error)) {
          toast.dismiss(toastId);

          return;
        }

        toast.error(t('account.registerPasskeyError'), { id: toastId });
      });
  }, [registerPasskey, t]);

  return (
    <Button
      variant={'outline'}
      disabled={registerPasskey.isPending}
      onClick={onRegister}
    >
      <Plus className={'h-4'} />

      <span>
        <Trans i18nKey={'account.registerPasskeyButtonLabel'} />
      </span>
    </Button>
  );
}
