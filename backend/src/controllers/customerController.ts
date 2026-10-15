import { Request, Response } from 'express';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { CustomerModel, ICustomer, IKYCDocument, ICustomerPhoto } from '../models/Customer.js';
import { FileAttachmentModel } from '../models/FileAttachment.js';
import { storageService } from '../services/storage.service.js';
import { generateCustomerId } from '../utils/customerIdGenerator.js';
import { isStorageConnected } from '../config/database.js';

export interface CreateCustomerRequest {
  fullName: string;
  gender: 'Male' | 'Female' | 'Other';
  phoneNumber: string;
  email?: string;
  occupation?: string;
  age?: number;
  dateOfBirth?: string;
  address?: string;
  city?: string;
  district?: string;
  state?: string;
  pincode?: string;
  currentAddress?: string;
  permanentAddress?: string;
  idProofType?: string;
  idProofNumber?: string;
  extraPan?: string;
  docName?: string;
  customerPhoto?: string;
  status?: 'VERIFIED' | 'PENDING' | 'BLOCKED';
}

/**
 * Validates Indian 10-digit mobile number
 */
function isValidIndianPhone(phone: string): boolean {
  if (!phone) return false;
  const digits = phone.replace(/\D/g, '');
  return digits.length === 10 && /^[6-9]\d{9}$/.test(digits);
}

/**
 * Normalizes phone number to 10 digits
 */
function normalizePhone(phone: string): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/**
 * Automatically calculates age from date of birth (YYYY-MM-DD or DD/MM/YYYY)
 */
