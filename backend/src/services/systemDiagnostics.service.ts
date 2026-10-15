import os from 'os';
import fs from 'fs';
import path from 'path';

export interface SystemDiagnostics {
  platform: string;
  osRelease: string;
  osType: string;
  arch: string;
  hostname: string;
  cpuCount: number;
  cpuModel: string;
  totalMemoryBytes: number;
  freeMemoryBytes: number;
  totalMemoryFormatted: string;
  freeMemoryFormatted: string;
  nodeVersion: string;
  uptimeSeconds: number;
  userDataPath: string;
  diskSpace?: {
    freeBytes?: number;
    totalBytes?: number;
    formatted?: string;
  };
  checks: {
    osCompatible: boolean;
    arch64Bit: boolean;
    ramSufficient: boolean; // >= 3.5GB
    storageWritable: boolean;
  };
}

export class SystemDiagnosticsService {
  private static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }

  public static getDiagnostics(): SystemDiagnostics {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const cpus = os.cpus();
    const arch = os.arch();
    const platform = process.platform;
    const release = os.release();

    const userDataPath = process.env.KKV_DATA_PATH || path.join(process.env.APPDATA || os.homedir(), 'KKV Gold Finance', 'data');
    let storageWritable = false;
    try {
      if (!fs.existsSync(userDataPath)) {
        fs.mkdirSync(userDataPath, { recursive: true });
      }
      const testFile = path.join(userDataPath, `.write_test_${Date.now()}`);
      fs.writeFileSync(testFile, 'ok', 'utf-8');
      fs.unlinkSync(testFile);
      storageWritable = true;
    } catch {
      storageWritable = false;
    }

    const osCompatible = platform === 'win32' || platform === 'darwin' || platform === 'linux';
    const arch64Bit = arch === 'x64' || arch === 'arm64';
    const ramSufficient = totalMem >= 3.5 * 1024 * 1024 * 1024; // at least ~4GB

    return {
      platform,
      osRelease: release,
      osType: os.type(),
      arch,
      hostname: os.hostname(),
      cpuCount: cpus.length,
      cpuModel: cpus[0]?.model || 'Generic Processor',
      totalMemoryBytes: totalMem,
      freeMemoryBytes: freeMem,
      totalMemoryFormatted: this.formatBytes(totalMem),
      freeMemoryFormatted: this.formatBytes(freeMem),
      nodeVersion: process.version,
      uptimeSeconds: Math.floor(os.uptime()),
      userDataPath,
      checks: {
        osCompatible,
        arch64Bit,
        ramSufficient,
        storageWritable
      }
    };
  }
}
