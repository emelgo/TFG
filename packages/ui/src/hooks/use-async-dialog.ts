'use client';

import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';

import {
  asyncDialogReducer,
  createAsyncDialogState,
} from './use-async-dialog-state';

interface UseAsyncDialogOptions {
  /**
   * External controlled open state (optional).
   * If not provided, the hook manages its own internal state.
   */
  open?: boolean;
  /**
   * External controlled onOpenChange callback (optional).
   * If not provided, the hook manages its own internal state.
   */
  onOpenChange?: (open: boolean) => void;
}

interface UseAsyncDialogReturn {
  /** Whether the dialog is open */
  open: boolean;
  /** Programmatic control for the current dialog session */
  setOpen: (open: boolean) => void;
  /** Whether an async operation is in progress */
  isPending: boolean;
  /** Set pending state - call from action callbacks */
  setIsPending: (pending: boolean) => void;
  /** Props to spread on Dialog component */
  dialogProps: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    disablePointerDismissal: true;
  };
}

/**
 * Hook for managing dialog state with async operation protection.
 *
 * Prevents dialog from closing via Escape or backdrop click while
 * an async operation is in progress. Programmatic updates remain tied
 * to the dialog session that created them, so stale async completions
 * do not close a newer reopened dialog.
 */
export function useAsyncDialog(
  options: UseAsyncDialogOptions = {},
): UseAsyncDialogReturn {
  const { open: externalOpen, onOpenChange: externalOnOpenChange } = options;

  const [internalOpen, setInternalOpen] = useState(false);

  const isControlled = externalOpen !== undefined;
  const open = isControlled ? externalOpen : internalOpen;

  const [state, dispatch] = useReducer(
    asyncDialogReducer,
    open,
    createAsyncDialogState,
  );

  // Session follows the open prop; React re-renders immediately when
  // state is set during render, so nothing from this pass is committed
  if (state.open !== open) {
    dispatch({ type: 'sync', open });
  }

  const { sessionId } = state;
  const isPending = state.pendingCount > 0;

  // Latest session id for callbacks captured by older renders,
  // e.g. an async completion from a dialog that has since been reopened
  const currentSessionRef = useRef(sessionId);

  useLayoutEffect(() => {
    currentSessionRef.current = sessionId;
  }, [sessionId]);

  const setOpen = useCallback(
    (newOpen: boolean) => {
      if (currentSessionRef.current !== sessionId) return;

      if (isControlled && externalOnOpenChange) {
        externalOnOpenChange(newOpen);
      } else {
        setInternalOpen(newOpen);
      }
    },
    [externalOnOpenChange, isControlled, sessionId],
  );

  const setIsPending = useCallback(
    (pending: boolean) => {
      dispatch({ type: 'pending', sessionId, pending });
    },
    [sessionId],
  );

  const guardedOnOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen && isPending) return;

      setOpen(newOpen);
    },
    [isPending, setOpen],
  );

  const dialogProps = useMemo(
    () =>
      ({
        open,
        onOpenChange: guardedOnOpenChange,
        disablePointerDismissal: true,
      }) as const,
    [guardedOnOpenChange, open],
  );

  return {
    open,
    setOpen,
    isPending,
    setIsPending,
    dialogProps,
  };
}
