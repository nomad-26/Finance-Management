import { Router } from 'express';
import {
  getReceipts,
  getReceiptByNo,
  createReceipt,
  getReceiptPdf
} from '../controllers/receipt.controller.js';
import { authenticateUser, authorizePermission } from '../middleware/auth.middleware.js';

const router = Router();

router.use(authenticateUser);

router.get('/', authorizePermission('receipts', 'view'), getReceipts);
router.get('/:receiptNo/pdf', authorizePermission('receipts', 'view'), getReceiptPdf);
router.get('/:receiptNo', authorizePermission('receipts', 'view'), getReceiptByNo);
router.post('/', authorizePermission('receipts', 'create'), createReceipt);

export default router;
