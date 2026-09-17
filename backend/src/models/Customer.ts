import { CustomerLocation, NomineeDetails, GuarantorDetails } from '../types/index.js';
import { telegramRepository } from '../telegram/telegram.repository.js';

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
  telegramFileId?: string;
  telegramMessageId?: number;
  telegramChatId?: string;
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
  telegramFileId?: string;
  telegramMessageId?: number;
  telegramChatId?: string;
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
    const includeDeleted = query.isDeleted ? query.isDeleted.$ne !== true : false;
    let records = telegramRepository.getRecords<ICustomer>('CUSTOMER', { includeDeleted });

    if (query.customerId) {
      records = records.filter((c) => c.customerId === query.customerId);
    }
    if (query.phoneNumber || query.phone) {
      const p = query.phoneNumber || query.phone;
      records = records.filter((c) => c.phoneNumber === p || c.phone === p);
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
    const includeDeleted = query.isDeleted ? query.isDeleted.$ne !== true : false;
    const records = telegramRepository.getRecords<ICustomer>('CUSTOMER', { includeDeleted });

    let match: ICustomer | null = null;
    if (query.customerId) {
      match = records.find((c) => c.customerId === query.customerId || c.id === query.customerId) || null;
    } else if (query.id) {
      match = records.find((c) => c.id === query.id || c.customerId === query.id) || null;
    } else if (query.phoneNumber || query.phone) {
      const p = query.phoneNumber || query.phone;
      match = records.find((c) => c.phoneNumber === p || c.phone === p) || null;
    } else if (query.$or && Array.isArray(query.$or)) {
      match =
        records.find((c) =>
          query.$or.some((clause: any) => {
            if (clause.customerId && (c.customerId === clause.customerId || c.id === clause.customerId)) return true;
            if (clause.id && (c.id === clause.id || c.customerId === clause.id)) return true;
            if (clause.phoneNumber && (c.phoneNumber === clause.phoneNumber || c.phone === clause.phoneNumber)) return true;

            for (const key of Object.keys(clause)) {
              const val = clause[key];
              if (!val) continue;

              if (
                key === 'customerPhotoData.fileId' ||
                key === 'customerPhotoData.telegramFileId' ||
                key === 'customerPhoto.fileId' ||
                key === 'customerPhoto.telegramFileId' ||
                key === 'customerPhoto'
              ) {
                const photoObj = (typeof c.customerPhoto === 'object' && c.customerPhoto !== null) ? c.customerPhoto : c.customerPhotoData;
                if (
                  photoObj?.fileId === val ||
                  photoObj?.telegramFileId === val ||
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
                key === 'kycDocuments.telegramFileId' ||
                key === 'kycDocuments.fileId' ||
                key === 'kycDocuments.id'
              ) {
                if (Array.isArray(c.kycDocuments)) {
                  const docMatch = c.kycDocuments.some(
                    (d: any) =>
                      d.documentId === val ||
                      d.telegramFileId === val ||
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
      then: (resolve: any, reject?: any) => Promise.resolve(match).then(resolve, reject)
    };
    return chain;
  }

  public static async create(doc: any): Promise<any> {
    const id = doc.customerId || doc.id || `KKV-${Date.now()}`;
    const res = await telegramRepository.createRecord('CUSTOMER', id, { ...doc, id, customerId: id });
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
    const records = telegramRepository.getRecords<ICustomer>('CUSTOMER', { includeDeleted: false });
    if (!query || Object.keys(query).length === 0) return records.length;
    return records.filter(c => {
      for (const key of Object.keys(query)) {
        if ((c as any)[key] !== query[key]) return false;
      }
      return true;
    }).length;
  }

  public static async findByIdAndUpdate(id: string, update: any, _options: any = {}): Promise<any> {
    const records = telegramRepository.getRecords<ICustomer>('CUSTOMER', { includeDeleted: true });
    const existing = records.find((c) => c.id === id || c.customerId === id);
    if (!existing) return null;

    const updated = { ...existing, ...update, updatedAt: new Date().toISOString() };
    await telegramRepository.updateRecord('CUSTOMER', existing.customerId || existing.id, updated);
    return CustomerModel.wrap(updated);
  }

  public static async findOneAndUpdate(query: any, update: any, options: any = {}): Promise<any> {
    const found = await CustomerModel.findOne(query);
    if (!found) return null;
    return CustomerModel.findByIdAndUpdate(found.id || found.customerId, update, options);
  }

  public static async updateOne(query: any, update: any): Promise<any> {
    const found = await CustomerModel.findOne(query);
    if (!found) return { matchedCount: 0, modifiedCount: 0 };
    await CustomerModel.findByIdAndUpdate(found.id || found.customerId, update);
    return { matchedCount: 1, modifiedCount: 1 };
  }

  public static async deleteOne(query: any): Promise<any> {
    const id = query.customerId || query.id;
    if (id) {
      await telegramRepository.deleteRecord('CUSTOMER', id);
      return { deletedCount: 1 };
    }
    return { deletedCount: 0 };
  }

  public static async deleteMany(query: any = {}): Promise<any> {
    let records = telegramRepository.getRecords<ICustomer>('CUSTOMER', { includeDeleted: true });
    let count = 0;
    if (query.customerId) {
      records = records.filter((c) => c.customerId === query.customerId);
    }
    for (const r of records) {
      await telegramRepository.deleteRecord('CUSTOMER', r.customerId || r.id);
      count++;
    }
    return { deletedCount: count };
  }

  private static wrap(doc: any): any {
    if (!doc) return null;
    return {
      ...doc,
      save: async function () {
        return telegramRepository.updateRecord('CUSTOMER', this.customerId || this.id, this);
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
