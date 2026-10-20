/**
 * Tipos de los datos del espacio de trabajo que el servidor entrega a la zona
 * autenticada. Están en un fichero aparte, sin código de servidor, para que
 * los componentes puedan importarlos.
 */
import type { Database } from '@pymekit/supabase/database';
import type { JWTUserData } from '@pymekit/supabase/types';

/**
 * Cuenta activa (personal o de equipo) resuelta a partir del puntero guardado
 * en la base de datos. Es la forma común que devuelve
 * `active_account_workspace`: incluye `is_personal_account` y los campos de
 * rol y permisos propios de los equipos (nulos o vacíos en la personal).
 */
export type ActiveAccount =
  Database['public']['Functions']['active_account_workspace']['Returns'][number];

/** Equipo del usuario, para el selector de espacios de trabajo. */
export type WorkspaceAccountSummary =
  Database['public']['Views']['user_accounts']['Row'];

/**
 * Datos del espacio de trabajo: cuenta activa, equipos a los que se puede
 * cambiar y usuario actual.
 */
export interface WorkspaceShape {
  account: ActiveAccount;
  accounts: WorkspaceAccountSummary[];
  user: JWTUserData;
}
