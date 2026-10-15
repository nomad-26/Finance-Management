import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { getStorageBaseDir, getConfigDirectory } from './storage.js';

// Multi-path .env resolution
const currentDir = typeof __dirname !== 'undefined' ? __dirname : process.cwd();

// 1. Fallback base env paths (packaged resources or dev repo root)
const baseEnvPaths = [
  path.resolve(currentDir, '.env'),
  path.resolve(currentDir, '../.env'),
  path.resolve(currentDir, '../../.env'),
  path.resolve(currentDir, '../backend/.env'),
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), 'backend/.env')
];

for (const envPath of baseEnvPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: false });
  }
}

// 2. Persistent UserData / AppData configuration (PRIORITY - overrides defaults)
try {
  const configDir = getConfigDirectory();
  if (configDir) {
    const persistentEnvPath = path.join(configDir, '.env');
    if (fs.existsSync(persistentEnvPath)) {
      dotenv.config({ path: persistentEnvPath, override: true });
    }
  }
} catch (err: any) {
  // Silent fallback if filesystem access fails
}

function normalizePrivateKey(rawKey: string | undefined): string {
  if (!rawKey) return '';
  let key = rawKey.trim();
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1);
  }
  return key.replace(/\\n/g, '\n').trim();
}

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '8080', 10),
  CORS_ORIGIN: process.env.CORS_ALLOWED_ORIGINS || process.env.CORS_ORIGIN || '',
  JWT_SECRET: process.env.JWT_SECRET || 'kkv_gold_finance_rbac_secure_jwt_secret_2026_super_key_512',
  JWT_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN || process.env.JWT_EXPIRES_IN || '24h',
  ADMIN_NAME: (process.env.ADMIN_NAME || 'Kkvgoldfinance').trim(),
  ADMIN_EMAIL: (process.env.ADMIN_EMAIL || 'kkvgoldfinance13@gmail.com').trim().toLowerCase(),
  ADMIN_PASSWORD: process.env.ADMIN_INITIAL_PASSWORD || process.env.ADMIN_PASSWORD || 'Admin@123456',
  ADMIN_INITIAL_PASSWORD: process.env.ADMIN_INITIAL_PASSWORD || process.env.ADMIN_PASSWORD || 'Admin@123456',
  ADMIN_CONFIG_PASSWORD: (process.env.ADMIN_CONFIG_PASSWORD || 'admin123').trim(),
  LOCAL_STORAGE_PATH: process.env.LOCAL_STORAGE_PATH && !process.env.LOCAL_STORAGE_PATH.startsWith('./')
    ? path.resolve(process.env.LOCAL_STORAGE_PATH)
    : path.join(getStorageBaseDir(), 'uploads'),
  
  // Primary Database: Cloud Firestore Configuration (Project: kkv-finance-4b3bf)
  FIREBASE_PROJECT_ID: (process.env.FIREBASE_PROJECT_ID || 'kkv-finance-4b3bf').trim(),
  FIREBASE_STORAGE_BUCKET: (process.env.FIREBASE_STORAGE_BUCKET || 'kkv-finance-4b3bf.firebasestorage.app').trim(),
  FIREBASE_API_KEY: (process.env.FIREBASE_API_KEY || 'AIzaSyCwSG5LIzQVRYZZOs076tMcApXNdjE7pK8').trim(),
  FIREBASE_AUTH_DOMAIN: (process.env.FIREBASE_AUTH_DOMAIN || 'kkv-finance-4b3bf.firebaseapp.com').trim(),

  // Google Service / Drive optional attachments
  GOOGLE_CLOUD_PROJECT_ID: (process.env.GOOGLE_CLOUD_PROJECT_ID || process.env.GOOGLE_PROJECT_ID || 'kkv-gold-507605').trim(),
  GOOGLE_SERVICE_ACCOUNT_EMAIL: (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || process.env.GOOGLE_CLIENT_EMAIL || '').trim(),
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: normalizePrivateKey(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || process.env.GOOGLE_PRIVATE_KEY),
  GOOGLE_DRIVE_ROOT_FOLDER_ID: (process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || process.env.GOOGLE_DRIVE_FOLDER_ID || '').trim(),

  // Google User OAuth Credentials (Required for Personal My Drive File Uploads with Quota)
  GOOGLE_CLIENT_ID: (process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID || '').trim(),
  GOOGLE_CLIENT_SECRET: (process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_OAUTH_CLIENT_SECRET || '').trim(),
  GOOGLE_REFRESH_TOKEN: (process.env.GOOGLE_REFRESH_TOKEN || process.env.GOOGLE_OAUTH_REFRESH_TOKEN || process.env.GOOGLE_DRIVE_REFRESH_TOKEN || '').trim(),
  GOOGLE_REDIRECT_URI: (process.env.GOOGLE_REDIRECT_URI || process.env.GOOGLE_OAUTH_REDIRECT_URI || 'https://developers.google.com/oauthplayground').trim(),
};

export function validateStartupConfig(): { isValid: boolean; missingVars: string[] } {
  const missingVars: string[] = [];
  if (!env.FIREBASE_PROJECT_ID) missingVars.push('FIREBASE_PROJECT_ID');

  return {
    isValid: missingVars.length === 0,
    missingVars
  };
}

export default env;
