export interface AsyncDialogState {
  open: boolean;
  /** Incremented every time the dialog transitions from closed to open */
  sessionId: number;
  /** Number of in-flight async operations for the current session */
  pendingCount: number;
}

export type AsyncDialogAction =
  | { type: 'sync'; open: boolean }
  | { type: 'pending'; sessionId: number; pending: boolean };

export function createAsyncDialogState(open = false): AsyncDialogState {
  return { open, sessionId: open ? 1 : 0, pendingCount: 0 };
}

export function asyncDialogReducer(
  state: AsyncDialogState,
  action: AsyncDialogAction,
): AsyncDialogState {
  switch (action.type) {
    case 'sync': {
      if (action.open === state.open) return state;

      return action.open
        ? { open: true, sessionId: state.sessionId + 1, pendingCount: 0 }
        : { ...state, open: false };
    }

    case 'pending': {
      if (action.sessionId !== state.sessionId) return state;

      const pendingCount = action.pending
        ? state.pendingCount + 1
        : Math.max(0, state.pendingCount - 1);

      if (pendingCount === state.pendingCount) return state;

      return { ...state, pendingCount };
    }
  }
}
