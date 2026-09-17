import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { BackendManager } from './backend-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = !app.isPackaged;
const backendManager = new BackendManager();

let mainWindow: BrowserWindow | null = null;

// Enforce single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log('[Electron] Another instance is already running. Quitting.');
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// Set explicit Windows AppUserModelId for taskbar identity and proper branding
app.setAppUserModelId('com.kkvgoldfinance.desktop');

function getAppIconPath(): string {
  const possiblePaths = [
    path.join(__dirname, '../build/icon.ico'),
    path.join(__dirname, '../resources/icon.ico'),
    path.join(__dirname, '../electron/resources/icon.ico'),
    path.join(__dirname, '../public/favicon.ico'),
    path.join(process.resourcesPath, 'icon.ico'),
    path.join(process.resourcesPath, 'build/icon.ico'),
    path.join(process.cwd(), 'build/icon.ico'),
    path.join(process.cwd(), 'resources/icon.ico')
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return path.join(__dirname, '../build/icon.ico');
}

function createWindow(): void {
  const appIcon = getAppIconPath();
  console.log(`[Electron] Using application icon from: ${appIcon}`);

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'KKV Gold Finance & Rental Management',
    icon: appIcon,
    backgroundColor: '#0f172a',
    show: false, // Show once ready to prevent white flash
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: true
    }
  });

  // Remove default top menu in production for a clean app feel
  if (!isDev) {
    mainWindow.removeMenu();
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  if (isDev) {
    const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    console.log(`[Electron] Loading development URL: ${devUrl}`);
    mainWindow.loadURL(devUrl).catch((err) => {
      console.error('[Electron] Failed to load dev URL:', err);
    });
    // Open DevTools in dev mode
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    const indexPath = path.join(__dirname, '../dist/index.html');
    console.log(`[Electron] Loading production file: ${indexPath}`);
    mainWindow.loadFile(indexPath).catch((err) => {
      console.error('[Electron] Failed to load index.html:', err);
    });
  }

  // Handle external URLs in default system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ── IPC Handlers ─────────────────────────────────────────────────────────────
ipcMain.handle('desktop:get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('desktop:get-api-url', () => {
  return backendManager.getApiBaseUrl();
});

ipcMain.handle('desktop:get-system-info', () => {
  return {
    platform: process.platform,
    arch: process.arch,
    version: app.getVersion(),
    nodeVersion: process.versions.node,
    electronVersion: process.versions.electron
  };
});

ipcMain.handle('desktop:print', async () => {
  if (!mainWindow) return false;
  return new Promise((resolve) => {
    mainWindow?.webContents.print(
      { silent: false, printBackground: true },
      (success, failureReason) => {
        if (!success) console.warn('[Print] Print failed or cancelled:', failureReason);
        resolve(success);
      }
    );
  });
});

ipcMain.handle('desktop:save-pdf', async (_event, options: { defaultPath?: string; title?: string } = {}) => {
  if (!mainWindow) return { success: false, error: 'No active window' };
  try {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: options.title || 'Save PDF Report',
      defaultPath: options.defaultPath || 'KKV_Gold_Finance_Report.pdf',
      filters: [{ name: 'PDF Documents', extensions: ['pdf'] }]
    });

    if (canceled || !filePath) {
      return { success: false, error: 'Cancelled by user' };
    }

    const data = await mainWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 }
    });

    await fs.promises.writeFile(filePath, data);
    return { success: true, filePath };
  } catch (err: any) {
    console.error('[PDF Export Error]:', err);
    return { success: false, error: err?.message || 'Failed to export PDF' };
  }
});

ipcMain.handle('desktop:open-file-dialog', async (_event, options: { title?: string; filters?: Array<{ name: string; extensions: string[] }> } = {}) => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: options.title || 'Select File',
    properties: ['openFile'],
    filters: options.filters || [{ name: 'All Files', extensions: ['*'] }]
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths;
});

ipcMain.handle('desktop:open-path', async (_event, targetPath: string) => {
  return shell.openPath(targetPath);
});

ipcMain.handle('desktop:show-item-in-folder', async (_event, targetPath: string) => {
  shell.showItemInFolder(targetPath);
});

ipcMain.handle('desktop:save-receipt-pdf-and-reveal', async (_event, payload: { filename: string; base64Data: string }) => {
  try {
    const downloadsDir = app.getPath('downloads');
    const receiptsDir = path.join(downloadsDir, 'KKV Gold Finance', 'Receipts');
    if (!fs.existsSync(receiptsDir)) {
      fs.mkdirSync(receiptsDir, { recursive: true });
    }

    const filePath = path.join(receiptsDir, payload.filename);
    const buffer = Buffer.from(payload.base64Data, 'base64');
    fs.writeFileSync(filePath, buffer);

    // Reveal the saved PDF file highlighted in Windows File Explorer
    shell.showItemInFolder(filePath);

    return { success: true, filePath };
  } catch (err: any) {
    console.error('[Electron] Failed to save and reveal receipt PDF:', err);
    return { success: false, error: err?.message || 'Failed to save receipt PDF locally.' };
  }
});

ipcMain.handle('desktop:open-external', async (_event, url: string) => {
  try {
    if (url.startsWith('https://') || url.startsWith('http://') || url.startsWith('whatsapp://')) {
      await shell.openExternal(url);
      return true;
    }
    return false;
  } catch (err: any) {
    console.error('[Electron] openExternal error:', err);
    return false;
  }
});

ipcMain.on('desktop:minimize-window', () => {
  mainWindow?.minimize();
});

ipcMain.on('desktop:maximize-window', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.on('desktop:close-window', () => {
  mainWindow?.close();
});

ipcMain.handle('desktop:is-maximized', () => {
  return mainWindow?.isMaximized() || false;
});

// ── Application Lifecycle ───────────────────────────────────────────────────
app.whenReady().then(async () => {
  console.log('[Electron] Initializing desktop application...');

  try {
    // Start local backend server
    await backendManager.start();
  } catch (err: any) {
    console.error('[Electron] Backend startup warning/error:', err?.message || err);
    dialog.showErrorBox(
      'KKV Gold Finance - Backend Initialization',
      'The local backend server encountered an error during startup. Some local features may be unavailable. Error: ' +
        (err?.message || err)
    );
  }

  // Create UI Window
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', () => {
  console.log('[Electron] App is quitting. Stopping backend process...');
  backendManager.stop();
});

app.on('will-quit', () => {
  backendManager.stop();
});

app.on('window-all-closed', () => {
  backendManager.stop();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
