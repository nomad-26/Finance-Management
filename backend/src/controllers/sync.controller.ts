import { Request, Response } from 'express';
import { telegramSyncService } from '../telegram/telegram.sync.js';
import { telegramClient } from '../telegram/telegram.client.js';
import { telegramCache } from '../telegram/telegram.cache.js';
import { localAuthService } from '../services/localAuth.service.js';

export class SyncController {
  /**
   * Triggers an immediate pull from Telegram storage
   */
  public async pullSync(req: Request, res: Response): Promise<void> {
    try {
      const result = await telegramSyncService.syncFromTelegram();
      // Ensure local users are updated
      localAuthService.getAllUsers();

      res.json({
        success: result.success,
        processed: result.processed,
        version: result.version,
        timestamp: new Date().toISOString(),
        message: result.success
          ? `Synchronization complete. Processed ${result.processed} updates (snapshot v${result.version}).`
          : 'Telegram synchronization returned no new updates or is temporarily offline.'
      });
    } catch (err: any) {
      console.warn('[SyncController] Pull sync error:', err?.message || err);
      res.status(500).json({
        success: false,
        error: 'SYNC_ERROR',
        message: err?.message || 'Error during synchronization with Telegram storage.'
      });
    }
  }

  /**
   * Publishes the current local database state as a new snapshot to Telegram
   */
  public async pushSnapshot(req: Request, res: Response): Promise<void> {
    try {
      const result = await telegramSyncService.publishSnapshot();
      res.json({
        success: result.success,
        version: result.version,
        messageId: result.messageId,
        timestamp: new Date().toISOString(),
        message: result.success
          ? `Database snapshot v${result.version} published to Telegram successfully.`
          : 'Failed to publish database snapshot to Telegram.'
      });
    } catch (err: any) {
      console.warn('[SyncController] Push snapshot error:', err?.message || err);
      res.status(500).json({
        success: false,
        error: 'SNAPSHOT_ERROR',
        message: err?.message || 'Error publishing snapshot to Telegram.'
      });
    }
  }

  /**
   * Returns current sync status
   */
  public getStatus(req: Request, res: Response): void {
    const health = telegramClient.getCachedHealth();
    const syncState = telegramSyncService.getSyncState();
    const totalRecords = telegramCache.generateSnapshot().totalRecords;

    res.json({
      success: true,
      service: 'kkv-gold-finance-sync',
      telegram: {
        configured: health.configured,
        connected: health.connected,
        status: health.status,
        botUsername: health.botUsername,
        chatTitle: health.chatTitle
      },
      sync: {
        lastSyncedVersion: syncState.lastSyncedVersion,
        lastSyncedMessageId: syncState.lastSyncedMessageId,
        isSyncing: syncState.isSyncing,
        isPublishing: syncState.isPublishing,
        totalCachedRecords: totalRecords
      },
      timestamp: new Date().toISOString()
    });
  }
}

export const syncController = new SyncController();
