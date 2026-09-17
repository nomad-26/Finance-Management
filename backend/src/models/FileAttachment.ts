import { telegramRepository } from '../telegram/telegram.repository.js';

export interface IFileAttachment {
  _id?: string;
  id?: string;
  fileId: string;
  entityType: string;
  entityId: string;
  documentType: string;
  category?: string;
  originalFileName: string;
  storedFileName: string;
  mimeType: string;
  fileSize: number;
  telegramFileId: string;
  telegramMessageId?: number;
  telegramChatId?: string;
  viewUrl?: string;
  downloadUrl?: string;
  uploadedBy?: string;
  isDeleted: boolean;
  deletedAt?: Date | string | null;
  deletedBy?: string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export class FileAttachmentModel {
  public static find(query: any = {}): any {
    const isExplicitlyDeleted = query.isDeleted === true || (query.isDeleted && query.isDeleted.$ne !== true);
    let records = telegramRepository.getRecords<IFileAttachment>('FILE_ATTACHMENT', { includeDeleted: isExplicitlyDeleted });

    if (typeof query.isDeleted === 'boolean') {
      records = records.filter((f) => Boolean(f.isDeleted) === query.isDeleted);
    }

    if (query.$or && Array.isArray(query.$or)) {
      records = records.filter((f) =>
        query.$or.some((clause: any) =>
          (clause.fileId && (f.fileId === clause.fileId || (f as any).id === clause.fileId)) ||
          (clause.telegramFileId && f.telegramFileId === clause.telegramFileId) ||
          (clause.id && ((f as any).id === clause.id || f.fileId === clause.id)) ||
          (clause.storedFileName && (f.storedFileName === clause.storedFileName || f.originalFileName === clause.storedFileName)) ||
          (clause.entityId && f.entityId === clause.entityId)
        )
      );
    } else {
      if (query.entityId) {
        records = records.filter((f) => f.entityId === query.entityId);
      }
      if (query.entityType) {
        records = records.filter((f) => f.entityType === query.entityType);
      }
      if (query.fileId) {
        records = records.filter((f) => f.fileId === query.fileId || (f as any).id === query.fileId);
      }
      if (query.telegramFileId) {
        records = records.filter((f) => f.telegramFileId === query.telegramFileId);
      }
      if (query.storedFileName) {
        records = records.filter((f) => f.storedFileName === query.storedFileName || f.originalFileName === query.storedFileName);
      }
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
    const isExplicitlyDeleted = query.isDeleted === true || (query.isDeleted && query.isDeleted.$ne !== true);
    let records = telegramRepository.getRecords<IFileAttachment>('FILE_ATTACHMENT', { includeDeleted: isExplicitlyDeleted });

    if (typeof query.isDeleted === 'boolean') {
      records = records.filter((f) => Boolean(f.isDeleted) === query.isDeleted);
    }

    let match: IFileAttachment | null = null;

    if (query.$or && Array.isArray(query.$or)) {
      match =
        records.find((f) =>
          query.$or.some((clause: any) =>
            (clause.fileId && (f.fileId === clause.fileId || (f as any).id === clause.fileId)) ||
            (clause.telegramFileId && f.telegramFileId === clause.telegramFileId) ||
            (clause.id && ((f as any).id === clause.id || f.fileId === clause.id)) ||
            (clause.storedFileName && (f.storedFileName === clause.storedFileName || f.originalFileName === clause.storedFileName)) ||
            (clause.entityId && f.entityId === clause.entityId)
          )
        ) || null;
    } else if (query.fileId) {
      match = records.find((f) => f.fileId === query.fileId || (f as any).id === query.fileId) || null;
    } else if (query.telegramFileId) {
      match = records.find((f) => f.telegramFileId === query.telegramFileId) || null;
    } else if (query.id) {
      match = records.find((f) => (f as any).id === query.id || f.fileId === query.id) || null;
    } else if (query.storedFileName) {
      match = records.find((f) => f.storedFileName === query.storedFileName || f.originalFileName === query.storedFileName) || null;
    }

    const chain = {
      select: () => chain,
      lean: async () => match,
      then: (resolve: any, reject?: any) => Promise.resolve(match).then(resolve, reject)
    };
    return chain;
  }

  public static async create(data: Partial<IFileAttachment>): Promise<IFileAttachment> {
    const id = data.fileId || `FILE-${Date.now()}`;
    const existing = telegramRepository.getRecordById<IFileAttachment>('FILE_ATTACHMENT', id, true);
    const doc: IFileAttachment = {
      fileId: id,
      entityType: data.entityType || 'customer',
      entityId: data.entityId || 'general',
      documentType: data.documentType || 'document',
      category: data.category || 'kyc',
      originalFileName: data.originalFileName || 'file',
      storedFileName: data.storedFileName || 'file',
      mimeType: data.mimeType || 'application/octet-stream',
      fileSize: data.fileSize || 0,
      telegramFileId: data.telegramFileId || '',
      telegramMessageId: data.telegramMessageId,
      telegramChatId: data.telegramChatId,
      viewUrl: data.viewUrl || `/api/files/${id}/view`,
      downloadUrl: data.downloadUrl || `/api/files/${id}/download`,
      uploadedBy: data.uploadedBy,
      isDeleted: false,
      createdAt: existing?.data?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (existing) {
      await telegramRepository.updateRecord('FILE_ATTACHMENT', id, doc);
    } else {
      await telegramRepository.createRecord('FILE_ATTACHMENT', id, doc);
    }
    return doc;
  }

  public static async insertMany(docs: any[]): Promise<any[]> {
    const results = [];
    for (const d of docs) {
      const inserted = await FileAttachmentModel.create(d);
      results.push(inserted);
    }
    return results;
  }

  public static async countDocuments(query: any = {}): Promise<number> {
    const includeDeleted = query.isDeleted ? query.isDeleted.$ne !== true : false;
    return telegramRepository.countRecords('FILE_ATTACHMENT', undefined, includeDeleted);
  }

  public static async updateOne(query: any, update: any): Promise<any> {
    const item = await FileAttachmentModel.findOne(query);
    if (!item) return { matchedCount: 0, modifiedCount: 0 };
    const fileId = item.fileId || item.id;
    const updateData = update.$set ? update.$set : update;
    await telegramRepository.updateRecord('FILE_ATTACHMENT', fileId, updateData);
    return { matchedCount: 1, modifiedCount: 1 };
  }

  public static async deleteOne(query: any): Promise<any> {
    const id = query.fileId || query.id;
    if (id) {
      await telegramRepository.deleteRecord('FILE_ATTACHMENT', id);
      return { deletedCount: 1 };
    }
    return { deletedCount: 0 };
  }

  public static async deleteMany(query: any = {}): Promise<any> {
    let records = telegramRepository.getRecords<IFileAttachment>('FILE_ATTACHMENT', { includeDeleted: true });
    if (query.entityId) {
      records = records.filter((f) => f.entityId === query.entityId);
    }
    let count = 0;
    for (const r of records) {
      await telegramRepository.deleteRecord('FILE_ATTACHMENT', r.fileId);
      count++;
    }
    return { deletedCount: count };
  }
}

export default FileAttachmentModel;
