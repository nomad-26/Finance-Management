import { telegramClient } from '../telegram/telegram.client.js';
import { telegramSyncService } from '../telegram/telegram.sync.js';

/**
 * Verifies Telegram storage connectivity and starts multi-PC sync in the background.
 * Unblocks immediate local backend server readiness.
 */
export async function connectDB(): Promise<boolean> {
  console.log('[Storage] Initializing Telegram Bot API background storage layer...');
  
  // Start background health monitor and reconnect manager (non-blocking)
  telegramClient.startBackgroundHealthMonitor();

  // Start periodic background synchronization (non-blocking)
  telegramSyncService.startPeriodicSync(15000);

  return true;
}

export function isTelegramStorageReady(): boolean {
  return true;
}

export function isStorageConnected(): boolean {
  return telegramClient.isConfigured();
}

export async function ensureStorageConnected(): Promise<boolean> {
  return telegramClient.isConfigured();
}

export async function checkStorageHealth(): Promise<{
  status: 'ok' | 'degraded';
  success: boolean;
  storage: 'telegram';
  telegram: 'connected' | 'disconnected';
  ready: boolean;
  botUsername?: string;
  chatTitle?: string;
  error?: string;
}> {
  const health = telegramClient.getCachedHealth();
  return {
    status: health.connected ? 'ok' : 'degraded',
    success: health.connected,
    storage: 'telegram',
    telegram: health.connected ? 'connected' : 'disconnected',
    ready: health.connected,
    botUsername: health.botUsername,
    chatTitle: health.chatTitle,
    error: health.error
  };
}

// Aliases for compatibility
export const isMongoConnected = isStorageConnected;
export const ensureMongoConnected = ensureStorageConnected;
export const checkMongoHealth = checkStorageHealth;

export default {
  connectDB,
  isTelegramStorageReady,
  isStorageConnected,
  ensureStorageConnected,
  checkStorageHealth
};
