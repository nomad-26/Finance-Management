import { Request, Response } from 'express';
import path from 'path';
import { FileAttachmentModel } from '../models/FileAttachment.js';
import { CustomerModel } from '../models/Customer.js';
import {
  telegramStorageService,
  MAX_FILE_SIZE_BYTES,
  ALL_ALLOWED_MIMES,
  ALLOWED_EXTENSIONS,
  resolveMimeType
} from '../services/telegramStorage.service.js';
import { storageService } from '../services/storage.service.js';
import { hasPermission } from '../middleware/auth.middleware.js';

/**
 * Sanitizes entity IDs and filenames to safe alphanumeric tokens
 */
function sanitizeIdentifier(input?: string): string {
  if (!input) return 'general';
  return input.trim().replace(/[^a-zA-Z0-9_\-\.]/g, '_');
}

/**
 * POST /api/files/upload
 * Handles multipart file upload (up to 10 MB), validates file format, stores in Telegram Private Storage,
 * and saves metadata in Telegram persistent storage.
 */
export const uploadFileHandler = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'NO_FILE_PROVIDED',
        message: 'No file was provided in the upload request. Please select a file.'
      });
    }

    const file = req.file;
    const body = req.body || {};

    const entityType = (body.entityType || 'customer').toLowerCase().trim();
    const entityId = sanitizeIdentifier(body.entityId || 'general');
    const documentType = (body.documentType || 'document').toLowerCase().trim();
    const uploadedBy = (req as any).user?.email || (req as any).user?.id || 'STAFF';

    const mimeType = (file.mimetype || 'application/octet-stream').toLowerCase();
    const originalName = file.originalname || 'uploaded_file';

    // 10 MB strict limit check (HTTP 413)
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return res.status(413).json({
        success: false,
        error: 'FILE_TOO_LARGE',
        message: 'Maximum file size is 10 MB.'
      });
    }

    // Extension and MIME format validation (HTTP 400)
    const ext = path.extname(originalName).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_FILE_TYPE',
        message: `Unsupported file extension "${ext}". Allowed types: JPG, PNG, WEBP, and PDF.`
      });
    }

    const normalizedMime = resolveMimeType(originalName, mimeType);
    if (!ALL_ALLOWED_MIMES.includes(normalizedMime)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_FILE_TYPE',
        message: `Unsupported file format "${mimeType}". Only JPG, PNG, WEBP, and PDF are allowed.`
      });
    }

    // Upload to Telegram Private Storage
    const uploadResult = await telegramStorageService.uploadFile({
      buffer: file.buffer,
      originalName,
      mimeType: normalizedMime,
      entityType,
      entityId,
      documentType,
      uploadedBy
    });

    if (!uploadResult.success || !uploadResult.telegramFileId) {
      return res.status(uploadResult.statusCode || 500).json({
        success: false,
        error: uploadResult.error || 'TELEGRAM_UPLOAD_ERROR',
        message: uploadResult.message || 'Failed to upload document to Telegram.'
      });
    }

    const fileId = uploadResult.fileId || `FILE_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    // Save metadata in application persistence
    await FileAttachmentModel.create({
      fileId,
      entityType,
      entityId,
      documentType,
      originalFileName: originalName,
      storedFileName: originalName,
      mimeType: normalizedMime,
      fileSize: file.size,
      telegramFileId: uploadResult.telegramFileId,
      telegramMessageId: uploadResult.telegramMessageId,
      telegramChatId: uploadResult.telegramChatId,
      viewUrl: `/api/files/${fileId}/view`,
      downloadUrl: `/api/files/${fileId}/download`,
      uploadedBy,
      isDeleted: false
    });

    return res.status(201).json({
      success: true,
      message: 'File uploaded successfully to Telegram secure storage.',
      data: {
        fileId,
        id: fileId,
        telegramFileId: uploadResult.telegramFileId,
        telegramMessageId: uploadResult.telegramMessageId,
        entityType,
        entityId,
        documentType,
        originalFileName: originalName,
        fileName: originalName,
        mimeType: normalizedMime,
        fileSize: file.size,
        viewUrl: `/api/files/${fileId}/view`,
        downloadUrl: `/api/files/${fileId}/download`,
        uploadedAt: uploadResult.uploadedAt || new Date().toISOString()
      }
    });
  } catch (err: any) {
    console.error('[FileController] uploadFileHandler unexpected error:', err);
    return res.status(500).json({
      success: false,
      error: 'UPLOAD_FAILED',
      message: err.message || 'An unexpected error occurred during file upload.'
    });
  }
};

/**
 * GET /api/files/:id/view
 * Streams file securely from Telegram with inline Content-Disposition for browser display.
 * Protected by JWT authentication and RBAC.
 */
export const viewFileHandler = async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication token is required. Please sign in.'
      });
    }

    const targetId = req.params.id || req.params.fileId;
    if (!targetId) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_REQUEST',
        message: 'File ID parameter is required.'
      });
    }

    // Look up attachment metadata
    const attachment = await FileAttachmentModel.findOne({
      $or: [{ fileId: targetId }, { telegramFileId: targetId }, { id: targetId }, { storedFileName: targetId }]
    });

    let customerDocMatch: any = null;
    let customerMatch: any = null;

    if (!attachment) {
      customerMatch = await CustomerModel.findOne({
        $or: [
          { 'customerPhotoData.fileId': targetId },
          { 'customerPhotoData.telegramFileId': targetId },
          { 'customerPhoto.fileId': targetId },
          { 'customerPhoto.telegramFileId': targetId },
          { customerPhoto: targetId },
          { 'kycDocuments.documentId': targetId },
          { 'kycDocuments.telegramFileId': targetId },
          { 'kycDocuments.fileId': targetId },
          { 'kycDocuments.id': targetId }
        ]
      });

      if (customerMatch) {
        const photoObj = (typeof customerMatch.customerPhoto === 'object' && customerMatch.customerPhoto !== null)
          ? customerMatch.customerPhoto
          : customerMatch.customerPhotoData;

        if (
          photoObj?.fileId === targetId ||
          photoObj?.telegramFileId === targetId ||
          photoObj?.id === targetId ||
          customerMatch.customerPhoto === targetId
        ) {
          customerDocMatch = photoObj;
        } else if (Array.isArray(customerMatch.kycDocuments)) {
          customerDocMatch = customerMatch.kycDocuments.find((d: any) =>
            d.documentId === targetId ||
            d.telegramFileId === targetId ||
            d.fileId === targetId ||
            d.id === targetId
          );
        }
      }
    } else if (attachment.entityType === 'customer' && attachment.entityId) {
      customerMatch = await CustomerModel.findOne({
        $or: [{ id: attachment.entityId }, { customerId: attachment.entityId }]
      });
    }

    // RBAC & Ownership Validation
    const isUserAdmin = user.role === 'ADMIN' || (user.role as string) === 'MASTER_ADMIN';
    if (!isUserAdmin) {
      const isKycDoc =
        attachment?.category === 'kyc' ||
        attachment?.documentType?.toLowerCase().includes('kyc') ||
        attachment?.documentType?.toLowerCase().includes('aadhaar') ||
        attachment?.documentType?.toLowerCase().includes('pan') ||
        attachment?.documentType?.toLowerCase().includes('passport') ||
        attachment?.documentType?.toLowerCase().includes('photo') ||
        attachment?.entityType === 'customer' ||
        Boolean(customerDocMatch);

      const hasKycAccess = Boolean((user.permissions as any)?.viewKyc || (user.permissions?.customers as any)?.viewKyc);

      if (isKycDoc && !hasKycAccess) {
        return res.status(403).json({
          success: false,
          error: 'FORBIDDEN',
          message: 'Access denied. You do not have permission to view KYC documents.'
        });
      }

      const canView =
        hasPermission(user.permissions, 'customers', 'view', user.role) ||
        hasPermission(user.permissions, 'loans', 'view', user.role) ||
        hasKycAccess;

      if (!canView) {
        return res.status(403).json({
          success: false,
          error: 'FORBIDDEN',
          message: 'Access denied. You do not have permission to view customer documents.'
        });
      }

      // Branch-based scoping
      const userBranch = (user as any).branchId;
      if (userBranch && customerMatch && customerMatch.branchId && customerMatch.branchId !== userBranch) {
        return res.status(403).json({
          success: false,
          error: 'FORBIDDEN',
          message: 'Access denied. You cannot access documents belonging to another branch.'
        });
      }
    }

    const telegramFileId =
      attachment?.telegramFileId ||
      customerDocMatch?.telegramFileId ||
      customerDocMatch?.fileId ||
      attachment?.fileId ||
      targetId;

    const fileName =
      attachment?.originalFileName ||
      customerDocMatch?.fileName ||
      customerDocMatch?.originalFileName ||
      customerDocMatch?.documentName ||
      'document';

    const fallbackMime = attachment?.mimeType || customerDocMatch?.mimeType;

    // Fetch from Telegram if telegramFileId is present
    if (telegramFileId && !telegramFileId.startsWith('local_') && !telegramFileId.startsWith('FILE_')) {
      try {
        const fileResult = await telegramStorageService.getFileBuffer(telegramFileId, fileName, fallbackMime);
        res.setHeader('Content-Type', fileResult.mimeType);
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileResult.name || fileName)}"`);
        if (fileResult.size) res.setHeader('Content-Length', fileResult.size);
        res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('X-Content-Type-Options', 'nosniff');

        return res.send(fileResult.buffer);
      } catch (tgErr: any) {
        console.error('[FileController] Telegram streaming notice:', tgErr?.message || tgErr);
        return res.status(404).json({
          success: false,
          error: 'FILE_NOT_FOUND',
          message: 'Requested document could not be retrieved from Telegram storage.'
        });
      }
    }

    // Fallback: Local storage check across categories
    const candidateFileNames = [
      attachment?.storedFileName,
      attachment?.originalFileName,
      customerDocMatch?.fileName,
      customerDocMatch?.storedFileName,
      customerDocMatch?.originalFileName,
      targetId,
      `${targetId}.jpg`,
      `${targetId}.pdf`
    ].filter(Boolean) as string[];

    for (const nameCandidate of candidateFileNames) {
      const localRelPath = storageService.findLocalFilePath(nameCandidate, attachment?.entityType || 'customer');
      if (localRelPath) {
        const { buffer } = await storageService.getFile(localRelPath);
        const resolvedMime = resolveMimeType(fileName, fallbackMime);
        res.setHeader('Content-Type', resolvedMime);
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
        res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        return res.send(buffer);
      }
    }

    return res.status(404).json({
      success: false,
      error: 'DOCUMENT_NOT_FOUND',
      message: 'Document not found.'
    });
  } catch (err: any) {
    console.error('[FileController] viewFileHandler error:', err);
    return res.status(500).json({
      success: false,
      error: 'FILE_VIEW_ERROR',
      message: err.message || 'Failed to retrieve file.'
    });
  }
};

