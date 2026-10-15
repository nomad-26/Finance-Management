import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { Receipt, Loan, Customer, BranchSettings, FixedDeposit, FDCustomer, FDInterestPayout } from '../types/index.js';
import { COMPANY_CONFIG, DEFAULT_BRANCH_SETTINGS } from '../config/company.config.js';
import { adminService } from './admin.service.js';

export interface ReceiptPdfOptions {
  receipt: Receipt;
  loan?: Loan | null;
  customer?: Customer | null;
  branchSettings?: BranchSettings | null;
}

export interface FDReceiptPdfOptions {
  fd: FixedDeposit;
  customer?: Customer | FDCustomer | any | null;
  branchSettings?: BranchSettings | null;
}

export interface FDInterestReceiptPdfOptions {
  payout: FDInterestPayout;
  fd?: FixedDeposit | null;
  customer?: Customer | FDCustomer | any | null;
  branchSettings?: BranchSettings | null;
}


export class ReceiptPdfService {
  /**
   * Locates the KKV logo on disk
   */
  private findLogoPath(): string | null {
    const candidates = [
      path.resolve(process.cwd(), '../public/kkv-logo.png'),
      path.resolve(process.cwd(), 'public/kkv-logo.png'),
      path.resolve(process.cwd(), '../dist/kkv-logo.png'),
      path.resolve(process.cwd(), '../src/assets/kkv-logo.png'),
      path.resolve(__dirname, '../../public/kkv-logo.png'),
      path.resolve(__dirname, '../../../public/kkv-logo.png')
    ];

    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    return null;
  }

  /**
   * Generates a sanitized professional filename for the PDF voucher
   */
  public generateFilename(receipt: Receipt): string {
    const receiptNo = receipt.receiptNo || 'VOUCHER';
    const rawCustomer = receipt.customerName || 'CUSTOMER';
    const sanitizedCustomer = rawCustomer
      .replace(/[^a-zA-Z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toUpperCase();

    return `KKV-Finance-Receipt-${receiptNo}-${sanitizedCustomer}.pdf`;
  }

  /**
   * Generates an official A4 PDF payment/disbursement voucher buffer matching ReceiptDisplay.tsx
   */
  public async generateReceiptPdfBuffer(options: ReceiptPdfOptions): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const { receipt, loan, customer } = options;
      const chunks: Buffer[] = [];

      const isDisbursement = receipt.kind === 'LOAN DISBURSEMENT' || receipt.kind === 'NEW LOAN';

      // Resolve Financial Values
      const principal = receipt.loanPrincipal !== undefined
        ? receipt.loanPrincipal
        : (loan?.principal || receipt.principalComponent || receipt.amount || 0);

      const interestRate = receipt.interestRate !== undefined
        ? receipt.interestRate
        : (loan?.interestRate || 1.5);

      const hasAdvanceInterest = receipt.deductAdvanceInterest !== undefined
        ? receipt.deductAdvanceInterest
        : Boolean(loan?.deductAdvanceInterest && (loan.advanceDays || 0) > 0);

      const advanceDays = receipt.advanceDays !== undefined
        ? receipt.advanceDays
        : (loan?.advanceDays || (hasAdvanceInterest ? 30 : 0));

      const advanceInterestDeducted = receipt.advanceInterestDeducted !== undefined
        ? receipt.advanceInterestDeducted
        : (receipt.advanceInterestAmount !== undefined
            ? receipt.advanceInterestAmount
            : (hasAdvanceInterest
                ? (loan?.advanceInterestAmount || Math.round(principal * (interestRate / 100) * (advanceDays / 30)))
                : 0));

      const processingFee = receipt.processingFee !== undefined
        ? receipt.processingFee
        : (receipt.cardFee !== undefined
            ? receipt.cardFee
            : (loan?.cardFeeEnabled ? (loan.cardFee || 0) : 0));

      const totalDeductions = receipt.totalDeductions !== undefined
        ? receipt.totalDeductions
        : ((hasAdvanceInterest ? advanceInterestDeducted : 0) + processingFee);

      const netDisbursed = receipt.netDisbursedAmount !== undefined
        ? receipt.netDisbursedAmount
        : (isDisbursement && receipt.amount !== principal && receipt.amount > 0
            ? receipt.amount
            : Math.max(0, principal - totalDeductions));

      // Resolve Dynamic Central Branch Settings
      const branchSettings: BranchSettings = {
        ...DEFAULT_BRANCH_SETTINGS,
        ...(adminService.getMasterSettings()?.branchSettings || {}),
        ...(options.branchSettings || {})
      };

      const businessTitle = branchSettings.businessTitle || COMPANY_CONFIG.businessName;
      const branchAddress = branchSettings.branchAddress || COMPANY_CONFIG.address;
      const officialPhone = branchSettings.officialPhone || COMPANY_CONFIG.phone;
      const gstin = branchSettings.gstin;

      // A4 page setup (595.28 x 841.89 points) with 36pt margins
      const doc = new PDFDocument({
        size: 'A4',
        margin: 36,
        info: {
          Title: `${businessTitle} - ${isDisbursement ? 'Disbursement Voucher' : 'Payment Voucher'} #${receipt.receiptNo}`,
          Author: `${businessTitle} & Rental Management`,
          Subject: `Official ${isDisbursement ? 'Disbursement Voucher' : 'Payment Voucher'} for Receipt #${receipt.receiptNo}`,
          Keywords: 'KKV Finance, Receipt, Voucher, Gold Loan, Disbursement, Payment',
          CreationDate: new Date()
        }
      });

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));

      const pageWidth = 595.28;
      const leftMargin = 36;
      const rightMargin = pageWidth - 36;
      const contentWidth = rightMargin - leftMargin; // 523.28 pt

      // ── COLOR PALETTE ────────────────────────────────────────────────────────
      const colorEmerald = '#064e3b';
      const colorGold = '#b45309';
      const colorDark = '#0f172a';
      const colorMuted = '#64748b';
      const colorLightBg = '#f8fafc';
      const colorBorder = '#cbd5e1';
      const colorSuccessBg = '#ecfdf5';
      const colorSuccessText = '#047857';
      const colorDeductBg = '#fffbeb';
      const colorDeductText = '#b45309';

      let currentY = 36;

      // ── 1. HEADER SECTION ───────────────────────────────────────────────────
      const logoPath = this.findLogoPath();
      if (logoPath) {
        try {
          doc.image(logoPath, leftMargin, currentY, { width: 44, height: 44 });
        } catch {
          doc.rect(leftMargin, currentY, 44, 44).fillAndStroke(colorEmerald, colorGold);
        }
      }

      // Company Title & Info
      const headerTextX = logoPath ? leftMargin + 52 : leftMargin;
      doc
        .font('Helvetica-Bold')
        .fontSize(15)
        .fillColor(colorEmerald)
        .text(businessTitle, headerTextX, currentY);

      // Uppercase Address
      doc
        .font('Helvetica-Bold')
        .fontSize(7.5)
        .fillColor(colorDark)
        .text(branchAddress.toUpperCase(), headerTextX, currentY + 18, {
          width: contentWidth - (logoPath ? 52 : 0) - 130
        });

      // Red Phone Box
      const phoneBoxX = headerTextX;
      const phoneBoxY = currentY + 31;
      const phoneBoxWidth = 84;
      const phoneBoxHeight = 12;

      doc
        .roundedRect(phoneBoxX, phoneBoxY, phoneBoxWidth, phoneBoxHeight, 2.5)
        .fill('#dc2626');

      doc
        .font('Helvetica-Bold')
        .fontSize(7)
        .fillColor('#ffffff')
        .text(`Ph: ${officialPhone}`, phoneBoxX, phoneBoxY + 2.5, {
          width: phoneBoxWidth,
          align: 'center'
        });

      // Optional GSTIN Tag
      if (gstin && gstin.trim()) {
        const gstinBoxX = phoneBoxX + phoneBoxWidth + 6;
        const gstinBoxWidth = 95;
        doc
          .roundedRect(gstinBoxX, phoneBoxY, gstinBoxWidth, phoneBoxHeight, 2.5)
          .fill(colorEmerald);

        doc
          .font('Helvetica-Bold')
          .fontSize(6.5)
          .fillColor('#ffffff')
          .text(`GST: ${gstin}`, gstinBoxX, phoneBoxY + 2.5, {
            width: gstinBoxWidth,
            align: 'center'
          });
      }

      // Right-aligned Document Meta (No badge)
      const metaBoxWidth = 140;
      const metaBoxX = rightMargin - metaBoxWidth;

