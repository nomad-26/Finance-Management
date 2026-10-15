/**
 * Primary Database Repository: Cloud Firestore + Resilient Local Cache
 * Project: kkv-finance-4b3bf
 * 
 * Primary persistent database repository using Cloud Firestore.
 * Provides high-speed local caching and reliable asynchronous Firestore synchronization.
 */
import fs from 'fs';
import path from 'path';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch
} from 'firebase/firestore';
import { db, unifiedFirestore, isUsingAdminSdk } from '../config/firebase.js';
import {
  EntityType,
  AppRecordEnvelope,
  RepositoryQueryOptions,
  APP_RECORD_MARKER
} from './entity.types.js';
import { getStorageSubdirectory, ensureDirectoryExists, getStorageBaseDir, isServerless } from '../config/storage.js';

// Map internal EntityType to Firestore Collection names
export const ENTITY_COLLECTION_MAP: Record<EntityType, string> = {
  CUSTOMER: 'customers',
  LOAN: 'loans',
  RECEIPT: 'receipts',
  DAYBOOK: 'daybook',
  FIXED_DEPOSIT: 'fixed_deposits',
  FD_CUSTOMER: 'fd_customers',
  FD_INTEREST_PAYOUT: 'fd_interest_payouts',
  FD_WITHDRAWAL: 'fd_withdrawals',
  FD_RENEWAL: 'fd_renewals',
  FILE_ATTACHMENT: 'file_attachments',
  RENTAL_COMPLEX: 'rental_complexes',
  RENTAL_SHOP: 'rental_shops',
  RENTAL_PAYMENT: 'rental_payments',
  RENTAL_EXPENSE: 'rental_expenses',
  RENTAL_AUDIT: 'rental_audit',
  RENTAL_DAYBOOK: 'rental_daybook',
  USER: 'users',
  SETTINGS: 'settings',
  AUDIT: 'audit_logs',
  COUNTER: 'counters'
};

export class FirestoreRepository {
  private cacheDir: string;
  private dataDir: string;
  private store: Map<EntityType, Map<string, AppRecordEnvelope>> = new Map();
  private isInitialized = false;

  constructor() {
    this.cacheDir = getStorageSubdirectory('firestore');
    this.dataDir = path.join(this.cacheDir, 'entities');
    this.initDirs();
    this.loadFromDisk();
  }

  private initDirs(): void {
    try {
      ensureDirectoryExists(this.cacheDir);
      ensureDirectoryExists(this.dataDir);
    } catch (err: any) {
      console.warn('[FirestoreRepository] Directory init warning:', err?.message || err);
    }
  }

  /**
   * Loads cached records from local disk. If firestore cache is empty, migrates
   * from existing local data store to preserve all prior records seamlessly.
   */
  public loadFromDisk(): void {
    try {
      this.initDirs();

      let loadedCount = 0;
      if (fs.existsSync(this.dataDir)) {
        const files = fs.readdirSync(this.dataDir);
        for (const file of files) {
          if (!file.endsWith('.json')) continue;
          const entityType = file.replace('.json', '') as EntityType;
          const filePath = path.join(this.dataDir, file);
          const raw = fs.readFileSync(filePath, 'utf-8');
          const records = JSON.parse(raw) as AppRecordEnvelope[];

          const typeMap = new Map<string, AppRecordEnvelope>();
          for (const rec of records) {
            typeMap.set(rec.id, rec);
            loadedCount++;
          }
          this.store.set(entityType, typeMap);
        }
      }

      // If local firestore cache is empty, inspect existing data directories
      if (loadedCount === 0) {
        this.migrateExistingLocalFiles();
      }

      this.isInitialized = true;
    } catch (err: any) {
      console.warn('[FirestoreRepository] Cache load notice:', err?.message || err);
      this.store.clear();
      this.isInitialized = true;
    }
  }

  /**
   * One-time automatic discovery and migration of existing local records into Firestore cache
   */
  private migrateExistingLocalFiles(): void {
    try {
      // Possible legacy paths to inspect
      const legacyPaths = [
        path.join(getStorageBaseDir(), 'entities'),
        path.join(getStorageSubdirectory('cache'), 'entities')
      ];

      for (const legacyPath of legacyPaths) {
        if (fs.existsSync(legacyPath)) {
          const files = fs.readdirSync(legacyPath);
          for (const file of files) {
            if (!file.endsWith('.json')) continue;
            const entityType = file.replace('.json', '') as EntityType;
            if (!ENTITY_COLLECTION_MAP[entityType]) continue;

            const filePath = path.join(legacyPath, file);
            const raw = fs.readFileSync(filePath, 'utf-8');
            const records = JSON.parse(raw) as AppRecordEnvelope[];

            if (!this.store.has(entityType)) {
              this.store.set(entityType, new Map());
            }
            const map = this.store.get(entityType)!;
            for (const rec of records) {
              map.set(rec.id, rec);
            }
            console.log(`[FirestoreRepository] 📦 Discovered & imported ${records.length} legacy ${entityType} records.`);
          }
          this.flushToDisk();
          break;
        }
      }
    } catch (err: any) {
      console.warn('[FirestoreRepository] Legacy migration notice:', err?.message || err);
    }
  }

