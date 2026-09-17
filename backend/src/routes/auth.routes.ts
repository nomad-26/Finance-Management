import { Router } from 'express';
import { login, getMe, changePassword, logout } from '../controllers/auth.controller.js';
import { authenticateUser } from '../middleware/auth.middleware.js';

const router = Router();

// Public login endpoint
router.post('/login', login);

// Authenticated session endpoints
router.get('/me', authenticateUser, getMe);
router.post('/change-password', authenticateUser, changePassword);
router.post('/logout', authenticateUser, logout);

export default router;