      // Receipt Number
      doc
        .font('Helvetica-Bold')
        .fontSize(12)
        .fillColor(colorEmerald)
        .text(`RECEIPT #${receipt.receiptNo}`, metaBoxX, currentY + 4, {
          width: metaBoxWidth,
          align: 'right'
        });

      // Date
      doc
        .font('Helvetica')
        .fontSize(8.5)
        .fillColor(colorMuted)
        .text(`Date: `, metaBoxX, currentY + 20, {
          width: metaBoxWidth - 55,
          align: 'right',
          continued: true
        })
        .font('Helvetica-Bold')
        .fillColor(colorDark)
        .text(receipt.date);

      currentY += 50;

      // Decorative Divider Line
      doc
        .strokeColor(colorEmerald)
        .lineWidth(1.5)
        .moveTo(leftMargin, currentY)
        .lineTo(rightMargin, currentY)
        .stroke();

      currentY += 10;

      // ── 2. CUSTOMER & LOAN INFO GRID ─────────────────────────────────────────
      const boxWidth = (contentWidth - 12) / 2;
      const boxHeight = 72;

      // Box 1: Customer Details
      doc
        .roundedRect(leftMargin, currentY, boxWidth, boxHeight, 4)
        .fillAndStroke(colorLightBg, colorBorder);

      doc
        .font('Helvetica-Bold')
        .fontSize(8)
        .fillColor(colorEmerald)
        .text('CUSTOMER DETAILS', leftMargin + 8, currentY + 7);

      const custPhone = receipt.customerPhone || loan?.customerPhone || customer?.phone || '—';
      const custRows = [
        ['Customer Name', receipt.customerName || '—'],
        ['Customer ID', String(receipt.customerId || '—')],
        ['Contact Phone', custPhone]
      ];

      let infoY = currentY + 22;
      for (const [label, val] of custRows) {
        doc.font('Helvetica').fontSize(7.5).fillColor(colorMuted).text(label, leftMargin + 8, infoY);
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor(colorDark).text(val, leftMargin + 80, infoY, { width: boxWidth - 88, align: 'right' });
        infoY += 14;
      }

      // Box 2: Loan Details
      const loanBoxX = leftMargin + boxWidth + 12;
      doc
        .roundedRect(loanBoxX, currentY, boxWidth, boxHeight, 4)
        .fillAndStroke(colorLightBg, colorBorder);

      doc
        .font('Helvetica-Bold')
        .fontSize(8)
        .fillColor(colorEmerald)
        .text('LOAN REFERENCE', loanBoxX + 8, currentY + 7);

      const loanRows = [
        ['Loan Reference', receipt.loanNo || '—'],
        ['Loan Type', receipt.loanType || 'Gold Loan'],
        ['Transaction Type', isDisbursement ? 'LOAN DISBURSEMENT' : (receipt.kind || 'REPAYMENT')]
      ];

      infoY = currentY + 22;
      for (const [label, val] of loanRows) {
        doc.font('Helvetica').fontSize(7.5).fillColor(colorMuted).text(label, loanBoxX + 8, infoY);
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor(colorDark).text(val, loanBoxX + 80, infoY, { width: boxWidth - 88, align: 'right' });
        infoY += 14;
      }

      currentY += boxHeight + 12;

      // ── 3. FINANCIAL BREAKDOWN TABLE ─────────────────────────────────────────
      const tableTop = currentY;
      const col1Width = contentWidth * 0.55;
      const col2Width = contentWidth * 0.20;
      const col3Width = contentWidth * 0.25;

      const col1X = leftMargin;
      const col2X = col1X + col1Width;
      const col3X = col2X + col2Width;

      // Table Header Fill
      doc
        .rect(leftMargin, tableTop, contentWidth, 18)
        .fillAndStroke(colorLightBg, colorBorder);

      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(colorEmerald);
      doc.text('DESCRIPTION', col1X + 8, tableTop + 5);
      doc.text(isDisbursement ? 'PAYMENT / METHOD' : 'PAYMENT MODE', col2X + 8, tableTop + 5, { width: col2Width - 16, align: 'center' });
      doc.text('AMOUNT (INR)', col3X + 8, tableTop + 5, { width: col3Width - 16, align: 'right' });

      currentY = tableTop + 18;

      if (isDisbursement) {
        // ── LOAN DISBURSEMENT ROWS ──

        // 1. Principal Row
        const pRowHeight = 28;
        doc
          .rect(leftMargin, currentY, contentWidth, pRowHeight)
          .strokeColor(colorBorder)
          .lineWidth(0.5)
          .stroke();

        doc.font('Helvetica-Bold').fontSize(8).fillColor(colorDark).text('Loan Principal', col1X + 8, currentY + 5);
        doc.font('Helvetica').fontSize(6.5).fillColor(colorMuted).text('Total sanctioned gold loan principal amount', col1X + 8, currentY + 16);

        // Payment Mode badge
        doc
          .roundedRect(col2X + 16, currentY + 6, col2Width - 32, 14, 2)
          .fillAndStroke('#f1f5f9', '#cbd5e1');

        doc.font('Helvetica-Bold').fontSize(7).fillColor(colorDark).text(receipt.paymentMode || 'Cash', col2X + 16, currentY + 9, {
          width: col2Width - 32,
          align: 'center'
        });

        doc.font('Helvetica-Bold').fontSize(9).fillColor(colorDark).text(
          `Rs. ${principal.toLocaleString('en-IN')}`,
          col3X + 8,
          currentY + 8,
          { width: col3Width - 16, align: 'right' }
        );

        currentY += pRowHeight;

        // 2. Advance Interest Deduction Row (if any)
        if (hasAdvanceInterest && advanceInterestDeducted > 0) {
          const advRowHeight = 28;
          doc
            .rect(leftMargin, currentY, contentWidth, advRowHeight)
            .fillAndStroke(colorDeductBg, '#fde68a');

          doc.font('Helvetica-Bold').fontSize(8).fillColor(colorDeductText).text('Advance Interest Deduction', col1X + 8, currentY + 5);
          doc.font('Helvetica').fontSize(6.5).fillColor(colorMuted).text(`${interestRate}% per month x ${advanceDays} days (Deducted at disbursement)`, col1X + 8, currentY + 16);

          doc
            .roundedRect(col2X + 16, currentY + 6, col2Width - 32, 14, 2)
            .fillAndStroke('#fef3c7', '#fde68a');

          doc.font('Helvetica-Bold').fontSize(7).fillColor(colorDeductText).text('Deduction', col2X + 16, currentY + 9, {
            width: col2Width - 32,
            align: 'center'
          });

          doc.font('Helvetica-Bold').fontSize(9).fillColor(colorDeductText).text(
            `-Rs. ${advanceInterestDeducted.toLocaleString('en-IN')}`,
            col3X + 8,
            currentY + 8,
            { width: col3Width - 16, align: 'right' }
          );

          currentY += advRowHeight;
        }

        // 3. Processing Fee Row (if any)
        if (processingFee > 0) {
          const feeRowHeight = 28;
          doc
            .rect(leftMargin, currentY, contentWidth, feeRowHeight)
            .fillAndStroke(colorDeductBg, '#fde68a');

          doc.font('Helvetica-Bold').fontSize(8).fillColor(colorDeductText).text('Card Processing Fee', col1X + 8, currentY + 5);
          doc.font('Helvetica').fontSize(6.5).fillColor(colorMuted).text('One-time loan card & processing charges', col1X + 8, currentY + 16);

          doc
            .roundedRect(col2X + 16, currentY + 6, col2Width - 32, 14, 2)
            .fillAndStroke('#fef3c7', '#fde68a');

          doc.font('Helvetica-Bold').fontSize(7).fillColor(colorDeductText).text('Deduction', col2X + 16, currentY + 9, {
            width: col2Width - 32,
            align: 'center'
          });

          doc.font('Helvetica-Bold').fontSize(9).fillColor(colorDeductText).text(
            `-Rs. ${processingFee.toLocaleString('en-IN')}`,
            col3X + 8,
            currentY + 8,
            { width: col3Width - 16, align: 'right' }
          );

          currentY += feeRowHeight;
        }

        // 4. Total Deductions Summary Row (if any deductions applied)
        if (totalDeductions > 0) {
          const totDeductHeight = 20;
          doc
            .rect(leftMargin, currentY, contentWidth, totDeductHeight)
            .fillAndStroke('#f8fafc', colorBorder);

          doc.font('Helvetica-Bold').fontSize(7.5).fillColor(colorMuted).text('TOTAL DEDUCTIONS', col1X + 8, currentY + 6);
          doc.font('Helvetica-Bold').fontSize(8.5).fillColor(colorDeductText).text(
            `-Rs. ${totalDeductions.toLocaleString('en-IN')}`,
            col3X + 8,
            currentY + 5,
            { width: col3Width - 16, align: 'right' }
          );

          currentY += totDeductHeight;
        }

        // 5. Net Disbursed Hero Row
        const totalRowHeight = 30;
        doc
          .rect(leftMargin, currentY, contentWidth, totalRowHeight)
          .fillAndStroke(colorSuccessBg, '#a7f3d0');

        doc
          .font('Helvetica-Bold')
          .fontSize(9.5)
          .fillColor(colorEmerald)
          .text('NET DISBURSED AMOUNT', col1X + 8, currentY + 6);

        doc
          .font('Helvetica')
          .fontSize(6.5)
          .fillColor(colorSuccessText)
          .text('Actual amount paid to borrower at disbursement', col1X + 8, currentY + 18);

        doc
          .font('Helvetica-Bold')
          .fontSize(13)
          .fillColor(colorEmerald)
          .text(
            `Rs. ${netDisbursed.toLocaleString('en-IN')}`,
            col3X + 8,
            currentY + 8,
            { width: col3Width - 16, align: 'right' }
          );

        currentY += totalRowHeight + 6;
      } else {
        // ── REGULAR REPAYMENT ROWS ──
        const rows: Array<{ title: string; subtitle: string; mode: string; amount: number }> = [];

        if ((receipt.principalComponent || 0) > 0) {
          rows.push({
            title: 'Principal Repayment Component',
            subtitle: 'Direct reduction of outstanding loan balance',
            mode: receipt.paymentMode || 'Cash',
            amount: receipt.principalComponent
          });
        }

        if ((receipt.interestComponent || 0) > 0) {
          rows.push({
            title: 'Monthly Interest Payment',
            subtitle: 'Pledge interest cleared for the billing period',
            mode: receipt.paymentMode || 'Cash',
            amount: receipt.interestComponent
          });
        }

        if (rows.length === 0) {
          rows.push({
            title: `${receipt.kind || 'Payment'} / Settlement`,
            subtitle: receipt.notes || 'Gold pledge transaction payment',
            mode: receipt.paymentMode || 'Cash',
            amount: receipt.amount || 0
          });
        }

        for (const row of rows) {
          const rowHeight = 28;
          doc
            .rect(leftMargin, currentY, contentWidth, rowHeight)
            .strokeColor(colorBorder)
            .lineWidth(0.5)
            .stroke();

          doc.font('Helvetica-Bold').fontSize(8).fillColor(colorDark).text(row.title, col1X + 8, currentY + 5);
          doc.font('Helvetica').fontSize(6.5).fillColor(colorMuted).text(row.subtitle, col1X + 8, currentY + 16);

          doc
            .roundedRect(col2X + 16, currentY + 6, col2Width - 32, 14, 2)
            .fillAndStroke('#f1f5f9', '#cbd5e1');

          doc.font('Helvetica-Bold').fontSize(7).fillColor(colorDark).text(row.mode, col2X + 16, currentY + 9, {
            width: col2Width - 32,
            align: 'center'
          });

          doc.font('Helvetica-Bold').fontSize(9).fillColor(colorDark).text(
            `Rs. ${(row.amount || 0).toLocaleString('en-IN')}`,
            col3X + 8,
            currentY + 8,
            { width: col3Width - 16, align: 'right' }
          );

          currentY += rowHeight;
        }

        // Net Received Total Row
        const totalRowHeight = 26;
        doc
          .rect(leftMargin, currentY, contentWidth, totalRowHeight)
          .fillAndStroke(colorSuccessBg, '#a7f3d0');

        doc
          .font('Helvetica-Bold')
          .fontSize(9)
          .fillColor(colorEmerald)
          .text('NET RECEIVED TOTAL', col1X + 8, currentY + 8);

        doc
          .font('Helvetica-Bold')
          .fontSize(12)
          .fillColor(colorEmerald)
          .text(
            `Rs. ${(receipt.amount || 0).toLocaleString('en-IN')}`,
            col3X + 8,
            currentY + 6,
            { width: col3Width - 16, align: 'right' }
          );

        currentY += totalRowHeight + 6;
      }

