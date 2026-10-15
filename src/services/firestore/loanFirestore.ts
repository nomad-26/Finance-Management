/**
 * Loan Firestore Repository for KKV Gold Finance & Rental Management
 * Primary Database: Firebase Cloud Firestore (Project: kkv-finance-4b3bf)
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  DocumentData
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Loan } from '../../types';

const COLLECTION_NAME = 'loans';

export class LoanFirestoreService {
  private colRef = collection(db, COLLECTION_NAME);

  public async getAll(): Promise<Loan[]> {
    try {
      const snap = await getDocs(this.colRef);
      const list: Loan[] = [];
      snap.forEach((d) => {
        const data = d.data() as Loan;
        list.push({ ...data, id: d.id, loanNo: data.loanNo || d.id });
      });
      return list;
    } catch (err: any) {
      console.error('[LoanFirestore] getAll error:', err?.message || err);
      throw err;
    }
  }

  public async getByCustomerId(customerId: string): Promise<Loan[]> {
    if (!customerId) return [];
    try {
      const q = query(this.colRef, where('customerId', '==', customerId));
      const snap = await getDocs(q);
      const list: Loan[] = [];
      snap.forEach((d) => {
        const data = d.data() as Loan;
        list.push({ ...data, id: d.id, loanNo: data.loanNo || d.id });
      });
      return list;
    } catch (err: any) {
      console.error(`[LoanFirestore] getByCustomerId(${customerId}) error:`, err?.message || err);
      return [];
    }
  }

  public async getByLoanNo(loanNo: string): Promise<Loan | null> {
    if (!loanNo) return null;
    const cleanNo = String(loanNo).trim();

    try {
      // 1. Direct doc lookup
      const docRef = doc(db, COLLECTION_NAME, cleanNo);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data() as Loan;
        return { ...data, id: docSnap.id, loanNo: data.loanNo || docSnap.id };
      }

      // 2. Query by loanNo field
      const q = query(this.colRef, where('loanNo', '==', cleanNo));
      const qSnap = await getDocs(q);
      if (!qSnap.empty) {
        const first = qSnap.docs[0];
        const data = first.data() as Loan;
        return { ...data, id: first.id, loanNo: data.loanNo || first.id };
      }

      return null;
    } catch (err: any) {
      console.error(`[LoanFirestore] getByLoanNo(${loanNo}) error:`, err?.message || err);
      return null;
    }
  }

  public async create(loan: Loan): Promise<Loan> {
    const docId = loan.loanNo || loan.id || `GL-${Date.now()}`;
    const cleanLoan: Loan = {
      ...loan,
      id: docId,
      loanNo: docId,
      createdAt: loan.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const docRef = doc(db, COLLECTION_NAME, docId);
    await setDoc(docRef, cleanLoan, { merge: true });

    return cleanLoan;
  }

  public async update(loanNo: string, updates: Partial<Loan>): Promise<Loan> {
    const existing = await this.getByLoanNo(loanNo);
    if (!existing) {
      throw new Error(`Loan "${loanNo}" not found in Firestore.`);
    }

    const updatedData: Loan = {
      ...existing,
      ...updates,
      id: existing.id,
      loanNo: existing.loanNo,
      updatedAt: new Date().toISOString()
    };

    const docRef = doc(db, COLLECTION_NAME, existing.id);
    await updateDoc(docRef, updatedData as DocumentData);

    return updatedData;
  }

  public async delete(loanNo: string): Promise<boolean> {
    const existing = await this.getByLoanNo(loanNo);
    if (!existing) return false;

    const docRef = doc(db, COLLECTION_NAME, existing.id);
    await deleteDoc(docRef);
    return true;
  }
}

export const loanFirestore = new LoanFirestoreService();
export default loanFirestore;
