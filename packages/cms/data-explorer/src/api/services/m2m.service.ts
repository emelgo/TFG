import { Context } from 'hono';
import { z } from 'zod';

import { createAuthorizationService } from '@pymekit/cms-auth/services';
import { getLogger } from '@pymekit/shared/logger';

import { createDataExplorerService } from './data-explorer.service';

/**
 * Regex for valid SQL identifiers (schema, table, column names)
 * Must start with letter or underscore, followed by alphanumeric or underscore
 */
const SQL_IDENTIFIER_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const IDENTIFIER_MAX_LENGTH = 128;

/**
 * Zod schema for SQL identifier validation
 */
const sqlIdentifier = z
  .string()
  .min(1, 'Identifier cannot be empty')
  .max(
    IDENTIFIER_MAX_LENGTH,
    `Identifier cannot exceed ${IDENTIFIER_MAX_LENGTH} characters`,
  )
  .regex(SQL_IDENTIFIER_REGEX, 'Invalid identifier format');

/**
 * Schema for M2M relation config validation
 * All identifier fields are validated against SQL identifier rules to prevent injection
 */
export const M2MRelationConfigSchema = z.object({
  sourceColumn: sqlIdentifier,
  targetSchema: sqlIdentifier,
  targetTable: sqlIdentifier,
  targetColumn: sqlIdentifier,
  junctionSchema: sqlIdentifier,
  junctionTable: sqlIdentifier,
  junctionSourceColumn: sqlIdentifier,
  junctionTargetColumn: sqlIdentifier,
});

/**
 * Schema for record IDs - accepts string or number but validates non-empty strings
 */
const recordId = z.union([z.string().min(1, 'ID cannot be empty'), z.number()]);

/**
 * Schema for link/unlink request
 */
export const M2MLinkRequestSchema = z.object({
  sourceId: recordId,
  targetId: recordId,
  relation: M2MRelationConfigSchema,
});

export type M2MLinkRequest = z.infer<typeof M2MLinkRequestSchema>;

/**
 * Result type for M2M operations
 */
export interface M2MOperationResult {
  success: boolean;
  error?: string;
  errorCode?:
    | 'PERMISSION_DENIED'
    | 'ALREADY_LINKED'
    | 'NOT_FOUND'
    | 'FK_VIOLATION'
    | 'INVALID_RELATION'
    | 'COLUMNS_NOT_EDITABLE'
    | 'UNKNOWN';
  /** Additional error details for i18n interpolation */
  errorDetails?: {
    tableName?: string;
    columns?: string;
  };
  data?: Record<string, unknown>;
}

/**
 * Create an M2M service instance
 * @param context - Hono context
 */
export function createM2MService(context: Context) {
  return new M2MService(context);
}

/**
 * Service for managing Many-to-Many relationships via junction tables.
 * Provides link and unlink operations with proper permission checks.
 */
class M2MService {
  constructor(private readonly context: Context) {}

  /**
   * Validate that the relation config has safe identifier names.
   * This prevents SQL injection via malformed schema/table/column names.
   * Full validation (table/column existence) is done naturally by the database.
   */
  private validateRelationConfig(
    relation: M2MLinkRequest['relation'],
  ): M2MOperationResult | null {
    // Validate identifier format (alphanumeric + underscore, no SQL injection)
    // Must start with letter or underscore, contain only alphanumeric and underscore
    const identifierRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

    // Validate ALL identifier fields - not just the ones used in this service
    // Client could send malformed data that could be used elsewhere
    const identifierValues = [
      relation.sourceColumn,
      relation.targetSchema,
      relation.targetTable,
      relation.targetColumn,
      relation.junctionSchema,
      relation.junctionTable,
      relation.junctionSourceColumn,
      relation.junctionTargetColumn,
    ];

    for (const value of identifierValues) {
      if (!identifierRegex.test(value)) {
        // Don't expose the actual invalid value in error message - could leak info
        return {
          success: false,
          error: 'Invalid relation configuration',
          errorCode: 'INVALID_RELATION',
        };
      }
    }

    // Validation passed - database will handle existence checks
    return null;
  }