      // Metadata strip (Bank, Ref/UTR, UPI, ProcessedBy)
      const metaItems: string[] = [];
      if (receipt.bankName) metaItems.push(`Bank: ${receipt.bankName}`);
      if (receipt.transactionReference) metaItems.push(`Ref / UTR: ${receipt.transactionReference}`);
      if (receipt.upiId) metaItems.push(`UPI ID: ${receipt.upiId}`);
      if (receipt.processedBy) metaItems.push(`Processed By: ${receipt.processedBy}`);

      if (metaItems.length > 0) {
        doc
          .roundedRect(leftMargin, currentY, contentWidth, 16, 3)
          .fillAndStroke(colorLightBg, colorBorder);

        doc
          .font('Helvetica')
          .fontSize(6.8)
          .fillColor(colorDark)
          .text(metaItems.join('   |   '), leftMargin + 8, currentY + 4, {
            width: contentWidth - 16,
            align: 'center'
          });

        currentY += 22;
      } else {
        currentY += 6;
      }

      // ── 4. COLLATERAL & LOAN ACCOUNT/BALANCE SECTION ─────────────────────────
      const balBoxHeight = 64;

      // Box 1: Pledged Collateral
      doc
        .roundedRect(leftMargin, currentY, boxWidth, balBoxHeight, 4)
        .fillAndStroke(colorLightBg, colorBorder);

      doc
        .font('Helvetica-Bold')
        .fontSize(7.5)
        .fillColor(colorEmerald)
        .text('PLEDGED COLLATERAL SUMMARY', leftMargin + 8, currentY + 6);

      const itemsStr = loan?.items?.map((i) => i.item).filter(Boolean).join(', ') || 'Gold Ornaments';
      const netWtStr = `${(loan?.totalNetWeight || 0).toFixed(3)} g`;
      const mktValStr = (loan?.marketValue || 0) > 0 ? `Rs. ${(loan?.marketValue || 0).toLocaleString('en-IN')}` : '—';

      const colRows = [
        ['Pledged Items', itemsStr],
        ['Total Net Weight', netWtStr],
        ['Assessed Market Value', mktValStr]
      ];

      let colY = currentY + 18;
      for (const [l, v] of colRows) {
        doc.font('Helvetica').fontSize(6.8).fillColor(colorMuted).text(l, leftMargin + 8, colY);
        doc.font('Helvetica-Bold').fontSize(6.8).fillColor(colorDark).text(v, leftMargin + 80, colY, { width: boxWidth - 88, align: 'right' });
        colY += 13;
      }

      // Box 2: Terms or Balance
      doc
        .roundedRect(loanBoxX, currentY, boxWidth, balBoxHeight, 4)
        .fillAndStroke(colorLightBg, colorBorder);

      if (isDisbursement) {
        doc
          .font('Helvetica-Bold')
          .fontSize(7.5)
          .fillColor(colorEmerald)
          .text('LOAN TERMS & SCHEDULE', loanBoxX + 8, currentY + 6);

        const termsRows = [
          ['Sanctioned Principal', `Rs. ${principal.toLocaleString('en-IN')}`],
          ['Interest Rate', `${interestRate}% per month`],
          ['Next Payment Due', receipt.nextDueDate || loan?.nextDueDate || receipt.date]
        ];

        let balY = currentY + 18;
        for (let idx = 0; idx < termsRows.length; idx++) {
          const [l, v] = termsRows[idx];
          const isHighlight = idx === 0;
          doc.font(isHighlight ? 'Helvetica-Bold' : 'Helvetica').fontSize(6.8).fillColor(isHighlight ? colorEmerald : colorMuted).text(l, loanBoxX + 8, balY);
          doc.font('Helvetica-Bold').fontSize(isHighlight ? 7.5 : 6.8).fillColor(isHighlight ? colorEmerald : colorDark).text(v, loanBoxX + 80, balY, { width: boxWidth - 88, align: 'right' });
          balY += 13;
        }
      } else {
        doc
          .font('Helvetica-Bold')
          .fontSize(7.5)
          .fillColor(colorEmerald)
          .text('LOAN ACCOUNT BALANCE', loanBoxX + 8, currentY + 6);

        const balBefore = receipt.outstandingBefore !== undefined
          ? receipt.outstandingBefore
          : ((loan?.outstandingPrincipal || 0) + receipt.amount);
        const balAfter = receipt.outstandingAfter !== undefined
          ? receipt.outstandingAfter
          : (loan?.outstandingPrincipal || 0);

        const balRows = [
          ['Balance Before', `Rs. ${balBefore.toLocaleString('en-IN')}`],
          ['Amount Paid', `Rs. ${receipt.amount.toLocaleString('en-IN')}`],
          ['Remaining Balance', `Rs. ${balAfter.toLocaleString('en-IN')}`]
        ];

        let balY = currentY + 18;
        for (let idx = 0; idx < balRows.length; idx++) {
          const [l, v] = balRows[idx];
          const isHighlight = idx === 2;
          doc.font(isHighlight ? 'Helvetica-Bold' : 'Helvetica').fontSize(6.8).fillColor(isHighlight ? colorEmerald : colorMuted).text(l, loanBoxX + 8, balY);
          doc.font('Helvetica-Bold').fontSize(isHighlight ? 7.5 : 6.8).fillColor(isHighlight ? colorEmerald : colorDark).text(v, loanBoxX + 80, balY, { width: boxWidth - 88, align: 'right' });
          balY += 13;
        }
      }

