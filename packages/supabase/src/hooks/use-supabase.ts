import { useMemo } from 'react';

import { getSupabaseBrowserClient } from '../clients/browser-client';
import { type Database } from '../database.types';

/**
 * Devuelve el cliente de Supabase del navegador, memorizado para no crear uno
 * nuevo en cada renderizado. Está sujeto a la RLS.
 */
export function useSupabase<Db = Database>() {
  return useMemo(() => getSupabaseBrowserClient<Db>(), []);
}
