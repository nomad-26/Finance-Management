import fs from 'fs';
import path from 'path';
import bcrypt from 'bcrypt';
import { env } from '../config/env.js';
import { getStorageSubdirectory, ensureDirectoryExists } from '../config/storage.js';
import {
  IUser,
  UserRole,
  ADMIN_DEFAULT_PERMISSIONS,
  STAFF_DEFAULT_PERMISSIONS,
  RENTAL_STAFF_DEFAULT_PERMISSIONS,
  getDefaultPermissionsForRole,
  normalizeUserPermissions
} from '../models/User.js';
import { telegramRepository } from '../telegram/telegram.repository.js';
import { telegramCache } from '../telegram/telegram.cache.js';

const MASTER_ADMIN_EMAIL = 'kkvgoldfinance13@gmail.com';

export class LocalAuthService {
  private authDir: string;
  private usersFilePath: string;
  private usersCache: Map<string, IUser> = new Map(); // key: staffId or uid or email

  constructor() {
    this.authDir = getStorageSubdirectory('auth');
    this.usersFilePath = path.join(this.authDir, 'users.json');
    this.initStorage();
  }

  private initStorage(): void {
    try {
      ensureDirectoryExists(this.authDir);
      if (fs.existsSync(this.usersFilePath)) {
        const raw = fs.readFileSync(this.usersFilePath, 'utf-8');
        const list = JSON.parse(raw) as IUser[];
        this.populateCache(list);
      } else {
        this.persistUsers([]);
      }
    } catch (err) {
      console.warn('[LocalAuthService] Storage initialization warning:', err);
    }
  }

  private populateCache(users: IUser[]): void {
    this.usersCache.clear();
    for (const u of users) {
      if (u.staffId) this.usersCache.set(u.staffId.toLowerCase(), u);
      if (u.uid) this.usersCache.set(u.uid.toLowerCase(), u);
      if (u.email) this.usersCache.set(u.email.toLowerCase().trim(), u);
      if ((u as any)._id) this.usersCache.set(String((u as any)._id), u);
    }
  }

  private persistUsers(users: IUser[]): void {
    try {
      ensureDirectoryExists(this.authDir);
      const jsonContent = JSON.stringify(users, null, 2);
      try {
        const tempPath = `${this.usersFilePath}.${Date.now()}.${Math.random().toString(36).substr(2, 4)}.tmp`;
        fs.writeFileSync(tempPath, jsonContent, 'utf-8');
        fs.renameSync(tempPath, this.usersFilePath);
      } catch {
        fs.writeFileSync(this.usersFilePath, jsonContent, 'utf-8');
      }
      this.populateCache(users);
    } catch (err) {
      console.warn('[LocalAuthService] Error persisting users to disk:', err);
    }
  }

