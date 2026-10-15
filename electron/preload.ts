import { contextBridge, ipcRenderer } from 'electron';

export interface DesktopAPI {
  isElectron: boolean;
  getAppVersion: () => Promise<string>;
  getSystemInfo: () => Promise<{
    platform: string;
    arch: string;
    version: string;
    nodeVersion: string;
    electronVersion: string;
  }>;
  print: () => Promise<boolean>;
  savePdf: (options?: { defaultPath?: string; title?: string }) => Promise<{ success: boolean; filePath?: string; error?: string }>;
  saveReceiptPdfAndReveal: (filename: string, base64Data: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;
  openFileDialog: (options?: { title?: string; filters?: Array<{ name: string; extensions: string[] }> }) => Promise<string[] | null>;
  openPath: (path: string) => Promise<string>;
  openExternal: (url: string) => Promise<boolean>;
  showItemInFolder: (path: string) => Promise<void>;
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;
  isMaximized: () => Promise<boolean>;
  getApiBaseUrl?: () => Promise<string>;
  apiBaseUrl?: string;
  openLogsFolder: () => Promise<string>;
  showSaveBackupDialog: (defaultName?: string) => Promise<string | null>;
  getRuntimePaths: () => Promise<{
    userData: string;
    appData: string;
    documents: string;
    downloads: string;
    logs: string;
    backups: string;
    data: string;
  }>;
}

const desktopAPI: DesktopAPI = {
  isElectron: true,
  getAppVersion: () => ipcRenderer.invoke('desktop:get-app-version'),
  getSystemInfo: () => ipcRenderer.invoke('desktop:get-system-info'),
  print: () => ipcRenderer.invoke('desktop:print'),
  savePdf: (options) => ipcRenderer.invoke('desktop:save-pdf', options),
  saveReceiptPdfAndReveal: (filename: string, base64Data: string) =>
    ipcRenderer.invoke('desktop:save-receipt-pdf-and-reveal', { filename, base64Data }),
  openFileDialog: (options) => ipcRenderer.invoke('desktop:open-file-dialog', options),
  openPath: (path: string) => ipcRenderer.invoke('desktop:open-path', path),
  openExternal: (url: string) => ipcRenderer.invoke('desktop:open-external', url),
  showItemInFolder: (path: string) => ipcRenderer.invoke('desktop:show-item-in-folder', path),
  minimizeWindow: () => ipcRenderer.send('desktop:minimize-window'),
  maximizeWindow: () => ipcRenderer.send('desktop:maximize-window'),
  closeWindow: () => ipcRenderer.send('desktop:close-window'),
  isMaximized: () => ipcRenderer.invoke('desktop:is-maximized'),
  getApiBaseUrl: () => ipcRenderer.invoke('desktop:get-api-url'),
  apiBaseUrl: 'http://127.0.0.1:8080/api',
  openLogsFolder: () => ipcRenderer.invoke('desktop:open-logs-folder'),
  showSaveBackupDialog: (defaultName?: string) => ipcRenderer.invoke('desktop:save-backup-dialog', defaultName),
  getRuntimePaths: () => ipcRenderer.invoke('desktop:get-runtime-paths')
};

contextBridge.exposeInMainWorld('desktopAPI', desktopAPI);
