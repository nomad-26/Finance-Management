import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import net from 'net';
import { app } from 'electron';

export class BackendManager {
  private backendProcess: ChildProcess | null = null;
  private port: number = 8080;
  private readonly host: string = '127.0.0.1';
  private isShuttingDown: boolean = false;
  private recentLogs: string[] = [];

  public getApiBaseUrl(): string {
    return `http://${this.host}:${this.port}/api`;
  }

  public getHealthUrl(checkPort?: number): string {
    return `http://${this.host}:${checkPort || this.port}/health`;
  }

  public getApiHealthUrl(checkPort?: number): string {
    return `http://${this.host}:${checkPort || this.port}/api/health`;
  }

  /**
   * Probes if a given port is available to bind
   */
  private async isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.unref();
      server.on('error', () => resolve(false));
      server.listen({ port, host: this.host }, () => {
        server.close(() => resolve(true));
      });
    });
  }

  /**
   * Resolves the best port to use:
   * 1. If KKV backend is already running on port, reuse it
   * 2. If port is free, use it
   * 3. If port is occupied by non-KKV app, search next available port (8081..8090)
   */
  private async resolvePort(startPort: number = 8080): Promise<number> {
    const isKKVRunning = await this.checkHealth(1000, startPort);
    if (isKKVRunning) {
      return startPort;
    }

    const isFree = await this.isPortAvailable(startPort);
    if (isFree) {
      return startPort;
    }

    for (let p = startPort + 1; p <= startPort + 10; p++) {
      const isCandidateKKV = await this.checkHealth(500, p);
      if (isCandidateKKV) return p;
      if (await this.isPortAvailable(p)) return p;
    }

    return startPort;
  }

  /**
   * Simple helper to parse .env file key=value lines
   */
  private parseDotEnv(filePath: string): Record<string, string> {
    const result: Record<string, string> = {};
    if (!fs.existsSync(filePath)) return result;

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          result[key] = val;
        }
      }
    } catch (err: any) {
      console.warn(`[BackendManager] Notice reading .env from ${filePath}:`, err?.message || err);
    }
    return result;
  }

  /**
   * Starts the local backend process and waits for the health endpoint to become ready.
   */
  public async start(): Promise<void> {
    const isPackaged = app.isPackaged;
    const isDev = !isPackaged;

    const userDataDir = app.getPath('userData');
    const logDir = path.join(userDataDir, 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    const logFilePath = path.join(logDir, 'backend.log');
    const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

    const log = (msg: string) => {
      const line = `[${new Date().toISOString()}] [BackendManager] ${msg}\n`;
      console.log(line.trim());
      logStream.write(line);
      this.recentLogs.push(line.trim());
      if (this.recentLogs.length > 50) this.recentLogs.shift();
    };

    log(`[DESKTOP] Packaged: ${isPackaged}`);
    log(`[DESKTOP] UserData path: ${userDataDir}`);

    // Resolve port safely to avoid collisions on other computers
    this.port = await this.resolvePort(8080);
    log(`[DESKTOP] Using port: ${this.port}`);

    // Check if KKV backend is already running on this port (e.g. dev server or prior instance)
    const alreadyRunning = await this.checkHealth(1200, this.port);
    if (alreadyRunning) {
      log(`Backend is already running and responsive on port ${this.port}.`);
      log('[BACKEND] READY');
      return;
    }

    const appPath = app.getAppPath();
    const resourcesPath = process.resourcesPath || appPath;

    let backendCwd: string;
    let command: string;
    let args: string[];

    // Ensure complete user-writable persistent runtime directory structure
    const kkvDataDir = path.join(userDataDir, 'data');
    const kkvBackupsDir = path.join(userDataDir, 'backups');
    const kkvAttachmentsDir = path.join(userDataDir, 'attachments');
    const kkvConfigDir = path.join(userDataDir, 'config');
    const kkvTempDir = path.join(userDataDir, 'temp');

    for (const d of [kkvDataDir, kkvBackupsDir, logDir, kkvAttachmentsDir, kkvConfigDir, kkvTempDir]) {
      if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
    }

    // Base environment
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PORT: String(this.port),
      HOST: this.host,
      NODE_ENV: isDev ? 'development' : 'production',
      KKV_DATA_PATH: kkvDataDir,
      KKV_BACKUPS_PATH: kkvBackupsDir,
      KKV_LOGS_PATH: logDir,
      KKV_CONFIG_PATH: kkvConfigDir,
      KKV_ATTACHMENTS_PATH: kkvAttachmentsDir,
      KKV_TEMP_PATH: kkvTempDir,
      LOCAL_STORAGE_PATH: kkvAttachmentsDir,
      APPDATA: process.env.APPDATA || app.getPath('appData')
    };

    if (isDev) {
      // In development, spawn tsx in the backend directory
      backendCwd = path.join(appPath, 'backend');
      const isWin = process.platform === 'win32';
      command = isWin ? 'cmd.exe' : 'npx';
      args = isWin ? ['/c', 'npx', 'tsx', 'src/server.ts'] : ['tsx', 'src/server.ts'];

      // Load development .env
      const devEnv = this.parseDotEnv(path.join(backendCwd, '.env'));
      Object.assign(env, devEnv);
    } else {
      // In production packaged mode, locate backend dist/server.js
      const candidateServerPaths = [
        path.join(resourcesPath, 'backend', 'dist', 'server.js'),
        path.join(resourcesPath, 'app', 'backend', 'dist', 'server.js'),
        path.join(resourcesPath, 'app.asar.unpacked', 'backend', 'dist', 'server.js'),
        path.join(appPath, 'backend', 'dist', 'server.js')
      ];

      const serverJsPath = candidateServerPaths.find((p) => fs.existsSync(p));

      if (!serverJsPath) {
        const searched = candidateServerPaths.join('\n  - ');
        const errMsg = `[BACKEND] Fatal: server.js not found in candidate paths:\n  - ${searched}`;
        log(errMsg);
        throw new Error(errMsg);
      }

      log(`[BACKEND] Resolved executable: ${serverJsPath}`);
      log(`[BACKEND] Exists: true`);

      backendCwd = path.resolve(path.dirname(serverJsPath), '..');

      // Candidate paths for bundled production .env
      const prodEnvCandidatePaths = [
        path.join(backendCwd, '.env'),
        path.join(resourcesPath, 'backend', '.env'),
        path.join(resourcesPath, '.env'),
        path.join(appPath, 'backend', '.env')
      ];

      // 1. Load base configuration from bundled candidate
      let bundledEnvFound: string | null = null;
      for (const envFile of prodEnvCandidatePaths) {
        if (fs.existsSync(envFile)) {
          bundledEnvFound = envFile;
          log(`[BACKEND] Loading base config from ${envFile}`);
          const parsed = this.parseDotEnv(envFile);
          Object.assign(env, parsed);
          break;
        }
      }

      // 2. Persistent user-writable configuration file in AppData (isolated from updates)
      const persistentEnvFile = path.join(kkvConfigDir, '.env');
      if (!fs.existsSync(persistentEnvFile) && bundledEnvFound) {
        try {
          fs.copyFileSync(bundledEnvFound, persistentEnvFile);
          log(`[BACKEND] Seeded persistent config file to ${persistentEnvFile}`);
        } catch (copyErr: any) {
          log(`[BACKEND] Notice: Unable to seed persistent config file: ${copyErr?.message || copyErr}`);
        }
      }

      // 3. Load persistent user configuration (highest priority for credentials)
      if (fs.existsSync(persistentEnvFile)) {
        log(`[BACKEND] Loading user persistent credentials from ${persistentEnvFile}`);
        const userConfig = this.parseDotEnv(persistentEnvFile);
        Object.assign(env, userConfig);
      }

      // Re-apply runtime overrides to ensure safe directory and port resolution
      env.PORT = String(this.port);
      env.HOST = this.host;
      env.NODE_ENV = 'production';
      env.KKV_DATA_PATH = kkvDataDir;
      env.KKV_CONFIG_PATH = kkvConfigDir;
      env.LOCAL_STORAGE_PATH = kkvAttachmentsDir;
      env.ELECTRON_RUN_AS_NODE = '1';

      command = process.execPath;
      args = [serverJsPath];
    }

    log(`[BACKEND] Starting backend process: command="${command}" cwd="${backendCwd}" port=${this.port}`);

    try {
      this.backendProcess = spawn(command, args, {
        cwd: backendCwd,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
      });

      this.backendProcess.stdout?.on('data', (data: Buffer) => {
        const text = data.toString();
        logStream.write(text);
        const lines = text.trim().split('\n');
        for (const l of lines) {
          if (l.trim()) {
            this.recentLogs.push(`[stdout] ${l.trim()}`);
            if (this.recentLogs.length > 50) this.recentLogs.shift();
          }
        }
      });

      this.backendProcess.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        logStream.write(text);
        const lines = text.trim().split('\n');
        for (const l of lines) {
          if (l.trim()) {
            this.recentLogs.push(`[stderr] ${l.trim()}`);
            if (this.recentLogs.length > 50) this.recentLogs.shift();
          }
        }
      });

      this.backendProcess.on('exit', (code, signal) => {
        if (!this.isShuttingDown) {
          log(`[BACKEND] Process exited unexpectedly with code ${code}, signal ${signal}`);
        } else {
          log(`[BACKEND] Process terminated cleanly.`);
        }
        this.backendProcess = null;
      });

      // Wait for backend to be healthy (up to 30s)
      log(`[BACKEND] Health check polling starting at ${this.getHealthUrl()}...`);
      const isReady = await this.waitForHealth(30000);
      if (!isReady) {
        const recentSnippet = this.recentLogs.slice(-10).join('\n');
        throw new Error(
          `Backend failed to respond on ${this.getHealthUrl()} within 30 seconds.\nRecent backend logs:\n${recentSnippet}`
        );
      }

      log('[BACKEND] READY — Local server accepting requests.');
    } catch (err: any) {
      log(`[BACKEND] Startup failed: ${err.message}`);
      throw err;
    }
  }

  /**
   * Periodically polls the health endpoint until it returns valid health response or timeout is reached.
   */
  private async waitForHealth(timeoutMs: number): Promise<boolean> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      if (await this.checkHealth(1500, this.port)) {
        return true;
      }
      await new Promise((res) => setTimeout(res, 300));
    }
    return false;
  }

  /**
   * Performs a single health check request against /health or /api/health verifying KKV service signature.
   */
  public async checkHealth(timeoutMs: number = 2000, checkPort?: number): Promise<boolean> {
    const port = checkPort || this.port;
    const endpoints = [
      `http://${this.host}:${port}/health`,
      `http://${this.host}:${port}/api/health`
    ];
    for (const url of endpoints) {
      try {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeoutMs);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(id);
        if (res.ok || res.status === 200 || res.status === 503) {
          const json: any = await res.json().catch(() => null);
          if (json && (json.service === 'kkv-gold-finance-backend' || json.service === 'telegram' || json.backend === 'running' || json.ready === true)) {
            return true;
          }
        }
      } catch {
        // continue to next endpoint
      }
    }
    return false;
  }

  /**
   * Gracefully shuts down the backend process and any child processes.
   */
  public stop(): void {
    this.isShuttingDown = true;
    if (this.backendProcess && this.backendProcess.pid) {
      const pid = this.backendProcess.pid;
      console.log(`[BackendManager] Stopping backend process (PID: ${pid})...`);
      try {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true });
        } else {
          this.backendProcess.kill('SIGTERM');
        }
      } catch (err: any) {
        console.warn(`[BackendManager] Error terminating backend process:`, err?.message || err);
      }
      this.backendProcess = null;
    }
  }
}
