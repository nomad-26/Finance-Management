import { Router } from 'express';
import { getDashboardSummary } from '../controllers/dashboard.controller.js';
import { authenticateUser, authorizePermission } from '../middleware/auth.middleware.js';

const router = Router();

router.use(authenticateUser);

router.get('/summary', authorizePermission('dashboard', 'view'), getDashboardSummary);

export default router;
