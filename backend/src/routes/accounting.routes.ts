import { Router } from 'express';
import {
  getDayBook,
  addVoucher,
  getBalances,
  getTrialBalance,
  getProfitAndLoss,
  getBalanceSheet
} from '../controllers/accounting.controller.js';
import { authenticateUser, authorizePermission } from '../middleware/auth.middleware.js';

const router = Router();

router.use(authenticateUser);

router.get('/day-book', authorizePermission('accounting', 'view'), getDayBook);
router.post('/vouchers', authorizePermission('accounting', 'create'), addVoucher);
router.get('/balances', authorizePermission('accounting', 'view'), getBalances);
router.get('/trial-balance', authorizePermission('accounting', 'view'), getTrialBalance);
router.get('/profit-loss', authorizePermission('accounting', 'view'), getProfitAndLoss);
router.get('/balance-sheet', authorizePermission('accounting', 'view'), getBalanceSheet);

export default router;
