import Decimal from 'decimal.js';
import { FixedDeposit, FDCustomer, FDInterestPayout, FDWithdrawal, FDRenewal } from '../types/index.js';
import { firestoreRepository } from '../repositories/firestore.repository.js';
import { adminService } from './admin.service.js';
import { accountingService } from './accounting.service.js';
import { counterService } from './counter.service.js';

export class FDService {
  // ── CUSTOMERS ─────────────────────────────────────────────────────────────
  public async getCustomersAsync(): Promise<FDCustomer[]> {
    return this.getCustomers();
  }

  public getCustomers(): FDCustomer[] {
    return firestoreRepository.getRecords<FDCustomer>('FD_CUSTOMER');
  }

  public getCustomerByPhone(phone: string): FDCustomer | null {
    const list = this.getCustomers();
    return list.find((c) => c.phone === phone) || null;
  }

  public async createCustomer(data: Omit<FDCustomer, 'id'>, actor?: any): Promise<FDCustomer> {
    const existing = this.getCustomerByPhone(data.phone);
    if (existing) {
      return existing;
    }

    const seq = await counterService.getNextSequence('fdCustomerId');
    const id = `FDC-${String(seq).padStart(4, '0')}`;
    const newCustomer: FDCustomer = {
      ...data,
      id,
      customerId: seq
    };

    await firestoreRepository.createRecord('FD_CUSTOMER', id, newCustomer, actor);
    return newCustomer;
  }

  // ── DEPOSITS ──────────────────────────────────────────────────────────────
  public async getDepositsAsync(): Promise<FixedDeposit[]> {
    return this.getDeposits();
  }

  public getDeposits(): FixedDeposit[] {
    return firestoreRepository.getRecords<FixedDeposit>('FIXED_DEPOSIT');
  }

  public getDepositByNo(fdNo: string): FixedDeposit | null {
    const list = this.getDeposits();
    return list.find((d) => d.fdNo === fdNo || d.id === fdNo) || null;
  }

