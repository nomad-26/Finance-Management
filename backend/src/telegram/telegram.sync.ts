import crypto from 'crypto';
import { telegramClient } from './telegram.client.js';
import { telegramCache } from './telegram.cache.js';
import { TelegramParser } from './telegram.parser.js';
import { TelegramMessage } from './telegram.types.js';

export class TelegramSyncService {
  private isSyncing = false;
  private isPublishing = false;
  private lastSyncedMessageId: number = 0;
  private lastSyncedVersion: number = 0;
  private lastSyncedGeneratedAt: string = '';
  private lastHighestMessageId: number = 0;
  private lastContentHash: string = '';
  private missingMessageIds: Set<number> = new Set();
  private syncTimer: NodeJS.Timeout | null = null;
  private publishDebounceTimer: NodeJS.Timeout | null = null;

  /**
   * Computes a SHA-256 hash for snapshot idempotency
   */
  private computeHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Processes an incoming raw Telegram message and ingests it into cache if valid and newer than snapshot
   */
  public ingestMessage(msg?: TelegramMessage, minTimestamp?: string): boolean {
    if (!msg) return false;

    const rawContent = msg.text || msg.caption;
    if (!rawContent) return false;

    const envelope = TelegramParser.parse(rawContent);
    if (!envelope) return false;

    // Filter by timestamp: do not ingest deltas older than or equal to minimum baseline
    const effectiveMinTime = minTimestamp || this.lastSyncedGeneratedAt;
    if (effectiveMinTime && new Date(envelope.updatedAt).getTime() <= new Date(effectiveMinTime).getTime()) {
      return false;
    }

    const existing = telegramCache.getRecord(envelope.type, envelope.id, true);
    if (existing) {
      // Deterministically accept higher version or newer updatedAt
      if (envelope.version > existing.version) {
        telegramCache.setRecord(envelope, msg.message_id, true);
        return true;
      } else if (
        envelope.version === existing.version &&
        new Date(envelope.updatedAt).getTime() > new Date(existing.updatedAt).getTime()
      ) {
        telegramCache.setRecord(envelope, msg.message_id, true);
        return true;
      }
      return false;
    }

    // If no existing record in cache, do not ingest if older than last synced snapshot baseline
    if (this.lastSyncedGeneratedAt && new Date(envelope.updatedAt).getTime() <= new Date(this.lastSyncedGeneratedAt).getTime()) {
      return false;
    }

    telegramCache.setRecord(envelope, msg.message_id, true);
    return true;
  }

  /**
   * Publishes a full database snapshot document to Telegram shared storage
   */
  public async publishSnapshot(forcedVersion?: number): Promise<{ success: boolean; messageId?: number; version?: number }> {
    if (this.isPublishing || !telegramClient.isConfigured()) {
      return { success: false };
    }

    this.isPublishing = true;
    try {
      const snapshot = telegramCache.generateSnapshot(forcedVersion);
      const jsonStr = JSON.stringify(snapshot, null, 2);
      const contentHash = this.computeHash(JSON.stringify(snapshot.entities));

      // Skip publishing if snapshot payload content is completely unchanged and not forced
      if (!forcedVersion && this.lastContentHash === contentHash && this.lastSyncedMessageId > 0) {
        this.isPublishing = false;
        return { success: true, messageId: this.lastSyncedMessageId, version: this.lastSyncedVersion };
      }

      const buffer = Buffer.from(jsonStr, 'utf-8');

      const caption = `🏷️ KKV_GOLD_FINANCE_DB_SNAPSHOT\n` +
        `VERSION: ${snapshot.version}\n` +
        `RECORDS: ${snapshot.totalRecords}\n` +
        `HASH: ${contentHash.substring(0, 16)}\n` +
        `UPDATED_AT: ${snapshot.generatedAt}`;

      const res = await telegramClient.sendDocument(buffer, 'kkv_gold_finance_db_snapshot.json', caption);

      if (res.ok && res.result?.message_id) {
        this.lastSyncedMessageId = res.result.message_id;
        this.lastHighestMessageId = res.result.message_id;
        this.lastSyncedVersion = snapshot.version;
        this.lastSyncedGeneratedAt = snapshot.generatedAt;
        this.lastContentHash = contentHash;
        console.log(`[TelegramSync] 📤 Published database snapshot v${snapshot.version} (${snapshot.totalRecords} records) to Telegram`);
        this.isPublishing = false;
        return { success: true, messageId: res.result.message_id, version: snapshot.version };
      } else {
        console.warn('[TelegramSync] Snapshot upload notice:', res.description || 'Upload pending');
      }
    } catch (err: any) {
      console.warn('[TelegramSync] Snapshot publishing notice:', err?.message || err);
    } finally {
      this.isPublishing = false;
    }

    return { success: false };
  }

