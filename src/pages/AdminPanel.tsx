import React, { useState, useEffect } from 'react';
import { useApp, defaultLoanTypes } from '../context/AppContext';
import { Users, CreditCard, DollarSign, CheckCircle2, PiggyBank, Wallet, Building2, Bell, Database, X, Save, Lock, Plus, Trash2, Search, Eye, Edit3, RotateCcw, AlertTriangle, Clock, Percent, RefreshCw, Sliders } from 'lucide-react';
import { AmountBand, Customer, OverdueEscalationTier, Loan } from '../types';
import { getOverdueEscalationDetails } from '../utils/loanCalculationUtils';

import { KKVLogo } from '../components/common/KKVLogo';
import { WipeAllDataModal } from '../components/admin/WipeAllDataModal';
import { DatabaseRestoreModal } from '../components/admin/DatabaseRestoreModal';
import { DatabaseBackupRecoverySection } from '../components/admin/DatabaseBackupRecoverySection';
import { ViewCustomerModal } from '../components/common/ViewCustomerModal';
import { EditLoanModal } from '../components/admin/EditLoanModal';
import { DeleteLoanModal } from '../components/admin/DeleteLoanModal';
import { LoanConfigurationSection } from '../components/admin/LoanConfigurationSection';
import { FDConfigurationSection } from '../components/admin/FDConfigurationSection';
import { ConfigurationCenterModal } from '../components/config/ConfigurationCenterModal';
import { PurityManagementSection } from '../components/admin/PurityManagementSection';
import { getCanonicalCustomerId, isMatchingCustomerId } from '../utils/customerUtils';
import {
  formatFDDate,
  normalizeDateString,
  getDaysDifference,
  compareFDDates,
  getAllPendingFDInterestPeriods
} from '../utils/fdInterestUtils';
import { rentalApi } from '../modules/rental/services/rentalApi';
import { AdminRentalSummary } from '../modules/rental/types/rental.types';
import { RentalAdminView } from '../modules/rental/components/RentalAdminView';
import { apiService, getStoredAuthToken, fetchWithAuth, isTokenExpired } from '../services/api';