      currentY += balBoxHeight + 14;

      // ── 5. SIGNATURES AREA ───────────────────────────────────────────────────
      const sigY = Math.max(currentY, 440);
      const sigBlockWidth = 160;

      // Customer Sig
      doc
        .strokeColor(colorBorder)
        .lineWidth(1)
        .moveTo(leftMargin + 10, sigY + 30)
        .lineTo(leftMargin + 10 + sigBlockWidth, sigY + 30)
        .stroke();

      doc
        .font('Helvetica-Bold')
        .fontSize(7.5)
        .fillColor(colorDark)
        .text('Customer Signature', leftMargin + 10, sigY + 34, { width: sigBlockWidth, align: 'center' });

      doc
        .font('Helvetica')
        .fontSize(6.5)
        .fillColor(colorMuted)
        .text('Acknowledged & Verified', leftMargin + 10, sigY + 44, { width: sigBlockWidth, align: 'center' });

      // Signatory Seal
      const rightSigX = rightMargin - sigBlockWidth - 10;
      doc
        .strokeColor(colorBorder)
        .lineWidth(1)
        .moveTo(rightSigX, sigY + 30)
        .lineTo(rightSigX + sigBlockWidth, sigY + 30)
        .stroke();

      doc
        .font('Helvetica-Bold')
        .fontSize(7.5)
        .fillColor(colorDark)
        .text(`For ${businessTitle}`, rightSigX, sigY + 34, { width: sigBlockWidth, align: 'center' });

      doc
        .font('Helvetica')
        .fontSize(6.5)
        .fillColor(colorMuted)
        .text('Authorized Signatory & Seal', rightSigX, sigY + 44, { width: sigBlockWidth, align: 'center' });

      // ── 6. FOOTER ────────────────────────────────────────────────────────────
      const footerY = 524;
      doc
        .strokeColor(colorBorder)
        .lineWidth(0.5)
        .moveTo(leftMargin, footerY)
        .lineTo(rightMargin, footerY)
        .stroke();

      doc
        .font('Helvetica')
        .fontSize(6.5)
        .fillColor(colorMuted)
        .text(
          `This is a computer-generated official financial voucher issued by ${businessTitle}. No signature revision required.`,
          leftMargin,
          footerY + 6,
          { width: contentWidth, align: 'center' }
        );

