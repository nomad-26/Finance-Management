import Decimal from 'decimal.js';
import { v4 as uuidv4 } from 'uuid';
import { firestoreRepository } from '../repositories/firestore.repository.js';
import { Loan, Receipt, LoanTypeConfig } from '../types/index.js';
import { customerService } from './customer.service.js';
import { receiptService } from './receipt.service.js';
import { accountingService } from './accounting.service.js';
import { adminService } from './admin.service.js';
import { counterService } from './counter.service.js';
import { FileAttachmentModel } from '../models/FileAttachment.js';
import { StaffAuditModel } from '../models/StaffAudit.js';
import {
  parseDateComponents,
  parseLoanDate,
  formatLoanDate,
  formatInputDate,
  addMonthsToLoanDate,
  validateLoanIssueDate,
  getCalendarDaysDifference,
  getMinimumLoanIssueDate
} from '../utils/dateUtils.js';

const calculateAuthoritativeNextDueDate = (
  issueDateStr?: string,
  deductAdvanceInterest?: boolean,
  advanceDays?: number
): string => {
  const baseDate = parseLoanDate(issueDateStr);
  const monthsToAdd = deductAdvanceInterest && (advanceDays || 0) > 0 ? 2 : 1;
  const nextDueDate = addMonthsToLoanDate(baseDate, monthsToAdd);
  return formatLoanDate(nextDueDate);
};

export class LoanService {
  public async getAllAsync(includeDeleted: boolean = false): Promise<Loan[]> {
    return this.getAll(includeDeleted);
  }

  public getAll(includeDeleted: boolean = false): Loan[] {
    return firestoreRepository.getRecords<Loan>('LOAN', { includeDeleted });
  }

  public async getByIdAsync(id: string, includeDeleted: boolean = false): Promise<Loan | null> {
    return this.getById(id, includeDeleted);
  }

  public getById(id: string, includeDeleted: boolean = false): Loan | null {
    const loans = this.getAll(includeDeleted);
    return loans.find((l) => l.id === id || (l.loanNo && l.loanNo.toLowerCase() === id.toLowerCase())) || null;
  }

  public async getByLoanNoAsync(loanNo: string, includeDeleted: boolean = false): Promise<Loan | null> {
    return this.getByIdAsync(loanNo, includeDeleted);
  }

  public getByLoanNo(loanNo: string, includeDeleted: boolean = false): Loan | null {
    return this.getById(loanNo, includeDeleted);
  }

  public calculateFinancials(principal: number, interestRatePercent: number, items: any[], manualMarketValue?: number) {
    const decPrincipal = new Decimal(principal || 0);
    const decRate = new Decimal(interestRatePercent || 0);

    const monthlyInterest = decPrincipal.times(decRate).dividedBy(100).toDecimalPlaces(2).toNumber();

    let totalGross = new Decimal(0);
    let totalDeduction = new Decimal(0);
    let totalNet = new Decimal(0);

    if (!Array.isArray(items) || items.length === 0) {
      const err: any = new Error('At least one ornament item is required.');
      err.code = 'INVALID_ORNAMENTS';
      throw err;
    }

    const normalizedItems = (items || []).map((it, idx) => {
      const rawQty = it.qty;
      const qtyNum = Number(rawQty);

      if (!Number.isInteger(qtyNum) || qtyNum < 1) {
        const err: any = new Error('Quantity must be a whole number greater than or equal to 1');
        err.code = 'INVALID_QUANTITY';
        throw err;
      }

      const grossVal = Math.round((Number(it.grossWeight) || 0) * 1000) / 1000;
      const deductionVal = Math.round((Number(it.deductionWeight) || 0) * 1000) / 1000;

      if (grossVal < 0 || deductionVal < 0) {
        const err: any = new Error(`Weight values cannot be negative for item ${it.item || idx + 1}.`);
        err.code = 'INVALID_WEIGHT';
        throw err;
      }

      if (deductionVal > grossVal) {
        const err: any = new Error(
          `Deduction weight (${deductionVal.toFixed(3)}g) cannot be greater than gross weight (${grossVal.toFixed(3)}g) for item ${it.item || idx + 1}.`
        );
        err.code = 'INVALID_WEIGHT';
        throw err;
      }

      const netVal = Math.max(0, Math.round((grossVal - deductionVal) * 1000) / 1000);

      totalGross = totalGross.plus(new Decimal(grossVal));
      totalDeduction = totalDeduction.plus(new Decimal(deductionVal));
      totalNet = totalNet.plus(new Decimal(netVal));

      return {
        ...it,
        id: it.id || `item_${idx + 1}_${Date.now()}`,
        qty: qtyNum,
        grossWeight: grossVal,
        deductionWeight: deductionVal,
        netWeight: netVal
      };
    });

    const settings = adminService.getSettings();
    const goldRate = Number(settings.goldRate22ct || (settings as any).goldRate22k || 5500);

    const calculatedMarketValue = totalNet.times(goldRate).toDecimalPlaces(2).toNumber();
    const finalMarketValue = (manualMarketValue !== undefined && manualMarketValue !== null && manualMarketValue > 0)
      ? manualMarketValue
      : calculatedMarketValue;

    const ltv = finalMarketValue > 0
      ? decPrincipal.dividedBy(finalMarketValue).times(100).toDecimalPlaces(2).toNumber()
      : 0;

    return {
      monthlyInterest,
      totalGrossWeight: totalGross.toDecimalPlaces(3).toNumber(),
      totalDeductionWeight: totalDeduction.toDecimalPlaces(3).toNumber(),
      totalNetWeight: totalNet.toDecimalPlaces(3).toNumber(),
      marketValue: finalMarketValue,
      ltv,
      normalizedItems
    };
  }

