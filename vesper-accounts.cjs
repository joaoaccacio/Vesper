'use strict';

const crypto = require('node:crypto');
const { tradeKeyOf } = require('./vesper-arena.js');
const { ownerOf } = require('./vesper-market.cjs');

const NAME = /^[A-Za-z0-9À-ÖØ-öø-ÿ_.-]{3,14}$/;
const RESERVED = /^(adm|admin.*|administra.*|moderador.*|suporte|sistema|vesper|root)$/;
const LIMIT = Object.freeze({
  minPassword: 6, maxPassword: 72, sessions: 5, sessionAge: 90 * 86400000, profile: 8000,
  failures: 10, registrations: 5, window: 900000, hour: 3600000, hashes: 120, coins: 1000000, saveGap: 1500
});
const SCRYPT = Object.freeze({ N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
const DUMMY = crypto.randomBytes(16).toString('hex');
const WEAK = new Set(['123456', '1234567', '12345678', '123456789', '1234567890', '654321', '123123', '112233', '121212', '123321',
  'abc123', 'abcdef', 'qwerty', 'qwerty123', 'password', 'senha', 'senha1', 'senha12', 'senha123', 'senha1234', 'mudar123',
  'iloveyou', 'teamo', 'brasil', 'flamengo', 'corinthians', 'palmeiras', 'vesper', 'vesper123', 'admin123', 'gamer123', 'minecraft']);

const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const cleanName = name => String(name ?? '').normalize('NFKC').trim();
const keyOf = name => 'user:' + cleanName(name).toLowerCase();
const derive = (password, salt) => new Promise((resolve, reject) => {
  crypto.scrypt(password, Buffer.from(salt, 'hex'), 32, SCRYPT, (error, key) => (error ? reject(error) : resolve(key)));
});

class Accounts {
  constructor(store, market) {
    this.store = store;
    this.market = market;
    this.failures = new Map();
    this.registrations = new Map();
    this.hashes = [];
    this.saves = new Map();
  }

  recent(map, key, window) {
    const now = Date.now();
    const list = (map.get(key) || []).filter(time => now - time < window);
    if (list.length) map.set(key, list); else map.delete(key);
    if (map.size > 5000) for (const [entry, times] of map) if (!times.some(time => now - time < window)) map.delete(entry);
    return list;
  }

  mark(map, key) {
    map.set(key, [...(map.get(key) || []), Date.now()]);
  }

  waitFor(list, window) {
    return Math.max(1, Math.ceil((window - (Date.now() - list[0])) / 60000));
  }

  budget() {
    const now = Date.now();
    this.hashes = this.hashes.filter(time => now - time < 60000);
    if (this.hashes.length >= LIMIT.hashes) return false;
    this.hashes.push(now);
    return true;
  }

  newSession(key) {
    return Buffer.from(key.slice(5)).toString('base64url') + '.' + crypto.randomBytes(24).toString('hex');
  }

  keySession(sessions, token, now = Date.now()) {
    return [...(sessions || []).filter(entry => now - entry.at < LIMIT.sessionAge), { id: digest(token), at: now }].slice(-LIMIT.sessions);
  }

  snapshot(profile) {
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return null;
    const text = JSON.stringify(profile);
    if (!text || text.length > LIMIT.profile) return null;
    const copy = JSON.parse(text);
    delete copy.account;
    copy.stamp = Number.isFinite(copy.stamp) ? copy.stamp : 0;
    return copy;
  }

  read(key) {
    return this.store.update(key, current => ({ data: current }), false).then(result => result.data);
  }

  async userOf(session) {
    const token = String(session || '');
    const dot = token.lastIndexOf('.');
    if (dot < 1 || token.length > 200) return null;
    const name = Buffer.from(token.slice(0, dot), 'base64url').toString('utf8');
    const key = 'user:' + name;
    if (!NAME.test(name)) return null;
    const user = await this.read(key);
    if (!user || user.banned || !Array.isArray(user.sessions)) return null;
    const id = digest(token);
    const now = Date.now();
    if (!user.sessions.some(entry => entry.id === id && now - entry.at < LIMIT.sessionAge)) return null;
    return { ...user, key };
  }

  async handle(client, message) {
    const run = Object.prototype.hasOwnProperty.call(OPERATIONS, message.op) ? OPERATIONS[message.op] : null;
    let result;
    try {
      result = run ? await run.call(this, client, message) : { ok: false, error: 'pedido' };
    } catch (error) {
      process.stderr.write('Contas: ' + error.message + '\n');
      result = { ok: false, error: 'servidor' };
    }
    client.send({ t: 'acct', rid: message.rid, ...result });
  }

  async staff(actor, message) {
    const key = keyOf(message.name);
    const user = await this.read(key);
    if (!user) return { error: 'nome' };
    const view = target => {
      const profile = target.profile || {};
      return {
        name: target.name, admin: Boolean(target.admin), banned: Boolean(target.banned),
        coins: Number.isFinite(profile.coins) ? Math.max(0, Math.floor(profile.coins)) : 0,
        items: [
          ...(Array.isArray(profile.owned) ? profile.owned.map(id => 'skin:' + id) : []),
          ...(Array.isArray(profile.accessories) ? profile.accessories.map(id => 'acc:' + id) : [])
        ].map(tradeKeyOf).filter(Boolean)
      };
    };
    if (message.op === 'find') return { data: view(user) };
    if (message.op === 'role') {
      const admin = message.admin === true;
      if (!admin && actor.key === key) return { error: 'proprio' };
      if (admin && user.banned) return { error: 'banido' };
      const result = await this.store.update(key, current => {
        if (!current) return { error: 'nome' };
        current.admin = admin;
        return { value: current, data: view(current) };
      }, true);
      return result;
    }
    if (message.op === 'ban') {
      const banned = message.banned === true;
      if (actor.key === key) return { error: 'voce' };
      if (banned && user.admin) return { error: 'admin' };
      const result = await this.store.update(key, current => {
        if (!current) return { error: 'nome' };
        current.banned = banned;
        if (banned) current.sessions = [];
        return { value: current, data: view(current) };
      }, true);
      if (!result.error && banned) await this.market.banish(user.uid);
      return result;
    }
    if (message.op === 'give') {
      const take = message.take === true;
      if (message.item !== undefined) {
        const item = tradeKeyOf(message.item);
        if (!item) return { error: 'item' };
        if (take) await this.market.grant(user.uid, { remove: [item], unlock: [item], note: 'A administração removeu um item da sua conta' }, item);
        else await this.market.grant(user.uid, { add: [item], note: 'Presente da administração' });
        return { data: view(user) };
      }
      const coins = Math.floor(Number(message.coins));
      if (!Number.isFinite(coins) || coins < 1 || coins > LIMIT.coins) return { error: 'moedas' };
      await this.market.grant(user.uid, take ? { coins: -coins, note: 'A administração removeu moedas da sua conta' } : { coins, note: 'Presente da administração' });
      return { data: view(user) };
    }
    return { error: 'pedido' };
  }
}

const OPERATIONS = {
  async register(client, message) {
    const name = cleanName(message.name);
    const password = typeof message.password === 'string' ? message.password : '';
    if (!NAME.test(name) || (RESERVED.test(name.toLowerCase().replace(/[^\p{L}]/gu, '')) && name.toLowerCase() !== 'adm')) return { ok: false, error: 'nome' };
    if (password.length < LIMIT.minPassword || password.length > LIMIT.maxPassword) return { ok: false, error: 'senha' };
    const lower = password.toLowerCase();
    if (WEAK.has(lower) || lower === name.toLowerCase() || /^(.)\1+$/.test(password)) return { ok: false, error: 'fraca' };
    const created = this.recent(this.registrations, client.address, LIMIT.hour);
    if (created.length >= LIMIT.registrations) return { ok: false, error: 'espera', wait: this.waitFor(created, LIMIT.hour) };
    const key = keyOf(name);
    if (await this.read(key)) return { ok: false, error: 'existe' };
    if (!this.budget()) return { ok: false, error: 'ocupado' };
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = (await derive(password, salt)).toString('hex');
    const session = this.newSession(key);
    const uid = crypto.randomBytes(12).toString('hex');
    const profile = this.snapshot(message.profile);
    const result = await this.store.update(key, current => (current ? { error: 'existe' } : {
      value: { name, uid, salt, hash, admin: false, sessions: this.keySession([], session), profile, created: Date.now() }
    }), true);
    if (result.error) return { ok: false, error: result.error };
    this.mark(this.registrations, client.address);
    if (/^[a-f0-9]{32}$/.test(message.legacy)) await this.market.rename(ownerOf(message.legacy), uid);
    return { ok: true, name, admin: false, session };
  },

  async login(client, message) {
    const name = cleanName(message.name);
    const key = keyOf(name);
    const password = typeof message.password === 'string' ? message.password.slice(0, 200) : '';
    const mine = this.recent(this.failures, 'ip:' + client.address, LIMIT.window);
    const theirs = this.recent(this.failures, key, LIMIT.window);
    const blocked = mine.length >= LIMIT.failures ? mine : theirs.length >= LIMIT.failures ? theirs : null;
    if (blocked) return { ok: false, error: 'espera', wait: this.waitFor(blocked, LIMIT.window) };
    if (!this.budget()) return { ok: false, error: 'ocupado' };
    const user = NAME.test(name) ? await this.read(key) : null;
    const derived = await derive(password, user ? user.salt : DUMMY);
    if (!user || !crypto.timingSafeEqual(derived, Buffer.from(user.hash, 'hex'))) {
      this.mark(this.failures, 'ip:' + client.address);
      this.mark(this.failures, key);
      return { ok: false, error: 'login' };
    }
    if (user.banned) return { ok: false, error: 'banido' };
    const session = this.newSession(key);
    const result = await this.store.update(key, current => {
      if (!current) return { error: 'login' };
      current.sessions = this.keySession(current.sessions, session);
      return { value: current };
    }, true);
    if (result.error) return { ok: false, error: result.error };
    this.failures.delete(key);
    return { ok: true, name: user.name, admin: Boolean(user.admin), session, profile: user.profile || null };
  },

  async me(client, message) {
    const user = await this.userOf(message.session);
    if (!user) return { ok: false, error: 'sessao' };
    return { ok: true, name: user.name, admin: Boolean(user.admin), profile: user.profile || null };
  },

  async logout(client, message) {
    const user = await this.userOf(message.session);
    if (!user) return { ok: true };
    const id = digest(String(message.session));
    await this.store.update(user.key, current => {
      if (!current) return { error: 'sessao' };
      current.sessions = (current.sessions || []).filter(entry => entry.id !== id);
      return { value: current };
    }, true);
    return { ok: true };
  },

  async save(client, message) {
    const user = await this.userOf(message.session);
    if (!user) return { ok: false, error: 'sessao' };
    const profile = this.snapshot(message.profile);
    if (!profile) return { ok: false, error: 'perfil' };
    const last = this.saves.get(user.uid) || 0;
    if (Date.now() - last < LIMIT.saveGap) return { ok: false, error: 'devagar' };
    this.saves.set(user.uid, Date.now());
    if (this.saves.size > 5000) this.saves.clear();
    const result = await this.store.update(user.key, current => {
      if (!current) return { error: 'sessao' };
      if (current.profile && current.profile.stamp > profile.stamp) return { error: 'velho', profile: current.profile };
      current.profile = profile;
      return { value: current };
    }, true);
    return result.error ? { ok: false, error: result.error, profile: result.profile || null } : { ok: true };
  }
};

module.exports = { Accounts, keyOf, LIMIT, NAME };
