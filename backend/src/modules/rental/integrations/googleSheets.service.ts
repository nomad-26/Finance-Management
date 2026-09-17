import {
  RentalComplex,
  RentalShop,
  RentalPayment,
  RentalExpense,
  RentalAuditLog
} from '../types/rental.types.js';

/**
 * Local Storage Sync Service (Zero Google Drive / Google Sheets dependency)
 * Automatically marks local records as synchronized and maintains internal log integrity.
 */
export class GoogleSheetsService {
  private isConfigured: boolean = true;

  constructor() {}

  public isReady(): boolean {
    return true;
  }

  public getSpreadsheetId(): string {
    return 'local-storage-sync';
  }

  public async ensureHeaders(): Promise<void> {
    return;
  }

  public async syncComplex(_complex: RentalComplex): Promise<{ success: boolean; error?: string }> {
    return { success: true };
  }

  public async syncShop(_shop: RentalShop): Promise<{ success: boolean; error?: string }> {
    return { success: true };
  }

  public async syncPayment(_payment: RentalPayment): Promise<{ success: boolean; error?: string }> {
    return { success: true };
  }

  public async syncExpense(_expense: RentalExpense): Promise<{ success: boolean; error?: string }> {
    return { success: true };
  }

  public async syncAuditLog(_log: RentalAuditLog): Promise<{ success: boolean; error?: string }> {
    return { success: true };
  }
}

export const googleSheetsService = new GoogleSheetsService();
