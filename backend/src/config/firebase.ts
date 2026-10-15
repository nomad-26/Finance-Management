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
  deleteDoc,
  runTransaction as clientRunTransaction
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

export interface FirebaseDiagnostics {
  timestamp: string;
  configured: boolean;
  credentialSource: string;
  rawLength: number;
  formatDetected: 'json' | 'base64' | 'filepath' | 'escaped_json' | 'none' | 'unknown';
  jsonParsed: boolean;
  parseError: string | null;
  serviceAccountEmail: string | null;
  resolvedProjectId: string | null;
  expectedProjectId: string;
  projectIdMatches: boolean;
  hasPrivateKey: boolean;
  privateKeyHeaderValid: boolean;
  adminAppInitialized: boolean;
  adminDbInitialized: boolean;
  adminInitError: string | null;
  activeSdk: 'ADMIN_SDK' | 'CLIENT_SDK_FALLBACK';
}

const diagnosticsState: FirebaseDiagnostics = {
  timestamp: new Date().toISOString(),
  configured: false,
  credentialSource: 'NONE',
  rawLength: 0,
  formatDetected: 'none',
  jsonParsed: false,
  parseError: null,
  serviceAccountEmail: null,
  resolvedProjectId: null,
  expectedProjectId: firebaseConfig.projectId,
  projectIdMatches: false,
  hasPrivateKey: false,
  privateKeyHeaderValid: false,
  adminAppInitialized: false,
  adminDbInitialized: false,
  adminInitError: null,
  activeSdk: 'CLIENT_SDK_FALLBACK'
};

export function getFirebaseDiagnostics(): FirebaseDiagnostics {
  return { ...diagnosticsState, timestamp: new Date().toISOString() };
}

export function getSafeFirebaseSummary(): Record<string, any> {
  const diag = getFirebaseDiagnostics();
  return {
    activeSdk: diag.activeSdk,
    credentialConfigured: diag.configured,
    credentialSource: diag.credentialSource,
    jsonParsed: diag.jsonParsed,
    parseError: diag.parseError,
    serviceAccountEmail: diag.serviceAccountEmail,
    resolvedProjectId: diag.resolvedProjectId,
    expectedProjectId: diag.expectedProjectId,
    projectIdMatches: diag.projectIdMatches,
    adminDbInitialized: diag.adminDbInitialized
  };
}

// ── 1. Firebase Admin SDK Initialization ─────────────────────────────────────
let adminApp: admin.app.App | null = null;
let adminDb: admin.firestore.Firestore | null = null;
let isUsingAdminSdk = false;

