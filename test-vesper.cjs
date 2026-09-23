'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = __dirname;
const isMain = require.main === module;
const failures = [];
let passed = 0;
function test(name, run) {
  if (!isMain) return;
  try { run(); ++passed; process.stdout.write(`PASS ${name}\n`); }
  catch (error) { failures.push({ name, error }); process.stderr.write(`FAIL ${name}: ${error.stack}\n`); }
}
function close(actual, expected, tolerance = 1e-7, label = '') {
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
    `${label} expected ${expected}, got ${actual}; tolerance ${tolerance}`);
}
function makeContext() {
  const gradient = { addColorStop() {} };
  const target = {
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createConicGradient: () => gradient,
    createPattern: () => ({}),
    measureText: text => ({ width: String(text).length * 7 }),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    setTransform() {},
    resetTransform() {}
  };
  return new Proxy(target, {
    get(object, key) { return key in object ? object[key] : (() => {}); },
    set(object, key, value) { object[key] = value; return true; }
  });
}
function harness({ width = 1200, height = 800, dpr = 1, seed = 1707, source = 'module' } = {}) {
  let randomSeed = seed >>> 0;
  const seededMath = Object.create(Math);
  seededMath.random = () => ((randomSeed = (randomSeed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const box = { left: 0, top: 0, width, height };
  const context = makeContext();
  const container = {
    clientWidth: width, clientHeight: height,
    getBoundingClientRect: () => ({ ...box })
  };
  const canvas = {
    width: 0, height: 0, clientWidth: width, clientHeight: height,
    parentElement: container, style: {},
    getContext: () => context,
    getBoundingClientRect: () => ({ ...box }),
    addEventListener() {}, removeEventListener() {}
  };
  const listeners = new Map();
  const raf = new Map();
  let rafId = 0;
  let now = 0;
  const events = { states: [], hud: [], levels: [], over: [], victories: [], joined: [], results: [], errors: [] };
  const sockets = [];
  class FakeSocket {
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.sent = [];
      sockets.push(this);
    }
    send(data) { this.sent.push(JSON.parse(data)); }
    close() { this.readyState = 3; if (this.onclose) this.onclose(); }
    open() { this.readyState = 1; if (this.onopen) this.onopen(); }
    deliver(message) { if (this.onmessage) this.onmessage({ data: JSON.stringify(message) }); }
    fail() { if (this.onerror) this.onerror({}); }
  }
  const memory = new Map();
  const sandbox = {
    console, Math: seededMath,
    devicePixelRatio: dpr, innerWidth: width, innerHeight: height,
    performance: { now: () => now },
    requestAnimationFrame: fn => { const id = ++rafId; raf.set(id, fn); return id; },
    cancelAnimationFrame: id => raf.delete(id),
    setTimeout, clearTimeout,
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    WebSocket: FakeSocket,
    sessionStorage: { getItem: key => (memory.has(key) ? memory.get(key) : null), setItem: (key, value) => memory.set(key, String(value)) },
    localStorage: { getItem: key => (memory.has(key) ? memory.get(key) : null), setItem: (key, value) => memory.set(key, String(value)) },
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: name => listeners.delete(name),
    document: {
      hidden: false,
      createElement: () => ({ ...canvas, getContext: () => makeContext() }),
      getElementById: () => canvas,
      addEventListener() {}, removeEventListener() {}
    }
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  const engineFile = path.join(root, 'vesper-engine.js');
  const engineCode = source === 'standalone'
    ? fs.readFileSync(path.join(root, 'index.html'), 'utf8').match(/<script\s+data-module="engine"[^>]*>([\s\S]*?)<\/script>/)?.[1]
    : fs.readFileSync(engineFile, 'utf8');
  if (!engineCode) throw new Error('Requested engine source was not found');
  vm.runInContext(engineCode, sandbox, { filename: source === 'standalone' ? 'index.html:engine' : 'vesper-engine.js' });
  const charactersCode = source === 'standalone'
    ? fs.readFileSync(path.join(root, 'index.html'), 'utf8').match(/<script\s+data-module="characters"[^>]*>([\s\S]*?)<\/script>/)?.[1]
    : fs.existsSync(path.join(root, 'vesper-characters.js')) ? fs.readFileSync(path.join(root, 'vesper-characters.js'), 'utf8') : '';
  if (charactersCode) vm.runInContext(charactersCode, sandbox, { filename: 'vesper-characters.js' });
  const enemiesCode = source === 'standalone'
    ? fs.readFileSync(path.join(root, 'index.html'), 'utf8').match(/<script\s+data-module="enemies"[^>]*>([\s\S]*?)<\/script>/)?.[1]
    : fs.readFileSync(path.join(root, 'vesper-enemies.js'), 'utf8');
  if (!enemiesCode) throw new Error('Enemy art module was not found');
  vm.runInContext(enemiesCode, sandbox, { filename: 'vesper-enemies.js' });
  const arenaCode = source === 'standalone'
    ? fs.readFileSync(path.join(root, 'index.html'), 'utf8').match(/<script\s+data-module="arena"[^>]*>([\s\S]*?)<\/script>/)?.[1]
    : fs.readFileSync(path.join(root, 'vesper-arena.js'), 'utf8');
  if (!arenaCode) throw new Error('Arena core module was not found');
  vm.runInContext(arenaCode, sandbox, { filename: 'vesper-arena.js' });
  const onlineCode = source === 'standalone'
    ? fs.readFileSync(path.join(root, 'index.html'), 'utf8').match(/<script\s+data-module="online"[^>]*>([\s\S]*?)<\/script>/)?.[1]
    : fs.readFileSync(path.join(root, 'vesper-online.js'), 'utf8');
  if (!onlineCode) throw new Error('Online mode module was not found');
  vm.runInContext(onlineCode, sandbox, { filename: 'vesper-online.js' });
  const Game = sandbox.VesperGame || vm.runInContext('VesperGame', sandbox);
  const game = new Game(canvas, {
    onState: state => events.states.push(state),
    onHud: data => events.hud.push({ ...data }),
    onLevelUp: choices => events.levels.push(choices.map(choice => ({ ...choice }))),
    onGameOver: data => events.over.push({ ...data }),
    onVictory: data => events.victories.push({ ...data }),
    onOnlineJoined: data => events.joined.push({ ...data }),
    onOnlineResults: data => events.results.push({ ...data }),
    onOnlineError: reason => events.errors.push(reason)
  });
  const frame = (milliseconds = 1000 / 60) => {
    now += milliseconds;
    const callbacks = [...raf.values()];
    raf.clear();
    for (const callback of callbacks) callback(now);
  };
  const online = (options = {}) => {
    game.startOnline({ name: options.name || 'Guino', skin: options.skin || 'alien', server: 'ws://teste:1' });
    const socket = sockets[sockets.length - 1];
    socket.open();
    const roster = options.roster || [
      { id: 1, name: options.name || 'Guino', skin: options.skin || 'alien', bot: false },
      { id: 2, name: 'Ashley', skin: 'orc', bot: true },
      { id: 3, name: 'Amiga', skin: 'cyborg', bot: false }
    ];
    const arena = sandbox.VesperArena;
    socket.deliver({
      t: 'joined', id: 1, room: 7, capacity: arena.CONFIG.capacity, remaining: arena.CONFIG.matchSeconds,
      token: 'abc', roster, crates: [{ index: 0, x: 120, y: 60, broken: 0 }]
    });
    return socket;
  };
  const snapshot = (socket, rows, extra = {}) => socket.deliver({
    t: 's', k: 1, r: extra.remaining === undefined ? 280 : extra.remaining,
    f: rows, c: extra.crates || [1], e: extra.events
  });
  return { game, events, canvas, box, sandbox, raf, frame, context, sockets, online, snapshot };
}
test('UI references only real element IDs and valid SVG icons', () => {
  const fullHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const html = fullHtml.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  const ui = fs.readFileSync(path.join(root, 'vesper-ui.js'), 'utf8');
  const idMatches = [...html.matchAll(/\bid="([^"]+)"/g)];
  const ids = idMatches.map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size, 'HTML IDs must be unique');
  for (const match of ui.matchAll(/\$\('([^']+)'\)/g)) assert.ok(ids.includes(match[1]), `Missing #${match[1]}`);
  for (const match of html.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.includes(match[1]), `Missing SVG symbol #${match[1]}`);
  assert.ok(html.includes('charset="UTF-8"'));
  assert.ok(!/<(?:script|link)\b[^>]*(?:src|href)="https?:/i.test(fullHtml), 'Game must not require network assets');
  assert.ok(/id="online-btn"/.test(html) && /id="online-form"/.test(html), 'The Online mode needs its entry button and its name form');
  for (const id of ['online-loading-view', 'online-hud', 'online-board-list', 'online-results-overlay', 'coin-grid']) {
    assert.ok(ids.includes(id), `Missing #${id}`);
  }
  const onlineCss = fs.readFileSync(path.join(root, 'vesper-online.css'), 'utf8');
  assert.ok(fullHtml.includes(onlineCss.trim()), 'Rebuild index.html: embedded Online stylesheet is stale');
  assert.ok(/id="coin-grid"|PERSONAGENS POR MOEDAS|skins com moedas/i.test(html), 'Restored coin skins must remain available');
  assert.ok(/id="difficulty-view"/.test(html), 'Difficulty selection screen is required');
  assert.equal((html.match(/id="characters-back-btn"/g) || []).length, 1, 'Character screen needs one visible back button');
});
function isolated(h = harness()) {
  h.game.start();
  h.game.enemies.length = 0;
  h.game._spawnTimer = Infinity;
  h.game._attackTimer = Infinity;
  return h;
}
function enemy(game, values = {}) {
  const result = {
    id: 1, x: 100, y: 0, type: 'shade', hp: 22, maxHp: 22,
    radius: 16, speed: 65, damage: 11, xp: 3,
    phase: 0, hit: 0, knockX: 0, knockY: 0, dead: false, ...values
  };
  game.enemies.push(result);
  return result;
}
function shot(game, values = {}) {
  const result = { x: 0, y: 0, vx: 1000, vy: 0, radius: 5, damage: 24, life: 2, angle: 0, trail: [], ...values };
  game.projectiles.push(result);
  return result;
}
test('constructor creates menu and one RAF; menu frame leaves simulation untouched', () => {
  const h = harness();
  assert.equal(h.game.state, 'menu');
  assert.equal(h.game.elapsed, 0);
  assert.equal(h.raf.size, 1);
  h.frame(); h.frame();
  assert.equal(h.game.elapsed, 0);
  assert.equal(h.raf.size, 1);
  h.game.start(); h.game.start();
  assert.equal(h.raf.size, 1, 'Restart must not duplicate animation loops');
  assert.equal(h.game.state, 'playing');
  assert.equal(h.game.enemies.length, 5);
  assert.ok(h.events.hud.length > 0);
  for (const field of ['hp','maxHp','xp','nextXp','level','kills','elapsed','wave','damage','projectiles','attackInterval']) {
    assert.ok(Number.isFinite(h.events.hud.at(-1)[field]), `HUD field ${field} must be finite`);
  }
});
test('movement is time based at 20, 60 and 144 Hz and capped diagonally', () => {
  for (const hz of [20, 60, 144]) {
    const { game } = isolated();
    game.setMovement(1, 0);
    for (let i = 0; i < hz; ++i) game._update(1 / hz);
    close(game.player.x, game.player.speed);
    close(game.player.y, 0);
    close(game.elapsed, 1);
  }
  const { game } = isolated();
  game.setMovement(7, 7);
  for (let i = 0; i < 60; ++i) game._update(1 / 60);
  close(Math.hypot(game.player.x, game.player.y), game.player.speed);
  close(game.player.x, game.player.y);
  game.setMovement(NaN, Infinity);
  close(game._movement.x, 0); close(game._movement.y, 0);
});
test('actual RAF freezes simulation on pause and clamps a long frame on resume', () => {
  const h = isolated();
  const g = h.game;
  enemy(g, { x: 400 });
  g.setMovement(1, 0);
  h.frame(); h.frame();
  g.pause();
  const before = JSON.stringify({ player: g.player, enemies: g.enemies, elapsed: g.elapsed });
  h.frame(1000); h.frame(1000);
  assert.equal(g.state, 'paused');
  assert.equal(JSON.stringify({ player: g.player, enemies: g.enemies, elapsed: g.elapsed }), before);
  g.resume();
  const elapsed = g.elapsed;
  h.frame(10000);
  close(g.elapsed - elapsed, 0.05);
  assert.equal(g.state, 'playing');
});
test('enemies spawn beyond all four viewport borders and move directly toward player', () => {
  const { game } = isolated();
  game.player.x = 800; game.player.y = -200;
  game.camera.x = game.player.x; game.camera.y = game.player.y;
  const sides = new Set();
  for (let i = 0; i < 100; ++i) game._spawnEnemy();
  for (const e of game.enemies) {
    const x = e.x - game.player.x, y = e.y - game.player.y;
    assert.ok(Math.abs(x) >= game.width / 2 + 54.99 || Math.abs(y) >= game.height / 2 + 54.99);
    if (Math.abs(x) >= game.width / 2 + 54.99) sides.add(x < 0 ? 'left' : 'right');
    if (Math.abs(y) >= game.height / 2 + 54.99) sides.add(y < 0 ? 'top' : 'bottom');
  }
  assert.equal(sides.size, 4);
  const before = game.enemies.map(e => ({ x: e.x, y: e.y, d: Math.hypot(e.x - game.player.x, e.y - game.player.y) }));
  game._updateEnemies(0.05);
  game.enemies.forEach((e, i) => {
    close(Math.hypot(e.x - game.player.x, e.y - game.player.y), before[i].d - e.speed * 0.05);
    const oldDx = before[i].x - game.player.x, oldDy = before[i].y - game.player.y;
    close(oldDx * (e.y - game.player.y) - oldDy * (e.x - game.player.x), 0, 1e-7);
  });
});
test('continuous waves spawn over time and stronger enemies become available', () => {
  const { game } = isolated();
  game._spawnTimer = 0;
  game.player.invulnerability = 1000;
  for (let i = 0; i < 620; ++i) game._update(0.05);
  assert.equal(game.wave, 2);
  assert.ok(game.enemies.length > 25);
  assert.ok(game.enemies.some(e => e.maxHp > 22));
  for (let i = 0; i < 100; ++i) game._spawnEnemy();
  assert.ok(game.enemies.some(e => e.type === 'brute'));
});
test('auto-fire selects closest enemy and adds the configured number of projectiles', () => {
  const { game } = isolated();
  enemy(game, { id: 1, x: 300, y: 0 });
  enemy(game, { id: 2, x: 0, y: -100 });
  assert.equal(game._shoot(), true);
  assert.equal(game.projectiles.length, 1);
  close(game.projectiles[0].vx, 0, 1e-10);
  assert.ok(game.projectiles[0].vy < 0);
  game.projectiles.length = 0;
  game.player.projectiles = 3;
  game._shoot();
  assert.equal(game.projectiles.length, 3);
  game.projectiles.length = game.enemies.length = 0;
  assert.equal(game._shoot(), false);
});
test('swept collision deals HP damage and lethal hits award one kill and one XP drop', () => {
  const { game } = isolated();
  const victim = enemy(game, { x: 50, hp: 40, maxHp: 40 });
  shot(game, { damage: 15 });
  game._updateProjectiles(0.1);
  assert.equal(victim.hp, 25);
  assert.equal(game.kills, 0);
  assert.equal(game.projectiles.length, 0);
  assert.equal(game.gems.length, 0);
  shot(game, { damage: 25 });
  shot(game, { damage: 25 });
  game._updateProjectiles(0.1);
  assert.equal(game.kills, 1);
  assert.equal(game.enemies.length, 0);
  assert.equal(game.gems.length, 1);
  assert.equal(game.gems[0].value, 3);
  game._killEnemy(victim);
  assert.equal(game.kills, 1);
  assert.equal(game.gems.length, 1);
});
test('swept collision chooses the nearer hit even if farther enemy is listed first', () => {
  const { game } = isolated();
  const far = enemy(game, { id: 2, x: 120, hp: 50, maxHp: 50 });
  const near = enemy(game, { id: 1, x: 45, hp: 50, maxHp: 50 });
  shot(game, { vx: 4000, damage: 10 });
  game._updateProjectiles(0.05);
  assert.equal(near.hp, 40);
  assert.equal(far.hp, 50);
});
test('gem attraction conserves XP and opens two distinct upgrades while RAF is frozen', () => {
  const h = isolated();
  const g = h.game;
  g._dropGem(60, 0, g.nextXp);
  const x = g.gems[0].x;
  g._updateGems(0.05);
  assert.ok(g.gems[0].attracted && g.gems[0].x < x);
  for (let i = 0; i < 10 && g.gems.length; ++i) g._updateGems(0.05);
  assert.equal(g.gems.length, 0);
  assert.equal(g.state, 'upgrade');
  assert.equal(g.level, 2);
  assert.equal(g.xp, 0);
  const choices = h.events.levels.at(-1);
  assert.equal(choices.length, 2);
  assert.notEqual(choices[0].id, choices[1].id);
  for (const choice of choices) for (const field of ['id','title','description']) assert.ok(choice[field]);
  const elapsed = g.elapsed;
  const playerX = g.player.x;
  g.setMovement(1, 0);
  h.frame(); h.frame(500);
  assert.equal(g.elapsed, elapsed);
  assert.equal(g.player.x, playerX);
  assert.equal(g.chooseUpgrade('invalid'), false);
  assert.equal(g.state, 'upgrade');
});
test('every offered upgrade changes its promised stat and a choice can only apply once', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 60 && seen.size < 6; ++seed) {
    const { game } = isolated(harness({ seed }));
    game.xp = game.nextXp;
    game._checkLevelUp();
    const id = game._options.find(option => !seen.has(option.id))?.id || game._options[0].id;
    const before = { ...game.player };
    assert.equal(game.chooseUpgrade(id), true);
    assert.equal(game.state, 'playing');
    const p = game.player;
    if (id === 'damage') close(p.damage, before.damage * 1.25);
    if (id === 'speed') close(p.speed, before.speed * 1.12);
    if (id === 'cadence') close(p.attackInterval, before.attackInterval / 1.15);
    if (id === 'pickup') close(p.pickup, before.pickup * 1.3);
    if (id === 'vitality') { assert.equal(p.maxHp, before.maxHp + 25); assert.ok(p.hp > before.hp); }
    if (id === 'projectile') assert.equal(p.projectiles, before.projectiles + 1);
    const once = JSON.stringify(p);
    assert.equal(game.chooseUpgrade(id), false);
    assert.equal(JSON.stringify(p), once);
    seen.add(id);
  }
  assert.equal(seen.size, 6, `Upgrade coverage: ${[...seen]}`);
});
test('large XP pickup resolves sequential level choices and preserves leftover experience', () => {
  const { game, events } = isolated();
  const awarded = 105;
  game._dropGem(0, 0, awarded);
  let spent = game.nextXp;
  game._updateGems(0.05);
  let choices = 0;
  while (game.state === 'upgrade') {
    assert.ok(++choices < 10, 'Upgrade sequence must terminate');
    const cost = game.nextXp;
    const more = game.xp >= cost;
    assert.equal(game.chooseUpgrade(game._options[0].id), true);
    if (more) spent += cost;
  }
  assert.ok(choices >= 3);
  assert.equal(game.level, choices + 1);
  assert.equal(events.levels.length, choices);
  assert.equal(game.xp + spent, awarded);
  assert.ok(game.xp >= 0 && game.xp < game.nextXp);
  assert.equal(game.state, 'playing');
});
test('gem cap merges without losing awarded experience', () => {
  const { game } = isolated();
  let awarded = 0;
  for (let i = 0; i < game._limits.gems + 80; ++i) {
    const value = 3 + i % 4;
    awarded += value;
    game._dropGem(i * 20, i * 3, value);
  }
  assert.equal(game.gems.length, game._limits.gems);
  assert.equal(game.gems.reduce((sum, gem) => sum + gem.value, 0), awarded);
});
test('contact invulnerability prevents per-frame damage; zero HP ends once and restart resets', () => {
  const h = isolated();
  const g = h.game;
  enemy(g, { x: 1, y: 0, speed: 0, damage: 11 });
  g._update(0.01);
  assert.equal(g.player.hp, 89);
  g._update(0.01);
  assert.equal(g.player.hp, 89);
  g.player.hp = 5;
  g.player.invulnerability = 0;
  g.enemies[0].x = 0; g.enemies[0].knockX = 0;
  g._update(0.01);
  assert.equal(g.player.hp, 0);
  assert.equal(g.state, 'gameover');
  assert.equal(h.events.over.length, 1);
  const elapsed = g.elapsed;
  h.frame(); h.frame(1000);
  assert.equal(h.events.over.length, 1);
  assert.equal(g.elapsed, elapsed);
  Object.assign(g.player, { damage: 99, projectiles: 5, speed: 400, maxHp: 300 });
  g.xp = 13; g.level = 9; g.kills = 200;
  g._dropGem(1, 2, 3);
  shot(g);
  g.start();
  assert.equal(g.state, 'playing');
  assert.equal(g.player.hp, 100); assert.equal(g.player.maxHp, 100);
  assert.equal(g.player.damage, 24); assert.equal(g.player.speed, 215); assert.equal(g.player.projectiles, 1);
  assert.equal(g.elapsed, 0); assert.equal(g.xp, 0); assert.equal(g.kills, 0); assert.equal(g.level, 1);
  assert.equal(g.gems.length, 0); assert.equal(g.projectiles.length, 0); assert.equal(g.enemies.length, 5);
  assert.equal(h.raf.size, 1);
});
test('mobile resize caps DPR while preserving world positions, combat stats and progression', () => {
  const h = isolated();
  const g = h.game;
  g.player.x = 333; g.player.y = -80; g.elapsed = 22; g.xp = 7;
  enemy(g, { x: 450, y: -80 });
  const before = JSON.stringify({ player: g.player, enemies: g.enemies, elapsed: g.elapsed, xp: g.xp });
  h.box.width = 360; h.box.height = 640; h.sandbox.devicePixelRatio = 3;
  g.resize();
  assert.equal(h.canvas.width, 720); assert.equal(h.canvas.height, 1280);
  assert.equal(g.dpr, 2);
  close(g.width, 680);
  assert.ok(g.height > 1000);
  assert.equal(JSON.stringify({ player: g.player, enemies: g.enemies, elapsed: g.elapsed, xp: g.xp }), before);
  h.frame();
  assert.equal(h.raf.size, 1);
});
test('long simulation keeps entity budgets and finite values until victory or five minutes', () => {
  const { game } = harness();
  game.start();
  game.player.maxHp = game.player.hp = 1e8;
  let upgrades = 0;
  for (let i = 0; i < 6000 && game.state !== 'victory'; ++i) {
    while (game.state === 'upgrade') { game.chooseUpgrade(game._options[0].id); upgrades++; }
    const angle = i / 100;
    game.setMovement(Math.cos(angle), Math.sin(angle));
    game._update(0.05);
    for (const name of ['projectiles','gems','particles','numbers']) assert.ok(game[name].length <= game._limits[name], `${name} cap exceeded`);
    assert.ok(game.enemies.filter(e => !e.boss).length <= game._limits.enemies, 'Normal enemy cap exceeded');
    for (const field of ['x','y','hp','speed','damage','attackInterval']) assert.ok(Number.isFinite(game.player[field]), `Non-finite player.${field}`);
  }
  assert.ok(game.elapsed >= 239.99);
  assert.ok(game.state === 'playing' || game.state === 'victory');
  assert.ok(game.kills > 20);
  assert.ok(upgrades > 2);
  assert.ok(game.player.hp > 0);
});
test('standalone HTML embeds the exact tested engine and UI and runs independently', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.equal(html, fs.readFileSync(path.join(root, 'VESPER', 'index.html'), 'utf8'), 'The requested VESPER folder must contain the complete current game');
  for (const name of ['engine', 'characters', 'enemies', 'online', 'ui']) {
    const expression = new RegExp(`<script\\s+data-module="${name}"[^>]*>([\\s\\S]*?)<\\/script>`);
    const embedded = html.match(expression)?.[1];
    assert.ok(embedded, `Missing embedded ${name}`);
    assert.equal(embedded.trim(), fs.readFileSync(path.join(root, `vesper-${name}.js`), 'utf8').trim(), `Rebuild index.html: embedded ${name} is stale`);
    new vm.Script(embedded, { filename: `index.html:${name}` });
  }
  assert.ok(!/<script[^>]+src=/i.test(html), 'Standalone cannot require separate JS modules');
  const { game, frame } = harness({ source: 'standalone' });
  game.start(); frame(); frame();
  assert.equal(game.state, 'playing');
  assert.ok(game.elapsed > 0);
});
test('base movement and enemy speed increase moderately; XP thresholds require more collection', () => {
  const { game } = isolated();
  assert.equal(game.player.speed, 215);
  for (const [type, oldSpeed] of Object.entries({ shade: 65, bat: 102, brute: 46 })) {
    game._spawnEnemy(type);
    const e = game.enemies.at(-1);
    assert.equal(e.type, type);
    assert.ok(e.speed / oldSpeed >= 1.15 && e.speed / oldSpeed <= 1.20, `${type} speed should rise by 15–20%`);
  }
  game.enemies.length = 0;
  game._spawnTimer = 0;
  game._update(0);
  assert.ok(game._spawnTimer < 0.69 && game._spawnTimer >= 0.69 / 1.08, 'Early spawning must increase slightly');
  for (let level = 1; level <= 8; ++level) {
    const previousCost = Math.round(12 + (level - 1) * 7 + (level - 1) ** 1.35);
    assert.ok(game.nextXp >= previousCost * 1.20 - 1 && game.nextXp <= previousCost * 1.25 + 1,
      `Level ${level} threshold must rise approximately 20–25%`);
    game.xp = game.nextXp;
    game._checkLevelUp();
    game.chooseUpgrade(game._options[0].id);
  }
});
function bosses(game) { return game.enemies.filter(e => e.boss && !e.dead); }
function atTime(game, seconds) { game.elapsed = seconds; game._update(0); }
const mapIds = ['castle', 'egypt', 'swamp', 'halloween', 'sea', 'snow'];
const mapReward = { castle: 'vampire', egypt: 'mummy', swamp: 'zombie', halloween: 'jack', sea: 'kraken', snow: 'yeti' };
function within(entity, bounds, radius = entity.radius || 0) {
  assert.ok(entity.x >= bounds.left + radius - 1e-7 && entity.x <= bounds.right - radius + 1e-7, `x=${entity.x} outside world`);
  assert.ok(entity.y >= bounds.top + radius - 1e-7 && entity.y <= bounds.bottom - radius + 1e-7, `y=${entity.y} outside world`);
}
test('easy, medium and hard scale every enemy while preserving rewards', () => {
  const samples = {};
  for (const id of ['easy','medium','hard']) {
    const { game } = harness();
    assert.equal(game.start('castle', id), true);
    game.enemies.length = 0;
    game._spawnEnemy('shade');
    samples[id] = game.enemies[0];
    assert.equal(game.difficultyId, id);
    assert.equal(samples[id].xp, game._templates.shade.xp);
  }
  assert.ok(samples.easy.hp < samples.medium.hp && samples.medium.hp < samples.hard.hp);
  assert.ok(samples.easy.speed < samples.medium.speed && samples.medium.speed < samples.hard.speed);
  assert.ok(samples.easy.damage < samples.medium.damage && samples.medium.damage < samples.hard.damage);
  const { game } = harness();
  assert.equal(game.start('castle', 'impossible'), false);
  assert.equal(game.state, 'menu');
  assert.equal(game.setDifficulty('hard'), true);
  assert.equal(game.start('castle'), true);
  assert.equal(game.difficultyId, 'hard');
});
test('walking makes small capped dust particles and standing still does not', () => {
  const { game } = isolated();
  game.setMovement(1, 0);
  game._update(0.16);
  const dust = game.particles.filter(particle => particle.dust);
  assert.ok(dust.length >= 1 && dust.length <= 2);
  assert.ok(dust.every(particle => particle.size < 3 && particle.maxLife <= 0.36));
  const count = dust.length;
  game.setMovement(0, 0);
  game._update(0.05);
  assert.equal(game.particles.filter(particle => particle.dust).length, count);
});
test('every selectable finite map has a stable identity and safe map changes', () => {
  const { game } = harness();
  const maps = game.constructor.MAPS;
  assert.deepEqual(Array.from(maps, map => map.id), mapIds);
  assert.ok(Object.isFrozen(maps));
  for (const id of mapIds) {
    assert.equal(game.setMap(id), true);
    assert.equal(game.mapId, id);
    assert.equal(game.mapDefinition.id, id);
    const b = game.worldBounds;
    assert.equal(b.width, 4800); assert.equal(b.height, 3600);
    assert.equal(b.left, -2400); assert.equal(b.right, 2400);
    assert.equal(b.top, -1800); assert.equal(b.bottom, 1800);
  }
  assert.equal(game.setMap('unknown'), false);
  assert.equal(game.mapId, mapIds.at(-1));
  game.start('egypt');
  assert.equal(game.mapId, 'egypt');
  assert.equal(game.setMap('castle'), false, 'A live run cannot silently change maps');
  game.toMenu();
  assert.equal(game.setMap('castle'), true);
});
test('player, camera, enemies and gems stay inside all map boundaries on desktop and mobile', () => {
  for (const id of mapIds) for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
    const h = harness(viewport), g = h.game;
    g.start(id); g.enemies.length = 0; g._spawnTimer = Infinity; g._attackTimer = Infinity;
    const b = g.worldBounds;
    for (const [x, y] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
      g.player.x = x < 0 ? b.left + 1 : b.right - 1;
      g.player.y = y < 0 ? b.top + 1 : b.bottom - 1;
      g.setMovement(x, y); g._update(0.05);
      within(g.player, b);
      assert.ok(g.camera.x >= b.left + g.width / 2 - 1e-7 && g.camera.x <= b.right - g.width / 2 + 1e-7);
      assert.ok(g.camera.y >= b.top + g.height / 2 - 1e-7 && g.camera.y <= b.bottom - g.height / 2 + 1e-7);
      g.enemies.length = 0;
      for (let i = 0; i < 80; ++i) g._spawnEnemy();
      for (const e of g.enemies) {
        within(e, b);
        assert.ok(Math.hypot(e.x-g.player.x,e.y-g.player.y) > e.radius + g.player.radius + 30, 'Edge spawns must not overlap the player');
      }
    }
    g._dropGem(100000, -100000, 3);
    within(g.gems.at(-1), b);
    atTime(g, 150);
    for (const boss of bosses(g)) {
      within(boss, b);
      boss.x = b.right - 1; boss.y = b.bottom - 1;
      boss.dashState = 'dash'; boss.dashX = boss.dashY = 1 / Math.sqrt(2); boss.dashTimer = 1;
    }
    g._updateEnemies(0.05);
    for (const e of g.enemies) within(e, b);
    h.frame();
  }
});
test('each map spawns exactly its mini boss at 150 seconds and final character at 240 seconds', () => {
  for (const id of mapIds) {
    const { game: g } = isolated();
    g.start(id); g.enemies.length = 0; g._spawnTimer = g._attackTimer = Infinity;
    for (const time of [0, 60, 120, 149.99]) { atTime(g, time); assert.equal(bosses(g).length, 0); }
    atTime(g,150);
    const mini = bosses(g)[0];
    assert.ok(mini && !mini.finalBoss);
    assert.equal(mini.spawnAt,150);
    for (const time of [150, 180, 239.99]) { atTime(g,time); assert.equal(bosses(g).length,1); }
    atTime(g,240);
    const final = bosses(g).find(e => e.finalBoss);
    assert.equal(bosses(g).length,2);
    assert.ok(final);
    assert.equal(final.spawnAt,240);
    assert.equal(final.characterId,mapReward[id]);
    for (const time of [240, 300, 360, 480, 600]) { atTime(g,time); assert.equal(bosses(g).length,2); }
    assert.ok(g.enemies.includes(mini), 'An undefeated mini boss remains present');
  }
});
test('pause and upgrades freeze map encounter deadlines', () => {
  for (const state of ['paused','upgrade']) for (const deadline of [150,240]) {
    const h = isolated(), g = h.game;
    atTime(g,deadline-0.01); h.frame();
    const count=bosses(g).length;
    if(state==='paused')g.pause(); else {g.xp=g.nextXp;g._checkLevelUp();}
    for(let i=0;i<10;i++)h.frame(60000);
    close(g.elapsed,deadline-0.01); assert.equal(bosses(g).length,count);
    if(state==='paused')g.resume();else g.chooseUpgrade(g._options[0].id);
    h.frame(20);assert.equal(bosses(g).length,count+1);
  }
});
test('encounters ignore the ordinary mob cap and preserve boss health/reward scaling', () => {
  const { game:g }=isolated();
  for(let i=0;i<g._limits.enemies;i++)g._spawnEnemy('shade');
  atTime(g,150);const mini=bosses(g)[0];
  assert.ok(mini);
  atTime(g,240);const final=bosses(g).find(e=>e.finalBoss);
  assert.equal(bosses(g).length,2);assert.ok(g.enemies.includes(mini));
  for(const boss of [mini,final]){
    const multiplier=boss.finalBoss?14:7;
    const commonHp=22*(1+Math.floor(boss.spawnAt/30)*0.2);
    close(boss.maxHp,commonHp*multiplier*3);
    assert.equal(boss.xp,multiplier*3);
  }
  g.gems.length=0;const kills=g.kills;
  g._killEnemy(mini);g._killEnemy(mini);
  assert.equal(g.kills,kills+1);assert.equal(g.gems.length,7);
  assert.equal(g.gems.reduce((sum,gem)=>sum+gem.value,0),21);
  assert.equal(g.state,'playing','Defeating the mini boss does not finish the map');
});
test('only final-boss defeat awards one victory, cancels same-frame XP, and freezes gameplay', () => {
  for(const id of mapIds){
    const h=harness(),g=h.game;
    g.start(id);g.enemies.length=0;g._spawnTimer=g._attackTimer=Infinity;
    atTime(g,240);
    const final=bosses(g).find(e=>e.finalBoss),mini=bosses(g).find(e=>!e.finalBoss);
    final.x=100;final.y=0;final.speed=0;final.dashCooldown=Infinity;final.hp=1;
    g._dropGem(0,0,g.nextXp);
    shot(g,{x:80,y:0,vx:1000,damage:10});
    g._update(0.05);
    assert.equal(g.state,'victory');assert.equal(h.events.victories.length,1);
    const result=h.events.victories[0];
    assert.equal(result.mapId,id);assert.equal(result.characterId,mapReward[id]);
    for(const field of ['elapsed','kills','level','bossKills'])assert.ok(Number.isFinite(result[field]));
    assert.equal(h.events.levels.length,0,'A final kill must not be replaced by an upgrade dialog');
    assert.equal(g.level,1);
    g._killEnemy(final);
    assert.equal(h.events.victories.length,1);
    const snapshot=JSON.stringify({player:g.player,enemies:g.enemies,gems:g.gems,elapsed:g.elapsed,kills:g.kills});
    g.setMovement(1,1);h.frame();h.frame(10000);g._update(0.05);
    assert.equal(JSON.stringify({player:g.player,enemies:g.enemies,gems:g.gems,elapsed:g.elapsed,kills:g.kills}),snapshot);
    assert.equal(h.events.over.length,0);
    assert.equal(h.events.hud.at(-1).bosses.length,0,'Victory HUD must hide live encounter bars');
    g.start(id);assert.equal(g.state,'playing');assert.equal(g.elapsed,0);assert.equal(g.kills,0);
    g.enemies.length=0;g._spawnTimer=g._attackTimer=Infinity;
    atTime(g,149.99);assert.equal(bosses(g).length,0);
    atTime(g,150);assert.equal(bosses(g).length,1);
    assert.equal(h.events.victories.length,1,'Restart alone never awards a completion');
  }
});
test('game over and abandoning a run never award map victory', () => {
  const h=isolated(),g=h.game;
  g.player.hp=1;enemy(g,{x:1,y:0,damage:2,speed:0});g._update(0.01);
  assert.equal(g.state,'gameover');assert.equal(h.events.victories.length,0);
  g.start('swamp');g.elapsed=250;g.pause();g.toMenu();
  assert.equal(g.state,'menu');assert.equal(h.events.victories.length,0);
});
test('mini boss reward remains seven separate gems when old gem capacity is full', () => {
  const {game:g}=isolated();
  for(let i=0;i<g._limits.gems;i++)g._dropGem(i*3,1000,3);
  const before=g.gems.reduce((sum,gem)=>sum+gem.value,0);
  atTime(g,150);g._killEnemy(bosses(g)[0]);
  assert.equal(g.gems.length,g._limits.gems);
  assert.equal(g.gems.reduce((sum,gem)=>sum+gem.value,0),before+21);
  assert.ok(g.gems.slice(-7).every(gem=>gem.value===3));
});

