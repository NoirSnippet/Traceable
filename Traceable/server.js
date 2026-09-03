const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const helmet = require('helmet');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Enable Helmet for security HTTP headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.socket.io"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'", "ws:", "wss:"],
        manifestSrc: ["'self'"],
        workerSrc: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

app.disable('x-powered-by');
app.use(express.json({ limit: '10mb' }));

// Dedicated headers for Service Worker and Web App Manifest
app.get('/sw.js', (req, res, next) => {
  res.setHeader('Service-Worker-Allowed', '/');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  next();
});

app.get('/manifest.webmanifest', (req, res, next) => {
  res.setHeader('Content-Type', 'application/manifest+json');
  res.setHeader('Cache-Control', 'no-cache, must-revalidate');
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  transports: ['websocket', 'polling'], // Fallback enabled for restrictive networks
});

// Vibrant distinct colors for connected users
const USER_COLORS = [
  '#FF4D4D', '#3B82F6', '#10B981', '#F59E0B',
  '#8B5CF6', '#EC4899', '#06B6D4', '#F97316',
  '#14B8A6', '#6366F1', '#D946EF', '#84CC16'
];

// 24 Scratchpad & Whiteboard Layout Templates
const VALID_LAYOUTS = [
  'grid', 'dots', 'graph', 'isometric', 'hexagonal', 'polar', 'blueprint',
  'ruled', 'college-ruled', 'cornell', 'music',
  'kanban', 'swot', 'quadrant', 'storyboard', 'calendar',
  'blank',
  'plain-white', 'plain-black', 'plain-cream', 'plain-charcoal', 'plain-navy', 'plain-chalkboard', 'plain-sepia'
];

// Ephemeral in-memory store for active rooms
// Map<roomCode, { users: Map<socketId, UserInfo>, shapes: Array<ShapeObject>, hostId: string, layout: string }>
const rooms = new Map();

/**
 * Generates a secure random 5-character alphanumeric room code
 */
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoid ambiguous chars like I, O, 1, 0
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return rooms.has(code) ? generateRoomCode() : code;
}

/**
 * Input Validation & Sanitization Helpers
 */
function validateRoomCode(code) {
  return typeof code === 'string' && /^[A-Z0-9]{5}$/i.test(code.trim());
}

function sanitizeName(name) {
  if (typeof name !== 'string') return 'Artist';
  // Strip HTML tags and control chars, trim, and cap length
  const cleaned = name.replace(/<[^>]*>/g, '').replace(/[\r\n\t]/g, '').trim();
  return cleaned.substring(0, 25) || 'Artist';
}

const GEOMETRIC_SHAPES = [
  'line', 'rect', 'rounded-rect', 'ellipse', 'triangle', 'right-triangle',
  'diamond', 'pentagon', 'hexagon', 'octagon',
  'star-4', 'star-5', 'star-6',
  'arrow-right', 'arrow-left', 'arrow-up', 'arrow-down', 'arrow-bidirectional',
  'heart', 'cloud', 'speech-bubble', 'cylinder', 'cross'
];

function validateShape(shape) {
  if (!shape || typeof shape !== 'object') return false;
  if (typeof shape.id !== 'string' || shape.id.length > 64) return false;
  
  const allowedTypes = ['brush', 'eraser', 'text', ...GEOMETRIC_SHAPES];
  if (!allowedTypes.includes(shape.type)) return false;

  // Validate color format
  if (typeof shape.color !== 'string' || shape.color.length > 50) return false;

  // Validate width
  if (typeof shape.width !== 'number' || !Number.isFinite(shape.width) || shape.width < 1 || shape.width > 150) {
    return false;
  }

  // Type-specific validations
  if (shape.type === 'brush' || shape.type === 'eraser') {
    if (!Array.isArray(shape.points) || shape.points.length > 2000) return false;
    for (let i = 0; i < shape.points.length; i++) {
      const p = shape.points[i];
      if (!p || typeof p.x !== 'number' || typeof p.y !== 'number' || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
        return false;
      }
    }
  } else if (GEOMETRIC_SHAPES.includes(shape.type)) {
    if (!Number.isFinite(shape.x1) || !Number.isFinite(shape.y1) || !Number.isFinite(shape.x2) || !Number.isFinite(shape.y2)) {
      return false;
    }
  } else if (shape.type === 'text') {
    if (typeof shape.text !== 'string' || shape.text.length > 200) return false;
    if (!Number.isFinite(shape.x) || !Number.isFinite(shape.y) || !Number.isFinite(shape.fontSize)) return false;
  }

  return true;
}

/**
 * Socket.io Event Handling & Room Isolation
 */
