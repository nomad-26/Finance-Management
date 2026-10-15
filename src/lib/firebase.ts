/**
 * Firebase Client Initialization Module for KKV Gold Finance & Rental Management
 * Project: kkv-finance-4b3bf
 * Uses Firebase Modular SDK v9+
 */
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore, enableIndexedDbPersistence } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import { getAuth, Auth } from 'firebase/auth';

// ── Canonical Project Configuration ──────────────────────────────────────────
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCwSG5LIzQVRYZZOs076tMcApXNdjE7pK8",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "kkv-finance-4b3bf.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "kkv-finance-4b3bf",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "kkv-finance-4b3bf.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "418809898604",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:418809898604:web:bfa4e6db566192012d1a49",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-C4CQC0E79R"
};

/**
 * Validates required Firebase environment variables at startup
 */
export function validateFirebaseConfig(): { isValid: boolean; missingKeys: string[] } {
  const missingKeys: string[] = [];
  if (!firebaseConfig.apiKey) missingKeys.push('VITE_FIREBASE_API_KEY');
  if (!firebaseConfig.projectId) missingKeys.push('VITE_FIREBASE_PROJECT_ID');
  if (!firebaseConfig.storageBucket) missingKeys.push('VITE_FIREBASE_STORAGE_BUCKET');
  if (!firebaseConfig.appId) missingKeys.push('VITE_FIREBASE_APP_ID');

  if (missingKeys.length > 0) {
    console.error(
      `[Firebase] CRITICAL CONFIGURATION ERROR: Missing required Firebase config keys: ${missingKeys.join(', ')}.\n` +
      `Please ensure these are defined in your .env file or project environment.`
    );
  }

  return {
    isValid: missingKeys.length === 0,
    missingKeys
  };
}

// ── Safe App Initialization (Prevent Duplicate Initialization) ────────────────
let app: FirebaseApp;
let db: Firestore;
let storage: FirebaseStorage;
let auth: Auth;

try {
  validateFirebaseConfig();

  if (getApps().length > 0) {
    app = getApp();
  } else {
    app = initializeApp(firebaseConfig);
  }

  db = getFirestore(app);
  storage = getStorage(app);
  auth = getAuth(app);

  // Enable offline persistence in browser environments where supported
  if (typeof window !== 'undefined') {
    enableIndexedDbPersistence(db).catch((err: any) => {
      if (err.code === 'failed-precondition') {
        // Multiple tabs open, persistence can only be enabled in one tab at a time.
        console.warn('[Firebase] Multiple tabs open; Firestore persistence enabled in primary tab only.');
      } else if (err.code === 'unimplemented') {
        // Browser does not support persistence
        console.warn('[Firebase] Current browser environment does not support IndexedDb persistence.');
      }
    });
  }

  console.log(`[Firebase] Initialized successfully for project: ${firebaseConfig.projectId}`);
} catch (error: any) {
  console.error('[Firebase] Initialization error:', error?.message || error);
  // Fallback instances to prevent hard crashes in offline/degraded environments
  if (getApps().length > 0) {
    app = getApp();
  } else {
    app = initializeApp(firebaseConfig);
  }
  db = getFirestore(app);
  storage = getStorage(app);
  auth = getAuth(app);
}

export { app, db, storage, auth };

export function isFirebaseConfigured(): boolean {
  return Boolean(firebaseConfig.projectId && firebaseConfig.apiKey);
}

export function getFirebaseStatus(): {
  projectId: string;
  storageBucket: string;
  authDomain: string;
  isReady: boolean;
} {
  return {
    projectId: firebaseConfig.projectId,
    storageBucket: firebaseConfig.storageBucket,
    authDomain: firebaseConfig.authDomain,
    isReady: isFirebaseConfigured()
  };
}

export default { app, db, storage, auth, firebaseConfig, isFirebaseConfigured, getFirebaseStatus };
