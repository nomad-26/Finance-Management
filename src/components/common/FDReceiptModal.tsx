import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Printer, Download, Share2, X, Loader2, FileText } from 'lucide-react';
import { FixedDeposit, Customer } from '../../types';
import { COMPANY_CONFIG } from '../../config/company';
import { KKVLogo } from './KKVLogo';
import { apiService } from '../../services/api';
import { isMatchingCustomerId, getCanonicalCustomerId } from '../../utils/customerUtils';

interface FDReceiptModalProps {
  fd: FixedDeposit;
  onClose: () => void;
}

export const FDReceiptModal: React.FC<FDReceiptModalProps> = ({ fd, onClose }) => {
  const { customers, branchSettings, showToast } = useApp();
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [isSharingPdf, setIsSharingPdf] = useState(false);

  const businessTitle = branchSettings?.businessTitle || COMPANY_CONFIG.businessName;
  const branchDisplay = branchSettings?.branchCode ? `BRANCH #${branchSettings.branchCode}` : 'MAIN BRANCH';
  const branchAddress = branchSettings?.branchAddress || COMPANY_CONFIG.address;
  const officialPhone = branchSettings?.officialPhone || COMPANY_CONFIG.phone;
  const gstin = branchSettings?.gstin;
  const officialEmail = 'support@kkvgold.com';

  const matchedCustomer = customers.find((c: Customer) => isMatchingCustomerId(fd.customerId, c));
  const custName = matchedCustomer?.name || fd.depositorName;
  const custId = matchedCustomer ? getCanonicalCustomerId(matchedCustomer) : fd.customerId;
  const custPhone = matchedCustomer?.phone || fd.phone;
  const custAddr = matchedCustomer?.currentAddress || fd.address || 'Address on record';
  const nomineeName = fd.nomineeName || 'Not Specified';
  const nomineeRelation = fd.nomineeRelation || '—';

  const tenure = fd.tenureMonths || 12;
  const monthlyPayout = fd.monthlyPayout || 0;
  const totalYield = monthlyPayout * tenure;
  const grossMaturity = fd.principal + totalYield;
  const rcptNum = fd.receiptNumber || fd.fdNo;
  const generatedDateStr = fd.receiptGeneratedAt
    ? new Date(fd.receiptGeneratedAt).toLocaleDateString('en-GB').replace(/\//g, '-')
    : fd.depositDate;

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    setIsDownloadingPdf(true);
    try {
      const blob = await apiService.downloadFDReceiptPdf(fd.fdNo);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `KKV-FD-Receipt-${rcptNum}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      showToast('Fixed Deposit Receipt PDF downloaded successfully.', 'success');
    } catch (err: any) {
      console.error('[FDReceiptModal] PDF download error:', err);
      showToast(err?.message || 'Failed to download Fixed Deposit receipt PDF.', 'error');
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handleSharePdf = async () => {
    setIsSharingPdf(true);
    try {
      const blob = await apiService.downloadFDReceiptPdf(fd.fdNo);
      const filename = `KKV-FD-Receipt-${rcptNum}.pdf`;
      const pdfFile = new File([blob], filename, { type: 'application/pdf' });

      // Check if Web Share API with files is supported
      if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
        await navigator.share({
          title: `${businessTitle} - Fixed Deposit Receipt`,
          text: `Fixed Deposit Receipt ${rcptNum} for ${custName}`,
          files: [pdfFile]
        });
        showToast('Receipt shared successfully.', 'success');
      } else {
        // Fallback for Desktop / unsupported browsers:
        // 1. Download the PDF
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        // 2. Open WhatsApp Web with prefilled message
        const rawPhone = (custPhone || '').replace(/\D/g, '');
        let targetPhone = rawPhone;
        if (targetPhone.startsWith('0') && targetPhone.length === 11) targetPhone = targetPhone.slice(1);
        if (targetPhone.length === 10) targetPhone = `91${targetPhone}`;

        const text = encodeURIComponent(
          `*${businessTitle.toUpperCase()} - FIXED DEPOSIT RECEIPT*\n\n` +
          `Dear ${custName},\n` +
          `Please find your official Fixed Deposit Receipt.\n\n` +
          `*FD Number:* ${fd.fdNo}\n` +
          `*Receipt No:* ${rcptNum}\n` +
          `*Deposit Date:* ${fd.depositDate}\n` +
          `*Principal Amount:* ₹${fd.principal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}\n` +
          `*Interest Rate:* ${Number(fd.interestRatePA).toFixed(2)}% p.a.\n` +
          `*Tenure:* ${tenure} Months\n` +
          `*Monthly Dividend:* ₹${monthlyPayout.toLocaleString('en-IN', { minimumFractionDigits: 2 })} / mo\n` +
          `*Maturity Value:* ₹${grossMaturity.toLocaleString('en-IN', { minimumFractionDigits: 2 })}\n` +
          `*Maturity Date:* ${fd.maturityDate}\n\n` +
          `Branch: ${businessTitle} | Ph: ${officialPhone}\n` +
          `_This is an official computer-generated receipt._`
        );

        const waUrl = targetPhone ? `https://wa.me/${targetPhone}?text=${text}` : `https://wa.me/?text=${text}`;
        window.open(waUrl, '_blank');

        showToast('PDF downloaded. You can now attach it in WhatsApp Web.', 'info');
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('[FDReceiptModal] Share PDF error:', err);
        showToast(err?.message || 'Failed to prepare Fixed Deposit receipt for sharing.', 'error');
      }
    } finally {
      setIsSharingPdf(false);
    }
  };

  return (
    <div
      className="fd-receipt-modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(6px)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '20px 16px',
        overflowY: 'auto'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* LAYER 1: FIXED COMPACT ACTION TOOLBAR (Outside receipt sheet) */}
      <div
        className="fd-receipt-action-toolbar no-print"
        style={{
          width: '100%',
          maxWidth: '820px',
          backgroundColor: '#0f172a',
          color: '#ffffff',
          borderRadius: '10px',
          padding: '10px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '16px',
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -4px rgba(0, 0, 0, 0.2)',
          border: '1px solid #1e293b'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <FileText size={18} color="#10b981" />
          <span style={{ fontWeight: 800, fontSize: '14.5px', letterSpacing: '0.2px' }}>
            Fixed Deposit Receipt
          </span>
          <span
            style={{
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              color: '#34d399',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              padding: '2px 8px',
              borderRadius: '4px',
              fontSize: '11.5px',
              fontWeight: 800
            }}
          >
            {rcptNum}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={isDownloadingPdf}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: '#ffffff',
              color: '#0f172a',
              border: 'none',
              padding: '6px 14px',
              borderRadius: '6px',
              fontWeight: 700,
              fontSize: '12.5px',
              cursor: isDownloadingPdf ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            {isDownloadingPdf ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Download PDF
          </button>

          <button
            type="button"
            onClick={handleSharePdf}
            disabled={isSharingPdf}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: '#059669',
              color: '#ffffff',
              border: 'none',
              padding: '6px 14px',
              borderRadius: '6px',
              fontWeight: 700,
              fontSize: '12.5px',
              cursor: isSharingPdf ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            {isSharingPdf ? <Loader2 size={14} className="animate-spin" /> : <Share2 size={14} />}
            Share PDF
          </button>

          <button
            type="button"
            onClick={handlePrint}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: '#334155',
              color: '#ffffff',
              border: 'none',
              padding: '6px 14px',
              borderRadius: '6px',
              fontWeight: 700,
              fontSize: '12.5px',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            <Printer size={14} />
            Print Receipt
          </button>

          <button
            type="button"
            onClick={onClose}
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              color: '#ffffff',
              border: 'none',
              padding: '6px 8px',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginLeft: '4px',
              transition: 'all 0.15s ease'
            }}
            title="Close"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* LAYER 2: A4 OFFICIAL RECEIPT DOCUMENT PAPER */}
      <div
        className="fd-receipt-document"
        style={{
          width: '100%',
          maxWidth: '820px',
          backgroundColor: '#ffffff',
          borderRadius: '6px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(0, 0, 0, 0.05)',
          padding: '36px 42px',
          color: '#0f172a',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          boxSizing: 'border-box'
        }}
      >
        {/* 1. HEADER SECTION (Corporate bank-style) */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '16px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <KKVLogo size={46} />
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
                  color: '#334155',
                  textTransform: 'uppercase',
                  margin: '3px 0 0 0',
                  letterSpacing: '0.2px'
                }}
              >
                {branchDisplay} &bull; {branchAddress}
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '5px' }}>
                <span
                  style={{
                    backgroundColor: '#f1f5f9',
                    color: '#0f172a',
                    fontSize: '9.5px',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '4px',
                    border: '1px solid #cbd5e1'
                  }}
                >
                  Ph: {officialPhone}
                </span>
                {gstin && (
                  <span
                    style={{
                      backgroundColor: '#f1f5f9',
                      color: '#0f172a',
                      fontSize: '9.5px',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '4px',
                      border: '1px solid #cbd5e1'
                    }}
                  >
                    GSTIN: {gstin}
                  </span>
                )}
                {officialEmail && (
                  <span
                    style={{
                      backgroundColor: '#f1f5f9',
                      color: '#475569',
                      fontSize: '9.5px',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: '4px',
                      border: '1px solid #e2e8f0'
                    }}
                  >
                    {officialEmail}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div
              style={{
                fontSize: '16px',
                fontWeight: 900,
                color: '#064e3b',
                letterSpacing: '0.6px',
                textTransform: 'uppercase',
                margin: 0
              }}
            >
              FIXED DEPOSIT RECEIPT
            </div>
            <div
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: '#64748b',
                marginTop: '2px'
              }}
            >
              Official Deposit Confirmation
            </div>
            <div
              style={{
                fontSize: '12.5px',
                fontWeight: 700,
                color: '#334155',
                marginTop: '6px'
              }}
            >
              Receipt No: <strong style={{ color: '#064e3b', fontSize: '13.5px' }}>{rcptNum}</strong>
            </div>
          </div>
        </div>

        {/* Hairline Divider */}
        <div
          style={{
            height: '2px',
            backgroundColor: '#064e3b',
            margin: '16px 0'
          }}
        />

        {/* 2. REFERENCE INFORMATION (Clean 2-Column Structure) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '16px',
            backgroundColor: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '6px',
            padding: '12px 18px',
            marginBottom: '16px'
          }}
        >
          {/* Left Reference Box */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <span style={{ fontSize: '9.5px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                FD NUMBER
              </span>
              <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#064e3b', marginTop: '2px' }}>
                {fd.fdNo}
              </div>
            </div>
            <div>
              <span style={{ fontSize: '9.5px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                RECEIPT NUMBER
              </span>
              <div style={{ fontSize: '14px', fontWeight: 900, color: '#064e3b', marginTop: '2px' }}>
                {rcptNum}
              </div>
            </div>
          </div>

          {/* Right Reference Box */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
            <div>
              <span style={{ fontSize: '9.5px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                DEPOSIT DATE
              </span>
              <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#0f172a', marginTop: '2px' }}>
                {fd.depositDate}
              </div>
            </div>
            <div>
              <span style={{ fontSize: '9.5px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                RECEIPT DATE
              </span>
              <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#0f172a', marginTop: '2px' }}>
                {generatedDateStr}
              </div>
            </div>
            <div>
              <span style={{ fontSize: '9.5px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                MATURITY DATE
              </span>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#059669', marginTop: '2px' }}>
                {fd.maturityDate}
              </div>
            </div>
          </div>
        </div>

        {/* 3. CUSTOMER INFORMATION */}
        <div style={{ marginBottom: '16px' }}>
          <div
            style={{
              fontSize: '11px',
              fontWeight: 800,
              color: '#064e3b',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              borderBottom: '1.5px solid #e2e8f0',
              paddingBottom: '4px',
              marginBottom: '10px'
            }}
          >
            CUSTOMER INFORMATION
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '10px 18px',
              fontSize: '12px'
            }}
          >
            <div>
              <span style={{ color: '#64748b', fontSize: '10.5px' }}>Customer Name:</span>
              <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '13px', marginTop: '1px' }}>{custName}</div>
            </div>
            <div>
              <span style={{ color: '#64748b', fontSize: '10.5px' }}>Customer ID:</span>
              <div style={{ fontWeight: 800, color: '#064e3b', fontSize: '13px', marginTop: '1px' }}>{custId}</div>
            </div>
            <div>
              <span style={{ color: '#64748b', fontSize: '10.5px' }}>Mobile Number:</span>
              <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '12.5px', marginTop: '1px' }}>
                {custPhone ? `+91 ${custPhone}` : '—'}
              </div>
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <span style={{ color: '#64748b', fontSize: '10.5px' }}>Address:</span>
              <div style={{ fontWeight: 600, color: '#334155', marginTop: '1px' }}>{custAddr}</div>
            </div>
            <div>
              <span style={{ color: '#64748b', fontSize: '10.5px' }}>Nominee:</span>
              <div style={{ fontWeight: 700, color: '#0f172a', marginTop: '1px' }}>
                {nomineeName} {nomineeRelation !== '—' ? `(${nomineeRelation})` : ''}
              </div>
            </div>
          </div>
        </div>

        {/* 4. DEPOSIT CONTRACT DETAILS TABLE */}
        <div style={{ marginBottom: '16px' }}>
          <div
            style={{
              fontSize: '11px',
              fontWeight: 800,
              color: '#064e3b',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: '8px'
            }}
          >
            DEPOSIT CONTRACT DETAILS
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
                <th style={{ padding: '7px 12px', textAlign: 'left', fontWeight: 800, fontSize: '11px', letterSpacing: '0.4px' }}>
                  PARAMETER
                </th>
                <th style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 800, fontSize: '11px', letterSpacing: '0.4px' }}>
                  DETAILS
                </th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '7px 12px', fontWeight: 600, color: '#0f172a' }}>
                  Deposit Principal Amount (Original Investment)
                </td>
                <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 800, fontSize: '13px', color: '#064e3b' }}>
                  ₹{fd.principal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
              <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '7px 12px', fontWeight: 600, color: '#0f172a' }}>
                  Annual Interest Rate (% Per Annum)
                </td>
                <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                  {Number(fd.interestRatePA).toFixed(2)}% p.a.
                </td>
              </tr>
              <tr style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '7px 12px', fontWeight: 600, color: '#0f172a' }}>
                  Deposit Tenure
                </td>
                <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                  {tenure} Months
                </td>
              </tr>
              <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '7px 12px', fontWeight: 600, color: '#0f172a' }}>
                  Interest Payout Frequency
                </td>
                <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                  {fd.payoutFrequency || 'Monthly'}
                </td>
              </tr>
              <tr style={{ backgroundColor: '#ecfdf5', borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '7px 12px', fontWeight: 700, color: '#047857' }}>
                  Monthly Interest Payout
                </td>
                <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 800, color: '#047857', fontSize: '13px' }}>
                  ₹{monthlyPayout.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / mo
                </td>
              </tr>
              <tr style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '7px 12px', fontWeight: 600, color: '#0f172a' }}>
                  Expected Total Interest
                </td>
                <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                  ₹{totalYield.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
              <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '7px 12px', fontWeight: 700, color: '#064e3b' }}>
                  Expected Maturity Value
                </td>
                <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 800, color: '#064e3b', fontSize: '13px' }}>
                  ₹{grossMaturity.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
              <tr style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '7px 12px', fontWeight: 600, color: '#0f172a' }}>
                  Deposit / Receiving Mode
                </td>
                <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: '#0f172a' }}>
                  {fd.receivingMethod || 'Cash'} Account
                </td>
              </tr>
              <tr style={{ backgroundColor: '#f8fafc' }}>
                <td style={{ padding: '7px 12px', fontWeight: 600, color: '#0f172a' }}>
                  Deposit Status
                </td>
                <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 800, color: '#059669' }}>
                  {fd.status || 'ACTIVE'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 5. IMPORTANT AMOUNT SUMMARY BLOCK */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '12px',
            backgroundColor: '#f8fafc',
            border: '1.5px solid #cbd5e1',
            borderRadius: '6px',
            padding: '12px 18px',
            marginBottom: '16px',
            textAlign: 'center'
          }}
        >
          <div>
            <span style={{ fontSize: '9px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              DEPOSIT PRINCIPAL
            </span>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
              ₹{fd.principal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div>
            <span style={{ fontSize: '9px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              TOTAL INTEREST
            </span>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#047857', marginTop: '2px' }}>
              ₹{totalYield.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div style={{ borderLeft: '1px solid #e2e8f0', paddingLeft: '8px' }}>
            <span style={{ fontSize: '9px', fontWeight: 900, color: '#064e3b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              MATURITY VALUE
            </span>
            <div style={{ fontSize: '18px', fontWeight: 900, color: '#064e3b', marginTop: '2px' }}>
              ₹{grossMaturity.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        {/* 6. TERMS & CONDITIONS */}
        <div style={{ marginBottom: '22px', fontSize: '9.5px', color: '#64748b', lineHeight: 1.45 }}>
          <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: '3px', textTransform: 'uppercase' }}>
            TERMS &amp; CONDITIONS:
          </div>
          <div>1. Interest dividend is payable monthly on or before the due date as per the agreed payout method.</div>
          <div>2. Premature withdrawal or partial liquidation is subject to company rules, deduction of applicable charges, and branch approval.</div>
          <div>3. Please present this original receipt certificate at the time of maturity liquidation or renewal.</div>
        </div>

        {/* 7. THREE-COLUMN SIGNATURE SECTION */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '24px',
            marginTop: '28px',
            paddingTop: '6px',
            textAlign: 'center'
          }}
        >
          <div>
            <div style={{ borderTop: '1px solid #94a3b8', paddingTop: '6px' }}>
              <div style={{ fontWeight: 800, fontSize: '11px', color: '#0f172a' }}>Customer Signature</div>
              <div style={{ fontSize: '9px', color: '#64748b' }}>Acknowledged &amp; Verified</div>
            </div>
          </div>
          <div>
            <div style={{ borderTop: '1px solid #94a3b8', paddingTop: '6px' }}>
              <div style={{ fontWeight: 800, fontSize: '11px', color: '#0f172a' }}>Authorized Staff</div>
              <div style={{ fontSize: '9px', color: '#64748b' }}>Entered &amp; Processed by</div>
            </div>
          </div>
          <div>
            <div style={{ borderTop: '1px solid #94a3b8', paddingTop: '6px' }}>
              <div style={{ fontWeight: 800, fontSize: '11px', color: '#0f172a' }}>For {businessTitle}</div>
              <div style={{ fontSize: '9px', color: '#64748b' }}>Branch Manager / Signatory</div>
            </div>
          </div>
        </div>

        {/* 8. FOOTER */}
        <div
          style={{
            borderTop: '1px solid #e2e8f0',
            marginTop: '22px',
            paddingTop: '8px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '9px',
            color: '#94a3b8',
            flexWrap: 'wrap',
            gap: '4px'
          }}
        >
          <span>This receipt is a system-generated official record issued by {businessTitle}.</span>
          <span>FD: {fd.fdNo} | Receipt: {rcptNum} | Generated: {generatedDateStr}</span>
        </div>
      </div>

      {/* PRINT STYLES */}
      <style>{`
        @page {
          size: A4 portrait;
          margin: 10mm;
        }
        @media print {
          body * {
            visibility: hidden !important;
          }
          .fd-receipt-modal-backdrop,
          .fd-receipt-document,
          .fd-receipt-document * {
            visibility: visible !important;
          }
          .fd-receipt-modal-backdrop {
            position: absolute !important;
            inset: 0 !important;
            background: #ffffff !important;
            padding: 0 !important;
            margin: 0 !important;
            overflow: visible !important;
          }
          .fd-receipt-document {
            box-shadow: none !important;
            border: none !important;
            max-width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
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
