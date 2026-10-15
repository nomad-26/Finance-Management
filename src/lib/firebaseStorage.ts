/**
 * Firebase Cloud Storage Service for KKV Gold Finance & Rental Management
 * Handles secure customer photo, KYC document, and loan item upload/download.
 */
import {
  ref,
  uploadBytes,
  uploadString,
  getDownloadURL,
  deleteObject,
  StorageReference
} from 'firebase/storage';
import { storage } from './firebase';

export interface UploadFileOptions {
  folder: 'customers' | 'loans' | 'rentals' | 'receipts';
  entityId: string;
  subfolder?: 'photo' | 'kyc' | 'ornaments' | 'documents';
  fileName?: string;
  metadata?: Record<string, string>;
}

export interface UploadResult {
  url: string;
  downloadUrl: string;
  storagePath: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: string;
}

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_DOC_SIZE_BYTES = 25 * 1024 * 1024;   // 25 MB

const ALLOWED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp'
]);

const ALLOWED_DOC_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/pdf'
]);

export class FirebaseStorageService {
  /**
   * Uploads a File or Blob directly to Firebase Storage
   */
  public async uploadFile(
    file: File | Blob,
    options: UploadFileOptions
  ): Promise<UploadResult> {
    const rawName = (file as File).name || options.fileName || `file_${Date.now()}`;
    const cleanName = rawName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const mime = file.type || 'application/octet-stream';

    // Validate mime type
    const isImage = ALLOWED_IMAGE_MIMES.has(mime);
    const isDoc = ALLOWED_DOC_MIMES.has(mime);

    if (!isImage && !isDoc) {
      throw new Error(`Unsupported file type (${mime}). Allowed formats: JPG, PNG, WEBP, PDF.`);
    }

    // Validate size
    const limit = isImage ? MAX_IMAGE_SIZE_BYTES : MAX_DOC_SIZE_BYTES;
    if (file.size > limit) {
      throw new Error(`File exceeds maximum size of ${limit / (1024 * 1024)} MB.`);
    }

    const sub = options.subfolder ? `${options.subfolder}/` : '';
    const uniquePath = `${options.folder}/${options.entityId}/${sub}${Date.now()}_${cleanName}`;
    const fileRef: StorageReference = ref(storage, uniquePath);

    const snapshot = await uploadBytes(fileRef, file, {
      contentType: mime,
      customMetadata: options.metadata
    });

    const downloadUrl = await getDownloadURL(snapshot.ref);

    return {
      url: downloadUrl,
      downloadUrl,
      storagePath: uniquePath,
      fileName: cleanName,
      fileSize: file.size,
      mimeType: mime,
      uploadedAt: new Date().toISOString()
    };
  }

  /**
   * Uploads a Base64 or Data URI string (e.g. from Webcam capture)
   */
  public async uploadBase64(
    dataUrl: string,
    options: UploadFileOptions
  ): Promise<UploadResult> {
    if (!dataUrl || !dataUrl.startsWith('data:')) {
      throw new Error('Invalid Base64 Data URL format.');
    }

    const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) {
      throw new Error('Could not parse Data URL format.');
    }

    const mime = matches[1];
    const base64Data = matches[2];

    const ext = mime.split('/')[1] || 'jpg';
    const cleanName = options.fileName || `capture_${Date.now()}.${ext}`;

    const sub = options.subfolder ? `${options.subfolder}/` : '';
    const uniquePath = `${options.folder}/${options.entityId}/${sub}${Date.now()}_${cleanName}`;
    const fileRef = ref(storage, uniquePath);

    const snapshot = await uploadString(fileRef, base64Data, 'base64', {
      contentType: mime,
      customMetadata: options.metadata
    });

    const downloadUrl = await getDownloadURL(snapshot.ref);

    return {
      url: downloadUrl,
      downloadUrl,
      storagePath: uniquePath,
      fileName: cleanName,
      fileSize: Math.round((base64Data.length * 3) / 4),
      mimeType: mime,
      uploadedAt: new Date().toISOString()
    };
  }

  /**
   * Deletes a file from Firebase Storage given its storage path or URL
   */
  public async deleteFile(storagePathOrUrl: string): Promise<boolean> {
    if (!storagePathOrUrl) return false;
    try {
      let fileRef: StorageReference;
      if (storagePathOrUrl.startsWith('gs://') || storagePathOrUrl.startsWith('https://')) {
        fileRef = ref(storage, storagePathOrUrl);
      } else {
        fileRef = ref(storage, storagePathOrUrl);
      }
      await deleteObject(fileRef);
      return true;
    } catch (err: any) {
      console.warn('[FirebaseStorage] Notice deleting file:', err?.message || err);
      return false;
    }
  }
}

export const firebaseStorage = new FirebaseStorageService();
export default firebaseStorage;
