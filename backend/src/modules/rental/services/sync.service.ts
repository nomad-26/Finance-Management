import { rentalRepository } from '../repositories/rental.repository.js';
import { googleSheetsService } from '../integrations/googleSheets.service.js';
import { SyncQueueItem } from '../types/rental.types.js';

export class SyncService {
  private isProcessing: boolean = false;

  constructor() {
    // Optionally schedule periodic sync retry every 5 minutes
    setInterval(() => {
      this.processQueue().catch((err) => console.warn('[SyncService] Background sync error:', err));
    }, 5 * 60 * 1000);
  }

  public async enqueue(
    entityType: 'Complex' | 'Shop' | 'RentPayment' | 'Expense' | 'AuditLog',
    entityId: string,
    operation: 'CREATE' | 'UPDATE' | 'DELETE',
    payload: any
  ): Promise<SyncQueueItem> {
    const item: SyncQueueItem = {
      id: rentalRepository.nextSyncId(),
      entityType,
      entityId,
      operation,
      payload,
      status: 'PENDING',
      attempts: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    rentalRepository.enqueueSync(item);

    // Trigger asynchronous non-blocking process
    setImmediate(() => {
      this.processQueue().catch((err) => console.warn('[SyncService] Queue processing error:', err));
    });

    return item;
  }

  public async processQueue(): Promise<{ processed: number; succeeded: number; failed: number }> {
    if (this.isProcessing) return { processed: 0, succeeded: 0, failed: 0 };
    this.isProcessing = true;

    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    try {
      const items = rentalRepository.getPendingSyncItems();
      for (const item of items) {
        processed++;
        item.attempts += 1;
        item.updatedAt = new Date().toISOString();

        let res: { success: boolean; error?: string } = { success: false, error: 'Not executed' };

        try {
          switch (item.entityType) {
            case 'Complex':
              res = await googleSheetsService.syncComplex(item.payload);
              break;
            case 'Shop':
              res = await googleSheetsService.syncShop(item.payload);
              break;
            case 'RentPayment':
              res = await googleSheetsService.syncPayment(item.payload);
              break;
            case 'Expense':
              res = await googleSheetsService.syncExpense(item.payload);
              break;
            case 'AuditLog':
              res = await googleSheetsService.syncAuditLog(item.payload);
              break;
          }
        } catch (err: any) {
          res = { success: false, error: err.message || 'Execution failed' };
        }

        if (res.success) {
          succeeded++;
          item.status = 'SYNCED';
          item.lastError = undefined;
          this.updateEntitySyncStatus(item.entityType, item.entityId, 'SYNCED');
        } else {
          failed++;
          item.status = item.attempts >= 5 ? 'FAILED' : 'PENDING';
          item.lastError = res.error;
          item.nextRetryAt = new Date(Date.now() + Math.min(60 * 60 * 1000, Math.pow(2, item.attempts) * 60 * 1000)).toISOString();
          this.updateEntitySyncStatus(item.entityType, item.entityId, item.status, res.error);
        }

        rentalRepository.updateSyncItem(item);
      }
    } finally {
      this.isProcessing = false;
    }

    return { processed, succeeded, failed };
  }

  private updateEntitySyncStatus(
    entityType: string,
    entityId: string,
    status: 'SYNCED' | 'PENDING' | 'FAILED',
    error?: string
  ): void {
    const now = new Date().toISOString();
    switch (entityType) {
      case 'Complex': {
        const c = rentalRepository.getComplexById(entityId);
        if (c) {
          c.syncStatus = status;
          if (status === 'SYNCED') c.lastSyncedAt = now;
          if (error) c.syncError = error;
          rentalRepository.saveComplex(c);
        }
        break;
      }
      case 'Shop': {
        const s = rentalRepository.getShopById(entityId);
        if (s) {
          s.syncStatus = status;
          if (status === 'SYNCED') s.lastSyncedAt = now;
          if (error) s.syncError = error;
          rentalRepository.saveShop(s);
        }
        break;
      }
      case 'RentPayment': {
        const p = rentalRepository.getPaymentById(entityId);
        if (p) {
          p.syncStatus = status;
          if (status === 'SYNCED') p.lastSyncedAt = now;
          if (error) p.syncError = error;
          rentalRepository.savePayment(p);
        }
        break;
      }
      case 'Expense': {
        const e = rentalRepository.getExpenseById(entityId);
        if (e) {
          e.syncStatus = status;
          if (status === 'SYNCED') e.lastSyncedAt = now;
          if (error) e.syncError = error;
          rentalRepository.saveExpense(e);
        }
        break;
      }
    }
  }

  public getSyncSummary() {
    const queue = rentalRepository.getSyncQueue();
    const pending = queue.filter((q) => q.status === 'PENDING').length;
    const synced = queue.filter((q) => q.status === 'SYNCED').length;
    const failed = queue.filter((q) => q.status === 'FAILED').length;
    return {
      total: queue.length,
      pending,
      synced,
      failed,
      isConfigured: googleSheetsService.isReady(),
      spreadsheetId: googleSheetsService.getSpreadsheetId()
    };
  }
}

export const syncService = new SyncService();
