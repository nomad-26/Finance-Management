/**
 * Fixed Deposit Firestore Repository for KKV Gold Finance & Rental Management
 * Primary Database: Firebase Cloud Firestore (Project: kkv-finance-4b3bf)
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import {
  FixedDeposit,
  FDCustomer,
  FDInterestPayout,
  FDWithdrawal,
  FDRenewal
} from '../../types';

export class FixedDepositFirestoreService {
  private fdCol = collection(db, 'fixedDeposits');
  private fdCustCol = collection(db, 'fdCustomers');
  private payoutCol = collection(db, 'fdInterestPayouts');
  private withdrawalCol = collection(db, 'fdWithdrawals');
  private renewalCol = collection(db, 'fdRenewals');

  // ── Fixed Deposits ──────────────────────────────────────────────────────────
  public async getAllFDs(): Promise<FixedDeposit[]> {
    const snap = await getDocs(this.fdCol);
    const list: FixedDeposit[] = [];
    snap.forEach((d) => list.push({ ...(d.data() as FixedDeposit), id: d.id, fdNo: (d.data() as any).fdNo || d.id }));
    return list;
  }

  public async getFDByNo(fdNo: string): Promise<FixedDeposit | null> {
    if (!fdNo) return null;
    const cleanNo = String(fdNo).trim();
    const docRef = doc(db, 'fixedDeposits', cleanNo);
    const snap = await getDoc(docRef);
    if (snap.exists()) return { ...(snap.data() as FixedDeposit), id: snap.id };

    const q = query(this.fdCol, where('fdNo', '==', cleanNo));
    const qSnap = await getDocs(q);
    if (!qSnap.empty) return { ...(qSnap.docs[0].data() as FixedDeposit), id: qSnap.docs[0].id };

    return null;
  }

  public async saveFD(fd: FixedDeposit): Promise<FixedDeposit> {
    const docId = fd.fdNo || fd.id || `FD-${Date.now()}`;
    const clean: FixedDeposit = {
      ...fd,
      id: docId,
      fdNo: docId,
      createdAt: fd.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await setDoc(doc(db, 'fixedDeposits', docId), clean, { merge: true });
    return clean;
  }

  public async deleteFD(fdNo: string): Promise<boolean> {
    const existing = await this.getFDByNo(fdNo);
    if (!existing) return false;
    await deleteDoc(doc(db, 'fixedDeposits', existing.id));
    return true;
  }

  // ── FD Customers ────────────────────────────────────────────────────────────
  public async getAllFDCustomers(): Promise<FDCustomer[]> {
    const snap = await getDocs(this.fdCustCol);
    const list: FDCustomer[] = [];
    snap.forEach((d) => list.push({ ...(d.data() as FDCustomer), id: d.id }));
    return list;
  }

  public async saveFDCustomer(cust: FDCustomer): Promise<FDCustomer> {
    const docId = cust.id || `FDCUST-${Date.now()}`;
    const clean: FDCustomer = { ...cust, id: docId, createdAt: cust.createdAt || new Date().toISOString() };
    await setDoc(doc(db, 'fdCustomers', docId), clean, { merge: true });
    return clean;
  }

  // ── FD Interest Payouts ─────────────────────────────────────────────────────
  public async getAllPayouts(): Promise<FDInterestPayout[]> {
    const snap = await getDocs(this.payoutCol);
    const list: FDInterestPayout[] = [];
    snap.forEach((d) => list.push({ ...(d.data() as FDInterestPayout), id: d.id }));
    return list;
  }

  public async savePayout(payout: FDInterestPayout): Promise<FDInterestPayout> {
    const docId = payout.id || `PAYOUT-${Date.now()}`;
    const clean: FDInterestPayout = { ...payout, id: docId };
    await setDoc(doc(db, 'fdInterestPayouts', docId), clean, { merge: true });
    return clean;
  }

  // ── FD Withdrawals ──────────────────────────────────────────────────────────
  public async getAllWithdrawals(): Promise<FDWithdrawal[]> {
    const snap = await getDocs(this.withdrawalCol);
    const list: FDWithdrawal[] = [];
    snap.forEach((d) => list.push({ ...(d.data() as FDWithdrawal), id: d.id }));
    return list;
  }

  public async saveWithdrawal(withdrawal: FDWithdrawal): Promise<FDWithdrawal> {
    const docId = withdrawal.id || `WITHDRAW-${Date.now()}`;
    const clean: FDWithdrawal = { ...withdrawal, id: docId };
    await setDoc(doc(db, 'fdWithdrawals', docId), clean, { merge: true });
    return clean;
  }

  // ── FD Renewals ─────────────────────────────────────────────────────────────
  public async getAllRenewals(): Promise<FDRenewal[]> {
    const snap = await getDocs(this.renewalCol);
    const list: FDRenewal[] = [];
    snap.forEach((d) => list.push({ ...(d.data() as FDRenewal), id: d.id }));
    return list;
  }

  public async saveRenewal(renewal: FDRenewal): Promise<FDRenewal> {
    const docId = renewal.id || `RENEW-${Date.now()}`;
    const clean: FDRenewal = { ...renewal, id: docId };
    await setDoc(doc(db, 'fdRenewals', docId), clean, { merge: true });
    return clean;
  }
}

export const fixedDepositFirestore = new FixedDepositFirestoreService();
export default fixedDepositFirestore;
