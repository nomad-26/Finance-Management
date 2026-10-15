import { Router } from 'express';
import { getHealth, getFirestoreHealth, getReadiness, getFirebaseDiagnosticsHandler } from '../controllers/health.controller.js';

const router = Router();
router.get('/', getHealth);
router.get('/firestore', getFirestoreHealth);
router.get('/ready', getReadiness);
router.get('/diagnostics', getFirebaseDiagnosticsHandler);
router.get('/firebase', getFirebaseDiagnosticsHandler);

export default router;
