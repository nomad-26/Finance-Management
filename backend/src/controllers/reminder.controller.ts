import { Request, Response } from 'express';
import { reminderService } from '../services/reminder.service.js';

export const getReminders = (req: Request, res: Response) => {
  const reminders = reminderService.getAll();
  return res.json({
    success: true,
    data: reminders
  });
};

export const createReminder = (req: Request, res: Response) => {
  const newReminder = reminderService.create(req.body);
  return res.status(201).json({
    success: true,
    message: 'Reminder created successfully',
    data: newReminder
  });
};

export const updateReminder = (req: Request, res: Response) => {
  const updated = reminderService.update(req.params.id, req.body);
  if (!updated) {
    return res.status(404).json({
      success: false,
      message: 'Reminder not found'
    });
  }
  return res.json({
    success: true,
    message: 'Reminder updated',
    data: updated
  });
};

export const deleteReminder = (req: Request, res: Response) => {
  const deleted = reminderService.delete(req.params.id);
  if (!deleted) {
    return res.status(404).json({
      success: false,
      message: 'Reminder not found'
    });
  }
  return res.json({
    success: true,
    message: 'Reminder deleted'
  });
};
