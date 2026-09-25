'use strict';

const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const VesperArena = require('./vesper-arena.js');
const { Market, FileStore, PgStore } = require('./vesper-market.cjs');
const { Accounts, keyOf } = require('./vesper-accounts.cjs');

const { Arena, CONFIG, coinsFor } = VesperArena;
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '0.0.0.0';
const PAGE = path.join(__dirname, 'VESPER', 'index.html');
const MAX_PAYLOAD = 16384;
const DATA = process.env.VESPER_DATA_DIR || path.join(__dirname, 'data');
const DATABASE = process.env.DATABASE_URL || '';
const ADMIN = Object.freeze({ salt: '31f340484c0d3bddb06bf7820472a770', hash: 'c629ddb37b9585bd66491d5d7b1f60f08d54162ac2953503ee64cbce2c8b3ad0', rounds: 600000, tries: 5, window: 600000, hours: 2 });
const REQUESTS = new Set(['join', 'create', 'enter', 'admin', 'acct', 'staff', 'm']);
const PACE = Object.freeze({ window: 10000, requests: 24 });
const CODE_MISSES = 20;
const SOCKETS = Object.freeze({ address: 30, total: 2000 });
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const HEADERS = Object.freeze({
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Strict-Transport-Security': 'max-age=31536000'
});
const CODE_WINDOW = 600000;
const digest = value => crypto.createHash('sha256').update(value).digest('hex');

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
    this.fragmentSize = 0;
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
    if (frame.opcode >= 0x8) {
      if (!frame.fin || frame.payload.length > 125) { this.close(1002); return; }
      if (frame.opcode === 0x8) this.close();
      else if (frame.opcode === 0x9 && !this.socket.destroyed) this.socket.write(encodeFrame(0xa, frame.payload));
      return;
    }
    if (frame.opcode === 0x0) {
      if (!this.fragments.length) { this.close(1002); return; }
      this.fragmentSize += frame.payload.length;
      if (this.fragmentSize > MAX_PAYLOAD) { this.close(1009); return; }
      this.fragments.push(frame.payload);
      if (!frame.fin) return;
      const payload = Buffer.concat(this.fragments);
      this.fragments = [];
      this.fragmentSize = 0;
      this._deliver(this.fragmentOpcode, payload);
      return;
    }
    if (this.fragments.length) { this.close(1002); return; }
    if (!frame.fin) {
      this.fragmentOpcode = frame.opcode;
      this.fragments = [frame.payload];
      this.fragmentSize = frame.payload.length;
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
  constructor(number, hub, code = '') {
    this.number = number;
    this.hub = hub;
    this.code = code;
    this.started = !code;
    this.hostId = 0;
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
  get accepting() { return !this.code && !this.over && this.age < CONFIG.joinSeconds && this.humans < CONFIG.capacity; }

  joinedMessage(client, fighter, resumed = false) {
    const message = {
      t: 'joined', id: fighter.id, room: this.number, capacity: CONFIG.capacity,
      remaining: Number(this.arena.remaining.toFixed(2)), token: client.token,
      roster: this.arena.roster(), crates: this.arena.crateState()
    };
    if (resumed) message.resumed = true;
    return message;
  }

  sendLobby() {
    const players = this.arena.roster().map(({ id, name, skin, acc }) => ({ id, name, skin, acc }));
    for (const [id, client] of this.clients) client.send({ t: 'lobby', code: this.code, you: id, host: id === this.hostId, hostId: this.hostId, players });
  }

  start(client) {
    if (this.started || this.over || client.fighterId !== this.hostId) return;
    this.started = true;
    this.createdAt = Date.now();
    this.lastTick = Date.now();
    for (const [id, member] of this.clients) member.send(this.joinedMessage(member, this.arena.fighters.find(fighter => fighter.id === id)));
  }

  closeLobby() {
    for (const client of this.clients.values()) {
      client.room = null;
      client.fighterId = 0;
      client.send({ t: 'closed', reason: 'host' });
    }
    this.clients.clear();
    this.over = true;
    this.dispose();
  }

  add(client, profile) {
    if (this.arena.fighters.length >= CONFIG.capacity) {
      const bot = this.arena.worstBot();
      if (!bot) return null;
      this.arena.leave(bot.id);
    }
    const fighter = this.arena.join({ name: profile.name, skin: profile.skin, acc: profile.acc, bot: false });
    client.room = this;
    client.fighterId = fighter.id;
    this.clients.set(fighter.id, client);
    if (!this.hostId) this.hostId = fighter.id;
    if (this.started) client.send(this.joinedMessage(client, fighter));
    else this.sendLobby();
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
    if (this.started || this.over) return;
    if (fighterId === this.hostId) this.closeLobby();
    else this.sendLobby();
  }

  broadcast(message) {
    for (const client of this.clients.values()) client.send(message);
  }

  tick() {
    const now = Date.now();
    const dt = Math.min(0.25, Math.max(0, (now - this.lastTick) / 1000));
    this.lastTick = now;
    if (this.over || !this.started) return;
    if (!this.code && !this.botsReady && this.age >= CONFIG.botFill) {
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
    if (this.code) this.hub.codes.delete(this.code);
  }
}

class Hub {
  constructor(options = {}) {
    this.rooms = new Map();
    this.codes = new Map();
    this.sessions = new Map();
    this.attempts = new Map();
    this.adminTokens = new Map();
    this.misses = new Map();
    this.clients = new Set();
    this.admin = options.admin || ADMIN;
    this.nextRoom = 1;
    this.store = options.dataDir === null ? new FileStore('') : DATABASE ? new PgStore(DATABASE) : new FileStore(path.join(options.dataDir || DATA, 'vesper.json'));
    this.market = new Market(this.store);
    this.accounts = new Accounts(this.store, this.market);
  }

  profileOf(message, name) {
    return {
      name,
      skin: String(message.skin || 'alien'),
      acc: Array.isArray(message.acc) ? message.acc.slice(0, 8).map(String) : []
    };
  }

  createRoom(client, message) {
    if (client.room) return;
    let code;
    do { code = String(crypto.randomInt(0, 1000000)).padStart(6, '0'); } while (this.codes.has(code));
    const room = new Room(this.nextRoom++, this, code);
    this.rooms.set(room.number, room);
    this.codes.set(code, room);
    client.token = crypto.randomBytes(12).toString('hex');
    room.add(client, this.profileOf(message, client.name));
  }

  enterRoom(client, message) {
    if (client.room) return;
    const now = Date.now();
    const misses = (this.misses.get(client.address) || []).filter(time => now - time < CODE_WINDOW);
    if (misses.length >= CODE_MISSES) { client.send({ t: 'error', reason: 'codigos' }); return; }
    const room = this.codes.get(String(message.code || '').replace(/\D/g, '').slice(0, 6));
    if (!room || room.over) {
      if (this.misses.size > 5000) this.misses.clear();
      this.misses.set(client.address, [...misses, now]);
      client.send({ t: 'error', reason: 'code' });
      return;
    }
    if (room.started) { client.send({ t: 'error', reason: 'started' }); return; }
    if (room.arena.fighters.length >= CONFIG.capacity) { client.send({ t: 'error', reason: 'full' }); return; }
    client.token = crypto.randomBytes(12).toString('hex');
    room.add(client, this.profileOf(message, client.name));
  }

  async withAccount(client, message) {
    if (client.room || client.checking) return;
    client.checking = true;
    try {
      const user = await this.accounts.userOf(message.session);
      if (client.connection && client.connection.closed) return;
      if (!user) { client.send({ t: 'error', reason: 'conta' }); return; }
      client.name = user.name;
      if (message.t === 'create') this.createRoom(client, message);
      else if (message.t === 'enter') this.enterRoom(client, message);
      else this.join(client, message);
    } catch (error) {
      process.stderr.write('Contas: ' + error.message + '\n');
      client.send({ t: 'error', reason: 'conexao' });
    } finally {
      client.checking = false;
    }
  }

  async marketFor(client, message) {
    let who = null;
    if (message.session) {
      let user = null;
      try { user = await this.accounts.userOf(message.session); } catch (_) { client.send({ t: 'mr', rid: message.rid, ok: false, error: 'servidor' }); return; }
      if (!user) { client.send({ t: 'mr', rid: message.rid, ok: false, error: 'conta' }); return; }
      who = { owner: user.uid, name: user.name };
    }
    await this.market.handle(client, message, who);
  }

  async actorOf(message) {
    const token = typeof message.token === 'string' ? message.token : '';
    if (token) {
      const expires = this.adminTokens.get(digest(token));
      if (expires && expires > Date.now()) return { master: true, key: '' };
    }
    if (!message.session) return null;
    const user = await this.accounts.userOf(message.session);
    return user && user.admin ? { master: false, key: keyOf(user.name) } : null;
  }

  async staff(client, message) {
    const reply = (ok, data, error) => client.send({ t: 'staff', rid: message.rid, ok, data, error });
    try {
      const actor = await this.actorOf(message);
      if (!actor) { reply(false, null, 'negado'); return; }
      const result = await this.accounts.staff(actor, message);
      if (!result.error && message.op === 'ban' && message.banned === true) this.kick(keyOf(message.name));
      reply(!result.error, result.data || null, result.error);
    } catch (error) {
      process.stderr.write('Painel: ' + error.message + '\n');
      reply(false, null, 'servidor');
    }
  }

  kick(key) {
    for (const client of this.clients) {
      if (!client.name || keyOf(client.name) !== key) continue;
      if (client.room && client.fighterId) client.room.remove(client.fighterId, false);
      client.room = null;
      client.fighterId = 0;
      client.send({ t: 'closed', reason: 'banido' });
      client.connection.close();
    }
  }

  paced(client) {
    const now = Date.now();
    client.requests = (client.requests || []).filter(time => now - time < PACE.window);
    if (client.requests.length >= PACE.requests) return false;
    client.requests.push(now);
    return true;
  }

  checkAdmin(client, message) {
    const now = Date.now();
    const fresh = list => (list || []).filter(time => now - time < this.admin.window);
    const mine = fresh(this.attempts.get(client.address));
    const all = fresh(this.attempts.get('*'));
    const blocked = mine.length >= this.admin.tries ? mine : all.length >= this.admin.tries * 6 ? all : null;
    if (blocked) {
      client.send({ t: 'admin', rid: message.rid, ok: false, wait: Math.ceil((this.admin.window - (now - blocked[0])) / 60000) });
      return;
    }
    mine.push(now);
    all.push(now);
    if (this.attempts.size > 1000) for (const [key, list] of this.attempts) if (!fresh(list).length) this.attempts.delete(key);
    this.attempts.set(client.address, mine);
    this.attempts.set('*', all);
    const key = typeof message.key === 'string' ? message.key.slice(0, 64) : '';
    crypto.pbkdf2(key, Buffer.from(this.admin.salt, 'hex'), this.admin.rounds, 32, 'sha256', (error, derived) => {
      const ok = !error && crypto.timingSafeEqual(derived, Buffer.from(this.admin.hash, 'hex'));
      if (!ok) { client.send({ t: 'admin', rid: message.rid, ok: false }); return; }
      this.attempts.delete(client.address);
      for (const [id, expires] of this.adminTokens) if (expires <= Date.now()) this.adminTokens.delete(id);
      const token = crypto.randomBytes(32).toString('hex');
      this.adminTokens.set(digest(token), Date.now() + this.admin.hours * 3600000);
      client.send({ t: 'admin', rid: message.rid, ok: true, token });
    });
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
    if (!fighter || fighter.name !== client.name || room.clients.has(fighter.id)) return null;
    this.sessions.delete(token);
    client.token = token;
    client.room = room;
    client.fighterId = fighter.id;
    room.clients.set(fighter.id, client);
    client.send(room.joinedMessage(client, fighter, true));
    return fighter;
  }

  join(client, message) {
    if (client.room) return;
    if (message.token && this.resume(client, message.token)) return;
    const room = this.roomFor();
    client.token = crypto.randomBytes(12).toString('hex');
    const fighter = room.add(client, this.profileOf(message, client.name));
    if (!fighter) client.send({ t: 'error', reason: 'full' });
  }

  drop(client) {
    if (!client.room || !client.fighterId) return;
    const room = client.room;
    const fighterId = client.fighterId;
    const token = client.token;
    if (!room.started) { room.remove(fighterId, false); return; }
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
    const entry = message.t === 'join' || message.t === 'create' || message.t === 'enter';
    if (REQUESTS.has(message.t) && !this.paced(client)) {
      client.send(entry ? { t: 'error', reason: 'devagar' } : { t: message.t === 'm' ? 'mr' : message.t, rid: message.rid, ok: false, error: 'devagar' });
      return;
    }
    if (entry) { this.withAccount(client, message); return; }
    if (message.t === 'admin') { this.checkAdmin(client, message); return; }
    if (message.t === 'acct') { this.accounts.handle(client, message); return; }
    if (message.t === 'staff') { this.staff(client, message); return; }
    if (message.t === 'm') { this.marketFor(client, message); return; }
    if (!client.room || !client.fighterId) return;
    if (message.t === 'start') { client.room.start(client); return; }
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
      rooms: [...this.rooms.values()].filter(room => !room.code).map(room => ({
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

function policyFor(html, host) {
  const hashes = tag => [...html.matchAll(new RegExp('<' + tag + '\\b[^>]*>([\\s\\S]*?)</' + tag + '>', 'g'))]
    .map(match => "'sha256-" + crypto.createHash('sha256').update(match[1], 'utf8').digest('base64') + "'").join(' ');
  const socket = /^[a-z0-9.-]+(:\d+)?$/i.test(host) ? ' wss://' + host + ' ws://' + host : '';
  return [
    "default-src 'none'", 'script-src ' + hashes('script'), 'style-src ' + hashes('style'), "img-src 'self' data:",
    "connect-src 'self'" + socket, "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'", "object-src 'none'"
  ].join('; ');
}

function serveGame(request, response) {
  fs.readFile(PAGE, 'utf8', (error, html) => {
    if (error) {
      response.writeHead(404, { ...HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('VESPER/index.html nao encontrado. Rode node build.cjs antes.');
      return;
    }
    response.writeHead(200, {
      ...HEADERS, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
      'Content-Security-Policy': policyFor(html, String(request.headers.host || ''))
    });
    response.end(request.method === 'HEAD' ? undefined : html);
  });
}

function sameHost(origin, host) {
  try { return new URL(origin).host === String(host || ''); } catch (_) { return false; }
}

function createServer(options = {}) {
  const hub = new Hub(options);
  const server = http.createServer((request, response) => {
    let pathname = '';
    try { pathname = new URL(request.url, 'http://localhost').pathname; } catch (_) { pathname = ''; }
    if (pathname === '/status') {
      response.writeHead(200, { ...HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(hub.stats()));
      return;
    }
    if ((pathname === '/' || pathname === '/index.html') && (request.method === 'GET' || request.method === 'HEAD')) { serveGame(request, response); return; }
    response.writeHead(pathname ? 404 : 400, { ...HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
    response.end(pathname ? 'Not found' : 'Bad request');
  });

  server.on('upgrade', (request, socket) => {
    const key = request.headers['sec-websocket-key'];
    if (!key || request.headers.upgrade !== 'websocket') {
      socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
      return;
    }
    const cloud = String(request.headers['true-client-ip'] || request.headers['cf-connecting-ip'] || '').trim().slice(0, 64);
    const origin = request.headers.origin;
    const trusted = !origin || (origin === 'null' ? !cloud && LOOPBACK.has(request.socket.remoteAddress) : sameHost(origin, request.headers.host));
    if (!trusted) { socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return; }
    const address = cloud || request.socket.remoteAddress || 'local';
    let open = 0;
    for (const other of hub.clients) if (other.address === address) open++;
    if (open >= SOCKETS.address || hub.clients.size >= SOCKETS.total) { socket.end('HTTP/1.1 429 Too Many Requests\r\n\r\n'); return; }
    const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
    socket.write([
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      'Sec-WebSocket-Accept: ' + accept,
      '\r\n'
    ].join('\r\n'));
    const client = { room: null, fighterId: 0, token: '', name: '', address };
    const connection = new Connection(socket, message => hub.handle(client, message), () => { hub.clients.delete(client); hub.drop(client); });
    client.send = value => connection.send(value);
    client.connection = connection;
    hub.clients.add(client);
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
  server.hub.store.setup().then(
    () => process.stdout.write('Contas e Trocas guardadas ' + (DATABASE ? 'no banco de dados' : 'em ' + path.join(DATA, 'vesper.json')) + '\n'),
    error => process.stderr.write('Contas e Trocas sem banco de dados: ' + error.message + '\n')
  );
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { server.closeAll(); process.exit(0); });
}

module.exports = { createServer, Hub, Room, Connection, encodeFrame, PORT };
