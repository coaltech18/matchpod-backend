import { 
  BlobServiceClient, 
  ContainerClient,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
  StorageSharedKeyCredential
} from '@azure/storage-blob';

export type ImageCategory = 'profile' | 'user' | 'room';

// Image size caps in bytes
const SIZE_CAPS: Record<ImageCategory, number> = {
  profile: 2 * 1024 * 1024,  // 2MB
  user: 5 * 1024 * 1024,     // 5MB
  room: 8 * 1024 * 1024,     // 8MB
};

// Allowed MIME types
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp'
];

export class AzureBlobService {
  private static blobServiceClient: BlobServiceClient | null = null;
  private static credential: StorageSharedKeyCredential | null = null;

  /**
   * Initialize Azure Blob Service Client
   */
  private static initialize() {
    if (this.blobServiceClient) {
      return;
    }

    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    if (!connectionString) {
      throw new Error('AZURE_STORAGE_CONNECTION_STRING not configured');
    }

    try {
      // Parse connection string to get account name and key
      const accountNameMatch = connectionString.match(/AccountName=([^;]+)/);
      const accountKeyMatch = connectionString.match(/AccountKey=([^;]+)/);

      if (!accountNameMatch || !accountKeyMatch) {
        throw new Error('Invalid AZURE_STORAGE_CONNECTION_STRING format');
      }

      const accountName = accountNameMatch[1];
      const accountKey = accountKeyMatch[1];

      this.credential = new StorageSharedKeyCredential(accountName, accountKey);
      this.blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);

      console.log('✅ Azure Blob Service initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Azure Blob Service:', error);
      throw error;
    }
  }

  /**
   * Get container client
   */
  private static getContainerClient(category: ImageCategory): ContainerClient {
    this.initialize();
    
    if (!this.blobServiceClient) {
      throw new Error('Blob service client not initialized');
    }

    // Container name based on category
    const containerName = `${category}-images`;
    return this.blobServiceClient.getContainerClient(containerName);
  }

  /**
   * Validate file metadata
   */
  static validateFile(category: ImageCategory, contentType: string, sizeBytes: number): {
    valid: boolean;
    error?: string;
  } {
    // Check MIME type
    if (!ALLOWED_MIME_TYPES.includes(contentType)) {
      return {
        valid: false,
        error: `Invalid content type. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`
      };
    }

    // Check size cap
    const sizeCap = SIZE_CAPS[category];
    if (sizeBytes > sizeCap) {
      return {
        valid: false,
        error: `File size exceeds limit. Maximum size for ${category}: ${sizeCap / (1024 * 1024)}MB`
      };
    }

    return { valid: true };
  }

  /**
   * Generate SAS URL for direct client upload
   * URL is valid for 15 minutes with write permissions
   */
  static async generateSasUrl(
    fileName: string,
    category: ImageCategory,
    contentType: string,
    sizeBytes: number
  ): Promise<{ sasUrl: string; blobUrl: string }> {
    // Validate file
    const validation = this.validateFile(category, contentType, sizeBytes);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    this.initialize();

    if (!this.credential) {
      throw new Error('Storage credential not initialized');
    }

    const containerClient = this.getContainerClient(category);
    
    // Ensure container exists
    await containerClient.createIfNotExists({
      access: 'blob' // Public read access for images
    });

    // Generate unique blob name
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 9);
    const extension = fileName.split('.').pop();
    const blobName = `${timestamp}_${randomString}.${extension}`;

    const blobClient = containerClient.getBlobClient(blobName);

    // SAS token permissions (write only, no read/delete)
    const sasPermissions = new BlobSASPermissions();
    sasPermissions.write = true;
    sasPermissions.create = true;

    // Token expires in 15 minutes
    const expiresOn = new Date(Date.now() + 15 * 60 * 1000);
    const startsOn = new Date(Date.now() - 5 * 60 * 1000); // Start 5 minutes ago to account for clock skew

    // Generate SAS token
    const sasToken = generateBlobSASQueryParameters(
      {
        containerName: containerClient.containerName,
        blobName,
        permissions: sasPermissions,
        startsOn,
        expiresOn,
        contentType, // Enforce content type
      },
      this.credential
    ).toString();

    const sasUrl = `${blobClient.url}?${sasToken}`;
    const blobUrl = blobClient.url; // Final URL without SAS token

    return {
      sasUrl,
      blobUrl
    };
  }

  /**
   * Server-side upload fallback (if client upload fails)
   */
  static async uploadBlob(
    category: ImageCategory,
    blobName: string,
    buffer: Buffer,
    contentType: string
  ): Promise<string> {
    // Validate file
    const validation = this.validateFile(category, contentType, buffer.length);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const containerClient = this.getContainerClient(category);
    await containerClient.createIfNotExists({
      access: 'blob'
    });

    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    await blockBlobClient.uploadData(buffer, {
      blobHTTPHeaders: {
        blobContentType: contentType,
      },
    });

    return blockBlobClient.url;
  }

  /**
   * Delete a blob
   */
  static async deleteBlob(category: ImageCategory, blobName: string): Promise<void> {
    const containerClient = this.getContainerClient(category);
    const blobClient = containerClient.getBlobClient(blobName);
    
    await blobClient.deleteIfExists();
    console.log(`🗑️ Deleted blob: ${blobName}`);
  }

  /**
   * List blobs in a category
   */
  static async listBlobs(category: ImageCategory, maxResults: number = 100): Promise<string[]> {
    const containerClient = this.getContainerClient(category);
    
    const blobs: string[] = [];
    for await (const blob of containerClient.listBlobsFlat()) {
      blobs.push(blob.name);
      if (blobs.length >= maxResults) {
        break;
      }
    }

    return blobs;
  }
}

export default AzureBlobService;

