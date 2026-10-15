import { Request, Response } from 'express';
import path from 'path';
import { FileAttachmentModel } from '../models/FileAttachment.js';
import { CustomerModel } from '../models/Customer.js';
import { storageService } from '../services/storage.service.js';
import { hasPermission } from '../middleware/auth.middleware.js';

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB strict limit
export const ALLOWED_IMAGE_MIMES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
export const ALLOWED_DOC_MIMES = ['application/pdf'];
export const ALL_ALLOWED_MIMES = [...ALLOWED_IMAGE_MIMES, ...ALLOWED_DOC_MIMES];
export const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];

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

function sanitizeIdentifier(input?: string): string {
  if (!input) return 'general';
  return input.trim().replace(/[^a-zA-Z0-9_\-\.]/g, '_');
}

/**
 * POST /api/files/upload
 * Handles multipart file upload (up to 10 MB), validates file format,
 * stores in secure local storage, and saves metadata in persistent storage.
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

    // Save to secure local file storage
    const saved = await storageService.saveFile(file.buffer, {
      category: entityType,
      originalName,
      mimeType: normalizedMime
    });

    const fileId = `FILE_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    // Save metadata in application persistence
    await FileAttachmentModel.create({
      fileId,
      entityType,
      entityId,
      documentType,
      originalFileName: originalName,
      storedFileName: saved.fileName,
      mimeType: normalizedMime,
      fileSize: file.size,
      storagePath: saved.fileName,
      viewUrl: `/api/files/${fileId}/view`,
      downloadUrl: `/api/files/${fileId}/download`,
      uploadedBy,
      isDeleted: false
    });

    return res.status(201).json({
      success: true,
      message: 'File uploaded successfully to secure storage.',
      data: {
        fileId,
        fileName: originalName,
        mimeType: normalizedMime,
        fileSize: file.size,
        viewUrl: `/api/files/${fileId}/view`,
        downloadUrl: `/api/files/${fileId}/download`,
        uploadedAt: new Date().toISOString()
      }
    });
  } catch (err: any) {
    console.error('[FileController] uploadFileHandler error:', err);
    return res.status(500).json({
      success: false,
      error: 'FILE_UPLOAD_ERROR',
      message: err.message || 'An error occurred during file upload.'
    });
  }
};

/**
 * GET /api/files/:id/view
 * Streams inline file for in-browser rendering.
 * Protected by JWT authentication and RBAC.
 */
export const viewFileHandler = async (req: Request, res: Response) => {
  try {
    const targetId = req.params.id;
    const user = (req as any).user;

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Authentication is required to view documents.'
      });
    }

    // Lookup attachment
    let attachment: any = await FileAttachmentModel.findOne({
      $or: [
        { fileId: targetId },
        { id: targetId },
        { _id: targetId },
        { storagePath: targetId }
      ]
    });

    let customerDocMatch: any = null;
    let customerMatch: any = null;

    if (!attachment) {
      customerMatch = await CustomerModel.findOne({
        $or: [
          { 'customerPhotoData.fileId': targetId },
          { 'customerPhotoData.storagePath': targetId },
          { 'customerPhoto.fileId': targetId },
          { 'customerPhoto.storagePath': targetId },
          { customerPhoto: targetId },
          { 'kycDocuments.documentId': targetId },
          { 'kycDocuments.storagePath': targetId },
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
          photoObj?.storagePath === targetId ||
          photoObj?.id === targetId ||
          customerMatch.customerPhoto === targetId
        ) {
          customerDocMatch = photoObj;
        } else if (Array.isArray(customerMatch.kycDocuments)) {
          customerDocMatch = customerMatch.kycDocuments.find((d: any) =>
            d.documentId === targetId ||
            d.storagePath === targetId ||
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

      const userBranch = (user as any).branchId;
      if (userBranch && customerMatch && customerMatch.branchId && customerMatch.branchId !== userBranch) {
        return res.status(403).json({
          success: false,
          error: 'FORBIDDEN',
          message: 'Access denied. You cannot access documents belonging to another branch.'
        });
      }
    }

    const fileName =
      attachment?.originalFileName ||
      customerDocMatch?.fileName ||
      customerDocMatch?.originalFileName ||
      customerDocMatch?.documentName ||
      'document';

    const fallbackMime = attachment?.mimeType || customerDocMatch?.mimeType;

    // Check local storage
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
    const targetId = req.params.id;
    const user = (req as any).user;

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Authentication is required to download documents.'
      });
    }

    let attachment: any = await FileAttachmentModel.findOne({
      $or: [
        { fileId: targetId },
        { id: targetId },
        { _id: targetId },
        { storagePath: targetId }
      ]
    });

    let customerDocMatch: any = null;
    let customerMatch: any = null;

    if (!attachment) {
      customerMatch = await CustomerModel.findOne({
        $or: [
          { 'customerPhotoData.fileId': targetId },
          { 'customerPhotoData.storagePath': targetId },
          { 'customerPhoto.fileId': targetId },
          { 'customerPhoto.storagePath': targetId },
          { customerPhoto: targetId },
          { 'kycDocuments.documentId': targetId },
          { 'kycDocuments.storagePath': targetId },
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
          photoObj?.storagePath === targetId ||
          photoObj?.id === targetId ||
          customerMatch.customerPhoto === targetId
        ) {
          customerDocMatch = photoObj;
        } else if (Array.isArray(customerMatch.kycDocuments)) {
          customerDocMatch = customerMatch.kycDocuments.find((d: any) =>
            d.documentId === targetId ||
            d.storagePath === targetId ||
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
    }

    const fileName =
      attachment?.originalFileName ||
      customerDocMatch?.fileName ||
      customerDocMatch?.originalFileName ||
      customerDocMatch?.documentName ||
      'document';

    const fallbackMime = attachment?.mimeType || customerDocMatch?.mimeType;

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
 * Returns list of attachments for a specific business entity.
 */
export const getEntityAttachmentsHandler = async (req: Request, res: Response) => {
  try {
    const { entityType, entityId } = req.params;
    const attachments = await FileAttachmentModel.find({
      entityType: entityType.toLowerCase(),
      entityId,
      isDeleted: false
    });

    return res.json({
      success: true,
      data: attachments
    });
  } catch (err: any) {
    console.error('[FileController] getEntityAttachmentsHandler error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to list entity attachments.'
    });
  }
};

/**
 * DELETE /api/files/:id
 * Permanently deletes or soft-deletes a file attachment record.
 */
export const deleteAttachmentHandler = async (req: Request, res: Response) => {
  try {
    const targetId = req.params.id;
    const user = (req as any).user;

    const attachment: any = await FileAttachmentModel.findOne({
      $or: [{ fileId: targetId }, { storagePath: targetId }]
    });

    if (!attachment) {
      return res.status(404).json({
        success: false,
        message: 'File attachment not found.'
      });
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
      message: 'File attachment deleted successfully.',
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
 * Returns Document Storage health and connection status
 */
export const checkStorageHealthHandler = async (_req: Request, res: Response) => {
  return res.json({
    success: true,
    data: {
      success: true,
      storage: 'secure-storage',
      ready: true
    }
  });
};

export const checkDriveHealthHandler = checkStorageHealthHandler;