test('normal waves naturally offer six visually typed enemies, with later types unlocked over time', () => {
  const collect = wave => {
    const { game } = isolated();
    game.wave = wave;
    const types = new Set();
    const templates = new Map();
    for (let i = 0; i < 1200; ++i) {
      game.enemies.length = 0;
      game._spawnEnemy();
      const spawned = game.enemies[0];
      assert.ok(spawned && !spawned.boss);
      types.add(spawned.type); templates.set(spawned.type, spawned);
    }
    return { types, templates };
  };
  const early = collect(1), late = collect(12);
  assert.equal(late.types.size, 6, `Late-wave variety: ${[...late.types]}`);
  assert.ok(early.types.size < late.types.size, 'New enemy types should unlock as the run develops');
  for (const name of ['shade', 'bat', 'brute', 'crawler', 'skeleton', 'wraith']) assert.ok(late.types.has(name), `Missing ${name}`);
  assert.ok(new Set([...late.templates.values()].map(e => e.radius)).size >= 4);
  assert.ok(new Set([...late.templates.values()].map(e => e.speed)).size >= 5);
});
test('boss dash visibly waits, locks its direction, and applies swept contact damage without retargeting', () => {
  const { game } = isolated();
  atTime(game, 150);
  const boss = bosses(game)[0];
  boss.x = 300; boss.y = 0; boss.dashCooldown = 0;
  game._updateEnemies(0.01);
  assert.equal(boss.dashState, 'telegraph');
  close(boss.dashX, -1); close(boss.dashY, 0);
  assert.ok(boss.dashTimer >= 0.89, 'A readable wind-up precedes the dash');
  const x = boss.x;
  game.player.y = 200;
  game._updateEnemies(0.4);
  assert.equal(boss.dashState, 'telegraph');
  close(boss.x, x); close(boss.y, 0);
  game._updateEnemies(0.51);
  assert.equal(boss.dashState, 'dash');
  game._updateEnemies(0.05);
  assert.ok(boss.x < x);
  close(boss.y, 0, 1e-9, 'Dash direction must remain locked after the player sidesteps');
  game.player.x = game.player.y = 0;
  boss.x = -100; boss.y = 0;
  boss.dashState = 'dash'; boss.dashX = 1; boss.dashY = 0; boss.dashTimer = 0.52;
  const hp = game.player.hp;
  game._updateEnemies(0.5);
  assert.ok(boss.x > game.player.x + boss.radius + game.player.radius);
  assert.equal(game.player.hp, hp - boss.damage, 'A dash crossing the player must damage even when it ends beyond them');
  game._updateEnemies(0.05);
  assert.equal(boss.dashState, 'recover');
});

