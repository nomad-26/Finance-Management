/**
 * Test Suite for Unrestricted Backdated Loan Issue Date Validation and Calculations
 *
 * Runs comprehensive assertions for:
 * 1. Historical dates without backdate limits:
 *    - 01-01-2020 (Valid)
 *    - 01-01-2025 (Valid)
 *    - 01-09-2026 (Valid)
 *    - 05-09-2026 (Valid)
 *    - 15-09-2026 (Valid)
 *    - 19-09-2026 (Valid)
 *    - 20-09-2026 (Valid - Today)
 * 2. Future date:
 *    - 21-09-2026 (Invalid - FUTURE_ISSUE_DATE)
 *    - 01-01-2027 (Invalid - FUTURE_ISSUE_DATE)
 * 3. Invalid / malformed inputs:
 *    - Empty date (Invalid - INVALID_ISSUE_DATE)
 *    - Impossible calendar date (Invalid - INVALID_DATE_FORMAT)
 * 4. Loan creation:
 *    - Backdated loan with 05-09-2026: loan.date = 05-09-2026, createdAt is current.
 *    - Historical loan with 01-01-2020: loan.date = 01-01-2020.
 *    - Future date loan attempt: properly rejected.
 */

import {
  parseDateComponents,
  formatLoanDate,
  formatInputDate,
  parseLoanDate,
  getCalendarDaysDifference,
  validateLoanIssueDate,
  addMonthsToLoanDate
} from '../utils/dateUtils.js';
import { loanService } from '../services/loan.service.js';

let passedCount = 0;
let totalCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalCount++;
  if (condition) {
    passedCount++;
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    console.error(`  ❌ [FAIL] ${testName} ${detail ? `- ${detail}` : ''}`);
  }
}

