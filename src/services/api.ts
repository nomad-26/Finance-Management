import axios, { AxiosInstance } from 'axios';

// Supports Cloud Firestore Remote Persistent Storage + Local Storage Vault + Custom JWT Auth & RBAC

export interface BackupPackageMetadata {
  backupId: string;
  fileName: string;
  createdAt: string;
  fileSize: number;
  fileSizeFormatted?: string;
  sha256?: string;
  schemaVersion?: string;
  collectionsCount?: number;
  totalRecords: number;
  status?: string;
}

export const DEFAULT_LOCAL_API_BASE_URL = 'http://127.0.0.1:8080/api';

let customApiBaseUrl: string | null = null;

export const getApiBaseUrl = (): string => {
  if (customApiBaseUrl) return customApiBaseUrl;

  const desktopBaseUrl = typeof window !== 'undefined' ? (window as any).desktopAPI?.apiBaseUrl : null;
  if (desktopBaseUrl && typeof desktopBaseUrl === 'string' && desktopBaseUrl.trim()) {
    const clean = desktopBaseUrl.trim().replace(/\/+$/, '');
    return clean.endsWith('/api') ? clean : `${clean}/api`;
  }

  const envValue = (
    import.meta.env.VITE_API_URL ||
    import.meta.env.VITE_API_BASE_URL ||
    ''
  ).trim();

  if (envValue) {
    const clean = envValue.replace(/\/+$/, '');
    return clean.endsWith('/api') ? clean : `${clean}/api`;
  }

  const windowUrl = typeof window !== 'undefined' ? (window as any).__FINANCE_API_URL__ : null;
  if (windowUrl && typeof windowUrl === 'string' && windowUrl.trim()) {
    const clean = windowUrl.trim().replace(/\/+$/, '');
    return clean.endsWith('/api') ? clean : `${clean}/api`;
  }

  return DEFAULT_LOCAL_API_BASE_URL;
};

export const setApiBaseUrl = (url: string) => {
  customApiBaseUrl = url.endsWith('/') ? url.slice(0, -1) : url;
};

// Asynchronously resolve dynamic backend port from Electron if present
if (typeof window !== 'undefined' && typeof (window as any).desktopAPI?.getApiBaseUrl === 'function') {
  (window as any).desktopAPI.getApiBaseUrl()
    .then((url: string) => {
      if (url && typeof url === 'string' && url.trim()) {
        const clean = url.trim().replace(/\/+$/, '');
        const finalUrl = clean.endsWith('/api') ? clean : `${clean}/api`;
        setApiBaseUrl(finalUrl);
        console.log(`[API] Dynamic Backend URL resolved: ${finalUrl}`);
      }
    })
    .catch(() => {});
}

// Log configured API Base once on initialization
if (typeof window !== 'undefined' && !(window as any).__KKV_API_LOGGED__) {
  (window as any).__KKV_API_LOGGED__ = true;
  console.log(`[API] Base URL: ${getApiBaseUrl()}`);
}

function generateIdempotencyKey(): string {
  return 'req_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
}

export function isTokenExpired(token: string | null): boolean {
  if (!token || typeof token !== 'string') return true;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    const decoded = JSON.parse(jsonPayload);
    if (!decoded || typeof decoded.exp !== 'number') return false;
    // Buffer by 5 seconds to prevent edge-of-expiry race conditions
    const nowInSeconds = Math.floor(Date.now() / 1000);
    return decoded.exp <= (nowInSeconds + 5);
  } catch {
    return true;
  }
}

let isHandlingAuthExpired = false;

export function handleGlobalAuthExpired(reason: string = 'Your session has expired. Please sign in again.'): void {
  if (isHandlingAuthExpired) {
    return;
  }
  isHandlingAuthExpired = true;

  console.warn('[AUTH] 401 received / session expired. Session invalidated.');
  console.log('[AUTH] Session invalidated | Redirecting to login');

  // Clear auth tokens
  setStoredAuthToken(null);

  // Clear cached user/auth storage items
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.removeItem('currentUser');
      localStorage.removeItem('currentUser');
      sessionStorage.removeItem('userRole');
      localStorage.removeItem('userRole');
      sessionStorage.removeItem('kkv_currentUser');
      localStorage.removeItem('kkv_currentUser');
      sessionStorage.removeItem('staffList');
      localStorage.removeItem('staffList');
    } catch {
      // Safe storage access
    }

    window.dispatchEvent(
      new CustomEvent('kkv:session-expired', {
        detail: { reason }
      })
    );
  }

  setTimeout(() => {
    isHandlingAuthExpired = false;
  }, 2500);
}

export function getStoredAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return (
    sessionStorage.getItem('kkv_auth_token') ||
    localStorage.getItem('kkv_auth_token') ||
    sessionStorage.getItem('kkv_session_token') ||
    localStorage.getItem('kkv_session_token') ||
    sessionStorage.getItem('token') ||
    localStorage.getItem('token') ||
    sessionStorage.getItem('authToken') ||
    localStorage.getItem('authToken') ||
    sessionStorage.getItem('kkv_token') ||
    localStorage.getItem('kkv_token') ||
    null
  );
}

export function setStoredAuthToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  if (token) {
    sessionStorage.setItem('kkv_auth_token', token);
    localStorage.setItem('kkv_auth_token', token);
    sessionStorage.setItem('token', token);
    localStorage.setItem('token', token);
    sessionStorage.setItem('authToken', token);
    localStorage.setItem('authToken', token);
    sessionStorage.setItem('kkv_token', token);
    localStorage.setItem('kkv_token', token);
  } else {
    sessionStorage.removeItem('kkv_auth_token');
    localStorage.removeItem('kkv_auth_token');
    sessionStorage.removeItem('kkv_session_token');
    localStorage.removeItem('kkv_session_token');
    sessionStorage.removeItem('token');
    localStorage.removeItem('token');
    sessionStorage.removeItem('authToken');
    localStorage.removeItem('authToken');
    sessionStorage.removeItem('kkv_token');
    localStorage.removeItem('kkv_token');
  }
}

