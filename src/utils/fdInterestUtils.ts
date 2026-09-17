import { FixedDeposit, FDInterestPayout } from '../types';

/**
 * Parses date string in DD-MM-YYYY or YYYY-MM-DD format into a Date object.
 */
export const parseFDDate = (dateStr: string): Date => {
  if (!dateStr) return new Date();
  const parts = dateStr.trim().split(/[-/]/).map((p) => parseInt(p, 10));
  if (parts.length === 3 && !parts.some(isNaN)) {
    if (parts[0] > 1000) {
      // YYYY-MM-DD
      return new Date(parts[0], parts[1] - 1, parts[2]);
    } else {
      // DD-MM-YYYY
      return new Date(parts[2], parts[1] - 1, parts[0]);
    }
  }
  return new Date();
};

/**
 * Formats a Date object to DD-MM-YYYY string.
 */
export const formatFDDate = (date: Date): string => {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
};

/**
 * Normalizes any date string into DD-MM-YYYY format.
 */
export const normalizeDateString = (dateStr: string): string => {
  if (!dateStr) return '';
  return formatFDDate(parseFDDate(dateStr));
};

/**
 * Compares two date strings (DD-MM-YYYY or YYYY-MM-DD).
 * Returns -1 if d1 < d2, 0 if d1 == d2, 1 if d1 > d2.
 */
export const compareFDDates = (d1Str: string, d2Str: string): number => {
  const d1 = parseFDDate(d1Str);
  const d2 = parseFDDate(d2Str);

  const y1 = d1.getFullYear(), m1 = d1.getMonth(), day1 = d1.getDate();
  const y2 = d2.getFullYear(), m2 = d2.getMonth(), day2 = d2.getDate();

  if (y1 !== y2) return y1 < y2 ? -1 : 1;
  if (m1 !== m2) return m1 < m2 ? -1 : 1;
  if (day1 !== day2) return day1 < day2 ? -1 : 1;
  return 0;
};

/**
 * Calculates number of days difference between two dates (d1 - d2).
 */
export const getDaysDifference = (targetDateStr: string, baseDateStr: string): number => {
  const t = parseFDDate(targetDateStr);
  const b = parseFDDate(baseDateStr);
  const diffTime = t.getTime() - b.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
};

/**
 * Adds N calendar months to a date string, correctly handling month-end overflow
 * (e.g., Jan 31 + 1 month -> Feb 28/29, Feb 29 2024 + 1 month -> Mar 29 2024).
 */
export const addCalendarMonths = (startDateStr: string, monthsToAdd: number): string => {
  if (!startDateStr || monthsToAdd <= 0) return startDateStr;
  const date = parseFDDate(startDateStr);
  const origDay = date.getDate();
  const origMonth = date.getMonth(); // 0-indexed
  const origYear = date.getFullYear();

  const totalMonths = origMonth + monthsToAdd;
  const targetYear = origYear + Math.floor(totalMonths / 12);
  const targetMonth = ((totalMonths % 12) + 12) % 12; // 0-indexed

  // Get max days in target month
  const maxDaysInTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  const targetDay = Math.min(origDay, maxDaysInTargetMonth);

  const result = new Date(targetYear, targetMonth, targetDay);
  return formatFDDate(result);
};

/**
 * Returns number of months for a payout frequency string.
 * Monthly = 1, Quarterly = 3, Half-Yearly = 6, Yearly = 12.
 */
export const getMonthsForFrequency = (frequency?: string): number => {
  if (!frequency) return 1;
  const f = frequency.toLowerCase();
  if (f.includes('quarter')) return 3;
  if (f.includes('half') || f.includes('semi')) return 6;
  if (f.includes('year') || f.includes('annual')) return 12;
  if (f.includes('maturity')) return 0; // At maturity
  return 1; // Default Monthly
};

/**
 * Generates a unique interest period key for an FD and due date (e.g. FD-01_02-10-2026).
 */
