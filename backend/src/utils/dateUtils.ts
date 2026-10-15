/**
 * Centralized Date Utilities for Loan Issue and Date Validation
 */

export interface DateComponents {
  year: number;
  month: number;
  day: number;
}

export interface LoanIssueDateValidationResult {
  isValid: boolean;
  error?: string;
  code?: 'INVALID_ISSUE_DATE' | 'INVALID_DATE_FORMAT' | 'FUTURE_ISSUE_DATE' | 'BACKDATE_LIMIT_EXCEEDED';
  parsedDate?: Date;
  formattedDate?: string; // DD-MM-YYYY
  inputFormattedDate?: string; // YYYY-MM-DD
  daysDifference?: number;
}

/**
 * Robustly parses a date string in DD-MM-YYYY or YYYY-MM-DD format into calendar components.
 * Returns null if the format or date values (e.g., Feb 30) are invalid.
 */
export const parseDateComponents = (dateStr?: string | null): DateComponents | null => {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const clean = dateStr.trim();
  if (!clean) return null;

  const sep = clean.includes('-') ? '-' : clean.includes('/') ? '/' : null;
  if (!sep) return null;

  const parts = clean.split(sep);
  if (parts.length !== 3) return null;

  let year: number;
  let month: number;
  let day: number;

  if (parts[0].length === 4) {
    // YYYY-MM-DD
    year = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10);
    day = parseInt(parts[2], 10);
  } else if (parts[2].length === 4) {
    // DD-MM-YYYY
    day = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10);
    year = parseInt(parts[2], 10);
  } else {
    return null;
  }

  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (year < 1900 || year > 2100) return null;

  // Calendar validity check using Date.UTC
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  if (
    utcDate.getUTCFullYear() !== year ||
    utcDate.getUTCMonth() !== month - 1 ||
    utcDate.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
};

/**
 * Format Date object or DateComponents to standard DD-MM-YYYY
 */
export const formatLoanDate = (date: Date | DateComponents): string => {
  if ('year' in date && 'month' in date && 'day' in date) {
    const day = String(date.day).padStart(2, '0');
    const month = String(date.month).padStart(2, '0');
    const year = date.year;
    return `${day}-${month}-${year}`;
  }
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
};

/**
 * Format Date object or DateComponents to HTML input format YYYY-MM-DD
 */
export const formatInputDate = (date: Date | DateComponents): string => {
  if ('year' in date && 'month' in date && 'day' in date) {
    const day = String(date.day).padStart(2, '0');
    const month = String(date.month).padStart(2, '0');
    const year = date.year;
    return `${year}-${month}-${day}`;
  }
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${year}-${month}-${day}`;
};

/**
 * Parse a DD-MM-YYYY or YYYY-MM-DD date string into a Date object
 */
export const parseLoanDate = (dateStr?: string): Date => {
  const comps = parseDateComponents(dateStr);
  if (comps) {
    return new Date(comps.year, comps.month - 1, comps.day);
  }
  const fallback = dateStr ? new Date(dateStr) : new Date();
  return isNaN(fallback.getTime()) ? new Date() : fallback;
};

/**
 * Adds N calendar months to a Date object, properly clamping to month-end
 */
export const addMonthsToLoanDate = (baseDate: Date, monthsToAdd: number): Date => {
  const origDay = baseDate.getDate();
  const origMonth = baseDate.getMonth();
  const origYear = baseDate.getFullYear();

  const totalMonths = origMonth + monthsToAdd;
  const targetYear = origYear + Math.floor(totalMonths / 12);
  const targetMonth = ((totalMonths % 12) + 12) % 12;

  const maxDaysInTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  const targetDay = Math.min(origDay, maxDaysInTargetMonth);

  return new Date(targetYear, targetMonth, targetDay);
};

/**
 * Calculate the number of calendar days between candidate date and reference date (e.g. today).
 * Positive number = candidate date is in the past (e.g., 5 means 5 days ago).
 * Negative number = candidate date is in the future (e.g., -1 means tomorrow).
 * 0 = today / same calendar date.
 */
export const getCalendarDaysDifference = (
  candidateDateStr: string | DateComponents,
  referenceDate: Date | string = new Date()
): number | null => {
  const candidateComps = typeof candidateDateStr === 'string'
    ? parseDateComponents(candidateDateStr)
    : candidateDateStr;

  if (!candidateComps) return null;

  let refComps: DateComponents | null = null;
  if (typeof referenceDate === 'string') {
    refComps = parseDateComponents(referenceDate);
  } else {
    refComps = {
      year: referenceDate.getFullYear(),
      month: referenceDate.getMonth() + 1,
      day: referenceDate.getDate()
    };
  }

  if (!refComps) return null;

  const candidateUtc = Date.UTC(candidateComps.year, candidateComps.month - 1, candidateComps.day);
  const refUtc = Date.UTC(refComps.year, refComps.month - 1, refComps.day);

  return Math.round((refUtc - candidateUtc) / (24 * 60 * 60 * 1000));
};

/**
 * Returns minimum allowed issue date (referenceDate - 30 days)
 */
export const getMinimumLoanIssueDate = (referenceDate: Date = new Date()): Date => {
  const d = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  d.setDate(d.getDate() - 30);
  return d;
};

/**
 * Centralized Date Validation Rule for Loan Issue:
 * allowedIssueDate >= businessDate - 30 days
 * AND
 * allowedIssueDate <= businessDate
 */
export const validateLoanIssueDate = (
  issueDateStr?: string | null,
  referenceDate: Date = new Date()
): LoanIssueDateValidationResult => {
  if (!issueDateStr || !String(issueDateStr).trim()) {
    return {
      isValid: false,
      error: 'Please enter a valid loan issue date.',
      code: 'INVALID_ISSUE_DATE'
    };
  }

  const comps = parseDateComponents(issueDateStr);
  if (!comps) {
    return {
      isValid: false,
      error: 'Please enter a valid loan issue date.',
      code: 'INVALID_DATE_FORMAT'
    };
  }

  const diffDays = getCalendarDaysDifference(comps, referenceDate);
  if (diffDays === null) {
    return {
      isValid: false,
      error: 'Please enter a valid loan issue date.',
      code: 'INVALID_DATE_FORMAT'
    };
  }

  // Future Date Check
  if (diffDays < 0) {
    return {
      isValid: false,
      error: 'Loan issue date cannot be in the future.',
      code: 'FUTURE_ISSUE_DATE',
      daysDifference: diffDays
    };
  }

  const parsedDate = new Date(comps.year, comps.month - 1, comps.day);
  const formattedDate = formatLoanDate(comps);
  const inputFormattedDate = formatInputDate(comps);

  return {
    isValid: true,
    parsedDate,
    formattedDate,
    inputFormattedDate,
    daysDifference: diffDays
  };
};
