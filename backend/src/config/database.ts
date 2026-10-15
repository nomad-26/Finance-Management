import { firestoreRepository } from '../repositories/firestore.repository.js';
import { firebaseConfig } from './firebase.js';

/**
 * Initializes Cloud Firestore database connectivity and sync.
 * Primary Database: Cloud Firestore (Project: kkv-finance-4b3bf)
 */
export async function connectDB(): Promise<boolean> {
  console.log(`[Storage] Initializing Cloud Firestore primary database layer (Project: ${firebaseConfig.projectId})...`);
  
  // Non-blocking initialization & sync
  firestoreRepository.initialize().catch((err: any) => {
    console.warn('[Storage] Firestore background sync notice (local cache active):', err?.message || err);
  });

  return true;
}

export function isFirestoreReady(): boolean {
  return firestoreRepository.checkConnection();
}


export function isStorageConnected(): boolean {
  return firestoreRepository.checkConnection();
}

export async function ensureStorageConnected(): Promise<boolean> {
  return firestoreRepository.checkConnection();
}

export async function checkStorageHealth(): Promise<{
  status: 'ok' | 'degraded';
  success: boolean;
  storage: 'firestore';
  firestore: 'connected' | 'disconnected';
  projectId: string;
  ready: boolean;
  error?: string;
}> {
  const ready = firestoreRepository.checkConnection();
  return {
    status: ready ? 'ok' : 'degraded',
    success: ready,
    storage: 'firestore',
    firestore: ready ? 'connected' : 'disconnected',
    projectId: firebaseConfig.projectId,
    ready
  };
}

export default {
  connectDB,
  isFirestoreReady,
  isStorageConnected,
  ensureStorageConnected,
  checkStorageHealth
};
