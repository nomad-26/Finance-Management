import { Router } from 'express';
import {
  getCustomers,
  getCustomerById,
  searchCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  restoreCustomer,
  deletePermanentlyCustomer,
  uploadCustomerKycDocument,
  deleteCustomerKycDocument,
  getCustomerKycDocuments,
  uploadCustomerPhoto,
  getCustomerDocumentById
} from '../controllers/customerController.js';
import { handleUploadMiddleware } from '../middleware/uploadMiddleware.js';
import { authenticateUser, authorizePermission, authorizeRoles } from '../middleware/auth.middleware.js';
import { getLoansByCustomerId } from '../controllers/loan.controller.js';

const router = Router();

// Protect all customer routes with JWT authentication
router.use(authenticateUser);

// Operational Endpoints: Fine-grained permissions
router.get('/', authorizePermission('customers', 'view'), getCustomers);
router.get('/search', authorizePermission('customers', 'view'), searchCustomers);
router.get('/:id/loans', authorizePermission('loans', 'view'), getLoansByCustomerId);
router.get('/:id', authorizePermission('customers', 'view'), getCustomerById);
router.post('/', authorizePermission('customers', 'create'), handleUploadMiddleware, createCustomer);
router.put('/:id', authorizePermission('customers', 'update'), handleUploadMiddleware, updateCustomer);

// Customer Photo Upload Endpoint (Webcam or File Upload -> Google Drive + Telegram metadata)
router.post('/:id/photo', authorizePermission('customers', 'update'), handleUploadMiddleware, uploadCustomerPhoto);

// Dedicated KYC Document Endpoints & Aliases (Google Drive upload + Telegram metadata storage)
router.get('/:id/kyc', authorizePermission('customers', 'viewKyc'), getCustomerKycDocuments);
router.get('/:id/documents', authorizePermission('customers', 'viewKyc'), getCustomerKycDocuments);
router.get('/:id/kyc/:documentId', authorizePermission('customers', 'viewKyc'), getCustomerDocumentById);
router.get('/:id/documents/:documentId', authorizePermission('customers', 'viewKyc'), getCustomerDocumentById);
router.post('/:id/kyc', authorizePermission('customers', 'update'), handleUploadMiddleware, uploadCustomerKycDocument);
router.post('/:id/documents', authorizePermission('customers', 'update'), handleUploadMiddleware, uploadCustomerKycDocument);
router.delete('/:id/kyc/:docId', authorizePermission('customers', 'update'), deleteCustomerKycDocument);
router.delete('/:id/documents/:docId', authorizePermission('customers', 'update'), deleteCustomerKycDocument);

// Sensitive/Destructive Endpoints
router.delete('/:id', authorizePermission('customers', 'delete'), deleteCustomer);
router.post('/:id/restore', authorizePermission('customers', 'update'), restoreCustomer);
router.delete('/:id/permanent', authorizeRoles('ADMIN'), deletePermanentlyCustomer);

export default router;
