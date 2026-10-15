import fs from 'fs';
import path from 'path';
import { env } from '../config/env.js';
import { firestoreRepository } from '../repositories/firestore.repository.js';
import { counterService } from '../services/counter.service.js';
import { localAuthService } from '../services/localAuth.service.js';
import { localFileRepository } from '../repositories/localFile.repository.js';
import { RentalRepository } from '../modules/rental/repositories/rental.repository.js';
import { RentalDayBookRepository } from '../modules/rental/repositories/rentalDayBook.repository.js';
import { CustomerModel } from '../models/Customer.js';
import { LoanModel } from '../models/Loan.js';
import { ReceiptModel } from '../models/Receipt.js';
import { FixedDepositModel } from '../models/FixedDeposit.js';
import { FDCustomerModel } from '../models/FDCustomer.js';
import { FDInterestPayoutModel } from '../models/FDInterestPayout.js';
import { FDWithdrawalModel } from '../models/FDWithdrawal.js';
import { FDRenewalModel } from '../models/FDRenewal.js';
import { DayBookModel } from '../models/DayBook.js';
import { FileAttachmentModel } from '../models/FileAttachment.js';
import { StaffAuditModel } from '../models/StaffAudit.js';
import { generateCustomerId } from '../utils/customerIdGenerator.js';

export interface ResetSummaryReport {
  timestamp: string;
  environment: string;
  countsBefore: Record<string, number>;
  countsAfter: Record<string, number>;
  firestoreRecordsDeleted: number;
  staffRemoved: number;
  countersReset: string[];
  masterAdminStatus: {
    email: string;
    fullName: string;
    role: string;
    status: string;
    isActive: boolean;
  };
  preservedConfig: string[];
  firstRecordTest: {
    generatedId: string;
    success: boolean;
  };
}