export const calculateInterestPeriodKey = (fdNo: string, dueDateStr: string): string => {
  return `${fdNo}_${normalizeDateString(dueDateStr)}`;
};

/**
 * Calculates monthly/periodic interest payout amount strictly based on original FD contract.
 */
export const calculateFDInterestAmount = (fd: FixedDeposit): number => {
  if (fd.monthlyPayout && fd.monthlyPayout > 0) {
    return fd.monthlyPayout;
  }
  const principal = fd.remainingPrincipal ?? fd.principal;
  const rate = fd.interestRatePA || 12;
  const freqMonths = getMonthsForFrequency(fd.payoutFrequency || (fd as any).frequency);
  const months = freqMonths === 0 ? (fd.tenureMonths || 12) : freqMonths;
  const annualInterest = (principal * rate) / 100;
  return Math.round((annualInterest / 12) * months);
};

export interface PendingInterestPeriod {
  fdId: string;
  fdNo: string;
  customerId: string;
  depositorName: string;
  phone?: string;
  startDate: string;
  dueDate: string;
  periodKey: string;
  periodLabel: string;
  amount: number;
  daysOverdue: number;
  status: 'PENDING' | 'OVERDUE';
}

/**
 * Calculates all contractual due interest periods for a Fixed Deposit up to current date
 * that have NOT been paid yet.
 */
export const getPendingFDInterestPeriods = (
  fd: FixedDeposit,
  allPayouts: FDInterestPayout[],
  currentDateOverride?: string
): PendingInterestPeriod[] => {
  const todayStr = currentDateOverride ? normalizeDateString(currentDateOverride) : formatFDDate(new Date());
  const depositDate = normalizeDateString(fd.depositDate || formatFDDate(new Date()));
  const payoutFreqMonths = getMonthsForFrequency(fd.payoutFrequency || (fd as any).frequency);
  const payoutAmount = calculateFDInterestAmount(fd);

  if (fd.status === 'WITHDRAWN') {
    return [];
  }

  // If At Maturity (payoutFreqMonths === 0)
  if (payoutFreqMonths === 0) {
    const maturityDate = normalizeDateString(fd.maturityDate || addCalendarMonths(depositDate, fd.tenureMonths || 12));
    if (compareFDDates(todayStr, maturityDate) >= 0) {
      const pKey = calculateInterestPeriodKey(fd.fdNo, maturityDate);
      const isPaid = allPayouts.some(
        (p) =>
          (p.fdNo === fd.fdNo || (p.fdId && p.fdId === fd.id)) &&
          p.status === 'PAID' &&
          (p.periodKey === pKey || p.dueDate === maturityDate || p.date === maturityDate)
      );
      if (!isPaid) {
        const daysOverdue = Math.max(0, getDaysDifference(todayStr, maturityDate));
        return [
          {
            fdId: fd.id,
            fdNo: fd.fdNo,
            customerId: fd.customerId,
            depositorName: fd.depositorName,
            phone: fd.phone,
            startDate: depositDate,
            dueDate: maturityDate,
            periodKey: pKey,
            periodLabel: `At Maturity (${maturityDate})`,
            amount: payoutAmount,
            daysOverdue,
            status: daysOverdue > 0 ? 'OVERDUE' : 'PENDING'
          }
        ];
      }
    }
    return [];
  }

  const pending: PendingInterestPeriod[] = [];
  let cycle = 1;
  const maxCycles = (fd.tenureMonths || 120) * 2; // Safeguard loop

  while (cycle <= maxCycles) {
    const cycleDueDate = addCalendarMonths(depositDate, cycle * payoutFreqMonths);

    // Stop if future cycle (beyond today)
    if (compareFDDates(cycleDueDate, todayStr) > 0) {
      break;
    }

    // Stop if past maturity date and FD is matured
    if (fd.maturityDate) {
      const matDate = normalizeDateString(fd.maturityDate);
      if (compareFDDates(cycleDueDate, matDate) > 0) {
        break;
      }
    }

    const pKey = calculateInterestPeriodKey(fd.fdNo, cycleDueDate);

    // Check if this cycle is paid
    const isPaid = allPayouts.some(
      (p) =>
        (p.fdNo === fd.fdNo || (p.fdId && p.fdId === fd.id)) &&
        p.status === 'PAID' &&
        (p.periodKey === pKey || p.dueDate === cycleDueDate)
    );

    if (!isPaid) {
      const cycleStartDate =
        cycle === 1 ? depositDate : addCalendarMonths(depositDate, (cycle - 1) * payoutFreqMonths);
      const daysOverdue = getDaysDifference(todayStr, cycleDueDate);

      const dateObj = parseFDDate(cycleDueDate);
      const monthName = dateObj.toLocaleString('en-US', { month: 'long' });
      const yearStr = dateObj.getFullYear();
      const periodLabel = `${monthName} ${yearStr} (${cycleDueDate})`;

      pending.push({
        fdId: fd.id,
        fdNo: fd.fdNo,
        customerId: fd.customerId,
        depositorName: fd.depositorName,
        phone: fd.phone,
        startDate: cycleStartDate,
        dueDate: cycleDueDate,
        periodKey: pKey,
        periodLabel,
        amount: payoutAmount,
        daysOverdue,
        status: daysOverdue > 0 ? 'OVERDUE' : 'PENDING'
      });
    }

    cycle++;
  }

  return pending;
};