function uiHarness(stored = {}, { blocked = false } = {}) {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const nodes = new Map();
  let doc;
  class Element {
    constructor(id = '') {
      this.id = id; this.handlers = new Map(); this.style = { setProperty(key, value) { this[key] = value; } }; this.dataset = {};
      this.children = []; this.attributes = {}; this.hidden = false;
      this.classList = {
        add: name => { this.className = [...new Set((this.className || '').split(' ').filter(Boolean).concat(name))].join(' '); },
        remove: name => { this.className = (this.className || '').split(' ').filter(item => item !== name).join(' '); },
        contains: name => (this.className || '').split(' ').includes(name),
        toggle: (name, force) => { const has = (this.className || '').split(' ').includes(name); const next = force === undefined ? !has : force; next ? this.classList.add(name) : this.classList.remove(name); return next; }
      };
      this.captured = new Set();
    }
    addEventListener(name, fn) { if (!this.handlers.has(name)) this.handlers.set(name, []); this.handlers.get(name).push(fn); }
    fire(name, fields = {}) { const event = { target: this, preventDefault() {}, ...fields }; for (const fn of this.handlers.get(name) || []) fn(event); }
    setAttribute(name, value) { this.attributes[name] = value; }
    getAttribute(name) { return this.attributes[name] ?? null; }
    getContext() { return this.context ||= makeContext(); }
    getBoundingClientRect() { return { left: 10, top: 20, width: 110, height: 110 }; }
    querySelector(name) { return name === 'use' ? (this.use ||= new Element()) : this.children.find(e => e.tag === 'button'); }
    querySelectorAll() { return this.children.filter(e => e.tag === 'button'); }
    closest() { return null; }
    contains(element) { return element === this || this.children.includes(element); }
    replaceChildren(...children) { for (const child of this.children) child.parentElement = null; this.children.length = 0; this.append(...children); }
    append(...children) { for (const child of children) child.parentElement = this; this.children.push(...children); }
    remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this); this.parentElement = null; }
    focus() { doc.activeElement = this; }
    blur() { doc.activeElement = null; }
    setPointerCapture(id) { this.captured.add(id); }
    hasPointerCapture(id) { return this.captured.has(id); }
    releasePointerCapture(id) { this.captured.delete(id); this.fire('lostpointercapture', { pointerId: id }); }
  }
  for (const match of html.matchAll(/\bid="([^"]+)"/g)) nodes.set(match[1], new Element(match[1]));
  const microtasks = [];
  const frames = new Map();
  const timers = new Map();
  let frameId = 0;
  let timerId = 0;
  doc = new Element('document');
  doc.getElementById = id => nodes.get(id);
  doc.createElement = tag => Object.assign(new Element(), { tag });
  doc.querySelector = () => null;
  doc.documentElement = new Element('html');
  doc.activeElement = null;
  const ui = {
    nodes, doc, microtasks, frames, timers, stored, game: null,
    flush(rounds = 10) {
      for (let round = 0; round < rounds && timers.size; round++) {
        const pending = [...timers.values()];
        timers.clear();
        for (const timer of pending) timer.callback();
      }
    }
  };
  class FakeGame {
    constructor(canvas, callbacks) { ui.game = this; this.callbacks = callbacks; this.state = 'menu'; this.moves = []; this._movement = { x: 0, y: 0 }; this.level = 1; this.elapsed = 0; this.previews = []; this.character = null; this.mapId = 'castle'; }
    setMovement(x, y) { this._movement = { x, y }; this.moves.push({ x, y }); }
    setMuted() {}
    resize() {}
    setCharacter(id) { this.character = id; return true; }
    setMap(id) { this.mapId = id; return true; }
    get mapDefinition() { return FakeGame.MAPS.find(map => map.id === this.mapId); }
    drawCharacterPreview(canvas, id, locked) { this.previews.push({ id, locked, size: canvas.width }); }
    drawMapPreview() {}
    drawMinimap() {}
    start(id, difficultyId) { if(id)this.mapId=id; this.difficultyId=difficultyId || this.difficultyId || 'medium'; this.starts = (this.starts || 0) + 1; this.state = 'playing'; this.callbacks.onState(this.state); }
    pause() { this.state = 'paused'; this.callbacks.onState(this.state); }
    resume() { this.state = 'playing'; this.callbacks.onState(this.state); }
    toMenu() { this.state = 'menu'; this.elapsed = 0; this.callbacks.onState(this.state); }
    chooseUpgrade(id) { this.chosen = id; this.state = 'playing'; this.callbacks.onState(this.state); }
  }
  FakeGame.CHARACTERS = harness().game.constructor.CHARACTERS;
  FakeGame.MAPS = harness().game.constructor.MAPS;
  FakeGame.DIFFICULTIES = harness().game.constructor.DIFFICULTIES;
  const browser = new Element('window');
  ui.browser = browser;
  const sandbox = {
    window: browser, document: doc, HTMLElement: Element, VesperGame: FakeGame,
    ResizeObserver: class { observe() {} },
    localStorage: { getItem: key => { if(blocked)throw new Error('Storage unavailable'); return key in stored ? stored[key] : null; }, setItem: (key, value) => { if(blocked)throw new Error('Storage unavailable'); stored[key] = String(value); } },
    sessionStorage: { getItem: () => null, setItem() {} },
    WebSocket: class { constructor() { this.readyState = 0; } send() {} close() {} },
    queueMicrotask: callback => microtasks.push(callback),
    requestAnimationFrame: callback => { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame: id => frames.delete(id),
    setTimeout: (callback, delay) => { timers.set(++timerId, { callback, delay }); return timerId; },
    clearTimeout: id => timers.delete(id), console
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'vesper-arena.js'), 'utf8'), sandbox, { filename: 'vesper-arena.js' });
  vm.runInContext(fs.readFileSync(path.join(root, 'vesper-online.js'), 'utf8'), sandbox, { filename: 'vesper-online.js' });
  FakeGame.prototype.startOnline = function (options) {
    this.onlineStarts = (this.onlineStarts || 0) + 1;
    this.onlineOptions = options;
    this._mode = 'online';
    this.state = 'playing';
    this.callbacks.onState('playing');
    this.callbacks.onOnlineJoined({ server: 3, capacity: 15, players: 15, humans: 2, bots: 13, address: options.server });
    return { server: options.server, connecting: true };
  };
  FakeGame.prototype.leaveOnline = function () { this._mode = null; this.toMenu(); };
  FakeGame.prototype.setFiring = function (firing) { this.firing = Boolean(firing); };
  vm.runInContext(fs.readFileSync(path.join(root, 'vesper-ui.js'), 'utf8'), sandbox, { filename: 'vesper-ui.js' });
  return ui;
}
test('real UI handles keyboard/touch and independently maintains all live boss health bars', () => {
  const { nodes, browser, microtasks, ...ui } = uiHarness();
  const game = ui.game;
  nodes.get('start-btn').fire('click');
  nodes.get('map-grid').children[0].fire('click');
  assert.equal(nodes.get('menu').dataset.view, 'difficulty');
  nodes.get('difficulty-choices').children[1].fire('click');
  assert.equal(game.state, 'playing');
  assert.equal(game.difficultyId, 'medium');
  assert.equal(nodes.get('menu').hidden, true);
  assert.equal(nodes.get('hud').hidden, false);
  const stick = nodes.get('joystick');
  const center = { clientX: 65, clientY: 75 };
  stick.fire('pointerdown', { pointerId: 7, clientX: 1000, clientY: 1000 });
  close(Math.hypot(game.moves.at(-1).x, game.moves.at(-1).y), 1);
  assert.ok(stick.hasPointerCapture(7));
  const before = game.moves.length;
  stick.fire('pointermove', { pointerId: 9, ...center });
  assert.equal(game.moves.length, before, 'Unrelated pointer must be ignored');
  stick.fire('pointermove', { pointerId: 7, ...center });
  close(game.moves.at(-1).x, 0); close(game.moves.at(-1).y, 0);
  stick.fire('pointermove', { pointerId: 7, clientX: 1000, clientY: 75 });
  close(game.moves.at(-1).x, 1); close(game.moves.at(-1).y, 0);
  stick.fire('pointerup', { pointerId: 7 });
  close(game.moves.at(-1).x, 0); close(game.moves.at(-1).y, 0);
  assert.equal(nodes.get('joystick-knob').style.transform, '');
  stick.fire('pointerdown', { pointerId: 8, clientX: 65, clientY: -999 });
  close(game.moves.at(-1).y, -1);
  stick.fire('pointercancel', { pointerId: 8 });
  close(game.moves.at(-1).x, 0); close(game.moves.at(-1).y, 0);
  stick.getBoundingClientRect = () => ({ left:0, top:0, width:0, height:0 });
  const zeroSizeMoves = game.moves.length;
  stick.fire('pointerdown', { pointerId: 10, clientX: 0, clientY: 0 });
  assert.equal(game.moves.length, zeroSizeMoves, 'A hidden zero-size joystick must not create NaN movement');
  stick.fire('pointercancel', { pointerId: 10 });
  assert.ok(game.moves.every(({x,y}) => Number.isFinite(x) && Number.isFinite(y)));
  browser.fire('keydown', { code: 'KeyW' });
  browser.fire('keydown', { code: 'ArrowRight' });
  close(game.moves.at(-1).x, 1 / Math.sqrt(2));
  close(game.moves.at(-1).y, -1 / Math.sqrt(2));
  browser.fire('keyup', { code: 'KeyW' });
  close(game.moves.at(-1).x, 1); close(game.moves.at(-1).y, 0);
  browser.fire('blur');
  assert.equal(game.state, 'paused');
  close(game.moves.at(-1).x, 0); close(game.moves.at(-1).y, 0);
  assert.equal(nodes.get('pause-overlay').hidden, false);
  nodes.get('resume-btn').fire('click');
  assert.equal(game.state, 'playing');
  game.level = 2;
  game.state = 'upgrade';
  game.callbacks.onState('upgrade');
  game.callbacks.onLevelUp([
    { id: 'damage', title: 'Dano', description: 'Mais dano' },
    { id: 'projectile', title: 'Lâmina', description: 'Mais projéteis' }
  ]);
  assert.equal(nodes.get('choices').children.length, 2);
  browser.fire('keydown', { code: 'Digit2' });
  assert.equal(game.chosen, 'projectile');
  assert.equal(game.state, 'playing');
  assert.equal(nodes.get('upgrade-overlay').hidden, true);
  nodes.get('restart-btn').fire('click');
  assert.equal(game.starts, 2);
  const hud = { hp: 100, maxHp: 100, xp: 5, nextXp: 15, elapsed: 181, kills: 200, level: 9, bosses: [
    { id: 101, name: 'SENTINELA', hp: 100, maxHp: 200, superBoss: false },
    { id: 102, name: 'ARCONTE', hp: 600, maxHp: 600, superBoss: true }
  ] };
  game.callbacks.onHud(hud);
  const bars = nodes.get('boss-bars');
  assert.equal(nodes.get('boss-hud').hidden, false);
  assert.equal(bars.children.length, 2);
  const firstRow = bars.children[0], secondRow = bars.children[1];
  assert.equal(firstRow.children[1].attributes.role, 'progressbar');
  assert.equal(firstRow.children[1].attributes['aria-valuenow'], 100);
  assert.equal(firstRow.children[1].children[0].style.width, '50%');
  assert.ok(secondRow.className.includes('super-boss'));
  hud.bosses[0].hp = 50;
  game.callbacks.onHud(hud);
  assert.equal(bars.children[0], firstRow, 'HUD updates should preserve the same boss row');
  assert.equal(firstRow.children[1].children[0].style.width, '25%');
  hud.bosses.shift();
  game.callbacks.onHud(hud);
  assert.equal(bars.children.length, 1);
  assert.equal(bars.children[0], secondRow, 'Defeating one boss must preserve the other boss bar');
  hud.bosses.length = 0;
  game.callbacks.onHud(hud);
  assert.equal(bars.children.length, 0);
  assert.equal(nodes.get('boss-hud').hidden, true);
  game.callbacks.onGameOver({ elapsed: 181, kills: 200, level: 9, bossKills: 2 });
  assert.equal(nodes.get('final-bosses').textContent, 2);
  game.state = 'gameover'; game.callbacks.onState('gameover');
  nodes.get('gameover-menu-btn').fire('click');
  assert.equal(game.state, 'menu');
  assert.equal(nodes.get('menu').dataset.view, 'main', 'Game over returns to the restored main menu');
  for (const callback of microtasks) callback();
});
test('contact damage is a little gentler for every enemy type and both bosses at every stage', () => {
  const previous = { shade: 11, bat: 8, brute: 20, crawler: 7, skeleton: 13, wraith: 10 };
  const { game } = isolated();
  for (const wave of [1, 5, 9, 13, 21]) {
    game.wave = wave;
    for (const [type, oldDamage] of Object.entries(previous)) {
      game.enemies.length = 0;
      game._spawnEnemy(type);
      const oldTotal = oldDamage + Math.floor((wave - 1) * 1.5);
      const ratio = game.enemies[0].damage / oldTotal;
      assert.ok(Number.isInteger(game.enemies[0].damage));
      assert.ok(ratio >= 0.75 && ratio <= 0.92, `${type} wave ${wave}: ${game.enemies[0].damage} vs ${oldTotal}`);
    }
  }
});

