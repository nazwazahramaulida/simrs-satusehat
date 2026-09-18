import { CONFIG, api } from './config.js';

export class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
    this.offline = status === 0;
  }
}

export function getToken() {
  return localStorage.getItem(CONFIG.TOKEN_KEY);
}
export function setSession(token, user) {
  localStorage.setItem(CONFIG.TOKEN_KEY, token);
  localStorage.setItem(CONFIG.USER_KEY, JSON.stringify(user));
}
export function getUser() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG.USER_KEY) || 'null');
  } catch {
    return null;
  }
}
export function clearSession() {
  localStorage.removeItem(CONFIG.TOKEN_KEY);
  localStorage.removeItem(CONFIG.USER_KEY);
}

export async function request(path, { method = 'GET', body, headers = {}, auth = true, timeout = 20000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const token = getToken();

  let res;
  try {
    res = await fetch(api(path), {
      method,
      signal: controller.signal,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    clearTimeout(timer);
    // status 0 = tidak sampai ke server (offline / timeout / DNS)
    throw new ApiError(
      navigator.onLine ? 'Tidak dapat menghubungi server' : 'Perangkat sedang offline',
      0,
      { cause: err.name }
    );
  }
  clearTimeout(timer);

  const text = await res.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }

  if (res.status === 401) {
    // Pasien dikembalikan ke portal, petugas ke login klinik.
    const user = getUser();
    const loginPage = user && user.kind === 'patient' ? 'portal-login.html' : 'login.html';
    clearSession();
    if (!/login\.html$/.test(location.pathname)) location.replace(`${loginPage}?expired=1`);
    throw new ApiError('Sesi berakhir', 401, payload);
  }
  if (!res.ok) {
    throw new ApiError((payload && payload.error && payload.error.message) || `HTTP ${res.status}`, res.status, payload);
  }
  return payload;
}

export const API = {
  login: (username, password) => request('/api/auth/login', { method: 'POST', body: { username, password }, auth: false }),
  me: () => request('/api/auth/me'),
  health: () => request('/api/health', { auth: false, timeout: 6000 }),

  listPatients: (params = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null));
    return request(`/api/patients?${q}`);
  },
  getPatient: (id) => request(`/api/patients/${id}`),
  createPatient: (payload, idempotencyKey) =>
    request('/api/patients', {
      method: 'POST',
      body: payload,
      headers: idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : {},
      timeout: 30000,
    }),
  syncPatient: (id) => request(`/api/patients/${id}/sync`, { method: 'POST', timeout: 30000 }),
  patientFhir: (id) => request(`/api/patients/${id}/fhir`),

  /* ---------- katalog acuan (ICD-10, obat, tarif, penjamin) ---------- */
  catalog: (type, q) =>
    request(`/api/catalog?${new URLSearchParams({ ...(type ? { type } : {}), ...(q ? { q } : {}) })}`, { timeout: 30000 }),

  /* ---------- kunjungan ---------- */
  listEncounters: (params = {}) => request(`/api/encounters?${new URLSearchParams(params)}`),
  getEncounter: (id) => request(`/api/encounters/${id}`),
  createEncounter: (body) => request('/api/encounters', { method: 'POST', body, timeout: 30000 }),
  updateEncounter: (id, body) => request(`/api/encounters/${id}`, { method: 'PATCH', body, timeout: 30000 }),

  /* ---------- diagnosis & resep ---------- */
  listConditions: (encounterId) => request(`/api/conditions?encounter_id=${encodeURIComponent(encounterId)}`),
  createCondition: (body) => request('/api/conditions', { method: 'POST', body, timeout: 30000 }),
  listPrescriptions: (params = {}) => request(`/api/prescriptions?${new URLSearchParams(params)}`),
  getPrescription: (id) => request(`/api/prescriptions/${id}`),
  createPrescription: (body) => request('/api/prescriptions', { method: 'POST', body, timeout: 30000 }),
  dispensePrescription: (id, body) => request(`/api/prescriptions/${id}`, { method: 'PATCH', body, timeout: 30000 }),
  
  /* ---------- radiologi (ServiceRequest) ---------- */
  listRadiologyOrders: (params = {}) => request(`/api/service-requests?${new URLSearchParams(params)}`),
  getRadiologyOrder: (id) => request(`/api/service-requests/${id}`),
  createRadiologyOrder: (body) => request('/api/service-requests', { method: 'POST', body, timeout: 30000 }),
  updateRadiologyOrder: (id, body) => request(`/api/service-requests/${id}`, { method: 'PATCH', body, timeout: 30000 }),

  /* ---------- terapi / tindakan (Procedure) ---------- */
  listTherapies: (params = {}) => request(`/api/procedures?${new URLSearchParams(params)}`),
  getTherapy: (id) => request(`/api/procedures/${id}`),
  createTherapy: (body) => request('/api/procedures', { method: 'POST', body, timeout: 30000 }),
  updateTherapy: (id, body) => request(`/api/procedures/${id}`, { method: 'PATCH', body, timeout: 30000 }),

  /* ---------- kasir ---------- */
  listInvoices: (params = {}) => request(`/api/invoices?${new URLSearchParams(params)}`),
  getInvoice: (id) => request(`/api/invoices/${id}`),
  updateInvoice: (id, body) => request(`/api/invoices/${id}`, { method: 'PATCH', body, timeout: 30000 }),

  /* ---------- akun portal pasien ---------- */
  listAccounts: (status = '') => request(`/api/accounts${status ? `?status=${status}` : ''}`),
  reviewAccount: (body) => request('/api/accounts', { method: 'PATCH', body, timeout: 30000 }),
  portalRegister: (body) => request('/api/portal/register', { method: 'POST', body, auth: false, timeout: 30000 }),
  portalLogin: (email, password) => request('/api/portal/login', { method: 'POST', body: { email, password }, auth: false }),
  portalMe: () => request('/api/portal/me'),

  stats: () => request('/api/sync/stats'),
  queue: (status) => request(`/api/sync/queue${status ? `?status=${status}` : ''}`),
  runQueue: (limit = 10) => request('/api/sync/run', { method: 'POST', body: { limit }, timeout: 60000 }),

  integrationStatus: () => request('/api/integration/status'),
  testConnection: (body = {}) => request('/api/integration/test', { method: 'POST', body, timeout: 40000 }),
};
