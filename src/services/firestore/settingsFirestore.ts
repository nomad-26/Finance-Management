/**
 * System Settings & Audit Logs Firestore Repository for KKV Gold Finance & Rental Management
 * Primary Database: Firebase Cloud Firestore (Project: kkv-finance-4b3bf)
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { MasterControlSettings, StaffAuditLog } from '../../types';

export class SettingsFirestoreService {
  // ── Master Control Settings ─────────────────────────────────────────────────
  public async getMasterSettings(): Promise<MasterControlSettings | null> {
    try {
      const docRef = doc(db, 'systemSettings', 'masterControl');
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        return snap.data() as MasterControlSettings;
      }
      return null;
    } catch (err: any) {
      console.warn('[SettingsFirestore] getMasterSettings notice:', err?.message || err);
      return null;
    }
  }

  public async saveMasterSettings(settings: MasterControlSettings): Promise<MasterControlSettings> {
    const docRef = doc(db, 'systemSettings', 'masterControl');
    await setDoc(docRef, { ...settings, updatedAt: new Date().toISOString() }, { merge: true });
    return settings;
  }

  // ── WhatsApp Message Templates ──────────────────────────────────────────────
  public async getWhatsAppTemplates(): Promise<any | null> {
    try {
      const docRef = doc(db, 'systemSettings', 'whatsappTemplates');
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        return snap.data();
      }
      return null;
    } catch (err) {
      return null;
    }
  }

  public async saveWhatsAppTemplates(templates: any): Promise<void> {
    const docRef = doc(db, 'systemSettings', 'whatsappTemplates');
    await setDoc(docRef, { ...templates, updatedAt: new Date().toISOString() }, { merge: true });
  }

  // ── Reminders ───────────────────────────────────────────────────────────────
  public async getReminders(): Promise<any[]> {
    try {
      const docRef = doc(db, 'systemSettings', 'dailyReminders');
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        return snap.data()?.items || [];
      }
      return [];
    } catch (err) {
      return [];
    }
  }

  public async saveReminders(items: any[]): Promise<void> {
    const docRef = doc(db, 'systemSettings', 'dailyReminders');
    await setDoc(docRef, { items, updatedAt: new Date().toISOString() }, { merge: true });
  }

  // ── Staff Audit Logs ────────────────────────────────────────────────────────
  public async getStaffAuditLogs(): Promise<StaffAuditLog[]> {
    try {
      const snap = await getDocs(collection(db, 'staffAuditLogs'));
      const list: StaffAuditLog[] = [];
      snap.forEach((d) => list.push({ ...(d.data() as StaffAuditLog), id: d.id }));
      return list;
    } catch (err) {
      return [];
    }
  }

  public async logStaffAction(entry: Omit<StaffAuditLog, 'id' | 'timestamp'>): Promise<void> {
    const docId = `AUDIT-${Date.now()}`;
    const clean: StaffAuditLog = {
      ...entry,
      id: docId,
      timestamp: new Date().toISOString()
    };
    await setDoc(doc(db, 'staffAuditLogs', docId), clean);
  }
}

export const settingsFirestore = new SettingsFirestoreService();
export default settingsFirestore;
