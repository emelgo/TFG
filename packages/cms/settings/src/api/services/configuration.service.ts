import { eq } from 'drizzle-orm';
import { Context } from 'hono';

import { configurationInCms } from '@pymekit/cms-supabase/schema';

/**
 * Creates a ConfigurationService instance.
 * @param c - The context object.
 * @returns A ConfigurationService instance.
 */
export function createConfigurationService(c: Context) {
  return new ConfigurationService(c);
}

/**
 * @name ConfigurationService
 * @description Service for managing configuration.
 */
class ConfigurationService {
  constructor(private readonly context: Context) {}

  /**
   * Gets the configuration.
   * @returns The configuration.
   */
  async getConfiguration() {
    const client = this.context.get('drizzle');

    const data = await client.runTransaction(async (tx) => {
      return tx.select().from(configurationInCms);
    });

    return data;
  }

  /**
   * Gets the configuration by key.
   * @param key - The key of the configuration.
   * @returns The configuration.
   */
  async getConfigurationByKey(key: string) {
    const client = this.context.get('drizzle');

    return client.runTransaction(async (tx) => {
      return tx
        .select()
        .from(configurationInCms)
        .where(eq(configurationInCms.key, key))
        .limit(1)
        .then((result) => result[0]);
    });
  }

  /**
   * Gets the configuration value.
   * @param key - The key of the configuration value.
   * @returns The configuration value.
   */
  async getConfigurationValue(key: string) {
    const client = this.context.get('drizzle');

    return client.runTransaction(async (tx) => {
      return tx
        .select()
        .from(configurationInCms)
        .where(eq(configurationInCms.key, key))
        .limit(1)
        .then((result) => result[0]?.value);
    });
  }

  /**
   * Updates the configuration.
   * @param configuration - The configuration to update.
   * @returns The updated configuration.
   */
  async updateConfiguration(key: string, value: string) {
    const client = this.context.get('drizzle');

    return client.runTransaction(async (tx) => {
      return tx
        .update(configurationInCms)
        .set({ value })
        .where(eq(configurationInCms.key, key));
    });
  }

  /**
   * Updates or inserts the MFA configuration.
   * @param requiresMfa - Whether MFA is required (true/false)
   * @returns The updated/inserted configuration.
   */
  async updateMfaConfiguration(requiresMfa: boolean) {
    const client = this.context.get('drizzle');
    const value = requiresMfa.toString();

    return client.runTransaction(async (tx) => {
      // Try to update first
      const updateResult = await tx
        .update(configurationInCms)
        .set({
          value,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(configurationInCms.key, 'requires_mfa'))
        .returning();

      // If no rows were updated, insert a new record
      if (updateResult.length === 0) {
        return tx
          .insert(configurationInCms)
          .values({
            key: 'requires_mfa',
            value,
          })
          .returning();
      }

      return updateResult;
    });
  }

  /**
   * Deletes the configuration value.
   * @param key - The key of the configuration value.
   * @returns The deleted configuration value.
   */
  async deleteConfiguration(key: string) {
    const client = this.context.get('drizzle');

    return client.runTransaction(async (tx) => {
      return tx
        .delete(configurationInCms)
        .where(eq(configurationInCms.key, key));
    });
  }
}