function calculateAge(dobStr: string): number | undefined {
  if (!dobStr) return undefined;
  try {
    let birthDate: Date;
    if (dobStr.includes('/')) {
      const [d, m, y] = dobStr.split('/').map(Number);
      birthDate = new Date(y, m - 1, d);
    } else {
      birthDate = new Date(dobStr);
    }
    if (isNaN(birthDate.getTime())) return undefined;

    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age >= 0 ? age : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Helper to convert a base64 data URI to a Buffer
 */
function dataUriToBuffer(dataUri: string): { buffer: Buffer; mimeType: string } | null {
  try {
    const match = dataUri.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!match) return null;
    return {
      mimeType: match[1],
      buffer: Buffer.from(match[2], 'base64')
    };
  } catch {
    return null;
  }
}

/**
 * Helper to upload a buffer to Cloud Secure Storage and persist FileAttachment metadata
 */
async function uploadAndRecordCustomerFile(options: {
  buffer: Buffer;
  mimeType: string;
  originalName: string;
  customerId: string;
  documentType: string;
  uploadedBy?: string;
}): Promise<{
  fileId: string;
  storagePath?: string;
  url: string;
  viewUrl: string;
  downloadUrl: string;
  fileName: string;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: string;
}> {
  const { buffer, mimeType, originalName, customerId, documentType, uploadedBy } = options;

  const saved = await storageService.saveFile(buffer, {
    category: 'customer',
    originalName,
    mimeType
  });

  const fileId = `FILE_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const now = new Date().toISOString();

  await FileAttachmentModel.create({
    fileId,
    entityType: 'customer',
    entityId: customerId,
    documentType,
    originalFileName: originalName,
    storedFileName: saved.fileName,
    mimeType,
    fileSize: buffer.length,
    storagePath: saved.fileName,
    viewUrl: `/api/files/${fileId}/view`,
    downloadUrl: `/api/files/${fileId}/download`,
    uploadedBy: uploadedBy || 'STAFF',
    isDeleted: false
  });

  return {
    fileId,
    storagePath: saved.fileName,
    url: `/api/files/${fileId}/view`,
    viewUrl: `/api/files/${fileId}/view`,
    downloadUrl: `/api/files/${fileId}/download`,
    fileName: originalName,
    originalFileName: originalName,
    mimeType,
    fileSize: buffer.length,
    uploadedAt: now
  };
}

/**
 * POST /api/customers
 */
export const createCustomer = async (req: Request, res: Response) => {
  try {

    const body = req.body || {};
    const files = (req.files as { [fieldname: string]: Express.Multer.File[] }) || {};
    const uploadedBy = (req as any).user?.email || (req as any).user?.id || 'STAFF';

    // Extract and normalize fields
    const fullName = (body.fullName || body.name || '').trim();
    const rawPhoneNumber = (body.phoneNumber || body.phone || '').trim();
    const gender = body.gender || 'Male';
    const email = (body.email || '').trim().toLowerCase();
    const occupation = (body.occupation || 'Self Employed').trim();
    const dateOfBirth = (body.dateOfBirth || body.dob || '').trim();
    let age = body.age ? parseInt(body.age, 10) : undefined;

    if (dateOfBirth && !age) {
      age = calculateAge(dateOfBirth);
    }

    const address = (body.address || body.currentAddress || '').trim();
    const city = (body.city || '').trim();
    const district = (body.district || '').trim();
    const state = (body.state || 'Tamil Nadu').trim();
    const pincode = (body.pincode || '').trim();
    const currentAddress = (body.currentAddress || address).trim();
    const permanentAddress = (body.permanentAddress || currentAddress).trim();

    const idProofType = body.idProofType || body.idProof || 'Aadhaar';
    const idProofNumber = (body.idProofNumber || body.idNumber || '').trim();
    const extraPan = (body.extraPan || '').trim();
    const docName = (body.docName || '').trim();

    if (!fullName) {
      return res.status(400).json({ success: false, message: 'Full Name is required.' });
    }

    if (!rawPhoneNumber) {
      return res.status(400).json({ success: false, message: 'Phone Number is required.' });
    }

    const phoneNumber = normalizePhone(rawPhoneNumber);
    if (!isValidIndianPhone(phoneNumber)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid 10-digit Indian mobile number (e.g. 9876543210).'
      });
    }

    // Check duplicate phone number in storage among ACTIVE, non-deleted customers
    const normPhone = phoneNumber.replace(/\D/g, '').slice(-10);
    const existingInDb = await CustomerModel.findOne({
      isDeleted: false,
      includeDeleted: false,
      phoneNormalized: normPhone
    });

    if (existingInDb && !existingInDb.isDeleted) {
      return res.status(409).json({
        success: false,
        message: `This mobile number is already registered to active customer ${existingInDb.fullName || existingInDb.name} (${existingInDb.customerId || existingInDb.id}).`,
        error: 'DUPLICATE_PHONE_NUMBER'
      });
    }

    // Generate unique sequential Customer ID
    const { customerId, sequenceNumber } = await generateCustomerId('KKV-2026');

    // Customer Photo Upload (Google Drive)
    let customerPhotoData: ICustomerPhoto = {
      fileId: '',
      fileName: 'customer-photo.jpg',
      url: '',
      viewUrl: '',
      downloadUrl: '',
      mimeType: 'image/jpeg',
      fileSize: 0,
      uploadedAt: new Date().toISOString(),
      publicId: '',
      storagePath: '',
      uploadedBy
    };

    const photoFile = files['customerPhoto']?.[0];
    if (photoFile) {
      const uploaded = await uploadAndRecordCustomerFile({
        buffer: photoFile.buffer,
        mimeType: photoFile.mimetype || 'image/jpeg',
        originalName: photoFile.originalname || `customer-photo-${customerId}.jpg`,
        customerId,
        documentType: 'customer_photo',
        uploadedBy
      });
      customerPhotoData = {
        fileId: uploaded.fileId,
        fileName: uploaded.fileName,
        originalFileName: uploaded.originalFileName,
        url: uploaded.url,
        viewUrl: uploaded.viewUrl,
        downloadUrl: uploaded.downloadUrl,
        mimeType: photoFile.mimetype || 'image/jpeg',
        fileSize: uploaded.fileSize,
        size: uploaded.fileSize,
        uploadedAt: uploaded.uploadedAt,
        publicId: uploaded.fileId,
        storagePath: uploaded.fileName,
        uploadedBy
      };
    } else if (body.customerPhoto && typeof body.customerPhoto === 'string') {
      const parsed = dataUriToBuffer(body.customerPhoto);
      if (parsed) {
        const uploaded = await uploadAndRecordCustomerFile({
          buffer: parsed.buffer,
          mimeType: parsed.mimeType,
          originalName: `customer-photo-${customerId}.jpg`,
          customerId,
          documentType: 'customer_photo',
          uploadedBy
        });
        customerPhotoData = {
          fileId: uploaded.fileId,
          fileName: uploaded.fileName,
          originalFileName: uploaded.originalFileName,
          url: uploaded.url,
          viewUrl: uploaded.viewUrl,
          downloadUrl: uploaded.downloadUrl,
          mimeType: parsed.mimeType,
          fileSize: uploaded.fileSize,
          size: uploaded.fileSize,
          uploadedAt: uploaded.uploadedAt,
          publicId: uploaded.fileId,
          storagePath: uploaded.fileName,
          uploadedBy
        };
      } else {
        customerPhotoData = {
          fileId: `photo_${customerId}_${Date.now()}`,
          fileName: `customer-photo-${customerId}.jpg`,
          url: body.customerPhoto,
          viewUrl: body.customerPhoto,
          mimeType: 'image/jpeg',
          fileSize: 0,
          uploadedAt: new Date().toISOString(),
          publicId: `photo_${customerId}_${Date.now()}`,
          uploadedBy
        };
      }
    }

    // KYC Documents (Cloud Storage)
    const kycDocuments: IKYCDocument[] = [];
    const kycFiles = [
      ...(files['kycDocuments'] || []),
      ...(files['aadhaarDoc'] || []),
      ...(files['panDoc'] || []),
      ...(files['otherDoc'] || [])
    ];

    for (let i = 0; i < kycFiles.length; i++) {
      const file = kycFiles[i];
      const docType =
        file.fieldname === 'aadhaarDoc' ? 'Aadhaar' :
        file.fieldname === 'panDoc' ? 'PAN' :
        file.fieldname === 'otherDoc' ? (docName || 'Other') : idProofType;

      const isPdf = file.mimetype === 'application/pdf';
      const resourceType = isPdf ? 'raw' : 'image';

      const uploaded = await uploadAndRecordCustomerFile({
        buffer: file.buffer,
        mimeType: file.mimetype || (isPdf ? 'application/pdf' : 'image/jpeg'),
        originalName: file.originalname || `${docType.toLowerCase()}_${i + 1}${isPdf ? '.pdf' : '.jpg'}`,
        customerId,
        documentType: docType.toLowerCase().replace(/\s+/g, '_'),
        uploadedBy
      });

      kycDocuments.push({
        id: uploaded.fileId,
        documentType: docType,
        docType: docType,
        documentNumber: idProofNumber || '',
        docNumber: idProofNumber || '',
        documentName: file.originalname || `${docType} Document`,
        fileId: uploaded.fileId,
        fileName: uploaded.fileName,
        originalFileName: file.originalname,
        url: uploaded.url,
        viewUrl: uploaded.viewUrl,
        downloadUrl: uploaded.downloadUrl,
        mimeType: file.mimetype || (isPdf ? 'application/pdf' : 'image/jpeg'),
        fileSize: uploaded.fileSize,
        size: uploaded.fileSize,
        uploadedAt: uploaded.uploadedAt,
        publicId: uploaded.fileId,
        storagePath: uploaded.fileName,
        resourceType,
        uploadedBy
      });
    }

    const customerPayload = {
      customerId,
      numericId: sequenceNumber,
      fullName,
      name: fullName,
      gender,
      phoneNumber,
      phone: phoneNumber,
      phoneNormalized: phoneNumber,
      email,
      occupation,
      age: age || 30,
      dateOfBirth,
      customerPhoto: customerPhotoData,
      photoSource: body.photoSource || (photoFile ? 'upload' : null),
      address,
      city,
      district,
      state,
      pincode,
      currentAddress,
      permanentAddress,
      currentAddressDetails: {
        houseNumber: body.currentAddressDetails?.houseNumber || '',
        street: body.currentAddressDetails?.street || address,
        locality: body.currentAddressDetails?.locality || '',
        city: city || body.currentAddressDetails?.city || '',
        district: district || body.currentAddressDetails?.district || '',
        state: state || 'Tamil Nadu',
        country: 'India',
        pincode: pincode || body.currentAddressDetails?.pincode || ''
      },
      permanentAddressDetails: {
        houseNumber: body.permanentAddressDetails?.houseNumber || '',
        street: body.permanentAddressDetails?.street || permanentAddress,
        locality: body.permanentAddressDetails?.locality || '',
        city: city || body.permanentAddressDetails?.city || '',
        district: district || body.permanentAddressDetails?.district || '',
        state: state || 'Tamil Nadu',
        country: 'India',
        pincode: pincode || body.permanentAddressDetails?.pincode || ''
      },
      currentLocation: body.currentLocation ? (typeof body.currentLocation === 'string' ? JSON.parse(body.currentLocation) : body.currentLocation) : null,
      permanentLocation: body.permanentLocation ? (typeof body.permanentLocation === 'string' ? JSON.parse(body.permanentLocation) : body.permanentLocation) : null,
      idProofType,
      idProof: idProofType,
      idProofNumber,
      idNumber: idProofNumber,
      extraPan,
      docName,
      kycDocuments,
      status: body.status || 'VERIFIED',
      joinedDate: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      activeLoansCount: 0,
      totalBorrowed: 0,
      isDeleted: false
    };

    const savedCustomer = await CustomerModel.create(customerPayload);

    return res.status(201).json({
      success: true,
      message: 'Customer created successfully.',
      data: savedCustomer
    });
  } catch (error: any) {
    console.error('[CustomerController] createCustomer unexpected error:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'An unexpected error occurred while creating customer.',
      error: 'CUSTOMER_CREATION_FAILED'
    });
  }
};

/**
 * Normalizes customer record and aggregates KYC metadata from Cloud Storage.
 */
async function normalizeCustomerRecord(customer: any): Promise<{ customer: any; kycDocuments: any[] }> {
  if (!customer) return { customer: null, kycDocuments: [] };
  const custId = customer.customerId || customer.id || customer._id?.toString() || '';

  // 1. Normalize Customer Photo
  let photoData: any = null;
  let photoUrl: string | null = null;

  if (customer.customerPhotoData) {
    photoData = customer.customerPhotoData;
    photoUrl = photoData.viewUrl || photoData.url || null;
  } else if (typeof customer.customerPhoto === 'object' && customer.customerPhoto !== null) {
    photoData = customer.customerPhoto;
    photoUrl = photoData.viewUrl || photoData.url || null;
  } else if (typeof customer.customerPhoto === 'string' && customer.customerPhoto) {
    photoUrl = customer.customerPhoto;
    photoData = {
      fileId: `photo_${custId}`,
      fileName: 'customer-photo.jpg',
      documentType: 'customer_photo',
      url: customer.customerPhoto,
      viewUrl: customer.customerPhoto,
      mimeType: 'image/jpeg'
    };
  }

  // 2. Aggregate KYC Documents from Customer Model & FileAttachmentModel
  const rawDocs = Array.isArray(customer.kycDocuments) ? [...customer.kycDocuments] : [];

  try {
    const attachments = await FileAttachmentModel.find({
      entityId: custId,
      isDeleted: { $ne: true }
    }).lean();

    if (Array.isArray(attachments)) {
      for (const att of attachments) {
        const exists = rawDocs.some(
          (d: any) =>
            d.id === att.fileId ||
            d.fileId === att.fileId ||
            (att.storagePath && (d.storagePath === att.storagePath))
        );
        if (!exists) {
          rawDocs.push({
            id: att.fileId,
            documentId: att.fileId,
            customerId: custId,
            documentType: att.documentType,
            fileName: att.storedFileName || att.originalFileName,
            originalFileName: att.originalFileName,
            mimeType: att.mimeType,
            fileSize: att.fileSize,
            storagePath: att.storagePath,
            viewUrl: `/api/files/${att.fileId}/view`,
            downloadUrl: `/api/files/${att.fileId}/download`,
            uploadedAt: att.createdAt,
            uploadedBy: att.uploadedBy
          });
        }
      }
    }
  } catch (attErr) {
    // Ignore attachment lookup errors gracefully
  }

  // 3. Map to consistent frontend contract
  const normalizedKycDocs = rawDocs.map((doc: any, idx: number) => {
    const fileId = doc.fileId || doc.id || doc.publicId || doc.documentId || `DOC-${idx + 1}`;
    const viewUrl = doc.viewUrl || (fileId ? `/api/files/${fileId}/view` : '');
    const downloadUrl = doc.downloadUrl || (fileId ? `/api/files/${fileId}/download` : '');

    return {
      id: fileId,
      documentId: fileId,
      customerId: custId,
      documentType: doc.documentType || doc.docType || 'kyc_document',
      docType: doc.documentType || doc.docType || 'kyc_document',
      documentNumber: doc.documentNumber || doc.docNumber || '',
      docNumber: doc.documentNumber || doc.docNumber || '',
      documentName: doc.documentName || doc.fileName || doc.storedFileName || `${doc.documentType || 'KYC'} Document`,
      fileName: doc.fileName || doc.storedFileName || doc.originalFileName || doc.documentName || `${doc.documentType || 'Document'}`,
      originalFileName: doc.originalFileName || doc.fileName,
      mimeType: doc.mimeType || (doc.fileName?.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'),
      fileSize: doc.fileSize || doc.size || 0,
      size: doc.fileSize || doc.size || 0,
      storagePath: doc.storagePath,
      url: viewUrl,
      viewUrl,
      downloadUrl,
      uploadedAt: doc.uploadedAt || doc.createdAt || new Date().toISOString(),
      uploadedBy: doc.uploadedBy || 'admin'
    };
  });

  const normalizedCust = {
    ...customer,
    id: custId,
    customerId: custId,
    name: customer.fullName || customer.name || '',
    fullName: customer.fullName || customer.name || '',
    phone: customer.phoneNumber || customer.phone || '',
    phoneNumber: customer.phoneNumber || customer.phone || '',
    idProof: customer.idProofType || customer.idProof || 'Aadhaar Card',
    idProofType: customer.idProofType || customer.idProof || 'Aadhaar Card',
    idNumber: customer.idProofNumber || customer.idNumber || '',
    idProofNumber: customer.idProofNumber || customer.idNumber || '',
    customerPhoto: photoUrl,
    customerPhotoData: photoData,
    kycDocuments: normalizedKycDocs
  };

  return { customer: normalizedCust, kycDocuments: normalizedKycDocs };
}

/**
 * GET /api/customers
 */
export const getCustomers = async (req: Request, res: Response) => {
  try {
    const includeDeleted = req.query.includeDeleted === 'true';
    const filter = includeDeleted ? {} : { isDeleted: { $ne: true } };

    const rawCustomers = await CustomerModel.find(filter).sort({ createdAt: -1 }).lean();
    const mapped: any[] = [];

    for (const c of rawCustomers) {
      const { customer } = await normalizeCustomerRecord(c);
      mapped.push(customer);
    }

    return res.json({
      success: true,
      message: 'Customers retrieved successfully.',
      data: mapped,
      count: mapped.length,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('[CustomerController] getCustomers error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve customers.'
    });
  }
};

/**
 * GET /api/customers/:id
 */
export const getCustomerById = async (req: Request, res: Response) => {
  try {
    const targetId = req.params.id;
    const rawCustomer = await CustomerModel.findOne({
      $or: [
        { customerId: targetId },
        { id: targetId }
      ]
    });

    if (!rawCustomer) {
      return res.status(404).json({
        success: false,
        message: `Customer with ID "${targetId}" not found.`,
        error: { code: 'CUSTOMER_NOT_FOUND' }
      });
    }

    const { customer, kycDocuments } = await normalizeCustomerRecord(rawCustomer);

    const user = (req as any).user;
    const isUserAdmin = user && (user.role === 'ADMIN' || user.role === 'MASTER_ADMIN');
    const hasKycAccess = isUserAdmin || Boolean((user?.permissions as any)?.viewKyc || (user?.permissions?.customers as any)?.viewKyc);

    if (!hasKycAccess) {
      // Redact sensitive KYC document details for staff without viewKyc
      const safeCustomer = {
        ...customer,
        kycDocuments: [],
        customerPhoto: null,
        customerPhotoData: null
      };
      return res.json({
        success: true,
        message: 'Customer retrieved successfully.',
        data: safeCustomer,
        customer: safeCustomer,
        kycDocuments: []
      });
    }

    return res.json({
      success: true,
      message: 'Customer retrieved successfully.',
      data: customer,
      customer,
      kycDocuments
    });
  } catch (error: any) {
    console.error('[CustomerController] getCustomerById error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve customer.'
    });
  }
};

/**
 * GET /api/customers/search
 */
export const searchCustomers = async (req: Request, res: Response) => {
  try {
    const query = ((req.query.query || req.query.q) as string || '').trim();
    if (!query) {
      return getCustomers(req, res);
    }

    const normPhone = normalizePhone(query);
    const regex = new RegExp(query, 'i');

    const rawResults = await CustomerModel.find({
      isDeleted: { $ne: true },
      $or: [
        { fullName: regex },
        { customerId: regex },
        { phoneNumber: regex },
        ...(normPhone ? [{ phoneNormalized: new RegExp(normPhone) }] : []),
        { idProofNumber: regex },
        { address: regex }
      ]
    }).lean();

    const mapped: any[] = [];
    for (const c of rawResults) {
      const { customer } = await normalizeCustomerRecord(c);
      mapped.push(customer);
    }

    return res.json({
      success: true,
      data: mapped,
      count: mapped.length
    });
  } catch (error: any) {
    console.error('[CustomerController] searchCustomers error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Search failed.'
    });
  }
};

/**
 * PUT /api/customers/:id
 */
export const updateCustomer = async (req: Request, res: Response) => {
  try {
    const targetId = req.params.id;
    const body = req.body || {};
    const files = (req.files as { [fieldname: string]: Express.Multer.File[] }) || {};

    const existing = await CustomerModel.findOne({
      $or: [
        { customerId: targetId },
        { id: targetId }
      ]
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: `Customer with ID "${targetId}" not found.`,
        error: { code: 'CUSTOMER_NOT_FOUND' }
      });
    }

    const updateFields: any = { ...body, updatedAt: new Date() };

    // Normalize field names
    if (body.fullName || body.name) {
      updateFields.fullName = (body.fullName || body.name).trim();
      updateFields.name = updateFields.fullName;
    }
    if (body.phoneNumber || body.phone) {
      const rawPhone = (body.phoneNumber || body.phone).trim();
      const norm = normalizePhone(rawPhone);
      if (!isValidIndianPhone(norm)) {
        return res.status(400).json({
          success: false,
          message: 'Please enter a valid 10-digit Indian mobile number.'
        });
      }

      // Check duplicate phone number in storage among other ACTIVE, non-deleted customers
      const duplicate = await CustomerModel.findOne({
        isDeleted: false,
        includeDeleted: false,
        phoneNormalized: norm
      });

      if (
        duplicate &&
        !duplicate.isDeleted &&
        String(duplicate.id) !== String(targetId) &&
        String(duplicate.customerId) !== String(targetId)
      ) {
        return res.status(409).json({
          success: false,
          message: `This mobile number is already registered to another active customer: ${duplicate.fullName || duplicate.name} (${duplicate.customerId || duplicate.id}).`,
          error: 'DUPLICATE_PHONE_NUMBER'
        });
      }

      updateFields.phoneNumber = norm;
      updateFields.phone = norm;
      updateFields.phoneNormalized = norm;
    }
    if (body.idProofType || body.idProof) {
      updateFields.idProofType = body.idProofType || body.idProof;
      updateFields.idProof = updateFields.idProofType;
    }
    if (body.idProofNumber || body.idNumber) {
      updateFields.idProofNumber = (body.idProofNumber || body.idNumber).trim();
      updateFields.idNumber = updateFields.idProofNumber;
    }

    if (typeof updateFields.currentAddressDetails === 'string') {
      try { updateFields.currentAddressDetails = JSON.parse(updateFields.currentAddressDetails); } catch {}
    }
    if (typeof updateFields.permanentAddressDetails === 'string') {
      try { updateFields.permanentAddressDetails = JSON.parse(updateFields.permanentAddressDetails); } catch {}
    }
    if (typeof updateFields.currentLocation === 'string') {
      try { updateFields.currentLocation = JSON.parse(updateFields.currentLocation); } catch {}
    }
    if (typeof updateFields.permanentLocation === 'string') {
      try { updateFields.permanentLocation = JSON.parse(updateFields.permanentLocation); } catch {}
    }

    // Photo update (Google Drive)
    const uploadedBy = (req as any).user?.email || (req as any).user?.id || 'STAFF';
    const photoFile = files['customerPhoto']?.[0];
    if (photoFile) {
      const custId = existing.customerId;
      const uploaded = await uploadAndRecordCustomerFile({
        buffer: photoFile.buffer,
        mimeType: photoFile.mimetype || 'image/jpeg',
        originalName: photoFile.originalname || `customer-photo-${custId}-${Date.now()}.jpg`,
        customerId: custId,
        documentType: 'customer_photo',
        uploadedBy
      });
      updateFields.customerPhoto = {
        fileId: uploaded.fileId,
        fileName: uploaded.fileName,
        originalFileName: uploaded.originalFileName,
        url: uploaded.url,
        viewUrl: uploaded.viewUrl,
        downloadUrl: uploaded.downloadUrl,
        storagePath: uploaded.fileName,
        mimeType: photoFile.mimetype || 'image/jpeg',
        fileSize: uploaded.fileSize,
        size: uploaded.fileSize,
        uploadedAt: uploaded.uploadedAt,
        uploadedBy
      };
    } else if (body.customerPhoto && typeof body.customerPhoto === 'string' && body.customerPhoto.startsWith('data:image')) {
      const custId = existing.customerId;
      const parsed = dataUriToBuffer(body.customerPhoto);
      if (parsed) {
        const uploaded = await uploadAndRecordCustomerFile({
          buffer: parsed.buffer,
          mimeType: parsed.mimeType,
          originalName: `customer-photo-${custId}-${Date.now()}.jpg`,
          customerId: custId,
          documentType: 'customer_photo',
          uploadedBy
        });
        updateFields.customerPhoto = {
          fileId: uploaded.fileId,
          fileName: uploaded.fileName,
          originalFileName: uploaded.originalFileName,
          url: uploaded.url,
          viewUrl: uploaded.viewUrl,
          downloadUrl: uploaded.downloadUrl,
          storagePath: uploaded.fileName,
          mimeType: parsed.mimeType,
          fileSize: uploaded.fileSize,
          size: uploaded.fileSize,
          uploadedAt: uploaded.uploadedAt,
          uploadedBy
        };
      }
    } else if (body.customerPhotoUrl && typeof body.customerPhotoUrl === 'string') {
      const custId = existing.customerId;
      updateFields.customerPhoto = {
        fileId: existing.customerPhoto?.fileId || `photo_${custId}_${Date.now()}`,
        fileName: existing.customerPhoto?.fileName || `customer-photo-${custId}.jpg`,
        url: body.customerPhotoUrl,
        viewUrl: body.customerPhotoUrl,
        storagePath: existing.customerPhoto?.storagePath,
        mimeType: existing.customerPhoto?.mimeType || 'image/jpeg',
        fileSize: existing.customerPhoto?.fileSize || 0,
        uploadedAt: existing.customerPhoto?.uploadedAt || new Date().toISOString(),
        uploadedBy
      };
    } else if (body.customerPhoto === 'null' || body.removePhoto === 'true') {
      updateFields.customerPhoto = null;
    }

    // KYC update (Cloud Storage)
    const kycFiles = [
      ...(files['kycDocuments'] || []),
      ...(files['aadhaarDoc'] || []),
      ...(files['panDoc'] || []),
      ...(files['otherDoc'] || [])
    ];

    if (kycFiles.length > 0) {
      const newKycDocs: IKYCDocument[] = [];
      const custId = existing.customerId;

      for (let i = 0; i < kycFiles.length; i++) {
        const file = kycFiles[i];
        const docType =
          file.fieldname === 'aadhaarDoc' ? 'Aadhaar' :
          file.fieldname === 'panDoc' ? 'PAN' :
          file.fieldname === 'otherDoc' ? (body.docName || 'Other') : (updateFields.idProofType || existing.idProofType || 'KYC');
        const isPdf = file.mimetype === 'application/pdf';
        const resourceType = isPdf ? 'raw' : 'image';

        const uploaded = await uploadAndRecordCustomerFile({
          buffer: file.buffer,
          mimeType: file.mimetype || (isPdf ? 'application/pdf' : 'image/jpeg'),
          originalName: file.originalname || `${docType.toLowerCase()}_${i + 1}${isPdf ? '.pdf' : '.jpg'}`,
          customerId: custId,
          documentType: docType.toLowerCase().replace(/\s+/g, '_'),
          uploadedBy
        });

        newKycDocs.push({
          id: uploaded.fileId,
          documentType: docType,
          docType: docType,
          documentNumber: updateFields.idProofNumber || existing.idProofNumber || '',
          docNumber: updateFields.idProofNumber || existing.idProofNumber || '',
          documentName: file.originalname || `${docType} Document`,
          fileId: uploaded.fileId,
          fileName: uploaded.fileName,
          originalFileName: file.originalname,
          url: uploaded.url,
          viewUrl: uploaded.viewUrl,
          downloadUrl: uploaded.downloadUrl,
          storagePath: uploaded.fileName,
          mimeType: file.mimetype || (isPdf ? 'application/pdf' : 'image/jpeg'),
          fileSize: uploaded.fileSize,
          size: uploaded.fileSize,
          uploadedAt: uploaded.uploadedAt,
          resourceType,
          uploadedBy
        });
      }

      if (!Array.isArray(existing.kycDocuments)) {
        existing.kycDocuments = [];
      }
      existing.kycDocuments.push(...newKycDocs);
    }

    Object.assign(existing, updateFields);
    let updatedDoc: any;
    if (typeof existing.save === 'function') {
      updatedDoc = await existing.save();
    } else {
      updatedDoc = await CustomerModel.findByIdAndUpdate(existing.id || existing.customerId || targetId, existing);
    }

    return res.json({
      success: true,
      message: 'Customer updated successfully.',
      data: updatedDoc
    });
  } catch (error: any) {
    console.error('[CustomerController] updateCustomer error:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to update customer.',
      error: 'CUSTOMER_UPDATE_FAILED'
    });
  }
};

/**
 * POST /api/customers/:id/kyc
 * Uploads one or more KYC documents for an existing customer directly to Google Drive.
 */
export const uploadCustomerKycDocument = async (req: Request, res: Response) => {
  try {
    const targetId = req.params.id;
    const files = (req.files as { [fieldname: string]: Express.Multer.File[] }) || {};
    const singleFile = req.file;
    const body = req.body || {};
    const uploadedBy = (req as any).user?.email || (req as any).user?.id || 'STAFF';

    const customer = await CustomerModel.findOne({
      $or: [{ customerId: targetId }, { id: targetId }]
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: `Customer with ID "${targetId}" not found.`,
        error: { code: 'CUSTOMER_NOT_FOUND' }
      });
    }

    const incomingFiles: Express.Multer.File[] = [];
    if (singleFile) {
      incomingFiles.push(singleFile);
    }
    if (files['file']) {
      incomingFiles.push(...files['file']);
    }
    if (files['files']) {
      incomingFiles.push(...files['files']);
    }
    if (files['kycDocuments']) {
      incomingFiles.push(...files['kycDocuments']);
    }

    if (incomingFiles.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No KYC file was provided in the upload request.'
      });
    }

    const customerId = customer.customerId || targetId;
    const documentType = (body.documentType || body.docType || 'Other').trim();
    const documentName = (body.documentName || body.name || '').trim();
    const documentNumber = (body.documentNumber || body.docNumber || body.idProofNumber || '').trim();

    const newlyAttachedDocs: IKYCDocument[] = [];

    for (let i = 0; i < incomingFiles.length; i++) {
      const file = incomingFiles[i];
      const isPdf = file.mimetype === 'application/pdf';
      const resourceType = isPdf ? 'raw' : 'image';

      const uploaded = await uploadAndRecordCustomerFile({
        buffer: file.buffer,
        mimeType: file.mimetype || (isPdf ? 'application/pdf' : 'image/jpeg'),
        originalName: file.originalname || `${documentType.toLowerCase()}_${i + 1}${isPdf ? '.pdf' : '.jpg'}`,
        customerId,
        documentType: documentType.toLowerCase().replace(/\s+/g, '_'),
        uploadedBy
      });

      const docItem: IKYCDocument = {
        id: uploaded.fileId,
        documentType,
        docType: documentType,
        documentNumber: documentNumber || customer.idProofNumber || '',
        docNumber: documentNumber || customer.idProofNumber || '',
        documentName: documentName || file.originalname || `${documentType} Document`,
        fileId: uploaded.fileId,
        fileName: uploaded.fileName,
        originalFileName: file.originalname,
        url: uploaded.url,
        viewUrl: uploaded.viewUrl,
        downloadUrl: uploaded.downloadUrl,
        storagePath: uploaded.fileName,
        mimeType: file.mimetype || (isPdf ? 'application/pdf' : 'image/jpeg'),
        fileSize: uploaded.fileSize,
        size: uploaded.fileSize,
        uploadedAt: uploaded.uploadedAt,
        resourceType,
        uploadedBy
      };

      newlyAttachedDocs.push(docItem);
    }

    if (!Array.isArray(customer.kycDocuments)) {
      customer.kycDocuments = [];
    }
    customer.kycDocuments.push(...newlyAttachedDocs);
    customer.updatedAt = new Date();

    await CustomerModel.findOneAndUpdate({ customerId }, customer);

    const firstDoc = newlyAttachedDocs[0];
    return res.status(201).json({
      success: true,
      message: `${newlyAttachedDocs.length} KYC document(s) uploaded to secure cloud storage successfully.`,
      document: firstDoc ? {
        documentId: firstDoc.id || firstDoc.fileId,
        customerId,
        documentType: firstDoc.documentType,
        fileName: firstDoc.fileName,
        mimeType: firstDoc.mimeType,
        storagePath: firstDoc.storagePath || firstDoc.fileId,
        viewUrl: firstDoc.viewUrl,
        downloadUrl: firstDoc.downloadUrl
      } : null,
      data: customer,
      documents: newlyAttachedDocs
    });
  } catch (error: any) {
    console.error('[CustomerController] uploadCustomerKycDocument error:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to upload KYC document.',
      error: 'KYC_UPLOAD_FAILED'
    });
  }
};

/**
 * DELETE /api/customers/:id/kyc/:docId
 * Deletes a KYC document from a customer and removes/trashes the file in Google Drive.
 */
export const deleteCustomerKycDocument = async (req: Request, res: Response) => {
  try {
    const { id: targetId, docId } = req.params;
    const user = (req as any).user;

    const customer = await CustomerModel.findOne({
      $or: [{ customerId: targetId }, { id: targetId }]
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: `Customer with ID "${targetId}" not found.`,
        error: { code: 'CUSTOMER_NOT_FOUND' }
      });
    }

    const docs = customer.kycDocuments || [];
    const docToDelete = docs.find(
      (d: any) =>
        d.id === docId ||
        d.fileId === docId ||
        d.publicId === docId ||
        (d.fileId === docId || d.storagePath === docId)
    );

    if (!docToDelete) {
      return res.status(404).json({
        success: false,
        message: `KYC Document with ID "${docId}" not found on customer.`
      });
    }

    // Mark FileAttachment as deleted
    if (docToDelete.fileId) {
      try {
        await FileAttachmentModel.updateOne(
          { fileId: docToDelete.fileId },
          { $set: { isDeleted: true, deletedAt: new Date().toISOString() } }
        );
      } catch (err: any) {
        console.warn('[CustomerController] Notice deleting file attachment:', err?.message || err);
      }
    }

    // Filter out of customer.kycDocuments
    customer.kycDocuments = docs.filter(
      (d: any) =>
        d !== docToDelete &&
        d.id !== docId &&
        d.fileId !== docId &&
        d.publicId !== docId &&
        (d.fileId !== docId && d.storagePath !== docId)
    );
    customer.updatedAt = new Date();

    await CustomerModel.findOneAndUpdate({ customerId: customer.customerId }, customer);

    return res.json({
      success: true,
      message: 'KYC document deleted successfully from customer profile and cloud storage.',
      data: customer,
      deletedDocId: docId
    });
  } catch (error: any) {
    console.error('[CustomerController] deleteCustomerKycDocument error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete KYC document.'
    });
  }
};

/**
 * GET /api/customers/:id/kyc or /api/customers/:id/documents
 * Retrieves all KYC document metadata for a customer from Cloud storage.
 */
export const getCustomerKycDocuments = async (req: Request, res: Response) => {
  try {
    const targetId = req.params.id;
    const rawCustomer = await CustomerModel.findOne({
      $or: [{ customerId: targetId }, { id: targetId }]
    });

    if (!rawCustomer) {
      return res.status(404).json({
        success: false,
        message: `Customer with ID "${targetId}" not found.`,
        error: { code: 'CUSTOMER_NOT_FOUND' }
      });
    }

    const { customer, kycDocuments } = await normalizeCustomerRecord(rawCustomer);

    return res.json({
      success: true,
      customerId: customer.customerId,
      customerName: customer.fullName || customer.name,
      customerPhoto: customer.customerPhoto || null,
      customerPhotoData: customer.customerPhotoData || null,
      kycDocuments,
      documents: kycDocuments,
      count: kycDocuments.length
    });
  } catch (error: any) {
    console.error('[CustomerController] getCustomerKycDocuments error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve customer KYC documents.'
    });
  }
};

/**
 * POST /api/customers/:id/photo
 * Uploads customer photo from file or webcam base64/data URI, stores in Cloud storage and Firestore metadata.
 */
export const uploadCustomerPhoto = async (req: Request, res: Response) => {
  try {
    const targetId = req.params.id;
    const body = req.body || {};
    const files = (req.files as { [fieldname: string]: Express.Multer.File[] }) || {};
    const uploadedBy = (req as any).user?.email || (req as any).user?.id || 'STAFF';

    const customer = await CustomerModel.findOne({
      $or: [{ customerId: targetId }, { id: targetId }]
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: `Customer with ID "${targetId}" not found.`,
        error: { code: 'CUSTOMER_NOT_FOUND' }
      });
    }

    const photoFile = files['customerPhoto']?.[0] || files['photo']?.[0] || files['file']?.[0];
    const photoDataUri = body.customerPhoto || body.photo || body.image || body.dataUri;

    let buffer: Buffer | null = null;
    let mimeType = 'image/jpeg';
    let originalName = `customer-photo-${customer.customerId}.jpg`;

    if (photoFile) {
      buffer = photoFile.buffer;
      mimeType = photoFile.mimetype || 'image/jpeg';
      originalName = photoFile.originalname || originalName;
    } else if (photoDataUri && typeof photoDataUri === 'string') {
      const parsed = dataUriToBuffer(photoDataUri);
      if (parsed) {
        buffer = parsed.buffer;
        mimeType = parsed.mimeType;
      }
    }

    if (!buffer) {
      return res.status(400).json({
        success: false,
        message: 'No photo provided. Please upload an image file or provide a webcam image data URI.'
      });
    }

    const uploaded = await uploadAndRecordCustomerFile({
      buffer,
      mimeType,
      originalName,
      customerId: customer.customerId,
      documentType: 'customer_photo',
      uploadedBy
    });

    const photoObj: ICustomerPhoto = {
      fileId: uploaded.fileId,
      fileName: uploaded.fileName,
      originalFileName: uploaded.originalFileName,
      url: uploaded.url,
      viewUrl: uploaded.viewUrl,
      downloadUrl: uploaded.downloadUrl,
      storagePath: uploaded.fileName,
      mimeType: uploaded.mimeType,
      fileSize: uploaded.fileSize,
      size: uploaded.fileSize,
      uploadedAt: uploaded.uploadedAt,
      uploadedBy
    };

    customer.customerPhoto = photoObj as any;
    customer.customerPhotoData = photoObj as any;
    customer.photoSource = body.photoSource || (photoFile ? 'upload' : 'webcam');
    customer.updatedAt = new Date();

    await CustomerModel.findOneAndUpdate({ customerId: customer.customerId }, customer);

    return res.json({
      success: true,
      message: 'Customer photo uploaded and saved successfully.',
      data: photoObj,
      customerPhoto: photoObj
    });
  } catch (error: any) {
    console.error('[CustomerController] uploadCustomerPhoto error:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to upload customer photo.',
      error: 'PHOTO_UPLOAD_FAILED'
    });
  }
};

/**
 * GET /api/customers/:id/documents/:documentId or /api/customers/:id/kyc/:docId
 * Retrieves a single KYC document metadata for a customer.
 */
export const getCustomerDocumentById = async (req: Request, res: Response) => {
  try {
    const { id: targetId, docId, documentId } = req.params;
    const documentIdentifier = docId || documentId;

    const customer = await CustomerModel.findOne({
      $or: [{ customerId: targetId }, { id: targetId }]
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: `Customer with ID "${targetId}" not found.`,
        error: { code: 'CUSTOMER_NOT_FOUND' }
      });
    }

    const { kycDocuments } = await normalizeCustomerRecord(customer);

    const doc = kycDocuments.find(
      (d: any) =>
        d.id === documentIdentifier ||
        d.fileId === documentIdentifier ||
        d.publicId === documentIdentifier ||
        (d.fileId === documentIdentifier || d.storagePath === documentIdentifier)
    );

    if (!doc) {
      return res.status(404).json({
        success: false,
        message: `Document with ID "${documentIdentifier}" not found for customer ${customer.customerId}.`,
        error: { code: 'DOCUMENT_NOT_FOUND' }
      });
    }

    return res.json({
      success: true,
      message: 'Document retrieved successfully.',
      data: doc,
      document: doc
    });
  } catch (error: any) {
    console.error('[CustomerController] getCustomerDocumentById error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve document.'
    });
  }
};

/**
 * DELETE /api/customers/:id
 */
export const deleteCustomer = async (req: Request, res: Response) => {
  try {
    const targetId = req.params.id;

    const customer = await CustomerModel.findOne({
      $or: [
        { customerId: targetId },
        { id: targetId }
      ]
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: `Customer with ID "${targetId}" not found.`,
        error: { code: 'CUSTOMER_NOT_FOUND' }
      });
    }

    // Soft delete: update isDeleted flag in storage
    customer.isDeleted = true;
    customer.deletedAt = new Date().toISOString();
    customer.deletedBy = (req as any).user?.email || (req as any).user?.id || 'ADMIN';
    await CustomerModel.findOneAndUpdate({
      includeDeleted: true,
      $or: [
        { id: targetId },
        { customerId: targetId },
        { id: customer.id },
        { customerId: customer.customerId }
      ]
    }, {
      isDeleted: true,
      deletedAt: customer.deletedAt,
      deletedBy: customer.deletedBy
    });

    return res.json({
      success: true,
      message: 'Customer moved to Deleted Customers successfully.'
    });
  } catch (error: any) {
    console.error('[CustomerController] deleteCustomer error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete customer.'
    });
  }
};

export const restoreCustomer = async (req: Request, res: Response) => {
  try {
    const targetId = req.params.id;

    const customer = await CustomerModel.findOneAndUpdate(
      {
        includeDeleted: true,
        $or: [
          { customerId: targetId },
          { id: targetId }
        ]
      },
      { isDeleted: false, deletedAt: null, deletedBy: null },
      { new: true }
    );

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: `Customer with ID "${targetId}" not found.`,
        error: { code: 'CUSTOMER_NOT_FOUND' }
      });
    }

    return res.json({
      success: true,
      message: 'Customer restored successfully.',
      data: customer
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to restore customer.'
    });
  }
};

export const deletePermanentlyCustomer = async (req: Request, res: Response) => {
  try {
    const targetId = req.params.id;

    const delResult = await CustomerModel.deletePermanently(targetId);

    if (!delResult.success) {
      return res.status(404).json({
        success: false,
        message: delResult.message || `Customer with ID "${targetId}" not found.`,
        error: { code: 'CUSTOMER_NOT_FOUND' }
      });
    }

    return res.json({
      success: true,
      message: delResult.message || 'Customer permanently deleted from database and storage.'
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to permanently delete customer.'
    });
  }
};