// ── Centralized Axios Client ────────────────────────────────────────────────
export const api: AxiosInstance = axios.create({
  baseURL: getApiBaseUrl(),
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor for dynamic baseUrl, auth token & idempotency key
api.interceptors.request.use((config) => {
  config.baseURL = getApiBaseUrl();
  const token = getStoredAuthToken();
  if (token) {
    if (isTokenExpired(token)) {
      console.warn('[AUTH] Axios request aborted - Token expiration: EXPIRED for url:', config.url);
      handleGlobalAuthExpired('Your session has expired. Please sign in again.');
      return Promise.reject(new axios.Cancel('Session expired'));
    }
    if (config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  if (config.method && config.method.toUpperCase() !== 'GET' && config.method.toUpperCase() !== 'HEAD') {
    if (config.headers) {
      config.headers['x-idempotency-key'] = generateIdempotencyKey();
    }
  }
  return config;
});

// Response interceptor with user-friendly backend connection error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isCancel(error)) {
      return Promise.reject(error);
    }
    if (error.response?.status === 401) {
      console.warn('[AUTH] 401 received on Axios request:', error.config?.url);
      handleGlobalAuthExpired(error.response?.data?.message || 'Your session has expired. Please sign in again.');
    } else if (error.response?.status === 403) {
      console.warn('[API Auth] 403 Forbidden - Access Denied on request:', error.config?.url);
    } else if (error.response?.status === 404) {
      if (error.response?.data?.error === 'DOCUMENT_NOT_FOUND' || error.response?.data?.error === 'FILE_NOT_FOUND') {
        console.warn('[Files API] Requested document not found in storage:', error.config?.url);
      } else {
        console.warn('[API Route] 404 Not Found:', error.config?.url);
      }
    } else if (error.response?.status >= 500) {
      console.error('[API Server] 500 Server Error:', error.response?.data?.message || error.message);
    } else if (!error.response) {
      console.warn('[API Network] Unable to reach KKV Gold Finance local backend at', getApiBaseUrl());
    }
    return Promise.reject(error);
  }
);

export async function fetchWithAuth<T = any>(
  endpoint: string,
  options?: RequestInit
): Promise<{ success: boolean; data?: T; message?: string; status: number }> {
  const baseUrl = getApiBaseUrl();
  const token = getStoredAuthToken();
  const url = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
  const method = (options?.method || 'GET').toUpperCase();

  // Pre-flight JWT expiration check
  if (token && isTokenExpired(token)) {
    console.warn(`[AUTH] Protected request: ${endpoint} | Token present: YES | Token expiration: EXPIRED`);
    handleGlobalAuthExpired('Your session has expired. Please sign in again.');
    return {
      success: false,
      status: 401,
      message: 'Your session has expired. Please sign in again.'
    };
  }

  console.log(
    `[AUTH] Protected request: ${endpoint} | Token present: ${token ? 'YES' : 'NO'} | Token expiration: ${
      token ? 'VALID' : 'N/A'
    }`
  );

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(method !== 'GET' && method !== 'HEAD' ? { 'x-idempotency-key': generateIdempotencyKey() } : {}),
    ...((options?.headers as Record<string, string>) || {})
  };

  try {
    const res = await fetch(url, {
      ...options,
      headers
    });

    if (res.status === 401) {
      console.warn(`[AUTH] 401 received on endpoint: ${endpoint}`);
      const errorJson = await res.json().catch(() => null);
      const msg = errorJson?.message || 'Your session has expired. Please sign in again.';
      handleGlobalAuthExpired(msg);
      return {
        success: false,
        status: 401,
        message: msg
      };
    }

    if (res.status === 403) {
      const errorJson = await res.json().catch(() => null);
      const msg = errorJson?.message || 'Access Denied: You do not have permission for this action.';
      console.warn(`[AUTH] 403 Forbidden on endpoint: ${endpoint} - ${msg}`);
      return {
        success: false,
        status: 403,
        message: msg
      };
    }

    const json = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        success: false,
        status: res.status,
        message: json?.message || `Request failed with status ${res.status}`
      };
    }

    return {
      success: true,
      status: res.status,
      data: json?.data !== undefined ? json.data : json,
      message: json?.message
    };
  } catch (err: any) {
    console.warn(`[API Network Error] Unable to connect to backend at ${url}:`, err?.message || err);
    return {
      success: false,
      status: 0,
      message: err?.message || 'Network error occurred while contacting backend.'
    };
  }
}

async function fetchJson<T>(endpoint: string, options?: RequestInit): Promise<T | null> {
  const result = await fetchWithAuth<T>(endpoint, options);
  if (result.status === 401) {
    return null;
  }
  if (result.status === 403) {
    throw new Error(result.message || 'Access Denied: You do not have permission for this action.');
  }
  if (result.status === 409) {
    throw new Error(result.message || 'Conflict: Record was modified by another staff member. Please refresh and retry.');
  }
  if (!result.success) {
    return null;
  }
  return (result.data as T) ?? null;
}

