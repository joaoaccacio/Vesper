'use strict';

const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const VesperArena = require('./vesper-arena.js');

const { Arena, CONFIG, coinsFor } = VesperArena;
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '0.0.0.0';
const PAGE = path.join(__dirname, 'VESPER', 'index.html');
const MAX_PAYLOAD = 16384;

function encodeFrame(opcode, payload) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload), 'utf8');
  const length = body.length;
  let header;
  if (length < 126) {
    header = Buffer.alloc(2);
    header[1] = length;
  } else if (length < 65536) {
    header = Buffer.alloc(4);
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }
  header[0] = 0x80 | opcode;
  return Buffer.concat([header, body]);
}

class Connection {
  constructor(socket, onMessage, onClose) {
    this.socket = socket;
    this.onMessage = onMessage;
    this.onClose = onClose;
    this.buffer = Buffer.alloc(0);
    this.fragments = [];
    this.fragmentOpcode = 0;
    this.closed = false;
    socket.on('data', chunk => this._receive(chunk));
    socket.on('error', () => this.close());
    socket.on('close', () => this._finish());
    socket.setNoDelay(true);
  }

  send(value) {
    if (this.closed || this.socket.destroyed) return false;
    try {
      this.socket.write(encodeFrame(0x1, JSON.stringify(value)));
      return true;
    } catch (_) {
      this.close();
      return false;
    }
  }

  close(code = 1000) {
    if (this.closed) return;
    this.closed = true;
    try {
      const payload = Buffer.alloc(2);
      payload.writeUInt16BE(code, 0);
      this.socket.end(encodeFrame(0x8, payload));
    } catch (_) {
      this.socket.destroy();
    }
    this._finish();
  }

  _finish() {
    if (this.finished) return;
    this.finished = true;
    this.closed = true;
    if (this.onClose) this.onClose();
  }

  _receive(chunk) {
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
    while (!this.closed) {
      const frame = this._readFrame();
      if (!frame) break;
      this._handleFrame(frame);
    }
  }

  _readFrame() {
    const buffer = this.buffer;
    if (buffer.length < 2) return null;
    const first = buffer[0];
    const second = buffer[1];
    const masked = (second & 0x80) === 0x80;
    let length = second & 0x7f;
    let offset = 2;
    if (length === 126) {
      if (buffer.length < offset + 2) return null;
      length = buffer.readUInt16BE(offset);
      offset += 2;
    } else if (length === 127) {
      if (buffer.length < offset + 8) return null;
      const big = buffer.readBigUInt64BE(offset);
      if (big > BigInt(MAX_PAYLOAD)) { this.close(1009); return null; }
      length = Number(big);
      offset += 8;
    }
    if (length > MAX_PAYLOAD) { this.close(1009); return null; }
    if (!masked) { this.close(1002); return null; }
    if (buffer.length < offset + 4 + length) return null;
    const mask = buffer.subarray(offset, offset + 4);
    offset += 4;
    const payload = Buffer.allocUnsafe(length);
    for (let i = 0; i < length; i++) payload[i] = buffer[offset + i] ^ mask[i & 3];
    this.buffer = buffer.subarray(offset + length);
    return { fin: (first & 0x80) === 0x80, opcode: first & 0x0f, payload };
  }

  _handleFrame(frame) {
    if (frame.opcode === 0x8) { this.close(); return; }
    if (frame.opcode === 0x9) {
      if (!this.socket.destroyed) this.socket.write(encodeFrame(0xa, frame.payload));
      return;
    }
    if (frame.opcode === 0xa) return;
    if (frame.opcode === 0x0) {
      this.fragments.push(frame.payload);
      if (!frame.fin) return;
      const payload = Buffer.concat(this.fragments);
      this.fragments = [];
      this._deliver(this.fragmentOpcode, payload);
      return;
    }
    if (!frame.fin) {
      this.fragmentOpcode = frame.opcode;
      this.fragments = [frame.payload];
      return;
    }
    this._deliver(frame.opcode, frame.payload);
  }