test('every hero draws in the arena and as locked or unlocked portraits with balanced canvas state', () => {
  const h = harness();
  const g = h.game;
  let depth = 0;
  h.context.save = () => { depth++; };
  h.context.restore = () => { depth--; assert.ok(depth >= 0, 'restore without matching save'); };
  for (const { id } of g.constructor.CHARACTERS) {
    g.setCharacter(id);
    g.start();
    for (const [steps, invulnerability, facing] of [[0, 0, 1], [2.3, 0.3, -1]]) {
      Object.assign(g.player, { steps, invulnerability, facing });
      g._draw();
      assert.equal(depth, 0, `${id} arena drawing must balance save/restore`);
    }
    for (const locked of [false, true]) {
      const modes = [], alpha = [];
      const target = { createRadialGradient: () => ({ addColorStop() {} }), save() { depth++; }, restore() { depth--; } };
      const context = new Proxy(target, {
        get: (object, key) => (key in object ? object[key] : () => {}),
        set: (object, key, value) => { object[key] = value; if (key === 'globalCompositeOperation') modes.push(value); if (key === 'globalAlpha') alpha.push(value); return true; }
      });
      g.drawCharacterPreview({ width: 144, height: 144, getContext: () => context }, id, locked);
      assert.equal(depth, 0, `${id} portrait must balance save/restore`);
      assert.equal(context.globalCompositeOperation, 'source-over', 'Portraits restore normal compositing');
      assert.equal(modes.includes('source-atop'), false, 'Locked skins remain visible for preview');
      assert.ok(alpha.includes(locked ? 0.8 : 1), 'Locked previews are dimmed without hiding the art');
    }
  }
});
test('returning to the menu abandons the run, clears progress and keeps the chosen hero', () => {
  const h = harness();
  const g = h.game;
  g.setCharacter('ghost');
  g.start();
  g.elapsed = 155; g.kills = 12; g.level = 4;
  g._update(0);
  assert.equal(g.bosses.length, 1);
  g.pause();
  g.toMenu();
  assert.equal(g.state, 'menu');
  assert.equal(h.events.states.at(-1), 'menu');
  assert.equal(g.elapsed, 0); assert.equal(g.kills, 0); assert.equal(g.level, 1);
  assert.equal(g.enemies.length, 0); assert.equal(g.bosses.length, 0);
  assert.equal(g.character, 'ghost');
  h.frame(); h.frame(1000);
  assert.equal(g.elapsed, 0, 'Menu frames never advance the run clock');
  g.start();
  assert.equal(g.state, 'playing');
  assert.equal(g.enemies.length, 5);
  assert.equal(h.raf.size, 1);
});
test('resuming a paused run or unmuting wakes audio that the browser suspended', () => {
  const h = harness();
  let resumed = 0;
  h.sandbox.AudioContext = class {
    constructor() { this.state = 'running'; this.destination = {}; this.currentTime = 0; }
    createGain() { return { gain: { value: 0 }, connect() {} }; }
    resume() { resumed++; this.state = 'running'; return Promise.resolve(); }
  };
  const g = h.game;
  g.start();
  assert.ok(g._audio);
  g.pause();
  g._audio.state = 'interrupted';
  g.resume();
  assert.equal(g.state, 'playing');
  assert.equal(resumed, 1);
  assert.equal(g._audio.state, 'running');
  g._audio.state = 'suspended';
  g.setMuted(true);
  assert.equal(resumed, 1, 'Muting never needs to wake audio');
  g.setMuted(false);
  assert.equal(resumed, 2);
  g.resume();
  assert.equal(resumed, 2, 'Resume outside a pause does nothing');
});