function tryParseServiceAccountJson(rawString: string): { parsed: any; format: 'json' | 'base64' | 'filepath' | 'escaped_json' | 'unknown'; error?: string } {
  let content = rawString.trim();

  // Strip surrounding quotes if wrapped
  if ((content.startsWith('"') && content.endsWith('"')) || (content.startsWith("'") && content.endsWith("'"))) {
    content = content.slice(1, -1).trim();
  }

  // Check if it is a local filesystem path
  if (fs.existsSync(content)) {
    try {
      const fileData = fs.readFileSync(content, 'utf8').trim();
      return { parsed: JSON.parse(fileData), format: 'filepath' };
    } catch (fErr: any) {
      return { parsed: null, format: 'filepath', error: `File read/parse error: ${fErr.message}` };
    }
  }

  // Attempt 1: Standard JSON parse
  if (content.startsWith('{')) {
    try {
      return { parsed: JSON.parse(content), format: 'json' };
    } catch (jsonErr: any) {
      // Check for escaped double quotes (common when set via CLI or stringified JSON)
      if (content.includes('\\"')) {
        try {
          const unescaped = content.replace(/\\"/g, '"');
          return { parsed: JSON.parse(unescaped), format: 'escaped_json' };
        } catch {}
      }
      return { parsed: null, format: 'json', error: jsonErr.message };
    }
  }

  // Attempt 2: Base64 decode
  try {
    const decoded = Buffer.from(content, 'base64').toString('utf8').trim();
    if (decoded.startsWith('{')) {
      return { parsed: JSON.parse(decoded), format: 'base64' };
    }
  } catch (b64Err: any) {
    // Continue
  }

  // Attempt 3: General unescaped JSON
  if (content.includes('\\"')) {
    try {
      const unescaped = content.replace(/\\"/g, '"');
      return { parsed: JSON.parse(unescaped), format: 'escaped_json' };
    } catch {}
  }

  return { parsed: null, format: 'unknown', error: 'Input does not start with JSON { or valid Base64 JSON.' };
}

function resolveServiceAccount(): admin.ServiceAccount | null {
  try {
    // A. Check for raw or base64 JSON string in FIREBASE_SERVICE_ACCOUNT / FIREBASE_SERVICE_ACCOUNT_KEY
    const rawSa = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (rawSa && rawSa.trim()) {
      diagnosticsState.configured = true;
      diagnosticsState.credentialSource = process.env.FIREBASE_SERVICE_ACCOUNT ? 'FIREBASE_SERVICE_ACCOUNT' : 'FIREBASE_SERVICE_ACCOUNT_KEY';
      diagnosticsState.rawLength = rawSa.trim().length;

      const { parsed, format, error } = tryParseServiceAccountJson(rawSa);
      diagnosticsState.formatDetected = format;

      if (!parsed) {
        diagnosticsState.jsonParsed = false;
        diagnosticsState.parseError = error || 'Failed to parse service account JSON.';
        console.warn(`[Firebase Backend] ⚠️ Service account parse failed (${diagnosticsState.credentialSource}):`, diagnosticsState.parseError);
        return null;
      }

      diagnosticsState.jsonParsed = true;
      diagnosticsState.serviceAccountEmail = parsed.client_email || parsed.clientEmail || null;
      diagnosticsState.resolvedProjectId = parsed.project_id || parsed.projectId || null;
      diagnosticsState.projectIdMatches = diagnosticsState.resolvedProjectId === firebaseConfig.projectId;

      const rawKey = parsed.private_key || parsed.privateKey;
      diagnosticsState.hasPrivateKey = Boolean(rawKey);

      if (rawKey && typeof rawKey === 'string') {
        const formattedKey = rawKey.replace(/\\n/g, '\n').trim();
        diagnosticsState.privateKeyHeaderValid = formattedKey.includes('BEGIN PRIVATE KEY') || formattedKey.includes('BEGIN RSA PRIVATE KEY');

        if (!diagnosticsState.projectIdMatches) {
          console.warn(`[Firebase Backend] ⚠️ MISCONFIGURED PROJECT: Service account project_id "${diagnosticsState.resolvedProjectId}" does not match target Firestore project "${firebaseConfig.projectId}"!`);
        }

        if (parsed.client_email && formattedKey) {
          return {
            projectId: parsed.project_id || firebaseConfig.projectId,
            clientEmail: parsed.client_email,
            privateKey: formattedKey
          };
        }
      } else {
        diagnosticsState.parseError = 'Parsed JSON is missing client_email or private_key fields.';
      }
    }

    // B. Check for GOOGLE_APPLICATION_CREDENTIALS file path or JSON
    const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (credPath && credPath.trim()) {
      diagnosticsState.configured = true;
      diagnosticsState.credentialSource = 'GOOGLE_APPLICATION_CREDENTIALS';
      diagnosticsState.rawLength = credPath.trim().length;

      const { parsed, format, error } = tryParseServiceAccountJson(credPath);
      diagnosticsState.formatDetected = format;

      if (parsed) {
        diagnosticsState.jsonParsed = true;
        diagnosticsState.serviceAccountEmail = parsed.client_email || null;
        diagnosticsState.resolvedProjectId = parsed.project_id || null;
        diagnosticsState.projectIdMatches = diagnosticsState.resolvedProjectId === firebaseConfig.projectId;
        const formattedKey = (parsed.private_key || '').replace(/\\n/g, '\n').trim();
        diagnosticsState.hasPrivateKey = Boolean(formattedKey);
        diagnosticsState.privateKeyHeaderValid = formattedKey.includes('BEGIN PRIVATE KEY');

        if (parsed.client_email && formattedKey) {
          return {
            projectId: parsed.project_id || firebaseConfig.projectId,
            clientEmail: parsed.client_email,
            privateKey: formattedKey
          };
        }
      } else {
        diagnosticsState.parseError = error || 'GOOGLE_APPLICATION_CREDENTIALS file could not be read/parsed.';
      }
    }

    // C. Check individual env variables
    const saEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL;
    const saKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY;
    if (saEmail && saKey && saEmail.trim() && saKey.trim()) {
      diagnosticsState.configured = true;
      diagnosticsState.credentialSource = 'ENV_PAIR';
      diagnosticsState.rawLength = saKey.trim().length;
      diagnosticsState.formatDetected = 'json';
      diagnosticsState.jsonParsed = true;
      diagnosticsState.serviceAccountEmail = saEmail.trim();
      diagnosticsState.resolvedProjectId = process.env.GOOGLE_CLOUD_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId;
      diagnosticsState.projectIdMatches = diagnosticsState.resolvedProjectId === firebaseConfig.projectId;
      const formattedKey = saKey.trim().replace(/\\n/g, '\n');
      diagnosticsState.hasPrivateKey = true;
      diagnosticsState.privateKeyHeaderValid = formattedKey.includes('BEGIN PRIVATE KEY');

      return {
        projectId: diagnosticsState.resolvedProjectId,
        clientEmail: diagnosticsState.serviceAccountEmail,
        privateKey: formattedKey
      };
    }
  } catch (err: any) {
    diagnosticsState.parseError = err?.message || String(err);
    console.warn('[Firebase Backend] Warning resolving service account credentials:', diagnosticsState.parseError);
  }

  return null;
}

// Execute Admin SDK initialization
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
      adminApp = admin.apps[0]!;
    }
    adminDb = adminApp.firestore();
    isUsingAdminSdk = true;
    diagnosticsState.adminAppInitialized = true;
    diagnosticsState.adminDbInitialized = true;
    diagnosticsState.activeSdk = 'ADMIN_SDK';
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
          adminApp = admin.apps[0]!;
        }
        adminDb = adminApp.firestore();
        isUsingAdminSdk = true;
        diagnosticsState.adminAppInitialized = true;
        diagnosticsState.adminDbInitialized = true;
        diagnosticsState.activeSdk = 'ADMIN_SDK';
        diagnosticsState.credentialSource = 'GCP_AMBIENT';
        console.log(`[Firebase Backend] ✅ Initialized Firebase Admin SDK with ambient cloud credentials for project: ${firebaseConfig.projectId}`);
      } catch (gcpErr: any) {
        diagnosticsState.adminInitError = gcpErr?.message || String(gcpErr);
      }
    }
  }
} catch (adminErr: any) {
  diagnosticsState.adminInitError = adminErr?.message || String(adminErr);
  console.warn('[Firebase Backend] Admin SDK initialization error:', diagnosticsState.adminInitError);
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

// Print Safe Startup Diagnostics Banner
console.log('═══════════════════════════════════════════════════════════════');
console.log(`🔥 FIREBASE BACKEND STARTUP STATUS (Project: ${firebaseConfig.projectId})`);
console.log(`   • Active Database SDK: ${diagnosticsState.activeSdk}`);
console.log(`   • Credentials Configured: ${diagnosticsState.configured ? 'YES (' + diagnosticsState.credentialSource + ')' : 'NO'}`);
if (diagnosticsState.configured) {
  console.log(`   • JSON Parse: ${diagnosticsState.jsonParsed ? 'SUCCESS (' + diagnosticsState.formatDetected + ')' : 'FAILED (' + (diagnosticsState.parseError || 'Invalid format') + ')'}`);
  console.log(`   • Service Account Email: ${diagnosticsState.serviceAccountEmail || 'None'}`);
  console.log(`   • Project ID Match: ${diagnosticsState.projectIdMatches ? 'YES (' + diagnosticsState.resolvedProjectId + ')' : 'MISMATCH (Target: ' + firebaseConfig.projectId + ', Found: ' + (diagnosticsState.resolvedProjectId || 'none') + ')'}`);
  console.log(`   • Private Key Valid: ${diagnosticsState.privateKeyHeaderValid ? 'YES' : 'NO'}`);
}
if (!isUsingAdminSdk) {
  console.log('   ⚠️ WARNING: Running without Firebase Admin SDK. Writes will be subject to client Firestore rules.');
}
console.log('═══════════════════════════════════════════════════════════════');

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
  },

  /**
   * Concurrency-safe atomic transaction across Admin and Client SDKs
   */
  async runTransaction<T>(
    updateFunction: (transaction: {
      get: (colName: string, docId: string) => Promise<{ exists: boolean; id: string; data: () => any }>;
      set: (colName: string, docId: string, data: any, options?: { merge?: boolean }) => void;
      update: (colName: string, docId: string, data: any) => void;
    }) => Promise<T>
  ): Promise<T> {
    if (isUsingAdminSdk && adminDb) {
      return adminDb.runTransaction(async (adminTx) => {
        const txAdapter = {
          get: async (colName: string, docId: string) => {
            const snap = await adminTx.get(adminDb!.collection(colName).doc(docId));
            return {
              exists: snap.exists,
              id: snap.id,
              data: () => snap.data()
            };
          },
          set: (colName: string, docId: string, data: any, options?: { merge?: boolean }) => {
            adminTx.set(adminDb!.collection(colName).doc(docId), data, { merge: options?.merge ?? true });
          },
          update: (colName: string, docId: string, data: any) => {
            adminTx.update(adminDb!.collection(colName).doc(docId), data);
          }
        };
        return updateFunction(txAdapter);
      });
    }

    return clientRunTransaction(db, async (clientTx) => {
      const txAdapter = {
        get: async (colName: string, docId: string) => {
          const snap = await clientTx.get(doc(db, colName, docId));
          return {
            exists: snap.exists(),
            id: snap.id,
            data: () => snap.data()
          };
        },
        set: (colName: string, docId: string, data: any, options?: { merge?: boolean }) => {
          clientTx.set(doc(db, colName, docId), data, { merge: options?.merge ?? true });
        },
        update: (colName: string, docId: string, data: any) => {
          clientTx.update(doc(db, colName, docId), data);
        }
      };
      return updateFunction(txAdapter);
    });
  }
};

export { app, db, adminApp, adminDb, isUsingAdminSdk };
export default { app, db, adminApp, adminDb, isUsingAdminSdk, firebaseConfig, unifiedFirestore, getFirebaseDiagnostics, getSafeFirebaseSummary };