  public async create(loanData: Omit<Loan, 'id' | 'loanNo' | 'receiptBillNo' | 'outstandingPrincipal' | 'accruedInterest' | 'status'>, actor?: any): Promise<Loan> {
    const seq = await counterService.getNextLoanSequence();
    const loanNo = `GL-${seq}`;
    const id = loanNo;

    const effectivePrincipal = Number(loanData.principal);
    if (!effectivePrincipal || effectivePrincipal <= 0) {
      const err: any = new Error('Principal amount must be greater than zero.');
      err.code = 'INVALID_PRINCIPAL';
      throw err;
    }

    const activeConfigs = adminService.getLoanTypeConfigs();
    let matchedType: any = undefined;

    if (loanData.loanTypeId) {
      matchedType = activeConfigs.find((c: any) => c.id === loanData.loanTypeId);
    }
    if (!matchedType && loanData.loanType) {
      matchedType = activeConfigs.find((c: any) => (c.name || '').toLowerCase() === loanData.loanType.toLowerCase());
    }
    if (!matchedType && activeConfigs.length > 0) {
      matchedType = activeConfigs[0];
    }

    const settings = adminService.getSettings();
    const isTransactionCardFeeEnabled = loanData.cardFeeEnabled !== undefined
      ? Boolean(loanData.cardFeeEnabled)
      : ((settings as any).goldCardFeeEnabled !== false && (settings as any).cardFeeEnabled !== false);

    const serverCardFeeAmount = typeof (settings as any).goldCardFee === 'number'
      ? (settings as any).goldCardFee
      : (typeof settings.defaultCardFee === 'number' ? settings.defaultCardFee : 25);
    const effectiveCardFee = isTransactionCardFeeEnabled
      ? (typeof loanData.cardFee === 'number' ? loanData.cardFee : serverCardFeeAmount)
      : 0;

    let interestRate = Number(loanData.interestRate);
    let interestProfileName = 'Gold Loan Profile';
    let configVersion = 1;
    let amountBandId: string | undefined = undefined;

    if (matchedType) {
      configVersion = matchedType.version || matchedType.configurationVersion || 1;
      const rateConfig = adminService.resolveEffectiveRateForAmount(matchedType.id, effectivePrincipal);
      interestRate = rateConfig.rate;
      interestProfileName = rateConfig.profileName;
      amountBandId = rateConfig.bandId;
    }

    const calc = this.calculateFinancials(
      effectivePrincipal,
      interestRate,
      loanData.items,
      loanData.marketValue
    );

    let normalizedNominee: any = undefined;
    const isNomineeEnabled = loanData.nominee?.hasNominee || loanData.nominee?.enabled;
    if (isNomineeEnabled && loanData.nominee) {
      const nom = loanData.nominee;
      const fullName = (nom.fullName || nom.name || '').trim();
      const relation = (nom.relation || nom.relationship || '').trim();
      const mobile = (nom.mobile || nom.phone || '').replace(/\D/g, '');
      const aadhaarDigits = (nom.aadhaarNumber || nom.idProof || '').replace(/\D/g, '');
      const panUpper = (nom.panNumber || '').trim().toUpperCase();

      normalizedNominee = {
        hasNominee: true,
        enabled: true,
        name: fullName,
        fullName,
        relation,
        relationship: relation,
        phone: mobile,
        mobile,
        aadhaarNumber: aadhaarDigits,
        panNumber: panUpper || undefined,
        address: nom.address || ''
      };
    }

    let normalizedGuarantor: any = undefined;
    const isGuarantorEnabled = loanData.guarantor?.hasGuarantor || loanData.guarantor?.enabled;
    if (isGuarantorEnabled && loanData.guarantor) {
      const guar = loanData.guarantor;
      const fullName = (guar.fullName || guar.name || '').trim();
      const relation = (guar.relation || guar.relationship || '').trim();
      const mobile = (guar.mobile || guar.phone || '').replace(/\D/g, '');
      const aadhaarDigits = (guar.aadhaarNumber || guar.idProof || '').replace(/\D/g, '');
      const panUpper = (guar.panNumber || '').trim().toUpperCase();

      normalizedGuarantor = {
        hasGuarantor: true,
        enabled: true,
        name: fullName,
        fullName,
        relation,
        relationship: relation,
        phone: mobile,
        mobile,
        aadhaarNumber: aadhaarDigits,
        panNumber: panUpper || undefined,
        address: guar.address || guar.currentAddress || ''
      };
    }

    // Validate Loan Issue Date strictly (allows up to 30 days backdate, forbids future dates)
    const rawIssueDateStr = loanData.date ? String(loanData.date).trim() : formatLoanDate(new Date());
    const dateValidation = validateLoanIssueDate(rawIssueDateStr);
    if (!dateValidation.isValid) {
      const err: any = new Error(dateValidation.error || 'Please enter a valid loan issue date.');
      err.code = dateValidation.code || 'INVALID_ISSUE_DATE';
      throw err;
    }

    const baseIssueDate = dateValidation.parsedDate!;
    const effectiveIssueDateStr = dateValidation.formattedDate!;
    const effectiveAdvanceDays = loanData.advanceDays || (loanData.deductAdvanceInterest ? 30 : 0);
    const hasAdvance = Boolean(loanData.deductAdvanceInterest && effectiveAdvanceDays > 0);
    const monthsCovered = hasAdvance ? Math.max(1, Math.round(effectiveAdvanceDays / 30)) : 0;

    const authoritativeNextDueDate = loanData.nextDueDate && loanData.nextDueDate.trim().length > 0
      ? loanData.nextDueDate
      : calculateAuthoritativeNextDueDate(effectiveIssueDateStr, loanData.deductAdvanceInterest, effectiveAdvanceDays);

    const coveredInterestStartDate = hasAdvance ? formatLoanDate(baseIssueDate) : undefined;
    const coveredInterestEndDate = hasAdvance ? formatLoanDate(addMonthsToLoanDate(baseIssueDate, monthsCovered)) : undefined;

    const authoritativeLastInterestPaidDate = hasAdvance
      ? (coveredInterestEndDate || formatLoanDate(baseIssueDate))
      : formatLoanDate(baseIssueDate);

    const advanceInterest = hasAdvance
      ? (loanData.advanceInterestAmount || Math.round(((calc.monthlyInterest || 0) / 30) * effectiveAdvanceDays))
      : 0;
    const netDisbursed = new Decimal(effectivePrincipal).minus(advanceInterest).minus(effectiveCardFee).toNumber();

    const newLoan: Loan = {
      ...loanData,
      photos: loanData.photos || [],
      principal: effectivePrincipal,
      id,
      loanNo,
      receiptBillNo: seq,
      loanType: matchedType ? matchedType.name : loanData.loanType,
      loanTypeId: matchedType ? matchedType.id : (loanData.loanTypeId || 'gold-loan'),
      loanTypeName: matchedType ? matchedType.name : (loanData.loanTypeName || loanData.loanType),
      nominee: normalizedNominee,
      guarantor: normalizedGuarantor,

      nomineeName: normalizedNominee?.name,
      nomineeRelation: normalizedNominee?.relation,
      nomineePhone: normalizedNominee?.phone,
      nomineeAadhaar: normalizedNominee?.aadhaarNumber,
      nomineePan: normalizedNominee?.panNumber,
      guarantorName: normalizedGuarantor?.name,
      guarantorRelation: normalizedGuarantor?.relation,
      guarantorPhone: normalizedGuarantor?.phone,
      guarantorAadhaar: normalizedGuarantor?.aadhaarNumber,
      guarantorPan: normalizedGuarantor?.panNumber,
      loanTypeNameSnapshot: matchedType ? matchedType.name : loanData.loanType,
      interestRateSnapshot: interestRate,
      interestProfileSnapshot: interestProfileName,
      cardFeeSnapshot: serverCardFeeAmount,
      interestProfileIdSnapshot: matchedType?.interestProfileId || 'gold-bands',
      interestProfileNameSnapshot: interestProfileName,
      interestConfigurationSnapshot: {
        interestRate,
        interestRateUnit: 'MONTHLY',
        rateSource: 'MASTER_CONTROL',
        amountBandId
      },
      configurationVersion: configVersion,
      configurationSource: matchedType && matchedType.useMasterDefaults !== false ? 'MASTER_INHERITED' : 'CUSTOM_OVERRIDE',
      rateEffectiveAt: loanData.date || new Date().toISOString(),

      interestRate,
      cardFee: effectiveCardFee,
      cardFeeEnabled: isTransactionCardFeeEnabled,
      cardFeePaymentMode: isTransactionCardFeeEnabled ? (loanData.cardFeePaymentMode || 'Cash') : 'Cash',
      cardFeeBankMode: isTransactionCardFeeEnabled && loanData.cardFeePaymentMode === 'Bank' ? loanData.cardFeeBankMode : undefined,
      items: calc.normalizedItems,
      monthlyInterest: calc.monthlyInterest,
      totalGrossWeight: calc.totalGrossWeight,
      totalDeductionWeight: calc.totalDeductionWeight,
      totalNetWeight: calc.totalNetWeight,
      marketValue: calc.marketValue,
      ltv: calc.ltv,
      disbursedAmount: netDisbursed,
      netDisbursed,
      outstandingPrincipal: effectivePrincipal,
      accruedInterest: calc.monthlyInterest,
      status: 'ACTIVE',
      date: formatLoanDate(baseIssueDate),
      coveredInterestStartDate,
      coveredInterestEndDate,
      advanceInterestCollectedAt: hasAdvance ? new Date().toISOString() : undefined,
      lastInterestPaidDate: authoritativeLastInterestPaidDate,
      nextDueDate: authoritativeNextDueDate,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Persist to Cloud Firestore
    await firestoreRepository.createRecord('LOAN', newLoan.id, newLoan, actor);

    // Update customer active loans count
    const customer = customerService.getById(newLoan.customerId);
    if (customer) {
      await customerService.update(customer.id, {
        activeLoansCount: (customer.activeLoansCount || 0) + 1,
        totalBorrowed: new Decimal(customer.totalBorrowed || 0).plus(effectivePrincipal).toNumber()
      });
    }

    // Create Loan Disbursement Receipt
    try {
      const isAdvance = Boolean(newLoan.deductAdvanceInterest && (newLoan.advanceDays || 0) > 0);
      const advanceDeduction = isAdvance ? (newLoan.advanceInterestAmount || 0) : 0;
      const feeDeduction = newLoan.cardFeeEnabled ? (newLoan.cardFee || 0) : 0;
      const otherDeductions = 0;
      const totalDeductions = advanceDeduction + feeDeduction + otherDeductions;
      const netDisbursed = Math.max(0, effectivePrincipal - totalDeductions);

      await receiptService.create({
        receiptNo: seq,
        loanId: newLoan.id,
        loanNo: newLoan.loanNo,
        customerId: newLoan.customerId,
        customerName: newLoan.customerName,
        customerPhone: newLoan.customerPhone,
        kind: 'LOAN DISBURSEMENT',
        loanType: newLoan.loanType,
        amount: netDisbursed,
        principalComponent: effectivePrincipal,
        interestComponent: 0,
        loanPrincipal: effectivePrincipal,
        interestRate: newLoan.interestRate,
        deductAdvanceInterest: isAdvance,
        advanceDays: isAdvance ? newLoan.advanceDays : 0,
        advanceInterestAmount: advanceDeduction,
        advanceInterestDeducted: advanceDeduction,
        processingFee: feeDeduction,
        cardFee: feeDeduction,
        otherDeductions,
        totalDeductions,
        netDisbursedAmount: netDisbursed,
        disbursementMethod: newLoan.bankMode === 'Cash' ? 'Cash' : newLoan.bankMode === 'Split' ? 'Cash + Bank' : 'Bank',
        advanceReceivingMethod: newLoan.advanceInterestReceivingMethod,
        paymentMode: newLoan.bankMode === 'Cash' ? 'Cash' : newLoan.bankMode === 'Split' ? 'Bank' : ((newLoan.bankMode as any) || 'UPI'),
        date: newLoan.date || new Date().toLocaleDateString('en-GB').replace(/\//g, '-'),
        nextDueDate: authoritativeNextDueDate,
        processedBy: actor?.username || 'Admin',
        notes: 'Loan Disbursement'
      });
    } catch (e) {
      console.warn('[LoanService] Receipt creation note:', e);
    }

    // Create DayBook Entry
    try {
      const isCash = newLoan.bankMode === 'Cash';
      const isSplit = newLoan.bankMode === 'Split';
      const actualDisbursed = newLoan.netDisbursed !== undefined ? newLoan.netDisbursed : effectivePrincipal;
      const cashDisbursed = isCash ? actualDisbursed : isSplit ? (newLoan.cashAmount || 0) : 0;
      const bankDisbursed = isCash ? 0 : isSplit ? (newLoan.bankAmount || 0) : actualDisbursed;

      await accountingService.addEntryAsync({
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        billNo: String(seq),
        particulars: `Loan Disbursement (${loanNo}) - ${newLoan.customerName}`,
        accountHead: 'Gold Loan Portfolio',
        mode: isCash ? 'Cash' : newLoan.bankMode === 'UPI' ? 'UPI' : 'Bank',
        cashIn: 0,
        cashOut: cashDisbursed,
        bankIn: 0,
        bankOut: bankDisbursed,
        customerName: newLoan.customerName,
        loanNo,
        date: newLoan.date || new Date().toLocaleDateString('en-GB').replace(/\//g, '-')
      });

      if (effectiveCardFee > 0) {
        const isFeeBank = newLoan.cardFeePaymentMode === 'Bank';
        const feeMode: 'Cash' | 'UPI' | 'Bank' = isFeeBank
          ? (newLoan.cardFeeBankMode === 'UPI' ? 'UPI' : 'Bank')
          : 'Cash';

        await accountingService.addEntryAsync({
          time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          billNo: String(seq),
          particulars: `Card Processing Fee (${loanNo}) - ${newLoan.customerName}`,
          accountHead: 'Processing Fees',
          mode: feeMode,
          cashIn: isFeeBank ? 0 : effectiveCardFee,
          cashOut: 0,
          bankIn: isFeeBank ? effectiveCardFee : 0,
          bankOut: 0,
          customerName: newLoan.customerName,
          loanNo,
          date: newLoan.date || new Date().toLocaleDateString('en-GB').replace(/\//g, '-')
        });
      }
    } catch (e) {
      console.warn('[LoanService] Accounting entry note:', e);
    }

    return newLoan;
  }

  public async closeLoanAsync(loanNo: string): Promise<Loan | null> {
    const loan = this.getById(loanNo);
    if (!loan) return null;

    const updated = await firestoreRepository.updateRecord<Loan>('LOAN', loan.id, {
      outstandingPrincipal: 0,
      status: 'CLOSED',
      updatedAt: new Date().toISOString()
    });

    return updated.data;
  }

  public closeLoan(loanNo: string): Loan | null {
    const loan = this.getById(loanNo);
    if (!loan) return null;

    firestoreRepository.updateRecord<Loan>('LOAN', loan.id, {
      outstandingPrincipal: 0,
      status: 'CLOSED',
      updatedAt: new Date().toISOString()
    }).catch(() => {});

    return { ...loan, outstandingPrincipal: 0, status: 'CLOSED' };
  }

  public async updateAsync(id: string, updates: Partial<Loan>): Promise<Loan | null> {
    const loan = this.getById(id);
    if (!loan) return null;

    const updated = await firestoreRepository.updateRecord<Loan>('LOAN', loan.id, updates);
    return updated.data;
  }

  public update(id: string, updates: Partial<Loan>): Loan | null {
    const loan = this.getById(id);
    if (!loan) return null;

    firestoreRepository.updateRecord<Loan>('LOAN', loan.id, updates).catch(() => {});
    return { ...loan, ...updates };
  }

  /**
   * Admin-Only Loan Edit with financial recalculation, concurrency protection, and audit logging.
   */
  public async adminUpdateLoanAsync(
    id: string,
    payload: any,
    actor?: { uid?: string; email?: string; role?: string; name?: string },
    meta?: { ipAddress?: string; userAgent?: string }
  ): Promise<Loan> {
    const loan = this.getById(id);
    if (!loan) {
      const err: any = new Error(`Loan with ID "${id}" not found.`);
      err.statusCode = 404;
      err.code = 'NOT_FOUND';
      throw err;
    }

    const reason = (payload.reason || payload.editReason || '').trim();
    if (!reason) {
      const err: any = new Error('An administrative edit reason is required for audit logging.');
      err.statusCode = 400;
      err.code = 'REASON_REQUIRED';
      throw err;
    }

    // Retrieve receipts associated with this loan to detect repayments
    const allReceipts = await receiptService.getAllAsync();
    const loanReceipts = allReceipts.filter((r) => r.loanId === loan.id || r.loanNo === loan.loanNo);
    const repaymentReceipts = loanReceipts.filter((r) => r.kind !== 'LOAN DISBURSEMENT' && r.kind !== 'NEW LOAN');
    const totalPrincipalRepaid = repaymentReceipts.reduce((sum, r) => sum + (Number(r.principalComponent) || 0), 0);

    // Track before and after changes for audit
    const beforeChanges: Record<string, any> = {};
    const afterChanges: Record<string, any> = {};

    let effectivePrincipal = loan.principal;
    let principalChanged = false;
    if (payload.principal !== undefined) {
      const newPrincipal = Number(payload.principal);
      if (isNaN(newPrincipal) || newPrincipal <= 0) {
        const err: any = new Error('Principal amount must be greater than zero.');
        err.statusCode = 400;
        err.code = 'INVALID_PRINCIPAL';
        throw err;
      }
      if (newPrincipal < totalPrincipalRepaid) {
        const err: any = new Error(
          `Cannot set principal to ₹${newPrincipal.toLocaleString('en-IN')}. A total of ₹${totalPrincipalRepaid.toLocaleString('en-IN')} has already been repaid against this loan.`
        );
        err.statusCode = 400;
        err.code = 'PRINCIPAL_BELOW_REPAID';
        throw err;
      }
      if (newPrincipal !== loan.principal) {
        beforeChanges.principal = loan.principal;
        afterChanges.principal = newPrincipal;
        effectivePrincipal = newPrincipal;
        principalChanged = true;
      }
    }

    let effectiveInterestRate = loan.interestRate;
    if (payload.interestRate !== undefined) {
      const newRate = Number(payload.interestRate);
      if (isNaN(newRate) || newRate < 0) {
        const err: any = new Error('Interest rate must be a non-negative number.');
        err.statusCode = 400;
        err.code = 'INVALID_INTEREST_RATE';
        throw err;
      }
      if (newRate !== loan.interestRate) {
        beforeChanges.interestRate = loan.interestRate;
        afterChanges.interestRate = newRate;
        effectiveInterestRate = newRate;
      }
    }

    let effectiveDate = loan.date;
    if (payload.date !== undefined && String(payload.date).trim() !== loan.date) {
      const dateValidation = validateLoanIssueDate(String(payload.date).trim());
      if (!dateValidation.isValid) {
        const err: any = new Error(dateValidation.error || 'Invalid loan issue date.');
        err.statusCode = 400;
        err.code = dateValidation.code || 'INVALID_ISSUE_DATE';
        throw err;
      }
      beforeChanges.date = loan.date;
      afterChanges.date = dateValidation.formattedDate!;
      effectiveDate = dateValidation.formattedDate!;
    }

    let effectiveItems = loan.items;
    let effectiveMarketValue = payload.marketValue !== undefined ? Number(payload.marketValue) : loan.marketValue;
    if (payload.items !== undefined && Array.isArray(payload.items) && payload.items.length > 0) {
      effectiveItems = payload.items;
    }

    // Financial calculations using established financial calculation method
    const calc = this.calculateFinancials(
      effectivePrincipal,
      effectiveInterestRate,
      effectiveItems,
      effectiveMarketValue
    );

    // Calculate new outstanding principal
    const outstandingBefore = loan.outstandingPrincipal ?? loan.principal;
    let effectiveOutstanding: number;
    if (loan.status === 'CLOSED' && payload.status !== 'ACTIVE') {
      effectiveOutstanding = 0;
    } else {
      effectiveOutstanding = Math.max(0, effectivePrincipal - totalPrincipalRepaid);
    }

    if (effectiveOutstanding !== outstandingBefore) {
      beforeChanges.outstandingPrincipal = outstandingBefore;
      afterChanges.outstandingPrincipal = effectiveOutstanding;
    }

    if (calc.monthlyInterest !== loan.monthlyInterest) {
      beforeChanges.monthlyInterest = loan.monthlyInterest;
      afterChanges.monthlyInterest = calc.monthlyInterest;
    }

    // Status change
    let effectiveStatus = loan.status;
    if (payload.status !== undefined && payload.status !== loan.status) {
      const validStatuses = ['ACTIVE', 'CLOSED', 'PENDING', 'OVERDUE'];
      if (!validStatuses.includes(payload.status)) {
        const err: any = new Error(`Invalid loan status. Must be one of: ${validStatuses.join(', ')}`);
        err.statusCode = 400;
        err.code = 'INVALID_STATUS';
        throw err;
      }
      beforeChanges.status = loan.status;
      afterChanges.status = payload.status;
      effectiveStatus = payload.status as any;
      if (effectiveStatus === 'CLOSED') {
        effectiveOutstanding = 0;
      }
    }

    // Next due date
    let effectiveNextDueDate = loan.nextDueDate;
    if (payload.nextDueDate !== undefined && payload.nextDueDate !== loan.nextDueDate) {
      beforeChanges.nextDueDate = loan.nextDueDate;
      afterChanges.nextDueDate = payload.nextDueDate;
      effectiveNextDueDate = payload.nextDueDate;
    }

    // Notes
    let effectiveNotes = loan.notes;
    if (payload.notes !== undefined && payload.notes !== loan.notes) {
      beforeChanges.notes = loan.notes;
      afterChanges.notes = payload.notes;
      effectiveNotes = payload.notes;
    }

    // Nominee
    let effectiveNominee = loan.nominee;
    if (payload.nominee !== undefined) {
      beforeChanges.nominee = loan.nominee;
      afterChanges.nominee = payload.nominee;
      effectiveNominee = payload.nominee;
    }

    // Guarantor
    let effectiveGuarantor = loan.guarantor;
    if (payload.guarantor !== undefined) {
      beforeChanges.guarantor = loan.guarantor;
      afterChanges.guarantor = payload.guarantor;
      effectiveGuarantor = payload.guarantor;
    }

    const updatedLoanData: Partial<Loan> = {
      principal: effectivePrincipal,
      interestRate: effectiveInterestRate,
      date: effectiveDate,
      items: calc.normalizedItems,
      totalGrossWeight: calc.totalGrossWeight,
      totalDeductionWeight: calc.totalDeductionWeight,
      totalNetWeight: calc.totalNetWeight,
      marketValue: calc.marketValue,
      ltv: calc.ltv,
      monthlyInterest: calc.monthlyInterest,
      outstandingPrincipal: effectiveOutstanding,
      accruedInterest: calc.monthlyInterest,
      status: effectiveStatus,
      nextDueDate: effectiveNextDueDate,
      notes: effectiveNotes,
      nominee: effectiveNominee,
      guarantor: effectiveGuarantor,
      updatedAt: new Date().toISOString()
    };

    // Optimistic Concurrency Protection: pass expectedVersion if supplied
    const updateOptions: any = { actor };
    if (typeof payload.version === 'number') {
      updateOptions.expectedVersion = payload.version;
    }

    const updatedEnvelope = await firestoreRepository.updateRecord<Loan>(
      'LOAN',
      loan.id,
      updatedLoanData,
      updateOptions
    );

    // Update customer totalBorrowed and activeLoansCount if financial/status changed
    const customer = customerService.getById(loan.customerId);
    if (customer) {
      const customerUpdates: Partial<any> = {};
      if (principalChanged) {
        const principalDiff = new Decimal(effectivePrincipal).minus(loan.principal).toNumber();
        customerUpdates.totalBorrowed = new Decimal(customer.totalBorrowed || 0).plus(principalDiff).toNumber();
      }
      if (beforeChanges.status) {
        if (beforeChanges.status === 'ACTIVE' && effectiveStatus === 'CLOSED') {
          customerUpdates.activeLoansCount = Math.max(0, (customer.activeLoansCount || 1) - 1);
        } else if (beforeChanges.status === 'CLOSED' && effectiveStatus === 'ACTIVE') {
          customerUpdates.activeLoansCount = (customer.activeLoansCount || 0) + 1;
        }
      }
      if (Object.keys(customerUpdates).length > 0) {
        await customerService.update(customer.id, customerUpdates);
      }
    }

    // Record audit entry
    await StaffAuditModel.create({
      staffId: actor?.uid || actor?.name || 'ADMIN',
      staffUid: actor?.uid || 'ADMIN',
      staffEmail: actor?.email || '',
      action: 'LOAN_EDIT',
      performedBy: actor?.uid || actor?.name || 'ADMIN',
      actorEmail: actor?.email || '',
      description: `Loan ${loan.loanNo} updated by Admin: ${reason}`,
      details: {
        loanId: loan.id,
        loanNo: loan.loanNo,
        customerId: loan.customerId,
        customerName: loan.customerName,
        reason,
        changes: {
          before: beforeChanges,
          after: afterChanges
        }
      },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
      timestamp: new Date()
    });

    return updatedEnvelope.data;
  }

  public async deleteAsync(id: string): Promise<boolean> {
    const loan = this.getById(id);
    if (!loan) return false;

    const res = await firestoreRepository.deleteRecord('LOAN', loan.id, false);
    return res.success;
  }

  public delete(id: string): boolean {
    const loan = this.getById(id);
    if (!loan) return false;

    firestoreRepository.deleteRecord('LOAN', loan.id, false).catch(() => {});
    return true;
  }

  /**
   * Admin-Only Loan Delete / Cancellation with financial safety checks, soft delete, customer metrics sync, and audit logging.
   */
  public async adminDeleteLoanAsync(
    id: string,
    reason: string,
    actor?: { uid?: string; email?: string; role?: string; name?: string },
    meta?: { ipAddress?: string; userAgent?: string }
  ): Promise<{ success: boolean; message: string }> {
    const loan = this.getById(id);
    if (!loan) {
      const err: any = new Error(`Loan with ID "${id}" not found.`);
      err.statusCode = 404;
      err.code = 'NOT_FOUND';
      throw err;
    }

    const cleanReason = (reason || '').trim();
    if (!cleanReason) {
      const err: any = new Error('A deletion or cancellation reason is required for administrative audit logging.');
      err.statusCode = 400;
      err.code = 'REASON_REQUIRED';
      throw err;
    }

    // Financial Safety & Archival: Check if loan has any repayment receipts recorded
    const allReceipts = await receiptService.getAllAsync();
    const loanReceipts = allReceipts.filter((r) => r.loanId === loan.id || r.loanNo === loan.loanNo);
    const repaymentReceipts = loanReceipts.filter((r) => r.kind !== 'LOAN DISBURSEMENT' && r.kind !== 'NEW LOAN');
    const totalRepaid = repaymentReceipts.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    const hasRepayments = repaymentReceipts.length > 0;

    const noteAnnotation = hasRepayments
      ? `[ADMIN REMOVED/ARCHIVED: ${cleanReason} | Retained ${repaymentReceipts.length} historical repayment receipt(s) totaling ₹${totalRepaid.toLocaleString('en-IN')}]`
      : `[CANCELLED/DELETED: ${cleanReason}]`;
    const updatedNotes = loan.notes ? `${loan.notes}\n${noteAnnotation}` : noteAnnotation;

    // Update status to CLOSED and note cancellation reason before soft delete
    await firestoreRepository.updateRecord<Loan>(
      'LOAN',
      loan.id,
      {
        status: 'CLOSED',
        outstandingPrincipal: 0,
        notes: updatedNotes,
        updatedAt: new Date().toISOString()
      },
      { actor }
    );

    // Soft-delete the loan record (excludes from active loan management, preserves auditability)
    const deleteRes = await firestoreRepository.deleteRecord('LOAN', loan.id, false, actor);
    if (!deleteRes.success) {
      throw new Error(deleteRes.message || 'Failed to soft delete loan record');
    }

    // Update Customer activeLoansCount and totalBorrowed
    const customer = customerService.getById(loan.customerId);
    if (customer) {
      const wasActive = loan.status === 'ACTIVE' || loan.status === 'OVERDUE' || loan.status === 'PENDING';
      const newActiveCount = wasActive ? Math.max(0, (customer.activeLoansCount || 1) - 1) : (customer.activeLoansCount || 0);
      const newTotalBorrowed = Math.max(0, new Decimal(customer.totalBorrowed || 0).minus(loan.principal || 0).toNumber());
      await customerService.update(customer.id, {
        activeLoansCount: newActiveCount,
        totalBorrowed: newTotalBorrowed
      });
    }

    // Record audit entry
    await StaffAuditModel.create({
      staffId: actor?.uid || actor?.name || 'ADMIN',
      staffUid: actor?.uid || 'ADMIN',
      staffEmail: actor?.email || '',
      action: 'LOAN_DELETE',
      performedBy: actor?.uid || actor?.name || 'ADMIN',
      actorEmail: actor?.email || '',
      description: hasRepayments
        ? `Loan ${loan.loanNo} removed/archived by Admin: ${cleanReason} (${repaymentReceipts.length} historical receipts totaling ₹${totalRepaid.toLocaleString('en-IN')} preserved)`
        : `Loan ${loan.loanNo} deleted/cancelled by Admin: ${cleanReason}`,
      details: {
        loanId: loan.id,
        loanNo: loan.loanNo,
        customerId: loan.customerId,
        customerName: loan.customerName,
        principal: loan.principal,
        reason: cleanReason,
        historicalReceiptsCount: repaymentReceipts.length,
        totalRepaidPreserved: totalRepaid,
        receiptsPreserved: hasRepayments,
        deletedAt: new Date().toISOString()
      },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
      timestamp: new Date()
    });

    return {
      success: true,
      message: hasRepayments
        ? `Loan ${loan.loanNo} removed from active management. ${repaymentReceipts.length} historical receipt record(s) safely preserved.`
        : `Loan ${loan.loanNo} successfully deleted and cancelled.`
    };
  }

  public async getPendingLoansAsync(customerId?: string, asOfDateStr?: string): Promise<{ loan: Loan; metrics: any }[]> {
    const allLoans = await this.getAllAsync();
    const allReceipts = await receiptService.getAllAsync();

    const asOfDate = asOfDateStr ? parseLoanDate(asOfDateStr) : new Date();
    const todayMidnight = new Date(asOfDate.getFullYear(), asOfDate.getMonth(), asOfDate.getDate());

    const result: { loan: Loan; metrics: any }[] = [];

    for (const loan of allLoans) {
      if (loan.isDeleted || loan.status === 'CLOSED') continue;
      const outstanding = Number(loan.outstandingPrincipal ?? loan.principal ?? 0);
      if (outstanding <= 0) continue;

      if (customerId) {
        const cId = (loan.customerId || '').trim().toLowerCase();
        const targetId = customerId.trim().toLowerCase();
        if (cId !== targetId && (loan as any).id !== targetId) continue;
      }

      let rawDueDate = loan.nextDueDate;
      if (!rawDueDate) {
        rawDueDate = calculateAuthoritativeNextDueDate(
          loan.date || (loan as any).issueDate,
          loan.deductAdvanceInterest,
          loan.advanceDays ?? (loan as any).advanceInterestDays ?? 0
        );
      }
      const dueDate = parseLoanDate(rawDueDate);
      const dueDateMidnight = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());

      const monthlyRate = Number(loan.interestRate ?? 0) / 100;
      const monthlyInterest = Math.round(outstanding * monthlyRate);
      const scheduledDue = monthlyInterest > 0 ? monthlyInterest : 0;

      const loanReceipts = allReceipts.filter(
        (r) =>
          (r.loanNo === loan.loanNo || r.loanId === loan.id || r.loanId === loan.loanNo) &&
          (r.kind === 'INTEREST PAYMENT' ||
            (r.kind as string) === 'INTEREST + PRINCIPAL' ||
            r.kind === 'PART PAYMENT' ||
            r.kind === 'REPAYMENT' ||
            r.kind === 'LOAN CLOSURE')
      );

      const relevantReceipts = loanReceipts.filter((r) => {
        if (!r.date) return false;
        const rDate = parseLoanDate(r.date);
        const rDateMidnight = new Date(rDate.getFullYear(), rDate.getMonth(), rDate.getDate());

        if (loan.lastInterestPaidDate) {
          const lastPaid = parseLoanDate(loan.lastInterestPaidDate);
          const lastPaidMidnight = new Date(lastPaid.getFullYear(), lastPaid.getMonth(), lastPaid.getDate());
          if (rDateMidnight <= lastPaidMidnight) return false;
        }

        if (r.currentDueDate) {
          const rDueDate = parseLoanDate(r.currentDueDate);
          return (
            rDueDate.getFullYear() === dueDate.getFullYear() &&
            rDueDate.getMonth() === dueDate.getMonth() &&
            rDueDate.getDate() === dueDate.getDate()
          );
        }

        return true;
      });

      const periodPaidAmount = relevantReceipts.reduce((sum, r) => {
        const intComp = Number(r.interestComponent ?? 0);
        const amt = Number(r.amount ?? 0);
        return sum + (intComp > 0 ? intComp : amt > 0 && r.kind === 'INTEREST PAYMENT' ? amt : 0);
      }, 0);

      const remainingDue = Math.max(0, scheduledDue - periodPaidAmount);
      const isDue = todayMidnight.getTime() >= dueDateMidnight.getTime();
      const isPending = isDue && remainingDue > 0;

      if (isPending) {
        const diffDays = Math.max(0, Math.floor((todayMidnight.getTime() - dueDateMidnight.getTime()) / (1000 * 60 * 60 * 24)));
        const statusText = diffDays > 0 ? 'OVERDUE' : periodPaidAmount > 0 ? 'PARTIALLY PAID' : 'DUE TODAY';
        result.push({
          loan,
          metrics: {
            dueDate: formatLoanDate(dueDate),
            scheduledDue,
            paidAmount: periodPaidAmount,
            remainingDue,
            daysOverdue: diffDays,
            statusText
          }
        });
      }
    }

    return result;
  }
}

export const loanService = new LoanService();
export default loanService;
