import React, { useState, useEffect } from 'react';
import {
  Database,
  Download,
  RotateCcw,
  RefreshCw,
  HardDrive,
  Clock,
  Layers,
  Wifi,
  WifiOff,
  FileCheck2
} from 'lucide-react';
import { apiService } from '../../services/api';
import { useApp } from '../../context/AppContext';
import { DatabaseRestoreModal } from './DatabaseRestoreModal';

export interface DatabaseBackupRecoverySectionProps {
  onOpenRestore?: () => void;
}

export const DatabaseBackupRecoverySection: React.FC<DatabaseBackupRecoverySectionProps> = ({
  onOpenRestore
}) => {
  const { showToast } = useApp();

  // Network & Status states
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  const [dbInfo, setDbInfo] = useState<{
    status: 'Connected' | 'Disconnected';
    type: string;
    storage: string;
    lastAutoSync: string | null;
    databaseSize: string;
    totalCollections: number;
    totalRecords: number;
  }>({
    status: 'Connected',
    type: 'Local Storage',
    storage: 'Local',
    lastAutoSync: null,
    databaseSize: '0.0 KB',
    totalCollections: 10,
    totalRecords: 0
  });

  const [loading, setLoading] = useState(false);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [lastDownloadSuccess, setLastDownloadSuccess] = useState<{
    fileName: string;
    fileSize: string;
    createdTime: string;
  } | null>(null);

  // Monitor online / offline changes in real-time
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Fetch Database telemetry
  const fetchDbState = async () => {
    setLoading(true);
    try {
      const infoRes = await apiService.getDatabaseInfo().catch(() => null);

      if (infoRes && infoRes.success) {
        const rawStatus = (infoRes.status || '').toLowerCase();
        setDbInfo({
          status: rawStatus === 'connected' || rawStatus === 'online' ? 'Connected' : 'Disconnected',
          type: infoRes.databaseType || 'Local Storage',
          storage: infoRes.storageLocation || 'Local',
          lastAutoSync: infoRes.lastAutoSync || null,
          databaseSize: infoRes.databaseSize || '0.0 KB',
          totalCollections: infoRes.collectionsCount || 10,
          totalRecords: infoRes.totalRecords || 0
        });
      } else {
        setDbInfo((prev) => ({
          ...prev,
          status: 'Disconnected'
        }));
      }
    } catch (err) {
      console.warn('[DatabaseBackupRecoverySection] Fetch warning:', err);
      setDbInfo((prev) => ({
        ...prev,
        status: 'Disconnected'
      }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDbState();
    const interval = setInterval(fetchDbState, 15000); // 15s periodic poll
    return () => clearInterval(interval);
  }, []);

  // Listen for system restore completion to refresh telemetry
  useEffect(() => {
    const handleRestoreComplete = () => {
      fetchDbState();
    };
    window.addEventListener('SYSTEM_RESTORE_COMPLETED', handleRestoreComplete);
    return () => window.removeEventListener('SYSTEM_RESTORE_COMPLETED', handleRestoreComplete);
  }, []);

  // Date parsing helper — ALWAYS returns a clean string, NEVER "Invalid Date"
  const formatDateTime = (val: string | number | null | undefined): string => {
    if (!val || val === 'Never' || val === 'Invalid Date') {
      return 'Never';
    }
    try {
      const d = new Date(val);
      if (isNaN(d.getTime())) {
        return 'Never';
      }
      return d.toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
    } catch {
      return 'Never';
    }
  };

  const formatPlural = (count: number, singular: string, plural: string) => {
    return `${count.toLocaleString()} ${count === 1 ? singular : plural}`;
  };

  // Handle "Download Latest Backup"
  const handleDownloadLatestBackup = async () => {
    setCreatingBackup(true);
    try {
      showToast('Exporting current local database to latest backup archive...', 'info');
      const res = await apiService.createLatestBackup();

      if (res.success && res.data?.backupId) {
        let chosenFilename = res.data.fileName || `KKV_Gold_Finance_Latest_Backup_${new Date().toISOString().slice(0, 10)}.zip`;

        // Prompt native Windows save dialog if in Electron
        if (typeof window !== 'undefined' && (window as any).desktopAPI?.showSaveBackupDialog) {
          const savePath = await (window as any).desktopAPI.showSaveBackupDialog(chosenFilename);
          if (!savePath) {
            showToast('Backup download cancelled.', 'info');
            setCreatingBackup(false);
            return;
          }
        }

        await apiService.downloadBackupPackage(res.data.backupId, chosenFilename);

        const sizeFormatted = res.data.fileSize
          ? res.data.fileSize > 1024 * 1024
            ? `${(res.data.fileSize / (1024 * 1024)).toFixed(1)} MB`
            : `${(res.data.fileSize / 1024).toFixed(1)} KB`
          : dbInfo.databaseSize;

        const now = new Date();
        const createdFormatted = now.toLocaleTimeString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        });

        setLastDownloadSuccess({
          fileName: chosenFilename,
          fileSize: sizeFormatted,
          createdTime: createdFormatted
        });

        showToast('Latest database backup downloaded successfully.', 'success');
        fetchDbState();
      } else {
        throw new Error(res.message || 'Failed to generate latest backup.');
      }
    } catch (err: any) {
      console.error('[DatabaseBackupRecoverySection] Download error:', err);
      showToast(err?.message || 'Failed to download latest database backup.', 'error');
    } finally {
      setCreatingBackup(false);
    }
  };

  // Determine Cloud Firestore sync status
  const getFirestoreSyncState = () => {
    if (!isOnline) {
      return {
        label: 'Paused — Waiting for Internet',
        color: '#D97706',
        bg: '#FEF3C7',
        border: '#FDE68A'
      };
    }
    return {
      label: 'Live (Cloud Firestore)',
      color: '#15803D',
      bg: '#F0FDF4',
      border: '#BBF7D0'
    };
  };

  const syncState = getFirestoreSyncState();
  const isDbConnected = dbInfo.status === 'Connected';

  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '16px',
        border: '1px solid #E2E8F0',
        padding: '24px',
        boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.05)',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        marginBottom: '24px'
      }}
    >
      {/* ── 1. SECTION HEADER ────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '16px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '12px',
              backgroundColor: '#0F766E',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(15, 118, 110, 0.25)'
            }}
          >
            <Database size={24} />
          </div>
          <div>
            <h3
              style={{
                margin: '0 0 4px 0',
                fontSize: '18px',
                fontWeight: 800,
                color: '#0F172A',
                letterSpacing: '-0.2px'
              }}
            >
              DATABASE BACKUP &amp; RECOVERY
            </h3>
            <p style={{ margin: 0, fontSize: '13px', color: '#64748B', lineHeight: 1.4 }}>
              Protect your local database by downloading the latest backup archive.
            </p>
          </div>
        </div>

        {/* Status Pills Container */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Primary Database Status */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '20px',
              backgroundColor: isDbConnected ? '#F0FDF4' : '#FEF2F2',
              border: `1px solid ${isDbConnected ? '#BBF7D0' : '#FECACA'}`,
              fontSize: '12px',
              fontWeight: 700,
              color: isDbConnected ? '#15803D' : '#DC2626'
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: isDbConnected ? '#16A34A' : '#DC2626',
                display: 'inline-block',
                boxShadow: isDbConnected ? '0 0 8px #16A34A' : 'none'
              }}
            />
            <span>{isDbConnected ? 'Local Storage Connected' : 'Local Storage Disconnected'}</span>
            <span style={{ color: '#94A3B8' }}>•</span>
            <span style={{ color: '#475569' }}>Local</span>
          </div>

          {/* Internet Status */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '20px',
              backgroundColor: isOnline ? '#F0FDF4' : '#FEF2F2',
              border: `1px solid ${isOnline ? '#BBF7D0' : '#FECACA'}`,
              fontSize: '12px',
              fontWeight: 700,
              color: isOnline ? '#15803D' : '#DC2626'
            }}
          >
            {isOnline ? <Wifi size={13} color="#16A34A" /> : <WifiOff size={13} color="#DC2626" />}
            <span>{isOnline ? 'Internet Online' : 'Internet Offline'}</span>
          </div>

          {/* Cloud Firestore Auto Sync Status */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '20px',
              backgroundColor: syncState.bg,
              border: `1px solid ${syncState.border}`,
              fontSize: '12px',
              fontWeight: 700,
              color: syncState.color
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: syncState.color,
                display: 'inline-block'
              }}
            />
            <span>Firestore Sync: {syncState.label}</span>
          </div>
        </div>
      </div>

      {/* ── 2. LIVE DATABASE TELEMETRY STATS ─────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px'
        }}
      >
        {/* Last Auto Sync */}
        <div
          style={{
            backgroundColor: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: '12px',
            padding: '14px 16px'
          }}
        >
          <div
            style={{
              fontSize: '11px',
              fontWeight: 700,
              color: '#64748B',
              textTransform: 'uppercase',
              marginBottom: '6px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Clock size={13} color="#0F766E" />
            <span>Last Auto Sync</span>
          </div>
          <div
            style={{
              fontSize: '14px',
              fontWeight: 700,
              color: '#0F172A',
              letterSpacing: '-0.2px'
            }}
          >
            {formatDateTime(dbInfo.lastAutoSync)}
          </div>
        </div>

        {/* Database Size */}
        <div
          style={{
            backgroundColor: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: '12px',
            padding: '14px 16px'
          }}
        >
          <div
            style={{
              fontSize: '11px',
              fontWeight: 700,
              color: '#64748B',
              textTransform: 'uppercase',
              marginBottom: '6px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <HardDrive size={13} color="#0F766E" />
            <span>Database Size</span>
          </div>
          <div
            style={{
              fontSize: '15px',
              fontWeight: 800,
              color: '#0F766E',
              letterSpacing: '-0.2px'
            }}
          >
            {dbInfo.databaseSize}
          </div>
        </div>

        {/* Collections */}
        <div
          style={{
            backgroundColor: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: '12px',
            padding: '14px 16px'
          }}
        >
          <div
            style={{
              fontSize: '11px',
              fontWeight: 700,
              color: '#64748B',
              textTransform: 'uppercase',
              marginBottom: '6px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Layers size={13} color="#0F766E" />
            <span>Collections</span>
          </div>
          <div
            style={{
              fontSize: '15px',
              fontWeight: 800,
              color: '#0F172A',
              letterSpacing: '-0.2px'
            }}
          >
            {formatPlural(dbInfo.totalCollections, 'collection', 'collections')}
          </div>
        </div>

        {/* Total Records */}
        <div
          style={{
            backgroundColor: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: '12px',
            padding: '14px 16px'
          }}
        >
          <div
            style={{
              fontSize: '11px',
              fontWeight: 700,
              color: '#64748B',
              textTransform: 'uppercase',
              marginBottom: '6px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Database size={13} color="#0F766E" />
            <span>Total Records</span>
          </div>
          <div
            style={{
              fontSize: '15px',
              fontWeight: 800,
              color: '#0F172A',
              letterSpacing: '-0.2px'
            }}
          >
            {formatPlural(dbInfo.totalRecords, 'record', 'records')}
          </div>
        </div>
      </div>

      {/* ── 3. LAST DOWNLOAD CONFIRMATION NOTICE (IF DOWNLOADED THIS SESSION) ── */}
      {lastDownloadSuccess && (
        <div
          style={{
            backgroundColor: '#F0FDF4',
            border: '1px solid #BBF7D0',
            borderRadius: '12px',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FileCheck2 size={20} color="#16A34A" />
            <div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#15803D' }}>
                Latest database backup downloaded successfully.
              </div>
              <div style={{ fontSize: '12px', color: '#166534', fontFamily: 'monospace' }}>
                {lastDownloadSuccess.fileName}
              </div>
            </div>
          </div>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#15803D' }}>
            Size: {lastDownloadSuccess.fileSize} • Downloaded at: {lastDownloadSuccess.createdTime}
          </div>
        </div>
      )}

      {/* ── 4. ACTION BUTTONS ────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          gap: '12px',
          flexWrap: 'wrap',
          alignItems: 'center',
          paddingTop: '4px'
        }}
      >
        {/* [ Download Latest Backup ] Button */}
        <button
          type="button"
          onClick={handleDownloadLatestBackup}
          disabled={creatingBackup}
          className="btn"
          style={{
            backgroundColor: '#0F766E',
            color: '#FFFFFF',
            padding: '11px 22px',
            borderRadius: '10px',
            fontWeight: 800,
            fontSize: '13.5px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            cursor: creatingBackup ? 'not-allowed' : 'pointer',
            boxShadow: '0 4px 14px rgba(15, 118, 110, 0.3)',
            border: 'none',
            transition: 'all 0.15s ease'
          }}
        >
          {creatingBackup ? (
            <>
              <RefreshCw size={16} className="animate-spin" />
              <span>Generating Fresh Backup...</span>
            </>
          ) : (
            <>
              <Download size={16} />
              <span>Download Latest Backup</span>
            </>
          )}
        </button>

        {/* [ Restore Database ] Button */}
        <button
          type="button"
          onClick={() => {
            if (onOpenRestore) {
              onOpenRestore();
            } else {
              setShowRestoreModal(true);
            }
          }}
          className="btn"
          style={{
            backgroundColor: '#2563EB',
            color: '#FFFFFF',
            padding: '11px 20px',
            borderRadius: '10px',
            fontWeight: 800,
            fontSize: '13.5px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(37, 99, 235, 0.25)',
            border: 'none',
            transition: 'all 0.15s ease'
          }}
        >
          <RotateCcw size={16} />
          <span>Restore Database</span>
        </button>

        {/* [ Refresh ] Button */}
        <button
          type="button"
          onClick={fetchDbState}
          disabled={loading}
          style={{
            background: '#F1F5F9',
            border: '1px solid #CBD5E1',
            color: '#475569',
            cursor: 'pointer',
            padding: '10px 16px',
            borderRadius: '10px',
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '13px',
            fontWeight: 700
          }}
          title="Refresh database telemetry"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {/* ── 5. RESTORE MODAL COMPONENT ───────────────────────────────────── */}
      {showRestoreModal && (
        <DatabaseRestoreModal
          isOpen={showRestoreModal}
          onClose={() => setShowRestoreModal(false)}
          onSuccessReload={() => {
            setShowRestoreModal(false);
            fetchDbState();
          }}
        />
      )}
    </div>
  );
};

export default DatabaseBackupRecoverySection;