  /**
   * Link two records via a junction table.
   * Creates a new record in the junction table with the source and target IDs.
   *
   * @param params - Link parameters including source ID, target ID, and relation config
   * @returns Result indicating success or error with specific error code
   */
  async linkRecord(params: M2MLinkRequest): Promise<M2MOperationResult> {
    const logger = await getLogger();
    const { sourceId, targetId, relation } = params;

    logger.info(
      {
        junctionTable: `${relation.junctionSchema}.${relation.junctionTable}`,
        sourceId,
        targetId,
      },
      'M2M link: starting link operation',
    );

    // 0. Validate relation config
    const validationError = await this.validateRelationConfig(relation);
    if (validationError) {
      return validationError;
    }

    // 1. Permission check: INSERT on junction table
    const authService = createAuthorizationService(this.context);
    const canInsert = await authService.hasDataPermission(
      'insert',
      relation.junctionSchema,
      relation.junctionTable,
    );

    if (!canInsert) {
      logger.warn(
        {
          junctionTable: `${relation.junctionSchema}.${relation.junctionTable}`,
        },
        'M2M link: permission denied for junction table insert',
      );

      return {
        success: false,
        error:
          'Permission denied: requires INSERT permission on junction table',
        errorCode: 'PERMISSION_DENIED',
      };
    }

    // 2. Build junction record data
    const junctionData = {
      [relation.junctionSourceColumn]: sourceId,
      [relation.junctionTargetColumn]: targetId,
    };

    // 3. Insert via data explorer service
    // Note: Junction table FK columns must be marked as "editable" in Settings
    // for M2M linking to work. This is by design - users explicitly opt-in.
    const dataExplorerService = createDataExplorerService(this.context);

    try {
      const result = await dataExplorerService.insertRecord({
        schemaName: relation.junctionSchema,
        tableName: relation.junctionTable,
        data: junctionData,
      });

      logger.info(
        {
          junctionTable: `${relation.junctionSchema}.${relation.junctionTable}`,
          sourceId,
          targetId,
        },
        'M2M link: record linked successfully',
      );

      return {
        success: true,
        data: result.data,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      logger.error(
        {
          junctionTable: `${relation.junctionSchema}.${relation.junctionTable}`,
          sourceId,
          targetId,
          error: errorMessage,
        },
        'M2M link: failed to link record',
      );

      // Parse error for specific constraint violations
      const errorCode = this.parseErrorCode(errorMessage);

      // Include error details for i18n interpolation
      const errorDetails =
        errorCode === 'COLUMNS_NOT_EDITABLE'
          ? {
              tableName: `${relation.junctionSchema}.${relation.junctionTable}`,
              columns: `"${relation.junctionSourceColumn}" and "${relation.junctionTargetColumn}"`,
            }
          : undefined;

      return {
        success: false,
        error: this.getUserFriendlyError(errorCode, relation),
        errorCode,
        errorDetails,
      };
    }
  }

  /**
   * Unlink two records by deleting the junction table record.
   *
   * @param params - Unlink parameters including source ID, target ID, and relation config
   * @returns Result indicating success or error with specific error code
   */
  async unlinkRecord(params: M2MLinkRequest): Promise<M2MOperationResult> {
    const logger = await getLogger();
    const { sourceId, targetId, relation } = params;

    logger.info(
      {
        junctionTable: `${relation.junctionSchema}.${relation.junctionTable}`,
        sourceId,
        targetId,
      },
      'M2M unlink: starting unlink operation',
    );

    // 0. Validate relation config
    const validationError = await this.validateRelationConfig(relation);
    if (validationError) {
      return validationError;
    }

    // 1. Permission check: DELETE on junction table
    const authService = createAuthorizationService(this.context);
    const canDelete = await authService.hasDataPermission(
      'delete',
      relation.junctionSchema,
      relation.junctionTable,
    );

    if (!canDelete) {
      logger.warn(
        {
          junctionTable: `${relation.junctionSchema}.${relation.junctionTable}`,
        },
        'M2M unlink: permission denied for junction table delete',
      );

      return {
        success: false,
        error:
          'Permission denied: requires DELETE permission on junction table',
        errorCode: 'PERMISSION_DENIED',
      };
    }

    // 2. Build conditions for delete
    const conditions = {
      [relation.junctionSourceColumn]: sourceId,
      [relation.junctionTargetColumn]: targetId,
    };

    // 3. Delete via data explorer service
    const dataExplorerService = createDataExplorerService(this.context);

    try {
      const result = await dataExplorerService.deleteRecordByConditions({
        schemaName: relation.junctionSchema,
        tableName: relation.junctionTable,
        conditions,
      });

      logger.info(
        {
          junctionTable: `${relation.junctionSchema}.${relation.junctionTable}`,
          sourceId,
          targetId,
        },
        'M2M unlink: record unlinked successfully',
      );

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      logger.error(
        {
          junctionTable: `${relation.junctionSchema}.${relation.junctionTable}`,
          sourceId,
          targetId,
          error: errorMessage,
        },
        'M2M unlink: failed to unlink record',
      );

      // Parse error for specific issues
      const errorCode = this.parseErrorCode(errorMessage);

      // Include error details for i18n interpolation
      const errorDetails =
        errorCode === 'COLUMNS_NOT_EDITABLE'
          ? {
              tableName: `${relation.junctionSchema}.${relation.junctionTable}`,
              columns: `"${relation.junctionSourceColumn}" and "${relation.junctionTargetColumn}"`,
            }
          : undefined;

      return {
        success: false,
        error: this.getUserFriendlyError(errorCode, relation),
        errorCode,
        errorDetails,
      };
    }
  }

  /**
   * Parse database error message to determine specific error code
   */
  private parseErrorCode(
    errorMessage: string,
  ): M2MOperationResult['errorCode'] {
    const lowerMessage = errorMessage.toLowerCase();

    // Check for non-editable columns error (junction table FK columns need to be marked editable)
    if (
      lowerMessage.includes('no editable columns') ||
      lowerMessage.includes('skipped non-editable columns')
    ) {
      return 'COLUMNS_NOT_EDITABLE';
    }

    // Check for duplicate key / unique constraint violation
    if (
      lowerMessage.includes('duplicate key') ||
      lowerMessage.includes('unique constraint') ||
      lowerMessage.includes('unique_violation')
    ) {
      return 'ALREADY_LINKED';
    }

    // Check for foreign key constraint violation
    if (
      lowerMessage.includes('foreign key') ||
      lowerMessage.includes('violates foreign key')
    ) {
      return 'FK_VIOLATION';
    }

    // Check for RLS / permission denial
    if (
      lowerMessage.includes('row-level security') ||
      lowerMessage.includes('permission denied') ||
      lowerMessage.includes('access denied')
    ) {
      return 'PERMISSION_DENIED';
    }

    // Check for not found (no rows affected)
    if (
      lowerMessage.includes('no rows') ||
      lowerMessage.includes('no records found') ||
      lowerMessage.includes('not found')
    ) {
      return 'NOT_FOUND';
    }

    return 'UNKNOWN';
  }

  /**
   * Convert error code to user-friendly message.
   * Never expose raw database error messages to clients.
   */
  private getUserFriendlyError(
    errorCode: M2MOperationResult['errorCode'],
    relation?: M2MLinkRequest['relation'],
  ): string {
    switch (errorCode) {
      case 'ALREADY_LINKED':
        return 'This record is already linked';
      case 'FK_VIOLATION':
        return 'Invalid record - the target record may have been deleted';
      case 'PERMISSION_DENIED':
        return 'You do not have permission to perform this action';
      case 'NOT_FOUND':
        return 'The link was not found - it may have already been removed';
      case 'INVALID_RELATION':
        return 'Invalid relation configuration';
      case 'COLUMNS_NOT_EDITABLE':
        if (relation) {
          const tableName = `${relation.junctionSchema}.${relation.junctionTable}`;
          const columns = `"${relation.junctionSourceColumn}" and "${relation.junctionTargetColumn}"`;
          return `Columns ${columns} in "${tableName}" must be marked as editable. Go to Settings → Tables → ${tableName} → Columns and enable editing for these columns.`;
        }
        return 'Junction table columns must be marked as editable. Go to Settings → Tables → [table] → Columns to enable editing.';
      default:
        // Never expose raw database errors - they may contain sensitive info
        return 'An unexpected error occurred while processing your request';
    }
  }
}
