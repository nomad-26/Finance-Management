/**
 * Receipt Firestore Repository for KKV Gold Finance & Rental Management
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
import { Receipt } from '../../types';

const COLLECTION_NAME = 'receipts';

export class ReceiptFirestoreService {
  private colRef = collection(db, COLLECTION_NAME);

  public async getAll(): Promise<Receipt[]> {
    try {
      const snap = await getDocs(this.colRef);
      const list: Receipt[] = [];
      snap.forEach((d) => {
        const data = d.data() as Receipt;
        list.push({ ...data, id: d.id, receiptNo: data.receiptNo || parseInt(d.id.replace(/\D/g, ''), 10) || 0 });
      });
      return list;
    } catch (err: any) {
      console.error('[ReceiptFirestore] getAll error:', err?.message || err);
      throw err;
    }
  }

  public async getByLoanNo(loanNo: string): Promise<Receipt[]> {
    if (!loanNo) return [];
    try {
      const q = query(this.colRef, where('loanNo', '==', loanNo));
      const snap = await getDocs(q);
      const list: Receipt[] = [];
      snap.forEach((d) => {
        const data = d.data() as Receipt;
        list.push({ ...data, id: d.id });
      });
      return list;
    } catch (err: any) {
      console.error(`[ReceiptFirestore] getByLoanNo(${loanNo}) error:`, err?.message || err);
      return [];
    }
  }

  public async getByReceiptNo(receiptNo: string | number): Promise<Receipt | null> {
    const rawStr = String(receiptNo).trim();
    const docId = rawStr.startsWith('RCPT-') ? rawStr : `RCPT-${rawStr}`;

    try {
      const docRef = doc(db, COLLECTION_NAME, docId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        return { ...(snap.data() as Receipt), id: snap.id };
      }

      const num = parseInt(rawStr.replace(/\D/g, ''), 10);
      const q = query(this.colRef, where('receiptNo', '==', isNaN(num) ? rawStr : num));
      const qSnap = await getDocs(q);
      if (!qSnap.empty) {
        return { ...(qSnap.docs[0].data() as Receipt), id: qSnap.docs[0].id };
      }

      return null;
    } catch (err: any) {
      console.error(`[ReceiptFirestore] getByReceiptNo(${receiptNo}) error:`, err?.message || err);
      return null;
    }
  }

  public async create(receipt: Receipt): Promise<Receipt> {
    const rNoStr = String(receipt.receiptNo || Date.now());
    const docId = rNoStr.startsWith('RCPT-') ? rNoStr : `RCPT-${rNoStr}`;

    const cleanReceipt: Receipt = {
      ...receipt,
      id: docId,
      receiptNo: typeof receipt.receiptNo === 'number' ? receipt.receiptNo : (parseInt(rNoStr.replace(/\D/g, ''), 10) || Date.now()),
      createdAt: receipt.createdAt || new Date().toISOString()
    };

    const docRef = doc(db, COLLECTION_NAME, docId);
    await setDoc(docRef, cleanReceipt, { merge: true });

    return cleanReceipt;
  }

  public async delete(receiptNo: string | number): Promise<boolean> {
    const existing = await this.getByReceiptNo(receiptNo);
    if (!existing) return false;

    const docRef = doc(db, COLLECTION_NAME, existing.id);
    await deleteDoc(docRef);
    return true;
  }
}

export const receiptFirestore = new ReceiptFirestoreService();
export default receiptFirestore;
