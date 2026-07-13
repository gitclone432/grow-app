// src/lib/api.js
import axios from 'axios';
import {
  getCachedSellersAll,
  setCachedSellersAll,
  invalidateSellersAllCache,
} from './sellersAllCache.js';

// Ensure a sensible default if VITE_API_URL isn't available in the dev build.
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' }
});

// keep the auth token in memory (per tab)
let currentToken = null;

export function setAuthToken(token) {
  currentToken = token || null;
  if (currentToken) {
    api.defaults.headers.common.Authorization = `Bearer ${currentToken}`;
  } else {
    delete api.defaults.headers.common.Authorization;
    invalidateSellersAllCache();
  }
}

export function getAuthToken() {
  return currentToken;
}

function isSellersAllGet(config) {
  const method = String(config?.method || 'get').toLowerCase();
  if (method !== 'get') return false;
  const url = String(config?.url || '');
  return url === '/sellers/all' || url.endsWith('/sellers/all');
}

function headerValue(headers, key) {
  if (!headers) return undefined;
  if (typeof headers.get === 'function') return headers.get(key);
  return headers[key] ?? headers[key.toLowerCase()];
}

// Cache successful /sellers/all responses briefly so remounts skip the network.
api.interceptors.request.use((config) => {
  if (!isSellersAllGet(config)) return config;
  if (headerValue(config.headers, 'x-bypass-sellers-cache') === '1') return config;
  if (config.params && Object.keys(config.params).length > 0) return config;

  const cached = getCachedSellersAll();
  if (!cached) return config;

  config.adapter = async () => ({
    data: cached,
    status: 200,
    statusText: 'OK',
    headers: { 'x-sellers-cache': 'HIT' },
    config,
    request: {},
  });
  return config;
});

api.interceptors.response.use(
  (response) => {
    if (isSellersAllGet(response.config)) {
      setCachedSellersAll(response.data);
    }
    return response;
  },
  (error) => {
    const status = error.response?.status;
    const url = String(error.config?.url || '');
    const message = String(error.response?.data?.error || '');
    const isLoginRequest = url.includes('/auth/login');

    // Only force-logout on real session invalidation — not every 401 from page APIs.
    const isSessionInvalid = /token expired|invalid token|please login again|access permissions have been updated|unauthorized/i.test(message)
      || (status === 401 && !error.response?.data?.error);

    if (status === 401 && !isLoginRequest && currentToken && isSessionInvalid) {
      currentToken = null;
      delete api.defaults.headers.common.Authorization;
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user');
      invalidateSellersAllCache();
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;

// Employee Profiles APIs
export async function getMyProfile() {
  const { data } = await api.get('/employee-profiles/me');
  return data;
}

export async function updateMyProfile(payload) {
  const { data } = await api.put('/employee-profiles/me', payload);
  return data;
}

export async function listEmployeeProfiles() {
  const { data } = await api.get('/employee-profiles');
  return data;
}

export async function updateEmployeeProfile(profileId, payload) {
  const { data } = await api.put(`/employee-profiles/${profileId}`, payload);
  return data;
}

export async function updateEmployeeAdminFields(profileId, payload) {
  const { data } = await api.put(`/employee-profiles/${profileId}/admin-fields`, payload);
  return data;
}

export async function deleteEmployeeProfile(profileId) {
  const { data } = await api.delete(`/employee-profiles/${profileId}`);
  return data;
}

export async function toggleEmployeeHidden(profileId) {
  const { data } = await api.patch(`/employee-profiles/${profileId}/toggle-hidden`);
  return data;
}

// File Upload APIs
export async function uploadEmployeeFile(fileType, file) {
  const formData = new FormData();
  formData.append('file', file);

  const { data } = await api.post(
    `/employee-profiles/me/upload/${fileType}`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
  return data;
}

// Get file URL for viewing/downloading (admin)
export function getEmployeeFileUrl(profileId, fileType) {
  const baseUrl = import.meta.env.VITE_API_URL || '';
  const token = localStorage.getItem('auth_token');
  const timestamp = new Date().getTime(); // Cache busting
  return `${baseUrl}/employee-profiles/${profileId}/file/${fileType}?token=${token}&t=${timestamp}`;
}

// Get current user's file URL
export function getMyFileUrl(fileType) {
  const baseUrl = import.meta.env.VITE_API_URL || '';
  const token = localStorage.getItem('auth_token');
  const timestamp = new Date().getTime(); // Cache busting
  return `${baseUrl}/employee-profiles/me/file/${fileType}?token=${token}&t=${timestamp}`;
}

// Nomenclature note:
// `attendance` is a legacy technical name kept for API/backward compatibility.
// Functionally, this module tracks and manages WORKING HOURS (timer sessions), not HR attendance.
// Attendance APIs
export async function startTimer() {
  const { data } = await api.post('/attendance/start');
  return data;
}

export async function pauseTimer() {
  const { data } = await api.post('/attendance/pause');
  return data;
}

export async function resumeTimer() {
  const { data } = await api.post('/attendance/resume');
  return data;
}

export async function stopTimer() {
  const { data } = await api.post('/attendance/stop');
  return data;
}

export async function getAttendanceStatus(signal) {
  const { data } = await api.get('/attendance/status', signal ? { signal } : undefined);
  return data;
}

export async function getAttendanceReport(params = {}) {
  const { data } = await api.get('/attendance/report', { params });
  return data;
}

export async function getAdminAttendanceReport(params = {}) {
  const { data } = await api.get('/attendance/admin/report', { params });
  return data;
}

// User APIs
export async function toggleUserStrictTimer(userId, isStrictTimer) {
  const { data } = await api.put(`/users/${userId}/strict-timer`, { isStrictTimer });
  return data;
}

export async function forceStopAttendance(attendanceId) {
  const { data } = await api.post(`/attendance/admin/force-stop/${attendanceId}`);
  return data;
}

export async function updateAttendanceHours(attendanceId, totalWorkTime) {
  const { data } = await api.put(`/attendance/admin/edit-hours/${attendanceId}`, { totalWorkTime });
  return data;
}

export async function deleteAttendanceRecord(attendanceId) {
  const { data } = await api.delete(`/attendance/admin/${attendanceId}`);
  return data;
}
