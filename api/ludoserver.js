'use strict';

const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { Server } = require('socket.io');

const PORT = Number(process.env.PORT || 3000);
const IS_VERCEL = Boolean(process.env.VERCEL);
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const rooms = new Map();
const reconnectSessions = new Map(); // playerToken -> { roomCode, color, expiresAt }
const rate = new Map();

const PATHS = {
  red: [22,37,52,67,82,96,95,94,93,92,91,106,121,122,123,124,125,126,142,157,172,187,202,217,218,219,204,189,174,159,144,130,131,132,133,134,135,120,105,104,103,102,101,100,84,69,54,39,24,9,8,23,38,53,68,83,'home-bottom'],
  yellow: [204,189,174,159,144,130,131,132,133,134,135,120,105,104,103,102,101,100,84,69,54,39,24,9,8,7,22,37,52,67,82,96,95,94,93,92,91,106,121,122,123,124,125,126,142,157,172,187,202,217,218,203,188,173,158,143,'home-top']
};
const SAFE_CELLS = new Set([22,93,122,187,204,133,104,39]);
const COLORS = ['red', 'yellow'];
const MAX_ROOMS = 10000;
const ROOM_TTL = 2 * 60 * 60 * 1000;
const RECONNECT_TTL = 5 * 60 * 1000;
const MAX_ACTIONS_PER_WINDOW = 25;
const ACTION_WINDOW = 5000;

function randomRoomCode() {
  for (let i = 0; i < 20; i++) {
    const code = String(crypto.randomInt(100000, 1000000));
    if (!rooms.has(code)) return code;
  }
  throw new Error('room-capacity');
}

function tokenTemplate() {
  const tokens = {};
  for (const color of COLORS) for (let i = 1; i <= 4; i++) {
    tokens[`${color}-${i}`] = { color, pathIndex: -1, isFinished: false };
  }
  return tokens;
}

function newRoom(code) {
  return {
    code,
    createdAt: Date.now(),
    lastActivity: Date.now(),
    phase: 'waiting',
    turn: 'red',
    dice: 0,
    diceId: 'dice-bottom-left',
    hasRolled: false,
    version: 0,
    winner: null,
    gameOver: false,
    tokens: tokenTemplate(),
    players: { red: null, yellow: null }
  };
}

function publicState(room) {
  return {
    phase: room.phase,
    turn: room.turn,
    dice: room.dice,
    diceId: room.diceId,
    hasRolled: room.hasRolled,
    version: room.version,
    winner: room.winner,
    gameOver: room.gameOver,
    tokens: room.tokens
  };
}

function issuePlayerToken() {
  return crypto.randomBytes(32).toString('hex');
}

function cleanString(value, max = 32) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function getClientKey(socket) {
  const forwarded = socket.handshake.headers['x-forwarded-for'];
  return String(forwarded || socket.handshake.address || 'unknown').split(',')[0].trim();
}

function rateLimit(socket, bucket, limit = MAX_ACTIONS_PER_WINDOW, windowMs = ACTION_WINDOW) {
  const key = `${getClientKey(socket)}:${bucket}`;
  const now = Date.now();
  const item = rate.get(key);
  if (!item || now - item.startedAt >= windowMs) {
    rate.set(key, { startedAt: now, count: 1 });
    return true;
  }
  item.count += 1;
  return item.count <= limit;
}

function rememberSession(token, roomCode, color) {
  reconnectSessions.set(token, { roomCode, color, expiresAt: Date.now() + RECONNECT_TTL });
}

function validSession(token) {
  const item = reconnectSessions.get(token);
  if (!item || item.expiresAt < Date.now()) {
    if (item) reconnectSessions.delete(token);
    return null;
  }
  item.expiresAt = Date.now() + RECONNECT_TTL;
  return item;
}

function roomPlayer(room, color) {
  return room.players[color];
}

function playerColorForSocket(room, socket) {
  for (const color of COLORS) if (room.players[color]?.socketId === socket.id) return color;
  return null;
}

function touch(room) { room.lastActivity = Date.now(); }

function emitState(io, room, socket = null) {
  const data = publicState(room);
  if (socket) socket.emit('game:state', { roomCode: room.code, state: data, you: { color: playerColorForSocket(room, socket) } });
  else {
    for (const color of COLORS) {
      const p = room.players[color];
      if (p?.socketId) io.to(p.socketId).emit('game:state', { roomCode: room.code, state: data, you: { color } });
    }
  }
}

function error(socket, message) { socket.emit('server:error', message); }

function validateRoomCode(code) { return /^\d{6}$/.test(code); }

