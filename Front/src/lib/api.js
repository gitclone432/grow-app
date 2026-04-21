// src/lib/api.js
import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
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
  }
}

export function getAuthToken() {
  return currentToken;
}

// Add response interceptor to handle 401 errors globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear auth token and local storage
      currentToken = null;
      delete api.defaults.headers.common.Authorization;
      localStorage.removeItem('auth_token');

      // Redirect to login page
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
