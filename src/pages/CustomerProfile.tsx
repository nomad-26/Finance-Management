import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import {
  ArrowLeft,
  User,
  ShieldCheck,
  MapPin,
  Eye,
  Edit3,
  Plus,
  FileSpreadsheet,
  Receipt as ReceiptIcon,
  Coins,
  Clock,
  AlertCircle,
  ExternalLink,
  Landmark,
  DollarSign,
  Trash2,
  FileText,
  Upload,
  Lock
} from 'lucide-react';
import { formatIdProofDisplay } from '../utils/kycValidation';
import { ViewFDModal } from '../components/common/ViewFDModal';
import { UploadKycModal } from '../components/common/UploadKycModal';
import { isMatchingCustomerId, getCanonicalCustomerId } from '../utils/customerUtils';
import { toDisplayDate } from '../components/common/AgeDobInput';
import {
  formatFDDate,
  normalizeDateString,
  compareFDDates,
  getDaysDifference,
  getAllPendingFDInterestPeriods,
  getPendingFDInterestPeriods,
  addCalendarMonths
} from '../utils/fdInterestUtils';
import { FixedDeposit, CustomerKycDocument, CustomerPhotoData, Customer } from '../types';
import { apiService } from '../services/api';

type ActiveTab = 'overview' | 'loans' | 'fixed-deposits' | 'pending' | 'pledged-items' | 'payments' | 'activity';

export const formatCurrency = (val: any, fallback: string = '₹0'): string => {
  if (val === undefined || val === null || val === '') return fallback;
  const num = Number(val);
  if (isNaN(num)) return fallback;
  return `₹${num.toLocaleString('en-IN')}`;
};

export const formatNumber = (val: any, fallback: string = '0'): string => {
  if (val === undefined || val === null || val === '') return fallback;
  const num = Number(val);
  if (isNaN(num)) return fallback;
  return num.toLocaleString('en-IN');
};

