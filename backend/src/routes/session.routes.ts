import { Router } from 'express';
import {
  getSessions,
  registerSession,
  revokeSession,
  revokeOtherSessions,
  revokeAllSessions,
  checkSessionStatus
} from '../controllers/session.controller.js';

const router = Router();

router.get('/', getSessions);
router.post('/register', registerSession);
router.get('/check/:sessionId', checkSessionStatus);
router.post('/revoke-others', revokeOtherSessions);
router.post('/revoke-all', revokeAllSessions);
router.post('/:sessionId/revoke', revokeSession);

export default router;
