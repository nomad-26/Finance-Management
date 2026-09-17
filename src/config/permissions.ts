import { UserPermissions, UserRole } from '../types';

export const MASTER_ADMIN_EMAIL = 'kkvgoldfinance13@gmail.com';

export const isMasterAdminEmail = (email?: string | null): boolean => {
  if (!email) return false;
  const clean = email.toLowerCase().trim();
  return clean === 'kkvgoldfinance13@gmail.com' || clean === 'admin@kkvgoldfinance.com';
};

export const ADMIN_DEFAULT_PERMISSIONS: UserPermissions = {
  dashboard: { view: true },
  customers: { view: true, create: true, update: true, delete: true },
  loans: { view: true, create: true, update: true, delete: true, approve: true },
  receipts: { view: true, create: true, update: true, delete: true },
  fd: { view: true, create: true, update: true, delete: true },
  accounting: { view: true, create: true, update: true, delete: true },
  rental: { view: true, create: true, update: true, delete: true, approve: true },
  reports: { view: true, export: true },
  staffManagement: { view: true, create: true, update: true, delete: true },
  settings: { view: true, update: true },
  backupRestore: { view: true, create: true, restore: true, delete: true },
  viewKyc: true
};

export const STAFF_DEFAULT_PERMISSIONS: UserPermissions = {
  dashboard: { view: true },
  customers: { view: true, create: true, update: true, delete: false },
  loans: { view: true, create: true, update: true, delete: false, approve: true },
  receipts: { view: true, create: true, update: false, delete: false },
  fd: { view: true, create: true, update: true, delete: false },
  accounting: { view: true, create: true, update: true, delete: false },
  rental: { view: false, create: false, update: false, delete: false, approve: false },
  reports: { view: true, export: true },
  staffManagement: { view: false, create: false, update: false, delete: false },
  settings: { view: false, update: false },
  backupRestore: { view: false, create: false, restore: false, delete: false },
  viewKyc: false
};

export const RENTAL_STAFF_DEFAULT_PERMISSIONS: UserPermissions = {
  dashboard: { view: true },
  customers: { view: false, create: false, update: false, delete: false },
  loans: { view: false, create: false, update: false, delete: false, approve: false },
  receipts: { view: false, create: false, update: false, delete: false },
  fd: { view: false, create: false, update: false, delete: false },
  accounting: { view: false, create: false, update: false, delete: false },
  rental: { view: true, create: true, update: true, delete: false, approve: true },
  reports: { view: true, export: true },
  staffManagement: { view: false, create: false, update: false, delete: false },
  settings: { view: false, update: false },
  backupRestore: { view: false, create: false, restore: false, delete: false },
  viewKyc: false
};

/**
 * Standard default permissions matrix based on RBAC roles.
 */
export const getDefaultPermissionsForRole = (role?: UserRole | string | null): UserPermissions => {
  const normRole = (role || '').toUpperCase();
  if (normRole === 'ADMIN' || normRole === 'MASTER_ADMIN') {
    return JSON.parse(JSON.stringify(ADMIN_DEFAULT_PERMISSIONS));
  }
  if (normRole === 'RENTAL_STAFF') {
    return JSON.parse(JSON.stringify(RENTAL_STAFF_DEFAULT_PERMISSIONS));
  }
  return JSON.parse(JSON.stringify(STAFF_DEFAULT_PERMISSIONS));
};

/**
 * Normalizes role string to canonical 'ADMIN' | 'STAFF' | 'RENTAL_STAFF'.
 */
export const normalizeRole = (role?: string | null): UserRole => {
  if (!role) return 'STAFF';
  const r = role.toUpperCase();
  if (r === 'ADMIN' || r === 'MASTER_ADMIN') return 'ADMIN';
  if (r === 'RENTAL_STAFF') return 'RENTAL_STAFF';
  return 'STAFF';
};

export const isAdminRole = (role?: string | null): boolean => {
  return normalizeRole(role) === 'ADMIN';
};

export const isStaffRole = (role?: string | null): boolean => {
  return normalizeRole(role) === 'STAFF';
};

export const isRentalStaffRole = (role?: string | null): boolean => {
  return normalizeRole(role) === 'RENTAL_STAFF';
};

/**
 * Normalizes user permissions object, supporting both module-action trees and legacy boolean flags.
 */
export const normalizePermissions = (rawPermissions: any, role: string): UserPermissions => {
  const baseDefaults = getDefaultPermissionsForRole(role);
  if (!rawPermissions || typeof rawPermissions !== 'object') {
    return baseDefaults;
  }

  if (rawPermissions.customers && typeof rawPermissions.customers === 'object') {
    return {
      dashboard: { ...baseDefaults.dashboard, ...(rawPermissions.dashboard || {}) },
      customers: { ...baseDefaults.customers, ...(rawPermissions.customers || {}) },
      loans: { ...baseDefaults.loans, ...(rawPermissions.loans || {}) },
      receipts: { ...baseDefaults.receipts, ...(rawPermissions.receipts || {}) },
      fd: { ...baseDefaults.fd, ...(rawPermissions.fd || {}) },
      accounting: { ...baseDefaults.accounting, ...(rawPermissions.accounting || {}) },
      rental: { ...baseDefaults.rental, ...(rawPermissions.rental || {}) },
      reports: { ...baseDefaults.reports, ...(rawPermissions.reports || {}) },
      staffManagement: { ...baseDefaults.staffManagement, ...(rawPermissions.staffManagement || {}) },
      settings: { ...baseDefaults.settings, ...(rawPermissions.settings || {}) },
      backupRestore: { ...baseDefaults.backupRestore, ...(rawPermissions.backupRestore || {}) }
    };
  }

  // Legacy flat boolean mappings
  const merged: UserPermissions = JSON.parse(JSON.stringify(baseDefaults));
  if (typeof rawPermissions.customers === 'boolean') {
    merged.customers = { view: rawPermissions.customers, create: rawPermissions.customers, update: rawPermissions.customers, delete: false };
  }
  if (typeof rawPermissions.loans === 'boolean') {
    merged.loans = { view: rawPermissions.loans, create: rawPermissions.loans, update: rawPermissions.loans, delete: false, approve: true };
  }
  if (typeof rawPermissions.loanReceipts === 'boolean') {
    merged.receipts = { view: rawPermissions.loanReceipts, create: rawPermissions.loanReceipts, update: false, delete: false };
  }
  if (typeof rawPermissions.fixedDeposits === 'boolean') {
    merged.fd = { view: rawPermissions.fixedDeposits, create: rawPermissions.fixedDeposits, update: rawPermissions.fixedDeposits, delete: false };
  }
  if (typeof rawPermissions.rental === 'boolean' || typeof rawPermissions.rentalManagement === 'boolean') {
    const rVal = Boolean(rawPermissions.rental ?? rawPermissions.rentalManagement);
    merged.rental = { view: rVal, create: rVal, update: rVal, delete: false, approve: rVal };
  }
  return merged;
};

/**
 * Checks whether user has permission for a specific module and action.
 */
export const hasPermission = (
  permissions: UserPermissions | undefined | null,
  module: string,
  action: string = 'view',
  role?: string | null
): boolean => {
  if (isAdminRole(role)) return true;
  if (!permissions) return false;

  const perms = permissions as any;
  if (perms[module] && typeof perms[module] === 'object') {
    return Boolean(perms[module][action]);
  }
  if (typeof perms[module] === 'boolean') {
    return perms[module];
  }
  return false;
};