  /**
   * Writes in-memory store to disk
   */
  public flushToDisk(targetType?: EntityType): void {
    try {
      this.initDirs();
      const typesToFlush = targetType ? [targetType] : Array.from(this.store.keys());
      for (const type of typesToFlush) {
        const typeMap = this.store.get(type);
        const records = typeMap ? Array.from(typeMap.values()) : [];
        const filePath = path.join(this.dataDir, `${type}.json`);
        const tempPath = `${filePath}.${Date.now()}.tmp`;
        fs.writeFileSync(tempPath, JSON.stringify(records, null, 2), 'utf-8');
        fs.renameSync(tempPath, filePath);
      }
    } catch (err: any) {
      console.warn('[FirestoreRepository] Disk flush warning:', err?.message || err);
    }
  }

  /**
   * Asynchronously syncs local cache with remote Cloud Firestore
   */
  public async syncWithFirestore(): Promise<void> {
    console.log('[FirestoreRepository] 🔄 Synchronizing with Cloud Firestore (kkv-finance-4b3bf)...');
    try {
      const entityTypes = Object.keys(ENTITY_COLLECTION_MAP) as EntityType[];

      for (const type of entityTypes) {
        const collectionName = ENTITY_COLLECTION_MAP[type];
        try {
          const docs = await unifiedFirestore.getDocs(collectionName);

          if (!this.store.has(type)) {
            this.store.set(type, new Map());
          }
          const map = this.store.get(type)!;

          for (const docSnap of docs) {
            const data = docSnap.data();
            const id = docSnap.id;
            const existing = map.get(id);

            // Construct envelope from Firestore document
            const envelope: AppRecordEnvelope = {
              app: 'KKV_GOLD_FINANCE',
              marker: APP_RECORD_MARKER,
              type,
              id,
              version: data._version || (existing ? existing.version : 1),
              createdAt: data.createdAt || existing?.createdAt || new Date().toISOString(),
              updatedAt: data.updatedAt || new Date().toISOString(),
              isDeleted: Boolean(data.isDeleted),
              deletedAt: data.deletedAt || null,
              deletedBy: data.deletedBy || null,
              data: data as any
            };

            map.set(id, envelope);
          }
        } catch (colErr: any) {
          // If a specific collection is empty or rules pending, continue
        }
      }

      this.flushToDisk();
      console.log('[FirestoreRepository] ✅ Cloud Firestore synchronization complete.');
    } catch (err: any) {
      console.warn('[FirestoreRepository] Firestore sync notice (serving from local cache):', err?.message || err);
    }
  }

