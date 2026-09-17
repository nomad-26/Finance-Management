import { Router } from 'express';
import {
  createBackup,
  exportBackup,
  restoreBackup,
  listBackups,
  backupAndCloseSession,
  checkAutoRestore,
  getSyncStatus,
  retrySyncQueue,
  getSyncEvents
} from '../controllers/backup.controller.js';
import { authenticateUser, authorizeRoles } from '../middleware/auth.middleware.js';

const router = Router();

router.use(authenticateUser);

// Transactional Backup & Close and Startup Auto-Restore
router.post('/close', authorizeRoles('ADMIN', 'STAFF'), backupAndCloseSession);
router.post('/backup-and-close', authorizeRoles('ADMIN', 'STAFF'), backupAndCloseSession);
router.get('/auto-restore-check', authorizeRoles('ADMIN'), checkAutoRestore);

// Incremental Sync Queue
router.get('/sync/status', authorizeRoles('ADMIN', 'STAFF'), getSyncStatus);
router.post('/sync/retry', authorizeRoles('ADMIN'), retrySyncQueue);
router.get('/sync/events', authorizeRoles('ADMIN'), getSyncEvents);

// Admin Backup Operations
router.post('/create', authorizeRoles('ADMIN'), createBackup);
router.get('/export', authorizeRoles('ADMIN'), exportBackup);
router.post('/restore', authorizeRoles('ADMIN'), restoreBackup);
router.get('/list', authorizeRoles('ADMIN'), listBackups);

export default router;
