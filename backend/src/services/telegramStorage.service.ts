import path from 'path';
import { env } from '../config/env.js';
import { telegramClient } from '../telegram/telegram.client.js';
import { telegramRepository } from '../telegram/telegram.repository.js';
import { FileAttachmentModel, IFileAttachment } from '../models/FileAttachment.js';

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB strict limit

export const ALLOWED_IMAGE_MIMES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
export const ALLOWED_DOC_MIMES = ['application/pdf'];
export const ALL_ALLOWED_MIMES = [...ALLOWED_IMAGE_MIMES, ...ALLOWED_DOC_MIMES];

export const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];

export interface TelegramUploadOptions {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  customerId?: string;
  entityType?: string;
  entityId?: string;
  documentType?: string;
  category?: string;
  uploadedBy?: string;
}

export interface TelegramUploadResult {
  success: boolean;
  error?: string;
  statusCode?: number;
  message?: string;
  telegramFileId?: string;
  telegramMessageId?: number;
  telegramChatId?: string;
  fileName?: string;
  originalFileName?: string;
  mimeType?: string;
  fileSize?: number;
  fileId?: string;
  viewUrl?: string;
  downloadUrl?: string;
  uploadedAt?: string;
}

export interface TelegramFileDownloadResult {
  buffer: Buffer;
  mimeType: string;
  size?: number;
  name?: string;
  filePath?: string;
}

/**
 * Normalizes and validates MIME type against extension
 */
export function resolveMimeType(fileName?: string, mimeType?: string): string {
  const ext = path.extname(fileName || '').toLowerCase();
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';

  if (mimeType && mimeType !== 'application/octet-stream') {
    const clean = mimeType.split(';')[0].trim().toLowerCase();
    if (ALL_ALLOWED_MIMES.includes(clean)) return clean;
  }
  return 'application/octet-stream';
}

export class TelegramStorageService {
  /**
   * Validates file size, extension, and MIME type
   */
  public validateFile(buffer: Buffer, originalName: string, mimeType: string): { valid: boolean; error?: string; statusCode?: number; message?: string } {
    if (!buffer || buffer.length === 0) {
      return {
        valid: false,
        error: 'EMPTY_FILE',
        statusCode: 400,
        message: 'No file data was provided.'
      };
    }

    // 10 MB strict limit
    if (buffer.length > MAX_FILE_SIZE_BYTES) {
      return {
        valid: false,
        error: 'FILE_TOO_LARGE',
        statusCode: 413,
        message: `Maximum file size is 10MB. Provided file size exceeds the limit (${(buffer.length / (1024 * 1024)).toFixed(2)} MB).`
      };
    }

    const ext = path.extname(originalName || '').toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return {
        valid: false,
        error: 'INVALID_FILE_TYPE',
        statusCode: 400,
        message: `Invalid file format "${ext}". Allowed types: JPG, PNG, WEBP, and PDF.`
      };
    }

    const normalizedMime = resolveMimeType(originalName, mimeType);
    if (!ALL_ALLOWED_MIMES.includes(normalizedMime)) {
      return {
        valid: false,
        error: 'INVALID_FILE_TYPE',
        statusCode: 400,
        message: `Unsupported MIME format "${mimeType}". Only JPG, PNG, WEBP, and PDF are supported.`
      };
    }

