import { Request, Response } from 'express';
import { customerService } from '../services/customer.service.js';
import { loanService } from '../services/loan.service.js';
import { receiptService } from '../services/receipt.service.js';

export const globalSearch = (req: Request, res: Response) => {
  try {
    const q = ((req.query.q as string) || '').toLowerCase().trim();

    if (!q) {
      return res.status(200).json({
        success: true,
        data: {
          customers: [],
          loans: [],
          receipts: []
        }
      });
    }

    // 1. Search Customers
    const allCustomers = customerService.getAll();
    const matchedCustomers = allCustomers
      .filter((c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        c.id.toLowerCase().includes(q) ||
        (c.idNumber && c.idNumber.toLowerCase().includes(q))
      )
      .slice(0, 5);

    // 2. Search Loans
    const allLoans = loanService.getAll();
    const matchedLoans = allLoans
      .filter((l) =>
        l.loanNo.toLowerCase().includes(q) ||
        l.customerName.toLowerCase().includes(q) ||
        l.customerPhone.includes(q) ||
        l.id.toLowerCase().includes(q) ||
        (l.notes && l.notes.toLowerCase().includes(q)) ||
        l.principal.toString().includes(q)
      )
      .slice(0, 5);

    // 3. Search Receipts
    const allReceipts = receiptService.getAll();
    const matchedReceipts = allReceipts
      .filter((r) =>
        r.receiptNo.toString().includes(q) ||
        r.loanNo.toLowerCase().includes(q) ||
        r.customerName.toLowerCase().includes(q) ||
        r.kind.toLowerCase().includes(q) ||
        r.amount.toString().includes(q)
      )
      .slice(0, 5);

    return res.status(200).json({
      success: true,
      data: {
        customers: matchedCustomers,
        loans: matchedLoans,
        receipts: matchedReceipts
      }
    });
  } catch (err: any) {
    console.error('[SearchController] Global search error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to perform global search',
      error: { message: err.message }
    });
  }
};
