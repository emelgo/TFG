/**
 * Servicio de la cuenta del CMS del usuario actual (Ajustes > General).
 *
 * Lee la fila de `cms.accounts` de la sesión y guarda sus preferencias
 * personales (idioma y zona horaria). Usa el cliente Drizzle de la petición,
 * así que RLS solo deja tocar la propia fila (política `update_accounts`,
 * permiso por columnas sobre `preferences`) y el *trigger* de auditoría de
 * `cms.accounts` registra el cambio a nombre del usuario.
 *
 * [TFG] RF-09 · F2.7a.
 */
import { eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';

import { CMS_API_ERROR_CODES } from '@pymekit/cms-shared/error-codes';
import { mergeCmsPreferences } from '@pymekit/cms-shared/preferences';
import { accountsInCms } from '@pymekit/cms-supabase/schema';

import { SettingsError } from '../utils/settings-errors';

/** Crea el servicio de la cuenta del CMS para la petición actual. */
export function createAccountService(c: Context) {
  return new AccountService(c);
}

class AccountService {
  constructor(private readonly context: Context) {}

  /** Devuelve la cuenta del CMS del usuario de la sesión (o `undefined`). */
  async getAccount() {
    const client = this.context.get('drizzle');

    return client
      .runTransaction(async (tx) => {
        return tx
          .select()
          .from(accountsInCms)
          .where(eq(accountsInCms.authUserId, sql`auth.uid()`))
          .limit(1);
      })
      .then((result) => {
        return result[0] as typeof accountsInCms.$inferSelect | undefined;
      });
  }

  /**
   * Guarda las preferencias del usuario combinándolas con las que ya tenía
   * (las claves que no se envían se conservan).
   *
   * Antes llamaba a `cms.update_user_preferences`, que sustituía el objeto
   * entero y respondía «éxito» aunque RLS no hubiera dejado actualizar
   * ninguna fila (por ejemplo, con la sesión sin el segundo factor). Ahora
   * la escritura devuelve la fila y, si no hay ninguna, es un 403.
   *
   * @returns Las preferencias guardadas.
   * @throws `SettingsError` `SETTINGS_PERMISSION_DENIED` si no se guardó nada.
   */
  async updatePreferences(update: { language?: string; timezone?: string }) {
    const client = this.context.get('drizzle');

    const saved = await client.runTransaction(async (tx) => {
      const [current] = await tx
        .select({ preferences: accountsInCms.preferences })
        .from(accountsInCms)
        .where(eq(accountsInCms.authUserId, sql`auth.uid()`))
        .limit(1)
        .for('update');

      if (!current) {
        return null;
      }

      const [row] = await tx
        .update(accountsInCms)
        .set({ preferences: mergeCmsPreferences(current.preferences, update) })
        .where(eq(accountsInCms.authUserId, sql`auth.uid()`))
        .returning({ preferences: accountsInCms.preferences });

      return row ?? null;
    });

    if (!saved) {
      throw new SettingsError(
        CMS_API_ERROR_CODES.SETTINGS_PERMISSION_DENIED,
        'The CMS account of the session could not be updated',
      );
    }

    return saved.preferences;
  }
}
