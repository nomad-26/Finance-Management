/**
 * Customer Firestore Repository for KKV Gold Finance & Rental Management
 * Primary Database: Firebase Cloud Firestore (Project: kkv-finance-4b3bf)
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  writeBatch,
  DocumentData
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Customer } from '../../types';
import { firebaseStorage } from '../../lib/firebaseStorage';

const COLLECTION_NAME = 'customers';

export function normalizePhone(phone: string): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export class CustomerFirestoreService {
  private colRef = collection(db, COLLECTION_NAME);

  /**
   * Retrieves all customers from Cloud Firestore
   */
  public async getAll(includeDeleted: boolean = false): Promise<Customer[]> {
    try {
      const q = includeDeleted
        ? query(this.colRef)
        : query(this.colRef, where('isDeleted', '==', false));

      const snapshot = await getDocs(q);
      const list: Customer[] = [];

      snapshot.forEach((d) => {
        const data = d.data() as Customer;
        // If includeDeleted is false, ensure isDeleted is truly falsy
        if (includeDeleted || !data.isDeleted) {
          list.push({
            ...data,
            id: d.id || data.id,
            customerId: data.customerId || parseInt(d.id.replace(/\D/g, ''), 10) || d.id
          });
        }
      });

      return list;
    } catch (err: any) {
      console.error('[CustomerFirestore] getAll error:', err?.message || err);
      throw err;
    }
  }

  /**
   * Finds customer by primary ID or numeric customerId
   */
  public async getById(id: string): Promise<Customer | null> {
    if (!id) return null;
    const cleanId = String(id).trim();

    try {
      // 1. Direct document lookup by ID
      const docRef = doc(db, COLLECTION_NAME, cleanId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data() as Customer;
        return { ...data, id: docSnap.id };
      }

      // 2. Query by customerId (numeric or string)
      const num = parseInt(cleanId.replace(/\D/g, ''), 10);
      const q = query(this.colRef, where('customerId', '==', isNaN(num) ? cleanId : num));
      const querySnap = await getDocs(q);
      if (!querySnap.empty) {
        const first = querySnap.docs[0];
        return { ...(first.data() as Customer), id: first.id };
      }

      return null;
    } catch (err: any) {
      console.error(`[CustomerFirestore] getById(${id}) error:`, err?.message || err);
      return null;
    }
  }

  /**
   * Checks for duplicate active phone number in Cloud Firestore
   */
  public async checkPhoneDuplicate(
    phoneNumber: string,
    excludeCustomerId?: string
  ): Promise<Customer | null> {
    const norm = normalizePhone(phoneNumber);
    if (!norm) return null;

    try {
      const q = query(
        this.colRef,
        where('isDeleted', '==', false),
        where('phoneNormalized', '==', norm)
      );

      const snap = await getDocs(q);
      for (const d of snap.docs) {
        if (excludeCustomerId && (d.id === excludeCustomerId || String((d.data() as any).customerId) === excludeCustomerId)) {
          continue;
        }
        return { ...(d.data() as Customer), id: d.id };
      }

      return null;
    } catch (err: any) {
      console.warn('[CustomerFirestore] checkPhoneDuplicate notice:', err?.message || err);
      return null;
    }
  }

  /**
   * Creates a new Customer record in Cloud Firestore
   */
  public async create(customer: Customer): Promise<Customer> {
    const norm = normalizePhone(customer.phone);

    // Enforce duplicate protection among active customers
    const duplicate = await this.checkPhoneDuplicate(norm);
    if (duplicate) {
      const err: any = new Error(
        `This mobile number is already registered to active customer ${duplicate.name} (${duplicate.id}).`
      );
      err.code = 'DUPLICATE_PHONE_NUMBER';
      throw err;
    }

    const docId = customer.id || `CUST-${String(customer.customerId || Date.now()).padStart(4, '0')}`;
    const cleanCustomer: Customer = {
      ...customer,
      id: docId,
      phoneNormalized: norm,
      isDeleted: false,
      deletedAt: null,
      deletedBy: null,
      createdAt: customer.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const docRef = doc(db, COLLECTION_NAME, docId);
    await setDoc(docRef, cleanCustomer, { merge: true });

    return cleanCustomer;
  }

  /**
   * Updates an existing Customer record in Cloud Firestore
   */
  public async update(id: string, updates: Partial<Customer>): Promise<Customer> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error(`Customer "${id}" not found in Firestore.`);
    }

    if (updates.phone) {
      const norm = normalizePhone(updates.phone);
      if (norm) {
        const duplicate = await this.checkPhoneDuplicate(norm, existing.id);
        if (duplicate) {
          const err: any = new Error(
            `This mobile number is already registered to another active customer: ${duplicate.name} (${duplicate.id}).`
          );
          err.code = 'DUPLICATE_PHONE_NUMBER';
          throw err;
        }
        updates.phoneNormalized = norm;
      }
    }

    const updatedData: Customer = {
      ...existing,
      ...updates,
      id: existing.id,
      updatedAt: new Date().toISOString()
    };

    const docRef = doc(db, COLLECTION_NAME, existing.id);
    await updateDoc(docRef, updatedData as DocumentData);

    return updatedData;
  }

  /**
   * Soft-deletes a customer (moves to Deleted Customers tab)
   */
  public async softDelete(id: string, deletedBy: string = 'ADMIN'): Promise<boolean> {
    const existing = await this.getById(id);
    if (!existing) return false;

    const docRef = doc(db, COLLECTION_NAME, existing.id);
    await updateDoc(docRef, {
      isDeleted: true,
      deletedAt: new Date().toISOString(),
      deletedBy,
      updatedAt: new Date().toISOString()
    });

    return true;
  }

  /**
   * Restores a soft-deleted customer
   */
  public async restore(id: string): Promise<boolean> {
    const existing = await this.getById(id);
    if (!existing) return false;

    const docRef = doc(db, COLLECTION_NAME, existing.id);
    await updateDoc(docRef, {
      isDeleted: false,
      deletedAt: null,
      deletedBy: null,
      updatedAt: new Date().toISOString()
    });

    return true;
  }

  /**
   * Permanently and irreversibly deletes a customer and all customer-specific linked records
   * across Firestore collections and Cloud Storage.
   */
  public async permanentDelete(targetId: string): Promise<{ success: boolean; message: string }> {
    const customer = await this.getById(targetId);
    if (!customer) {
      return { success: false, message: `Customer "${targetId}" not found in Firestore.` };
    }

    const custId = customer.id;
    const numericCustId = String(customer.customerId || '');

    const batch = writeBatch(db);

    // 1. Delete Customer document
    const custDocRef = doc(db, COLLECTION_NAME, custId);
    batch.delete(custDocRef);

    // 2. Cascade delete linked Loans
    const loansRef = collection(db, 'loans');
    const loansSnap = await getDocs(query(loansRef, where('customerId', '==', custId)));
    const deletedLoanNos = new Set<string>();

    loansSnap.forEach((l) => {
      const lData = l.data() as any;
      if (lData.loanNo) deletedLoanNos.add(lData.loanNo);
      batch.delete(l.ref);
    });

    // Also check numeric ID if different
    if (numericCustId && numericCustId !== custId) {
      const numLoansSnap = await getDocs(query(loansRef, where('customerId', '==', numericCustId)));
      numLoansSnap.forEach((l) => {
        const lData = l.data() as any;
        if (lData.loanNo) deletedLoanNos.add(lData.loanNo);
        batch.delete(l.ref);
      });
    }

    // 3. Cascade delete linked Receipts
    const receiptsRef = collection(db, 'receipts');
    const receiptsSnap = await getDocs(query(receiptsRef, where('customerId', '==', custId)));
    receiptsSnap.forEach((r) => batch.delete(r.ref));

    for (const loanNo of deletedLoanNos) {
      const loanReceiptsSnap = await getDocs(query(receiptsRef, where('loanNo', '==', loanNo)));
      loanReceiptsSnap.forEach((r) => batch.delete(r.ref));
    }

    // 4. Cascade delete linked Fixed Deposits
    const fdsRef = collection(db, 'fixedDeposits');
    const fdsSnap = await getDocs(query(fdsRef, where('customerId', '==', custId)));
    const deletedFdNos = new Set<string>();

    fdsSnap.forEach((f) => {
      const fData = f.data() as any;
      if (fData.fdNo) deletedFdNos.add(fData.fdNo);
      batch.delete(f.ref);
    });

    // 5. Cascade delete FD sub-records
    const payoutsRef = collection(db, 'fdInterestPayouts');
    const withdrawalsRef = collection(db, 'fdWithdrawals');
    const renewalsRef = collection(db, 'fdRenewals');
    const fdCustRef = collection(db, 'fdCustomers');

    for (const fdNo of deletedFdNos) {
      const pSnap = await getDocs(query(payoutsRef, where('fdNo', '==', fdNo)));
      pSnap.forEach((p) => batch.delete(p.ref));

      const wSnap = await getDocs(query(withdrawalsRef, where('fdNo', '==', fdNo)));
      wSnap.forEach((w) => batch.delete(w.ref));

      const rSnap = await getDocs(query(renewalsRef, where('fdNo', '==', fdNo)));
      rSnap.forEach((ren) => batch.delete(ren.ref));
    }

    const fdCustSnap = await getDocs(query(fdCustRef, where('id', '==', custId)));
    fdCustSnap.forEach((fc) => batch.delete(fc.ref));

    // 6. Commit the atomic batch deletion
    await batch.commit();

    // 7. Delete Customer files from Firebase Storage
    try {
      if (customer.customerPhoto && typeof customer.customerPhoto === 'string') {
        await firebaseStorage.deleteFile(customer.customerPhoto);
      }
      if (Array.isArray(customer.kycDocuments)) {
        for (const docItem of customer.kycDocuments) {
          if (docItem.url) {
            await firebaseStorage.deleteFile(docItem.url);
          }
        }
      }
    } catch (storageErr) {
      console.warn('[CustomerFirestore] Notice cleaning Storage files:', storageErr);
    }

    return {
      success: true,
      message: `Customer ${customer.name} (${customer.id}) and all linked records permanently deleted from Firestore.`
    };
  }
}

export const customerFirestore = new CustomerFirestoreService();
export default customerFirestore;