async function runTests() {
  console.log('\n======================================================');
  console.log('🧪 RUNNING UNRESTRICTED LOAN ISSUE DATE TEST SUITE');
  console.log('======================================================\n');

  // Fixed Reference Date for Deterministic Scenario: 20-09-2026
  const refDate = new Date(2026, 8, 20); // 20 Sept 2026

  console.log(`📌 Test Reference Business Date: ${formatLoanDate(refDate)} (20-09-2026)\n`);

  // ──────────────────────────────────────────────────────────────────────────
  // TEST GROUP 1: User-Specified Exact Scenarios
  // ──────────────────────────────────────────────────────────────────────────
  console.log('--- TEST GROUP 1: User Requested Test Cases ---');

  // 01-01-2020 -> should work
  const res2020 = validateLoanIssueDate('01-01-2020', refDate);
  assert(res2020.isValid === true && res2020.formattedDate === '01-01-2020', '01-01-2020 is valid (Historical - No limit)');

  // 01-01-2025 -> should work
  const res2025 = validateLoanIssueDate('01-01-2025', refDate);
  assert(res2025.isValid === true && res2025.formattedDate === '01-01-2025', '01-01-2025 is valid (Historical - No limit)');

  // 01-09-2026 -> should work
  const res0109 = validateLoanIssueDate('01-09-2026', refDate);
  assert(res0109.isValid === true && res0109.formattedDate === '01-09-2026', '01-09-2026 is valid');

  // 05-09-2026 -> should work
  const res0509 = validateLoanIssueDate('05-09-2026', refDate);
  assert(res0509.isValid === true && res0509.formattedDate === '05-09-2026', '05-09-2026 is valid');

  // 15-09-2026 -> should work
  const res1509 = validateLoanIssueDate('15-09-2026', refDate);
  assert(res1509.isValid === true && res1509.formattedDate === '15-09-2026', '15-09-2026 is valid');

  // 19-09-2026 -> should work
  const res1909 = validateLoanIssueDate('19-09-2026', refDate);
  assert(res1909.isValid === true && res1909.formattedDate === '19-09-2026', '19-09-2026 is valid');

  // 20-09-2026 -> should work (today)
  const res2009 = validateLoanIssueDate('20-09-2026', refDate);
  assert(res2009.isValid === true && res2009.formattedDate === '20-09-2026', '20-09-2026 is valid (Today)');

  // 21-09-2026 -> should fail (future date)
  const res2109 = validateLoanIssueDate('21-09-2026', refDate);
  assert(
    res2109.isValid === false &&
    res2109.code === 'FUTURE_ISSUE_DATE' &&
    res2109.error === 'Loan issue date cannot be in the future.',
    '21-09-2026 is invalid (Future date rejected)'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST GROUP 2: Additional Edge Cases & Formats
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST GROUP 2: Additional Edge Cases & Formats ---');

  // YYYY-MM-DD input
  const resIso = validateLoanIssueDate('2020-01-01', refDate);
  assert(
    resIso.isValid === true && resIso.formattedDate === '01-01-2020' && resIso.inputFormattedDate === '2020-01-01',
    'YYYY-MM-DD format (2020-01-01) is correctly parsed and normalized'
  );

  // Empty string
  const resEmpty = validateLoanIssueDate('', refDate);
  assert(
    resEmpty.isValid === false && resEmpty.code === 'INVALID_ISSUE_DATE',
    'Empty date string is rejected'
  );

  // Invalid calendar date
  const resInvalid = validateLoanIssueDate('31-02-2026', refDate);
  assert(
    resInvalid.isValid === false && resInvalid.code === 'INVALID_DATE_FORMAT',
    'Impossible calendar date (31-02-2026) is rejected'
  );

  // Far future date
  const resFarFuture = validateLoanIssueDate('01-01-2030', refDate);
  assert(
    resFarFuture.isValid === false && resFarFuture.code === 'FUTURE_ISSUE_DATE',
    'Far future date (01-01-2030) is rejected'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST GROUP 3: Loan Service End-to-End Creation
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST GROUP 3: Loan Service End-to-End Creation ---');

  const actualToday = new Date();

  // Test 1: Historical backdated loan (e.g. 05-09-2026 or 60 days ago)
  const historical60DaysAgo = new Date(actualToday.getFullYear(), actualToday.getMonth(), actualToday.getDate() - 60);
  const historical60Str = formatLoanDate(historical60DaysAgo);

  try {
    const loanPayload: any = {
      customerId: 'CUST-001',
      customerName: 'Test Customer',
      customerPhone: '9876543210',
      loanType: 'Gold Loan',
      loanTypeId: 'gold-loan',
      principal: 50000,
      interestRate: 1.5,
      date: historical60Str,
      cardFeeEnabled: true,
      cardFee: 25,
      items: [
        {
          id: 'item-1',
          item: 'Gold Ring',
          qty: 1,
          grossWeight: 10.0,
          deductionWeight: 0.5,
          netWeight: 9.5
        }
      ]
    };

    const createdLoan = await loanService.create(loanPayload);

    assert(
      createdLoan.date === historical60Str,
      `Loan creation stores exact 60-day historical issue date: ${createdLoan.date}`,
      `Expected ${historical60Str}, got ${createdLoan.date}`
    );

    const createdIsoDate = new Date(createdLoan.createdAt).toDateString();
    const todayIsoDate = actualToday.toDateString();
    assert(
      createdIsoDate === todayIsoDate,
      `createdAt preserves actual timestamp of entry: ${createdLoan.createdAt}`
    );

    const expectedDueDate = formatLoanDate(addMonthsToLoanDate(historical60DaysAgo, 1));
    assert(
      createdLoan.nextDueDate === expectedDueDate,
      `nextDueDate calculated relative to historical issue date: ${createdLoan.nextDueDate} (Expected: ${expectedDueDate})`
    );
  } catch (err: any) {
    assert(false, 'Loan creation with historical date failed', err.message);
  }

  // Test 2: Future date creation must fail
  const futureDate = new Date(actualToday.getFullYear(), actualToday.getMonth(), actualToday.getDate() + 2);
  const futureDateStr = formatLoanDate(futureDate);

  try {
    const futurePayload: any = {
      customerId: 'CUST-001',
      customerName: 'Test Customer',
      customerPhone: '9876543210',
      loanType: 'Gold Loan',
      principal: 50000,
      date: futureDateStr,
      items: [{ id: 'item-1', item: 'Ring', qty: 1, grossWeight: 10, deductionWeight: 0, netWeight: 10 }]
    };

    await loanService.create(futurePayload);
    assert(false, 'Expected loanService.create to reject future date, but it succeeded');
  } catch (err: any) {
    assert(
      err.code === 'FUTURE_ISSUE_DATE',
      `Future date loan creation rejected with FUTURE_ISSUE_DATE: ${err.message}`
    );
  }

  console.log('\n======================================================');
  console.log(`📊 TEST RESULTS: ${passedCount}/${totalCount} Passed`);
  if (passedCount === totalCount) {
    console.log('🎉 ALL TESTS PASSED SUCCESSFULLY!');
  } else {
    console.error('⚠️ SOME TESTS FAILED');
    process.exit(1);
  }
  console.log('======================================================\n');
}

runTests().catch((err) => {
  console.error('Unhandled test runner error:', err);
  process.exit(1);
});
