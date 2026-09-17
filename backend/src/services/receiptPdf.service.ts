import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { Receipt, Loan, Customer, BranchSettings } from '../types/index.js';
import { COMPANY_CONFIG, DEFAULT_BRANCH_SETTINGS } from '../config/company.config.js';
import { adminService } from './admin.service.js';

export interface ReceiptPdfOptions {
  receipt: Receipt;
  loan?: Loan | null;
  customer?: Customer | null;
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
}

export const receiptPdfService = new ReceiptPdfService();
export default receiptPdfService;

