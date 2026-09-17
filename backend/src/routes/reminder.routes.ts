import { Router } from 'express';
import {
  getReminders,
  createReminder,
  updateReminder,
  deleteReminder
} from '../controllers/reminder.controller.js';

const router = Router();

router.get('/', getReminders);
router.post('/', createReminder);
router.put('/:id', updateReminder);
router.delete('/:id', deleteReminder);

export default router;
