import path from 'path';
import fs from 'fs';

/**
 * Detects if the current execution environment is a serverless runtime (Vercel / AWS Lambda)
 */
export const isServerless: boolean = Boolean(
  process.env.VERCEL ||
  process.env.AWS_LAMBDA_FUNCTION_NAME ||
  process.env.LAMBDA_TASK_ROOT ||
  process.env.VERCEL_ENV
);

export function getStorageBaseDir(): string {
  // 1. Explicit override from environment (set by Electron BackendManager or server config)
  if (process.env.KKV_DATA_PATH && process.env.KKV_DATA_PATH.trim()) {
    return path.resolve(process.env.KKV_DATA_PATH.trim());
  }

  // 2. Serverless environment (Vercel / Lambda)
  if (isServerless) {
    return path.join('/tmp', 'KKV_GOLD_FINANCE');
  }

  // 3. Desktop / Windows environment: Use user AppData to guarantee write permissions
  if (process.env.APPDATA) {
    return path.join(process.env.APPDATA, 'kkv-gold-finance', 'data');
  }

  // 4. Linux / macOS user home directory
  if (process.env.HOME) {
    return path.join(process.env.HOME, '.kkv-gold-finance', 'data');
  }

  // 5. Fallback for standalone development
  return path.resolve(process.cwd(), 'data');
}

/**
 * Returns the path for configuration/state files
 */
export function getConfigDirectory(): string {
  // 1. Explicit override from environment (set by Electron BackendManager)
  if (process.env.KKV_CONFIG_PATH && process.env.KKV_CONFIG_PATH.trim()) {
    return path.resolve(process.env.KKV_CONFIG_PATH.trim());
  }

  // 2. Serverless environment (Vercel / Lambda)
  if (isServerless) {
    return path.join('/tmp', 'KKV_GOLD_FINANCE', 'config');
  }

  // 3. Desktop / Windows environment: User AppData guarantees write permissions
  if (process.env.APPDATA) {
    return path.join(process.env.APPDATA, 'kkv-gold-finance', 'config');
  }

  // 4. Linux / macOS user home directory
  if (process.env.HOME) {
    return path.join(process.env.HOME, '.kkv-gold-finance', 'config');
  }

  return path.join(getStorageBaseDir(), 'config');
}

/**
 * Returns the path for backup files
 */
export function getBackupsDirectory(): string {
  return path.join(getStorageBaseDir(), 'backups');
}

/**
 * Returns a specific subfolder path under the storage base directory
 */
export function getStorageSubdirectory(subFolder: string): string {
  return path.join(getStorageBaseDir(), subFolder);
}

/**
 * Safely ensures a directory exists without throwing fatal errors during module evaluation
 */
export function ensureDirectoryExists(dirPath: string): boolean {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    return true;
  } catch (err) {
    console.warn(`[StorageConfig] Warning: Unable to create directory ${dirPath}:`, (err as any)?.message || err);
    return false;
  }
}
