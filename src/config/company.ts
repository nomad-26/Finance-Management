import { BranchSettings } from '../types';

/**
 * Centralized Company Configuration for KKV Finance
 * Single source of truth for business information, branch details, address, registration & contact.
 */
export interface CompanyConfig {
  businessName: string;
  shortName: string;
  branch: string;
  address: string;
  phone: string;
  phoneRaw: string;
  registration: string;
  gstin: string;
  email?: string;
  website?: string;
}

export const DEFAULT_BRANCH_SETTINGS: BranchSettings = {
  businessTitle: 'KKV FINANCE - MAIN BRANCH',
  officialPhone: '76959 58985',
  branchAddress: '54D9 M.K.SAMY COMPLEX, NEW PALLIPALAYAM ROAD, KOMARAPALAYAM - 638 183',
  gstin: '33AAAAA0000A1Z5',
  logo: '',
  branchCode: 'BR01'
};

export const COMPANY_CONFIG: CompanyConfig = {
  businessName: 'KKV FINANCE',
  shortName: 'KKV Finance',
  branch: 'MAIN BRANCH — GOLD LOAN & FINANCIAL SERVICES',
  address: '54D9 M.K.SAMY COMPLEX, NEW PALLIPALAYAM ROAD, KOMARAPALAYAM - 638 183',
  phone: '76959 58985',
  phoneRaw: '917695958985',
  registration: 'Reg No: TN-CHE-2018-GF492',
  gstin: '33AAAAA0000A1Z5',
  email: 'contact@kkvfinance.com',
  website: 'www.kkvfinance.com'
};

export default COMPANY_CONFIG;