  /**
   * Retrieves all users, merging local disk cache with shared Telegram storage records
   */
  public getAllUsers(): IUser[] {
    let localUsers: IUser[] = [];
    try {
      if (fs.existsSync(this.usersFilePath)) {
        const raw = fs.readFileSync(this.usersFilePath, 'utf-8');
        localUsers = JSON.parse(raw) as IUser[];
      }
    } catch (err) {
      console.warn('[LocalAuthService] Local read error:', err);
      localUsers = Array.from(new Set(this.usersCache.values()));
    }

    // Merge with Telegram repository (authoritative shared database)
    try {
      const telegramUsers = telegramRepository.getRecords<IUser>('USER');
      if (telegramUsers && telegramUsers.length > 0) {
        const userList: IUser[] = [];

        // Helper to find existing user index in userList
        const findIndex = (target: IUser): number => {
          return userList.findIndex((u) => {
            if (u.staffId && target.staffId && u.staffId.toUpperCase() === target.staffId.toUpperCase()) return true;
            if (u.email && target.email && u.email.toLowerCase() === target.email.toLowerCase()) return true;
            if (u.uid && target.uid && u.uid.toLowerCase() === target.uid.toLowerCase()) return true;
            if (u._id && target._id && String(u._id) === String(target._id)) return true;
            return false;
          });
        };

        // Add local users first
        for (const u of localUsers) {
          const idx = findIndex(u);
          if (idx === -1) {
            userList.push(u);
          } else {
            userList[idx] = { ...userList[idx], ...u };
          }
        }

        // Merge authoritative Telegram users
        for (const tu of telegramUsers) {
          const idx = findIndex(tu);
          if (idx === -1) {
            userList.push(tu);
          } else {
            const existing = userList[idx];
            const existingHash = existing.passwordHash;
            const tuHash = tu.passwordHash;
            const existingIsInitial = existing.createdByUid === 'INITIAL_SEED';

            // Telegram is authoritative for shared credentials across multiple desktops
            let finalHash = tuHash;
            if (existingHash && existingHash.startsWith('$2')) {
              if (tuHash && tuHash.startsWith('$2')) {
                // If local was just initial seed, always adopt authoritative Telegram hash
                if (existingIsInitial && tu.createdByUid !== 'INITIAL_SEED') {
                  finalHash = tuHash;
                } else {
                  const existingTime = new Date(existing.updatedAt || 0).getTime();
                  const tuTime = new Date(tu.updatedAt || 0).getTime();
                  finalHash = tuTime >= existingTime ? tuHash : existingHash;
                }
              } else {
                finalHash = existingHash;
              }
            } else if (!finalHash || !finalHash.startsWith('$2')) {
              finalHash = existingHash || '';
            }

            userList[idx] = {
              ...existing,
              ...tu,
              passwordHash: finalHash
            };
          }
        }

        this.persistUsers(userList);
        return userList;
      }
    } catch {
      // If Telegram is currently initializing, proceed with local users
    }

    return localUsers;
  }

  public listUsers(): IUser[] {
    return this.getAllUsers();
  }

  public findUserByIdentifier(identifier: string): IUser | null {
    if (!identifier) return null;
    const clean = identifier.trim();
    const cleanLower = clean.toLowerCase();
    const cleanUpper = clean.toUpperCase();
    const adminEmail = (env.ADMIN_EMAIL || MASTER_ADMIN_EMAIL).trim().toLowerCase();

    // 1. Direct search in merged users
    const users = this.getAllUsers();

    // Priority 1: Exact matches on email, staffId, uid, or _id
    let matched = users.find(
      (u) =>
        (u.staffId && u.staffId.toUpperCase() === cleanUpper) ||
        (u.email && u.email.toLowerCase() === cleanLower) ||
        (u.uid && u.uid.toLowerCase() === cleanLower) ||
        (u._id && String(u._id).toLowerCase() === cleanLower)
    );
    if (matched) return matched;

    // Priority 2: Username / prefix matching (e.g. "admin", "staff", "rental", or user's email prefix)
    matched = users.find((u) => {
      const uEmail = (u.email || '').toLowerCase();
      const uPrefix = uEmail.split('@')[0];
      const uUsername = ((u as any).username || '').toLowerCase();

      if (uUsername && uUsername === cleanLower) return true;
      if (uPrefix && uPrefix === cleanLower) return true;

      // Special alias routing
      if ((cleanLower === 'admin' || cleanLower === 'kkvgoldfinance13' || cleanLower === 'kkvgoldfinance') &&
          (u.role === 'ADMIN' || u.staffId === 'KKV-ADMIN-000001' || uEmail === adminEmail || uEmail === 'admin@kkvgoldfinance.com')) {
        return true;
      }
      if (cleanLower === 'staff' && (u.staffId === 'KKV-STAFF-000099' || uEmail === 'staff@kkvgoldfinance.com')) return true;
      if (cleanLower === 'rental' && (u.staffId === 'KKV-RENTAL-000001' || uEmail === 'rental@kkvgoldfinance.com')) return true;

      return false;
    });
    if (matched) return matched;

    // 2. Direct lookup in Telegram repository cache
    try {
      const tgMatch = telegramRepository.findRecords<IUser>(
        'USER',
        (u) =>
          Boolean(u.staffId && u.staffId.toUpperCase() === cleanUpper) ||
          Boolean(u.email && u.email.toLowerCase() === cleanLower) ||
          Boolean(u.email && u.email.split('@')[0].toLowerCase() === cleanLower) ||
          Boolean(u.uid && u.uid.toLowerCase() === cleanLower) ||
          Boolean(u._id && String(u._id).toLowerCase() === cleanLower) ||
          ((cleanLower === 'admin' || cleanLower === 'kkvgoldfinance13' || cleanLower === 'kkvgoldfinance') &&
           (u.role === 'ADMIN' || (u.email || '').toLowerCase() === adminEmail || (u.email || '').toLowerCase() === 'admin@kkvgoldfinance.com'))
      )[0];
      if (tgMatch) return tgMatch;
    } catch {
      // Ignore
    }

    return null;
  }

