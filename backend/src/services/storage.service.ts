import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/env.js';
import { getStorageSubdirectory } from '../config/storage.js';

export interface SaveFileOptions {
  category?: 'customer' | 'loan' | 'rental' | 'backup' | 'general' | string;
  mimeType?: string;
  originalName?: string;
  storedFileName?: string;
  customFileName?: string;
}

export interface StoredFileMetadata {
  fileId: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  category: string;
  relativePath: string;
  createdAt: string;
}

export class StorageService {
  private baseStorageDir: string;
  private allowedMimeTypes: string[] = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'application/pdf',
    'application/json',
    'application/zip',
    'text/csv'
  ];

  constructor(storageDir?: string) {
    if (storageDir) {
      this.baseStorageDir = path.resolve(storageDir);
    } else if (process.env.LOCAL_STORAGE_PATH && !process.env.LOCAL_STORAGE_PATH.startsWith('./')) {
      this.baseStorageDir = path.resolve(process.env.LOCAL_STORAGE_PATH);
    } else {
      // Use centralized safe storage directory
      this.baseStorageDir = getStorageSubdirectory('uploads');
    }
    this.ensureDirectoryExists(this.baseStorageDir);
  }

  private ensureDirectoryExists(dirPath: string): void {
    try {
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
    } catch (err: any) {
      console.warn(`[StorageService] Warning: Unable to create directory ${dirPath}:`, err?.message || err);
    }
  }

  private sanitizeCategory(category?: string): string {
    const clean = (category || 'general').toLowerCase().replace(/[^a-z0-9_-]/g, '');
    return clean || 'general';
  }

  private getSafeExtension(originalName?: string, mimeType?: string): string {
    if (originalName && originalName.includes('.')) {
      const ext = path.extname(originalName).toLowerCase().replace(/[^a-z0-9.]/g, '');
      if (['.jpg', '.jpeg', '.png', '.webp', '.pdf', '.json', '.zip', '.csv'].includes(ext)) {
        return ext;
      }
    }

    switch (mimeType?.toLowerCase()) {
      case 'image/jpeg':
      case 'image/jpg':
        return '.jpg';
      case 'image/png':
        return '.png';
      case 'image/webp':
        return '.webp';
      case 'application/pdf':
        return '.pdf';
      case 'application/zip':
        return '.zip';
      case 'application/json':
        return '.json';
      case 'text/csv':
        return '.csv';
      default:
        return '.bin';
    }
  }

  public resolveSafePath(relativePath: string): string {
    const resolved = path.resolve(this.baseStorageDir, relativePath);
    // Path traversal check
    if (!resolved.startsWith(path.resolve(this.baseStorageDir))) {
      throw new Error('Security Error: Illegal path traversal detected.');
    }
    return resolved;
  }

  /**
   * Saves a buffer to server local storage inside a structured category folder.
   */
  public async saveFile(buffer: Buffer, options: SaveFileOptions = {}): Promise<StoredFileMetadata> {
    if (!buffer || buffer.length === 0) {
      throw new Error('Cannot save empty file buffer.');
    }

    const mimeType = (options.mimeType || 'application/octet-stream').toLowerCase();
    if (!this.allowedMimeTypes.includes(mimeType) && !mimeType.startsWith('image/')) {
      throw new Error(`Unsupported file MIME type: ${mimeType}`);
    }

    const category = this.sanitizeCategory(options.category);
    const categoryDir = path.resolve(this.baseStorageDir, category);
    this.ensureDirectoryExists(categoryDir);

    const fileId = uuidv4();
    const ext = this.getSafeExtension(options.originalName, mimeType);
    const fileName = options.storedFileName || options.customFileName || `${fileId}${ext}`;
    const relativePath = path.join(category, fileName);
    const targetPath = this.resolveSafePath(relativePath);

    await fs.promises.writeFile(targetPath, buffer);

    return {
      fileId,
      fileName,
      originalName: options.originalName || fileName,
      mimeType,
      sizeBytes: buffer.length,
      category,
      relativePath,
      createdAt: new Date().toISOString()
    };
  }

  /**
   * Retrieves a file buffer from server local storage.
   */
  public async getFile(relativePath: string): Promise<{ buffer: Buffer; size: number }> {
    const safePath = this.resolveSafePath(relativePath);
    if (!fs.existsSync(safePath)) {
      throw new Error('File not found in storage.');
    }
    const buffer = await fs.promises.readFile(safePath);
    return { buffer, size: buffer.length };
  }

  /**
   * Deletes a file safely from server local storage.
   */
  public async deleteFile(relativePath: string): Promise<boolean> {
    try {
      const safePath = this.resolveSafePath(relativePath);
      if (fs.existsSync(safePath)) {
        await fs.promises.unlink(safePath);
        return true;
      }
      return false;
    } catch (err: any) {
      console.warn(`[StorageService] Warning deleting file '${relativePath}':`, err?.message || err);
      return false;
    }
  }

  /**
   * Checks if a file exists in the primary path or search candidates.
   */
  public fileExists(relativePath: string): boolean {
    try {
      const safePath = this.resolveSafePath(relativePath);
      return fs.existsSync(safePath);
    } catch {
      return false;
    }
  }

  /**
   * Finds the safe relative path for a stored filename across category subdirectories.
   */
  public findLocalFilePath(fileNameOrId: string, category?: string): string | null {
    if (!fileNameOrId) return null;

    const candidates: string[] = [];
    if (category) {
      candidates.push(path.join(category, fileNameOrId));
    }
    candidates.push(fileNameOrId);
    candidates.push(path.join('customer', fileNameOrId));
    candidates.push(path.join('general', fileNameOrId));
    candidates.push(path.join('loan', fileNameOrId));
    candidates.push(path.join('rental', fileNameOrId));

    for (const rel of candidates) {
      if (this.fileExists(rel)) {
        return rel;
      }
    }
    return null;
  }
}

export const storageService = new StorageService();
export default storageService;