/**
 * Gets all pending interest periods across all active/eligible Fixed Deposits.
 */
export const getAllPendingFDInterestPeriods = (
  fixedDeposits: FixedDeposit[],
  allPayouts: FDInterestPayout[],
  currentDateOverride?: string
): PendingInterestPeriod[] => {
  const allPending: PendingInterestPeriod[] = [];
  const eligibleFDs = fixedDeposits.filter((f) => f.status === 'ACTIVE' || f.status === 'MATURED');

  for (const fd of eligibleFDs) {
    const pending = getPendingFDInterestPeriods(fd, allPayouts, currentDateOverride);
    allPending.push(...pending);
  }

  // Sort by due date ascending (earliest overdue first)
  return allPending.sort((a, b) => compareFDDates(a.dueDate, b.dueDate));
};

export interface FDInterestScheduleInfo {
  fdNo: string;
  depositDate: string;
  nextPayoutDate: string;
  payoutAmount: number;
  isEligible: boolean;
  status: 'NOT_DUE' | 'DUE' | 'OVERDUE' | 'PAID' | 'WITHDRAWN' | 'MATURED';
  statusText: string;
  periodKey: string;
  daysPending?: number;
  lastPayoutDate?: string | null;
  payoutCount: number;
  pendingPeriodsCount: number;
}

/**
 * Canonical function to calculate the interest payout schedule and eligibility for a Fixed Deposit.
 */
