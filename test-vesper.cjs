/* Run: node test-vesper.cjs
   Deterministic headless checks for the actual engine. No external dependencies. */
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
  const events = { states: [], hud: [], levels: [], over: [], victories: [] };
  const sandbox = {
    console, Math: seededMath,
    devicePixelRatio: dpr, innerWidth: width, innerHeight: height,
    performance: { now: () => now },
    requestAnimationFrame: fn => { const id = ++rafId; raf.set(id, fn); return id; },
    cancelAnimationFrame: id => raf.delete(id),
    setTimeout, clearTimeout,
    matchMedia: () => ({ matches: false, addEventListener() {} }),
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
  const Game = sandbox.VesperGame || vm.runInContext('VesperGame', sandbox);
  const game = new Game(canvas, {
    onState: state => events.states.push(state),
    onHud: data => events.hud.push({ ...data }),
    onLevelUp: choices => events.levels.push(choices.map(choice => ({ ...choice }))),
    onGameOver: data => events.over.push({ ...data }),
    onVictory: data => events.victories.push({ ...data })
  });
  const frame = (milliseconds = 1000 / 60) => {
    now += milliseconds;
    const callbacks = [...raf.values()];
    raf.clear();
    for (const callback of callbacks) callback(now);
  };
  return { game, events, canvas, box, sandbox, raf, frame, context };
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
  for (const name of ['engine', 'characters', 'ui']) {
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

const mapIds = ['castle', 'egypt', 'swamp', 'halloween'];
const mapReward = { castle: 'vampire', egypt: 'mummy', swamp: 'zombie', halloween: 'jack' };
function within(entity, bounds, radius = entity.radius || 0) {
  assert.ok(entity.x >= bounds.left + radius - 1e-7 && entity.x <= bounds.right - radius + 1e-7, `x=${entity.x} outside world`);
  assert.ok(entity.y >= bounds.top + radius - 1e-7 && entity.y <= bounds.bottom - radius + 1e-7, `y=${entity.y} outside world`);
}

test('four selectable finite maps have stable identities and safe map changes', () => {
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
  assert.equal(game.mapId, 'halloween');
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
  // Deliberately large direct simulation step verifies the collision segment;
  // the production RAF additionally limits dt to 0.05 seconds.
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
  let frameId = 0;
  doc = new Element('document');
  doc.getElementById = id => nodes.get(id);
  doc.createElement = tag => Object.assign(new Element(), { tag });
  doc.querySelector = () => null;
  doc.documentElement = new Element('html');
  doc.activeElement = null;
  const ui = { nodes, doc, microtasks, frames, stored, game: null };
  class FakeGame {
    constructor(canvas, callbacks) { ui.game = this; this.callbacks = callbacks; this.state = 'menu'; this.moves = []; this.level = 1; this.elapsed = 0; this.previews = []; this.character = null; this.mapId = 'castle'; }
    setMovement(x, y) { this.moves.push({ x, y }); }
    setMuted() {}
    resize() {}
    setCharacter(id) { this.character = id; return true; }
    setMap(id) { this.mapId = id; return true; }
    get mapDefinition() { return FakeGame.MAPS.find(map => map.id === this.mapId); }
    drawCharacterPreview(canvas, id, locked) { this.previews.push({ id, locked, size: canvas.width }); }
    drawMapPreview() {}
    drawMinimap() {}
    start(id) { if(id)this.mapId=id; this.starts = (this.starts || 0) + 1; this.state = 'playing'; this.callbacks.onState(this.state); }
    pause() { this.state = 'paused'; this.callbacks.onState(this.state); }
    resume() { this.state = 'playing'; this.callbacks.onState(this.state); }
    toMenu() { this.state = 'menu'; this.elapsed = 0; this.callbacks.onState(this.state); }
    chooseUpgrade(id) { this.chosen = id; this.state = 'playing'; this.callbacks.onState(this.state); }
  }
  // The UI reads the real engine's roster, so thresholds cannot drift between modules.
  FakeGame.CHARACTERS = harness().game.constructor.CHARACTERS;
  FakeGame.MAPS = harness().game.constructor.MAPS;
  const browser = new Element('window');
  ui.browser = browser;
  const sandbox = {
    window: browser, document: doc, HTMLElement: Element, VesperGame: FakeGame,
    ResizeObserver: class { observe() {} },
    localStorage: { getItem: key => { if(blocked)throw new Error('Storage unavailable'); return key in stored ? stored[key] : null; }, setItem: (key, value) => { if(blocked)throw new Error('Storage unavailable'); stored[key] = String(value); } },
    queueMicrotask: callback => microtasks.push(callback),
    requestAnimationFrame: callback => { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame: id => frames.delete(id),
    setTimeout: () => 1, clearTimeout() {}, console
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'vesper-ui.js'), 'utf8'), sandbox, { filename: 'vesper-ui.js' });
  return ui;
}

test('real UI handles keyboard/touch and independently maintains all live boss health bars', () => {
  const { nodes, browser, microtasks, ...ui } = uiHarness();
  const game = ui.game;
  nodes.get('start-btn').fire('click');
  nodes.get('map-grid').children[0].fire('click');
  assert.equal(game.state, 'playing');
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
  assert.equal(n.get('map-grid').children.length, 4);
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
    assert.equal(ui.game.mapId, card.dataset.mapId);
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

test('campaign starts with three free heroes and legacy records cannot unlock any reward or coin skin', () => {
  for (const selected of ['alien', 'vampire', 'skeleton', 'unknown']) {
    const ui = uiHarness({ 'vesper.best.v1': '999999', 'vesper.character.v1': selected });
    ui.nodes.get('characters-btn').fire('click');
    const earned = ui.nodes.get('character-grid').children, coins = ui.nodes.get('coin-grid').children;
    assert.equal(earned.length, 8); assert.equal(coins.length, 4);
    assert.deepEqual(earned.filter(card => !card.classList.contains('is-locked')).map(card => card.dataset.characterId), ['human','ghost','hooded']);
    assert.equal(ui.game.character, 'human');
    for (const card of coins) { assert.equal(card.getAttribute('aria-disabled'), 'true'); card.fire('click'); assert.equal(ui.game.character, 'human'); }
    assert.equal(ui.nodes.get('characters-new').hidden, true);
  }
});

test('each campaign victory persists only its own reward; fourth victory grants survivor and gold frames', () => {
  const stored = {}, ui = uiHarness(stored), n = ui.nodes;
  const rewards = ['vampire','mummy','zombie','jack'];
  for (const [index, id] of ['castle','egypt','swamp','halloween'].entries()) {
    n.get('start-btn').fire('click');
    n.get('map-grid').children.find(card => card.dataset.mapId === id).fire('click');
    ui.game.state = 'victory'; ui.game.callbacks.onState('victory');
    ui.game.callbacks.onVictory({ mapId:id, elapsed:265, kills:300, level:12, bossKills:2 });
    assert.equal(n.get('victory-overlay').hidden, false);
    assert.equal(n.get('victory-unlocks').children.length, index === 3 ? 2 : 1);
    assert.equal(JSON.parse(stored['vesper.progress.v2']).completedMaps.length, index + 1);
    n.get('victory-characters-btn').fire('click');
    const cards = n.get('character-grid').children;
    for (const [rewardIndex, reward] of rewards.entries()) {
      const card = cards.find(card => card.dataset.characterId === reward);
      assert.equal(card.classList.contains('is-earned'), rewardIndex <= index);
      assert.equal(card.getAttribute('aria-disabled'), String(rewardIndex > index));
    }
    assert.equal(cards.find(card => card.dataset.characterId === 'survivor').classList.contains('is-earned'), index === 3);
    for (const card of n.get('coin-grid').children) assert.equal(card.getAttribute('aria-disabled'), 'true');
    n.get('characters-back-btn').fire('click');
    assert.equal(n.get('map-grid').children.filter(card => card.classList.contains('is-completed')).length, index + 1);
    n.get('maps-back-btn').fire('click');
  }
  const reload = uiHarness(stored); reload.nodes.get('characters-btn').fire('click');
  assert.equal(reload.nodes.get('character-grid').children.filter(card => card.classList.contains('is-earned')).length, 5);
  const survivor = reload.nodes.get('character-grid').children.find(card => card.dataset.characterId === 'survivor');
  survivor.fire('click'); assert.equal(stored['vesper.character.v1'], 'survivor');
  assert.equal(uiHarness(stored).game.character, 'survivor', 'Earned selection survives reload');
  reload.game.callbacks.onVictory({mapId:'halloween',elapsed:300,kills:400,level:14});
  assert.equal(JSON.parse(stored['vesper.progress.v2']).completedMaps.length, 4, 'Repeat clears never duplicate progression');
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

if (isMain) process.on('beforeExit', () => {
  process.stdout.write(`\n${passed} passed; ${failures.length} failed.\n`);
  if (failures.length) process.exitCode = 1;
});

module.exports = { harness };