export const formatDateSafe = (dateVal: any, fallback: string = '—'): string => {
  if (!dateVal) return fallback;
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) {
    if (typeof dateVal === 'string' && dateVal.trim().length > 0) return dateVal;
    return fallback;
  }
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const CustomerProfile: React.FC = () => {
  const {
    customers,
    loans,
    fixedDeposits,
    receipts,
    fdInterestPayouts,
    fdWithdrawals,
    fdRenewals,
    payFDInterest,
    selectedProfileCustomerId,
    setSelectedLoan,
    setCurrentPage,
    startEditCustomer,
    showToast,
    masterControlSettings,
    reloadAllData,
    updateCustomer,
    hasPermission
  } = useApp();

  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [selectedViewFD, setSelectedViewFD] = useState<FixedDeposit | null>(null);

  const [isUploadKycOpen, setIsUploadKycOpen] = useState<boolean>(false);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);

  // Real-time server-synced customer state & KYC loading
  const [liveCustomer, setLiveCustomer] = useState<Customer | null>(null);
  const [isLoadingKyc, setIsLoadingKyc] = useState<boolean>(false);
  const [kycFetchError, setKycFetchError] = useState<string | null>(null);
  const [viewingDocId, setViewingDocId] = useState<string | null>(null);

  // Normalized today's date
  const todayStr = useMemo(() => formatFDDate(new Date()), []);

  // Extract customerId from selectedProfileCustomerId OR URL search params
  const effectiveCustId = useMemo(() => {
    if (selectedProfileCustomerId) return selectedProfileCustomerId;
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const urlId = urlParams.get('customerId') || urlParams.get('id');
      if (urlId) return urlId;
      if (window.location.hash.includes('customerId=')) {
        const match = window.location.hash.match(/customerId=([^&]+)/);
        if (match) return match[1];
      }
    }
    return '';
  }, [selectedProfileCustomerId]);

  // Find customer by id or customerId
  const baseCustomer = useMemo(() => {
    return (
      customers.find(
        (c) =>
          (effectiveCustId && (c.id === effectiveCustId || (c.customerId && c.customerId.toString() === effectiveCustId) || isMatchingCustomerId(effectiveCustId, c)))
      ) || customers[0]
    );
  }, [customers, effectiveCustId]);

  const customer = liveCustomer || baseCustomer;

  const fetchFreshCustomerData = async (targetId: string) => {
    if (!targetId) return;
    setIsLoadingKyc(true);
    setKycFetchError(null);
    try {
      const res = await apiService.getCustomerById(targetId);
      if (res && res.success && res.data) {
        setLiveCustomer(res.data);
      } else if (res && (res as any).customerId) {
        setLiveCustomer(res as any);
      }
    } catch (err: any) {
      console.warn('[CustomerProfile] Error fetching fresh customer KYC data:', err?.message || err);
      setKycFetchError('Unable to load KYC documents from server.');
    } finally {
      setIsLoadingKyc(false);
    }
  };

  useEffect(() => {
    const idToFetch = customer?.id || customer?.customerId || effectiveCustId;
    if (idToFetch) {
      fetchFreshCustomerData(String(idToFetch));
    }
  }, [effectiveCustId, customer?.id]);

  if (!customer) {
    return (
      <div className="page-content" style={{ padding: '40px', textAlign: 'center' }}>
        <button className="btn btn-secondary" onClick={() => setCurrentPage('search-customer')} style={{ marginBottom: '20px' }}>
          <ArrowLeft size={16} />
          <span>Back to Search Customers</span>
        </button>
        <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
          <AlertCircle size={48} color="var(--color-danger, #ef4444)" style={{ margin: '0 auto 16px' }} />
          <h2>Customer Profile Not Found</h2>
          <p style={{ color: 'var(--text-muted)' }}>The requested customer profile could not be located.</p>
        </div>
      </div>
    );
  }

  const canonicalCustId = getCanonicalCustomerId(customer);

  const customerPhotoSrc = useMemo(() => {
    if (typeof customer.customerPhoto === 'string' && customer.customerPhoto) {
      return customer.customerPhoto;
    }
    return (
      customer.customerPhotoData?.viewUrl ||
      customer.customerPhotoData?.url ||
      ''
    );
  }, [customer]);

  const handleDeleteDocument = async (docId: string, docName: string) => {
    if (!docId) return;
    if (!window.confirm(`Are you sure you want to permanently delete "${docName}" from Customer Profile?`)) {
      return;
    }
    setDeletingDocId(docId);
    try {
      const res = await apiService.deleteCustomerKyc(customer.id, docId);
      if (res && res.success) {
        if (res.data) {
          setLiveCustomer(res.data);
          updateCustomer(customer.id, res.data);
        } else {
          await reloadAllData();
          fetchFreshCustomerData(customer.id);
        }
        showToast('Document deleted successfully from Telegram storage and profile', 'success');
      } else {
        showToast(res?.message || 'Failed to delete document', 'error');
      }
    } catch (err: any) {
      console.error('Delete document error:', err);
      showToast(err.message || 'Error deleting document', 'error');
    } finally {
      setDeletingDocId(null);
    }
  };

  const handleViewDocument = async (docObj: any) => {
    if (!docObj) return;
    const docKey = docObj.id || docObj.fileId || docObj.telegramFileId || 'photo';
    try {
      setViewingDocId(docKey);
      const res = await apiService.viewProtectedDocument(docObj);
      if (!res.success) {
        showToast(res.message || 'Unable to open document. Please check permissions.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to open document.', 'error');
    } finally {
      setViewingDocId(null);
    }
  };

  const handleKycUploaded = (updatedCustomer: any) => {
    if (updatedCustomer) {
      setLiveCustomer(updatedCustomer);
      if (updatedCustomer.id) {
        updateCustomer(updatedCustomer.id, updatedCustomer);
      }
    }
    const idToFetch = customer?.id || customer?.customerId || effectiveCustId;
    if (idToFetch) {
      fetchFreshCustomerData(String(idToFetch));
    }
  };

  // Open Full-Page Customer Edit with current data
  const handleOpenEditModal = () => {
    startEditCustomer(customer.id);
  };

  // ── Customer Loans (using customerId as relationship) ───────────────────────
  const customerLoans = useMemo(() => {
    return loans.filter((l) => isMatchingCustomerId(l.customerId, customer));
  }, [loans, customer]);

  const activeLoans = useMemo(() => {
    return customerLoans.filter((l) => l.status !== 'CLOSED' && (l.outstandingPrincipal ?? l.principal) > 0);
  }, [customerLoans]);

  const activeLoansCount = activeLoans.length;
  const totalOutstandingLoans = activeLoans.reduce((sum, l) => sum + (l.outstandingPrincipal ?? l.principal ?? 0), 0);

  // ── Customer Fixed Deposits (using customerId as relationship) ───────────────
  const customerFDs = useMemo(() => {
    return fixedDeposits.filter((fd) => isMatchingCustomerId(fd.customerId, customer));
  }, [fixedDeposits, customer]);

  const activeFDs = useMemo(() => {
    return customerFDs.filter((fd) => fd.status === 'ACTIVE');
  }, [customerFDs]);

  const activeFDsCount = activeFDs.length;
  const totalFdBalance = activeFDs.reduce((sum, fd) => sum + (fd.remainingPrincipal ?? fd.principal ?? 0), 0);

  // ── Requirement 4: Financial Exposure ───────────────────────────────────────
  const totalFinancialExposure = totalOutstandingLoans + totalFdBalance;

  // ── Requirement 7: Real-Time Dynamic Pending Loan Calculations ──────────────
  const pendingLoanItems = useMemo(() => {
    return activeLoans
      .map((l) => {
        const rawDueDate = l.nextDueDate || l.renewalDate || l.date;
        const dueDateStr = normalizeDateString(rawDueDate);
        const outstanding = l.outstandingPrincipal ?? l.principal;
        const baseMonthly =
          l.monthlyInterest > 0
            ? l.monthlyInterest
            : Math.round((outstanding * (l.interestRate || 1.5)) / 100);

        const periodReceipts = receipts.filter(
          (r) =>
            (r.loanNo === l.loanNo || r.loanId === l.id) &&
            (r.kind === 'INTEREST PAYMENT' || r.kind === 'REPAYMENT' || r.kind === 'PART PAYMENT' || r.kind === 'LOAN CLOSURE') &&
            (r.date === dueDateStr ||
              compareFDDates(r.date, dueDateStr) >= 0 ||
              (r.currentDueDate && normalizeDateString(r.currentDueDate) === dueDateStr))
        );

        const paidAmt = periodReceipts.reduce((sum, r) => sum + (r.interestComponent || 0), 0);
        const isPaid =
          paidAmt >= baseMonthly ||
          (l.lastInterestPaidDate && compareFDDates(normalizeDateString(l.lastInterestPaidDate), dueDateStr) >= 0);

        const remainingDue = isPaid ? 0 : Math.max(0, baseMonthly - paidAmt);
        const comp = compareFDDates(todayStr, dueDateStr);
        const daysOverdue = comp > 0 ? Math.max(0, getDaysDifference(todayStr, dueDateStr)) : 0;
        const penaltyRate = masterControlSettings?.overduePenaltyPerDayPercent ?? 0;
        const penalty = (daysOverdue > 0 && penaltyRate > 0) ? Math.round((remainingDue * penaltyRate * daysOverdue) / 100) : 0;

        return {
          loan: l,
          loanNo: l.loanNo,
          dueDateStr,
          interestDue: remainingDue,
          penalty,
          totalDue: remainingDue + penalty,
          daysOverdue,
          isOverdue: daysOverdue > 0,
          isPaid
        };
      })
      .filter((item) => !item.isPaid && item.totalDue > 0);
  }, [activeLoans, receipts, todayStr, masterControlSettings]);

  const totalPendingLoanAmount = pendingLoanItems.reduce((sum, item) => sum + item.totalDue, 0);

  // ── Requirement 7: Real-Time Dynamic Pending FD Interest Calculations ───────
  const pendingFDItems = useMemo(() => {
    const pendingPeriods = getAllPendingFDInterestPeriods(activeFDs, fdInterestPayouts || [], todayStr);
    return pendingPeriods.map((p) => ({
      fdNo: p.fdNo,
      payoutDate: p.dueDate,
      interestDue: p.amount,
      daysOverdue: p.daysOverdue
    }));
  }, [activeFDs, fdInterestPayouts, todayStr]);

  const totalPendingFDInterest = pendingFDItems.reduce((sum, p) => sum + p.interestDue, 0);

  // ── Requirement 4: Upcoming FD Maturity ────────────────────────────────────
  const upcomingFDMaturity = useMemo(() => {
    if (activeFDs.length === 0) return '—';
    const sorted = [...activeFDs].sort((a, b) =>
      compareFDDates(normalizeDateString(a.maturityDate), normalizeDateString(b.maturityDate))
    );
    return sorted[0].maturityDate || '—';
  }, [activeFDs]);

  // ── Pledged Items across customer loans ────────────────────────────────────
  const allPledgedItems = useMemo(() => {
    return customerLoans.flatMap((l) =>
      (l.items || []).map((item) => ({
        ...item,
        loanNo: l.loanNo,
        loanId: l.id,
        loanDate: l.date,
        loanStatus: l.status,
        photos: l.photos || []
      }))
    );
  }, [customerLoans]);

  // ── Customer Receipts ──────────────────────────────────────────────────────
  const customerReceipts = useMemo(() => {
    return receipts.filter(
      (r) =>
        r.customerId === customer.id ||
        (customer.customerId && r.customerId === customer.customerId.toString()) ||
        isMatchingCustomerId(r.customerId, customer) ||
        customerLoans.some((l) => l.loanNo === r.loanNo)
    );
  }, [receipts, customer, customerLoans]);

  const totalPaid = customerReceipts.reduce((sum, r) => sum + (r.amount || 0), 0);

  // Navigation Handlers
  const handleViewLoan = (loan: any) => {
    setSelectedLoan(loan);
    setCurrentPage('loan-display');
    showToast(`Viewing loan details for ${loan.loanNo}`, 'info');
  };

  const handleViewFD = (fd: any) => {
    setCurrentPage('deposit-display');
    showToast(`Viewing deposit details for ${fd.fdNo}`, 'info');
  };

  const loc: any = customer.currentLocation;
  const mapsUrl =
    loc?.googleMapsUrl ||
    loc?.mapsUrl ||
    (loc?.coordinates ? `https://maps.google.com/?q=${loc.coordinates}` : null);

  // Activity Timeline Events
  const activityEvents = [
    {
      id: 'act-1',
      date: customer.joinedDate || '01/08/2026',
      title: 'Customer Onboarded & Master Profile Created',
      desc: `Registered customer ${customer.name || 'Customer'} with Customer ID ${canonicalCustId}`,
      type: 'user'
    },
    ...customerLoans.map((l: any) => {
      const pAmt = l.principal ?? l.principalAmount ?? l.amount ?? 0;
      const rate = l.interestRate ?? 0;
      return {
        id: `act-loan-${l.id || l.loanNo}`,
        date: l.date || l.createdAt || '—',
        title: `Loan ${l.loanNo || '—'} Issued`,
        desc: `${l.loanTypeName || l.loanType || 'Loan'} principal of ${formatCurrency(pAmt)} issued @ ${rate}% interest/mo`,
        type: 'loan'
      };
    }),
    ...customerFDs.map((fd: any) => {
      const pAmt = fd.principal ?? fd.depositAmount ?? fd.amount ?? 0;
      const rate = fd.interestRatePA ?? fd.interestRate ?? 0;
      return {
        id: `act-fd-${fd.id || fd.fdNo}`,
        date: fd.depositDate || fd.date || '—',
        title: `Fixed Deposit ${fd.fdNo || '—'} Issued`,
        desc: `Term deposit of ${formatCurrency(pAmt)} @ ${rate}% p.a.`,
        type: 'fd'
      };
    }),
    ...(fdInterestPayouts || [])
      .filter((p: any) => customerFDs.some((f: any) => f.fdNo === p.fdNo))
      .map((p: any) => {
        const amt = p.amount ?? p.interestAmount ?? 0;
        return {
          id: `act-fd-payout-${p.id || Math.random()}`,
          date: p.date || p.payoutDate || '—',
          title: `FD Interest Payout for ${p.fdNo || 'FD'}`,
          desc: `Paid ${formatCurrency(amt)} interest via ${p.mode || 'Cash'}`,
          type: 'receipt'
        };
      }),
    ...(fdWithdrawals || [])
      .filter((w: any) => customerFDs.some((f: any) => f.fdNo === w.fdNo))
      .map((w: any) => {
        const amt = w.principalAmount ?? w.amount ?? 0;
        return {
          id: `act-fd-wd-${w.id || Math.random()}`,
          date: w.withdrawalDate || w.date || '—',
          title: `FD Principal Withdrawal — ${w.fdNo || 'FD'}`,
          desc: `Withdrew ${formatCurrency(amt)} (${w.withdrawalType || 'PARTIAL'} withdrawal)`,
          type: 'fd'
        };
      }),
    ...(fdRenewals || [])
      .filter((r: any) => customerFDs.some((f: any) => f.fdNo === r.fdNo))
      .map((r: any) => ({
        id: `act-fd-rn-${r.id || Math.random()}`,
        date: r.renewalDate || r.date || '—',
        title: `FD Term Renewal — ${r.fdNo || 'FD'}`,
        desc: `Renewed for ${r.renewalPeriodMonths ?? 0} months. New maturity date: ${r.newMaturityDate || '—'}`,
        type: 'fd'
      })),
    ...customerReceipts.map((r: any) => {
      const amt = r.amount ?? ((r.principalPaid ?? 0) + (r.interestPaid ?? 0));
      return {
        id: `act-rc-${r.id || r.receiptNo}`,
        date: r.date || r.paymentDate || '—',
        title: `Payment Receipt #${r.receiptNo || '—'} Recorded`,
        desc: `Received ${formatCurrency(amt)} via ${r.paymentMode || 'Cash'} for ${r.loanNo || 'Account'} (${r.kind || 'Payment'})`,
        type: 'receipt'
      };
    })
  ].sort((a, b) => {
    const parseTime = (dateStr: string) => {
      if (!dateStr || dateStr === '—') return 0;
      if (typeof dateStr === 'string' && dateStr.includes('/')) {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          const d = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
          if (!isNaN(d.getTime())) return d.getTime();
        }
      }
      const t = new Date(dateStr).getTime();
      return isNaN(t) ? 0 : t;
    };
    return parseTime(b.date) - parseTime(a.date);
  });

  return (
    <div className="page-content" style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
      {/* ════════════════════════════════════════════════════════════════════════
          TOP NAVIGATION BAR
          ════════════════════════════════════════════════════════════════════════ */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <button
          className="btn btn-secondary"
          onClick={() => setCurrentPage('search-customer')}
          style={{ gap: '8px', fontWeight: 600, fontSize: '13px' }}
        >
          <ArrowLeft size={16} />
          <span>&larr; Back to Search Customers</span>
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            className="btn btn-secondary"
            onClick={handleOpenEditModal}
            style={{ gap: '6px', fontSize: '13px', padding: '8px 16px', fontWeight: 600 }}
          >
            <Edit3 size={15} />
            <span>Edit Profile</span>
          </button>

          <button
            className="btn btn-primary"
            onClick={() => {
              setCurrentPage('loan-issue');
              showToast(`Pre-selected customer ${customer.name} for Loan Issue`, 'info');
            }}
            style={{ gap: '6px', fontSize: '13px', padding: '8px 16px', fontWeight: 700 }}
          >
            <Plus size={15} />
            <span>+ Issue New Loan</span>
          </button>

          <button
            className="btn btn-secondary"
            onClick={() => {
              setCurrentPage('new-deposit');
              showToast(`Pre-selected customer ${customer.name} for Fixed Deposit`, 'info');
            }}
            style={{ gap: '6px', fontSize: '13px', padding: '8px 16px', fontWeight: 700 }}
          >
            <Landmark size={15} />
            <span>+ New Deposit</span>
          </button>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          SECTION 27: CUSTOMER PROFILE HERO HEADER
          ════════════════════════════════════════════════════════════════════════ */}
      {/* ════════════════════════════════════════════════════════════════════════
          SECTION 27: CUSTOMER PROFILE HERO HEADER
          ════════════════════════════════════════════════════════════════════════ */}
      <div
        className="card"
        style={{
          padding: '24px',
          border: '1.5px solid var(--border-light)',
          borderRadius: '14px',
          boxShadow: 'var(--shadow-sm)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '18px', flex: '1 1 300px', minWidth: '260px' }}>
            {/* PHOTO / AVATAR */}
            {typeof customerPhotoSrc === 'string' && customerPhotoSrc.startsWith('data:image/') ? (
              <img
                src={customerPhotoSrc}
                alt={customer.name}
                style={{
                  width: '84px',
                  height: '84px',
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: '3px solid var(--color-primary-accent, #059669)',
                  boxShadow: '0 4px 14px rgba(5, 150, 105, 0.15)',
                  flexShrink: 0
                }}
              />
            ) : (
              <div
                style={{
                  width: '84px',
                  height: '84px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--color-light-accent, rgba(47, 111, 91, 0.15))',
                  color: 'var(--color-primary-dark)',
                  fontWeight: 800,
                  fontSize: '30px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '3px solid var(--color-primary-accent, #059669)',
                  boxShadow: '0 4px 14px rgba(5, 150, 105, 0.15)',
                  flexShrink: 0
                }}
              >
                {customer.name?.charAt(0)?.toUpperCase() || 'C'}
              </div>
            )}

            {/* NAME & PRIMARY METADATA */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 900, color: 'var(--text-primary)' }}>
                  {customer.name}
                </h1>
                <span className={`badge ${customer.status === 'VERIFIED' ? 'badge-success' : 'badge-warning'}`}>
                  {customer.status === 'VERIFIED' ? '✓ Verified' : '🟡 Pending KYC'}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', color: 'var(--text-muted)', fontSize: '13px', marginTop: '6px', fontWeight: 600 }}>
                <span style={{ color: 'var(--color-primary-dark)', fontWeight: 800, backgroundColor: 'var(--bg-surface-secondary)', padding: '2px 10px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                  Customer ID: {canonicalCustId}
                </span>
                <span>📱 +91 {customer.phone}</span>
                {customer.email && <span>✉️ {customer.email}</span>}
              </div>
              <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '4px' }}>
                📍 {customer.currentAddress ? customer.currentAddress.slice(0, 55) + (customer.currentAddress.length > 55 ? '...' : '') : 'Registered Customer'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          SECTION 4: COMPLETE 9-CARD CUSTOMER OVERVIEW FINANCIAL SUMMARY
          ════════════════════════════════════════════════════════════════════════ */}
      <div>
        <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--color-primary-dark)', letterSpacing: '0.05em', marginBottom: '8px', textTransform: 'uppercase' }}>
          CUSTOMER FINANCIAL OVERVIEW
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
            gap: '12px',
            width: '100%',
            boxSizing: 'border-box'
          }}
        >
          {/* Total Loans */}
          <div className="card" style={{ padding: '14px 16px', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
            <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>TOTAL LOANS</div>
            <div style={{ fontSize: '20px', fontWeight: 900, color: 'var(--color-primary-dark)', marginTop: '4px' }}>{customerLoans.length}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>All pledge contracts</div>
          </div>

          {/* Active Loans */}
          <div className="card" style={{ padding: '14px 16px', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
            <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--badge-success-text)', textTransform: 'uppercase' }}>ACTIVE LOANS</div>
            <div style={{ fontSize: '20px', fontWeight: 900, color: 'var(--badge-success-text)', marginTop: '4px' }}>{activeLoansCount}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Currently open</div>
          </div>

          {/* Total Loan Outstanding */}
          <div className="card" style={{ padding: '14px 16px', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
            <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-primary-dark)', textTransform: 'uppercase' }}>LOAN OUTSTANDING</div>
            <div style={{ fontSize: '18px', fontWeight: 900, color: 'var(--color-primary-dark)', marginTop: '4px' }}>{formatCurrency(totalOutstandingLoans)}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Current balance</div>
          </div>

          {/* Total Fixed Deposits */}
          <div className="card" style={{ padding: '14px 16px', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
            <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>TOTAL FIXED DEPOSITS</div>
            <div style={{ fontSize: '20px', fontWeight: 900, color: 'var(--color-primary-dark)', marginTop: '4px' }}>{customerFDs.length}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>All deposit folios</div>
          </div>

          {/* Active FD Balance */}
          <div className="card" style={{ padding: '14px 16px', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
            <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-primary-accent)', textTransform: 'uppercase' }}>ACTIVE FD BALANCE</div>
            <div style={{ fontSize: '18px', fontWeight: 900, color: 'var(--color-primary-accent)', marginTop: '4px' }}>{formatCurrency(totalFdBalance)}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{activeFDsCount} active accounts</div>
          </div>

          {/* Pending Loan Amount */}
          <div className="card" style={{ padding: '14px 16px', borderRadius: '12px', border: totalPendingLoanAmount > 0 ? '1.5px solid var(--color-danger)' : '1px solid var(--border-light)', backgroundColor: totalPendingLoanAmount > 0 ? 'var(--badge-danger-bg)' : undefined }}>
            <div style={{ fontSize: '11px', fontWeight: 800, color: totalPendingLoanAmount > 0 ? 'var(--color-danger)' : 'var(--text-muted)', textTransform: 'uppercase' }}>PENDING LOAN AMOUNT</div>
            <div style={{ fontSize: '18px', fontWeight: 900, color: totalPendingLoanAmount > 0 ? 'var(--color-danger)' : 'var(--text-primary)', marginTop: '4px' }}>
              {formatCurrency(totalPendingLoanAmount)}
            </div>
            <div style={{ fontSize: '11px', color: totalPendingLoanAmount > 0 ? 'var(--color-danger)' : 'var(--text-muted)', marginTop: '2px' }}>
              {pendingLoanItems.length > 0 ? `${pendingLoanItems.length} overdue/due` : 'No loan dues'}
            </div>
          </div>

          {/* Pending FD Interest */}
          <div className="card" style={{ padding: '14px 16px', borderRadius: '12px', border: totalPendingFDInterest > 0 ? '1.5px solid var(--color-warning)' : '1px solid var(--border-light)', backgroundColor: totalPendingFDInterest > 0 ? 'var(--badge-warning-bg)' : undefined }}>
            <div style={{ fontSize: '11px', fontWeight: 800, color: totalPendingFDInterest > 0 ? 'var(--color-warning)' : 'var(--text-muted)', textTransform: 'uppercase' }}>PENDING FD INTEREST</div>
            <div style={{ fontSize: '18px', fontWeight: 900, color: totalPendingFDInterest > 0 ? 'var(--color-warning)' : 'var(--text-primary)', marginTop: '4px' }}>
              {formatCurrency(totalPendingFDInterest)}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
              {pendingFDItems.length > 0 ? `${pendingFDItems.length} payouts due` : 'Up to date'}
            </div>
          </div>

          {/* Upcoming FD Maturity */}
          <div className="card" style={{ padding: '14px 16px', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
            <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>UPCOMING FD MATURITY</div>
            <div style={{ fontSize: '16px', fontWeight: 900, color: 'var(--color-primary-dark)', marginTop: '6px' }}>
              {upcomingFDMaturity}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Nearest term expiry</div>
          </div>

          {/* Financial Exposure */}
          <div className="card" style={{ padding: '14px 16px', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
            <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-primary-accent)', textTransform: 'uppercase' }}>FINANCIAL EXPOSURE</div>
            <div style={{ fontSize: '18px', fontWeight: 900, color: 'var(--color-primary-dark)', marginTop: '6px' }}>
              {formatCurrency(totalFinancialExposure)}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Total company commitment</div>
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          SECTION 4: PENDING LOAN DUES & FD INTEREST PAYOUT ALERTS (IF ANY)
          ════════════════════════════════════════════════════════════════════════ */}
      {(pendingLoanItems.length > 0 || pendingFDItems.length > 0) && (
        <div
          className="card"
          style={{
            padding: '20px',
            borderRadius: '14px',
            border: '2px solid var(--border-light)',
            marginBottom: '24px',
            boxShadow: 'var(--shadow-sm)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertCircle size={18} color="var(--color-danger, #ef4444)" />
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 900, color: 'var(--color-danger, #ef4444)', letterSpacing: '0.02em' }}>
                PENDING FINANCIAL ACTION ITEMS
              </h3>
            </div>
            <span className="badge badge-danger" style={{ fontWeight: 800, fontSize: '11px' }}>
              ACTION REQUIRED
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
            {/* Loan Dues */}
            {pendingLoanItems.length > 0 && (
              <div style={{ padding: '14px', borderRadius: '10px', backgroundColor: 'var(--badge-danger-bg, rgba(239, 68, 68, 0.1))', border: '1px solid var(--badge-danger-border, rgba(239, 68, 68, 0.3))' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <strong style={{ color: 'var(--color-danger, #ef4444)', fontSize: '13px' }}>PENDING LOAN REPAYMENTS</strong>
                  <span className="badge badge-danger" style={{ fontSize: '10px' }}>{pendingLoanItems.length} Loan(s)</span>
                </div>
                {pendingLoanItems.map((pi, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: idx < pendingLoanItems.length - 1 ? '1px dashed var(--border-subtle)' : 'none', fontSize: '12.5px' }}>
                    <div>
                      <strong style={{ color: 'var(--text-dark)' }}>{pi.loanNo}</strong> &bull; Due: {pi.dueDateStr}
                      {pi.daysOverdue > 0 && (
                        <span style={{ color: 'var(--color-danger, #ef4444)', fontWeight: 700, marginLeft: '6px' }}>
                          ({pi.daysOverdue} days overdue)
                        </span>
                      )}
                    </div>
                    <div style={{ fontWeight: 900, color: 'var(--color-danger, #ef4444)' }}>
                      {formatCurrency(pi.totalDue)}
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  style={{ width: '100%', marginTop: '10px', fontWeight: 800, fontSize: '12px', justifyContent: 'center' }}
                  onClick={() => setCurrentPage('pending-loans')}
                >
                  <DollarSign size={14} style={{ marginRight: '4px' }} /> Collect Loan Payment in Pending Loans &rarr;
                </button>
              </div>
            )}

            {/* FD Interest Payouts */}
            {pendingFDItems.length > 0 && (
              <div style={{ padding: '14px', borderRadius: '10px', backgroundColor: 'var(--badge-warning-bg, rgba(245, 158, 11, 0.1))', border: '1px solid var(--badge-warning-border, rgba(245, 158, 11, 0.3))' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <strong style={{ color: 'var(--color-warning, #f59e0b)', fontSize: '13px' }}>PENDING FD INTEREST PAYOUTS</strong>
                  <span className="badge badge-warning" style={{ fontSize: '10px' }}>{pendingFDItems.length} Payout(s)</span>
                </div>
                {pendingFDItems.map((p, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: idx < pendingFDItems.length - 1 ? '1px dashed var(--border-subtle)' : 'none', fontSize: '12.5px' }}>
                    <div>
                      <strong style={{ color: 'var(--text-dark)' }}>{p.fdNo}</strong> &bull; Pending since: {p.payoutDate}
                    </div>
                    <div style={{ fontWeight: 900, color: 'var(--color-warning, #f59e0b)' }}>
                      {formatCurrency(p.interestDue)}
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ width: '100%', marginTop: '10px', fontWeight: 800, fontSize: '12px', justifyContent: 'center', color: 'var(--color-warning, #f59e0b)', borderColor: 'var(--badge-warning-border, rgba(245, 158, 11, 0.3))' }}
                  onClick={() => setCurrentPage('interest-pending')}
                >
                  <Landmark size={14} style={{ marginRight: '4px' }} /> Process FD Interest in Interest Pending &rarr;
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          SEGMENTED TAB BAR
          ════════════════════════════════════════════════════════════════════════ */}
      <div
        style={{
          display: 'flex',
          backgroundColor: 'var(--bg-surface-secondary, #f8fafc)',
          padding: '4px',
          borderRadius: '12px',
          border: '1px solid var(--border-light, #e2e8f0)',
          gap: '4px',
          overflowX: 'auto',
          boxSizing: 'border-box'
        }}
      >
        {[
          { id: 'overview', label: 'Overview & KYC', icon: User, count: null },
          { id: 'loans', label: 'Loans', icon: FileSpreadsheet, count: customerLoans.length },
          { id: 'fixed-deposits', label: 'Fixed Deposits', icon: Landmark, count: customerFDs.length },
          { id: 'pledged-items', label: 'Pledged Items', icon: Coins, count: allPledgedItems.length },
          { id: 'payments', label: 'Payments & Receipts', icon: ReceiptIcon, count: customerReceipts.length },
          { id: 'activity', label: 'Activity', icon: Clock, count: activityEvents.length }
        ].map((tab) => {
          const IconComp = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as ActiveTab)}
              style={{
                flex: '1 0 auto',
                padding: '10px 16px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 700,
                color: isActive ? 'var(--color-primary-dark, #163f35)' : 'var(--text-muted, #64748b)',
                backgroundColor: isActive ? 'var(--bg-card)' : 'transparent',
                border: 'none',
                borderBottom: isActive ? '2.5px solid var(--color-primary-accent, #059669)' : '2.5px solid transparent',
                boxShadow: isActive ? '0 2px 6px rgba(0, 0, 0, 0.05)' : 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease'
              }}
            >
              <IconComp size={15} color={isActive ? 'var(--color-primary-accent)' : 'var(--text-muted)'} />
              <span>{tab.label}</span>
              {tab.count !== null && (
                <span
                  style={{
                    fontSize: '11px',
                    padding: '1px 6px',
                    borderRadius: '10px',
                    backgroundColor: isActive ? 'var(--color-light-accent, #e6f4f1)' : 'var(--border-subtle, #e2e8f0)',
                    color: isActive ? 'var(--color-primary-dark)' : 'var(--text-muted)'
                  }}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          TAB 1: OVERVIEW & KYC
          ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px' }}>
          {/* PERSONAL & CONTACT INFORMATION */}
          <div className="card" style={{ padding: '22px', borderRadius: '12px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-card)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <User size={18} color="var(--color-primary-accent, #059669)" />
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--text-dark)' }}>
                  PERSONAL &amp; CONTACT INFORMATION
                </h3>
              </div>
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleOpenEditModal}
                style={{ fontSize: '11.5px', padding: '3px 10px', gap: '4px', fontWeight: 600 }}
              >
                <Edit3 size={13} />
                <span>Edit</span>
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>FULL NAME</span>
                <span style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-dark)' }}>{customer.name}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>CUSTOMER ID</span>
                <span style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--color-primary-dark)' }}>{canonicalCustId}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>PHONE</span>
                <span style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-dark)' }}>+91 {customer.phone}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>GENDER</span>
                <span style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-dark)' }}>{customer.gender || 'Male'}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>AGE / DOB</span>
                <span style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-dark)' }}>
                  {customer.dateOfBirth ? `${toDisplayDate(customer.dateOfBirth)} (${customer.age || 30} yrs)` : `${customer.age || 30} Years`}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>OCCUPATION</span>
                <span style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-dark)' }}>{customer.occupation || 'Self Employed'}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '4px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>EMAIL</span>
                <span style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-dark)' }}>{customer.email || 'N/A'}</span>
              </div>
            </div>
          </div>

          {/* KYC & ADDRESS VERIFICATION */}
          <div className="card" style={{ padding: '22px', borderRadius: '12px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-card)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <ShieldCheck size={18} color="var(--color-primary-accent, #059669)" />
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--text-dark)' }}>
                  KYC &amp; ADDRESS VERIFICATION
                </h3>
              </div>
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleOpenEditModal}
                style={{ fontSize: '11.5px', padding: '3px 10px', gap: '4px', fontWeight: 600 }}
              >
                <Edit3 size={13} />
                <span>Edit</span>
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>ID PROOF TYPE</span>
                <span style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--color-primary-dark)' }}>{customer.idProof || 'Aadhaar Card'}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>MASKED ID NUMBER</span>
                <span style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-dark)', fontFamily: 'monospace' }}>
                  {formatIdProofDisplay(customer.idProof, customer.idNumber)}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>CURRENT ADDRESS</span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-dark)', lineHeight: 1.4 }}>
                  {customer.currentAddress || 'No current address details recorded'}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>PERMANENT ADDRESS</span>
                  {(!customer.permanentAddress || customer.permanentAddress === customer.currentAddress) && (
                    <span className="badge badge-success" style={{ fontSize: '10px' }}>
                      ✓ Same as Current
                    </span>
                  )}
                </div>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-dark)', lineHeight: 1.4 }}>
                  {customer.permanentAddress || customer.currentAddress || 'Same as current address'}
                </span>
              </div>

              {mapsUrl && (
                <div style={{ marginTop: '4px' }}>
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-secondary btn-sm"
                    style={{ gap: '6px', width: '100%', justifyContent: 'center', fontWeight: 600, fontSize: '12px' }}
                  >
                    <MapPin size={14} color="var(--color-primary-accent)" />
                    <span>View Saved GPS Location on Google Maps</span>
                    <ExternalLink size={12} />
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* ════════════════════════════════════════════════════════════════════════
              KYC & GOOGLE DRIVE DOCUMENTS ATTACHMENT CARD
              ════════════════════════════════════════════════════════════════════════ */}
          <div
            className="card"
            style={{
              gridColumn: '1 / -1',
              padding: '24px',
              borderRadius: '12px',
              border: '1.5px solid var(--border-light)',
              backgroundColor: 'var(--bg-card)',
              boxShadow: 'var(--shadow-sm)'
            }}
          >
            {(() => {
              const kycList: CustomerKycDocument[] = Array.isArray(customer.kycDocuments) ? customer.kycDocuments : [];
              const hasPhoto = Boolean(customer.customerPhoto || customer.customerPhotoData);
              const photoData: CustomerPhotoData | null = customer.customerPhotoData || (customer.customerPhoto ? {
                fileName: 'customer-photo.jpg',
                url: customer.customerPhoto,
                viewUrl: customer.customerPhoto,
                mimeType: 'image/jpeg'
              } : null);
              const totalKycCount = kycList.length + (hasPhoto ? 1 : 0);

              const canViewKyc = hasPermission('customers', 'viewKyc') || hasPermission('kyc', 'view');

              if (!canViewKyc) {
                return (
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '18px',
                        paddingBottom: '14px',
                        borderBottom: '1px solid var(--border-subtle)',
                        flexWrap: 'wrap',
                        gap: '12px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div
                          style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '8px',
                            backgroundColor: 'rgba(239, 68, 68, 0.1)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#ef4444'
                          }}
                        >
                          <Lock size={20} />
                        </div>
                        <div>
                          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text-dark)' }}>
                            ATTACHED KYC DOCUMENTS
                          </h3>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                            Access Restricted (Requires KYC Permission)
                          </div>
                        </div>
                      </div>
                    </div>
                    <div
                      style={{
                        padding: '32px 20px',
                        textAlign: 'center',
                        backgroundColor: '#fef2f2',
                        borderRadius: '10px',
                        border: '1px dashed #fecaca'
                      }}
                    >
                      <Lock size={36} color="#b91c1c" style={{ margin: '0 auto 10px', opacity: 0.8 }} />
                      <h4 style={{ margin: '0 0 6px 0', fontSize: '14px', fontWeight: 700, color: '#991b1b' }}>
                        KYC Document Access Restricted
                      </h4>
                      <p style={{ margin: '0', fontSize: '12.5px', color: '#7f1d1d' }}>
                        You do not have permission to view or manage customer KYC documents. Please contact an Administrator to request KYC access.
                      </p>
                    </div>
                  </div>
                );
              }

              return (
                <>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '18px',
                      paddingBottom: '14px',
                      borderBottom: '1px solid var(--border-subtle)',
                      flexWrap: 'wrap',
                      gap: '12px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div
                        style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '8px',
                          backgroundColor: 'rgba(5, 150, 105, 0.1)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'var(--color-primary-accent, #059669)'
                        }}
                      >
                        <ShieldCheck size={20} />
                      </div>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text-dark)' }}>
                          KYC DOCUMENTS ({totalKycCount})
                        </h3>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <ShieldCheck size={12} color="#059669" />
                          <span>Telegram Secure Vault • Customer: <strong>{canonicalCustId}</strong></span>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => setIsUploadKycOpen(true)}
                        style={{ fontWeight: 700, fontSize: '12.5px', gap: '6px', padding: '6px 14px' }}
                      >
                        <Upload size={14} />
                        <span>Upload KYC Document</span>
                      </button>
                    </div>
                  </div>

                  {/* Loading & Error States */}
                  {isLoadingKyc && (
                    <div style={{ padding: '24px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      <div className="spinner" style={{ margin: '0 auto 10px' }} />
                      <span style={{ fontSize: '13px', fontWeight: 600 }}>Loading customer documents...</span>
                    </div>
                  )}

                  {kycFetchError && !isLoadingKyc && (
                    <div
                      style={{
                        padding: '10px 14px',
                        borderRadius: '8px',
                        backgroundColor: 'var(--badge-warning-bg, rgba(234, 179, 8, 0.1))',
                        border: '1px solid var(--badge-warning-border, rgba(234, 179, 8, 0.3))',
                        color: 'var(--color-warning-dark, #854d0e)',
                        fontSize: '12.5px',
                        fontWeight: 600,
                        marginBottom: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}
                    >
                      <AlertCircle size={15} />
                      <span>{kycFetchError}</span>
                    </div>
                  )}

                  {/* Empty State */}
                  {!isLoadingKyc && !hasPhoto && kycList.length === 0 && (
                    <div
                      style={{
                        padding: '36px 20px',
                        textAlign: 'center',
                        backgroundColor: 'var(--bg-surface-secondary, #f8fafc)',
                        borderRadius: '10px',
                        border: '1px dashed var(--border-light)'
                      }}
                    >
                      <FileText size={36} color="var(--text-muted)" style={{ margin: '0 auto 10px', opacity: 0.6 }} />
                      <h4 style={{ margin: '0 0 6px 0', fontSize: '14px', fontWeight: 700, color: 'var(--text-dark)' }}>
                        No documents uploaded yet.
                      </h4>
                      <p style={{ margin: '0 0 16px 0', fontSize: '12.5px', color: 'var(--text-muted)' }}>
                        Upload Aadhaar, PAN, Passport, Address Proof, or customer photo directly to Telegram storage.
                      </p>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => setIsUploadKycOpen(true)}
                        style={{ gap: '6px' }}
                      >
                        <Plus size={14} />
                        <span>Upload Document</span>
                      </button>
                    </div>
                  )}

                  {/* Document Grid */}
                  {!isLoadingKyc && (hasPhoto || kycList.length > 0) && (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                        gap: '16px'
                      }}
                    >
                      {/* Customer Photo Card */}
                      {hasPhoto && photoData && (() => {
                        return (
                          <div
                            style={{
                              padding: '16px',
                              borderRadius: '10px',
                              border: '1.5px solid rgba(5, 150, 105, 0.25)',
                              backgroundColor: 'var(--bg-surface, #ffffff)',
                              boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'space-between',
                              gap: '12px'
                            }}
                          >
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                              {typeof customerPhotoSrc === 'string' && customerPhotoSrc.startsWith('data:image/') ? (
                                <img
                                  src={customerPhotoSrc}
                                  alt="Customer Photo"
                                  style={{
                                    width: '56px',
                                    height: '56px',
                                    borderRadius: '8px',
                                    objectFit: 'cover',
                                    border: '1.5px solid #059669',
                                    flexShrink: 0
                                  }}
                                />
                              ) : (
                                <div
                                  style={{
                                    width: '56px',
                                    height: '56px',
                                    borderRadius: '8px',
                                    backgroundColor: 'rgba(5, 150, 105, 0.1)',
                                    color: '#059669',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontWeight: 800,
                                    flexShrink: 0
                                  }}
                                >
                                  <User size={24} />
                                </div>
                              )}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                                  <span className="badge badge-success" style={{ fontSize: '10px', padding: '1px 6px' }}>
                                    CUSTOMER PHOTO
                                  </span>
                                </div>
                                <div
                                  style={{
                                    fontSize: '13px',
                                    fontWeight: 700,
                                    color: 'var(--text-dark)',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis'
                                  }}
                                  title={photoData.fileName || 'customer-photo.jpg'}
                                >
                                  {photoData.fileName || 'customer-photo.jpg'}
                                </div>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                  IMAGE • Telegram Secure Storage
                                </div>
                              </div>
                            </div>

                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', paddingTop: '8px', borderTop: '1px solid var(--border-subtle)' }}>
                              <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                style={{ flex: 1.5, fontSize: '11.5px', padding: '5px 8px', justifyContent: 'center', gap: '5px', fontWeight: 700 }}
                                disabled={viewingDocId === (photoData?.fileId || 'photo')}
                                onClick={() => handleViewDocument(photoData || customer.customerPhoto)}
                              >
                                <ExternalLink size={13} />
                                <span>{viewingDocId === (photoData?.fileId || 'photo') ? 'Opening...' : 'View Photo'}</span>
                              </button>
                            </div>
                          </div>
                        );
                      })()}

                      {/* KYC Documents Cards */}
                      {kycList.map((doc, idx) => {
                        const docTypeLabel = (doc.documentType || doc.docType || 'Document').replace(/_/g, ' ').toUpperCase();
                        const isPdf = doc.mimeType?.toLowerCase().includes('pdf') || doc.fileName?.toLowerCase().endsWith('.pdf');
                        const isDocDeleting = deletingDocId === doc.id;

                        const fileSizeStr = doc.fileSize ? `${Math.round(doc.fileSize / 1024)} KB` : (doc.size ? `${Math.round(doc.size / 1024)} KB` : '');
                        const uploadDateStr = doc.uploadedAt ? formatDateSafe(doc.uploadedAt, '') : '';

                        return (
                          <div
                            key={doc.id || doc.fileId || idx}
                            style={{
                              padding: '16px',
                              borderRadius: '10px',
                              border: '1.5px solid var(--border-light)',
                              backgroundColor: 'var(--bg-surface, #ffffff)',
                              boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'space-between',
                              gap: '12px'
                            }}
                          >
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                              <div
                                style={{
                                  width: '48px',
                                  height: '48px',
                                  borderRadius: '8px',
                                  backgroundColor: isPdf ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                                  color: isPdf ? '#ef4444' : '#3b82f6',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontWeight: 800,
                                  fontSize: '11px',
                                  flexShrink: 0
                                }}
                              >
                                {isPdf ? 'PDF' : <FileText size={22} />}
                              </div>

                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                                  <span className="badge badge-info" style={{ fontSize: '10px', padding: '1px 6px' }}>
                                    {docTypeLabel}
                                  </span>
                                </div>
                                <div
                                  style={{
                                    fontSize: '13px',
                                    fontWeight: 700,
                                    color: 'var(--text-dark)',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis'
                                  }}
                                  title={doc.fileName || doc.originalFileName || 'Document'}
                                >
                                  {doc.fileName || doc.originalFileName || 'Document'}
                                </div>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                  {[isPdf ? 'PDF' : 'IMAGE', fileSizeStr, uploadDateStr ? `Uploaded ${uploadDateStr}` : ''].filter(Boolean).join(' • ')}
                                </div>
                              </div>
                            </div>

                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', paddingTop: '8px', borderTop: '1px solid var(--border-subtle)' }}>
                              <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                style={{ flex: 1.5, fontSize: '11.5px', padding: '5px 8px', justifyContent: 'center', gap: '5px', fontWeight: 700 }}
                                disabled={viewingDocId === (doc.id || doc.fileId || idx.toString())}
                                onClick={() => handleViewDocument(doc)}
                              >
                                <ExternalLink size={13} />
                                <span>{viewingDocId === (doc.id || doc.fileId || idx.toString()) ? 'Opening...' : 'View Document'}</span>
                              </button>

                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                title="Delete Document"
                                disabled={isDocDeleting}
                                style={{
                                  fontSize: '11.5px',
                                  padding: '5px 8px',
                                  color: 'var(--color-danger, #ef4444)',
                                  borderColor: 'rgba(239, 68, 68, 0.2)'
                                }}
                                onClick={() => handleDeleteDocument(doc.id || doc.fileId || '', doc.fileName || doc.originalFileName || 'document')}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          SECTION 5: TAB 2 — LOANS (CARDS + TABLE)
          ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'loans' && (
        <div className="card" style={{ padding: '24px', borderRadius: '12px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-card)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '14px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: 'var(--text-dark)' }}>
                LOANS FOR {(customer.name || 'Customer').toUpperCase()} ({canonicalCustId})
              </h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '12.5px', color: 'var(--text-muted)' }}>
                Showing only loans linked to Customer ID {canonicalCustId} ({customerLoans.length} total)
              </p>
            </div>

            <button
              className="btn btn-primary"
              onClick={() => {
                setCurrentPage('loan-issue');
                showToast(`Pre-selected customer ${customer.name || 'Customer'} for Loan Issue`, 'info');
              }}
              style={{ gap: '6px', fontSize: '13px', padding: '8px 16px' }}
            >
              <Plus size={15} />
              <span>Issue New Loan</span>
            </button>
          </div>

          {/* Section 5: Loan Cards View */}
          {customerLoans.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: '16px', marginBottom: '24px' }}>
              {customerLoans.map((l) => {
                const rawDueDate = l.nextDueDate || l.renewalDate || l.date;
                const dueDateStr = normalizeDateString(rawDueDate);
                const outstanding = l.status === 'CLOSED' ? 0 : (l.outstandingPrincipal ?? l.principal ?? 0);
                const baseMonthly =
                  (l.monthlyInterest ?? 0) > 0
                    ? l.monthlyInterest
                    : Math.round((outstanding * (l.interestRate || 1.5)) / 100);

                const comp = compareFDDates(todayStr, dueDateStr);
                const isOverdue = comp > 0 && l.status !== 'CLOSED' && outstanding > 0;

                return (
                  <div
                    key={`loan-card-${l.id}`}
                    style={{
                      padding: '18px',
                      borderRadius: '12px',
                      border: isOverdue ? '2px solid #f87171' : '1px solid var(--border-subtle)',
                      backgroundColor: 'var(--bg-surface-secondary)',
                      boxShadow: 'var(--shadow-sm)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: '12px'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)' }}>{l.loanTypeName || l.loanType}</span>
                          <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-primary-dark)' }}>{l.loanNo}</div>
                        </div>
                        <span
                          className={`badge ${
                            l.status === 'CLOSED'
                              ? ''
                              : isOverdue
                              ? 'badge-danger'
                              : l.status === 'ACTIVE'
                              ? 'badge-success'
                              : 'badge-warning'
                          }`}
                          style={l.status === 'CLOSED' ? { backgroundColor: '#94a3b8', color: '#fff' } : undefined}
                        >
                          {l.status === 'CLOSED' ? 'CLOSED' : isOverdue ? 'OVERDUE' : l.status}
                        </span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12.5px', marginTop: '12px', backgroundColor: 'var(--bg-surface-secondary)', padding: '10px 12px', borderRadius: '8px' }}>
                        <div>
                          <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Principal:</span>
                          <div style={{ fontWeight: 700 }}>{formatCurrency(l.principal ?? (l as any).principalAmount ?? (l as any).amount)}</div>
                        </div>
                        <div>
                          <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Outstanding:</span>
                          <div style={{ fontWeight: 800, color: 'var(--color-primary-dark)' }}>{formatCurrency(outstanding)}</div>
                        </div>
                        <div>
                          <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Monthly Interest:</span>
                          <div style={{ fontWeight: 700, color: 'var(--color-primary-accent, #059669)' }}>{formatCurrency(baseMonthly)}</div>
                        </div>
                        <div>
                          <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Next Due:</span>
                          <div style={{ fontWeight: 700, color: isOverdue ? '#dc2626' : 'inherit' }}>{dueDateStr}</div>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border-subtle)', paddingTop: '10px' }}>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        style={{ fontSize: '12px', fontWeight: 700, padding: '6px 14px' }}
                        onClick={() => handleViewLoan(l)}
                      >
                        <Eye size={13} style={{ marginRight: '4px' }} /> View Loan
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
              No loans recorded for this customer.
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          SECTION 6 & 7: TAB 3 — FIXED DEPOSITS (CARDS + TABLE + MODAL)
          ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'fixed-deposits' && (
        <div className="card" style={{ padding: '24px', borderRadius: '12px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-card)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '14px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: 'var(--text-dark)' }}>
                FIXED DEPOSITS FOR {(customer.name || 'Customer').toUpperCase()} ({canonicalCustId})
              </h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '12.5px', color: 'var(--text-muted)' }}>
                Showing only Fixed Deposits linked to Customer ID {canonicalCustId} ({customerFDs.length} total)
              </p>
            </div>

            <button
              className="btn btn-primary"
              onClick={() => {
                setCurrentPage('new-deposit');
                showToast(`Pre-selected customer ${customer.name || 'Customer'} for Fixed Deposit issue`, 'info');
              }}
              style={{ gap: '6px', fontSize: '13px', padding: '8px 16px' }}
            >
              <Plus size={15} />
              <span>Issue New Deposit</span>
            </button>
          </div>

          {/* Section 6 & 7: FD Cards View */}
          {customerFDs.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px', marginBottom: '24px' }}>
              {customerFDs.map((fd) => {
                const nextInterestStr = addCalendarMonths(fd.depositDate, 1);
                const remaining = fd.remainingPrincipal ?? fd.principal ?? (fd as any).depositAmount ?? 0;
                const isPartiallyWithdrawn = remaining < (fd.principal ?? (fd as any).depositAmount ?? 0) && remaining > 0;
                const isFullyWithdrawn = remaining <= 0 || fd.status === 'WITHDRAWN';

                // Pending interest for this specific FD
                const fdPendingPeriods = getPendingFDInterestPeriods(fd, fdInterestPayouts || [], todayStr);
                const fdPendingInterest = fdPendingPeriods.reduce((sum, p) => sum + (p.amount || 0), 0);

                // Interest paid for this specific FD
                const fdPaidPeriods = (fdInterestPayouts || []).filter((p) => p.fdNo === fd.fdNo);
                const fdTotalPaidInterest = fdPaidPeriods.reduce((sum, p) => sum + (p.amount || 0), 0);

                // Withdrawals for this specific FD
                const fdWds = (fdWithdrawals || []).filter((w) => w.fdNo === fd.fdNo);
                const fdTotalWithdrawn = fdWds.reduce((sum, w) => sum + (w.principalAmount ?? (w as any).amount ?? 0), 0);

                // Renewals for this specific FD
                const fdRns = (fdRenewals || []).filter((r) => r.fdNo === fd.fdNo);

                // Maturity remaining calculation
                const maturityComp = compareFDDates(todayStr, normalizeDateString(fd.maturityDate));
                const diffDays = getDaysDifference(todayStr, normalizeDateString(fd.maturityDate));
                const isMatured = maturityComp >= 0;
                const maturityStatusText = isMatured ? `Matured ${diffDays} day(s) ago` : `${diffDays} day(s) remaining`;

                return (
                  <div
                    key={`fd-card-${fd.id}`}
                    style={{
                      padding: '18px',
                      borderRadius: '12px',
                      border: fdPendingInterest > 0 ? '2px solid #fed7aa' : '1px solid var(--border-subtle)',
                      backgroundColor: 'var(--bg-surface-secondary)',
                      boxShadow: 'var(--shadow-sm)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: '12px'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)' }}>Fixed Deposit</span>
                          <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-primary-dark)' }}>{fd.fdNo}</div>
                        </div>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          <span
                            className={`badge ${
                              isFullyWithdrawn
                                ? 'badge-secondary'
                                : isPartiallyWithdrawn
                                ? 'badge-warning'
                                : fd.status === 'ACTIVE'
                                ? 'badge-success'
                                : 'badge-info'
                            }`}
                            style={{ fontWeight: 800, fontSize: '11px' }}
                          >
                            {isFullyWithdrawn
                              ? 'WITHDRAWN'
                              : isPartiallyWithdrawn
                              ? 'PARTIALLY WITHDRAWN'
                              : fd.status}
                          </span>
                          {fdPendingInterest > 0 && (
                            <span className="badge badge-danger" style={{ fontSize: '10.5px' }}>
                              ⚠ PENDING {formatCurrency(fdPendingInterest)}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Financial Metrics Grid (Section 7) */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px', marginTop: '12px', backgroundColor: 'var(--bg-surface-secondary)', padding: '10px 12px', borderRadius: '8px' }}>
                        <div>
                          <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Original Principal:</span>
                          <div style={{ fontWeight: 800 }}>{formatCurrency(fd.principal ?? (fd as any).depositAmount ?? (fd as any).amount)}</div>
                        </div>
                        <div>
                          <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Remaining Principal:</span>
                          <div style={{ fontWeight: 900, color: remaining > 0 ? 'var(--color-primary-dark)' : 'var(--text-muted)' }}>{formatCurrency(remaining)}</div>
                        </div>
                        <div>
                          <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Interest Rate:</span>
                          <div style={{ fontWeight: 700 }}>{fd.interestRatePA ?? (fd as any).interestRate ?? 0}% p.a.</div>
                        </div>
                        <div>
                          <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Monthly Payout:</span>
                          <div style={{ fontWeight: 700, color: 'var(--color-primary-accent, #059669)' }}>{formatCurrency(fd.monthlyPayout ?? 0)} / mo</div>
                        </div>
                        <div>
                          <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Next Interest Due:</span>
                          <div style={{ fontWeight: 700 }}>{nextInterestStr}</div>
                        </div>
                        <div>
                          <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Deposit Date:</span>
                          <div style={{ fontWeight: 700 }}>{fd.depositDate}</div>
                        </div>
                        <div>
                          <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Maturity Date:</span>
                          <div style={{ fontWeight: 700, color: isMatured ? '#dc2626' : 'inherit' }}>{fd.maturityDate}</div>
                          <span style={{ fontSize: '10.5px', color: isMatured ? '#dc2626' : 'var(--text-muted)' }}>{maturityStatusText}</span>
                        </div>
                        <div>
                          <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Interest Paid:</span>
                          <div style={{ fontWeight: 700, color: '#059669' }}>{formatCurrency(fdTotalPaidInterest)}</div>
                        </div>
                        <div>
                          <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Total Withdrawn:</span>
                          <div style={{ fontWeight: 700 }}>{formatCurrency(fdTotalWithdrawn)}</div>
                        </div>
                        {fdRns.length > 0 && (
                          <div style={{ gridColumn: 'span 2', borderTop: '1px dashed var(--border-subtle)', paddingTop: '6px', marginTop: '2px' }}>
                            <span style={{ color: '#059669', fontSize: '11px', fontWeight: 800 }}>✓ RENEWED: </span>
                            <span style={{ fontSize: '11.5px', fontWeight: 600 }}>Renewed for {fdRns[0].renewalPeriodMonths} months (New maturity: {fdRns[0].newMaturityDate})</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-subtle)', paddingTop: '10px' }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: '11.5px', fontWeight: 600 }}
                        onClick={() => handleViewFD(fd)}
                      >
                        Open in Register &rarr;
                      </button>

                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        style={{ fontSize: '12px', fontWeight: 700, padding: '6px 14px' }}
                        onClick={() => setSelectedViewFD(fd)}
                      >
                        <Eye size={13} style={{ marginRight: '4px' }} /> View Details / Folio
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
              No Fixed Deposits recorded yet for this customer.
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          TAB 4: PLEDGED COLLATERAL ITEMS
          ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'pledged-items' && (
        <div className="card" style={{ padding: '24px', borderRadius: '12px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-card)' }}>
          <h3 style={{ margin: '0 0 14px 0', fontSize: '17px', fontWeight: 800, color: 'var(--text-dark)' }}>
            PLEDGED COLLATERAL INVENTORY
          </h3>
          {allPledgedItems.length > 0 ? (
            <div className="table-container">
              <table className="custom-table" style={{ fontSize: '12.5px' }}>
                <thead>
                  <tr>
                    <th>ITEM</th>
                    <th>QTY</th>
                    <th>PURITY</th>
                    <th>GROSS WT</th>
                    <th>NET WT</th>
                    <th>LOAN NO</th>
                    <th>STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {allPledgedItems.map((it, idx) => (
                    <tr key={idx}>
                      <td style={{ fontWeight: 700 }}>{it.item}</td>
                      <td>{it.qty}</td>
                      <td>{it.purity}</td>
                      <td>{it.grossWeight}g</td>
                      <td style={{ fontWeight: 700 }}>{it.netWeight}g</td>
                      <td><span className="badge badge-info">{it.loanNo}</span></td>
                      <td><span className={`badge ${it.loanStatus === 'ACTIVE' ? 'badge-success' : 'badge-warning'}`}>{it.loanStatus}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
              No pledged collateral items found.
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          TAB 5: PAYMENTS & RECEIPTS
          ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'payments' && (
        <div className="card" style={{ padding: '24px', borderRadius: '12px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-card)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: 'var(--text-dark)' }}>
              PAYMENTS &amp; RECEIPTS
            </h3>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-primary-accent, #059669)' }}>
              Total Paid: {formatCurrency(totalPaid)}
            </span>
          </div>

          {customerReceipts.length > 0 ? (
            <div className="table-container">
              <table className="custom-table" style={{ fontSize: '12.5px' }}>
                <thead>
                  <tr>
                    <th>RECEIPT NO</th>
                    <th>DATE</th>
                    <th>LOAN NO</th>
                    <th>TYPE</th>
                    <th>AMOUNT</th>
                    <th>MODE</th>
                    <th>REFERENCE</th>
                  </tr>
                </thead>
                <tbody>
                  {customerReceipts.map((r) => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 800, color: 'var(--color-primary-dark)' }}>REC-{r.receiptNo}</td>
                      <td>{r.date}</td>
                      <td><strong>{r.loanNo || '—'}</strong></td>
                      <td><span className="badge badge-info">{r.kind}</span></td>
                      <td style={{ fontWeight: 800, color: '#059669' }}>{formatCurrency(r.amount ?? (((r as any).principalPaid ?? 0) + ((r as any).interestPaid ?? 0)))}</td>
                      <td>{r.paymentMode}</td>
                      <td style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>{r.transactionReference || 'Cash'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
              No payments or receipts recorded yet.
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          TAB 6: ACTIVITY TIMELINE
          ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'activity' && (
        <div className="card" style={{ padding: '24px', borderRadius: '12px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-card)' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '17px', fontWeight: 800, color: 'var(--text-dark)' }}>
            CHRONOLOGICAL ACTIVITY TIMELINE
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {activityEvents.map((evt) => (
              <div key={evt.id} style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', paddingBottom: '12px', borderBottom: '1px solid var(--border-subtle)' }}>
                <div style={{ minWidth: '90px', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)' }}>
                  {evt.date}
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '13.5px', color: 'var(--text-dark)' }}>{evt.title}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{evt.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* View FD Statement / Certificate Modal */}
      {selectedViewFD && (
        <ViewFDModal
          isOpen={Boolean(selectedViewFD)}
          fd={selectedViewFD}
          customer={customer}
          onClose={() => setSelectedViewFD(null)}
          onPayInterest={(fdNo) => {
            payFDInterest(fdNo, 'Cash');
            showToast(`Interest payment recorded for Fixed Deposit ${fdNo}`, 'success');
          }}
        />
      )}

      {/* Document Upload Modal */}
      <UploadKycModal
        isOpen={isUploadKycOpen}
        customer={customer}
        onClose={() => setIsUploadKycOpen(false)}
        onSuccess={handleKycUploaded}
      />
    </div>
  );
};
