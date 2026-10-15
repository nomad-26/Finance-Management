import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Lock,
  Wifi,
  WifiOff,
  HardDrive,
  Download,
  Layers,
  FileCheck
} from 'lucide-react';
import { apiService, getStoredAuthToken } from '../../services/api';
import { useApp } from '../../context/AppContext';

interface ConfigurationCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ConfigurationCenterModal: React.FC<ConfigurationCenterModalProps> = ({
  isOpen,
  onClose
}) => {
  const { userRole, showToast } = useApp();

  const [loading, setLoading] = useState(false);
  const [statusData, setStatusData] = useState<any>(null);

  // Admin authorization state
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);

  // Backup Execution state
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupFeedback, setBackupFeedback] = useState<{ success: boolean; message: string } | null>(null);

  const isAdminSession = userRole === 'ADMIN' || isUnlocked;

  // Load Status from Backend
  const loadStatus = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiService.getConfigCenterStatus();
      if (res && res.success && res.data) {
        setStatusData(res.data);
        if (res.data.isUnlocked || userRole === 'ADMIN') {
          setIsUnlocked(true);
        }
      }
    } catch (err: any) {
      console.warn('[DataSafetyCenter] Failed to load status:', err);
    } finally {
      setLoading(false);
    }
  }, [userRole]);

  useEffect(() => {
    if (isOpen) {
      loadStatus();
      setUnlockError(null);
      setBackupFeedback(null);
    }
  }, [isOpen, loadStatus]);

  if (!isOpen) return null;

  // Handle Admin Password Unlock
  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminPasswordInput.trim()) return;

    setIsUnlocking(true);
    setUnlockError(null);

    try {
      const res = await apiService.unlockConfigCenter(adminPasswordInput.trim());
      if (res && res.success) {
        setIsUnlocked(true);
        if (res.token && !getStoredAuthToken()) {
          localStorage.setItem('kkv_auth_token', res.token);
        }
        showToast('Admin authorization verified successfully.', 'success');
        setAdminPasswordInput('');
        await loadStatus();
      } else {
        setUnlockError(res?.message || 'Invalid password. Admin authorization required.');
      }
    } catch (err: any) {
      setUnlockError(err?.message || 'Failed to authenticate Admin password.');
    } finally {
      setIsUnlocking(false);
    }
  };

  // Trigger Local Storage Backup Archive
  const handleCreateBackup = async () => {
    setIsBackingUp(true);
    setBackupFeedback(null);
    try {
      showToast('Creating local data backup archive...', 'info');
      const res = await apiService.createLatestBackup();
      if (res && res.success) {
        setBackupFeedback({
          success: true,
          message: `Backup archive created successfully: ${res.data?.fileName || 'Archive saved'}`
        });
        showToast('Local backup archive created successfully!', 'success');
        await loadStatus();
      } else {
        setBackupFeedback({
          success: false,
          message: res?.message || 'Failed to create backup archive.'
        });
        showToast(res?.message || 'Backup creation failed.', 'error');
      }
    } catch (err: any) {
      setBackupFeedback({
        success: false,
        message: err?.message || 'Unexpected error creating backup.'
      });
      showToast(err?.message || 'Failed to trigger backup.', 'error');
    } finally {
      setIsBackingUp(false);
    }
  };

  const isOnline = statusData?.internetAvailable !== false;
  const storageInfo = statusData?.storage;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(5px)',
        WebkitBackdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2600,
        padding: '16px',
        overflowY: 'auto'
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '820px',
          maxHeight: '94vh',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'var(--bg-surface, #ffffff)',
          color: 'var(--text-main, #0f172a)',
          borderRadius: '16px',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(0, 0, 0, 0.08)',
          border: '1px solid var(--border-light, #e2e8f0)',
          overflow: 'hidden',
          animation: 'modalSlideUp 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* MODAL HEADER */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid var(--border-subtle, #f1f5f9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'var(--bg-surface-secondary, #f8fafc)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                backgroundColor: 'rgba(11, 107, 74, 0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#0B6B4A'
              }}
            >
              <ShieldCheck size={24} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text-dark, #0f172a)' }}>
                  Data Safety &amp; Storage Center
                </h2>
                <span className="badge badge-gold" style={{ fontSize: '10px', padding: '2px 8px' }}>
                  PRIMARY LOCAL STORAGE
                </span>
                {isOnline ? (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '11px',
                      color: '#059669',
                      fontWeight: 700
                    }}
                  >
                    <Wifi size={13} /> Online
                  </span>
                ) : (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '11px',
                      color: '#d97706',
                      fontWeight: 700
                    }}
                  >
                    <WifiOff size={13} /> Offline Mode
                  </span>
                )}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted, #64748b)', marginTop: '2px' }}>
                Authoritative Local Storage &bull; Continuous Offline Resilience &bull; Multi-Layer Data Safety
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              className="icon-button"
              onClick={loadStatus}
              disabled={loading}
              title="Refresh Status"
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid var(--border-light, #e2e8f0)',
                background: '#ffffff',
                cursor: 'pointer',
                color: 'var(--text-muted, #64748b)'
              }}
            >
              <RefreshCw size={14} className={loading ? 'kkv-spin' : ''} />
            </button>

            <button
              type="button"
              className="icon-button"
              onClick={onClose}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: 'var(--text-muted, #64748b)'
              }}
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* SECURITY ACCESS NOTICE / UNLOCK PROMPT */}
        {!isAdminSession && (
          <div
            style={{
              padding: '12px 24px',
              backgroundColor: '#fffbeb',
              borderBottom: '1px solid #fef3c7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '14px',
              fontSize: '12.5px',
              color: '#92400e',
              flexWrap: 'wrap'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Lock size={16} color="#d97706" style={{ flexShrink: 0 }} />
              <span>
                <strong>Read-Only Mode:</strong> Storage status is visible. Enter Admin Password to trigger manual backup creation.
              </span>
            </div>

            <form onSubmit={handleUnlock} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="password"
                placeholder="Admin password..."
                value={adminPasswordInput}
                onChange={(e) => setAdminPasswordInput(e.target.value)}
                style={{
                  padding: '6px 10px',
                  fontSize: '12px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  outline: 'none',
                  width: '150px'
                }}
              />
              <button
                type="submit"
                disabled={isUnlocking}
                className="btn btn-sm"
                style={{
                  padding: '6px 12px',
                  fontSize: '12px',
                  fontWeight: 700,
                  backgroundColor: '#0B6B4A',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                {isUnlocking ? 'Unlocking...' : 'Unlock'}
              </button>
            </form>
          </div>
        )}

        {unlockError && (
          <div
            style={{
              padding: '10px 24px',
              backgroundColor: '#fef2f2',
              borderBottom: '1px solid #fecaca',
              color: '#991b1b',
              fontSize: '12px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <AlertTriangle size={15} color="#dc2626" />
            <span>{unlockError}</span>
          </div>
        )}

        {/* MODAL BODY */}
        <div style={{ padding: '22px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* STATUS OVERVIEW CARDS */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
            <div
              style={{
                padding: '14px 16px',
                borderRadius: '12px',
                backgroundColor: 'var(--bg-surface-secondary, #f8fafc)',
                border: '1px solid var(--border-subtle, #e2e8f0)',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <HardDrive size={15} color="#0B6B4A" />
                <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-muted, #64748b)', textTransform: 'uppercase' }}>
                  Primary Storage
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#10b981' }} />
                <span style={{ fontWeight: 800, fontSize: '15px', color: '#047857' }}>Active</span>
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted, #64748b)' }}>
                Type: <strong style={{ color: 'var(--text-dark, #0f172a)' }}>{storageInfo?.type || 'Local Persistent Storage'}</strong>
              </span>
            </div>

            <div
              style={{
                padding: '14px 16px',
                borderRadius: '12px',
                backgroundColor: 'var(--bg-surface-secondary, #f8fafc)',
                border: '1px solid var(--border-subtle, #e2e8f0)',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Layers size={15} color="#0B6B4A" />
                <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-muted, #64748b)', textTransform: 'uppercase' }}>
                  Total Stored Records
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontWeight: 800, fontSize: '18px', color: 'var(--text-dark, #0f172a)' }}>
                  {(storageInfo?.totalRecords ?? 0).toLocaleString()}
                </span>
                <span style={{ fontSize: '11px', color: '#059669', fontWeight: 600 }}>Records Loaded</span>
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted, #64748b)' }}>
                Across All Financial Entities
              </span>
            </div>

            <div
              style={{
                padding: '14px 16px',
                borderRadius: '12px',
                backgroundColor: 'var(--bg-surface-secondary, #f8fafc)',
                border: '1px solid var(--border-subtle, #e2e8f0)',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <FileCheck size={15} color="#0B6B4A" />
                <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-muted, #64748b)', textTransform: 'uppercase' }}>
                  Persistence Status
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={16} color="#10b981" />
                <span style={{ fontWeight: 800, fontSize: '14px', color: '#047857' }}>Continuous Writes</span>
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted, #64748b)' }}>
                Guaranteed Local Disk Storage
              </span>
            </div>
          </div>

          {/* ARCHITECTURE HERO BANNER */}
          <div
            style={{
              padding: '16px 20px',
              borderRadius: '12px',
              backgroundColor: 'rgba(11, 107, 74, 0.05)',
              border: '1px solid rgba(11, 107, 74, 0.2)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldCheck size={20} color="#0B6B4A" />
              <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: '#0B6B4A' }}>
                Authoritative Local Storage Architecture
              </h4>
            </div>
            <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--text-dark, #0f172a)', lineHeight: '1.5' }}>
              KKV Gold Finance operates with an authoritative, offline-first local storage architecture. All customer accounts, gold loans, payments, daybook transactions, and rental records are stored securely on the local system and persist across application restarts.
            </p>
          </div>

          {/* 4 CORE SAFETY PILLARS */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
            <div style={{ padding: '14px', borderRadius: '10px', backgroundColor: 'var(--bg-surface-secondary, #f8fafc)', border: '1px solid var(--border-subtle, #e2e8f0)' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#0B6B4A', marginBottom: '4px' }}>
                1. Zero Data Loss During Outages
              </div>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted, #64748b)', lineHeight: '1.4' }}>
                Customer registration, gold loan issuance, and payment vouchers operate immediately on local storage without network dependencies.
              </p>
            </div>

            <div style={{ padding: '14px', borderRadius: '10px', backgroundColor: 'var(--bg-surface-secondary, #f8fafc)', border: '1px solid var(--border-subtle, #e2e8f0)' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#0B6B4A', marginBottom: '4px' }}>
                2. Real-Time Persistent Storage
              </div>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted, #64748b)', lineHeight: '1.4' }}>
                Every transaction and financial modification is written immediately to persistent storage, ensuring records remain intact across browser refreshes and system restarts.
              </p>
            </div>

            <div style={{ padding: '14px', borderRadius: '10px', backgroundColor: 'var(--bg-surface-secondary, #f8fafc)', border: '1px solid var(--border-subtle, #e2e8f0)' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#0B6B4A', marginBottom: '4px' }}>
                3. Idempotent Upsert Protection
              </div>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted, #64748b)', lineHeight: '1.4' }}>
                Transactions utilize deterministic business identifiers (Loan ID, Receipt No, Customer ID) to prevent accidental duplicate entries.
              </p>
            </div>

            <div style={{ padding: '14px', borderRadius: '10px', backgroundColor: 'var(--bg-surface-secondary, #f8fafc)', border: '1px solid var(--border-subtle, #e2e8f0)' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#0B6B4A', marginBottom: '4px' }}>
                4. Preserved Financial Ledger
              </div>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted, #64748b)', lineHeight: '1.4' }}>
                Ledgers, accounting daybooks, and repayment records are protected against unintended overwrites and maintain continuous audit trails.
              </p>
            </div>
          </div>

          {/* INDEPENDENT SAFETY ACTION: MANUAL BACKUP CREATION */}
          <div
            style={{
              padding: '16px',
              borderRadius: '12px',
              backgroundColor: 'var(--bg-surface-secondary, #f8fafc)',
              border: '1px solid var(--border-subtle, #e2e8f0)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '16px',
              flexWrap: 'wrap'
            }}
          >
            <div>
              <h4 style={{ margin: '0 0 4px 0', fontSize: '13.5px', fontWeight: 700, color: 'var(--text-dark, #0f172a)' }}>
                Create Local Backup Archive
              </h4>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted, #64748b)' }}>
                Generate an instant, cryptographic ZIP snapshot of all local data records for offline archiving.
              </p>
            </div>

            <button
              type="button"
              onClick={handleCreateBackup}
              disabled={isBackingUp || !isAdminSession}
              className="btn btn-sm"
              style={{
                padding: '9px 18px',
                fontSize: '12.5px',
                fontWeight: 700,
                borderRadius: '8px',
                backgroundColor: '#0B6B4A',
                color: '#ffffff',
                border: 'none',
                cursor: isAdminSession ? 'pointer' : 'not-allowed',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                opacity: isAdminSession ? 1 : 0.6
              }}
            >
              <Download size={15} className={isBackingUp ? 'kkv-spin' : ''} />
              <span>{isBackingUp ? 'Creating Backup Archive...' : 'Create Backup Archive Now'}</span>
            </button>
          </div>

          {backupFeedback && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                backgroundColor: backupFeedback.success ? 'rgba(16, 185, 129, 0.08)' : '#fef2f2',
                border: `1px solid ${backupFeedback.success ? 'rgba(16, 185, 129, 0.3)' : '#fecaca'}`,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '12px',
                color: backupFeedback.success ? '#047857' : '#991b1b',
                fontWeight: 600
              }}
            >
              {backupFeedback.success ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
              <span>{backupFeedback.message}</span>
            </div>
          )}
        </div>

        {/* MODAL FOOTER */}
        <div
          style={{
            padding: '14px 24px',
            backgroundColor: 'var(--bg-surface-secondary, #f8fafc)',
            borderTop: '1px solid var(--border-subtle, #f1f5f9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-muted, #64748b)' }}>
            <ShieldCheck size={14} color="#0B6B4A" />
            <span>KKV Gold Finance Secure Local System &bull; Version 1.0.4</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary"
            style={{
              padding: '8px 18px',
              fontSize: '13px',
              fontWeight: 600,
              borderRadius: '8px'
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfigurationCenterModal;