export async function executeCompleteDataReset(): Promise<ResetSummaryReport> {
  console.log('\n======================================================');
  console.log(' STARTING COMPLETE DATA RESET FOR KKV GOLD FINANCE');
  console.log('======================================================\n');

  const rentalRepo = new RentalRepository();
  const rentalDayBookRepo = new RentalDayBookRepository();

  // 1. Initial State Snapshot
  const initialCounts = {
    customers: firestoreRepository.getRecords('CUSTOMER').length,
    loans: firestoreRepository.getRecords('LOAN').length,
    receipts: firestoreRepository.getRecords('RECEIPT').length,
    fdCustomers: firestoreRepository.getRecords('FD_CUSTOMER').length,
    fixedDeposits: firestoreRepository.getRecords('FIXED_DEPOSIT').length,
    fdInterestPayouts: firestoreRepository.getRecords('FD_INTEREST_PAYOUT').length,
    fdWithdrawals: firestoreRepository.getRecords('FD_WITHDRAWAL').length,
    fdRenewals: firestoreRepository.getRecords('FD_RENEWAL').length,
    rentalComplexes: rentalRepo.getComplexes().length,
    rentalShops: rentalRepo.getShops().length,
    rentalPayments: rentalRepo.getPayments().length,
    rentalExpenses: rentalRepo.getExpenses().length,
    rentalDayBook: firestoreRepository.getRecords('RENTAL_DAYBOOK').length,
    fileAttachments: firestoreRepository.getRecords('FILE_ATTACHMENT').length,
    dayBookEntries: firestoreRepository.getRecords('DAYBOOK').length,
    auditLogs: firestoreRepository.getRecords('AUDIT').length,
    nonAdminStaff: localAuthService.getAllUsers().filter((u) => u.email !== 'kkvgoldfinance13@gmail.com' && u.staffId !== 'KKV-ADMIN-000001').length
  };

  console.log('[RESET] 📊 Current Operational Record Counts:');
  console.table(initialCounts);



  // 3. Cloud Firestore Storage Reset (Clear all business entity collections)
  console.log('\n[RESET] 🚀 Step 2/6: Cleaning Cloud Firestore Persistence Database...');
  let firestoreRecordsDeleted = 0;
  try {
    const tgRes = await firestoreRepository.resetApplicationData();
    firestoreRecordsDeleted = tgRes.cleared || 0;
    console.log(`[RESET] ✓ Cloud Firestore DB: Cleared ${firestoreRecordsDeleted} records across all operational collections.`);
  } catch (tgErr: any) {
    console.warn('[RESET] ⚠ Cloud Firestore DB clean notice:', tgErr?.message || tgErr);
  }

  // 4. Memory & Local File Storage Clear
  console.log('\n[RESET] 🚀 Step 3/6: Clearing Local File Storage & Repositories...');

  // Clear local JSON operational storage files in both cwd and AppData
  const wipeableFiles = [
    'customers.json',
    'loans.json',
    'receipts.json',
    'reminders.json',
    'fd_customers.json',
    'fixed_deposits.json',
    'fd_interest_payouts.json',
    'fd_withdrawals.json',
    'fd_renewals.json',
    'daybook_entries.json',
    'notifications.json',
    'file_attachments.json',
    'sync_outbox.json'
  ];
  for (const f of wipeableFiles) {
    localFileRepository.writeJson(f, []);
  }
  localFileRepository.clearCache();
  rentalRepo.clearCache();
  rentalDayBookRepo.clearCache();

  // Clear AppData entities directory if present
  if (process.env.APPDATA) {
    const appDataEntities = path.join(process.env.APPDATA, 'kkv-gold-finance', 'data', 'firestore', 'entities');
    if (fs.existsSync(appDataEntities)) {
      const entityFiles = fs.readdirSync(appDataEntities);
      for (const ef of entityFiles) {
        const efType = ef.replace('.json', '');
        if (efType !== 'USER' && efType !== 'COUNTER' && efType !== 'CONFIG') {
          try {
            fs.writeFileSync(path.join(appDataEntities, ef), '[]', 'utf-8');
          } catch {}
        }
      }
    }
  }

  console.log('[RESET] ✓ Local file storage collections and repositories cleared.');

  // 5. Staff Accounts Reset (Preserve ONLY Master Admin)
  console.log('\n[RESET] 🚀 Step 4/6: Resetting Staff Accounts (Preserving Master Admin)...');
  const staffRemoved = await localAuthService.resetNonAdminStaff();
  await localAuthService.seedDefaultUsers(false);
  console.log(`[RESET] ✓ Staff: Removed ${staffRemoved} non-admin/test staff accounts. Master Admin preserved.`);

  // 6. Reset All Sequence Counters to 0
  console.log('\n[RESET] 🚀 Step 5/6: Resetting All Sequence Counters to 0...');
  await counterService.resetAllSequences();
  const countersReset = [
    'customerId (starts at KKV-2026-000001)',
    'loanSequence (starts at first configured loan number)',
    'loanNo',
    'receiptNo',
    'fdNo',
    'staff_id_sequence',
    'rental_staff_id_sequence',
    'rental_complex_id (CMP-0001)',
    'rental_shop_id (SHOP-0001)',
    'rental_payment_id (PAY-0001)',
    'rental_expense_id (EXP-0001)'
  ];
  console.log('[RESET] ✓ Counters reset to initial 0 state.');

  // 7. Post-Reset State Snapshot & Verification
  console.log('\n[RESET] 🚀 Step 6/6: Verifying Clean State...');
  const afterCounts = {
    customers: firestoreRepository.getRecords('CUSTOMER').length,
    loans: firestoreRepository.getRecords('LOAN').length,
    receipts: firestoreRepository.getRecords('RECEIPT').length,
    fdCustomers: firestoreRepository.getRecords('FD_CUSTOMER').length,
    fixedDeposits: firestoreRepository.getRecords('FIXED_DEPOSIT').length,
    fdInterestPayouts: firestoreRepository.getRecords('FD_INTEREST_PAYOUT').length,
    fdWithdrawals: firestoreRepository.getRecords('FD_WITHDRAWAL').length,
    fdRenewals: firestoreRepository.getRecords('FD_RENEWAL').length,
    rentalComplexes: rentalRepo.getComplexes().length,
    rentalShops: rentalRepo.getShops().length,
    rentalPayments: rentalRepo.getPayments().length,
    rentalExpenses: rentalRepo.getExpenses().length,
    rentalDayBook: firestoreRepository.getRecords('RENTAL_DAYBOOK').length,
    fileAttachments: firestoreRepository.getRecords('FILE_ATTACHMENT').length,
    dayBookEntries: firestoreRepository.getRecords('DAYBOOK').length,
    auditLogs: firestoreRepository.getRecords('AUDIT').length,
    nonAdminStaff: localAuthService.getAllUsers().filter((u) => u.email !== 'kkvgoldfinance13@gmail.com' && u.staffId !== 'KKV-ADMIN-000001').length
  };

  console.log('[RESET] 📊 Post-Reset Record Counts:');
  console.table(afterCounts);

  // Assertion check
  const totalOperationalRemaining = Object.values(afterCounts).reduce((a, b) => a + b, 0);
  if (totalOperationalRemaining !== 0) {
    throw new Error(`Data reset assertion failed: ${totalOperationalRemaining} operational records remain!`);
  }

  // 8. Test First Fresh Record ID Generation
  const freshCustIdObj = await generateCustomerId('KKV-2026');
  const isFirstIdExact = freshCustIdObj.customerId === 'KKV-2026-000001' && freshCustIdObj.sequenceNumber === 1;

  // Reset sequence counter back to 0 so the user's actual first customer is KKV-2026-000001
  await counterService.resetAllSequences();

  const masterAdmin = localAuthService.findUserByIdentifier('kkvgoldfinance13@gmail.com');

  const report: ResetSummaryReport = {
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
    countsBefore: initialCounts,
    countsAfter: afterCounts,
    firestoreRecordsDeleted,
    staffRemoved,
    countersReset,
    masterAdminStatus: {
      email: masterAdmin?.email || 'kkvgoldfinance13@gmail.com',
      fullName: masterAdmin?.fullName || 'Kkvgoldfinance',
      role: masterAdmin?.role || 'ADMIN',
      status: masterAdmin?.status || 'active',
      isActive: Boolean(masterAdmin?.isActive)
    },
    preservedConfig: [
      'Master Admin Account (kkvgoldfinance13@gmail.com)',
      'RBAC Role Definitions & Permission Matrix',
      'Branch Configuration (KKV FINANCE - MAIN BRANCH / BR01)',
      'Master Settings & Financial Rate Tables',
      'Printer Settings & System Profiles',
      'Cloud Firestore Database & Persistence Layer',
      'JWT Authentication & Environment Variables'
    ],
    firstRecordTest: {
      generatedId: freshCustIdObj.customerId,
      success: isFirstIdExact
    }
  };

  console.log('\n======================================================');
  console.log(' ✅ COMPLETE DATA RESET COMPLETED SUCCESSFULLY!');
  console.log(` First Customer ID on next creation: KKV-2026-000001`);
  console.log('======================================================\n');

  return report;
}

// Direct execution when invoked via tsx
if (process.argv[1]?.includes('complete_data_reset')) {
  executeCompleteDataReset()
    .then((report) => {
      console.log('Reset Summary Report Generated:');
      console.log(JSON.stringify(report, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error('Fatal error during complete data reset:', err);
      process.exit(1);
    });
}