export const calculateFDInterestSchedule = (
  fd: FixedDeposit,
  allPayouts: FDInterestPayout[],
  currentDateOverride?: string
): FDInterestScheduleInfo => {
  const todayStr = currentDateOverride ? normalizeDateString(currentDateOverride) : formatFDDate(new Date());
  const depositDate = normalizeDateString(fd.depositDate || formatFDDate(new Date()));
  const payoutFreqMonths = getMonthsForFrequency(fd.payoutFrequency || (fd as any).frequency);
  const payoutAmount = calculateFDInterestAmount(fd);

  // Get unpaid pending due periods for this FD
  const pendingPeriods = getPendingFDInterestPeriods(fd, allPayouts, todayStr);

  // Paid payouts for this specific FD
  const paidPayouts = allPayouts.filter(
    (p) => (p.fdNo === fd.fdNo || (p.fdId && p.fdId === fd.id)) && p.status === 'PAID'
  );

  const sortedPaid = [...paidPayouts].sort((a, b) => compareFDDates(a.date || a.dueDate || '', b.date || b.dueDate || ''));
  const payoutCount = sortedPaid.length;
  const lastPaid = sortedPaid.length > 0 ? sortedPaid[sortedPaid.length - 1] : null;
  const lastPayoutDate = lastPaid ? normalizeDateString(lastPaid.dueDate || lastPaid.date) : null;

  // Withdrawn FD check
  if (fd.status === 'WITHDRAWN') {
    return {
      fdNo: fd.fdNo,
      depositDate,
      nextPayoutDate: lastPayoutDate || depositDate,
      payoutAmount,
      isEligible: false,
      status: 'WITHDRAWN',
      statusText: 'WITHDRAWN / CLOSED',
      periodKey: calculateInterestPeriodKey(fd.fdNo, lastPayoutDate || depositDate),
      lastPayoutDate,
      payoutCount,
      pendingPeriodsCount: 0
    };
  }

  // If there are unpaid pending due periods, next payout date is the earliest unpaid due date!
  if (pendingPeriods.length > 0) {
    const earliestPending = pendingPeriods[0];
    return {
      fdNo: fd.fdNo,
      depositDate,
      nextPayoutDate: earliestPending.dueDate,
      payoutAmount: earliestPending.amount,
      isEligible: true,
      status: earliestPending.status === 'OVERDUE' ? 'OVERDUE' : 'DUE',
      statusText:
        earliestPending.daysOverdue > 0
          ? `INTEREST DUE (${earliestPending.daysOverdue} ${earliestPending.daysOverdue === 1 ? 'day' : 'days'} overdue)`
          : '✓ INTEREST DUE',
      periodKey: earliestPending.periodKey,
      daysPending: earliestPending.daysOverdue,
      lastPayoutDate,
      payoutCount,
      pendingPeriodsCount: pendingPeriods.length
    };
  }

  // If no unpaid pending periods, calculate the next future payout date
  let nextPayoutDate: string;

  if (payoutFreqMonths === 0) {
    nextPayoutDate = normalizeDateString(fd.maturityDate || addCalendarMonths(depositDate, fd.tenureMonths || 12));
  } else if (!lastPayoutDate) {
    nextPayoutDate = addCalendarMonths(depositDate, payoutFreqMonths);
  } else {
    nextPayoutDate = addCalendarMonths(lastPayoutDate, payoutFreqMonths);
  }

  const maturityDate = fd.maturityDate ? normalizeDateString(fd.maturityDate) : null;
  const isPastMaturity = maturityDate && compareFDDates(nextPayoutDate, maturityDate) > 0;

  if (fd.status === 'MATURED' && isPastMaturity) {
    return {
      fdNo: fd.fdNo,
      depositDate,
      nextPayoutDate,
      payoutAmount,
      isEligible: false,
      status: 'MATURED',
      statusText: 'MATURED',
      periodKey: calculateInterestPeriodKey(fd.fdNo, nextPayoutDate),
      lastPayoutDate,
      payoutCount,
      pendingPeriodsCount: 0
    };
  }

  const dateComp = compareFDDates(todayStr, nextPayoutDate);

  if (dateComp < 0) {
    return {
      fdNo: fd.fdNo,
      depositDate,
      nextPayoutDate,
      payoutAmount,
      isEligible: false,
      status: 'NOT_DUE',
      statusText: `Next payout available on ${nextPayoutDate}`,
      periodKey: calculateInterestPeriodKey(fd.fdNo, nextPayoutDate),
      lastPayoutDate,
      payoutCount,
      pendingPeriodsCount: 0
    };
  } else if (dateComp === 0) {
    return {
      fdNo: fd.fdNo,
      depositDate,
      nextPayoutDate,
      payoutAmount,
      isEligible: true,
      status: 'DUE',
      statusText: '✓ INTEREST DUE',
      periodKey: calculateInterestPeriodKey(fd.fdNo, nextPayoutDate),
      daysPending: 0,
      lastPayoutDate,
      payoutCount,
      pendingPeriodsCount: 1
    };
  } else {
    const daysOverdue = getDaysDifference(todayStr, nextPayoutDate);
    return {
      fdNo: fd.fdNo,
      depositDate,
      nextPayoutDate,
      payoutAmount,
      isEligible: true,
      status: 'OVERDUE',
      statusText: `INTEREST DUE (${daysOverdue} ${daysOverdue === 1 ? 'day' : 'days'} overdue)`,
      periodKey: calculateInterestPeriodKey(fd.fdNo, nextPayoutDate),
      daysPending: daysOverdue,
      lastPayoutDate,
      payoutCount,
      pendingPeriodsCount: 1
    };
  }
};

