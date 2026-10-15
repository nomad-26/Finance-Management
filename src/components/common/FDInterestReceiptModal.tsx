import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Printer, Download, Share2, X, Loader2 } from 'lucide-react';
import { FDInterestPayout, FixedDeposit, Customer } from '../../types';
import { COMPANY_CONFIG } from '../../config/company';
import { KKVLogo } from './KKVLogo';
import { apiService } from '../../services/api';
import { isMatchingCustomerId, getCanonicalCustomerId } from '../../utils/customerUtils';

interface FDInterestReceiptModalProps {
  payout: FDInterestPayout;
  fd?: FixedDeposit;
  onClose: () => void;
}

export const FDInterestReceiptModal: React.FC<FDInterestReceiptModalProps> = ({ payout, fd, onClose }) => {
  const { customers, branchSettings, showToast, fixedDeposits } = useApp();
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  const businessTitle = branchSettings?.businessTitle || COMPANY_CONFIG.businessName;
  const branchAddress = branchSettings?.branchAddress || COMPANY_CONFIG.address;
  const officialPhone = branchSettings?.officialPhone || COMPANY_CONFIG.phone;
  const gstin = branchSettings?.gstin;

  const targetFD = fd || fixedDeposits.find((f) => f.fdNo === payout.fdNo || f.id === payout.fdId);
  const matchedCustomer = customers.find((c: Customer) => isMatchingCustomerId(payout.customerId || targetFD?.customerId, c));
  const custName = payout.depositorName || matchedCustomer?.name || targetFD?.depositorName || 'Valued Customer';
  const custId = payout.customerId || (matchedCustomer ? getCanonicalCustomerId(matchedCustomer) : targetFD?.customerId || 'CUST-001');
  const custPhone = payout.customerPhone || matchedCustomer?.phone || targetFD?.phone || '';
  const custAddr = payout.customerAddress || matchedCustomer?.currentAddress || targetFD?.address || 'Address on record';

  const voucherNo = payout.voucherNumber || payout.payoutId || payout.id;
  const principal = payout.principalAtPayment ?? (targetFD?.remainingPrincipal ?? targetFD?.principal ?? 0);
  const ratePA = payout.interestRatePA ?? (targetFD?.interestRatePA ?? 12);
  const monthlyPayout = payout.monthlyPayout ?? (targetFD?.monthlyPayout ?? 0);
  const periodLabel = payout.periodLabel || (payout.dueDate ? `Interest up to ${payout.dueDate}` : `Interest period ending ${payout.date}`);
  const amountPaid = payout.amount || 0;
  const pendingAfter = payout.pendingInterestAfter ?? 0;
  const processedBy = payout.processedBy || 'Admin Staff';

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    setIsDownloadingPdf(true);
    try {
      const blob = await apiService.downloadFDInterestReceiptPdf(voucherNo);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `KKV-FD-Interest-Voucher-${voucherNo}-${custName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      showToast('FD Interest Payment Receipt PDF downloaded successfully.', 'success');
    } catch (err: any) {
      console.error('[FDInterestReceiptModal] PDF download error:', err);
      showToast(err?.message || 'Failed to download Fixed Deposit interest receipt PDF.', 'error');
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handleWhatsAppShare = () => {
    const rawPhone = (custPhone || '').replace(/\D/g, '');
    let targetPhone = rawPhone;
    if (targetPhone.startsWith('0') && targetPhone.length === 11) targetPhone = targetPhone.slice(1);
    if (targetPhone.length === 10) targetPhone = `91${targetPhone}`;

    const text = encodeURIComponent(
      `*KKV GOLD FINANCE - FD INTEREST PAYMENT VOUCHER*\n\n` +
      `Dear ${custName},\n` +
      `Your Fixed Deposit interest dividend payout has been successfully processed.\n\n` +
      `*Voucher No:* ${voucherNo}\n` +
      `*FD Number:* ${payout.fdNo}\n` +
      `*Payout Date:* ${payout.date}\n` +
      `*Period Covered:* ${periodLabel}\n` +
      `*Interest Paid:* ₹${amountPaid.toLocaleString('en-IN')}\n` +
      `*Payment Mode:* ${payout.mode}` +
      (payout.bankName ? ` (${payout.bankName})` : '') +
      (payout.transactionReference ? ` [Ref: ${payout.transactionReference}]` : '') +
      `\n*Remaining Pending Interest:* ₹${pendingAfter.toLocaleString('en-IN')}\n\n` +
      `Branch: ${businessTitle} | Ph: ${officialPhone}\n` +
      `_This is an official computer-generated receipt._`
    );

    window.open(`https://wa.me/${targetPhone}?text=${text}`, '_blank');
  };

  return (
    <div
      className="fd-interest-receipt-modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        overflowY: 'auto'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="fd-interest-receipt-modal-container"
        style={{
          width: '100%',
          maxWidth: '840px',
          maxHeight: '94vh',
          backgroundColor: 'var(--bg-surface, #ffffff)',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: '1px solid var(--border-subtle, #e2e8f0)'
        }}
      >
        {/* TOP BAR / ACTION BAR (Hidden in print) */}
        <div
          className="fd-interest-receipt-modal-header no-print"
          style={{
            padding: '14px 20px',
            backgroundColor: '#064e3b',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontWeight: 800, fontSize: '15px', letterSpacing: '0.3px' }}>
              FD Interest Payment Voucher
            </span>
            <span
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.2)',
                padding: '2px 8px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 700
              }}
            >
              {voucherNo}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isDownloadingPdf}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: '#ffffff',
                color: '#064e3b',
                border: 'none',
                padding: '6px 12px',
                borderRadius: '6px',
                fontWeight: 700,
                fontSize: '12.5px',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {isDownloadingPdf ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              Download PDF
            </button>

            <button
              type="button"
              onClick={handlePrint}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: '#10b981',
                color: '#ffffff',
                border: 'none',
                padding: '6px 12px',
                borderRadius: '6px',
                fontWeight: 700,
                fontSize: '12.5px',
                cursor: 'pointer'
              }}
            >
              <Printer size={14} />
              Print Receipt
            </button>

            <button
              type="button"
              onClick={handleWhatsAppShare}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: '#25D366',
                color: '#ffffff',
                border: 'none',
                padding: '6px 12px',
                borderRadius: '6px',
                fontWeight: 700,
                fontSize: '12.5px',
                cursor: 'pointer'
              }}
            >
              <Share2 size={14} />
              WhatsApp
            </button>

            <button
              type="button"
              onClick={onClose}
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.15)',
                color: '#ffffff',
                border: 'none',
                padding: '6px',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginLeft: '4px'
              }}
              title="Close Receipt"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* PRINTABLE VOUCHER BODY */}
        <div
          className="fd-interest-receipt-printable-body"
          style={{
            padding: '24px 28px',
            overflowY: 'auto',
            backgroundColor: '#ffffff',
            color: '#0f172a',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif'
          }}
        >
          <div
            className="fd-interest-receipt-voucher"
            style={{
              maxWidth: '780px',
              margin: '0 auto',
              border: '2px solid #064e3b',
              borderRadius: '10px',
              padding: '24px 28px',
              backgroundColor: '#ffffff',
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
            }}
          >
            {/* 1. HEADER SECTION */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '2px solid #064e3b',
                paddingBottom: '14px',
                gap: '16px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <KKVLogo size={48} />
                <div>
                  <h1
                    style={{
                      fontSize: '20px',
                      fontWeight: 900,
                      color: '#064e3b',
                      margin: 0,
                      letterSpacing: '-0.3px',
                      textTransform: 'uppercase'
                    }}
                  >
                    {businessTitle}
                  </h1>
                  <p
                    style={{
                      fontSize: '10.5px',
                      fontWeight: 700,
                      color: '#1e293b',
                      textTransform: 'uppercase',
                      margin: '2px 0 0 0',
                      letterSpacing: '0.2px',
                      lineHeight: 1.3
                    }}
                  >
                    {branchAddress}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                    <span
                      style={{
                        backgroundColor: '#dc2626',
                        color: '#ffffff',
                        fontSize: '9.5px',
                        fontWeight: 800,
                        padding: '1.5px 6px',
                        borderRadius: '3px'
                      }}
                    >
                      Ph: {officialPhone}
                    </span>
                    {gstin && (
                      <span
                        style={{
                          backgroundColor: '#064e3b',
                          color: '#ffffff',
                          fontSize: '9.5px',
                          fontWeight: 800,
                          padding: '1.5px 6px',
                          borderRadius: '3px'
                        }}
                      >
                        GST: {gstin}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div
                  style={{
                    backgroundColor: '#064e3b',
                    color: '#ffffff',
                    fontWeight: 900,
                    padding: '5px 12px',
                    borderRadius: '5px',
                    fontSize: '11px',
                    textTransform: 'uppercase',
                    display: 'inline-block',
                    letterSpacing: '0.5px'
                  }}
                >
                  INTEREST PAYMENT VOUCHER
                </div>
                <div
                  style={{
                    fontSize: '13px',
                    fontWeight: 800,
                    color: '#064e3b',
                    marginTop: '6px'
                  }}
                >
                  VOUCHER #{voucherNo}
                </div>
              </div>
            </div>

            {/* 2. METADATA SUMMARY BAR */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '8px',
                backgroundColor: '#f8fafc',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                padding: '10px 14px',
                margin: '14px 0'
              }}
            >
              <div>
                <span style={{ fontSize: '9px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                  VOUCHER NO
                </span>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#064e3b' }}>{voucherNo}</div>
              </div>
              <div>
                <span style={{ fontSize: '9px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                  FD NUMBER
                </span>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>{payout.fdNo}</div>
              </div>
              <div>
                <span style={{ fontSize: '9px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                  PAYMENT DATE
                </span>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>{payout.date}</div>
              </div>
              <div>
                <span style={{ fontSize: '9px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                  PAYMENT MODE
                </span>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#059669' }}>
                  {payout.mode}
                </div>
              </div>
            </div>

            {/* 3. CUSTOMER DETAILS */}
            <div
              style={{
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                padding: '12px 14px',
                marginBottom: '14px',
                backgroundColor: '#ffffff'
              }}
            >
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 800,
                  color: '#064e3b',
                  textTransform: 'uppercase',
                  borderBottom: '1px solid #f1f5f9',
                  paddingBottom: '4px',
                  marginBottom: '8px'
                }}
              >
                Customer &amp; Depositor Information
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '8px 14px',
                  fontSize: '12px'
                }}
              >
                <div>
                  <span style={{ color: '#64748b', fontSize: '10.5px' }}>Depositor Name:</span>
                  <div style={{ fontWeight: 700, color: '#0f172a' }}>{custName}</div>
                </div>
                <div>
                  <span style={{ color: '#64748b', fontSize: '10.5px' }}>Customer ID:</span>
                  <div style={{ fontWeight: 800, color: '#064e3b' }}>{custId}</div>
                </div>
                <div>
                  <span style={{ color: '#64748b', fontSize: '10.5px' }}>Mobile Number:</span>
                  <div style={{ fontWeight: 700, color: '#0f172a' }}>{custPhone ? `+91 ${custPhone}` : 'N/A'}</div>
                </div>
                <div style={{ gridColumn: 'span 3' }}>
                  <span style={{ color: '#64748b', fontSize: '10.5px' }}>Address:</span>
                  <div style={{ fontWeight: 600, color: '#334155' }}>{custAddr}</div>
                </div>
              </div>
            </div>

            {/* 4. INTEREST BREAKDOWN TABLE */}
            <div style={{ marginBottom: '14px' }}>
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 800,
                  color: '#064e3b',
                  textTransform: 'uppercase',
                  marginBottom: '6px'
                }}
              >
                Interest Calculation &amp; Payment Breakdown
              </div>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '12px',
                  border: '1px solid #cbd5e1'
                }}
              >
                <thead>
                  <tr style={{ backgroundColor: '#064e3b', color: '#ffffff' }}>
                    <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 800, fontSize: '11px' }}>
                      TRANSACTION ITEM
                    </th>
                    <th style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 800, fontSize: '11px' }}>
                      DETAILS / AMOUNT (₹)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '6px 10px', fontWeight: 600, color: '#0f172a' }}>
                      Deposit Principal Amount (Active Investment)
                    </td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 800, fontSize: '12.5px', color: '#0f172a' }}>
                      ₹{principal.toLocaleString('en-IN')}
                    </td>
                  </tr>
                  <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '6px 10px', fontWeight: 600, color: '#0f172a' }}>
                      Agreed Annual Interest Rate (% p.a.)
                    </td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                      {ratePA}% p.a.
                    </td>
                  </tr>
                  <tr style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '6px 10px', fontWeight: 600, color: '#0f172a' }}>
                      Monthly Payout Commitment
                    </td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                      ₹{monthlyPayout.toLocaleString('en-IN')} / month
                    </td>
                  </tr>
                  <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '6px 10px', fontWeight: 600, color: '#0f172a' }}>
                      Interest Period Covered
                    </td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: '#064e3b' }}>
                      {periodLabel}
                    </td>
                  </tr>
                  <tr style={{ backgroundColor: '#ecfdf5', borderBottom: '1.5px solid #a7f3d0' }}>
                    <td style={{ padding: '7px 10px', fontWeight: 800, color: '#047857', fontSize: '12.5px' }}>
                      Interest Amount Paid (This Transaction)
                    </td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 900, color: '#047857', fontSize: '14px' }}>
                      ₹{amountPaid.toLocaleString('en-IN')}
                    </td>
                  </tr>
                  <tr style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '6px 10px', fontWeight: 600, color: '#0f172a' }}>
                      Payment Mode &amp; References
                    </td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600, color: '#0f172a' }}>
                      {payout.mode}
                      {payout.bankName ? ` - ${payout.bankName}` : ''}
                      {payout.transactionReference ? ` (Ref: ${payout.transactionReference})` : ''}
                      {payout.upiId ? ` [UPI: ${payout.upiId}]` : ''}
                    </td>
                  </tr>
                  <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '6px 10px', fontWeight: 600, color: '#0f172a' }}>
                      Remaining Pending Interest
                    </td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 800, color: pendingAfter > 0 ? '#b91c1c' : '#059669' }}>
                      ₹{pendingAfter.toLocaleString('en-IN')}
                    </td>
                  </tr>
                  <tr style={{ backgroundColor: '#ffffff' }}>
                    <td style={{ padding: '6px 10px', fontWeight: 600, color: '#0f172a' }}>
                      Payout Status
                    </td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 800, color: '#059669' }}>
                      {payout.status || 'PAID'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 5. HIGHLIGHT SUMMARY BOX */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '12px',
                backgroundColor: '#ecfdf5',
                border: '1.5px solid #a7f3d0',
                borderRadius: '8px',
                padding: '12px 16px',
                marginBottom: '16px',
                textAlign: 'center'
              }}
            >
              <div>
                <span style={{ fontSize: '9px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>
                  INTEREST PAID
                </span>
                <div style={{ fontSize: '18px', fontWeight: 900, color: '#047857', marginTop: '2px' }}>
                  ₹{amountPaid.toLocaleString('en-IN')}
                </div>
              </div>
              <div>
                <span style={{ fontSize: '9px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>
                  PAYMENT MODE
                </span>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#064e3b', marginTop: '2px' }}>
                  {payout.mode}
                </div>
              </div>
              <div>
                <span style={{ fontSize: '9px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>
                  PAYMENT DATE
                </span>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
                  {payout.date}
                </div>
              </div>
            </div>

            {/* Remarks if present */}
            {payout.remarks && (
              <div
                style={{
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  marginBottom: '14px',
                  fontSize: '11px',
                  color: '#475569'
                }}
              >
                <span style={{ fontWeight: 700, color: '#0f172a' }}>Remarks / Note: </span>
                {payout.remarks}
              </div>
            )}

            {/* 6. TERMS AND CONDITIONS */}
            <div style={{ marginBottom: '22px', fontSize: '10px', color: '#64748b', lineHeight: 1.45 }}>
              <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: '3px' }}>NOTE:</div>
              <div>1. This voucher confirms the settlement of monthly dividend interest on the mentioned Fixed Deposit.</div>
              <div>2. The principal investment remains secured as per the terms of the original deposit certificate.</div>
              <div>3. Please retain this payment receipt voucher for your financial and tax records.</div>
            </div>

            {/* 7. THREE-COLUMN SIGNATURE SECTION */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '20px',
                marginTop: '28px',
                paddingTop: '10px',
                textAlign: 'center'
              }}
            >
              <div>
                <div style={{ borderTop: '1px solid #94a3b8', paddingTop: '6px' }}>
                  <div style={{ fontWeight: 800, fontSize: '11px', color: '#0f172a' }}>Customer / Payee</div>
                  <div style={{ fontSize: '9.5px', color: '#64748b' }}>Signature &amp; Acknowledgement</div>
                </div>
              </div>
              <div>
                <div style={{ borderTop: '1px solid #94a3b8', paddingTop: '6px' }}>
                  <div style={{ fontWeight: 800, fontSize: '11px', color: '#0f172a' }}>{processedBy}</div>
                  <div style={{ fontSize: '9.5px', color: '#64748b' }}>Authorized Cashier / Staff</div>
                </div>
              </div>
              <div>
                <div style={{ borderTop: '1px solid #94a3b8', paddingTop: '6px' }}>
                  <div style={{ fontWeight: 800, fontSize: '11px', color: '#0f172a' }}>For {businessTitle}</div>
                  <div style={{ fontSize: '9.5px', color: '#64748b' }}>Branch Manager / Signatory</div>
                </div>
              </div>
            </div>

            {/* 8. FOOTER */}
            <div
              style={{
                borderTop: '1px solid #e2e8f0',
                marginTop: '20px',
                paddingTop: '8px',
                textAlign: 'center',
                fontSize: '9.5px',
                color: '#94a3b8'
              }}
            >
              This is a computer-generated official Fixed Deposit Interest Payment Voucher issued by {businessTitle}.
            </div>
          </div>
        </div>
      </div>

      {/* PRINT STYLES */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          .fd-interest-receipt-modal-backdrop,
          .fd-interest-receipt-modal-container,
          .fd-interest-receipt-printable-body,
          .fd-interest-receipt-voucher,
          .fd-interest-receipt-voucher * {
            visibility: visible !important;
          }
          .fd-interest-receipt-modal-backdrop {
            position: absolute !important;
            inset: 0 !important;
            background: #ffffff !important;
            padding: 0 !important;
            margin: 0 !important;
            overflow: visible !important;
          }
          .fd-interest-receipt-modal-container {
            box-shadow: none !important;
            border: none !important;
            max-width: 100% !important;
            max-height: none !important;
          }
          .fd-interest-receipt-printable-body {
            padding: 0 !important;
          }
          .fd-interest-receipt-voucher {
            border: 2px solid #064e3b !important;
            box-shadow: none !important;
            padding: 16px 20px !important;
            max-width: 100% !important;
            page-break-inside: avoid !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
};