    return { valid: true };
  }

  /**
   * Uploads a file (Customer Photo, Webcam Photo, KYC Document) to the private Telegram storage channel
   */
  public async uploadFile(options: TelegramUploadOptions): Promise<TelegramUploadResult> {
    const {
      buffer,
      originalName,
      mimeType,
      customerId,
      entityType = 'customer',
      entityId = customerId || 'general',
      documentType = 'document',
      category = 'kyc',
      uploadedBy = 'system'
    } = options;

    const validation = this.validateFile(buffer, originalName, mimeType);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error,
        statusCode: validation.statusCode,
        message: validation.message
      };
    }

    if (!telegramClient.isConfigured()) {
      return {
        success: false,
        error: 'TELEGRAM_NOT_CONFIGURED',
        statusCode: 503,
        message: 'Telegram document storage is not configured on the backend.'
      };
    }

    const normalizedMime = resolveMimeType(originalName, mimeType);
    const isImage = ALLOWED_IMAGE_MIMES.includes(normalizedMime);
    const sanitizedEntityId = (entityId || 'general').replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    const sanitizedDocType = (documentType || 'document').toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    const timestamp = new Date().toISOString();

    const caption = `📁 KKV GOLD FINANCE DOCUMENT STORAGE\n` +
      `CUSTOMER_ID: ${sanitizedEntityId}\n` +
      `DOCUMENT_TYPE: ${sanitizedDocType}\n` +
      `UPLOADED_BY: ${uploadedBy}\n` +
      `UPLOADED_AT: ${timestamp}`;

    try {
      let uploadResponse: any;

      if (isImage) {
        uploadResponse = await telegramClient.sendPhoto(buffer, originalName, caption);
        if (!uploadResponse.ok) {
          console.warn('[TelegramStorageService] sendPhoto failed, falling back to sendDocument:', uploadResponse.description);
          uploadResponse = await telegramClient.sendDocument(buffer, originalName, caption);
        }
      } else {
        uploadResponse = await telegramClient.sendDocument(buffer, originalName, caption);
      }

      if (!uploadResponse.ok || !uploadResponse.result) {
        console.error('[TelegramStorageService] Upload API failure:', uploadResponse.description);
        return {
          success: false,
          error: 'TELEGRAM_STORAGE_ERROR',
          statusCode: 502,
          message: `Failed to upload document to Telegram: ${uploadResponse.description || 'API Error'}`
        };
      }

      const msg = uploadResponse.result;
      const messageId = msg.message_id;
      const chatId = msg.chat?.id ? String(msg.chat.id) : undefined;

      let telegramFileId = '';
      let fileSize = buffer.length;

      if (msg.photo && Array.isArray(msg.photo) && msg.photo.length > 0) {
        // Largest photo size is the last item
        const bestPhoto = msg.photo[msg.photo.length - 1];
        telegramFileId = bestPhoto.file_id;
        fileSize = bestPhoto.file_size || buffer.length;
      } else if (msg.document) {
        telegramFileId = msg.document.file_id;
        fileSize = msg.document.file_size || buffer.length;
      }

      if (!telegramFileId) {
        return {
          success: false,
          error: 'TELEGRAM_FILE_ID_MISSING',
          statusCode: 502,
          message: 'Telegram upload completed but no file ID was returned.'
        };
      }

      const fileKey = `FILE_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      return {
        success: true,
        telegramFileId,
        telegramMessageId: messageId,
        telegramChatId: chatId,
        fileName: originalName,
        originalFileName: originalName,
        mimeType: normalizedMime,
        fileSize,
        fileId: fileKey,
        viewUrl: `/api/files/${fileKey}/view`,
        downloadUrl: `/api/files/${fileKey}/download`,
        uploadedAt: timestamp
      };
    } catch (err: any) {
      console.error('[TelegramStorageService] Unexpected upload exception:', err);
      return {
        success: false,
        error: 'TELEGRAM_STORAGE_ERROR',
        statusCode: 500,
        message: err?.message || 'Unexpected error storing document in Telegram.'
      };
    }
  }

  /**
   * Helper that uploads a document and automatically creates a FileAttachmentModel record
   */
  public async uploadDocument(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
    options: {
      customerId?: string;
      entityType?: string;
      entityId?: string;
      documentType?: string;
      category?: string;
      uploadedBy?: string;
    } = {}
  ): Promise<TelegramUploadResult & { fileId: string; viewUrl: string; downloadUrl: string; fileName: string; originalFileName: string; mimeType: string; fileSize: number }> {
    const validation = this.validateFile(buffer, originalName, mimeType);
    if (!validation.valid) {
      const err: any = new Error(validation.message || 'File validation failed');
      err.statusCode = validation.statusCode || 400;
      err.code = validation.error;
      throw err;
    }

    const uploadRes = await this.uploadFile({
      buffer,
      originalName,
      mimeType,
      ...options
    });

    if (!uploadRes.success || !uploadRes.telegramFileId || !uploadRes.fileId) {
      const err: any = new Error(uploadRes.message || 'Telegram upload failed');
      err.statusCode = uploadRes.statusCode || 500;
      err.code = uploadRes.error;
      throw err;
    }

    // Save FileAttachment record
    await FileAttachmentModel.create({
      fileId: uploadRes.fileId,
      entityType: options.entityType || 'customer',
      entityId: options.entityId || options.customerId || 'general',
      documentType: options.documentType || 'document',
      category: options.category || 'kyc',
      originalFileName: originalName,
      storedFileName: originalName,
      mimeType: uploadRes.mimeType || mimeType,
      fileSize: uploadRes.fileSize || buffer.length,
      telegramFileId: uploadRes.telegramFileId,
      telegramMessageId: uploadRes.telegramMessageId,
      telegramChatId: uploadRes.telegramChatId,
      viewUrl: uploadRes.viewUrl,
      downloadUrl: uploadRes.downloadUrl,
      uploadedBy: options.uploadedBy || 'system'
    });

    return {
      ...uploadRes,
      fileId: uploadRes.fileId,
      viewUrl: uploadRes.viewUrl!,
      downloadUrl: uploadRes.downloadUrl!,
      fileName: uploadRes.fileName || originalName,
      originalFileName: originalName,
      mimeType: uploadRes.mimeType || mimeType,
      fileSize: uploadRes.fileSize || buffer.length
    };
  }

  /**
   * Retrieves file binary from Telegram by fileId or telegramFileId
   */
  public async getFileBuffer(fileIdOrTelegramFileId: string, fallbackName?: string, fallbackMime?: string): Promise<TelegramFileDownloadResult> {
    if (!fileIdOrTelegramFileId) {
      throw new Error('File ID or Telegram file ID is required.');
    }

    let telegramFileId = fileIdOrTelegramFileId;
    let fileName = fallbackName;
    let mimeType = fallbackMime;

    // Check if passed string is a fileId registered in FileAttachmentModel
    const attachment: IFileAttachment | null = await FileAttachmentModel.findOne({ fileId: fileIdOrTelegramFileId }).lean();
    if (attachment && attachment.telegramFileId) {
      telegramFileId = attachment.telegramFileId;
      fileName = attachment.originalFileName || attachment.storedFileName || fallbackName;
      mimeType = attachment.mimeType || fallbackMime;
    }

    const fileMetaRes = await telegramClient.getFile(telegramFileId);
    if (!fileMetaRes.ok || !fileMetaRes.result?.file_path) {
      throw new Error(`Failed to resolve Telegram file path: ${fileMetaRes.description || 'File not found on Telegram servers'}`);
    }

    const filePath = fileMetaRes.result.file_path;
    const buffer = await telegramClient.downloadFileBuffer(filePath);

    const derivedName = path.basename(filePath) || fileName || 'document';
    const derivedMime = resolveMimeType(fileName || derivedName, mimeType);

    return {
      buffer,
      mimeType: derivedMime,
      size: fileMetaRes.result.file_size || buffer.length,
      name: fileName || derivedName,
      filePath
    };
  }

  /**
   * Deletes a file attachment record and removes the Telegram message
   */
  public async deleteDocument(fileId: string, deletedBy?: string): Promise<{ success: boolean; message?: string }> {
    if (!fileId) {
      return { success: false, message: 'File ID is required.' };
    }

    const attachment: IFileAttachment | null = await FileAttachmentModel.findOne({ fileId }).lean();
    if (attachment) {
      if (attachment.telegramMessageId) {
        await this.deleteFile(attachment.telegramMessageId, attachment.telegramChatId);
      }
      await telegramRepository.deleteRecord('FILE_ATTACHMENT', fileId, false, { email: deletedBy || 'system' });
    } else {
      await telegramRepository.deleteRecord('FILE_ATTACHMENT', fileId, false, { email: deletedBy || 'system' });
    }

    return { success: true, message: 'Document deleted successfully.' };
  }

  /**
   * Deletes a file message from the Telegram storage chat
   */
  public async deleteFile(telegramMessageId?: number, telegramChatId?: string): Promise<boolean> {
    if (!telegramMessageId) return false;
    try {
      const res = await telegramClient.deleteMessage(telegramMessageId, telegramChatId);
      return Boolean(res.ok);
    } catch (err: any) {
      console.warn(`[TelegramStorageService] Could not delete Telegram message ${telegramMessageId}:`, err?.message || err);
      return false;
    }
  }

  /**
   * Checks connectivity and readiness of Telegram storage
   */
  public async checkStorageHealth(): Promise<{
    healthy: boolean;
    success: boolean;
    botTokenConfigured: boolean;
    chatIdConfigured: boolean;
    configured: boolean;
    connected: boolean;
    storageType: string;
    botUsername?: string;
    chatTitle?: string;
    message: string;
    error?: string;
  }> {
    const botTokenConfigured = Boolean(env.TELEGRAM_BOT_TOKEN);
    const chatIdConfigured = Boolean(env.TELEGRAM_CHAT_ID);
    const health = await telegramClient.checkHealth();

    const healthy = health.connected;
    const message = healthy
      ? `Connected to Telegram storage (${health.chatTitle || 'Channel'} via @${health.botUsername || 'Bot'})`
      : health.error || 'Telegram storage disconnected or unconfigured';

    return {
      healthy,
      success: healthy,
      botTokenConfigured,
      chatIdConfigured,
      configured: health.configured,
      connected: health.connected,
      storageType: 'TELEGRAM_PRIVATE_CHANNEL',
      botUsername: health.botUsername,
      chatTitle: health.chatTitle,
      message,
      error: health.error
    };
  }

  /**
   * Alias for checkStorageHealth
   */
  public async checkHealth() {
    return this.checkStorageHealth();
  }
}

export const telegramStorageService = new TelegramStorageService();
export default telegramStorageService;
