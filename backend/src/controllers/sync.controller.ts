import { Request, Response } from 'express';
import { firestoreRepository } from '../repositories/firestore.repository.js';
import { firebaseConfig } from '../config/firebase.js';
import { localAuthService } from '../services/localAuth.service.js';

export class SyncController {
  /**
   * Triggers an immediate synchronization from Cloud Firestore
   */
  public async pullSync(req: Request, res: Response): Promise<void> {
    try {
      await firestoreRepository.syncWithFirestore();
      // Ensure local users are updated
      localAuthService.getAllUsers();

      res.json({
        success: true,
        database: 'firestore',
        projectId: firebaseConfig.projectId,
        timestamp: new Date().toISOString(),
        message: 'Cloud Firestore synchronization complete.'
      });
    } catch (err: any) {
      console.warn('[SyncController] Pull sync error:', err?.message || err);
      res.status(500).json({
        success: false,
        error: 'SYNC_ERROR',
        message: err?.message || 'Error during synchronization with Cloud Firestore.'
      });
    }
  }

  /**
   * Flushes current local state and syncs with Cloud Firestore
   */
  public async pushSnapshot(req: Request, res: Response): Promise<void> {
    try {
      firestoreRepository.flushToDisk();
      await firestoreRepository.syncWithFirestore();
      res.json({
        success: true,
        database: 'firestore',
        projectId: firebaseConfig.projectId,
        timestamp: new Date().toISOString(),
        message: 'Database synced with Cloud Firestore successfully.'
      });
    } catch (err: any) {
      console.warn('[SyncController] Push sync error:', err?.message || err);
      res.status(500).json({
        success: false,
        error: 'SNAPSHOT_ERROR',
        message: err?.message || 'Error synchronizing with Cloud Firestore.'
      });
    }
  }

  /**
   * Returns current database sync status
   */
  public getStatus(req: Request, res: Response): void {
    const isConnected = firestoreRepository.checkConnection();
    res.json({
      success: true,
      service: 'kkv-gold-finance-firestore',
      database: 'Cloud Firestore',
      projectId: firebaseConfig.projectId,
      connected: isConnected,
      timestamp: new Date().toISOString()
    });
  }
}

export const syncController = new SyncController();
