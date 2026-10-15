import { CustomerLocation, NomineeDetails, GuarantorDetails } from '../types/index.js';
import { firestoreRepository } from '../repositories/firestore.repository.js';
import { localFileRepository } from '../repositories/localFile.repository.js';

export interface IAddressDetails {
  houseNo?: string;
  street?: string;
  landmark?: string;
  pincode: string;
  district: string;
  state: string;
  city?: string;
}

export interface ICustomerPhoto {
  url?: string;
  viewUrl?: string;
  downloadUrl?: string;
  fileId?: string;
  fileName?: string;
  originalFileName?: string;
  size?: number;
  fileSize?: number;
  mimeType?: string;
  storagePath?: string;
  uploadedAt?: string;
  publicId?: string;
  resourceType?: string;
  uploadedBy?: string;
}

export interface IKYCDocument {
  id?: string;
  docType?: string;
  docNumber?: string;
  documentType?: string;
  documentNumber?: string;
  documentName?: string;
  fileId?: string;
  fileName?: string;
  originalFileName?: string;
  url?: string;
  viewUrl?: string;
  downloadUrl?: string;
  mimeType?: string;
  fileSize?: number;
  size?: number;
  storagePath?: string;
  publicId?: string;
  resourceType?: string;
  frontPhotoUrl?: string;
  backPhotoUrl?: string;
  verified?: boolean;
  uploadedAt?: string;
  uploadedBy?: string;
}

export interface ICustomer {
  id: string;
  customerId: string;
  customerNo?: string;
  name: string;
  fullName?: string;
  mobile: string;
  phoneNumber?: string;
  phone?: string;
  phoneNormalized?: string;
  alternateNumber?: string;
  alternatePhone?: string;
  email?: string;
  dateOfBirth?: string;
  dob?: string;
  age?: number;
  gender: 'Male' | 'Female' | 'Other';
  occupation?: string;
  photoUrl?: string;
  photoBase64?: string;
  customerPhoto?: any;
  customerPhotoData?: ICustomerPhoto;
  branchId?: string;
  complexId?: string;

  // Primary Address
  address: string;
  currentAddress?: string;
  permanentAddress?: string;
  isSameAddress?: boolean;
  sameAsCurrentAddress?: boolean;
  location?: CustomerLocation;
  currentAddressDetails?: IAddressDetails;
  permanentAddressDetails?: IAddressDetails;

  // Relations
  fatherHusbandName?: string;
  relationship?: 'Father' | 'Husband' | 'Guardian';
  nominee?: NomineeDetails;
  guarantor?: GuarantorDetails;

  // Legacy nominee fields
  nomineeName?: string;
  nomineeRelation?: string;
  nomineePhone?: string;
  nomineeAadhaar?: string;
  nomineePan?: string;

  // Legacy guarantor fields
  guarantorName?: string;
  guarantorRelation?: string;
  guarantorPhone?: string;
  guarantorAadhaar?: string;
  guarantorPan?: string;

  // KYC
  idProofType?: string;
  idProof?: string;
  idProofNumber?: string;
  idNumber?: string;
  extraPan?: string;
  docName?: string;
  kycDocuments?: IKYCDocument[];

