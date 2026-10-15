/**
 * DayBook Firestore Repository for KKV Gold Finance & Rental Management
 * Primary Database: Firebase Cloud Firestore (Project: kkv-finance-4b3bf)
 */
import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { DayBookEntry } from '../../types';

const COLLECTION_NAME = 'dayBookEntries';

export class DayBookFirestoreService {
  private colRef = collection(db, COLLECTION_NAME);

  public async getAll(): Promise<DayBookEntry[]> {
    try {
      const snap = await getDocs(this.colRef);
      const list: DayBookEntry[] = [];
      snap.forEach((d) => list.push({ ...(d.data() as DayBookEntry), id: d.id }));
      return list;
    } catch (err: any) {
      console.error('[DayBookFirestore] getAll error:', err?.message || err);
      return [];
    }
  }

  public async save(entry: DayBookEntry): Promise<DayBookEntry> {
    const docId = entry.id || `db-${Date.now()}`;
    const clean: DayBookEntry = { ...entry, id: docId };
    await setDoc(doc(db, COLLECTION_NAME, docId), clean, { merge: true });
    return clean;
  }

  public async delete(id: string): Promise<boolean> {
    if (!id) return false;
    await deleteDoc(doc(db, COLLECTION_NAME, id));
    return true;
  }
}

export const dayBookFirestore = new DayBookFirestoreService();
export default dayBookFirestore;
