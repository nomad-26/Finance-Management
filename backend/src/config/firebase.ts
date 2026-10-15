/**
 * Firebase & Cloud Firestore Configuration for KKV Gold Finance Backend
 * Primary Database: Cloud Firestore (Project: kkv-finance-4b3bf)
 * 
 * Supports:
 * 1. Firebase Admin SDK (Authoritative Server-Side): Automatically activated when
 *    service account credentials exist in FIREBASE_SERVICE_ACCOUNT, FIREBASE_SERVICE_ACCOUNT_KEY,
 *    GOOGLE_APPLICATION_CREDENTIALS, or GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.
 * 2. Firebase Modular Client SDK (Fallback / Development): Graceful fallback with local
 *    cache protection and clear diagnostics if server credentials are not yet configured.
 */
import fs from 'fs';
import admin from 'firebase-admin';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  Firestore,
  doc,
  getDoc,
  collection,
  getDocs,
  setDoc,
  deleteDoc
} from 'firebase/firestore';

export const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || 'AIzaSyCwSG5LIzQVRYZZOs076tMcApXNdjE7pK8',
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || 'kkv-finance-4b3bf.firebaseapp.com',
  projectId: process.env.FIREBASE_PROJECT_ID || 'kkv-finance-4b3bf',
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'kkv-finance-4b3bf.firebasestorage.app',
  messagingSenderId: '418809898604',
  appId: '1:418809898604:web:bfa4e6db566192012d1a49',
  measurementId: 'G-C4CQC0E79R'
};

// ── 1. Firebase Admin SDK Initialization ─────────────────────────────────────
let adminApp: admin.app.App | null = null;
let adminDb: admin.firestore.Firestore | null = null;
let isUsingAdminSdk = false;

function resolveServiceAccount(): admin.ServiceAccount | null {
  try {
    // A. Check for raw or base64 JSON string in FIREBASE_SERVICE_ACCOUNT / FIREBASE_SERVICE_ACCOUNT_KEY
    const rawSa = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (rawSa && rawSa.trim()) {
      let jsonStr = rawSa.trim();
      // Handle surrounding single or double quotes from shell/.env
      if ((jsonStr.startsWith('"') && jsonStr.endsWith('"')) || (jsonStr.startsWith("'") && jsonStr.endsWith("'"))) {
        jsonStr = jsonStr.slice(1, -1).trim();
      }
      // Check if it's a file path
      if (fs.existsSync(jsonStr)) {
        jsonStr = fs.readFileSync(jsonStr, 'utf8').trim();
      } else if (!jsonStr.startsWith('{') && !jsonStr.endsWith('}')) {
        // Base64 encoded JSON
        jsonStr = Buffer.from(jsonStr, 'base64').toString('utf8');
      }
      const parsed = JSON.parse(jsonStr);
      if (parsed.client_email && (parsed.private_key || parsed.privateKey)) {
        return {
          projectId: parsed.project_id || firebaseConfig.projectId,
          clientEmail: parsed.client_email,
          privateKey: (parsed.private_key || parsed.privateKey).replace(/\\n/g, '\n')
        };
      }
    }

    // B. Check for GOOGLE_APPLICATION_CREDENTIALS file or JSON
    const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (credPath && credPath.trim()) {
      if (fs.existsSync(credPath.trim())) {
        const fileContent = fs.readFileSync(credPath.trim(), 'utf8');
        const parsed = JSON.parse(fileContent);
        if (parsed.client_email && parsed.private_key) {
          return {
            projectId: parsed.project_id || firebaseConfig.projectId,
            clientEmail: parsed.client_email,
            privateKey: parsed.private_key.replace(/\\n/g, '\n')
          };
        }
      }
    }

    // C. Check individual env variables
    const saEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL;
    const saKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY;
    if (saEmail && saKey && saEmail.trim() && saKey.trim()) {
      return {
        projectId: process.env.GOOGLE_CLOUD_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId,
        clientEmail: saEmail.trim(),
        privateKey: saKey.trim().replace(/\\n/g, '\n')
      };
    }
  } catch (err: any) {
    console.warn('[Firebase Backend] Warning resolving service account credentials:', err?.message || err);
  }

  return null;
}

