(() => {
  'use strict';

  const Arena = typeof window === 'object' ? window.VesperArena : null;
  const { ARENA, WEAPONS, SKINS, ACCESSORIES, CONFIG, clamp, weaponFor, coinsFor, bonusOf, accessoriesOf, tradeKeyOf, segmentHit, bounds } = Arena;
  const TAU = Math.PI * 2;
  const STORE = Object.freeze({ profile: 'vesper.online.v1', account: 'vesper.account.v1' });

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      const value = raw ? JSON.parse(raw) : null;
      return value && typeof value === 'object' ? value : fallback;
    } catch (_) { return fallback; }
  }

  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (_) { return false; }
  }

  const served = () => typeof location === 'object' && /^https?:$/.test(location.protocol || '');

  function defaultServer() {
    if (typeof location === 'object' && /^https?:$/.test(location.protocol || '') && location.host) {
      return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
    }
    return 'ws://127.0.0.1:8080';
  }

  function normalizeServer(value) {
    const text = String(value || '').trim().replace(/\/+$/, '');
    if (!text) return '';
    if (/^wss?:\/\//i.test(text)) return text;
    if (/^https:\/\//i.test(text)) return 'wss://' + text.slice(8);
    if (/^http:\/\//i.test(text)) return 'ws://' + text.slice(7);
    return 'ws://' + text;
  }

  const DAILY_REWARDS = Object.freeze([
    { day: 1, type: 'coins', amount: 15 },
    { day: 2, type: 'coins', amount: 20 },
    { day: 3, type: 'accessory', id: 'hat' },
    { day: 4, type: 'coins', amount: 25 },
    { day: 5, type: 'coins', amount: 20 },
    { day: 6, type: 'coins', amount: 25 },
    { day: 7, type: 'accessory', id: 'mini' },
    { day: 8, type: 'coins', amount: 30 },
    { day: 9, type: 'coins', amount: 35 },
    { day: 10, type: 'skin', id: 'banana' },
    { day: 11, type: 'coins', amount: 35 },
    { day: 12, type: 'coins', amount: 40 },
    { day: 13, type: 'gift' },
    { day: 14, type: 'coins', amount: 40 },
    { day: 15, type: 'skin', id: 'penguin' }
  ].map(reward => Object.freeze(reward)));

  function localDay(date = new Date()) {
    const pad = value => String(value).padStart(2, '0');
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  const itemOf = key => {
    const [kind, id] = key.split(':');
    return { kind, id };
  };
  const hasItem = (profile, key) => {
    const { kind, id } = itemOf(key);
    return kind === 'skin' ? profile.owned.includes(id) : profile.accessories.includes(id);
  };
  const addItem = (profile, key) => {
    const { kind, id } = itemOf(key);
    if (kind === 'skin' && !profile.owned.includes(id)) profile.owned.push(id);
    if (kind === 'acc' && !profile.accessories.includes(id)) profile.accessories.push(id);
  };
  const removeItem = (profile, key) => {
    const { kind, id } = itemOf(key);
    if (kind === 'skin') {
      profile.owned = profile.owned.filter(item => item !== id);
      if (profile.skin === id) profile.skin = 'alien';
    } else {
      profile.accessories = profile.accessories.filter(item => item !== id);
      profile.worn = profile.worn.filter(item => item !== id);
    }
  };
  const keysOf = list => (Array.isArray(list) ? [...new Set(list.map(tradeKeyOf).filter(Boolean))] : []);

  const Profile = {
    load() {
      const saved = readJson(STORE.profile, {});
      const available = SKINS.map(skin => skin.id);
      const owned = available.filter(id => id === 'alien' || (Array.isArray(saved.owned) && saved.owned.includes(id)));
      const coins = Number.isFinite(saved.coins) && saved.coins > 0 ? Math.floor(saved.coins) : 0;
      const accessories = ACCESSORIES.filter(item => Array.isArray(saved.accessories) && saved.accessories.includes(item.id)).map(item => item.id);
      return {
        coins, owned,
        skin: owned.includes(saved.skin) ? saved.skin : 'alien',
        name: typeof saved.name === 'string' ? saved.name.slice(0, 14) : '',
        accessories,
        worn: accessoriesOf(saved.worn).filter(id => accessories.includes(id)),
        daily: Number.isInteger(saved.daily) ? clamp(saved.daily, 0, DAILY_REWARDS.length) : 0,
        lastClaim: typeof saved.lastClaim === 'string' ? saved.lastClaim.slice(0, 10) : '',
        account: /^[a-f0-9]{32}$/.test(saved.account) ? saved.account : '',
        locked: keysOf(saved.locked),
        applied: Array.isArray(saved.applied) ? saved.applied.filter(id => typeof id === 'string').slice(-100) : [],
        stamp: Number.isFinite(saved.stamp) ? saved.stamp : 0
      };
    },
    save(profile) {
      profile.stamp = Date.now();
      writeJson(STORE.profile, {
        version: 4, coins: profile.coins, owned: profile.owned, skin: profile.skin, name: profile.name,
        accessories: profile.accessories, worn: profile.worn, daily: profile.daily, lastClaim: profile.lastClaim,
        account: profile.account, locked: profile.locked, applied: profile.applied, stamp: profile.stamp
      });
      Account.touch();
      return profile;
    },
    snapshot() {
      const { account, ...rest } = Profile.load();
      return rest;
    },
    adopt(snapshot) {
      if (!snapshot || typeof snapshot !== 'object') return Profile.load();
      writeJson(STORE.profile, { ...snapshot, version: 4, account: Profile.load().account });
      return Profile.load();
    },
    has(key) {
      const item = tradeKeyOf(key);
      return Boolean(item) && hasItem(Profile.load(), item);
    },
    grant(key) {
      const profile = Profile.load();
      const item = tradeKeyOf(key);
      if (item) addItem(profile, item);
      return Profile.save(profile);
    },
    revoke(key) {
      const profile = Profile.load();
      const item = tradeKeyOf(key);
      if (item) {
        removeItem(profile, item);
        profile.locked = profile.locked.filter(entry => entry !== item);
      }
      return Profile.save(profile);
    },
    adjustCoins(amount) {
      const profile = Profile.load();
      profile.coins = Math.max(0, profile.coins + Math.round(Number(amount) || 0));
      return Profile.save(profile);
    },
    tradeable() {
      const profile = Profile.load();
      const keys = keysOf([...profile.owned.map(id => 'skin:' + id), ...profile.accessories.map(id => 'acc:' + id)]);
      return keys.filter(key => !profile.locked.includes(key));
    },
    applyDeliveries(deliveries) {
      const profile = Profile.load();
      const applied = [];
      const notes = [];
      for (const delivery of Array.isArray(deliveries) ? deliveries : []) {
        if (!delivery || typeof delivery.id !== 'string') continue;
        applied.push(delivery.id);
        if (profile.applied.includes(delivery.id)) continue;
        profile.coins = Math.max(0, profile.coins + (Math.round(Number(delivery.coins)) || 0));
        for (const key of keysOf(delivery.remove)) removeItem(profile, key);
        for (const key of keysOf(delivery.add)) addItem(profile, key);
        const unlock = keysOf(delivery.unlock);
        profile.locked = keysOf([...profile.locked.filter(key => !unlock.includes(key)), ...keysOf(delivery.lock)]).filter(key => hasItem(profile, key));
        profile.applied = [...profile.applied, delivery.id].slice(-100);
        if (delivery.note) notes.push(String(delivery.note));
      }
      return { profile: Profile.save(profile), applied, notes };
    },
    priceOf(id) {
      const skin = SKINS.find(item => item.id === id);
      return skin && Number.isFinite(skin.price) ? skin.price : Infinity;
    },
    buy(id) {
      const profile = Profile.load();
      const price = Profile.priceOf(id);
      if (profile.owned.includes(id)) return { ok: false, reason: 'owned', profile };
      if (!Number.isFinite(price)) return { ok: false, reason: 'unknown', profile };
      if (profile.coins < price) return { ok: false, reason: 'coins', profile, missing: price - profile.coins };
      profile.coins -= price;
      profile.owned.push(id);
      profile.skin = id;
      return { ok: true, profile: Profile.save(profile) };
    },
    select(id) {
      const profile = Profile.load();
      if (!profile.owned.includes(id)) return { ok: false, profile };
      profile.skin = id;
      return { ok: true, profile: Profile.save(profile) };
    },
    setName(name) {
      const profile = Profile.load();
      profile.name = String(name || '').trim().slice(0, 14);
      return Profile.save(profile);
    },
    reward(amount) {
      const profile = Profile.load();
      profile.coins += Math.max(0, Math.round(amount));
      return Profile.save(profile);
    },
    dailyState(today = localDay()) {
      const profile = Profile.load();
      const done = profile.daily >= DAILY_REWARDS.length;
      return { claimed: profile.daily, ready: !done && profile.lastClaim !== today, done, next: done ? null : DAILY_REWARDS[profile.daily] };
    },
    claimDaily(today = localDay()) {
      const profile = Profile.load();
      if (profile.daily >= DAILY_REWARDS.length || profile.lastClaim === today) return { ok: false, profile };
      const reward = DAILY_REWARDS[profile.daily];
      if (reward.type === 'coins') profile.coins += reward.amount;
      if (reward.type === 'accessory' && !profile.accessories.includes(reward.id)) {
        profile.accessories.push(reward.id);
        profile.worn = accessoriesOf([reward.id, ...profile.worn]);
      }
      if (reward.type === 'skin' && !profile.owned.includes(reward.id)) profile.owned.push(reward.id);
      profile.daily++;
      profile.lastClaim = today;
      return { ok: true, reward, profile: Profile.save(profile) };
    },
    toggleAccessory(id) {
      const profile = Profile.load();
      if (!profile.accessories.includes(id)) return { ok: false, profile };
      profile.worn = profile.worn.includes(id) ? profile.worn.filter(item => item !== id) : accessoriesOf([id, ...profile.worn]);
      return { ok: true, profile: Profile.save(profile) };
    },
    buyAccessory(id) {
      const profile = Profile.load();
      const item = ACCESSORIES.find(entry => entry.id === id);
      if (!item || !Number.isFinite(item.price)) return { ok: false, reason: 'unknown', profile };
      if (profile.accessories.includes(id)) return { ok: false, reason: 'owned', profile };
      if (profile.coins < item.price) return { ok: false, reason: 'coins', profile, missing: item.price - profile.coins };
      profile.coins -= item.price;
      profile.accessories.push(id);
      profile.worn = accessoriesOf([id, ...profile.worn]);
      return { ok: true, profile: Profile.save(profile) };
    }
  };

  let pushTimer = null;
  const Account = {
    onChange: null,
    state() {
      const saved = readJson(STORE.account, null);
      if (!saved || typeof saved.session !== 'string' || !saved.session || typeof saved.name !== 'string') return null;
      return { name: saved.name.slice(0, 14), session: saved.session.slice(0, 200), admin: saved.admin === true };
    },
    signedIn() {
      return Boolean(Account.state());
    },
    session() {
      const state = Account.state();
      return state ? state.session : '';
    },
    remember(reply, session) {
      const name = String(reply.name || '').slice(0, 14);
      writeJson(STORE.account, { name, session, admin: reply.admin === true });
      if (Profile.load().name !== name) Profile.setName(name);
    },
    clear() {
      clearTimeout(pushTimer);
      try { localStorage.removeItem(STORE.account); } catch (_) {  }
      writeJson(STORE.profile, { version: 4, account: Profile.load().account });
    },
    async register(name, password) {
      const profile = Profile.load();
      const reply = await VesperGame.Server.request({ t: 'acct', op: 'register', name, password, profile: Profile.snapshot(), legacy: profile.account });
      if (reply.ok) Account.remember(reply, reply.session);
      return reply;
    },
    async login(name, password) {
      const reply = await VesperGame.Server.request({ t: 'acct', op: 'login', name, password });
      if (reply.ok) {
        if (reply.profile) Profile.adopt(reply.profile);
        Account.remember(reply, reply.session);
      }
      return reply;
    },
    async refresh() {
      const state = Account.state();
      if (!state) return null;
      const reply = await VesperGame.Server.request({ t: 'acct', op: 'me', session: state.session });
      if (reply.ok) {
        if (reply.profile && Number(reply.profile.stamp) > Profile.load().stamp) Profile.adopt(reply.profile);
        Account.remember(reply, state.session);
      } else if (reply.error === 'sessao') Account.clear();
      return reply;
    },
    async logout() {
      const state = Account.state();
      clearTimeout(pushTimer);
      if (state && served()) {
        await Account.push();
        await VesperGame.Server.request({ t: 'acct', op: 'logout', session: state.session }).catch(() => null);
      }
      Account.clear();
    },
    touch() {
      if (!served() || !Account.state()) return;
      clearTimeout(pushTimer);
      pushTimer = setTimeout(Account.push, 2000);
    },
    async push() {
      const state = Account.state();
      if (!state) return;
      let reply = null;
      try { reply = await VesperGame.Server.request({ t: 'acct', op: 'save', session: state.session, profile: Profile.snapshot() }); } catch (_) { return; }
      if (reply.error === 'velho' && reply.profile) Profile.adopt(reply.profile);
      else if (reply.error === 'sessao') Account.clear();
      else if (reply.error === 'devagar') { Account.touch(); return; }
      else return;
      if (typeof Account.onChange === 'function') Account.onChange();
    }
  };

  const skinCatalog = () => SKINS.map(skin => {
    const character = VesperGame.CHARACTERS.find(item => item.id === skin.id) || { name: skin.id, accent: ARENA.accent };
    return { id: skin.id, name: character.name, accent: character.accent, price: skin.price, skill: skin.skill, shop: Number.isFinite(skin.price) };
  });

  const box = (ctx, color, x, y, width, height) => { ctx.fillStyle = color; ctx.fillRect(x, y, width, height); };
  const shape = (ctx, color, points) => {
    ctx.fillStyle = color; ctx.beginPath();
    points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.closePath(); ctx.fill();
  };
  const stroke = (ctx, color, width, points) => {
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath();
    points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.stroke();
  };
  const round = (ctx, color, x, y, rx, ry) => { ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill(); };
  const STEEL = '#3b424a', LIGHT = '#616b76', DARK = '#22262c', WOOD = '#6d4a2c', GRAIN = '#8f6440', BRASS = '#c9a862';
  const grip = (ctx, color = STEEL) => { shape(ctx, color, [[3, -1], [7, -1], [6, 7], [2.5, 6]]); };
  const stock = (ctx, color = WOOD) => {
    shape(ctx, color, [[-6, -2], [3, -2.6], [3, 2], [-4, 3.4], [-6, 2]]);
    stroke(ctx, GRAIN, 0.7, [[-5, -0.6], [2, -1]]);
  };

  const WEAPON_ART = Object.freeze([
    { muzzle: 17, draw(ctx) {
      grip(ctx, WOOD); stroke(ctx, GRAIN, 0.7, [[4, 1], [5.4, 5]]);
      box(ctx, STEEL, 3.4, -3, 6.6, 3.4);
      round(ctx, LIGHT, 9.6, -1.2, 2.7, 2.7);
      round(ctx, DARK, 9.6, -1.2, 1, 1);
      box(ctx, STEEL, 11.6, -2.2, 5.6, 2.4);
      box(ctx, LIGHT, 11.6, -2.2, 5.6, 0.7);
      box(ctx, DARK, 16.4, -2, 1, 2);
      stroke(ctx, DARK, 1, [[8, 1.6], [9.4, 3.2]]);
    } },
    { muzzle: 18, draw(ctx) {
      grip(ctx); box(ctx, DARK, 3.6, 0.6, 3, 5.4);
      box(ctx, STEEL, 3, -3.4, 14.4, 3.6);
      box(ctx, LIGHT, 3, -3.4, 14.4, 0.9);
      box(ctx, DARK, 16.8, -4.2, 1.2, 1.4);
      stroke(ctx, DARK, 1, [[7.4, 0.4], [8.6, 2.4]]);
    } },
    { muzzle: 21, draw(ctx) {
      grip(ctx); box(ctx, DARK, 3.4, 0.6, 3.2, 8);
      box(ctx, BRASS, 3.8, 6.4, 2.4, 1.6);
      box(ctx, STEEL, 2.6, -3.6, 16.6, 3.8);
      box(ctx, LIGHT, 2.6, -3.6, 16.6, 1);
      box(ctx, DARK, 18.6, -3.2, 2.6, 2);
      stroke(ctx, DARK, 1, [[7.2, 0.4], [8.4, 2.4]]);
    } },
    { muzzle: 27, draw(ctx) {
      stock(ctx); grip(ctx, WOOD);
      box(ctx, STEEL, 3, -3.2, 9, 3.6);
      box(ctx, DARK, 12, -2.8, 15, 2.6);
      box(ctx, LIGHT, 12, -2.8, 15, 0.7);
      box(ctx, WOOD, 13.6, 0.2, 7.6, 2.2);
      stroke(ctx, GRAIN, 0.7, [[14.4, 1.2], [20.4, 1.2]]);
      box(ctx, DARK, 26.4, -3.2, 1.2, 3.4);
    } },
    { muzzle: 25, draw(ctx) {
      stock(ctx); grip(ctx, WOOD);
      box(ctx, STEEL, 3, -3.4, 8.6, 3.8);
      box(ctx, LIGHT, 3, -3.4, 8.6, 1);
      box(ctx, STEEL, 11.6, -2.6, 13.4, 2.2);
      box(ctx, WOOD, 12.6, -0.4, 6.4, 2);
      box(ctx, DARK, 24.2, -3.4, 1.2, 3);
      stroke(ctx, DARK, 1, [[7.6, 0.4], [8.8, 2.4]]);
    } },
    { muzzle: 30, draw(ctx) {
      stock(ctx, '#5c3f26'); grip(ctx, '#5c3f26');
      box(ctx, STEEL, 3, -3.4, 8, 3.8);
      box(ctx, STEEL, 11, -2.4, 19, 1.8);
      box(ctx, LIGHT, 11, -2.4, 19, 0.6);
      box(ctx, DARK, 6.4, -6.6, 8.4, 2.8);
      round(ctx, '#7fb3c4', 14.2, -5.2, 1.2, 1.2);
      stroke(ctx, DARK, 1.2, [[8, -3.8], [8, -6.4]]);
      stroke(ctx, DARK, 1.2, [[13.4, -3.8], [13.4, -6.4]]);
      box(ctx, DARK, 29.2, -3, 1.2, 2.8);
    } },
    { muzzle: 19, draw(ctx) {
      shape(ctx, DARK, [[-4, -2.4], [2, -2.4], [2, 0.6], [-4, 0.6]]);
      stroke(ctx, LIGHT, 0.8, [[-3.6, -1], [1.4, -1]]);
      grip(ctx); shape(ctx, DARK, [[4, 0.6], [7.4, 0.6], [8.6, 8.4], [5, 8.4]]);
      box(ctx, STEEL, 2, -3.6, 11, 4);
      box(ctx, LIGHT, 2, -3.6, 11, 1);
      box(ctx, STEEL, 13, -2.8, 6, 2.2);
      box(ctx, DARK, 17.4, -3.4, 1.8, 3.4);
    } },
    { muzzle: 26, draw(ctx) {
      stock(ctx, DARK);
      grip(ctx); box(ctx, DARK, 3.4, 0.6, 3.4, 7.6);
      box(ctx, STEEL, 2.4, -3.6, 12, 4);
      box(ctx, DARK, 4.6, -6.2, 8.6, 2.4);
      box(ctx, LIGHT, 4.6, -6.2, 8.6, 0.7);
      box(ctx, STEEL, 14.4, -2.8, 11.6, 2.2);
      box(ctx, DARK, 20.4, -4.4, 1.8, 2);
      box(ctx, DARK, 25.2, -3.4, 1.4, 3);
    } },
    { muzzle: 28, draw(ctx) {
      stock(ctx); grip(ctx, WOOD);
      box(ctx, STEEL, 2.6, -3.8, 9.4, 4.2);
      box(ctx, LIGHT, 2.6, -3.8, 9.4, 1);
      shape(ctx, DARK, [[4.4, 0.4], [9.4, 0.4], [11.4, 8.6], [6.4, 9]]);
      shape(ctx, '#4a3324', [[5.2, 1], [8.8, 1], [10.4, 7.6], [7, 7.8]]);
      box(ctx, STEEL, 12, -2.8, 15.6, 2.4);
      box(ctx, WOOD, 13.4, -0.4, 5.6, 1.8);
      box(ctx, DARK, 19.6, -3.4, 2.6, 3);
      box(ctx, DARK, 26.8, -4, 1.4, 3.6);
    } },
    { muzzle: 32, draw(ctx) {
      stock(ctx, DARK); grip(ctx);
      box(ctx, STEEL, 2.4, -4.4, 13, 5);
      box(ctx, LIGHT, 2.4, -4.4, 13, 1.2);
      shape(ctx, DARK, [[4.6, 0.6], [11.4, 0.6], [11.4, 9.6], [4.6, 9.6]]);
      box(ctx, BRASS, 5.4, 8.4, 5.2, 1.4);
      box(ctx, STEEL, 15.4, -3.4, 16.4, 3);
      for (let i = 0; i < 4; i++) box(ctx, DARK, 17 + i * 3.4, -3.2, 1.4, 2.6);
      stroke(ctx, DARK, 1.2, [[24, -0.4], [22.4, 5]]);
      stroke(ctx, DARK, 1.2, [[24, -0.4], [26.4, 4.6]]);
      box(ctx, DARK, 31, -4, 1.4, 4.2);
    } },
    { muzzle: 31, draw(ctx) {
      shape(ctx, DARK, [[-5, -2.8], [3, -3.4], [3, 2.6], [-3.6, 3.8], [-5, 2.4]]);
      grip(ctx, DARK);
      box(ctx, '#2d3140', 2.4, -5.4, 17.4, 7.6);
      box(ctx, '#4a5066', 2.4, -5.4, 17.4, 1.4);
      round(ctx, 'rgba(255,92,184,.3)', 11.6, -1.6, 8, 5.4);
      for (let i = 0; i < 3; i++) box(ctx, '#ff5cb8', 5.6 + i * 4.4, -4.2, 1.8, 5.4);
      box(ctx, DARK, 7.6, 2.2, 7.4, 3);
      box(ctx, '#3a3f52', 19.8, -4.4, 8, 5.8);
      box(ctx, '#ff9ad6', 27.2, -3.6, 3, 4.2);
      round(ctx, '#ffe3f3', 30.2, -1.5, 1.7, 1.7);
    } },
    { muzzle: 30, draw(ctx) {
      stock(ctx, '#3d4a35'); grip(ctx, WOOD);
      box(ctx, STEEL, 2.6, -4.2, 8, 4.8);
      box(ctx, LIGHT, 2.6, -4.2, 8, 1);
      round(ctx, '#2f3b2c', 10.4, 1, 5.6, 5.2);
      round(ctx, '#46573f', 10.4, 1, 3.4, 3.2);
      for (const [x, y] of [[9, -0.6], [11.8, -0.6], [10.4, 2.8]]) round(ctx, '#1f271d', x, y, 1, 1);
      box(ctx, '#3f5a36', 12.6, -5.8, 15.6, 6.4);
      box(ctx, '#5f7d4f', 12.6, -5.8, 15.6, 1.4);
      box(ctx, DARK, 16.4, -8.2, 3, 2.4);
      box(ctx, '#2a3a26', 27.4, -6.4, 2.2, 7.8);
    } }
  ]);

  class Link {
    constructor() {
      this.socket = null;
      this.ready = null;
      this.waiting = new Map();
      this.next = 1;
    }

    open() {
      if (this.ready) return this.ready;
      this.ready = new Promise((resolve, reject) => {
        if (typeof WebSocket !== 'function') { reject(new Error('sem-websocket')); return; }
        let socket;
        try { socket = new WebSocket(defaultServer()); } catch (_) { reject(new Error('conexao')); return; }
        const timer = setTimeout(() => { reject(new Error('tempo')); this.close(); }, 8000);
        this.socket = socket;
        socket.onopen = () => { clearTimeout(timer); resolve(this); };
        socket.onmessage = event => {
          let message;
          try { message = JSON.parse(event.data); } catch (_) { return; }
          const entry = message && this.waiting.get(message.rid);
          if (!entry) return;
          clearTimeout(entry.timer);
          this.waiting.delete(message.rid);
          entry.resolve(message);
        };
        socket.onerror = () => { clearTimeout(timer); reject(new Error('conexao')); };
        socket.onclose = () => { clearTimeout(timer); reject(new Error('conexao')); this.close(); };
      });
      this.ready.catch(() => this.close());
      return this.ready;
    }

    request(message) {
      return this.open().then(() => new Promise((resolve, reject) => {
        const rid = this.next++;
        const timer = setTimeout(() => { this.waiting.delete(rid); reject(new Error('tempo')); }, 12000);
        this.waiting.set(rid, { resolve, reject, timer });
        this.socket.send(JSON.stringify({ ...message, rid }));
      }));
    }

    close() {
      const socket = this.socket;
      this.socket = null;
      this.ready = null;
      const waiting = [...this.waiting.values()];
      this.waiting.clear();
      for (const entry of waiting) { clearTimeout(entry.timer); entry.reject(new Error('conexao')); }
      if (!socket) return;
      socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
      try { socket.close(); } catch (_) {  }
    }
  }

  VesperGame.Server = new Link();

  VesperGame.ONLINE = Object.freeze({
    ARENA, WEAPONS, SKINS, ACCESSORIES, DAILY_REWARDS, CONFIG, weaponFor, coinsFor, bonusOf, skinCatalog,
    localDay, defaultServer, normalizeServer
  });
  VesperGame.OnlineProfile = Profile;
  VesperGame.Account = Account;

  const mapDefinition = Object.getOwnPropertyDescriptor(VesperGame.prototype, 'mapDefinition');
  Object.defineProperty(VesperGame.prototype, 'mapDefinition', {
    configurable: true,
    get() { return this._mode === 'online' ? ARENA : mapDefinition.get.call(this); }
  });

  Object.defineProperty(VesperGame.prototype, 'onlineActive', {
    configurable: true,
    get() { return this._mode === 'online'; }
  });

  function makeMirror(entry) {
    return {
      id: entry.id, name: entry.name, skin: entry.skin, characterId: entry.skin, bot: Boolean(entry.bot), acc: accessoriesOf(entry.acc),
      x: 0, y: 0, tx: 0, ty: 0, aim: 0, facing: 1, steps: 0,
      level: 1, xp: 0, hp: 1, maxHp: 1, kills: 0, alive: true, respawn: 0,
      spawnGuard: CONFIG.spawnGuard, hurt: 0, flash: 0, placed: false, walk: 0
    };
  }

  VesperGame.prototype.startOnline = function (options = {}) {
    if (this._mode === 'online') this._closeOnline();
    const catalog = SKINS.map(skin => skin.id);
    const name = String(options.name || '').trim().slice(0, 14) || 'Jogador';
    const skin = catalog.includes(options.skin) ? options.skin : 'alien';
    const server = normalizeServer(options.server) || defaultServer();
    this._onlineReturnMap = this._mapId;
    this._onlineReturnCharacter = this._character;
    this._mode = 'online';
    this._mapId = ARENA.id;
    this._character = skin;
    this._reset();
    this.fighters = [];
    this.crates = [];
    this.shots = [];
    this.feed = [];
    this.me = null;
    this.matchRemaining = CONFIG.matchSeconds;
    this.matchDuration = CONFIG.matchSeconds;
    this.onlineResults = null;
    this._arenaZones = null;
    this._onlineName = name;
    this._session = String(options.session || '').slice(0, 200);
    this._onlineSkin = skin;
    this._onlineAcc = accessoriesOf(options.acc);
    this._explosions = [];
    this._serverUrl = server;
    this._tokenKey = 'vesper.online.token.' + server;
    this._firing = false;
    this._inputTimer = 0;
    this._joined = false;
    this._room = options.room === 'create' ? { t: 'create' } : options.room ? { t: 'enter', code: String(options.room) } : { t: 'join' };
    this._openSocket(server, skin);
    return { server, connecting: true };
  };

  VesperGame.prototype.startPrivateMatch = function () {
    if (this._mode !== 'online' || !this._socket || this._socket.readyState !== 1 || this._joined) return false;
    this._socket.send(JSON.stringify({ t: 'start' }));
    return true;
  };

  VesperGame.prototype._openSocket = function (server, skin) {
    const Socket = typeof WebSocket === 'function' ? WebSocket : null;
    if (!Socket) { this._onlineFail('sem-websocket'); return; }
    let socket;
    try { socket = new Socket(server); } catch (_) { this._onlineFail('endereco'); return; }
    this._socket = socket;
    this._connectTimer = setTimeout(() => {
      if (!this._joined) { this._onlineFail('tempo'); }
    }, 8000);
    socket.onopen = () => {
      let token = '';
      try { token = sessionStorage.getItem(this._tokenKey) || ''; } catch (_) { token = ''; }
      const room = this._room.t === 'join' ? { t: 'join', token } : this._room;
      socket.send(JSON.stringify({ ...room, session: this._session, skin, acc: this._onlineAcc }));
    };
    socket.onmessage = event => {
      let message;
      try { message = JSON.parse(event.data); } catch (_) { return; }
      this._onServerMessage(message);
    };
    socket.onerror = () => { if (!this._joined) this._onlineFail('conexao'); };
    socket.onclose = () => {
      if (!this._joined) { this._onlineFail('conexao'); return; }
      if (this._mode === 'online' && this._state !== 'results') this._onlineFail('queda');
    };
  };

  VesperGame.prototype._onlineFail = function (reason) {
    clearTimeout(this._connectTimer);
    const callback = this.callbacks.onOnlineError;
    this._closeOnline();
    this.toMenu();
    if (callback) callback(reason);
  };

  VesperGame.prototype._sendInput = function () {
    if (!this._socket || this._socket.readyState !== 1 || !this._joined) return;
    this._socket.send(JSON.stringify({
      t: 'in', x: Number(this._movement.x.toFixed(3)), y: Number(this._movement.y.toFixed(3)), f: this._firing ? 1 : 0
    }));
  };

  VesperGame.prototype.setFiring = function (firing) {
    const next = Boolean(firing) && this._mode === 'online';
    if (next !== this._firing) { this._firing = next; this._sendInput(); }
    return this._firing;
  };

  VesperGame.prototype._onServerMessage = function (message) {
    if (!message || this._mode !== 'online') return;
    if (message.t === 'joined') { this._onJoined(message); return; }
    if (message.t === 'lobby') {
      clearTimeout(this._connectTimer);
      if (this.callbacks.onPrivateLobby) this.callbacks.onPrivateLobby({ code: message.code, host: Boolean(message.host), hostId: message.hostId, you: message.you, players: Array.isArray(message.players) ? message.players : [] });
      return;
    }
    if (message.t === 'over') { this._onMatchOver(message); return; }
    if (this._state === 'results') return;
    if (message.t === 's') { this._onSnapshot(message); return; }
    if (message.t === 'ev') { this._onEvents(message.e || []); return; }
    if (message.t === 'closed') { this._onlineFail(['host', 'banido'].includes(message.reason) ? message.reason : 'sala'); return; }
    if (message.t === 'error' && !this._joined) this._onlineFail(message.reason || 'servidor');
  };

  VesperGame.prototype._onJoined = function (message) {
    clearTimeout(this._connectTimer);
    this._joined = true;
    this.matchRemaining = Number(message.remaining) || CONFIG.matchSeconds;
    this.fighters = (message.roster || []).map(makeMirror);
    this.me = this.fighters.find(fighter => fighter.id === message.id) || null;
    if (!this.me) { this._onlineFail('sala'); return; }
    this.crates = (message.crates || []).map(crate => ({
      index: crate.index, x: crate.x, y: crate.y, broken: Boolean(crate.broken), phase: Math.random() * TAU
    }));
    try { sessionStorage.setItem(this._tokenKey, message.token || ''); } catch (_) {  }
    if (this.me) {
      this.player = this.me;
      this.camera.x = this.me.x;
      this.camera.y = this.me.y;
    }
    this._initAudio();
    this._setState('playing');
    this._sound('boss');
    this._emitOnlineHud();
    if (this.callbacks.onOnlineJoined) {
      this.callbacks.onOnlineJoined({ players: this.fighters.length, resumed: Boolean(message.resumed) });
    }
  };

  VesperGame.prototype._onSnapshot = function (message) {
    this.matchRemaining = Number(message.r) || 0;
    const seen = new Set();
    for (const row of message.f || []) {
      const [id, x, y, aim, level, hp, maxHp, kills, alive, respawn, xp] = row;
      seen.add(id);
      let fighter = this.fighters.find(item => item.id === id);
      if (!fighter) {
        fighter = makeMirror({ id, name: 'Jogador', skin: 'alien', bot: false });
        this.fighters.push(fighter);
      }
      fighter.tx = x;
      fighter.ty = y;
      if (!fighter.placed) { fighter.x = x; fighter.y = y; fighter.placed = true; }
      fighter.aim = aim;
      fighter.facing = Math.cos(aim) >= 0 ? 1 : -1;
      fighter.level = level;
      fighter.hp = hp;
      fighter.maxHp = maxHp;
      fighter.kills = kills;
      fighter.alive = alive === 1;
      fighter.respawn = respawn;
      fighter.xp = xp;
    }
    for (let i = this.fighters.length - 1; i >= 0; i--) {
      if (!seen.has(this.fighters[i].id)) this.fighters.splice(i, 1);
    }
    const mine = this.me ? this.fighters.find(fighter => fighter.id === this.me.id) : null;
    if (this.me && !mine) { this._onlineFail('sala'); return; }
    this.me = mine || this.me;
    if (this.me) this.player = this.me;
    const broken = message.c || [];
    for (const crate of this.crates) {
      if (broken.length > crate.index) crate.broken = broken[crate.index] === 0;
    }
    if (message.e) this._onEvents(message.e);
  };

  VesperGame.prototype._onEvents = function (events) {
    for (const event of events) {
      if (event.e === 'join') {
        if (!this.fighters.some(fighter => fighter.id === event.id)) this.fighters.push(makeMirror(event));
        else {
          const fighter = this.fighters.find(item => item.id === event.id);
          fighter.name = event.name;
          fighter.skin = fighter.characterId = event.skin;
          fighter.bot = Boolean(event.bot);
          fighter.acc = accessoriesOf(event.acc);
        }
        continue;
      }
      if (event.e === 'shot') {
        const owner = this.fighters.find(fighter => fighter.id === event.id);
        if (owner) owner.flash = 0.06;
        if (this.shots.length < CONFIG.shotLimit) {
          this.shots.push({
            x: event.x, y: event.y, vx: Math.cos(event.a) * event.s, vy: Math.sin(event.a) * event.s,
            owner: event.id, tier: event.t, poison: event.p, life: Number.isFinite(event.l) ? event.l : CONFIG.shotLife
          });
        }
        if (this.me && Math.hypot(event.x - this.camera.x, event.y - this.camera.y) < 760) this._sound('shot');
        continue;
      }
      if (event.e === 'hit') {
        const target = this.fighters.find(fighter => fighter.id === event.id);
        if (!target) continue;
        target.hurt = 0.12;
        const mine = this.me && target.id === this.me.id;
        const color = event.p ? '#a9e08a' : mine ? '#ffa393' : '#f4d49a';
        this._number(target.x, target.y - CONFIG.radius, String(event.damage), color, Boolean(mine) && !event.p);
        if (event.t === 12) this._blast(target.x, target.y, 'grenade');
        else if (event.t === 11) this._blast(target.x, target.y, 'plasma');
        else if (!event.p) this._burst(target.x, target.y, '#e5ad61', 4, 70);
        if (mine && !event.p) { this._shake = Math.max(this._shake, event.t >= 11 ? 8 : 4); this._sound('hurt'); }
        continue;
      }
      if (event.e === 'kill') {
        const victim = this.fighters.find(fighter => fighter.id === event.id);
        const killer = this.fighters.find(fighter => fighter.id === event.by);
        if (victim) {
          this._burst(victim.x, victim.y, '#d8705f', 24, 160);
          victim.alive = false;
        }
        const mine = this.me && victim && victim.id === this.me.id;
        this._sound(mine ? 'death' : 'kill');
        this._onlineFeed(killer ? killer.name + ' eliminou ' + (victim ? victim.name : '?') : (victim ? victim.name + ' foi eliminado' : ''));
        this._emitOnlineHud();
        continue;
      }
      if (event.e === 'level') {
        const fighter = this.fighters.find(item => item.id === event.id);
        if (!fighter) continue;
        fighter.level = event.level;
        if (this.me && fighter.id === this.me.id) {
          this._burst(fighter.x, fighter.y, '#e6c889', 26, 130);
          this._number(fighter.x, fighter.y - 40, weaponFor(event.level).name, '#ffe6ac', true);
          this._sound('level');
          this._emitOnlineHud();
        }
        continue;
      }
      if (event.e === 'spawn') {
        const fighter = this.fighters.find(item => item.id === event.id);
        if (!fighter) continue;
        fighter.x = fighter.tx = event.x;
        fighter.y = fighter.ty = event.y;
        fighter.alive = true;
        fighter.spawnGuard = CONFIG.spawnGuard;
        if (this.me && fighter.id === this.me.id) {
          this.camera.x = fighter.x;
          this.camera.y = fighter.y;
          this._clampCamera();
        }
        continue;
      }
      if (event.e === 'crate') {
        const crate = this.crates.find(item => item.index === event.index);
        if (!crate) continue;
        if (Number.isFinite(event.x)) { crate.x = event.x; crate.y = event.y; crate.broken = false; }
        else {
          crate.broken = true;
          this._burst(crate.x, crate.y, '#72d6af', 16, 120);
          if (this.me && event.by === this.me.id) {
            this._number(crate.x, crate.y - 20, '+' + CONFIG.crateXp + ' XP', '#9de8c4');
            this._sound('gem');
          }
        }
      }
    }
  };

  VesperGame.prototype._onMatchOver = function (message) {
    const ranking = (message.ranking || []).map(entry => ({ ...entry, you: Boolean(this.me && entry.id === this.me.id) }));
    const mine = ranking.find(entry => entry.you) || { rank: ranking.length, level: 1, kills: 0, coins: 0, name: this._onlineName };
    const profile = Profile.reward(mine.coins || 0);
    this.onlineResults = Object.freeze({
      players: ranking.length, ranking, you: mine, coins: mine.coins || 0, balance: profile.coins
    });
    this.setMovement(0, 0);
    this._firing = false;
    this.matchRemaining = 0;
    this._setState('results');
    this._sound('level');
    this._emitOnlineHud();
    if (this.callbacks.onOnlineResults) this.callbacks.onOnlineResults({ ...this.onlineResults });
  };

  VesperGame.prototype._onlineFeed = function (text) {
    if (!text) return;
    this.feed.push(text);
    if (this.feed.length > 12) this.feed.shift();
  };

  VesperGame.prototype._onlineLeaderboard = function () {
    return this.fighters.slice().sort((a, b) =>
      b.level - a.level || b.kills - a.kills || b.xp - a.xp || a.id - b.id);
  };

  VesperGame.prototype._emitOnlineHud = function () {
    if (!this.callbacks.onHud || !this.me) return;
    const me = this.me;
    const weapon = weaponFor(me.level);
    const board = this._onlineLeaderboard();
    const rank = board.indexOf(me) + 1;
    this.callbacks.onHud({
      online: true, hp: Math.max(0, me.hp), maxHp: me.maxHp, xp: me.xp, nextXp: Arena.nextXpFor(me.level),
      level: me.level, kills: me.kills, elapsed: Math.max(0, this.matchRemaining),
      remaining: Math.max(0, this.matchRemaining), weapon: weapon.name, weaponTier: weapon.tier,
      bosses: [], bossKills: 0, wave: 1, mapId: ARENA.id, mapName: ARENA.name,
      players: this.fighters.length,
      alive: this.fighters.reduce((total, one) => total + (one.alive ? 1 : 0), 0),
      respawn: me.alive ? 0 : Math.max(0, me.respawn),
      rank,
      leaderboard: board.slice(0, 5).map((one, index) => ({
        rank: index + 1, name: one.name, level: one.level, kills: one.kills,
        you: one === me
      })),
      feed: this.feed.slice(-3),
      stageBossStatus: rank + 'º lugar'
    });
  };

  VesperGame.prototype._updateOnline = function (dt) {
    const me = this.me;
    if (!me) return;
    const speed = CONFIG.speed * bonusOf(me.skin).speed;
    if (me.alive) {
      me.x = clamp(me.x + this._movement.x * speed * dt, bounds.left + CONFIG.radius + 24, bounds.right - CONFIG.radius - 24);
      me.y = clamp(me.y + this._movement.y * speed * dt, bounds.top + CONFIG.radius + 24, bounds.bottom - CONFIG.radius - 24);
      const drift = Math.hypot(me.tx - me.x, me.ty - me.y);
      const correction = drift > CONFIG.snapDistance ? 1 : Math.min(1, dt * 4);
      me.x += (me.tx - me.x) * correction;
      me.y += (me.ty - me.y) * correction;
      const moving = Math.hypot(this._movement.x, this._movement.y);
      me.steps += moving * dt * 10;
      me.walk += ((moving > 0.08 ? 1 : 0) - me.walk) * Math.min(1, dt * 10);
      if (moving > 0.08 && !this._reducedMotion) {
        this._dustTimer -= dt;
        if (this._dustTimer <= 0) { this._spawnStepDust(); this._dustTimer = 0.13 + Math.random() * 0.05; }
      } else this._dustTimer = 0;
    }
    for (const fighter of this.fighters) {
      fighter.hurt = Math.max(0, fighter.hurt - dt);
      fighter.flash = Math.max(0, fighter.flash - dt);
      fighter.spawnGuard = Math.max(0, fighter.spawnGuard - dt);
      fighter.invulnerability = fighter.spawnGuard;
      if (fighter.acc.includes('mini')) this._followPet(fighter, dt);
      if (fighter === me) continue;
      const step = Math.min(1, dt * 14);
      const moved = Math.hypot(fighter.tx - fighter.x, fighter.ty - fighter.y);
      if (moved > 240) { fighter.x = fighter.tx; fighter.y = fighter.ty; }
      else {
        fighter.x += (fighter.tx - fighter.x) * step;
        fighter.y += (fighter.ty - fighter.y) * step;
      }
      fighter.steps += moved > 1 ? dt * 9 : 0;
      fighter.walk += ((moved > 1 ? 1 : 0) - fighter.walk) * Math.min(1, dt * 10);
    }
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const shot = this.shots[i];
      const fromX = shot.x, fromY = shot.y;
      shot.x += shot.vx * dt;
      shot.y += shot.vy * dt;
      shot.life -= dt;
      if (shot.life <= 0 || this._shotBlocked(shot, fromX, fromY)) this.shots.splice(i, 1);
    }
    for (let i = this._explosions.length - 1; i >= 0; i--) {
      this._explosions[i].life -= dt;
      if (this._explosions[i].life <= 0) this._explosions.splice(i, 1);
    }
    if (me.alive) {
      this.camera.x += (me.x - this.camera.x) * Math.min(1, dt * 9);
      this.camera.y += (me.y - this.camera.y) * Math.min(1, dt * 9);
      this._clampCamera();
    }
    this._updateEffects(dt);
    this._shake = Math.max(0, this._shake - dt * 22);
    this._inputTimer -= dt;
    if (this._inputTimer <= 0) { this._inputTimer = 1 / CONFIG.tickRate; this._sendInput(); }
    this._hudTimer -= dt;
    if (this._hudTimer <= 0) { this._hudTimer = 0.08; this._emitOnlineHud(); }
  };

  VesperGame.prototype._shotBlocked = function (shot, fromX, fromY) {
    for (const fighter of this.fighters) {
      if (!fighter.alive || fighter.id === shot.owner || fighter.spawnGuard > 0) continue;
      if (segmentHit(fromX, fromY, shot.x, shot.y, fighter, CONFIG.radius + CONFIG.shotRadius) >= 0) return true;
    }
    for (const crate of this.crates) {
      if (!crate.broken && segmentHit(fromX, fromY, shot.x, shot.y, crate, CONFIG.crateRadius + CONFIG.shotRadius) >= 0) return true;
    }
    return false;
  };

  VesperGame.prototype._blast = function (x, y, kind) {
    const grenade = kind === 'grenade';
    this._explosions.push({ x, y, kind, life: grenade ? 0.85 : 0.45, max: grenade ? 0.85 : 0.45 });
    if (this._explosions.length > 12) this._explosions.shift();
    if (grenade) {
      this._burst(x, y, '#ffb347', 34, 300);
      this._burst(x, y, '#3f6b3a', 12, 150);
    } else this._burst(x, y, '#ff6fc4', 20, 200);
    if (this.me && Math.hypot(x - this.camera.x, y - this.camera.y) < 520) {
      this._shake = Math.max(this._shake, grenade ? 9 : 5);
      this._sound(grenade ? 'boss' : 'kill');
    }
  };

  VesperGame.prototype._drawBlast = function (ctx, blast) {
    const progress = 1 - blast.life / blast.max;
    const grenade = blast.kind === 'grenade';
    const radius = (grenade ? 22 : 10) + progress * (grenade ? 96 : 34);
    const fade = 1 - progress;
    const glow = ctx.createRadialGradient(blast.x, blast.y, 0, blast.x, blast.y, radius);
    if (grenade) {
      glow.addColorStop(0, `rgba(255,248,214,${fade})`);
      glow.addColorStop(0.35, `rgba(255,176,72,${fade * 0.92})`);
      glow.addColorStop(0.72, `rgba(190,64,28,${fade * 0.55})`);
    } else {
      glow.addColorStop(0, `rgba(255,236,247,${fade})`);
      glow.addColorStop(0.45, `rgba(255,92,184,${fade * 0.8})`);
    }
    glow.addColorStop(1, 'rgba(40,20,20,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(blast.x, blast.y, radius, 0, TAU); ctx.fill();
    ctx.strokeStyle = grenade ? `rgba(255,226,160,${fade * 0.8})` : `rgba(255,150,214,${fade * 0.8})`;
    ctx.lineWidth = 1 + fade * (grenade ? 4 : 2.4);
    ctx.beginPath(); ctx.arc(blast.x, blast.y, radius * 1.18, 0, TAU); ctx.stroke();
  };

  VesperGame.prototype._closeOnline = function () {
    if (this._mode !== 'online') return;
    clearTimeout(this._connectTimer);
    const socket = this._socket;
    this._socket = null;
    this._joined = false;
    if (socket) {
      socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
      try {
        if (socket.readyState === 1) socket.send(JSON.stringify({ t: 'bye' }));
        socket.close();
      } catch (_) {  }
    }
    this._mode = null;
    this._firing = false;
    this.fighters = [];
    this.shots = [];
    this.crates = [];
    this.me = null;
    this._mapId = VesperGame.MAPS.some(map => map.id === this._onlineReturnMap) ? this._onlineReturnMap : VesperGame.MAPS[0].id;
    const hero = VesperGame.CHARACTERS.find(item => item.id === this._onlineReturnCharacter && (item.both || item.unlockType !== 'coins'));
    this._character = hero ? hero.id : VesperGame.CHARACTERS[0].id;
  };

  VesperGame.prototype.leaveOnline = function () {
    this._closeOnline();
    this.toMenu();
  };

  const baseSetMovement = VesperGame.prototype.setMovement;
  VesperGame.prototype.setMovement = function (x, y) {
    const previousX = this._movement.x;
    const previousY = this._movement.y;
    baseSetMovement.call(this, x, y);
    if (this._mode === 'online' && (previousX !== this._movement.x || previousY !== this._movement.y)) this._sendInput();
  };

  const baseUpdate = VesperGame.prototype._update;
  VesperGame.prototype._update = function (dt) {
    if (this._mode === 'online') { this._updateOnline(dt); return; }
    baseUpdate.call(this, dt);
  };

  const baseDraw = VesperGame.prototype._draw;
  VesperGame.prototype._draw = function () {
    if (this._mode === 'online' && this.me) { this._drawOnline(); return; }
    baseDraw.call(this);
  };

  const baseSetCharacter = VesperGame.prototype.setCharacter;
  VesperGame.prototype.setCharacter = function (id) {
    const character = VesperGame.CHARACTERS.find(item => item.id === id);
    if (!character) return false;
    if (!character.both && (character.unlockType === 'coins') !== (this._mode === 'online')) return false;
    return baseSetCharacter.call(this, id);
  };

  const baseStart = VesperGame.prototype.start;
  VesperGame.prototype.start = function (mapId, difficultyId) {
    if (this._mode === 'online') this._closeOnline();
    return baseStart.call(this, mapId, difficultyId);
  };

  const baseToMenu = VesperGame.prototype.toMenu;
  VesperGame.prototype.toMenu = function () {
    if (this._mode === 'online') this._closeOnline();
    baseToMenu.call(this);
  };

  VesperGame.prototype._getArenaFeatures = function () {
    if (this._arenaFeatures) return this._arenaFeatures;
    const features = [];
    for (let i = -5; i <= 5; i++) {
      if (Math.abs(i) < 2) continue;
      features.push({ x: i * 300, y: -720, kind: 'pillar', scale: 1.45 }, { x: i * 300, y: 720, kind: 'pillar', scale: 1.45 });
    }
    for (let i = -2; i <= 2; i++) {
      features.push({ x: -1360, y: i * 375, kind: 'pillar', scale: 1.45 }, { x: 1360, y: i * 375, kind: 'pillar', scale: 1.45 });
    }
    features.push({ x: 0, y: -1180, kind: 'throne', scale: 2.4 });
    features.push({ x: -570, y: -170, kind: 'flag', scale: 1.5 }, { x: 570, y: -170, kind: 'flag', scale: 1.5 });
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      const x = sx * 1360, y = sy * 1000;
      features.push(
        { x, y, kind: 'crypt', scale: 2 },
        { x: x - sx * 240, y: y + 170, kind: 'tomb', scale: 1.2 },
        { x: x + sx * 230, y: y - 150, kind: 'tomb', scale: 1.2 },
        { x: x + sx * 70, y: y + 290, kind: 'fence', scale: 1.5 },
        { x: x - sx * 380, y: y - 280, kind: 'deadTree', scale: 1.9 },
        { x, y: y - 360, kind: 'lantern', scale: 1.4 }
      );
    }
    for (let i = 0; i < 4; i++) {
      const angle = (i + 0.5) / 4 * TAU;
      features.push({ x: Math.cos(angle) * 470, y: Math.sin(angle) * 360, kind: 'candle', scale: 1.2 });
    }
    for (const x of [-800, 800]) for (const y of [-1330, 1330]) features.push({ x, y, kind: 'ruinedwall', scale: 1.7 });
    for (const y of [-400, 400]) features.push({ x: -1700, y, kind: 'deadTree', scale: 1.7 }, { x: 1700, y, kind: 'deadTree', scale: 1.7 });
    features.sort((a, b) => a.y - b.y);
    this._arenaFeatures = features;
    return features;
  };

  VesperGame.prototype._getArenaTile = function () {
    if (this._arenaTile) return this._arenaTile;
    const tile = document.createElement('canvas');
    tile.width = tile.height = 512;
    const ctx = tile.getContext('2d');
    ctx.fillStyle = '#242732';
    ctx.fillRect(0, 0, 512, 512);
    const shades = ['#272a35', '#23262f', '#292c38', '#212431'];
    for (let row = 0; row < 4; row++) {
      for (let col = -1; col < 5; col++) {
        const x = col * 128 + (row % 2) * 64, y = row * 128;
        ctx.fillStyle = shades[Math.floor(this._hash(col, row, 61) * shades.length)];
        ctx.fillRect(x + 2, y + 2, 124, 124);
        ctx.strokeStyle = '#1d2029'; ctx.lineWidth = 2;
        ctx.strokeRect(x + 2, y + 2, 124, 124);
        ctx.strokeStyle = '#2e3240'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x + 4, y + 124); ctx.lineTo(x + 4, y + 4); ctx.lineTo(x + 124, y + 4); ctx.stroke();
        if (this._hash(col, row, 63) > 0.74) {
          ctx.strokeStyle = '#1f222c'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(x + 32, y + 12); ctx.lineTo(x + 54, y + 48); ctx.lineTo(x + 36, y + 86); ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 0.055;
    for (let i = 0; i < 240; i++) {
      ctx.fillStyle = i % 2 ? '#c8cfd8' : '#0a0d13';
      ctx.fillRect(this._hash(i, 71) * 512, this._hash(i, 72) * 512, 2, 2);
    }
    ctx.globalAlpha = 1;
    this._arenaTile = tile;
    return tile;
  };
  VesperGame.prototype._drawArenaBoundary = function (ctx, bounds, view) {
    ctx.strokeStyle = '#191c25'; ctx.lineWidth = 56;
    ctx.strokeRect(bounds.left, bounds.top, bounds.width, bounds.height);
    ctx.strokeStyle = '#3a3f4d'; ctx.lineWidth = 2;
    ctx.strokeRect(bounds.left + 30, bounds.top + 30, bounds.width - 60, bounds.height - 60);
    const post = (x, y) => {
      if (x < view.left - 40 || x > view.right + 40 || y < view.top - 40 || y > view.bottom + 40) return;
      ctx.fillStyle = '#1e222c'; ctx.fillRect(x - 19, y - 19, 38, 38);
      ctx.strokeStyle = '#343947'; ctx.lineWidth = 2; ctx.strokeRect(x - 13, y - 13, 26, 26);
    };
    for (let x = bounds.left + 28; x <= bounds.right - 28; x += 320) { post(x, bounds.top + 14); post(x, bounds.bottom - 14); }
    for (let y = bounds.top + 28; y <= bounds.bottom - 28; y += 320) { post(bounds.left + 14, y); post(bounds.right - 14, y); }
  };
  VesperGame.prototype._drawArena = function (ctx, view) {
    const bounds = this.worldBounds;
    const tile = this._getArenaTile();
    const previousView = this._view;
    this._view = view;
    ctx.save();
    ctx.beginPath(); ctx.rect(bounds.left, bounds.top, bounds.width, bounds.height); ctx.clip();
    const startX = Math.floor(Math.max(view.left, bounds.left) / 512) * 512;
    const startY = Math.floor(Math.max(view.top, bounds.top) / 512) * 512;
    for (let x = startX; x < Math.min(view.right, bounds.right); x += 512) {
      for (let y = startY; y < Math.min(view.bottom, bounds.bottom); y += 512) ctx.drawImage(tile, x, y);
    }
    ctx.fillStyle = '#1f222b';
    ctx.fillRect(-1470, -790, 2940, 110);
    ctx.fillRect(-1470, 680, 2940, 110);
    ctx.fillRect(-1440, -1140, 104, 2280);
    ctx.fillRect(1336, -1140, 104, 2280);
    ctx.strokeStyle = '#3e4350'; ctx.lineWidth = 2;
    ctx.strokeRect(-1470, -790, 2940, 110);
    ctx.strokeRect(-1470, 680, 2940, 110);
    ctx.fillStyle = '#422934'; ctx.fillRect(-72, -1210, 144, 2420);
    ctx.strokeStyle = '#6d5147'; ctx.lineWidth = 2; ctx.strokeRect(-64, -1202, 128, 2404);
    for (let y = -1040; y <= 1040; y += 260) {
      if (y < view.top - 120 || y > view.bottom + 120) continue;
      ctx.strokeStyle = '#5c3b44'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, y - 26); ctx.lineTo(26, y); ctx.lineTo(0, y + 26); ctx.lineTo(-26, y); ctx.closePath(); ctx.stroke();
    }
    this._drawRitual(ctx);
    for (const feature of this._getArenaFeatures()) {
      const extent = 250 * feature.scale;
      if (feature.x < view.left - extent || feature.x > view.right + extent || feature.y < view.top - extent || feature.y > view.bottom + extent) continue;
      ctx.save();
      ctx.translate(feature.x, feature.y);
      ctx.scale(feature.scale, feature.scale);
      this._drawMapFeature(ctx, 'castle', feature.kind, feature.seed || feature.x);
      ctx.restore();
    }
    this._drawArenaBoundary(ctx, bounds, view);
    ctx.restore();
    this._view = previousView;
  };
  const baseOverview = VesperGame.prototype._getMapOverview;
  VesperGame.prototype._getMapOverview = function (id) {
    if (id !== ARENA.id) return baseOverview.call(this, id);
    if (this._mapOverviewCache.has(id)) return this._mapOverviewCache.get(id);
    const canvas = document.createElement('canvas');
    canvas.width = 640; canvas.height = 480;
    const ctx = canvas.getContext('2d');
    ctx.scale(canvas.width / ARENA.width, canvas.height / ARENA.height);
    ctx.translate(ARENA.width / 2, ARENA.height / 2);
    this._drawArena(ctx, { left: -ARENA.width / 2, top: -ARENA.height / 2, right: ARENA.width / 2, bottom: ARENA.height / 2 });
    this._mapOverviewCache.set(id, canvas);
    return canvas;
  };
  const baseMinimap = VesperGame.prototype.drawMinimap;
  VesperGame.prototype.drawMinimap = function (canvas) {
    if (this._mode !== 'online' || !this.me) return baseMinimap.call(this, canvas);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height, b = this.worldBounds;
    const unit = Math.min(w / 174, h / 131), inset = 3 * unit;
    const scale = Math.min((w - inset * 2) / b.width, (h - inset * 2) / b.height);
    const mw = b.width * scale, mh = b.height * scale, ox = (w - mw) / 2, oy = (h - mh) / 2;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#090e13'; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(this._getMapOverview(ARENA.id), ox, oy, mw, mh);
    ctx.save(); ctx.beginPath(); ctx.rect(ox, oy, mw, mh); ctx.clip();
    ctx.strokeStyle = '#e1d8bd80'; ctx.lineWidth = unit;
    ctx.strokeRect(ox + (this.camera.x - this.width / 2 - b.left) * scale, oy + (this.camera.y - this.height / 2 - b.top) * scale, this.width * scale, this.height * scale);
    ctx.fillStyle = '#9ad8b4';
    for (const crate of this.crates) {
      if (crate.broken) continue;
      ctx.fillRect(ox + (crate.x - b.left) * scale - unit, oy + (crate.y - b.top) * scale - unit, unit * 2, unit * 2);
    }
    for (const fighter of this.fighters) {
      if (!fighter.alive || fighter === this.me) continue;
      ctx.fillStyle = fighter.bot ? '#e8c98a' : '#8fd3ff';
      ctx.beginPath(); ctx.arc(ox + (fighter.x - b.left) * scale, oy + (fighter.y - b.top) * scale, 1.9 * unit, 0, TAU); ctx.fill();
    }
    ctx.restore();
    const x = ox + (this.me.x - b.left) * scale, y = oy + (this.me.y - b.top) * scale;
    ctx.fillStyle = '#f14e5b45'; ctx.beginPath(); ctx.arc(x, y, 7 * unit, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ff4555'; ctx.strokeStyle = '#fff2e7'; ctx.lineWidth = 1.1 * unit;
    ctx.beginPath(); ctx.arc(x, y, 3.4 * unit, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.restore();
  };
  VesperGame.prototype._drawXpCrate = function (ctx, crate) {
    const bob = Math.sin(this._clock * 2 + crate.phase) * 1.6;
    ctx.save();
    ctx.translate(crate.x, crate.y + bob);
    ctx.fillStyle = 'rgba(0,0,0,.32)';
    ctx.beginPath(); ctx.ellipse(0, 15, 17, 6, 0, 0, TAU); ctx.fill();
    const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 28);
    glow.addColorStop(0, 'rgba(90,214,170,.13)'); glow.addColorStop(1, 'rgba(90,214,170,0)');
    ctx.fillStyle = glow; ctx.fillRect(-28, -28, 56, 56);
    ctx.fillStyle = '#6b5636'; ctx.fillRect(-15, -14, 30, 28);
    ctx.fillStyle = '#8a7046'; ctx.fillRect(-15, -14, 30, 7);
    ctx.strokeStyle = '#3b2f1f'; ctx.lineWidth = 2;
    ctx.strokeRect(-15, -14, 30, 28);
    ctx.beginPath(); ctx.moveTo(-15, -14); ctx.lineTo(15, 14); ctx.moveTo(15, -14); ctx.lineTo(-15, 14); ctx.stroke();
    ctx.fillStyle = '#4c5a4a'; ctx.fillRect(-17, -4, 34, 5);
    ctx.fillStyle = '#276b5e';
    ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(6, 0); ctx.lineTo(0, 8); ctx.lineTo(-6, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#72d6af';
    ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, 4); ctx.lineTo(-6, 0); ctx.closePath(); ctx.fill();
    ctx.restore();
  };
  VesperGame.prototype._drawFighterWeapon = function (ctx, fighter) {
    const tier = weaponFor(fighter.level).tier;
    const art = WEAPON_ART[tier - 1];
    ctx.save();
    ctx.translate(1, -2);
    ctx.rotate(fighter.aim);
    if (Math.cos(fighter.aim) < 0) ctx.scale(1, -1);
    art.draw(ctx);
    if (fighter.flash > 0) {
      const tint = tier === 11 ? '255,120,200' : tier === 12 ? '170,220,140' : '255,214,140';
      const flash = ctx.createRadialGradient(art.muzzle + 4, -1, 1, art.muzzle + 4, -1, 12);
      flash.addColorStop(0, `rgba(${tint},.75)`); flash.addColorStop(1, `rgba(${tint},0)`);
      ctx.fillStyle = flash; ctx.fillRect(art.muzzle - 8, -13, 24, 24);
      shape(ctx, '#ffe9b4', [[art.muzzle + 1, -1], [art.muzzle + 9, -4.4], [art.muzzle + 9, 2.4]]);
    }
    ctx.restore();
  };
  VesperGame.prototype.drawOnlineWeapon = function (canvas, tier) {
    const ctx = canvas && canvas.getContext('2d');
    if (!ctx || !canvas.width || !canvas.height) return;
    const art = WEAPON_ART[clamp(Math.floor(tier), 1, CONFIG.levelCap) - 1];
    const scale = Math.min(canvas.width / (art.muzzle + 11), canvas.height / 21);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(canvas.width / 2 - (art.muzzle - 3) * scale / 2, canvas.height / 2 - 1.5 * scale);
    ctx.scale(scale, scale);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    art.draw(ctx);
    ctx.restore();
  };
  VesperGame.prototype._drawFighter = function (ctx, fighter) {
    const you = fighter === this.me;
    const blink = fighter.spawnGuard > 0 && Math.floor(this._clock * 16) % 2 === 0;
    ctx.save();
    ctx.translate(fighter.x, fighter.y);
    if (you) {
      const halo = ctx.createRadialGradient(0, 0, 4, 0, 0, 84);
      halo.addColorStop(0, 'rgba(178,158,96,.1)'); halo.addColorStop(1, 'rgba(178,158,96,0)');
      ctx.fillStyle = halo; ctx.fillRect(-84, -84, 168, 168);
      ctx.strokeStyle = 'rgba(214,186,114,.5)'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.ellipse(0, 14, 23, 10, 0, 0, TAU); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0,0,0,.4)';
    ctx.beginPath(); ctx.ellipse(0, 14, 20, 8, 0, 0, TAU); ctx.fill();
    ctx.save();
    if (blink) ctx.globalAlpha = 0.55;
    this._walkPose(ctx, fighter.steps, fighter.walk || 0);
    ctx.save();
    ctx.scale(fighter.facing, 1);
    this._drawCharacter(ctx, fighter.characterId, fighter.steps);
    this._drawHeadwear(ctx, fighter.characterId, fighter.acc);
    ctx.restore();
    this._drawFighterWeapon(ctx, fighter);
    if (fighter.hurt > 0) {
      ctx.strokeStyle = '#ffd9c4'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.ellipse(0, -10, 17, 25, 0, 0, TAU); ctx.stroke();
    }
    ctx.restore();
    if (!you && Math.hypot(fighter.x - this.camera.x, fighter.y - this.camera.y) < CONFIG.tagRange) {
      ctx.fillStyle = '#0a10139e'; ctx.fillRect(-17, -39, 34, 3);
      ctx.fillStyle = fighter.bot ? '#b59a63' : '#7fc4ea';
      ctx.fillRect(-17, -39, 34 * clamp(fighter.hp / fighter.maxHp, 0, 1), 3);
      ctx.font = '10px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#080d0b';
      ctx.fillText(`${fighter.level} · ${fighter.name}`, 1, -43);
      ctx.fillStyle = fighter.bot ? '#c3bda6' : '#aed8ee';
      ctx.fillText(`${fighter.level} · ${fighter.name}`, 0, -44);
    }
    ctx.restore();
  };
  VesperGame.prototype._drawOnlineShot = function (ctx, shot) {
    if (!this._visible(shot, 50)) return;
    const size = 2.6 + Math.min(shot.tier, CONFIG.botLevelCap) * 0.16;
    ctx.save();
    ctx.translate(shot.x, shot.y);
    ctx.rotate(Math.atan2(shot.vy, shot.vx));
    ctx.lineCap = 'round';
    if (shot.tier === 11) {
      stroke(ctx, 'rgba(255,92,184,.3)', 17, [[-40, 0], [7, 0]]);
      stroke(ctx, '#ff5cb8', 8.5, [[-33, 0], [4, 0]]);
      stroke(ctx, '#ffe3f3', 3, [[-26, 0], [3, 0]]);
      ctx.restore();
      return;
    }
    if (shot.tier === 12) {
      stroke(ctx, 'rgba(118,128,108,.35)', 3.4, [[-15, 0], [-3, 0]]);
      round(ctx, '#1d3a1c', 0, 0, 5.4, 4.4);
      round(ctx, '#2f5a2c', 0, 0, 4.4, 3.5);
      round(ctx, '#6f9a5c', 1.2, -1.2, 1.4, 1);
      ctx.restore();
      return;
    }
    ctx.strokeStyle = 'rgba(240,206,132,.32)'; ctx.lineWidth = size * 0.9;
    ctx.beginPath(); ctx.moveTo(-16, 0); ctx.lineTo(0, 0); ctx.stroke();
    ctx.fillStyle = shot.poison > 0 ? '#a9e08a' : '#ffdc9a';
    ctx.beginPath(); ctx.ellipse(0, 0, size + 1.4, size, 0, 0, TAU); ctx.fill();
    ctx.restore();
  };
  VesperGame.prototype._drawOnline = function () {
    const ctx = this.ctx;
    const shakeX = this._state === 'playing' ? (Math.random() - 0.5) * this._shake : 0;
    const shakeY = this._state === 'playing' ? (Math.random() - 0.5) * this._shake : 0;
    const left = this.camera.x - this.width / 2 - shakeX;
    const top = this.camera.y - this.height / 2 - shakeY;
    this._view = { left, top, right: left + this.width, bottom: top + this.height };
    ctx.setTransform(this.dpr * this.scale, 0, 0, this.dpr * this.scale, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#07090e';
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.save();
    ctx.translate(-left, -top);
    this._drawArena(ctx, this._view);
    for (const crate of this.crates) if (!crate.broken && this._visible(crate, 40)) this._drawXpCrate(ctx, crate);
    for (const shot of this.shots) this._drawOnlineShot(ctx, shot);
    const figures = [];
    for (const fighter of this.fighters) {
      if (!fighter.alive) continue;
      if (this._visible(fighter, 70)) figures.push({ y: fighter.y, fighter });
      if (fighter.pet && fighter.acc.includes('mini') && this._visible(fighter.pet, 40)) figures.push({ y: fighter.pet.y, owner: fighter });
    }
    figures.sort((a, b) => a.y - b.y);
    for (const figure of figures) {
      if (figure.owner) this._drawPet(ctx, figure.owner, figure.owner.characterId);
      else this._drawFighter(ctx, figure.fighter);
    }
    for (const blast of this._explosions) this._drawBlast(ctx, blast);
    for (const particle of this.particles) {
      ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife);
      ctx.fillStyle = particle.color;
      ctx.fillRect(particle.x - particle.size / 2, particle.y - particle.size / 2, particle.size, particle.size);
    }
    ctx.globalAlpha = 1;
    for (const number of this.numbers) {
      ctx.globalAlpha = Math.min(1, number.life * 3);
      ctx.font = (number.strong ? 'bold 17px' : 'bold 13px') + ' Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#09100d';
      ctx.fillText(number.text, number.x + 1, number.y + 1);
      ctx.fillStyle = number.color;
      ctx.fillText(number.text, number.x, number.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    const vignette = ctx.createRadialGradient(this.width * 0.5, this.height * 0.48, Math.min(this.width, this.height) * 0.12, this.width * 0.5, this.height * 0.5, Math.max(this.width, this.height) * 0.71);
    vignette.addColorStop(0, 'rgba(4,9,8,0)');
    vignette.addColorStop(0.6, 'rgba(3,8,7,.08)');
    vignette.addColorStop(1, 'rgba(1,5,4,.5)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, this.width, this.height);
    if (!this.me.alive) {
      ctx.fillStyle = 'rgba(88,20,22,.2)';
      ctx.fillRect(0, 0, this.width, this.height);
    }
  };
})();