import { firestoreRepository } from '../repositories/firestore.repository.js';
import { Loan } from '../types/index.js';

interface CounterData {
  customerId: number;
  loanSequence: number;
  loanNo: number;
  receiptNo: number;
  fdNo: number;
  [key: string]: number;
}

const COUNTER_RECORD_ID = 'APP_COUNTERS';

export class CounterService {
  private getCounters(): CounterData {
    const envelope = firestoreRepository.getRecordById<CounterData>('COUNTER', COUNTER_RECORD_ID, true);
    if (envelope && envelope.data) {
      return envelope.data;
    }
    return {
      customerId: 0,
      loanSequence: 0,
      loanNo: 0,
      receiptNo: 0,
      fdNo: 0
    };
  }

  private async saveCounters(counters: CounterData): Promise<void> {
    const existing = firestoreRepository.getRecordById<CounterData>('COUNTER', COUNTER_RECORD_ID, true);
    if (existing) {
      await firestoreRepository.updateRecord('COUNTER', COUNTER_RECORD_ID, counters);
    } else {
      await firestoreRepository.createRecord('COUNTER', COUNTER_RECORD_ID, counters);
    }
  }

  /**
   * Scans existing loans in Cloud Firestore storage to find the highest existing numeric sequence.
   */
  public getHighestExistingLoanNumber(): number {
    try {
      const loans = firestoreRepository.getRecords<Loan>('LOAN', { includeDeleted: false });
      let maxSeq = 0;
      if (Array.isArray(loans)) {
        for (const l of loans) {
          const loanStr = String(l.loanNo || l.id || '');
          const match = loanStr.match(/(\d+)$/);
          if (match) {
            const num = parseInt(match[1], 10);
            if (num > maxSeq) maxSeq = num;
          }
        }
      }
      return maxSeq;
    } catch {
      return 0;
    }
  }

  /**
   * Scans existing customers to find highest ID sequence number
   */
  public getHighestExistingCustomerNumber(): number {
    try {
      const custs = firestoreRepository.getRecords<any>('CUSTOMER', { includeDeleted: false });
      let maxSeq = 0;
      for (const c of custs) {
        if (typeof c.numericId === 'number' && c.numericId > maxSeq) {
          maxSeq = c.numericId;
        }
        if (typeof c.customerId === 'number' && c.customerId > maxSeq) {
          maxSeq = c.customerId;
        }
        const idStr = String(c.customerId || c.id || '');
        const match = idStr.match(/(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxSeq) maxSeq = num;
        }
      }
      return maxSeq;
    } catch {
      return 0;
    }
  }

  /**
   * Scans existing receipts to find highest receipt number
   */
  public getHighestExistingReceiptNumber(): number {
    try {
      const receipts = firestoreRepository.getRecords<any>('RECEIPT', { includeDeleted: false });
      let maxSeq = 0;
      for (const r of receipts) {
        if (typeof r.receiptNo === 'number' && r.receiptNo > maxSeq) {
          maxSeq = r.receiptNo;
        }
        const rStr = String(r.receiptNo || r.id || '');
        const match = rStr.match(/(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxSeq) maxSeq = num;
        }
      }
      return maxSeq;
    } catch {
      return 0;
    }
  }

  /**
   * Scans existing Fixed Deposits to find highest FD receipt number
   */
  public getHighestExistingFdReceiptNumber(): number {
    try {
      const fds = firestoreRepository.getRecords<any>('FIXED_DEPOSIT', { includeDeleted: false });
      let maxSeq = 0;
      for (const fd of fds) {
        const rStr = String(fd.receiptNumber || fd.receiptNo || '');
        const match = rStr.match(/(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxSeq) maxSeq = num;
        }
      }
      return maxSeq;
    } catch {
      return 0;
    }
  }

  /**
   * Scans existing Fixed Deposit interest payouts to find highest voucher number
   */
  public getHighestExistingFdInterestVoucherNumber(): number {
    try {
      const payouts = firestoreRepository.getRecords<any>('FD_INTEREST_PAYOUT', { includeDeleted: false });
      let maxSeq = 0;
      for (const p of payouts) {
        const vStr = String(p.voucherNumber || p.voucherNo || p.receiptNo || '');
        const match = vStr.match(/(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxSeq) maxSeq = num;
        }
      }
      return maxSeq;
    } catch {
      return 0;
    }
  }

