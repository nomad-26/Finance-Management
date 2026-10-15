import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Printer, ArrowLeft, Share2, CheckCircle2, Loader2, Download, Phone } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { KKVLogo } from '../components/common/KKVLogo';
import { apiService } from '../services/api';
import { COMPANY_CONFIG } from '../config/company';
import '../styles/ReceiptDisplay.css';

export const ReceiptDisplay: React.FC = () => {
  const { selectedReceipt, receipts, loans, branchSettings, setCurrentPage, showToast } = useApp();

  const [whatsappStatus, setWhatsappStatus] = useState<'idle' | 'generating' | 'opening' | 'success' | 'error'>('idle');
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  const businessTitle = branchSettings?.businessTitle || COMPANY_CONFIG.businessName;
  const branchAddress = branchSettings?.branchAddress || COMPANY_CONFIG.address;
  const officialPhone = branchSettings?.officialPhone || COMPANY_CONFIG.phone;
  const gstin = branchSettings?.gstin;

  const receipt = selectedReceipt || receipts[0];
  const associatedLoan = loans.find((l) => l.loanNo === receipt?.loanNo);

  const handlePrint = () => {
    window.print();
  };

  /**
   * Converts a Blob to a pure base64 string
   */
  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const res = reader.result as string;
        const base64 = res.includes(',') ? res.split(',')[1] : res;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  /**
   * Normalizes Indian mobile numbers into standard 91XXXXXXXXXX format
   */
  const normalizeWhatsAppNumber = (rawPhone?: string | null): string | null => {
    if (!rawPhone || typeof rawPhone !== 'string') return null;
    let digits = rawPhone.replace(/\D/g, '');
    if (!digits) return null;
    if (digits.startsWith('0') && digits.length === 11) digits = digits.slice(1);
    if (digits.length === 10 && /^[6-9]/.test(digits)) return `91${digits}`;
    if (digits.length === 12 && digits.startsWith('91')) return digits;
    if (digits.length >= 10 && digits.length <= 15) return digits;
    return null;
  };

  /**
   * Financial Resolution for Disbursement vs. Repayment
   */
  const isDisbursement = receipt?.kind === 'LOAN DISBURSEMENT' || receipt?.kind === 'NEW LOAN';

  const principal = receipt?.loanPrincipal !== undefined
    ? receipt.loanPrincipal
    : (associatedLoan?.principal || receipt?.principalComponent || receipt?.amount || 0);

  const interestRate = receipt?.interestRate !== undefined
    ? receipt.interestRate
    : (associatedLoan?.interestRate || 1.5);

  const hasAdvanceInterest = receipt?.deductAdvanceInterest !== undefined
    ? receipt.deductAdvanceInterest
    : Boolean(associatedLoan?.deductAdvanceInterest && (associatedLoan.advanceDays || 0) > 0);

  const advanceDays = receipt?.advanceDays !== undefined
    ? receipt.advanceDays
    : (associatedLoan?.advanceDays || (hasAdvanceInterest ? 30 : 0));

  const advanceInterestDeducted = receipt?.advanceInterestDeducted !== undefined
    ? receipt.advanceInterestDeducted
    : (receipt?.advanceInterestAmount !== undefined
        ? receipt.advanceInterestAmount
        : (hasAdvanceInterest
            ? (associatedLoan?.advanceInterestAmount || Math.round(principal * (interestRate / 100) * (advanceDays / 30)))
            : 0));

  const processingFee = receipt?.processingFee !== undefined
    ? receipt.processingFee
    : (receipt?.cardFee !== undefined
        ? receipt.cardFee
        : (associatedLoan?.cardFeeEnabled ? (associatedLoan.cardFee || 0) : 0));

  const totalDeductions = receipt?.totalDeductions !== undefined
    ? receipt.totalDeductions
    : ((hasAdvanceInterest ? advanceInterestDeducted : 0) + processingFee);

  const netDisbursed = receipt?.netDisbursedAmount !== undefined
    ? receipt.netDisbursedAmount
    : (isDisbursement && receipt?.amount !== principal && (receipt?.amount || 0) > 0
        ? receipt.amount
        : Math.max(0, principal - totalDeductions));

  /**
   * Direct PDF download
   */
  const handleDownloadPdf = async () => {
    if (!receipt) return;
    setIsDownloadingPdf(true);
    try {
      const blob = await apiService.downloadReceiptPdf(receipt.id || receipt.receiptNo);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `KKV-Finance-Receipt-${receipt.receiptNo}-${(receipt.customerName || 'Customer').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      showToast('Receipt PDF downloaded successfully.', 'success');
    } catch (err: any) {
      console.error('[ReceiptDisplay] PDF download error:', err);
      showToast(err?.message || 'Failed to download receipt PDF.', 'error');
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  /**
   * WhatsApp Voucher Workflow:
   * 1. Generates PDF voucher from backend.
   * 2. Saves PDF locally in Downloads/KKV Gold Finance/Receipts and reveals it in Windows Explorer.
   * 3. Opens customer's WhatsApp chat with prefilled professional message.
   * 4. Prompts user to attach the revealed PDF and send.
   */
  const handleWhatsAppShare = async () => {
    if (!receipt || whatsappStatus !== 'idle') return;

    const rawPhone = receipt.customerPhone || associatedLoan?.customerPhone;
    const normalizedPhone = normalizeWhatsAppNumber(rawPhone);

    if (!normalizedPhone) {
      showToast('Customer WhatsApp number is missing or invalid. Please verify phone number.', 'warning');
      return;
    }

    try {
      setWhatsappStatus('generating');

      // 1. Generate official vector A4 PDF voucher
      const receiptId = receipt.id || receipt.receiptNo;
      const blob = await apiService.downloadReceiptPdf(receiptId);

      const sanitizedCustomer = (receipt.customerName || 'Customer')
        .replace(/[^a-zA-Z0-9_-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .toUpperCase();
      const filename = `KKV-Finance-Receipt-${receipt.receiptNo}-${sanitizedCustomer}.pdf`;

      // 2. Save PDF and reveal in Windows Explorer (if Electron desktop) or browser download
      if (window.desktopAPI?.saveReceiptPdfAndReveal) {
        const base64Data = await blobToBase64(blob);
        await window.desktopAPI.saveReceiptPdfAndReveal(filename, base64Data);
      } else {
        // Browser fallback download
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }

      setWhatsappStatus('opening');

      // 3. Compose structured message
      let msg = '';
      if (isDisbursement) {
        msg =
          `Dear ${receipt.customerName},\n\n` +
          `Thank you for choosing ${businessTitle}.\n` +
          `Your Gold Loan #${receipt.loanNo} disbursement voucher #${receipt.receiptNo} details:\n\n` +
          `• Loan Principal: ₹${principal.toLocaleString('en-IN')}\n` +
          `• Interest Rate: ${interestRate}% per month\n` +
          (hasAdvanceInterest && advanceInterestDeducted > 0
            ? `• Advance Interest Deducted (${advanceDays} days): -₹${advanceInterestDeducted.toLocaleString('en-IN')}\n`
            : '') +
          (processingFee > 0
            ? `• Card Processing Fee: -₹${processingFee.toLocaleString('en-IN')}\n`
            : '') +
          (totalDeductions > 0
            ? `• Total Deductions: -₹${totalDeductions.toLocaleString('en-IN')}\n`
            : '') +
          `• NET DISBURSED AMOUNT: ₹${netDisbursed.toLocaleString('en-IN')}\n` +
          `• Disbursement Mode: ${receipt.paymentMode || 'Cash'}\n` +
          (receipt.nextDueDate || associatedLoan?.nextDueDate
            ? `• Next Payment Due Date: ${receipt.nextDueDate || associatedLoan?.nextDueDate}\n`
            : '') +
          `\nOfficial Disbursement Voucher is attached.\n\n` +
          `${businessTitle}\n` +
          `${branchAddress}\n` +
          `Ph: ${officialPhone}`;
      } else {
        msg =
          `Dear ${receipt.customerName},\n\n` +
          `Thank you for your payment at ${businessTitle}.\n` +
          `Receipt details for Loan #${receipt.loanNo}:\n\n` +
          `• Receipt No: #${receipt.receiptNo}\n` +
          `• Transaction Kind: ${receipt.kind}\n` +
          `• Date: ${receipt.date}\n` +
          `• Amount Received: ₹${receipt.amount.toLocaleString('en-IN')}\n` +
          `• Payment Mode: ${receipt.paymentMode}\n` +
          `• Remaining Principal: ₹${(receipt.outstandingAfter ?? associatedLoan?.outstandingPrincipal ?? 0).toLocaleString('en-IN')}\n` +
          (receipt.nextDueDate || associatedLoan?.nextDueDate
            ? `• Next Due Date: ${receipt.nextDueDate || associatedLoan?.nextDueDate}\n`
            : '') +
          `\nOfficial Payment Voucher is attached.\n\n` +
          `${businessTitle}\n` +
          `${branchAddress}\n` +
          `Ph: ${officialPhone}`;
      }

      // 4. Open WhatsApp
      const waUrl = `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(msg)}`;
      if (window.desktopAPI?.openExternal) {
        await window.desktopAPI.openExternal(waUrl);
      } else {
        window.open(waUrl, '_blank');
      }

      setWhatsappStatus('success');
      showToast(
        'Receipt PDF saved & folder opened! Please attach the PDF in WhatsApp and send.',
        'info'
      );

      setTimeout(() => {
        setWhatsappStatus('idle');
      }, 4500);
    } catch (err: any) {
      console.error('[ReceiptDisplay] WhatsApp share workflow error:', err);
      setWhatsappStatus('error');
      showToast(err?.message || 'Unable to generate receipt PDF or open WhatsApp.', 'error');
      setTimeout(() => {
        setWhatsappStatus('idle');
      }, 3500);
    }
  };

  if (!receipt) {
    return (
      <div className="page-content receipt-screen-container">
        <div className="space-y-6" style={{ width: '100%', maxWidth: '860px', margin: '0 auto' }}>
          <PageHeader
            title="Payment Voucher"
            breadcrumbs={[{ label: 'Home' }, { label: 'Receipts', onClick: () => setCurrentPage('all-receipts') }, { label: 'Voucher' }]}
          />
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center max-w-md mx-auto">
            <p className="text-slate-500 mb-4">No receipt selected or found.</p>
            <Button
              variant="primary"
              onClick={() => setCurrentPage('all-receipts')}
            >
              Back to All Receipts
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const balanceBeforeVal = receipt.outstandingBefore !== undefined
    ? receipt.outstandingBefore
    : (associatedLoan ? associatedLoan.outstandingPrincipal + receipt.amount : receipt.amount);
  const remainingBalanceVal = receipt.outstandingAfter !== undefined
    ? receipt.outstandingAfter
    : (associatedLoan ? associatedLoan.outstandingPrincipal : 0);

  return (
    <div className="page-content receipt-screen-container">
      <div className="receipt-page-wrapper">
        {/* Top Action Bar (Hidden on Print) */}
        <div className="no-print receipt-screen-header">
          <PageHeader
          title={`${isDisbursement ? 'Loan Disbursement Voucher' : 'Payment Voucher'} #${receipt.receiptNo}`}
          description={`Receipt issued to ${receipt.customerName} on ${receipt.date}`}
          breadcrumbs={[
            { label: 'Home' },
            { label: 'Receipts', onClick: () => setCurrentPage('all-receipts') },
            { label: `Receipt #${receipt.receiptNo}` }
          ]}
          action={
            <div className="receipt-action-btns">
              <Button
                variant="outline"
                size="sm"
                icon={<ArrowLeft className="w-4 h-4" />}
                onClick={() => setCurrentPage('all-receipts')}
              >
                Back to Receipts
              </Button>
              <Button
                variant="outline"
                size="sm"
                icon={isDownloadingPdf ? <Loader2 className="w-4 h-4 animate-spin text-slate-500" /> : <Download className="w-4 h-4 text-slate-600 dark:text-slate-300" />}
                disabled={isDownloadingPdf}
                onClick={handleDownloadPdf}
              >
                {isDownloadingPdf ? 'Downloading...' : 'PDF Voucher'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className={
                  whatsappStatus === 'success'
                    ? 'text-emerald-700 bg-emerald-50 border-emerald-400 dark:bg-emerald-950/40 dark:text-emerald-300'
                    : 'text-emerald-600 border-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
                }
                disabled={whatsappStatus === 'generating' || whatsappStatus === 'opening'}
                icon={
                  whatsappStatus === 'generating' || whatsappStatus === 'opening' ? (
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                  ) : whatsappStatus === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <Share2 className="w-4 h-4 text-emerald-500" />
                  )
                }
                onClick={handleWhatsAppShare}
              >
                {whatsappStatus === 'generating'
                  ? 'Generating PDF...'
                  : whatsappStatus === 'opening'
                  ? 'Opening WhatsApp...'
                  : whatsappStatus === 'success'
                  ? 'WhatsApp Ready'
                  : whatsappStatus === 'error'
                  ? 'Retry WhatsApp'
                  : 'WhatsApp Voucher'}
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={<Printer className="w-4 h-4" />}
                onClick={handlePrint}
              >
                Print Voucher
              </Button>
            </div>
          }
        />
      </div>

      {/* Official Financial Payment Voucher */}
      <div className="receipt-voucher receipt-print-area" id="receipt-print-target">
        {/* Company Header */}
        <div className="rv-header">
          <div className="rv-brand">
            <div className="rv-logo">
              <KKVLogo size={52} />
            </div>
            <div className="rv-company-info">
              <h1>{businessTitle}</h1>
              <div className="rv-header-address">{branchAddress.toUpperCase()}</div>
              <div className="rv-header-phone-row">
                <div className="rv-phone-box">
                  <Phone className="rv-phone-icon" size={12} />
                  <span>{officialPhone}</span>
                </div>
                {gstin && gstin.trim() && (
                  <div className="rv-phone-box" style={{ backgroundColor: '#064e3b', marginLeft: '6px' }}>
                    <span>GST: {gstin}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="rv-doc-meta">
            <div className="rv-receipt-no">RECEIPT #{receipt.receiptNo}</div>
            <div className="rv-date">Date: <strong>{receipt.date}</strong></div>
          </div>
        </div>

        {/* Customer & Loan Information Grid */}
        <div className="rv-info-grid">
          {/* Customer Details */}
          <div className="rv-info-block">
            <div className="rv-section-title">Customer Details</div>
            <div className="rv-field-row">
              <span className="rv-field-label">Customer Name</span>
              <span className="rv-field-val">{receipt.customerName}</span>
            </div>
            <div className="rv-field-row">
              <span className="rv-field-label">Customer ID</span>
              <span className="rv-field-val">{receipt.customerId}</span>
            </div>
            {(receipt.customerPhone || associatedLoan?.customerPhone) && (
              <div className="rv-field-row">
                <span className="rv-field-label">Contact Phone</span>
                <span className="rv-field-val">{receipt.customerPhone || associatedLoan?.customerPhone}</span>
              </div>
            )}
          </div>

          {/* Loan Details */}
          <div className="rv-info-block">
            <div className="rv-section-title">Loan Reference</div>
            <div className="rv-field-row">
              <span className="rv-field-label">Loan Reference</span>
              <span className="rv-field-val">{receipt.loanNo}</span>
            </div>
            <div className="rv-field-row">
              <span className="rv-field-label">Loan Type</span>
              <span className="rv-field-val">{receipt.loanType || 'Gold Loan'}</span>
            </div>
            <div className="rv-field-row">
              <span className="rv-field-label">Transaction Type</span>
              <span className="rv-field-val">{isDisbursement ? 'LOAN DISBURSEMENT' : receipt.kind}</span>
            </div>
          </div>
        </div>

        {/* Financial Breakdown Table */}
        {isDisbursement ? (
          /* LOAN DISBURSEMENT DEDUCTION BREAKDOWN TABLE */
          <div className="rv-table-wrap">
            <div className="rv-table-title">LOAN DISBURSEMENT &amp; DEDUCTION BREAKDOWN</div>
            <table className="rv-table">
              <thead>
                <tr>
                  <th className="col-desc">Description</th>
                  <th className="col-mode">Payment / Method</th>
                  <th className="col-amount">Amount (INR)</th>
                </tr>
              </thead>
              <tbody>
                {/* 1. Loan Principal Row */}
                <tr>
                  <td className="col-desc">
                    <div className="rv-item-name">Loan Principal</div>
                    <div className="rv-item-sub">Total sanctioned gold loan principal amount</div>
                  </td>
                  <td className="col-mode">
                    <span className="rv-mode-badge">{receipt.paymentMode || 'Cash'}</span>
                  </td>
                  <td className="col-amount">
                    <strong>₹{principal.toLocaleString('en-IN')}</strong>
                  </td>
                </tr>

                {/* 2. Advance Interest Deduction Row (if any) */}
                {hasAdvanceInterest && advanceInterestDeducted > 0 && (
                  <tr className="rv-row-deduction">
                    <td className="col-desc">
                      <div className="rv-item-name rv-deduction-name">Advance Interest Deduction</div>
                      <div className="rv-item-sub">
                        {interestRate}% per month × {advanceDays} days (Deducted at disbursement)
                      </div>
                    </td>
                    <td className="col-mode">
                      <span className="rv-deduct-badge">Deduction</span>
                    </td>
                    <td className="col-amount rv-deduction-val">
                      -₹{advanceInterestDeducted.toLocaleString('en-IN')}
                    </td>
                  </tr>
                )}

                {/* 3. Card / Processing Fee Row (if any) */}
                {processingFee > 0 && (
                  <tr className="rv-row-deduction">
                    <td className="col-desc">
                      <div className="rv-item-name rv-deduction-name">Card Processing Fee</div>
                      <div className="rv-item-sub">One-time loan card &amp; processing charges</div>
                    </td>
                    <td className="col-mode">
                      <span className="rv-deduct-badge">Deduction</span>
                    </td>
                    <td className="col-amount rv-deduction-val">
                      -₹{processingFee.toLocaleString('en-IN')}
                    </td>
                  </tr>
                )}

                {/* 4. Total Deductions Summary Row (if any deductions applied) */}
                {totalDeductions > 0 && (
                  <tr className="rv-subtotal-row">
                    <td colSpan={2} className="rv-subtotal-label">
                      TOTAL DEDUCTIONS
                    </td>
                    <td className="rv-subtotal-amount">
                      -₹{totalDeductions.toLocaleString('en-IN')}
                    </td>
                  </tr>
                )}

                {/* 5. Net Disbursed Amount (Prominent Hero Row) */}
                <tr className="rv-total-row rv-disbursed-row">
                  <td colSpan={2} className="rv-total-label">
                    <div className="rv-disbursed-title">NET DISBURSED AMOUNT</div>
                    <div className="rv-disbursed-sub">Actual amount paid to borrower at disbursement</div>
                  </td>
                  <td className="rv-total-amount rv-disbursed-val">
                    ₹{netDisbursed.toLocaleString('en-IN')}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Payment Reference Metadata */}
            {(receipt.transactionReference || receipt.bankName || receipt.upiId || receipt.processedBy) && (
              <div className="rv-tx-strip">
                {receipt.bankName && (
                  <div className="rv-tx-strip-item">
                    <span>Bank:</span>
                    <strong>{receipt.bankName}</strong>
                  </div>
                )}
                {receipt.transactionReference && (
                  <div className="rv-tx-strip-item">
                    <span>Ref / UTR:</span>
                    <strong>{receipt.transactionReference}</strong>
                  </div>
                )}
                {receipt.upiId && (
                  <div className="rv-tx-strip-item">
                    <span>UPI ID:</span>
                    <strong>{receipt.upiId}</strong>
                  </div>
                )}
                {receipt.processedBy && (
                  <div className="rv-tx-strip-item">
                    <span>Processed By:</span>
                    <strong>{receipt.processedBy}</strong>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          /* REGULAR REPAYMENT / MONTHLY INTEREST TABLE */
          <div className="rv-table-wrap">
            <table className="rv-table">
              <thead>
                <tr>
                  <th className="col-desc">Description</th>
                  <th className="col-mode">Payment Mode</th>
                  <th className="col-amount">Amount (INR)</th>
                </tr>
              </thead>
              <tbody>
                {receipt.principalComponent > 0 && (
                  <tr>
                    <td className="col-desc">
                      <div className="rv-item-name">Principal Repayment Component</div>
                      <div className="rv-item-sub">Direct reduction of outstanding loan balance</div>
                    </td>
                    <td className="col-mode">
                      <span className="rv-mode-badge">{receipt.paymentMode}</span>
                    </td>
                    <td className="col-amount">
                      <strong>₹{receipt.principalComponent.toLocaleString('en-IN')}</strong>
                    </td>
                  </tr>
                )}

                {receipt.interestComponent > 0 && (
                  <tr>
                    <td className="col-desc">
                      <div className="rv-item-name">Monthly Interest Payment</div>
                      <div className="rv-item-sub">Pledge interest cleared for the billing period</div>
                    </td>
                    <td className="col-mode">
                      <span className="rv-mode-badge">{receipt.paymentMode}</span>
                    </td>
                    <td className="col-amount">
                      <strong>₹{receipt.interestComponent.toLocaleString('en-IN')}</strong>
                    </td>
                  </tr>
                )}

                {receipt.principalComponent === 0 && receipt.interestComponent === 0 && (
                  <tr>
                    <td className="col-desc">
                      <div className="rv-item-name">{receipt.kind} Payment / Settlement</div>
                      <div className="rv-item-sub">{receipt.notes || 'Gold pledge transaction payment'}</div>
                    </td>
                    <td className="col-mode">
                      <span className="rv-mode-badge">{receipt.paymentMode}</span>
                    </td>
                    <td className="col-amount">
                      <strong>₹{receipt.amount.toLocaleString('en-IN')}</strong>
                    </td>
                  </tr>
                )}

                {/* Total Row */}
                <tr className="rv-total-row">
                  <td colSpan={2} className="rv-total-label">
                    Net Received Total
                  </td>
                  <td className="rv-total-amount">
                    ₹{receipt.amount.toLocaleString('en-IN')}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Payment Reference Metadata */}
            {(receipt.transactionReference || receipt.bankName || receipt.upiId || receipt.processedBy) && (
              <div className="rv-tx-strip">
                {receipt.bankName && (
                  <div className="rv-tx-strip-item">
                    <span>Bank:</span>
                    <strong>{receipt.bankName}</strong>
                  </div>
                )}
                {receipt.transactionReference && (
                  <div className="rv-tx-strip-item">
                    <span>Ref / UTR:</span>
                    <strong>{receipt.transactionReference}</strong>
                  </div>
                )}
                {receipt.upiId && (
                  <div className="rv-tx-strip-item">
                    <span>UPI ID:</span>
                    <strong>{receipt.upiId}</strong>
                  </div>
                )}
                {receipt.processedBy && (
                  <div className="rv-tx-strip-item">
                    <span>Processed By:</span>
                    <strong>{receipt.processedBy}</strong>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Collateral & Loan Account Details */}
        <div className="rv-balance-grid">
          {/* Pledged Collateral Summary */}
          <div className="rv-box">
            <div className="rv-box-title">Pledged Collateral Summary</div>
            <div className="rv-balance-row">
              <span className="rv-balance-label">Pledged Items</span>
              <span className="rv-balance-val">
                {associatedLoan?.items?.map((i) => i.item).filter(Boolean).join(', ') || 'Gold Ornaments'}
              </span>
            </div>
            <div className="rv-balance-row">
              <span className="rv-balance-label">Total Net Weight</span>
              <span className="rv-balance-val">
                {associatedLoan?.totalNetWeight?.toFixed(3) ?? '0.000'} g
              </span>
            </div>
            {(associatedLoan?.marketValue || 0) > 0 && (
              <div className="rv-balance-row">
                <span className="rv-balance-label">Assessed Market Value</span>
                <span className="rv-balance-val">
                  ₹{(associatedLoan?.marketValue || 0).toLocaleString('en-IN')}
                </span>
              </div>
            )}
          </div>

          {/* Account Balance / Terms Summary */}
          {isDisbursement ? (
            <div className="rv-box">
              <div className="rv-box-title">Loan Terms &amp; Schedule</div>
              <div className="rv-balance-row">
                <span className="rv-balance-label">Sanctioned Principal</span>
                <span className="rv-balance-val">
                  ₹{principal.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="rv-balance-row">
                <span className="rv-balance-label">Interest Rate</span>
                <span className="rv-balance-val">
                  {interestRate}% per month
                </span>
              </div>
              <div className="rv-balance-row">
                <span className="rv-balance-label">Next Payment Due</span>
                <span className="rv-balance-val">
                  {receipt.nextDueDate || associatedLoan?.nextDueDate || receipt.date}
                </span>
              </div>
              <div className="rv-balance-row rv-balance-row--highlight">
                <span className="rv-balance-label" style={{ color: '#0f172a' }}>Active Outstanding</span>
                <span className="rv-balance-val rv-balance-val--primary">
                  ₹{principal.toLocaleString('en-IN')}
                </span>
              </div>
            </div>
          ) : (
            <div className="rv-box">
              <div className="rv-box-title">Loan Account Balance</div>
              <div className="rv-balance-row">
                <span className="rv-balance-label">Balance Before</span>
                <span className="rv-balance-val">
                  ₹{balanceBeforeVal.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="rv-balance-row">
                <span className="rv-balance-label">Amount Paid</span>
                <span className="rv-balance-val" style={{ color: '#047857' }}>
                  ₹{receipt.amount.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="rv-balance-row rv-balance-row--highlight">
                <span className="rv-balance-label" style={{ color: '#0f172a' }}>Remaining Balance</span>
                <span className="rv-balance-val rv-balance-val--primary">
                  ₹{remainingBalanceVal.toLocaleString('en-IN')}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Signatures Area */}
        <div className="rv-signature-row">
          <div className="rv-sig-block">
            <div className="rv-sig-line">Customer Signature</div>
            <div className="rv-sig-sub">Acknowledged &amp; Verified</div>
          </div>

          <div className="rv-sig-block">
            <div className="rv-sig-line">For {businessTitle}</div>
            <div className="rv-sig-sub">Authorized Signatory &amp; Seal</div>
          </div>
        </div>

        {/* System Footer */}
        <div className="rv-footer">
          <div className="rv-footer-note">
            This is a computer-generated official financial voucher issued by {businessTitle}. No signature revision required.
          </div>
        </div>
      </div>
    </div>
  </div>
);
};

