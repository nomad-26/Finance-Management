import { Router } from 'express';
import {
  getLoans,
  getLoanByNo,
  getNextSequence,
  createLoan,
  updateLoan,
  deleteLoan,
  closeLoan,
  getLoanPayments,
  addLoanPayment,
  getLoansByCustomerId,
  getPendingLoans
} from '../controllers/loan.controller.js';
import { authenticateUser, authorizePermission, authorizeRoles } from '../middleware/auth.middleware.js';

const router = Router();

// Protect all loan routes with JWT authentication
router.use(authenticateUser);

// Operational Endpoints: Module-action permissions
router.get('/next-sequence', authorizePermission('loans', 'view'), getNextSequence);
router.get('/pending', authorizePermission('loans', 'view'), getPendingLoans);
router.get('/', authorizePermission('loans', 'view'), getLoans);
router.get('/customer/:customerId', authorizePermission('loans', 'view'), getLoansByCustomerId);
router.get('/:loanNo', authorizePermission('loans', 'view'), getLoanByNo);
router.post('/', authorizePermission('loans', 'create'), createLoan);
// Admin-Only Mutation Endpoints
router.put('/:id', authorizeRoles('ADMIN'), updateLoan);

router.post('/:loanNo/close', authorizePermission('loans', 'approve'), closeLoan);
router.get('/:id/payments', authorizePermission('loans', 'view'), getLoanPayments);
router.post('/:id/payments', authorizePermission('loans', 'create'), addLoanPayment);

// Destructive Endpoints (Admin-Only)
router.delete('/:id', authorizeRoles('ADMIN'), deleteLoan);

export default router;
