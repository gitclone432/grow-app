import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';

let io = null;

/**
 * Attaches Socket.IO to the given HTTP server. Auth mirrors requireAuth
 * (middleware/auth.js): a JWT is verified and its userId is used to join a
 * per-user room ("user:<id>"), so routes can push events to a specific user
 * across every tab/device they have open without tracking socket ids.
 */
export function initSocket(httpServer, allowedOrigins) {
  io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error(`Socket CORS: origin '${origin}' not allowed`));
      },
      methods: ['GET', 'POST'],
    },
  });

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token || null;
      if (!token) return next(new Error('Unauthorized'));
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = payload.userId;
      return next();
    } catch (e) {
      return next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    if (socket.userId) {
      socket.join(`user:${socket.userId}`);
    }
  });

  return io;
}

export function getIO() {
  return io;
}

/** Emit an event to every tab/device a specific user has open. Safe no-op if sockets aren't initialized. */
export function emitToUser(userId, event, payload) {
  if (!io || !userId) return;
  io.to(`user:${userId}`).emit(event, payload);
}

/** Emit to a list of user ids at once. */
export function emitToUsers(userIds, event, payload) {
  if (!io || !userIds?.length) return;
  for (const id of userIds) emitToUser(id, event, payload);
}
