export type EntityType =
  | 'CUSTOMER'
  | 'LOAN'
  | 'RECEIPT'
  | 'DAYBOOK'
  | 'FIXED_DEPOSIT'
  | 'FD_CUSTOMER'
  | 'FD_INTEREST_PAYOUT'
  | 'FD_WITHDRAWAL'
  | 'FD_RENEWAL'
  | 'FILE_ATTACHMENT'
  | 'RENTAL_COMPLEX'
  | 'RENTAL_SHOP'
  | 'RENTAL_PAYMENT'
  | 'RENTAL_EXPENSE'
  | 'RENTAL_AUDIT'
  | 'RENTAL_DAYBOOK'
  | 'USER'
  | 'SETTINGS'
  | 'AUDIT'
  | 'COUNTER';

export const APP_RECORD_MARKER = 'KKV_APP_RECORD';

export interface AppRecordEnvelope<T = any> {
  app: 'KKV_GOLD_FINANCE';
  marker: typeof APP_RECORD_MARKER;
  type: EntityType;
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  isDeleted?: boolean;
  deletedAt?: string | null;
  deletedBy?: string | null;
  actor?: {
    uid?: string;
    email?: string;
    role?: string;
  };
  data: T;
}


export interface RepositoryQueryOptions<T = any> {
  includeDeleted?: boolean;
  filter?: (item: T, envelope: AppRecordEnvelope<T>) => boolean;
  sort?: (a: T, b: T) => number;
  limit?: number;
  skip?: number;
}