      doc.end();
    });
  }

  /**
   * Generates a sanitized professional filename for the FD receipt PDF voucher
   */
  public generateFDFilename(fd: FixedDeposit): string {
    const fdNo = fd.fdNo || 'FD';
    const rcptNo = fd.receiptNumber || 'RCPT';
    const rawCustomer = fd.depositorName || 'CUSTOMER';
    const sanitizedCustomer = rawCustomer
      .replace(/[^a-zA-Z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toUpperCase();

    return `KKV-FD-Receipt-${rcptNo}-${fdNo}-${sanitizedCustomer}.pdf`;
  }

  /**
   * Generates an official A4 Fixed Deposit Receipt / Certificate PDF buffer
   */
  public async generateFDReceiptPdfBuffer(options: FDReceiptPdfOptions): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const { fd, customer } = options;
      const chunks: Buffer[] = [];

      // Resolve Dynamic Central Branch Settings
      const branchSettings: BranchSettings = {
        ...DEFAULT_BRANCH_SETTINGS,
        ...(adminService.getMasterSettings()?.branchSettings || {}),
        ...(options.branchSettings || {})
      };

      const businessTitle = branchSettings.businessTitle || COMPANY_CONFIG.businessName;
      const branchAddress = branchSettings.branchAddress || COMPANY_CONFIG.address;
      const officialPhone = branchSettings.officialPhone || COMPANY_CONFIG.phone;
      const gstin = branchSettings.gstin;

      // A4 page setup (595.28 x 841.89 points) with 36pt margins
      const doc = new PDFDocument({
        size: 'A4',
        margin: 36,
        info: {
          Title: `${businessTitle} - Fixed Deposit Receipt ${fd.receiptNumber || fd.fdNo}`,
          Author: `${businessTitle} & Term Deposit Management`,
          Subject: `Official Fixed Deposit Receipt Certificate for ${fd.fdNo}`,
          Keywords: 'KKV Finance, Fixed Deposit, Receipt, Certificate, Term Deposit',
          CreationDate: new Date()
        }
      });

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));

      const pageWidth = 595.28;
      const leftMargin = 36;
      const rightMargin = pageWidth - 36;
      const contentWidth = rightMargin - leftMargin; // 523.28 pt

      // ── COLOR PALETTE ────────────────────────────────────────────────────────
      const colorEmerald = '#064e3b';
      const colorGold = '#b45309';
      const colorDark = '#0f172a';
      const colorMuted = '#64748b';
      const colorLightBg = '#f8fafc';
      const colorBorder = '#cbd5e1';
      const colorSuccessBg = '#ecfdf5';
      const colorSuccessText = '#047857';

      let currentY = 36;

      // ── 1. HEADER SECTION ───────────────────────────────────────────────────
      const logoPath = this.findLogoPath();
      if (logoPath) {
        try {
          doc.image(logoPath, leftMargin, currentY, { width: 44, height: 44 });
        } catch {
          doc.rect(leftMargin, currentY, 44, 44).fillAndStroke(colorEmerald, colorGold);
        }
      }

      // Company Title & Info
      const headerTextX = logoPath ? leftMargin + 52 : leftMargin;
      doc
        .font('Helvetica-Bold')
        .fontSize(15)
        .fillColor(colorEmerald)
        .text(businessTitle, headerTextX, currentY);

      // Uppercase Address
      doc
        .font('Helvetica-Bold')
        .fontSize(7.5)
        .fillColor(colorDark)
        .text(branchAddress.toUpperCase(), headerTextX, currentY + 18, {
          width: contentWidth - (logoPath ? 52 : 0) - 140
        });

      // Phone Box
      const phoneBoxX = headerTextX;
      const phoneBoxY = currentY + 31;
      const phoneBoxWidth = 84;
      const phoneBoxHeight = 12;

      doc
        .roundedRect(phoneBoxX, phoneBoxY, phoneBoxWidth, phoneBoxHeight, 2.5)
        .fill('#dc2626');

      doc
        .font('Helvetica-Bold')
        .fontSize(7)
        .fillColor('#ffffff')
        .text(`Ph: ${officialPhone}`, phoneBoxX, phoneBoxY + 2.5, {
          width: phoneBoxWidth,
          align: 'center'
        });

      // Optional GSTIN Tag
      if (gstin && gstin.trim()) {
        const gstinBoxX = phoneBoxX + phoneBoxWidth + 6;
        const gstinBoxWidth = 95;
        doc
          .roundedRect(gstinBoxX, phoneBoxY, gstinBoxWidth, phoneBoxHeight, 2.5)
          .fill(colorEmerald);

        doc
          .font('Helvetica-Bold')
          .fontSize(6.5)
          .fillColor('#ffffff')
          .text(`GST: ${gstin}`, gstinBoxX, phoneBoxY + 2.5, {
            width: gstinBoxWidth,
            align: 'center'
          });
      }

      // Right-aligned Document Meta Badge
      const metaBoxWidth = 150;
      const metaBoxX = rightMargin - metaBoxWidth;

      doc
        .roundedRect(metaBoxX, currentY, metaBoxWidth, 20, 3)
        .fill(colorEmerald);

      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor('#ffffff')
        .text('FIXED DEPOSIT RECEIPT', metaBoxX, currentY + 5.5, {
          width: metaBoxWidth,
          align: 'center'
        });

      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor(colorEmerald)
        .text(`RECEIPT #${fd.receiptNumber || 'FD-RCPT-001'}`, metaBoxX, currentY + 26, {
          width: metaBoxWidth,
          align: 'right'
        });

      currentY += 52;

      // Decorative Divider Line
      doc
        .strokeColor(colorEmerald)
        .lineWidth(1.5)
        .moveTo(leftMargin, currentY)
        .lineTo(rightMargin, currentY)
        .stroke();

      currentY += 10;

      // ── 2. METADATA SUMMARY BAR ──────────────────────────────────────────────
      const metaBarHeight = 32;
      doc
        .roundedRect(leftMargin, currentY, contentWidth, metaBarHeight, 4)
        .fillAndStroke(colorLightBg, colorBorder);

      const colW = contentWidth / 2;
      const receiptDate = fd.receiptGeneratedAt
        ? new Date(fd.receiptGeneratedAt).toLocaleDateString('en-GB').replace(/\//g, '-')
        : fd.depositDate;

      // Left Box: FD No & Receipt No
      const leftBoxX = leftMargin + 10;
      doc
        .font('Helvetica')
        .fontSize(6.5)
        .fillColor(colorMuted)
        .text('FD NUMBER', leftBoxX, currentY + 5)
        .font('Helvetica-Bold')
        .fontSize(8.5)
        .fillColor(colorEmerald)
        .text(fd.fdNo, leftBoxX, currentY + 16);

      const leftBox2X = leftMargin + 110;
      doc
        .font('Helvetica')
        .fontSize(6.5)
        .fillColor(colorMuted)
        .text('RECEIPT NUMBER', leftBox2X, currentY + 5)
        .font('Helvetica-Bold')
        .fontSize(9.5)
        .fillColor(colorEmerald)
        .text(fd.receiptNumber || 'FD-RCPT-001', leftBox2X, currentY + 16);

      // Right Box: Deposit Date, Receipt Date, Maturity Date
      const rightColW = (colW - 20) / 3;
      const r1X = leftMargin + colW + 10;
      const r2X = r1X + rightColW;
      const r3X = r2X + rightColW;

      doc
        .font('Helvetica')
        .fontSize(6.5)
        .fillColor(colorMuted)
        .text('DEPOSIT DATE', r1X, currentY + 5)
        .font('Helvetica-Bold')
        .fontSize(8.5)
        .fillColor(colorDark)
        .text(fd.depositDate, r1X, currentY + 16);

      doc
        .font('Helvetica')
        .fontSize(6.5)
        .fillColor(colorMuted)
        .text('RECEIPT DATE', r2X, currentY + 5)
        .font('Helvetica-Bold')
        .fontSize(8.5)
        .fillColor(colorDark)
        .text(receiptDate, r2X, currentY + 16);

      doc
        .font('Helvetica')
        .fontSize(6.5)
        .fillColor(colorMuted)
        .text('MATURITY DATE', r3X, currentY + 5)
        .font('Helvetica-Bold')
        .fontSize(8.5)
        .fillColor(colorSuccessText)
        .text(fd.maturityDate, r3X, currentY + 16);

      currentY += metaBarHeight + 12;

      // ── 3. CUSTOMER DETAILS CARD ────────────────────────────────────────────
      const custCardHeight = 62;
      doc
        .roundedRect(leftMargin, currentY, contentWidth, custCardHeight, 4)
        .fillAndStroke('#ffffff', colorBorder);

      // Card Header Tag
      doc
        .font('Helvetica-Bold')
        .fontSize(8)
        .fillColor(colorEmerald)
        .text('CUSTOMER INFORMATION', leftMargin + 10, currentY + 8);

      const custName = customer?.name || fd.depositorName;
      const custId = customer?.id || fd.customerId;
      const custPhone = customer?.phone || fd.phone;
      const custAddr = customer?.currentAddress || fd.address || 'Address on record';
      const nomineeStr = fd.nomineeName
        ? `${fd.nomineeName}${fd.nomineeRelation ? ` (${fd.nomineeRelation})` : ''}`
        : 'Not Specified';

      const custRow1Y = currentY + 22;
      const custRow2Y = currentY + 40;

      // Row 1: Name, ID, Mobile
      doc
        .font('Helvetica')
        .fontSize(7)
        .fillColor(colorMuted)
        .text('Customer Name:', leftMargin + 10, custRow1Y)
        .font('Helvetica-Bold')
        .fontSize(8.5)
        .fillColor(colorDark)
        .text(custName, leftMargin + 76, custRow1Y);

      doc
        .font('Helvetica')
        .fontSize(7)
        .fillColor(colorMuted)
        .text('Customer ID:', leftMargin + 240, custRow1Y)
        .font('Helvetica-Bold')
        .fontSize(8.5)
        .fillColor(colorEmerald)
        .text(custId, leftMargin + 295, custRow1Y);

      doc
        .font('Helvetica')
        .fontSize(7)
        .fillColor(colorMuted)
        .text('Mobile Number:', leftMargin + 380, custRow1Y)
        .font('Helvetica-Bold')
        .fontSize(8.5)
        .fillColor(colorDark)
        .text(`+91 ${custPhone}`, leftMargin + 442, custRow1Y);

      // Row 2: Address, Nominee
      doc
        .font('Helvetica')
        .fontSize(7)
        .fillColor(colorMuted)
        .text('Address:', leftMargin + 10, custRow2Y)
        .font('Helvetica')
        .fontSize(7.5)
        .fillColor(colorDark)
        .text(custAddr, leftMargin + 50, custRow2Y, { width: 230, height: 16, ellipsis: true });

      doc
        .font('Helvetica')
        .fontSize(7)
        .fillColor(colorMuted)
        .text('Nominee:', leftMargin + 300, custRow2Y)
        .font('Helvetica-Bold')
        .fontSize(7.5)
        .fillColor(colorDark)
        .text(nomineeStr, leftMargin + 345, custRow2Y, { width: 170, height: 16, ellipsis: true });

      currentY += custCardHeight + 12;

      // ── 4. FIXED DEPOSIT TERMS & FINANCIAL BREAKDOWN ────────────────────────
      doc
        .font('Helvetica-Bold')
        .fontSize(8.5)
        .fillColor(colorEmerald)
        .text('DEPOSIT CONTRACT DETAILS', leftMargin, currentY);

      currentY += 12;

      // Table Header
      const thHeight = 18;
      doc
        .roundedRect(leftMargin, currentY, contentWidth, thHeight, 2)
        .fill(colorEmerald);

      doc
        .font('Helvetica-Bold')
        .fontSize(7.5)
        .fillColor('#ffffff')
        .text('PARAMETER', leftMargin + 10, currentY + 5, { width: 250 })
        .text('DETAILS', leftMargin + 270, currentY + 5, { width: 240, align: 'right' });

      currentY += thHeight;

      const tenure = fd.tenureMonths || 12;
      const totalExpectedInterest = (fd.monthlyPayout || 0) * tenure;
      const expectedMaturity = fd.principal + totalExpectedInterest;

      const depositRows = [
        { label: 'Deposit Principal Amount (Original Investment)', val: `Rs. ${fd.principal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, bold: true, highlight: true },
        { label: 'Annual Interest Rate (% Per Annum)', val: `${Number(fd.interestRatePA).toFixed(2)}% p.a.`, bold: true },
        { label: 'Deposit Tenure', val: `${tenure} Months`, bold: false },
        { label: 'Interest Payout Frequency', val: 'Monthly', bold: false },
        { label: 'Monthly Interest Payout', val: `Rs. ${(fd.monthlyPayout || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / month`, bold: true, color: colorSuccessText },
        { label: 'Expected Total Interest', val: `Rs. ${totalExpectedInterest.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, bold: false },
        { label: 'Expected Maturity Value', val: `Rs. ${expectedMaturity.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, bold: true, color: colorEmerald },
        { label: 'Deposit / Receiving Mode', val: `${fd.receivingMethod || 'Cash'} Account`, bold: false },
        { label: 'Deposit Status', val: `${fd.status || 'ACTIVE'}`, bold: true, color: fd.status === 'ACTIVE' ? colorSuccessText : colorDark }
      ];

      depositRows.forEach((r, idx) => {
        const rowBg = idx % 2 === 0 ? '#ffffff' : colorLightBg;
        const rowH = 18;

        doc
          .rect(leftMargin, currentY, contentWidth, rowH)
          .fillAndStroke(rowBg, colorBorder);

        doc
          .font('Helvetica')
          .fontSize(7.5)
          .fillColor(colorDark)
          .text(r.label, leftMargin + 10, currentY + 5, { width: 280 });

        doc
          .font(r.bold ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(r.highlight ? 8.5 : 7.5)
          .fillColor(r.color || colorDark)
          .text(r.val, leftMargin + 290, currentY + 5, { width: 220, align: 'right' });

        currentY += rowH;
      });

      currentY += 12;

      // ── 5. HIGHLIGHT SUMMARY BOX ─────────────────────────────────────────────
      const summaryBoxHeight = 36;
      doc
        .roundedRect(leftMargin, currentY, contentWidth, summaryBoxHeight, 4)
        .fillAndStroke(colorLightBg, colorBorder);

      const sumColW = contentWidth / 3;
      // Col 1: Deposit Principal
      doc
        .font('Helvetica-Bold')
        .fontSize(6.5)
        .fillColor(colorMuted)
        .text('DEPOSIT PRINCIPAL', leftMargin + 12, currentY + 6)
        .font('Helvetica-Bold')
        .fontSize(11.5)
        .fillColor(colorDark)
        .text(`Rs. ${fd.principal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, leftMargin + 12, currentY + 17);

      // Col 2: Total Interest
      doc
        .font('Helvetica-Bold')
        .fontSize(6.5)
        .fillColor(colorMuted)
        .text('TOTAL INTEREST', leftMargin + sumColW + 12, currentY + 6)
        .font('Helvetica-Bold')
        .fontSize(11.5)
        .fillColor(colorSuccessText)
        .text(`Rs. ${totalExpectedInterest.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, leftMargin + sumColW + 12, currentY + 17);

      // Col 3: Maturity Value
      doc
        .font('Helvetica-Bold')
        .fontSize(6.5)
        .fillColor(colorEmerald)
        .text('MATURITY VALUE', leftMargin + 2 * sumColW + 12, currentY + 6)
        .font('Helvetica-Bold')
        .fontSize(12)
        .fillColor(colorEmerald)
        .text(`Rs. ${expectedMaturity.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, leftMargin + 2 * sumColW + 12, currentY + 17);

      currentY += summaryBoxHeight + 14;

      // ── 6. TERMS & CONDITIONS ────────────────────────────────────────────────
      doc
        .font('Helvetica-Bold')
        .fontSize(7)
        .fillColor(colorDark)
        .text('TERMS & CONDITIONS:', leftMargin, currentY);

      currentY += 9;

      const terms = [
        '1. Interest is payable monthly on or before the due date as per the agreed payout method.',
        '2. Premature withdrawal or partial liquidation is subject to company rules, deduction of applicable processing charges, and branch approval.',
        '3. This Fixed Deposit Certificate / Bill Receipt must be presented in original at the time of maturity settlement or liquidation.'
      ];

      terms.forEach((t) => {
        doc
          .font('Helvetica')
          .fontSize(6.5)
          .fillColor(colorMuted)
          .text(t, leftMargin + 6, currentY, { width: contentWidth - 12 });
        currentY += 9;
      });

      currentY += 12;

      // ── 7. THREE-COLUMN SIGNATURE SECTION ───────────────────────────────────
      const sigSectionY = currentY + 6;
      const sigBlockW = (contentWidth - 40) / 3;

      // 1. Customer Signature
      const sig1X = leftMargin + 8;
      doc
        .strokeColor(colorBorder)
        .lineWidth(0.8)
        .moveTo(sig1X, sigSectionY + 28)
        .lineTo(sig1X + sigBlockW, sigSectionY + 28)
        .stroke();

      doc
        .font('Helvetica-Bold')
        .fontSize(7.5)
        .fillColor(colorDark)
        .text('Customer Signature', sig1X, sigSectionY + 32, { width: sigBlockW, align: 'center' });

      doc
        .font('Helvetica')
        .fontSize(6.5)
        .fillColor(colorMuted)
        .text('Acknowledged & Verified', sig1X, sigSectionY + 42, { width: sigBlockW, align: 'center' });

      // 2. Authorized Staff Signature
      const sig2X = sig1X + sigBlockW + 12;
      doc
        .strokeColor(colorBorder)
        .lineWidth(0.8)
        .moveTo(sig2X, sigSectionY + 28)
        .lineTo(sig2X + sigBlockW, sigSectionY + 28)
        .stroke();

      doc
        .font('Helvetica-Bold')
        .fontSize(7.5)
        .fillColor(colorDark)
        .text('Authorized Staff', sig2X, sigSectionY + 32, { width: sigBlockW, align: 'center' });

      doc
        .font('Helvetica')
        .fontSize(6.5)
        .fillColor(colorMuted)
        .text('Entered & Processed by', sig2X, sigSectionY + 42, { width: sigBlockW, align: 'center' });

      // 3. Branch / Manager Signature
      const sig3X = sig2X + sigBlockW + 12;
      doc
        .strokeColor(colorBorder)
        .lineWidth(0.8)
        .moveTo(sig3X, sigSectionY + 28)
        .lineTo(sig3X + sigBlockW, sigSectionY + 28)
        .stroke();

      doc
        .font('Helvetica-Bold')
        .fontSize(7.5)
        .fillColor(colorDark)
        .text(`For ${businessTitle}`, sig3X, sigSectionY + 32, { width: sigBlockW, align: 'center' });

      doc
        .font('Helvetica')
        .fontSize(6.5)
        .fillColor(colorMuted)
        .text('Branch Manager / Signatory', sig3X, sigSectionY + 42, { width: sigBlockW, align: 'center' });

      // ── 8. FOOTER ────────────────────────────────────────────────────────────
      const footerY = sigSectionY + 62;
      doc
        .strokeColor(colorBorder)
        .lineWidth(0.5)
        .moveTo(leftMargin, footerY)
        .lineTo(rightMargin, footerY)
        .stroke();

      doc
        .font('Helvetica')
        .fontSize(6.5)
        .fillColor(colorMuted)
        .text(
          `This is a computer-generated official Fixed Deposit Receipt & Certificate issued by ${businessTitle}.`,
          leftMargin,
          footerY + 5,
          { width: contentWidth, align: 'center' }
        );

      doc.end();
    });
  }

  /**
   * Generates a sanitized professional filename for the FD interest receipt PDF voucher
   */
  public generateFDInterestFilename(payout: FDInterestPayout): string {
    const vNo = payout.voucherNumber || payout.id;
    const fdNo = payout.fdNo || 'FD';
    const rawCustomer = payout.depositorName || 'CUSTOMER';
    const sanitizedCustomer = rawCustomer
      .replace(/[^a-zA-Z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toUpperCase();

    return `KKV-FD-Interest-Receipt-${vNo}-${fdNo}-${sanitizedCustomer}.pdf`;
  }

  /**
   * Generates an official A4 Fixed Deposit Interest Payment Receipt PDF buffer
   */
  public async generateFDInterestReceiptPdfBuffer(options: FDInterestReceiptPdfOptions): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const { payout, fd, customer } = options;
      const chunks: Buffer[] = [];

      // Resolve Dynamic Central Branch Settings
      const branchSettings: BranchSettings = {
        ...DEFAULT_BRANCH_SETTINGS,
        ...(adminService.getMasterSettings()?.branchSettings || {}),
        ...(options.branchSettings || {})
      };

      const businessTitle = branchSettings.businessTitle || COMPANY_CONFIG.businessName;
      const branchAddress = branchSettings.branchAddress || COMPANY_CONFIG.address;
      const officialPhone = branchSettings.officialPhone || COMPANY_CONFIG.phone;
      const gstin = branchSettings.gstin;

      // A4 page setup (595.28 x 841.89 points) with 36pt margins
      const doc = new PDFDocument({
        size: 'A4',
        margin: 36,
        info: {
          Title: `${businessTitle} - Interest Receipt ${payout.voucherNumber || payout.id}`,
          Author: `${businessTitle} & Term Deposit Management`,
          Subject: `Official Fixed Deposit Interest Payment Receipt for ${payout.fdNo}`,
          Keywords: 'KKV Finance, Fixed Deposit, Interest, Receipt, Voucher',
          CreationDate: new Date()
        }
      });

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));

      const pageWidth = 595.28;
      const leftMargin = 36;
      const rightMargin = pageWidth - 36;
      const contentWidth = rightMargin - leftMargin; // 523.28 pt

      // ── COLOR PALETTE ────────────────────────────────────────────────────────
      const colorEmerald = '#064e3b';
      const colorGold = '#b45309';
      const colorDark = '#0f172a';
      const colorMuted = '#64748b';
      const colorLightBg = '#f8fafc';
      const colorBorder = '#cbd5e1';
      const colorSuccessBg = '#ecfdf5';
      const colorSuccessText = '#047857';

      let currentY = 36;

      // ── 1. HEADER SECTION ───────────────────────────────────────────────────
      const logoPath = this.findLogoPath();
      if (logoPath) {
        try {
          doc.image(logoPath, leftMargin, currentY, { width: 44, height: 44 });
        } catch {
          doc.rect(leftMargin, currentY, 44, 44).fillAndStroke(colorEmerald, colorGold);
        }
      }

      // Company Title & Info
      const headerTextX = logoPath ? leftMargin + 52 : leftMargin;
      doc
        .font('Helvetica-Bold')
        .fontSize(15)
        .fillColor(colorEmerald)
        .text(businessTitle, headerTextX, currentY);

      // Uppercase Address
      doc
        .font('Helvetica-Bold')
        .fontSize(7.5)
        .fillColor(colorDark)
        .text(branchAddress.toUpperCase(), headerTextX, currentY + 18, {
          width: contentWidth - (logoPath ? 52 : 0) - 150
        });

      // Phone Box
      const phoneBoxX = headerTextX;
      const phoneBoxY = currentY + 31;
      const phoneBoxWidth = 84;
      const phoneBoxHeight = 12;

      doc
        .roundedRect(phoneBoxX, phoneBoxY, phoneBoxWidth, phoneBoxHeight, 2.5)
        .fill('#dc2626');

      doc
        .font('Helvetica-Bold')
        .fontSize(7)
        .fillColor('#ffffff')
        .text(`Ph: ${officialPhone}`, phoneBoxX, phoneBoxY + 2.5, {
          width: phoneBoxWidth,
          align: 'center'
        });

      // Optional GSTIN Tag
      if (gstin && gstin.trim()) {
        const gstinBoxX = phoneBoxX + phoneBoxWidth + 6;
        const gstinBoxWidth = 95;
        doc
          .roundedRect(gstinBoxX, phoneBoxY, gstinBoxWidth, phoneBoxHeight, 2.5)
          .fill(colorEmerald);

        doc
          .font('Helvetica-Bold')
          .fontSize(6.5)
          .fillColor('#ffffff')
          .text(`GST: ${gstin}`, gstinBoxX, phoneBoxY + 2.5, {
            width: gstinBoxWidth,
            align: 'center'
          });
      }

      // Right-aligned Document Meta Badge
      const metaBoxWidth = 160;
      const metaBoxX = rightMargin - metaBoxWidth;

      doc
        .roundedRect(metaBoxX, currentY, metaBoxWidth, 20, 3)
        .fill(colorEmerald);

      doc
        .font('Helvetica-Bold')
        .fontSize(8.5)
        .fillColor('#ffffff')
        .text('FD INTEREST PAYMENT RECEIPT', metaBoxX, currentY + 5.5, {
          width: metaBoxWidth,
          align: 'center'
        });

      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor(colorEmerald)
        .text(`VOUCHER #${payout.voucherNumber || payout.id}`, metaBoxX, currentY + 26, {
          width: metaBoxWidth,
          align: 'right'
        });

      currentY += 52;

      // Decorative Divider Line
      doc
        .strokeColor(colorEmerald)
        .lineWidth(1.5)
        .moveTo(leftMargin, currentY)
        .lineTo(rightMargin, currentY)
        .stroke();

      currentY += 10;

      // ── 2. METADATA SUMMARY STRIP ────────────────────────────────────────────
      const metaBarHeight = 32;
      doc
        .roundedRect(leftMargin, currentY, contentWidth, metaBarHeight, 4)
        .fillAndStroke(colorLightBg, colorBorder);

      const colW = contentWidth / 4;
      const periodText = payout.periodLabel || payout.dueDate || payout.periodKey || 'Monthly Payout';
      const metaItems = [
        { label: 'VOUCHER NUMBER', value: payout.voucherNumber || payout.id, isBold: true, color: colorEmerald },
        { label: 'FD NUMBER', value: payout.fdNo, isBold: true, color: colorDark },
        { label: 'PAYMENT DATE', value: payout.date, isBold: true, color: colorDark },
        { label: 'INTEREST PERIOD', value: periodText, isBold: true, color: colorEmerald }
      ];

      metaItems.forEach((item, idx) => {
        const itemX = leftMargin + idx * colW + 8;
        doc
          .font('Helvetica')
          .fontSize(6.5)
          .fillColor(colorMuted)
          .text(item.label, itemX, currentY + 5);

        doc
          .font(item.isBold ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(8.5)
          .fillColor(item.color)
          .text(item.value, itemX, currentY + 16, { width: colW - 12, height: 14, ellipsis: true });
      });

      currentY += metaBarHeight + 12;

      // ── 3. CUSTOMER DETAILS CARD ────────────────────────────────────────────
      const custCardHeight = 52;
      doc
        .roundedRect(leftMargin, currentY, contentWidth, custCardHeight, 4)
        .fillAndStroke('#ffffff', colorBorder);

      doc
        .font('Helvetica-Bold')
        .fontSize(8)
        .fillColor(colorEmerald)
        .text('DEPOSITOR & CUSTOMER DETAILS', leftMargin + 10, currentY + 7);

      const custName = customer?.name || payout.depositorName;
      const custId = customer?.id || payout.customerId || fd?.customerId || '—';
      const custPhone = customer?.phone || payout.customerPhone || fd?.phone || '—';
      const custAddr = customer?.currentAddress || payout.customerAddress || fd?.address || 'Address on record';

      const custRow1Y = currentY + 20;
      const custRow2Y = currentY + 35;

      // Row 1: Name, ID, Mobile
      doc
        .font('Helvetica')
        .fontSize(7)
        .fillColor(colorMuted)
        .text('Depositor Name:', leftMargin + 10, custRow1Y)
        .font('Helvetica-Bold')
        .fontSize(8.5)
        .fillColor(colorDark)
        .text(custName, leftMargin + 76, custRow1Y);

      doc
        .font('Helvetica')
        .fontSize(7)
        .fillColor(colorMuted)
        .text('Customer ID:', leftMargin + 240, custRow1Y)
        .font('Helvetica-Bold')
        .fontSize(8.5)
        .fillColor(colorEmerald)
        .text(custId, leftMargin + 295, custRow1Y);

      doc
        .font('Helvetica')
        .fontSize(7)
        .fillColor(colorMuted)
        .text('Mobile Number:', leftMargin + 380, custRow1Y)
        .font('Helvetica-Bold')
        .fontSize(8.5)
        .fillColor(colorDark)
        .text(`+91 ${custPhone}`, leftMargin + 442, custRow1Y);

      // Row 2: Address
      doc
        .font('Helvetica')
        .fontSize(7)
        .fillColor(colorMuted)
        .text('Address:', leftMargin + 10, custRow2Y)
        .font('Helvetica')
        .fontSize(7.5)
        .fillColor(colorDark)
        .text(custAddr, leftMargin + 50, custRow2Y, { width: contentWidth - 70, height: 14, ellipsis: true });

      currentY += custCardHeight + 12;

      // ── 4. INTEREST FINANCIAL BREAKDOWN TABLE ────────────────────────────────
      doc
        .font('Helvetica-Bold')
        .fontSize(8.5)
        .fillColor(colorEmerald)
        .text('INTEREST SETTLEMENT & TRANSACTION BREAKDOWN', leftMargin, currentY);

      currentY += 12;

      // Table Header
      const thHeight = 18;
      doc
        .roundedRect(leftMargin, currentY, contentWidth, thHeight, 2)
        .fill(colorEmerald);

      doc
        .font('Helvetica-Bold')
        .fontSize(7.5)
        .fillColor('#ffffff')
        .text('TRANSACTION PARAMETER', leftMargin + 10, currentY + 5, { width: 250 })
        .text('SETTLEMENT VALUE & PARTICULARS', leftMargin + 270, currentY + 5, { width: 240, align: 'right' });

      currentY += thHeight;

      const principal = payout.principalAtPayment ?? (fd?.remainingPrincipal ?? fd?.principal ?? 0);
      const rate = payout.interestRatePA ?? (fd?.interestRatePA ?? 12);
      const monthlyYield = payout.monthlyPayout ?? (fd?.monthlyPayout ?? Math.round((principal * rate) / 1200));
      const earned = payout.earnedInterest ?? payout.amount;
      const pendingBefore = payout.pendingInterestBefore ?? payout.amount;
      const pendingAfter = payout.pendingInterestAfter ?? Math.max(0, pendingBefore - payout.amount);

      let modeDetails = `${payout.mode || 'Cash'} Account`;
      if (payout.bankName) modeDetails += ` (${payout.bankName})`;
      if (payout.transactionReference) modeDetails += ` - Ref: ${payout.transactionReference}`;
      if (payout.upiId) modeDetails += ` - UPI: ${payout.upiId}`;

      const interestRows = [
        { label: 'Active Deposit Principal Base', val: `Rs. ${principal.toLocaleString('en-IN')}`, bold: true },
        { label: 'Contractual Interest Rate (% Per Annum)', val: `${rate}% p.a.`, bold: true },
        { label: 'Monthly Interest Commitment', val: `Rs. ${monthlyYield.toLocaleString('en-IN')} / month`, bold: false },
        { label: 'Billing Period / Cycle Covered', val: periodText, bold: false },
        { label: 'Interest Accrued / Due for Cycle', val: `Rs. ${earned.toLocaleString('en-IN')}`, bold: false },
        { label: 'Pending Interest Balance Before Payment', val: `Rs. ${pendingBefore.toLocaleString('en-IN')}`, bold: false },
        { label: 'Interest Amount Disbursed / Paid (This Voucher)', val: `Rs. ${payout.amount.toLocaleString('en-IN')}`, bold: true, color: colorSuccessText, highlight: true },
        { label: 'Remaining Pending Interest Balance', val: `Rs. ${pendingAfter.toLocaleString('en-IN')}`, bold: true, color: pendingAfter > 0 ? colorGold : colorSuccessText },
        { label: 'Payment Disbursement Mode', val: modeDetails, bold: false },
        { label: 'Payment Status', val: `${payout.status || 'PAID'}`, bold: true, color: colorSuccessText }
      ];

      interestRows.forEach((r, idx) => {
        const rowBg = idx % 2 === 0 ? '#ffffff' : colorLightBg;
        const rowH = 17;

        doc
          .rect(leftMargin, currentY, contentWidth, rowH)
          .fillAndStroke(rowBg, colorBorder);

        doc
          .font('Helvetica')
          .fontSize(7.5)
          .fillColor(colorDark)
          .text(r.label, leftMargin + 10, currentY + 4.5, { width: 280 });

        doc
          .font(r.bold ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(r.highlight ? 8.5 : 7.5)
          .fillColor(r.color || colorDark)
          .text(r.val, leftMargin + 270, currentY + 4.5, { width: 240, align: 'right' });

        currentY += rowH;
      });

      currentY += 12;

      // ── 5. HIGHLIGHT TOTAL PAID BOX ──────────────────────────────────────────
      const summaryBoxHeight = 36;
      doc
        .roundedRect(leftMargin, currentY, contentWidth, summaryBoxHeight, 4)
        .fillAndStroke(colorSuccessBg, '#a7f3d0');

      const sumColW = contentWidth / 3;
      // Col 1: Total Paid
      doc
        .font('Helvetica-Bold')
        .fontSize(6.5)
        .fillColor(colorMuted)
        .text('TOTAL INTEREST PAID', leftMargin + 12, currentY + 6)
        .font('Helvetica-Bold')
        .fontSize(13)
        .fillColor(colorEmerald)
        .text(`Rs. ${payout.amount.toLocaleString('en-IN')}`, leftMargin + 12, currentY + 17);

      // Col 2: Payment Mode
      doc
        .font('Helvetica-Bold')
        .fontSize(6.5)
        .fillColor(colorMuted)
        .text('PAYMENT MODE', leftMargin + sumColW + 12, currentY + 6)
        .font('Helvetica-Bold')
        .fontSize(11)
        .fillColor(colorDark)
        .text(`${payout.mode || 'Cash'}`, leftMargin + sumColW + 12, currentY + 17);

      // Col 3: Payment Date
      doc
        .font('Helvetica-Bold')
        .fontSize(6.5)
        .fillColor(colorMuted)
        .text('PAYMENT DATE', leftMargin + 2 * sumColW + 12, currentY + 6)
        .font('Helvetica-Bold')
        .fontSize(11)
        .fillColor(colorDark)
        .text(`${payout.date}`, leftMargin + 2 * sumColW + 12, currentY + 17);

      currentY += summaryBoxHeight + 14;

      // Remarks note if present
      if (payout.remarks && payout.remarks.trim()) {
        doc
          .font('Helvetica-Bold')
          .fontSize(7)
          .fillColor(colorDark)
          .text('REMARKS / TRANSACTION NOTES:', leftMargin, currentY);

        doc
          .font('Helvetica')
          .fontSize(6.5)
          .fillColor(colorMuted)
          .text(payout.remarks, leftMargin + 130, currentY, { width: contentWidth - 130 });

        currentY += 12;
      }

      // ── 6. ACCOUNTING & AUDIT NOTE ──────────────────────────────────────────
      doc
        .font('Helvetica-Bold')
        .fontSize(7)
        .fillColor(colorDark)
        .text('TERMS & AUDIT PARTICULARS:', leftMargin, currentY);

      currentY += 9;

      const terms = [
        '1. Interest payment has been recorded and debited from branch accounts under Account Head: Interest Paid.',
        '2. This voucher acknowledges the disbursement of term deposit dividend for the specified cycle period.',
        '3. Retain this payment receipt along with your original Fixed Deposit Certificate for taxation and audit purposes.'
      ];

      terms.forEach((t) => {
        doc
          .font('Helvetica')
          .fontSize(6.5)
          .fillColor(colorMuted)
          .text(t, leftMargin + 6, currentY, { width: contentWidth - 12 });
        currentY += 9;
      });

      currentY += 14;

      // ── 7. THREE-COLUMN SIGNATURE SECTION ───────────────────────────────────
      const sigSectionY = currentY + 6;
      const sigBlockW = (contentWidth - 40) / 3;

      // 1. Customer Signature
      const sig1X = leftMargin + 8;
      doc
        .strokeColor(colorBorder)
        .lineWidth(0.8)
        .moveTo(sig1X, sigSectionY + 28)
        .lineTo(sig1X + sigBlockW, sigSectionY + 28)
        .stroke();

      doc
        .font('Helvetica-Bold')
        .fontSize(7.5)
        .fillColor(colorDark)
        .text('Customer Signature', sig1X, sigSectionY + 32, { width: sigBlockW, align: 'center' });

      doc
        .font('Helvetica')
        .fontSize(6.5)
        .fillColor(colorMuted)
        .text('Received & Acknowledged', sig1X, sigSectionY + 42, { width: sigBlockW, align: 'center' });

      // 2. Authorized Staff Signature
      const sig2X = sig1X + sigBlockW + 12;
      doc
        .strokeColor(colorBorder)
        .lineWidth(0.8)
        .moveTo(sig2X, sigSectionY + 28)
        .lineTo(sig2X + sigBlockW, sigSectionY + 28)
        .stroke();

      doc
        .font('Helvetica-Bold')
        .fontSize(7.5)
        .fillColor(colorDark)
        .text('Authorized Staff', sig2X, sigSectionY + 32, { width: sigBlockW, align: 'center' });

      doc
        .font('Helvetica')
        .fontSize(6.5)
        .fillColor(colorMuted)
        .text('Disbursed & Processed by', sig2X, sigSectionY + 42, { width: sigBlockW, align: 'center' });

      // 3. Branch / Manager Signature
      const sig3X = sig2X + sigBlockW + 12;
      doc
        .strokeColor(colorBorder)
        .lineWidth(0.8)
        .moveTo(sig3X, sigSectionY + 28)
        .lineTo(sig3X + sigBlockW, sigSectionY + 28)
        .stroke();

      doc
        .font('Helvetica-Bold')
        .fontSize(7.5)
        .fillColor(colorDark)
        .text(`For ${businessTitle}`, sig3X, sigSectionY + 32, { width: sigBlockW, align: 'center' });

      doc
        .font('Helvetica')
        .fontSize(6.5)
        .fillColor(colorMuted)
        .text('Branch Manager / Signatory', sig3X, sigSectionY + 42, { width: sigBlockW, align: 'center' });

      // ── 8. FOOTER ────────────────────────────────────────────────────────────
      const footerY = sigSectionY + 62;
      doc
        .strokeColor(colorBorder)
        .lineWidth(0.5)
        .moveTo(leftMargin, footerY)
        .lineTo(rightMargin, footerY)
        .stroke();

      doc
        .font('Helvetica')
        .fontSize(6.5)
        .fillColor(colorMuted)
        .text(
          `This is a computer-generated official Fixed Deposit Interest Payment Voucher issued by ${businessTitle}.`,
          leftMargin,
          footerY + 5,
          { width: contentWidth, align: 'center' }
        );

      doc.end();
    });
  }
}

export const receiptPdfService = new ReceiptPdfService();
export default receiptPdfService;

