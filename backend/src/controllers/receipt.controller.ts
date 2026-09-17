import { Request, Response } from 'express';
import { receiptService } from '../services/receipt.service.js';
import { loanService } from '../services/loan.service.js';
import { customerService } from '../services/customer.service.js';
import { receiptPdfService } from '../services/receiptPdf.service.js';

export const getReceipts = async (req: Request, res: Response) => {
  const receipts = await receiptService.getAllAsync();
  return res.json({
    success: true,
    message: 'Receipts retrieved successfully',
    data: receipts,
    timestamp: new Date().toISOString()
  });
};

export const getReceiptByNo = async (req: Request, res: Response) => {
  const param = req.params.receiptNo || req.params.receiptId;
  const receipt =
    (await receiptService.getByReceiptNoAsync(Number(param))) ||
    (await receiptService.getByIdAsync(param));

  if (!receipt) {
    return res.status(404).json({
      success: false,
      message: `Receipt ${param} not found`
    });
  }
  return res.json({
    success: true,
    data: receipt
  });
};

export const createReceipt = async (req: Request, res: Response) => {
  try {
    const newReceipt = await receiptService.create(req.body, req.user);
    return res.status(201).json({
      success: true,
      message: 'Receipt recorded successfully',
      data: newReceipt
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to record receipt'
    });
  }
};

/**
 * Generates and streams the official A4 payment voucher PDF
 */
export const getReceiptPdf = async (req: Request, res: Response) => {
  try {
    const param = req.params.receiptId || req.params.receiptNo;
    const receipt =
      (await receiptService.getByIdAsync(param)) ||
      (await receiptService.getByReceiptNoAsync(Number(param)));

    if (!receipt) {
      return res.status(404).json({
        success: false,
        message: `Receipt ${param} not found`
      });
    }

    const loan = receipt.loanNo ? await loanService.getByLoanNo(receipt.loanNo) : null;
    const customer = receipt.customerId ? await customerService.getById(receipt.customerId) : null;

    const pdfBuffer = await receiptPdfService.generateReceiptPdfBuffer({
      receipt,
      loan,
      customer
    });

    const filename = receiptPdfService.generateFilename(receipt);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    return res.end(pdfBuffer);
  } catch (error: any) {
    console.error('[ReceiptController] getReceiptPdf error:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to generate receipt PDF voucher.'
    });
  }
};
