'use client';

import { createContext, useContext } from 'react';

import type { WorkspaceShape } from '#/lib/server/workspace-shape.ts';

/**
 * Workspace context for the authenticated shell. `account` is the active
 * account; `account.is_personal_account` discriminates personal vs team at
 * every consumer.
 */
const WorkspaceContext = createContext<WorkspaceShape | null>(null);

export function WorkspaceContextProvider(
  props: React.PropsWithChildren<{ value: WorkspaceShape }>,
) {
  return (
    <WorkspaceContext.Provider value={props.value}>
      {props.children}
    </WorkspaceContext.Provider>
  );
}

/**
 * Access the active workspace. Throws outside the authenticated shell so a
 * missing provider fails loudly rather than rendering with empty data.
 */
export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);

  if (!ctx) {
    throw new Error(
      'useWorkspace must be used within a WorkspaceContextProvider (the authenticated shell).',
    );
  }

  return ctx;
}
