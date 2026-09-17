import { Request, Response } from 'express';
import { adminService } from '../services/admin.service.js';
import { telegramService } from '../services/telegram.service.js';

export const getTelegramConfig = (req: Request, res: Response) => {
  const config = adminService.getTelegramConfig();
  return res.json({ success: true, data: config });
};

export const updateTelegramConfig = (req: Request, res: Response) => {
  const updated = adminService.updateTelegramConfig(req.body);
  return res.json({ success: true, message: 'Telegram configuration updated', data: updated });
};

export const testTelegram = async (req: Request, res: Response) => {
  const result = await telegramService.sendTestMessage();
  if (!result.success) {
    return res.status(400).json({ success: false, message: result.message });
  }
  return res.json({ success: true, message: result.message });
};

export const backupTelegram = async (req: Request, res: Response) => {
  const result = await telegramService.sendBackup();
  if (!result.success) {
    return res.status(500).json({ success: false, message: result.message });
  }
  return res.json({ success: true, message: result.message });
};
