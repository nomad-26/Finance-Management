import { Request, Response } from 'express';
import { loanService } from '../services/loan.service.js';
import { receiptService } from '../services/receipt.service.js';
import { counterService } from '../services/counter.service.js';

export const getNextSequence = async (req: Request, res: Response) => {
  try {
    const nextSeq = await counterService.peekNextLoanSequence();
    return res.json({
      success: true,
      data: {
        nextSequence: nextSeq,
        loanNo: `GL-${nextSeq}`,
        receiptNo: nextSeq
      }
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve next sequence',
      error: err.message
    });
  }
};

export const getLoans = async (req: Request, res: Response) => {
  const loans = await loanService.getAllAsync();
  return res.json({
    success: true,
    message: 'Loans retrieved successfully',
    data: loans,
    timestamp: new Date().toISOString()
  });
};

export const getLoanByNo = async (req: Request, res: Response) => {
  const loan = (await loanService.getByLoanNoAsync(req.params.loanNo)) || (await loanService.getByIdAsync(req.params.loanNo));
  if (!loan) {
    return res.status(404).json({
      success: false,
      message: `Loan ${req.params.loanNo} not found`
    });
  }
  return res.json({
    success: true,
    data: loan
  });
};

export const createLoan = async (req: Request, res: Response) => {
  try {
    const actor = req.user
      ? {
          uid: req.user.staffId || req.user.id || req.user._id,
          email: req.user.email,
          role: req.user.role,
          name: req.user.name || req.user.displayName
        }
      : undefined;

    const newLoan = await loanService.create(req.body, actor);
    return res.status(201).json({
      success: true,
      message: 'Loan issued successfully',
      data: newLoan
    });
  } catch (err: any) {
    console.error('[LoanController] createLoan error:', err.message || err);
    const statusCode =
      err.statusCode ||
      (err.code === 'CUSTOMER_NOT_FOUND'
        ? 404
        : err.code === 'CUSTOMER_BLOCKED'
        ? 403
        : err.code === 'FIRESTORE_PERMISSION_DENIED'
        ? 403
        : err.code === 'PERSISTENCE_VERIFICATION_FAILED' || err.code === 'FIRESTORE_WRITE_FAILED'
        ? 500
        : 400);

    return res.status(statusCode).json({
      success: false,
      error: err.code || err.error || 'INVALID_REQUEST',
      message: err.message || 'Failed to create loan'
    });
  }
};

export const updateLoan = async (req: Request, res: Response) => {
  try {
    const loanId = req.params.id || req.params.loanNo;
    const actor = req.user
      ? {
          uid: req.user.staffId || req.user.id || req.user._id,
          email: req.user.email,
          role: req.user.role,
          name: req.user.name || req.user.displayName
        }
      : undefined;
    const ipAddress = req.ip || req.socket?.remoteAddress || '';
    const userAgent = (req.headers['user-agent'] as string) || '';

    const updated = await loanService.adminUpdateLoanAsync(loanId, req.body, actor, { ipAddress, userAgent });
    return res.json({
      success: true,
      message: `Loan ${updated.loanNo} updated successfully`,
      data: updated
    });
  } catch (err: any) {
    const statusCode = err.statusCode || (err.code === 'NOT_FOUND' ? 404 : 400);
    return res.status(statusCode).json({
      success: false,
      error: err.code || 'UPDATE_LOAN_FAILED',
      message: err.message || 'Failed to update loan'
    });
  }
};

export const deleteLoan = async (req: Request, res: Response) => {
  try {
    const loanId = req.params.id || req.params.loanNo;
    const reason = req.body?.reason || (req.query?.reason as string);
    const actor = req.user
      ? {
          uid: req.user.staffId || req.user.id || req.user._id,
          email: req.user.email,
          role: req.user.role,
          name: req.user.name || req.user.displayName
        }
      : undefined;
    const ipAddress = req.ip || req.socket?.remoteAddress || '';
    const userAgent = (req.headers['user-agent'] as string) || '';

    const result = await loanService.adminDeleteLoanAsync(loanId, reason, actor, { ipAddress, userAgent });
    return res.json({
      success: true,
      message: result.message || 'Loan deleted successfully'
    });
  } catch (err: any) {
    const statusCode = err.statusCode || (err.code === 'NOT_FOUND' ? 404 : 400);
    return res.status(statusCode).json({
      success: false,
      error: err.code || 'DELETE_LOAN_FAILED',
      message: err.message || 'Failed to delete loan'
    });
  }
};

export const closeLoan = async (req: Request, res: Response) => {
  const closedLoan = await loanService.closeLoanAsync(req.params.loanNo);
  if (!closedLoan) {
    return res.status(404).json({
      success: false,
      message: `Loan ${req.params.loanNo} not found`
    });
  }
  return res.json({
    success: true,
    message: 'Loan closed successfully',
    data: closedLoan
  });
};

export const getLoanPayments = async (req: Request, res: Response) => {
  const loanNo = req.params.id || req.params.loanNo;
  const receipts = (await receiptService.getAllAsync()).filter(r => r.loanNo === loanNo || r.loanId === loanNo);
  return res.json({
    success: true,
    data: receipts
  });
};

export const addLoanPayment = async (req: Request, res: Response) => {
  try {
    const targetLoanId = req.params.id || req.params.loanNo;
    const loan = await loanService.getByIdAsync(targetLoanId);
    const receiptPayload = {
      ...req.body,
      loanId: loan?.id || targetLoanId,
      loanNo: loan?.loanNo || targetLoanId,
      customerId: loan?.customerId || req.body.customerId,
      customerName: loan?.customerName || req.body.customerName,
      kind: req.body.kind || req.body.paymentType || 'PART PAYMENT'
    };
    const newReceipt = await receiptService.create(receiptPayload, req.user);
    return res.status(201).json({
      success: true,
      message: 'Payment recorded successfully',
      data: newReceipt
    });
  } catch (err: any) {
    return res.status(400).json({
      success: false,
      message: err.message || 'Failed to add payment'
    });
  }
};

export const getLoansByCustomerId = async (req: Request, res: Response) => {
  const customerId = req.params.customerId || req.params.id;
  const pendingOnly = req.query.pendingOnly === 'true' || req.query.pending === 'true';

  if (pendingOnly) {
    const pendingItems = await loanService.getPendingLoansAsync(customerId, req.query.asOfDate as string);
    return res.json({
      success: true,
      data: pendingItems.map(p => p.loan),
      pendingDetails: pendingItems
    });
  }

  const allLoans = await loanService.getAllAsync();
  const customerLoans = allLoans.filter(l => 
    l.customerId === customerId || 
    (l as any).customerId?.toString() === customerId ||
    l.customerId?.toLowerCase() === customerId?.toLowerCase()
  );
  return res.json({
    success: true,
    data: customerLoans
  });
};

export const getPendingLoans = async (req: Request, res: Response) => {
  try {
    const customerId = req.query.customerId as string | undefined;
    const asOfDate = req.query.asOfDate as string | undefined;
    const pendingItems = await loanService.getPendingLoansAsync(customerId, asOfDate);
    return res.json({
      success: true,
      data: pendingItems.map(p => p.loan),
      pendingDetails: pendingItems,
      totalCount: pendingItems.length
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve pending loans',
      error: err.message
    });
  }
};

