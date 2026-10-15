/**
 * Rental Management Firestore Repository for KKV Gold Finance & Rental Management
 * Primary Database: Firebase Cloud Firestore (Project: kkv-finance-4b3bf)
 */
import {
  collection,
  doc,
  getDocs,
  setDoc
} from 'firebase/firestore';
import { db } from '../../lib/firebase';

export class RentalFirestoreService {
  private complexCol = collection(db, 'rentalComplexes');
  private shopCol = collection(db, 'rentalShops');
  private paymentCol = collection(db, 'rentalPayments');
  private expenseCol = collection(db, 'rentalExpenses');
  private daybookCol = collection(db, 'rentalDaybook');

  // ── Complexes ───────────────────────────────────────────────────────────────
  public async getAllComplexes(): Promise<any[]> {
    const snap = await getDocs(this.complexCol);
    const list: any[] = [];
    snap.forEach((d) => list.push({ ...d.data(), id: d.id }));
    return list;
  }

  public async saveComplex(complex: any): Promise<any> {
    const docId = complex.id || `COMPLEX-${Date.now()}`;
    const clean = { ...complex, id: docId, updatedAt: new Date().toISOString() };
    await setDoc(doc(db, 'rentalComplexes', docId), clean, { merge: true });
    return clean;
  }

  // ── Shops ───────────────────────────────────────────────────────────────────
  public async getAllShops(): Promise<any[]> {
    const snap = await getDocs(this.shopCol);
    const list: any[] = [];
    snap.forEach((d) => list.push({ ...d.data(), id: d.id }));
    return list;
  }

  public async saveShop(shop: any): Promise<any> {
    const docId = shop.id || `SHOP-${Date.now()}`;
    const clean = { ...shop, id: docId, updatedAt: new Date().toISOString() };
    await setDoc(doc(db, 'rentalShops', docId), clean, { merge: true });
    return clean;
  }

  // ── Rental Payments ─────────────────────────────────────────────────────────
  public async getAllPayments(): Promise<any[]> {
    const snap = await getDocs(this.paymentCol);
    const list: any[] = [];
    snap.forEach((d) => list.push({ ...d.data(), id: d.id }));
    return list;
  }

  public async savePayment(payment: any): Promise<any> {
    const docId = payment.id || `RPAY-${Date.now()}`;
    const clean = { ...payment, id: docId, createdAt: payment.createdAt || new Date().toISOString() };
    await setDoc(doc(db, 'rentalPayments', docId), clean, { merge: true });
    return clean;
  }

  // ── Rental Expenses ─────────────────────────────────────────────────────────
  public async getAllExpenses(): Promise<any[]> {
    const snap = await getDocs(this.expenseCol);
    const list: any[] = [];
    snap.forEach((d) => list.push({ ...d.data(), id: d.id }));
    return list;
  }

  public async saveExpense(expense: any): Promise<any> {
    const docId = expense.id || `REXP-${Date.now()}`;
    const clean = { ...expense, id: docId, createdAt: expense.createdAt || new Date().toISOString() };
    await setDoc(doc(db, 'rentalExpenses', docId), clean, { merge: true });
    return clean;
  }

  // ── Rental Daybook ──────────────────────────────────────────────────────────
  public async getAllDaybookEntries(): Promise<any[]> {
    const snap = await getDocs(this.daybookCol);
    const list: any[] = [];
    snap.forEach((d) => list.push({ ...d.data(), id: d.id }));
    return list;
  }

  public async saveDaybookEntry(entry: any): Promise<any> {
    const docId = entry.id || `RDB-${Date.now()}`;
    const clean = { ...entry, id: docId, createdAt: entry.createdAt || new Date().toISOString() };
    await setDoc(doc(db, 'rentalDaybook', docId), clean, { merge: true });
    return clean;
  }
}

export const rentalFirestore = new RentalFirestoreService();
export default rentalFirestore;
