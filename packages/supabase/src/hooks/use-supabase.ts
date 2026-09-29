import { useMemo } from 'react';

import { getSupabaseBrowserClient } from '../clients/browser-client';
import { type Database } from '../database.types';

export function useSupabase<Db = Database>() {
  return useMemo(() => getSupabaseBrowserClient<Db>(), []);
}
