import { Context } from 'hono';

import {
  getSupabaseAdminClient,
  getSupabaseClient,
} from '@pymekit/cms-supabase/hono';

import {
  normalizeFilePath,
  validateBatchFilePaths,
  validateFilePath,
} from '../../utils/path-security';
import { createStoragePermissionsService } from './storage-permissions.service';

type Bucket = {
  id: string;
  name: string;
  public: boolean;
  created_at: string;
  updated_at: string;
};

/**
 * Creates a StorageService instance.
 * @param c - Hono context
 */
export function createStorageService(c: Context) {
  return new StorageService(c);
}

interface StorageFile {
  name: string;
  id: string | null;
  updated_at: string | null;
  created_at: string | null;
  last_accessed_at: string | null;
  metadata: Record<string, unknown> | null;
}

/**
 * @name StorageService
 * @description Service for managing Supabase storage operations with comprehensive permission checks
 */
class StorageService {
  private readonly permissionsService: ReturnType<
    typeof createStoragePermissionsService
  >;

  constructor(private readonly context: Context) {
    this.permissionsService = createStoragePermissionsService(context);
  }

  /**
   * Get all storage buckets that the user has read access to
   * @returns Promise containing array of storage buckets
   */
  async getBuckets() {
    const client = getSupabaseAdminClient();

    const { data: buckets, error } = await client.storage.listBuckets();

    if (error) {
      throw new Error(`Failed to fetch storage buckets: ${error.message}`);
    }

    const promises = buckets.map(async (bucket) => {
      try {
        // Check if user has read permission for the root of this bucket
        const hasAccess = await this.permissionsService.canReadBucket(
          bucket.name,
          '/',
        );

        if (hasAccess) {
          return bucket;
        }
      } catch (error) {
        // Log error but continue with other buckets
        console.warn(`Error checking bucket access for ${bucket.name}:`, error);
      }
    });

    const results = await Promise.all(promises);

    return results.filter(Boolean) as Bucket[];
  }