test('offline menu selects each map before starting and character selection returns to that menu', () => {
  const ui = uiHarness(), n = ui.nodes;
  n.get('start-btn').fire('click');
  assert.equal(ui.game.starts, undefined, 'Offline must open the map selector first');
  assert.equal(n.get('menu').dataset.view, 'maps');
  assert.equal(n.get('map-grid').children.length, mapIds.length);
  n.get('map-character-btn').fire('click');
  assert.equal(n.get('menu').dataset.view, 'characters');
  const ghost = n.get('character-grid').children.find(card => card.dataset.characterId === 'ghost');
  ghost.fire('click');
  assert.equal(ui.game.character, 'ghost');
  n.get('characters-back-btn').fire('click');
  assert.equal(n.get('menu').dataset.view, 'maps');
  assert.equal(n.get('map-character-name').textContent, 'Fantasma');
  for (const card of n.get('map-grid').children) {
    card.fire('click');
    assert.equal(n.get('menu').dataset.view, 'difficulty');
    const hard = n.get('difficulty-choices').children.find(button => button.dataset.mode === 'hard');
    hard.fire('click');
    assert.equal(ui.game.mapId, card.dataset.mapId);
    assert.equal(ui.game.difficultyId, 'hard');
    assert.equal(ui.game.state, 'playing');
    n.get('pause-btn').fire('click');
    n.get('pause-restart-btn').fire('click');
    assert.equal(ui.game.mapId, card.dataset.mapId, 'Restart preserves the selected map');
    assert.equal(ui.game.character, 'ghost');
    n.get('pause-btn').fire('click'); n.get('pause-menu-btn').fire('click'); n.get('start-btn').fire('click');
  }
});
test('minimap changes corner only when it would cover the player', () => {
  const ui = uiHarness(), n = ui.nodes;
  n.get('arena').getBoundingClientRect = () => ({left:0,top:0,width:1000,height:800});
  Object.assign(n.get('minimap'), {offsetWidth:184,offsetHeight:180});
  Object.assign(ui.game, {width:1000,height:800,camera:{x:0,y:0},player:{x:470,y:350}});
  const data = {hp:100,maxHp:100,xp:0,nextXp:15,elapsed:0,kills:0,level:1,bosses:[]};
  ui.game.callbacks.onHud(data);
  assert.equal(n.get('minimap').classList.contains('is-obscuring'), true);
  ui.game.player.x = ui.game.player.y = 0; ui.game.callbacks.onHud(data);
  assert.equal(n.get('minimap').classList.contains('is-obscuring'), false);
});
test('campaign keeps eight heroes while the Online mode adds eight paid skins', () => {
  const earned = ['human', 'ghost', 'hooded', 'vampire', 'mummy', 'zombie', 'jack', 'kraken', 'yeti', 'survivor'];
  const skins = ['alien', 'spider', 'skeleton', 'orc', 'invisible', 'cyborg', 'plague', 'frankenstein'];
  const roster = harness().game.constructor.CHARACTERS;
  assert.deepEqual(Array.from(roster, character => character.id), earned.concat(skins));
  const paid = roster.filter(character => character.unlockType === 'coins');
  assert.equal(paid.length, 8, 'Oito skins pagas no catalogo da campanha');
  for (const selected of [...skins, 'vampire', 'unknown']) {
    const ui = uiHarness({ 'vesper.best.v1': '999999', 'vesper.character.v1': selected });
    ui.nodes.get('characters-btn').fire('click');
    const cards = ui.nodes.get('character-grid').children;
    const coinCards = ui.nodes.get('coin-grid').children;
    assert.deepEqual(cards.map(card => card.dataset.characterId), earned);
    assert.deepEqual(coinCards.map(card => card.dataset.characterId), skins);
    assert.deepEqual(cards.filter(card => !card.classList.contains('is-locked')).map(card => card.dataset.characterId), ['human', 'ghost', 'hooded']);
    assert.equal(ui.game.character, 'human');
    assert.ok(coinCards[0].classList.contains('is-using'), 'O Alien começa em uso no Online');
    assert.ok(coinCards.slice(1).every(card => card.classList.contains('is-locked')));
  }
});
test('each campaign victory persists only its own reward; the last map grants survivor and gold frames', () => {
  const stored = {}, ui = uiHarness(stored), n = ui.nodes;
  const rewards = ['vampire','mummy','zombie','jack'];
  for (const [index, id] of mapIds.entries()) {
    n.get('start-btn').fire('click');
    n.get('map-grid').children.find(card => card.dataset.mapId === id).fire('click');
    n.get('difficulty-choices').children[1].fire('click');
    ui.game.state = 'victory'; ui.game.callbacks.onState('victory');
    ui.game.callbacks.onVictory({ mapId:id, elapsed:265, kills:300, level:12, bossKills:2 });
    assert.equal(n.get('victory-overlay').hidden, false);
    assert.equal(n.get('victory-unlocks').children.length, index === mapIds.length - 1 ? 2 : 1);
    assert.equal(JSON.parse(stored['vesper.progress.v2']).completedMaps.length, index + 1);
    n.get('victory-characters-btn').fire('click');
    const cards = n.get('character-grid').children;
    for (const [rewardIndex, reward] of rewards.entries()) {
      const card = cards.find(card => card.dataset.characterId === reward);
      assert.equal(card.classList.contains('is-earned'), rewardIndex <= index);
      assert.equal(card.getAttribute('aria-disabled'), String(rewardIndex > index));
    }
    assert.equal(cards.find(card => card.dataset.characterId === 'survivor').classList.contains('is-earned'), index === mapIds.length - 1);
    n.get('characters-back-btn').fire('click');
    assert.equal(n.get('map-grid').children.filter(card => card.classList.contains('is-completed')).length, index + 1);
    n.get('maps-back-btn').fire('click');
  }
  const reload = uiHarness(stored); reload.nodes.get('characters-btn').fire('click');
  assert.equal(reload.nodes.get('character-grid').children.filter(card => card.classList.contains('is-earned')).length, mapIds.length + 1);
  const survivor = reload.nodes.get('character-grid').children.find(card => card.dataset.characterId === 'survivor');
  survivor.fire('click'); assert.equal(stored['vesper.character.v1'], 'survivor');
  assert.equal(uiHarness(stored).game.character, 'survivor', 'Earned selection survives reload');
  reload.game.callbacks.onVictory({mapId:'halloween',elapsed:300,kills:400,level:14});
  assert.equal(JSON.parse(stored['vesper.progress.v2']).completedMaps.length, mapIds.length, 'Repeat clears never duplicate progression');
  assert.equal(reload.nodes.get('victory-unlocks').children[0].className, 'reward-repeat');
});
test('corrupt, unknown, disabled and failed-run storage cases do not grant campaign rewards', () => {
  for (const value of ['{', 'null', '{"version":1,"completedMaps":["castle"]}', '{"version":2,"completedMaps":["unknown",null,3]}']) {
    const ui = uiHarness({'vesper.progress.v2':value});
    ui.game.callbacks.onGameOver({elapsed:700,kills:400,level:10,bossKills:1});
    ui.nodes.get('characters-btn').fire('click');
    assert.equal(ui.nodes.get('character-grid').children.filter(card => !card.classList.contains('is-locked')).length, 3);
  }
  const ui = uiHarness({}, {blocked:true});
  ui.game.callbacks.onVictory({mapId:'swamp',elapsed:270,kills:300,level:11});
  ui.nodes.get('victory-characters-btn').fire('click');
  assert.equal(ui.nodes.get('character-grid').children.find(card => card.dataset.characterId === 'zombie').getAttribute('aria-disabled'), 'false', 'Session unlocks work even if saving is unavailable');
});
test('all maps render their landmarks and cache full-world overviews; minimap red dot tracks world corners', () => {
  const h = harness(), g = h.game;
  for (const map of g.constructor.MAPS) {
    g.start(map.id); g._draw();
    g.camera.x = 1200; g.camera.y = -900; g._draw();
    g.drawMapPreview({width:480,height:190,getContext:makeContext}, map.id);
    assert.equal(g._getMapOverview(map.id), g._getMapOverview(map.id), 'Full map is rendered once and reused');
    const context = makeContext(), dots = []; let arc;
    context.arc = (x,y,r) => { arc = {x,y,r}; };
    context.fill = () => { if(context.fillStyle === '#ff4555') dots.push(arc); };
    const minimap = {width:348,height:262,getContext:() => context};
    for (const [x,y] of [[0,0],[-2400,-1800],[2400,1800]]) {
      g.player.x = x; g.player.y = y; g._clampEntity(g.player); g.drawMinimap(minimap);
    }
    assert.equal(dots.length, 3); close(dots[0].x, 174); close(dots[0].y, 131);
    assert.ok(dots[1].x < 12 && dots[1].y < 14, 'Northwest edge appears at top left');
    assert.ok(dots[2].x > 330 && dots[2].y > 244, 'Southeast edge appears at bottom right');
    assert.ok(dots.every(dot => dot.r >= 6), 'Red marker stays legible at high pixel density');
  }
});
test('every themed enemy and mini boss renders distinctly without corrupting canvas state', () => {
  const h = harness(), g = h.game, appearances = new Set(), drawings = new Set();
  const methods = ['beginPath','moveTo','lineTo','closePath','ellipse','arc','fillRect','fill','stroke','scale','translate'];
  let depth = 0, operations = [];
  h.context.save = () => depth++;
  h.context.restore = () => { depth--; assert.ok(depth >= 0); };
  for (const method of methods) h.context[method] = (...args) => {
    for (const value of args) if (typeof value === 'number') assert.ok(Number.isFinite(value), `${method} received a non-finite coordinate`);
    operations.push([method, ...args]);
  };
  for (const map of g.constructor.MAPS) {
    g.start(map.id); g.enemies.length = 0;
    for (const type of Object.keys(g._templates)) g._spawnEnemy(type);
    g._spawnBoss(g._bossStages[0]);
    for (const enemy of g.enemies) {
      assert.equal(enemy.mapId, map.id);
      assert.ok(enemy.appearance && !appearances.has(enemy.appearance), 'Each map needs its own artwork');
      appearances.add(enemy.appearance);
      const saved = JSON.stringify(enemy); operations = [];
      g._drawEnemy(h.context, { ...enemy, x:0, y:0, phase:0 });
      drawings.add(JSON.stringify(operations));
      for (const clock of [0.2,1,2.5]) {
        g._clock = clock;
        g._drawEnemy(h.context, { ...enemy, hit:0.12, hp:enemy.maxHp/2 });
      }
      assert.equal(JSON.stringify(enemy), saved, 'Drawing must not alter combat state');
      assert.equal(depth, 0, 'Every sprite must restore canvas transforms');
    }
  }
  assert.equal(appearances.size, mapIds.length * 7); assert.equal(drawings.size, mapIds.length * 7);
});
test('theme animations preserve combat randomness and base enemy balance on every map', () => {
  for (const map of mapIds) {
    const rendered = harness({seed:701}), idle = harness({seed:701});
    for (const h of [rendered,idle]) {
      h.game.start(map); h.game.enemies.length = 0;
      for (const type of Object.keys(h.game._templates)) h.game._spawnEnemy(type);
      h.game._spawnBoss(h.game._bossStages[0]);
    }
    for (let frame=0;frame<60;frame++) {
      rendered.game._clock = frame/30;
      for (const enemy of rendered.game.enemies) rendered.game._drawEnemy(rendered.context,enemy);
    }
    for (const h of [rendered,idle]) for (let i=0;i<20;i++) h.game._spawnEnemy();
    assert.equal(JSON.stringify(rendered.game.enemies), JSON.stringify(idle.game.enemies), `${map}: rendering must not change spawns, HP, damage, speed, positions or rewards`);
    for (const enemy of rendered.game.enemies.filter(e=>!e.boss)) {
      const base = rendered.game._templates[enemy.type];
      for (const key of ['hp','radius','speed','damage','xp']) assert.equal(enemy[key],base[key], `${map}: cosmetic variants retain ${key}`);
    }
  }
});