  /**
   * Creates a new record in Cloud Firestore and updates local cache
   */
  public async createRecord<T = any>(
    type: EntityType,
    id: string,
    data: T,
    actor?: { uid?: string; email?: string; role?: string }
  ): Promise<AppRecordEnvelope<T>> {
    if (!this.store.has(type)) {
      this.store.set(type, new Map());
    }
    const map = this.store.get(type)!;
    const existing = map.get(id);

    if (existing && !existing.isDeleted) {
      const err: any = new Error(`Record with ID ${id} already exists for entity ${type}.`);
      err.statusCode = 409;
      err.code = 'DUPLICATE_RECORD';
      throw err;
    }

    const version = existing ? existing.version + 1 : 1;
    const now = new Date().toISOString();

    const envelope: AppRecordEnvelope<T> = {
      app: 'KKV_GOLD_FINANCE',
      marker: APP_RECORD_MARKER,
      type,
      id,
      version,
      createdAt: (data as any)?.createdAt || now,
      updatedAt: now,
      isDeleted: false,
      deletedAt: null,
      deletedBy: null,
      actor,
      data
    };

    // Update in-memory & disk cache
    map.set(id, envelope);
    this.flushToDisk(type);

    // Persist to Cloud Firestore
    const collectionName = ENTITY_COLLECTION_MAP[type];
    if (collectionName) {
      try {
        const payload: any = {
          ...(data as any),
          _version: version,
          createdAt: envelope.createdAt,
          updatedAt: envelope.updatedAt,
          isDeleted: false
        };

        // Guarantee canonical fields required by Firestore rules & querying
        if (type === 'LOAN') {
          payload.loanId = payload.loanId || payload.id || payload.loanNo || id;
          payload.principalAmount = Number(payload.principalAmount ?? payload.principal ?? 0);
          payload.customerId = payload.customerId || payload.custId || '';
        } else if (type === 'CUSTOMER') {
          payload.customerId = payload.customerId || payload.id || id;
          payload.name = payload.name || payload.fullName || '';
          payload.phone = payload.phone || payload.phoneNumber || '';
        }

        await unifiedFirestore.setDoc(collectionName, id, payload, { merge: true });
      } catch (err: any) {
        const isPermDenied = err?.code === 'permission-denied' || err?.message?.includes('PERMISSION_DENIED');
        if (isPermDenied) {
          console.warn(`[FirestoreRepository] Firestore PERMISSION_DENIED for ${type}:${id}. To enable write access in production, configure FIREBASE_SERVICE_ACCOUNT in environment variables.`);
        } else {
          console.warn(`[FirestoreRepository] Firestore persist notice for ${type}:${id}:`, err?.message || err);
        }

        // On serverless runtimes (Vercel) or when strict mode is requested, fail loudly instead of returning false success
        if (isServerless || process.env.STRICT_FIRESTORE === 'true') {
          const persistenceErr: any = new Error(
            isPermDenied
              ? `Firestore write permission denied for ${collectionName}/${id}. Please configure FIREBASE_SERVICE_ACCOUNT in Vercel environment variables.`
              : `Firestore persistence error for ${collectionName}/${id}: ${err?.message || err}`
          );
          persistenceErr.code = isPermDenied ? 'FIRESTORE_PERMISSION_DENIED' : 'FIRESTORE_WRITE_FAILED';
          persistenceErr.statusCode = isPermDenied ? 403 : 500;
          throw persistenceErr;
        }
      }
    }

    return envelope;
  }

  /**
   * Retrieves a single record by entity type and ID
   */
  public getRecordById<T = any>(
    type: EntityType,
    id: string,
    includeDeleted: boolean = false
  ): AppRecordEnvelope<T> | null {
    if (!id) return null;
    const map = this.store.get(type);
    if (!map) return null;

    const record = map.get(id);
    if (!record) return null;
    if (record.isDeleted && !includeDeleted) return null;

    return record as AppRecordEnvelope<T>;
  }

  /**
   * Retrieves all records for an entity type
   */
  public getRecords<T = any>(
    type: EntityType,
    options: RepositoryQueryOptions<T> = {}
  ): T[] {
    const map = this.store.get(type);
    if (!map) return [];

    let envelopes = Array.from(map.values());
    if (!options.includeDeleted) {
      envelopes = envelopes.filter((e) => !e.isDeleted);
    }

    let items = envelopes.map((env) => ({
      envelope: env,
      data: {
        ...(env.data || {}),
        isDeleted: Boolean(env.isDeleted),
        deletedAt: env.deletedAt,
        deletedBy: env.deletedBy
      } as T
    }));

    if (options.filter) {
      items = items.filter((i) => options.filter!(i.data, i.envelope));
    }

    if (options.sort) {
      items.sort((a, b) => options.sort!(a.data, b.data));
    }

    if (typeof options.skip === 'number' && options.skip > 0) {
      items = items.slice(options.skip);
    }

    if (typeof options.limit === 'number' && options.limit > 0) {
      items = items.slice(0, options.limit);
    }

    return items.map((i) => i.data);
  }

  /**
   * Retrieves full envelopes with metadata
   */
  public getRecordEnvelopes<T = any>(
    type: EntityType,
    options: RepositoryQueryOptions<T> = {}
  ): AppRecordEnvelope<T>[] {
    const map = this.store.get(type);
    if (!map) return [];

    let envelopes = Array.from(map.values()) as AppRecordEnvelope<T>[];
    if (!options.includeDeleted) {
      envelopes = envelopes.filter((e) => !e.isDeleted);
    }

    if (options.filter) {
      envelopes = envelopes.filter((env) => options.filter!(env.data, env));
    }

    if (options.sort) {
      envelopes.sort((a, b) => options.sort!(a.data, b.data));
    }

    if (typeof options.skip === 'number' && options.skip > 0) {
      envelopes = envelopes.slice(options.skip);
    }

    if (typeof options.limit === 'number' && options.limit > 0) {
      envelopes = envelopes.slice(0, options.limit);
    }

    return envelopes;
  }

