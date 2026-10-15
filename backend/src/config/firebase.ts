/**
 * Firebase Initialization for KKV Gold Finance Backend
 * Primary Database: Cloud Firestore (Project: kkv-finance-4b3bf)
 */
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';

export const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || 'AIzaSyCwSG5LIzQVRYZZOs076tMcApXNdjE7pK8',
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || 'kkv-finance-4b3bf.firebaseapp.com',
  projectId: process.env.FIREBASE_PROJECT_ID || 'kkv-finance-4b3bf',
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'kkv-finance-4b3bf.firebasestorage.app',
  messagingSenderId: '418809898604',
  appId: '1:418809898604:web:bfa4e6db566192012d1a49',
  measurementId: 'G-C4CQC0E79R'
};

let app: FirebaseApp;
let db: Firestore;

try {
  if (getApps().length > 0) {
    app = getApp();
  } else {
    app = initializeApp(firebaseConfig);
  }
  db = getFirestore(app);
  console.log(`[Firebase Backend] Initialized successfully for project: ${firebaseConfig.projectId}`);
} catch (err: any) {
  console.error('[Firebase Backend] Initialization warning:', err?.message || err);
  if (getApps().length > 0) {
    app = getApp();
  } else {
    app = initializeApp(firebaseConfig);
  }
  db = getFirestore(app);
}

export { app, db };