/**
 * GET /api/files/:id/download
 * Streams file with attachment Content-Disposition to trigger browser download.
 * Protected by JWT authentication and RBAC.
 */
export const downloadFileHandler = async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication token is required. Please sign in.'
      });
    }

    const targetId = req.params.id || req.params.fileId;
    if (!targetId) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_REQUEST',
        message: 'File ID parameter is required.'
      });
    }

    const attachment = await FileAttachmentModel.findOne({
      $or: [{ fileId: targetId }, { telegramFileId: targetId }, { id: targetId }, { storedFileName: targetId }]
    });

    let customerDocMatch: any = null;
    let customerMatch: any = null;

    if (!attachment) {
      customerMatch = await CustomerModel.findOne({
        $or: [
          { 'customerPhotoData.fileId': targetId },
          { 'customerPhotoData.telegramFileId': targetId },
          { 'customerPhoto.fileId': targetId },
          { 'customerPhoto.telegramFileId': targetId },
          { customerPhoto: targetId },
          { 'kycDocuments.documentId': targetId },
          { 'kycDocuments.telegramFileId': targetId },
          { 'kycDocuments.fileId': targetId },
          { 'kycDocuments.id': targetId }
        ]
      });

      if (customerMatch) {
        const photoObj = (typeof customerMatch.customerPhoto === 'object' && customerMatch.customerPhoto !== null)
          ? customerMatch.customerPhoto
          : customerMatch.customerPhotoData;

        if (
          photoObj?.fileId === targetId ||
          photoObj?.telegramFileId === targetId ||
          photoObj?.id === targetId ||
          customerMatch.customerPhoto === targetId
        ) {
          customerDocMatch = photoObj;
        } else if (Array.isArray(customerMatch.kycDocuments)) {
          customerDocMatch = customerMatch.kycDocuments.find((d: any) =>
            d.documentId === targetId ||
            d.telegramFileId === targetId ||
            d.fileId === targetId ||
            d.id === targetId
          );
        }
      }
    } else if (attachment.entityType === 'customer' && attachment.entityId) {
      customerMatch = await CustomerModel.findOne({
        $or: [{ id: attachment.entityId }, { customerId: attachment.entityId }]
      });
    }

    // RBAC & Ownership Validation
    const isUserAdmin = user.role === 'ADMIN' || (user.role as string) === 'MASTER_ADMIN';
    if (!isUserAdmin) {
      const isKycDoc =
        attachment?.category === 'kyc' ||
        attachment?.documentType?.toLowerCase().includes('kyc') ||
        attachment?.documentType?.toLowerCase().includes('aadhaar') ||
        attachment?.documentType?.toLowerCase().includes('pan') ||
        attachment?.documentType?.toLowerCase().includes('passport') ||
        attachment?.documentType?.toLowerCase().includes('photo') ||
        attachment?.entityType === 'customer' ||
        Boolean(customerDocMatch);

      const hasKycAccess = Boolean((user.permissions as any)?.viewKyc || (user.permissions?.customers as any)?.viewKyc);

      if (isKycDoc && !hasKycAccess) {
        return res.status(403).json({
          success: false,
          error: 'FORBIDDEN',
          message: 'Access denied. You do not have permission to download KYC documents.'
        });
      }

      const canView =
        hasPermission(user.permissions, 'customers', 'view', user.role) ||
        hasPermission(user.permissions, 'loans', 'view', user.role) ||
        hasKycAccess;

      if (!canView) {
        return res.status(403).json({
          success: false,
          error: 'FORBIDDEN',
          message: 'Access denied. You do not have permission to download customer documents.'
        });
      }

      // Branch-based scoping
      const userBranch = (user as any).branchId;
      if (userBranch && customerMatch && customerMatch.branchId && customerMatch.branchId !== userBranch) {
        return res.status(403).json({
          success: false,
          error: 'FORBIDDEN',
          message: 'Access denied. You cannot access documents belonging to another branch.'
        });
      }
    }

    const telegramFileId =
      attachment?.telegramFileId ||
      customerDocMatch?.telegramFileId ||
      customerDocMatch?.fileId ||
      attachment?.fileId ||
      targetId;

    const fileName =
      attachment?.originalFileName ||
      customerDocMatch?.fileName ||
      customerDocMatch?.originalFileName ||
      customerDocMatch?.documentName ||
      'document';

    const fallbackMime = attachment?.mimeType || customerDocMatch?.mimeType;

    // Stream from Telegram
    if (telegramFileId && !telegramFileId.startsWith('local_') && !telegramFileId.startsWith('FILE_')) {
      try {
        const fileResult = await telegramStorageService.getFileBuffer(telegramFileId, fileName, fallbackMime);
        res.setHeader('Content-Type', fileResult.mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileResult.name || fileName)}"`);
        if (fileResult.size) res.setHeader('Content-Length', fileResult.size);
        res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('X-Content-Type-Options', 'nosniff');

        return res.send(fileResult.buffer);
      } catch (tgErr: any) {
        console.error('[FileController] Telegram download streaming notice:', tgErr?.message || tgErr);
        return res.status(404).json({
          success: false,
          error: 'FILE_NOT_FOUND',
          message: 'Requested document could not be retrieved from Telegram storage.'
        });
      }
    }

    // Fallback: Local storage check across categories
    const candidateFileNames = [
      attachment?.storedFileName,
      attachment?.originalFileName,
      customerDocMatch?.fileName,
      customerDocMatch?.storedFileName,
      customerDocMatch?.originalFileName,
      targetId,
      `${targetId}.jpg`,
      `${targetId}.pdf`
    ].filter(Boolean) as string[];

    for (const nameCandidate of candidateFileNames) {
      const localRelPath = storageService.findLocalFilePath(nameCandidate, attachment?.entityType || 'customer');
      if (localRelPath) {
        const { buffer } = await storageService.getFile(localRelPath);
        const resolvedMime = resolveMimeType(fileName, fallbackMime);
        res.setHeader('Content-Type', resolvedMime);
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
        res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        return res.send(buffer);
      }
    }

    return res.status(404).json({
      success: false,
      error: 'DOCUMENT_NOT_FOUND',
      message: 'Document not found.'
    });
  } catch (err: any) {
    console.error('[FileController] downloadFileHandler error:', err);
    return res.status(500).json({
      success: false,
      error: 'FILE_VIEW_ERROR',
      message: err.message || 'Failed to download file.'
    });
  }
};

