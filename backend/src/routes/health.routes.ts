import { Router } from 'express';
import { getHealth, getTelegramHealth, getReadiness } from '../controllers/health.controller.js';

const router = Router();
router.get('/', getHealth);
router.get('/telegram', getTelegramHealth);
router.get('/ready', getReadiness);

export default router;