// ─── Maturity & Eligibility Helpers ──────────────────────────────────────────

export interface FDMaturityInfo {
  remainingDays: number;       // negative = already past maturity
  remainingMonths: number;     // floor(remainingDays / ~30), for display only
  daysSinceMaturity: number;   // 0 if not yet matured, positive if past
  maturityStatus: 'ACTIVE' | 'NEAR_MATURITY' | 'MATURED';
  maturityLabel: string;       // human-readable
}

/**
 * Returns dynamic maturity information for a given FD using the current date.
 * All calculations are done using real Date objects — no string comparison.
 */
export const getFDMaturityInfo = (
  fd: { maturityDate: string; status: string },
  todayOverride?: string
): FDMaturityInfo => {
  const todayStr = todayOverride || formatFDDate(new Date());
  const remainingDays = getDaysDifference(fd.maturityDate, todayStr);
  const daysSinceMaturity = remainingDays < 0 ? Math.abs(remainingDays) : 0;

  // Calendar-aware remaining months (approximate, for display only)
  const matDate = parseFDDate(fd.maturityDate);
  const todDate = parseFDDate(todayStr);
  let remainingMonths = 0;
  if (remainingDays > 0) {
    remainingMonths =
      (matDate.getFullYear() - todDate.getFullYear()) * 12 +
      (matDate.getMonth() - todDate.getMonth());
    if (matDate.getDate() < todDate.getDate()) remainingMonths -= 1;
    remainingMonths = Math.max(0, remainingMonths);
  }

  let maturityStatus: FDMaturityInfo['maturityStatus'] = 'ACTIVE';
  let maturityLabel = '';

  if (remainingDays <= 0) {
    maturityStatus = 'MATURED';
    if (daysSinceMaturity === 0) {
      maturityLabel = 'Matured today';
    } else {
      maturityLabel = `Matured ${daysSinceMaturity} ${daysSinceMaturity === 1 ? 'day' : 'days'} ago`;
    }
  } else if (remainingDays <= 30) {
    maturityStatus = 'NEAR_MATURITY';
    maturityLabel = `${remainingDays} ${remainingDays === 1 ? 'day' : 'days'} remaining`;
  } else if (remainingMonths >= 1) {
    maturityStatus = 'ACTIVE';
    maturityLabel = `${remainingMonths} ${remainingMonths === 1 ? 'month' : 'months'} remaining`;
  } else {
    maturityStatus = 'ACTIVE';
    maturityLabel = `${remainingDays} days remaining`;
  }

  return { remainingDays, remainingMonths, daysSinceMaturity, maturityStatus, maturityLabel };
};

/**
 * Returns whether an FD is eligible for withdrawal/closure.
 * Current rule: allowed at any time unless already WITHDRAWN.
 */
export const getWithdrawalEligibility = (
  fd: { status: string; remainingPrincipal?: number; principal: number }
): { eligible: boolean; reason: string } => {
  if (fd.status === 'WITHDRAWN') {
    return { eligible: false, reason: 'This Fixed Deposit has already been fully withdrawn.' };
  }
  const remaining = fd.remainingPrincipal ?? fd.principal;
  if (remaining <= 0) {
    return { eligible: false, reason: 'No remaining principal balance to withdraw.' };
  }
  return { eligible: true, reason: 'Eligible for withdrawal or closure.' };
};