function attachPlayer(room, color, socket, token) {
  room.players[color] = { socketId: socket.id, token, connected: true, disconnectedAt: null };
  socket.data.roomCode = room.code;
  socket.data.color = color;
  socket.data.playerToken = token;
  rememberSession(token, room.code, color);
  socket.join(room.code);
}

function detachPlayer(socket) {
  const code = socket.data.roomCode;
  const color = socket.data.color;
  if (!code || !color) return;
  const room = rooms.get(code);
  if (!room) return;
  const p = room.players[color];
  if (p?.socketId === socket.id) {
    p.socketId = null;
    p.connected = false;
    p.disconnectedAt = Date.now();
    rememberSession(p.token, code, color);
  }
  touch(room);
}

function resetRoomGame(room) {
  room.phase = 'playing';
  room.turn = 'red';
  room.dice = 0;
  room.diceId = 'dice-bottom-left';
  room.hasRolled = false;
  room.version += 1;
  room.winner = null;
  room.gameOver = false;
  room.tokens = tokenTemplate();
}

function legalMoves(room, color) {
  if (room.phase !== 'playing' || room.gameOver || room.turn !== color || !room.hasRolled) return [];
  const result = [];
  for (const [id, token] of Object.entries(room.tokens)) {
    if (token.color !== color || token.isFinished) continue;
    if (token.pathIndex === -1) {
      if (room.dice === 6) result.push(id);
    } else if (token.pathIndex + room.dice < PATHS[color].length) {
      result.push(id);
    }
  }
  return result;
}

function winnerFor(room, color) {
  return Object.values(room.tokens).filter(t => t.color === color).every(t => t.isFinished);
}

function switchTurn(room) {
  room.turn = room.turn === 'red' ? 'yellow' : 'red';
  room.hasRolled = false;
  room.dice = 0;
  room.diceId = room.turn === 'red' ? 'dice-bottom-left' : 'dice-top-right';
}

function rollFor(room, color) {
  if (room.phase !== 'playing' || room.gameOver) return { ok: false, error: 'গেমটি এখন চালু নেই।' };
  if (room.turn !== color) return { ok: false, error: 'এখন আপনার টার্ন নয়।' };
  if (room.hasRolled) return { ok: false, error: 'এই টার্নে ডাইস ইতিমধ্যে রোল হয়েছে।' };

  room.dice = crypto.randomInt(1, 7);
  room.diceId = color === 'red' ? 'dice-bottom-left' : 'dice-top-right';
  room.hasRolled = true;
  room.version += 1;
  touch(room);

  const moves = legalMoves(room, color);
  if (moves.length === 0) {
    if (room.dice !== 6) switchTurn(room);
    else room.hasRolled = false;
    room.version += 1;
  }
  return { ok: true, dice: room.dice, diceId: room.diceId, state: publicState(room), noMove: moves.length === 0 };
}

function moveFor(room, color, tokenId) {
  if (typeof tokenId !== 'string' || !/^((red|yellow)-[1-4])$/.test(tokenId)) return { ok: false, error: 'অবৈধ গুটি।' };
  const token = room.tokens[tokenId];
  if (!token || token.color !== color) return { ok: false, error: 'এই গুটিটি আপনার নয়।' };
  if (room.phase !== 'playing' || room.gameOver || room.turn !== color) return { ok: false, error: 'এখন আপনার গুটি চালার সময় নয়।' };
  if (!room.hasRolled || !Number.isInteger(room.dice) || room.dice < 1 || room.dice > 6) return { ok: false, error: 'আগে ডাইস রোল করুন।' };

  const legal = legalMoves(room, color);
  if (!legal.includes(tokenId)) return { ok: false, error: 'এই গুটি দিয়ে বৈধ চাল নেই।' };

  const from = token.pathIndex;
  const dice = room.dice;
  const to = from === -1 ? 0 : from + dice;
  if (to < 0 || to >= PATHS[color].length) return { ok: false, error: 'অবৈধ চাল।' };

  token.pathIndex = to;
  token.isFinished = to === PATHS[color].length - 1;
  let captured = null;
  const cell = PATHS[color][to];

  if (!token.isFinished && typeof cell === 'number' && !SAFE_CELLS.has(cell)) {
    for (const [otherId, other] of Object.entries(room.tokens)) {
      if (other.color === color || other.pathIndex < 0 || other.isFinished) continue;
      const otherCell = PATHS[other.color][other.pathIndex];
      if (otherCell === cell) {
        other.pathIndex = -1;
        other.isFinished = false;
        captured = otherId;
      }
    }
  }

  room.hasRolled = false;
  room.dice = 0;
  const finished = token.isFinished;
  let winner = false;
  if (winnerFor(room, color)) {
    room.winner = color;
    room.gameOver = true;
    room.phase = 'finished';
    winner = true;
  }

  const extraTurn = !winner && (dice === 6 || Boolean(captured) || finished);
  if (!winner && !extraTurn) switchTurn(room);
  room.version += 1;
  touch(room);

  return {
    ok: true,
    move: { tokenId, color, from, to, steps: from === -1 ? 1 : dice, captured, finished, winner, extraTurn },
    state: publicState(room)
  };
}

