import { createClient } from '@supabase/supabase-js';

import { type Database } from '../database.types';
import {
  getSupabaseSecretKey,
  warnServiceRoleKeyUsage,
} from '../get-secret-key.server';
import { getSupabaseClientKeys } from '../get-supabase-client-keys';

/**
 * Cliente de Supabase de servidor con la clave secreta (rol `service_role`).
 *
 * **Ignora la RLS**: puede leer y escribir cualquier fila. Solo se usa en el
 * servidor y en los casos en que el cliente del usuario no basta (por
 * ejemplo, aceptar una invitación antes de ser miembro, procesar un *webhook*
 * de Stripe o tareas de administración), siempre con la validación hecha a
 * mano antes y un comentario en quien lo llama que lo justifique. No guarda
 * ni refresca sesión porque no actúa en nombre de ningún usuario.
 *
 * [TFG] RNF-02 Seguridad: uso mínimo y justificado del cliente administrador.
 */
export function getSupabaseServerAdminClient<GenericSchema = Database>() {
  warnServiceRoleKeyUsage();

  const url = getSupabaseClientKeys().url;
  const secretKey = getSupabaseSecretKey();

  return createClient<GenericSchema>(url, secretKey, {
    auth: {
      persistSession: false,
      detectSessionInUrl: false,
      autoRefreshToken: false,
    },
  });
}