  /**
   * Finds records matching a custom predicate
   */
  public findRecords<T = any>(
    type: EntityType,
    predicate: (item: T, envelope: AppRecordEnvelope<T>) => boolean,
    includeDeleted: boolean = false
  ): T[] {
    const map = this.store.get(type);
    if (!map) return [];

    const envelopes = Array.from(map.values()) as AppRecordEnvelope<T>[];
    return envelopes
      .filter((env) => (includeDeleted || !env.isDeleted) && predicate(env.data, env))
      .map((env) => env.data);
  }

  /**
   * Counts records of a given entity type
   */
  public countRecords(
    type: EntityType,
    filter?: (item: any) => boolean,
    includeDeleted: boolean = false
  ): number {
    const map = this.store.get(type);
    if (!map) return 0;

    let envelopes = Array.from(map.values());
    if (!includeDeleted) {
      envelopes = envelopes.filter((e) => !e.isDeleted);
    }
    if (!filter) return envelopes.length;
    return envelopes.filter((env) => filter(env.data)).length;
  }

  /**
   * Updates an existing record with optimistic concurrency protection
   */
  public async updateRecord<T = any>(
    type: EntityType,
    id: string,
    data: Partial<T> | T,
    options: {
      expectedVersion?: number;
      actor?: { uid?: string; email?: string; role?: string };
    } = {}
  ): Promise<AppRecordEnvelope<T>> {
    const map = this.store.get(type);
    const existing = map ? map.get(id) : null;

    if (!existing) {
      const err: any = new Error(`Record with ID "${id}" of type "${type}" not found.`);
      err.statusCode = 404;
      err.code = 'NOT_FOUND';
      throw err;
    }

    if (typeof options.expectedVersion === 'number' && existing.version !== options.expectedVersion) {
      const err: any = new Error(
        `Concurrency Conflict: Record was modified by another user (current version: ${existing.version}, expected: ${options.expectedVersion}).`
      );
      err.statusCode = 409;
      err.code = 'CONCURRENCY_CONFLICT';
      throw err;
    }

    const updatedData: T = {
      ...(existing.data || {}),
      ...(data as any)
    };

    const nextVersion = existing.version + 1;
    const now = new Date().toISOString();

    const isDeleted = (data as any)?.isDeleted !== undefined
      ? Boolean((data as any).isDeleted)
      : Boolean(existing.isDeleted);
    const deletedAt = (data as any)?.deletedAt !== undefined
      ? (data as any).deletedAt
      : (existing.deletedAt ?? null);
    const deletedBy = (data as any)?.deletedBy !== undefined
      ? (data as any).deletedBy
      : (existing.deletedBy ?? null);

    const envelope: AppRecordEnvelope<T> = {
      app: 'KKV_GOLD_FINANCE',
      marker: APP_RECORD_MARKER,
      type,
      id,
      version: nextVersion,
      createdAt: existing.createdAt,
      updatedAt: now,
      isDeleted,
      deletedAt,
      deletedBy,
      actor: options.actor,
      data: updatedData
    };

    map!.set(id, envelope);
    this.flushToDisk(type);

    // Persist to Cloud Firestore
    const collectionName = ENTITY_COLLECTION_MAP[type];
    if (collectionName) {
      try {
        await unifiedFirestore.setDoc(collectionName, id, {
          ...(updatedData as any),
          _version: nextVersion,
          updatedAt: now,
          isDeleted,
          deletedAt,
          deletedBy
        }, { merge: true });
      } catch (err: any) {
        if (err?.code === 'permission-denied' || err?.message?.includes('PERMISSION_DENIED')) {
          console.warn(`[FirestoreRepository] Firestore PERMISSION_DENIED on update for ${type}:${id}. Serving update from local/memory cache.`);
        } else {
          console.warn(`[FirestoreRepository] Firestore update notice for ${type}:${id}:`, err?.message || err);
        }
      }
    }

    return envelope;
  }

