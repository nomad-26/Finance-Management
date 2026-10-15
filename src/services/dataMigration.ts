/**
 * Data Migration Service: Safe & Idempotent Migration to Cloud Firestore
 * Project: kkv-finance-4b3bf
 * 
 * Safely imports existing local application records (Customers, Loans, Receipts, FDs, Rentals, Settings)
 * to Cloud Firestore using stable, deterministic IDs.
 * Preserves relational integrity and reports migration metrics.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  Customer,
  Loan,
  Receipt,
  FixedDeposit,
  DayBookEntry,
  MasterControlSettings,
  UserProfile
} from '../types';
import { DEFAULT_ADMIN_PROFILE } from './firestore/userFirestore';

export interface MigrationSummary {
  startedAt: string;
  completedAt?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  migrated: {
    users: number;
    customers: number;
    loans: number;
    receipts: number;
    fixedDeposits: number;
    dayBook: number;
    settings: number;
  };
  skipped: {
    users: number;
    customers: number;
    loans: number;
    receipts: number;
    fixedDeposits: number;
    dayBook: number;
  };
  conflicts: string[];
  errors: string[];
}

const MIGRATION_STATE_KEY = 'kkv_firestore_migration_status';

export class DataMigrationService {
  /**
   * Checks whether the Cloud Firestore database has already been seeded or migrated.
   */
  public async isFirestorePopulated(): Promise<boolean> {
    try {
      const customersSnap = await getDocs(collection(db, 'customers'));
      if (!customersSnap.empty) return true;

      const loansSnap = await getDocs(collection(db, 'loans'));
      if (!loansSnap.empty) return true;

      return false;
    } catch (err: any) {
      console.warn('[DataMigration] Check population error:', err?.message || err);
      return false;
    }
  }

  /**
   * Retrieves current migration state from localStorage for auditing
   */
  public getStoredMigrationStatus(): MigrationSummary | null {
    try {
      const stored = localStorage.getItem(MIGRATION_STATE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  }

  /**
   * Executes safe migration from local storage / memory into Cloud Firestore
   */
  public async migrateLocalDataToFirestore(options: {
    force?: boolean;
    localData?: {
      customers?: Customer[];
      loans?: Loan[];
      receipts?: Receipt[];
      fixedDeposits?: FixedDeposit[];
      dayBookEntries?: DayBookEntry[];
      masterSettings?: MasterControlSettings;
      users?: UserProfile[];
    };
  } = {}): Promise<MigrationSummary> {
    const summary: MigrationSummary = {
      startedAt: new Date().toISOString(),
      status: 'in_progress',
      migrated: {
        users: 0,
        customers: 0,
        loans: 0,
        receipts: 0,
        fixedDeposits: 0,
        dayBook: 0,
        settings: 0
      },
      skipped: {
        users: 0,
        customers: 0,
        loans: 0,
        receipts: 0,
        fixedDeposits: 0,
        dayBook: 0
      },
      conflicts: [],
      errors: []
    };

    console.log('[DataMigration] 🚀 Starting migration to Cloud Firestore (kkv-finance-4b3bf)...');

    try {
      // 1. Gather source data from options or browser local storage
      const source = options.localData || this.readLocalStorageSnapshot();

      // ── Migrate Users & Seed Admin ──────────────────────────────────────
      try {
        const adminDocRef = doc(db, 'users', 'KKV-ADMIN-000001');
        const adminSnap = await getDoc(adminDocRef);
        if (!adminSnap.exists()) {
          await setDoc(adminDocRef, {
            ...DEFAULT_ADMIN_PROFILE,
            migratedAt: new Date().toISOString()
          }, { merge: true });
          summary.migrated.users++;
        } else {
          summary.skipped.users++;
        }

        if (source.users && source.users.length > 0) {
          for (const u of source.users) {
            const uid = u.staffId || u.uid;
            if (!uid || uid === 'KKV-ADMIN-000001') continue;
            const uRef = doc(db, 'users', uid);
            const uSnap = await getDoc(uRef);
            if (!uSnap.exists()) {
              const { ...safeUser } = u as any;
              delete safeUser.passwordHash;
              await setDoc(uRef, { ...safeUser, updatedAt: new Date().toISOString() }, { merge: true });
              summary.migrated.users++;
            } else {
              summary.skipped.users++;
            }
          }
        }
      } catch (err: any) {
        summary.errors.push(`Users migration: ${err?.message || err}`);
      }

      // ── Migrate Customers ───────────────────────────────────────────────
      if (source.customers && source.customers.length > 0) {
        for (const customer of source.customers) {
          const rawId = customer.customerId || customer.id;
          if (!rawId) continue;
          const custId = String(rawId);

          try {
            const cRef = doc(db, 'customers', custId);
            const cSnap = await getDoc(cRef);
            if (!cSnap.exists()) {
              await setDoc(cRef, {
                ...customer,
                customerId: custId,
                status: customer.status || 'ACTIVE',
                migratedAt: new Date().toISOString(),
                updatedAt: customer.updatedAt || new Date().toISOString()
              }, { merge: true });
              summary.migrated.customers++;
            } else {
              summary.skipped.customers++;
            }
          } catch (err: any) {
            summary.errors.push(`Customer ${custId}: ${err?.message || err}`);
          }
        }
      }

      // ── Migrate Loans ───────────────────────────────────────────────────
      if (source.loans && source.loans.length > 0) {
        for (const loan of source.loans) {
          const loanId = loan.loanNo || loan.id;
          if (!loanId) continue;

          try {
            const lRef = doc(db, 'loans', loanId);
            const lSnap = await getDoc(lRef);
            if (!lSnap.exists()) {
              await setDoc(lRef, {
                ...loan,
                loanNo: loanId,
                migratedAt: new Date().toISOString(),
                updatedAt: loan.updatedAt || new Date().toISOString()
              }, { merge: true });
              summary.migrated.loans++;
            } else {
              summary.skipped.loans++;
            }
          } catch (err: any) {
            summary.errors.push(`Loan ${loanId}: ${err?.message || err}`);
          }
        }
      }

      // ── Migrate Receipts ────────────────────────────────────────────────
      if (source.receipts && source.receipts.length > 0) {
        for (const receipt of source.receipts) {
          const receiptId = String(receipt.receiptNo || receipt.id);
          if (!receiptId) continue;

          try {
            const rRef = doc(db, 'receipts', receiptId);
            const rSnap = await getDoc(rRef);
            if (!rSnap.exists()) {
              await setDoc(rRef, {
                ...receipt,
                receiptNo: receipt.receiptNo || receiptId,
                migratedAt: new Date().toISOString()
              }, { merge: true });
              summary.migrated.receipts++;
            } else {
              summary.skipped.receipts++;
            }
          } catch (err: any) {
            summary.errors.push(`Receipt ${receiptId}: ${err?.message || err}`);
          }
        }
      }

      // ── Migrate Fixed Deposits ──────────────────────────────────────────
      if (source.fixedDeposits && source.fixedDeposits.length > 0) {
        for (const fd of source.fixedDeposits) {
          const fdId = fd.fdNo || fd.id;
          if (!fdId) continue;

          try {
            const fdRef = doc(db, 'fixedDeposits', fdId);
            const fdSnap = await getDoc(fdRef);
            if (!fdSnap.exists()) {
              await setDoc(fdRef, {
                ...fd,
                fdNo: fd.fdNo || fdId,
                migratedAt: new Date().toISOString()
              }, { merge: true });
              summary.migrated.fixedDeposits++;
            } else {
              summary.skipped.fixedDeposits++;
            }
          } catch (err: any) {
            summary.errors.push(`FixedDeposit ${fdId}: ${err?.message || err}`);
          }
        }
      }

      // ── Migrate Daybook ─────────────────────────────────────────────────
      if (source.dayBookEntries && source.dayBookEntries.length > 0) {
        for (const entry of source.dayBookEntries) {
          const entryId = entry.id;
          if (!entryId) continue;

          try {
            const dRef = doc(db, 'daybook', entryId);
            const dSnap = await getDoc(dRef);
            if (!dSnap.exists()) {
              await setDoc(dRef, {
                ...entry,
                migratedAt: new Date().toISOString()
              }, { merge: true });
              summary.migrated.dayBook++;
            } else {
              summary.skipped.dayBook++;
            }
          } catch (err: any) {
            summary.errors.push(`Daybook ${entryId}: ${err?.message || err}`);
          }
        }
      }

      // ── Migrate Master Settings ─────────────────────────────────────────
      if (source.masterSettings) {
        try {
          const settingsRef = doc(db, 'settings', 'master');
          const sSnap = await getDoc(settingsRef);
          if (!sSnap.exists() || options.force) {
            await setDoc(settingsRef, {
              ...source.masterSettings,
              migratedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }, { merge: true });
            summary.migrated.settings++;
          }
        } catch (err: any) {
          summary.errors.push(`Settings: ${err?.message || err}`);
        }
      }

      summary.status = summary.errors.length > 0 ? 'completed' : 'completed';
      summary.completedAt = new Date().toISOString();

      // Record migration status
      localStorage.setItem(MIGRATION_STATE_KEY, JSON.stringify(summary));
      console.log('[DataMigration] ✅ Migration complete:', summary);

      return summary;
    } catch (err: any) {
      summary.status = 'failed';
      summary.errors.push(`Fatal migration error: ${err?.message || err}`);
      summary.completedAt = new Date().toISOString();
      localStorage.setItem(MIGRATION_STATE_KEY, JSON.stringify(summary));
      console.error('[DataMigration] ❌ Migration failed:', err);
      return summary;
    }
  }

  /**
   * Reads existing data from browser LocalStorage
   */
  private readLocalStorageSnapshot() {
    const safeParse = <T>(key: string, fallback: T): T => {
      try {
        const item = localStorage.getItem(`kkv_${key}`) || localStorage.getItem(key);
        if (!item) return fallback;
        return JSON.parse(item) ?? fallback;
      } catch {
        return fallback;
      }
    };

    return {
      customers: safeParse<Customer[]>('customers', []),
      loans: safeParse<Loan[]>('loans', []),
      receipts: safeParse<Receipt[]>('receipts', []),
      fixedDeposits: safeParse<FixedDeposit[]>('fixedDeposits', []),
      dayBookEntries: safeParse<DayBookEntry[]>('dayBookEntries', []),
      masterSettings: safeParse<MasterControlSettings | undefined>('masterSettings', undefined),
      users: safeParse<UserProfile[]>('staffList', [])
    };
  }
}

export const dataMigrationService = new DataMigrationService();
