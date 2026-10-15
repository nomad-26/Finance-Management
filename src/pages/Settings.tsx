import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import {
  Save,
  Percent,
  Building,
  Shield,
  Printer,
  UserPlus,
  Search,
  CheckCircle,
  Trash2,
  RefreshCw,
  Edit2,
  Clock,
  Coins,
  X,
  Key,
  Eye,
  EyeOff,
  HardDrive,
  FileText,
  Server
} from 'lucide-react';
import { UserProfile, UserRole } from '../types';
import {
  MASTER_ADMIN_EMAIL,
  isMasterAdminEmail,
  getDefaultPermissionsForRole,
  isAdminRole
} from '../config/permissions';
import { COMPANY_CONFIG } from '../config/company';
import { LoanConfigurationSection } from '../components/admin/LoanConfigurationSection';
import { apiService, fetchWithAuth } from '../services/api';

export const Settings: React.FC = () => {
  const {
    showToast,
    userRole,
    staffList,
    fetchStaffList,
    createStaffAccount,
    updateStaffProfile,
    toggleStaffStatus,
    resetStaffPassword,
    deleteStaffAccount,
    fetchStaffAuditLogs,
    masterControlSettings,
    updateMasterControlSettings,
    branchSettings,
    updateBranchSettings,
    updateFDInterestRate,
    setCurrentPage
  } = useApp();

  const isMasterAdmin = isAdminRole(userRole);

  const [activeTab, setActiveTab] = useState<'branch' | 'financial' | 'loan-types' | 'security' | 'printer' | 'system-logs'>('branch');

  // System Diagnostics & Logs State
  const [systemLogs, setSystemLogs] = useState<string[]>([]);
  const [logFilePath, setLogFilePath] = useState<string>('');
  const [logsLoading, setLogsLoading] = useState(false);
  const [diagnosticsData, setDiagnosticsData] = useState<any>(null);

  const fetchSystemLogs = async () => {
    setLogsLoading(true);
    try {
      const [logsRes, diagRes] = await Promise.all([
        fetchWithAuth<any>('/admin/logs').catch(() => null),
        fetchWithAuth<any>('/admin/system/diagnostics').catch(() => null)
      ]);
      if (logsRes && logsRes.success && logsRes.data) {
        setSystemLogs(logsRes.data.lines || []);
        setLogFilePath(logsRes.data.logPath || '');
      }
      if (diagRes && diagRes.success && diagRes.data) {
        setDiagnosticsData(diagRes.data);
      }
    } catch (err) {
      console.warn('[Settings] Logs fetch notice:', err);
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'system-logs') {
      fetchSystemLogs();
    }
  }, [activeTab]);

  const [branchName, setBranchName] = useState(() => branchSettings?.businessTitle || `${COMPANY_CONFIG.businessName} - MAIN BRANCH`);
  const [address, setAddress] = useState(() => branchSettings?.branchAddress || COMPANY_CONFIG.address);
  const [phone, setPhone] = useState(() => branchSettings?.officialPhone || COMPANY_CONFIG.phone);
  const [gstin, setGstin] = useState(() => branchSettings?.gstin || COMPANY_CONFIG.gstin || '');

  // Financial Lending & Valuation Parameters
  const [goldRate22ct, setGoldRate22ct] = useState(() => String(masterControlSettings?.goldRate22ct || 6400));
  const [defaultInterestRate, setDefaultInterestRate] = useState(() => String(masterControlSettings?.goldLoanMonthlyRate || 2.0));
  const [cardFeeAmount, setCardFeeAmount] = useState(() => String(masterControlSettings?.defaultCardFee || 10));

  // FD Master Defaults State
  const [fdRateInput, setFdRateInput] = useState(() => String(masterControlSettings?.fdInterestRate ?? 12));
  const [fdTenureInput, setFdTenureInput] = useState(() => String(masterControlSettings?.fdDefaultTenureMonths ?? 12));
  const [fdMinAmountInput, setFdMinAmountInput] = useState(() => String(masterControlSettings?.fdMinimumAmount ?? 5000));
  const [fdRenewalPolicyInput, setFdRenewalPolicyInput] = useState(() => masterControlSettings?.fdRenewalPolicy || 'MANUAL');
  const [fdCalculationMethodInput, setFdCalculationMethodInput] = useState(() => masterControlSettings?.fdCalculationMethod || 'MONTHLY_DIVIDEND');
  const [fdRateEffectiveDate, setFdRateEffectiveDate] = useState(() =>
    masterControlSettings?.fdInterestRateEffectiveFrom || new Date().toLocaleDateString('en-GB').replace(/\//g, '-')
  );
  const [fdRateNotes, setFdRateNotes] = useState('');
  const [showFdRateConfirmModal, setShowFdRateConfirmModal] = useState(false);

  const [printerFormat, setPrinterFormat] = useState('A4 Laser Standard');

  useEffect(() => {
    if (masterControlSettings?.goldRate22ct) {
      setGoldRate22ct(String(masterControlSettings.goldRate22ct));
    }
    if (masterControlSettings?.goldLoanMonthlyRate) {
      setDefaultInterestRate(String(masterControlSettings.goldLoanMonthlyRate));
    }
    if (masterControlSettings?.defaultCardFee !== undefined) {
      setCardFeeAmount(String(masterControlSettings.defaultCardFee));
    }
    if (masterControlSettings?.fdInterestRate !== undefined) {
      setFdRateInput(String(masterControlSettings.fdInterestRate));
    }
    if (masterControlSettings?.fdDefaultTenureMonths !== undefined) {
      setFdTenureInput(String(masterControlSettings.fdDefaultTenureMonths));
    }
    if (masterControlSettings?.fdMinimumAmount !== undefined) {
      setFdMinAmountInput(String(masterControlSettings.fdMinimumAmount));
    }
    if (masterControlSettings?.fdRenewalPolicy) {
      setFdRenewalPolicyInput(masterControlSettings.fdRenewalPolicy);
    }
    if (masterControlSettings?.fdCalculationMethod) {
      setFdCalculationMethodInput(masterControlSettings.fdCalculationMethod);
    }
  }, [masterControlSettings]);

  // Staff Search & Filter State
  const [staffSearch, setStaffSearch] = useState('');
  const [staffRoleFilter, setStaffRoleFilter] = useState<'ALL' | UserRole>('ALL');
  const [isAddStaffModalOpen, setIsAddStaffModalOpen] = useState(false);
  const [managingStaff, setManagingStaff] = useState<UserProfile | null>(null);

  // Viewport Responsive Breakpoint State (>=1024px: Desktop Table only, <1024px: Mobile Cards only)
  const [isMobileView, setIsMobileView] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 1024 : false));

  useEffect(() => {
    const handleResize = () => {
      setIsMobileView(window.innerWidth < 1024);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Add Staff Form State
  const [addName, setAddName] = useState('');
  const [addEmail, setAddEmail] = useState('');
  const [addRole, setAddRole] = useState<'STAFF' | 'RENTAL_STAFF'>('STAFF');
  const [addKycAccess, setAddKycAccess] = useState(false);
  const [addPassword, setAddPassword] = useState('');
  const [showAddPassword, setShowAddPassword] = useState(false);
  const [createdStaffSummary, setCreatedStaffSummary] = useState<{
    name: string;
    staffId: string;
    email: string;
    role: string;
    kycAccess: boolean;
    driveAccessGranted?: boolean;
    driveAccessStatus?: string;
  } | null>(null);

  // Edit Staff State
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState<'STAFF' | 'RENTAL_STAFF' | 'ADMIN'>('STAFF');
  const [editKycAccess, setEditKycAccess] = useState(true);
  const [editPassword, setEditPassword] = useState('');
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset Password Modal State
  const [resetStaffTarget, setResetStaffTarget] = useState<UserProfile | null>(null);
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [showResetNewPassword, setShowResetNewPassword] = useState(false);
  const [showResetConfirmPassword, setShowResetConfirmPassword] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  // Delete Staff Modal State
  const [deleteStaffTarget, setDeleteStaffTarget] = useState<UserProfile | null>(null);
  const [isDeletingStaff, setIsDeletingStaff] = useState(false);

  // Drive Access Retry State
  const [retryingDriveAccess, setRetryingDriveAccess] = useState<string | null>(null); // staffId being retried

  const handleOpenDeleteModal = (staff: UserProfile) => {
    setDeleteStaffTarget(staff);
  };

  const handleConfirmDeleteStaff = async () => {
    if (!deleteStaffTarget) return;
    const targetId = deleteStaffTarget.uid || deleteStaffTarget.id || deleteStaffTarget.staffId || '';
    if (!targetId) return;

    setIsDeletingStaff(true);
    const res = await deleteStaffAccount(targetId);
    setIsDeletingStaff(false);
    if (res.success) {
      setDeleteStaffTarget(null);
    }
  };

  const handleRetryDriveAccess = async (staff: UserProfile) => {
    const staffId = staff.uid || staff.id || staff.staffId || '';
    if (!staffId) return;
    setRetryingDriveAccess(staffId);
    try {
      const res = await apiService.retryStaffDriveAccess(staffId);
      if (res.success) {
        showToast(`✅ Google Drive KYC access granted to ${staff.email || staff.displayName}`, 'success');
      } else {
        showToast(res.message || 'Failed to grant Drive access. Check Drive configuration.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to retry Drive access.', 'error');
    } finally {
      setRetryingDriveAccess(null);
    }
  };


  useEffect(() => {
    if (activeTab === 'security') {
      fetchStaffList();
      fetchStaffAuditLogs();
    }
  }, [activeTab]);

  useEffect(() => {
    if (branchSettings) {
      if (branchSettings.businessTitle) setBranchName(branchSettings.businessTitle);
      if (branchSettings.branchAddress) setAddress(branchSettings.branchAddress);
      if (branchSettings.officialPhone) setPhone(branchSettings.officialPhone);
      if (branchSettings.gstin !== undefined) setGstin(branchSettings.gstin);
    }
  }, [branchSettings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchName.trim()) {
      showToast('Branch Business Title is required.', 'warning');
      return;
    }
    if (!phone.trim()) {
      showToast('Official Phone is required.', 'warning');
      return;
    }
    if (!address.trim()) {
      showToast('Branch Address is required.', 'warning');
      return;
    }

    const success = await updateBranchSettings({
      businessTitle: branchName.trim(),
      branchAddress: address.trim(),
      officialPhone: phone.trim(),
      gstin: gstin.trim()
    });

    if (success) {
      showToast('Branch settings saved successfully!', 'success');
    }
  };

  const handleSaveFinancial = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isMasterAdmin) {
      showToast('Permission denied. Only Master Admin can modify financial settings.', 'error');
      return;
    }

    const rate = Number(goldRate22ct) || 6400;
    const loanRate = Number(defaultInterestRate) || 2.0;
    const fee = Number(cardFeeAmount) || 10;
    const newFdRate = parseFloat(fdRateInput);

    // If FD rate has been changed, trigger confirmation modal for audit safety
    const currentFdRate = masterControlSettings?.fdInterestRate ?? 12;
    if (!isNaN(newFdRate) && newFdRate !== currentFdRate) {
      setShowFdRateConfirmModal(true);
      return;
    }

    updateMasterControlSettings({
      goldRate22ct: rate,
      goldLoanMonthlyRate: loanRate,
      defaultCardFee: fee,
      fdInterestRate: !isNaN(newFdRate) ? newFdRate : (masterControlSettings?.fdInterestRate ?? 12),
      fdDefaultTenureMonths: Number(fdTenureInput) || 12,
      fdMinimumAmount: Number(fdMinAmountInput) || 5000,
      fdRenewalPolicy: fdRenewalPolicyInput,
      fdCalculationMethod: fdCalculationMethodInput
    });
    showToast('Master Control financial parameters saved successfully!', 'success');
  };

  const handleConfirmFdRateChange = () => {
    const numRate = parseFloat(fdRateInput);
    if (isNaN(numRate) || numRate <= 0 || numRate > 36) {
      showToast('Please enter a valid interest rate between 0.25% and 36.00% p.a.', 'error');
      return;
    }

    const ok = updateFDInterestRate(numRate, fdRateEffectiveDate, fdRateNotes);
    if (ok) {
      // Also save the gold, loan and FD parameters
      updateMasterControlSettings({
        goldRate22ct: Number(goldRate22ct) || 6400,
        goldLoanMonthlyRate: Number(defaultInterestRate) || 2.0,
        defaultCardFee: Number(cardFeeAmount) || 10,
        fdInterestRate: numRate,
        fdDefaultTenureMonths: Number(fdTenureInput) || 12,
        fdMinimumAmount: Number(fdMinAmountInput) || 5000,
        fdRenewalPolicy: fdRenewalPolicyInput,
        fdCalculationMethod: fdCalculationMethodInput
      });
      setShowFdRateConfirmModal(false);
      setFdRateNotes('');
    }
  };

  const handleOpenAddStaff = () => {
    setAddName('');
    setAddEmail('');
    setAddRole('STAFF');
    setAddKycAccess(false);
    setAddPassword('');
    setShowAddPassword(false);
    setCreatedStaffSummary(null);
    setIsAddStaffModalOpen(true);
  };

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = addName.trim();
    const cleanEmail = addEmail.trim().toLowerCase();
    const cleanPassword = addPassword.trim();

    if (!cleanName) {
      showToast('Staff name is required.', 'warning');
      return;
    }

    if (!cleanEmail || !cleanEmail.includes('@')) {
      showToast('Please enter a valid email address.', 'warning');
      return;
    }

    if (!cleanPassword) {
      showToast('Password is required.', 'warning');
      return;
    }

    if (cleanPassword.length < 6) {
      showToast('Password must be at least 6 characters long.', 'warning');
      return;
    }

    setIsSubmitting(true);
    const basePermissions = getDefaultPermissionsForRole(addRole);
    const finalPermissions = {
      ...basePermissions,
      viewKyc: addKycAccess,
      customers: {
        ...basePermissions.customers,
        view: addKycAccess ? true : (basePermissions.customers?.view ?? false)
      }
    };

    const res = await createStaffAccount({
      email: cleanEmail,
      displayName: cleanName,
      fullName: cleanName,
      role: addRole,
      department: addRole === 'RENTAL_STAFF' ? 'Rental Management' : 'Finance Operations',
      permissions: finalPermissions,
      password: cleanPassword
    });
    setIsSubmitting(false);

    if (res.success) {
      setCreatedStaffSummary({
        name: cleanName,
        staffId: res.data?.staffId || res.data?.id || 'KKV-STAFF-NEW',
        email: cleanEmail,
        role: addRole,
        kycAccess: addKycAccess,
        driveAccessGranted: res.data?.driveAccessGranted,
        driveAccessStatus: res.data?.driveAccessStatus
      });
      showToast(`Staff account created for ${cleanName}.`, 'success');
      fetchStaffList();
    } else {
      showToast(res.message || 'Failed to create staff account.', 'error');
    }
  };

  const handleOpenManageStaff = (staff: any) => {
    setManagingStaff(staff);
    setEditName(staff.displayName || staff.fullName || '');
    setEditEmail(staff.email || '');
    const currentRole = staff.role === 'RENTAL_STAFF' ? 'RENTAL_STAFF' : (staff.role === 'ADMIN' ? 'ADMIN' : 'STAFF');
    setEditRole(currentRole);
    setEditKycAccess(staff.role === 'ADMIN' || (staff.role as string === 'MASTER_ADMIN') || ((staff as any).permissions?.viewKyc === true && (staff as any).permissions?.customers?.view === true));
    setEditPassword('');
    setShowEditPassword(false);
  };

  const handleSaveEditStaff = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!managingStaff) return;
    const cleanName = editName.trim();
    if (!cleanName) {
      showToast('Staff name cannot be empty.', 'warning');
      return;
    }

    if (editPassword && editPassword.trim().length < 6) {
      showToast('New password must be at least 6 characters long.', 'warning');
      return;
    }

    setIsSubmitting(true);
    const isTargetAdmin = isAdminRole(managingStaff.role);
    const basePermissions = managingStaff.permissions || getDefaultPermissionsForRole(isTargetAdmin ? 'ADMIN' : editRole);
    const updatedPermissions = isTargetAdmin ? basePermissions : {
      ...basePermissions,
      viewKyc: editKycAccess,
      customers: {
        ...(basePermissions.customers || {}),
        view: editKycAccess ? true : (basePermissions.customers?.view ?? false)
      }
    };

    const updatePayload: any = {
      displayName: cleanName,
      fullName: cleanName,
      role: isTargetAdmin ? 'ADMIN' : editRole,
      permissions: updatedPermissions
    };
    if (editPassword && editPassword.trim()) {
      updatePayload.password = editPassword.trim();
    }

    const res = await updateStaffProfile(managingStaff.uid, updatePayload);
    setIsSubmitting(false);
    if (res.success) {
      setManagingStaff(null);
    }
  };

  const handleOpenResetPasswordModal = (staff: UserProfile) => {
    setResetStaffTarget(staff);
    setResetNewPassword('');
    setResetConfirmPassword('');
    setShowResetNewPassword(false);
    setShowResetConfirmPassword(false);
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetStaffTarget) return;

    if (!resetNewPassword) {
      showToast('New password is required.', 'warning');
      return;
    }

    if (resetNewPassword.length < 8) {
      showToast('Password must be at least 8 characters long.', 'warning');
      return;
    }

    if (resetNewPassword !== resetConfirmPassword) {
      showToast('Passwords do not match. Please verify and retry.', 'warning');
      return;
    }

    setIsResettingPassword(true);
    const targetId = resetStaffTarget.uid || resetStaffTarget.id || resetStaffTarget.staffId || '';
    const res = await resetStaffPassword(targetId, resetNewPassword.trim());
    setIsResettingPassword(false);

    if (res.success) {
      setResetStaffTarget(null);
      setResetNewPassword('');
      setResetConfirmPassword('');
    }
  };

  const filteredStaff = staffList.filter((s) => {
    const matchesSearch =
      s.displayName.toLowerCase().includes(staffSearch.toLowerCase()) ||
      s.email.toLowerCase().includes(staffSearch.toLowerCase()) ||
      ((s.staffId || '').toLowerCase().includes(staffSearch.toLowerCase()));
    const matchesRole = staffRoleFilter === 'ALL' || s.role === staffRoleFilter;
    return matchesSearch && matchesRole;
  });

  const fdHistory = masterControlSettings?.fdInterestRateHistory || [];

  if (!isMasterAdmin) {
    return (
      <div className="page-content" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <div className="card" style={{ padding: '40px 32px', textAlign: 'center', maxWidth: '520px', width: '100%' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '50%', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <Shield size={28} />
          </div>
          <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px' }}>
            Access Restricted
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '24px', lineHeight: 1.5 }}>
            Settings and system configuration are restricted strictly to <strong>Master Admin</strong>. Operational staff accounts do not have permission to access this area.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setCurrentPage('dashboard')}
            style={{ margin: '0 auto' }}
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content">
      {/* ════════════════════════════════════════════════════════════════════════
          SETTINGS NAVIGATION TABS
          ════════════════════════════════════════════════════════════════════════ */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <button
          className={`btn btn-sm ${activeTab === 'branch' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('branch')}
        >
          <Building size={14} />
          <span>Branch Profile</span>
        </button>
        <button
          className={`btn btn-sm ${activeTab === 'printer' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('printer')}
        >
          <Printer size={14} />
          <span>Voucher Printer</span>
        </button>
        <button
          className={`btn btn-sm ${activeTab === 'security' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('security')}
        >
          <Shield size={14} />
          <span>Security &amp; Staff</span>
        </button>
        <button
          className={`btn btn-sm ${activeTab === 'system-logs' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('system-logs')}
        >
          <FileText size={14} />
          <span>System Diagnostics &amp; Logs</span>
        </button>
      </div>

      {/* ── SYSTEM DIAGNOSTICS & LOGS TAB ── */}
      {activeTab === 'system-logs' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Diagnostics Card */}
          <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 className="card-title">
                  <Server size={18} color="var(--color-primary-accent)" />
                  <span>Hardware &amp; System Diagnostics</span>
                </h2>
                <p className="card-description">Desktop runtime host specifications and directory telemetry</p>
              </div>
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={fetchSystemLogs}
                disabled={logsLoading}
              >
                <RefreshCw size={13} className={logsLoading ? 'animate-spin' : ''} />
                <span>Refresh</span>
              </button>
            </div>

            {diagnosticsData && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                <div style={{ backgroundColor: 'var(--bg-surface-secondary)', border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '12px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Operating System</div>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '4px' }}>
                    Windows {diagnosticsData.osRelease} ({diagnosticsData.arch})
                  </div>
                </div>

                <div style={{ backgroundColor: 'var(--bg-surface-secondary)', border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '12px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>RAM (Memory)</div>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '4px' }}>
                    {diagnosticsData.totalMemoryFormatted} ({diagnosticsData.freeMemoryFormatted} Free)
                  </div>
                </div>

                <div style={{ backgroundColor: 'var(--bg-surface-secondary)', border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '12px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Processor Cores</div>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '4px' }}>
                    {diagnosticsData.cpuCount} Logical Cores
                  </div>
                </div>

                <div style={{ backgroundColor: 'var(--bg-surface-secondary)', border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '12px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Data Storage Path</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {diagnosticsData.userDataPath}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* System Logs Tail Card */}
          <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h2 className="card-title">
                  <FileText size={18} color="var(--color-primary-accent)" />
                  <span>Production System Logs</span>
                </h2>
                <p className="card-description">Live log records from <code>{logFilePath || 'backend.log'}</code></p>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={async () => {
                    if (typeof window !== 'undefined' && (window as any).desktopAPI?.openLogsFolder) {
                      await (window as any).desktopAPI.openLogsFolder();
                    } else {
                      showToast('Opening logs folder is supported in the Desktop application.', 'info');
                    }
                  }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <HardDrive size={14} />
                  <span>Open Logs Folder</span>
                </button>

                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={fetchSystemLogs}
                  disabled={logsLoading}
                >
                  <RefreshCw size={13} className={logsLoading ? 'animate-spin' : ''} />
                  <span>Reload Logs</span>
                </button>
              </div>
            </div>

            <div
              style={{
                backgroundColor: '#0F172A',
                color: '#E2E8F0',
                padding: '16px',
                borderRadius: '10px',
                fontFamily: 'Consolas, Monaco, monospace',
                fontSize: '12px',
                lineHeight: 1.6,
                maxHeight: '400px',
                overflowY: 'auto',
                border: '1px solid #334155'
              }}
            >
              {systemLogs.length === 0 ? (
                <div style={{ color: '#94A3B8', textAlign: 'center', padding: '20px' }}>
                  No log entries found. Backend is running cleanly.
                </div>
              ) : (
                systemLogs.map((line, idx) => (
                  <div key={idx} style={{ wordBreak: 'break-all', marginBottom: '2px' }}>
                    {line}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── LOAN TYPES TAB ── */}
      {activeTab === 'loan-types' && (
        <div>
          <LoanConfigurationSection />
        </div>
      )}

      {/* ── 1. BRANCH PROFILE TAB ── */}
      {activeTab === 'branch' && (
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="card">
            <div className="card-header">
              <div>
                <h2 className="card-title">
                  <Building size={18} color="var(--color-primary-accent)" />
                  <span>Branch &amp; Company Profile</span>
                </h2>
                <p className="card-description">Official header details displayed on disbursement receipts and FD certificates</p>
              </div>
              <span className="badge badge-success">Branch #01 Active</span>
            </div>

            <div className="grid-2" style={{ marginBottom: '14px' }}>
              <div className="form-group">
                <label className="form-label required">Branch Business Title</label>
                <input
                  type="text"
                  className="input-control"
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label required">Official Phone</label>
                <input
                  type="text"
                  className="input-control"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            </div>

            <div className="grid-2">
              <div className="form-group">
                <label className="form-label required">Branch Address &amp; Pincode</label>
                <input
                  type="text"
                  className="input-control"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">GSTIN / Registration No</label>
                <input
                  type="text"
                  className="input-control"
                  value={gstin}
                  onChange={(e) => setGstin(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 22px' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              All settings apply across all branch cash counters and appraisal desks.
            </span>
            <button type="submit" className="btn btn-primary btn-lg">
              <Save size={16} />
              <span>Save Settings</span>
            </button>
          </div>
        </form>
      )}

      {/* ── 2. GOLD RATES & RATES TAB ── */}
      {activeTab === 'financial' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <form onSubmit={handleSaveFinancial} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="card" style={{ padding: '24px', backgroundColor: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '22px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '14px' }}>
                <div>
                  <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: 'var(--text-dark)', letterSpacing: '0.01em' }}>
                    CENTRAL MASTER CONTROL
                  </h2>
                  <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
                    Authoritative global single source of truth for gold valuation, loan defaults, and Fixed Deposit parameters.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span className="badge badge-info" style={{ fontSize: '11px', fontWeight: 700, padding: '4px 10px' }}>
                    Config Version: v{masterControlSettings?.configurationVersion || 1}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* ════════════════════════════════════════════════════════════════════════
                    SECTION 1: GOLD & VALUATION
                    ════════════════════════════════════════════════════════════════════════ */}
                <div style={{ padding: '18px', borderRadius: '10px', backgroundColor: 'var(--bg-surface-secondary)', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <Coins size={18} color="var(--color-gold-primary, #dfb83d)" />
                    <h3 style={{ fontSize: '14px', fontWeight: 800, margin: 0, color: 'var(--text-dark)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                      GOLD &amp; VALUATION
                    </h3>
                  </div>

                  <div className="form-group" style={{ margin: 0, maxWidth: '400px' }}>
                    <label className="form-label required" style={{ fontSize: '12px', fontWeight: 700 }}>
                      22CT GOLD RATE (₹ / GRAM) *
                    </label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontWeight: 700, color: 'var(--text-muted)' }}>₹</span>
                      <input
                        type="number"
                        className="input-control"
                        style={{ paddingLeft: '28px', height: '38px', fontSize: '14px', fontWeight: 700 }}
                        value={goldRate22ct}
                        onChange={(e) => setGoldRate22ct(e.target.value)}
                        required
                        disabled={!isMasterAdmin}
                      />
                    </div>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                      Used for gold/ornament market valuation and collateral calculations across new Gold Loans.
                    </span>
                  </div>
                </div>

                {/* ════════════════════════════════════════════════════════════════════════
                    SECTION 2: LOAN DEFAULTS
                    ════════════════════════════════════════════════════════════════════════ */}
                <div style={{ padding: '18px', borderRadius: '10px', backgroundColor: 'var(--bg-surface-secondary)', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <Percent size={18} color="var(--color-primary-accent, #10B981)" />
                    <h3 style={{ fontSize: '14px', fontWeight: 800, margin: 0, color: 'var(--text-dark)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                      LOAN DEFAULTS
                    </h3>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label required" style={{ fontSize: '12px', fontWeight: 700 }}>
                        DEFAULT MONTHLY LOAN INTEREST (%) *
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        className="input-control"
                        style={{ height: '38px', fontSize: '13.5px' }}
                        value={defaultInterestRate}
                        onChange={(e) => setDefaultInterestRate(e.target.value)}
                        required
                        disabled={!isMasterAdmin}
                      />
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                        Default global base interest percentage per month for loans inheriting Master Control.
                      </span>
                    </div>

                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label required" style={{ fontSize: '12px', fontWeight: 700 }}>
                        CARD PROCESSING FEE (₹)
                      </label>
                      <input
                        type="number"
                        className="input-control"
                        style={{ height: '38px', fontSize: '13.5px' }}
                        value={cardFeeAmount}
                        onChange={(e) => setCardFeeAmount(e.target.value)}
                        required
                        disabled={!isMasterAdmin}
                      />
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                        Default global card and passbook issuance processing fee.
                      </span>
                    </div>
                  </div>
                </div>

                {/* ════════════════════════════════════════════════════════════════════════
                    SECTION 3: FIXED DEPOSIT DEFAULTS
                    ════════════════════════════════════════════════════════════════════════ */}
                <div style={{ padding: '18px', borderRadius: '10px', backgroundColor: 'var(--bg-surface-secondary)', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Percent size={18} color="var(--color-primary-dark, #176B52)" />
                      <h3 style={{ fontSize: '14px', fontWeight: 800, margin: 0, color: 'var(--text-dark)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                        FIXED DEPOSIT DEFAULTS
                      </h3>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '11.5px', padding: '3px 8px', borderRadius: '6px', backgroundColor: 'var(--badge-success-bg)', color: 'var(--badge-success-text)', fontWeight: 700 }}>
                        Active Default: {(masterControlSettings?.fdInterestRate ?? 12).toFixed(2)}% p.a.
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label required" style={{ fontSize: '12px', fontWeight: 700 }}>
                        DEFAULT FD INTEREST RATE (% P.A.) *
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        className="input-control"
                        style={{ height: '38px', fontSize: '14px', fontWeight: 700 }}
                        value={fdRateInput}
                        onChange={(e) => setFdRateInput(e.target.value)}
                        required
                        disabled={!isMasterAdmin}
                      />
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                        Default annual rate applied to NEW Fixed Deposits.
                      </span>
                    </div>

                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label required" style={{ fontSize: '12px', fontWeight: 700 }}>
                        DEFAULT FD TENURE (MONTHS) *
                      </label>
                      <input
                        type="number"
                        className="input-control"
                        style={{ height: '38px', fontSize: '13.5px' }}
                        value={fdTenureInput}
                        onChange={(e) => setFdTenureInput(e.target.value)}
                        min={1}
                        max={120}
                        required
                        disabled={!isMasterAdmin}
                      />
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                        Default deposit tenure for new deposit creation.
                      </span>
                    </div>

                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label required" style={{ fontSize: '12px', fontWeight: 700 }}>
                        MINIMUM FD AMOUNT (₹) *
                      </label>
                      <input
                        type="number"
                        className="input-control"
                        style={{ height: '38px', fontSize: '13.5px' }}
                        value={fdMinAmountInput}
                        onChange={(e) => setFdMinAmountInput(e.target.value)}
                        min={0}
                        required
                        disabled={!isMasterAdmin}
                      />
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                        Minimum allowable deposit principal for new FD accounts.
                      </span>
                    </div>

                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" style={{ fontSize: '12px', fontWeight: 700 }}>
                        RENEWAL POLICY
                      </label>
                      <select
                        className="input-control"
                        style={{ height: '38px', fontSize: '13px' }}
                        value={fdRenewalPolicyInput}
                        onChange={(e) => setFdRenewalPolicyInput(e.target.value)}
                        disabled={!isMasterAdmin}
                      >
                        <option value="MANUAL">Manual Renewal on Maturity</option>
                        <option value="AUTO_RENEW_PRINCIPAL">Auto-Renew Principal Only</option>
                        <option value="AUTO_RENEW_ALL">Auto-Renew Principal + Interest</option>
                      </select>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                        Default maturity rollover policy for Fixed Deposits.
                      </span>
                    </div>

                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" style={{ fontSize: '12px', fontWeight: 700 }}>
                        PAYOUT / COMPOUNDING METHOD
                      </label>
                      <select
                        className="input-control"
                        style={{ height: '38px', fontSize: '13px' }}
                        value={fdCalculationMethodInput}
                        onChange={(e) => setFdCalculationMethodInput(e.target.value)}
                        disabled={!isMasterAdmin}
                      >
                        <option value="MONTHLY_DIVIDEND">Monthly Dividend Payout</option>
                        <option value="QUARTERLY_COMPOUNDING">Quarterly Compounding</option>
                        <option value="CUMULATIVE_AT_MATURITY">Cumulative at Maturity</option>
                        <option value="SIMPLE">Simple Interest</option>
                      </select>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                        Default interest calculation schedule.
                      </span>
                    </div>

                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" style={{ fontSize: '12px', fontWeight: 700 }}>
                        EFFECTIVE DATE
                      </label>
                      <input
                        type="text"
                        className="input-control"
                        style={{ height: '38px', fontSize: '13px' }}
                        value={fdRateEffectiveDate}
                        onChange={(e) => setFdRateEffectiveDate(e.target.value)}
                        placeholder="DD-MM-YYYY"
                        disabled={!isMasterAdmin}
                      />
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                        Date from which this new default rate applies to new deposits.
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Bar */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '22px', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)', flexWrap: 'wrap', gap: '12px' }}>
                <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                  {isMasterAdmin ? 'Changes here affect future loan collateral valuations and new deposit contracts.' : '🔒 View Only Mode — Master Admin permission required to edit.'}
                </span>
                {isMasterAdmin && (
                  <button type="submit" className="btn btn-primary" style={{ fontWeight: 700, padding: '9px 24px' }}>
                    <Save size={16} />
                    <span>Save Settings</span>
                  </button>
                )}
              </div>
            </div>
          </form>

          {/* ════════════════════════════════════════════════════════════════════════
              SECTION 4: FD INTEREST RATE HISTORY & AUDIT TRAIL
              ════════════════════════════════════════════════════════════════════════ */}
          {fdHistory.length > 0 && (
            <div className="card" style={{ padding: '24px', backgroundColor: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <Clock size={16} color="var(--color-primary-accent)" />
                <h3 style={{ fontSize: '15px', fontWeight: 800, margin: 0, color: 'var(--text-dark)' }}>
                  FD INTEREST RATE HISTORY &amp; AUDIT TRAIL
                </h3>
              </div>

              <div className="table-container" style={{ overflowX: 'auto' }}>
                <table className="custom-table" style={{ fontSize: '12.5px', minWidth: '600px' }}>
                  <thead>
                    <tr>
                      <th>EFFECTIVE DATE</th>
                      <th>NEW RATE (% P.A.)</th>
                      <th>PREVIOUS RATE</th>
                      <th>CHANGED BY</th>
                      <th>NOTES</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fdHistory.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <strong style={{ color: 'var(--text-dark)' }}>{item.effectiveFrom}</strong>
                          {item.effectiveTo && (
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>
                              to {item.effectiveTo}
                            </span>
                          )}
                        </td>
                        <td>
                          <span style={{ fontWeight: 800, color: 'var(--color-primary-dark)' }}>
                            {item.rate.toFixed(2)}%
                          </span>
                        </td>
                        <td>
                          <span style={{ color: 'var(--text-muted)' }}>
                            {item.previousRate !== undefined ? `${item.previousRate.toFixed(2)}%` : '—'}
                          </span>
                        </td>
                        <td>
                          <span>{item.changedBy || 'Master Admin'}</span>
                        </td>
                        <td>
                          <span style={{ color: 'var(--text-secondary)' }}>{item.notes || '—'}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 3. VOUCHER PRINTER TAB ── */}
      {activeTab === 'printer' && (
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="card">
            <div className="card-header">
              <div>
                <h2 className="card-title">
                  <Printer size={18} color="var(--color-primary-accent)" />
                  <span>Receipt Voucher &amp; Certificate Template</span>
                </h2>
                <p className="card-description">Configure print paper format and signature labels</p>
              </div>
            </div>

            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Default Printer Layout</label>
                <select
                  className="select-control"
                  value={printerFormat}
                  onChange={(e) => setPrinterFormat(e.target.value)}
                >
                  <option value="A4 Laser Standard">A4 Laser Standard (Dual Copy)</option>
                  <option value="Thermal Roll 80mm">Thermal Roll 80mm</option>
                  <option value="Dot Matrix Continuous">Dot Matrix Continuous Slip</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Auto-Print On Disbursement</label>
                <select className="select-control">
                  <option value="yes">Yes (Immediate Print Dialog)</option>
                  <option value="no">No (Manual Print Click)</option>
                </select>
              </div>
            </div>
          </div>

          <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 22px' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              All settings apply across all branch cash counters and appraisal desks.
            </span>
            <button type="submit" className="btn btn-primary btn-lg">
              <Save size={16} />
              <span>Save Settings</span>
            </button>
          </div>
        </form>
      )}

      {/* ── 4. SECURITY & STAFF MANAGEMENT (Master Admin Protected) ── */}
      {activeTab === 'security' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Master Account Banner Card - Compact, High-Contrast & Protected Root */}
          <div
            className="card"
            style={{
              border: '1px solid #e2e8f0',
              backgroundColor: '#ffffff',
              padding: '14px 20px',
              borderRadius: '10px',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '50%',
                    backgroundColor: '#fef3c7',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1.5px solid #fcd34d',
                    flexShrink: 0
                  }}
                >
                  <Shield size={18} color="#b45309" />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: '#0f172a', letterSpacing: '0.02em' }}>
                      PRIMARY MASTER ACCOUNT
                    </h3>
                    <span
                      style={{
                        fontSize: '10.5px',
                        backgroundColor: '#fef3c7',
                        color: '#92400e',
                        padding: '2px 8px',
                        borderRadius: '9999px',
                        fontWeight: 800,
                        border: '1px solid #fcd34d'
                      }}
                    >
                      👑 MASTER ADMIN
                    </span>
                    <span
                      style={{
                        fontSize: '10.5px',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '9999px',
                        backgroundColor: '#dcfce7',
                        color: '#15803d',
                        border: '1px solid #86efac'
                      }}
                    >
                      ● ACTIVE
                    </span>
                  </div>
                  <p style={{ margin: '2px 0 0', fontSize: '12.5px', color: '#475569', fontWeight: 500 }}>
                    {MASTER_ADMIN_EMAIL}
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#f8fafc', padding: '5px 12px', borderRadius: '9999px', border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '11.5px', color: '#475569', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span>🔒</span> Protected Root Account
                </span>
              </div>
            </div>
          </div>

          {/* Staff Directory Card */}
          <div className="card" style={{ padding: '20px 24px', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)' }}>
            <div className="card-header" style={{ flexWrap: 'wrap', gap: '12px', paddingBottom: '14px', marginBottom: '16px', borderBottom: '1px solid #f1f5f9' }}>
              <div>
                <h2 className="card-title" style={{ fontSize: '16px', fontWeight: 800, gap: '8px', color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center' }}>
                  <Shield size={18} color="#0d2818" />
                  <span>Staff &amp; Role-Based Access Control</span>
                </h2>
                <p className="card-description" style={{ fontSize: '12.5px', color: '#64748b', marginTop: '3px', margin: 0 }}>
                  Manage staff accounts, roles and account status
                </p>
              </div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ height: '36px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '12.5px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', color: '#1e293b' }}
                  onClick={() => {
                    fetchStaffList();
                    fetchStaffAuditLogs();
                  }}
                >
                  <RefreshCw size={14} />
                  <span>Refresh</span>
                </button>
                {isMasterAdmin && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    style={{ height: '36px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '12.5px' }}
                    onClick={handleOpenAddStaff}
                  >
                    <UserPlus size={15} />
                    <span>+ Add Staff</span>
                  </button>
                )}
              </div>
            </div>

            {/* Search + Filter Bar */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ position: 'relative', flex: '1 1 300px', minWidth: '220px' }}>
                <Search
                  size={15}
                  style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}
                />
                <input
                  type="text"
                  placeholder="Search staff by name, email or ID..."
                  className="input-control"
                  style={{ paddingLeft: '34px', paddingRight: staffSearch ? '30px' : '12px', height: '38px', fontSize: '13px', width: '100%', border: '1px solid #cbd5e1', borderRadius: '8px', color: '#0f172a' }}
                  value={staffSearch}
                  onChange={(e) => setStaffSearch(e.target.value)}
                />
                {staffSearch && (
                  <button
                    type="button"
                    onClick={() => setStaffSearch('')}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: '#94a3b8',
                      cursor: 'pointer',
                      padding: '2px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                    title="Clear Search"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                {(
                  [
                    { key: 'ALL', label: 'ALL', count: staffList.length },
                    { key: 'STAFF', label: 'STAFF', count: staffList.filter((s) => s.role === 'STAFF').length },
                    { key: 'RENTAL_STAFF', label: 'RENTAL STAFF', count: staffList.filter((s) => s.role === 'RENTAL_STAFF').length }
                  ] as const
                ).map((r) => {
                  const isActive = staffRoleFilter === r.key;
                  return (
                    <button
                      key={r.key}
                      type="button"
                      style={{
                        fontSize: '12px',
                        padding: '6px 14px',
                        borderRadius: '9999px',
                        fontWeight: isActive ? 700 : 500,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        height: '36px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        border: isActive ? '1px solid #0f172a' : '1px solid #cbd5e1',
                        backgroundColor: isActive ? '#0f172a' : '#ffffff',
                        color: isActive ? '#ffffff' : '#334155'
                      }}
                      onClick={() => setStaffRoleFilter(r.key as any)}
                    >
                      <span>{r.label}</span>
                      <span
                        style={{
                          fontSize: '10.5px',
                          padding: '1px 6px',
                          borderRadius: '10px',
                          backgroundColor: isActive ? 'rgba(255, 255, 255, 0.25)' : '#f1f5f9',
                          color: isActive ? '#ffffff' : '#475569',
                          fontWeight: 700
                        }}
                      >
                        {r.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Empty States */}
            {filteredStaff.length === 0 && (
              <div
                style={{
                  textAlign: 'center',
                  padding: '48px 24px',
                  backgroundColor: '#f8fafc',
                  borderRadius: '10px',
                  border: '1px dashed #cbd5e1'
                }}
              >
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '50%',
                    backgroundColor: '#eff6ff',
                    color: '#2563eb',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 12px'
                  }}
                >
                  <Search size={20} />
                </div>
                <h4 style={{ margin: '0 0 6px', fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                  {staffList.length === 0 ? 'No staff accounts found.' : 'No staff members match your search.'}
                </h4>
                <p style={{ margin: '0 0 16px', fontSize: '12.5px', color: '#64748b' }}>
                  {staffList.length === 0
                    ? 'Get started by creating your first staff operator account.'
                    : 'Try adjusting your search keyword or clearing the active role filter.'}
                </p>
                {staffList.length === 0 ? (
                  isMasterAdmin && (
                    <button type="button" className="btn btn-primary btn-sm" onClick={handleOpenAddStaff}>
                      <UserPlus size={14} />
                      <span>+ Add New Staff</span>
                    </button>
                  )
                ) : (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ border: '1px solid #cbd5e1', backgroundColor: '#ffffff', color: '#1e293b' }}
                    onClick={() => {
                      setStaffSearch('');
                      setStaffRoleFilter('ALL');
                    }}
                  >
                    Clear Search &amp; Filters
                  </button>
                )}
              </div>
            )}

            {/* Single Responsive Staff View: Desktop Table (>= 1024px) OR Mobile Cards (< 1024px) */}
            {filteredStaff.length > 0 && (
              !isMobileView ? (
                /* ── Desktop / Laptop Table Layout (>= 1024px) ── */
                <div className="table-container" style={{ width: '100%', overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '10px', backgroundColor: '#ffffff' }}>
                  <table className="custom-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                        <th style={{ padding: '11px 14px', width: '20%', fontSize: '11px', fontWeight: 700, color: '#475569', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Staff</th>
                        <th style={{ padding: '11px 14px', width: '18%', fontSize: '11px', fontWeight: 700, color: '#475569', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Contact</th>
                        <th style={{ padding: '11px 14px', width: '9%', fontSize: '11px', fontWeight: 700, color: '#475569', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Role</th>
                        <th style={{ padding: '11px 14px', width: '14%', fontSize: '11px', fontWeight: 700, color: '#475569', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Department</th>
                        <th style={{ padding: '11px 14px', width: '8%', fontSize: '11px', fontWeight: 700, color: '#475569', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Status</th>
                        <th style={{ padding: '11px 14px', width: '8%', fontSize: '11px', fontWeight: 700, color: '#475569', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Created</th>
                        <th style={{ padding: '11px 14px', width: '8%', fontSize: '11px', fontWeight: 700, color: '#475569', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Last Login</th>
                        <th style={{ padding: '11px 14px', width: '9%', fontSize: '11px', fontWeight: 700, color: '#475569', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>KYC Access</th>
                        <th style={{ padding: '11px 14px', width: '14%', minWidth: '200px', textAlign: 'right', fontSize: '11px', fontWeight: 700, color: '#475569', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStaff.map((staff) => {
                        const isMaster = isMasterAdminEmail(staff.email) || staff.email.toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase() || staff.staffId === 'KKV-ADMIN-000001' || staff.role === 'ADMIN';
                        const staffId = staff.staffId || staff.id || staff.uid;
                        const department = (staff as any).department || (staff.role === 'RENTAL_STAFF' ? 'Rental Management' : 'Finance Operations');
                        const initials = ((staff.displayName || staff.fullName || 'ST').trim().split(/\s+/).map((n) => n[0]).join('').slice(0, 2) || 'ST').toUpperCase();

                        return (
                          <tr key={staff.uid} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            {/* 1. Staff Column */}
                            <td style={{ padding: '12px 14px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div
                                  style={{
                                    width: '34px',
                                    height: '34px',
                                    borderRadius: '50%',
                                    backgroundColor: isMaster ? '#fef3c7' : '#eff6ff',
                                    color: isMaster ? '#92400e' : '#1d4ed8',
                                    border: isMaster ? '1.5px solid #fcd34d' : '1px solid #bfdbfe',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontWeight: 700,
                                    fontSize: '11.5px',
                                    flexShrink: 0
                                  }}
                                >
                                  {initials}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0 }}>
                                  <span style={{ fontWeight: 700, fontSize: '13.5px', color: '#0f172a', whiteSpace: 'nowrap' }}>
                                    {staff.displayName || staff.fullName} {isMaster && '👑'}
                                  </span>
                                  <span
                                    style={{
                                      fontSize: '11px',
                                      color: '#334155',
                                      backgroundColor: '#f1f5f9',
                                      border: '1px solid #cbd5e1',
                                      padding: '1px 6px',
                                      borderRadius: '4px',
                                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                                      fontWeight: 600,
                                      letterSpacing: '0.02em',
                                      whiteSpace: 'nowrap',
                                      width: 'fit-content'
                                    }}
                                  >
                                    {staffId}
                                  </span>
                                </div>
                              </div>
                            </td>

                            {/* 2. Contact Column */}
                            <td style={{ padding: '12px 14px' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <span style={{ fontSize: '12.5px', fontWeight: 500, color: '#1e293b', wordBreak: 'break-word', lineHeight: 1.35 }}>
                                  {staff.email}
                                </span>
                                <span style={{ fontSize: '11.5px', color: '#64748b' }}>
                                  {staff.phone || (staff as any).phoneNumber || '—'}
                                </span>
                              </div>
                            </td>

                            {/* 3. Role Column */}
                            <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                              {staff.role === 'ADMIN' ? (
                                <span
                                  style={{
                                    fontSize: '10.5px',
                                    fontWeight: 700,
                                    padding: '2px 8px',
                                    borderRadius: '9999px',
                                    backgroundColor: '#fef3c7',
                                    color: '#92400e',
                                    border: '1px solid #fcd34d',
                                    letterSpacing: '0.03em',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    whiteSpace: 'nowrap'
                                  }}
                                >
                                  👑 ADMIN
                                </span>
                              ) : staff.role === 'RENTAL_STAFF' ? (
                                <span
                                  style={{
                                    fontSize: '10.5px',
                                    fontWeight: 700,
                                    padding: '2px 8px',
                                    borderRadius: '9999px',
                                    backgroundColor: '#fef9c3',
                                    color: '#854d0e',
                                    border: '1px solid #fde047',
                                    letterSpacing: '0.03em',
                                    whiteSpace: 'nowrap'
                                  }}
                                >
                                  RENTAL STAFF
                                </span>
                              ) : (
                                <span
                                  style={{
                                    fontSize: '10.5px',
                                    fontWeight: 700,
                                    padding: '2px 8px',
                                    borderRadius: '9999px',
                                    backgroundColor: '#e0f2fe',
                                    color: '#0369a1',
                                    border: '1px solid #bae6fd',
                                    letterSpacing: '0.03em',
                                    whiteSpace: 'nowrap'
                                  }}
                                >
                                  STAFF
                                </span>
                              )}
                            </td>

                            {/* 4. Department Column */}
                            <td style={{ padding: '12px 14px' }}>
                              <span style={{ fontSize: '12.5px', color: '#334155', fontWeight: 500, whiteSpace: 'nowrap' }}>
                                {department}
                              </span>
                            </td>

                            {/* 5. Status Column */}
                            <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                              {staff.isActive ? (
                                <span
                                  style={{
                                    fontSize: '10.5px',
                                    fontWeight: 700,
                                    padding: '2px 8px',
                                    borderRadius: '9999px',
                                    backgroundColor: '#dcfce7',
                                    color: '#15803d',
                                    border: '1px solid #86efac',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    whiteSpace: 'nowrap'
                                  }}
                                >
                                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#15803d' }}></span>
                                  ACTIVE
                                </span>
                              ) : (
                                <span
                                  style={{
                                    fontSize: '10.5px',
                                    fontWeight: 700,
                                    padding: '2px 8px',
                                    borderRadius: '9999px',
                                    backgroundColor: '#fee2e2',
                                    color: '#b91c1c',
                                    border: '1px solid #fca5a5',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    whiteSpace: 'nowrap'
                                  }}
                                >
                                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#b91c1c' }}></span>
                                  INACTIVE
                                </span>
                              )}
                            </td>

                            {/* 6. Created Column */}
                            <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                              <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 500 }}>
                                {staff.createdAt ? new Date(staff.createdAt).toLocaleDateString('en-GB') : '—'}
                              </span>
                            </td>

                            {/* 7. Last Login Column */}
                            <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                              <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 500 }}>
                                {staff.lastLoginAt ? new Date(staff.lastLoginAt).toLocaleDateString('en-GB') : 'Never'}
                              </span>
                            </td>

                            {/* 8. KYC Access Column */}
                            <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                              {(() => {
                                const hasKycAccess = staff.role === 'ADMIN' ||
                                  (staff.role as string === 'MASTER_ADMIN') ||
                                  ((staff as any).permissions?.viewKyc === true &&
                                   (staff as any).permissions?.customers?.view === true);
                                const isStaffActive = staff.isActive !== false;
                                const isRetrying = retryingDriveAccess === (staff.uid || staff.id || staff.staffId);

                                return (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    {hasKycAccess ? (
                                      <span style={{ fontSize: '10.5px', fontWeight: 700, padding: '2px 8px', borderRadius: '9999px', backgroundColor: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
                                        ✓ VIEW
                                      </span>
                                    ) : (
                                      <span style={{ fontSize: '10.5px', fontWeight: 700, padding: '2px 8px', borderRadius: '9999px', backgroundColor: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
                                        ✕ NO ACCESS
                                      </span>
                                    )}
                                    {hasKycAccess && isStaffActive && !isMaster && (
                                      <button
                                        type="button"
                                        title="Retry / Confirm Google Drive KYC folder access"
                                        disabled={isRetrying}
                                        onClick={() => handleRetryDriveAccess(staff)}
                                        style={{ fontSize: '9.5px', display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '2px 6px', border: '1px solid #bfdbfe', borderRadius: '4px', backgroundColor: '#eff6ff', color: '#1d4ed8', cursor: isRetrying ? 'not-allowed' : 'pointer', fontWeight: 600, opacity: isRetrying ? 0.6 : 1 }}
                                      >
                                        <HardDrive size={9} />
                                        {isRetrying ? 'Granting…' : 'Drive Access'}
                                      </button>
                                    )}
                                  </div>
                                );
                              })()}
                            </td>

                            {/* 9. Actions Column */}
                            <td style={{ padding: '12px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                              <div style={{ display: 'inline-flex', gap: '5px', justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'nowrap' }}>
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-xs"
                                  style={{ padding: '4px 8px', fontSize: '11.5px', height: '28px', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', color: '#1e293b', fontWeight: 600 }}
                                  onClick={() => handleOpenManageStaff(staff)}
                                  title="Edit Staff Account"
                                >
                                  <Edit2 size={12} />
                                  <span>Edit</span>
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-xs"
                                  style={{ padding: '4px 8px', fontSize: '11.5px', height: '28px', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', color: '#1e293b', fontWeight: 600 }}
                                  onClick={() => handleOpenResetPasswordModal(staff)}
                                  title="Reset Staff Password"
                                >
                                  <Key size={12} />
                                  <span>Reset</span>
                                </button>
                                {!isMaster ? (
                                  <>
                                    <button
                                      type="button"
                                      className={`btn btn-xs ${staff.isActive ? 'btn-secondary' : 'btn-primary'}`}
                                      style={{ padding: '4px 8px', fontSize: '11.5px', height: '28px', borderRadius: '6px', whiteSpace: 'nowrap', fontWeight: 600, border: staff.isActive ? '1px solid #cbd5e1' : undefined, backgroundColor: staff.isActive ? '#ffffff' : undefined, color: staff.isActive ? '#475569' : undefined }}
                                      onClick={() => toggleStaffStatus(staff.uid, !staff.isActive)}
                                      title={staff.isActive ? 'Deactivate Account' : 'Activate Account'}
                                    >
                                      {staff.isActive ? 'Deactivate' : 'Activate'}
                                    </button>
                                    <button
                                      type="button"
                                      className="btn btn-secondary btn-xs"
                                      style={{ padding: '4px 8px', fontSize: '11.5px', height: '28px', borderRadius: '6px', color: '#dc2626', borderColor: '#fca5a5', backgroundColor: '#ffffff', display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', fontWeight: 600 }}
                                      onClick={() => handleOpenDeleteModal(staff)}
                                      title="Delete Staff"
                                    >
                                      <Trash2 size={12} />
                                      <span>Delete</span>
                                    </button>
                                  </>
                                ) : (
                                  <span
                                    style={{
                                      fontSize: '11px',
                                      color: '#475569',
                                      fontWeight: 600,
                                      padding: '3px 8px',
                                      borderRadius: '9999px',
                                      backgroundColor: '#f1f5f9',
                                      border: '1px solid #cbd5e1',
                                      whiteSpace: 'nowrap'
                                    }}
                                  >
                                    🔒 Root
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                /* ── Mobile / Small Viewport Cards Layout (< 1024px) ── */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
                  {filteredStaff.map((staff) => {
                    const isMaster = isMasterAdminEmail(staff.email) || staff.email.toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase() || staff.staffId === 'KKV-ADMIN-000001' || staff.role === 'ADMIN';
                    const staffId = staff.staffId || staff.id || staff.uid;
                    const department = (staff as any).department || (staff.role === 'RENTAL_STAFF' ? 'Rental Management' : 'Finance Operations');
                    const initials = ((staff.displayName || staff.fullName || 'ST').trim().split(/\s+/).map((n) => n[0]).join('').slice(0, 2) || 'ST').toUpperCase();

                    return (
                      <div
                        key={staff.uid}
                        style={{
                          padding: '14px 16px',
                          backgroundColor: '#ffffff',
                          border: '1px solid #e2e8f0',
                          borderRadius: '10px',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div
                              style={{
                                width: '36px',
                                height: '36px',
                                borderRadius: '50%',
                                backgroundColor: isMaster ? '#fef3c7' : '#eff6ff',
                                color: isMaster ? '#92400e' : '#1d4ed8',
                                border: isMaster ? '1.5px solid #fcd34d' : '1px solid #bfdbfe',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 700,
                                fontSize: '12px',
                                flexShrink: 0
                              }}
                            >
                              {initials}
                            </div>
                            <div>
                              <h4 style={{ margin: 0, fontSize: '13.5px', fontWeight: 700, color: '#0f172a' }}>
                                {staff.displayName || staff.fullName} {isMaster && '👑'}
                              </h4>
                              <span
                                style={{
                                  fontSize: '11px',
                                  color: '#334155',
                                  backgroundColor: '#f1f5f9',
                                  border: '1px solid #cbd5e1',
                                  padding: '1px 5px',
                                  borderRadius: '4px',
                                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                                  fontWeight: 600
                                }}
                              >
                                {staffId}
                              </span>
                            </div>
                          </div>
                          <div>
                            {staff.isActive ? (
                              <span
                                style={{
                                  fontSize: '10.5px',
                                  fontWeight: 700,
                                  padding: '2px 7px',
                                  borderRadius: '9999px',
                                  backgroundColor: '#dcfce7',
                                  color: '#15803d',
                                  border: '1px solid #86efac',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                              >
                                ● ACTIVE
                              </span>
                            ) : (
                              <span
                                style={{
                                  fontSize: '10.5px',
                                  fontWeight: 700,
                                  padding: '2px 7px',
                                  borderRadius: '9999px',
                                  backgroundColor: '#fee2e2',
                                  color: '#b91c1c',
                                  border: '1px solid #fca5a5',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                              >
                                ● INACTIVE
                              </span>
                            )}
                          </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#64748b' }}>Email:</span>
                            <span style={{ color: '#0f172a', fontWeight: 500 }}>{staff.email}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#64748b' }}>Mobile:</span>
                            <span style={{ color: '#475569' }}>{staff.phone || (staff as any).phoneNumber || '—'}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '3px', paddingTop: '4px', borderTop: '1px solid #f1f5f9' }}>
                            <span style={{ color: '#64748b' }}>Role / Dept:</span>
                            <span style={{ color: '#0f172a', fontWeight: 600 }}>
                              {staff.role === 'RENTAL_STAFF' ? 'RENTAL STAFF' : staff.role} • {department}
                            </span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' }}>
                            <span style={{ color: '#64748b' }}>KYC Access:</span>
                            {(staff.role === 'ADMIN' || (staff.role as string === 'MASTER_ADMIN') || ((staff as any).permissions?.viewKyc === true && (staff as any).permissions?.customers?.view === true)) ? (
                              <span style={{ fontSize: '11px', fontWeight: 700, color: '#047857' }}>✓ VIEW</span>
                            ) : (
                              <span style={{ fontSize: '11px', fontWeight: 700, color: '#b91c1c' }}>✕ NO ACCESS</span>
                            )}
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'wrap', paddingTop: '6px', borderTop: '1px solid #f1f5f9' }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-xs"
                            style={{ padding: '4px 8px', fontSize: '11.5px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', color: '#1e293b', fontWeight: 600 }}
                            onClick={() => handleOpenManageStaff(staff)}
                          >
                            <Edit2 size={11} />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-xs"
                            style={{ padding: '4px 8px', fontSize: '11.5px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', color: '#1e293b', fontWeight: 600 }}
                            onClick={() => handleOpenResetPasswordModal(staff)}
                          >
                            <Key size={11} />
                            <span>Reset</span>
                          </button>
                          {!isMaster ? (
                            <>
                              <button
                                type="button"
                                className={`btn btn-xs ${staff.isActive ? 'btn-secondary' : 'btn-primary'}`}
                                style={{ padding: '4px 8px', fontSize: '11.5px', fontWeight: 600, border: staff.isActive ? '1px solid #cbd5e1' : undefined, backgroundColor: staff.isActive ? '#ffffff' : undefined, color: staff.isActive ? '#475569' : undefined }}
                                onClick={() => toggleStaffStatus(staff.uid, !staff.isActive)}
                              >
                                {staff.isActive ? 'Deactivate' : 'Activate'}
                              </button>
                              <button
                                type="button"
                                className="btn btn-secondary btn-xs"
                                style={{ padding: '4px 8px', fontSize: '11.5px', color: '#dc2626', borderColor: '#fca5a5', backgroundColor: '#ffffff', fontWeight: 600 }}
                                onClick={() => handleOpenDeleteModal(staff)}
                              >
                                <Trash2 size={11} />
                                <span>Delete</span>
                              </button>
                            </>
                          ) : (
                            <span style={{ fontSize: '11px', color: '#475569', fontWeight: 600, padding: '3px 8px', borderRadius: '9999px', backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1' }}>
                              🔒 Root
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          MODAL: CHANGE DEFAULT FD INTEREST RATE CONFIRMATION
          ════════════════════════════════════════════════════════════════════════ */}
      {showFdRateConfirmModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px'
          }}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: '480px',
              backgroundColor: 'var(--bg-card)',
              borderRadius: '16px',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)',
              border: '1px solid var(--border-light)',
              padding: '24px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Percent size={18} color="var(--color-primary-accent)" />
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text-dark)' }}>
                  CHANGE DEFAULT FD INTEREST RATE?
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowFdRateConfirmModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '18px' }}>
              <div style={{ padding: '12px 16px', backgroundColor: 'var(--bg-surface-secondary)', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>Current Default Rate:</span>
                  <strong style={{ fontSize: '13.5px', color: 'var(--text-dark)' }}>{(masterControlSettings?.fdInterestRate ?? 12).toFixed(2)}% p.a.</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>New Default Rate:</span>
                  <strong style={{ fontSize: '14px', color: 'var(--color-primary-dark)' }}>{parseFloat(fdRateInput).toFixed(2)}% p.a.</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>Effective Date:</span>
                  <strong style={{ fontSize: '13px', color: 'var(--text-dark)' }}>{fdRateEffectiveDate}</strong>
                </div>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '12px', fontWeight: 700 }}>
                  Reason / Regulatory Reference Notes (Optional)
                </label>
                <input
                  type="text"
                  className="input-control"
                  placeholder="e.g. Revised quarterly benchmark interest policy"
                  value={fdRateNotes}
                  onChange={(e) => setFdRateNotes(e.target.value)}
                  style={{ height: '36px', fontSize: '12.5px' }}
                />
              </div>

              <div style={{ padding: '10px 14px', backgroundColor: 'var(--badge-warning-bg)', color: 'var(--badge-warning-text)', borderRadius: '8px', fontSize: '12px', border: '1px solid rgba(210, 168, 74, 0.3)' }}>
                <strong>Important Policy Notice:</strong> This change applies <strong>ONLY to NEW Fixed Deposits</strong> created on or after the effective date. Existing FD contracts retain their original contractual interest rate and dividend payout schedules.
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setShowFdRateConfirmModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleConfirmFdRateChange}
                style={{ fontWeight: 700 }}
              >
                Confirm &amp; Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: ADD STAFF ── */}
      {isAddStaffModalOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '16px' }}>
          <div className="card" style={{ width: '100%', maxWidth: '460px', backgroundColor: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 20px 40px -15px rgba(0,0,0,0.2)', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #f1f5f9', paddingBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <UserPlus size={18} color="#2563eb" />
                </div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a', letterSpacing: '0.02em' }}>
                  ADD NEW STAFF
                </h3>
              </div>
              <button
                type="button"
                onClick={() => !isSubmitting && setIsAddStaffModalOpen(false)}
                disabled={isSubmitting}
                style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>

            {createdStaffSummary ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: '#dcfce7', border: '1px solid #86efac', padding: '14px 16px', borderRadius: '10px', color: '#15803d' }}>
                  <CheckCircle size={22} />
                  <div>
                    <strong style={{ display: 'block', fontSize: '13px' }}>STAFF CREATED SUCCESSFULLY</strong>
                    <span style={{ fontSize: '12px', color: '#166534' }}>New staff account is active and ready for immediate login.</span>
                  </div>
                </div>

                <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px' }}>
                      <span style={{ color: '#64748b' }}>Staff Name:</span>
                      <strong style={{ color: '#0f172a' }}>{createdStaffSummary.name}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px' }}>
                      <span style={{ color: '#64748b' }}>Email:</span>
                      <strong style={{ color: '#0f172a' }}>{createdStaffSummary.email}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px' }}>
                      <span style={{ color: '#64748b' }}>Role:</span>
                      <strong style={{ color: createdStaffSummary.role === 'RENTAL_STAFF' ? '#854d0e' : '#0369a1' }}>
                        {createdStaffSummary.role === 'RENTAL_STAFF' ? 'RENTAL STAFF' : createdStaffSummary.role}
                      </strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px' }}>
                      <span style={{ color: '#64748b' }}>KYC Document Access:</span>
                      <strong style={{ color: createdStaffSummary.kycAccess ? '#15803d' : '#b91c1c' }}>
                        {createdStaffSummary.kycAccess ? '✓ Enabled' : '✕ Disabled'}
                      </strong>
                    </div>
                    {createdStaffSummary.kycAccess && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px', alignItems: 'center' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#64748b' }}>
                          <HardDrive size={12} />
                          Google Drive Access:
                        </span>
                        {createdStaffSummary.driveAccessGranted === true ? (
                          <strong style={{ color: '#15803d' }}>✅ Granted — Folder shared</strong>
                        ) : createdStaffSummary.driveAccessStatus === 'drive_not_ready' ? (
                          <strong style={{ color: '#b45309' }}>⚠ Drive not configured</strong>
                        ) : createdStaffSummary.driveAccessStatus === 'failed' ? (
                          <strong style={{ color: '#b91c1c' }}>✕ Share failed — Retry needed</strong>
                        ) : (
                          <strong style={{ color: '#64748b' }}>— N/A</strong>
                        )}
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '2px' }}>
                      <span style={{ color: '#64748b' }}>Staff ID:</span>
                      <span style={{ color: '#0f172a', fontSize: '13px', fontWeight: 700, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}>
                        {createdStaffSummary.staffId}
                      </span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ border: '1px solid #cbd5e1', backgroundColor: '#ffffff', color: '#1e293b' }}
                    onClick={handleOpenAddStaff}
                  >
                    + Create Another Staff
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => setIsAddStaffModalOpen(false)}
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateStaff} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label required" style={{ fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>
                    Staff Name
                  </label>
                  <input
                    type="text"
                    className="input-control"
                    value={addName}
                    onChange={(e) => setAddName(e.target.value)}
                    placeholder="Enter staff name"
                    autoFocus
                    required
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label required" style={{ fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>
                    Email
                  </label>
                  <input
                    type="email"
                    className="input-control"
                    value={addEmail}
                    onChange={(e) => setAddEmail(e.target.value)}
                    placeholder="Enter email"
                    required
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label required" style={{ fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>
                    Role
                  </label>
                  <select
                    className="select-control"
                    value={addRole}
                    onChange={(e) => setAddRole(e.target.value as any)}
                  >
                    <option value="STAFF">STAFF</option>
                    <option value="RENTAL_STAFF">RENTAL STAFF</option>
                  </select>
                </div>

                <div className="form-group" style={{ margin: 0, padding: '10px 12px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: 0 }}>
                    <input
                      type="checkbox"
                      checked={addKycAccess}
                      onChange={(e) => setAddKycAccess(e.target.checked)}
                      style={{ width: '16px', height: '16px', accentColor: '#0d2818', cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>
                      Allow viewing customer KYC documents (Aadhaar, PAN, Customer Photo)
                    </span>
                  </label>
                  <p style={{ margin: '4px 0 0 24px', fontSize: '11.5px', color: '#64748b' }}>
                    Enables secure in-app document viewing for authorized customers.
                  </p>
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label required" style={{ fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>
                    Password
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showAddPassword ? 'text' : 'password'}
                      className="input-control"
                      style={{ paddingRight: '36px' }}
                      value={addPassword}
                      onChange={(e) => setAddPassword(e.target.value)}
                      placeholder="Enter password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowAddPassword(!showAddPassword)}
                      style={{
                        position: 'absolute',
                        right: '10px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-muted)',
                        cursor: 'pointer'
                      }}
                      tabIndex={-1}
                    >
                      {showAddPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '8px', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={isSubmitting}
                    onClick={() => setIsAddStaffModalOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'Creating...' : 'Create Staff'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ── MODAL: RESET PASSWORD (ADMIN ACTION) ── */}
      {resetStaffTarget && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: '16px' }}>
          <div className="card" style={{ width: '100%', maxWidth: '460px', backgroundColor: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 20px 40px -15px rgba(0,0,0,0.2)', padding: '24px' }}>
            <div className="card-header" style={{ marginBottom: '16px', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Key size={18} color="#0d2818" />
                <h3 className="card-title" style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>Reset Staff Password</h3>
              </div>
              <button type="button" onClick={() => setResetStaffTarget(null)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleResetPasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Target Staff Summary Box */}
              <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>Staff Name:</span>
                  <strong style={{ fontSize: '13px', color: '#0f172a' }}>{resetStaffTarget.displayName || resetStaffTarget.fullName}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>Staff ID:</span>
                  <span style={{ fontSize: '12px', color: '#334155', fontWeight: 700, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}>{resetStaffTarget.staffId || resetStaffTarget.id || resetStaffTarget.uid}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>Email:</span>
                  <span style={{ fontSize: '12px', color: '#334155', fontWeight: 500 }}>{resetStaffTarget.email}</span>
                </div>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label required" style={{ fontSize: '12px', fontWeight: 700 }}>New Password *</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showResetNewPassword ? 'text' : 'password'}
                    className="input-control"
                    style={{ paddingRight: '36px' }}
                    value={resetNewPassword}
                    onChange={(e) => setResetNewPassword(e.target.value)}
                    placeholder="Min 8 characters"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetNewPassword(!showResetNewPassword)}
                    style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                  >
                    {showResetNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label required" style={{ fontSize: '12px', fontWeight: 700 }}>Confirm New Password *</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showResetConfirmPassword ? 'text' : 'password'}
                    className="input-control"
                    style={{ paddingRight: '36px' }}
                    value={resetConfirmPassword}
                    onChange={(e) => setResetConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetConfirmPassword(!showResetConfirmPassword)}
                    style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                  >
                    {showResetConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <span style={{ fontSize: '11px', color: '#64748b' }}>
                Once reset, the previous password will immediately stop working and the new password will become the valid login credential.
              </span>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '8px', paddingTop: '12px', borderTop: '1px solid var(--border-subtle)' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setResetStaffTarget(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={isResettingPassword}>
                  {isResettingPassword ? 'Resetting...' : 'Reset Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: MANAGE / EDIT STAFF ── */}
      {managingStaff && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '16px' }}>
          <div className="card" style={{ width: '100%', maxWidth: '460px', backgroundColor: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 20px 40px -15px rgba(0,0,0,0.2)', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #f1f5f9', paddingBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Edit2 size={18} color="#2563eb" />
                </div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a', letterSpacing: '0.02em' }}>
                  EDIT STAFF
                </h3>
              </div>
              <button
                type="button"
                onClick={() => !isSubmitting && setManagingStaff(null)}
                disabled={isSubmitting}
                style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveEditStaff} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label required" style={{ fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>
                  Full Name
                </label>
                <input
                  type="text"
                  className="input-control"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Enter staff name"
                  required
                />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>
                  Email
                </label>
                <input
                  type="email"
                  className="input-control"
                  value={editEmail}
                  readOnly
                  disabled
                  style={{ backgroundColor: '#f8fafc', opacity: 0.9, cursor: 'not-allowed', color: '#475569' }}
                />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label required" style={{ fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>
                  Role
                </label>
                {isAdminRole(managingStaff.role) ? (
                  <input
                    type="text"
                    className="input-control"
                    value="ADMIN (Master Administrator)"
                    readOnly
                    disabled
                    style={{ backgroundColor: '#f8fafc', opacity: 0.9, cursor: 'not-allowed', color: '#475569' }}
                  />
                ) : (
                  <select
                    className="select-control"
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value as any)}
                  >
                    <option value="STAFF">STAFF</option>
                    <option value="RENTAL_STAFF">RENTAL STAFF</option>
                  </select>
                )}
              </div>

              {!isAdminRole(managingStaff.role) && (
                <div className="form-group" style={{ margin: 0, padding: '10px 12px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: 0 }}>
                    <input
                      type="checkbox"
                      checked={editKycAccess}
                      onChange={(e) => setEditKycAccess(e.target.checked)}
                      style={{ width: '16px', height: '16px', accentColor: '#0d2818', cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>
                      Allow viewing customer KYC documents (Aadhaar, PAN, Customer Photo)
                    </span>
                  </label>
                  <p style={{ margin: '4px 0 0 24px', fontSize: '11.5px', color: '#64748b' }}>
                    Enables secure in-app document viewing for authorized customers.
                  </p>
                </div>
              )}

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>
                  Password
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showEditPassword ? 'text' : 'password'}
                    className="input-control"
                    style={{ paddingRight: '36px' }}
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    placeholder="New Password (optional)"
                  />
                  <button
                    type="button"
                    onClick={() => setShowEditPassword(!showEditPassword)}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer'
                    }}
                    tabIndex={-1}
                  >
                    {showEditPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <span style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', display: 'block' }}>
                  Leave blank to keep existing password unchanged.
                </span>
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '8px', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={isSubmitting}
                  onClick={() => setManagingStaff(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          MODAL: DELETE STAFF CONFIRMATION
          ════════════════════════════════════════════════════════════════════════ */}
      {deleteStaffTarget && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px'
          }}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: '440px',
              backgroundColor: '#ffffff',
              borderRadius: '14px',
              boxShadow: '0 20px 40px -15px rgba(0,0,0,0.2)',
              border: '1px solid #e2e8f0',
              padding: '24px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Trash2 size={18} color="#dc2626" />
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                  DELETE STAFF ACCOUNT
                </h3>
              </div>
              <button
                type="button"
                onClick={() => !isDeletingStaff && setDeleteStaffTarget(null)}
                disabled={isDeletingStaff}
                style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '13px', color: '#475569', marginBottom: '14px', lineHeight: 1.5 }}>
              Are you sure you want to permanently delete staff member <strong style={{ color: '#0f172a' }}>{deleteStaffTarget.displayName || deleteStaffTarget.fullName}</strong> ({deleteStaffTarget.staffId || deleteStaffTarget.uid})?
            </p>

            <div style={{ padding: '10px 14px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', fontSize: '12px', color: '#b91c1c', marginBottom: '18px' }}>
              ⚠️ <strong>Warning:</strong> This will remove their credentials from the Cloud Firestore database and revoke all active sessions. This action cannot be undone.
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={isDeletingStaff}
                onClick={() => setDeleteStaffTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-sm"
                style={{ backgroundColor: '#dc2626', color: '#ffffff', borderColor: '#dc2626', fontWeight: 600 }}
                disabled={isDeletingStaff}
                onClick={handleConfirmDeleteStaff}
              >
                {isDeletingStaff ? 'Deleting...' : 'Delete Staff'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
