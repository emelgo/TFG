// ESM replacement for `use-sync-external-store/shim` and
// `use-sync-external-store/shim/with-selector` (aliased in vite.config.ts).
//
// @base-ui/utils imports those two CJS shim entry points. In the prod SSR
// (rolldown) build their internal `require('react')` is emitted as a runtime
// `createRequire('react')`, resolving a SECOND React instance whose hook
// dispatcher is null during render -> "Invalid hook call" /
// "Cannot read properties of null (reading 'useSyncExternalStore')" inside Base
// UI floating components (e.g. NavigationMenu). See base-ui issue #4882.
//
// Importing React via ESM here links to the single bundled React instance.
// `useSyncExternalStore` is native in React 18+, so the base shim re-exports it;
// `useSyncExternalStoreWithSelector` is not a native export, so React's own
// canonical implementation is vendored verbatim (Flow types stripped):
// https://github.com/facebook/react/blob/main/packages/use-sync-external-store/src/useSyncExternalStoreWithSelector.js
import * as React from 'react';

// Intentionally not using named imports because Rollup uses dynamic dispatch
// for CommonJS interop.
const { useRef, useEffect, useMemo, useDebugValue, useSyncExternalStore } =
  React;

export { useSyncExternalStore };

function is(x, y) {
  return (x === y && (x !== 0 || 1 / x === 1 / y)) || (x !== x && y !== y);
}

const objectIs = typeof Object.is === 'function' ? Object.is : is;

// Same as useSyncExternalStore, but supports selector and isEqual arguments.
export function useSyncExternalStoreWithSelector(
  subscribe,
  getSnapshot,
  getServerSnapshot,
  selector,
  isEqual,
) {
  // Use this to track the rendered snapshot.
  const instRef = useRef(null);
  let inst;
  if (instRef.current === null) {
    inst = {
      hasValue: false,
      value: null,
    };
    instRef.current = inst;
  } else {
    inst = instRef.current;
  }

  const [getSelection, getServerSelection] = useMemo(() => {
    // Track the memoized state using closure variables that are local to this
    // memoized instance of a getSnapshot function. Intentionally not using a
    // useRef hook, because that state would be shared across all concurrent
    // copies of the hook/component.
    let hasMemo = false;
    let memoizedSnapshot;
    let memoizedSelection;
    const memoizedSelector = (nextSnapshot) => {
      if (!hasMemo) {
        // The first time the hook is called, there is no memoized result.
        hasMemo = true;
        memoizedSnapshot = nextSnapshot;
        const nextSelection = selector(nextSnapshot);
        if (isEqual !== undefined) {
          // Even if the selector has changed, the currently rendered selection
          // may be equal to the new selection. We should attempt to reuse the
          // current value if possible, to preserve downstream memoizations.
          if (inst.hasValue) {
            const currentSelection = inst.value;
            if (isEqual(currentSelection, nextSelection)) {
              memoizedSelection = currentSelection;
              return currentSelection;
            }
          }
        }
        memoizedSelection = nextSelection;
        return nextSelection;
      }

      // We may be able to reuse the previous invocation's result.
      const prevSnapshot = memoizedSnapshot;
      const prevSelection = memoizedSelection;

      if (objectIs(prevSnapshot, nextSnapshot)) {
        // The snapshot is the same as last time. Reuse the previous selection.
        return prevSelection;
      }

      // The snapshot has changed, so we need to compute a new selection.
      const nextSelection = selector(nextSnapshot);

      // If a custom isEqual function is provided, use that to check if the data
      // has changed. If it hasn't, return the previous selection. That signals
      // to React that the selections are conceptually equal, and we can bail
      // out of rendering.
      if (isEqual !== undefined && isEqual(prevSelection, nextSelection)) {
        // The snapshot still has changed, so make sure to update to not keep
        // old references alive
        memoizedSnapshot = nextSnapshot;
        return prevSelection;
      }

      memoizedSnapshot = nextSnapshot;
      memoizedSelection = nextSelection;
      return nextSelection;
    };
    // Assigning this to a constant so that Flow knows it can't change.
    const maybeGetServerSnapshot =
      getServerSnapshot === undefined ? null : getServerSnapshot;
    const getSnapshotWithSelector = () => memoizedSelector(getSnapshot());
    const getServerSnapshotWithSelector =
      maybeGetServerSnapshot === null
        ? undefined
        : () => memoizedSelector(maybeGetServerSnapshot());
    return [getSnapshotWithSelector, getServerSnapshotWithSelector];
  }, [getSnapshot, getServerSnapshot, selector, isEqual]);

  const value = useSyncExternalStore(
    subscribe,
    getSelection,
    getServerSelection,
  );

  useEffect(() => {
    inst.hasValue = true;
    inst.value = value;
  }, [value]);

  useDebugValue(value);
  return value;
}
