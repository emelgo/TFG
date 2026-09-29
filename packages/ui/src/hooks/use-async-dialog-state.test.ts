import { describe, expect, it } from 'vitest';

import {
  type AsyncDialogAction,
  asyncDialogReducer,
  createAsyncDialogState,
} from './use-async-dialog-state';

function run(initialOpen: boolean, actions: AsyncDialogAction[]) {
  return actions.reduce(
    asyncDialogReducer,
    createAsyncDialogState(initialOpen),
  );
}

const pending = (sessionId: number, value: boolean): AsyncDialogAction => ({
  type: 'pending',
  sessionId,
  pending: value,
});

const sync = (open: boolean): AsyncDialogAction => ({ type: 'sync', open });

describe('asyncDialogReducer', () => {
  it('starts idle for a closed dialog', () => {
    expect(createAsyncDialogState()).toEqual({
      open: false,
      sessionId: 0,
      pendingCount: 0,
    });
  });

  it('tracks pending state for the active session', () => {
    let state = run(true, [pending(1, true)]);

    expect(state.pendingCount).toBe(1);

    state = asyncDialogReducer(state, pending(1, false));

    expect(state.pendingCount).toBe(0);
  });

  it('keeps pending until all overlapping requests settle', () => {
    let state = run(true, [pending(1, true), pending(1, true)]);

    expect(state.pendingCount).toBe(2);

    state = asyncDialogReducer(state, pending(1, false));

    expect(state.pendingCount).toBe(1);

    state = asyncDialogReducer(state, pending(1, false));

    expect(state.pendingCount).toBe(0);
  });

  it('ignores extra false transitions', () => {
    const initial = createAsyncDialogState(true);

    expect(asyncDialogReducer(initial, pending(1, false))).toBe(initial);
  });

  it('creates a new session when reopening the dialog', () => {
    expect(run(true, [sync(false), sync(true)]).sessionId).toBe(2);
  });

  it('ignores stale pending updates from an older session after reopen', () => {
    let state = run(true, [pending(1, true), sync(false), sync(true)]);

    expect(state.pendingCount).toBe(0);

    state = asyncDialogReducer(state, pending(1, false));

    expect(state.pendingCount).toBe(0);
  });

  it('allows new session requests after a reopen even if the old one was pending', () => {
    let state = run(true, [
      pending(1, true),
      sync(false),
      sync(true),
      pending(2, true),
    ]);

    expect(state.pendingCount).toBe(1);

    state = asyncDialogReducer(state, pending(1, false));

    expect(state.pendingCount).toBe(1);

    state = asyncDialogReducer(state, pending(2, false));

    expect(state.pendingCount).toBe(0);
  });

  it('does not bump the session id for repeated syncs with the same open value', () => {
    const closed = run(false, [sync(false)]);

    expect(closed.sessionId).toBe(0);

    const opened = asyncDialogReducer(closed, sync(true));

    expect(asyncDialogReducer(opened, sync(true))).toBe(opened);
    expect(opened.sessionId).toBe(1);
  });
});
