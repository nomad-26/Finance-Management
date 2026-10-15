import { Request, Response } from 'express';
import { firestoreRepository } from '../repositories/firestore.repository.js';
import { firebaseConfig } from '../config/firebase.js';

/**
 * Local Backend Process Health Check
 * Primary Database: Cloud Firestore (Project: kkv-finance-4b3bf)
 */
export const getHealth = (_req: Request, res: Response) => {
  const isConnected = firestoreRepository.checkConnection();

  const responsePayload = {
    status: 'ok',
    service: 'kkv-gold-finance-backend',
    backend: 'running',
    storage: 'firestore',
    firestore: isConnected ? 'connected' : 'degraded',
    projectId: firebaseConfig.projectId,
    ready: true,
    timestamp: new Date().toISOString()
  };

  return res.status(200).json(responsePayload);
};

/**
 * Detailed Cloud Firestore database health status
 */
export const getFirestoreHealth = async (_req: Request, res: Response) => {
  const isConnected = firestoreRepository.checkConnection();

  return res.status(200).json({
    service: 'firestore',
    status: isConnected ? 'ready' : 'degraded',
    connected: isConnected,
    projectId: firebaseConfig.projectId,
    storageBucket: firebaseConfig.storageBucket,
    timestamp: new Date().toISOString()
  });
};


/**
 * Application Readiness Check
 */
export const getReadiness = (_req: Request, res: Response) => {
  const isConnected = firestoreRepository.checkConnection();
  return res.status(200).json({
    backend: 'ready',
    firestore: isConnected ? 'ready' : 'degraded',
    projectId: firebaseConfig.projectId
  });
};

export default getHealth;