function cleanup() {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const connected = COLORS.some(c => room.players[c]?.connected);
    if (!connected && now - room.lastActivity > ROOM_TTL) rooms.delete(code);
  }
  for (const [token, s] of reconnectSessions) if (s.expiresAt < now) reconnectSessions.delete(token);
  for (const [key, item] of rate) if (now - item.startedAt > ACTION_WINDOW * 2) rate.delete(key);
}
setInterval(cleanup, 60_000).unref?.();

function createHttpServer() {
  return http.createServer((req, res) => {
    // Socket.IO owns this endpoint.
    if (req.url?.startsWith('/api/ludoserver')) return;
    let requestPath = new URL(req.url || '/', 'http://localhost').pathname;
    if (requestPath === '/') requestPath = '/ludo.html';
    const file = path.normalize(path.join(PUBLIC_DIR, requestPath));
    if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('Forbidden'); }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end('Not found'); }
      const ext = path.extname(file);
      const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mp3':'audio/mpeg', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml' };
      res.setHeader('Content-Type', types[ext] || 'application/octet-stream');
      res.setHeader('X-Content-Type-Options','nosniff');
      res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
      res.setHeader('Cache-Control', ext === '.html' ? 'no-store' : 'public, max-age=3600');
      res.end(data);
    });
  });
}

