import { env } from '../config/env.js';
import { TelegramApiResponse, TelegramMessage, TelegramUpdate } from './telegram.types.js';

export interface TelegramHealthStatus {
  configured: boolean;
  connected: boolean;
  status: 'connected' | 'degraded' | 'untested';
  botUsername?: string;
  chatTitle?: string;
  error?: string;
  lastCheckedAt?: string;
}

export class TelegramClient {
  private get botToken(): string {
    return (env.TELEGRAM_BOT_TOKEN || '').trim();
  }

  private get defaultChatId(): string {
    return (env.TELEGRAM_CHAT_ID || '').trim();
  }

  private get baseUrl(): string {
    return `https://api.telegram.org/bot${this.botToken}`;
  }

  // Cached health state for instant non-blocking query
  private cachedHealth: TelegramHealthStatus = {
    configured: false,
    connected: false,
    status: 'untested'
  };

  private reconnectTimer: NodeJS.Timeout | null = null;
  private periodicTimer: NodeJS.Timeout | null = null;
  private backoffIndex = 0;
  private isChecking = false;
  private readonly backoffSchedule = [2000, 5000, 10000, 20000, 30000];

  constructor() {
    this.cachedHealth.configured = this.isConfigured();
  }

  public isConfigured(): boolean {
    return Boolean(this.botToken && this.defaultChatId);
  }

  public isConnected(): boolean {
    return this.cachedHealth.connected;
  }

  public getCachedHealth(): TelegramHealthStatus {
    this.cachedHealth.configured = this.isConfigured();
    return { ...this.cachedHealth };
  }