  /**
   * Schedules a debounced snapshot publish after local mutations (waits 1500ms for batch mutations)
   */
  public scheduleSnapshotPublish(): void {
    if (this.publishDebounceTimer) {
      clearTimeout(this.publishDebounceTimer);
    }

    this.publishDebounceTimer = setTimeout(() => {
      this.publishDebounceTimer = null;
      this.publishSnapshot().catch(() => {});
    }, 1500);
  }

  /**
   * Polls and syncs authoritative state from Telegram shared storage
   */
  public async syncFromTelegram(): Promise<{ success: boolean; processed: number; version: number }> {
    if (this.isSyncing || !telegramClient.isConfigured()) {
      return { success: false, processed: 0, version: this.lastSyncedVersion };
    }

    this.isSyncing = true;
    let processedCount = 0;

    try {
      // 1. Get latest channel message ID or use highest tracked message ID
      let highestId = await telegramClient.getLatestMessageId();
      if (!highestId || highestId <= 0) {
        highestId = this.lastHighestMessageId || this.lastSyncedMessageId;
      }

      if (!highestId || highestId <= 0) {
        this.isSyncing = false;
        return { success: false, processed: 0, version: this.lastSyncedVersion };
      }

      // If highest message ID has not changed and we already have a synced snapshot, skip scan
      if (highestId <= this.lastHighestMessageId && this.lastSyncedMessageId > 0 && this.lastContentHash) {
        this.isSyncing = false;
        return { success: true, processed: 0, version: this.lastSyncedVersion };
      }
      this.lastHighestMessageId = Math.max(this.lastHighestMessageId, highestId);

      // 2. Scan backwards from highestId to find the latest Snapshot document
      const maxScan = 30;
      const minId = Math.max(1, highestId - maxScan);
      let snapshotMsgId = 0;
      let snapshotMetaTime = this.lastSyncedGeneratedAt;
      const probeCache: Map<number, TelegramMessage> = new Map();

      for (let msgId = highestId; msgId >= minId; msgId--) {
        // Skip message IDs already known to be missing / deleted to prevent error spam
        if (this.missingMessageIds.has(msgId)) {
          continue;
        }

        try {
          const fwd = await telegramClient.forwardMessage(msgId);
          if (fwd.ok && fwd.result) {
            const probeMsg = fwd.result;
            const probeFwdId = probeMsg.message_id;

            // Immediately delete temporary forwarded message
            if (probeFwdId) {
              telegramClient.deleteMessage(probeFwdId).catch(() => {});
            }

            probeCache.set(msgId, probeMsg);

            // Check if this is a Database Snapshot document
            if (probeMsg.document && (
              probeMsg.document.file_name === 'kkv_gold_finance_db_snapshot.json' ||
              (probeMsg.caption && probeMsg.caption.includes('KKV_GOLD_FINANCE_DB_SNAPSHOT'))
            )) {
              const fileId = probeMsg.document.file_id;
              if (fileId) {
                const fileMeta = await telegramClient.getFile(fileId);
                if (fileMeta.ok && fileMeta.result?.file_path) {
                  const buf = await telegramClient.downloadFileBuffer(fileMeta.result.file_path);
                  const rawJson = buf.toString('utf-8');
                  const snapshot = JSON.parse(rawJson);

                  if (snapshot && snapshot.app === 'KKV_GOLD_FINANCE' && snapshot.entities) {
                    snapshotMsgId = msgId;
                    snapshotMetaTime = snapshot.generatedAt || '';
                    const incomingHash = this.computeHash(JSON.stringify(snapshot.entities));

                    if (
                      snapshot.version > this.lastSyncedVersion ||
                      (snapshot.version === this.lastSyncedVersion && incomingHash !== this.lastContentHash)
                    ) {
                      const result = telegramCache.hydrateFromSnapshot(snapshot);
                      this.lastSyncedVersion = snapshot.version || 1;
                      this.lastSyncedGeneratedAt = snapshotMetaTime;
                      this.lastSyncedMessageId = msgId;
                      this.lastContentHash = incomingHash;
                      processedCount += (result.imported + result.updated + result.removed);
                      console.log(`[TelegramSync] 📥 Hydrated database snapshot v${snapshot.version} (${result.imported} imported, ${result.updated} updated, ${result.removed} removed) from message #${msgId}`);
                    } else {
                      this.lastSyncedMessageId = msgId;
                    }
                    break; // Latest snapshot hydrated; stop searching backwards
                  }
                }
              }
            }
          } else {
            // Mark missing/deleted message ID in cache so we never re-probe it
            const desc = (fwd.description || '').toLowerCase();
            if (desc.includes('not found') || desc.includes('invalid') || desc.includes('cant be forwarded') || desc.includes("can't be forwarded")) {
              this.missingMessageIds.add(msgId);
              if (this.missingMessageIds.size > 200) {
                // Keep set bounded
                const arr = Array.from(this.missingMessageIds);
                this.missingMessageIds = new Set(arr.slice(-100));
              }
            }
          }
        } catch {
          // Continue scan
        }
      }

      // 3. Ingest any subsequent delta envelopes created AFTER the snapshot (msgId > snapshotMsgId)
      const startDeltaId = snapshotMsgId > 0 ? snapshotMsgId + 1 : minId;
      for (let deltaId = startDeltaId; deltaId <= highestId; deltaId++) {
        const cachedMsg = probeCache.get(deltaId);
        if (cachedMsg && (cachedMsg.text || cachedMsg.caption)) {
          const ingested = this.ingestMessage(cachedMsg, snapshotMetaTime);
          if (ingested) {
            processedCount++;
          }
        }
      }

      this.isSyncing = false;
      return { success: true, processed: processedCount, version: this.lastSyncedVersion };
    } catch (err: any) {
      this.isSyncing = false;
      console.warn('[TelegramSync] Sync notice:', err?.message || err);
      return { success: false, processed: processedCount, version: this.lastSyncedVersion };
    }
  }

  /**
   * Alias for syncFromTelegram
   */
  public async syncUpdates() {
    return this.syncFromTelegram();
  }

  /**
   * Starts periodic background synchronization so multi-PC updates flow automatically
   */
  public startPeriodicSync(intervalMs: number = 15000): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }

    // Immediate initial sync
    this.syncFromTelegram().catch(() => {});

    this.syncTimer = setInterval(() => {
      this.syncFromTelegram().catch(() => {});
    }, intervalMs);

    console.log(`[TelegramSync] Multi-PC periodic sync started (interval: ${intervalMs / 1000}s)`);
  }

  /**
   * Stops periodic sync
   */
  public stopPeriodicSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    if (this.publishDebounceTimer) {
      clearTimeout(this.publishDebounceTimer);
      this.publishDebounceTimer = null;
    }
  }

  public getSyncState() {
    return {
      lastSyncedMessageId: this.lastSyncedMessageId,
      lastSyncedVersion: this.lastSyncedVersion,
      isSyncing: this.isSyncing,
      isPublishing: this.isPublishing
    };
  }
}

export const telegramSyncService = new TelegramSyncService();
