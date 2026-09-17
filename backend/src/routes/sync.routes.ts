import { Router } from 'express';
import { syncController } from '../controllers/sync.controller.js';
import { authenticateUser } from '../middleware/auth.middleware.js';

const router = Router();

// Public / health sync status
router.get('/status', (req, res) => syncController.getStatus(req, res));

// Authenticated or direct sync endpoints
router.post('/pull', (req, res) => syncController.pullSync(req, res));
router.get('/pull', (req, res) => syncController.pullSync(req, res));
router.post('/push', authenticateUser, (req, res) => syncController.pushSnapshot(req, res));
router.post('/', (req, res) => syncController.pullSync(req, res));
router.get('/', (req, res) => syncController.getStatus(req, res));

export default router;