io.on('connection', (socket) => {
  let userRoomCode = null;
  let lastEventTime = 0;

  // Anti-DoS rate limiting check (max 60 events/sec per socket)
  function isRateLimited() {
    const now = Date.now();
    if (now - lastEventTime < 10) {
      return true;
    }
    lastEventTime = now;
    return false;
  }

  // Create Room
  socket.on('create-room', (data = {}) => {
    if (userRoomCode) return; // User already in a room

    const roomCode = generateRoomCode();
    const userName = sanitizeName(data.userName);
    const clientId = typeof data.clientId === 'string' && data.clientId.trim() ? data.clientId.trim() : socket.id;
    const userColor = USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)];

    const room = {
      users: new Map(),
      shapes: [],
      messages: [],
      hostId: socket.id,
      hostClientId: clientId,
      layout: 'grid',
      cleanupTimer: null,
    };

    const userInfo = {
      id: socket.id,
      clientId,
      name: userName,
      color: userColor,
      cursor: { x: 0, y: 0 },
    };

    room.users.set(socket.id, userInfo);
    rooms.set(roomCode, room);

    socket.join(roomCode);
    userRoomCode = roomCode;
    socket.data = { roomCode, userInfo };

    socket.emit('room-joined', {
      roomCode,
      userId: socket.id,
      clientId,
      hostId: room.hostId,
      isHost: true,
      layout: room.layout,
      userInfo,
      users: Array.from(room.users.values()),
      shapes: room.shapes,
      messages: room.messages || [],
    });
  });

  // Join Room
  socket.on('join-room', (data = {}) => {
    if (userRoomCode) return;

    const rawCode = (data.roomCode || '').toUpperCase().trim();
    if (!validateRoomCode(rawCode) || !rooms.has(rawCode)) {
      return socket.emit('error-msg', { message: 'Invalid or non-existent room code.' });
    }

    const roomCode = rawCode;
    const room = rooms.get(roomCode);

    // Cancel pending deletion timer if user rejoins during grace period
    if (room.cleanupTimer) {
      clearTimeout(room.cleanupTimer);
      room.cleanupTimer = null;
    }

    const userName = sanitizeName(data.userName);
    const clientId = typeof data.clientId === 'string' && data.clientId.trim() ? data.clientId.trim() : socket.id;

    // Pick color not heavily used in room
    const usedColors = Array.from(room.users.values()).map(u => u.color);
    const availableColors = USER_COLORS.filter(c => !usedColors.includes(c));
    const userColor = availableColors.length > 0
      ? availableColors[Math.floor(Math.random() * availableColors.length)]
      : USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)];

    const userInfo = {
      id: socket.id,
      clientId,
      name: userName,
      color: userColor,
      cursor: { x: 0, y: 0 },
    };

    // Recover host privileges if the original host is reconnecting
    const isUserHost = (room.hostClientId && room.hostClientId === clientId) || !room.hostId || room.users.size === 0;
    if (isUserHost) {
      room.hostId = socket.id;
      room.hostClientId = clientId;
    }

    room.users.set(socket.id, userInfo);
    socket.join(roomCode);
    userRoomCode = roomCode;
    socket.data = { roomCode, userInfo };

    // Send history & state to joining user
    socket.emit('room-joined', {
      roomCode,
      userId: socket.id,
      clientId,
      hostId: room.hostId,
      isHost: socket.id === room.hostId,
      layout: room.layout || 'grid',
      userInfo,
      users: Array.from(room.users.values()),
      shapes: room.shapes,
      messages: room.messages || [],
    });

    // Notify other users in room
    socket.to(roomCode).emit('user-joined', {
      user: userInfo,
      users: Array.from(room.users.values()),
      hostId: room.hostId,
    });
  });

  // Live stroke streaming draft
  socket.on('shape-draft', (data) => {
    if (!userRoomCode || isRateLimited()) return;
    const room = rooms.get(userRoomCode);
    if (!room) return;

    if (data && data.shape && validateShape(data.shape)) {
      socket.to(userRoomCode).emit('shape-draft', {
        userId: socket.id,
        shape: data.shape,
      });
    }
  });

  // Shape Commit (Finalized Shape)
  socket.on('shape-commit', (data) => {
    if (!userRoomCode) return;
    const room = rooms.get(userRoomCode);
    if (!room) return;

    if (data && data.shape && validateShape(data.shape)) {
      // Attribute shape to user's persistent client id so undo works across refresh
      data.shape.userId = socket.data?.userInfo?.clientId || socket.id;

      // Cap room shapes to 1000 to prevent memory exhaustion
      if (room.shapes.length >= 1000) {
        room.shapes.shift(); // Remove oldest shape
      }

      room.shapes.push(data.shape);

      // Broadcast shape to room peers
      socket.to(userRoomCode).emit('shape-commit', {
        shape: data.shape,
      });
    }
  });

  // Shape Delete (Per-user Undo action)
  socket.on('shape-delete', (data) => {
    if (!userRoomCode || !data || typeof data.shapeId !== 'string') return;
    const room = rooms.get(userRoomCode);
    if (!room) return;

    const index = room.shapes.findIndex(s => s.id === data.shapeId);
    if (index !== -1) {
      room.shapes.splice(index, 1);
      io.in(userRoomCode).emit('shape-delete', {
        shapeId: data.shapeId,
      });
    }
  });

  // Clear Canvas
  socket.on('clear', () => {
    if (!userRoomCode) return;
    const room = rooms.get(userRoomCode);
    if (!room) return;

    room.shapes = [];
    io.in(userRoomCode).emit('clear');
  });

  // Remote Cursor Tracking
  socket.on('cursor-move', (data) => {
    if (!userRoomCode || isRateLimited()) return;
    const room = rooms.get(userRoomCode);
    if (!room || !data) return;

    if (Number.isFinite(data.x) && Number.isFinite(data.y)) {
      const user = room.users.get(socket.id);
      if (user) {
        user.cursor = { x: data.x, y: data.y };
        socket.to(userRoomCode).emit('cursor-move', {
          userId: socket.id,
          name: user.name,
          color: user.color,
          x: data.x,
          y: data.y,
        });
      }
    }
  });

  // Change Scratchpad Layout (Host Only)
  socket.on('change-layout', (data = {}) => {
    if (!userRoomCode) return;
    const room = rooms.get(userRoomCode);
    if (!room) return;

    if (socket.id !== room.hostId) {
      return socket.emit('error-msg', { message: 'Only the room host can change the scratchpad layout.' });
    }

    const layout = typeof data.layout === 'string' ? data.layout.trim().toLowerCase() : '';
    if (VALID_LAYOUTS.includes(layout)) {
      room.layout = layout;
      const hostUser = room.users.get(socket.id);
      io.in(userRoomCode).emit('layout-changed', {
        layout: room.layout,
        hostName: hostUser ? hostUser.name : 'Host',
      });
    }
  });

  // Collaborative Text Chat Broadcast
  socket.on('chat-message', (data = {}) => {
    if (!userRoomCode) return;
    const room = rooms.get(userRoomCode);
    if (!room) return;

    const user = room.users.get(socket.id);
    if (!user) return;

    const rawText = typeof data.text === 'string' ? data.text.trim() : '';
    if (!rawText || rawText.length === 0) return;

    // Enforce 500 characters maximum per message
    const text = rawText.slice(0, 500);

    const messageObj = {
      id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 7),
      userId: socket.id,
      userName: user.name,
      userColor: user.color,
      isHost: socket.id === room.hostId,
      text: text,
      timestamp: Date.now(),
    };

    if (!room.messages) room.messages = [];
    room.messages.push(messageObj);
    if (room.messages.length > 100) {
      room.messages.shift(); // Retain most recent 100 messages
    }

    io.in(userRoomCode).emit('chat-message', messageObj);
  });

  // Disconnect & Room Ephemeral Cleanup
  socket.on('disconnect', () => {
    if (!userRoomCode) return;
    const room = rooms.get(userRoomCode);
    if (!room) return;

    room.users.delete(socket.id);

    if (room.users.size === 0) {
      // Ephemeral Privacy with Grace Period (60s):
      // Allows users to refresh the page without immediately destroying the room & drawings!
      if (room.cleanupTimer) clearTimeout(room.cleanupTimer);
      room.cleanupTimer = setTimeout(() => {
        if (room.users.size === 0) {
          rooms.delete(userRoomCode);
          console.log(`Room ${userRoomCode} auto-deleted after grace period.`);
        }
      }, 60000);
    } else {
      let hostChanged = false;
      if (room.hostId === socket.id) {
        // Transfer host privileges to the next participant
        room.hostId = room.users.keys().next().value;
        const newHostUser = room.users.get(room.hostId);
        if (newHostUser && newHostUser.clientId) {
          room.hostClientId = newHostUser.clientId;
        }
        hostChanged = true;
      }

      // Notify remaining users
      socket.to(userRoomCode).emit('user-left', {
        userId: socket.id,
        users: Array.from(room.users.values()),
        hostId: room.hostId,
      });

      if (hostChanged) {
        io.in(userRoomCode).emit('host-changed', {
          hostId: room.hostId,
          hostName: room.users.get(room.hostId)?.name || 'Collaborator',
        });
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Traceable Canvas Server running securely at http://localhost:${PORT}`);
});
