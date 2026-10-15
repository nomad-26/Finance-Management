import React, { useState, useEffect, useMemo } from 'react';
import { Loan, OrnamentItem, NomineeDetails, GuarantorDetails } from '../../types';
import { useApp } from '../../context/AppContext';
import {
  X,
  Edit3,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  Plus,
  Trash2,
  ShieldCheck,
  User,
  Coins,
  ChevronRight
} from 'lucide-react';
import { validateLoanIssueDate } from '../../utils/loanCalculationUtils';

interface EditLoanModalProps {
  isOpen: boolean;
  loan: Loan | null;
  onClose: () => void;
  onSuccess?: () => void;
}

export const EditLoanModal: React.FC<EditLoanModalProps> = ({
  isOpen,
  loan,
  onClose,
  onSuccess
}) => {
  const { updateLoan, receipts, showToast, masterControlSettings } = useApp();

  // Mode: 'edit' or 'review'
  const [step, setStep] = useState<'edit' | 'review'>('edit');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form State
  const [principal, setPrincipal] = useState<number>(0);
  const [interestRate, setInterestRate] = useState<number>(0);
  const [issueDate, setIssueDate] = useState<string>('');
  const [nextDueDate, setNextDueDate] = useState<string>('');
  const [status, setStatus] = useState<'ACTIVE' | 'CLOSED' | 'PENDING' | 'OVERDUE'>('ACTIVE');
  const [notes, setNotes] = useState<string>('');
  const [reason, setReason] = useState<string>('');

  // Ornament items state
  const [items, setItems] = useState<OrnamentItem[]>([]);
  const [manualMarketValue, setManualMarketValue] = useState<number>(0);

  // Nominee & Guarantor state
  const [hasNominee, setHasNominee] = useState(false);
  const [nomineeName, setNomineeName] = useState('');
  const [nomineeRelation, setNomineeRelation] = useState('');
  const [nomineePhone, setNomineePhone] = useState('');
  const [nomineeAadhaar, setNomineeAadhaar] = useState('');
  const [nomineeAddress, setNomineeAddress] = useState('');

  const [hasGuarantor, setHasGuarantor] = useState(false);
  const [guarantorName, setGuarantorName] = useState('');
  const [guarantorRelation, setGuarantorRelation] = useState('');
  const [guarantorPhone, setGuarantorPhone] = useState('');
  const [guarantorAadhaar, setGuarantorAadhaar] = useState('');
  const [guarantorAddress, setGuarantorAddress] = useState('');

  // Repayment metrics for financial safeguard
  const loanReceipts = useMemo(() => {
    if (!loan) return [];
    return receipts.filter((r) => r.loanId === loan.id || r.loanNo === loan.loanNo);
  }, [loan, receipts]);

  const repayments = useMemo(() => {
    return loanReceipts.filter((r) => r.kind !== 'LOAN DISBURSEMENT' && r.kind !== 'NEW LOAN');
  }, [loanReceipts]);

  const totalPrincipalRepaid = useMemo(() => {
    return repayments.reduce((sum, r) => sum + (Number(r.principalComponent) || 0), 0);
  }, [repayments]);

  // Load current values on modal open
  useEffect(() => {
    if (loan && isOpen) {
      setStep('edit');
      setErrorMessage(null);
      setPrincipal(loan.principal || 0);
      setInterestRate(loan.interestRate || 0);
      setIssueDate(loan.date || '');
      setNextDueDate(loan.nextDueDate || '');
      setStatus(loan.status || 'ACTIVE');
      setNotes(loan.notes || '');
      setReason('');
      setManualMarketValue(loan.marketValue || 0);

      // Clone items
      setItems(
        (loan.items || []).map((it, idx) => ({
          ...it,
          id: it.id || `item_${idx + 1}`
        }))
      );

      // Nominee
      const nom = loan.nominee;
      setHasNominee(Boolean(nom && (nom.hasNominee || nom.name)));
      setNomineeName(nom?.name || nom?.fullName || loan.nomineeName || '');
      setNomineeRelation(nom?.relationship || nom?.relation || loan.nomineeRelation || '');
      setNomineePhone(nom?.phone || nom?.mobile || loan.nomineePhone || '');
      setNomineeAadhaar(nom?.aadhaarNumber || loan.nomineeAadhaar || '');
      setNomineeAddress(nom?.address || '');

      // Guarantor
      const guar = loan.guarantor;
      setHasGuarantor(Boolean(guar && (guar.hasGuarantor || guar.name)));
      setGuarantorName(guar?.name || guar?.fullName || loan.guarantorName || '');
      setGuarantorRelation(guar?.relationship || guar?.relation || loan.guarantorRelation || '');
      setGuarantorPhone(guar?.phone || guar?.mobile || loan.guarantorPhone || '');
      setGuarantorAadhaar(guar?.aadhaarNumber || guar?.idProof || loan.guarantorAadhaar || '');
      setGuarantorAddress(guar?.address || '');
    }
  }, [loan, isOpen]);

  if (!isOpen || !loan) return null;

  // Gold rate from settings
  const goldRate = Number((masterControlSettings as any)?.goldRate22ct || 5500);

  // Live item weights & market value calculations
  const totalGrossWeight = items.reduce((sum, it) => sum + (Number(it.grossWeight) || 0), 0);
  const totalDeductionWeight = items.reduce((sum, it) => sum + (Number(it.deductionWeight) || 0), 0);
  const totalNetWeight = Math.max(0, totalGrossWeight - totalDeductionWeight);
  const calculatedMarketValue = Math.round(totalNetWeight * goldRate);
  const effectiveMarketValue = manualMarketValue > 0 ? manualMarketValue : calculatedMarketValue;
  const ltv = effectiveMarketValue > 0 ? Math.round((principal / effectiveMarketValue) * 100) : 0;

  // New monthly interest and outstanding balance
  const projectedOutstanding = status === 'CLOSED' ? 0 : Math.max(0, principal - totalPrincipalRepaid);
  const projectedMonthlyInterest = Math.round((projectedOutstanding * interestRate) / 100);

  // Check if financial values were changed
  const isFinancialChanged =
    principal !== loan.principal ||
    interestRate !== loan.interestRate ||
    status !== loan.status ||
    issueDate !== loan.date ||
    JSON.stringify(items) !== JSON.stringify(loan.items);

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      {
        id: `item_${Date.now()}`,
        item: 'Gold Ornament',
        qty: 1,
        purity: '22ct',
        grossWeight: 0,
        deductionWeight: 0,
        netWeight: 0
      }
    ]);
  };

  const handleUpdateItem = (index: number, field: keyof OrnamentItem, val: any) => {
    setItems((prev) => {
      const copy = [...prev];
      const target = { ...copy[index], [field]: val };
      if (field === 'grossWeight' || field === 'deductionWeight') {
        const gross = Number(field === 'grossWeight' ? val : target.grossWeight) || 0;
        const ded = Number(field === 'deductionWeight' ? val : target.deductionWeight) || 0;
        target.netWeight = Math.max(0, Math.round((gross - ded) * 1000) / 1000);
      }
      copy[index] = target;
      return copy;
    });
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) {
      showToast('At least one collateral ornament item is required.', 'warning');
      return;
    }
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const validateInputs = (): boolean => {
    setErrorMessage(null);
    if (!principal || principal <= 0) {
      setErrorMessage('Principal amount must be greater than zero.');
      return false;
    }
    if (principal < totalPrincipalRepaid) {
      setErrorMessage(
        `Principal cannot be set below ₹${totalPrincipalRepaid.toLocaleString('en-IN')}, as this amount has already been repaid.`
      );
      return false;
    }
    if (interestRate < 0) {
      setErrorMessage('Interest rate cannot be negative.');
      return false;
    }
    if (!issueDate || !issueDate.trim()) {
      setErrorMessage('Loan issue date is required.');
      return false;
    }
    const dateCheck = validateLoanIssueDate(issueDate.trim());
    if (!dateCheck.isValid) {
      setErrorMessage(dateCheck.error || 'Invalid loan issue date format.');
      return false;
    }
    if (items.length === 0) {
      setErrorMessage('At least one collateral ornament item is required.');
      return false;
    }
    for (const it of items) {
      if (!it.item || !it.item.trim()) {
        setErrorMessage('All ornament items must have a name or description.');
        return false;
      }
      if (!it.qty || it.qty < 1) {
        setErrorMessage('Ornament quantity must be at least 1.');
        return false;
      }
      if (it.grossWeight < 0 || (it.deductionWeight || 0) < 0) {
        setErrorMessage('Ornament weights cannot be negative.');
        return false;
      }
      if ((it.deductionWeight || 0) > it.grossWeight) {
        setErrorMessage(`Deduction weight cannot exceed gross weight for ${it.item}.`);
        return false;
      }
    }
    if (!reason || !reason.trim()) {
      setErrorMessage('An administrative modification reason is mandatory for audit logging.');
      return false;
    }
    return true;
  };

  const handleProceedToReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateInputs()) return;
    if (isFinancialChanged) {
      setStep('review');
    } else {
      handleFinalSubmit();
    }
  };

  const handleFinalSubmit = async () => {
    if (!validateInputs()) return;
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const nomineeData: NomineeDetails | undefined = hasNominee
        ? {
            hasNominee: true,
            enabled: true,
            name: nomineeName.trim(),
            fullName: nomineeName.trim(),
            relationship: nomineeRelation.trim(),
            relation: nomineeRelation.trim(),
            phone: nomineePhone.trim(),
            mobile: nomineePhone.trim(),
            aadhaarNumber: nomineeAadhaar.trim(),
            address: nomineeAddress.trim()
          }
        : undefined;

      const guarantorData: GuarantorDetails | undefined = hasGuarantor
        ? {
            hasGuarantor: true,
            enabled: true,
            name: guarantorName.trim(),
            fullName: guarantorName.trim(),
            relationship: guarantorRelation.trim(),
            relation: guarantorRelation.trim(),
            phone: guarantorPhone.trim(),
            mobile: guarantorPhone.trim(),
            aadhaarNumber: guarantorAadhaar.trim(),
            address: guarantorAddress.trim()
          }
        : undefined;

      const payload = {
        principal,
        interestRate,
        date: issueDate.trim(),
        nextDueDate: nextDueDate.trim() || undefined,
        status,
        notes: notes.trim(),
        items,
        marketValue: effectiveMarketValue,
        nominee: nomineeData,
        guarantor: guarantorData,
        reason: reason.trim()
      };

      const result = await updateLoan(loan.id, payload);
      if (result.success) {
        if (onSuccess) onSuccess();
        onClose();
      } else {
        setErrorMessage(result.message || 'Failed to update loan.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'An unexpected error occurred while saving.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.72)',
        backdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2500,
        padding: '20px',
        overflowY: 'auto'
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '860px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.22)',
          border: '1px solid var(--border-light, #e2e8f0)',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* MODAL HEADER */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid var(--border-subtle, #e2e8f0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'var(--bg-surface-secondary, #f8fafc)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                backgroundColor: 'rgba(23, 107, 82, 0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-primary-dark, #176B52)'
              }}
            >
              <Edit3 size={18} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text-dark, #0f172a)' }}>
                  Edit Loan: {loan.loanNo}
                </h2>
                <span className="badge badge-gold" style={{ fontSize: '10.5px' }}>
                  ADMIN-ONLY ACTION
                </span>
                <span
                  className={`badge ${
                    loan.status === 'ACTIVE'
                      ? 'badge-success'
                      : loan.status === 'CLOSED'
                      ? 'badge-info'
                      : 'badge-warning'
                  }`}
                  style={{ fontSize: '11px' }}
                >
                  {loan.status}
                </span>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted, #64748b)', marginTop: '2px' }}>
                Borrower: <strong>{loan.customerName}</strong> • Customer ID: <strong>{loan.customerId}</strong>
              </div>
            </div>
          </div>

          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            style={{ width: '32px', height: '32px', borderRadius: '50%' }}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* ERROR BANNER */}
        {errorMessage && (
          <div
            style={{
              padding: '12px 20px',
              backgroundColor: '#fef2f2',
              borderBottom: '1px solid #fecaca',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              color: '#991b1b',
              fontSize: '13px',
              fontWeight: 600
            }}
          >
            <AlertTriangle size={16} color="#dc2626" style={{ flexShrink: 0 }} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* MODAL BODY */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '22px' }}>
          {step === 'edit' ? (
            <form id="edit-loan-form" onSubmit={handleProceedToReview} style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
              {/* SECTION 1: FINANCIAL PARAMETERS */}
              <div
                style={{
                  padding: '18px',
                  borderRadius: '12px',
                  border: '1px solid var(--border-subtle, #e2e8f0)',
                  backgroundColor: 'var(--bg-surface-secondary, #f8fafc)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                  <DollarSign size={16} color="var(--color-primary-dark, #176B52)" />
                  <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: 'var(--text-dark, #0f172a)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Loan Financial Parameters
                  </h3>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                  {/* Principal */}
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-dark, #1e293b)', marginBottom: '5px' }}>
                      Principal Amount (₹) *
                    </label>
                    <input
                      type="number"
                      className="input-control"
                      value={principal || ''}
                      onChange={(e) => setPrincipal(Number(e.target.value) || 0)}
                      required
                      min={totalPrincipalRepaid > 0 ? totalPrincipalRepaid : 1}
                      style={{ fontWeight: 800, fontSize: '15px', color: 'var(--color-primary-dark, #176B52)' }}
                    />
                    {totalPrincipalRepaid > 0 && (
                      <span style={{ fontSize: '11px', color: 'var(--text-muted, #64748b)', marginTop: '3px', display: 'block' }}>
                        ₹{totalPrincipalRepaid.toLocaleString('en-IN')} already repaid (Principal cannot be below this)
                      </span>
                    )}
                  </div>

                  {/* Interest Rate */}
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-dark, #1e293b)', marginBottom: '5px' }}>
                      Interest Rate (% / month) *
                    </label>
                    <input
                      type="number"
                      step="0.05"
                      className="input-control"
                      value={interestRate || ''}
                      onChange={(e) => setInterestRate(Number(e.target.value) || 0)}
                      required
                      min={0}
                      style={{ fontWeight: 700 }}
                    />
                    <span style={{ fontSize: '11px', color: 'var(--text-muted, #64748b)', marginTop: '3px', display: 'block' }}>
                      Projected Monthly Interest: ₹{projectedMonthlyInterest.toLocaleString('en-IN')}
                    </span>
                  </div>

                  {/* Issue Date */}
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-dark, #1e293b)', marginBottom: '5px' }}>
                      Loan Issue Date *
                    </label>
                    <input
                      type="text"
                      className="input-control"
                      placeholder="DD-MM-YYYY or YYYY-MM-DD"
                      value={issueDate}
                      onChange={(e) => setIssueDate(e.target.value)}
                      required
                    />
                    <span style={{ fontSize: '11px', color: 'var(--text-muted, #64748b)', marginTop: '3px', display: 'block' }}>
                      Allows up to 30 days backdating
                    </span>
                  </div>

                  {/* Next Due Date */}
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-dark, #1e293b)', marginBottom: '5px' }}>
                      Next Due Date
                    </label>
                    <input
                      type="text"
                      className="input-control"
                      placeholder="DD-MM-YYYY"
                      value={nextDueDate}
                      onChange={(e) => setNextDueDate(e.target.value)}
                    />
                  </div>

                  {/* Status */}
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-dark, #1e293b)', marginBottom: '5px' }}>
                      Loan Status *
                    </label>
                    <select
                      className="input-control"
                      value={status}
                      onChange={(e) => setStatus(e.target.value as any)}
                      style={{ fontWeight: 700 }}
                    >
                      <option value="ACTIVE">🟢 ACTIVE</option>
                      <option value="CLOSED">⚪ CLOSED</option>
                      <option value="PENDING">🟡 PENDING</option>
                      <option value="OVERDUE">🔴 OVERDUE</option>
                    </select>
                  </div>

                  {/* Projected Outstanding Balance (Read-only preview) */}
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted, #64748b)', marginBottom: '5px' }}>
                      Projected Outstanding
                    </label>
                    <div
                      style={{
                        padding: '10px 14px',
                        backgroundColor: '#ffffff',
                        border: '1px solid var(--border-subtle, #e2e8f0)',
                        borderRadius: '8px',
                        fontWeight: 800,
                        fontSize: '15px',
                        color: 'var(--color-danger, #ef4444)'
                      }}
                    >
                      ₹{projectedOutstanding.toLocaleString('en-IN')}
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 2: COLLATERAL ORNAMENT ITEMS */}
              <div
                style={{
                  padding: '18px',
                  borderRadius: '12px',
                  border: '1px solid var(--border-subtle, #e2e8f0)',
                  backgroundColor: '#ffffff'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Coins size={16} color="var(--color-primary-dark, #176B52)" />
                    <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: 'var(--text-dark, #0f172a)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Pledged Collateral Ornaments ({items.length} Items)
                    </h3>
                  </div>

                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={handleAddItem}
                    style={{ fontSize: '12px', gap: '4px', height: '30px' }}
                  >
                    <Plus size={13} />
                    <span>Add Item</span>
                  </button>
                </div>

                <div className="table-container" style={{ marginBottom: '12px' }}>
                  <table className="custom-table" style={{ fontSize: '12.5px' }}>
                    <thead>
                      <tr>
                        <th style={{ minWidth: '160px' }}>ITEM DESCRIPTION</th>
                        <th style={{ width: '70px' }}>QTY</th>
                        <th style={{ width: '100px' }}>PURITY</th>
                        <th style={{ width: '100px' }}>GROSS WT (g)</th>
                        <th style={{ width: '100px' }}>DEDUCTION (g)</th>
                        <th style={{ width: '90px' }}>NET WT (g)</th>
                        <th style={{ width: '50px', textAlign: 'center' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it, idx) => (
                        <tr key={it.id || idx}>
                          <td>
                            <input
                              type="text"
                              className="input-control"
                              style={{ height: '32px', fontSize: '12px' }}
                              value={it.item}
                              onChange={(e) => handleUpdateItem(idx, 'item', e.target.value)}
                              placeholder="e.g. Gold Ring"
                              required
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              min={1}
                              className="input-control"
                              style={{ height: '32px', fontSize: '12px' }}
                              value={it.qty}
                              onChange={(e) => handleUpdateItem(idx, 'qty', parseInt(e.target.value, 10) || 1)}
                              required
                            />
                          </td>
                          <td>
                            <select
                              className="input-control"
                              style={{ height: '32px', fontSize: '12px' }}
                              value={it.purity}
                              onChange={(e) => handleUpdateItem(idx, 'purity', e.target.value)}
                            >
                              <option value="22ct">22ct</option>
                              <option value="24ct">24ct</option>
                              <option value="18ct">18ct</option>
                              <option value="20ct">20ct</option>
                              <option value="14ct">14ct</option>
                              <option value="Silver 925">Silver 925</option>
                              <option value="Silver 999">Silver 999</option>
                            </select>
                          </td>
                          <td>
                            <input
                              type="number"
                              step="0.001"
                              min={0}
                              className="input-control"
                              style={{ height: '32px', fontSize: '12px' }}
                              value={it.grossWeight}
                              onChange={(e) => handleUpdateItem(idx, 'grossWeight', parseFloat(e.target.value) || 0)}
                              required
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              step="0.001"
                              min={0}
                              className="input-control"
                              style={{ height: '32px', fontSize: '12px' }}
                              value={it.deductionWeight || 0}
                              onChange={(e) => handleUpdateItem(idx, 'deductionWeight', parseFloat(e.target.value) || 0)}
                            />
                          </td>
                          <td style={{ fontWeight: 800, color: 'var(--color-primary-dark, #176B52)' }}>
                            {it.netWeight}g
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button
                              type="button"
                              className="icon-button"
                              style={{ width: '28px', height: '28px', color: '#ef4444' }}
                              onClick={() => handleRemoveItem(idx)}
                              title="Remove item"
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Collateral Summary Row */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px',
                    padding: '10px 14px',
                    backgroundColor: 'var(--bg-surface-secondary, #f8fafc)',
                    borderRadius: '8px',
                    fontSize: '12.5px',
                    fontWeight: 700
                  }}
                >
                  <span>Gross: {totalGrossWeight.toFixed(3)}g</span>
                  <span>Deduction: {totalDeductionWeight.toFixed(3)}g</span>
                  <span style={{ color: 'var(--color-primary-dark, #176B52)' }}>Net: {totalNetWeight.toFixed(3)}g</span>
                  <span>Market Value: ₹{effectiveMarketValue.toLocaleString('en-IN')}</span>
                  <span>LTV: {ltv}%</span>
                </div>
              </div>

              {/* SECTION 3: NOMINEE & GUARANTOR DETAILS */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
                  gap: '16px'
                }}
              >
                {/* Nominee */}
                <div
                  style={{
                    padding: '16px',
                    borderRadius: '12px',
                    border: '1px solid var(--border-subtle, #e2e8f0)',
                    backgroundColor: 'var(--bg-surface-secondary, #f8fafc)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <User size={15} color="var(--color-primary-dark, #176B52)" />
                      <strong style={{ fontSize: '13px', color: 'var(--text-dark, #0f172a)' }}>Nominee Details</strong>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={hasNominee}
                        onChange={(e) => setHasNominee(e.target.checked)}
                      />
                      <span>Enable Nominee</span>
                    </label>
                  </div>

                  {hasNominee && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px' }}>
                      <input
                        type="text"
                        className="input-control"
                        placeholder="Full Name"
                        value={nomineeName}
                        onChange={(e) => setNomineeName(e.target.value)}
                      />
                      <input
                        type="text"
                        className="input-control"
                        placeholder="Relationship (e.g. Spouse, Son)"
                        value={nomineeRelation}
                        onChange={(e) => setNomineeRelation(e.target.value)}
                      />
                      <input
                        type="text"
                        className="input-control"
                        placeholder="Mobile (10 digits)"
                        value={nomineePhone}
                        onChange={(e) => setNomineePhone(e.target.value)}
                      />
                      <input
                        type="text"
                        className="input-control"
                        placeholder="Aadhaar / ID Number"
                        value={nomineeAadhaar}
                        onChange={(e) => setNomineeAadhaar(e.target.value)}
                      />
                      <textarea
                        className="input-control"
                        rows={2}
                        placeholder="Address"
                        value={nomineeAddress}
                        onChange={(e) => setNomineeAddress(e.target.value)}
                      />
                    </div>
                  )}
                </div>

                {/* Guarantor */}
                <div
                  style={{
                    padding: '16px',
                    borderRadius: '12px',
                    border: '1px solid var(--border-subtle, #e2e8f0)',
                    backgroundColor: 'var(--bg-surface-secondary, #f8fafc)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <ShieldCheck size={15} color="var(--color-primary-dark, #176B52)" />
                      <strong style={{ fontSize: '13px', color: 'var(--text-dark, #0f172a)' }}>Guarantor Details</strong>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={hasGuarantor}
                        onChange={(e) => setHasGuarantor(e.target.checked)}
                      />
                      <span>Enable Guarantor</span>
                    </label>
                  </div>

                  {hasGuarantor && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px' }}>
                      <input
                        type="text"
                        className="input-control"
                        placeholder="Full Name"
                        value={guarantorName}
                        onChange={(e) => setGuarantorName(e.target.value)}
                      />
                      <input
                        type="text"
                        className="input-control"
                        placeholder="Relationship (e.g. Brother, Friend)"
                        value={guarantorRelation}
                        onChange={(e) => setGuarantorRelation(e.target.value)}
                      />
                      <input
                        type="text"
                        className="input-control"
                        placeholder="Mobile (10 digits)"
                        value={guarantorPhone}
                        onChange={(e) => setGuarantorPhone(e.target.value)}
                      />
                      <input
                        type="text"
                        className="input-control"
                        placeholder="Aadhaar / ID Number"
                        value={guarantorAadhaar}
                        onChange={(e) => setGuarantorAadhaar(e.target.value)}
                      />
                      <textarea
                        className="input-control"
                        rows={2}
                        placeholder="Address"
                        value={guarantorAddress}
                        onChange={(e) => setGuarantorAddress(e.target.value)}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* SECTION 4: NOTES & REASON */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                  padding: '18px',
                  borderRadius: '12px',
                  border: '1px solid var(--border-subtle, #e2e8f0)',
                  backgroundColor: '#ffffff'
                }}
              >
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-dark, #1e293b)', marginBottom: '5px' }}>
                    Internal Loan Notes
                  </label>
                  <textarea
                    className="input-control"
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Optional administrative notes or annotations regarding this loan."
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#991b1b', marginBottom: '5px' }}>
                    Reason for Administrative Modification * (Mandatory for Audit Trail)
                  </label>
                  <textarea
                    className="input-control"
                    rows={2}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Specify the reason for editing this loan record (e.g. Corrected weight deduction entry per pledge receipt, adjusted interest profile by admin approval)."
                    required
                    style={{ borderColor: reason.trim() ? '#10b981' : '#f87171' }}
                  />
                </div>
              </div>
            </form>
          ) : (
            /* REVIEW & CONFIRMATION STEP */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div
                style={{
                  padding: '16px',
                  borderRadius: '12px',
                  backgroundColor: '#fef3c7',
                  border: '1.5px solid #fde68a',
                  color: '#92400e',
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px'
                }}
              >
                <AlertTriangle size={24} color="#b45309" style={{ flexShrink: 0 }} />
                <div>
                  <h4 style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: 800 }}>
                    Please review your financial modifications carefully
                  </h4>
                  <span>
                    You are applying administrative changes to an existing loan. Ensure all recalculated numbers align with business records before confirming.
                  </span>
                </div>
              </div>

              {/* Financial Diff Table */}
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table className="custom-table" style={{ fontSize: '13px' }}>
                  <thead>
                    <tr>
                      <th>FINANCIAL FIELD</th>
                      <th>CURRENT / ORIGINAL</th>
                      <th>NEW MODIFIED VALUE</th>
                      <th>CHANGE STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ fontWeight: 700 }}>Principal Amount</td>
                      <td>₹{loan.principal.toLocaleString('en-IN')}</td>
                      <td style={{ fontWeight: 800, color: 'var(--color-primary-dark, #176B52)' }}>
                        ₹{principal.toLocaleString('en-IN')}
                      </td>
                      <td>
                        {principal !== loan.principal ? (
                          <span className="badge badge-warning">MODIFIED</span>
                        ) : (
                          <span className="badge badge-secondary">UNCHANGED</span>
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 700 }}>Monthly Interest Rate</td>
                      <td>{loan.interestRate}% / mo</td>
                      <td style={{ fontWeight: 800, color: 'var(--color-primary-dark, #176B52)' }}>
                        {interestRate}% / mo
                      </td>
                      <td>
                        {interestRate !== loan.interestRate ? (
                          <span className="badge badge-warning">MODIFIED</span>
                        ) : (
                          <span className="badge badge-secondary">UNCHANGED</span>
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 700 }}>Monthly Interest Due</td>
                      <td>₹{(loan.monthlyInterest || 0).toLocaleString('en-IN')}</td>
                      <td style={{ fontWeight: 800, color: 'var(--color-primary-accent, #059669)' }}>
                        ₹{projectedMonthlyInterest.toLocaleString('en-IN')}
                      </td>
                      <td>
                        {projectedMonthlyInterest !== loan.monthlyInterest ? (
                          <span className="badge badge-warning">RECALCULATED</span>
                        ) : (
                          <span className="badge badge-secondary">UNCHANGED</span>
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 700 }}>Outstanding Balance</td>
                      <td>₹{(loan.outstandingPrincipal ?? loan.principal).toLocaleString('en-IN')}</td>
                      <td style={{ fontWeight: 800, color: '#dc2626' }}>
                        ₹{projectedOutstanding.toLocaleString('en-IN')}
                      </td>
                      <td>
                        {projectedOutstanding !== (loan.outstandingPrincipal ?? loan.principal) ? (
                          <span className="badge badge-warning">RECALCULATED</span>
                        ) : (
                          <span className="badge badge-secondary">UNCHANGED</span>
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 700 }}>Loan Status</td>
                      <td>{loan.status}</td>
                      <td style={{ fontWeight: 700 }}>{status}</td>
                      <td>
                        {status !== loan.status ? (
                          <span className="badge badge-warning">MODIFIED</span>
                        ) : (
                          <span className="badge badge-secondary">UNCHANGED</span>
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 700 }}>Total Net Weight</td>
                      <td>{loan.totalNetWeight || 0}g</td>
                      <td style={{ fontWeight: 700 }}>{totalNetWeight.toFixed(3)}g</td>
                      <td>
                        {totalNetWeight !== loan.totalNetWeight ? (
                          <span className="badge badge-warning">RECALCULATED</span>
                        ) : (
                          <span className="badge badge-secondary">UNCHANGED</span>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Audit Details Box */}
              <div
                style={{
                  padding: '14px 18px',
                  backgroundColor: 'var(--bg-surface-secondary, #f8fafc)',
                  borderRadius: '10px',
                  border: '1px solid var(--border-subtle, #e2e8f0)',
                  fontSize: '12.5px'
                }}
              >
                <span style={{ color: 'var(--text-muted, #64748b)', fontWeight: 600 }}>Audit Trail Note:</span>
                <p style={{ margin: '4px 0 0 0', fontWeight: 700, color: 'var(--text-dark, #0f172a)' }}>
                  "{reason}"
                </p>
              </div>
            </div>
          )}
        </div>

        {/* MODAL FOOTER */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--border-subtle, #e2e8f0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '12px',
            backgroundColor: 'var(--bg-surface-secondary, #f8fafc)'
          }}
        >
          {step === 'edit' ? (
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                form="edit-loan-form"
                className="btn btn-primary"
                disabled={isSubmitting}
                style={{ gap: '6px', fontWeight: 800, padding: '8px 20px' }}
              >
                <span>{isFinancialChanged ? 'Review Financial Changes' : 'Save Changes'}</span>
                <ChevronRight size={15} />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setStep('edit')}
                disabled={isSubmitting}
              >
                &larr; Back to Editing
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleFinalSubmit}
                disabled={isSubmitting}
                style={{ gap: '6px', fontWeight: 800, padding: '8px 24px' }}
              >
                {isSubmitting ? (
                  <span>Saving Changes...</span>
                ) : (
                  <>
                    <CheckCircle2 size={16} />
                    <span>Confirm &amp; Apply Changes</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