const httpServer = createHttpServer();
function allowedOrigin(origin, callback) {
  if (!origin) return callback(null, true);
  const configured = String(process.env.ALLOWED_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean);
  if (configured.length) return callback(null, configured.includes(origin));
  try {
    const host = String(process.env.VERCEL_URL || '').replace(/^https?:\/\//, '').split('/')[0];
    const requestHost = String(process.env.VERCEL ? (process.env.VERCEL_URL || '') : '').replace(/^https?:\/\//, '').split('/')[0];
    const originHost = new URL(origin).host;
    if (host && originHost === host) return callback(null, true);
    if (requestHost && originHost === requestHost) return callback(null, true);
    if (/^https?:\/\/localhost(?::\d+)?$/.test(origin) || /^https?:\/\/127\.0\.0\.1(?::\d+)?$/.test(origin)) return callback(null, true);
  } catch {}
  callback(null, false);
}

const io = new Server(httpServer, {
  path: '/api/ludoserver',
  transports: ['websocket', 'polling'],
  maxHttpBufferSize: 10_000,
  pingInterval: 25_000,
  pingTimeout: 20_000,
  cors: { origin: allowedOrigin, credentials: false }
});

io.use((socket, next) => {
  if (!rateLimit(socket, 'handshake', 15, 60_000)) return next(new Error('Too many connection attempts'));
  const version = cleanString(socket.handshake.auth?.clientVersion, 20);
  if (!version) return next(new Error('Client version required'));
  next();
});

io.on('connection', socket => {
  socket.on('room:create', (_, ack = () => {}) => {
    if (!rateLimit(socket, 'create', 5, 60_000)) return ack({ok:false,error:'অনেকবার চেষ্টা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।'});
    if (rooms.size >= MAX_ROOMS) return ack({ok:false,error:'এই মুহূর্তে নতুন রুম নেওয়া যাচ্ছে না।'});
    let code;
    try { code = randomRoomCode(); } catch { return ack({ok:false,error:'রুম তৈরি করা যাচ্ছে না।'}); }
    const room = newRoom(code);
    const token = issuePlayerToken();
    attachPlayer(room, 'red', socket, token);
    rooms.set(code, room);
    ack({ok:true, roomCode:code, color:'red', playerToken:token, state:publicState(room)});
    socket.emit('room:waiting', {state:publicState(room)});
  });

  socket.on('room:join', (payload = {}, ack = () => {}) => {
    if (!rateLimit(socket, 'join', 10, 30_000)) return ack({ok:false,error:'খুব দ্রুত অনেকবার চেষ্টা হয়েছে।'});
    const code = cleanString(payload.roomCode, 12);
    if (!validateRoomCode(code)) return ack({ok:false,error:'রুম কোড সঠিক নয়।'});
    const room = rooms.get(code);
    if (!room) return ack({ok:false,error:'রুম পাওয়া যায়নি।'});
    if (room.players.yellow?.token) return ack({ok:false,error:'রুমটি ইতিমধ্যে পূর্ণ।'});
    const token = issuePlayerToken();
    attachPlayer(room, 'yellow', socket, token);
    if (room.phase === 'waiting') resetRoomGame(room);
    touch(room);
    ack({ok:true, roomCode:code, color:'yellow', playerToken:token, state:publicState(room)});
    io.to(room.code).emit('room:ready', {state:publicState(room)});
    emitState(io, room);
  });

  socket.on('room:reconnect', (payload = {}, ack = () => {}) => {
    if (!rateLimit(socket, 'reconnect', 10, 30_000)) return ack({ok:false,error:'অনেক reconnect চেষ্টা হয়েছে।'});
    const code = cleanString(payload.roomCode, 12);
    const token = cleanString(payload.playerToken, 80);
    const session = validSession(token);
    if (!session || session.roomCode !== code) return ack({ok:false,error:'Reconnect session পাওয়া যায়নি।'});
    const room = rooms.get(code);
    if (!room) return ack({ok:false,error:'রুমটি আর নেই।'});
    const current = room.players[session.color];
    if (!current || current.token !== token) return ack({ok:false,error:'Reconnect অনুমোদিত নয়।'});
    current.socketId = socket.id;
    current.connected = true;
    current.disconnectedAt = null;
    socket.data.roomCode = code;
    socket.data.color = session.color;
    socket.data.playerToken = token;
    socket.join(code);
    touch(room);
    ack({ok:true,color:session.color,state:publicState(room)});
    emitState(io, room);
  });

  socket.on('game:roll', (_, ack = () => {}) => {
    if (!rateLimit(socket, 'roll', 8, 5000)) return ack({ok:false,error:'ডাইস খুব দ্রুত রোল করা হচ্ছে।'});
    const code = socket.data.roomCode, color = socket.data.color;
    const room = rooms.get(code);
    if (!room || !color || room.players[color]?.socketId !== socket.id) return ack({ok:false,error:'গেম সেশন বৈধ নয়।'});
    const result = rollFor(room, color);
    if (!result.ok) return ack(result);
    ack(result);
    io.to(code).emit('game:dice', {by:color,dice:result.dice,diceId:result.diceId,state:result.state});
    emitState(io, room);
  });

  socket.on('game:move', (payload = {}, ack = () => {}) => {
    if (!rateLimit(socket, 'move', 15, 5000)) return ack({ok:false,error:'অনেক দ্রুত চাল পাঠানো হয়েছে।'});
    const code = socket.data.roomCode, color = socket.data.color;
    const room = rooms.get(code);
    if (!room || !color || room.players[color]?.socketId !== socket.id) return ack({ok:false,error:'গেম সেশন বৈধ নয়।'});
    const result = moveFor(room, color, payload.tokenId);
    if (!result.ok) return ack(result);
    ack(result);
    io.to(code).emit('game:move', {by:color,...result.move,state:result.state});
    emitState(io, room);
  });

  // WebRTC signaling only. The server never receives or stores microphone audio.
  socket.on('voice:offer', offer => {
    if (!rateLimit(socket,'voice',30,10_000)) return;
    const room = rooms.get(socket.data.roomCode), color = socket.data.color;
    if (!room || !color || !room.players[color]?.socketId) return;
    const other = COLORS.find(c => c !== color);
    if (room.players[other]?.socketId) io.to(room.players[other].socketId).emit('voice:offer', offer);
  });
  socket.on('voice:answer', answer => {
    if (!rateLimit(socket,'voice',30,10_000)) return;
    const room = rooms.get(socket.data.roomCode), color = socket.data.color;
    if (!room || !color) return;
    const other = COLORS.find(c => c !== color);
    if (room.players[other]?.socketId) io.to(room.players[other].socketId).emit('voice:answer', answer);
  });
  socket.on('voice:ice', candidate => {
    if (!rateLimit(socket,'voice',60,10_000)) return;
    const room = rooms.get(socket.data.roomCode), color = socket.data.color;
    if (!room || !color) return;
    const other = COLORS.find(c => c !== color);
    if (room.players[other]?.socketId) io.to(room.players[other].socketId).emit('voice:ice', candidate);
  });

  socket.on('disconnect', () => detachPlayer(socket));
});

if (!IS_VERCEL) {
  httpServer.listen(PORT, () => console.log(`Game Bazz Ludo server running on http://localhost:${PORT}`));
}

module.exports = httpServer;
module.exports.io = io;
module.exports.rooms = rooms;
module.exports.default = httpServer;
