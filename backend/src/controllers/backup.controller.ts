import { Request, Response } from 'express';
import { backupService } from '../services/backup.service.js';
import { backupCloseService } from '../services/backupClose.service.js';
import { systemRestoreService } from '../services/systemRestore.service.js';
import { syncQueueService } from '../services/syncQueue.service.js';

export const createBackup = async (req: Request, res: Response) => {
  try {
    const { backupData, deviceId } = req.body || {};
    const result = await backupService.createCloudBackup(backupData, deviceId);

    return res.status(200).json({
      success: true,
      message: 'Backup created successfully',
      fileId: result.driveFileId,
      verified: true,
      data: result
    });
  } catch (err: any) {
    console.error('[BackupController] Error creating backup:', err?.message || err);
    return res.status(500).json({
      success: false,
      error: 'BACKUP_FAILED',
      message: err?.message || 'Failed to create backup'
    });
  }
};

/**
 * Executes the complete transactional Backup & Close workflow.
 */
export const backupAndCloseSession = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user || {
      userId: req.headers['user-id'] as string || 'STAFF-001',
      name: req.headers['user-name'] as string || 'Staff User',
      role: req.headers['user-role'] as string || 'STAFF'
    };

    const result = await backupCloseService.backupAndClose(user);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        localDataSafe: true,
        message: result.message || 'Backup process failed. Your local data is safe.',
        error: result.error,
        errorCode: result.errorCode
      });
    }

    return res.status(200).json({
      success: true,
      message: result.message,
      data: result
    });
  } catch (err: any) {
    console.error('[BackupController] backupAndCloseSession error:', err);
    return res.status(500).json({
      success: false,
      localDataSafe: true,
      message: 'Backup process failed. Your local data is safe.',
      error: err?.message || 'Backup & Close process failed'
    });
  }
};

/**
 * On App Startup: checks local database status.
 */
export const checkAutoRestore = async (req: Request, res: Response) => {
  try {
    const status = systemRestoreService.checkOperationalDatabaseStatus();
    return res.json({
      success: true,
      isEmpty: status.isEmpty,
      counts: status.counts
    });
  } catch (err: any) {
    console.error('[BackupController] checkAutoRestore error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to verify database status.',
      error: err?.message || err
    });
  }
};

/**
 * Sync Queue Endpoints
 */
export const getSyncStatus = (req: Request, res: Response) => {
  const status = syncQueueService.getSyncStatus();
  return res.json({ success: true, data: status });
};

export const retrySyncQueue = async (req: Request, res: Response) => {
  const result = await syncQueueService.retryPendingEvents();
  return res.json({ success: true, ...result });
};

export const getSyncEvents = (req: Request, res: Response) => {
  const events = syncQueueService.getOutboxEvents();
  return res.json({ success: true, data: events });
};

export const exportBackup = (req: Request, res: Response) => {
  const result = backupService.exportBackup();
  return res.json({
    success: true,
    message: 'Backup exported successfully',
    data: result
  });
};

export const restoreBackup = (req: Request, res: Response) => {
  const restored = backupService.restoreBackup(req.body);
  if (!restored) {
    return res.status(400).json({ success: false, message: 'Failed to restore backup. Invalid JSON schema.' });
  }
  return res.json({ success: true, message: 'System state restored successfully from backup.' });
};

export const listBackups = (req: Request, res: Response) => {
  const backups = backupService.listBackups();
  return res.json({ success: true, data: backups });
};