test('the Online client mirrors the server snapshot instead of simulating the match', () => {
  const h = harness();
  const arena = h.sandbox.VesperArena;
  const socket = h.online({ name: 'Guino', skin: 'orc' });
  assert.equal(socket.url, 'ws://teste:1');
  assert.deepEqual({ ...socket.sent[0] }, { t: 'join', name: 'Guino', skin: 'orc', token: '' });
  assert.equal(h.game.state, 'playing');
  assert.equal(h.game.onlineActive, true);
  assert.equal(h.game.fighters.length, 3);
  assert.equal(h.game.me.name, 'Guino');
  assert.equal(h.game.me.skin, 'orc');
  assert.equal(h.events.joined.at(-1).humans, 2);
  assert.equal(h.events.joined.at(-1).bots, 1);
  h.snapshot(socket, [
    [1, 300, -200, 0.5, 4, 210, 300, 3, 1, 0, 12],
    [2, -500, 400, 1.2, 9, 100, 500, 7, 1, 0, 5],
    [3, 800, 900, 0, 2, 0, 220, 1, 0, 2.5, 0]
  ], { remaining: 244 });
  const me = h.game.me;
  assert.equal(me.level, 4);
  assert.equal(me.maxHp, 300);
  assert.equal(me.kills, 3);
  close(h.game.matchRemaining, 244, 1e-6, 'relogio do servidor');
  const dead = h.game.fighters.find(fighter => fighter.id === 3);
  assert.equal(dead.alive, false);
  close(dead.respawn, 2.5, 1e-6, 'renascimento');
  assert.equal(h.game.fighters.find(fighter => fighter.id === 2).level, 9);
  for (const method of ['_onlineHurt', '_onlineKill', '_updateOnlineBot', '_onlineGrantXp', '_onlineFire']) {
    assert.equal(typeof h.game[method], 'undefined', method + ' saiu do cliente');
  }
  h.game._emitOnlineHud();
  const hud = h.events.hud.at(-1);
  assert.equal(hud.online, true);
  assert.equal(hud.humans, 2);
  assert.equal(hud.bots, 1);
  assert.equal(hud.leaderboard[0].bot, true, 'O ranking marca quem e bot');
});
test('the client predicts its own movement and accepts the server correction', () => {
  const h = harness({ width: 1200, height: 800 });
  const arena = h.sandbox.VesperArena;
  const socket = h.online();
  const me = h.game.me;
  h.snapshot(socket, [[1, 0, 0, 0, 1, 180, 180, 0, 1, 0, 0]]);
  me.x = 0; me.y = 0;
  h.game.setMovement(1, 0);
  h.game._updateOnline(0.06);
  assert.ok(me.x > 8, 'A predicao local anda na hora, sem esperar o servidor');
  assert.ok(me.x < arena.CONFIG.speed * 0.06 + 1, 'E nunca anda mais que a velocidade do servidor');
  h.snapshot(socket, [[1, 900, 0, 0, 1, 180, 180, 0, 1, 0, 0]]);
  h.game._updateOnline(0.016);
  assert.equal(me.x, 900, 'Divergencia grande e corrigida de uma vez');
  h.snapshot(socket, [[1, 906, 0, 0, 1, 180, 180, 0, 1, 0, 0]]);
  h.game.setMovement(0, 0);
  h.game._updateOnline(0.1);
  assert.ok(me.x > 900 && me.x <= 906, 'Divergencia pequena entra suave');
  const input = socket.sent.filter(message => message.t === 'in');
  assert.ok(input.length > 0, 'O cliente manda a entrada para o servidor');
  assert.ok(input.every(message => Math.hypot(message.x, message.y) <= 1.001));
});
test('server events drive feed, damage numbers, level up and crates on the client', () => {
  const h = harness();
  const socket = h.online();
  h.snapshot(socket, [
    [1, 0, 0, 0, 1, 180, 180, 0, 1, 0, 0],
    [2, 100, 0, 0, 1, 180, 180, 0, 1, 0, 0]
  ], { events: [
    { e: 'shot', id: 2, x: 100, y: 0, a: 3.14, s: 620, t: 1, p: 0 },
    { e: 'hit', id: 1, by: 2, damage: 18 },
    { e: 'kill', id: 2, by: 1 },
    { e: 'level', id: 1, level: 3 },
    { e: 'crate', index: 0, by: 1 }
  ] });
  assert.equal(h.game.shots.length, 1, 'O tiro do servidor vira bala visivel');
  assert.ok(h.game.numbers.some(number => number.text === '18'), 'O dano aparece na tela');
  assert.equal(h.game.me.level, 3);
  assert.equal(h.game.crates[0].broken, true);
  assert.ok(h.game.feed.some(line => line.includes('eliminou')), 'O aviso de abate entra no feed');
  h.game._updateOnline(1);
  assert.equal(h.game.shots.length, 0, 'A bala some depois do tempo de voo');
  socket.deliver({ t: 's', k: 2, r: 100, f: [[1, 0, 0, 0, 3, 260, 260, 1, 1, 0, 0]], c: [1], e: [{ e: 'crate', index: 0, x: 500, y: 500 }] });
  assert.equal(h.game.crates[0].broken, false);
  assert.equal(h.game.crates[0].x, 500);
});
test('the client shows the final ranking from the server and banks the coins', () => {
  const h = harness();
  const socket = h.online();
  socket.deliver({ t: 'over', room: 7, ranking: [
    { rank: 1, id: 1, name: 'Guino', level: 9, kills: 8, deaths: 2, bot: false, coins: 120 },
    { rank: 2, id: 2, name: 'Ashley', level: 7, kills: 5, deaths: 4, bot: true, coins: 60 }
  ] });
  assert.equal(h.game.state, 'results');
  const results = h.game.onlineResults;
  assert.equal(results.you.rank, 1);
  assert.equal(results.coins, 120);
  assert.equal(results.humans, 1);
  assert.equal(results.bots, 1);
  assert.equal(h.events.results.at(-1).coins, 120);
  assert.equal(h.sandbox.VesperGame.OnlineProfile.load().coins, 120, 'As moedas ficam guardadas');
});
test('a broken connection returns to the menu with a reason', () => {
  const h = harness();
  h.game.startOnline({ name: 'Guino', skin: 'alien', server: 'ws://teste:1' });
  const socket = h.sockets.at(-1);
  socket.open();
  socket.fail();
  assert.equal(h.game.state, 'menu');
  assert.equal(h.game.onlineActive, false);
  assert.equal(h.events.errors.at(-1), 'conexao');
  const second = harness();
  const live = second.online();
  live.close();
  assert.equal(second.game.state, 'menu');
  assert.equal(second.events.errors.at(-1), 'queda');
});
test('the server address accepts short forms and falls back to the page origin', () => {
  const online = harness().sandbox.VesperGame.ONLINE;
  assert.equal(online.normalizeServer('meu-servidor.com:9000'), 'ws://meu-servidor.com:9000');
  assert.equal(online.normalizeServer('http://192.168.0.7:8080/'), 'ws://192.168.0.7:8080');
  assert.equal(online.normalizeServer('https://vesper.exemplo.com'), 'wss://vesper.exemplo.com');
  assert.equal(online.normalizeServer('ws://127.0.0.1:8080'), 'ws://127.0.0.1:8080');
  assert.equal(online.normalizeServer('   '), '');
  assert.equal(online.defaultServer(), 'ws://127.0.0.1:8080');
});
test('ten single shot weapons carry their own art in the fighter hand', () => {
  const h = harness();
  const arena = h.sandbox.VesperArena;
  assert.ok(arena.WEAPONS.every(weapon => weapon.projectiles === 1), 'Nenhuma arma dispara mais de um tiro');
  assert.equal(new Set(arena.WEAPONS.map(weapon => weapon.name)).size, 10);
  const socket = h.online();
  const me = h.game.me;
  const drawings = new Set();
  let operations = [];
  let depth = 0;
  const context = h.context;
  context.save = () => { depth++; };
  context.restore = () => { depth--; };
  for (const method of ['fillRect', 'beginPath', 'moveTo', 'lineTo', 'ellipse', 'fill', 'stroke', 'closePath', 'translate', 'rotate', 'scale']) {
    context[method] = (...args) => {
      for (const value of args) if (typeof value === 'number' && !Number.isFinite(value)) throw new Error(method + ' recebeu valor invalido');
      operations.push([method, ...args]);
    };
  }
  for (let level = 1; level <= 10; level++) {
    me.level = level;
    operations = [];
    h.game._drawFighterWeapon(context, me);
    assert.ok(operations.length > 6, 'A arma do nivel ' + level + ' tem desenho proprio');
    drawings.add(JSON.stringify(operations));
    assert.equal(depth, 0);
  }
  assert.equal(drawings.size, 10, 'Os dez desenhos sao diferentes');
  me.level = 9;
  me.aim = Math.PI;
  operations = [];
  h.game._drawFighterWeapon(context, me);
  assert.ok(operations.some(([method, x, y]) => method === 'scale' && x === 1 && y === -1), 'Arma espelhada ao mirar para a esquerda');
  h.game.drawOnlineWeapon({ width: 168, height: 60, getContext: () => context }, 7);
  assert.equal(depth, 0);
  assert.ok(socket.sent.length > 0);
});
test('every Online skin keeps its own skill and price in the shared arena core', () => {
  const arena = harness().sandbox.VesperArena;
  assert.deepEqual(Array.from(arena.SKINS, skin => skin.id),
    ['alien', 'spider', 'skeleton', 'orc', 'invisible', 'cyborg', 'plague', 'frankenstein']);
  assert.deepEqual(Array.from(arena.SKINS, skin => skin.price), [0, 150, 220, 300, 380, 450, 520, 600]);
  assert.deepEqual({ ...arena.bonusOf('alien') }, { damage: 1, cadence: 1, speed: 1, projectile: 0, poison: 0 });
  close(arena.bonusOf('spider').cadence, 1.1, 1e-9, 'aranha');
  close(arena.bonusOf('skeleton').cadence, 1.15, 1e-9, 'esqueleto');
  close(arena.bonusOf('orc').damage, 1.2, 1e-9, 'orc');
  close(arena.bonusOf('invisible').speed, 1.25, 1e-9, 'homem invisivel');
  close(arena.bonusOf('frankenstein').damage, 1.3, 1e-9, 'frankenstein');
  assert.equal(arena.bonusOf('cyborg').projectile, 1);
  assert.ok(arena.bonusOf('plague').poison > 0);
  const match = new arena.Arena();
  const cyborg = match.join({ name: 'C', skin: 'cyborg' });
  const plain = match.join({ name: 'A', skin: 'alien' });
  match.shots.length = 0;
  match.fire(cyborg);
  const withSkill = match.shots.length;
  match.shots.length = 0;
  match.fire(plain);
  assert.equal(withSkill, match.shots.length + 1, 'O cyborg lanca um projetil a mais');
  const orc = match.join({ name: 'O', skin: 'orc' });
  match.shots.length = 0;
  match.fire(orc);
  const orcDamage = match.shots[0].damage;
  match.shots.length = 0;
  match.fire(plain);
  close(orcDamage, match.shots[0].damage * 1.2, 1e-6, 'dano do orc');
});
test('Online skins stay in the Online mode and campaign heroes stay in the campaign', () => {
  const h = harness();
  const roster = Array.from(h.game.constructor.CHARACTERS);
  const skins = roster.filter(character => character.unlockType === 'coins').map(character => character.id);
  const heroes = roster.filter(character => character.unlockType !== 'coins').map(character => character.id);
  h.game.setCharacter('ghost');
  const socket = h.online({ skin: 'frankenstein' });
  assert.equal(h.game.character, 'frankenstein');
  assert.equal(h.game.setCharacter('vampire'), false, 'Heroi da campanha nao entra na arena');
  h.game.leaveOnline();
  assert.equal(h.game.character, 'ghost', 'A campanha recupera o personagem escolhido');
  assert.equal(h.game.setCharacter('orc'), false, 'Skin paga nao entra na campanha');
  assert.equal(socket.readyState, 3, 'O socket fecha ao sair');
  const ui = uiHarness({ 'vesper.online.v1': JSON.stringify({ version: 2, coins: 9000, owned: skins, skin: 'orc', name: 'Guino' }) });
  ui.nodes.get('characters-btn').fire('click');
  assert.deepEqual(ui.nodes.get('character-grid').children.map(card => card.dataset.characterId), heroes);
  for (const skin of skins) {
    const card = ui.nodes.get('coin-grid').children.find(item => item.dataset.characterId === skin);
    card.fire('click');
    assert.equal(ui.game.character, 'human', 'Usar uma skin do Online nao troca o personagem da campanha');
  }
});
test('Online coins buy skins in the shop and the chosen skin enters the match', () => {
  const wallet = JSON.stringify({ version: 2, coins: 400, owned: ['alien'], skin: 'alien', name: '', server: '' });
  const ui = uiHarness({ 'vesper.online.v1': wallet });
  ui.nodes.get('characters-btn').fire('click');
  const cards = ui.nodes.get('coin-grid').children;
  const orc = cards.find(card => card.dataset.characterId === 'orc');
  const cyborg = cards.find(card => card.dataset.characterId === 'cyborg');
  orc.fire('click');
  assert.ok(!orc.classList.contains('is-locked'), 'A skin comprada destrava');
  assert.ok(orc.classList.contains('is-using'));
  assert.equal(JSON.parse(ui.stored['vesper.online.v1']).coins, 100);
  cyborg.fire('click');
  assert.ok(cyborg.classList.contains('is-locked'), 'Sem moedas a skin continua travada');
  ui.nodes.get('online-btn').fire('click');
  assert.equal(ui.nodes.get('online-skin-name').textContent, 'Orc');
  ui.nodes.get('online-name').value = 'G';
  ui.nodes.get('online-form').fire('submit');
  assert.equal(ui.nodes.get('online-error').hidden, false);
  ui.nodes.get('online-name').value = 'Guino';
  ui.nodes.get('online-server').value = '192.168.0.10:8080';
  ui.nodes.get('online-form').fire('submit');
  assert.equal(ui.nodes.get('online-loading-view').hidden, false);
  assert.deepEqual({ ...ui.game.onlineOptions }, { name: 'Guino', skin: 'orc', server: '192.168.0.10:8080' });
  assert.equal(ui.nodes.get('online-loading-server').textContent, 'ws://192.168.0.10:8080');
  assert.equal(JSON.parse(ui.stored['vesper.online.v1']).server, '192.168.0.10:8080');
  assert.equal(ui.game.state, 'playing');
});
test('the Online HUD separates humans from bots and fires on the space bar', () => {
  const ui = uiHarness();
  ui.nodes.get('online-btn').fire('click');
  ui.nodes.get('online-name').value = 'Guino';
  ui.nodes.get('online-form').fire('submit');
  const hud = respawn => ({
    online: true, hp: 210, maxHp: 300, xp: 5, nextXp: 35, level: 4, kills: 4, elapsed: 120,
    remaining: 120, weapon: 'Escopeta', weaponTier: 4, bosses: [], mapName: 'Catedral em Ruínas',
    players: 15, humans: 3, bots: 12, alive: 13, respawn, rank: 2, stageBossStatus: 'Servidor #3',
    leaderboard: [
      { rank: 1, name: 'Ashley', level: 6, kills: 6, you: false, bot: true },
      { rank: 2, name: 'Guino', level: 4, kills: 4, you: true, bot: false }
    ],
    feed: ['Guino eliminou Ashley']
  });
  ui.game.callbacks.onHud(hud(0));
  assert.equal(ui.nodes.get('online-hud').hidden, false);
  assert.equal(ui.nodes.get('online-weapon').textContent, 'Escopeta');
  assert.equal(ui.nodes.get('online-board-count').textContent, '3H · 12B');
  assert.equal(ui.nodes.get('timer').textContent, '02:00');
  const rows = ui.nodes.get('online-board-list').children;
  assert.equal(rows[0].children[1].textContent, 'Ashley [BOT]');
  assert.equal(rows[0].className, 'is-bot');
  assert.equal(rows[1].className, 'is-you');
  ui.browser.fire('keydown', { code: 'Space' });
  assert.equal(ui.game.firing, true);
  ui.browser.fire('keyup', { code: 'Space' });
  assert.equal(ui.game.firing, false);
  ui.game.callbacks.onHud(hud(2.4));
  assert.equal(ui.nodes.get('online-respawn').hidden, false);
  assert.equal(ui.nodes.get('online-respawn-time').textContent, 3);
  ui.game.callbacks.onHud({ hp: 1, maxHp: 1, xp: 0, nextXp: 1, level: 1, kills: 0, elapsed: 0, bosses: [] });
  assert.equal(ui.nodes.get('online-hud').hidden, true);
});
test('the final ranking screen pays the coins, marks bots and starts another match', () => {
  const ui = uiHarness({ 'vesper.online.v1': JSON.stringify({ version: 2, coins: 70, owned: ['alien'], skin: 'alien', name: 'Guino', server: '' }) });
  ui.nodes.get('online-btn').fire('click');
  ui.nodes.get('online-name').value = 'Guino';
  ui.nodes.get('online-form').fire('submit');
  assert.equal(ui.nodes.get('pause-restart-btn').hidden, true);
  const you = { rank: 1, name: 'Guino', level: 9, kills: 11, you: true, bot: false };
  ui.game.callbacks.onOnlineResults({
    server: 3, players: 15, coins: 96, balance: 166, humans: 3, bots: 12, you,
    ranking: [you, { rank: 2, name: 'Ashley', level: 8, kills: 9, you: false, bot: true }]
  });
  ui.game.state = 'results';
  ui.game.callbacks.onState('results');
  assert.equal(ui.nodes.get('online-results-overlay').hidden, false);
  const rows = ui.nodes.get('online-results-list').children;
  assert.equal(rows.length, 2);
  assert.ok(rows[0].className.includes('is-you'));
  assert.ok(rows[1].className.includes('is-bot'));
  assert.equal(rows[1].children[1].textContent, 'Ashley [BOT]');
  assert.ok(ui.nodes.get('online-results-server').textContent.includes('3 humanos'));
  assert.ok(ui.nodes.get('online-results-reward').children[0].textContent.startsWith('+96'));
  ui.nodes.get('online-again-btn').fire('click');
  assert.equal(ui.game.onlineStarts, 2, 'Jogar novamente entra em outra partida');
  ui.nodes.get('online-menu-btn').fire('click');
  assert.equal(ui.game.state, 'menu');
});
test('a connection opened before the first animation frame keeps the loop alive', () => {
  const h = harness();
  assert.equal(h.game._view, undefined);
  const socket = h.online();
  h.game.drawMinimap({ width: 174, height: 131, getContext: () => h.context });
  h.game._draw();
  h.frame();
  h.frame(1000 / 60);
  assert.equal(h.game.state, 'playing');
  assert.equal(h.raf.size, 1, 'O laco continua pedindo quadros');
  assert.ok(socket.sent.some(message => message.t === 'in'), 'A entrada comeca a ser enviada');
});
test('the arena draws its own scenario and minimap without corrupting canvas state', () => {
  const h = harness();
  let depth = 0;
  const context = h.context;
  context.save = () => { depth++; };
  context.restore = () => { depth--; };
  const socket = h.online();
  h.snapshot(socket, [
    [1, 0, 0, 0.4, 5, 300, 340, 2, 1, 0, 3],
    [2, 60, 40, 1, 3, 200, 260, 1, 1, 0, 1],
    [3, -80, 30, 2, 7, 300, 420, 4, 1, 0, 2]
  ], { events: [{ e: 'shot', id: 2, x: 60, y: 40, a: 0.2, s: 700, t: 5, p: 0 }] });
  for (const clock of [0, 0.5, 2.2]) {
    h.game._clock = clock;
    h.game._draw();
    assert.equal(depth, 0, 'Todo desenho devolve as transformacoes');
  }
  h.game.drawMinimap({ width: 174, height: 131, getContext: () => context });
  assert.equal(depth, 0);
  assert.ok(h.game._getArenaFeatures().length > 30, 'A catedral em ruinas tem cenario proprio');
  assert.equal(h.game.mapDefinition.name, 'Catedral em Ruínas');
  const drawn = new Set();
  const original = h.game._drawCharacter.bind(h.game);
  h.game._drawCharacter = (ctx, id, steps) => { drawn.add(id); original(ctx, id, steps); };
  h.game._draw();
  assert.ok(drawn.size >= 3, 'Cada lutador aparece com a sua skin');
  assert.equal(depth, 0);
});
test('the client refuses a room that does not list the player instead of crashing', () => {
  const h = harness();
  h.game.startOnline({ name: 'Guino', skin: 'alien', server: 'ws://teste:1' });
  const socket = h.sockets.at(-1);
  socket.open();
  socket.deliver({ t: 'joined', id: 99, room: 1, capacity: 15, remaining: 300, token: 'x', roster: [{ id: 1, name: 'Outro', skin: 'alien', bot: true }], crates: [] });
  assert.equal(h.game.state, 'menu');
  assert.equal(h.game.onlineActive, false);
  assert.equal(h.events.errors.at(-1), 'sala');
  h.game._draw();
  h.frame();
  assert.equal(h.raf.size, 1, 'O laco de desenho continua vivo depois da recusa');
});

