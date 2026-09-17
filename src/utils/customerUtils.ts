import { Customer } from '../types';

/**
 * Returns the canonical formatted Customer ID string (e.g. "CUST-006" or "CUST-001").
 */
export const getCanonicalCustomerId = (
  cust: Customer | string | number | undefined | null
): string => {
  if (!cust) return '';
  if (typeof cust === 'string') {
    return cust.trim();
  }
  if (typeof cust === 'number') {
    return `CUST-${String(cust).padStart(3, '0')}`;
  }
  if (cust.customerId) {
    return `CUST-${String(cust.customerId).padStart(3, '0')}`;
  }
  if (cust.id) {
    return cust.id.trim();
  }
  return '';
};

/**
 * Performs a robust, canonical match between a customer identifier string/number and a Customer object or target ID.
 * Returns true if the IDs refer to the exact same customer.
 */
export const isMatchingCustomerId = (
  targetId: string | number | undefined | null,
  customerRef: Customer | string | number | undefined | null
): boolean => {
  if (targetId === undefined || targetId === null || customerRef === undefined || customerRef === null) {
    return false;
  }

  const strTarget = String(targetId).trim().toLowerCase();
  
  if (typeof customerRef === 'object') {
    const custObj = customerRef as Customer;
    const custId = custObj.id ? String(custObj.id).trim().toLowerCase() : '';
    const custNumId = custObj.customerId ? String(custObj.customerId).trim().toLowerCase() : '';
    const formattedNumId = custObj.customerId ? `cust-${String(custObj.customerId).padStart(3, '0')}`.toLowerCase() : '';

    if (strTarget === custId) return true;
    if (custNumId && strTarget === custNumId) return true;
    if (formattedNumId && strTarget === formattedNumId) return true;
    
    // Check numeric portion matching (e.g., "6" matching "CUST-006" or "cust-6")
    const targetDigits = strTarget.replace(/\D/g, '');
    const custDigits = custNumId || custId.replace(/\D/g, '');
    if (targetDigits && custDigits && parseInt(targetDigits, 10) === parseInt(custDigits, 10)) {
      return true;
    }

    return false;
  }

  const strRef = String(customerRef).trim().toLowerCase();
  if (strTarget === strRef) return true;

  const targetDigits = strTarget.replace(/\D/g, '');
  const refDigits = strRef.replace(/\D/g, '');
  if (targetDigits && refDigits && parseInt(targetDigits, 10) === parseInt(refDigits, 10)) {
    return true;
  }

  return false;
};
