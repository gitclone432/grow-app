// src/lib/socket.js
// Thin wrapper around a single shared Socket.IO connection, authenticated
// with the same JWT used for REST calls (see lib/api.js). Connect once
// (from AdminLayout after login) and every component subscribes/unsubscribes
// to events via this module instead of holding its own socket instance.
import { io } from 'socket.io-client';
import { getAuthToken } from './api.js';

// Socket.IO listens on the same host as the API, one level up from "/api".
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const SOCKET_URL = API_BASE.replace(/\/api\/?$/, '');

let socket = null;

export function connectSocket() {
  const token = getAuthToken();
  if (!token) return null;

  if (socket && socket.connected) return socket;

  if (socket) {
    socket.disconnect();
  }

  socket = io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function getSocket() {
  return socket;
}

export function onSocketEvent(event, handler) {
  const s = socket || connectSocket();
  if (!s) return () => {};
  s.on(event, handler);
  return () => s.off(event, handler);
}