/**
 * GET /api/files/entity/:entityType/:entityId
 * Returns list of attachments for a specific business entity (e.g. customer, loan).
 */
export const getEntityAttachmentsHandler = async (req: Request, res: Response) => {
  try {
    const { entityType, entityId } = req.params;

    const attachments = await FileAttachmentModel.find({
      entityType: entityType.toLowerCase().trim(),
      entityId: sanitizeIdentifier(entityId),
      isDeleted: { $ne: true }
    });

    const mapped = attachments.map((att: any) => ({
      ...att,
      viewUrl: `/api/files/${att.fileId}/view`,
      downloadUrl: `/api/files/${att.fileId}/download`
    }));

    return res.json({
      success: true,
      data: mapped,
      count: mapped.length
    });
  } catch (err: any) {
    console.error('[FileController] getEntityAttachmentsHandler error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to retrieve entity attachments.'
    });
  }
};

/**
 * DELETE /api/files/:id
 * Deletes a file attachment from Telegram storage and marks record deleted.
 */
export const deleteAttachmentHandler = async (req: Request, res: Response) => {
  try {
    const targetId = req.params.id;
    const user = (req as any).user;

    const attachment = await FileAttachmentModel.findOne({
      $or: [{ fileId: targetId }, { telegramFileId: targetId }]
    });

    if (!attachment) {
      return res.status(404).json({
        success: false,
        message: 'File attachment not found.'
      });
    }

    // Delete message from Telegram chat
    if (attachment.telegramMessageId) {
      await telegramStorageService.deleteFile(attachment.telegramMessageId, attachment.telegramChatId);
    }

    // Mark deleted in persistence
    await FileAttachmentModel.updateOne(
      { fileId: attachment.fileId },
      {
        $set: {
          isDeleted: true,
          deletedAt: new Date().toISOString(),
          deletedBy: user?.email || user?.id || 'USER'
        }
      }
    );

    return res.json({
      success: true,
      message: 'File attachment deleted successfully from Telegram storage.',
      fileId: attachment.fileId
    });
  } catch (err: any) {
    console.error('[FileController] deleteAttachmentHandler error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to delete file attachment.'
    });
  }
};

/**
 * GET /api/files/health
 * Returns Telegram Document Storage health and connection status
 */
export const checkStorageHealthHandler = async (_req: Request, res: Response) => {
  try {
    const health = await telegramStorageService.checkHealth();
    return res.json({
      success: health.success,
      data: health
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: err?.message || 'Telegram storage health check failed'
    });
  }
};

export const checkDriveHealthHandler = checkStorageHealthHandler;
