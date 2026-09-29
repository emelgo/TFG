'use client';

import { useEffect, useRef, useState } from 'react';

import type { Provider } from '@supabase/supabase-js';

import { LinkAccountsList } from '@pymekit/accounts/personal-account-settings';
import { useUser } from '@pymekit/supabase/hooks/use-user';
import { useUserIdentities } from '@pymekit/supabase/hooks/use-user-identities';
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
import { Trans } from '@pymekit/ui/trans';

interface IdentitiesStepWrapperProps {
  nextPath: string;
  showPasswordOption: boolean;
  showEmailOption: boolean;
  enableIdentityLinking: boolean;
  oAuthProviders: Provider[];
  requiresConfirmation: boolean;
}

export function IdentitiesStepWrapper(props: IdentitiesStepWrapperProps) {
  const user = useUser();
  const { identities } = useUserIdentities();

  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [hasSetPassword, setHasSetPassword] = useState(false);
  const [hasLinkedProvider, setHasLinkedProvider] = useState(false);

  const initialCountRef = useRef<number | null>(null);
  const initialHasPasswordRef = useRef<boolean | null>(null);

  // Capture initial state once when data becomes available.
  // Using refs to avoid re-renders and useEffect to avoid accessing refs during render.
  useEffect(() => {
    if (initialCountRef.current === null && identities.length > 0) {
      const nonEmailIdentities = identities.filter(
        (identity) => identity.provider !== 'email',
      );

      initialCountRef.current = nonEmailIdentities.length;
    }
  }, [identities]);

  useEffect(() => {
    if (initialHasPasswordRef.current === null && user.data) {
      const amr = user.data.amr || [];

      const hasPassword = amr.some((item) => {
        if (typeof item === 'string') {
          return item === 'password';
        }

        return item.method === 'password';
      });

      initialHasPasswordRef.current = hasPassword;
    }
  }, [user.data]);

  const handleContinueClick = (e: React.MouseEvent) => {
    // Only show confirmation if password or oauth is enabled (requiresConfirmation)
    if (!props.requiresConfirmation) {
      return;
    }

    const currentNonEmailIdentities = identities.filter(
      (identity) => identity.provider !== 'email',
    );

    const hasAddedNewIdentity =
      currentNonEmailIdentities.length > (initialCountRef.current ?? 0);

    // Check if password was added
    const amr = user.data?.amr || [];

    const currentHasPassword = amr.some((item) => {
      if (typeof item === 'string') {
        return item === 'password';
      }

      return item.method === 'password';
    });

    const hasAddedPassword =
      currentHasPassword && !initialHasPasswordRef.current;

    // If no new identity was added AND no password was set AND no provider linked, show confirmation dialog
    if (
      !hasAddedNewIdentity &&
      !hasAddedPassword &&
      !hasSetPassword &&
      !hasLinkedProvider
    ) {
      e.preventDefault();
      setShowConfirmDialog(true);
    }
  };

  return (
    <>
      <div
        className={
          'animate-in fade-in slide-in-from-bottom-4 mx-auto flex w-full max-w-md flex-col space-y-4 duration-500'
        }
        data-testid="join-step-two"
      >
        <LinkAccountsList
          providers={props.oAuthProviders}
          showPasswordOption={props.showPasswordOption}
          showEmailOption={props.showEmailOption}
          redirectTo={props.nextPath}
          enabled={props.enableIdentityLinking}
          onPasswordSet={() => setHasSetPassword(true)}
          onProviderLinked={() => setHasLinkedProvider(true)}
        />

        <Button
          nativeButton={false}
          render={
            <a href={props.nextPath} onClick={handleContinueClick}>
              <Trans i18nKey={'common.continueKey'} />
            </a>
          }
          data-testid="continue-button"
        />
      </div>

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent data-testid="no-auth-method-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle data-testid="no-auth-dialog-title">
              <Trans i18nKey={'auth.noIdentityLinkedTitle'} />
            </AlertDialogTitle>

            <AlertDialogDescription data-testid="no-auth-dialog-description">
              <Trans i18nKey={'auth.noIdentityLinkedDescription'} />
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel data-testid="no-auth-dialog-cancel">
              <Trans i18nKey={'common.cancel'} />
            </AlertDialogCancel>

            <AlertDialogAction
              nativeButton={false}
              render={
                <a href={props.nextPath}>
                  <Trans i18nKey={'common.continueKey'} />
                </a>
              }
              data-testid="no-auth-dialog-continue"
            />
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
