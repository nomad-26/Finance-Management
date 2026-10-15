import { Router } from 'express';
import {
  getConfigStatus,
  unlockConfigCenter
} from '../controllers/configCenter.controller.js';

const router = Router();

// Publicly readable status (credentials/tokens strictly excluded)
router.get('/status', getConfigStatus);

// Admin Access Verification for pre-login modal
router.post('/auth/unlock', unlockConfigCenter);
router.post('/unlock', unlockConfigCenter);

export default router;