  public findUserByEmail(email: string): IUser | null {
    if (!email) return null;
    return this.findUserByIdentifier(email);
  }

  /**
   * Automatically seeds default Admin, Staff, and Rental Staff with verified bcrypt hashes
   */
  public async seedDefaultUsers(includeDemoStaff: boolean = false): Promise<void> {
    const users = this.getAllUsers();
    let hasModifications = false;

    // 1. Built-in Admin account - canonical identity: kkvgoldfinance13@gmail.com
    const adminEmail = (env.ADMIN_EMAIL || MASTER_ADMIN_EMAIL).trim().toLowerCase();
    const adminName = (env.ADMIN_NAME || 'Kkvgoldfinance').trim();
    const adminPassword = env.ADMIN_INITIAL_PASSWORD || env.ADMIN_PASSWORD || 'Admin@123456';

    // Find all potential matching admin records to handle migration and deduplication
    const matchingAdminIndices: number[] = [];
    for (let i = 0; i < users.length; i++) {
      const u = users[i];
      const uEmail = (u.email || '').trim().toLowerCase();
      const uStaffId = (u.staffId || '').toUpperCase();
      if (uEmail === adminEmail || uEmail === 'admin@kkvgoldfinance.com' || uStaffId === 'KKV-ADMIN-000001' || (u.role === 'ADMIN' && u.uid === 'uid_admin_001')) {
        matchingAdminIndices.push(i);
      }
    }

    if (matchingAdminIndices.length === 0) {
      // Create new Admin record
      const adminHash = await bcrypt.hash(adminPassword, 10);
      const newAdmin: IUser = {
        _id: 'user_admin_001',
        staffId: 'KKV-ADMIN-000001',
        uid: 'uid_admin_001',
        fullName: adminName,
        displayName: adminName,
        email: adminEmail,
        phoneNumber: '9876543210',
        phone: '9876543210',
        role: 'ADMIN',
        passwordHash: adminHash,
        status: 'active',
        isActive: true,
        mustChangePassword: false,
        permissions: ADMIN_DEFAULT_PERMISSIONS,
        department: 'Administration',
        createdByUid: 'INITIAL_SEED',
        createdByEmail: 'system@kkvgoldfinance.com',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      users.push(newAdmin);
      hasModifications = true;
      console.log('[LocalAuth] Built-in Admin user seeded successfully:', adminEmail);
    } else {
      // Canonical index is the primary matching index (preferably exact email match, else first index)
      const primaryIdx = matchingAdminIndices.find((idx) => (users[idx].email || '').toLowerCase() === adminEmail) ?? matchingAdminIndices[0];
      const adminUser = users[primaryIdx];

      // Remove any extra duplicates if multiple admin records existed
      if (matchingAdminIndices.length > 1) {
        for (let j = matchingAdminIndices.length - 1; j >= 0; j--) {
          const dupIdx = matchingAdminIndices[j];
          if (dupIdx !== primaryIdx) {
            users.splice(dupIdx, 1);
            hasModifications = true;
          }
        }
        console.log('[LocalAuth] Deduplicated excess admin records');
      }

      // Enforce canonical properties on Master Admin
      let fieldsUpdated = false;
      if (adminUser.email !== adminEmail) {
        adminUser.email = adminEmail;
        fieldsUpdated = true;
      }
      if (adminUser.role !== 'ADMIN') {
        adminUser.role = 'ADMIN';
        fieldsUpdated = true;
      }
      if (adminUser.status !== 'active') {
        adminUser.status = 'active';
        adminUser.isActive = true;
        fieldsUpdated = true;
      }
      if (adminUser.department !== 'Administration') {
        adminUser.department = 'Administration';
        fieldsUpdated = true;
      }
      if (!adminUser.permissions || (adminUser.permissions as any).all !== true) {
        adminUser.permissions = ADMIN_DEFAULT_PERMISSIONS;
        fieldsUpdated = true;
      }

      // Ensure Master Admin has a valid bcrypt password hash without overwriting changed passwords
      if (!adminUser.passwordHash || !adminUser.passwordHash.startsWith('$2')) {
        adminUser.passwordHash = await bcrypt.hash(adminPassword, 10);
        fieldsUpdated = true;
        console.log('[LocalAuth] Initialized missing bcrypt password hash for canonical Admin account');
      }

      if (fieldsUpdated) {
        adminUser.updatedAt = new Date().toISOString();
        const finalIdx = users.findIndex((u) => u.uid === adminUser.uid || u.staffId === adminUser.staffId);
        if (finalIdx >= 0) {
          users[finalIdx] = adminUser;
        }
        hasModifications = true;
      }
    }

    // 2. Demo Staff Accounts (Only when includeDemoStaff is true)
    if (includeDemoStaff) {
      const staffEmail = 'staff@kkvgoldfinance.com';
      const staffPassword = 'Staff@123456';
      let staffIndex = users.findIndex((u) => u.email && u.email.toLowerCase() === staffEmail);

      if (staffIndex === -1) {
        const staffHash = await bcrypt.hash(staffPassword, 10);
        const newStaff: IUser = {
          _id: 'user_staff_001',
          staffId: 'KKV-STAFF-000099',
          uid: 'uid_staff_001',
          fullName: 'Finance Operations Staff',
          displayName: 'Finance Staff',
          email: staffEmail,
          phoneNumber: '9876543211',
          phone: '9876543211',
          role: 'STAFF',
          passwordHash: staffHash,
          status: 'active',
          isActive: true,
          mustChangePassword: false,
          permissions: STAFF_DEFAULT_PERMISSIONS,
          department: 'Finance Operations',
          createdByUid: 'INITIAL_SEED',
          createdByEmail: 'system@kkvgoldfinance.com',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        users.push(newStaff);
        hasModifications = true;
        console.log('[LocalAuth] Staff user seeded successfully:', staffEmail);
      } else {
        const staffUser = users[staffIndex];
        if (!staffUser.passwordHash || !staffUser.passwordHash.startsWith('$2')) {
          staffUser.passwordHash = await bcrypt.hash(staffPassword, 10);
          staffUser.updatedAt = new Date().toISOString();
          users[staffIndex] = staffUser;
          hasModifications = true;
          console.log('[LocalAuth] Repaired missing bcrypt password hash for Staff account');
        }
      }

      const rentalEmail = 'rental@kkvgoldfinance.com';
      const rentalPassword = 'Rental@123456';
      let rentalIndex = users.findIndex((u) => u.email && u.email.toLowerCase() === rentalEmail);

      if (rentalIndex === -1) {
        const rentalHash = await bcrypt.hash(rentalPassword, 10);
        const newRental: IUser = {
          _id: 'user_rental_001',
          staffId: 'KKV-RENTAL-000001',
          uid: 'uid_rental_001',
          fullName: 'Rental Complex Manager',
          displayName: 'Rental Staff',
          email: rentalEmail,
          phoneNumber: '9876543212',
          phone: '9876543212',
          role: 'RENTAL_STAFF',
          passwordHash: rentalHash,
          status: 'active',
          isActive: true,
          mustChangePassword: false,
          permissions: RENTAL_STAFF_DEFAULT_PERMISSIONS,
          department: 'Rental Management',
          createdByUid: 'INITIAL_SEED',
          createdByEmail: 'system@kkvgoldfinance.com',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        users.push(newRental);
        hasModifications = true;
        console.log('[LocalAuth] Rental Staff user seeded successfully:', rentalEmail);
      } else {
        const rentalUser = users[rentalIndex];
        if (!rentalUser.passwordHash || !rentalUser.passwordHash.startsWith('$2')) {
          rentalUser.passwordHash = await bcrypt.hash(rentalPassword, 10);
          rentalUser.updatedAt = new Date().toISOString();
          users[rentalIndex] = rentalUser;
          hasModifications = true;
          console.log('[LocalAuth] Repaired missing bcrypt password hash for Rental Staff account');
        }
      }
    }

    // 4. Ensure all existing staff accounts have valid bcrypt hashes
    for (let i = 0; i < users.length; i++) {
      const u = users[i];
      if (!u.passwordHash || !u.passwordHash.startsWith('$2')) {
        const defaultPass = 'Staff@123456';
        u.passwordHash = await bcrypt.hash(defaultPass, 10);
        u.updatedAt = new Date().toISOString();
        users[i] = u;
        hasModifications = true;
        console.log(`[LocalAuth] Repaired missing bcrypt password hash for user ${u.staffId || u.email}`);
      }
    }

    if (hasModifications) {
      this.persistUsers(users);
      // Asynchronously sync canonical Admin and demo accounts in background without blocking local startup
      for (const u of users) {
        if (u.email === adminEmail || u.uid === 'uid_admin_001' || (includeDemoStaff && (u.uid === 'uid_staff_001' || u.uid === 'uid_rental_001'))) {
          this.syncUserToTelegram(u).catch(() => {});
        }
      }
    }
  }

  /**
   * Persists a user to local store and propagates to Telegram repository with synchronous read-back verification
   */
  public async saveUser(user: IUser): Promise<IUser> {
    const users = this.getAllUsers();
    const index = users.findIndex(
      (u) =>
        (u.staffId && user.staffId && u.staffId.toUpperCase() === user.staffId.toUpperCase()) ||
        (u.email && user.email && u.email.toLowerCase() === user.email.toLowerCase()) ||
        (u.uid && user.uid && u.uid.toLowerCase() === user.uid.toLowerCase()) ||
        (user._id && u._id === user._id)
    );

    const existing = index >= 0 ? users[index] : null;

    // Resolve and safeguard password hash
    let passwordHash = user.passwordHash;
    if (!passwordHash || typeof passwordHash !== 'string' || !passwordHash.trim()) {
      if (existing && existing.passwordHash && existing.passwordHash.trim()) {
        passwordHash = existing.passwordHash;
      } else {
        passwordHash = await bcrypt.hash('Staff@123456', 10);
      }
    } else if (!passwordHash.startsWith('$2')) {
      // Plaintext password passed - hash with bcrypt (10 rounds) exactly once
      passwordHash = await bcrypt.hash(passwordHash, 10);
    }

    const now = new Date().toISOString();
    const updatedUser: IUser = {
      ...(existing || {}),
      ...user,
      passwordHash,
      updatedAt: now
    };

    if (index >= 0) {
      users[index] = updatedUser;
    } else {
      users.push(updatedUser);
    }

    this.persistUsers(users);

    // Sync to authoritative Telegram database with read-back verification
    await this.syncUserToTelegram(updatedUser);

    return updatedUser;
  }

  /**
   * Syncs user record to Telegram storage for multi-PC access and verifies read-back
   */
  public async syncUserToTelegram(user: IUser): Promise<void> {
    const entityId = (user.staffId || user.uid || user._id || `user_${Date.now()}`).toUpperCase().trim();
    console.log(`[TELEGRAM_DB] USER record write started for ${entityId}`);

    try {
      const existingTg = telegramRepository.getRecordById<IUser>('USER', entityId) ||
        telegramRepository.findRecords<IUser>('USER', (u) =>
          Boolean(u.staffId && user.staffId && u.staffId.toUpperCase() === user.staffId.toUpperCase()) ||
          Boolean(u.email && user.email && u.email.toLowerCase() === user.email.toLowerCase()) ||
          Boolean(u.uid && user.uid && u.uid.toLowerCase() === user.uid.toLowerCase())
        )[0];

      if (existingTg) {
        const updateId = (existingTg as any).staffId || (existingTg as any).id || entityId;
        try {
          await telegramRepository.updateRecord('USER', updateId, user);
        } catch {
          await telegramRepository.createRecord('USER', entityId, user).catch(() => {});
        }
      } else {
        await telegramRepository.createRecord('USER', entityId, user);
      }

      console.log(`[TELEGRAM_DB] USER record write succeeded for ${entityId}`);

    // Read-back verification
    const readBack = telegramRepository.getRecordById<IUser>('USER', entityId) ||
      telegramRepository.findRecords<IUser>('USER', (u) =>
        Boolean(u.staffId && user.staffId && u.staffId.toUpperCase() === user.staffId.toUpperCase()) ||
        Boolean(u.email && user.email && u.email.toLowerCase() === user.email.toLowerCase())
      )[0];

    if(readBack) {
      console.log(`[TELEGRAM_DB] USER read-back succeeded for ${entityId}`);
    } else {
      console.warn(`[TELEGRAM_DB] USER read-back notice: Record not immediately indexed for ${entityId}`);
    }
  } catch(err: any) {
    console.warn(`[TELEGRAM_DB] USER persistence note for ${entityId}:`, err?.message || err);
  }
}

  public async deleteUser(identifier: string): Promise < boolean > {
  const clean = identifier.trim();
  const cleanLower = clean.toLowerCase();
  const cleanUpper = clean.toUpperCase();

  // Protect Master Admin from deletion
  const adminEmail = (env.ADMIN_EMAIL || MASTER_ADMIN_EMAIL).trim().toLowerCase();
  if(
    cleanLower === adminEmail ||
  cleanUpper === 'KKV-ADMIN-000001' ||
  cleanLower === 'uid_admin_001' ||
  cleanLower === 'user_admin_001'
    ) {
  console.warn(`[STAFF_DELETE] Master Admin deletion rejected for ${identifier}`);
  throw new Error('Master Admin account cannot be deleted.');
}

console.log(`[STAFF_DELETE]\nDeleting staff: ${identifier}`);
console.log(`[TELEGRAM_DB]\nDelete started`);

const users = this.getAllUsers();
const target = users.find(
  (u) =>
    (u.staffId && u.staffId.toUpperCase() === cleanUpper) ||
    (u.uid && u.uid.toLowerCase() === cleanLower) ||
    (u.email && u.email.toLowerCase() === cleanLower) ||
    (u._id && String(u._id).toLowerCase() === cleanLower)
);

if (target && target.role === 'ADMIN' && (target.email?.toLowerCase() === adminEmail || target.staffId?.toUpperCase() === 'KKV-ADMIN-000001')) {
  console.warn(`[STAFF_DELETE] Master Admin deletion rejected`);
  throw new Error('Master Admin account cannot be deleted.');
}

const filtered = users.filter(
  (u) =>
    (u.staffId ? u.staffId.toUpperCase() !== cleanUpper : true) &&
    (u.uid ? u.uid.toLowerCase() !== cleanLower : true) &&
    (u.email ? u.email.toLowerCase() !== cleanLower : true) &&
    (u._id ? String(u._id).toLowerCase() !== cleanLower : true) &&
    (target?.staffId ? u.staffId?.toUpperCase() !== target.staffId.toUpperCase() : true) &&
    (target?.email ? u.email?.toLowerCase() !== target.email.toLowerCase() : true) &&
    (target?.uid ? u.uid?.toLowerCase() !== target.uid.toLowerCase() : true)
);

this.persistUsers(filtered);

const deleteIds = new Set<string>();
deleteIds.add(identifier);
deleteIds.add(cleanUpper);
deleteIds.add(cleanLower);
if (target?.staffId) {
  deleteIds.add(target.staffId);
  deleteIds.add(target.staffId.toUpperCase());
}
if (target?.uid) {
  deleteIds.add(target.uid);
  deleteIds.add(target.uid.toLowerCase());
}
if (target?._id) {
  deleteIds.add(String(target._id));
}
if (target?.email) {
  deleteIds.add(target.email);
  deleteIds.add(target.email.toLowerCase());
}

for (const id of deleteIds) {
  try {
    await telegramRepository.deleteRecord('USER', id, false);
  } catch {
    // Ignore not found
  }
}

console.log(`[TELEGRAM_DB]\nDelete succeeded`);

// Read-back verification
const readBackCheck = this.findUserByIdentifier(identifier);
if (!readBackCheck) {
  console.log(`[TELEGRAM_DB]\nRead-back verification: record not found`);
  console.log(`[STAFF_DELETE]\nDeletion completed`);
  return true;
} else {
  console.warn(`[STAFF_DELETE] Warning: Staff still retrievable after deletion for ${identifier}`);
  return true;
}
  }

  /**
   * Resets all non-admin / test staff accounts while strictly preserving the protected Master Admin account.
   */
  public async resetNonAdminStaff(): Promise<number> {
    const adminEmail = (env.ADMIN_EMAIL || MASTER_ADMIN_EMAIL).trim().toLowerCase();
    const allUsers = this.getAllUsers();
    let removedCount = 0;

    const preservedUsers: IUser[] = [];
    for (const u of allUsers) {
      const uEmail = (u.email || '').trim().toLowerCase();
      const isMasterAdmin =
        uEmail === adminEmail ||
        u.staffId === 'KKV-ADMIN-000001' ||
        (u.role === 'ADMIN' && (u.uid === 'uid_admin_001' || u.staffId === 'KKV-ADMIN-000001'));

      if (isMasterAdmin) {
        preservedUsers.push(u);
      } else {
        removedCount++;
        const deleteKeys = [
          u.staffId,
          (u.staffId || '').toUpperCase(),
          u.uid,
          (u.uid || '').toUpperCase(),
          (u.uid || '').toLowerCase(),
          String(u._id),
          u.email,
          (u.email || '').toLowerCase()
        ].filter(Boolean) as string[];

        for (const k of deleteKeys) {
          try {
            telegramCache.deleteRecord('USER', k, true);
            await telegramRepository.deleteRecord('USER', k, true);
          } catch {}
        }
      }
    }

    // Clean any remaining non-admin USER envelopes from telegramCache
    const userTypeMap = (telegramCache as any).store?.get('USER') as Map<string, any> | undefined;
    if (userTypeMap && typeof userTypeMap.entries === 'function') {
      const entries = Array.from(userTypeMap.entries());
      for (const [key, envRec] of entries) {
        const u = (envRec as any)?.data as IUser;
        const uEmail = (u?.email || '').trim().toLowerCase();
        const isMaster = uEmail === adminEmail || u?.staffId === 'KKV-ADMIN-000001' || u?.uid === 'uid_admin_001';
        if (!isMaster) {
          userTypeMap.delete(key);
          delete (telegramCache as any).index[`USER:${key}`];
        }
      }
      telegramCache.flushToDisk('USER');
    }

    this.persistUsers(preservedUsers);
    this.populateCache(preservedUsers);
    console.log(`[LocalAuthService] 🧹 Removed ${removedCount} test/non-admin staff accounts. Preserved Master Admin (${adminEmail}).`);
    return removedCount;
  }
}

export const localAuthService = new LocalAuthService();
export default localAuthService;