test('the results screen survives a room that closes right after the match', () => {
  const h = harness();
  const socket = h.online();
  socket.deliver({ t: 'over', room: 7, ranking: [{ rank: 1, id: 1, name: 'Guino', level: 5, kills: 3, deaths: 1, bot: false, coins: 80 }] });
  assert.equal(h.game.state, 'results');
  socket.deliver({ t: 'closed' });
  assert.equal(h.game.state, 'results', 'O resumo da partida fica na tela');
  h.snapshot(socket, [[1, 10, 10, 0, 5, 100, 340, 3, 1, 0, 0]]);
  assert.equal(h.game.state, 'results');
  assert.equal(h.game.onlineResults.coins, 80);
});

test('an error after joining does not throw the player out of a running match', () => {
  const h = harness();
  const socket = h.online();
  socket.deliver({ t: 'error', reason: 'rate' });
  assert.equal(h.game.state, 'playing', 'Erro no meio da partida nao encerra a partida');
  assert.equal(h.events.errors.length, 0);
  const other = harness();
  other.game.startOnline({ name: 'Guino', skin: 'alien', server: 'ws://teste:1' });
  const fresh = other.sockets.at(-1);
  fresh.open();
  fresh.deliver({ t: 'error', reason: 'full' });
  assert.equal(other.events.errors.at(-1), 'full', 'Erro antes de entrar avisa o jogador');
});