  _deliver(opcode, payload) {
    if (opcode !== 0x1) return;
    let message;
    try { message = JSON.parse(payload.toString('utf8')); } catch (_) { return; }
    if (message && typeof message === 'object' && this.onMessage) this.onMessage(message);
  }
}

class Room {
  constructor(number, hub) {
    this.number = number;
    this.hub = hub;
    this.arena = new Arena();
    this.clients = new Map();
    this.createdAt = Date.now();
    this.lastTick = Date.now();
    this.botsReady = false;
    this.over = false;
    this.timer = setInterval(() => this.tick(), Math.round(1000 / CONFIG.tickRate));
  }

  get age() { return (Date.now() - this.createdAt) / 1000; }
  get humans() { return this.arena.humans; }
  get accepting() { return !this.over && this.age < CONFIG.joinSeconds && this.humans < CONFIG.capacity; }

  add(client, profile) {
    if (this.arena.fighters.length >= CONFIG.capacity) {
      const bot = this.arena.worstBot();
      if (!bot) return null;
      this.arena.leave(bot.id);
    }
    const fighter = this.arena.join({ name: profile.name, skin: profile.skin, bot: false });
    client.room = this;
    client.fighterId = fighter.id;
    this.clients.set(fighter.id, client);
    client.send({
      t: 'joined', id: fighter.id, room: this.number, capacity: CONFIG.capacity,
      remaining: Number(this.arena.remaining.toFixed(2)), token: client.token,
      roster: this.arena.roster(), crates: this.arena.crateState()
    });
    return fighter;
  }

  remove(fighterId, keep) {
    const client = this.clients.get(fighterId);
    if (client) { client.room = null; client.fighterId = 0; }
    this.clients.delete(fighterId);
    if (keep) {
      const fighter = this.arena.fighters.find(item => item.id === fighterId);
      if (fighter) { fighter.mx = 0; fighter.my = 0; fighter.firing = false; }
      return;
    }
    this.arena.leave(fighterId);
  }

  broadcast(message) {
    for (const client of this.clients.values()) client.send(message);
  }

  tick() {
    const now = Date.now();
    const dt = Math.min(0.25, Math.max(0, (now - this.lastTick) / 1000));
    this.lastTick = now;
    if (this.over) return;
    if (!this.botsReady && this.age >= CONFIG.botFill) {
      this.botsReady = true;
      this.arena.fill();
    }
    const events = this.arena.step(dt);
    const payload = this.arena.snapshot();
    payload.t = 's';
    if (events.length) payload.e = events;
    this.broadcast(payload);
    if (this.arena.finished) this.finish();
  }

  finish() {
    if (this.over) return;
    this.over = true;
    clearInterval(this.timer);
    const ranking = this.arena.ranking().map(entry => {
      const fighter = this.arena.fighters.find(item => item.id === entry.id);
      const weighted = fighter ? fighter.humanKills * CONFIG.humanReward + fighter.botKills * CONFIG.botReward : entry.kills;
      return { ...entry, coins: Math.round(coinsFor(entry.rank, entry.level, weighted)) };
    });
    this.broadcast({ t: 'over', room: this.number, ranking });
    setTimeout(() => this.dispose(), CONFIG.graceSeconds * 1000);
  }

  dispose() {
    clearInterval(this.timer);
    for (const client of this.clients.values()) client.send({ t: 'closed' });
    this.clients.clear();
    this.hub.rooms.delete(this.number);
  }
}

class Hub {
  constructor() {
    this.rooms = new Map();
    this.sessions = new Map();
    this.nextRoom = 1;
  }

  roomFor() {
    for (const room of this.rooms.values()) if (room.accepting) return room;
    const room = new Room(this.nextRoom++, this);
    this.rooms.set(room.number, room);
    return room;
  }

