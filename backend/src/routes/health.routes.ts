import { Router } from 'express';
import { getHealth, getFirestoreHealth, getReadiness } from '../controllers/health.controller.js';

const router = Router();
router.get('/', getHealth);
router.get('/firestore', getFirestoreHealth);
router.get('/ready', getReadiness);

export default router;
