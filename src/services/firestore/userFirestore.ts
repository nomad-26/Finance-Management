/**
 * User & Staff Firestore Repository for KKV Gold Finance & Rental Management
 * Primary Database: Firebase Cloud Firestore (Project: kkv-finance-4b3bf)
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  where
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { UserProfile } from '../../types';

const COLLECTION_NAME = 'users';

export const ADMIN_STAFF_ID = 'KKV-ADMIN-000001';

export const DEFAULT_ADMIN_PROFILE: UserProfile = {
  uid: 'uid_admin_001',
  staffId: ADMIN_STAFF_ID,
  fullName: 'Kkvgoldfinance',
  displayName: 'Kkvgoldfinance',
  email: 'kkvgoldfinance13@gmail.com',
  phone: '9876543210',
  role: 'ADMIN',
  isActive: true,
  department: 'Administration',
  permissions: {
    all: true,
    customers: { view: true, create: true, edit: true, delete: true },
    loans: { view: true, issue: true, edit: true, close: true, reopen: true },
    fixedDeposits: { view: true, create: true, edit: true, withdraw: true, renew: true },
    rental: { view: true, manageComplexes: true, collectRent: true, manageExpenses: true, reports: true },
    dayBook: { view: true, addEntry: true, editEntry: true, deleteEntry: true },
    staffManagement: { view: true, create: true, edit: true, delete: true, toggleStatus: true },
    reports: { view: true, export: true },
    settings: { view: true, editRates: true, editCompany: true },
    backupRestore: { createBackup: true, restoreBackup: true },
    viewKyc: true
  } as any,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

export class UserFirestoreService {
  private colRef = collection(db, COLLECTION_NAME);

  /**
   * Retrieves all users/staff from Firestore
   */
  public async getAll(): Promise<UserProfile[]> {
    try {
      const snap = await getDocs(this.colRef);
      const list: UserProfile[] = [];
      snap.forEach((d) => {
        const data = d.data() as UserProfile;
        // Never expose passwordHash to frontend
        const { ...safeUser } = data as any;
        delete safeUser.passwordHash;
        list.push({ ...safeUser, uid: d.id || safeUser.uid, staffId: safeUser.staffId || d.id });
      });

      // If Firestore is empty, seed canonical admin
      if (list.length === 0) {
        await this.ensureAdminSeeded();
        list.push(DEFAULT_ADMIN_PROFILE);
      }

      return list;
    } catch (err: any) {
      console.warn('[UserFirestore] getAll notice:', err?.message || err);
      return [DEFAULT_ADMIN_PROFILE];
    }
  }

  /**
   * Finds a user by staffId, email, or uid
   */
  public async getUserById(identifier: string): Promise<UserProfile | null> {
    if (!identifier) return null;
    const clean = String(identifier).trim().toLowerCase();

    try {
      // 1. Direct document lookup
      const docRef = doc(db, COLLECTION_NAME, String(identifier).trim().toUpperCase());
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data() as any;
        delete data.passwordHash;
        return { ...data, uid: docSnap.id };
      }

      // 2. Query by email
      const qEmail = query(this.colRef, where('email', '==', clean));
      const emailSnap = await getDocs(qEmail);
      if (!emailSnap.empty) {
        const data = emailSnap.docs[0].data() as any;
        delete data.passwordHash;
        return { ...data, uid: emailSnap.docs[0].id };
      }

      // 3. Query by staffId
      const qStaff = query(this.colRef, where('staffId', '==', String(identifier).trim().toUpperCase()));
      const staffSnap = await getDocs(qStaff);
      if (!staffSnap.empty) {
        const data = staffSnap.docs[0].data() as any;
        delete data.passwordHash;
        return { ...data, uid: staffSnap.docs[0].id };
      }

      return null;
    } catch (err: any) {
      console.warn(`[UserFirestore] getUserById(${identifier}) notice:`, err?.message || err);
      return null;
    }
  }

  /**
   * Saves or creates a user record in Firestore
   */
  public async saveUser(user: Partial<UserProfile>): Promise<UserProfile> {
    const docId = user.staffId || user.uid || `STAFF-${Date.now()}`;
    const cleanUser: UserProfile = {
      ...DEFAULT_ADMIN_PROFILE,
      ...user,
      uid: user.uid || docId,
      staffId: user.staffId || docId,
      updatedAt: new Date().toISOString()
    };

    const docRef = doc(db, COLLECTION_NAME, docId);
    await setDoc(docRef, cleanUser, { merge: true });

    return cleanUser;
  }

  /**
   * Ensures the canonical Master Administrator record exists in Firestore
   */
  public async ensureAdminSeeded(): Promise<void> {
    try {
      const docRef = doc(db, COLLECTION_NAME, ADMIN_STAFF_ID);
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) {
        console.log(`[UserFirestore] Seeding canonical Master Admin (${ADMIN_STAFF_ID}) in Firestore...`);
        await setDoc(docRef, DEFAULT_ADMIN_PROFILE, { merge: true });
      }
    } catch (err: any) {
      console.warn('[UserFirestore] ensureAdminSeeded notice:', err?.message || err);
    }
  }
}

export const userFirestore = new UserFirestoreService();
export default userFirestore;
