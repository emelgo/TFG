'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@pymekit/ui/dialog';
import { useAsyncDialog } from '@pymekit/ui/hooks/use-async-dialog';
import { Trans } from '@pymekit/ui/trans';

import { CreateTeamAccountForm } from './create-team-account-form';

export function CreateTeamAccountDialog(
  props: React.PropsWithChildren<{
    isOpen: boolean;
    setIsOpen: (isOpen: boolean) => void;
  }>,
) {
  const { dialogProps, isPending, setIsPending, setOpen } = useAsyncDialog({
    open: props.isOpen,
    onOpenChange: props.setIsOpen,
  });

  return (
    <Dialog {...dialogProps}>
      <DialogContent showCloseButton={!isPending}>
        <DialogHeader>
          <DialogTitle>
            <Trans i18nKey={'teams.createTeamModalHeading'} />
          </DialogTitle>

          <DialogDescription>
            <Trans i18nKey={'teams.createTeamModalDescription'} />
          </DialogDescription>
        </DialogHeader>

        <CreateTeamAccountForm
          isPending={isPending}
          setIsPending={setIsPending}
          onClose={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
