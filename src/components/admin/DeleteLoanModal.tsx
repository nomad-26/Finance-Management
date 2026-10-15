import React, { useState, useEffect, useMemo } from 'react';
import { Loan } from '../../types';
import { useApp } from '../../context/AppContext';
import {
  AlertTriangle,
  X,
  Trash2,
  ShieldCheck,
  Calendar,
  DollarSign,
  User,
  FileText,
  Clock,
  CheckCircle2,
  Receipt as ReceiptIcon
} from 'lucide-react';

interface DeleteLoanModalProps {
  isOpen: boolean;
  loan: Loan | null;
  onClose: () => void;
  onSuccess?: () => void;
}

export const DeleteLoanModal: React.FC<DeleteLoanModalProps> = ({
  isOpen,
  loan,
  onClose,
  onSuccess
}) => {
  const { deleteLoan, receipts, showToast } = useApp();
  const [reason, setReason] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Reset form whenever modal opens or active loan changes
  useEffect(() => {
    if (isOpen) {
      setReason('');
      setConfirmText('');
      setErrorMessage(null);
      setIsSubmitting(false);
    }
  }, [isOpen, loan?.id]);

  // Check if loan has historical repayment receipts
  const repaymentReceipts = useMemo(() => {
    if (!loan) return [];
    return receipts.filter((r) => {
      const isMatching = r.loanId === loan.id || (loan.loanNo && r.loanNo === loan.loanNo);
      if (!isMatching) return false;
      const kind = (r.kind || '').toUpperCase();
      return kind !== 'LOAN DISBURSEMENT' && kind !== 'NEW LOAN';
    });
  }, [loan, receipts]);

  const hasRepayments = repaymentReceipts.length > 0;
  const totalRepaid = useMemo(() => {
    return repaymentReceipts.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  }, [repaymentReceipts]);

  if (!isOpen || !loan) return null;

  const isDeleteConfirmed = confirmText.trim() === 'DELETE';
  const isReasonValid = reason.trim().length >= 3;
  const canSubmit = isDeleteConfirmed && isReasonValid && !isSubmitting;

  const handleConfirmDelete = async () => {
    if (!isDeleteConfirmed) {
      setErrorMessage('Please type DELETE in capital letters to confirm.');
      return;
    }

    if (!isReasonValid) {
      setErrorMessage('Please provide a reason for administrative deletion (at least 3 characters).');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await deleteLoan(loan.id, reason.trim());
      if (res && res.success) {
        showToast(
          hasRepayments
            ? `Loan ${loan.loanNo || loan.id} removed from active management. ${repaymentReceipts.length} historical receipt(s) preserved.`
            : `Loan ${loan.loanNo || loan.id} deleted successfully.`,
          'success'
        );
        onSuccess?.();
        onClose();
      } else {
        setErrorMessage(res?.message || 'Failed to delete loan. Please try again.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'An unexpected error occurred while deleting loan.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.72)',
        backdropFilter: 'blur(5px)',
        WebkitBackdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2500,
        padding: '16px',
        overflowY: 'auto'
      }}
      onClick={() => {
        if (!isSubmitting) onClose();
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '550px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'var(--bg-surface, #ffffff)',
          color: 'var(--text-main, #0f172a)',
          borderRadius: '16px',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(0, 0, 0, 0.08)',
          border: '1px solid var(--border-light, #e2e8f0)',
          overflow: 'hidden',
          animation: 'modalSlideUp 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* MODAL HEADER */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid var(--border-subtle, #f1f5f9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'var(--bg-surface-secondary, #f8fafc)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '12px',
                backgroundColor: 'rgba(239, 68, 68, 0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#dc2626'
              }}
            >
              <Trash2 size={20} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text-dark, #0f172a)' }}>
                  Delete Loan
                </h2>
                <span className="badge badge-gold" style={{ fontSize: '10px', padding: '2px 8px' }}>
                  ADMIN-ONLY ACTION
                </span>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted, #64748b)', marginTop: '2px' }}>
                Loan Reference: <strong style={{ fontFamily: 'monospace' }}>{loan.loanNo || loan.id}</strong>
              </div>
            </div>
          </div>

          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            disabled={isSubmitting}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: 'none',
              background: 'transparent',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              color: 'var(--text-muted, #64748b)'
            }}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* ERROR NOTIFICATION BANNER */}
        {errorMessage && (
          <div
            style={{
              padding: '12px 20px',
              backgroundColor: '#fef2f2',
              borderBottom: '1px solid #fecaca',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              color: '#991b1b',
              fontSize: '13px',
              fontWeight: 600
            }}
          >
            <AlertTriangle size={18} color="#dc2626" style={{ flexShrink: 0, marginTop: '1px' }} />
            <span style={{ lineHeight: '1.4' }}>{errorMessage}</span>
          </div>
        )}

        {/* MODAL BODY */}
        <div
          style={{
            padding: '22px 24px',
            overflowY: 'auto',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '18px'
          }}
        >
          {/* GENERAL WARNING BANNER */}
          <div
            style={{
              padding: '12px 16px',
              borderRadius: '10px',
              backgroundColor: 'rgba(239, 68, 68, 0.06)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px'
            }}
          >
            <AlertTriangle size={18} color="#dc2626" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div style={{ fontSize: '12.5px', color: '#991b1b', lineHeight: '1.45' }}>
              <strong>Notice:</strong> This action will remove the loan from active loan management,
              deduct its balance from outstanding portfolio metrics, and adjust the borrower&apos;s active loan tally.
            </div>
          </div>

          {/* FINANCIAL SAFETY / RECEIPTS NOTICE */}
          {hasRepayments ? (
            <div
              style={{
                padding: '14px 16px',
                borderRadius: '12px',
                backgroundColor: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px'
              }}
            >
              <ShieldCheck size={20} color="#059669" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#065f46' }}>
                  Financial History Preserved (Audit-Safe Archival)
                </div>
                <div style={{ fontSize: '12px', color: '#047857', lineHeight: '1.45' }}>
                  This loan has <strong>{repaymentReceipts.length}</strong> historical repayment receipt(s) totaling{' '}
                  <strong>₹{totalRepaid.toLocaleString('en-IN')}</strong>. All historical vouchers, receipts, and ledger transactions
                  will remain permanently preserved in financial records and customer transaction history.
                </div>
              </div>
            </div>
          ) : (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '10px',
                backgroundColor: 'var(--bg-surface-secondary, #f8fafc)',
                border: '1px solid var(--border-subtle, #e2e8f0)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '12px',
                color: 'var(--text-muted, #64748b)'
              }}
            >
              <CheckCircle2 size={15} color="#10b981" />
              <span>This loan has no historical repayments attached and can be cleanly decommissioned.</span>
            </div>
          )}

          {/* LOAN DETAILS SUMMARY CARD */}
          <div
            style={{
              padding: '16px',
              borderRadius: '12px',
              backgroundColor: 'var(--bg-surface-secondary, #f8fafc)',
              border: '1px solid var(--border-subtle, #e2e8f0)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingBottom: '8px',
                borderBottom: '1px solid var(--border-subtle, #e2e8f0)'
              }}
            >
              <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted, #64748b)' }}>
                Loan ID / Number
              </span>
              <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '14px', color: 'var(--text-dark, #0f172a)' }}>
                {loan.loanNo || loan.id}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted, #64748b)' }}>
                <User size={14} /> Customer Name
              </span>
              <span style={{ fontWeight: 700, color: 'var(--text-dark, #0f172a)' }}>
                {loan.customerName || 'N/A'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted, #64748b)' }}>
                <DollarSign size={14} /> Principal Amount
              </span>
              <span style={{ fontWeight: 800, color: 'var(--color-primary-dark, #176B52)', fontSize: '14px' }}>
                ₹{(loan.principal || 0).toLocaleString('en-IN')}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted, #64748b)' }}>
                <Calendar size={14} /> Issue Date
              </span>
              <span style={{ color: 'var(--text-dark, #0f172a)', fontWeight: 500 }}>
                {loan.date || 'N/A'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted, #64748b)' }}>
                <Clock size={14} /> Current Status
              </span>
              <span
                className={`badge ${
                  loan.status === 'ACTIVE'
                    ? 'badge-success'
                    : loan.status === 'CLOSED'
                    ? 'badge-info'
                    : 'badge-warning'
                }`}
                style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px' }}
              >
                {loan.status || 'ACTIVE'}
              </span>
            </div>

            {hasRepayments && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px', paddingTop: '4px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted, #64748b)' }}>
                  <ReceiptIcon size={14} /> Total Repaid (Retained)
                </span>
                <span style={{ fontWeight: 700, color: '#059669' }}>
                  ₹{totalRepaid.toLocaleString('en-IN')} ({repaymentReceipts.length} receipt{repaymentReceipts.length > 1 ? 's' : ''})
                </span>
              </div>
            )}
          </div>

          {/* INPUT: REASON FOR DELETION */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                color: 'var(--text-dark, #0f172a)',
                marginBottom: '6px'
              }}
            >
              Reason for Deletion <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <div style={{ position: 'relative' }}>
              <FileText
                size={16}
                color="var(--text-muted, #64748b)"
                style={{ position: 'absolute', left: '12px', top: '12px', pointerEvents: 'none' }}
              />
              <textarea
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Issued by mistake, duplicate entry, loan cancelled by administrative order..."
                disabled={isSubmitting}
                style={{
                  width: '100%',
                  padding: '10px 12px 10px 36px',
                  fontSize: '13px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-light, #cbd5e1)',
                  backgroundColor: 'var(--bg-surface, #ffffff)',
                  color: 'var(--text-dark, #0f172a)',
                  outline: 'none',
                  resize: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>
            <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: 'var(--text-muted, #64748b)' }}>
              Required for compliance audit trail and administrative record keeping.
            </p>
          </div>

          {/* INPUT: TYPE DELETE TO CONFIRM */}
          <div
            style={{
              padding: '14px',
              borderRadius: '12px',
              backgroundColor: 'rgba(239, 68, 68, 0.04)',
              border: '1px solid rgba(239, 68, 68, 0.2)'
            }}
          >
            <div
              style={{
                fontSize: '13px',
                fontWeight: 700,
                color: '#991b1b',
                marginBottom: '8px'
              }}
            >
              To confirm this action, type DELETE in the field below.
            </div>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Type DELETE to confirm"
              disabled={isSubmitting}
              autoComplete="off"
              spellCheck={false}
              style={{
                width: '100%',
                padding: '10px 14px',
                fontSize: '14px',
                fontWeight: 700,
                fontFamily: 'monospace',
                letterSpacing: '1px',
                borderRadius: '8px',
                border: isDeleteConfirmed ? '2px solid #dc2626' : '1px solid #cbd5e1',
                backgroundColor: 'var(--bg-surface, #ffffff)',
                color: '#dc2626',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
            {confirmText && !isDeleteConfirmed && (
              <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#dc2626' }}>
                Must be exactly DELETE in capital letters.
              </p>
            )}
          </div>
        </div>

        {/* MODAL FOOTER */}
        <div
          style={{
            padding: '16px 24px',
            backgroundColor: 'var(--bg-surface-secondary, #f8fafc)',
            borderTop: '1px solid var(--border-subtle, #f1f5f9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '12px'
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="btn btn-secondary"
            style={{
              padding: '9px 18px',
              fontSize: '13px',
              fontWeight: 600,
              borderRadius: '10px'
            }}
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleConfirmDelete}
            disabled={!canSubmit}
            className="btn"
            style={{
              padding: '9px 20px',
              fontSize: '13px',
              fontWeight: 700,
              borderRadius: '10px',
              backgroundColor: canSubmit ? '#dc2626' : '#f87171',
              color: '#ffffff',
              border: 'none',
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              opacity: canSubmit ? 1 : 0.6,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: canSubmit ? '0 4px 12px rgba(220, 38, 38, 0.25)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            {isSubmitting ? (
              <span>Deleting...</span>
            ) : (
              <>
                <Trash2 size={16} />
                <span>Delete Loan</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteLoanModal;