  /**
   * Deletes a record (soft-delete by default, or permanent delete)
   */
  public async deleteRecord(
    type: EntityType,
    id: string,
    hardDelete: boolean = false,
    actor?: { uid?: string; email?: string; role?: string }
  ): Promise<{ success: boolean; message: string }> {
    const map = this.store.get(type);
    const existing = map ? map.get(id) : null;

    if (!existing) {
      if (hardDelete && map) {
        map.delete(id);
        this.flushToDisk(type);
      }
      return { success: true, message: `Record ${id} processed` };
    }

    const collectionName = ENTITY_COLLECTION_MAP[type];

    if (hardDelete) {
      if (map) {
        map.delete(id);
        this.flushToDisk(type);
      }

      if (collectionName) {
        try {
          await unifiedFirestore.deleteDoc(collectionName, id);
        } catch (err: any) {
          console.warn(`[FirestoreRepository] Firestore delete notice for ${type}:${id}:`, err?.message || err);
        }
      }

      return { success: true, message: `Record ${id} permanently deleted` };
    }

    // Soft delete
    const nextVersion = existing.version + 1;
    const now = new Date().toISOString();

    const envelope: AppRecordEnvelope = {
      ...existing,
      version: nextVersion,
      updatedAt: now,
      isDeleted: true,
      deletedAt: now,
      deletedBy: actor?.role || actor?.email || 'SYSTEM',
      actor
    };

    map!.set(id, envelope);
    this.flushToDisk(type);

    if (collectionName) {
      try {
        await unifiedFirestore.setDoc(collectionName, id, {
          isDeleted: true,
          deletedAt: now,
          deletedBy: envelope.deletedBy,
          updatedAt: now,
          _version: nextVersion
        }, { merge: true });
      } catch (err: any) {
        console.warn(`[FirestoreRepository] Firestore soft delete notice for ${type}:${id}:`, err?.message || err);
      }
    }

    return { success: true, message: `Record ${id} soft-deleted successfully` };
  }

  /**
   * Restores a soft-deleted record
   */
  public async restoreRecord<T = any>(
    type: EntityType,
    id: string,
    actor?: { uid?: string; email?: string; role?: string }
  ): Promise<AppRecordEnvelope<T> | null> {
    const map = this.store.get(type);
    const existing = map ? map.get(id) : null;
    if (!existing || !existing.isDeleted) return null;

    const nextVersion = existing.version + 1;
    const now = new Date().toISOString();

    const envelope: AppRecordEnvelope<T> = {
      ...existing,
      version: nextVersion,
      updatedAt: now,
      isDeleted: false,
      deletedAt: null,
      deletedBy: null,
      actor
    };

    map!.set(id, envelope);
    this.flushToDisk(type);

    const collectionName = ENTITY_COLLECTION_MAP[type];
    if (collectionName) {
      try {
        await unifiedFirestore.setDoc(collectionName, id, {
          isDeleted: false,
          deletedAt: null,
          deletedBy: null,
          updatedAt: now,
          _version: nextVersion
        }, { merge: true });
      } catch (err: any) {
        console.warn(`[FirestoreRepository] Firestore restore notice for ${type}:${id}:`, err?.message || err);
      }
    }

    return envelope;
  }

  /**
   * Safe Reset: Clears application records
   */
  public async resetApplicationData(entityTypes?: EntityType[]): Promise<{ cleared: number; success: boolean }> {
    let clearedCount = 0;
    const typesToReset: EntityType[] = entityTypes || [
      'CUSTOMER',
      'LOAN',
      'RECEIPT',
      'DAYBOOK',
      'FIXED_DEPOSIT',
      'FD_CUSTOMER',
      'FD_INTEREST_PAYOUT',
      'FD_WITHDRAWAL',
      'FD_RENEWAL',
      'FILE_ATTACHMENT',
      'RENTAL_COMPLEX',
      'RENTAL_SHOP',
      'RENTAL_PAYMENT',
      'RENTAL_EXPENSE',
      'RENTAL_AUDIT',
      'RENTAL_DAYBOOK',
      'AUDIT'
    ];

    for (const type of typesToReset) {
      const map = this.store.get(type);
      if (map) {
        clearedCount += map.size;
        map.clear();
        this.flushToDisk(type);
      }

      const collectionName = ENTITY_COLLECTION_MAP[type];
      if (collectionName) {
        try {
          const docs = await unifiedFirestore.getDocs(collectionName);
          for (const d of docs) {
            await unifiedFirestore.deleteDoc(collectionName, d.id);
          }
        } catch (err: any) {
          console.warn(`[FirestoreRepository] Reset notice for ${collectionName}:`, err?.message || err);
        }
      }
    }

    return { cleared: clearedCount, success: true };
  }

  public checkConnection(): boolean {
    return Boolean(db && this.isInitialized);
  }

  public async initialize(): Promise<void> {
    await this.syncWithFirestore();
  }
}

export const firestoreRepository = new FirestoreRepository();