  /**
   * Get files and folders in a specific bucket and path
   * @param params - Bucket name, optional path, search term, page, and limit
   * @returns Promise containing paginated files and folders with enhanced metadata
   */
  async getBucketContents(params: {
    bucket: string;
    path?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    contents: Array<
      StorageFile & {
        isDirectory: boolean;
        fileType: string;
        publicUrl?: string;
        previewUrl?: string;
        permissions?: {
          canRead: boolean;
          canUpdate: boolean;
          canDelete: boolean;
          canUpload: boolean;
        };
      }
    >;
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNextPage: boolean;
      hasPreviousPage: boolean;
    };
  }> {
    const requestedPath = params.path || '/';

    // SECURITY: Validate read permission for the requested path
    await this.permissionsService.validateStoragePermission(
      params.bucket,
      'select',
      requestedPath,
    );

    const client = getSupabaseAdminClient();

    const listOptions: {
      limit: number;
      sortBy: { column: string; order: string };
      search?: string;
    } = {
      limit: params.limit || 25,
      sortBy: { column: 'name', order: 'asc' },
    };

    // Add search parameter if provided
    if (params.search && params.search.trim()) {
      listOptions.search = params.search.trim();
    }

    const { data: files, error } = await client.storage
      .from(params.bucket)
      .list(params.path || '', listOptions);

    if (error) {
      throw new Error(`Failed to fetch bucket contents: ${error.message}`);
    }

    // Check if bucket is public to generate URLs
    const { data: buckets } = await client.storage.listBuckets();
    const bucket = buckets?.find((b) => b.name === params.bucket);
    const isPublicBucket = bucket?.public || false;

    // Filter out placeholder files and prepare file data
    const filteredFiles = files.filter(
      (file) =>
        // special file that indicates an empty folder coming from Supabase Storage
        file.name !== '.emptyFolderPlaceholder',
    );

    // Prepare file paths for bulk permission checking
    const filePaths = filteredFiles.map((file) =>
      params.path ? `${params.path}/${file.name}` : file.name,
    );

    // SECURITY: Get permissions for all files in a single optimized query
    // Pass the current path as parent for potential optimization
    const permissionsMap =
      await this.permissionsService.getBulkUserStoragePermissions(
        params.bucket,
        filePaths,
        params.path,
      );

    const enhancedFiles = await Promise.all(
      filteredFiles.map(async (file, index) => {
        const isDirectory = !file.id; // Folders don't have IDs
        const fileType = this.getFileType(file.name);
        const filePath = filePaths[index] || file.name; // Fallback to file.name if undefined

        // Get permissions from the bulk result
        const permissions = permissionsMap.get(filePath) || {
          canRead: false,
          canUpdate: false,
          canDelete: false,
          canUpload: false,
        };

        let publicUrl: string | undefined;
        let previewUrl: string | undefined;

        // Only generate URLs if user has read permission for this specific file
        if (!isDirectory && permissions.canRead) {
          if (isPublicBucket) {
            // For public buckets, use public URL
            const { data } = client.storage
              .from(params.bucket)
              .getPublicUrl(filePath);

            publicUrl = data.publicUrl;
            previewUrl = publicUrl;
          } else if (fileType === 'image') {
            // For private buckets and images, generate signed URL
            try {
              const { data: signedData, error: signedError } =
                await client.storage
                  .from(params.bucket)
                  .createSignedUrl(filePath, 3600); // 1 hour expiry

              if (!signedError && signedData) {
                previewUrl = signedData.signedUrl;
              } else {
                console.warn(
                  `Failed to generate signed URL for ${filePath}:`,
                  signedError,
                );
              }
            } catch (signedUrlError) {
              // If signed URL fails, we'll just show the icon
              console.warn(
                'Failed to generate signed URL for image:',
                signedUrlError,
              );
            }
          }
        }

        return {
          ...file,
          isDirectory,
          fileType,
          publicUrl,
          previewUrl,
          permissions,
        };
      }),
    );

    // Sort: directories first, then files
    const sortedFiles = enhancedFiles.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;

      return a.name.localeCompare(b.name);
    });

    // Apply pagination
    const page = params.page || 1;
    const limit = params.limit || 25;

    const total = sortedFiles.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedFiles = sortedFiles.slice(startIndex, endIndex);

    return {
      contents: paginatedFiles,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  /**
   * Get a public URL for a file
   * @param params - Bucket name and file path
   * @returns Public URL for the file
   */
  async getPublicUrl(params: {
    bucket: string;
    path: string;
  }): Promise<string> {
    // SECURITY: Validate read permission
    await this.permissionsService.validateStoragePermission(
      params.bucket,
      'select',
      params.path,
    );

    const client = getSupabaseClient(this.context);

    const { data } = client.storage
      .from(params.bucket)
      .getPublicUrl(params.path);

    return data.publicUrl;
  }

  /**
   * Get signed URL for private files
   * @param params - Bucket name, file path, and expiration time
   * @returns Signed URL for the file
   */
  async getSignedUrl(params: {
    bucket: string;
    path: string;
    expiresIn?: number;
  }): Promise<string> {
    // SECURITY: Validate read permission
    await this.permissionsService.validateStoragePermission(
      params.bucket,
      'select',
      params.path,
    );

    const client = getSupabaseClient(this.context);

    const { data, error } = await client.storage
      .from(params.bucket)
      .createSignedUrl(params.path, params.expiresIn || 3600); // 1 hour default

    if (error) {
      throw new Error(`Failed to create signed URL: ${error.message}`);
    }

    return data.signedUrl;
  }

  /**
   * Rename a file or folder
   * @param params - Bucket, current path, and new name
   * @returns Success status
   */
  async renameFile(params: {
    bucket: string;
    fromPath: string;
    toPath: string;
  }): Promise<{ success: boolean }> {
    // SECURITY: Validate file paths for safety
    validateFilePath(params.fromPath);
    validateFilePath(params.toPath);

    // Normalize paths to prevent traversal attacks
    const normalizedFromPath = normalizeFilePath(params.fromPath);
    const normalizedToPath = normalizeFilePath(params.toPath);

    // SECURITY: A move removes the object from the source and creates it at the
    // destination. Authorize what the operation actually does — `delete` on the
    // source and `insert` on the destination — mirroring the storage RLS
    // delete/insert policies. Checking only `update` would let a caller plant an
    // object into a prefix it cannot write to, or move a restricted object out
    // of a prefix it cannot delete from. (createFolder already requires
    // `insert` to create an object.)
    await Promise.all([
      this.permissionsService.validateStoragePermission(
        params.bucket,
        'delete',
        normalizedFromPath,
      ),
      this.permissionsService.validateStoragePermission(
        params.bucket,
        'insert',
        normalizedToPath,
      ),
    ]);

    const client = getSupabaseAdminClient();

    const { error } = await client.storage
      .from(params.bucket)
      .move(normalizedFromPath, normalizedToPath);

    if (error) {
      throw new Error(`Failed to rename file: ${error.message}`);
    }

    return { success: true };
  }

  /**
   * Delete a file or folder
   * @param params - Bucket and file paths
   * @returns Success status
   */
  async deleteFile(params: {
    bucket: string;
    paths: string[];
  }): Promise<{ success: boolean }> {
    // SECURITY: Validate batch file paths for safety and limits
    validateBatchFilePaths(params.paths, 50); // Limit to 50 files per batch

    // Normalize all paths to prevent traversal attacks
    const normalizedPaths = params.paths.map((path) => normalizeFilePath(path));

    // SECURITY: Validate delete permission for all paths using optimized bulk validation
    await this.permissionsService.validateBulkStoragePermission(
      params.bucket,
      'delete',
      normalizedPaths,
    );

    const client = getSupabaseAdminClient();

    // For folders, we need to delete all contents using batch processing
    const allPathsToDelete: string[] = [];
    let totalFileCount = 0;
    const MAX_DELETION_FILES = 1000; // Safety limit for batch deletion
    const folderPermissionsChecked = new Set<string>();

    for (const path of normalizedPaths) {
      // Check if this is a folder by trying to list its contents
      const { data: folderContents, error: listError } = await client.storage
        .from(params.bucket)
        .list(path, { limit: 25 });

      if (!listError && folderContents && folderContents.length > 0) {
        try {
          // This is a folder with contents - get all files using batch processing
          const allFiles = await this.getAllFilesInBatches(
            params.bucket,
            path,
            client,
          );

          // SECURITY: Check if we're exceeding safe limits
          totalFileCount += allFiles.length;

          if (totalFileCount > MAX_DELETION_FILES) {
            throw new Error(
              `Too many files to delete in batch (max: ${MAX_DELETION_FILES}). Please delete in smaller batches.`,
            );
          }

          // SECURITY: Use optimized folder deletion permission validation
          // This checks parent folder permission first, then falls back to bulk validation
          if (!folderPermissionsChecked.has(path)) {
            await this.permissionsService.validateFolderDeletionPermission(
              params.bucket,
              path,
              allFiles,
            );
            folderPermissionsChecked.add(path);
          }

          allPathsToDelete.push(...allFiles);
        } catch (error) {
          // If batch processing fails, provide a helpful error message
          if (error instanceof Error) {
            throw new Error(
              `Failed to process folder "${path}" for deletion: ${error.message}`,
            );
          }
          throw error;
        }
      } else {
        // This is either a file or an empty folder
        allPathsToDelete.push(path);
        totalFileCount++;
      }
    }

    // Remove duplicates
    const uniquePaths = [...new Set(allPathsToDelete)];

    if (uniquePaths.length > 0) {
      const { error } = await client.storage
        .from(params.bucket)
        .remove(uniquePaths);

      if (error) {
        throw new Error(`Failed to delete files: ${error.message}`);
      }
    }

    return { success: true };
  }

  /**
   * Get all files in a folder using batch processing to avoid database exhaustion
   * @param bucket - Bucket name
   * @param folderPath - Folder path
   * @param client - Supabase client
   * @returns Array of all file paths
   */
  private async getAllFilesInBatches(
    bucket: string,
    folderPath: string,
    client: ReturnType<typeof getSupabaseAdminClient>,
  ): Promise<string[]> {
    const allFiles: string[] = [];
    const foldersToProcess: string[] = [folderPath];
    const MAX_BATCH_SIZE = 10; // Process folders in batches of 10
    const MAX_TOTAL_FILES = 1000; // Safety limit
    const MAX_FOLDERS_PROCESSED = 100; // Prevent infinite loops

    let foldersProcessed = 0;

    while (foldersToProcess.length > 0) {
      // Take a batch of folders to process
      const currentBatch = foldersToProcess.splice(0, MAX_BATCH_SIZE);

      // Process folders in parallel using Promise.allSettled for better error handling
      const batchResults = await Promise.allSettled(
        currentBatch.map((folder) =>
          client.storage.from(bucket).list(folder, { limit: 100 }),
        ),
      );

      // Process results from the batch
      for (let i = 0; i < batchResults.length; i++) {
        const result = batchResults[i];
        const currentFolder = currentBatch[i];

        if (!result || !currentFolder) continue;

        if (result.status === 'fulfilled' && result.value.data) {
          const contents = result.value.data;

          for (const item of contents) {
            const itemPath = currentFolder
              ? `${currentFolder}/${item.name}`
              : item.name;

            if (item.id) {
              // This is a file
              allFiles.push(itemPath);

              // Safety check: prevent collecting too many files
              if (allFiles.length >= MAX_TOTAL_FILES) {
                throw new Error(
                  `Too many files to process (max: ${MAX_TOTAL_FILES}). Please delete in smaller batches.`,
                );
              }
            } else {
              // This is a folder, add to processing queue
              foldersToProcess.push(itemPath);
            }
          }
        } else if (result.status === 'rejected') {
          // Log error but continue processing other folders
          console.warn(
            `Failed to list contents of folder ${currentFolder}:`,
            result.reason,
          );
        }
      }

      foldersProcessed += currentBatch.length;

      // Safety check: prevent infinite processing
      if (foldersProcessed >= MAX_FOLDERS_PROCESSED) {
        throw new Error(
          `Too many folders to process (max: ${MAX_FOLDERS_PROCESSED}). Please delete in smaller batches.`,
        );
      }
    }

    return allFiles;
  }

  /**
   * Get download URL for a file
   * @param params - Bucket and file path
   * @returns Download URL
   */
  async getDownloadUrl(params: {
    bucket: string;
    path: string;
  }): Promise<string> {
    // SECURITY: Validate file path for safety
    validateFilePath(params.path);

    // Normalize path to prevent traversal attacks
    const normalizedPath = normalizeFilePath(params.path);

    // SECURITY: Validate read permission
    await this.permissionsService.validateStoragePermission(
      params.bucket,
      'select',
      normalizedPath,
    );

    const client = getSupabaseAdminClient();

    // SECURITY: Force a download (Content-Disposition: attachment) so the object
    // is never rendered inline as a top-level document. Without this, an
    // attacker-uploaded SVG/HTML opened from a storage URL executes script in
    // the storage origin (stored XSS).
    const downloadFilename = normalizedPath.split('/').pop() || 'download';

    // Check if bucket is public
    const { data: buckets } = await client.storage.listBuckets();
    const bucket = buckets?.find((b) => b.name === params.bucket);
    const isPublicBucket = bucket?.public || false;

    if (isPublicBucket) {
      // For public buckets, use public URL
      const { data } = client.storage
        .from(params.bucket)
        .getPublicUrl(normalizedPath, { download: downloadFilename });

      return data.publicUrl;
    } else {
      // For private buckets, create signed URL
      const { data, error } = await client.storage
        .from(params.bucket)
        .createSignedUrl(normalizedPath, 3600, { download: downloadFilename }); // 1 hour expiry

      if (error) {
        throw new Error(`Failed to create download URL: ${error.message}`);
      }

      return data.signedUrl;
    }
  }

  /**
   * Get user permissions for a specific bucket and path
   * This is used by the client to show/hide UI elements
   * @param params - Bucket and file path
   * @returns User permissions object
   */
  async getUserPermissions(params: { bucket: string; path: string }): Promise<{
    canRead: boolean;
    canUpdate: boolean;
    canDelete: boolean;
    canUpload: boolean;
  }> {
    return this.permissionsService.getUserStoragePermissions(
      params.bucket,
      params.path,
    );
  }

  /**
   * Create a new folder by uploading an empty placeholder file
   * @param params - Bucket, folder name, and optional parent path
   * @returns Success status
   */
  async createFolder(params: {
    bucket: string;
    folderName: string;
    parentPath?: string;
  }): Promise<{ success: boolean }> {
    // SECURITY: Validate folder name for safety
    validateFilePath(params.folderName);

    // Normalize folder name to prevent traversal attacks
    const normalizedFolderName = normalizeFilePath(params.folderName);

    // Construct the full folder path
    const folderPath = params.parentPath
      ? normalizeFilePath(`${params.parentPath}/${normalizedFolderName}`)
      : normalizedFolderName;

    // SECURITY: Validate upload permission for the target path
    await this.permissionsService.validateStoragePermission(
      params.bucket,
      'insert',
      folderPath,
    );

    const client = getSupabaseAdminClient();

    // Create folder by uploading an empty placeholder file
    // This follows Supabase's pattern for creating folders
    const placeholderPath = `${folderPath}/.emptyFolderPlaceholder`;

    const { error } = await client.storage
      .from(params.bucket)
      .upload(placeholderPath, new Blob([''], { type: 'text/plain' }), {
        cacheControl: '3600',
        upsert: false, // Don't overwrite if folder already exists
      });

    if (error) {
      // Check if the error is because the folder already exists
      if (error.message.includes('already exists')) {
        throw new Error(`Folder "${params.folderName}" already exists`);
      }

      throw new Error(`Failed to create folder: ${error.message}`);
    }

    return { success: true };
  }

  /**
   * Determine file type based on file extension
   * @param fileName - Name of the file
   * @returns File type category
   */
  private getFileType(fileName: string): string {
    const extension = fileName.split('.').pop()?.toLowerCase();

    if (!extension) {
      return 'unknown';
    }

    // SECURITY: 'svg' is intentionally excluded. SVGs can carry inline script
    // and, when served from storage as image/svg+xml, execute it if opened as a
    // document. Classifying SVG as a generic file avoids inline preview/URL
    // minting and routes it through the forced-attachment download path.
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'ico'];

    const videoExtensions = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'm4v'];
    const audioExtensions = ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'];
    const documentExtensions = ['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt'];
    const archiveExtensions = ['zip', 'rar', '7z', 'tar', 'gz', 'bz2'];

    const codeExtensions = [
      'js',
      'ts',
      'jsx',
      'tsx',
      'html',
      'css',
      'py',
      'java',
      'cpp',
      'c',
      'php',
      'rb',
      'go',
      'rs',
      'swift',
    ];

    if (imageExtensions.includes(extension)) {
      return 'image';
    }

    if (videoExtensions.includes(extension)) {
      return 'video';
    }

    if (audioExtensions.includes(extension)) {
      return 'audio';
    }

    if (documentExtensions.includes(extension)) {
      return 'document';
    }

    if (archiveExtensions.includes(extension)) {
      return 'archive';
    }

    if (codeExtensions.includes(extension)) {
      return 'code';
    }

    return 'file';
  }
}
