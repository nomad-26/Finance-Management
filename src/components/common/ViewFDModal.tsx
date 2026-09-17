import React, { useState, useMemo } from 'react';
import { FixedDeposit, Customer } from '../../types';
import { useApp } from '../../context/AppContext';
import {
  X,
  Landmark,
  Printer,
  DollarSign,
  AlertTriangle
} from 'lucide-react';
import { getCanonicalCustomerId } from '../../utils/customerUtils';
import {
  formatFDDate,
  normalizeDateString,
  getDaysDifference,
  compareFDDates,
  getPendingFDInterestPeriods
} from '../../utils/fdInterestUtils';

export interface ViewFDModalProps {
  isOpen: boolean;
  fd: FixedDeposit | null;
  customer?: Customer | null;
  onClose: () => void;
  onPayInterest?: (fdNo: string) => void;
}

export const ViewFDModal: React.FC<ViewFDModalProps> = ({
  isOpen,
  fd,
  customer,
  onClose,
  onPayInterest
}) => {
  const {
    customers,
    fdInterestPayouts,
    fdWithdrawals,
    fdRenewals,
    payFDInterest,
    showToast
  } = useApp();

  const [activeTab, setActiveTab] = useState<'details' | 'interest' | 'withdrawals' | 'renewals'>('details');

  const todayStr = useMemo(() => formatFDDate(new Date()), []);

  const resolvedCustomer = useMemo(() => {
    if (customer) return customer;
    if (!fd) return null;
    return customers.find(
      (c) =>
        c.id === fd.customerId ||
        (c.customerId && c.customerId.toString() === fd.customerId) ||
        c.phone === fd.phone
    ) || null;
  }, [customer, fd, customers]);

  if (!isOpen || !fd) return null;

  const canonicalCustId = resolvedCustomer ? getCanonicalCustomerId(resolvedCustomer) : fd.customerId;
  const remainingPrincipal = fd.remainingPrincipal ?? fd.principal;
  const isPartiallyWithdrawn = remainingPrincipal < fd.principal && remainingPrincipal > 0;
  const isFullyWithdrawn = remainingPrincipal <= 0 || fd.status === 'WITHDRAWN';

  // Maturity calculation
  const maturityComp = compareFDDates(todayStr, normalizeDateString(fd.maturityDate));
  const diffDays = getDaysDifference(todayStr, normalizeDateString(fd.maturityDate));
  const isMatured = maturityComp >= 0;
  const maturityText = isMatured
    ? `Matured ${diffDays} day(s) ago`
    : `${diffDays} day(s) remaining`;

  // History lists for this specific FD
  const payoutsForFD = fdInterestPayouts.filter((p) => p.fdNo === fd.fdNo);
  const totalInterestPaid = payoutsForFD.reduce((sum, p) => sum + p.amount, 0);

  const withdrawalsForFD = fdWithdrawals.filter((w) => w.fdNo === fd.fdNo);
  const totalWithdrawnAmount = withdrawalsForFD.reduce((sum, w) => sum + (w.principalAmount || 0), 0);

  const renewalsForFD = fdRenewals.filter((r) => r.fdNo === fd.fdNo);

  // Dynamic Pending Interest calculation
  const pendingPeriods = getPendingFDInterestPeriods(fd, fdInterestPayouts, todayStr);
  const totalPendingInterest = pendingPeriods.reduce((sum, p) => sum + p.amount, 0);

  const handlePrint = () => {
    window.print();
  };

  const handlePayInterestClick = (payoutDate?: string, amount?: number) => {
    if (onPayInterest) {
      onPayInterest(fd.fdNo);
    } else {
      const success = payFDInterest(fd.fdNo, 'Cash', amount || fd.monthlyPayout, payoutDate);
      if (success) {
        showToast(`Interest of ₹${(amount || fd.monthlyPayout).toLocaleString('en-IN')} recorded for ${fd.fdNo}`, 'success');
      }
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
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 1050,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '840px',
          maxHeight: '92vh',
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* MODAL HEADER */}
        <div
          style={{
            padding: '18px 24px',
            backgroundColor: '#163f35',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: '42px', height: '42px', borderRadius: '10px', backgroundColor: 'rgba(255, 255, 255, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Landmark size={22} color="#fbbf24" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#ffffff' }}>
                  Fixed Deposit Details &mdash; {fd.fdNo}
                </h2>
                <span
                  style={{
                    fontSize: '11px',
                    padding: '2px 8px',
                    borderRadius: '6px',
                    fontWeight: 800,
                    backgroundColor: isFullyWithdrawn
                      ? '#64748b'
                      : isPartiallyWithdrawn
                      ? '#d97706'
                      : fd.status === 'ACTIVE'
                      ? '#10b981'
                      : '#3b82f6',
                    color: '#ffffff'
                  }}
                >
                  {isFullyWithdrawn
                    ? 'WITHDRAWN'
                    : isPartiallyWithdrawn
                    ? 'PARTIALLY WITHDRAWN'
                    : fd.status}
                </span>
              </div>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'rgba(255, 255, 255, 0.8)' }}>
                Master Customer: <strong>{resolvedCustomer?.name || fd.depositorName}</strong> ({canonicalCustId})
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#ffffff',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* MODAL BODY (SCROLLABLE) */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* CUSTOMER & CONTRACT HERO SUMMARY */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
              gap: '12px',
              backgroundColor: 'var(--bg-surface-secondary, #f8fafc)',
              padding: '16px',
              borderRadius: '12px',
              border: '1px solid var(--border-light, #e2e8f0)'
            }}
          >
            <div>
              <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>ORIGINAL PRINCIPAL</span>
              <div style={{ fontSize: '18px', fontWeight: 900, color: 'var(--color-primary-dark)', marginTop: '2px' }}>
                ₹{fd.principal.toLocaleString('en-IN')}
              </div>
            </div>

            <div>
              <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>REMAINING BALANCE</span>
              <div style={{ fontSize: '18px', fontWeight: 900, color: remainingPrincipal > 0 ? 'var(--color-primary-accent, #059669)' : '#64748b', marginTop: '2px' }}>
                ₹{remainingPrincipal.toLocaleString('en-IN')}
              </div>
            </div>

            <div>
              <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>INTEREST RATE</span>
              <div style={{ fontSize: '18px', fontWeight: 900, color: 'var(--color-primary-dark)', marginTop: '2px' }}>
                {fd.interestRatePA}% <span style={{ fontSize: '12px', fontWeight: 600 }}>p.a.</span>
              </div>
            </div>

            <div>
              <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>PERIODIC PAYOUT</span>
              <div style={{ fontSize: '18px', fontWeight: 900, color: 'var(--color-primary-dark)', marginTop: '2px' }}>
                ₹{fd.monthlyPayout.toLocaleString('en-IN')} <span style={{ fontSize: '12px', fontWeight: 600 }}>/mo</span>
              </div>
            </div>

            <div>
              <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>DEPOSIT DATE</span>
              <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-dark)', marginTop: '4px' }}>
                {fd.depositDate}
              </div>
            </div>

            <div>
              <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>MATURITY DATE</span>
              <div style={{ fontSize: '15px', fontWeight: 800, color: isMatured ? '#dc2626' : 'var(--text-dark)', marginTop: '4px' }}>
                {fd.maturityDate}
              </div>
              <span style={{ fontSize: '11px', color: isMatured ? '#dc2626' : 'var(--text-muted)', fontWeight: 700 }}>
                {maturityText}
              </span>
            </div>
          </div>

          {/* ⚠ PENDING INTEREST BANNER (IF ANY) */}
          {totalPendingInterest > 0 && (
            <div
              style={{
                padding: '14px 18px',
                borderRadius: '10px',
                backgroundColor: '#fef2f2',
                border: '1.5px solid #fca5a5',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '10px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <AlertTriangle size={22} color="#dc2626" />
                <div>
                  <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#991b1b' }}>
                    ⚠ INTEREST PENDING: ₹{totalPendingInterest.toLocaleString('en-IN')}
                  </div>
                  <div style={{ fontSize: '12px', color: '#b91c1c' }}>
                    {pendingPeriods.length} scheduled payout period(s) overdue
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="btn btn-primary btn-sm"
                style={{ backgroundColor: '#dc2626', borderColor: '#b91c1c', fontWeight: 800, fontSize: '12px' }}
                onClick={() => handlePayInterestClick()}
              >
                <DollarSign size={13} style={{ marginRight: '4px' }} /> Pay Pending Interest Now
              </button>
            </div>
          )}

          {/* INNER NAVIGATION TABS */}
          <div style={{ display: 'flex', gap: '6px', borderBottom: '1px solid var(--border-subtle)' }}>
            {[
              { id: 'details', label: 'Overview & Terms' },
              { id: 'interest', label: `Interest History (${payoutsForFD.length})` },
              { id: 'withdrawals', label: `Withdrawals (${withdrawalsForFD.length})` },
              { id: 'renewals', label: `Renewals (${renewalsForFD.length})` }
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id as any)}
                style={{
                  padding: '8px 16px',
                  fontSize: '12.5px',
                  fontWeight: activeTab === t.id ? 800 : 600,
                  color: activeTab === t.id ? 'var(--color-primary-dark)' : 'var(--text-muted)',
                  border: 'none',
                  borderBottom: activeTab === t.id ? '2.5px solid var(--color-primary-accent)' : '2.5px solid transparent',
                  background: 'transparent',
                  cursor: 'pointer'
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* TAB 1: OVERVIEW & TERMS */}
          {activeTab === 'details' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div style={{ backgroundColor: '#ffffff', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '16px' }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: 800, color: 'var(--color-primary-dark)', textTransform: 'uppercase' }}>
                  CUSTOMER &amp; NOMINEE INFORMATION
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12.5px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Customer ID:</span>
                    <strong>{canonicalCustId}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Depositor Name:</span>
                    <strong>{resolvedCustomer?.name || fd.depositorName}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Phone Number:</span>
                    <strong>+91 {resolvedCustomer?.phone || fd.phone}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>ID Proof:</span>
                    <span>{fd.idProofType || 'Aadhaar Card'}: {fd.idProofNumber}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Nominee:</span>
                    <span>{fd.nomineeName ? `${fd.nomineeName} (${fd.nomineeRelation || 'Nominee'})` : 'None'}</span>
                  </div>
                </div>
              </div>

              <div style={{ backgroundColor: '#ffffff', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '16px' }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: 800, color: 'var(--color-primary-dark)', textTransform: 'uppercase' }}>
                  FINANCIAL &amp; MATURITY TERMS
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12.5px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Tenure:</span>
                    <strong>{fd.tenureMonths || 12} Months</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Payout Frequency:</span>
                    <strong>{fd.payoutFrequency || 'Monthly'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Receiving Method:</span>
                    <strong>{fd.receivingMethod || 'Cash'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Total Interest Paid:</span>
                    <strong style={{ color: 'var(--color-primary-accent, #059669)' }}>₹{totalInterestPaid.toLocaleString('en-IN')}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Total Principal Withdrawn:</span>
                    <strong>₹{totalWithdrawnAmount.toLocaleString('en-IN')}</strong>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: INTEREST HISTORY */}
          {activeTab === 'interest' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-dark)' }}>
                  Recorded Interest Payouts ({payoutsForFD.length})
                </span>
                <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#059669' }}>
                  Total Paid: ₹{totalInterestPaid.toLocaleString('en-IN')}
                </span>
              </div>

              {payoutsForFD.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '13px' }}>
                  No interest payouts recorded yet for this Fixed Deposit.
                </div>
              ) : (
                <div className="table-container">
                  <table className="custom-table" style={{ fontSize: '12px' }}>
                    <thead>
                      <tr>
                        <th>PAYOUT DATE</th>
                        <th>DUE PERIOD</th>
                        <th>AMOUNT</th>
                        <th>PAYMENT MODE</th>
                        <th>STATUS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payoutsForFD.map((p) => (
                        <tr key={p.id}>
                          <td><strong>{p.date}</strong></td>
                          <td>{p.dueDate || p.periodKey || p.date}</td>
                          <td style={{ fontWeight: 800, color: '#059669' }}>₹{p.amount.toLocaleString('en-IN')}</td>
                          <td>{p.mode || 'Cash'}</td>
                          <td><span className="badge badge-success">PAID</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: WITHDRAWAL HISTORY */}
          {activeTab === 'withdrawals' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-dark)' }}>
                  Principal Withdrawals ({withdrawalsForFD.length})
                </span>
                <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--color-primary-dark)' }}>
                  Total Withdrawn: ₹{totalWithdrawnAmount.toLocaleString('en-IN')}
                </span>
              </div>

              {withdrawalsForFD.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '13px' }}>
                  No principal withdrawals have been made on this deposit.
                </div>
              ) : (
                <div className="table-container">
                  <table className="custom-table" style={{ fontSize: '12px' }}>
                    <thead>
                      <tr>
                        <th>VOUCHER ID</th>
                        <th>DATE</th>
                        <th>WITHDRAWN PRINCIPAL</th>
                        <th>INTEREST PAID</th>
                        <th>TOTAL PAID</th>
                        <th>BALANCE AFTER</th>
                        <th>MODE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {withdrawalsForFD.map((w) => (
                        <tr key={w.id}>
                          <td><strong>{w.withdrawalId || 'WD-001'}</strong></td>
                          <td>{w.withdrawalDate}</td>
                          <td style={{ fontWeight: 800 }}>₹{w.principalAmount.toLocaleString('en-IN')}</td>
                          <td>₹{(w.interestPaid || 0).toLocaleString('en-IN')}</td>
                          <td style={{ fontWeight: 800, color: '#059669' }}>₹{w.totalAmount.toLocaleString('en-IN')}</td>
                          <td>₹{(w.remainingBalance ?? 0).toLocaleString('en-IN')}</td>
                          <td>{w.mode}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: RENEWAL HISTORY */}
          {activeTab === 'renewals' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-dark)' }}>
                Term Renewals ({renewalsForFD.length})
              </span>

              {renewalsForFD.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '13px' }}>
                  This deposit is currently in its original contract term and has not been renewed yet.
                </div>
              ) : (
                <div className="table-container">
                  <table className="custom-table" style={{ fontSize: '12px' }}>
                    <thead>
                      <tr>
                        <th>RENEWAL ID</th>
                        <th>RENEWAL DATE</th>
                        <th>PREVIOUS MATURITY</th>
                        <th>NEW MATURITY</th>
                        <th>RENEWED FOR</th>
                        <th>INTEREST RATE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {renewalsForFD.map((r) => (
                        <tr key={r.id}>
                          <td><strong>{r.renewalId || 'RN-001'}</strong></td>
                          <td>{r.renewalDate}</td>
                          <td>{r.previousMaturityDate}</td>
                          <td style={{ fontWeight: 800, color: '#059669' }}>{r.newMaturityDate}</td>
                          <td>{r.renewalPeriodMonths} Months</td>
                          <td>{r.interestRateAtRenewal}% p.a.</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* MODAL FOOTER */}
        <div
          style={{
            padding: '14px 24px',
            backgroundColor: 'var(--bg-surface-secondary, #f8fafc)',
            borderTop: '1px solid var(--border-light, #e2e8f0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px'
          }}
        >
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handlePrint}
            style={{ gap: '6px', fontSize: '13px', fontWeight: 600 }}
          >
            <Printer size={15} />
            <span>Print FD Folio / Certificate</span>
          </button>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              style={{ padding: '8px 18px', fontSize: '13px', fontWeight: 600 }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