  public async createDeposit(
    data: Omit<FixedDeposit, 'id' | 'fdNo' | 'maturityDate'> & { fdNo?: string; maturityDate?: string },
    actor?: any
  ): Promise<FixedDeposit> {
    let fdNo: string;
    if (data.fdNo && /^FD-\d+$/i.test(data.fdNo.trim())) {
      fdNo = data.fdNo.trim().toUpperCase();
      const num = parseInt(fdNo.replace(/\D/g, ''), 10);
      await counterService.setSequenceIfHigher('fdSequence', num);
    } else {
      fdNo = await counterService.getNextFdNo();
    }

    const masterSettings = adminService.getMasterSettings();
    const serverRatePA = data.interestRatePA !== undefined && !isNaN(Number(data.interestRatePA))
      ? Number(data.interestRatePA)
      : (masterSettings.fdInterestRate ?? 12);
    const serverTenureMonths = data.tenureMonths !== undefined && !isNaN(Number(data.tenureMonths))
      ? Number(data.tenureMonths)
      : (masterSettings.fdDefaultTenureMonths ?? 12);
    const minAmount = masterSettings.fdMinimumAmount ?? 0;

    if (minAmount > 0 && (Number(data.principal) || 0) < minAmount) {
      throw new Error(`Minimum Fixed Deposit principal amount is ₹${minAmount.toLocaleString('en-IN')}`);
    }

    const principal = new Decimal(data.principal || 0);
    const ratePA = new Decimal(serverRatePA);
    const monthlyPayout = principal.times(ratePA).dividedBy(1200).toDecimalPlaces(2).toNumber();

    const depositDate = data.depositDate || new Date().toLocaleDateString('en-GB').replace(/\//g, '-');
    let maturityDate = data.maturityDate;
    if (!maturityDate) {
      const parts = depositDate.split(/[-/]/);
      if (parts.length === 3) {
        const d = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const y = parseInt(parts[2], 10);
        const dt = new Date(y, m + serverTenureMonths, d);
        maturityDate = dt.toLocaleDateString('en-GB').replace(/\//g, '-');
      } else {
        maturityDate = new Date(Date.now() + serverTenureMonths * 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-GB').replace(/\//g, '-');
      }
    }

    let receiptNumber = data.receiptNumber;
    if (!receiptNumber) {
      receiptNumber = await counterService.getNextFdReceiptNo();
    } else {
      const match = receiptNumber.match(/(\d+)$/);
      if (match) {
        await counterService.setSequenceIfHigher('fdReceiptNo', parseInt(match[1], 10));
      }
    }
    const receiptGeneratedAt = data.receiptGeneratedAt || new Date().toISOString();

    const id = fdNo;
    const newFD: FixedDeposit = {
      ...data,
      id,
      fdNo,
      receiptNumber,
      receiptGeneratedAt,
      depositDate,
      maturityDate,
      principal: principal.toNumber(),
      remainingPrincipal: data.remainingPrincipal ?? principal.toNumber(),
      totalWithdrawnPrincipal: data.totalWithdrawnPrincipal ?? 0,
      interestRatePA: serverRatePA,
      tenureMonths: serverTenureMonths,
      monthlyPayout,
      status: data.status || 'ACTIVE',
      fdInterestRateSnapshot: serverRatePA,
      fdTenureSnapshot: serverTenureMonths,
      calculationMethodSnapshot: masterSettings.fdCalculationMethod || 'MONTHLY_DIVIDEND',
      minimumAmountSnapshot: minAmount,
      configurationVersion: masterSettings.configurationVersion || 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await firestoreRepository.createRecord('FIXED_DEPOSIT', id, newFD, actor);

    // Create DayBook Entry
    const isCash = data.receivingMethod === 'Cash';
    const isBank = data.receivingMethod === 'Bank' || data.receivingMethod === 'UPI';

    try {
      await accountingService.addEntryAsync({
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        billNo: fdNo,
        particulars: `Fixed Deposit Inflow (${fdNo}) - ${data.depositorName}`,
        accountHead: 'Fixed Deposits',
        mode: data.receivingMethod,
        cashIn: isCash ? data.principal : 0,
        cashOut: 0,
        bankIn: isBank ? data.principal : 0,
        bankOut: 0,
        customerName: data.depositorName,
        date: data.depositDate
      });
    } catch (e) {
      console.warn('[FDService] DayBook entry note:', e);
    }

    return newFD;
  }

  // ── PAYOUTS ───────────────────────────────────────────────────────────────
  public async getPayoutsAsync(): Promise<FDInterestPayout[]> {
    return this.getPayouts();
  }

  public getPayouts(): FDInterestPayout[] {
    return firestoreRepository.getRecords<FDInterestPayout>('FD_INTEREST_PAYOUT');
  }

  public getPayoutByVoucherNo(voucherOrId: string): FDInterestPayout | null {
    const list = this.getPayouts();
    return (
      list.find(
        (p) =>
          p.voucherNumber === voucherOrId ||
          p.id === voucherOrId ||
          p.payoutId === voucherOrId ||
          p.voucherNumber?.toLowerCase() === voucherOrId.toLowerCase()
      ) || null
    );
  }

  public async payInterest(
    fdNo: string,
    amount: number,
    mode: 'Cash' | 'Bank' | 'UPI' | string,
    options?: any,
    legacyPeriodKey?: string,
    legacyActor?: any
  ): Promise<FDInterestPayout | null> {
    const targetFD = firestoreRepository.getRecordById<FixedDeposit>('FIXED_DEPOSIT', fdNo);
    if (!targetFD || !targetFD.data) return null;

    const fd = targetFD.data;

    let dueDate: string | undefined;
    let periodKey: string | undefined;
    let actor: any;
    let paymentDate: string | undefined;
    let startDate: string | undefined;
    let periodLabel: string | undefined;
    let bankName: string | undefined;
    let transactionReference: string | undefined;
    let upiId: string | undefined;
    let remarks: string | undefined;
    let voucherNumber: string | undefined;
    let processedBy: string | undefined;
    let pendingInterestBefore: number | undefined;
    let pendingInterestAfter: number | undefined;
    let earnedInterest: number | undefined;

    if (typeof options === 'object' && options !== null) {
      dueDate = options.dueDate;
      startDate = options.startDate;
      periodKey = options.periodKey || legacyPeriodKey;
      periodLabel = options.periodLabel;
      paymentDate = options.paymentDate || options.date;
      bankName = options.bankName;
      transactionReference = options.transactionReference;
      upiId = options.upiId;
      remarks = options.remarks;
      voucherNumber = options.voucherNumber;
      processedBy = options.processedBy;
      pendingInterestBefore = options.pendingInterestBefore;
      pendingInterestAfter = options.pendingInterestAfter;
      earnedInterest = options.earnedInterest;
      actor = options.actor || legacyActor;
    } else if (typeof options === 'string') {
      dueDate = options;
      periodKey = legacyPeriodKey;
      actor = legacyActor;
    }

    if (!voucherNumber) {
      voucherNumber = await counterService.getNextFdInterestVoucherNo();
    } else {
      const match = voucherNumber.match(/(\d+)$/);
      if (match) {
        await counterService.setSequenceIfHigher('fdInterestVoucherNo', parseInt(match[1], 10));
      }
    }

    const date = paymentDate || new Date().toLocaleDateString('en-GB').replace(/\//g, '-');
    const voucherGeneratedAt = new Date().toISOString();
    const id = `fd-payout-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const payout: FDInterestPayout = {
      id,
      payoutId: id,
      voucherNumber,
      voucherGeneratedAt,
      fdId: fd.id,
      fdNo,
      customerId: fd.customerId,
      depositorName: fd.depositorName,
      customerPhone: fd.phone,
      customerAddress: fd.address,
      principalAtPayment: fd.remainingPrincipal ?? fd.principal,
      interestRatePA: fd.interestRatePA,
      monthlyPayout: fd.monthlyPayout,
      tenureMonths: fd.tenureMonths,
      amount: Number(amount),
      date,
      dueDate,
      startDate,
      periodKey,
      periodLabel,
      earnedInterest,
      pendingInterestBefore,
      pendingInterestAfter,
      mode,
      bankName,
      transactionReference,
      upiId,
      remarks,
      processedBy,
      status: 'PAID',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await firestoreRepository.createRecord('FD_INTEREST_PAYOUT', id, payout, actor);

    // DayBook Entry
    const isCash = mode === 'Cash';
    try {
      await accountingService.addEntryAsync({
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        billNo: voucherNumber,
        particulars: `FD Interest Payment (${fdNo}) - ${fd.depositorName} [${voucherNumber}]`,
        accountHead: 'Interest Paid',
        mode: isCash ? 'Cash' : (mode === 'UPI' ? 'UPI' : 'Bank'),
        cashIn: 0,
        cashOut: isCash ? Number(amount) : 0,
        bankIn: 0,
        bankOut: isCash ? 0 : Number(amount),
        customerName: fd.depositorName,
        date: payout.date
      });
    } catch (e) {
      console.warn('[FDService] DayBook entry note:', e);
    }

    return payout;
  }

  // ── WITHDRAWALS ───────────────────────────────────────────────────────────
  public async getWithdrawalsAsync(): Promise<FDWithdrawal[]> {
    return this.getWithdrawals();
  }

  public getWithdrawals(): FDWithdrawal[] {
    return firestoreRepository.getRecords<FDWithdrawal>('FD_WITHDRAWAL');
  }

  public async withdraw(
    fdNo: string,
    mode: 'Cash' | 'Bank' | 'UPI',
    notes?: string,
    partialAmount?: number,
    transactionReference?: string,
    bankName?: string,
    actor?: any
  ): Promise<FDWithdrawal | null> {
    const targetFD = firestoreRepository.getRecordById<FixedDeposit>('FIXED_DEPOSIT', fdNo);
    if (!targetFD || !targetFD.data) return null;

    const fd = targetFD.data;
    const currentRemaining = fd.remainingPrincipal ?? fd.principal;
    const amountToWithdraw = partialAmount !== undefined && partialAmount > 0 ? partialAmount : currentRemaining;

    if (amountToWithdraw > currentRemaining) {
      throw new Error(`Cannot withdraw ₹${amountToWithdraw}. Maximum available remaining principal is ₹${currentRemaining}.`);
    }

    const newRemaining = currentRemaining - amountToWithdraw;
    const newTotalWithdrawn = (fd.totalWithdrawnPrincipal ?? 0) + amountToWithdraw;
    const isFullWithdrawal = newRemaining === 0;

    const updatedFD: FixedDeposit = {
      ...fd,
      remainingPrincipal: newRemaining,
      totalWithdrawnPrincipal: newTotalWithdrawn,
      status: isFullWithdrawal ? 'WITHDRAWN' : 'ACTIVE',
      updatedAt: new Date().toISOString()
    };

    await firestoreRepository.updateRecord('FIXED_DEPOSIT', fdNo, updatedFD, { actor });

    const id = `fd-wd-${Date.now()}`;
    const todayStr = new Date().toLocaleDateString('en-GB').replace(/\//g, '-');
    const withdrawal: FDWithdrawal = {
      id,
      withdrawalId: id,
      fdId: fd.id,
      fdNo,
      customerId: fd.customerId,
      depositorName: fd.depositorName,
      principalAmount: amountToWithdraw,
      principalWithdrawn: amountToWithdraw,
      remainingBalance: newRemaining,
      interestPaid: 0,
      totalAmount: amountToWithdraw,
      date: todayStr,
      withdrawalDate: todayStr,
      mode,
      status: isFullWithdrawal ? 'CLOSED' : 'PARTIAL_WITHDRAWAL',
      notes,
      transactionReference,
      bankName
    };

    await firestoreRepository.createRecord('FD_WITHDRAWAL', id, withdrawal, actor);

    // DayBook Entry
    const isCash = mode === 'Cash';
    try {
      await accountingService.addEntryAsync({
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        billNo: `WD-${fdNo}`,
        particulars: `FD Principal Withdrawal (${fdNo}) - ${fd.depositorName}`,
        accountHead: 'Fixed Deposits',
        mode,
        cashIn: 0,
        cashOut: isCash ? amountToWithdraw : 0,
        bankIn: 0,
        bankOut: isCash ? 0 : amountToWithdraw,
        customerName: fd.depositorName,
        date: withdrawal.date || todayStr
      });
    } catch (e) {
      console.warn('[FDService] DayBook entry note:', e);
    }

    return withdrawal;
  }

  // ── RENEWALS ─────────────────────────────────────────────────────────────
  public async getRenewalsAsync(): Promise<FDRenewal[]> {
    return this.getRenewals();
  }

  public getRenewals(): FDRenewal[] {
    return firestoreRepository.getRecords<FDRenewal>('FD_RENEWAL');
  }

  public async renewDeposit(
    oldFdNo: string,
    tenureMonths: number,
    interestRatePA: number,
    actor?: any
  ): Promise<{ oldFD: FixedDeposit; newFD: FixedDeposit; renewal: FDRenewal } | null> {
    const targetFD = firestoreRepository.getRecordById<FixedDeposit>('FIXED_DEPOSIT', oldFdNo);
    if (!targetFD || !targetFD.data) return null;

    const oldFD = targetFD.data;
    const principalToRenew = oldFD.remainingPrincipal ?? oldFD.principal;

    // Mark old FD as matured/renewed
    const updatedOldFD: FixedDeposit = {
      ...oldFD,
      status: 'MATURED',
      updatedAt: new Date().toISOString()
    };
    await firestoreRepository.updateRecord('FIXED_DEPOSIT', oldFdNo, updatedOldFD, { actor });

    // Create new renewed FD
    const newFD = await this.createDeposit({
      customerId: oldFD.customerId,
      depositorName: oldFD.depositorName,
      phone: oldFD.phone,
      idProofType: oldFD.idProofType,
      idProofNumber: oldFD.idProofNumber,
      idNumber: oldFD.idNumber,
      address: oldFD.address,
      principal: principalToRenew,
      tenureMonths,
      interestRatePA,
      receivingMethod: oldFD.receivingMethod || 'Cash',
      depositDate: new Date().toLocaleDateString('en-GB').replace(/\//g, '-'),
      monthlyPayout: (principalToRenew * interestRatePA) / 1200,
      status: 'ACTIVE',
      parentCustomerName: oldFD.parentCustomerName,
      nomineeName: oldFD.nomineeName,
      nomineeRelation: oldFD.nomineeRelation,
      remarks: `Renewed from ${oldFdNo}`
    }, actor);

    const renewalId = `fd-rn-${Date.now()}`;
    const todayStr = new Date().toLocaleDateString('en-GB').replace(/\//g, '-');
    const renewal: FDRenewal = {
      id: renewalId,
      renewalId,
      fdId: oldFD.id,
      oldFdId: oldFD.id,
      oldFdNo: oldFD.fdNo,
      newFdId: newFD.id,
      newFdNo: newFD.fdNo,
      fdNo: newFD.fdNo,
      customerId: oldFD.customerId,
      depositorName: oldFD.depositorName,
      previousMaturityDate: oldFD.maturityDate,
      newMaturityDate: newFD.maturityDate,
      renewalPeriodMonths: tenureMonths,
      periodMonths: tenureMonths,
      oldInterestRate: oldFD.interestRatePA,
      newInterestRate: interestRatePA,
      interestRateAtRenewal: interestRatePA,
      renewalDate: todayStr,
      status: 'COMPLETED'
    };

    await firestoreRepository.createRecord('FD_RENEWAL', renewalId, renewal, actor);

    return { oldFD: updatedOldFD, newFD, renewal };
  }

  public async renew(fdNo: string, periodMonths: number, notes?: string, actor?: any): Promise<any> {
    const fd = this.getDepositByNo(fdNo);
    if (!fd) return null;
    const rate = fd.interestRatePA || 12;
    const res = await this.renewDeposit(fdNo, periodMonths, rate, actor);
    return res?.renewal || null;
  }

  public async deleteDeposit(fdNo: string, actor?: any): Promise<boolean> {
    const fd = this.getDepositByNo(fdNo);
    if (!fd) return false;
    await firestoreRepository.deleteRecord('FIXED_DEPOSIT', fdNo, false, actor);
    return true;
  }

  public bulkUpdateDates(fdNos: string[], newDepositDate?: string, offsetDays?: number): FixedDeposit[] {
    const updated: FixedDeposit[] = [];
    for (const fdNo of fdNos) {
      const fd = this.getDepositByNo(fdNo);
      if (fd) {
        let depositDate = fd.depositDate;
        if (newDepositDate) {
          depositDate = newDepositDate;
        }
        const updatedDoc: FixedDeposit = { ...fd, depositDate, updatedAt: new Date().toISOString() };
        firestoreRepository.updateRecord('FIXED_DEPOSIT', fdNo, updatedDoc).catch(() => {});
        updated.push(updatedDoc);
      }
    }
    return updated;
  }
}

export const fdService = new FDService();
export default fdService;