  /**
   * Sequence Generator with automatic high-water-mark detection across existing records
   */
  public async getNextSequence(name: string): Promise<number> {
    const counters = this.getCounters();
    let current = counters[name] || 0;

    if (name === 'customerId' || name === 'customer') {
      const highest = this.getHighestExistingCustomerNumber();
      current = Math.max(current, highest);
    } else if (name === 'receiptNo' || name === 'receipt') {
      const highest = this.getHighestExistingReceiptNumber();
      current = Math.max(current, highest);
    } else if (name === 'fdReceiptNo' || name === 'fdReceipt') {
      const highest = this.getHighestExistingFdReceiptNumber();
      current = Math.max(current, highest);
    } else if (name === 'fdInterestVoucherNo' || name === 'fdInterestVoucher' || name === 'intRcpt') {
      const highest = this.getHighestExistingFdInterestVoucherNumber();
      current = Math.max(current, highest);
    }

    const nextVal = current + 1;
    counters[name] = nextVal;
    if (name === 'receiptNo') counters.receipt = nextVal;
    if (name === 'customerId') counters.customer = nextVal;
    if (name === 'fdReceiptNo') counters.fdReceipt = nextVal;
    if (name === 'fdInterestVoucherNo') counters.fdInterestVoucher = nextVal;

    await this.saveCounters(counters);
    return nextVal;
  }

  /**
   * Authoritative Unified Next Loan Sequence Generator
   */
  public async getNextLoanSequence(): Promise<number> {
    const maxExisting = this.getHighestExistingLoanNumber();
    const counters = this.getCounters();
    const currentCounter = counters.loanSequence || counters.loanNo || 0;
    const baseSeq = Math.max(maxExisting, currentCounter);

    const nextVal = baseSeq + 1;
    counters.loanSequence = nextVal;
    counters.loanNo = nextVal;

    await this.saveCounters(counters);
    return nextVal;
  }

  public async peekNextLoanSequence(): Promise<number> {
    const maxExisting = this.getHighestExistingLoanNumber();
    const counters = this.getCounters();
    const currentCounter = counters.loanSequence || counters.loanNo || 0;
    return Math.max(maxExisting, currentCounter) + 1;
  }

  public async getNextLoanNo(): Promise<string> {
    const seq = await this.getNextLoanSequence();
    return `GL-${seq}`;
  }

  public async getNextCustomerId(): Promise<string> {
    const seq = await this.getNextSequence('customerId');
    return `CUST-${String(seq).padStart(3, '0')}`;
  }

  public async getNextReceiptNo(): Promise<number> {
    return await this.getNextSequence('receiptNo');
  }

  public async getNextFdNo(): Promise<string> {
    const seq = await this.getNextSequence('fdNo');
    return `FD-${String(seq).padStart(4, '0')}`;
  }

  public async getNextFdReceiptNo(): Promise<string> {
    const seq = await this.getNextSequence('fdReceiptNo');
    return `FD-RCPT-${String(seq).padStart(4, '0')}`;
  }

  public async getNextFdInterestVoucherNo(): Promise<string> {
    const seq = await this.getNextSequence('fdInterestVoucherNo');
    return `INT-RCPT-${String(seq).padStart(4, '0')}`;
  }

  public async setSequenceIfHigher(name: string, value: number): Promise<void> {
    const counters = this.getCounters();
    if ((counters[name] || 0) < value) {
      counters[name] = value;
      if (name === 'receipt') counters.receiptNo = value;
      if (name === 'receiptNo') counters.receipt = value;
      if (name === 'customer') counters.customerId = value;
      if (name === 'customerId') counters.customer = value;
      if (name === 'loan' || name === 'loanNo') counters.loanSequence = value;
      await this.saveCounters(counters);
    }
  }

  public async resetAllSequences(): Promise<void> {
    const counters: CounterData = {
      customerId: 0,
      loanSequence: 0,
      loanNo: 0,
      receiptNo: 0,
      fdNo: 0
    };
    await this.saveCounters(counters);
  }
}

export const counterService = new CounterService();
export default counterService;