  resume(client, token) {
    const session = this.sessions.get(token);
    if (!session || Date.now() > session.expires) return null;
    const room = this.rooms.get(session.room);
    if (!room || room.over) return null;
    const fighter = room.arena.fighters.find(item => item.id === session.fighterId);
    if (!fighter || room.clients.has(fighter.id)) return null;
    this.sessions.delete(token);
    client.token = token;
    client.room = room;
    client.fighterId = fighter.id;
    room.clients.set(fighter.id, client);
    client.send({
      t: 'joined', id: fighter.id, room: room.number, capacity: CONFIG.capacity,
      remaining: Number(room.arena.remaining.toFixed(2)), token, resumed: true,
      roster: room.arena.roster(), crates: room.arena.crateState()
    });
    return fighter;
  }

  join(client, message) {
    const profile = {
      name: String(message.name || 'Jogador').trim().slice(0, 14) || 'Jogador',
      skin: String(message.skin || 'alien')
    };
    if (message.token && this.resume(client, message.token)) return;
    const room = this.roomFor();
    client.token = crypto.randomBytes(12).toString('hex');
    const fighter = room.add(client, profile);
    if (!fighter) client.send({ t: 'error', reason: 'full' });
  }

  drop(client) {
    if (!client.room || !client.fighterId) return;
    const room = client.room;
    const fighterId = client.fighterId;
    const token = client.token;
    room.remove(fighterId, true);
    this.sessions.set(token, { room: room.number, fighterId, expires: Date.now() + CONFIG.reconnectSeconds * 1000 });
    setTimeout(() => {
      const session = this.sessions.get(token);
      if (!session) return;
      this.sessions.delete(token);
      const target = this.rooms.get(session.room);
      if (target && !target.clients.has(session.fighterId)) target.arena.leave(session.fighterId);
    }, CONFIG.reconnectSeconds * 1000);
  }

  handle(client, message) {
    if (message.t === 'join') { this.join(client, message); return; }
    if (!client.room || !client.fighterId) return;
    if (message.t === 'in') {
      client.room.arena.input(client.fighterId, message.x, message.y, message.f);
      return;
    }
    if (message.t === 'bye') {
      client.room.remove(client.fighterId, false);
      client.room = null;
      client.fighterId = 0;
    }
  }

  stats() {
    return {
      rooms: [...this.rooms.values()].map(room => ({
        number: room.number, humans: room.humans, bots: room.arena.bots,
        remaining: Math.round(room.arena.remaining), over: room.over
      })),
      sessions: this.sessions.size
    };
  }

  shutdown() {
    for (const room of [...this.rooms.values()]) room.dispose();
  }
}

function serveGame(response) {
  fs.readFile(PAGE, (error, data) => {
    if (error) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('VESPER/index.html nao encontrado. Rode node build.cjs antes.');
      return;
    }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(data);
  });
}

function createServer() {
  const hub = new Hub();
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/status') {
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify(hub.stats()));
      return;
    }
    if (url.pathname === '/' || url.pathname === '/index.html') { serveGame(response); return; }
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  });

  server.on('upgrade', (request, socket) => {
    const key = request.headers['sec-websocket-key'];
    if (!key || request.headers.upgrade !== 'websocket') {
      socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
      return;
    }
    const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
    socket.write([
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      'Sec-WebSocket-Accept: ' + accept,
      '\r\n'
    ].join('\r\n'));
    const client = { room: null, fighterId: 0, token: '' };
    const connection = new Connection(socket, message => hub.handle(client, message), () => hub.drop(client));
    client.send = value => connection.send(value);
    client.connection = connection;
  });

  server.hub = hub;
  server.closeAll = () => { hub.shutdown(); server.close(); };
  return server;
}

if (require.main === module) {
  const server = createServer();
  server.listen(PORT, HOST, () => {
    process.stdout.write('VESPER online em http://' + (HOST === '0.0.0.0' ? '127.0.0.1' : HOST) + ':' + PORT + '\n');
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { server.closeAll(); process.exit(0); });
}

module.exports = { createServer, Hub, Room, Connection, encodeFrame, PORT };