export const apiService = {
  // ── Authentication & Identity ──────────────────────────────────────────────
  async login(credentials: { email?: string; username?: string; identifier?: string; id?: string; password?: string }) {
    const baseUrl = getApiBaseUrl();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    console.log(`[AUTH] API Base URL: ${baseUrl}`);
    console.log('[AUTH] POST /auth/login');

    let res: Response;
    try {
      res = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
        signal: controller.signal
      });
    } catch (networkErr: any) {
      clearTimeout(timeoutId);
      if (networkErr.name === 'AbortError') {
        throw new Error('Local server request timed out. Please try again.');
      }
      if (typeof window !== 'undefined' && !window.navigator.onLine) {
        throw new Error('You appear to be offline. Please check your network connection.');
      }
      // Network-level failure (backend down, port blocked, etc.)
      throw new Error('Unable to connect to the local server. Please check that the backend is running and try again.');
    } finally {
      clearTimeout(timeoutId);
    }

    console.log(`[AUTH] Response status: ${res.status}`);

    let json: any = {};
    try {
      json = await res.json();
    } catch {
      json = {};
    }

    // Extract authentication payload supporting all standard field conventions
    const token = json.token || json.accessToken || json.access_token || json.data?.token || json.data?.accessToken || json.session?.token;
    const user = json.user || json.data?.user || json.data || (json.role ? json : null);
    const role = json.role || user?.role || 'STAFF';

    // HTTP 200 / 2xx handling
    if (res.ok) {
      // If the response represents a success (success flag true, or valid token/user payload and not explicitly success: false)
      if (json.success === true || (json.success !== false && (Boolean(token) || Boolean(user)))) {
        console.log('[AUTH] Response parsed successfully');
        if (token) {
          setStoredAuthToken(token);
        }
        return {
          success: true,
          token: token || '',
          role,
          user: user || {},
          message: json.message || 'Login successful.'
        };
      }

      // If backend explicitly returned 200 with success: false (defensive fallback)
      throw new Error(json.message || 'Authentication failed. Please verify your credentials.');
    }

    // Map specific HTTP error status codes to user-friendly messages
    switch (res.status) {
      case 400:
        throw new Error(json.message || 'Invalid login request. Please enter your email/staff ID and password.');
      case 401:
        throw new Error(json.message || 'Invalid email/staff ID or password. Please try again.');
      case 403:
        throw new Error(json.message || 'Access denied. Your account may be deactivated. Please contact an administrator.');
      case 404:
        throw new Error(json.message || 'Authentication endpoint not found on the local server.');
      case 422:
        throw new Error(json.message || 'Invalid login request format. Please check your input and try again.');
      case 429:
        throw new Error(json.message || 'Too many login attempts. Please wait a moment before trying again.');
      case 502:
      case 504:
        throw new Error(json.message || 'Unable to connect to local backend server. Please verify the service is running.');
      case 503:
        throw new Error(json.message || 'Local backend service is temporarily unavailable or initializing. Please try again shortly.');
      case 500:
        throw new Error(json.message || 'Local backend error. Please try again in a moment.');
      default:
        throw new Error(json.message || 'Login failed. Please verify your credentials and try again.');
    }
  },

  async getMe() {
    const token = getStoredAuthToken();
    if (!token) return null;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);

    try {
      const res = await fetch(`${getApiBaseUrl()}/auth/me`, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        signal: controller.signal
      });

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          console.warn(`[Auth] Session invalid or expired (${res.status}). Clearing token.`);
          setStoredAuthToken(null);
        }
        return null;
      }

      const json = await res.json();
      return json.user || json.data || json;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.warn('[Auth] Session validation request timed out.');
      } else {
        console.warn('[Auth] Session validation network error:', err?.message || err);
      }
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  },

  async changePassword(payload: { currentPassword: string; newPassword: string }) {
    const token = getStoredAuthToken();
    const res = await fetch(`${getApiBaseUrl()}/auth/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.message || 'Failed to change password');
    }
    return json;
  },

  async logout() {
    const token = getStoredAuthToken();
    try {
      if (token) {
        await fetch(`${getApiBaseUrl()}/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          }
        });
      }
    } finally {
      setStoredAuthToken(null);
    }
    return { success: true };
  },

  // ── Health & Global Search ─────────────────────────────────────────────────
  async getHealth() {
    return fetchJson<{ application: string; storage: string }>('/health');
  },
  async globalSearch(query: string) {
    if (!query || !query.trim()) {
      return { customers: [], loans: [], receipts: [] };
    }
    return fetchJson<{ customers: any[]; loans: any[]; receipts: any[] }>(`/search?q=${encodeURIComponent(query)}`);
  },
  async resolveLocationLink(url: string) {
    try {
      const token = getStoredAuthToken();
      const res = await fetch(`${getApiBaseUrl()}/location/resolve-link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ url })
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.message || 'Failed to resolve location link');
      }
      const json = await res.json();
      return json.data;
    } catch (err: any) {
      throw new Error(err.message || 'Location link resolution failed');
    }
  },

  // ── Customers ──────────────────────────────────────────────────────────────
  async getCustomers(includeDeleted: boolean = false) {
    return fetchJson<any[]>(`/customers${includeDeleted ? '?includeDeleted=true' : ''}`);
  },
  async getCustomerById(id: string) {
    return fetchJson<any>(`/customers/${encodeURIComponent(id)}`);
  },
  async getCustomerKyc(id: string) {
    return fetchJson<any>(`/customers/${encodeURIComponent(id)}/kyc`);
  },
  async searchCustomers(query: string) {
    if (!query || !query.trim()) {
      return this.getCustomers();
    }
    return fetchJson<any[]>(`/customers/search?query=${encodeURIComponent(query)}`);
  },
  async createCustomer(customer: any) {
    return fetchJson<any>('/customers', {
      method: 'POST',
      body: JSON.stringify(customer),
    });
  },
  async createCustomerFormData(formData: FormData) {
    const baseUrl = getApiBaseUrl();
    const token = getStoredAuthToken();
    try {
      const res = await axios.post(`${baseUrl}/customers`, formData, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'x-idempotency-key': generateIdempotencyKey()
        }
      });
      return res.data;
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Customer creation failed';
      throw new Error(msg);
    }
  },
  async updateCustomer(id: string, customer: any) {
    return fetchJson<any>(`/customers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(customer),
    });
  },
  async updateCustomerFormData(id: string, formData: FormData) {
    const baseUrl = getApiBaseUrl();
    const token = getStoredAuthToken();
    try {
      const res = await axios.put(`${baseUrl}/customers/${id}`, formData, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'x-idempotency-key': generateIdempotencyKey()
        }
      });
      return res.data;
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Customer update failed';
      throw new Error(msg);
    }
  },
  async deleteCustomer(id: string) {
    return fetchJson<{ success: boolean; message: string }>(`/customers/${id}`, {
      method: 'DELETE'
    });
  },
  async restoreCustomer(id: string) {
    return fetchJson<{ success: boolean; message: string }>(`/customers/${id}/restore`, {
      method: 'POST'
    });
  },
  async deleteCustomerPermanently(id: string) {
    return fetchJson<{ success: boolean; message: string }>(`/customers/${id}/permanent`, {
      method: 'DELETE'
    });
  },
  async uploadCustomerKyc(
    customerId: string,
    file: File | Blob,
    metadata: {
      documentType: string;
      documentName?: string;
      documentNumber?: string;
    },
    onProgress?: (percent: number) => void
  ) {
    const baseUrl = getApiBaseUrl();
    const token = getStoredAuthToken();
    const formData = new FormData();
    formData.append('file', file, metadata.documentName || (file as File).name || `${metadata.documentType}.pdf`);
    formData.append('documentType', metadata.documentType);
    if (metadata.documentName) formData.append('documentName', metadata.documentName);
    if (metadata.documentNumber) formData.append('documentNumber', metadata.documentNumber);

    try {
      const res = await axios.post(`${baseUrl}/customers/${encodeURIComponent(customerId)}/kyc`, formData, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'x-idempotency-key': generateIdempotencyKey()
        },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total && onProgress) {
            const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            onProgress(percent);
          }
        }
      });
      return res.data;
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Failed to upload KYC document';
      throw new Error(msg);
    }
  },
  async deleteCustomerKyc(customerId: string, docId: string) {
    return fetchJson<{ success: boolean; message: string; data?: any }>(
      `/customers/${encodeURIComponent(customerId)}/kyc/${encodeURIComponent(docId)}`,
      { method: 'DELETE' }
    );
  },

  // ── Loans ──────────────────────────────────────────────────────────────────
  async getLoans() {
    return fetchJson<any[]>('/loans');
  },
  async getLoanByNo(loanNo: string) {
    return fetchJson<any>(`/loans/${loanNo}`);
  },
  async getCustomerLoans(customerId: string) {
    return fetchJson<any[]>(`/customers/${customerId}/loans`);
  },
  async createLoan(loan: any) {
    return fetchJson<any>('/loans', {
      method: 'POST',
      body: JSON.stringify(loan),
    });
  },
  async updateLoan(id: string, updates: any) {
    return fetchWithAuth<any>(`/loans/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },
  async deleteLoan(id: string, reason: string) {
    return fetchWithAuth<{ success: boolean; message: string }>(`/loans/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      body: JSON.stringify({ reason }),
    });
  },
  async closeLoan(loanNo: string) {
    return fetchJson<any>(`/loans/${loanNo}/close`, {
      method: 'POST',
    });
  },

  // ── Receipts ───────────────────────────────────────────────────────────────
  async getReceipts() {
    return fetchJson<any[]>('/receipts');
  },
  async getReceiptByNo(receiptNo: number | string) {
    return fetchJson<any>(`/receipts/${receiptNo}`);
  },
  async createReceipt(receipt: any) {
    return fetchJson<any>('/receipts', {
      method: 'POST',
      body: JSON.stringify(receipt),
    });
  },
  async downloadReceiptPdf(receiptId: string | number) {
    const baseUrl = getApiBaseUrl();
    const token = getStoredAuthToken();
    const res = await fetch(`${baseUrl}/receipts/${receiptId}/pdf`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(json.message || 'Failed to generate receipt PDF voucher.');
    }
    return res.blob();
  },

  // ── Fixed Deposits ─────────────────────────────────────────────────────────
  async getFDCustomers() {
    return fetchJson<any[]>('/fd/customers');
  },
  async createFDCustomer(customer: any) {
    return fetchJson<any>('/fd/customers', {
      method: 'POST',
      body: JSON.stringify(customer),
    });
  },
  async getFixedDeposits() {
    return fetchJson<any[]>('/fd/deposits');
  },
  async createFixedDeposit(fd: any) {
    return fetchJson<any>('/fd/deposits', {
      method: 'POST',
      body: JSON.stringify(fd),
    });
  },
  async downloadFDReceiptPdf(fdNo: string) {
    const baseUrl = getApiBaseUrl();
    const token = getStoredAuthToken();
    const res = await fetch(`${baseUrl}/fd/deposits/${encodeURIComponent(fdNo)}/receipt/pdf`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(json.message || 'Failed to generate Fixed Deposit receipt PDF.');
    }
    return res.blob();
  },
  async downloadFDInterestReceiptPdf(voucherOrId: string) {
    const baseUrl = getApiBaseUrl();
    const token = getStoredAuthToken();
    const res = await fetch(`${baseUrl}/fd/interest/${encodeURIComponent(voucherOrId)}/receipt/pdf`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(json.message || 'Failed to generate Fixed Deposit interest receipt PDF.');
    }
    return res.blob();
  },
  async payFDInterest(fdNo: string, amount: number, mode: string, options?: any, periodKey?: string) {
    const payload = typeof options === 'object' && options !== null
      ? { amount, mode, ...options }
      : { amount, mode, dueDate: options, periodKey };
    return fetchJson<any>(`/fd/deposits/${fdNo}/payout`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },
  async withdrawFD(
    fdNo: string,
    mode: string,
    notes?: string,
    withdrawalAmount?: number,
    transactionReference?: string,
    bankName?: string
  ) {
    return fetchJson<any>(`/fd/deposits/${fdNo}/withdraw`, {
      method: 'POST',
      body: JSON.stringify({ mode, notes, withdrawalAmount, transactionReference, bankName })
    });
  },
  async renewFD(fdNo: string, periodMonths: number, notes?: string) {
    return fetchJson<any>(`/fd/deposits/${fdNo}/renew`, {
      method: 'POST',
      body: JSON.stringify({ periodMonths, notes })
    });
  },
  async deleteFixedDeposit(fdNo: string) {
    return fetchJson<{ success: boolean; message: string }>(`/fd/deposits/${fdNo}`, {
      method: 'DELETE'
    });
  },
  async getFDPayouts() {
    return fetchJson<any[]>('/fd/payouts');
  },
  async getFDWithdrawals() {
    return fetchJson<any[]>('/fd/withdrawals');
  },
  async getFDRenewals() {
    return fetchJson<any[]>('/fd/renewals');
  },
  async getFDConfig() {
    return fetchJson<any>('/fd/config');
  },
  async updateFDConfig(config: any) {
    return fetchJson<any>('/fd/config', {
      method: 'PUT',
      body: JSON.stringify(config)
    });
  },
  async bulkUpdateFDDates(fdNos: string[], newDepositDate?: string, offsetDays?: number) {
    return fetchJson<any>(`/fd/deposits/bulk-date-change`, {
      method: 'POST',
      body: JSON.stringify({ fdNos, newDepositDate, offsetDays })
    });
  },

  // ── Accounting / Day Book ──────────────────────────────────────────────────
  async getDayBook() {
    return fetchJson<any[]>('/accounting/day-book');
  },
  async createVoucher(entry: any) {
    return fetchJson<any>('/accounting/vouchers', {
      method: 'POST',
      body: JSON.stringify(entry),
    });
  },
  async getBalances() {
    return fetchJson<{ cashInHand: number; cashAtBank: number }>('/accounting/balances');
  },

  // ── Dashboard ──────────────────────────────────────────────────────────────
  async getDashboardSummary(branchId?: string) {
    const query = branchId ? `?branchId=${encodeURIComponent(branchId)}` : '';
    return fetchJson<{ success: boolean; data: import('../types').DashboardSummaryData }>(`/dashboard/summary${query}`);
  },

  // ── Admin & Settings ───────────────────────────────────────────────────────
  async getMasterSettings() {
    return fetchJson<any>('/admin/settings');
  },
  async getBranchSettings(branchId?: string) {
    const query = branchId ? `?branchId=${encodeURIComponent(branchId)}` : '';
    return fetchJson<any>(`/config/branch${query}`).catch(() => fetchJson<any>(`/admin/branch-settings${query}`));
  },
  async updateBranchSettings(branchSettings: any) {
    return fetchJson<any>('/admin/branch-settings', {
      method: 'PUT',
      body: JSON.stringify(branchSettings)
    });
  },
  // Read-only settings accessible to ADMIN + STAFF + RENTAL_STAFF.
  // Returns loan types, FD config, repayment systems — no passwords.
  // Call this on every page load for ALL roles to ensure fresh config.
  async getPublicSettings() {
    return fetchJson<any>('/config/settings');
  },
  async updateMasterSettings(settings: any) {
    return fetchJson<any>('/admin/settings', {
      method: 'PUT',
      body: JSON.stringify(settings)
    });
  },
  async getWhatsAppTemplates() {
    return fetchJson<any>('/admin/whatsapp-templates');
  },
  async updateWhatsAppTemplates(templates: any) {
    return fetchJson<any>('/admin/whatsapp-templates', {
      method: 'PUT',
      body: JSON.stringify(templates)
    });
  },
  async unlockMasterControl(password: string): Promise<{ success: boolean; message?: string }> {
    try {
      const res = await fetch(`${getApiBaseUrl()}/admin/unlock`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(getStoredAuthToken() ? { Authorization: `Bearer ${getStoredAuthToken()}` } : {})
        },
        body: JSON.stringify({ password })
      });
      const json = await res.json().catch(() => ({}));
      return { success: res.ok && json.success, message: json.message };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Failed to communicate with backend.' };
    }
  },
  async changeMasterPassword(currentPassword: string, newPassword: string): Promise<{ success: boolean; message?: string }> {
    try {
      const res = await fetch(`${getApiBaseUrl()}/admin/change-master-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(getStoredAuthToken() ? { Authorization: `Bearer ${getStoredAuthToken()}` } : {})
        },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      const json = await res.json().catch(() => ({}));
      return { success: res.ok && json.success, message: json.message };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Failed to update Master Control password.' };
    }
  },

  // ── Configuration Center & Storage Diagnostics ────────────────────────────
  async getConfigCenterStatus() {
    return fetchJson<any>('/config-center/status');
  },
  async unlockConfigCenter(password: string) {
    return fetchJson<any>('/config-center/auth/unlock', {
      method: 'POST',
      body: JSON.stringify({ password })
    });
  },

  // ── Backup & Restore ───────────────────────────────────────────────────────
  async createCloudBackup(backupData?: any, deviceId?: string) {
    return fetchJson<any>('/backup/create', {
      method: 'POST',
      body: JSON.stringify({ backupData, deviceId })
    });
  },
  async exportBackup() {
    return fetchJson<any>('/backup/export');
  },
  async restoreBackup(data: any) {
    return fetchJson<any>('/backup/restore', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },
  async backupAndClose(user?: { userId?: string; name?: string; role?: string }) {
    return fetchJson<any>('/backup/close', {
      method: 'POST',
      body: JSON.stringify(user || {})
    });
  },
  async checkAutoRestore() {
    return fetchJson<any>('/backup/auto-restore-check');
  },
  async getSyncStatus() {
    return fetchJson<any>('/sync/status');
  },
  async pullSync() {
    return fetchJson<any>('/sync/pull', {
      method: 'POST'
    });
  },
  async pushSnapshot() {
    return fetchJson<any>('/sync/push', {
      method: 'POST'
    });
  },
  async retrySyncQueue() {
    return fetchJson<any>('/sync/retry', {
      method: 'POST'
    });
  },
  async getSyncEvents() {
    return fetchJson<any>('/sync/events');
  },


  // ── Production Backup Package Management ───────────────────────────────────
  async createLatestBackup(): Promise<{ success: boolean; data?: any; message?: string }> {
    return fetchWithAuth('/admin/backup/create-latest', {
      method: 'POST'
    });
  },

  async createBackupPackage(): Promise<{ success: boolean; data?: any; message?: string }> {
    return this.createLatestBackup();
  },

  async getBackupHistory(): Promise<{ success: boolean; data?: any[]; message?: string }> {
    const res = await fetchWithAuth<any[]>('/admin/backup/history');
    return {
      success: res.success,
      data: res.data || [],
      message: res.message
    };
  },

  getBackupDownloadUrl(backupId: string): string {
    return `${getApiBaseUrl()}/admin/backup/${encodeURIComponent(backupId)}/download`;
  },

  async downloadBackup(
    backupId: string,
    customFileName?: string
  ): Promise<{ success: boolean; fileName?: string; message?: string }> {
    try {
      const token = getStoredAuthToken();
      if (!token || isTokenExpired(token)) {
        console.warn('[BACKUP DOWNLOAD] Aborted: Token missing or expired.');
        handleGlobalAuthExpired('Your session has expired. Please sign in again.');
        return {
          success: false,
          message: 'Your session has expired. Please sign in again.'
        };
      }

      const url = `${getApiBaseUrl()}/admin/backup/${encodeURIComponent(backupId)}/download`;
      console.log(`[BACKUP DOWNLOAD] Starting authenticated GET request: ${url}`);
      console.log(`[BACKUP DOWNLOAD] Auth token attached: YES (Bearer)`);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      console.log(`[BACKUP DOWNLOAD] Response status: ${response.status}`);

      if (response.status === 401) {
        console.warn('[BACKUP DOWNLOAD] 401 received: Session expired.');
        handleGlobalAuthExpired('Your session has expired. Please sign in again.');
        return {
          success: false,
          message: 'Your session has expired. Please sign in again.'
        };
      }

      if (!response.ok) {
        let errMsg = `Backup download failed with status ${response.status}`;
        try {
          const errJson = await response.json();
          if (errJson.message) errMsg = errJson.message;
        } catch {
          // ignore
        }
        if (response.status === 403) {
          errMsg = 'You do not have administrative permission to download system backups.';
        } else if (response.status === 404) {
          errMsg = 'Backup archive file not found on server.';
        }
        console.warn(`[BACKUP DOWNLOAD] Error response: ${errMsg}`);
        return { success: false, message: errMsg };
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const json = await response.json();
        console.warn('[BACKUP DOWNLOAD] Unexpected JSON response instead of binary:', json);
        return {
          success: false,
          message: json.message || 'Server returned an error response instead of backup ZIP binary.'
        };
      }

      let filename = customFileName || '';
      const disposition = response.headers.get('content-disposition');
      if (disposition && disposition.includes('filename=')) {
        const match = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (match && match[1]) {
          filename = match[1].replace(/['"]/g, '').trim();
        }
      }
      if (!filename) {
        filename = `KKV_GOLD_FINANCE_BACKUP_${backupId}.zip`;
      }

      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.setAttribute('download', filename);
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();

      setTimeout(() => {
        if (document.body.contains(link)) {
          document.body.removeChild(link);
        }
        window.URL.revokeObjectURL(blobUrl);
      }, 1000);

      console.log(`[BACKUP DOWNLOAD] ✓ File download initiated successfully: ${filename} (${blob.size} bytes)`);
      return { success: true, fileName: filename };
    } catch (err: any) {
      console.error('[BACKUP DOWNLOAD] Network error during backup download:', err);
      return { success: false, message: err?.message || 'Network error during backup download.' };
    }
  },

  async acknowledgeBackupDownload(backupId: string): Promise<{ success: boolean; data?: any; message?: string }> {
    return fetchWithAuth(`/admin/backup/${encodeURIComponent(backupId)}/acknowledge-download`, {
      method: 'POST'
    });
  },

  async listBackupPackages(): Promise<{ success: boolean; data?: any[]; message?: string }> {
    const res = await fetchWithAuth<any[]>('/admin/backup/history');
    return {
      success: res.success,
      data: res.data || [],
      message: res.message
    };
  },

  async downloadBackupPackage(
    backupId: string,
    customFileName?: string
  ): Promise<{ success: boolean; fileName?: string; message?: string }> {
    return this.downloadBackup(backupId, customFileName);
  },

  async deleteBackup(backupId: string): Promise<{ success: boolean; message?: string }> {
    return fetchWithAuth(`/admin/backup/${encodeURIComponent(backupId)}`, {
      method: 'DELETE'
    });
  },

  async getDatabaseInfo(): Promise<{
    success: boolean;
    status: string;
    databaseType: string;
    storageLocation: string;
    lastAutoSync: string;
    lastBackup: string;
    databaseSize: string;
    collectionsCount: number;
    totalRecords: number;
    collections: Record<string, number>;
    message?: string;
  }> {
    const res = await fetchWithAuth<any>('/admin/database/info');
    if (res.success) {
      const data = res.data || res;
      return {
        success: true,
        status: data.status || 'Connected',
        databaseType: data.databaseType || 'Local Storage',
        storageLocation: data.storageLocation || 'Local',
        lastAutoSync: data.lastAutoSync || '',
        lastBackup: data.lastBackup || 'Never',
        databaseSize: data.databaseSize || '0 KB',
        collectionsCount: data.collectionsCount || 10,
        totalRecords: data.totalRecords || 0,
        collections: data.collections || {}
      };
    }
    return {
      success: false,
      status: 'Disconnected',
      databaseType: 'Local Storage',
      storageLocation: 'Local',
      lastAutoSync: '',
      lastBackup: 'Never',
      databaseSize: '0 KB',
      collectionsCount: 0,
      totalRecords: 0,
      collections: {},
      message: res.message
    };
  },

  async clearSyncCache(): Promise<{ success: boolean; message?: string }> {
    return fetchWithAuth('/admin/danger/clear-sync-cache', {
      method: 'POST'
    });
  },

  // ── Wipe All Data ──────────────────────────────────────────────────────────
  async getWipePreview(): Promise<{
    success: boolean;
    data?: any;
    message?: string;
  }> {
    return fetchWithAuth('/admin/wipe-all-data/preview');
  },

  async initiateWipeBackup(confirmationText: string): Promise<{ success: boolean; data?: any; message?: string }> {
    return fetchWithAuth('/admin/wipe-all-data/initiate', {
      method: 'POST',
      body: JSON.stringify({ confirmationText })
    });
  },

  async confirmSystemWipe(token: string, confirmationText: string): Promise<{ success: boolean; data?: any; message?: string }> {
    return fetchWithAuth('/admin/wipe-all-data/confirm', {
      method: 'POST',
      body: JSON.stringify({ token, confirmationText })
    });
  },

  async getRestoreBackups(): Promise<{ success: boolean; data?: any[]; message?: string }> {
    const res = await fetchWithAuth<any[]>('/admin/system/backups');
    return {
      success: res.success,
      data: res.data || [],
      message: res.message
    };
  },

  async getAvailableBackups(): Promise<{ success: boolean; data?: any[]; message?: string }> {
    return this.getRestoreBackups();
  },

  async validateRestoreBackup(payload: {
    fileId?: string;
    backupId?: string;
    file?: File;
    jsonString?: string;
  }): Promise<{ success: boolean; data?: any; message?: string }> {
    const token = getStoredAuthToken();
    if (payload.file) {
      const formData = new FormData();
      formData.append('backupFile', payload.file);
      try {
        if (token && isTokenExpired(token)) {
          handleGlobalAuthExpired();
          return { success: false, message: 'Your session has expired. Please sign in again.' };
        }
        const res = await fetch(`${getApiBaseUrl()}/admin/system/restore/validate`, {
          method: 'POST',
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: formData
        });
        if (res.status === 401) {
          handleGlobalAuthExpired();
          return { success: false, message: 'Your session has expired. Please sign in again.' };
        }
        const json = await res.json();
        return {
          success: res.ok && json.success,
          data: json.data,
          message: json.message
        };
      } catch (err: any) {
        return { success: false, message: err?.message || 'Network error during backup validation.' };
      }
    } else {
      return fetchWithAuth('/admin/system/restore/validate', {
        method: 'POST',
        body: JSON.stringify({
          fileId: payload.fileId,
          backupId: payload.backupId,
          jsonString: payload.jsonString
        })
      });
    }
  },

  async executeSystemRestore(token: string, confirmationText: string, mode: 'replace' | 'merge' = 'replace'): Promise<{ success: boolean; data?: any; message?: string; restore?: any; recordCounts?: any; report?: any }> {
    return fetchWithAuth('/admin/system/restore', {
      method: 'POST',
      body: JSON.stringify({ token, confirmationText, mode })
    });
  },

  async getRestoreHistory(): Promise<{ success: boolean; data: any[]; message?: string }> {
    const res = await fetchWithAuth<any[]>('/admin/system/restore/history');
    return { success: res.success, data: res.data || [], message: res.message };
  },

  // ── Device & Session Management ────────────────────────────────────────────
  async getSessions(): Promise<{ success: boolean; data: any[]; message?: string }> {
    const res = await fetchWithAuth<any[]>('/sessions');
    return { success: res.success, data: res.data || [], message: res.message };
  },

  async registerSession(sessionData: any): Promise<{ success: boolean; data?: any; message?: string }> {
    return fetchWithAuth('/sessions/register', {
      method: 'POST',
      body: JSON.stringify(sessionData)
    });
  },

  async revokeSession(sessionId: string): Promise<{ success: boolean; message?: string }> {
    return fetchWithAuth(`/sessions/${sessionId}/revoke`, {
      method: 'POST'
    });
  },

  async revokeOtherSessions(currentSessionId: string): Promise<{ success: boolean; revokedCount?: number; message?: string }> {
    return fetchWithAuth('/sessions/revoke-others', {
      method: 'POST',
      body: JSON.stringify({ currentSessionId })
    });
  },

  async revokeAllSessions(): Promise<{ success: boolean; revokedCount?: number; message?: string }> {
    return fetchWithAuth('/sessions/revoke-all', {
      method: 'POST'
    });
  },

  async checkSessionStatus(sessionId: string): Promise<{ success: boolean; data?: { isValid: boolean; isRevoked?: boolean; session?: any }; message?: string }> {
    return fetchWithAuth(`/sessions/check/${sessionId}`);
  },

  // ── Centralized Safe Authenticated Request Helper ───────────────────────────
  async fetchStaffApi<T = any>(endpoint: string, options?: RequestInit): Promise<{ success: boolean; data?: T; message?: string; temporaryPassword?: string }> {
    const res = await fetchWithAuth<T>(endpoint, options);
    return {
      success: res.success,
      data: res.data,
      message: res.message,
      temporaryPassword: (res as any).temporaryPassword || (res.data as any)?.temporaryPassword
    };
  },

  // ── Staff Management (ADMIN Only) ──────────────────────────────────────────
  async getStaffList(): Promise<{ success: boolean; data: any[]; message?: string }> {
    const res = await this.fetchStaffApi<any[]>('/admin/staff');
    return {
      success: res.success,
      data: Array.isArray(res.data) ? res.data : (res.data as any)?.items || [],
      message: res.message
    };
  },

  async createStaff(staffData: any): Promise<{ success: boolean; data?: any; message?: string }> {
    const res = await this.fetchStaffApi('/admin/staff', {
      method: 'POST',
      body: JSON.stringify(staffData)
    });
    return {
      success: res.success,
      data: res.data,
      message: res.message
    };
  },

  async updateStaff(id: string, updates: any): Promise<{ success: boolean; data?: any; message?: string }> {
    const res = await this.fetchStaffApi(`/admin/staff/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    });
    return {
      success: res.success,
      data: res.data,
      message: res.message
    };
  },

  async toggleStaffStatus(id: string, isActive: boolean): Promise<{ success: boolean; data?: any; message?: string }> {
    const res = await this.fetchStaffApi(`/admin/staff/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive })
    });
    return {
      success: res.success,
      data: res.data,
      message: res.message
    };
  },

  async resetStaffPassword(id: string, newPassword?: string): Promise<{ success: boolean; temporaryPassword?: string; message?: string }> {
    const res = await this.fetchStaffApi(`/admin/staff/${id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ newPassword })
    });
    return {
      success: res.success,
      temporaryPassword: res.temporaryPassword,
      message: res.message
    };
  },

  async deleteStaff(id: string): Promise<{ success: boolean; message?: string }> {
    const res = await this.fetchStaffApi(`/admin/staff/${id}`, {
      method: 'DELETE'
    });
    return {
      success: res.success,
      message: res.message
    };
  },

  async getStaffAuditLogs(): Promise<{ success: boolean; data: any[]; message?: string }> {
    const res = await this.fetchStaffApi<any[]>('/admin/audit-logs');
    return {
      success: res.success,
      data: Array.isArray(res.data) ? res.data : [],
      message: res.message
    };
  },

  async retryStaffDriveAccess(staffId: string): Promise<{
    success: boolean;
    driveAccessGranted: boolean;
    driveAccessStatus: string;
    message?: string;
  }> {
    const res = await this.fetchStaffApi<any>(`/admin/staff/${staffId}/retry-drive-access`, {
      method: 'POST'
    });
    return {
      success: (res as any).success || false,
      driveAccessGranted: (res as any).driveAccessGranted || false,
      driveAccessStatus: (res as any).driveAccessStatus || 'unknown',
      message: (res as any).message
    };
  },

  async getNextLoanSequence(): Promise<{ nextSequence: number; loanNo: string; receiptNo: number } | null> {
    const res = await fetchWithAuth<{ nextSequence: number; loanNo: string; receiptNo: number }>('/loans/next-sequence');
    if (res.success && res.data) {
      return res.data;
    }
    return null;
  },

  async restoreLatestBackup(): Promise<{ success: boolean; data?: any; message?: string }> {
    return this.restoreBackup(true);
  },

  async uploadFile(
    file: File | Blob,
    options: {
      entityType: string;
      entityId?: string;
      documentType?: string;
      fileName?: string;
      onProgress?: (percent: number) => void;
    }
  ): Promise<{ success: boolean; data?: any; message?: string }> {
    try {
      const formData = new FormData();
      formData.append('file', file, options.fileName || (file as File).name || 'upload_file');
      formData.append('entityType', options.entityType);
      if (options.entityId) formData.append('entityId', options.entityId);
      if (options.documentType) formData.append('documentType', options.documentType);

      const res = await api.post('/files/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total && options.onProgress) {
            const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            options.onProgress(percent);
          }
        }
      });

      return {
        success: true,
        data: res.data?.data || res.data,
        message: res.data?.message || 'File uploaded successfully'
      };
    } catch (err: any) {
      console.error('[apiService] uploadFile error:', err);
      const msg = err.response?.data?.message || err.message || 'File upload failed';
      return { success: false, message: msg };
    }
  },

  getFileViewUrl(fileIdOrPath: string): string {
    if (!fileIdOrPath) return '';
    if (fileIdOrPath.startsWith('http://') || fileIdOrPath.startsWith('https://') || fileIdOrPath.startsWith('data:')) {
      return fileIdOrPath;
    }
    const clean = fileIdOrPath.startsWith('/') ? fileIdOrPath : `/files/${fileIdOrPath}/view`;
    return `${getApiBaseUrl()}${clean.startsWith('/api') ? clean.replace(/^\/api/, '') : clean}`;
  },

  /**
   * Fetches protected file via authenticated Axios request with Bearer token
   * and converts the response to a temporary Blob URL for viewing/previewing.
   */
  async getFileBlob(fileIdOrUrl: string): Promise<{ success: boolean; blob?: Blob; blobUrl?: string; mimeType?: string; message?: string }> {
    try {
      if (!fileIdOrUrl) {
        return { success: false, message: 'Invalid file reference' };
      }

      const trimmed = fileIdOrUrl.trim();

      // If already a data URI or local blob URL
      if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
        return { success: true, blobUrl: trimmed, mimeType: trimmed.startsWith('data:image') ? 'image/jpeg' : undefined };
      }

      let endpoint = '';

      // Match /api/files/:id/view or /files/:id/view or /api/files/:id
      const apiMatch = trimmed.match(/(?:\/api)?\/files\/([^\/\?\#]+)(?:\/(?:view|download))?/i);
      if (apiMatch && apiMatch[1]) {
        endpoint = `/files/${apiMatch[1]}/view`;
      } else {
        const clean = trimmed.replace(/^https?:\/\/[^\/]+/, '').replace(/^\/api\//, '').replace(/^\//, '');
        if (clean.startsWith('files/')) {
          endpoint = `/${clean.replace(/\/download$/, '/view')}`;
          if (!endpoint.endsWith('/view')) endpoint += '/view';
        } else {
          endpoint = `/files/${clean}/view`;
        }
      }

      const response = await api.get(endpoint, {
        responseType: 'blob'
      });

      const rawHeader = response.headers ? response.headers['content-type'] : null;
      let mimeType = (typeof rawHeader === 'string' ? rawHeader : response.data?.type) || 'application/octet-stream';
      if (mimeType.includes(';')) {
        mimeType = mimeType.split(';')[0].trim();
      }

      const blob = new Blob([response.data], { type: mimeType });
      const blobUrl = URL.createObjectURL(blob);

      return {
        success: true,
        blob,
        blobUrl,
        mimeType
      };
    } catch (err: any) {
      console.error('[apiService] getFileBlob error:', err);
      let msg = err.response?.data?.message || err.message || 'Failed to retrieve file from secure storage';
      if (err.response?.status === 401) {
        msg = 'Authentication token is required. Please sign in.';
      } else if (err.response?.status === 403) {
        msg = 'Access denied. You do not have permission to view KYC documents.';
      } else if (err.response?.status === 404) {
        msg = 'Document not found in secure storage.';
      }
      return { success: false, message: msg };
    }
  },

  /**
   * Authenticated document view helper that fetches the document blob with Bearer token
   * and opens it in a new browser tab with the appropriate MIME type.
   */
  async viewProtectedDocument(fileIdOrDoc: any, _title?: string): Promise<{ success: boolean; blobUrl?: string; mimeType?: string; message?: string }> {
    try {
      if (!fileIdOrDoc) {
        return { success: false, message: 'Invalid document reference' };
      }

      let target = fileIdOrDoc;
      if (typeof fileIdOrDoc === 'object' && fileIdOrDoc !== null) {
        target =
          fileIdOrDoc.fileId ||
          fileIdOrDoc.storagePath ||
          fileIdOrDoc.viewUrl ||
          fileIdOrDoc.url ||
          fileIdOrDoc.id ||
          '';
      }

      if (!target) {
        return { success: false, message: 'No document target found' };
      }

      const res = await this.getFileBlob(target);
      if (!res.success || !res.blobUrl) {
        return {
          success: false,
          message: res.message || 'Unable to open document. Please check permissions.'
        };
      }

      const opened = window.open(res.blobUrl, '_blank', 'noopener,noreferrer');
      if (!opened) {
        console.warn('[apiService] Popup was blocked by browser for document blob');
      }

      return {
        success: true,
        blobUrl: res.blobUrl,
        mimeType: res.mimeType
      };
    } catch (err: any) {
      console.error('[apiService] viewProtectedDocument error:', err);
      return {
        success: false,
        message: err.message || 'Failed to view document'
      };
    }
  },

  /**
   * Securely downloads protected file with Bearer token authentication
   */
  async downloadProtectedFile(fileIdOrDoc: any, fileName?: string): Promise<{ success: boolean; message?: string }> {
    try {
      if (!fileIdOrDoc) return { success: false, message: 'Invalid file reference' };

      let target = fileIdOrDoc;
      let preferredName = fileName;
      if (typeof fileIdOrDoc === 'object' && fileIdOrDoc !== null) {
        target =
          fileIdOrDoc.fileId ||
          fileIdOrDoc.storagePath ||
          fileIdOrDoc.viewUrl ||
          fileIdOrDoc.url ||
          fileIdOrDoc.id ||
          '';
        preferredName = fileName || fileIdOrDoc.fileName || fileIdOrDoc.originalFileName || fileIdOrDoc.documentName;
      }

      const res = await this.getFileBlob(target);
      if (!res.success || !res.blob || !res.blobUrl) {
        return { success: false, message: res.message || 'Failed to download document' };
      }

      const blobUrl = res.blobUrl;
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = preferredName || 'document';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => {
        if (!blobUrl.startsWith('data:')) {
          URL.revokeObjectURL(blobUrl);
        }
      }, 1000);

      return { success: true };
    } catch (err: any) {
      console.error('[apiService] downloadProtectedFile error:', err);
      return { success: false, message: err.message || 'Failed to download document' };
    }
  },

  async deleteFile(fileId: string): Promise<{ success: boolean; message?: string }> {
    try {
      const res = await api.delete(`/files/${fileId}`);
      return { success: true, message: res.data?.message || 'File deleted' };
    } catch (err: any) {
      return { success: false, message: err.response?.data?.message || err.message || 'Failed to delete file' };
    }
  }
};

export default apiService;