  // Metadata
  status: 'VERIFIED' | 'PENDING' | 'BLOCKED';
  joinedDate?: string;
  activeLoansCount: number;
  totalBorrowed: number;
  isDeleted: boolean;
  deletedAt?: Date | string | null;
  deletedBy?: string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export class CustomerModel {
  public static find(query: any = {}): any {
    let includeDeleted = false;
    if (query.includeDeleted !== undefined) {
      includeDeleted = Boolean(query.includeDeleted);
    } else if (query.isDeleted !== undefined) {
      if (typeof query.isDeleted === 'boolean') {
        includeDeleted = query.isDeleted;
      } else if (query.isDeleted && typeof query.isDeleted === 'object') {
        includeDeleted = query.isDeleted.$ne !== true;
      }
    }

    let records = firestoreRepository.getRecords<ICustomer>('CUSTOMER', { includeDeleted });

    if (query.customerId) {
      const q = String(query.customerId).toLowerCase().trim();
      records = records.filter((c) => String(c.customerId).toLowerCase() === q || String(c.id).toLowerCase() === q);
    }
    if (query.phoneNumber || query.phone || query.phoneNormalized) {
      const p = query.phoneNumber || query.phone || query.phoneNormalized;
      const targetPhone = String(p).replace(/\D/g, '').slice(-10);
      records = records.filter((c) => {
        const cPhone = (c.phoneNormalized || c.phoneNumber || c.phone || '').replace(/\D/g, '').slice(-10);
        return targetPhone && cPhone === targetPhone;
      });
    }
    if (query.$or && Array.isArray(query.$or)) {
      records = records.filter((c) =>
        query.$or.some((clause: any) => {
          for (const key of Object.keys(clause)) {
            const expected = clause[key];
            if (!expected) continue;

            const actualVal =
              (c as any)[key] ??
              (key === 'fullName' ? c.name : key === 'name' ? c.fullName : key === 'phone' ? c.phoneNumber : key === 'phoneNumber' ? c.phone : undefined);

            if (expected instanceof RegExp) {
              if (actualVal !== undefined && actualVal !== null && expected.test(String(actualVal))) return true;
            } else if (typeof expected === 'string') {
              if (actualVal !== undefined && actualVal !== null && String(actualVal).toLowerCase().includes(expected.toLowerCase())) return true;
            } else if (actualVal === expected) {
              return true;
            }
          }
          return false;
        })
      );
    }

    const chain = {
      sort: () => chain,
      select: () => chain,
      lean: async () => records,
      then: (resolve: any, reject?: any) => Promise.resolve(records).then(resolve, reject)
    };
    return chain;
  }

  public static findOne(query: any = {}): any {
    let includeDeleted = false;
    if (query.includeDeleted !== undefined) {
      includeDeleted = Boolean(query.includeDeleted);
    } else if (query.isDeleted !== undefined) {
      if (typeof query.isDeleted === 'boolean') {
        includeDeleted = query.isDeleted;
      } else if (query.isDeleted && typeof query.isDeleted === 'object') {
        includeDeleted = query.isDeleted.$ne !== true;
      }
    }

    const records = firestoreRepository.getRecords<ICustomer>('CUSTOMER', { includeDeleted });

    let match: ICustomer | null = null;
    if (query.customerId) {
      const q = String(query.customerId).toLowerCase().trim();
      match = records.find((c) => String(c.customerId).toLowerCase() === q || String(c.id).toLowerCase() === q) || null;
    } else if (query.id) {
      const q = String(query.id).toLowerCase().trim();
      match = records.find((c) => String(c.id).toLowerCase() === q || String(c.customerId).toLowerCase() === q) || null;
    } else if (query.phoneNumber || query.phone || query.phoneNormalized) {
      const p = query.phoneNumber || query.phone || query.phoneNormalized;
      const targetPhone = String(p).replace(/\D/g, '').slice(-10);
      match = records.find((c) => {
        const cPhone = (c.phoneNormalized || c.phoneNumber || c.phone || '').replace(/\D/g, '').slice(-10);
        return targetPhone && cPhone === targetPhone;
      }) || null;
    } else if (query.$or && Array.isArray(query.$or)) {
      match =
        records.find((c) =>
          query.$or.some((clause: any) => {
            if (clause.customerId && (String(c.customerId).toLowerCase() === String(clause.customerId).toLowerCase() || String(c.id).toLowerCase() === String(clause.customerId).toLowerCase())) return true;
            if (clause.id && (String(c.id).toLowerCase() === String(clause.id).toLowerCase() || String(c.customerId).toLowerCase() === String(clause.id).toLowerCase())) return true;
            
            const phoneClause = clause.phoneNumber || clause.phone || clause.phoneNormalized;
            if (phoneClause) {
              const targetPhone = String(phoneClause).replace(/\D/g, '').slice(-10);
              const cPhone = (c.phoneNormalized || c.phoneNumber || c.phone || '').replace(/\D/g, '').slice(-10);
              if (targetPhone && cPhone && targetPhone === cPhone) return true;
            }

            for (const key of Object.keys(clause)) {
              const val = clause[key];
              if (!val) continue;

              if (
                key === 'customerPhotoData.fileId' ||
                key === 'customerPhotoData.storagePath' ||
                key === 'customerPhoto.fileId' ||
                key === 'customerPhoto.storagePath' ||
                key === 'customerPhoto'
              ) {
                const photoObj = (typeof c.customerPhoto === 'object' && c.customerPhoto !== null) ? c.customerPhoto : c.customerPhotoData;
                if (
                  photoObj?.fileId === val ||
                  photoObj?.storagePath === val ||
                  photoObj?.id === val ||
                  c.customerPhoto === val
                ) {
                  return true;
                }
              }

              if (
                key.startsWith('kycDocuments.') ||
                key === 'kycDocuments' ||
                key === 'kycDocuments.documentId' ||
                key === 'kycDocuments.storagePath' ||
                key === 'kycDocuments.fileId' ||
                key === 'kycDocuments.id'
              ) {
                if (Array.isArray(c.kycDocuments)) {
                  const docMatch = c.kycDocuments.some(
                    (d: any) =>
                      d.documentId === val ||
                      d.storagePath === val ||
                      d.fileId === val ||
                      d.id === val ||
                      d.fileName === val
                  );
                  if (docMatch) return true;
                }
              }
            }

            return false;
          })
        ) || null;
    }

    const chain = {
      select: () => chain,
      lean: async () => match,
      then: (resolve: any, reject?: any) => Promise.resolve(CustomerModel.wrap(match)).then(resolve, reject)
    };
    return chain;
  }

  public static async create(doc: any): Promise<any> {
    const id = doc.customerId || doc.id || `KKV-${Date.now()}`;
    const res = await firestoreRepository.createRecord('CUSTOMER', id, { ...doc, id, customerId: id });
    return CustomerModel.wrap(res);
  }

  public static async insertMany(docs: any[]): Promise<any[]> {
    const results = [];
    for (const doc of docs) {
      const inserted = await CustomerModel.create(doc);
      results.push(inserted);
    }
    return results;
  }

  public static async countDocuments(query: any = {}): Promise<number> {
    const records = firestoreRepository.getRecords<ICustomer>('CUSTOMER', { includeDeleted: false });
    if (!query || Object.keys(query).length === 0) return records.length;
    return records.filter(c => {
      for (const key of Object.keys(query)) {
        if ((c as any)[key] !== query[key]) return false;
      }
      return true;
    }).length;
  }

  public static async findByIdAndUpdate(id: string, update: any, _options: any = {}): Promise<any> {
    const records = firestoreRepository.getRecords<ICustomer>('CUSTOMER', { includeDeleted: true });
    const idLower = String(id).toLowerCase().trim();
    const existing = records.find((c) => String(c.id || '').toLowerCase().trim() === idLower || String(c.customerId || '').toLowerCase().trim() === idLower);
    if (!existing) return null;

    const updated = { ...existing, ...update, updatedAt: new Date().toISOString() };
    await firestoreRepository.updateRecord('CUSTOMER', existing.customerId || existing.id, updated);
    return CustomerModel.wrap(updated);
  }

  public static async findOneAndUpdate(query: any, update: any, options: any = {}): Promise<any> {
    const found = await CustomerModel.findOne({ ...query, includeDeleted: true });
    if (!found) return null;
    return CustomerModel.findByIdAndUpdate(found.id || found.customerId, update, options);
  }

  public static async updateOne(query: any, update: any): Promise<any> {
    const found = await CustomerModel.findOne({ ...query, includeDeleted: true });
    if (!found) return { matchedCount: 0, modifiedCount: 0 };
    await CustomerModel.findByIdAndUpdate(found.id || found.customerId, update);
    return { matchedCount: 1, modifiedCount: 1 };
  }

  public static async deleteOne(query: any, hardDelete: boolean = false): Promise<any> {
    const found = await CustomerModel.findOne({ ...query, includeDeleted: true });
    if (!found) {
      const fallbackId = query.customerId || query.id;
      if (fallbackId) {
        await firestoreRepository.deleteRecord('CUSTOMER', fallbackId, hardDelete);
        return { deletedCount: 1 };
      }
      return { deletedCount: 0 };
    }

    const id = found.id || found.customerId;
    await firestoreRepository.deleteRecord('CUSTOMER', id, hardDelete);
    if (found.customerId && found.customerId !== id) {
      await firestoreRepository.deleteRecord('CUSTOMER', found.customerId, hardDelete);
    }
    return { deletedCount: 1, customer: found };
  }

  public static async deleteMany(query: any = {}): Promise<any> {
    let records = firestoreRepository.getRecords<ICustomer>('CUSTOMER', { includeDeleted: true });
    let count = 0;
    if (query.customerId) {
      records = records.filter((c) => c.customerId === query.customerId);
    }
    for (const r of records) {
      await firestoreRepository.deleteRecord('CUSTOMER', r.customerId || r.id, true);
      count++;
    }
    return { deletedCount: count };
  }

  /**
   * Permanently and irreversibly deletes a customer and all customer-specific linked records:
   * Loans, Receipts, FDs, Payouts, Withdrawals, Renewals, File Attachments, and Reminders.
   */
  public static async deletePermanently(targetId: string): Promise<{ success: boolean; deletedCount: number; message: string }> {
    if (!targetId) {
      return { success: false, deletedCount: 0, message: 'Customer ID is required.' };
    }

    const targetNumeric = parseInt(String(targetId).replace(/\D/g, ''), 10);
    const targetLower = String(targetId).toLowerCase().trim();
    const targetDigits = String(targetId).replace(/\D/g, '');

    const allRecords = firestoreRepository.getRecords<ICustomer>('CUSTOMER', { includeDeleted: true });
    const customer = allRecords.find((c) => {
      const cIdLower = String(c.id || '').toLowerCase().trim();
      const cCustIdLower = String(c.customerId || '').toLowerCase().trim();
      if (cIdLower === targetLower || cCustIdLower === targetLower) return true;
      if (!isNaN(targetNumeric) && targetNumeric > 0) {
        if (Number(c.customerId) === targetNumeric) return true;
        const cNum = parseInt(cIdLower.replace(/\D/g, ''), 10);
        if (cNum === targetNumeric) return true;
      }
      const cPhone = (c.phoneNormalized || c.phoneNumber || c.phone || '').replace(/\D/g, '').slice(-10);
      if (targetDigits.length >= 10 && cPhone === targetDigits.slice(-10)) return true;
      return false;
    });

    if (!customer) {
      return { success: false, deletedCount: 0, message: `Customer "${targetId}" not found in storage.` };
    }

    const canonicalId = customer.id || customer.customerId;
    const allIdStrings = new Set<string>();
    if (customer.id) allIdStrings.add(String(customer.id));
    if (customer.customerId) allIdStrings.add(String(customer.customerId));
    if (customer.customerNo) allIdStrings.add(String(customer.customerNo));
    allIdStrings.add(String(targetId));
    if (!isNaN(targetNumeric) && targetNumeric > 0) {
      allIdStrings.add(String(targetNumeric));
      allIdStrings.add(`CUST-${targetNumeric.toString().padStart(4, '0')}`);
      allIdStrings.add(`CUST-${targetNumeric.toString().padStart(3, '0')}`);
    }

    const normPhone = (customer.phoneNormalized || customer.phoneNumber || customer.phone || '').replace(/\D/g, '').slice(-10);

    // 1. Delete Customer files and FILE_ATTACHMENT envelopes
    try {
      const allFiles = firestoreRepository.getRecords<any>('FILE_ATTACHMENT', { includeDeleted: true });
      for (const f of allFiles) {
        if (allIdStrings.has(String(f.entityId)) || allIdStrings.has(String(f.customerId))) {
          await firestoreRepository.deleteRecord('FILE_ATTACHMENT', f.fileId || f.id, true);
        }
      }
    } catch (cleanErr: any) {
      console.warn('[CustomerModel] Notice cleaning customer attachments:', cleanErr?.message || cleanErr);
    }

    // 2. Cascade delete gold loans belonging to this customer
    const deletedLoanNos = new Set<string>();
    const deletedLoanIds = new Set<string>();
    try {
      const allLoans = firestoreRepository.getRecords<any>('LOAN', { includeDeleted: true });
      for (const l of allLoans) {
        const matchesCust =
          allIdStrings.has(String(l.customerId)) ||
          allIdStrings.has(String(l.custId)) ||
          (normPhone && l.customerPhone && String(l.customerPhone).replace(/\D/g, '').slice(-10) === normPhone);

        if (matchesCust) {
          if (l.loanNo) deletedLoanNos.add(String(l.loanNo));
          if (l.id) deletedLoanIds.add(String(l.id));
          await firestoreRepository.deleteRecord('LOAN', l.id || l.loanNo, true);
          if (l.loanNo && l.loanNo !== l.id) {
            await firestoreRepository.deleteRecord('LOAN', l.loanNo, true);
          }
        }
      }
    } catch (loanErr: any) {
      console.warn('[CustomerModel] Notice cascade deleting loans:', loanErr?.message || loanErr);
    }

    // 3. Cascade delete receipts belonging to this customer or their deleted loans
    try {
      const allReceipts = firestoreRepository.getRecords<any>('RECEIPT', { includeDeleted: true });
      for (const r of allReceipts) {
        const matchesReceipt =
          allIdStrings.has(String(r.customerId)) ||
          (r.loanNo && deletedLoanNos.has(String(r.loanNo))) ||
          (r.loanId && deletedLoanIds.has(String(r.loanId)));

        if (matchesReceipt) {
          await firestoreRepository.deleteRecord('RECEIPT', r.id || `RCPT-${r.receiptNo}`, true);
          if (r.receiptNo) {
            await firestoreRepository.deleteRecord('RECEIPT', `RCPT-${r.receiptNo}`, true);
          }
        }
      }
    } catch (rcptErr: any) {
      console.warn('[CustomerModel] Notice cascade deleting receipts:', rcptErr?.message || rcptErr);
    }

    // 4. Cascade delete fixed deposits, interest payouts, withdrawals, renewals
    try {
      const allFDs = firestoreRepository.getRecords<any>('FIXED_DEPOSIT', { includeDeleted: true });
      const deletedFdNos = new Set<string>();
      for (const f of allFDs) {
        const matchesFD =
          allIdStrings.has(String(f.customerId)) ||
          (normPhone && f.phone && String(f.phone).replace(/\D/g, '').slice(-10) === normPhone);

        if (matchesFD) {
          if (f.fdNo) deletedFdNos.add(String(f.fdNo));
          await firestoreRepository.deleteRecord('FIXED_DEPOSIT', f.id || f.fdNo, true);
          if (f.fdNo && f.fdNo !== f.id) {
            await firestoreRepository.deleteRecord('FIXED_DEPOSIT', f.fdNo, true);
          }
        }
      }

      // FD Customers
      const allFDCusts = firestoreRepository.getRecords<any>('FD_CUSTOMER', { includeDeleted: true });
      for (const fdc of allFDCusts) {
        if (allIdStrings.has(String(fdc.customerId)) || allIdStrings.has(String(fdc.id))) {
          await firestoreRepository.deleteRecord('FD_CUSTOMER', fdc.id, true);
        }
      }

      // FD Interest Payouts
      const allPayouts = firestoreRepository.getRecords<any>('FD_INTEREST_PAYOUT', { includeDeleted: true });
      for (const p of allPayouts) {
        if (allIdStrings.has(String(p.customerId)) || (p.fdNo && deletedFdNos.has(String(p.fdNo)))) {
          await firestoreRepository.deleteRecord('FD_INTEREST_PAYOUT', p.id, true);
        }
      }

      // FD Withdrawals
      const allWithdrawals = firestoreRepository.getRecords<any>('FD_WITHDRAWAL', { includeDeleted: true });
      for (const w of allWithdrawals) {
        if (allIdStrings.has(String(w.customerId)) || (w.fdNo && deletedFdNos.has(String(w.fdNo)))) {
          await firestoreRepository.deleteRecord('FD_WITHDRAWAL', w.id, true);
        }
      }

      // FD Renewals
      const allRenewals = firestoreRepository.getRecords<any>('FD_RENEWAL', { includeDeleted: true });
      for (const ren of allRenewals) {
        if (allIdStrings.has(String(ren.customerId)) || (ren.fdNo && deletedFdNos.has(String(ren.fdNo)))) {
          await firestoreRepository.deleteRecord('FD_RENEWAL', ren.id, true);
        }
      }
    } catch (fdErr: any) {
      console.warn('[CustomerModel] Notice cascade deleting fixed deposits:', fdErr?.message || fdErr);
    }

    // 5. Clean up Reminders for this customer
    try {
      const reminders = localFileRepository.readJson<any[]>('reminders.json', []);
      const filteredReminders = reminders.filter((rem) => {
        if (rem.customerName && customer.name && rem.customerName.toLowerCase() === customer.name.toLowerCase()) return false;
        if (normPhone && rem.phone && rem.phone.replace(/\D/g, '').slice(-10) === normPhone) return false;
        if (rem.loanNo && deletedLoanNos.has(String(rem.loanNo))) return false;
        return true;
      });
      if (filteredReminders.length !== reminders.length) {
        localFileRepository.writeJson('reminders.json', filteredReminders);
      }
    } catch (remErr: any) {
      console.warn('[CustomerModel] Notice cleaning reminders:', remErr?.message || remErr);
    }

    // 6. Permanently delete the Customer record itself
    for (const idStr of allIdStrings) {
      await firestoreRepository.deleteRecord('CUSTOMER', idStr, true);
    }
    if (canonicalId && !allIdStrings.has(String(canonicalId))) {
      await firestoreRepository.deleteRecord('CUSTOMER', String(canonicalId), true);
    }

    // Force flush all updated entity collections and index to disk immediately
    firestoreRepository.flushToDisk();

    return {
      success: true,
      deletedCount: 1,
      message: `Customer ${customer.name || customer.fullName || targetId} (${canonicalId}) and all associated records permanently deleted.`
    };
  }

  private static wrap(doc: any): any {
    if (!doc) return null;
    return {
      ...doc,
      save: async function () {
        return firestoreRepository.updateRecord('CUSTOMER', this.customerId || this.id, this);
      },
      toJSON: function () {
        const copy = { ...this };
        delete copy.save;
        delete copy.toJSON;
        return copy;
      }
    };
  }
}

export default CustomerModel;