export const AdminPanel: React.FC = () => {
  const [showWipeModal, setShowWipeModal] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [showConfigCenterModal, setShowConfigCenterModal] = useState(false);
  const {
    userRole,
    loans,
    customers,
    receipts,
    fixedDeposits,
    dayBookEntries,
    cashInHand,
    cashAtBank,
    masterControlOpen,
    setMasterControlOpen,
    masterControlUnlocked,
    unlockMasterControl,
    changeMasterPassword,
    masterControlSettings,
    updateMasterControlSettings,
    whatsAppTemplates,
    updateWhatsAppTemplates,
    resetAllData,
    reloadAllData,
    deleteCustomer,
    restoreCustomer,
    deleteCustomerPermanently,
    fdInterestPayouts,
    setSelectedProfileCustomerId,
    setSelectedLoan,
    setCurrentPage,
    startEditCustomer,
    showToast
  } = useApp();

  const [activeTab, setActiveTab] = useState<'overview' | 'customers' | 'loans' | 'rental'>('overview');
  const [custSubTab, setCustSubTab] = useState<'active' | 'deleted'>('active');
  const [adminCustSearch, setAdminCustSearch] = useState('');
  const [adminLoanSearch, setAdminLoanSearch] = useState('');
  const [adminLoanStatus, setAdminLoanStatus] = useState<'ALL' | 'ACTIVE' | 'CLOSED' | 'OVERDUE' | 'PENDING'>('ALL');
  const [editingLoan, setEditingLoan] = useState<Loan | null>(null);
  const [deletingLoan, setDeletingLoan] = useState<Loan | null>(null);
  const [viewingCustomer, setViewingCustomer] = useState<Customer | null>(null);
  const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(null);
  const [permanentDeleteTarget, setPermanentDeleteTarget] = useState<Customer | null>(null);
  const [permanentDeleteInput, setPermanentDeleteInput] = useState('');
  const [isDeletingPermanently, setIsDeletingPermanently] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [masterSubTab, setMasterSubTab] = useState<'rates' | 'loan-config' | 'fd-config' | 'purity' | 'operations' | 'messaging' | 'security' | 'danger'>('rates');
  // string type so it can hold any loanTypeId (e.g. 'gold-loan', 'silver-loan', 'diamond-loan') OR 'card'/'overdue'/'upi'
  const [ratesSubChip, setRatesSubChip] = useState<string>('gold-loan');
  const [isClearingSync, setIsClearingSync] = useState(false);

  const handleClearSyncCache = async () => {
    if (!window.confirm('Are you sure you want to synchronize with Cloud Firestore and refresh data?')) return;
    setIsClearingSync(true);
    try {
      const res = await apiService.clearSyncCache();
      if (res.success) {
        showToast('Cloud Firestore synchronization complete!', 'success');
        await reloadAllData();
      } else {
        throw new Error(res.message || 'Failed to clear sync cache');
      }
    } catch (err: any) {
      showToast(err?.message || 'Error clearing sync cache', 'error');
    } finally {
      setIsClearingSync(false);
    }
  };

  // ── Rental Management Summary State (Section 28 & 29) ───────────────────────
  const [rentalSummary, setRentalSummary] = useState<AdminRentalSummary | null>(null);
  const [rentalSummaryLoading, setRentalSummaryLoading] = useState<boolean>(false);

  useEffect(() => {
    const fetchRentalSummary = async () => {
      const token = getStoredAuthToken();
      if (!token || isTokenExpired(token)) return;

      setRentalSummaryLoading(true);
      try {
        const res = await fetchWithAuth<AdminRentalSummary>('/admin/rental-summary');
        if (res.success && res.data) {
          setRentalSummary(res.data);
        } else {
          // Fallback to rentalApi if direct endpoint is unavailable
          const fallbackRes = await rentalApi.getAdminSummary().catch(() => null);
          if (fallbackRes?.success && fallbackRes.data) {
            setRentalSummary(fallbackRes.data);
          }
        }
      } catch (err) {
        console.warn('Failed to load rental admin summary:', err);
      } finally {
        setRentalSummaryLoading(false);
      }
    };
    fetchRentalSummary();
  }, [activeTab]);

  // ── Rates & Payments — unified per-loan-type config map ─────────────────────
  // Key = loanTypeId, value = editable snapshot of that loan type's config
  const [loanTypeConfigs, setLoanTypeConfigs] = useState<Record<string, Partial<import('../types').LoanTypeConfig>>>({});
  const [loanTypesCardFees, setLoanTypesCardFees] = useState<{ [key: string]: { enabled: boolean; amount: number } }>({});

  // Static non-loan-type rates (overdue, card default, upi, grace)
  const [cardFee, setCardFee] = useState<number | ''>(masterControlSettings?.defaultCardFee ?? 10);
  const [overdueRate, setOverdueRate] = useState<number | ''>(masterControlSettings?.overdueInterestRatePA ?? 24);
  const [overduePenalty, setOverduePenalty] = useState<number | ''>(masterControlSettings?.overduePenaltyPerDayPercent ?? 3.6);
  const [graceDaysVal, setGraceDaysVal] = useState<number | ''>(masterControlSettings?.graceDays ?? 3);
  const [upiIdVal, setUpiIdVal] = useState<string>(masterControlSettings?.upiId || '');
  const [upiPayeeVal, setUpiPayeeVal] = useState<string>(masterControlSettings?.upiPayeeName || '');


  const handleConfirmPermanentDelete = async () => {
    if (!permanentDeleteTarget || permanentDeleteInput !== 'DELETE') return;
    setIsDeletingPermanently(true);
    try {
      const success = await deleteCustomerPermanently(permanentDeleteTarget.id);
      if (success) {
        setPermanentDeleteTarget(null);
        setPermanentDeleteInput('');
      }
    } catch (err: any) {
      showToast(err.message || 'Error deleting customer permanently.', 'error');
    } finally {
      setIsDeletingPermanently(false);
    }
  };

  const handleDangerZoneTabClick = () => {
    setMasterSubTab('danger');
  };

  // Overdue calculation method description selection
  const [overdueCalMethod, setOverdueCalMethod] = useState<string>(masterControlSettings?.overdueCalculationMethod || 'Whole months — a part month counts as full (recommended)');

  // Messaging Form State with safe fallbacks
  const [welcomeTpl, setWelcomeTpl] = useState<string>(whatsAppTemplates?.welcomeMessage || '');
  const [dueTpl, setDueTpl] = useState<string>(whatsAppTemplates?.dueReminderMessage || '');
  const [receiptTpl, setReceiptTpl] = useState<string>(whatsAppTemplates?.receiptMessage || '');

  // Security & Unlock Loading State
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [isChangingMasterPass, setIsChangingMasterPass] = useState(false);

  // Overdue Escalation State
  const [overdueEscalationOn, setOverdueEscalationOn] = useState<boolean>(
    masterControlSettings?.overdueEscalationEnabled ?? masterControlSettings?.overdueInterest?.enabled ?? false
  );
  const [overdueBaseRateVal, setOverdueBaseRateVal] = useState<number | ''>(
    masterControlSettings?.overdueBaseRateMonthly ?? masterControlSettings?.overdueInterest?.baseRate ?? 2.0
  );
  const [overdueTiersList, setOverdueTiersList] = useState<OverdueEscalationTier[]>(() => {
    const raw = masterControlSettings?.overdueEscalationTiers || masterControlSettings?.overdueInterest?.escalationTiers;
    if (raw && raw.length > 0) {
      return [...raw].sort((a, b) => a.overdueDays - b.overdueDays);
    }
    return [
      { overdueDays: 0, rate: 2.0 },
      { overdueDays: 90, rate: 2.1 },
      { overdueDays: 180, rate: 2.2 },
      { overdueDays: 270, rate: 2.3 },
      { overdueDays: 360, rate: 2.4 }
    ];
  });

  // Overdue Tier Modal / Form State
  const [editingTierIndex, setEditingTierIndex] = useState<number | null>(null);
  const [tierDaysInput, setTierDaysInput] = useState<string>('');
  const [tierRateInput, setTierRateInput] = useState<string>('');
  const [showTierModal, setShowTierModal] = useState<boolean>(false);
  const [testSimulatorDays, setTestSimulatorDays] = useState<number | ''>(120);

  // Operations Feature Toggles
  const [animationsEnabled, setAnimationsEnabled] = useState<boolean>(masterControlSettings?.animationsEnabled ?? true);
  const [performanceModeEnabled, setPerformanceModeEnabled] = useState<boolean>(masterControlSettings?.performanceModeEnabled ?? false);
  const [lockersEnabled, setLockersEnabled] = useState<boolean>(masterControlSettings?.lockersEnabled ?? false);

  // Operations lists states
  const [areasVal, setAreasVal] = useState<string[]>(masterControlSettings?.areas || []);
  const [partnersVal, setPartnersVal] = useState<string[]>(masterControlSettings?.partners || []);
  const [vehicleDocsVal, setVehicleDocsVal] = useState<string[]>(masterControlSettings?.vehicleDocuments || []);
  const [vehicleCompaniesVal, setVehicleCompaniesVal] = useState<string[]>(masterControlSettings?.vehicleCompanies || []);
  const [insuranceCompaniesVal, setInsuranceCompaniesVal] = useState<string[]>(masterControlSettings?.insuranceCompanies || []);
  const [showroomsVal, setShowroomsVal] = useState<string[]>(masterControlSettings?.showrooms || []);

  // Sub-tabs navigation states inside master control
  const [operationsSubTab, setOperationsSubTab] = useState<'areas-showrooms' | 'toggles'>('areas-showrooms');
  const [securitySubTab, setSecuritySubTab] = useState<'account' | 'change-pass'>('account');

  // Stored password change states
  const [currentMasterPass, setCurrentMasterPass] = useState('');
  const [newMasterPass, setNewMasterPass] = useState('');

  // Operations inputs state
  const [newAreaInput, setNewAreaInput] = useState('');
  const [newPartnerInput, setNewPartnerInput] = useState('');
  const [newDocInput, setNewDocInput] = useState('');
  const [newCompanyInput, setNewCompanyInput] = useState('');
  const [newInsCompanyInput, setNewInsCompanyInput] = useState('');
  const [newShowroomInput, setNewShowroomInput] = useState('');

  useEffect(() => {
    if (masterControlSettings) {
      setAnimationsEnabled(masterControlSettings.animationsEnabled ?? true);
      setPerformanceModeEnabled(masterControlSettings.performanceModeEnabled ?? false);
      setLockersEnabled(masterControlSettings.lockersEnabled ?? false);

      setCardFee(masterControlSettings.defaultCardFee ?? 10);
      setOverdueRate(masterControlSettings.overdueInterestRatePA ?? 24);
      setOverduePenalty(masterControlSettings.overduePenaltyPerDayPercent ?? 3.6);
      setGraceDaysVal(masterControlSettings.graceDays ?? 3);
      setUpiIdVal(masterControlSettings.upiId || '');
      setUpiPayeeVal(masterControlSettings.upiPayeeName || '');

      setOverdueEscalationOn(masterControlSettings.overdueEscalationEnabled ?? masterControlSettings.overdueInterest?.enabled ?? false);
      setOverdueBaseRateVal(masterControlSettings.overdueBaseRateMonthly ?? masterControlSettings.overdueInterest?.baseRate ?? 2.0);
      const rawT = masterControlSettings.overdueEscalationTiers || masterControlSettings.overdueInterest?.escalationTiers;
      if (rawT && rawT.length > 0) {
        setOverdueTiersList([...rawT].sort((a, b) => a.overdueDays - b.overdueDays));
      }

      // Sync per-loan-type config map from masterControlSettings.loanTypes
      const baseLTs = masterControlSettings.loanTypes && masterControlSettings.loanTypes.length > 0
        ? masterControlSettings.loanTypes
        : defaultLoanTypes;

      const configs: Record<string, Partial<import('../types').LoanTypeConfig>> = {};
      const dynamicFees: { [key: string]: { enabled: boolean; amount: number } } = {};

      baseLTs.forEach((lt) => {
        configs[lt.id] = { ...lt };
        dynamicFees[lt.id] = {
          enabled: lt.cardFeeEnabled ?? true,
          amount: lt.cardFee ?? 25
        };
      });

      setLoanTypeConfigs(configs);
      setLoanTypesCardFees(dynamicFees);

      setOverdueCalMethod(masterControlSettings.overdueCalculationMethod || 'Whole months — a part month counts as full (recommended)');

      setAreasVal(masterControlSettings.areas || []);
      setPartnersVal(masterControlSettings.partners || []);
      setVehicleDocsVal(masterControlSettings.vehicleDocuments || []);
      setVehicleCompaniesVal(masterControlSettings.vehicleCompanies || []);
      setInsuranceCompaniesVal(masterControlSettings.insuranceCompanies || []);
      setShowroomsVal(masterControlSettings.showrooms || []);
    }
  }, [masterControlSettings]);


  useEffect(() => {
    if (whatsAppTemplates) {
      setWelcomeTpl(whatsAppTemplates.welcomeMessage || '');
      setDueTpl(whatsAppTemplates.dueReminderMessage || '');
      setReceiptTpl(whatsAppTemplates.receiptMessage || '');
    }
  }, [whatsAppTemplates]);

  // Defensive Aggregates with safe array checks
  const safeLoans = loans || [];
  const safeCustomers = customers || [];
  const safeReceipts = receipts || [];
  const safeFixedDeposits = fixedDeposits || [];
  const safeDayBookEntries = dayBookEntries || [];

  const activeLoans = safeLoans.filter((l) => l?.status === 'ACTIVE');
  const totalDisbursed = safeLoans.reduce((sum, l) => sum + (l?.principal || 0), 0);
  const totalOutstanding = safeLoans.reduce((sum, l) => sum + (l?.outstandingPrincipal || 0), 0);
  const totalCollected = safeReceipts.filter((r) => r?.kind !== 'NEW LOAN').reduce((sum, r) => sum + (r?.amount || 0), 0);
  const totalRecords = safeLoans.length + safeCustomers.length + safeReceipts.length + safeFixedDeposits.length + safeDayBookEntries.length;

  const todayStr = formatFDDate(new Date());

  // Fixed Deposit Overview Metrics (Section 25)
  const activeFDs = safeFixedDeposits.filter((f) => f?.status === 'ACTIVE');
  const withdrawnFDs = safeFixedDeposits.filter((f) => f?.status === 'WITHDRAWN' || (f?.status as string) === 'CLOSED');
  const totalFDCustomersCount = safeCustomers.filter((c) => !c.isDeleted && safeFixedDeposits.some((f) => isMatchingCustomerId(f.customerId, c))).length;
  const totalFDPrincipal = safeFixedDeposits.reduce((sum, f) => sum + (f?.principal || 0), 0);
  const totalActiveFDBalance = activeFDs.reduce((sum, f) => sum + (f?.remainingPrincipal ?? f?.principal ?? 0), 0);

  const pendingFDPeriods = getAllPendingFDInterestPeriods(activeFDs, fdInterestPayouts || [], todayStr);
  const pendingFDInterestTotal = pendingFDPeriods.reduce((sum, p) => sum + p.amount, 0);

  const maturingSoonFDs = activeFDs.filter((f) => {
    if (!f.maturityDate) return false;
    const comp = compareFDDates(normalizeDateString(f.maturityDate), todayStr);
    const diffDays = getDaysDifference(todayStr, normalizeDateString(f.maturityDate));
    return comp >= 0 && diffDays <= 30;
  });

  const handleUnlockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordInput) {
      showToast('Please enter password', 'warning');
      return;
    }
    setIsUnlocking(true);
    const success = await unlockMasterControl(passwordInput);
    setIsUnlocking(false);
    if (success) {
      setPasswordInput('');
    }
  };

  const handleSaveMasterChanges = () => {
    const baseLTs = masterControlSettings?.loanTypes && masterControlSettings.loanTypes.length > 0
      ? masterControlSettings.loanTypes
      : defaultLoanTypes;

    // Merge edits from loanTypeConfigs map back into loanTypes
    const updatedLoanTypes = baseLTs.map((lt) => {
      const cfg = loanTypeConfigs[lt.id] || {};
      const fee = loanTypesCardFees[lt.id];

      // Clean amount bands
      const cleanedBands = (cfg.amountBands || lt.amountBands || []).map(b => ({
        ...b,
        amount: b.amount === ('' as any) ? 0 : Number(b.amount) || 0,
        baseRateMonthly: b.baseRateMonthly === ('' as any) ? 0 : Number(b.baseRateMonthly) || 0,
        penaltyAfterMonths: b.penaltyAfterMonths === ('' as any) ? 0 : Number(b.penaltyAfterMonths) || 0,
        penaltyStepUpMonthly: b.penaltyStepUpMonthly === ('' as any) ? 0 : Number(b.penaltyStepUpMonthly) || 0
      }));

      return {
        ...lt,
        ...cfg,
        amountBands: cleanedBands,
        cardFeeEnabled: fee ? fee.enabled : (cfg.cardFeeEnabled ?? lt.cardFeeEnabled ?? true),
        cardFee: fee ? (Number(fee.amount) || 0) : (cfg.cardFee ?? lt.cardFee ?? 0),
        configurationVersion: (lt.configurationVersion || 1) + (JSON.stringify(cfg) !== JSON.stringify(lt) ? 1 : 0)
      };
    });

    // Validate amount bands for all types
    for (const lt of updatedLoanTypes) {
      for (const b of lt.amountBands || []) {
        if (b.amount < 0 || b.baseRateMonthly < 0 || b.penaltyAfterMonths < 0 || b.penaltyStepUpMonthly < 0) {
          showToast(`${lt.name} amount bands cannot contain negative values.`, 'error');
          return;
        }
      }
    }

    // Derive backward-compat flat fields from per-type configs
    const goldLT = updatedLoanTypes.find(lt => lt.id === 'gold-loan');
    const silverLT = updatedLoanTypes.find(lt => lt.id === 'silver-loan');
    const pronoteLT = updatedLoanTypes.find(lt => lt.id === 'pronote');
    const hireLT = updatedLoanTypes.find(lt => lt.id === 'hire-purchase');

    const numCardFee = cardFee === '' ? 10 : Number(cardFee);
    const numOverdueRate = overdueRate === '' ? 24 : Number(overdueRate);
    const numOverduePenalty = overduePenalty === '' ? 3.6 : Number(overduePenalty);
    const numGraceDays = graceDaysVal === '' ? 3 : Number(graceDaysVal);

    const cleanedTiers = overdueTiersList
      .map(t => ({
        overdueDays: Math.max(0, Math.floor(Number(t.overdueDays) || 0)),
        rate: Math.max(0, Number(t.rate) || 0)
      }))
      .sort((a, b) => a.overdueDays - b.overdueDays);

    if (!cleanedTiers.some(t => t.overdueDays === 0)) {
      cleanedTiers.unshift({ overdueDays: 0, rate: overdueBaseRateVal === '' ? 2.0 : Number(overdueBaseRateVal) });
    }

    updateMasterControlSettings({
      loanTypes: updatedLoanTypes,
      // Backward-compat flat fields derived from per-type configs
      showOnLoanIssue: goldLT?.showOnLoanIssue ?? true,
      hireShowOnLoanIssue: hireLT?.showOnLoanIssue ?? true,
      silverShowOnLoanIssue: silverLT?.showOnLoanIssue ?? true,
      pronoteShowOnLoanIssue: pronoteLT?.showOnLoanIssue ?? true,
      pronoteRate: pronoteLT?.defaultMonthlyRate ?? 12,
      amountBands: goldLT?.amountBands || [],
      silverAmountBands: silverLT?.amountBands || [],
      goldCardFeeEnabled: goldLT?.cardFeeEnabled ?? true,
      goldCardFee: goldLT?.cardFee ?? 0,
      silverCardFeeEnabled: silverLT?.cardFeeEnabled ?? true,
      silverCardFee: silverLT?.cardFee ?? 0,
      pronoteCardFeeEnabled: pronoteLT?.cardFeeEnabled ?? true,
      pronoteCardFee: pronoteLT?.cardFee ?? 0,
      hireCardFeeEnabled: hireLT?.cardFeeEnabled ?? true,
      hireCardFee: hireLT?.cardFee ?? 0,
      silverLoanMonthlyRate: silverLT?.defaultMonthlyRate ?? 2.0,
      pronoteMonthlyRate: pronoteLT?.defaultMonthlyRate ?? 12,
      hirePurchaseMonthlyRate: hireLT?.defaultMonthlyRate ?? 12,
      // Static non-loan-type settings
      overdueCalculationMethod: overdueCalMethod,
      overdueEscalationEnabled: overdueEscalationOn,
      overdueBaseRateMonthly: overdueBaseRateVal === '' ? 2.0 : Number(overdueBaseRateVal),
      overdueEscalationTiers: cleanedTiers,
      overdueInterest: {
        enabled: overdueEscalationOn,
        baseRate: overdueBaseRateVal === '' ? 2.0 : Number(overdueBaseRateVal),
        escalationTiers: cleanedTiers
      },
      animationsEnabled,
      performanceModeEnabled,
      lockersEnabled,
      defaultCardFee: numCardFee,
      overdueInterestRatePA: numOverdueRate,
      overduePenaltyPerDayPercent: numOverduePenalty,
      graceDays: numGraceDays,
      upiId: upiIdVal,
      upiPayeeName: upiPayeeVal,
      areas: areasVal,
      partners: partnersVal,
      vehicleDocuments: vehicleDocsVal,
      vehicleCompanies: vehicleCompaniesVal,
      insuranceCompanies: insuranceCompaniesVal,
      showrooms: showroomsVal
    });
    updateWhatsAppTemplates({
      welcomeMessage: welcomeTpl,
      dueReminderMessage: dueTpl,
      receiptMessage: receiptTpl
    });
    setMasterControlOpen(false);
  };


  const handleAddArea = () => {
    if (newAreaInput.trim()) {
      setAreasVal(prev => [...prev, newAreaInput.trim()]);
      setNewAreaInput('');
    }
  };
  const handleRemoveArea = (index: number) => {
    setAreasVal(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddPartner = () => {
    if (newPartnerInput.trim()) {
      setPartnersVal(prev => [...prev, newPartnerInput.trim()]);
      setNewPartnerInput('');
    }
  };
  const handleRemovePartner = (index: number) => {
    setPartnersVal(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddDoc = () => {
    if (newDocInput.trim()) {
      setVehicleDocsVal(prev => [...prev, newDocInput.trim()]);
      setNewDocInput('');
    }
  };
  const handleRemoveDoc = (index: number) => {
    setVehicleDocsVal(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddCompany = () => {
    if (newCompanyInput.trim()) {
      setVehicleCompaniesVal(prev => [...prev, newCompanyInput.trim()]);
      setNewCompanyInput('');
    }
  };
  const handleRemoveCompany = (index: number) => {
    setVehicleCompaniesVal(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddInsCompany = () => {
    if (newInsCompanyInput.trim()) {
      setInsuranceCompaniesVal(prev => [...prev, newInsCompanyInput.trim()]);
      setNewInsCompanyInput('');
    }
  };
  const handleRemoveInsCompany = (index: number) => {
    setInsuranceCompaniesVal(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddShowroom = () => {
    if (newShowroomInput.trim()) {
      setShowroomsVal(prev => [...prev, newShowroomInput.trim()]);
      setNewShowroomInput('');
    }
  };
  const handleRemoveShowroom = (index: number) => {
    setShowroomsVal(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddAmountBandForType = (loanTypeId: string) => {
    const newBand: AmountBand = {
      id: `band-${loanTypeId}-${Date.now()}`,
      condition: 'Above',
      amount: 10000,
      baseRateMonthly: 1.5,
      penaltyAfterMonths: 3,
      penaltyStepUpMonthly: 0.1,
      penaltyCalculation: 'From the start — stepped rate over the whole overc'
    };
    setLoanTypeConfigs(prev => ({
      ...prev,
      [loanTypeId]: {
        ...prev[loanTypeId],
        amountBands: [...(prev[loanTypeId]?.amountBands || []), newBand]
      }
    }));
  };

  const handleUpdateAmountBandForType = (loanTypeId: string, bandId: string, field: string, value: any) => {
    setLoanTypeConfigs(prev => ({
      ...prev,
      [loanTypeId]: {
        ...prev[loanTypeId],
        amountBands: (prev[loanTypeId]?.amountBands || []).map(b =>
          b.id === bandId ? { ...b, [field]: value } : b
        )
      }
    }));
  };

  const handleRemoveAmountBandForType = (loanTypeId: string, bandId: string) => {
    setLoanTypeConfigs(prev => ({
      ...prev,
      [loanTypeId]: {
        ...prev[loanTypeId],
        amountBands: (prev[loanTypeId]?.amountBands || []).filter(b => b.id !== bandId)
      }
    }));
  };


  return (
    <div className="page-content" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Hero Banner */}
      <div className="admin-hero-banner">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <KKVLogo size={52} />
          <div>
            <div className="admin-session-badge" style={{ marginBottom: '6px' }}>⚡ Admin Control Center</div>
            <h1 style={{ fontSize: '22px', fontWeight: 900, margin: 0, color: 'var(--text-primary)' }}>KKV GOLD FINANCE</h1>
            <p style={{ fontSize: '13px', margin: '4px 0 0', color: 'var(--text-secondary)' }}>Manage companies, access, data &amp; danger-zone actions</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            type="button"
            onClick={() => setShowConfigCenterModal(true)}
            style={{
              fontSize: '12px',
              backgroundColor: '#FFFFFF',
              color: '#176B52',
              border: '1px solid #176B52',
              padding: '6px 14px',
              borderRadius: 'var(--radius-full)',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
            }}
          >
            <Sliders size={13} />
            <span>Storage &amp; Safety</span>
          </button>
          <span style={{ fontSize: '12px', background: 'var(--color-gold-subtle)', color: 'var(--color-gold-light)', padding: '6px 14px', borderRadius: 'var(--radius-full)', fontWeight: 700, border: '1px solid rgba(201, 162, 39, 0.25)' }}>🟢 ADMIN SESSION ACTIVE</span>
        </div>
      </div>

      {/* Main Tabs */}
      <div style={{ display: 'flex', gap: '10px', paddingBottom: '4px', flexWrap: 'wrap' }}>
        {[
          { key: 'overview', label: 'Overview' },
          { key: 'customers', label: 'Customer Management' },
          { key: 'loans', label: 'Loan Management' },
          { key: 'rental', label: 'Complex Rental' }
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            style={{
              borderRadius: '10px',
              fontSize: '13.5px',
              padding: '8px 18px',
              fontWeight: activeTab === t.key ? 700 : 600,
              backgroundColor: activeTab === t.key ? '#176B52' : '#FFFFFF',
              color: activeTab === t.key ? '#FFFFFF' : '#4B5E54',
              border: activeTab === t.key ? '1px solid #176B52' : '1px solid #D8E0DA',
              boxShadow: activeTab === t.key ? '0 4px 12px rgba(23, 107, 82, 0.28)' : '0 2px 4px rgba(15, 60, 45, 0.04)',
              cursor: 'pointer',
              transition: 'all 0.18s ease'
            }}
            onClick={() => setActiveTab(t.key as any)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview Tab Content */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
          <div className="card" style={{ padding: '24px', borderRadius: '16px', border: '1px solid #DDE5DF', boxShadow: '0 6px 20px rgba(15, 60, 45, 0.08)', backgroundColor: '#FFFFFF', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: 'rgba(23, 107, 82, 0.12)', color: '#176B52', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Lock size={22} />
              </div>
              <div>
                <h3 style={{ fontSize: '17px', fontWeight: 800, color: '#1F2D26', margin: 0 }}>Master Control</h3>
                <p style={{ fontSize: '13px', color: '#66756D', margin: '3px 0 0' }}>Master security, bank &amp; UPI details, operations and danger-zone tools.</p>
              </div>
            </div>
            <button className="btn btn-primary" onClick={() => setMasterControlOpen(true)} style={{ backgroundColor: '#176B52', color: '#FFFFFF', fontWeight: 700, borderRadius: '10px', height: '42px', padding: '0 20px', boxShadow: '0 2px 8px rgba(23, 107, 82, 0.25)', gap: '8px' }}>
              <span>Open Master Control</span>
            </button>
          </div>

          {/* LOANS & CASH OVERVIEW */}
          <div>
            <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--color-primary-dark)', letterSpacing: '0.05em', marginBottom: '8px', textTransform: 'uppercase' }}>
              LOAN &amp; CASH OVERVIEW
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '16px' }}>
              <div className="stat-card">
                <div className="stat-card-info">
                  <span className="stat-card-label">CUSTOMERS</span>
                  <span className="stat-card-value">{safeCustomers.length}</span>
                </div>
                <div className="stat-card-icon" style={{ backgroundColor: 'rgba(23, 107, 82, 0.12)', color: '#176B52' }}><Users size={20} /></div>
              </div>
              <div className="stat-card">
                <div className="stat-card-info">
                  <span className="stat-card-label">ACTIVE LOANS</span>
                  <span className="stat-card-value">{activeLoans.length}</span>
                </div>
                <div className="stat-card-icon" style={{ backgroundColor: 'rgba(13, 148, 136, 0.12)', color: '#0D9488' }}><CreditCard size={20} /></div>
              </div>
              <div className="stat-card">
                <div className="stat-card-info">
                  <span className="stat-card-label">TOTAL DISBURSED</span>
                  <span className="stat-card-value">₹{totalDisbursed.toLocaleString('en-IN')}</span>
                </div>
                <div className="stat-card-icon" style={{ backgroundColor: 'rgba(201, 162, 39, 0.15)', color: '#B48909' }}><DollarSign size={20} /></div>
              </div>
              <div className="stat-card">
                <div className="stat-card-info">
                  <span className="stat-card-label">OUTSTANDING</span>
                  <span className="stat-card-value">₹{totalOutstanding.toLocaleString('en-IN')}</span>
                </div>
                <div className="stat-card-icon" style={{ backgroundColor: 'rgba(23, 107, 82, 0.12)', color: '#176B52' }}><Wallet size={20} /></div>
              </div>
              <div className="stat-card">
                <div className="stat-card-info">
                  <span className="stat-card-label">COLLECTED</span>
                  <span className="stat-card-value">₹{totalCollected.toLocaleString('en-IN')}</span>
                </div>
                <div className="stat-card-icon" style={{ backgroundColor: 'rgba(16, 185, 129, 0.14)', color: '#059669' }}><CheckCircle2 size={20} /></div>
              </div>
              <div className="stat-card">
                <div className="stat-card-info">
                  <span className="stat-card-label">CASH IN HAND</span>
                  <span className="stat-card-value">₹{(cashInHand || 0).toLocaleString('en-IN')}</span>
                </div>
                <div className="stat-card-icon" style={{ backgroundColor: 'rgba(23, 107, 82, 0.12)', color: '#176B52' }}><Wallet size={20} /></div>
              </div>
              <div className="stat-card">
                <div className="stat-card-info">
                  <span className="stat-card-label">CASH AT BANK</span>
                  <span className="stat-card-value">₹{(cashAtBank || 0).toLocaleString('en-IN')}</span>
                </div>
                <div className="stat-card-icon" style={{ backgroundColor: 'rgba(13, 148, 136, 0.12)', color: '#0D9488' }}><Building2 size={20} /></div>
              </div>
              <div className="stat-card">
                <div className="stat-card-info">
                  <span className="stat-card-label">TOTAL RECORDS</span>
                  <span className="stat-card-value">{totalRecords}</span>
                </div>
                <div className="stat-card-icon" style={{ backgroundColor: 'rgba(23, 107, 82, 0.12)', color: '#176B52' }}><Database size={20} /></div>
              </div>
            </div>
          </div>

          {/* SECTION 25: FIXED DEPOSITS OVERVIEW */}
          <div>
            <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--color-primary-dark)', letterSpacing: '0.05em', marginBottom: '8px', textTransform: 'uppercase' }}>
              FIXED DEPOSITS OVERVIEW
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '16px' }}>
              <div className="stat-card">
                <div className="stat-card-info">
                  <span className="stat-card-label">TOTAL FD CUSTOMERS</span>
                  <span className="stat-card-value">{totalFDCustomersCount}</span>
                </div>
                <div className="stat-card-icon" style={{ backgroundColor: 'rgba(23, 107, 82, 0.12)', color: '#176B52' }}><Users size={20} /></div>
              </div>

              <div className="stat-card">
                <div className="stat-card-info">
                  <span className="stat-card-label">ACTIVE FDs</span>
                  <span className="stat-card-value">{activeFDs.length}</span>
                </div>
                <div className="stat-card-icon" style={{ backgroundColor: 'rgba(201, 162, 39, 0.15)', color: '#B48909' }}><PiggyBank size={20} /></div>
              </div>

              <div className="stat-card">
                <div className="stat-card-info">
                  <span className="stat-card-label">TOTAL FD PRINCIPAL</span>
                  <span className="stat-card-value">₹{totalFDPrincipal.toLocaleString('en-IN')}</span>
                </div>
                <div className="stat-card-icon" style={{ backgroundColor: 'rgba(201, 162, 39, 0.15)', color: '#B48909' }}><DollarSign size={20} /></div>
              </div>

              <div className="stat-card">
                <div className="stat-card-info">
                  <span className="stat-card-label">ACTIVE FD BALANCE</span>
                  <span className="stat-card-value">₹{totalActiveFDBalance.toLocaleString('en-IN')}</span>
                </div>
                <div className="stat-card-icon" style={{ backgroundColor: 'rgba(16, 185, 129, 0.14)', color: '#059669' }}><Wallet size={20} /></div>
              </div>

              <div className="stat-card">
                <div className="stat-card-info">
                  <span className="stat-card-label">PENDING FD INTEREST</span>
                  <span className="stat-card-value" style={pendingFDInterestTotal > 0 ? { color: '#dc2626' } : undefined}>
                    ₹{pendingFDInterestTotal.toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="stat-card-icon" style={{ backgroundColor: pendingFDInterestTotal > 0 ? 'rgba(239, 68, 68, 0.12)' : 'rgba(245, 158, 11, 0.15)', color: pendingFDInterestTotal > 0 ? '#dc2626' : '#D97706' }}><Bell size={20} /></div>
              </div>

              <div className="stat-card">
                <div className="stat-card-info">
                  <span className="stat-card-label">MATURING SOON (30D)</span>
                  <span className="stat-card-value">{maturingSoonFDs.length}</span>
                </div>
                <div className="stat-card-icon" style={{ backgroundColor: 'rgba(13, 148, 136, 0.12)', color: '#0D9488' }}><Clock size={20} /></div>
              </div>

              <div className="stat-card">
                <div className="stat-card-info">
                  <span className="stat-card-label">WITHDRAWN FDs</span>
                  <span className="stat-card-value">{withdrawnFDs.length}</span>
                </div>
                <div className="stat-card-icon" style={{ backgroundColor: 'rgba(100, 116, 139, 0.12)', color: '#64748b' }}><CheckCircle2 size={20} /></div>
              </div>

              <div
                className="stat-card"
                style={{ cursor: 'pointer', border: '1.5px dashed var(--color-primary-accent, #B48909)' }}
                onClick={() => setCurrentPage('settings')}
                title="Configured in Settings → Gold Rates & Rates"
              >
                <div className="stat-card-info">
                  <span className="stat-card-label">MASTER FD RATE</span>
                  <span className="stat-card-value" style={{ color: 'var(--color-primary-dark, #064e3b)' }}>
                    {(masterControlSettings?.fdInterestRate ?? 12).toFixed(2)}% <span style={{ fontSize: '12px', fontWeight: 600 }}>p.a.</span>
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Eff: {masterControlSettings?.fdInterestRateEffectiveFrom || '01-08-2026'}
                  </span>
                </div>
                <div className="stat-card-icon" style={{ backgroundColor: 'rgba(201, 162, 39, 0.18)', color: '#B48909' }}><Percent size={20} /></div>
              </div>
            </div>
          </div>

          {/* COMPLEX RENTAL MANAGEMENT OVERVIEW (LIVE PRIMARY DB) */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--color-primary-dark)', letterSpacing: '0.05em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>🏢 COMPLEX RENTAL MANAGEMENT (LIVE LEDGER)</span>
                {rentalSummaryLoading && <RefreshCw size={12} className="spin-animation" />}
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setCurrentPage('rental-dashboard')}
                style={{ fontSize: '12px', height: '28px', padding: '0 12px', gap: '5px' }}
                title="Open Rental Management Module"
              >
                <span>Rental Management Module ↗</span>
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '16px' }}>
              <div className="stat-card">
                <div className="stat-card-info">
                  <span className="stat-card-label">TOTAL COMPLEXES</span>
                  <span className="stat-card-value">{rentalSummary?.totalComplexes ?? 0}</span>
                </div>
                <div className="stat-card-icon" style={{ backgroundColor: 'rgba(23, 107, 82, 0.12)', color: '#176B52' }}><Building2 size={20} /></div>
              </div>
              <div className="stat-card">
                <div className="stat-card-info">
                  <span className="stat-card-label">TOTAL SHOPS</span>
                  <span className="stat-card-value">{rentalSummary?.totalShops ?? 0}</span>
                </div>
                <div className="stat-card-icon" style={{ backgroundColor: 'rgba(13, 148, 136, 0.12)', color: '#0D9488' }}><Building2 size={20} /></div>
              </div>
              <div className="stat-card">
                <div className="stat-card-info">
                  <span className="stat-card-label">EXPECTED RENT</span>
                  <span className="stat-card-value">₹{(rentalSummary?.expectedMonthlyRent || 0).toLocaleString('en-IN')}</span>
                </div>
                <div className="stat-card-icon" style={{ backgroundColor: 'rgba(201, 162, 39, 0.15)', color: '#B48909' }}><DollarSign size={20} /></div>
              </div>
              <div className="stat-card">
                <div className="stat-card-info">
                  <span className="stat-card-label">COLLECTED THIS MONTH</span>
                  <span className="stat-card-value" style={{ color: '#059669' }}>₹{(rentalSummary?.collectedThisMonth || 0).toLocaleString('en-IN')}</span>
                </div>
                <div className="stat-card-icon" style={{ backgroundColor: 'rgba(16, 185, 129, 0.14)', color: '#059669' }}><CheckCircle2 size={20} /></div>
              </div>
              <div className="stat-card">
                <div className="stat-card-info">
                  <span className="stat-card-label">PENDING RENT</span>
                  <span className="stat-card-value" style={{ color: '#dc2626' }}>₹{(rentalSummary?.pendingRent || 0).toLocaleString('en-IN')}</span>
                </div>
                <div className="stat-card-icon" style={{ backgroundColor: 'rgba(239, 68, 68, 0.12)', color: '#dc2626' }}><AlertTriangle size={20} /></div>
              </div>
              <div className="stat-card">
                <div className="stat-card-info">
                  <span className="stat-card-label">AVAILABLE ADVANCE</span>
                  <span className="stat-card-value" style={{ color: '#2563eb' }}>₹{(rentalSummary?.advanceAmount || 0).toLocaleString('en-IN')}</span>
                </div>
                <div className="stat-card-icon" style={{ backgroundColor: 'rgba(37, 99, 235, 0.12)', color: '#2563eb' }}><Wallet size={20} /></div>
              </div>
              <div className="stat-card">
                <div className="stat-card-info">
                  <span className="stat-card-label">TOTAL EXPENSES</span>
                  <span className="stat-card-value" style={{ color: '#d97706' }}>₹{(rentalSummary?.totalExpenses || 0).toLocaleString('en-IN')}</span>
                </div>
                <div className="stat-card-icon" style={{ backgroundColor: 'rgba(217, 119, 6, 0.12)', color: '#d97706' }}><DollarSign size={20} /></div>
              </div>
              <div className="stat-card">
                <div className="stat-card-info">
                  <span className="stat-card-label">NET RENTAL COLLECTION</span>
                  <span className="stat-card-value" style={{ color: '#176B52', fontWeight: 800 }}>₹{(rentalSummary?.netCollection || 0).toLocaleString('en-IN')}</span>
                </div>
                <div className="stat-card-icon" style={{ backgroundColor: 'rgba(23, 107, 82, 0.15)', color: '#176B52' }}><CheckCircle2 size={20} /></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Complex Rental Tab Content (Synchronized Read-Only Live Ledger) */}
      {activeTab === 'rental' && <RentalAdminView />}

      {/* Customer Management Tab Content */}
      {activeTab === 'customers' && (() => {
        const query = adminCustSearch.toLowerCase().trim();

        const filteredCusts = customers
          .filter(c => (custSubTab === 'deleted' ? Boolean(c.isDeleted) : !c.isDeleted))
          .filter(c => {
            if (!query) return true;
            const canonicalId = getCanonicalCustomerId(c).toLowerCase();
            const numIdStr = c.customerId ? c.customerId.toString().toLowerCase() : '';
            const matchesLoanNo = safeLoans.some(l => isMatchingCustomerId(l.customerId, c) && l.loanNo.toLowerCase().includes(query));
            const matchesFDNo = safeFixedDeposits.some(f => isMatchingCustomerId(f.customerId, c) && f.fdNo.toLowerCase().includes(query));

            return (
              c.name.toLowerCase().includes(query) ||
              c.phone.includes(query) ||
              c.id.toLowerCase().includes(query) ||
              canonicalId.includes(query) ||
              numIdStr.includes(query) ||
              isMatchingCustomerId(query, c) ||
              matchesLoanNo ||
              matchesFDNo
            );
          });

        const topMatch = query && filteredCusts.length > 0 ? filteredCusts[0] : null;

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Top Bar: Subtabs & Search */}
            <div className="card" style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className={`btn ${custSubTab === 'active' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ fontSize: '13px', padding: '6px 16px' }}
                    onClick={() => setCustSubTab('active')}
                  >
                    Active Customers ({customers.filter(c => !c.isDeleted).length})
                  </button>
                  <button
                    type="button"
                    className={`btn ${custSubTab === 'deleted' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ fontSize: '13px', padding: '6px 16px' }}
                    onClick={() => setCustSubTab('deleted')}
                  >
                    Deleted Customers ({customers.filter(c => c.isDeleted).length})
                  </button>
                </div>

                <div style={{ position: 'relative', width: '360px' }}>
                  <input
                    type="text"
                    className="input-control"
                    style={{ paddingLeft: '38px', height: '40px', fontSize: '13px' }}
                    placeholder="Search Customer ID (e.g. CUST-0006), Name, Mobile..."
                    value={adminCustSearch}
                    onChange={(e) => setAdminCustSearch(e.target.value)}
                  />
                  <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                </div>
              </div>
            </div>

            {/* SECTION 17: TOP MATCH HIGHLIGHT CARD */}
            {topMatch && (
              (() => {
                const c = topMatch;
                const custCanonicalId = getCanonicalCustomerId(c);
                const custLoans = safeLoans.filter(l => isMatchingCustomerId(l.customerId, c) && l.status !== 'CLOSED');
                const custFDs = safeFixedDeposits.filter(f => isMatchingCustomerId(f.customerId, c));
                const activeCustFDs = custFDs.filter(f => f.status === 'ACTIVE');
                const totalCustFdBal = activeCustFDs.reduce((sum, f) => sum + (f.remainingPrincipal ?? f.principal ?? 0), 0);

                return (
                  <div
                    className="card"
                    style={{
                      padding: '18px 22px',
                      borderLeft: '5px solid var(--color-primary-accent, #059669)',
                      backgroundColor: '#ffffff',
                      boxShadow: 'var(--shadow-sm)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: 'var(--badge-success-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: 'var(--badge-success-text)', border: '1px solid var(--badge-success-border)', overflow: 'hidden' }}>
                          {c.customerPhoto ? (
                            <img src={c.customerPhoto} alt={c.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            c.name.charAt(0).toUpperCase()
                          )}
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h3 style={{ fontSize: '17px', fontWeight: 900, color: 'var(--color-primary-dark)', margin: 0 }}>
                              {c.name}
                            </h3>
                            <span className="badge badge-info" style={{ fontSize: '11px', fontWeight: 800 }}>
                              {custCanonicalId}
                            </span>
                            <span className="badge badge-success" style={{ fontSize: '11px' }}>
                              {c.isDeleted ? 'DELETED' : 'ACTIVE'}
                            </span>
                          </div>
                          <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', marginTop: '4px' }}>
                            <span>Mobile: <strong>+91 {c.phone}</strong></span>
                            <span>&bull;</span>
                            <span style={{ fontWeight: 700, color: 'var(--color-primary-dark)' }}>Loans: {custLoans.length}</span>
                            <span>&bull;</span>
                            <span style={{ fontWeight: 800, color: 'var(--color-gold-dark, #b45309)' }}>Fixed Deposits: {activeCustFDs.length} ACTIVE</span>
                            <span>&bull;</span>
                            <span style={{ fontWeight: 800, color: 'var(--color-primary-accent, #059669)' }}>FD Balance: ₹{totalCustFdBal.toLocaleString('en-IN')}</span>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => {
                          setSelectedProfileCustomerId(c.id);
                          setCurrentPage('customer-profile');
                        }}
                        style={{ fontWeight: 800, padding: '8px 18px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
                      >
                        <Eye size={14} />
                        <span>View Customer Overview &rarr;</span>
                      </button>
                    </div>
                  </div>
                );
              })()
            )}

            {/* Customer Table Card (Sections 2 & 3) */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="table-container">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>CUSTOMER ID</th>
                      <th>PROFILE</th>
                      <th>CUSTOMER</th>
                      <th>MOBILE</th>
                      <th>LOANS</th>
                      <th>FIXED DEPOSITS</th>
                      <th>FINANCIAL EXPOSURE</th>
                      <th>STATUS</th>
                      <th style={{ textAlign: 'center', width: '160px' }}>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCusts.length === 0 ? (
                      <tr>
                        <td colSpan={9} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                          No {custSubTab === 'deleted' ? 'deleted' : 'active'} customer records found.
                        </td>
                      </tr>
                    ) : (
                      filteredCusts.map((c) => {
                        const custCanonicalId = getCanonicalCustomerId(c);
                        const custLoans = safeLoans.filter(l => isMatchingCustomerId(l.customerId, c) && l.status !== 'CLOSED');
                        const custOutstanding = custLoans.reduce((sum, l) => sum + (l.outstandingPrincipal ?? l.principal ?? 0), 0);
                        const custFDs = safeFixedDeposits.filter(f => isMatchingCustomerId(f.customerId, c));
                        const activeCustFDs = custFDs.filter(f => f.status === 'ACTIVE');
                        const totalCustFdBal = activeCustFDs.reduce((sum, f) => sum + (f.remainingPrincipal ?? f.principal ?? 0), 0);
                        const exposure = custOutstanding + totalCustFdBal;

                        return (
                          <tr key={c.id}>
                            <td>
                              <span className="badge badge-info" style={{ fontSize: '11px', fontWeight: 800 }}>
                                {custCanonicalId}
                              </span>
                            </td>
                            <td>
                              {c.customerPhoto ? (
                                <img
                                  src={c.customerPhoto}
                                  alt={c.name}
                                  style={{
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '50%',
                                    objectFit: 'cover',
                                    border: '1.5px solid var(--color-primary-accent)'
                                  }}
                                />
                              ) : (
                                <div
                                  style={{
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '50%',
                                    backgroundColor: 'var(--color-light-accent)',
                                    color: 'var(--color-primary-dark)',
                                    fontWeight: 700,
                                    fontSize: '12px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                  }}
                                >
                                  {c.name.charAt(0).toUpperCase()}
                                </div>
                              )}
                            </td>
                            <td style={{ fontWeight: 700, color: 'var(--text-dark)' }}>{c.name}</td>
                            <td style={{ fontWeight: 600 }}>+91 {c.phone}</td>
                            <td>
                              {custLoans.length > 0 ? (
                                <span className="badge badge-success" style={{ fontSize: '11px' }}>
                                  {custLoans.length} Active
                                </span>
                              ) : (
                                <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>0 Loans</span>
                              )}
                            </td>
                            <td>
                              {/* Section 3: FIXED DEPOSITS COLUMN */}
                              {activeCustFDs.length > 0 ? (
                                <span className="badge badge-gold" style={{ fontSize: '11px', fontWeight: 800 }}>
                                  {activeCustFDs.length} ACTIVE
                                </span>
                              ) : custFDs.length > 0 ? (
                                <span className="badge badge-secondary" style={{ fontSize: '11px' }}>
                                  {custFDs.length} Historical
                                </span>
                              ) : (
                                <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>0 FDs</span>
                              )}
                            </td>
                            <td>
                              <strong style={{ color: exposure > 0 ? 'var(--color-primary-dark)' : 'var(--text-muted)', fontSize: '12.5px' }}>
                                ₹{exposure.toLocaleString('en-IN')}
                              </strong>
                            </td>
                            <td>
                              {c.isDeleted ? (
                                <span className="badge badge-danger" style={{ fontSize: '11px' }}>DELETED</span>
                              ) : (
                                <span className="badge badge-success" style={{ fontSize: '11px' }}>VERIFIED</span>
                              )}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <div style={{ display: 'inline-flex', gap: '6px' }}>
                                {custSubTab === 'deleted' ? (
                                  <div style={{ display: 'flex', gap: '6px' }}>
                                    <button
                                      className="btn btn-secondary btn-sm"
                                      style={{ height: '28px', padding: '0 8px', fontSize: '11px', gap: '4px' }}
                                      title="Restore Customer"
                                      onClick={() => restoreCustomer(c.id)}
                                    >
                                      <RotateCcw size={12} />
                                      <span>Restore</span>
                                    </button>
                                    {userRole === 'ADMIN' && (
                                      <button
                                        className="btn btn-sm"
                                        style={{
                                          height: '28px',
                                          padding: '0 8px',
                                          fontSize: '11px',
                                          gap: '4px',
                                          backgroundColor: '#ef4444',
                                          color: '#ffffff',
                                          border: 'none',
                                          borderRadius: '6px',
                                          fontWeight: 700,
                                          cursor: 'pointer'
                                        }}
                                        title="Delete Completely (Master Admin Only)"
                                        onClick={() => {
                                          setPermanentDeleteTarget(c);
                                          setPermanentDeleteInput('');
                                        }}
                                      >
                                        <Trash2 size={12} />
                                        <span>🗑 Delete Completely</span>
                                      </button>
                                    )}
                                  </div>
                                ) : (
                                  <>
                                    <button
                                      className="btn btn-primary btn-sm"
                                      style={{ height: '28px', padding: '0 8px', fontSize: '11px', gap: '4px', fontWeight: 700 }}
                                      title="View Customer Overview"
                                      onClick={() => {
                                        setSelectedProfileCustomerId(c.id);
                                        setCurrentPage('customer-profile');
                                      }}
                                    >
                                      <Eye size={12} />
                                      <span>View &rarr;</span>
                                    </button>
                                    <button
                                      className="icon-button"
                                      style={{ width: '28px', height: '28px' }}
                                      title="Edit Customer"
                                      onClick={() => startEditCustomer(c.id)}
                                    >
                                      <Edit3 size={13} />
                                    </button>
                                    {userRole === 'ADMIN' && (
                                      <button
                                        className="icon-button"
                                        style={{ width: '28px', height: '28px', color: 'var(--color-danger, #ef4444)' }}
                                        title="Move to Deleted Customers"
                                        onClick={() => setDeletingCustomer(c)}
                                      >
                                        <Trash2 size={13} />
                                      </button>
                                    )}
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Loan Management Tab Content (Admin Only) */}
      {activeTab === 'loans' && (() => {
        const query = adminLoanSearch.toLowerCase().trim();
        const filteredLoans = loans.filter((l) => {
          if (adminLoanStatus !== 'ALL' && l.status !== adminLoanStatus) return false;
          if (!query) return true;
          const matchLoanNo = (l.loanNo || '').toLowerCase().includes(query);
          const matchCustName = (l.customerName || '').toLowerCase().includes(query);
          const matchCustPhone = (l.customerPhone || '').includes(query);
          const matchCustId = (l.customerId || '').toLowerCase().includes(query);
          return matchLoanNo || matchCustName || matchCustPhone || matchCustId;
        });

        const activeLoansCount = loans.filter((l) => l.status === 'ACTIVE').length;
        const closedLoansCount = loans.filter((l) => l.status === 'CLOSED').length;
        const overdueLoansCount = loans.filter((l) => l.status === 'OVERDUE').length;
        const totalPrincipal = loans.reduce((acc, l) => acc + (l.principal || 0), 0);
        const totalOutstanding = loans.reduce(
          (acc, l) => acc + (l.status === 'CLOSED' ? 0 : (l.outstandingPrincipal ?? l.principal ?? 0)),
          0
        );

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: '#1F2D26' }}>
                  Loan Management &amp; Administrative Actions
                </h2>
                <p style={{ fontSize: '13px', margin: '3px 0 0', color: '#66756D' }}>
                  Administer, inspect, edit, or delete existing issued loans with automated financial audit logging.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setCurrentPage('loan-issue')}
                style={{ fontSize: '13px', fontWeight: 700, padding: '8px 16px', gap: '6px' }}
              >
                <Plus size={15} />
                <span>+ Issue New Loan</span>
              </button>
            </div>

            {/* Metric Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
              <div className="stat-card" style={{ padding: '16px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)' }}>TOTAL LOANS</span>
                <div style={{ fontSize: '20px', fontWeight: 800, color: '#176B52', marginTop: '6px' }}>
                  {loans.length}
                </div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Total portfolio contracts</span>
              </div>
              <div className="stat-card" style={{ padding: '16px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#166534' }}>ACTIVE LOANS</span>
                <div style={{ fontSize: '20px', fontWeight: 800, color: '#166534', marginTop: '6px' }}>
                  {activeLoansCount}
                </div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Currently running</span>
              </div>
              <div className="stat-card" style={{ padding: '16px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#b45309' }}>OVERDUE LOANS</span>
                <div style={{ fontSize: '20px', fontWeight: 800, color: '#b45309', marginTop: '6px' }}>
                  {overdueLoansCount}
                </div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Payment delayed</span>
              </div>
              <div className="stat-card" style={{ padding: '16px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#1e40af' }}>CLOSED LOANS</span>
                <div style={{ fontSize: '20px', fontWeight: 800, color: '#1e40af', marginTop: '6px' }}>
                  {closedLoansCount}
                </div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Fully settled</span>
              </div>
              <div className="stat-card" style={{ padding: '16px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-primary-dark)' }}>TOTAL PRINCIPAL</span>
                <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-primary-dark)', marginTop: '6px' }}>
                  ₹{totalPrincipal.toLocaleString('en-IN')}
                </div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Disbursed capital</span>
              </div>
              <div className="stat-card" style={{ padding: '16px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#ef4444' }}>TOTAL OUTSTANDING</span>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#ef4444', marginTop: '6px' }}>
                  ₹{totalOutstanding.toLocaleString('en-IN')}
                </div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Unrecovered balance</span>
              </div>
            </div>

            {/* Filter and Search Bar */}
            <div className="card" style={{ padding: '16px 20px', border: '1px solid #DDE5DF', borderRadius: '12px' }}>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: '1 1 240px' }}>
                  <input
                    type="text"
                    className="input-control"
                    placeholder="Search by loan no, borrower name, mobile or customer ID..."
                    value={adminLoanSearch}
                    onChange={(e) => setAdminLoanSearch(e.target.value)}
                    style={{ paddingLeft: '36px', height: '38px', fontSize: '13px' }}
                  />
                  <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                </div>

                <div style={{ flex: '0 1 160px' }}>
                  <select
                    className="select-control"
                    value={adminLoanStatus}
                    onChange={(e) => setAdminLoanStatus(e.target.value as any)}
                    style={{ height: '38px', fontSize: '12.5px' }}
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="ACTIVE">Active</option>
                    <option value="PENDING">Pending</option>
                    <option value="OVERDUE">Overdue</option>
                    <option value="CLOSED">Closed</option>
                  </select>
                </div>

                {adminLoanSearch && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setAdminLoanSearch('')}
                    style={{ height: '38px', fontSize: '12px', gap: '4px' }}
                  >
                    <RotateCcw size={13} />
                    <span>Clear Search</span>
                  </button>
                )}
              </div>
            </div>

            {/* Loan Table */}
            <div className="card" style={{ padding: '0', borderRadius: '12px', overflow: 'hidden', border: '1px solid #DDE5DF' }}>
              <div style={{ overflowX: 'auto' }}>
                <table className="table" style={{ margin: 0, width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#F8FAF9', borderBottom: '1.5px solid #D8E0DA' }}>
                      <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 800, color: '#4B5E54' }}>LOAN NO</th>
                      <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 800, color: '#4B5E54' }}>CUSTOMER</th>
                      <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 800, color: '#4B5E54' }}>PRINCIPAL</th>
                      <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 800, color: '#4B5E54' }}>INTEREST</th>
                      <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 800, color: '#4B5E54' }}>ISSUE DATE</th>
                      <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 800, color: '#4B5E54' }}>REPAYMENTS</th>
                      <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 800, color: '#4B5E54' }}>OUTSTANDING</th>
                      <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 800, color: '#4B5E54' }}>STATUS</th>
                      <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 800, color: '#4B5E54', textAlign: 'center', width: '220px' }}>ADMIN ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLoans.length === 0 ? (
                      <tr>
                        <td colSpan={9} style={{ textAlign: 'center', padding: '40px', color: '#66756D', fontSize: '13px' }}>
                          No loans found matching the search criteria.
                        </td>
                      </tr>
                    ) : (
                      filteredLoans.map((l) => {
                        const linkedCust = customers.find(
                          (c) => c.id === l.customerId || (c.customerId && c.customerId.toString() === l.customerId)
                        );
                        const custName = linkedCust?.name || l.customerName || 'Customer';
                        const custId = linkedCust?.id || l.customerId || '—';
                        const outstanding = l.status === 'CLOSED' ? 0 : (l.outstandingPrincipal ?? l.principal ?? 0);

                        // Calculate total repayments
                        const loanReceipts = receipts.filter(
                          (r) => (r.loanId === l.id || r.loanNo === l.loanNo) &&
                            (r.kind || '').toUpperCase() !== 'LOAN DISBURSEMENT' &&
                            (r.kind || '').toUpperCase() !== 'NEW LOAN'
                        );
                        const totalRepayments = loanReceipts.reduce((sum, r) => sum + (r.amount || 0), 0);

                        return (
                          <tr key={`admin-loan-${l.id}`} style={{ borderBottom: '1px solid #EDF2EE' }}>
                            <td style={{ padding: '12px 16px', fontWeight: 800, color: '#176B52', fontFamily: 'monospace' }}>
                              {l.loanNo || l.id}
                            </td>
                            <td style={{ padding: '12px 16px' }}>
                              <div style={{ fontWeight: 700, color: '#1F2D26' }}>{custName}</div>
                              <div style={{ fontSize: '11px', color: '#66756D' }}>ID: {custId}</div>
                            </td>
                            <td style={{ padding: '12px 16px', fontWeight: 700 }}>
                              ₹{(l.principal || 0).toLocaleString('en-IN')}
                            </td>
                            <td style={{ padding: '12px 16px', color: '#176B52', fontWeight: 600 }}>
                              {l.interestRate || 1.5}%/mo
                            </td>
                            <td style={{ padding: '12px 16px', fontSize: '12.5px', color: '#4B5E54' }}>
                              {l.date}
                            </td>
                            <td style={{ padding: '12px 16px' }}>
                              <div style={{ fontSize: '12.5px', fontWeight: 700, color: totalRepayments > 0 ? '#10b981' : '#64748b' }}>
                                ₹{totalRepayments.toLocaleString('en-IN')}
                              </div>
                              <span style={{ fontSize: '10.5px', color: '#94a3b8' }}>
                                {loanReceipts.length} receipt(s)
                              </span>
                            </td>
                            <td style={{ padding: '12px 16px', fontWeight: 800, color: outstanding > 0 ? '#ef4444' : '#10b981' }}>
                              ₹{outstanding.toLocaleString('en-IN')}
                            </td>
                            <td style={{ padding: '12px 16px' }}>
                              <span
                                className={`badge ${
                                  l.status === 'ACTIVE'
                                    ? 'badge-success'
                                    : l.status === 'CLOSED'
                                    ? 'badge-info'
                                    : 'badge-warning'
                                }`}
                                style={{ fontSize: '11px' }}
                              >
                                {l.status}
                              </span>
                            </td>
                            <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  style={{ height: '30px', padding: '0 8px', fontSize: '11px', gap: '4px', fontWeight: 700 }}
                                  title="View in Loan Display"
                                  onClick={() => {
                                    setSelectedLoan(l);
                                    setCurrentPage('loan-display');
                                  }}
                                >
                                  <Eye size={12} />
                                  <span>View</span>
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  style={{ height: '30px', padding: '0 8px', fontSize: '11px', gap: '4px', fontWeight: 700 }}
                                  title="Admin Edit Loan"
                                  onClick={() => setEditingLoan(l)}
                                >
                                  <Edit3 size={12} />
                                  <span>Edit</span>
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  style={{
                                    height: '30px',
                                    padding: '0 8px',
                                    fontSize: '11px',
                                    gap: '4px',
                                    fontWeight: 700,
                                    color: 'var(--color-danger, #ef4444)'
                                  }}
                                  title="Admin Delete Loan"
                                  onClick={() => setDeletingLoan(l)}
                                >
                                  <Trash2 size={12} />
                                  <span>Delete</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Master Control Modal Overlay */}
      {masterControlOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }}>
          <div className="card" style={{ maxWidth: '850px', width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: '24px', position: 'relative' }}>
            <button
              type="button"
              style={{ position: 'absolute', right: '16px', top: '16px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              onClick={() => setMasterControlOpen(false)}
              aria-label="Close Master Control"
            >
              <X size={18} />
            </button>

            {!masterControlUnlocked ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>Master Control – Login</h3>
                <form onSubmit={handleUnlockSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div className="form-group">
                    <label className="form-label required">PASSWORD</label>
                    <input
                      type="password"
                      className="input-control"
                      value={passwordInput}
                      onChange={(e) => setPasswordInput(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button type="submit" className="btn btn-primary" disabled={isUnlocking}>
                      {isUnlocking ? 'Unlocking...' : 'Unlock'}
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => setMasterControlOpen(false)}>Cancel</button>
                  </div>
                </form>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Master Control</h2>
                <div style={{ padding: '10px 14px', backgroundColor: 'var(--badge-warning-bg)', color: 'var(--badge-warning-text)', borderRadius: 'var(--radius-sm)', fontSize: '12px', border: '1px solid rgba(210, 168, 74, 0.25)' }}>
                  Changes here affect all NEW loans. Existing loans keep the rates they were issued at.
                </div>

                <div style={{ display: 'flex', gap: '16px', borderBottom: '1px solid var(--border-light)', paddingBottom: '8px', flexWrap: 'wrap' }}>
                  {[
                    { key: 'rates', label: 'Rates & Payments' },
                    { key: 'loan-config', label: 'Loan Configuration' },
                    { key: 'fd-config', label: 'FD Configuration' },
                    { key: 'purity', label: 'Purity Management' },
                    { key: 'operations', label: 'Operations' },
                    { key: 'messaging', label: 'Messaging' },
                    { key: 'security', label: 'Security & Access' },
                    { key: 'danger', label: 'Danger Zone' }
                  ].map((mt) => (
                    <button
                      key={mt.key}
                      type="button"
                      style={{
                        background: 'none',
                        border: 'none',
                        fontSize: '13.5px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        color: masterSubTab === mt.key ? (mt.key === 'danger' ? '#DC2626' : 'var(--color-primary-dark)') : 'var(--text-muted)',
                        borderBottom: masterSubTab === mt.key ? `2px solid ${mt.key === 'danger' ? '#DC2626' : 'var(--color-primary-dark)'}` : 'none',
                        paddingBottom: '4px'
                      }}
                      onClick={() => {
                        if (mt.key === 'danger') {
                          handleDangerZoneTabClick();
                        } else {
                          setMasterSubTab(mt.key as any);
                        }
                      }}
                    >
                      {mt.label}
                    </button>
                  ))}
                </div>

                {masterSubTab === 'rates' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ padding: '10px 14px', backgroundColor: 'var(--bg-surface-secondary)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '16px' }}>💡</span>
                      <div>
                        <strong style={{ color: 'var(--text-primary)' }}>Single Source of Truth:</strong> Changes to rates, amount bands, fees, and product toggles apply immediately to <strong>NEW</strong> loans in Loan Issue. Existing loans preserve their contractual rate and calculation snapshot.
                      </div>
                    </div>

                    {/* ── Dynamic Loan Type Chip Tabs ── */}
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {(() => {
                        const activeLTs = (masterControlSettings?.loanTypes && masterControlSettings.loanTypes.length > 0
                          ? masterControlSettings.loanTypes
                          : defaultLoanTypes
                        ).slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

                        return [
                          ...activeLTs.map(lt => ({ key: lt.id, label: lt.name })),
                          { key: 'card', label: '💳 Card Fee' },
                          { key: 'overdue', label: '🕐 Overdue Interest' },
                          { key: 'upi', label: '🔗 UPI Payment' }
                        ].map(sc => (
                          <button
                            key={sc.key}
                            type="button"
                            className={`btn btn-sm ${ratesSubChip === sc.key ? 'btn-primary' : 'btn-secondary'}`}
                            style={{ borderRadius: 'var(--radius-full)', fontSize: '11.5px', padding: '4px 12px' }}
                            onClick={() => setRatesSubChip(sc.key)}
                          >
                            {sc.label}
                          </button>
                        ));
                      })()}
                    </div>

                    {/* ── Dynamic Loan Type Panel ── renders for any loanTypeId that is not card/overdue/upi */}
                    {ratesSubChip !== 'card' && ratesSubChip !== 'overdue' && ratesSubChip !== 'upi' && (() => {
                      const allLTs = masterControlSettings?.loanTypes && masterControlSettings.loanTypes.length > 0
                        ? masterControlSettings.loanTypes
                        : defaultLoanTypes;
                      const selectedLT = allLTs.find(lt => lt.id === ratesSubChip);
                      if (!selectedLT) return null;

                      const cfg = loanTypeConfigs[selectedLT.id] || {};
                      const showOnIssue = cfg.showOnLoanIssue ?? selectedLT.showOnLoanIssue ?? true;
                      const defaultRate = cfg.defaultMonthlyRate ?? selectedLT.defaultMonthlyRate ?? 0;
                      const interestProfile = selectedLT.interestProfileId || 'fixed-rate';
                      const hasBands = interestProfile === 'gold-bands' || interestProfile === 'silver-bands';
                      const currentBands = cfg.amountBands ?? selectedLT.amountBands ?? [];

                      const updateCfg = (patch: Record<string, any>) => {
                        setLoanTypeConfigs(prev => ({
                          ...prev,
                          [selectedLT.id]: { ...prev[selectedLT.id], ...patch }
                        }));
                      };

                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                          {/* Header */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div>
                              <h3 style={{ fontSize: '14px', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>{selectedLT.name}</h3>
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                {hasBands ? 'Rate is % per month, set by loan size via amount bands.' : 'Flat rate % per month for this loan type.'}
                                {!selectedLT.active && <span style={{ color: '#DC2626', marginLeft: 8 }}>⚠ Inactive — not shown in Loan Issue.</span>}
                              </span>
                            </div>
                          </div>

                          {/* Show on Loan Issue toggle */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '12px', fontWeight: 700 }}>SHOW ON LOAN ISSUE</span>
                            <div style={{ display: 'flex', backgroundColor: 'var(--bg-surface-secondary)', padding: '2px', borderRadius: 'var(--radius-full)' }}>
                              <button type="button" className={`btn btn-sm ${showOnIssue ? 'btn-primary' : 'btn-secondary'}`}
                                onClick={() => updateCfg({ showOnLoanIssue: true })} style={{ padding: '2px 10px', fontSize: '11px' }}>On</button>
                              <button type="button" className={`btn btn-sm ${!showOnIssue ? 'btn-primary' : 'btn-secondary'}`}
                                onClick={() => updateCfg({ showOnLoanIssue: false })} style={{ padding: '2px 10px', fontSize: '11px' }}>Off</button>
                            </div>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
                            {/* Interest panel — bands or flat rate */}
                            <div style={{ border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', padding: '16px' }}>
                              {hasBands ? (
                                <>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                    <div>
                                      <h4 style={{ fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', margin: 0 }}>MONTHLY INTEREST AMOUNT BANDS</h4>
                                      <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>Rate is % per month, pre-filled by loan size.</span>
                                    </div>
                                    <button type="button" className="btn btn-sm btn-secondary"
                                      style={{ gap: '4px', fontSize: '11px', padding: '4px 10px', borderRadius: 'var(--radius-md)' }}
                                      onClick={() => handleAddAmountBandForType(selectedLT.id)}>
                                      <Plus size={13} /><span>Add Band</span>
                                    </button>
                                  </div>
                                  {currentBands.length === 0 ? (
                                    <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', fontStyle: 'italic', padding: '12px 0', textAlign: 'center' }}>
                                      No interest rate bands configured. Click "Add Band" to add one.
                                    </div>
                                  ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                      {currentBands.map((band, idx) => (
                                        <div key={band.id || idx} style={{ borderBottom: '1px solid var(--border-light)', paddingBottom: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                          <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 2fr 1fr', gap: '8px', alignItems: 'center' }}>
                                            <div>
                                              <label style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>AMOUNT IS</label>
                                              <select className="input-control" value={band.condition}
                                                onChange={e => handleUpdateAmountBandForType(selectedLT.id, band.id, 'condition', e.target.value)}
                                                style={{ width: '100%', height: '36px', padding: '4px 8px', fontSize: '11px' }}>
                                                <option value="Below">Below</option>
                                                <option value="Above">Above</option>
                                              </select>
                                            </div>
                                            <div>
                                              <label style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>₹ AMOUNT</label>
                                              <input type="number" className="input-control" value={band.amount}
                                                onChange={e => handleUpdateAmountBandForType(selectedLT.id, band.id, 'amount', e.target.value === '' ? '' : Number(e.target.value))}
                                                style={{ fontSize: '11.5px', height: '36px' }} />
                                            </div>
                                            <div>
                                              <label style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>BASE %/MONTH</label>
                                              <input type="number" step="0.1" className="input-control" value={band.baseRateMonthly}
                                                onChange={e => handleUpdateAmountBandForType(selectedLT.id, band.id, 'baseRateMonthly', e.target.value === '' ? '' : Number(e.target.value))}
                                                style={{ fontSize: '11.5px', height: '36px' }} />
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                              <label style={{ display: 'block', height: '14px' }}></label>
                                              <button type="button" style={{ background: 'none', border: 'none', color: '#DC2626', cursor: 'pointer', padding: '4px' }}
                                                onClick={() => handleRemoveAmountBandForType(selectedLT.id, band.id)} title="Delete Band">
                                                <Trash2 size={15} />
                                              </button>
                                            </div>
                                          </div>
                                          <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 4fr', gap: '8px' }}>
                                            <div>
                                              <label style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>PENALTY AFTER (MONTHS)</label>
                                              <input type="number" className="input-control" value={band.penaltyAfterMonths}
                                                onChange={e => handleUpdateAmountBandForType(selectedLT.id, band.id, 'penaltyAfterMonths', e.target.value === '' ? '' : Number(e.target.value))}
                                                style={{ fontSize: '11.5px', height: '36px' }} />
                                            </div>
                                            <div>
                                              <label style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>PENALTY STEP-UP %/MONTH</label>
                                              <input type="number" step="0.05" className="input-control" value={band.penaltyStepUpMonthly}
                                                onChange={e => handleUpdateAmountBandForType(selectedLT.id, band.id, 'penaltyStepUpMonthly', e.target.value === '' ? '' : Number(e.target.value))}
                                                style={{ fontSize: '11.5px', height: '36px' }} />
                                            </div>
                                            <div>
                                              <label style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>PENALTY IS COUNTED</label>
                                              <select className="input-control" value={band.penaltyCalculation}
                                                onChange={e => handleUpdateAmountBandForType(selectedLT.id, band.id, 'penaltyCalculation', e.target.value)}
                                                style={{ width: '100%', height: '36px', padding: '4px 8px', fontSize: '11px' }}>
                                                <option value="From the start — stepped rate over the whole overc">From the start — stepped rate over the whole overc</option>
                                                <option value="After threshold">After threshold</option>
                                              </select>
                                            </div>
                                          </div>
                                        </div>
                                      ))}
                                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                                        The first band that matches is used — make sure the last band catches everything else (usually Above 0).
                                      </div>
                                    </div>
                                  )}
                                </>
                              ) : (
                                <>
                                  <h4 style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 12px 0' }}>
                                    MONTHLY INTEREST
                                  </h4>
                                  <div className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label required" style={{ fontSize: '11px' }}>DEFAULT RATE %/MONTH</label>
                                    <input type="number" step="0.1" className="input-control"
                                      value={defaultRate}
                                      onChange={e => updateCfg({ defaultMonthlyRate: e.target.value === '' ? '' : Number(e.target.value) })} />
                                  </div>
                                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginTop: '12px' }}>
                                    Applied to every new loan of this type. Existing loans preserve the rate at issue.
                                  </span>
                                </>
                              )}
                            </div>

                            {/* Due System */}
                            <div style={{ border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                              <h4 style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', margin: 0 }}>DUE SYSTEM</h4>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <div className="form-group" style={{ margin: 0 }}>
                                  <label className="form-label" style={{ fontSize: '11px' }}>PENALTY %/DAY ON OVERDUE EMI</label>
                                  <input type="number" step="0.1" className="input-control" value={overduePenalty}
                                    onChange={e => setOverduePenalty(e.target.value === '' ? '' : Number(e.target.value))} />
                                </div>
                                <div className="form-group" style={{ margin: 0 }}>
                                  <label className="form-label" style={{ fontSize: '11px' }}>GRACE DAYS FROM DUE DATE</label>
                                  <input type="number" className="input-control" value={graceDaysVal}
                                    onChange={e => setGraceDaysVal(e.target.value === '' ? '' : Number(e.target.value))} />
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}





                    {ratesSubChip === 'card' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{ fontSize: '20px' }}>💳</span>
                          <div>
                            <h3 style={{ fontSize: '14px', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>Card Fee</h3>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                              Charged at issue when the card fee box is ticked. Each loan type carries its own fee — switch one off and the box does not appear on Loan Issue for that type at all.
                            </span>
                          </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', padding: '16px' }}>
                          {(masterControlSettings?.loanTypes && masterControlSettings.loanTypes.length > 0 ? masterControlSettings.loanTypes : defaultLoanTypes).map((lt, idx, arr) => {
                            const feeConfig = loanTypesCardFees[lt.id] || { enabled: lt.cardFeeEnabled ?? true, amount: lt.cardFee ?? 25 };
                            const isLast = idx === arr.length - 1;
                            return (
                              <div
                                key={lt.id}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  borderBottom: isLast ? 'none' : '1px solid var(--border-light)',
                                  paddingBottom: isLast ? '0px' : '10px'
                                }}
                              >
                                <div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontSize: '12px', fontWeight: 700 }}>{lt.name}</span>
                                    {!lt.active && (
                                      <span style={{ fontSize: '10px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
                                        Disabled
                                      </span>
                                    )}
                                    {lt.showOnLoanIssue === false && (
                                      <span style={{ fontSize: '10px', background: 'rgba(100, 116, 139, 0.1)', color: 'var(--text-muted)', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
                                        Hidden on Issue
                                      </span>
                                    )}
                                  </div>
                                  {lt.description && (
                                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>{lt.description}</div>
                                  )}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                  <div style={{ display: 'flex', backgroundColor: 'var(--bg-surface-secondary)', padding: '2px', borderRadius: 'var(--radius-full)' }}>
                                    <button
                                      type="button"
                                      className={`btn btn-sm ${feeConfig.enabled ? 'btn-primary' : 'btn-secondary'}`}
                                      onClick={() => setLoanTypesCardFees((prev) => ({ ...prev, [lt.id]: { ...feeConfig, enabled: true } }))}
                                      style={{ padding: '2px 10px', fontSize: '11px' }}
                                    >
                                      On
                                    </button>
                                    <button
                                      type="button"
                                      className={`btn btn-sm ${!feeConfig.enabled ? 'btn-primary' : 'btn-secondary'}`}
                                      onClick={() => setLoanTypesCardFees((prev) => ({ ...prev, [lt.id]: { ...feeConfig, enabled: false } }))}
                                      style={{ padding: '2px 10px', fontSize: '11px' }}
                                    >
                                      Off
                                    </button>
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>₹</span>
                                    <input
                                      type="number"
                                      className="input-control"
                                      value={feeConfig.amount}
                                      onChange={(e) => setLoanTypesCardFees((prev) => ({ ...prev, [lt.id]: { ...feeConfig, amount: e.target.value === '' ? ('' as any) : Math.max(0, Number(e.target.value)) } }))}
                                      style={{ width: '80px', height: '30px', fontSize: '12px', padding: '4px 8px' }}
                                    />
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {ratesSubChip === 'overdue' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{ fontSize: '20px' }}>🕐</span>
                          <div>
                            <h3 style={{ fontSize: '14px', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>Overdue Interest &amp; Escalation</h3>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                              Configure overdue interest calculation methods and progressive interest rate escalation tiers based on overdue duration.
                            </span>
                          </div>
                        </div>

                        {/* 1. OVERDUE CALCULATION METHOD */}
                        <div style={{ border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          <h4 style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', margin: 0 }}>
                            WHEN A LOAN IS OVERDUE, FILL IN
                          </h4>
                          <div className="form-group" style={{ margin: 0 }}>
                            <select
                              className="input-control"
                              value={overdueCalMethod}
                              onChange={(e) => setOverdueCalMethod(e.target.value)}
                              style={{ width: '100%', height: '38px', padding: '4px 8px', fontSize: '12.5px' }}
                            >
                              <option value="Whole months — a part month counts as full (recommended)">
                                Whole months — a part month counts as full (recommended)
                              </option>
                              <option value="Exact days — calculation based on actual days late">
                                Exact days — calculation based on actual days late
                              </option>
                            </select>
                          </div>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            Only the starting figure. You can still change the days on any receipt, and anything left over carries to the next one.
                          </span>
                        </div>

                        {/* 2. OVERDUE INTEREST PROGRESSIVE ESCALATION */}
                        <div style={{ border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                            <div>
                              <h4 style={{ fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--color-primary-dark)', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span>📈</span>
                                <span>OVERDUE INTEREST ESCALATION</span>
                              </h4>
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                Automatically escalates the monthly interest rate progressively as loan delinquency duration increases.
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <span style={{ fontSize: '12px', fontWeight: 700 }}>ENABLE ESCALATION:</span>
                              <div style={{ display: 'flex', backgroundColor: 'var(--bg-surface-secondary)', padding: '2px', borderRadius: 'var(--radius-full)' }}>
                                <button
                                  type="button"
                                  className={`btn btn-sm ${overdueEscalationOn ? 'btn-primary' : 'btn-secondary'}`}
                                  onClick={() => setOverdueEscalationOn(true)}
                                  style={{ padding: '3px 12px', fontSize: '11px', fontWeight: 700 }}
                                >
                                  On
                                </button>
                                <button
                                  type="button"
                                  className={`btn btn-sm ${!overdueEscalationOn ? 'btn-primary' : 'btn-secondary'}`}
                                  onClick={() => setOverdueEscalationOn(false)}
                                  style={{ padding: '3px 12px', fontSize: '11px', fontWeight: 700 }}
                                >
                                  Off
                                </button>
                              </div>
                            </div>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', backgroundColor: 'var(--bg-surface-secondary)', padding: '12px 14px', borderRadius: 'var(--radius-sm)' }}>
                            <div>
                              <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                                BASE MONTHLY RATE (% / MO)
                              </label>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <input
                                  type="number"
                                  step="0.05"
                                  className="input-control"
                                  value={overdueBaseRateVal}
                                  onChange={(e) => {
                                    const v = e.target.value === '' ? '' : Number(e.target.value);
                                    setOverdueBaseRateVal(v);
                                    // Also update 0-day tier if present
                                    if (v !== '') {
                                      setOverdueTiersList(prev => prev.map(t => t.overdueDays === 0 ? { ...t, rate: Number(v) } : t));
                                    }
                                  }}
                                  style={{ width: '100px', height: '34px', fontWeight: 700 }}
                                />
                                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)' }}>%/mo</span>
                              </div>
                              <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                                Default base rate applied when overdue days &lt; first escalation threshold or when escalation is OFF.
                              </span>
                            </div>
                            <div>
                              <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                                ESCALATION STATUS
                              </label>
                              <div style={{ display: 'flex', alignItems: 'center', height: '34px' }}>
                                <span className={`badge ${overdueEscalationOn ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: '11px', padding: '4px 10px' }}>
                                  {overdueEscalationOn ? '✓ Active (Tiers Controlling Rates)' : '○ Inactive (Fixed Base Rates Applied)'}
                                </span>
                              </div>
                              <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                                {overdueTiersList.length} escalation tier{overdueTiersList.length === 1 ? '' : 's'} configured.
                              </span>
                            </div>
                          </div>

                          {/* Escalation Rules Table */}
                          <div style={{ border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', backgroundColor: 'var(--bg-surface-secondary)', borderBottom: '1px solid var(--border-light)' }}>
                              <strong style={{ fontSize: '12px', color: 'var(--text-primary)' }}>ESCALATION RULES TABLE</strong>
                              <button
                                type="button"
                                className="btn btn-sm btn-primary"
                                style={{ fontSize: '11px', padding: '4px 10px', gap: '4px' }}
                                onClick={() => {
                                  setEditingTierIndex(null);
                                  setTierDaysInput('');
                                  setTierRateInput('');
                                  setShowTierModal(true);
                                }}
                              >
                                <Plus size={13} />
                                <span>Add Tier</span>
                              </button>
                            </div>

                            <table className="custom-table" style={{ margin: 0 }}>
                              <thead>
                                <tr>
                                  <th style={{ width: '60px' }}>TIER</th>
                                  <th>OVERDUE DAYS (≥)</th>
                                  <th>MONTHLY RATE (%)</th>
                                  <th>ANNUAL RATE (APR)</th>
                                  <th style={{ textAlign: 'right', width: '120px' }}>ACTIONS</th>
                                </tr>
                              </thead>
                              <tbody>
                                {overdueTiersList.length === 0 ? (
                                  <tr>
                                    <td colSpan={5} style={{ textAlign: 'center', padding: '16px', color: 'var(--text-muted)' }}>
                                      No escalation tiers configured. Click &quot;+ Add Tier&quot; to configure.
                                    </td>
                                  </tr>
                                ) : (
                                  overdueTiersList.map((tier, idx) => (
                                    <tr key={`tier-${tier.overdueDays}-${idx}`}>
                                      <td>
                                        <span className="badge badge-info" style={{ fontSize: '10px', fontWeight: 700 }}>
                                          {idx === 0 ? 'Base' : `Tier ${idx}`}
                                        </span>
                                      </td>
                                      <td>
                                        <strong style={{ color: 'var(--color-primary-dark)' }}>{tier.overdueDays} days</strong>
                                        {idx === 0 && <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '6px' }}>(Starting Base)</span>}
                                      </td>
                                      <td>
                                        <strong style={{ color: idx > 0 ? '#b91c1c' : 'var(--text-primary)' }}>
                                          {Number(tier.rate).toFixed(2)}% / month
                                        </strong>
                                      </td>
                                      <td style={{ color: 'var(--text-muted)' }}>
                                        {(Number(tier.rate) * 12).toFixed(2)}% p.a.
                                      </td>
                                      <td style={{ textAlign: 'right' }}>
                                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                                          <button
                                            type="button"
                                            className="btn btn-sm btn-secondary"
                                            style={{ padding: '2px 8px', fontSize: '11px' }}
                                            onClick={() => {
                                              setEditingTierIndex(idx);
                                              setTierDaysInput(String(tier.overdueDays));
                                              setTierRateInput(String(tier.rate));
                                              setShowTierModal(true);
                                            }}
                                            title="Edit Tier"
                                          >
                                            Edit
                                          </button>
                                          {idx > 0 && (
                                            <button
                                              type="button"
                                              className="btn btn-sm btn-secondary"
                                              style={{ padding: '2px 8px', fontSize: '11px', color: '#dc2626' }}
                                              onClick={() => {
                                                setOverdueTiersList(prev => prev.filter((_, i) => i !== idx));
                                                showToast(`Removed tier at ${tier.overdueDays} days.`, 'info');
                                              }}
                                              title="Delete Tier"
                                            >
                                              <Trash2 size={12} />
                                            </button>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  ))
                                )}
                              </tbody>
                            </table>
                          </div>

                          {/* 3. INTERACTIVE OVERDUE SIMULATOR */}
                          <div style={{ border: '1px dashed var(--border-light)', borderRadius: 'var(--radius-md)', padding: '14px', backgroundColor: 'rgba(23, 107, 82, 0.03)' }}>
                            <div style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--color-primary-dark)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span>🔍</span>
                              <span>LIVE RATE SIMULATOR &amp; PREVIEW</span>
                            </div>
                            <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>TEST DAYS OVERDUE:</label>
                                <input
                                  type="number"
                                  className="input-control"
                                  value={testSimulatorDays}
                                  onChange={(e) => setTestSimulatorDays(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                                  style={{ width: '90px', height: '32px', fontWeight: 700 }}
                                />
                              </div>
                              {(() => {
                                const days = testSimulatorDays === '' ? 0 : Number(testSimulatorDays);
                                const simSettings = {
                                  overdueEscalationEnabled: overdueEscalationOn,
                                  overdueBaseRateMonthly: overdueBaseRateVal === '' ? 2.0 : Number(overdueBaseRateVal),
                                  overdueEscalationTiers: overdueTiersList
                                };
                                const details = getOverdueEscalationDetails(days, Number(overdueBaseRateVal) || 2.0, simSettings as any);
                                return (
                                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', fontSize: '12px' }}>
                                    <span>
                                      Applicable Rate: <strong style={{ color: details.isEscalated ? '#dc2626' : 'var(--color-primary-dark)', fontSize: '13.5px' }}>{details.currentRate.toFixed(2)}% / mo</strong> ({(details.currentRate * 12).toFixed(2)}% p.a.)
                                    </span>
                                    <span>•</span>
                                    <span>
                                      Tier: <strong style={{ color: 'var(--text-primary)' }}>{details.currentTierLabel}</strong>
                                    </span>
                                    {details.nextTier && (
                                      <>
                                        <span>•</span>
                                        <span style={{ color: 'var(--text-muted)' }}>
                                          Next: <strong>{details.nextTier.rate.toFixed(2)}%</strong> at {details.nextTier.overdueDays}d (in {details.daysUntilNextTier} days)
                                        </span>
                                      </>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                        </div>

                        {/* TIER ADD/EDIT MODAL */}
                        {showTierModal && (
                          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 110, padding: '16px' }}>
                            <div className="card" style={{ maxWidth: '420px', width: '100%', padding: '20px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid var(--border-light)', paddingBottom: '8px' }}>
                                <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)' }}>
                                  {editingTierIndex !== null ? 'EDIT ESCALATION TIER' : 'ADD NEW ESCALATION TIER'}
                                </h4>
                                <button
                                  type="button"
                                  onClick={() => setShowTierModal(false)}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                                >
                                  <X size={16} />
                                </button>
                              </div>

                              <form onSubmit={(e) => {
                                e.preventDefault();
                                const days = Math.max(0, Math.floor(Number(tierDaysInput)));
                                const rate = Math.max(0, Number(tierRateInput));
                                if (isNaN(days) || isNaN(rate) || rate <= 0) {
                                  showToast('Please enter valid overdue days and rate.', 'warning');
                                  return;
                                }

                                if (editingTierIndex !== null) {
                                  // Update existing tier
                                  const updated = [...overdueTiersList];
                                  updated[editingTierIndex] = { overdueDays: days, rate };
                                  // Sort and deduplicate
                                  const sorted = updated.sort((a, b) => a.overdueDays - b.overdueDays);
                                  setOverdueTiersList(sorted);
                                  showToast('Escalation tier updated successfully.', 'success');
                                } else {
                                  // Add new tier
                                  if (overdueTiersList.some(t => t.overdueDays === days)) {
                                    showToast(`A tier for ${days} overdue days already exists. Please edit that tier instead.`, 'error');
                                    return;
                                  }
                                  const updated = [...overdueTiersList, { overdueDays: days, rate }]
                                    .sort((a, b) => a.overdueDays - b.overdueDays);
                                  setOverdueTiersList(updated);
                                  showToast('New escalation tier added.', 'success');
                                }
                                setShowTierModal(false);
                              }} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                <div className="form-group" style={{ margin: 0 }}>
                                  <label className="form-label required" style={{ fontSize: '11.5px' }}>
                                    OVERDUE THRESHOLD (DAYS ≥)
                                  </label>
                                  <input
                                    type="number"
                                    min="0"
                                    step="1"
                                    className="input-control"
                                    value={tierDaysInput}
                                    onChange={(e) => setTierDaysInput(e.target.value)}
                                    placeholder="e.g. 90"
                                    disabled={editingTierIndex === 0}
                                    required
                                    autoFocus
                                  />
                                  {editingTierIndex === 0 && (
                                    <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                      Base tier threshold is fixed at 0 days.
                                    </span>
                                  )}
                                </div>

                                <div className="form-group" style={{ margin: 0 }}>
                                  <label className="form-label required" style={{ fontSize: '11.5px' }}>
                                    MONTHLY INTEREST RATE (%)
                                  </label>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <input
                                      type="number"
                                      min="0.1"
                                      step="0.05"
                                      className="input-control"
                                      value={tierRateInput}
                                      onChange={(e) => setTierRateInput(e.target.value)}
                                      placeholder="e.g. 2.10"
                                      required
                                    />
                                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)' }}>%/mo</span>
                                  </div>
                                  <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                    Equivalent Annual APR: {tierRateInput ? (Number(tierRateInput) * 12).toFixed(2) : '0.00'}% p.a.
                                  </span>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                                  <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => setShowTierModal(false)}
                                    style={{ fontSize: '12px' }}
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="submit"
                                    className="btn btn-primary"
                                    style={{ fontSize: '12px' }}
                                  >
                                    {editingTierIndex !== null ? 'Save Tier' : 'Add Tier'}
                                  </button>
                                </div>
                              </form>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {ratesSubChip === 'upi' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', padding: '16px' }}>
                        <h4 style={{ fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 4px 0' }}>UPI SETTINGS</h4>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label required">UPI ID VIRTUAL ADDRESS</label>
                          <input
                            type="text"
                            placeholder="e.g. kkvgold@okaxis"
                            className="input-control"
                            value={upiIdVal}
                            onChange={(e) => setUpiIdVal(e.target.value)}
                          />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label required">UPI ACCOUNT PAYEE NAME</label>
                          <input
                            type="text"
                            placeholder="e.g. KKV Gold Finance"
                            className="input-control"
                            value={upiPayeeVal}
                            onChange={(e) => setUpiPayeeVal(e.target.value)}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {masterSubTab === 'loan-config' && (
                  <LoanConfigurationSection />
                )}

                {masterSubTab === 'fd-config' && (
                  <FDConfigurationSection />
                )}

                {masterSubTab === 'purity' && (
                  <PurityManagementSection />
                )}

                {masterSubTab === 'messaging' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ padding: '8px 12px', backgroundColor: 'var(--bg-surface-secondary)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', fontSize: '11px', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <strong>Allowed placeholders:</strong>
                      <span style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                        {"{name}, {loanId}, {loanType}, {principal}, {interest}, {dueDate}, {amount}, {emi}, {bankName}, {phone}, {upiId}, {upiPayee}, {advance}, {advanceLine}, {billNo}, {date}"}
                      </span>
                    </div>

                    <div className="form-group" style={{ border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', padding: '14px', margin: 0 }}>
                      <label className="form-label" style={{ fontSize: '12px', fontWeight: 800 }}>WELCOME MESSAGE (SENT AFTER ISSUING A NEW LOAN)</label>
                      <textarea
                        className="input-control"
                        rows={3}
                        value={welcomeTpl}
                        onChange={(e) => setWelcomeTpl(e.target.value)}
                        style={{ fontFamily: 'monospace', fontSize: '12px' }}
                      />
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px', alignItems: 'center' }}>
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700 }}>Predefined:</span>
                        <button type="button" className="btn btn-xs" style={{ padding: '2px 8px', fontSize: '10px', backgroundColor: 'var(--bg-surface-secondary)' }} onClick={() => setWelcomeTpl("Dear {name}, Thank you for choosing KKV GOLD FINANCE. Your pledge account {loanId} for ₹{principal} has been disbursed. Next due date is {dueDate}. Thank you.")}>Professional</button>
                        <button type="button" className="btn btn-xs" style={{ padding: '2px 8px', fontSize: '10px', backgroundColor: 'var(--bg-surface-secondary)' }} onClick={() => setWelcomeTpl("KKV GOLD FINANCE: Loan {loanId} for ₹{principal} disbursed to {name}. Next due: {dueDate}.")}>Short</button>
                        <button type="button" className="btn btn-xs" style={{ padding: '2px 8px', fontSize: '10px', backgroundColor: 'var(--bg-surface-secondary)' }} onClick={() => setWelcomeTpl("Hi {name}! Your loan {loanId} of ₹{principal} is active. Next due: {dueDate}. Thanks!")}>Friendly</button>
                        <button type="button" className="btn btn-xs" style={{ padding: '2px 8px', fontSize: '10px', backgroundColor: 'var(--bg-surface-secondary)' }} onClick={() => setWelcomeTpl("Dear {name}, thank you for choosing us. Gold Loan {loanId} of principal ₹{principal} is disbursed under KKV Gold. Overdue penalty: 3.6% per day after 3 grace days.")}>Detailed</button>
                        <button type="button" className="btn btn-xs" style={{ padding: '2px 8px', fontSize: '10px', backgroundColor: 'var(--bg-surface-secondary)' }} onClick={() => setWelcomeTpl("அன்புள்ள {name}, கே.கே.வி கோல்டு பைனான்ஸை தேர்வு செய்ததற்கு நன்றி. உங்கள் கடன் {loanId} தொகை ₹{principal} வழங்கப்பட்டது.")}>Tamil</button>
                      </div>
                    </div>

                    <div className="form-group" style={{ border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', padding: '14px', margin: 0 }}>
                      <label className="form-label" style={{ fontSize: '12px', fontWeight: 800 }}>{"DUE REMINDER (PENDING LOANS -> WHATSAPP)"}</label>
                      <textarea
                        className="input-control"
                        rows={3}
                        value={dueTpl}
                        onChange={(e) => setDueTpl(e.target.value)}
                        style={{ fontFamily: 'monospace', fontSize: '12px' }}
                      />
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px', alignItems: 'center' }}>
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700 }}>Predefined:</span>
                        <button type="button" className="btn btn-xs" style={{ padding: '2px 8px', fontSize: '10px', backgroundColor: 'var(--bg-surface-secondary)' }} onClick={() => setDueTpl("Dear {name}, your interest payment for Gold Loan {loanId} (Principal ₹{principal}) is pending. Due date: {dueDate}. Total amount due: ₹{amount}. UPI ID: {upiId}")}>Professional</button>
                        <button type="button" className="btn btn-xs" style={{ padding: '2px 8px', fontSize: '10px', backgroundColor: 'var(--bg-surface-secondary)' }} onClick={() => setDueTpl("Pending interest for Loan {loanId}: ₹{amount}. UPI: {upiId}.")}>Short</button>
                        <button type="button" className="btn btn-xs" style={{ padding: '2px 8px', fontSize: '10px', backgroundColor: 'var(--bg-surface-secondary)' }} onClick={() => setDueTpl("Hi {name}, interest for your Loan {loanId} was due on {dueDate}. Amount: ₹{amount}. UPI: {upiId}")}>Friendly</button>
                        <button type="button" className="btn btn-xs" style={{ padding: '2px 8px', fontSize: '10px', backgroundColor: 'var(--bg-surface-secondary)' }} onClick={() => setDueTpl("WARNING: Interest for loan {loanId} is overdue. Please settle ₹{amount} immediately on UPI {upiId} to avoid penalty charges.")}>Firm</button>
                        <button type="button" className="btn btn-xs" style={{ padding: '2px 8px', fontSize: '10px', backgroundColor: 'var(--bg-surface-secondary)' }} onClick={() => setDueTpl("Please pay your pending interest of ₹{amount} for Loan {loanId} via UPI {upiId} (Payee: {upiPayee}).")}>With UPI</button>
                        <button type="button" className="btn btn-xs" style={{ padding: '2px 8px', fontSize: '10px', backgroundColor: 'var(--bg-surface-secondary)' }} onClick={() => setDueTpl("Loan {loanId} interest due: ₹{amount}.")}>Very short</button>
                      </div>
                    </div>

                    <div className="form-group" style={{ border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', padding: '14px', margin: 0 }}>
                      <label className="form-label" style={{ fontSize: '12px', fontWeight: 800 }}>RECEIPT MESSAGE (SENT UPON INTEREST PAYMENT/COLLECTIONS)</label>
                      <textarea
                        className="input-control"
                        rows={3}
                        value={receiptTpl}
                        onChange={(e) => setReceiptTpl(e.target.value)}
                        style={{ fontFamily: 'monospace', fontSize: '12px' }}
                      />
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px', alignItems: 'center' }}>
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700 }}>Predefined:</span>
                        <button type="button" className="btn btn-xs" style={{ padding: '2px 8px', fontSize: '10px', backgroundColor: 'var(--bg-surface-secondary)' }} onClick={() => setReceiptTpl("Dear {name}, payment receipt #{billNo} of ₹{amount} for loan {loanId} has been successfully recorded on {date}. Thank you, KKV GOLD FINANCE.")}>Professional</button>
                        <button type="button" className="btn btn-xs" style={{ padding: '2px 8px', fontSize: '10px', backgroundColor: 'var(--bg-surface-secondary)' }} onClick={() => setReceiptTpl("Receipt #{billNo} of ₹{amount} received for loan {loanId} on {date}. Thank you.")}>Short</button>
                        <button type="button" className="btn btn-xs" style={{ padding: '2px 8px', fontSize: '10px', backgroundColor: 'var(--bg-surface-secondary)' }} onClick={() => setReceiptTpl("Hi {name}! Staged payment receipt #{billNo} of ₹{amount} for loan {loanId} has been successfully completed on {date}. Thanks!")}>Friendly</button>
                      </div>
                    </div>
                  </div>
                )}

                {masterSubTab === 'operations' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                      {[
                        { key: 'areas-showrooms', label: '🏙️ Areas & Showrooms' },
                        { key: 'toggles', label: '⚙️ System Toggles' }
                      ].map((sub) => (
                        <button
                          key={sub.key}
                          type="button"
                          className={`btn btn-sm ${operationsSubTab === sub.key ? 'btn-primary' : 'btn-secondary'}`}
                          style={{ borderRadius: 'var(--radius-full)', fontSize: '12px' }}
                          onClick={() => setOperationsSubTab(sub.key as any)}
                        >
                          {sub.label}
                        </button>
                      ))}
                    </div>

                    {operationsSubTab === 'areas-showrooms' && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
                        {/* Areas */}
                        <div style={{ border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)' }}>AREAS CONFIG</span>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <input
                              type="text"
                              className="input-control"
                              placeholder="e.g. Komarapalayam"
                              value={newAreaInput}
                              onChange={(e) => setNewAreaInput(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && handleAddArea()}
                              style={{ flex: 1 }}
                            />
                            <button type="button" className="btn btn-sm btn-primary" onClick={handleAddArea} style={{ padding: '0 12px' }}>+ Add</button>
                          </div>
                          <div style={{ maxHeight: '110px', overflowY: 'auto', border: '1px solid var(--border-light)', padding: '8px', borderRadius: 'var(--radius-sm)', display: 'flex', flexWrap: 'wrap', gap: '6px', backgroundColor: 'var(--bg-surface-secondary)' }}>
                            {areasVal.length === 0 ? <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>No areas added</span> :
                              areasVal.map((item, idx) => (
                                <span key={idx} className="badge badge-success" style={{ gap: '4px', fontSize: '10px', padding: '3px 8px', border: '1px solid rgba(201,162,39,0.2)' }}>
                                  {item}
                                  <button type="button" onClick={() => handleRemoveArea(idx)} style={{ background: 'none', border: 'none', color: 'currentColor', cursor: 'pointer', padding: 0 }}>×</button>
                                </span>
                              ))}
                          </div>
                        </div>

                        {/* Partners */}
                        <div style={{ border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)' }}>PARTNERS (CAPITAL ACCOUNTS)</span>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <input
                              type="text"
                              className="input-control"
                              placeholder="Partner name"
                              value={newPartnerInput}
                              onChange={(e) => setNewPartnerInput(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && handleAddPartner()}
                              style={{ flex: 1 }}
                            />
                            <button type="button" className="btn btn-sm btn-primary" onClick={handleAddPartner} style={{ padding: '0 12px' }}>Add</button>
                          </div>
                          <div style={{ maxHeight: '110px', overflowY: 'auto', border: '1px solid var(--border-light)', padding: '8px', borderRadius: 'var(--radius-sm)', display: 'flex', flexWrap: 'wrap', gap: '6px', backgroundColor: 'var(--bg-surface-secondary)' }}>
                            {partnersVal.length === 0 ? <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>No partners added</span> :
                              partnersVal.map((item, idx) => (
                                <span key={idx} className="badge badge-success" style={{ gap: '4px', fontSize: '10px', padding: '3px 8px' }}>
                                  {item}
                                  <button type="button" onClick={() => handleRemovePartner(idx)} style={{ background: 'none', border: 'none', color: 'currentColor', cursor: 'pointer', padding: 0 }}>×</button>
                                </span>
                              ))}
                          </div>
                        </div>

                        {/* Vehicle Documents */}
                        <div style={{ border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)' }}>VEHICLE DOCUMENTS</span>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <input
                              type="text"
                              className="input-control"
                              placeholder="e.g. Hypothecation letter"
                              value={newDocInput}
                              onChange={(e) => setNewDocInput(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && handleAddDoc()}
                              style={{ flex: 1 }}
                            />
                            <button type="button" className="btn btn-sm btn-primary" onClick={handleAddDoc} style={{ padding: '0 12px' }}>Add</button>
                          </div>
                          <div style={{ maxHeight: '110px', overflowY: 'auto', border: '1px solid var(--border-light)', padding: '8px', borderRadius: 'var(--radius-sm)', display: 'flex', flexWrap: 'wrap', gap: '6px', backgroundColor: 'var(--bg-surface-secondary)' }}>
                            {vehicleDocsVal.length === 0 ? <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>No documents added</span> :
                              vehicleDocsVal.map((item, idx) => (
                                <span key={idx} className="badge badge-success" style={{ gap: '4px', fontSize: '10px', padding: '3px 8px' }}>
                                  {item}
                                  <button type="button" onClick={() => handleRemoveDoc(idx)} style={{ background: 'none', border: 'none', color: 'currentColor', cursor: 'pointer', padding: 0 }}>×</button>
                                </span>
                              ))}
                          </div>
                        </div>

                        {/* Vehicle Companies */}
                        <div style={{ border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)' }}>VEHICLE COMPANIES</span>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <input
                              type="text"
                              className="input-control"
                              placeholder="e.g. Honda"
                              value={newCompanyInput}
                              onChange={(e) => setNewCompanyInput(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && handleAddCompany()}
                              style={{ flex: 1 }}
                            />
                            <button type="button" className="btn btn-sm btn-primary" onClick={handleAddCompany} style={{ padding: '0 12px' }}>Add</button>
                          </div>
                          <div style={{ maxHeight: '110px', overflowY: 'auto', border: '1px solid var(--border-light)', padding: '8px', borderRadius: 'var(--radius-sm)', display: 'flex', flexWrap: 'wrap', gap: '6px', backgroundColor: 'var(--bg-surface-secondary)' }}>
                            {vehicleCompaniesVal.length === 0 ? <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>No companies added</span> :
                              vehicleCompaniesVal.map((item, idx) => (
                                <span key={idx} className="badge badge-success" style={{ gap: '4px', fontSize: '10px', padding: '3px 8px' }}>
                                  {item}
                                  <button type="button" onClick={() => handleRemoveCompany(idx)} style={{ background: 'none', border: 'none', color: 'currentColor', cursor: 'pointer', padding: 0 }}>×</button>
                                </span>
                              ))}
                          </div>
                        </div>

                        {/* Insurance Companies */}
                        <div style={{ border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)' }}>INSURANCE COMPANIES</span>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <input
                              type="text"
                              className="input-control"
                              placeholder="e.g. Tata AIG"
                              value={newInsCompanyInput}
                              onChange={(e) => setNewInsCompanyInput(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && handleAddInsCompany()}
                              style={{ flex: 1 }}
                            />
                            <button type="button" className="btn btn-sm btn-primary" onClick={handleAddInsCompany} style={{ padding: '0 12px' }}>Add</button>
                          </div>
                          <div style={{ maxHeight: '110px', overflowY: 'auto', border: '1px solid var(--border-light)', padding: '8px', borderRadius: 'var(--radius-sm)', display: 'flex', flexWrap: 'wrap', gap: '6px', backgroundColor: 'var(--bg-surface-secondary)' }}>
                            {insuranceCompaniesVal.length === 0 ? <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>No insurance companies added</span> :
                              insuranceCompaniesVal.map((item, idx) => (
                                <span key={idx} className="badge badge-success" style={{ gap: '4px', fontSize: '10px', padding: '3px 8px' }}>
                                  {item}
                                  <button type="button" onClick={() => handleRemoveInsCompany(idx)} style={{ background: 'none', border: 'none', color: 'currentColor', cursor: 'pointer', padding: 0 }}>×</button>
                                </span>
                              ))}
                          </div>
                        </div>

                        {/* Showrooms */}
                        <div style={{ border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)' }}>SHOWROOMS</span>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <input
                              type="text"
                              className="input-control"
                              placeholder="Showroom branch"
                              value={newShowroomInput}
                              onChange={(e) => setNewShowroomInput(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && handleAddShowroom()}
                              style={{ flex: 1 }}
                            />
                            <button type="button" className="btn btn-sm btn-primary" onClick={handleAddShowroom} style={{ padding: '0 12px' }}>+ Add</button>
                          </div>
                          <div style={{ maxHeight: '110px', overflowY: 'auto', border: '1px solid var(--border-light)', padding: '8px', borderRadius: 'var(--radius-sm)', display: 'flex', flexWrap: 'wrap', gap: '6px', backgroundColor: 'var(--bg-surface-secondary)' }}>
                            {showroomsVal.length === 0 ? <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>No showrooms added</span> :
                              showroomsVal.map((item, idx) => (
                                <span key={idx} className="badge badge-success" style={{ gap: '4px', fontSize: '10px', padding: '3px 8px' }}>
                                  {item}
                                  <button type="button" onClick={() => handleRemoveShowroom(idx)} style={{ background: 'none', border: 'none', color: 'currentColor', cursor: 'pointer', padding: 0 }}>×</button>
                                </span>
                              ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {operationsSubTab === 'toggles' && (
                      <div>
                        <h3 style={{ fontSize: '12px', fontWeight: 800, margin: '0 0 12px 0', color: 'var(--text-muted)', textTransform: 'uppercase' }}>System Feature Toggles</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                          <div className="card" style={{ padding: '14px', backgroundColor: 'var(--bg-surface-secondary)', border: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: 0 }}>
                            <div>
                              <strong style={{ fontSize: '13px', display: 'block', color: 'var(--text-primary)' }}>Interface Animations</strong>
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Enable sidebar transition animations</span>
                            </div>
                            <input
                              type="checkbox"
                              style={{ width: '18px', height: '18px', accentColor: 'var(--color-primary-dark)', cursor: 'pointer' }}
                              checked={animationsEnabled}
                              onChange={(e) => setAnimationsEnabled(e.target.checked)}
                            />
                          </div>

                          <div className="card" style={{ padding: '14px', backgroundColor: 'var(--bg-surface-secondary)', border: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: 0 }}>
                            <div>
                              <strong style={{ fontSize: '13px', display: 'block', color: 'var(--text-primary)' }}>Performance Mode</strong>
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Disable heavy effects for low-spec PCs</span>
                            </div>
                            <input
                              type="checkbox"
                              style={{ width: '18px', height: '18px', accentColor: 'var(--color-primary-dark)', cursor: 'pointer' }}
                              checked={performanceModeEnabled}
                              onChange={(e) => setPerformanceModeEnabled(e.target.checked)}
                            />
                          </div>

                          <div className="card" style={{ padding: '14px', backgroundColor: 'var(--bg-surface-secondary)', border: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: 0 }}>
                            <div>
                              <strong style={{ fontSize: '13px', display: 'block', color: 'var(--text-primary)' }}>Cabinet Lockers</strong>
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Track safe deposits cabinets A &amp; B</span>
                            </div>
                            <input
                              type="checkbox"
                              style={{ width: '18px', height: '18px', accentColor: 'var(--color-primary-dark)', cursor: 'pointer' }}
                              checked={lockersEnabled}
                              onChange={(e) => setLockersEnabled(e.target.checked)}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {masterSubTab === 'security' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                      {[
                        { key: 'account', label: '👤 Account' },
                        { key: 'change-pass', label: '🔐 Change Master Password' }
                      ].map((sub) => (
                        <button
                          key={sub.key}
                          type="button"
                          className={`btn btn-sm ${securitySubTab === sub.key ? 'btn-primary' : 'btn-secondary'}`}
                          style={{ borderRadius: 'var(--radius-full)', fontSize: '12px' }}
                          onClick={() => setSecuritySubTab(sub.key as any)}
                        >
                          {sub.label}
                        </button>
                      ))}
                    </div>

                    {securitySubTab === 'account' && (
                      <div style={{ border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)' }}>GOOGLE DRIVE ACCOUNT SYNC</span>
                        <div>
                          <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>SIGNED IN AS</label>
                          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>goldfinancekkv@gmail.com</div>
                        </div>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ width: 'fit-content', marginTop: '8px' }}
                          onClick={() => showToast('Google account cannot be signed out from this local offline build.', 'info')}
                        >
                          Sign Out
                        </button>
                      </div>
                    )}

                    {securitySubTab === 'change-pass' && (
                      <div style={{ border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)' }}>RESET MASTER ACCESS PASSWORD</span>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontSize: '11px' }}>CURRENT PASSWORD</label>
                          <input
                            type="password"
                            className="input-control"
                            value={currentMasterPass}
                            onChange={(e) => setCurrentMasterPass(e.target.value)}
                          />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontSize: '11px' }}>NEW PASSWORD</label>
                          <input
                            type="password"
                            className="input-control"
                            value={newMasterPass}
                            onChange={(e) => setNewMasterPass(e.target.value)}
                          />
                        </div>
                        <div style={{ padding: '10px 14px', border: '1px solid #DC2626', color: '#DC2626', backgroundColor: 'rgba(220,38,38,0.05)', borderRadius: 'var(--radius-sm)', fontSize: '11.5px' }}>
                          ⚠️ Stored password safety: Master password protects critical overrides and administrative data wipes.
                        </div>
                        <button
                          type="button"
                          className="btn btn-primary"
                          style={{ width: 'fit-content' }}
                          disabled={isChangingMasterPass}
                          onClick={async () => {
                            if (!currentMasterPass || !newMasterPass) {
                              showToast('Please enter both current and new passwords.', 'warning');
                              return;
                            }
                            setIsChangingMasterPass(true);
                            const res = await changeMasterPassword(currentMasterPass, newMasterPass);
                            setIsChangingMasterPass(false);
                            if (res.success) {
                              setCurrentMasterPass('');
                              setNewMasterPass('');
                            }
                          }}
                        >
                          {isChangingMasterPass ? 'Saving...' : 'Secure stored passwords'}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {masterSubTab === 'danger' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* DATABASE BACKUP & RECOVERY SECTION */}
                    <DatabaseBackupRecoverySection
                      onOpenRestore={() => setShowRestoreModal(true)}
                    />

                    {/* STRICTLY SEPARATED DANGER ZONE */}
                    <div
                      style={{
                        padding: '24px',
                        backgroundColor: 'rgba(220, 38, 38, 0.04)',
                        border: '2px solid rgba(220, 38, 38, 0.35)',
                        borderRadius: '16px',
                        boxShadow: '0 4px 16px rgba(220, 38, 38, 0.08)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                        <AlertTriangle size={22} color="#DC2626" />
                        <h4 style={{ fontSize: '17px', fontWeight: 800, color: '#991B1B', margin: 0, letterSpacing: '0.2px' }}>
                          DANGER ZONE (DESTRUCTIVE OPERATIONS)
                        </h4>
                      </div>
                      <p style={{ fontSize: '13px', color: '#64748B', marginBottom: '20px', lineHeight: 1.5 }}>
                        The actions below alter or reset local database state and operational datasets. Exercise extreme caution.
                      </p>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                        {/* WIPE ALL DATA CARD */}
                        <div
                          style={{
                            backgroundColor: '#FFFFFF',
                            border: '1px solid #FECACA',
                            borderRadius: '12px',
                            padding: '16px',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            gap: '12px'
                          }}
                        >
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                              <Trash2 size={16} color="#DC2626" />
                              <strong style={{ fontSize: '14px', color: '#991B1B' }}>Wipe Operational Data</strong>
                            </div>
                            <p style={{ fontSize: '12px', color: '#475569', margin: 0, lineHeight: 1.4 }}>
                              Permanently resets Customers, Loans, Payments, FDs, and Rental records. An automated safety backup ZIP is created and downloaded before deletion.
                            </p>
                          </div>
                          <button
                            type="button"
                            className="btn"
                            style={{
                              backgroundColor: '#DC2626',
                              color: '#FFFFFF',
                              fontWeight: 800,
                              fontSize: '13px',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '8px',
                              padding: '8px 16px',
                              borderRadius: '8px',
                              border: 'none',
                              width: 'fit-content'
                            }}
                            onClick={() => setShowWipeModal(true)}
                          >
                            <Trash2 size={15} />
                            <span>Wipe All Data</span>
                          </button>
                        </div>

                        {/* CLEAR SYNC CACHE CARD */}
                        <div
                          style={{
                            backgroundColor: '#FFFFFF',
                            border: '1px solid #E2E8F0',
                            borderRadius: '12px',
                            padding: '16px',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            gap: '12px'
                          }}
                        >
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                              <RefreshCw size={16} color="#475569" />
                              <strong style={{ fontSize: '14px', color: '#1E293B' }}>Purge &amp; Re-sync Cache</strong>
                            </div>
                            <p style={{ fontSize: '12px', color: '#475569', margin: 0, lineHeight: 1.4 }}>
                              Purges in-memory sync indices and re-synchronizes the authoritative dataset freshly from Cloud Firestore.
                            </p>
                          </div>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            disabled={isClearingSync}
                            style={{
                              fontWeight: 700,
                              fontSize: '13px',
                              cursor: isClearingSync ? 'not-allowed' : 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '8px',
                              padding: '8px 16px',
                              borderRadius: '8px',
                              width: 'fit-content'
                            }}
                            onClick={handleClearSyncCache}
                          >
                            <RefreshCw size={14} className={isClearingSync ? 'animate-spin' : ''} />
                            <span>{isClearingSync ? 'Re-syncing...' : 'Clear Sync Cache'}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
                  <button type="button" className="btn btn-primary" onClick={handleSaveMasterChanges}>
                    <Save size={15} />
                    <span>Save Changes</span>
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => setMasterControlOpen(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Fail-Safe Wipe All Data Modal */}
      <WipeAllDataModal
        isOpen={showWipeModal}
        onClose={() => setShowWipeModal(false)}
        onSuccessReset={() => {
          resetAllData();
          setMasterControlOpen(false);
        }}
        onOpenRestore={() => setShowRestoreModal(true)}
      />

      {/* Database Restore Modal */}
      <DatabaseRestoreModal
        isOpen={showRestoreModal}
        onClose={() => setShowRestoreModal(false)}
        onSuccessReload={() => {
          reloadAllData();
          setMasterControlOpen(false);
        }}
      />

      {/* View Customer Details Modal */}
      <ViewCustomerModal
        isOpen={!!viewingCustomer}
        customer={viewingCustomer}
        onClose={() => setViewingCustomer(null)}
        onEdit={(cust) => {
          setViewingCustomer(null);
          startEditCustomer(cust.id);
        }}
      />

      {/* Admin Delete Confirmation Modal */}
      {deletingCustomer && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 3000,
            padding: '20px'
          }}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: '440px',
              padding: '24px',
              borderRadius: '12px',
              boxShadow: 'var(--shadow-xl)'
            }}
          >
            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: '0 0 6px 0', fontSize: '18px', fontWeight: 800, color: '#b45309' }}>
                Move to Deleted Customers?
              </h3>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
                This customer will be soft-deleted and moved to the <strong>Deleted Customers</strong> tab. You can restore them anytime or permanently delete them from there.
              </p>
            </div>

            <div
              style={{
                backgroundColor: 'var(--bg-surface-secondary, #f8fafc)',
                border: '1px solid var(--border-light, #cbd5e1)',
                borderRadius: '8px',
                padding: '14px 16px',
                marginBottom: '16px',
                fontSize: '13px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px'
              }}
            >
              <div><strong>Customer Name:</strong> {deletingCustomer.name}</div>
              <div><strong>Customer ID:</strong> {deletingCustomer.id}</div>
              <div><strong>Mobile Number:</strong> +91 {deletingCustomer.phone}</div>
            </div>

            <div style={{ backgroundColor: '#fef3c7', border: '1px solid #fde68a', borderRadius: '8px', padding: '10px 14px', marginBottom: '20px', color: '#92400e', fontSize: '12px', fontWeight: 600, textAlign: 'center' }}>
              ℹ This customer can be restored later or permanently removed from Deleted Customers.
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
              <button className="btn btn-secondary" onClick={() => setDeletingCustomer(null)}>
                Cancel
              </button>
              <button
                className="btn btn-warning"
                style={{ backgroundColor: '#d97706', color: '#fff', fontWeight: 700 }}
                onClick={() => {
                  deleteCustomer(deletingCustomer.id);
                  setDeletingCustomer(null);
                }}
              >
                📁 Move to Deleted Customers
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PERMANENT DELETE DANGER CONFIRMATION MODAL */}
      {permanentDeleteTarget && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(5px)',
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
              maxWidth: '500px',
              padding: '24px',
              borderRadius: '16px',
              border: '2px solid #ef4444',
              backgroundColor: '#ffffff',
              boxShadow: '0 20px 40px rgba(239, 68, 68, 0.25)'
            }}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '12px',
                  backgroundColor: '#fee2e2',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                <AlertTriangle size={24} color="#dc2626" />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#991b1b' }}>
                  ⚠ Permanently Delete Customer?
                </h3>
                <span style={{ fontSize: '12px', color: '#b91c1c', fontWeight: 600 }}>
                  Admin Authorization Required · Cannot be undone
                </span>
              </div>
            </div>

            {/* Warning Message */}
            <p style={{ fontSize: '13.5px', color: '#4b5563', lineHeight: 1.5, margin: '0 0 16px 0' }}>
              You are about to permanently delete this customer and all associated records. This action cannot be undone.
            </p>

            {/* Customer Details Box */}
            <div
              style={{
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '10px',
                padding: '14px',
                marginBottom: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                fontSize: '13px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#7f1d1d', fontWeight: 600 }}>Customer Name:</span>
                <strong style={{ color: '#991b1b', fontSize: '14px' }}>{permanentDeleteTarget.name}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#7f1d1d', fontWeight: 600 }}>Customer ID:</span>
                <span
                  style={{
                    backgroundColor: '#dc2626',
                    color: '#ffffff',
                    fontWeight: 800,
                    fontSize: '12px',
                    padding: '2px 10px',
                    borderRadius: '6px',
                    letterSpacing: '0.5px'
                  }}
                >
                  {permanentDeleteTarget.id}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#7f1d1d', fontWeight: 600 }}>Mobile Number:</span>
                <strong style={{ color: '#991b1b' }}>+91 {permanentDeleteTarget.phone}</strong>
              </div>
            </div>

            {/* Type DELETE Instruction & Input */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#1f2937', marginBottom: '6px' }}>
                To permanently delete this customer and all associated records, type <strong style={{ color: '#dc2626' }}>DELETE</strong> below to confirm.
              </label>
              <input
                type="text"
                className="input-control"
                placeholder="Type DELETE to confirm"
                value={permanentDeleteInput}
                onChange={(e) => setPermanentDeleteInput(e.target.value)}
                style={{
                  borderColor: permanentDeleteInput === 'DELETE' ? '#dc2626' : '#cbd5e1',
                  backgroundColor: permanentDeleteInput === 'DELETE' ? '#fef2f2' : '#ffffff',
                  fontWeight: 800,
                  letterSpacing: '1.5px',
                  fontSize: '14px'
                }}
              />
              {permanentDeleteInput && permanentDeleteInput !== 'DELETE' && (
                <span style={{ fontSize: '11.5px', color: '#dc2626', fontWeight: 600, display: 'block', marginTop: '4px' }}>
                  ⚠ Type DELETE in capital letters to confirm.
                </span>
              )}
            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={isDeletingPermanently}
                onClick={() => {
                  setPermanentDeleteTarget(null);
                  setPermanentDeleteInput('');
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn"
                disabled={permanentDeleteInput !== 'DELETE' || isDeletingPermanently}
                onClick={handleConfirmPermanentDelete}
                style={{
                  backgroundColor: permanentDeleteInput === 'DELETE' && !isDeletingPermanently ? '#dc2626' : '#9ca3af',
                  color: '#ffffff',
                  fontWeight: 800,
                  padding: '8px 20px',
                  borderRadius: '8px',
                  cursor: permanentDeleteInput === 'DELETE' && !isDeletingPermanently ? 'pointer' : 'not-allowed',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                {isDeletingPermanently ? (
                  <>
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 size={15} />
                    <span>Delete Permanently</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Edit & Delete Loan Modals */}
      <EditLoanModal
        isOpen={!!editingLoan}
        loan={editingLoan}
        onClose={() => setEditingLoan(null)}
        onSuccess={() => setEditingLoan(null)}
      />
      <DeleteLoanModal
        isOpen={!!deletingLoan}
        loan={deletingLoan}
        onClose={() => setDeletingLoan(null)}
        onSuccess={() => setDeletingLoan(null)}
      />

      {/* Configuration Center & Backup Modal */}
      {showConfigCenterModal && (
        <ConfigurationCenterModal
          isOpen={showConfigCenterModal}
          onClose={() => setShowConfigCenterModal(false)}
        />
      )}
    </div>
  );
};

export default AdminPanel;