test('losing the player in a snapshot leaves the match instead of drawing dead data', () => {
  const h = harness();
  const socket = h.online();
  h.snapshot(socket, [[2, 0, 0, 0, 1, 180, 180, 0, 1, 0, 0]]);
  assert.equal(h.game.state, 'menu');
  assert.equal(h.events.errors.at(-1), 'sala');
});

test('the reconnection token is remembered per server address', () => {
  const h = harness();
  const first = h.online();
  h.game.leaveOnline();
  h.game.startOnline({ name: 'Guino', skin: 'alien', server: 'ws://outro:2' });
  const second = h.sockets.at(-1);
  second.open();
  assert.equal(second.sent[0].token, '', 'Servidor novo nao recebe o token do servidor antigo');
  h.game.leaveOnline();
  h.game.startOnline({ name: 'Guino', skin: 'alien', server: 'ws://teste:1' });
  const back = h.sockets.at(-1);
  back.open();
  assert.equal(back.sent[0].token, 'abc', 'O mesmo servidor recebe o token guardado');
  assert.ok(first.sent.length > 0);
});

test('walking keeps predicting under latency instead of snapping every packet', () => {
  const h = harness({ width: 1200, height: 800 });
  const arena = h.sandbox.VesperArena;
  const socket = h.online();
  assert.ok(arena.CONFIG.snapDistance >= 400, 'O limiar de correcao aguenta latencia comum');
  h.snapshot(socket, [[1, 0, 0, 0, 1, 180, 180, 0, 1, 0, 0]]);
  h.game.me.x = 0;
  h.game.setMovement(1, 0);
  for (let i = 0; i < 10; i++) h.game._updateOnline(0.016);
  const predicted = h.game.me.x;
  h.snapshot(socket, [[1, 20, 0, 0, 1, 180, 180, 0, 1, 0, 0]]);
  h.game._updateOnline(0.016);
  assert.ok(Math.abs(h.game.me.x - predicted) < 6, 'A correcao entra suave, sem teleporte');
});

test('the input goes out the moment the direction changes, including the stop', () => {
  const h = harness();
  const socket = h.online();
  const before = socket.sent.filter(message => message.t === 'in').length;
  h.game.setMovement(1, 0);
  const moving = socket.sent.filter(message => message.t === 'in');
  assert.equal(moving.length, before + 1, 'Mudar de direcao envia na hora');
  h.game.setMovement(0, 0);
  const stopped = socket.sent.filter(message => message.t === 'in');
  assert.equal(stopped.length, before + 2);
  assert.deepEqual({ x: stopped.at(-1).x, y: stopped.at(-1).y }, { x: 0, y: 0 }, 'A parada tambem e avisada');
});

if (isMain) process.on('beforeExit', () => {
  process.stdout.write(`\n${passed} passed; ${failures.length} failed.\n`);
  if (failures.length) process.exitCode = 1;
});
module.exports = { harness };