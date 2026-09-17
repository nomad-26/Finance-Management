import { Request, Response } from 'express';
import { telegramClient } from '../telegram/telegram.client.js';

/**
 * Local Backend Process Health Check
 * Confirms the local HTTP server is running and responsive.
 * Does NOT block on or require external Telegram network connectivity.
 */
export const getHealth = (_req: Request, res: Response) => {
  const telegramHealth = telegramClient.getCachedHealth();
  const isConnected = telegramHealth.connected;

  const responsePayload = {
    status: 'ok',
    service: 'kkv-gold-finance-backend',
    backend: 'running',
    storage: 'telegram',
    telegram: isConnected ? 'connected' : 'degraded',
    ready: true,
    botUsername: telegramHealth.botUsername,
    chatTitle: telegramHealth.chatTitle,
    timestamp: new Date().toISOString(),
    ...(telegramHealth.error ? { telegramNotice: telegramHealth.error } : {})
  };

  return res.status(200).json(responsePayload);
};

/**
 * Detailed Telegram storage health status
 */
export const getTelegramHealth = async (req: Request, res: Response) => {
  const force = req.query.check === 'true' || req.query.force === 'true';
  const health = force ? await telegramClient.checkHealth(true) : telegramClient.getCachedHealth();

  return res.status(200).json({
    service: 'telegram',
    status: health.connected ? 'ready' : 'degraded',
    connected: health.connected,
    configured: health.configured,
    botUsername: health.botUsername,
    chatTitle: health.chatTitle,
    lastCheckedAt: health.lastCheckedAt,
    ...(health.error ? { error: health.error } : {})
  });
};

/**
 * Application Readiness Check
 */
export const getReadiness = (_req: Request, res: Response) => {
  const tgHealth = telegramClient.getCachedHealth();
  return res.status(200).json({
    backend: 'ready',
    telegram: tgHealth.connected ? 'ready' : 'degraded'
  });
};

export default getHealth;
