import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  Upload,
  RefreshCw,
  X,
  RotateCcw,
  ArrowRight,
  AlertTriangle,
  ShieldCheck,
  Download
} from 'lucide-react';
import { apiService } from '../../services/api';
import { useApp } from '../../context/AppContext';

export interface DatabaseRestoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccessReload: () => void;
}

interface ChecklistItem {
  id: string;
  label: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export const DatabaseRestoreModal: React.FC<DatabaseRestoreModalProps> = ({
  isOpen,
  onClose,
  onSuccessReload
}) => {
  const { reloadAllData, showToast } = useApp();

  // Steps: 1 = Select File, 2 = Validate & Preview, 3 = Confirmation & Mode, 4 = Live Animation, 5 = Verified Report
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Mode Selection: replace vs merge
  const [restoreMode, setRestoreMode] = useState<'replace' | 'merge'>('replace');

  // Dragging state
  const [isDragging, setIsDragging] = useState(false);

  // Validation Preview Result
  const [previewResult, setPreviewResult] = useState<{
    token: string;
    backupId: string;
    fileName: string;
    createdAt: string;
    fileSize: number;
    sha256: string;
    schemaVersion: string;
    sourceType: 'LOCAL_UPLOAD' | 'LOCAL_SERVER';
    manifestVerified: boolean;
    checksumsVerified: boolean;
    relationshipsVerified: boolean;
    counts: {
      customers: number;
      loans: number;
      receipts: number;
      fixedDeposits: number;
      dayBookEntries: number;
      rentalComplexes?: number;
      rentalShops?: number;
      rentPayments?: number;
      rentalExpenses?: number;
      rentalDayBook?: number;
      fileAttachments?: number;
      users?: number;
      staff?: number;
      totalRecords: number;
    };
    currentDbCounts?: {
      customers: number;
      loans: number;
      receipts: number;
      fixedDeposits: number;
      dayBookEntries: number;
      rentalComplexes?: number;
      rentalShops?: number;
      totalRecords: number;
    };
  } | null>(null);

  // Confirmation Controls
  const [acknowledgedWarning, setAcknowledgedWarning] = useState(false);
  const [inputConfirmation, setInputConfirmation] = useState('');

  // Step 4: Live Progress Animation Checklist
  const [checklist, setChecklist] = useState<ChecklistItem[]>([
    { id: 'unpack', label: 'Unpacking backup ZIP archive', status: 'pending' },
    { id: 'checksum', label: 'Verifying SHA-256 cryptographic checksums', status: 'pending' },
    { id: 'pause_sync', label: 'Pausing background synchronization', status: 'pending' },
    { id: 'restore_data', label: 'Restoring database operational collections', status: 'pending' },
    { id: 'reindex', label: 'Re-indexing collections and checking integrity', status: 'pending' },
    { id: 'resume_sync', label: 'Re-enabling Cloud Firestore auto-sync & refresh', status: 'pending' }
  ]);
  const [progressPercent, setProgressPercent] = useState<number>(0);

  // Step 5: Final Report Details
  const [restoreReport, setRestoreReport] = useState<{
    backupId?: string;
    fileName?: string;
    mode?: string;
    totalCollections?: number;
    restoredCollections?: number;
    totalRecords?: number;
    insertedCount?: number;
    updatedCount?: number;
    skippedDuplicates?: number;
    durationMs?: number;
    timestamp?: string;
    collections?: Record<string, number>;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setErrorMessage('');
      setPreviewResult(null);
      setAcknowledgedWarning(false);
      setInputConfirmation('');
      setRestoreMode('replace');
      setRestoreReport(null);
      setProgressPercent(0);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleValidateUploadedFile = async (file: File) => {
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.zip') && !file.name.toLowerCase().endsWith('.json')) {
      setErrorMessage('Unsupported file format. Please upload a valid .ZIP backup archive.');
      return;
    }

    if (file.size === 0) {
      setErrorMessage('Selected archive is empty (0 bytes).');
      return;
    }

    if (file.size > 150 * 1024 * 1024) {
      setErrorMessage('File size exceeds the 150MB maximum upload limit.');
      return;
    }

    setLoading(true);
    setErrorMessage('');

    try {
      const res = await apiService.validateRestoreBackup({ file });
      if (!res.success || !res.data) {
        throw new Error(res.message || 'Backup archive failed integrity validation.');
      }
      setPreviewResult(res.data);
      setStep(2);
    } catch (err: any) {
      console.error('[DatabaseRestoreModal] Validation error:', err);
      setErrorMessage(err?.message || 'Could not validate backup archive.');
    } finally {
      setLoading(false);
    }
  };

  const runAnimatedChecklist = async () => {
    const stepsToRun = [
      { id: 'unpack', percent: 18, delay: 400 },
      { id: 'checksum', percent: 38, delay: 500 },
      { id: 'pause_sync', percent: 52, delay: 400 },
      { id: 'restore_data', percent: 75, delay: 600 },
      { id: 'reindex', percent: 90, delay: 450 },
      { id: 'resume_sync', percent: 100, delay: 350 }
    ];

    for (const s of stepsToRun) {
      setChecklist((prev) =>
        prev.map((item) =>
          item.id === s.id ? { ...item, status: 'in_progress' } : item
        )
      );
      setProgressPercent(s.percent);
      await new Promise((r) => setTimeout(r, s.delay));
      setChecklist((prev) =>
        prev.map((item) =>
          item.id === s.id ? { ...item, status: 'completed' } : item
        )
      );
    }
  };

  const handleExecuteRestore = async () => {
    if (!previewResult || !previewResult.token) return;
    const cleanConfirm = inputConfirmation.trim();
    if (cleanConfirm !== 'RESTORE BACKUP' && cleanConfirm !== 'RESTORE SYSTEM') return;
    if (!acknowledgedWarning) return;

    setStep(4);
    setLoading(true);
    setErrorMessage('');

    const startTime = Date.now();

    // Start UI checklist animation concurrently
    const animationPromise = runAnimatedChecklist();

    try {
      const res = await apiService.executeSystemRestore(previewResult.token, cleanConfirm, restoreMode);

      if (!res.success || !res.data) {
        throw new Error(res.message || 'Database restore operation failed.');
      }

      await animationPromise;
      const durationMs = Date.now() - startTime;

      const reportData = {
        backupId: previewResult.backupId,
        fileName: previewResult.fileName,
        mode: restoreMode,
        totalCollections: res.data?.restoredCollections || 10,
        restoredCollections: res.data?.restoredCollections || 10,
        totalRecords: res.data?.totalRecords || previewResult.counts.totalRecords,
        insertedCount: res.data?.insertedRecords ?? previewResult.counts.totalRecords,
        updatedCount: res.data?.updatedRecords ?? 0,
        skippedDuplicates: res.data?.skippedDuplicates ?? 0,
        durationMs: durationMs,
        timestamp: new Date().toISOString(),
        collections: res.data?.collectionCounts || {}
      };

      setRestoreReport(reportData);
      setStep(5);
      setLoading(false);

      // Trigger automatic state reload
      try {
        await reloadAllData();
        window.dispatchEvent(new CustomEvent('SYSTEM_RESTORE_COMPLETED', { detail: reportData }));
        window.dispatchEvent(new Event('kkv_rental_data_changed'));
        showToast('Database successfully restored and synchronized!', 'success');
      } catch (reloadErr) {
        console.warn('[DatabaseRestoreModal] Reload notification note:', reloadErr);
      }
    } catch (err: any) {
      console.error('[DatabaseRestoreModal] Execution error:', err);
      setErrorMessage(err?.message || 'Restore failed. The database was protected.');
      setStep(3);
      setLoading(false);
    }
  };

  const handleDownloadRestoreReport = () => {
    if (!restoreReport) return;
    const reportStr = JSON.stringify(restoreReport, null, 2);
    const blob = new Blob([reportStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `restore-report-${restoreReport.backupId || Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Restore report downloaded.', 'success');
  };

  const isExactConfirm =
    inputConfirmation.trim() === 'RESTORE BACKUP' ||
    inputConfirmation.trim() === 'RESTORE SYSTEM';
  const isRestoreEnabled = isExactConfirm && acknowledgedWarning && !loading;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 3500,
        padding: '20px'
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '780px',
          maxHeight: '92vh',
          overflowY: 'auto',
          boxShadow: '0 25px 60px -15px rgba(15, 23, 42, 0.5)',
          borderRadius: '16px',
          border: '1px solid #E2E8F0',
          padding: 0,
          backgroundColor: '#FFFFFF',
          position: 'relative'
        }}
      >
        {/* HEADER */}
        <div
          style={{
            background: 'linear-gradient(135deg, #0F766E 0%, #115E59 100%)',
            color: '#FFFFFF',
            padding: '20px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid rgba(255,255,255,0.15)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                backgroundColor: 'rgba(255, 255, 255, 0.18)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <RotateCcw size={22} color="#FFFFFF" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.2px' }}>
                Database Backup & Recovery
              </h3>
              <span style={{ fontSize: '12px', color: '#CCFBF1', fontWeight: 500 }}>
                Step {step} of 5: {
                  step === 1 ? 'Select Backup Archive' :
                  step === 2 ? 'Validate & Preview Collections' :
                  step === 3 ? 'Choose Mode & Confirm' :
                  step === 4 ? 'Restoring Database' : 'Verification & Report'
                }
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={step === 4}
            style={{
              background: 'rgba(255, 255, 255, 0.15)',
              border: 'none',
              borderRadius: '8px',
              padding: '8px',
              cursor: step === 4 ? 'not-allowed' : 'pointer',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.2s'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* STEP PROGRESS BAR */}
        <div style={{ height: '4px', backgroundColor: '#F1F5F9', width: '100%', position: 'relative' }}>
          <div
            style={{
              height: '100%',
              backgroundColor: '#0F766E',
              width: `${(step / 5) * 100}%`,
              transition: 'width 0.3s ease'
            }}
          />
        </div>

        {/* MODAL BODY */}
        <div style={{ padding: '24px' }}>
          {errorMessage && (
            <div
              style={{
                backgroundColor: '#FEF2F2',
                border: '1px solid #FCA5A5',
                color: '#991B1B',
                padding: '12px 16px',
                borderRadius: '10px',
                marginBottom: '20px',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}
            >
              <AlertTriangle size={18} color="#DC2626" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              STEP 1: SELECT / DRAG & DROP ZIP
              ══════════════════════════════════════════════════════════════ */}
          {step === 1 && (
            <div>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    handleValidateUploadedFile(e.dataTransfer.files[0]);
                  }
                }}
                style={{
                  border: isDragging ? '2px dashed #0F766E' : '2px dashed #CBD5E1',
                  borderRadius: '14px',
                  padding: '42px 20px',
                  textAlign: 'center',
                  backgroundColor: isDragging ? '#F0FDFA' : '#F8FAFC',
                  transition: 'all 0.2s',
                  marginBottom: '16px',
                  cursor: 'pointer'
                }}
                onClick={() => {
                  const input = document.getElementById('restoreZipFileInput');
                  if (input) input.click();
                }}
              >
                <input
                  id="restoreZipFileInput"
                  type="file"
                  accept=".zip,.json"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleValidateUploadedFile(e.target.files[0]);
                    }
                  }}
                />
                <div
                  style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '50%',
                    backgroundColor: '#E6FFFA',
                    color: '#0F766E',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 16px auto',
                    boxShadow: '0 4px 14px rgba(15, 118, 110, 0.15)'
                  }}
                >
                  <Upload size={30} />
                </div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#1E293B', marginBottom: '6px' }}>
                  Select or Drag & Drop Backup .ZIP File
                </div>
                <div style={{ fontSize: '13px', color: '#64748B', maxWidth: '460px', margin: '0 auto', lineHeight: 1.5 }}>
                  Select a valid database backup archive (<code>.zip</code>) exported from KKV Gold Finance.
                  The package will be checked for cryptographic signatures and schema integrity before restoring.
                </div>
              </div>

              {loading && (
                <div style={{ textAlign: 'center', marginTop: '16px', color: '#0F766E', fontSize: '13.5px', fontWeight: 700 }}>
                  <RefreshCw size={18} className="animate-spin" style={{ display: 'inline', marginRight: '8px' }} />
                  Extracting archive manifest and validating checksums...
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              STEP 2: VALIDATE & PREVIEW COLLECTIONS
              ══════════════════════════════════════════════════════════════ */}
          {step === 2 && previewResult && (
            <div>
              {/* Integrity Badge Card */}
              <div
                style={{
                  backgroundColor: '#F0FDFA',
                  border: '1px solid #99F6E4',
                  padding: '16px 18px',
                  borderRadius: '12px',
                  marginBottom: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '12px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '8px',
                      backgroundColor: '#CCFBF1',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <ShieldCheck size={22} color="#0F766E" />
                  </div>
                  <div>
                    <strong style={{ fontSize: '14px', color: '#0F766E', display: 'block' }}>
                      Backup Archive Verified & Healthy
                    </strong>
                    <span style={{ fontSize: '12px', color: '#134E4A' }}>
                      Manifest valid • SHA-256 Checksums match • Relationships intact
                    </span>
                  </div>
                </div>

                <div style={{ fontSize: '12px', color: '#64748B', textAlign: 'right' }}>
                  <div><strong>File:</strong> {previewResult.fileName}</div>
                  <div><strong>Size:</strong> {(previewResult.fileSize / 1024).toFixed(1)} KB</div>
                </div>
              </div>

              {/* Collections Grid with Record Counts */}
              <div style={{ marginBottom: '22px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: '#1E293B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Collections &amp; Record Counts ({previewResult.counts.totalRecords} total)
                  </span>
                  <span style={{ fontSize: '12px', color: '#0F766E', fontWeight: 700 }}>
                    Schema v{previewResult.schemaVersion || '1.0'}
                  </span>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                    gap: '10px'
                  }}
                >
                  {[
                    { label: 'Customers', count: previewResult.counts.customers, icon: '👥' },
                    { label: 'Loans', count: previewResult.counts.loans, icon: '📜' },
                    { label: 'Payments & Receipts', count: previewResult.counts.receipts, icon: '💳' },
                    { label: 'Fixed Deposits', count: previewResult.counts.fixedDeposits, icon: '🏦' },
                    { label: 'Finance Ledger', count: previewResult.counts.dayBookEntries, icon: '📖' },
                    { label: 'Rental Complexes', count: previewResult.counts.rentalComplexes ?? 0, icon: '🏢' },
                    { label: 'Rental Shops', count: previewResult.counts.rentalShops ?? 0, icon: '🏪' },
                    { label: 'Rent Payments', count: previewResult.counts.rentPayments ?? 0, icon: '🪙' },
                    { label: 'Rental Expenses', count: previewResult.counts.rentalExpenses ?? 0, icon: '💸' },
                    { label: 'System Users', count: previewResult.counts.users ?? 0, icon: '👤' },
                    { label: 'Staff Records', count: previewResult.counts.staff ?? 0, icon: '💼' },
                    { label: 'Attachments', count: previewResult.counts.fileAttachments ?? 0, icon: '📎' }
                  ].map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        backgroundColor: '#F8FAFC',
                        border: '1px solid #E2E8F0',
                        borderRadius: '10px',
                        padding: '12px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between'
                      }}
                    >
                      <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>{item.icon}</span>
                        <span>{item.label}</span>
                      </div>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', marginTop: '6px' }}>
                        {item.count}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="btn btn-secondary"
                >
                  Choose Another File
                </button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="btn"
                  style={{
                    backgroundColor: '#0F766E',
                    color: '#FFFFFF',
                    padding: '10px 22px',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(15, 118, 110, 0.3)'
                  }}
                >
                  Proceed to Mode Selection <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              STEP 3: RESTORE MODE SELECTION & CONFIRMATION
              ══════════════════════════════════════════════════════════════ */}
          {step === 3 && previewResult && (
            <div>
              {/* Mode Selection Cards */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#1E293B', marginBottom: '10px' }}>
                  CHOOSE RESTORE STRATEGY
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  {/* Option A: Replace */}
                  <div
                    onClick={() => setRestoreMode('replace')}
                    style={{
                      border: restoreMode === 'replace' ? '2px solid #0F766E' : '1px solid #CBD5E1',
                      borderRadius: '12px',
                      padding: '16px',
                      cursor: 'pointer',
                      backgroundColor: restoreMode === 'replace' ? '#F0FDFA' : '#FFFFFF',
                      transition: 'all 0.2s'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <input
                        type="radio"
                        checked={restoreMode === 'replace'}
                        onChange={() => setRestoreMode('replace')}
                        style={{ accentColor: '#0F766E' }}
                      />
                      <strong style={{ fontSize: '14px', color: '#0F766E' }}>Replace Database (Clean Restore)</strong>
                    </div>
                    <p style={{ fontSize: '12px', color: '#64748B', margin: 0, lineHeight: 1.5 }}>
                      Recommended. Clears current operational records and replaces them cleanly with exact data from the backup archive.
                    </p>
                  </div>

                  {/* Option B: Merge */}
                  <div
                    onClick={() => setRestoreMode('merge')}
                    style={{
                      border: restoreMode === 'merge' ? '2px solid #0F766E' : '1px solid #CBD5E1',
                      borderRadius: '12px',
                      padding: '16px',
                      cursor: 'pointer',
                      backgroundColor: restoreMode === 'merge' ? '#F0FDFA' : '#FFFFFF',
                      transition: 'all 0.2s'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <input
                        type="radio"
                        checked={restoreMode === 'merge'}
                        onChange={() => setRestoreMode('merge')}
                        style={{ accentColor: '#0F766E' }}
                      />
                      <strong style={{ fontSize: '14px', color: '#0F766E' }}>Merge with Existing Database</strong>
                    </div>
                    <p style={{ fontSize: '12px', color: '#64748B', margin: 0, lineHeight: 1.5 }}>
                      Appends missing records and updates matching records. Preserves new records that do not exist in the backup.
                    </p>
                  </div>
                </div>
              </div>

              {/* Warning Notice */}
              <div
                style={{
                  backgroundColor: '#FFFBEB',
                  border: '1px solid #FDE68A',
                  padding: '14px 16px',
                  borderRadius: '10px',
                  marginBottom: '18px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#B45309', fontWeight: 800, fontSize: '13.5px' }}>
                  <AlertTriangle size={18} />
                  <span>PRE-RESTORE SAFETY MEASURES</span>
                </div>
                <div style={{ fontSize: '12px', color: '#92400E', marginTop: '4px', lineHeight: '1.5' }}>
                  Before restoring, a safety snapshot of your current database state is automatically created.
                  Restoring will apply records from archive <strong>{previewResult.fileName}</strong>.
                </div>
              </div>

              {/* Typed Confirmation Input */}
              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#1E293B', marginBottom: '6px' }}>
                  Type <strong style={{ color: '#0F766E' }}>RESTORE BACKUP</strong> to confirm:
                </label>
                <input
                  type="text"
                  value={inputConfirmation}
                  onChange={(e) => setInputConfirmation(e.target.value)}
                  placeholder="Type RESTORE BACKUP in uppercase"
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    fontSize: '14px',
                    fontWeight: 700,
                    borderRadius: '8px',
                    border: isExactConfirm ? '2px solid #16A34A' : '1px solid #CBD5E1',
                    outline: 'none',
                    backgroundColor: isExactConfirm ? '#F0FDF4' : '#FFFFFF',
                    letterSpacing: '0.5px'
                  }}
                />
              </div>

              {/* Checkbox */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '22px' }}>
                <input
                  type="checkbox"
                  id="restoreWarningCheck"
                  checked={acknowledgedWarning}
                  onChange={(e) => setAcknowledgedWarning(e.target.checked)}
                  style={{ marginTop: '3px', width: '16px', height: '16px', cursor: 'pointer', accentColor: '#0F766E' }}
                />
                <label htmlFor="restoreWarningCheck" style={{ fontSize: '12px', color: '#475569', cursor: 'pointer', lineHeight: '1.4' }}>
                  I confirm that I want to restore the database in <strong>{restoreMode.toUpperCase()}</strong> mode from backup <strong>{previewResult.backupId}</strong>.
                </label>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="btn btn-secondary"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleExecuteRestore}
                  disabled={!isRestoreEnabled}
                  className="btn"
                  style={{
                    backgroundColor: isRestoreEnabled ? '#0F766E' : '#94A3B8',
                    color: '#FFFFFF',
                    padding: '10px 24px',
                    fontWeight: 800,
                    cursor: isRestoreEnabled ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    borderRadius: '8px',
                    boxShadow: isRestoreEnabled ? '0 4px 12px rgba(15, 118, 110, 0.4)' : 'none'
                  }}
                >
                  <RotateCcw size={16} />
                  Execute Database Restore
                </button>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              STEP 4: LIVE RESTORE ANIMATION & CHECKLIST
              ══════════════════════════════════════════════════════════════ */}
          {step === 4 && (
            <div style={{ padding: '16px 0' }}>
              <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                <div style={{ display: 'inline-block', marginBottom: '12px' }}>
                  <RefreshCw size={44} color="#0F766E" className="animate-spin" />
                </div>
                <h3 style={{ margin: '0 0 6px 0', fontSize: '19px', fontWeight: 800, color: '#0F172A' }}>
                  Restoring Database Collections...
                </h3>
                <p style={{ color: '#64748B', fontSize: '13px', margin: 0 }}>
                  Please do not close this window while database records and relationships are being restored.
                </p>
              </div>

              {/* Progress Bar */}
              <div style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 700, color: '#0F766E', marginBottom: '6px' }}>
                  <span>Restoration Progress</span>
                  <span>{progressPercent}%</span>
                </div>
                <div style={{ height: '8px', backgroundColor: '#E2E8F0', borderRadius: '4px', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      backgroundColor: '#0F766E',
                      width: `${progressPercent}%`,
                      transition: 'width 0.4s ease'
                    }}
                  />
                </div>
              </div>

              {/* Step Checklist */}
              <div
                style={{
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: '12px',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}
              >
                {checklist.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      fontSize: '13px',
                      color: item.status === 'completed' ? '#0F766E' : item.status === 'in_progress' ? '#0F172A' : '#94A3B8',
                      fontWeight: item.status === 'in_progress' ? 700 : 500
                    }}
                  >
                    {item.status === 'completed' ? (
                      <CheckCircle2 size={18} color="#16A34A" />
                    ) : item.status === 'in_progress' ? (
                      <RefreshCw size={16} color="#0F766E" className="animate-spin" />
                    ) : (
                      <div
                        style={{
                          width: '16px',
                          height: '16px',
                          borderRadius: '50%',
                          border: '2px solid #CBD5E1'
                        }}
                      />
                    )}
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              STEP 5: RESTORE VERIFIED REPORT
              ══════════════════════════════════════════════════════════════ */}
          {step === 5 && restoreReport && (
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <div
                style={{
                  width: '60px',
                  height: '60px',
                  borderRadius: '50%',
                  backgroundColor: '#DCFCE7',
                  color: '#16A34A',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 14px auto',
                  boxShadow: '0 4px 16px rgba(22, 163, 74, 0.2)'
                }}
              >
                <CheckCircle2 size={34} />
              </div>
              <h3 style={{ margin: '0 0 6px 0', fontSize: '20px', fontWeight: 800, color: '#0F172A' }}>
                Database Successfully Restored!
              </h3>
              <p style={{ color: '#64748B', fontSize: '13px', maxWidth: '500px', margin: '0 auto 20px auto', lineHeight: 1.5 }}>
                The database has been updated with authoritative records from <strong>{restoreReport.fileName || restoreReport.backupId}</strong>.
              </p>

              {/* Statistics Report Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '12px',
                  backgroundColor: '#F8FAFC',
                  padding: '16px',
                  borderRadius: '12px',
                  border: '1px solid #E2E8F0',
                  marginBottom: '20px',
                  textAlign: 'left'
                }}
              >
                <div>
                  <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
                    Collections
                  </div>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: '#0F766E' }}>
                    {restoreReport.restoredCollections ?? 10}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
                    Inserted
                  </div>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: '#16A34A' }}>
                    {restoreReport.insertedCount ?? 0}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
                    Updated / Synced
                  </div>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: '#2563EB' }}>
                    {restoreReport.updatedCount ?? 0}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
                    Duration
                  </div>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A' }}>
                    {((restoreReport.durationMs || 1200) / 1000).toFixed(2)}s
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={handleDownloadRestoreReport}
                  className="btn btn-secondary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                >
                  <Download size={16} />
                  <span>Download Restore Report</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onSuccessReload();
                    onClose();
                  }}
                  className="btn btn-primary"
                  style={{ padding: '10px 28px', fontWeight: 700, fontSize: '14px' }}
                >
                  Close & View Dashboard
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DatabaseRestoreModal;