  /**
   * Generic safe Telegram API fetch with rate-limiting, bounded retries, and clean logging
   */
  private async request<T>(
    endpoint: string,
    body?: any,
    options: { method?: string; isFormData?: boolean; maxRetries?: number; timeoutMs?: number } = {}
  ): Promise<TelegramApiResponse<T>> {
    if (!this.botToken) {
      return {
        ok: false,
        description: 'TELEGRAM_BOT_TOKEN is not configured in backend environment.'
      };
    }

    const method = options.method || (body ? 'POST' : 'GET');
    const maxRetries = options.maxRetries ?? 2;
    const timeoutMs = options.timeoutMs ?? 10000;
    let attempt = 0;

    while (attempt < maxRetries) {
      attempt++;
      try {
        const url = `${this.baseUrl}/${endpoint}`;
        const headers: Record<string, string> = {};
        let requestBody: any = undefined;

        if (body) {
          if (options.isFormData) {
            requestBody = body; // FormData handles its own boundary
          } else {
            headers['Content-Type'] = 'application/json';
            requestBody = JSON.stringify(body);
          }
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        const res = await fetch(url, {
          method,
          headers,
          body: requestBody,
          signal: controller.signal
        });
        clearTimeout(timeout);

        const data = (await res.json()) as TelegramApiResponse<T>;

        if (res.status === 429 || data.parameters?.retry_after) {
          const waitSeconds = data.parameters?.retry_after || Math.min(2 ** attempt, 10);
          console.warn(`[Telegram] Rate limit on /${endpoint}. Waiting ${waitSeconds}s...`);
          await new Promise((r) => setTimeout(r, waitSeconds * 1000));
          continue;
        }

        if (!res.ok || !data.ok) {
          const desc = data.description || res.statusText || '';
          const isPermanent =
            res.status === 400 ||
            res.status === 404 ||
            desc.includes('message to forward not found') ||
            desc.includes('MESSAGE_ID_INVALID') ||
            desc.includes('chat not found') ||
            desc.includes('message can\'t be forwarded') ||
            desc.includes('message to delete not found');

          if (isPermanent) {
            // Permanent Telegram error - do not retry
            return data;
          }

          if (attempt >= maxRetries) {
            console.warn(`[Telegram] API notice on /${endpoint}: ${desc}`);
            return data;
          }
          await new Promise((r) => setTimeout(r, 1000 * attempt));
          continue;
        }

        return data;
      } catch (err: any) {
        if (attempt >= maxRetries) {
          const errorMsg = err?.message || 'Connection failed';
          console.warn(`[Telegram] Network unavailable requesting /${endpoint}: ${errorMsg}`);
          console.warn('[Telegram] Backend will continue running.');
          this.cachedHealth.connected = false;
          this.cachedHealth.status = 'degraded';
          this.cachedHealth.error = `Network error: ${errorMsg}`;
          this.scheduleReconnect();
          return {
            ok: false,
            description: `Telegram network error: ${errorMsg}`
          };
        }
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }

    return {
      ok: false,
      description: 'Maximum retry attempts exceeded.'
    };
  }

  /**
   * Verifies bot credentials and connectivity with Telegram (short 5s timeout)
   */
  public async getMe(): Promise<TelegramApiResponse<any>> {
    return this.request<any>('getMe', undefined, { maxRetries: 1, timeoutMs: 5000 });
  }

  /**
   * Verifies chat accessibility
   */
  public async getChat(chatId: string = this.defaultChatId): Promise<TelegramApiResponse<any>> {
    return this.request<any>('getChat', { chat_id: chatId }, { maxRetries: 1, timeoutMs: 5000 });
  }

  /**
   * Sends a structured text message to the storage chat
   */
  public async sendMessage(
    text: string,
    chatId: string = this.defaultChatId,
    extra: { parse_mode?: string; disable_notification?: boolean } = {}
  ): Promise<TelegramApiResponse<TelegramMessage>> {
    return this.request<TelegramMessage>('sendMessage', {
      chat_id: chatId,
      text,
      disable_notification: extra.disable_notification ?? true,
      ...(extra.parse_mode ? { parse_mode: extra.parse_mode } : {})
    });
  }

  /**
   * Edits an existing message text in-place (optimistic update strategy)
   */
  public async editMessageText(
    messageId: number,
    text: string,
    chatId: string = this.defaultChatId,
    extra: { parse_mode?: string } = {}
  ): Promise<TelegramApiResponse<TelegramMessage>> {
    return this.request<TelegramMessage>('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
      ...(extra.parse_mode ? { parse_mode: extra.parse_mode } : {})
    });
  }

  /**
   * Deletes a message from the storage chat (hard delete / cleanup)
   */
  public async deleteMessage(
    messageId: number,
    chatId: string = this.defaultChatId
  ): Promise<TelegramApiResponse<boolean>> {
    return this.request<boolean>('deleteMessage', {
      chat_id: chatId,
      message_id: messageId
    });
  }

  /**
   * Uploads photos directly via Telegram sendPhoto API
   */
  public async sendPhoto(
    fileBuffer: Buffer | Uint8Array,
    fileName: string = 'photo.jpg',
    caption: string = '',
    chatId: string = this.defaultChatId
  ): Promise<TelegramApiResponse<TelegramMessage>> {
    const formData = new FormData();
    formData.append('chat_id', chatId);
    const blob = new Blob([fileBuffer]);
    formData.append('photo', blob, fileName);
    if (caption) {
      formData.append('caption', caption);
    }

    return this.request<TelegramMessage>('sendPhoto', formData, {
      isFormData: true,
      timeoutMs: 15000
    });
  }

  /**
   * Uploads large payloads, KYC documents, or backup archives as documents
   */
  public async sendDocument(
    fileBuffer: Buffer | Uint8Array,
    fileName: string,
    caption: string = '',
    chatId: string = this.defaultChatId
  ): Promise<TelegramApiResponse<TelegramMessage>> {
    const formData = new FormData();
    formData.append('chat_id', chatId);
    const blob = new Blob([fileBuffer]);
    formData.append('document', blob, fileName);
    if (caption) {
      formData.append('caption', caption);
    }

    return this.request<TelegramMessage>('sendDocument', formData, {
      isFormData: true,
      timeoutMs: 20000
    });
  }

  /**
   * Retrieves Telegram file metadata (including file_path) from Telegram Bot API
   */
  public async getFile(fileId: string): Promise<TelegramApiResponse<{
    file_id: string;
    file_unique_id: string;
    file_size?: number;
    file_path?: string;
  }>> {
    return this.request<{
      file_id: string;
      file_unique_id: string;
      file_size?: number;
      file_path?: string;
    }>('getFile', { file_id: fileId }, { timeoutMs: 10000 });
  }

  /**
   * Forwards a message to discover/inspect message content from the storage chat
   */
  public async forwardMessage(
    messageId: number,
    fromChatId: string = this.defaultChatId,
    toChatId: string = this.defaultChatId
  ): Promise<TelegramApiResponse<TelegramMessage>> {
    return this.request<TelegramMessage>('forwardMessage', {
      chat_id: toChatId,
      from_chat_id: fromChatId,
      message_id: messageId,
      disable_notification: true
    }, { maxRetries: 1, timeoutMs: 5000 });
  }

  /**
   * Copies a message
   */
  public async copyMessage(
    messageId: number,
    fromChatId: string = this.defaultChatId,
    toChatId: string = this.defaultChatId
  ): Promise<TelegramApiResponse<{ message_id: number }>> {
    return this.request<{ message_id: number }>('copyMessage', {
      chat_id: toChatId,
      from_chat_id: fromChatId,
      message_id: messageId,
      disable_notification: true
    }, { maxRetries: 1, timeoutMs: 5000 });
  }

  /**
   * Probes the current highest message ID in the storage chat by sending and immediately deleting a lightweight ping
   */
  public async getLatestMessageId(chatId: string = this.defaultChatId): Promise<number | null> {
    try {
      const ping = await this.sendMessage('🔍 KKV SYNC PROBE', chatId, { disable_notification: true });
      if (ping.ok && ping.result?.message_id) {
        const msgId = ping.result.message_id;
        // Clean up probe message asynchronously
        this.deleteMessage(msgId, chatId).catch(() => {});
        // Return the highest message ID that existed before this probe
        return Math.max(1, msgId - 1);
      }
    } catch (err) {
      console.warn('[TelegramClient] Probe latest message ID notice:', err);
    }
    return null;
  }

  /**
   * Downloads raw file binary buffer from Telegram server
   */
  public async downloadFileBuffer(filePath: string): Promise<Buffer> {
    if (!this.botToken) {
      throw new Error('TELEGRAM_BOT_TOKEN is not configured.');
    }
    const downloadUrl = `https://api.telegram.org/file/bot${this.botToken}/${filePath}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const res = await fetch(downloadUrl, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) {
      throw new Error(`Failed to download file from Telegram: ${res.statusText} (${res.status})`);
    }
    const arrayBuf = await res.arrayBuffer();
    return Buffer.from(arrayBuf);
  }

  /**
   * Polls updates / messages for synchronization (safe 5s timeout)
   */
  public async getUpdates(
    offset?: number,
    limit: number = 100
  ): Promise<TelegramApiResponse<TelegramUpdate[]>> {
    const params: any = { limit, allowed_updates: ['message', 'channel_post', 'edited_message', 'edited_channel_post'] };
    if (typeof offset === 'number') {
      params.offset = offset;
    }
    return this.request<TelegramUpdate[]>('getUpdates', params, { maxRetries: 1, timeoutMs: 6000 });
  }

  /**
   * Checks Telegram connectivity status without throwing or hanging the process
   */
  public async checkHealth(forceNetworkCheck = false): Promise<TelegramHealthStatus> {
    if (!this.isConfigured()) {
      this.cachedHealth = {
        configured: false,
        connected: false,
        status: 'degraded',
        error: 'TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is missing.',
        lastCheckedAt: new Date().toISOString()
      };
      return this.cachedHealth;
    }

    if (!forceNetworkCheck && this.cachedHealth.lastCheckedAt) {
      const ageMs = Date.now() - new Date(this.cachedHealth.lastCheckedAt).getTime();
      if (ageMs < 15000) {
        return this.cachedHealth;
      }
    }

    if (this.isChecking) {
      return this.cachedHealth;
    }

    this.isChecking = true;
    try {
      const meRes = await this.getMe();
      if (!meRes.ok || !meRes.result) {
        const errorDesc = meRes.description || 'Failed to authenticate with Telegram Bot API.';
        this.cachedHealth = {
          configured: true,
          connected: false,
          status: 'degraded',
          error: errorDesc,
          lastCheckedAt: new Date().toISOString()
        };
        this.scheduleReconnect();
        return this.cachedHealth;
      }

      const botUsername = meRes.result.username || meRes.result.first_name;

      const chatRes = await this.getChat();
      if (!chatRes.ok || !chatRes.result) {
        const errorDesc = chatRes.description || `Unable to access storage chat ID. Ensure bot is Admin.`;
        this.cachedHealth = {
          configured: true,
          connected: false,
          status: 'degraded',
          botUsername,
          error: errorDesc,
          lastCheckedAt: new Date().toISOString()
        };
        this.scheduleReconnect();
        return this.cachedHealth;
      }

      const wasDisconnected = !this.cachedHealth.connected;
      const chatTitle = chatRes.result.title || chatRes.result.first_name || 'Storage Channel';

      this.cachedHealth = {
        configured: true,
        connected: true,
        status: 'connected',
        botUsername,
        chatTitle,
        lastCheckedAt: new Date().toISOString()
      };
      this.backoffIndex = 0;

      if (wasDisconnected) {
        console.log(`[Telegram] Connection established (Bot: @${botUsername}, Chat: ${chatTitle})`);
        console.log('[Telegram] Telegram service READY');
      }

      return this.cachedHealth;
    } catch (err: any) {
      const errorMsg = err?.message || 'Error checking Telegram health';
      this.cachedHealth = {
        configured: true,
        connected: false,
        status: 'degraded',
        error: errorMsg,
        lastCheckedAt: new Date().toISOString()
      };
      this.scheduleReconnect();
      return this.cachedHealth;
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * Schedules a background reconnection attempt using bounded exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    const delay = this.backoffSchedule[Math.min(this.backoffIndex, this.backoffSchedule.length - 1)];
    this.backoffIndex = Math.min(this.backoffIndex + 1, this.backoffSchedule.length - 1);

    console.log(`[Telegram] Retrying in ${delay / 1000}s...`);
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      await this.checkHealth(true);
    }, delay);
  }

  /**
   * Starts independent background health monitoring without blocking backend startup
   */
  public startBackgroundHealthMonitor(): void {
    console.log('[Telegram] Initializing Telegram service in background...');
    // Initial check after short delay so server startup is completely unblocked
    setTimeout(() => {
      this.checkHealth(true).catch(() => {});
    }, 100);

    // Periodic heartbeat check every 60 seconds
    if (!this.periodicTimer) {
      this.periodicTimer = setInterval(() => {
        if (this.cachedHealth.connected) {
          this.checkHealth(true).catch(() => {});
        }
      }, 60000);
    }
  }

  /**
   * Stops background health monitor
   */
  public stopBackgroundHealthMonitor(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.periodicTimer) {
      clearInterval(this.periodicTimer);
      this.periodicTimer = null;
    }
  }
}

export const telegramClient = new TelegramClient();