try {
  const sa = resolveServiceAccount();
  if (sa) {
    if (admin.apps.length === 0) {
      adminApp = admin.initializeApp({
        credential: admin.credential.cert(sa),
        projectId: sa.projectId || firebaseConfig.projectId,
        storageBucket: firebaseConfig.storageBucket
      });
    } else {
      adminApp = admin.app();
    }
    adminDb = adminApp.firestore();
    isUsingAdminSdk = true;
    console.log(`[Firebase Backend] ✅ Initialized Firebase Admin SDK with service account (${sa.clientEmail}) for project: ${firebaseConfig.projectId}`);
  } else {
    // Check if running in Google Cloud environment with default application credentials
    if (process.env.K_SERVICE || process.env.FUNCTION_NAME || process.env.GAE_SERVICE) {
      try {
        if (admin.apps.length === 0) {
          adminApp = admin.initializeApp({
            projectId: firebaseConfig.projectId
          });
        } else {
          adminApp = admin.app();
        }
        adminDb = adminApp.firestore();
        isUsingAdminSdk = true;
        console.log(`[Firebase Backend] ✅ Initialized Firebase Admin SDK with ambient cloud credentials for project: ${firebaseConfig.projectId}`);
      } catch {
        // Fall back to client SDK
      }
    }
  }
} catch (adminErr: any) {
  console.warn('[Firebase Backend] Admin SDK initialization note:', adminErr?.message || adminErr);
}

// ── 2. Firebase Modular Client SDK Initialization ─────────────────────────────
let app: FirebaseApp;
let db: Firestore;

try {
  if (getApps().length > 0) {
    app = getApp();
  } else {
    app = initializeApp(firebaseConfig);
  }
  db = getFirestore(app);
  if (!isUsingAdminSdk) {
    console.log(`[Firebase Backend] Initialized Client Modular SDK for project: ${firebaseConfig.projectId}`);
    console.log('[Firebase Backend] ℹ️ Tip: Set FIREBASE_SERVICE_ACCOUNT in production environment to activate Admin SDK with least-privilege IAM privileges.');
  }
} catch (err: any) {
  console.error('[Firebase Backend] Client SDK initialization notice:', err?.message || err);
  if (getApps().length > 0) {
    app = getApp();
  } else {
    app = initializeApp(firebaseConfig);
  }
  db = getFirestore(app);
}

// ── 3. Unified Firestore Client (Seamless Admin vs Client Abstraction) ────────
export const unifiedFirestore = {
  isUsingAdminSdk: () => isUsingAdminSdk,

  async getDoc(colName: string, docId: string): Promise<{ exists: boolean; id: string; data: () => any }> {
    if (isUsingAdminSdk && adminDb) {
      const snap = await adminDb.collection(colName).doc(docId).get();
      return {
        exists: snap.exists,
        id: snap.id,
        data: () => snap.data()
      };
    }

    const docRef = doc(db, colName, docId);
    const snap = await getDoc(docRef);
    return {
      exists: snap.exists(),
      id: snap.id,
      data: () => snap.data()
    };
  },

  async getDocs(colName: string): Promise<Array<{ id: string; data: () => any }>> {
    if (isUsingAdminSdk && adminDb) {
      const snap = await adminDb.collection(colName).get();
      return snap.docs.map((d) => ({
        id: d.id,
        data: () => d.data()
      }));
    }

    const colRef = collection(db, colName);
    const snap = await getDocs(colRef);
    return snap.docs.map((d) => ({
      id: d.id,
      data: () => d.data()
    }));
  },

  async setDoc(colName: string, docId: string, data: any, options: { merge?: boolean } = { merge: true }): Promise<void> {
    if (isUsingAdminSdk && adminDb) {
      await adminDb.collection(colName).doc(docId).set(data, { merge: options.merge ?? true });
      return;
    }

    const docRef = doc(db, colName, docId);
    await setDoc(docRef, data, { merge: options.merge ?? true });
  },

  async deleteDoc(colName: string, docId: string): Promise<void> {
    if (isUsingAdminSdk && adminDb) {
      await adminDb.collection(colName).doc(docId).delete();
      return;
    }

    const docRef = doc(db, colName, docId);
    await deleteDoc(docRef);
  }
};

export { app, db, adminApp, adminDb, isUsingAdminSdk };
export default { app, db, adminApp, adminDb, isUsingAdminSdk, firebaseConfig, unifiedFirestore };
