import dns from 'dns';
import { env } from '../config/env.js';
import { firestoreRepository } from '../repositories/firestore.repository.js';
import { EntityType } from '../repositories/entity.types.js';
import { firebaseConfig } from '../config/firebase.js';
import { getStorageBaseDir } from '../config/storage.js';

export async function checkInternetConnectivity(timeoutMs: number = 2000): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    dns.lookup('dns.google', (err) => {
      clearTimeout(timer);
      resolve(!err);
    });
  });
}

export class ConfigCenterService {
  private static instance: ConfigCenterService;

  private constructor() {}

  public static getInstance(): ConfigCenterService {
    if (!ConfigCenterService.instance) {
      ConfigCenterService.instance = new ConfigCenterService();
    }
    return ConfigCenterService.instance;
  }

  /**
   * Retrieves unified configuration and storage status for the Data Safety Center.
   * Credentials (tokens, secrets) are strictly excluded.
   */
  public async getStatus(isUnlocked: boolean) {
    const isConnected = firestoreRepository.checkConnection();
    const isOnline = await checkInternetConnectivity(2000);

    const entityTypes: EntityType[] = [
      'CUSTOMER',
      'LOAN',
      'RECEIPT',
      'DAYBOOK',
      'FIXED_DEPOSIT',
      'FD_CUSTOMER',
      'FD_INTEREST_PAYOUT',
      'FD_WITHDRAWAL',
      'FD_RENEWAL',
      'RENTAL_COMPLEX',
      'RENTAL_SHOP',
      'RENTAL_PAYMENT',
      'RENTAL_EXPENSE',
      'RENTAL_DAYBOOK',
      'USER',
      'SETTINGS',
      'AUDIT',
      'COUNTER'
    ];

    let totalRecords = 0;
    try {
      for (const et of entityTypes) {
        totalRecords += firestoreRepository.getRecords(et, { includeDeleted: false }).length;
      }
    } catch {
      totalRecords = 0;
    }

    return {
      isUnlocked,
      internetAvailable: isOnline,
      storage: {
        status: 'Active',
        type: 'Cloud Firestore Primary Database',
        location: firebaseConfig.projectId,
        totalRecords,
        isHealthy: isConnected
      },
      firestore: {
        configured: Boolean(firebaseConfig.projectId),
        connected: isConnected,
        projectId: firebaseConfig.projectId,
        status: isConnected ? 'Connected' : 'Offline'
      }
    };
  }
}

export const configCenterService = ConfigCenterService.getInstance();
export default configCenterService;
