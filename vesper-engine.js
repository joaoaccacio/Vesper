class VesperGame {
  constructor(canvas, callbacks = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.callbacks = callbacks;
    this._state = 'menu';
    this._movement = { x: 0, y: 0 };
    this._accessories = [];
    this._muted = false;
    this._audio = null;
    this._clock = 0;
    this._lastFrame = 0;
    this._hudTimer = 0;
    this._entityId = 0;
    this._shake = 0;
    this._options = [];
    this._limits = { enemies: 190, projectiles: 150, gems: 260, particles: 210, numbers: 32 };
    this._templates = {
      shade: { hp: 22, radius: 16, speed: 65 * 1.18, damage: 9, xp: 3 },
      bat: { hp: 16, radius: 12, speed: 102 * 1.18, damage: 7, xp: 3 },
      brute: { hp: 84, radius: 25, speed: 46 * 1.18, damage: 17, xp: 9 },
      crawler: { hp: 12, radius: 11, speed: 114 * 1.18, damage: 6, xp: 2 },
      skeleton: { hp: 34, radius: 17, speed: 73 * 1.18, damage: 11, xp: 4 },
      wraith: { hp: 26, radius: 15, speed: 105 * 1.18, damage: 9, xp: 4 }
    };
    this._bossHealth = { boss: 3, superBoss: 3 };
    this._difficultyId = 'medium';
    this._reducedMotion = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    this._character = 'human';
    this._mapId = 'castle';
    this._mapTileCache = new Map();
    this._mapOverviewCache = new Map();
    this._mapFeatureCache = new Map();
    this._makeFloor();
    this._reset();
    this.resize();
    this._frame = this._frame.bind(this);
    this._raf = requestAnimationFrame(this._frame);
  }
  get state() { return this._state; }
  get character() { return this._character; }
  get mapId() { return this._mapId; }
  get difficultyId() { return this._difficultyId; }
  get difficultyDefinition() { return VesperGame.DIFFICULTIES.find(mode => mode.id === this._difficultyId) || VesperGame.DIFFICULTIES[1]; }
  get mapDefinition() { return VesperGame.MAPS.find(map => map.id === this._mapId); }
  get worldBounds() {
    const { width, height } = this.mapDefinition;
    return { left: -width / 2, right: width / 2, top: -height / 2, bottom: height / 2, width, height };
  }
  get bosses() { return this.enemies.filter(enemy => enemy.boss && !enemy.dead); }
  getBosses() {
    return this.bosses.map(({ id, name, hp, maxHp, superBoss, finalBoss, characterId }) => ({ id, name, hp: Math.max(0, hp), maxHp, superBoss, finalBoss, characterId }));
  }
  _reset() {
    this.player = {
      x: 0, y: 0, radius: 14, hp: 100, maxHp: 100, speed: 215, walk: 0,
      damage: 24, projectiles: 1, attackInterval: 0.64, pickup: 88,
      facing: 1, invulnerability: 0, steps: 0
    };
    this.enemies = [];
    this.projectiles = [];
    this.gems = [];
    this.particles = [];
    this.numbers = [];
    this.elapsed = 0;
    this.kills = 0;
    this.bossKills = 0;
    this._bossStages = [{ id: 'mini', at: 120, finalBoss: false }, { id: 'final', at: 240, finalBoss: true }];
    this._bossStageCursor = 0;
    this._stageDefeated = { mini: false, final: false };
    this.victoryData = null;
    this.level = 1;
    this.xp = 0;
    this.nextXp = 15;
    this.wave = 1;
    this.camera = { x: 0, y: 0 };
    this._spawnTimer = 0.1;
    this._attackTimer = 0.25;
    this._dustTimer = 0;
    this._hudTimer = 0;
    this._shake = 0;
    this._options = [];
    this._movement.x = this._movement.y = 0;
  }
  start(mapId = this.mapId, difficultyId = this.difficultyId) {
    if (!VesperGame.MAPS.some(map => map.id === mapId) || !VesperGame.DIFFICULTIES.some(mode => mode.id === difficultyId)) return false;
    this._mapId = mapId;
    this._difficultyId = difficultyId;
    this._reset();
    this._initAudio();
    this._setState('playing');
    for (let i = 0; i < 5; i++) this._spawnEnemy();
    this._emitHud();
    return true;
  }
  pause() {
    if (this._state !== 'playing') return;
    this.setMovement(0, 0);
    this._setState('paused');
  }
  resume() {
    if (this._state !== 'paused') return;

    this._initAudio();
    this._setState('playing');
  }
  toMenu() {
    this._reset();
    this._setState('menu');
  }
  setMap(id) {
    if (!['menu', 'victory', 'gameover'].includes(this._state) || !VesperGame.MAPS.some(map => map.id === id)) return false;
    this._mapId = id;
    this._clampEntity(this.player);
    this._clampCamera();
    return true;
  }
  setDifficulty(id) {
    if (!['menu', 'victory', 'gameover'].includes(this._state) || !VesperGame.DIFFICULTIES.some(mode => mode.id === id)) return false;
    this._difficultyId = id;
    return true;
  }
  _clampEntity(entity, padding = entity.radius || 0) {
    const bounds = this.worldBounds;
    const inset = padding + 24;
    entity.x = Math.max(bounds.left + inset, Math.min(bounds.right - inset, entity.x));
    entity.y = Math.max(bounds.top + inset, Math.min(bounds.bottom - inset, entity.y));
    return entity;
  }
  _clampCamera() {
    if (!this.camera || !this.width || !this.height) return;
    const bounds = this.worldBounds;
    this.camera.x = this.width >= bounds.width ? 0 : Math.max(bounds.left + this.width / 2, Math.min(bounds.right - this.width / 2, this.camera.x));
    this.camera.y = this.height >= bounds.height ? 0 : Math.max(bounds.top + this.height / 2, Math.min(bounds.bottom - this.height / 2, this.camera.y));
  }
  setCharacter(id) {
    if (!VesperGame.CHARACTERS.some(character => character.id === id)) return false;
    this._character = id;
    return true;
  }
  setAccessories(list) {
    this._accessories = Array.isArray(list) ? list.filter(id => typeof id === 'string') : [];
    return this._accessories.slice();
  }
  setMovement(x, y) {
    x = Number.isFinite(x) ? x : 0;
    y = Number.isFinite(y) ? y : 0;
    const length = Math.hypot(x, y);
    const divisor = Math.max(1, length);
    this._movement.x = x / divisor;
    this._movement.y = y / divisor;
  }
  setMuted(muted) {
    this._muted = Boolean(muted);
    if (this._master) this._master.gain.value = this._muted ? 0 : 0.12;
    if (!this._muted && this._audio) this._initAudio();
  }
  resize() {
    const bounds = this.canvas.getBoundingClientRect();
    const cssWidth = Math.max(1, bounds.width || window.innerWidth);
    const cssHeight = Math.max(1, bounds.height || window.innerHeight);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.scale = Math.min(1, cssWidth / 680);
    this.width = cssWidth / this.scale;
    this.height = cssHeight / this.scale;
    this.canvas.width = Math.round(cssWidth * this.dpr);
    this.canvas.height = Math.round(cssHeight * this.dpr);
    this._clampCamera();
  }
  _setState(state) {
    this._state = state;
    if (this.callbacks.onState) this.callbacks.onState(state);
  }
  _emitHud() {
    if (!this.callbacks.onHud) return;
    const p = this.player;
    this.callbacks.onHud({
      hp: Math.max(0, p.hp), maxHp: p.maxHp, xp: this.xp, nextXp: this.nextXp,
      level: this.level, kills: this.kills, elapsed: this.elapsed, wave: this.wave,
      damage: p.damage, projectiles: p.projectiles,
      attackInterval: p.attackInterval, speed: p.speed,
      bosses: this._state === 'victory' ? [] : this.getBosses(), bossKills: this.bossKills,
      mapId: this.mapId, mapName: this.mapDefinition.name,
      difficultyId: this.difficultyId, difficultyName: this.difficultyDefinition.name,
      stageBossStatus: this._stageDefeated.final ? 'Mapa concluído' : this._bossStageCursor > 1 ? 'Derrote o chefe final' : this._bossStageCursor === 0 ? 'Minichefe em 02:00' : this._stageDefeated.mini ? 'Chefe final em 04:00' : 'Derrote o minichefe'
    });
  }
  _frame(timestamp) {
    const dt = this._lastFrame ? Math.min(0.05, Math.max(0, (timestamp - this._lastFrame) / 1000)) : 0;
    this._lastFrame = timestamp;
    this._clock += dt;
    if (this._state === 'playing') this._update(dt);
    this._draw();
    this._raf = requestAnimationFrame(this._frame);
  }
  _update(dt) {
    if (this._state !== 'playing') return;
    const p = this.player;
    this.elapsed += dt;
    this.wave = 1 + Math.floor(this.elapsed / 30);
    this._scheduleBosses();
    p.invulnerability = Math.max(0, p.invulnerability - dt);
    p.x += this._movement.x * p.speed * dt;
    p.y += this._movement.y * p.speed * dt;
    this._clampEntity(p);
    if (Math.abs(this._movement.x) > 0.08) p.facing = this._movement.x > 0 ? 1 : -1;
    const movementAmount = Math.hypot(this._movement.x, this._movement.y);
    p.steps += movementAmount * dt * 10;
    p.walk += ((movementAmount > 0.08 ? 1 : 0) - p.walk) * Math.min(1, dt * 10);
    if (this._accessories.includes('mini')) this._followPet(p, dt);
    if (movementAmount > 0.08 && !this._reducedMotion) {
      this._dustTimer -= dt;
      if (this._dustTimer <= 0) {
        this._spawnStepDust();
        this._dustTimer = 0.13 + Math.random() * 0.05;
      }
    } else this._dustTimer = 0;
    this.camera.x += (p.x - this.camera.x) * Math.min(1, dt * 9);
    this.camera.y += (p.y - this.camera.y) * Math.min(1, dt * 9);
    this._clampCamera();
    this._spawnTimer -= dt;
    if (this._spawnTimer <= 0) {
      const count = Math.min(4, 1 + Math.floor((this.wave - 1) / 3));
      for (let i = 0; i < count; i++) this._spawnEnemy();
      this._spawnTimer = Math.max(0.23, 0.69 - (this.wave - 1) * 0.043) / 1.06 * this.difficultyDefinition.spawnInterval;
    }
    this._attackTimer -= dt;
    if (this._attackTimer <= 0 && this._shoot()) this._attackTimer = p.attackInterval;
    this._updateEnemies(dt);
    if (this._state !== 'playing') return;
    this._updateProjectiles(dt);
    if (this._state !== 'playing') return;
    this._updateGems(dt);
    this._updateEffects(dt);
    this._shake = Math.max(0, this._shake - dt * 22);
    this._hudTimer -= dt;
    if (this._hudTimer <= 0) {
      this._hudTimer = 0.08;
      this._emitHud();
    }
  }
  _spawnStepDust() {
    if (this.particles.length >= this._limits.particles) return;
    const p = this.player;
    const side = Math.sin(p.steps) >= 0 ? 1 : -1;
    const sideX = -this._movement.y * side * 5;
    const sideY = this._movement.x * side * 3;
    const life = 0.24 + Math.random() * 0.12;
    this.particles.push({
      x: p.x - this._movement.x * 8 + sideX,
      y: p.y + 13 - this._movement.y * 5 + sideY,
      vx: -this._movement.x * (5 + Math.random() * 7) + (Math.random() - 0.5) * 8,
      vy: -this._movement.y * (4 + Math.random() * 5) - 3 - Math.random() * 5,
      life, maxLife: life, color: 'rgba(180,164,123,.28)',
      size: 1.2 + Math.random() * 1.5, dust: true
    });
  }
  _edgePosition(margin = 55, radius = 32) {
    const bounds = this.worldBounds;
    const inset = radius + 26;
    const left = bounds.left + inset, right = bounds.right - inset;
    const top = bounds.top + inset, bottom = bounds.bottom - inset;
    const view = { left: this.camera.x - this.width / 2, right: this.camera.x + this.width / 2, top: this.camera.y - this.height / 2, bottom: this.camera.y + this.height / 2 };
    const candidates = [];
    const add = (x, y) => {
      if (x >= left && x <= right && y >= top && y <= bottom) candidates.push({ x, y });
    };
    for (let i = 0; i < 12; i++) {
      const y = Math.max(top, view.top) + Math.random() * Math.max(0, Math.min(bottom, view.bottom) - Math.max(top, view.top));
      const x = Math.max(left, view.left) + Math.random() * Math.max(0, Math.min(right, view.right) - Math.max(left, view.left));
      add(view.left - margin, y); add(view.right + margin, y);
      add(x, view.top - margin); add(x, view.bottom + margin);
    }
    if (candidates.length) return candidates[Math.floor(Math.random() * candidates.length)];
    const perimeter = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      perimeter.push({ x: left + (right - left) * t, y: top }, { x: left + (right - left) * t, y: bottom }, { x: left, y: top + (bottom - top) * t }, { x: right, y: top + (bottom - top) * t });
    }
    perimeter.sort((a, b) => Math.hypot(b.x - this.player.x, b.y - this.player.y) - Math.hypot(a.x - this.player.x, a.y - this.player.y));
    return perimeter[Math.floor(Math.random() * 6)];
  }
  _spawnEnemy(forcedType) {
    if (this.enemies.filter(enemy => !enemy.boss && !enemy.dead).length >= this._limits.enemies) return;
    const { x, y } = this._edgePosition();
    const roll = Math.random();
    const rolledType = roll < 0.31 ? 'shade' : roll < 0.48 ? 'bat' : roll < 0.65 ? 'crawler' : roll < 0.80 ? 'skeleton' : roll < 0.94 ? 'wraith' : this.wave >= 2 ? 'brute' : 'shade';
    const type = Object.prototype.hasOwnProperty.call(this._templates, forcedType) ? forcedType : rolledType;
    const template = this._templates[type];
    const appearance = VesperGame.ENEMY_THEMES[this.mapId].enemies[type];
    const growth = 1 + (this.wave - 1) * 0.2;
    const difficulty = this.difficultyDefinition;
    const health = template.hp * growth * difficulty.enemyHealth;
    this.enemies.push({
      id: ++this._entityId, x, y, type, kind: type, boss: false, superBoss: false,
      mapId: this.mapId, appearance: appearance.id, name: appearance.name,
      hp: health, maxHp: health,
      radius: template.radius, speed: template.speed * Math.min(1.85, 1 + (this.wave - 1) * 0.045) * difficulty.enemySpeed,
      damage: Math.max(1, Math.round((template.damage + Math.floor((this.wave - 1) * 1.2)) * difficulty.enemyDamage)),
      xp: template.xp, phase: Math.random() * Math.PI * 2,
      hit: 0, knockX: 0, knockY: 0, dead: false
    });
  }
  _scheduleBosses() {

    while (this._bossStageCursor < this._bossStages.length && this.elapsed >= this._bossStages[this._bossStageCursor].at) {
      const stage = this._bossStages[this._bossStageCursor++];
      this._spawnBoss(stage);
    }
  }
  _spawnBoss(stage) {
    const superBoss = stage.finalBoss;
    const spawnWave = 1 + Math.floor(stage.at / 30);
    const difficulty = this.difficultyDefinition;
    const shadeHp = this._templates.shade.hp * (1 + (spawnWave - 1) * 0.2) * difficulty.enemyHealth;
    const gemCount = superBoss ? 14 : 7;
    const health = shadeHp * gemCount * (superBoss ? this._bossHealth.superBoss : this._bossHealth.boss);
    const { x, y } = this._edgePosition(superBoss ? 98 : 80, superBoss ? 42 : 34);
    const mini = VesperGame.ENEMY_THEMES[this.mapId].miniBoss;
    const boss = {
      id: ++this._entityId, x, y, type: superBoss ? 'superboss' : 'boss',
      kind: superBoss ? 'superboss' : 'boss', boss: true, superBoss,
      mapId: this.mapId, appearance: superBoss ? null : mini.id,
      finalBoss: stage.finalBoss, stageId: stage.id, characterId: stage.finalBoss ? this.mapDefinition.unlockCharacter : null,
      name: superBoss ? this.mapDefinition.bossName : mini.name,
      spawnAt: stage.at, spawnMinute: stage.at / 60, spawnWave, shadeHp, hp: health, maxHp: health,
      radius: superBoss ? 42 : 34,
      speed: (superBoss ? 112 : 98) * Math.min(1.45, 1 + (spawnWave - 1) * 0.025) * difficulty.enemySpeed,
      damage: Math.max(1, Math.round(((superBoss ? 25 : 19) + Math.floor((spawnWave - 1) * 0.6)) * difficulty.enemyDamage)),
      xp: gemCount * this._templates.shade.xp, gemCount,
      phase: Math.random() * Math.PI * 2, hit: 0, knockX: 0, knockY: 0, dead: false,
      dashState: 'chase', dashCooldown: 3, dashTimer: 0, dashX: 0, dashY: 0,
      dashWindup: superBoss ? 1 : 0.9, dashSpeed: superBoss ? 490 : 440,
      dashDuration: superBoss ? 0.6 : 0.52
    };
    this.enemies.push(boss);
    this._sound('boss');
    this._emitHud();
    if (this.callbacks.onBossSpawn) this.callbacks.onBossSpawn({ id: boss.id, name: boss.name, superBoss, finalBoss: boss.finalBoss, characterId: boss.characterId });
    return boss;
  }
  _moveBoss(enemy, dx, dy, distance, dt) {
    if (enemy.dashState === 'telegraph') {
      enemy.dashTimer -= dt;
      if (enemy.dashTimer <= 0) {
        enemy.dashState = 'dash';
        enemy.dashTimer = enemy.dashDuration;
        this._burst(enemy.x, enemy.y, enemy.superBoss ? '#d87469' : '#e2b55e', 14, 100);
      }
      return;
    }
    if (enemy.dashState === 'dash') {
      const step = Math.min(dt, enemy.dashTimer);
      enemy.x += enemy.dashX * enemy.dashSpeed * step;
      enemy.y += enemy.dashY * enemy.dashSpeed * step;
      enemy.dashTimer -= dt;
      if (enemy.dashTimer <= 0) { enemy.dashState = 'recover'; enemy.dashTimer = 0.45; }
      return;
    }
    if (enemy.dashState === 'recover') {
      enemy.dashTimer -= dt;
      if (enemy.dashTimer <= 0) { enemy.dashState = 'chase'; enemy.dashCooldown = 5.2; }
      return;
    }
    enemy.dashCooldown -= dt;
    if (enemy.dashCooldown <= 0 && distance > 100 && distance < 440) {
      enemy.dashX = dx / distance;
      enemy.dashY = dy / distance;
      enemy.dashState = 'telegraph';
      enemy.dashTimer = enemy.dashWindup;
      return;
    }
    enemy.x += (dx / distance * enemy.speed + enemy.knockX) * dt;
    enemy.y += (dy / distance * enemy.speed + enemy.knockY) * dt;
  }
  _updateEnemies(dt) {
    const p = this.player;
    const tooFar = Math.hypot(this.width, this.height) * 1.3;
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      let dx = p.x - enemy.x;
      let dy = p.y - enemy.y;
      let distance = Math.hypot(dx, dy) || 1;
      if (!enemy.boss && distance > tooFar) {
        const edge = this._edgePosition(70, enemy.radius);
        enemy.x = edge.x;
        enemy.y = edge.y;
        dx = p.x - enemy.x;
        dy = p.y - enemy.y;
        distance = Math.hypot(dx, dy) || 1;
      }
      const oldX = enemy.x, oldY = enemy.y;
      if (enemy.boss) this._moveBoss(enemy, dx, dy, distance, dt);
      else {
        enemy.x += (dx / distance * enemy.speed + enemy.knockX) * dt;
        enemy.y += (dy / distance * enemy.speed + enemy.knockY) * dt;
      }
      this._clampEntity(enemy);
      const decay = Math.exp(-11 * dt);
      enemy.knockX *= decay;
      enemy.knockY *= decay;
      enemy.hit = Math.max(0, enemy.hit - dt);
      const contact = this._segmentHits(oldX, oldY, enemy.x, enemy.y, p, enemy.radius + p.radius) >= 0;
      if (contact && p.invulnerability <= 0) {
        p.hp = Math.max(0, p.hp - enemy.damage);
        p.invulnerability = 0.78;
        enemy.knockX = -dx / distance * (enemy.boss ? 25 : 190);
        enemy.knockY = -dy / distance * (enemy.boss ? 25 : 190);
        this._shake = 5;
        this._burst(p.x, p.y, '#ce716b', 12, 105);
        this._number(p.x, p.y - 24, '-' + enemy.damage, '#ffa393', true);
        this._sound('hurt');
        this._emitHud();
        if (p.hp <= 0) {
          this.setMovement(0, 0);
          this._setState('gameover');
          this._sound('death');
          if (this.callbacks.onGameOver) this.callbacks.onGameOver({ elapsed: this.elapsed, kills: this.kills, level: this.level, bossKills: this.bossKills });
          return;
        }
      }
    }
  }
  _shoot() {
    const p = this.player;

    const targets = this.enemies.filter(enemy => !enemy.dead)
      .map(enemy => ({ enemy, distance: (enemy.x - p.x) ** 2 + (enemy.y - p.y) ** 2 }))
      .sort((a, b) => a.distance - b.distance);
    if (!targets.length) return false;
    const amount = Math.min(p.projectiles, this._limits.projectiles - this.projectiles.length);
    for (let i = 0; i < amount; i++) {
      const target = targets[i % targets.length].enemy;
      const dx = target.x - p.x;
      const dy = target.y - p.y;
      const distance = Math.hypot(dx, dy) || 1;
      const angle = Math.atan2(dy, dx);
      const vx = Math.cos(angle) * 555;
      const vy = Math.sin(angle) * 555;
      this.projectiles.push({
        x: p.x + Math.cos(angle) * 16, y: p.y - 4 + Math.sin(angle) * 16,
        vx, vy, radius: 5, damage: p.damage, life: Math.max(1.4, distance / 555 + 0.4), angle,
        trail: []
      });
      this._burst(p.x + Math.cos(angle) * 18, p.y - 4 + Math.sin(angle) * 18, '#e7bc75', 3, 38);
    }
    this._sound('shot');
    return true;
  }
  _segmentHits(x1, y1, x2, y2, circle, radius) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared ? Math.max(0, Math.min(1, ((circle.x - x1) * dx + (circle.y - y1) * dy) / lengthSquared)) : 0;
    return (circle.x - x1 - dx * t) ** 2 + (circle.y - y1 - dy * t) ** 2 <= radius * radius ? t : -1;
  }
  _updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const shot = this.projectiles[i];
      const oldX = shot.x, oldY = shot.y;
      shot.trail.push({ x: oldX, y: oldY });
      if (shot.trail.length > 5) shot.trail.shift();
      shot.x += shot.vx * dt;
      shot.y += shot.vy * dt;
      shot.life -= dt;
      const bounds = this.worldBounds;
      if (shot.x < bounds.left || shot.x > bounds.right || shot.y < bounds.top || shot.y > bounds.bottom) shot.life = 0;
      let victim = null, earliest = Infinity;
      for (const enemy of this.enemies) {
        if (enemy.dead) continue;
        const hit = this._segmentHits(oldX, oldY, shot.x, shot.y, enemy, enemy.radius + shot.radius);
        if (hit >= 0 && hit < earliest) { earliest = hit; victim = enemy; }
      }
      if (victim) {
        victim.hp -= shot.damage;
        victim.hit = 0.11;
        victim.knockX += shot.vx * (victim.boss ? 0.025 : 0.19);
        victim.knockY += shot.vy * (victim.boss ? 0.025 : 0.19);
        this._burst(victim.x, victim.y, '#e5ad61', 5, 75);
        this._number(victim.x, victim.y - victim.radius, String(Math.round(shot.damage)), '#f4d49a');
        if (victim.hp <= 0) this._killEnemy(victim);
        else if (victim.boss) this._emitHud();
        this.projectiles.splice(i, 1);
        if (this._state === 'victory') break;
      } else if (shot.life <= 0) this.projectiles.splice(i, 1);
    }
    this.enemies = this.enemies.filter(enemy => !enemy.dead);
  }
  _killEnemy(enemy) {
    if (enemy.dead) return;
    enemy.dead = true;
    this.kills++;
    if (enemy.boss) {
      this.bossKills++;
      if (enemy.stageId) this._stageDefeated[enemy.stageId] = true;
      this._reserveGemSlots(enemy.gemCount);
      const facing = Math.atan2(this.player.y - enemy.y, this.player.x - enemy.x);
      for (let i = 0; i < enemy.gemCount; i++) {
        const angle = facing + (i / Math.max(1, enemy.gemCount - 1) - 0.5) * Math.PI * 1.65;
        const radius = 24 + (i % 3) * 13;
        this._dropGem(enemy.x + Math.cos(angle) * radius, enemy.y + Math.sin(angle) * radius, this._templates.shade.xp);
      }
      this._burst(enemy.x, enemy.y, enemy.superBoss ? '#e68b75' : '#efd093', 42, 185);
      this._emitHud();
    } else this._dropGem(enemy.x, enemy.y, enemy.xp);
    this._burst(enemy.x, enemy.y, enemy.type === 'brute' ? '#b57966' : '#6b9680', 11, 110);
    this._sound('kill');
    if (enemy.finalBoss && this._state === 'playing' && !this.victoryData) {
      this.victoryData = Object.freeze({ mapId: this.mapId, characterId: enemy.characterId, elapsed: this.elapsed, kills: this.kills, level: this.level, bossKills: this.bossKills });
      this.setMovement(0, 0);
      this._options = [];
      this._setState('victory');
      this._emitHud();
      this._sound('level');
      if (this.callbacks.onVictory) this.callbacks.onVictory({ ...this.victoryData });
    }
  }
  _reserveGemSlots(amount) {

    while (this.gems.length > this._limits.gems - amount && this.gems.length > 1) {
      const source = this.gems.pop();
      let nearest = this.gems[0], best = Infinity;
      for (const candidate of this.gems) {
        const distance = (candidate.x - source.x) ** 2 + (candidate.y - source.y) ** 2;
        if (distance < best) { best = distance; nearest = candidate; }
      }
      const total = source.value + nearest.value;
      nearest.x = (nearest.x * nearest.value + source.x * source.value) / total;
      nearest.y = (nearest.y * nearest.value + source.y * source.value) / total;
      nearest.value = total;
      nearest.attracted = nearest.attracted || source.attracted;
    }
  }
  _dropGem(x, y, value) {
    const position = this._clampEntity({ x, y }, 10);
    x = position.x; y = position.y;
    if (this.gems.length >= this._limits.gems) {
      let closest = this.gems[0], best = Infinity;
      for (const gem of this.gems) {
        const distance = (gem.x - x) ** 2 + (gem.y - y) ** 2;
        if (distance < best) { best = distance; closest = gem; }
      }
      const total = closest.value + value;
      closest.x = (closest.x * closest.value + x * value) / total;
      closest.y = (closest.y * closest.value + y * value) / total;
      closest.value = total;
      return;
    }
    this.gems.push({ x, y, value, phase: Math.random() * Math.PI * 2, attracted: false });
  }
  _updateGems(dt) {
    if (this._state !== 'playing') return;
    const p = this.player;
    let collected = false;
    for (let i = this.gems.length - 1; i >= 0; i--) {
      const gem = this.gems[i];
      const dx = p.x - gem.x, dy = p.y - gem.y;
      const distance = Math.hypot(dx, dy);
      if (distance < p.pickup) gem.attracted = true;
      if (gem.attracted) {
        const travel = (340 + p.speed * 0.6) * dt;
        if (distance <= Math.max(20, travel)) {
          this.xp += gem.value;
          this.gems.splice(i, 1);
          this._burst(p.x, p.y, '#71d7b4', 4, 45);
          collected = true;
        } else {
          gem.x += dx / distance * travel;
          gem.y += dy / distance * travel;
        }
      }
    }
    if (collected) {
      this._sound('gem');
      this._checkLevelUp();
    }
  }
  _checkLevelUp() {
    if (!['playing', 'upgrade'].includes(this._state) || this.xp < this.nextXp) return false;
    this.xp -= this.nextXp;
    this.level++;
    this.nextXp = Math.round((12 + (this.level - 1) * 7 + (this.level - 1) ** 1.35) * 1.25);
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + 8);
    this._options = this._rollUpgrades();
    this._setState('upgrade');
    this._sound('level');
    this._emitHud();
    if (this.callbacks.onLevelUp) this.callbacks.onLevelUp(this._options.map(option => ({ ...option })));
    return true;
  }
  _rollUpgrades() {
    const p = this.player;
    const pool = [
      { id: 'damage', title: 'Mais dano', description: 'Seus ataques causam 25% mais dano.', icon: 'sword', detail: Math.round(p.damage) + ' → ' + Math.round(p.damage * 1.25) + ' de dano' },
      { id: 'speed', title: 'Mais velocidade', description: 'Ande 12% mais rápido.', icon: 'boot', detail: Math.round(p.speed) + ' → ' + Math.round(p.speed * 1.12) + ' de velocidade' },
      { id: 'cadence', title: 'Ataque mais rápido', description: 'Você ataca 15% mais rápido.', icon: 'bolt', detail: p.attackInterval.toFixed(2) + 's → ' + (p.attackInterval / 1.15).toFixed(2) + 's entre ataques' },
      { id: 'pickup', title: 'Mais alcance', description: 'Pegue gemas a uma distância 30% maior.', icon: 'gem', detail: Math.round(p.pickup) + ' → ' + Math.round(p.pickup * 1.3) + ' de alcance' },
      { id: 'vitality', title: 'Mais vida', description: 'Ganhe 25 de vida máxima e recupere 40 de vida.', icon: 'heart', detail: p.maxHp + ' → ' + (p.maxHp + 25) + ' de vida máxima' }
    ];
    if (p.projectiles < 6) pool.push({ id: 'projectile', title: 'Disparo extra', description: 'Lance mais um disparo a cada ataque.', icon: 'blades', detail: p.projectiles + ' → ' + (p.projectiles + 1) + ' disparos' });
    const useful = pool.filter(option => !(option.id === 'speed' && p.speed >= 420) && !(option.id === 'cadence' && p.attackInterval <= 0.13) && !(option.id === 'pickup' && p.pickup >= 420));
    for (let i = useful.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [useful[i], useful[j]] = [useful[j], useful[i]];
    }
    return useful.slice(0, 2);
  }
  chooseUpgrade(id) {
    if (this._state !== 'upgrade' || !this._options.some(option => option.id === id)) return false;
    const p = this.player;
    switch (id) {
      case 'damage': p.damage *= 1.25; break;
      case 'speed': p.speed = Math.min(450, p.speed * 1.12); break;
      case 'cadence': p.attackInterval = Math.max(0.11, p.attackInterval / 1.15); break;
      case 'pickup': p.pickup = Math.min(480, p.pickup * 1.3); break;
      case 'vitality': p.maxHp += 25; p.hp = Math.min(p.maxHp, p.hp + 40); break;
      case 'projectile': p.projectiles = Math.min(6, p.projectiles + 1); break;
    }
    this._options = [];
    p.invulnerability = Math.max(p.invulnerability, 0.65);
    this._burst(p.x, p.y, '#dfbd7b', 25, 125);
    if (!this._checkLevelUp()) this._setState('playing');
    this._emitHud();
    return true;
  }
  _burst(x, y, color, count, speed) {
    count = Math.min(count, this._limits.particles - this.particles.length);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const velocity = speed * (0.25 + Math.random() * 0.75);
      const life = 0.22 + Math.random() * 0.35;
      this.particles.push({ x, y, vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity, life, maxLife: life, color, size: 1 + Math.random() * 2.3 });
    }
  }
  _number(x, y, text, color, strong = false) {
    if (this.numbers.length >= this._limits.numbers) this.numbers.shift();
    this.numbers.push({ x: x + (Math.random() - 0.5) * 12, y, text, color, strong, life: 0.65 });
  }
  _updateEffects(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i];
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= Math.exp(-3 * dt);
      particle.vy *= Math.exp(-3 * dt);
      particle.life -= dt;
      if (particle.life <= 0) this.particles.splice(i, 1);
    }
    for (let i = this.numbers.length - 1; i >= 0; i--) {
      this.numbers[i].y -= 36 * dt;
      this.numbers[i].life -= dt;
      if (this.numbers[i].life <= 0) this.numbers.splice(i, 1);
    }
  }
  _hash(x, y, offset = 0) {
    const value = Math.sin(x * 127.1 + y * 311.7 + offset * 74.7) * 43758.5453;
    return value - Math.floor(value);
  }
  _makeFloor() {
    this._floor = document.createElement('canvas');
    this._floor.width = this._floor.height = 512;
    const ctx = this._floor.getContext('2d');
    ctx.fillStyle = '#121c18';
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 65; i++) {
      const x = this._hash(i, 1) * 512;
      const y = this._hash(i, 2) * 512;
      const radius = 13 + this._hash(i, 3) * 48;
      const gradient = ctx.createRadialGradient(x, y, 1, x, y, radius);
      gradient.addColorStop(0, i % 3 ? 'rgba(41,57,39,.26)' : 'rgba(7,14,12,.35)');
      gradient.addColorStop(1, 'rgba(18,28,24,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    for (let i = 0; i < 950; i++) {
      const x = this._hash(i, 4) * 512;
      const y = this._hash(i, 5) * 512;
      ctx.fillStyle = i % 3 ? '#1d2a20' : '#273027';
      ctx.globalAlpha = 0.2 + this._hash(i, 6) * 0.35;
      ctx.fillRect(x, y, 1 + this._hash(i, 7) * 2, 1);
      if (i % 5 === 0) {
        ctx.strokeStyle = '#344030';
        ctx.lineWidth = 0.75;
        ctx.beginPath();
        ctx.moveTo(x - 3, y);
        ctx.lineTo(x - 5, y - 5);
        ctx.moveTo(x, y);
        ctx.lineTo(x + 2, y - 7);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }
  _draw() {
    const ctx = this.ctx;
    const menu = this._state === 'menu';
    const camX = menu ? -this.width * 0.18 : this.camera.x;
    const camY = menu ? 15 : this.camera.y;
    const shakeX = this._state === 'playing' ? (Math.random() - 0.5) * this._shake : 0;
    const shakeY = this._state === 'playing' ? (Math.random() - 0.5) * this._shake : 0;
    const left = camX - this.width / 2 - shakeX;
    const top = camY - this.height / 2 - shakeY;
    this._view = { left, top, right: left + this.width, bottom: top + this.height };
    ctx.setTransform(this.dpr * this.scale, 0, 0, this.dpr * this.scale, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#07090e';
    ctx.fillRect(0, 0, this.width, this.height);
    if (menu) {
      for (let x = Math.floor(left / 512) * 512; x < left + this.width; x += 512) {
        for (let y = Math.floor(top / 512) * 512; y < top + this.height; y += 512) ctx.drawImage(this._floor, x - left, y - top);
      }
    }
    ctx.save();
    ctx.translate(-left, -top);
    if (menu) {
      this._drawRitual(ctx);
      this._drawDecorations(ctx);
    } else {
      const bounds = this.worldBounds;
      ctx.beginPath(); ctx.rect(bounds.left, bounds.top, bounds.width, bounds.height); ctx.clip();
      this._drawOfflineEnvironment(ctx, this.mapId, this._view);
    }
    this._drawBossTelegraphs(ctx);
    for (const gem of this.gems) if (this._visible(gem, 20)) this._drawGem(ctx, gem);
    for (const shot of this.projectiles) this._drawProjectile(ctx, shot);
    const figures = this.enemies.filter(enemy => !enemy.dead && this._visible(enemy, 65));
    figures.push({ isPlayer: true, x: this.player.x, y: this.player.y });
    if (this._accessories.includes('mini')) figures.push({ isPet: true, y: this.player.pet ? this.player.pet.y : this.player.y + 8 });
    figures.sort((a, b) => a.y - b.y);
    for (const figure of figures) {
      if (figure.isPlayer) this._drawPlayer(ctx);
      else if (figure.isPet) this._drawPet(ctx, this.player, this._character);
      else this._drawEnemy(ctx, figure);
    }
    if (menu) this._drawMenuCreatures(ctx);
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
    if (menu || this.mapId === 'swamp' || this.mapId === 'halloween') this._drawFireflies(ctx);
    else if (this.mapId === 'sea' || this.mapId === 'snow') this._drawWeather(ctx);
    ctx.restore();
    const vignette = ctx.createRadialGradient(this.width * 0.5, this.height * 0.48, Math.min(this.width, this.height) * 0.12, this.width * 0.5, this.height * 0.5, Math.max(this.width, this.height) * 0.71);
    vignette.addColorStop(0, 'rgba(4,9,8,0)');
    vignette.addColorStop(0.6, 'rgba(3,8,7,.13)');
    vignette.addColorStop(1, 'rgba(1,5,4,.7)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, this.width, this.height);
    if (this.player.invulnerability > 0.52 && !menu) {
      ctx.fillStyle = 'rgba(156,35,38,' + ((this.player.invulnerability - 0.52) * 0.13) + ')';
      ctx.fillRect(0, 0, this.width, this.height);
    }
  }
  _visible(entity, padding) {
    const view = this._view;

    if (!view) return true;
    return entity.x > view.left - padding && entity.x < view.right + padding && entity.y > view.top - padding && entity.y < view.bottom + padding;
  }
  _getMapTile(id) {
    if (this._mapTileCache.has(id)) return this._mapTileCache.get(id);
    const tile = document.createElement('canvas'); tile.width = tile.height = 512;
    const ctx = tile.getContext('2d');
    const colors = { castle: '#25262e', egypt: '#967649', swamp: '#183b32', halloween: '#272135', sea: '#16414c', snow: '#7d8d9f', city: '#1f2229', west: '#a47a4b' };
    ctx.fillStyle = colors[id]; ctx.fillRect(0, 0, 512, 512);
    if (id === 'castle') {
      for (let row = -1; row < 10; row++) {
        for (let col = -1; col < 8; col++) {
          const x = col * 80 + (row % 2) * 40, y = row * 58;
          const shades = ['#303039', '#2c2e35', '#34333c', '#292c32'];
          ctx.fillStyle = shades[Math.floor(this._hash(col, row, 21) * shades.length)];
          ctx.fillRect(x + 2, y + 2, 76, 54);
          ctx.strokeStyle = '#414149'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + 3, y + 55); ctx.lineTo(x + 3, y + 3); ctx.lineTo(x + 77, y + 3); ctx.stroke();
          if (this._hash(col, row, 23) > 0.68) {
            ctx.strokeStyle = '#21232b'; ctx.beginPath(); ctx.moveTo(x + 28, y + 3); ctx.lineTo(x + 33, y + 18); ctx.lineTo(x + 22, y + 28); ctx.lineTo(x + 30, y + 41); ctx.stroke();
          }
        }
      }
    } else if (id === 'egypt') {
      const gradient = ctx.createLinearGradient(0, 0, 512, 512);
      gradient.addColorStop(0, '#a58652'); gradient.addColorStop(0.48, '#987645'); gradient.addColorStop(1, '#b28e54');
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, 512, 512);
      for (let i = -1; i < 12; i++) {
        ctx.strokeStyle = i % 2 ? 'rgba(237,203,137,.12)' : 'rgba(77,50,29,.11)'; ctx.lineWidth = i % 3 ? 1.4 : 3;
        ctx.beginPath(); ctx.moveTo(-30, i * 52); ctx.bezierCurveTo(130, i * 52 - 38, 330, i * 52 + 65, 542, i * 52 + 17); ctx.stroke();
      }
    } else if (id === 'swamp') {
      for (let i = 0; i < 20; i++) {
        const x = this._hash(i, 2, 5) * 512, y = this._hash(i, 3, 5) * 512;
        const glow = ctx.createRadialGradient(x, y, 2, x, y, 30 + this._hash(i, 4) * 75);
        glow.addColorStop(0, i % 2 ? '#244832' : '#132e30'); glow.addColorStop(1, '#183b3200');
        ctx.fillStyle = glow; ctx.fillRect(x - 110, y - 110, 220, 220);
      }
      ctx.strokeStyle = '#34523b'; ctx.lineWidth = 1;
      for (let i = 0; i < 90; i++) {
        const x = this._hash(i, 5) * 512, y = this._hash(i, 6) * 512;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 3, y - 7); ctx.moveTo(x, y); ctx.lineTo(x + 4, y - 10); ctx.stroke();
      }
    } else if (id === 'sea') {
      const depth = ctx.createLinearGradient(0, 0, 512, 512);
      depth.addColorStop(0, '#1a4b55'); depth.addColorStop(0.5, '#163f4b'); depth.addColorStop(1, '#1b4a52');
      ctx.fillStyle = depth; ctx.fillRect(0, 0, 512, 512);
      for (let i = -1; i < 12; i++) {
        ctx.strokeStyle = i % 2 ? 'rgba(120,196,190,.07)' : 'rgba(8,30,38,.12)'; ctx.lineWidth = i % 3 ? 1.2 : 2.6;
        ctx.beginPath(); ctx.moveTo(-30, i * 48); ctx.bezierCurveTo(140, i * 48 - 30, 320, i * 48 + 50, 542, i * 48 + 12); ctx.stroke();
      }
      for (let i = 0; i < 26; i++) {
        const x = this._hash(i, 3, 91) * 512, y = this._hash(i, 4, 91) * 512;
        ctx.fillStyle = i % 3 ? 'rgba(206,196,150,.08)' : 'rgba(10,32,40,.18)';
        ctx.beginPath(); ctx.ellipse(x, y, 10 + this._hash(i, 5, 91) * 26, 4 + this._hash(i, 6, 91) * 8, this._hash(i, 7, 91) * 3, 0, Math.PI * 2); ctx.fill();
      }
    } else if (id === 'snow') {
      for (let i = 0; i < 24; i++) {
        const x = this._hash(i, 2, 93) * 512, y = this._hash(i, 3, 93) * 512;
        const radius = 40 + this._hash(i, 4, 93) * 70;
        for (const dx of [-512, 0, 512]) for (const dy of [-512, 0, 512]) {
          const drift = ctx.createRadialGradient(x + dx, y + dy, 2, x + dx, y + dy, radius);
          drift.addColorStop(0, i % 2 ? '#98a8b9' : '#72839a'); drift.addColorStop(1, '#7d8d9f00');
          ctx.fillStyle = drift; ctx.fillRect(x + dx - 110, y + dy - 110, 220, 220);
        }
      }
      ctx.strokeStyle = 'rgba(226,236,244,.12)'; ctx.lineWidth = 1;
      for (let i = 0; i < 30; i++) {
        const x = this._hash(i, 5, 93) * 512, y = this._hash(i, 6, 93) * 512;
        ctx.beginPath(); ctx.moveTo(x - 3, y); ctx.lineTo(x + 3, y); ctx.moveTo(x, y - 3); ctx.lineTo(x, y + 3); ctx.stroke();
      }
    } else if (id === 'city') {
      const shades = ['#23262e', '#20232a', '#262a32', '#1e2128'];
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
          ctx.fillStyle = shades[Math.floor(this._hash(col, row, 95) * shades.length)];
          ctx.fillRect(col * 64 + 1, row * 64 + 1, 62, 62);
        }
      }
      ctx.strokeStyle = '#17191e'; ctx.lineWidth = 2;
      for (let n = 0; n <= 512; n += 64) { ctx.beginPath(); ctx.moveTo(n, 0); ctx.lineTo(n, 512); ctx.moveTo(0, n); ctx.lineTo(512, n); ctx.stroke(); }
      for (let i = 0; i < 9; i++) {
        const x = this._hash(i, 3, 97) * 512, y = this._hash(i, 4, 97) * 512;
        ctx.fillStyle = 'rgba(96,120,170,.08)';
        ctx.beginPath(); ctx.ellipse(x, y, 16 + this._hash(i, 5, 97) * 26, 6 + this._hash(i, 6, 97) * 7, 0, 0, Math.PI * 2); ctx.fill();
      }
    } else if (id === 'west') {
      ctx.strokeStyle = 'rgba(92,60,34,.28)'; ctx.lineWidth = 1;
      for (let i = 0; i < 14; i++) {
        let x = this._hash(i, 2, 99) * 512, y = this._hash(i, 3, 99) * 512;
        ctx.beginPath(); ctx.moveTo(x, y);
        for (let k = 0; k < 4; k++) { x += (this._hash(i, k, 101) - 0.5) * 40; y += (this._hash(i, k, 103) - 0.5) * 40; ctx.lineTo(x, y); }
        ctx.stroke();
      }
      for (let i = 0; i < 40; i++) {
        const x = this._hash(i, 5, 99) * 512, y = this._hash(i, 6, 99) * 512;
        ctx.fillStyle = i % 3 ? 'rgba(120,88,54,.5)' : 'rgba(214,180,128,.45)';
        ctx.beginPath(); ctx.ellipse(x, y, 1.5 + this._hash(i, 7, 99) * 3, 1 + this._hash(i, 8, 99) * 2, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.strokeStyle = '#8a7a45'; ctx.lineWidth = 1;
      for (let i = 0; i < 26; i++) {
        const x = this._hash(i, 9, 99) * 512, y = this._hash(i, 10, 99) * 512;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 4, y - 7); ctx.moveTo(x, y); ctx.lineTo(x + 1, y - 9); ctx.moveTo(x, y); ctx.lineTo(x + 5, y - 6); ctx.stroke();
      }
    } else {
      for (let i = 0; i < 95; i++) {
        const x = this._hash(i, 11) * 512, y = this._hash(i, 12) * 512;
        ctx.fillStyle = i % 4 ? '#493344' : '#75523c';
        ctx.beginPath(); ctx.ellipse(x, y, 2 + this._hash(i, 13) * 4, 1.2, i * 2.4, 0, Math.PI * 2); ctx.fill();
      }
      ctx.strokeStyle = '#3b3049'; ctx.lineWidth = 1;
      for (let i = 0; i < 36; i++) {
        const x = this._hash(i, 15) * 512, y = this._hash(i, 16) * 512;
        ctx.beginPath(); ctx.moveTo(x - 6, y); ctx.lineTo(x - 9, y - 9); ctx.moveTo(x, y); ctx.lineTo(x - 2, y - 11); ctx.moveTo(x + 4, y); ctx.lineTo(x + 7, y - 7); ctx.stroke();
      }
    }
    for (let i = 0; i < 900; i++) {
      const x = this._hash(i, 42) * 512, y = this._hash(i, 43) * 512;
      ctx.globalAlpha = 0.12 + this._hash(i, 44) * 0.16;
      ctx.fillStyle = i % 2 ? '#d0c1a0' : '#080e12'; ctx.fillRect(x, y, 1 + this._hash(i, 45) * 2, 1);
    }
    ctx.globalAlpha = 1;
    this._mapTileCache.set(id, tile);
    return tile;
  }
  _getMapFeatures(id) {
    if (this._mapFeatureCache.has(id)) return this._mapFeatureCache.get(id);
    const kinds = {
      castle: ['pillar', 'flag', 'crypt', 'candle', 'ruinedwall'],
      egypt: ['obelisk', 'urn', 'sarcophagus', 'desertruin', 'palm'],
      swamp: ['willow', 'stump', 'reeds', 'log', 'willow'],
      halloween: ['pumpkin', 'tomb', 'fence', 'deadTree', 'lantern'],
      sea: ['coral', 'seaweed', 'rock', 'anchor', 'urn'],
      snow: ['pine', 'pine', 'rock', 'iceCrystal', 'lantern'],
      city: ['lamp', 'car', 'hydrant', 'trashcan', 'bench'],
      west: ['cactus', 'barrel', 'haybale', 'cactus', 'cowskull']
    };
    const features = [];
    for (let x = -3; x <= 3; x++) {
      for (let y = -2; y <= 2; y++) {
        if (x === 0 && y === 0) continue;
        const variant = this._hash(x, y, 74);
        features.push({ x: x * 580 + (this._hash(x, y, 71) - 0.5) * 170, y: y * 585 + (this._hash(x, y, 72) - 0.5) * 120, kind: kinds[id][Math.floor(variant * kinds[id].length)], scale: 0.8 + this._hash(x, y, 73) * 0.65, seed: x * 31 + y * 17 });
      }
    }
    if (id === 'castle') {
      features.push({ x: 0, y: -1120, kind: 'throne', scale: 2.6 }, { x: -430, y: -180, kind: 'flag', scale: 1.4 }, { x: 430, y: -180, kind: 'flag', scale: 1.4 });
      for (let y = -1300; y <= 1300; y += 430) features.push({ x: -235, y, kind: 'pillar', scale: 1.4 }, { x: 235, y, kind: 'pillar', scale: 1.4 });
    } else if (id === 'egypt') {
      features.push({ x: -1150, y: -540, kind: 'pyramid', scale: 2.6 }, { x: 1180, y: -650, kind: 'pyramid', scale: 2.2 }, { x: 850, y: 1100, kind: 'pyramid', scale: 1.5 }, { x: 0, y: -930, kind: 'sarcophagus', scale: 2.3 });
      for (const y of [-650, 80, 780]) features.push({ x: -310, y, kind: 'obelisk', scale: 1.5 }, { x: 310, y, kind: 'obelisk', scale: 1.5 });
    } else if (id === 'swamp') {
      features.push({ x: -950, y: 750, kind: 'hut', scale: 2.3 }, { x: 1100, y: -760, kind: 'hut', scale: 1.7 }, { x: 0, y: -950, kind: 'willow', scale: 2.2 });
      for (const x of [-1500, -760, 500, 1650]) features.push({ x, y: 300 + Math.sin(x) * 250, kind: 'reeds', scale: 2.2 });
    } else if (id === 'sea') {
      features.push({ x: 0, y: -1080, kind: 'shipwreck', scale: 2.4 }, { x: -270, y: -900, kind: 'chest', scale: 1.5 }, { x: 310, y: -860, kind: 'anchor', scale: 1.8 });
      for (const [x, y] of [[-1300, -900], [1350, 850], [-1250, 950], [1200, -800]]) {
        features.push({ x, y, kind: 'coral', scale: 2.2 }, { x: x + 170, y: y + 60, kind: 'seaweed', scale: 2 }, { x: x - 150, y: y + 90, kind: 'rock', scale: 1.6 });
      }
    } else if (id === 'snow') {
      features.push({ x: -1000, y: 760, kind: 'cabin', scale: 2.2 }, { x: 1150, y: -780, kind: 'cabin', scale: 1.8 }, { x: 0, y: -1000, kind: 'iceCrystal', scale: 2.6 });
      for (let i = 0; i < 10; i++) features.push({ x: -2000 + i * 440, y: 520 + Math.sin(i * 1.3) * 140, kind: 'pine', scale: 1.6 + (i % 3) * 0.25 });
    } else if (id === 'city') {
      features.push({ x: 0, y: -1180, kind: 'tower', scale: 2.4 });
      for (const [x, y] of [[-1650, -1150], [-900, -1150], [900, -1150], [1650, -1150], [-1650, 1150], [-900, 1150], [900, 1150], [1650, 1150]]) features.push({ x, y, kind: 'building', scale: 1.9, seed: x + y });
      for (const y of [-1300, -350, 350, 1300]) features.push({ x: -210, y, kind: 'lamp', scale: 1.5 }, { x: 210, y, kind: 'lamp', scale: 1.5 });
      for (const [x, y] of [[-620, -640], [760, -760], [-1300, 640], [1250, 760]]) features.push({ x, y, kind: 'car', scale: 1.5, seed: x });
    } else if (id === 'west') {
      features.push({ x: 0, y: -1150, kind: 'saloon', scale: 2.4 }, { x: -1250, y: 620, kind: 'watertower', scale: 2.1 }, { x: 1200, y: -620, kind: 'wagon', scale: 1.9 }, { x: 1350, y: 1050, kind: 'wagon', scale: 1.6 });
      for (const [x, y] of [[-1650, -1050], [-1500, -1180], [1650, -1150], [-1700, 1200], [1600, 400], [-600, 1250]]) features.push({ x, y, kind: 'cactus', scale: 1.9 });
      for (const [x, y] of [[-300, -900], [320, -880], [-340, 300], [360, 520]]) features.push({ x, y, kind: 'barrel', scale: 1.4 });
    } else {
      features.push({ x: 0, y: -1130, kind: 'hauntedhouse', scale: 2.6 }, { x: -600, y: 320, kind: 'pumpkin', scale: 2.6 }, { x: 650, y: 230, kind: 'pumpkin', scale: 2.1 }, { x: -1200, y: -660, kind: 'deadTree', scale: 2.3 });
      for (let i = 0; i < 9; i++) features.push({ x: 950 + (i % 3) * 100, y: 660 + Math.floor(i / 3) * 95, kind: 'tomb', scale: 1.1 });
    }
    features.sort((a, b) => a.y - b.y);
    this._mapFeatureCache.set(id, features);
    return features;
  }
  _drawOfflineEnvironment(ctx, id, view) {
    const map = VesperGame.MAPS.find(item => item.id === id);
    const bounds = { left: -map.width / 2, top: -map.height / 2, right: map.width / 2, bottom: map.height / 2, width: map.width, height: map.height };
    const tile = this._getMapTile(id);
    const startX = Math.floor(Math.max(view.left, bounds.left) / 512) * 512;
    const startY = Math.floor(Math.max(view.top, bounds.top) / 512) * 512;
    ctx.save(); ctx.beginPath(); ctx.rect(bounds.left, bounds.top, bounds.width, bounds.height); ctx.clip();
    for (let x = startX; x < Math.min(view.right, bounds.right); x += 512) {
      for (let y = startY; y < Math.min(view.bottom, bounds.bottom); y += 512) ctx.drawImage(tile, x, y);
    }
    this._drawMapTerrain(ctx, id, bounds, view);
    for (const feature of this._getMapFeatures(id)) {
      const extent = 250 * feature.scale;
      if (feature.x < view.left - extent || feature.x > view.right + extent || feature.y < view.top - extent || feature.y > view.bottom + extent) continue;
      ctx.save(); ctx.translate(feature.x, feature.y); ctx.scale(feature.scale, feature.scale);
      this._drawMapFeature(ctx, id, feature.kind, feature.seed || 0);
      ctx.restore();
    }
    this._drawWorldBoundary(ctx, id, bounds, view);
    ctx.restore();
  }
  _drawMapTerrain(ctx, id, bounds, view) {
    if (id === 'castle') {
      ctx.fillStyle = '#24252c'; ctx.fillRect(-145, bounds.top + 30, 290, bounds.height - 60); ctx.fillRect(bounds.left + 30, -150, bounds.width - 60, 300);
      ctx.strokeStyle = '#57505c'; ctx.lineWidth = 3;
      ctx.strokeRect(-145, bounds.top + 30, 290, bounds.height - 60);
      ctx.fillStyle = '#542c3a'; ctx.fillRect(-65, bounds.top + 120, 130, bounds.height - 240);
      ctx.strokeStyle = '#9a725b'; ctx.lineWidth = 2;
      ctx.strokeRect(-57, bounds.top + 125, 114, bounds.height - 250);
      for (let y = -1440; y <= 1440; y += 240) {
        if (y < view.top - 150 || y > view.bottom + 150) continue;
        ctx.strokeStyle = '#794752'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, y - 29); ctx.lineTo(29, y); ctx.lineTo(0, y + 29); ctx.lineTo(-29, y); ctx.closePath(); ctx.stroke();
      }
      for (const x of [-1230, 1230]) for (const y of [-780, 810]) {
        ctx.fillStyle = 'rgba(62,58,71,.25)'; ctx.fillRect(x - 365, y - 275, 730, 550);
        ctx.strokeStyle = '#4d4754'; ctx.lineWidth = 5; ctx.strokeRect(x - 365, y - 275, 730, 550);
        ctx.strokeStyle = '#6d5c60'; ctx.lineWidth = 1.5; ctx.strokeRect(x - 345, y - 255, 690, 510);
      }
    } else if (id === 'egypt') {
      for (let i = -2; i <= 2; i++) {
        ctx.fillStyle = 'rgba(205,164,91,.13)';
        ctx.beginPath(); ctx.ellipse(i * 810, 470 + Math.sin(i * 3) * 610, 620, 210, i * 0.3, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(226,190,123,.28)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(i * 810, 470 + Math.sin(i * 3) * 610, 600, 190, i * 0.3, Math.PI, Math.PI * 1.85); ctx.stroke();
      }
      ctx.fillStyle = '#887147'; ctx.fillRect(-105, bounds.top + 24, 210, bounds.height - 48);
      ctx.strokeStyle = '#b7975c'; ctx.lineWidth = 3;
      for (let y = Math.floor(Math.max(view.top, bounds.top) / 105) * 105; y < Math.min(view.bottom, bounds.bottom); y += 105) ctx.strokeRect(-98, y + 2, 196, 97);
      ctx.strokeStyle = '#d4b370'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-118, bounds.top); ctx.lineTo(-118, bounds.bottom); ctx.moveTo(118, bounds.top); ctx.lineTo(118, bounds.bottom); ctx.stroke();
      ctx.fillStyle = '#375b55'; ctx.fillRect(bounds.left + 65, bounds.top, 145, bounds.height);
      ctx.strokeStyle = '#798561'; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(bounds.left + 211, bounds.top); ctx.lineTo(bounds.left + 211, bounds.bottom); ctx.stroke();
    } else if (id === 'swamp') {
      const pools = [{ x: -1120, y: -730, rx: 650, ry: 340 }, { x: 1100, y: 650, rx: 740, ry: 380 }, { x: -1400, y: 1100, rx: 450, ry: 250 }, { x: 1350, y: -1300, rx: 500, ry: 320 }, { x: 90, y: 290, rx: 350, ry: 235 }];
      for (const pool of pools) {
        ctx.fillStyle = '#304b32'; ctx.beginPath(); ctx.ellipse(pool.x, pool.y, pool.rx + 22, pool.ry + 18, -0.16, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#173a3b'; ctx.beginPath(); ctx.ellipse(pool.x, pool.y, pool.rx, pool.ry, -0.16, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#345b50'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(pool.x, pool.y, pool.rx * 0.89, pool.ry * 0.89, -0.16, 0.2, Math.PI * 1.7); ctx.stroke();
        for (let i = 0; i < 9; i++) {
          const x = pool.x + Math.sin(i * 2.1) * pool.rx * 0.7, y = pool.y + Math.cos(i * 1.6) * pool.ry * 0.65;
          ctx.fillStyle = i % 2 ? '#456547' : '#385640'; ctx.beginPath(); ctx.ellipse(x, y, 17, 9, 0, 0.2, Math.PI * 1.9); ctx.lineTo(x, y); ctx.closePath(); ctx.fill();
        }
      }
      const bridges = [{ x: -2250, y: 560, w: 3050, h: 96 }, { x: -760, y: -430, w: 96, h: 1090 }, { x: -760, y: -430, w: 2340, h: 96 }, { x: 720, y: -1620, w: 96, h: 1250 }];
      for (const bridge of bridges) {
        ctx.fillStyle = '#28372b'; ctx.fillRect(bridge.x - 9, bridge.y - 6, bridge.w + 18, bridge.h + 20);
        ctx.fillStyle = '#6b6044'; ctx.fillRect(bridge.x, bridge.y, bridge.w, bridge.h);
        ctx.strokeStyle = '#2e3d30'; ctx.lineWidth = 3;
        const horizontal = bridge.w > bridge.h;
        const from = Math.max(horizontal ? bridge.x : bridge.y, horizontal ? view.left : view.top);
        const to = Math.min(horizontal ? bridge.x + bridge.w : bridge.y + bridge.h, horizontal ? view.right : view.bottom);
        for (let n = Math.floor(from / 24) * 24; n < to; n += 24) {
          ctx.beginPath(); if (horizontal) { ctx.moveTo(n, bridge.y); ctx.lineTo(n, bridge.y + bridge.h); } else { ctx.moveTo(bridge.x, n); ctx.lineTo(bridge.x + bridge.w, n); } ctx.stroke();
        }
        ctx.strokeStyle = '#9b8755'; ctx.lineWidth = 2; ctx.strokeRect(bridge.x + 5, bridge.y + 5, bridge.w - 10, bridge.h - 10);
      }
    } else if (id === 'sea') {
      for (let i = 0; i < 7; i++) {
        const x = bounds.left + 300 + i * 720;
        const beam = ctx.createLinearGradient(x, bounds.top, x + 420, bounds.bottom);
        beam.addColorStop(0, 'rgba(160,226,220,.06)'); beam.addColorStop(1, 'rgba(160,226,220,0)');
        ctx.fillStyle = beam;
        ctx.beginPath(); ctx.moveTo(x, bounds.top); ctx.lineTo(x + 180, bounds.top); ctx.lineTo(x + 620, bounds.bottom); ctx.lineTo(x + 380, bounds.bottom); ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = '#244f55';
      ctx.beginPath(); ctx.moveTo(-120, bounds.top); ctx.bezierCurveTo(-220, -600, 180, -300, -60, 200); ctx.bezierCurveTo(-260, 700, 160, 1000, -40, bounds.bottom); ctx.lineTo(130, bounds.bottom); ctx.bezierCurveTo(320, 1000, -60, 700, 110, 200); ctx.bezierCurveTo(330, -300, -40, -600, 110, bounds.top); ctx.closePath(); ctx.fill();
      for (const bed of [{ x: -1150, y: -700 }, { x: 1150, y: 700 }, { x: -1300, y: 1000 }, { x: 1250, y: -950 }, { x: 600, y: 150 }]) {
        ctx.fillStyle = 'rgba(60,110,80,.2)'; ctx.beginPath(); ctx.ellipse(bed.x, bed.y, 420, 240, 0.2, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#3f7a5a'; ctx.lineWidth = 2;
        for (let i = 0; i < 14; i++) {
          const x = bed.x + Math.sin(i * 2.3) * 300, y = bed.y + Math.cos(i * 1.7) * 160;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 4, y - 14); ctx.moveTo(x, y); ctx.lineTo(x + 5, y - 16); ctx.stroke();
        }
      }
    } else if (id === 'snow') {
      ctx.fillStyle = '#6d7d90';
      ctx.beginPath(); ctx.moveTo(bounds.left, 480); ctx.bezierCurveTo(-1400, 360, -600, 700, 0, 520); ctx.bezierCurveTo(600, 340, 1400, 700, bounds.right, 540); ctx.lineTo(bounds.right, 640); ctx.bezierCurveTo(1400, 800, 600, 440, 0, 620); ctx.bezierCurveTo(-600, 800, -1400, 460, bounds.left, 580); ctx.closePath(); ctx.fill();
      for (const lake of [{ x: -1100, y: -650, rx: 560, ry: 300 }, { x: 1150, y: 1050, rx: 620, ry: 320 }, { x: 250, y: -350, rx: 360, ry: 210 }]) {
        ctx.fillStyle = '#a9b9c8'; ctx.beginPath(); ctx.ellipse(lake.x, lake.y, lake.rx + 22, lake.ry + 18, -0.1, 0, Math.PI * 2); ctx.fill();
        const ice = ctx.createLinearGradient(lake.x - lake.rx, lake.y - lake.ry, lake.x + lake.rx, lake.y + lake.ry);
        ice.addColorStop(0, '#6f92aa'); ice.addColorStop(1, '#557990');
        ctx.fillStyle = ice; ctx.beginPath(); ctx.ellipse(lake.x, lake.y, lake.rx, lake.ry, -0.1, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(214,234,246,.35)'; ctx.lineWidth = 1.5;
        for (let i = 0; i < 5; i++) {
          const x = lake.x + Math.sin(i * 2.1) * lake.rx * 0.5, y = lake.y + Math.cos(i * 1.4) * lake.ry * 0.5;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 40, y - 18); ctx.lineTo(x + 70, y + 6); ctx.moveTo(x + 40, y - 18); ctx.lineTo(x + 52, y - 46); ctx.stroke();
        }
      }
    } else if (id === 'city') {
      const roads = [{ x: -170, y: bounds.top, w: 340, h: bounds.height }, { x: bounds.left, y: -870, w: bounds.width, h: 300 }, { x: bounds.left, y: 570, w: bounds.width, h: 300 }];
      for (const road of roads) {
        ctx.fillStyle = '#15171c'; ctx.fillRect(road.x, road.y, road.w, road.h);
        ctx.strokeStyle = '#3a3e47'; ctx.lineWidth = 6; ctx.strokeRect(road.x, road.y, road.w, road.h);
      }
      ctx.strokeStyle = '#c9a44c'; ctx.lineWidth = 4; ctx.setLineDash([46, 38]);
      ctx.beginPath(); ctx.moveTo(0, bounds.top); ctx.lineTo(0, bounds.bottom); ctx.moveTo(bounds.left, -720); ctx.lineTo(bounds.right, -720); ctx.moveTo(bounds.left, 720); ctx.lineTo(bounds.right, 720); ctx.stroke();
      ctx.setLineDash([]);
      for (const y of [-720, 720]) {
        ctx.fillStyle = '#15171c'; ctx.fillRect(-170, y - 150, 340, 300);
        ctx.fillStyle = '#d7d4cb';
        for (let n = -150; n < 150; n += 30) { ctx.fillRect(-230, y + n + 6, 48, 16); ctx.fillRect(182, y + n + 6, 48, 16); }
        for (let n = -150; n < 150; n += 30) { ctx.fillRect(n + 6, y - 212, 16, 48); ctx.fillRect(n + 6, y + 164, 16, 48); }
      }
      for (const park of [{ x: -1100, y: 0 }, { x: 1150, y: -20 }]) {
        ctx.fillStyle = '#1b2b21'; ctx.fillRect(park.x - 420, park.y - 240, 840, 480);
        ctx.strokeStyle = '#34453a'; ctx.lineWidth = 5; ctx.strokeRect(park.x - 420, park.y - 240, 840, 480);
        ctx.fillStyle = '#2c3a31'; ctx.fillRect(park.x - 420, park.y - 22, 840, 44);
        for (let i = 0; i < 10; i++) {
          ctx.fillStyle = i % 2 ? '#22382a' : '#2a4432';
          ctx.beginPath(); ctx.arc(park.x - 360 + (i % 5) * 180, park.y + (i < 5 ? -150 : 150), 44, 0, Math.PI * 2); ctx.fill();
        }
      }
    } else if (id === 'west') {
      for (const [x, y, rx, ry] of [[-1700, -1250, 520, 260], [1750, 1250, 560, 280], [1800, -1250, 420, 220]]) {
        ctx.fillStyle = 'rgba(150,82,50,.35)'; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0.1, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(110,58,36,.45)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(x, y, rx * 0.8, ry * 0.8, 0.1, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = '#bb9563'; ctx.fillRect(-190, bounds.top + 24, 380, bounds.height - 48);
      ctx.strokeStyle = 'rgba(112,78,46,.5)'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(-60, bounds.top); ctx.lineTo(-60, bounds.bottom); ctx.moveTo(60, bounds.top); ctx.lineTo(60, bounds.bottom); ctx.stroke();
      for (const x of [-250, 190]) {
        ctx.fillStyle = '#6b4a2e'; ctx.fillRect(x, bounds.top + 24, 60, bounds.height - 48);
        ctx.strokeStyle = '#4a3220'; ctx.lineWidth = 2;
        const from = Math.max(view.top, bounds.top), to = Math.min(view.bottom, bounds.bottom);
        for (let y = Math.floor(from / 22) * 22; y < to; y += 22) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 60, y); ctx.stroke(); }
      }
      const from = Math.max(view.left, bounds.left), to = Math.min(view.right, bounds.right);
      ctx.fillStyle = '#5a3d26';
      for (let x = Math.floor(from / 38) * 38; x < to; x += 38) ctx.fillRect(x, 860, 16, 90);
      ctx.strokeStyle = '#8d9097'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(bounds.left, 882); ctx.lineTo(bounds.right, 882); ctx.moveTo(bounds.left, 928); ctx.lineTo(bounds.right, 928); ctx.stroke();
    } else {
      ctx.fillStyle = '#34303e';
      ctx.beginPath(); ctx.moveTo(-100, bounds.top); ctx.bezierCurveTo(-160, -740, 130, -450, -90, 160); ctx.bezierCurveTo(-250, 700, 170, 1050, -70, bounds.bottom); ctx.lineTo(100, bounds.bottom); ctx.bezierCurveTo(330, 980, -80, 740, 80, 200); ctx.bezierCurveTo(290, -450, 10, -780, 100, bounds.top); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(90,65,102,.2)'; ctx.beginPath(); ctx.ellipse(1090, 750, 420, 370, 0, 0, Math.PI * 2); ctx.fill();
      for (let i = -12; i <= 12; i++) {
        const y = i * 135, x = Math.sin(i * 0.7) * 37;
        ctx.strokeStyle = '#4b4053'; ctx.lineWidth = 3; ctx.strokeRect(x - 52, y, 106, 64);
      }
      ctx.strokeStyle = '#514050'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(-2200, 800); ctx.bezierCurveTo(-900, 680, -500, -290, 1800, -540); ctx.stroke();
    }
  }
  _drawMapFeature(ctx, id, kind, seed) {
    const poly = (color, points, stroke) => {
      ctx.fillStyle = color; ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.fill();
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
    };
    const oval = (color, x, y, rx, ry) => { ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); };
    const line = (color, width, points) => { ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); };
    const rect = (color, x, y, w, h) => { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); };
    const light = (x, y, color, radius = 36) => {
      const g = ctx.createRadialGradient(x, y, 1, x, y, radius); g.addColorStop(0, color); g.addColorStop(1, color.slice(0, 7) + '00'); ctx.fillStyle = g; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    };
    const compact = ['lamp', 'hydrant', 'trashcan', 'barrel', 'cowskull'].includes(kind);
    oval('#060b1445', compact ? 3 : 6, compact ? 4 : 12, kind === 'pyramid' ? 125 : compact ? 18 : 42, kind === 'pyramid' ? 44 : compact ? 6 : 15);
    if (kind === 'pillar' || kind === 'obelisk') {
      const egypt = kind === 'obelisk';
      poly(egypt ? '#716044' : '#272934', [[-24, 8], [24, 8], [29, 20], [-29, 20]]);
      rect(egypt ? '#b39b66' : '#666470', -24, 0, 48, 10);
      poly(egypt ? '#b99c62' : '#64616d', [[-13, 0], [-11, -76], [0, -91], [13, -76], [15, 0]]);
      poly(egypt ? '#7f6c4b' : '#42434f', [[0, -91], [13, -76], [15, 0], [2, 0]]);
      if (egypt) {
        poly('#edcf84', [[-11, -76], [0, -98], [13, -76], [0, -70]]);
        for (let i = 0; i < 4; i++) line('#514e3e', 1.7, [[-7, -60 + i * 13], [-2, -64 + i * 13], [0, -57 + i * 13], [-7, -57 + i * 13]]);
      } else {
        rect('#383945', -21, -77, 42, 11); rect('#88808a', -23, -83, 46, 8);
        line('#96909a', 2, [[-9, -69], [-9, -6]]); line('#262935', 2, [[8, -43], [-2, -34], [3, -27]]);
      }
    } else if (kind === 'flag') {
      rect('#807766', -2, -97, 4, 100); oval('#b6a073', 0, -100, 4, 4);
      poly('#773b50', [[2, -93], [51, -93], [51, -29], [26, -42], [2, -29]], '#a27068');
      poly('#542f45', [[28, -91], [50, -91], [50, -33], [28, -44]]);
      poly('#caa87a', [[26, -78], [34, -66], [26, -54], [18, -66]]);
      line('#cfb683', 1, [[7, -87], [7, -42]]);
    } else if (kind === 'crypt' || kind === 'sarcophagus') {
      const egypt = kind === 'sarcophagus';
      poly(egypt ? '#75613e' : '#383b46', [[-27, -38], [27, -38], [32, 17], [-32, 17]]);
      poly(egypt ? '#c0a66b' : '#75717c', [[-24, -48], [24, -48], [28, 5], [-28, 5]], egypt ? '#e8c778' : '#918390');
      if (egypt) {
        oval('#274951', 0, -28, 14, 16); oval('#d6b76b', 0, -31, 8, 11);
        poly('#8a774f', [[-12, -14], [12, -14], [7, 0], [-7, 0]]);
        line('#dec57b', 3, [[-18, -13], [18, -13]]); line('#dec57b', 3, [[-18, -4], [18, -4]]);
        rect('#393b38', -5, -34, 3, 2); rect('#393b38', 3, -34, 3, 2);
      } else { line('#454450', 4, [[0, -38], [0, -5]]); line('#454450', 4, [[-10, -27], [10, -27]]); }
    } else if (kind === 'ruinedwall' || kind === 'desertruin') {
      const egypt = kind === 'desertruin';
      for (let r = 0; r < 3; r++) for (let c = 0; c < 4 - r; c++) {
        const x = -48 + c * 25 + r * 6, y = 3 - r * 17;
        rect(egypt ? '#766244' : '#363b43', x, y, 24, 17); rect(egypt ? '#b69b63' : '#6a6871', x, y, 24, 4);
        rect(egypt ? '#a18a5a' : '#4f535d', x + 2, y + 5, 21, 10);
      }
      poly('#777260', [[45, 8], [61, 1], [70, 13], [49, 20]]);
    } else if (kind === 'throne') {
      rect('#4b444f', -53, -1, 106, 26); rect('#78707a', -48, -3, 96, 5); rect('#82747a', -41, -15, 82, 15);
      poly('#b99867', [[-29, -10], [-32, -80], [-19, -64], [0, -102], [19, -64], [32, -80], [29, -10]]);
      poly('#532d42', [[-22, -19], [-23, -60], [0, -87], [23, -60], [22, -19]], '#8d4e62');
      poly('#8b4155', [[-23, -19], [23, -19], [28, -7], [-28, -7]]);
      rect('#c0a073', -34, -36, 9, 35); rect('#c0a073', 25, -36, 9, 35);
      oval('#e1be7d', -30, -37, 6, 5); oval('#e1be7d', 30, -37, 6, 5);
      light(0, -60, '#c55c7b30', 40); poly('#e9c88b', [[0, -72], [5, -64], [0, -55], [-5, -64]]);
    } else if (kind === 'pyramid') {
      poly('#715d40', [[-116, 24], [14, 68], [121, 14], [-7, -25]]);
      poly('#c8a263', [[-116, 24], [-7, -107], [14, 68]], '#ddbb79');
      poly('#947344', [[-7, -107], [121, 14], [14, 68]], '#b28e55');
      for (let i = 1; i < 7; i++) {
        const t = i / 7;
        line('#ab874f', 1, [[-7 - 109 * t, -107 + 131 * t], [-7 + 21 * t, -107 + 175 * t]]);
        line('#816640', 1, [[-7 + 21 * t, -107 + 175 * t], [-7 + 128 * t, -107 + 121 * t]]);
      }
      poly('#ead19a', [[-7, -107], [-23, -88], [-4, -82], [10, -90]]);
      poly('#3e3a33', [[0, 48], [15, 43], [14, 62], [3, 58]]);
    } else if (kind === 'urn') {
      oval('#5b4b38', 1, 10, 22, 10); oval('#ad7c4c', 0, -9, 20, 26); oval('#d1a76a', -4, -14, 12, 19);
      rect('#7e6748', -12, -37, 24, 10); oval('#d8b777', 0, -37, 13, 4); oval('#554b39', 0, -37, 9, 2);
      line('#426466', 5, [[-18, -6], [18, -6]]);
    } else if (kind === 'palm' || kind === 'willow' || kind === 'deadTree') {
      const palm = kind === 'palm', dead = kind === 'deadTree';
      poly(dead ? '#514048' : '#62583e', [[-13, 11], [-6, -56], [3, -85], [10, -74], [6, -29], [15, 12], [1, 4]]);
      line(dead ? '#715363' : '#827454', 3, [[-4, 2], [0, -40], [4, -69]]);
      if (dead) {
        for (const side of [-1, 1]) {
          line('#55424f', 7, [[0, -32], [side * 30, -57], [side * 42, -91]]);
          line('#78566a', 3, [[side * 29, -57], [side * 53, -63], [side * 63, -83]]);
          line('#55424f', 4, [[side * 35, -75], [side * 22, -88], [side * 24, -106]]);
        }
        line('#55424f', 5, [[5, -62], [15, -105], [5, -124]]);
      } else if (palm) {
        for (let i = 0; i < 7; i++) {
          const a = i / 7 * Math.PI * 2, x = Math.cos(a) * 67, y = -77 + Math.sin(a) * 30;
          poly(i % 2 ? '#42614a' : '#577553', [[3, -79], [x * 0.63, y - 16], [x, y + 17], [x * 0.66, y], [3, -75]]);
          line('#799365', 1, [[3, -78], [x, y + 10]]);
        }
        oval('#6e573c', -3, -70, 5, 7); oval('#665039', 7, -68, 6, 7);
      } else {
        for (let i = 0; i < 7; i++) {
          const x = Math.cos(i * 2.4) * 37, y = -62 + Math.sin(i * 2.4) * 19;
          oval(i % 2 ? '#35563c' : '#294a38', x, y, 33, 29);
          for (let j = 0; j < 3; j++) {
            const xx = x - 19 + j * 16;
            line(j % 2 ? '#527047' : '#406a4c', 3, [[xx, y], [xx - 3, y + 33], [xx + 2, y + 63]]);
          }
        }
        oval('#688452', -17, -82, 12, 3);
      }
    } else if (kind === 'log' || kind === 'stump') {
      if (kind === 'log') { poly('#4b4432', [[-40, -9], [32, -17], [42, 6], [-34, 17]]); line('#7e7350', 3, [[-30, -5], [29, -11]]); oval('#97845b', -34, 3, 10, 14); oval('#4b4936', -34, 3, 5, 8); }
      else { poly('#4c4434', [[-21, -18], [18, -18], [26, 14], [-26, 14]]); oval('#9b8c5e', 0, -17, 21, 10); oval('#665d42', 0, -17, 14, 6); oval('#a28e5c', 0, -17, 9, 3); }
    } else if (kind === 'reeds') {
      for (let i = 0; i < 11; i++) {
        const x = (i - 5) * 5, y = -24 - this._hash(i, seed, 32) * 28;
        line(i % 2 ? '#6b814b' : '#547044', 2, [[x * 0.7, 9], [x, y]]);
        if (i % 2) { line('#9f8654', 4, [[x, y], [x, y - 10]]); }
        else line('#4c764f', 2, [[x * 0.7, 5], [x + 9, y + 10]]);
      }
    } else if (kind === 'pumpkin') {
      light(0, -8, '#df7a3524', 60);
      oval('#9b452c', -11, -5, 18, 23); oval('#b8572d', 11, -5, 18, 23); oval('#d57839', 0, -6, 19, 25);
      line('#ed9850', 2, [[-7, -25], [-12, -14], [-12, 9]]); line('#9d4f2d', 2, [[9, -27], [14, -10], [12, 12]]);
      poly('#ffcf65', [[-16, -11], [-5, -6], [-14, -2]]); poly('#ffcf65', [[16, -11], [5, -6], [14, -2]]);
      poly('#ffd16c', [[-13, 4], [-5, 7], [-1, 3], [3, 8], [13, 3], [9, 13], [-8, 13]]);
      line('#596846', 6, [[0, -28], [1, -36], [7, -39]]);
    } else if (kind === 'tomb') {
      rect('#3b3744', -23, 8, 46, 9);
      poly('#6b626e', [[-17, 8], [-17, -29], [-11, -42], [0, -47], [11, -42], [17, -29], [17, 8]], '#827988');
      line('#443e50', 3, [[0, -32], [0, -5]]); line('#443e50', 3, [[-8, -23], [8, -23]]);
      line('#73614e', 2, [[-25, 13], [21, 13]]);
    } else if (kind === 'fence') {
      for (const y of [-13, -37]) line('#74636d', 3, [[-51, y], [51, y]]);
      for (let x = -48; x <= 48; x += 16) {
        line('#39323f', 4, [[x, 7], [x, -53]]); poly('#a68a83', [[x - 4, -48], [x, -59], [x + 4, -48]]);
      }
    } else if (kind === 'hut' || kind === 'hauntedhouse') {
      const haunted = kind === 'hauntedhouse';
      rect('#222634', -49, -45, 98, 57); rect(haunted ? '#675066' : '#706449', -45, -42, 90, 45);
      for (let y = -35; y < 5; y += 9) line(haunted ? '#4a3a50' : '#504e3b', 2, [[-44, y], [44, y]]);
      poly(haunted ? '#352b42' : '#46513c', [[-63, -40], [-29, -92], [27, -87], [61, -40]], haunted ? '#807083' : '#78815b');
      for (let y = -75; y < -39; y += 11) line(haunted ? '#53435f' : '#69704d', 2, [[-42 - (y + 75) * 0.4, y], [38 + (y + 75) * 0.4, y]]);
      if (haunted) {
        rect('#73576b', 14, -92, 28, 42); poly('#2c2538', [[8, -93], [25, -125], [49, -93]]);
        rect('#e4ac5d', 23, -88, 8, 15); light(27, -80, '#efac5830', 22);
        line('#171d2c', 2, [[28, -121], [28, -136]]);
      }
      rect('#212832', -10, -24, 22, 32); rect('#8e7456', 10, -20, 2, 24);
      for (const x of [-32, 25]) {
        rect('#202e32', x - 8, -31, 18, 21); rect(haunted ? '#e9a859' : '#99b474', x - 6, -29, 14, 17);
        line('#3b3840', 2, [[x + 1, -29], [x + 1, -12]]); line('#3b3840', 2, [[x - 6, -20], [x + 8, -20]]);
        light(x + 1, -21, haunted ? '#de9a5830' : '#a4d78720', 32);
      }
      rect('#89806a', -18, 8, 37, 7); rect('#625b50', -24, 16, 49, 6);
    } else if (kind === 'candle' || kind === 'lantern') {
      line('#91806a', 4, [[0, 8], [0, -45]]); oval('#62594e', 0, 7, 13, 5);
      if (kind === 'candle') {
        line('#ac936d', 3, [[-15, -37], [-15, -28], [15, -28], [15, -37]]);
        for (const x of [-15, 0, 15]) { rect('#cebd8b', x - 2, -48, 4, 12); light(x, -52, '#ffc77828', 36); oval('#f4c075', x, -53, 3, 6); }
      } else {
        light(0, -44, '#ffbd5933', 64); rect('#e1a751', -7, -55, 14, 19); rect('#312d35', -11, -59, 22, 4); rect('#423741', -10, -37, 20, 4);
        line('#6e555c', 2, [[-8, -58], [-8, -35]]); line('#6e555c', 2, [[8, -58], [8, -35]]);
      }
    } else if (kind === 'coral') {
      light(0, -24, '#f0907a24', 50);
      oval('#5c4a44', 0, 6, 20, 7);
      for (const [x, color, lean] of [[-14, '#c8565e', -0.5], [0, '#e2836a', 0], [14, '#b9607e', 0.5]]) {
        line(color, 5, [[x * 0.4, 6], [x, -20], [x + lean * 18, -40]]);
        line(color, 3.5, [[x, -20], [x - 10 + lean * 6, -32]]);
        line(color, 3.5, [[x, -12], [x + 10 + lean * 6, -26]]);
        oval('#f6b39a', x + lean * 18, -41, 3, 3);
      }
    } else if (kind === 'seaweed') {
      const sway = Math.sin(this._clock * 1.6 + seed) * 5;
      ctx.lineWidth = 3.5;
      for (let i = 0; i < 5; i++) {
        const x = (i - 2) * 7;
        ctx.strokeStyle = i % 2 ? '#3f8a5e' : '#2f7053';
        ctx.beginPath(); ctx.moveTo(x, 8); ctx.quadraticCurveTo(x + sway, -28, x - sway * 0.6, -58 - (i % 3) * 10); ctx.stroke();
      }
    } else if (kind === 'rock') {
      poly(id === 'snow' ? '#4c5664' : '#3c4f55', [[-30, 8], [-24, -14], [-6, -24], [14, -20], [30, -4], [26, 10]]);
      poly(id === 'snow' ? '#66717f' : '#56707a', [[-24, -14], [-6, -24], [14, -20], [4, -8], [-14, -6]]);
      poly(id === 'snow' ? '#e3ebf1' : '#4f8a5e', [[-26, -12], [-6, -26], [15, -22], [22, -14], [6, -16], [-12, -10]]);
    } else if (kind === 'anchor') {
      line('#5c4a3a', 4, [[0, -52], [0, 4]]);
      line('#7a6450', 1.4, [[1, -50], [1, 2]]);
      oval('#5c4a3a', 0, -56, 6, 6); oval('#1d3a40', 0, -56, 3, 3);
      line('#5c4a3a', 4, [[-14, -40], [14, -40]]);
      ctx.strokeStyle = '#6a5442'; ctx.lineWidth = 4.5; ctx.beginPath(); ctx.arc(0, -6, 18, 0.15, Math.PI - 0.15); ctx.stroke();
      poly('#6a5442', [[16, -4], [24, -12], [20, 2]]); poly('#6a5442', [[-16, -4], [-24, -12], [-20, 2]]);
      oval('#8a6a4a80', 5, -30, 3, 6);
    } else if (kind === 'shipwreck') {
      light(0, -40, '#7fd0c820', 90);
      poly('#3a2a22', [[-70, 0], [-58, -26], [52, -30], [74, -8], [60, 10], [-56, 12]]);
      poly('#5a4030', [[-58, -26], [52, -30], [48, -18], [-54, -14]]);
      for (let x = -48; x <= 44; x += 16) line('#2a1e18', 1.4, [[x, -24], [x + 3, 8]]);
      poly('#1a1512', [[-10, -6], [6, -8], [2, 8], [-12, 8]]);
      line('#4a3526', 5, [[-12, -28], [-24, -110]]);
      line('#4a3526', 3, [[-20, -86], [8, -92]]);
      poly('#8d8773a0', [[-18, -84], [6, -90], [2, -54], [-14, -50]]);
      line('#6a5a4a', 1, [[-10, -84], [-6, -58]]);
      oval('#2f7053', 40, -2, 10, 4); line('#3f8a5e', 2.5, [[62, 2], [66, -24], [60, -40]]);
    } else if (kind === 'chest') {
      light(0, -10, '#f2c86a30', 44);
      rect('#5c3d24', -18, -14, 36, 22); rect('#7a5232', -18, -14, 36, 6);
      poly('#6b472b', [[-18, -14], [-14, -28], [14, -28], [18, -14]]);
      rect('#c9a24a', -18, -9, 36, 2.5); rect('#c9a24a', -3, -16, 6, 10);
      oval('#f2d78a', -8, -24, 3, 2); oval('#f2d78a', 6, -25, 3, 2); oval('#ffe9a8', -1, -22, 2.4, 1.6);
    } else if (kind === 'pine') {
      rect('#4a3526', -4, -10, 8, 18);
      for (const [y, w] of [[-18, 30], [-40, 24], [-60, 17], [-78, 10]]) {
        poly('#27463f', [[-w, y + 6], [0, y - 24], [w, y + 6]]);
        poly('#355a50', [[-w, y + 6], [0, y - 24], [-w * 0.2, y + 6]]);
        poly('#dfe8ef', [[-w * 0.85, y + 4], [-w * 0.35, y - 4], [0, y - 2], [w * 0.4, y - 5], [w * 0.85, y + 4]]);
      }
      oval('#eef3f7', 0, -103, 4, 3);
    } else if (kind === 'iceCrystal') {
      light(0, -30, '#a8dcf430', 56);
      for (const [x, h, lean, color] of [[-12, 42, -0.3, '#8fc2dc'], [0, 62, 0, '#b8e0f2'], [13, 38, 0.35, '#7fb4d0']]) {
        const tipX = x + Math.sin(lean) * h, tipY = 4 - Math.cos(lean) * h;
        poly(color, [[x - 6, 6], [tipX, tipY], [x + 6, 6]]);
        line('#e8f6fc', 1, [[x - 1, 4], [tipX, tipY + 4]]);
      }
    } else if (kind === 'lamp') {
      light(14, 2, '#ffd98a22', 64);
      light(15, -80, '#ffd98a3a', 60);
      rect('#23262d', -3, -78, 6, 84);
      rect('#3a3e47', -8, 2, 16, 6);
      poly('#2b2f37', [[-3, -80], [16, -88], [18, -84], [0, -76]]);
      poly('#ffe6a8', [[10, -84], [20, -86], [19, -81], [10, -80]]);
      oval('#fff2c8', 15, -82, 4, 2);
    } else if (kind === 'car') {
      const paint = ['#6b2f33', '#2f4a6b', '#4a4f57', '#2f5a45'][Math.abs(Math.round(seed)) % 4];
      poly(paint, [[-46, 2], [-44, -16], [-26, -20], [-16, -34], [18, -34], [30, -20], [46, -16], [48, 2]]);
      poly('#1b2430', [[-12, -31], [0, -31], [0, -21], [-20, -21]]);
      poly('#1b2430', [[4, -31], [15, -31], [24, -21], [4, -21]]);
      line('rgba(170,200,230,.35)', 1.5, [[-8, -29], [-13, -23]]);
      line('rgba(255,255,255,.14)', 2, [[-43, -16], [-26, -19], [30, -19], [45, -15]]);
      rect('#ffe6a0', 43, -14, 5, 4);
      light(50, -12, '#ffe6a030', 22);
      rect('#b8333a', -48, -14, 4, 4);
      for (const x of [-28, 28]) { oval('#0f1216', x, 2, 9, 9); oval('#5b6068', x, 2, 4, 4); }
    } else if (kind === 'hydrant') {
      rect('#8f2226', -8, -2, 16, 6);
      poly('#b8333a', [[-6, -2], [-6, -24], [6, -24], [6, -2]]);
      oval('#c9474d', 0, -24, 7, 4);
      rect('#8f2226', -10, -16, 20, 5);
      oval('#e0c070', 0, -28, 2, 2);
    } else if (kind === 'trashcan') {
      poly('#4c525c', [[-12, 4], [-14, -28], [14, -28], [12, 4]]);
      for (const x of [-7, 0, 7]) line('#3a3f47', 1.5, [[x, 2], [x, -26]]);
      poly('#5d646f', [[-16, -28], [16, -28], [13, -34], [-13, -34]]);
      rect('#3a3f47', -4, -38, 8, 4);
    } else if (kind === 'bench') {
      for (const x of [-26, 22]) rect('#2b2f37', x, -14, 4, 18);
      for (const y of [-16, -10]) rect('#6b4a30', -32, y, 64, 4);
      for (const y of [-30, -24]) rect('#7a5638', -32, y, 64, 4);
      rect('#2b2f37', -30, -30, 3, 18); rect('#2b2f37', 27, -30, 3, 18);
    } else if (kind === 'building' || kind === 'tower') {
      const tower = kind === 'tower';
      const w = tower ? 90 : 120, h = tower ? 240 : 160;
      rect('#1b1e25', -w / 2, -h, w, h);
      rect('#23272f', -w / 2, -h, w * 0.18, h);
      rect('#2c3039', -w / 2 - 6, -h - 8, w + 12, 10);
      for (let row = 0; row < (tower ? 11 : 6); row++) {
        for (let col = 0; col < (tower ? 4 : 5); col++) {
          const lit = this._hash(col + seed, row, 119) > 0.55;
          const x = -w / 2 + 12 + col * (tower ? 19 : 21.5), y = -h + 16 + row * 21;
          rect(lit ? '#f4c86a' : '#11141a', x, y, tower ? 11 : 13, 12);
          if (lit) light(x + 6, y + 6, '#f4c86a18', 18);
        }
      }
      rect('#11141a', -12, -30, 24, 30);
      if (tower) {
        rect('#2c3039', -3, -h - 70, 6, 62);
        light(0, -h - 72, '#ff4d4d55', 18);
        oval('#ff5a5a', 0, -h - 72, 4, 4);
      } else {
        rect('#3a3e47', w / 2 - 34, -h - 30, 22, 22);
        line('#2c3039', 2, [[w / 2 - 30, -h - 8], [w / 2 - 30, -h]]);
      }
    } else if (kind === 'cactus') {
      poly('#3e6b3a', [[-9, 4], [-9, -64], [-4, -72], [4, -72], [9, -64], [9, 4]]);
      poly('#3e6b3a', [[-9, -30], [-24, -30], [-24, -52], [-17, -56], [-15, -38], [-9, -38]]);
      poly('#3e6b3a', [[9, -40], [24, -40], [24, -62], [17, -66], [15, -48], [9, -48]]);
      line('#5f9152', 2, [[-4, -64], [-4, 0]]);
      line('#5f9152', 1.6, [[-20, -50], [-20, -34]]);
      line('#5f9152', 1.6, [[20, -60], [20, -44]]);
      for (let y = -60; y < 0; y += 10) { line('#d9d2a6', 0.8, [[-9, y], [-12, y - 2]]); line('#d9d2a6', 0.8, [[9, y + 4], [12, y + 2]]); }
      oval('#e0647a', 0, -73, 4, 3);
    } else if (kind === 'barrel') {
      oval('#5a3a22', 0, -2, 15, 5);
      poly('#7a5230', [[-14, -2], [-16, -20], [-14, -38], [14, -38], [16, -20], [14, -2]]);
      for (const y of [-8, -32]) rect('#4b4f56', -15, y, 30, 3);
      oval('#8e6238', 0, -38, 14, 4.5);
      oval('#5a3a22', 0, -38, 10, 3);
    } else if (kind === 'haybale') {
      poly('#b8943f', [[-30, 4], [-30, -24], [30, -24], [30, 4]]);
      poly('#d6b25a', [[-30, -24], [-22, -34], [38, -34], [30, -24]]);
      poly('#a07f34', [[30, 4], [30, -24], [38, -34], [38, -6]]);
      for (const x of [-12, 12]) line('#7a5a2a', 1.6, [[x, 4], [x, -24], [x + 8, -34]]);
      for (let i = 0; i < 12; i++) line('#e6c878', 0.8, [[-28 + i * 5, -22], [-26 + i * 5, -18]]);
    } else if (kind === 'cowskull') {
      oval('#e9e1cc', 0, -6, 11, 8);
      oval('#e9e1cc', 0, 2, 7, 6);
      poly('#e9e1cc', [[-9, -10], [-24, -18], [-26, -24], [-18, -16], [-7, -13]]);
      poly('#e9e1cc', [[9, -10], [24, -18], [26, -24], [18, -16], [7, -13]]);
      oval('#3a2e24', -4, -7, 2.6, 3);
      oval('#3a2e24', 4, -7, 2.6, 3);
      oval('#3a2e24', -2, 4, 1.2, 1.6);
      oval('#3a2e24', 2, 4, 1.2, 1.6);
    } else if (kind === 'saloon') {
      rect('#6b4a2e', -90, -110, 180, 110);
      rect('#7d5836', -110, -150, 220, 50);
      for (let y = -104; y < 0; y += 10) line('#5a3d25', 1.5, [[-90, y], [90, y]]);
      rect('#2e1f14', -96, -150, 192, 4);
      rect('#e6d3a4', -60, -140, 120, 28);
      ctx.fillStyle = '#5a2a1c'; ctx.font = 'bold 20px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('SALOON', 0, -125);
      rect('#4a3220', -104, -60, 208, 8);
      for (const x of [-100, -40, 36, 96]) rect('#4a3220', x, -60, 5, 60);
      rect('#2a1c12', -18, -46, 36, 46);
      poly('#8a6238', [[-17, -40], [-1, -40], [-1, -16], [-17, -12]]);
      poly('#8a6238', [[17, -40], [1, -40], [1, -16], [17, -12]]);
      for (const x of [-66, 46]) { rect('#231810', x, -94, 20, 24); rect('#f0b060', x + 2, -92, 16, 20); light(x + 10, -82, '#f2b25a30', 30); }
    } else if (kind === 'watertower') {
      for (const x of [-26, 20]) rect('#5a3d26', x, -70, 6, 74);
      line('#5a3d26', 3, [[-24, -10], [24, -50]]);
      line('#5a3d26', 3, [[24, -10], [-24, -50]]);
      poly('#7a5230', [[-34, -70], [-34, -120], [34, -120], [34, -70]]);
      for (const y of [-80, -110]) rect('#3f3326', -35, y, 70, 3);
      poly('#5a3d26', [[-38, -120], [0, -142], [38, -120]]);
    } else if (kind === 'wagon') {
      for (const x of [-26, 26]) { oval('#3a2a1c', x, -4, 12, 12); oval('#b8945c', x, -4, 9, 9); oval('#3a2a1c', x, -4, 3, 3); for (let a = 0; a < 6; a++) line('#3a2a1c', 1, [[x, -4], [x + Math.cos(a) * 9, -4 + Math.sin(a) * 9]]); }
      rect('#6b4a2e', -40, -24, 80, 14);
      poly('#e8dcc0', [[-36, -24], [-36, -46], [-20, -60], [20, -60], [36, -46], [36, -24]]);
      for (const x of [-18, 0, 18]) line('#c2b494', 1.2, [[x, -24], [x, -58]]);
      line('#6b4a2e', 2, [[40, -16], [62, -10]]);
    } else if (kind === 'cabin') {
      rect('#4a3526', -46, -38, 92, 46);
      for (let y = -32; y < 6; y += 8) line('#3a281c', 2, [[-46, y], [46, y]]);
      poly('#3a2f2a', [[-58, -36], [0, -80], [58, -36]]);
      poly('#e3ebf1', [[-62, -34], [0, -84], [62, -34], [52, -30], [0, -72], [-52, -30]]);
      rect('#2a2320', -9, -22, 18, 30);
      for (const x of [-30, 30]) { rect('#1d2226', x - 8, -30, 16, 14); rect('#f0b060', x - 6, -28, 12, 10); light(x, -23, '#f2b25a34', 30); }
      rect('#6a5a4a', 24, -92, 10, 20); oval('#c8ccd080', 29, -100, 5, 4);
    }
  }
  _drawWorldBoundary(ctx, id, bounds, view) {
    const palette = { castle: ['#1a1d27', '#77707a'], egypt: ['#67563e', '#cbb078'], swamp: ['#152c27', '#56644a'], halloween: ['#211c2e', '#796079'], sea: ['#0e2a33', '#4f8a8f'], snow: ['#4b596b', '#c3d1dd'], city: ['#14161c', '#4d5463'], west: ['#5b3f25', '#c79b62'] }[id];
    ctx.strokeStyle = palette[0]; ctx.lineWidth = 48; ctx.strokeRect(bounds.left, bounds.top, bounds.width, bounds.height);
    ctx.strokeStyle = palette[1]; ctx.lineWidth = 3; ctx.strokeRect(bounds.left + 24, bounds.top + 24, bounds.width - 48, bounds.height - 48);
    const post = (x, y) => {
      if (x < view.left - 25 || x > view.right + 25 || y < view.top - 25 || y > view.bottom + 25) return;
      ctx.fillStyle = palette[0]; ctx.fillRect(x - 17, y - 17, 34, 34);
      ctx.strokeStyle = palette[1]; ctx.lineWidth = 2; ctx.strokeRect(x - 13, y - 13, 26, 26);
    };
    for (let x = bounds.left + 24; x <= bounds.right - 24; x += 160) { post(x, bounds.top + 12); post(x, bounds.bottom - 12); }
    for (let y = bounds.top + 24; y <= bounds.bottom - 24; y += 160) { post(bounds.left + 12, y); post(bounds.right - 12, y); }
  }
  _getMapOverview(id) {
    if (this._mapOverviewCache.has(id)) return this._mapOverviewCache.get(id);
    const map = VesperGame.MAPS.find(item => item.id === id);
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
    const ctx = canvas.getContext('2d');
    ctx.scale(canvas.width / map.width, canvas.height / map.height); ctx.translate(map.width / 2, map.height / 2);
    this._drawOfflineEnvironment(ctx, id, { left: -map.width / 2, top: -map.height / 2, right: map.width / 2, bottom: map.height / 2 });
    this._mapOverviewCache.set(id, canvas); return canvas;
  }
  drawMinimap(canvas) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height, b = this.worldBounds;
    const unit = Math.min(w / 174, h / 131), inset = 3 * unit;
    const scale = Math.min((w - inset * 2) / b.width, (h - inset * 2) / b.height);
    const mw = b.width * scale, mh = b.height * scale, ox = (w - mw) / 2, oy = (h - mh) / 2;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#090e13'; ctx.fillRect(0, 0, w, h); ctx.drawImage(this._getMapOverview(this.mapId), ox, oy, mw, mh);
    ctx.save(); ctx.beginPath(); ctx.rect(ox, oy, mw, mh); ctx.clip();
    ctx.strokeStyle = '#e1d8bd80'; ctx.lineWidth = unit;
    ctx.strokeRect(ox + (this.camera.x - this.width / 2 - b.left) * scale, oy + (this.camera.y - this.height / 2 - b.top) * scale, this.width * scale, this.height * scale);
    for (const boss of this.bosses) {
      ctx.fillStyle = '#efc36b'; ctx.beginPath(); ctx.arc(ox + (boss.x - b.left) * scale, oy + (boss.y - b.top) * scale, 2.4 * unit, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    const x = ox + (this.player.x - b.left) * scale, y = oy + (this.player.y - b.top) * scale;
    ctx.fillStyle = '#f14e5b45'; ctx.beginPath(); ctx.arc(x, y, 7 * unit, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff4555'; ctx.strokeStyle = '#fff2e7'; ctx.lineWidth = 1.1 * unit;
    ctx.beginPath(); ctx.arc(x, y, 3.4 * unit, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore();
  }
  drawMapPreview(canvas, id) {
    const map = VesperGame.MAPS.find(item => item.id === id); if (!map) return;
    const ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
    const colors = { castle: ['#1c1c2b', '#51404f'], egypt: ['#444b59', '#b18a51'], swamp: ['#102e2c', '#3c6750'], halloween: ['#24223f', '#795160'], sea: ['#0b2638', '#1d5a63'], snow: ['#27324b', '#8fa2b8'], city: ['#070a16', '#1e2640'], west: ['#3b2a4a', '#d9884a'] }[id];
    ctx.save(); ctx.setTransform(w / 480, 0, 0, h / 190, 0, 0); ctx.clearRect(0, 0, 480, 190);
    const sky = ctx.createLinearGradient(0, 0, 0, 190); sky.addColorStop(0, colors[0]); sky.addColorStop(1, colors[1]); ctx.fillStyle = sky; ctx.fillRect(0, 0, 480, 190);
    const sunny = id === 'egypt' || id === 'west';
    ctx.fillStyle = id === 'west' ? '#f2b25a' : sunny ? '#e4c995' : '#c8c1b580'; ctx.beginPath(); ctx.arc(362, id === 'west' ? 96 : 42, sunny ? 23 : 20, 0, Math.PI * 2); ctx.fill();
    const ground = ctx.createLinearGradient(0, 115, 0, 190); ground.addColorStop(0, '#10182400'); ground.addColorStop(1, '#080e18d9'); ctx.fillStyle = ground; ctx.fillRect(0, 100, 480, 90);
    const feature = (kind, x, y, scale, alpha = 1) => { ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale); ctx.globalAlpha = alpha; this._drawMapFeature(ctx, id, kind, x); ctx.restore(); };
    if (id === 'castle') {
      ctx.fillStyle = '#191b2a'; ctx.fillRect(139, 55, 166, 114);
      for (const [x, height] of [[124, 107], [216, 139], [293, 107]]) {
        ctx.fillStyle = '#272432'; ctx.fillRect(x, 169 - height, 45, height);
        ctx.beginPath(); ctx.moveTo(x - 8, 169 - height); ctx.lineTo(x + 23, 140 - height); ctx.lineTo(x + 53, 169 - height); ctx.fill();
        for (let y = 187 - height; y < 150; y += 26) { ctx.fillStyle = '#c1896470'; ctx.fillRect(x + 18, y, 7, 12); }
      }
      ctx.fillStyle = '#080f1d'; ctx.beginPath(); ctx.ellipse(242, 154, 17, 30, 0, Math.PI, Math.PI * 2); ctx.lineTo(259, 181); ctx.lineTo(225, 181); ctx.fill();
      ctx.fillStyle = '#68374870'; ctx.beginPath(); ctx.moveTo(228, 157); ctx.lineTo(257, 157); ctx.lineTo(317, 190); ctx.lineTo(175, 190); ctx.fill();
      feature('flag', 89, 173, .95); feature('pillar', 395, 181, 1.1); feature('candle', 344, 177, .7);
    } else if (id === 'egypt') {
      feature('pyramid', 322, 110, .9, .6); feature('pyramid', 195, 147, 1.15); feature('obelisk', 379, 180, 1.15); feature('palm', 61, 182, .9); feature('urn', 117, 185, .55);
    } else if (id === 'swamp') {
      ctx.fillStyle = '#1e4141'; ctx.beginPath(); ctx.ellipse(240, 173, 194, 27, 0, 0, Math.PI * 2); ctx.fill();
      feature('willow', 351, 143, 1.4, .55); feature('hut', 246, 152, 1.1); feature('willow', 95, 175, 1.55); feature('reeds', 378, 190, 1.2);
      for (let i = 0; i < 13; i++) { ctx.fillStyle = '#bee19590'; ctx.fillRect(70 + this._hash(i, 3) * 330, 60 + this._hash(i, 9) * 112, 1.5, 1.5); }
    } else if (id === 'sea') {
      for (let i = 0; i < 14; i++) { ctx.fillStyle = '#bfe7ee70'; ctx.beginPath(); ctx.arc(60 + this._hash(i, 7) * 360, 30 + this._hash(i, 8) * 120, 1 + this._hash(i, 9) * 2, 0, Math.PI * 2); ctx.fill(); }
      feature('shipwreck', 250, 150, 1.1); feature('coral', 88, 184, 1.1); feature('seaweed', 392, 190, 1.2); feature('anchor', 150, 185, .7); feature('rock', 330, 188, .8);
    } else if (id === 'snow') {
      ctx.fillStyle = '#6f8199'; ctx.beginPath(); ctx.moveTo(0, 140); ctx.lineTo(90, 70); ctx.lineTo(170, 125); ctx.lineTo(260, 55); ctx.lineTo(360, 130); ctx.lineTo(480, 80); ctx.lineTo(480, 190); ctx.lineTo(0, 190); ctx.fill();
      ctx.fillStyle = '#c4d0dc'; for (const [x, y] of [[90, 70], [260, 55], [480, 80]]) { ctx.beginPath(); ctx.moveTo(x - 22, y + 18); ctx.lineTo(x, y); ctx.lineTo(x + 22, y + 18); ctx.fill(); }
      feature('pine', 70, 182, 1.2); feature('cabin', 250, 170, 1.05); feature('pine', 400, 186, 1.35); feature('iceCrystal', 150, 186, .8); feature('lantern', 330, 182, .7);
    } else if (id === 'city') {
      for (let i = 0; i < 9; i++) {
        const x = i * 56 - 10, height = 60 + this._hash(i, 5) * 70;
        ctx.fillStyle = i % 2 ? '#121624' : '#171b2b'; ctx.fillRect(x, 150 - height, 52, height);
        for (let y = 162 - height; y < 140; y += 14) for (let wx = x + 8; wx < x + 46; wx += 12) if (this._hash(wx, y, 7) > 0.55) { ctx.fillStyle = '#f4c86a90'; ctx.fillRect(wx, y, 5, 7); }
      }
      feature('tower', 250, 172, .55); feature('lamp', 110, 186, .9); feature('car', 330, 188, .9); feature('hydrant', 60, 186, .8); feature('lamp', 430, 186, .9);
    } else if (id === 'west') {
      ctx.fillStyle = '#6b3b3a'; ctx.beginPath(); ctx.moveTo(0, 150); ctx.lineTo(30, 100); ctx.lineTo(140, 100); ctx.lineTo(165, 150); ctx.moveTo(300, 150); ctx.lineTo(330, 112); ctx.lineTo(440, 112); ctx.lineTo(470, 150); ctx.fill();
      ctx.fillStyle = '#b8895a'; ctx.fillRect(0, 150, 480, 40);
      feature('saloon', 250, 180, .62); feature('cactus', 70, 186, 1.05); feature('barrel', 380, 188, .9); feature('cactus', 440, 188, .8); feature('cowskull', 150, 188, .8);
    } else {
      feature('deadTree', 89, 160, 1.35, .6); feature('hauntedhouse', 254, 158, 1.05); feature('tomb', 369, 176, .8); feature('pumpkin', 122, 177, .9); feature('pumpkin', 405, 186, .65); feature('fence', 184, 190, .8);
    }
    const shade = ctx.createLinearGradient(0, 0, 0, 190); shade.addColorStop(0, '#080d1420'); shade.addColorStop(.6, '#080d1400'); shade.addColorStop(1, '#080d147a'); ctx.fillStyle = shade; ctx.fillRect(0, 0, 480, 190);
    ctx.restore();
  }
  _drawRitual(ctx) {
    if (!this._visible({ x: 0, y: 0 }, 250)) return;
    ctx.save();
    ctx.translate(0, 14);
    ctx.strokeStyle = '#354034';
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.64;
    for (const radius of [124, 137, 179, 183]) {
      ctx.beginPath();
      ctx.ellipse(0, 0, radius, radius * 0.8, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(37,44,34,.28)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 179, 143, 0, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 24; i++) {
      const angle = i / 24 * Math.PI * 2;
      ctx.save();
      ctx.translate(Math.cos(angle) * 155, Math.sin(angle) * 124);
      ctx.rotate(angle + Math.PI / 2);
      ctx.strokeStyle = i % 3 ? '#697157' : '#a48550';
      ctx.globalAlpha = i % 3 ? 0.32 : 0.46;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(-3, -5);
      ctx.lineTo(-3, 5);
      ctx.lineTo(3, -2);
      ctx.lineTo(0, -6);
      if (i % 2) { ctx.moveTo(-5, 0); ctx.lineTo(5, 0); }
      ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 0.14;
    ctx.strokeStyle = '#a98a56';
    ctx.beginPath();
    for (let i = 0; i <= 5; i++) {
      const angle = i * Math.PI * 4 / 5 - Math.PI / 2;
      const x = Math.cos(angle) * 108, y = Math.sin(angle) * 86;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
    this._drawTorch(ctx, -197, -89, 1);
    this._drawTorch(ctx, 196, 100, 3);
    this._drawTorch(ctx, -182, 133, 5);
    this._drawTorch(ctx, 191, -129, 7);
  }
  _drawDecorations(ctx) {
    const size = 280;
    const view = this._view;
    for (let cx = Math.floor((view.left - 80) / size); cx <= Math.ceil((view.right + 80) / size); cx++) {
      for (let cy = Math.floor((view.top - 80) / size); cy <= Math.ceil((view.bottom + 80) / size); cy++) {
        const x = cx * size + this._hash(cx, cy, 1) * 190 + 30;
        const y = cy * size + this._hash(cx, cy, 2) * 190 + 30;
        if (Math.hypot(x, y) < 220) continue;
        const type = this._hash(cx, cy, 3);
        const flip = this._hash(cx, cy, 4) > 0.5 ? 1 : -1;
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(flip, 1);
        if (type < 0.31) {
          ctx.fillStyle = 'rgba(0,0,0,.24)';
          ctx.beginPath(); ctx.ellipse(4, 12, 26, 10, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#1d2722';
          ctx.fillRect(-18, 5, 36, 7);
          ctx.fillStyle = '#39433b';
          ctx.beginPath(); ctx.moveTo(-12, 8); ctx.lineTo(-12, -20); ctx.quadraticCurveTo(0, -35, 12, -20); ctx.lineTo(13, 8); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = '#536052'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(-10, 3); ctx.lineTo(-10, -18); ctx.quadraticCurveTo(0, -30, 10, -18); ctx.stroke();
          ctx.strokeStyle = '#202d26'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(0, -3); ctx.moveTo(-5, -13); ctx.lineTo(5, -13); ctx.stroke();
          ctx.fillStyle = '#42503a'; ctx.fillRect(-14, 4, 13, 3); ctx.fillRect(4, 7, 13, 3);
        } else if (type < 0.63) {
          ctx.fillStyle = 'rgba(0,0,0,.2)';
          ctx.beginPath(); ctx.ellipse(1, 6, 31, 13, 0, 0, Math.PI * 2); ctx.fill();
          for (let i = 0; i < 4; i++) {
            const rx = i * 12 - 20, ry = (i % 2) * 7;
            ctx.fillStyle = i % 2 ? '#354038' : '#2c3831';
            ctx.beginPath(); ctx.moveTo(rx - 9, ry); ctx.lineTo(rx - 6, ry - 11); ctx.lineTo(rx + 5, ry - 14); ctx.lineTo(rx + 12, ry - 4); ctx.lineTo(rx + 8, ry + 4); ctx.closePath(); ctx.fill();
            ctx.strokeStyle = '#4b5547'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(rx - 6, ry - 11); ctx.lineTo(rx + 5, ry - 14); ctx.lineTo(rx + 9, ry - 7); ctx.stroke();
          }
        } else if (type < 0.88) {
          for (let i = 0; i < 8; i++) {
            const angle = i * 2.4;
            ctx.fillStyle = i % 2 ? '#2c3b2a' : '#223125';
            ctx.beginPath(); ctx.ellipse(Math.cos(angle) * 15, Math.sin(angle) * 8, 13, 5, angle, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#465036'; ctx.lineWidth = 0.7;
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(angle) * 25, Math.sin(angle) * 13); ctx.stroke();
          }
        } else {
          ctx.strokeStyle = '#29352c'; ctx.lineWidth = 8;
          ctx.beginPath(); ctx.moveTo(-30, 6); ctx.lineTo(25, -7); ctx.stroke();
          ctx.strokeStyle = '#46513f'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(-29, 2); ctx.lineTo(24, -11); ctx.moveTo(-8, -3); ctx.lineTo(-14, -20); ctx.moveTo(10, -7); ctx.lineTo(20, -26); ctx.stroke();
        }
        ctx.restore();
      }
    }
  }
  _drawTorch(ctx, x, y, phase) {
    const flicker = 1 + Math.sin(this._clock * 9 + phase) * 0.12 + Math.sin(this._clock * 17 + phase) * 0.05;
    ctx.save();
    ctx.translate(x, y);
    const glow = ctx.createRadialGradient(0, -27, 1, 0, -27, 84 * flicker);
    glow.addColorStop(0, 'rgba(215,144,53,.16)');
    glow.addColorStop(1, 'rgba(215,144,53,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(-100, -127, 200, 200);
    ctx.fillStyle = '#0b130f'; ctx.beginPath(); ctx.ellipse(3, 9, 14, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#41453a'; ctx.fillRect(-7, 3, 14, 6);
    ctx.fillStyle = '#534535'; ctx.fillRect(-3, -24, 6, 29);
    ctx.fillStyle = '#968067'; ctx.fillRect(-6, -27, 12, 4);
    ctx.fillStyle = '#c17b3d';
    ctx.beginPath(); ctx.moveTo(-6, -27); ctx.quadraticCurveTo(-9, -36, 0, -47 * flicker); ctx.quadraticCurveTo(0, -35, 6, -33); ctx.quadraticCurveTo(7, -26, -6, -27); ctx.fill();
    ctx.fillStyle = '#f7cc79';
    ctx.beginPath(); ctx.moveTo(-3, -28); ctx.quadraticCurveTo(-5, -32, 1, -39); ctx.quadraticCurveTo(0, -33, 4, -29); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  _drawGem(ctx, gem) {
    const bob = Math.sin(this._clock * 3 + gem.phase) * 2;
    const size = Math.min(11, 5.5 + Math.log2(gem.value / 3 + 1));
    ctx.save(); ctx.translate(gem.x, gem.y + bob);
    ctx.fillStyle = 'rgba(75,207,161,.07)';
    ctx.beginPath(); ctx.arc(0, 0, size * 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#276b5e';
    ctx.beginPath(); ctx.moveTo(0, -size); ctx.lineTo(size * 0.75, 0); ctx.lineTo(0, size); ctx.lineTo(-size * 0.75, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#72d6af';
    ctx.beginPath(); ctx.moveTo(0, -size); ctx.lineTo(0, size * 0.55); ctx.lineTo(-size * 0.75, 0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#a2e6c9'; ctx.lineWidth = 0.75;
    ctx.beginPath(); ctx.moveTo(-size * 0.75, 0); ctx.lineTo(0, -size); ctx.lineTo(size * 0.75, 0); ctx.stroke();
    ctx.restore();
  }
  _drawProjectile(ctx, shot) {
    if (!this._visible(shot, 60)) return;
    if (shot.trail.length) {
      ctx.strokeStyle = 'rgba(214,165,92,.28)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(shot.trail[0].x, shot.trail[0].y);
      for (const point of shot.trail) ctx.lineTo(point.x, point.y);
      ctx.lineTo(shot.x, shot.y); ctx.stroke();
    }
    ctx.save(); ctx.translate(shot.x, shot.y); ctx.rotate(shot.angle);
    ctx.fillStyle = 'rgba(230,179,93,.1)'; ctx.beginPath(); ctx.ellipse(0, 0, 17, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d7a562'; ctx.beginPath(); ctx.moveTo(13, 0); ctx.lineTo(-5, -3); ctx.lineTo(-10, 0); ctx.lineTo(-5, 3); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#fff0bc'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(11, 0); ctx.stroke();
    ctx.restore();
  }
  _drawPlayer(ctx) {
    const p = this.player;
    const invulnerable = p.invulnerability > 0 && Math.floor(this._clock * 16) % 2 === 0;
    ctx.save(); ctx.translate(p.x, p.y);
    const halo = ctx.createRadialGradient(0, 0, 4, 0, 0, 90);
    halo.addColorStop(0, 'rgba(171,153,95,.09)'); halo.addColorStop(1, 'rgba(171,153,95,0)');
    ctx.fillStyle = halo; ctx.fillRect(-90, -90, 180, 180);
    ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.beginPath(); ctx.ellipse(0, 14, 20, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(203,177,110,.25)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(0, 14, 24, 11, 0, 0, Math.PI * 2); ctx.stroke();
    if (invulnerable) ctx.globalAlpha = 0.6;
    this._walkPose(ctx, p.steps, p.walk || 0);
    ctx.scale(p.facing, 1);
    this._drawCharacter(ctx, this._character, p.steps);
    this._drawHeadwear(ctx, this._character, this._accessories);
    ctx.restore();
  }
  _followPet(owner, dt) {
    if (!owner.pet) owner.pet = { x: owner.x - (owner.facing || 1) * 26, y: owner.y + 8, steps: 0, walk: 0, facing: owner.facing || 1, side: owner.facing || 1, ownerX: owner.x };
    const pet = owner.pet;
    const moved = owner.x - pet.ownerX;
    pet.ownerX = owner.x;
    if (Math.abs(moved) > 0.5) pet.side = Math.sign(moved);
    const dx = owner.x - pet.side * 26 - pet.x;
    const dy = owner.y + 8 - pet.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 360) { pet.x += dx; pet.y += dy; }
    else {
      const pull = Math.min(1, dt * 6);
      pet.x += dx * pull;
      pet.y += dy * pull;
    }
    const moving = distance > 3;
    pet.steps += moving ? dt * 14 : 0;
    pet.walk += ((moving ? 1 : 0) - pet.walk) * Math.min(1, dt * 10);
    pet.facing = moving && Math.abs(dx) > 1 ? Math.sign(dx) : (owner.facing || 1);
  }
  _drawPet(ctx, owner, id) {
    const side = owner.facing || 1;
    const pet = owner.pet || { x: owner.x - side * 26, y: owner.y + 8, steps: 0, walk: 0, facing: side };
    ctx.save();
    ctx.translate(pet.x, pet.y);
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.beginPath(); ctx.ellipse(0, 7.5, 9, 3.4, 0, 0, Math.PI * 2); ctx.fill();
    this._walkPose(ctx, pet.steps, pet.walk);
    ctx.scale(pet.facing * 0.42, 0.42);
    this._drawCharacter(ctx, id, pet.steps);
    ctx.restore();
  }
  _walkPose(ctx, steps, walk) {
    const idle = Math.sin(this._clock * 2.2) * 0.5 * (1 - walk);
    ctx.translate(0, idle - Math.abs(Math.sin(steps)) * 1.8 * walk);
    ctx.rotate(Math.sin(steps) * 0.05 * walk);
  }

  drawCharacterPreview(canvas, id, locked = false) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { width, height } = canvas;
    const scale = Math.min(width, height) / 66;
    const place = () => ctx.setTransform(scale, 0, 0, scale, width / 2, height * 0.62);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, width, height);
    place();
    this._drawCharacter(ctx, id, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    if (locked) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = '#26322b';
      ctx.fillRect(0, 0, width, height);
    }
    ctx.globalCompositeOperation = 'destination-over';
    place();
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath(); ctx.ellipse(0, 15, 21, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
  }
  _drawCharacter(ctx, id, steps) {
    ctx.save();
    ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
    if (id === 'ghost') this._drawGhost(ctx);
    else if (id === 'hooded') this._drawHooded(ctx);
    else if (id === 'alien') this._drawAlien(ctx, steps);
    else if (id === 'king') this._drawKing(ctx, steps);
    else if (id === 'spider') this._drawSpider(ctx, steps);
    else if (id === 'robot') this._drawRobot(ctx, steps);
    else this._drawHuman(ctx, steps);
    ctx.restore();
  }
  _roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
  }
  _drawHuman(ctx, steps) {
    const stride = Math.sin(steps) * 1.6;

    ctx.fillStyle = '#1d2226'; ctx.fillRect(-8 + stride, 6, 5, 11); ctx.fillRect(3 - stride, 6, 5, 11);
    ctx.fillStyle = '#4a3325'; ctx.fillRect(-9 + stride, 15, 7, 4); ctx.fillRect(2 - stride, 15, 7, 4);
    ctx.fillStyle = '#2b4450';
    ctx.beginPath(); ctx.moveTo(-8, -7); ctx.lineTo(-13, 4); ctx.lineTo(-9, 6); ctx.lineTo(-5, -3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#d2a07e'; ctx.beginPath(); ctx.arc(-11, 5, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#35596a';
    ctx.beginPath(); ctx.moveTo(-9, -9); ctx.lineTo(9, -9); ctx.lineTo(12, 12); ctx.lineTo(3, 10); ctx.lineTo(0, 13); ctx.lineTo(-3, 10); ctx.lineTo(-12, 12); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#d9ccad'; ctx.fillRect(-1.5, -8, 4, 11);
    ctx.strokeStyle = '#6d93a3'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-8, -6); ctx.lineTo(-11, 11); ctx.moveTo(8, -6); ctx.lineTo(11, 11); ctx.stroke();
    ctx.fillStyle = '#5a3b27'; ctx.fillRect(-10, 2, 21, 3);
    ctx.fillStyle = '#e0b368'; ctx.fillRect(0, 1.5, 4, 4);
    ctx.fillStyle = '#9c3d3a';
    ctx.beginPath(); ctx.ellipse(0.5, -9, 8.5, 3.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-6, -9); ctx.lineTo(-13, -2); ctx.lineTo(-9, -1); ctx.lineTo(-3, -7); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#d7a784';
    ctx.beginPath(); ctx.ellipse(1, -17, 7.5, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4c3020';
    ctx.beginPath(); ctx.moveTo(-7, -15); ctx.quadraticCurveTo(-9, -27, 2, -27); ctx.quadraticCurveTo(10, -27, 9, -19); ctx.lineTo(5, -21); ctx.lineTo(1, -18); ctx.lineTo(-2, -21); ctx.lineTo(-4, -14); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#6b4630'; ctx.beginPath(); ctx.moveTo(-3, -25); ctx.quadraticCurveTo(3, -28, 8, -23); ctx.lineTo(3, -24); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#231a15'; ctx.fillRect(0, -17, 2, 2.4); ctx.fillRect(5, -17, 2, 2.4);
    ctx.strokeStyle = '#9b6a55'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(2, -12); ctx.lineTo(5, -12); ctx.stroke();
    ctx.fillStyle = '#35596a';
    ctx.beginPath(); ctx.moveTo(6, -8); ctx.lineTo(14, -1); ctx.lineTo(11, 3); ctx.lineTo(4, -3); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#c9d1d4'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(15, -3); ctx.lineTo(22, -27); ctx.stroke();
    ctx.strokeStyle = '#f4f7f6'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(15.5, -5); ctx.lineTo(22, -27); ctx.stroke();
    ctx.fillStyle = '#c9d1d4'; ctx.beginPath(); ctx.moveTo(20.5, -26); ctx.lineTo(23.5, -32); ctx.lineTo(23.5, -25.5); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#d7aa5c'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(10, -3); ctx.lineTo(19, 0); ctx.stroke();
    ctx.strokeStyle = '#5a3b27'; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(14, -1); ctx.lineTo(12.5, 4); ctx.stroke();
    ctx.fillStyle = '#d2a07e'; ctx.beginPath(); ctx.arc(13.5, 0.5, 2.8, 0, Math.PI * 2); ctx.fill();
  }
  _drawGhost(ctx) {
    const t = this._clock;
    ctx.translate(0, -3 + Math.sin(t * 2.6) * 2.2);
    const glow = ctx.createRadialGradient(0, -8, 2, 0, -8, 34);
    glow.addColorStop(0, 'rgba(188,232,222,.24)'); glow.addColorStop(1, 'rgba(188,232,222,0)');
    ctx.fillStyle = glow; ctx.fillRect(-36, -44, 72, 72);
    ctx.fillStyle = 'rgba(223,239,233,.93)';
    ctx.beginPath(); ctx.ellipse(15, -6, 3.8, 6.5, -0.7, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-15, -3, 3.5, 6, 0.6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-13, 12); ctx.lineTo(-13, -12);
    ctx.bezierCurveTo(-13, -35, 14, -35, 14, -12);
    ctx.lineTo(14, 12);
    for (let i = 0; i < 4; i++) {
      const from = 14 - i * 6.75, to = from - 6.75;
      ctx.quadraticCurveTo((from + to) / 2, 20 + Math.sin(t * 5 + i * 1.4) * 2.2, to, 12);
    }
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(160,205,200,.7)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = 'rgba(128,170,176,.32)';
    ctx.beginPath(); ctx.moveTo(-13, 12); ctx.lineTo(-13, -12); ctx.bezierCurveTo(-13, -27, -5, -33, 1, -32); ctx.bezierCurveTo(-7, -26, -8, -10, -6, 13); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#1c2a2c';
    ctx.beginPath(); ctx.ellipse(-2, -16, 2.7, 3.8, 0, 0, Math.PI * 2); ctx.ellipse(6.5, -16, 2.7, 3.8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(2.5, -7, 2.3, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f7fffc'; ctx.fillRect(-1.5, -18, 1.3, 1.3); ctx.fillRect(7, -18, 1.3, 1.3);
    ctx.fillStyle = 'rgba(214,142,152,.35)';
    ctx.beginPath(); ctx.arc(-6, -10, 2.2, 0, Math.PI * 2); ctx.arc(11, -10, 2.2, 0, Math.PI * 2); ctx.fill();
  }
  _drawAlien(ctx, steps) {
    const t = this._clock;
    const stride = Math.sin(steps) * 1.5;
    ctx.fillStyle = '#3c484e'; ctx.fillRect(-8 + stride, 6, 5, 11); ctx.fillRect(3 - stride, 6, 5, 11);
    ctx.fillStyle = '#1e272b'; ctx.fillRect(-9 + stride, 15, 7, 4); ctx.fillRect(2 - stride, 15, 7, 4);
    ctx.fillStyle = '#6c7f87';
    ctx.beginPath(); ctx.moveTo(-7, -7); ctx.lineTo(-12, 4); ctx.lineTo(-8, 6); ctx.lineTo(-4, -2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#7fc464'; ctx.beginPath(); ctx.arc(-10, 5, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#93a6ad';
    ctx.beginPath(); ctx.moveTo(-9, -8); ctx.lineTo(9, -8); ctx.lineTo(10, 10); ctx.lineTo(-10, 10); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#bfcdd2'; ctx.beginPath(); ctx.moveTo(-9, -8); ctx.lineTo(9, -8); ctx.lineTo(4, -3); ctx.lineTo(-4, -3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#56666d'; ctx.fillRect(-10, 3, 20, 3);
    ctx.strokeStyle = '#6c7f87'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-6, -2); ctx.lineTo(-7, 9); ctx.moveTo(6, -2); ctx.lineTo(7, 9); ctx.stroke();
    ctx.fillStyle = 'rgba(158,240,122,.3)'; ctx.beginPath(); ctx.arc(0, -1, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#b4f58e'; ctx.beginPath(); ctx.arc(0, -1, 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6aa956'; ctx.fillRect(-2, -11, 5, 4);
    const wobble = Math.sin(t * 4) * 1.5;
    ctx.strokeStyle = '#6aa956'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(-4, -27); ctx.quadraticCurveTo(-8, -33, -10 + wobble, -38); ctx.moveTo(6, -27); ctx.quadraticCurveTo(10, -33, 12 - wobble, -38); ctx.stroke();
    ctx.fillStyle = 'rgba(201,255,138,.3)';
    ctx.beginPath(); ctx.arc(-10 + wobble, -38, 4, 0, Math.PI * 2); ctx.arc(12 - wobble, -38, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d2ff99';
    ctx.beginPath(); ctx.arc(-10 + wobble, -38, 2.1, 0, Math.PI * 2); ctx.arc(12 - wobble, -38, 2.1, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8fd070';
    ctx.beginPath(); ctx.moveTo(1, -8); ctx.bezierCurveTo(-8, -9, -13, -17, -12, -23); ctx.bezierCurveTo(-11, -33, 13, -33, 14, -23); ctx.bezierCurveTo(15, -17, 10, -9, 1, -8); ctx.fill();
    ctx.fillStyle = 'rgba(49,99,52,.4)';
    ctx.beginPath(); ctx.moveTo(1, -8); ctx.bezierCurveTo(-8, -9, -13, -17, -12, -23); ctx.bezierCurveTo(-11, -29, -5, -31, -1, -31); ctx.bezierCurveTo(-7, -27, -8, -15, 1, -8); ctx.fill();
    ctx.fillStyle = '#0f1512';
    for (const [x, angle] of [[-3, 0.55], [7.5, -0.55]]) {
      ctx.save(); ctx.translate(x, -19); ctx.rotate(angle);
      ctx.beginPath(); ctx.ellipse(0, 0, 3.1, 5.3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = '#eafff0'; ctx.beginPath(); ctx.arc(-2.4, -21, 0.95, 0, Math.PI * 2); ctx.arc(8, -21, 0.95, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#3f7a42'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(1, -12); ctx.lineTo(4, -12); ctx.stroke();
    ctx.fillStyle = '#93a6ad';
    ctx.beginPath(); ctx.moveTo(6, -7); ctx.lineTo(13, -1); ctx.lineTo(10, 2); ctx.lineTo(4, -2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#7fc464'; ctx.beginPath(); ctx.arc(12.5, 1, 2.4, 0, Math.PI * 2); ctx.fill();
  }
  _drawKing(ctx, steps) {
    const stride = Math.sin(steps) * 1.4;

    ctx.fillStyle = '#5c1d29';
    ctx.beginPath(); ctx.moveTo(-9, -9); ctx.lineTo(-20, 17); ctx.quadraticCurveTo(-4, 21, 13, 17); ctx.lineTo(9, -9); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#7e2b37';
    ctx.beginPath(); ctx.moveTo(-8, -8); ctx.lineTo(-17, 15); ctx.lineTo(-11, 16); ctx.lineTo(-5, -4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#231e2a'; ctx.fillRect(-7 + stride, 7, 5, 10); ctx.fillRect(3 - stride, 7, 5, 10);
    ctx.fillStyle = '#6b4a2a'; ctx.fillRect(-8 + stride, 15, 7, 4); ctx.fillRect(2 - stride, 15, 7, 4);
    ctx.fillStyle = '#43407a';
    ctx.beginPath(); ctx.moveTo(-9, -8); ctx.lineTo(9, -8); ctx.lineTo(12, 11); ctx.lineTo(-12, 11); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#5b58a0'; ctx.beginPath(); ctx.moveTo(2, -8); ctx.lineTo(9, -8); ctx.lineTo(12, 11); ctx.lineTo(5, 11); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#d7ae5c'; ctx.fillRect(-1.5, -7, 3, 18); ctx.fillRect(-12, 9, 24, 2.2); ctx.fillRect(-10.5, 2, 21, 2.5);
    ctx.fillStyle = '#c8433f'; ctx.fillRect(-1.5, 1.8, 3, 3);
    ctx.fillStyle = '#ece5d3';
    ctx.beginPath(); ctx.ellipse(0, -8, 11.5, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1b1a1d';
    for (const x of [-7, -2, 3, 8]) ctx.fillRect(x, -9 + (x % 2 ? 1 : 0), 1.3, 2.2);
    ctx.fillStyle = '#e0b08b';
    ctx.beginPath(); ctx.ellipse(1, -17, 7, 7.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e6e0d3';
    ctx.beginPath(); ctx.moveTo(-6, -17); ctx.quadraticCurveTo(-6, -8, 1, -4); ctx.quadraticCurveTo(9, -8, 8, -17); ctx.quadraticCurveTo(5, -12, 1, -12); ctx.quadraticCurveTo(-3, -12, -6, -17); ctx.fill();
    ctx.fillStyle = '#c9c1b1';
    ctx.beginPath(); ctx.moveTo(-3, -13); ctx.quadraticCurveTo(1, -16, 1.5, -13.5); ctx.quadraticCurveTo(2, -16, 6, -13); ctx.quadraticCurveTo(2, -11.5, 1.5, -12.5); ctx.quadraticCurveTo(0, -11.5, -3, -13); ctx.fill();
    ctx.fillStyle = '#241c18'; ctx.fillRect(-2, -19, 2, 2.2); ctx.fillRect(4, -19, 2, 2.2);
    ctx.fillStyle = '#e0b34e';
    ctx.beginPath(); ctx.moveTo(-7.5, -21); ctx.lineTo(-9, -31); ctx.lineTo(-4.5, -26); ctx.lineTo(1, -34); ctx.lineTo(6, -26); ctx.lineTo(10.5, -31); ctx.lineTo(9, -21); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#b5862f'; ctx.fillRect(-7.5, -23, 16.5, 2);
    ctx.strokeStyle = '#fbe39a'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(-7, -24); ctx.lineTo(8.5, -24); ctx.stroke();
    ctx.fillStyle = '#fbe39a';
    ctx.beginPath(); ctx.arc(-9, -31, 1.3, 0, Math.PI * 2); ctx.arc(1, -34, 1.4, 0, Math.PI * 2); ctx.arc(10.5, -31, 1.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d4453f'; ctx.beginPath(); ctx.arc(1, -26.5, 1.8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4f84cc'; ctx.beginPath(); ctx.arc(-4.5, -24.5, 1.1, 0, Math.PI * 2); ctx.arc(6.5, -24.5, 1.1, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#43407a';
    ctx.beginPath(); ctx.moveTo(6, -7); ctx.lineTo(14, -1); ctx.lineTo(11, 3); ctx.lineTo(4, -2); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#a97c36'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(15, 15); ctx.lineTo(20, -22); ctx.stroke();
    ctx.strokeStyle = '#ecc573'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(15.8, 12); ctx.lineTo(20.5, -22); ctx.stroke();
    ctx.fillStyle = '#e3b852'; ctx.beginPath(); ctx.arc(20.5, -25.5, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d4453f'; ctx.beginPath(); ctx.arc(20.5, -25.5, 1.9, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#e3b852'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(20.5, -29); ctx.lineTo(20.5, -34); ctx.moveTo(18.3, -32); ctx.lineTo(22.7, -32); ctx.stroke();
    ctx.fillStyle = '#e0b08b'; ctx.beginPath(); ctx.arc(13.5, 0, 2.8, 0, Math.PI * 2); ctx.fill();
  }
  _drawSpider(ctx, steps) {
    const t = this._clock;

    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const near of [false, true]) {
      ctx.strokeStyle = near ? '#4c3c5b' : '#2c2337';
      ctx.lineWidth = near ? 2.7 : 2.3;
      for (let i = 0; i < 4; i++) {
        const phase = steps + i * Math.PI / 2 + (near ? Math.PI : 0);
        const lift = Math.max(0, Math.sin(phase)) * 2.6;
        const spread = i - 1.5;
        const baseX = 4 + spread * 1.6, baseY = near ? 1 : -2;
        const kneeX = baseX + spread * 8.5, kneeY = (near ? -15 : -18) - lift;
        const footX = baseX + spread * 13.5 + Math.cos(phase) * 1.4, footY = (near ? 17 : 12) - lift;
        ctx.beginPath(); ctx.moveTo(baseX, baseY); ctx.lineTo(kneeX, kneeY); ctx.lineTo(footX, footY); ctx.stroke();
      }
    }
    ctx.fillStyle = '#33283d';
    ctx.beginPath(); ctx.ellipse(-8, -1, 13, 11, -0.12, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#6a5879'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(-8, -1, 13, 11, -0.12, Math.PI * 1.08, Math.PI * 1.7); ctx.stroke();
    ctx.strokeStyle = '#4a3b57'; ctx.lineWidth = 0.9;
    ctx.beginPath();
    for (const [x, y] of [[-20, -3], [-19, 4], [-15, 9], [-8, 10], [-17, -8]]) {
      const dx = x + 8, dy = y + 1, length = Math.hypot(dx, dy);
      ctx.moveTo(x, y); ctx.lineTo(x + dx / length * 2.5, y + dy / length * 2.5);
    }
    ctx.stroke();
    ctx.fillStyle = '#b8423c';
    ctx.beginPath(); ctx.moveTo(-12, -7); ctx.lineTo(-4, -7); ctx.lineTo(-8, -2); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-12, 4); ctx.lineTo(-4, 4); ctx.lineTo(-8, -1); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#45364f';
    ctx.beginPath(); ctx.ellipse(7, 1, 8, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5a4868'; ctx.beginPath(); ctx.ellipse(6, -2, 5, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#dccba6'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(10, 6); ctx.quadraticCurveTo(12, 9, 10, 11); ctx.moveTo(13, 5); ctx.quadraticCurveTo(15.5, 8, 13.5, 10); ctx.stroke();
    const pulse = 0.25 + Math.max(0, Math.sin(t * 3)) * 0.15;
    ctx.fillStyle = `rgba(255,95,75,${pulse})`;
    ctx.beginPath(); ctx.arc(11, -1, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff6d58';
    ctx.beginPath(); ctx.arc(10, -1.5, 1.8, 0, Math.PI * 2); ctx.arc(13.5, -0.5, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(8, -4.5, 1, 0, Math.PI * 2); ctx.arc(11.5, -4.8, 1, 0, Math.PI * 2); ctx.arc(14.3, -3.4, 0.9, 0, Math.PI * 2); ctx.arc(7.5, 1.5, 0.9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffe1d6'; ctx.fillRect(9.6, -2.3, 0.8, 0.8); ctx.fillRect(13.1, -1.3, 0.8, 0.8);
  }
  _drawRobot(ctx, steps) {
    const t = this._clock;
    const stride = Math.sin(steps) * 1.5;
    ctx.fillStyle = '#505b61'; ctx.fillRect(-8 + stride, 6, 5, 10); ctx.fillRect(3 - stride, 6, 5, 10);
    ctx.fillStyle = '#7d898f'; ctx.fillRect(-8 + stride, 9, 5, 2); ctx.fillRect(3 - stride, 9, 5, 2);
    ctx.fillStyle = '#2c3438'; this._roundRect(ctx, -10 + stride, 15, 8, 4, 1.2); ctx.fill(); this._roundRect(ctx, 2 - stride, 15, 8, 4, 1.2); ctx.fill();
    ctx.fillStyle = '#5c686e'; this._roundRect(ctx, -15, -6, 5, 12, 2); ctx.fill();
    ctx.fillStyle = '#3c464b'; ctx.fillRect(-15.5, 5, 6, 3);
    ctx.fillStyle = '#8f9ca2'; this._roundRect(ctx, -11, -9, 22, 17, 3); ctx.fill();
    ctx.fillStyle = '#6d797f'; ctx.fillRect(-11, 3, 22, 5);
    ctx.fillStyle = '#b3bec2'; ctx.fillRect(-9, -8, 18, 2);
    ctx.fillStyle = '#243034'; this._roundRect(ctx, -6, -5, 12, 7, 1.5); ctx.fill();
    const alpha = ctx.globalAlpha;
    ['#7ff0e6', '#f2c14e', '#e2574c'].forEach((color, i) => {
      ctx.globalAlpha = alpha * (Math.sin(t * 4 + i * 2.1) > -0.3 ? 1 : 0.35);
      ctx.fillStyle = color; ctx.fillRect(-4 + i * 3.2, -2.5, 2, 2);
    });
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#cfd8db';
    for (const [x, y] of [[-9, -5], [9, -5], [-9, 6], [9, 6]]) { ctx.beginPath(); ctx.arc(x, y, 0.9, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#4f5a60'; ctx.fillRect(-3, -12, 6, 3.5);
    ctx.fillStyle = '#6d797f'; ctx.beginPath(); ctx.arc(-9.5, -19.5, 2.3, 0, Math.PI * 2); ctx.arc(11.5, -19.5, 2.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#aab6bb'; this._roundRect(ctx, -9, -27, 20, 15, 3.5); ctx.fill();
    ctx.fillStyle = '#cad3d6'; ctx.fillRect(-6, -26, 14, 1.8);
    ctx.fillStyle = '#16211f'; this._roundRect(ctx, -6, -23.5, 15, 6.5, 2.5); ctx.fill();
    ctx.fillStyle = 'rgba(127,240,230,.28)'; ctx.fillRect(-5, -22.5, 13, 4.5);
    ctx.fillStyle = '#86f3ea'; ctx.fillRect(-2.5, -22, 3.2, 3.2); ctx.fillRect(4, -22, 3.2, 3.2);
    ctx.fillStyle = '#7d898f'; ctx.fillRect(-4, -15, 11, 1.2);
    ctx.strokeStyle = '#6d797f'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(1, -27); ctx.lineTo(1, -33); ctx.stroke();
    const blink = Math.sin(t * 5) > 0;
    if (blink) { ctx.fillStyle = 'rgba(255,106,85,.3)'; ctx.beginPath(); ctx.arc(1, -35, 4.5, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = blink ? '#ff6a55' : '#8a3a33'; ctx.beginPath(); ctx.arc(1, -35, 2.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#7b878d'; this._roundRect(ctx, 8, -6, 5, 10, 2); ctx.fill();
    ctx.fillStyle = '#5c676d'; this._roundRect(ctx, 10, -1, 12, 5.5, 2); ctx.fill();
    ctx.fillStyle = '#3c464b'; ctx.fillRect(19, -1.5, 3.5, 6.5);
    ctx.fillStyle = 'rgba(127,240,230,.35)'; ctx.beginPath(); ctx.arc(23.5, 1.7, 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#86f3ea'; ctx.beginPath(); ctx.arc(23.5, 1.7, 1.5, 0, Math.PI * 2); ctx.fill();
  }
  _drawHooded(ctx) {
    ctx.fillStyle = '#101714'; ctx.fillRect(-9, 7, 6, 12); ctx.fillRect(4, 6, 6, 12);

    ctx.fillStyle = '#402c36';
    ctx.beginPath(); ctx.moveTo(-10, -9); ctx.lineTo(-20, 14); ctx.lineTo(-9, 11); ctx.lineTo(-2, 18); ctx.lineTo(8, 12); ctx.lineTo(18, 14); ctx.lineTo(11, -8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#78414d';
    ctx.beginPath(); ctx.moveTo(-7, -10); ctx.lineTo(-13, 9); ctx.lineTo(-4, 13); ctx.lineTo(0, -2); ctx.lineTo(6, 13); ctx.lineTo(12, 10); ctx.lineTo(7, -10); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#aa756d'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-8, -5); ctx.lineTo(-13, 10); ctx.moveTo(8, -5); ctx.lineTo(12, 10); ctx.stroke();
    ctx.fillStyle = '#b39260'; ctx.fillRect(-9, 3, 18, 3); ctx.fillStyle = '#e0b572'; ctx.fillRect(-1, 2, 4, 5);
    ctx.fillStyle = '#8f5260';
    ctx.beginPath(); ctx.moveTo(-13, -8); ctx.quadraticCurveTo(-15, -22, -1, -28); ctx.quadraticCurveTo(14, -20, 13, -7); ctx.lineTo(7, -3); ctx.lineTo(-8, -3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#151918';
    ctx.beginPath(); ctx.moveTo(-9, -9); ctx.quadraticCurveTo(-9, -20, -1, -23); ctx.quadraticCurveTo(9, -17, 9, -9); ctx.lineTo(4, -4); ctx.lineTo(-6, -5); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#c68b82'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-11, -11); ctx.quadraticCurveTo(-12, -21, -1, -26); ctx.stroke();
    ctx.fillStyle = '#ecd6a1'; ctx.fillRect(-5, -13, 3, 1.5); ctx.fillRect(3, -13, 3, 1.5);
    ctx.fillStyle = '#ab8d69'; ctx.beginPath(); ctx.arc(13, 1, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#715e47'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(17, 15); ctx.lineTo(21, -23); ctx.stroke();
    ctx.strokeStyle = '#c6a063'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(18, 10); ctx.lineTo(22, -24); ctx.stroke();
    ctx.fillStyle = '#dec083'; ctx.beginPath(); ctx.moveTo(22, -32); ctx.lineTo(27, -25); ctx.lineTo(21, -19); ctx.lineTo(17, -25); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff1c9'; ctx.beginPath(); ctx.moveTo(22, -29); ctx.lineTo(24, -25); ctx.lineTo(21, -22); ctx.closePath(); ctx.fill();
  }
  _drawEnemy(ctx, enemy) {
    const bob = Math.sin(this._clock * (enemy.type === 'bat' ? 9 : 5) + enemy.phase) * 1.5;
    ctx.save(); ctx.translate(enemy.x, enemy.y);
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(0, enemy.radius * 0.7, enemy.radius * 1.04, enemy.radius * 0.43, 0, 0, Math.PI * 2); ctx.fill();
    ctx.translate(0, bob);
    if (enemy.boss) {
      this._drawBossBody(ctx, enemy);
    } else if (enemy.appearance) {
      this._drawThemedEnemyBody(ctx, enemy);
    } else if (enemy.type === 'bat') {
      const flap = Math.sin(this._clock * 11 + enemy.phase) * 7;
      ctx.fillStyle = enemy.hit > 0 ? '#cecaab' : '#66516a';
      ctx.beginPath(); ctx.moveTo(-4, -4); ctx.lineTo(-26, -15 + flap); ctx.lineTo(-21, 0 + flap); ctx.lineTo(-15, -2); ctx.lineTo(-10, 8); ctx.lineTo(-3, 3); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(4, -4); ctx.lineTo(26, -15 + flap); ctx.lineTo(21, 0 + flap); ctx.lineTo(15, -2); ctx.lineTo(10, 8); ctx.lineTo(3, 3); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#a38292'; ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.moveTo(-4, -4); ctx.lineTo(-26, -15 + flap); ctx.moveTo(4, -4); ctx.lineTo(26, -15 + flap); ctx.stroke();
      ctx.fillStyle = enemy.hit > 0 ? '#fff0ca' : '#3e3547'; ctx.beginPath(); ctx.ellipse(0, 0, 7, 11, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-6, -5); ctx.lineTo(-7, -16); ctx.lineTo(-1, -8); ctx.moveTo(6, -5); ctx.lineTo(7, -16); ctx.lineTo(1, -8); ctx.fill();
      ctx.fillStyle = '#f0ae91'; ctx.fillRect(-4, -4, 2, 2); ctx.fillRect(2, -4, 2, 2);
    } else if (enemy.type === 'brute') {
      ctx.fillStyle = enemy.hit > 0 ? '#dccab2' : '#684c45';
      ctx.beginPath(); ctx.moveTo(-16, -17); ctx.lineTo(-28, -3); ctx.lineTo(-23, 16); ctx.lineTo(-9, 11); ctx.lineTo(-8, 23); ctx.lineTo(2, 20); ctx.lineTo(11, 23); ctx.lineTo(12, 12); ctx.lineTo(25, 14); ctx.lineTo(29, -4); ctx.lineTo(16, -18); ctx.closePath(); ctx.fill();
      ctx.fillStyle = enemy.hit > 0 ? '#fce3b5' : '#8e6856'; ctx.beginPath(); ctx.ellipse(0, -8, 17, 20, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#b0a080';
      ctx.beginPath(); ctx.moveTo(-12, -19); ctx.quadraticCurveTo(-29, -25, -22, -38); ctx.lineTo(-16, -27); ctx.lineTo(-5, -23); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(12, -19); ctx.quadraticCurveTo(29, -25, 22, -38); ctx.lineTo(16, -27); ctx.lineTo(5, -23); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#332c29'; ctx.fillRect(-11, -14, 8, 4); ctx.fillRect(3, -14, 8, 4);
      ctx.fillStyle = '#f8bc70'; ctx.fillRect(-8, -13, 4, 2); ctx.fillRect(4, -13, 4, 2);
      ctx.strokeStyle = '#392e2b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(0, 3); ctx.lineTo(7, 0); ctx.stroke();
      ctx.fillStyle = '#c0ab86'; ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(-4, 5); ctx.lineTo(-3, 1); ctx.moveTo(7, 0); ctx.lineTo(4, 5); ctx.lineTo(3, 1); ctx.fill();
    } else if (enemy.type === 'crawler') {
      const step = Math.sin(this._clock * 16 + enemy.phase) * 3;
      ctx.strokeStyle = enemy.hit > 0 ? '#e8d2b5' : '#9b7a50';
      ctx.lineWidth = 2;
      for (const side of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          const y = -7 + i * 6;
          ctx.beginPath(); ctx.moveTo(side * 5, y); ctx.lineTo(side * (14 + (i % 2 ? step : -step)), y - 4); ctx.lineTo(side * 19, y + 4); ctx.stroke();
        }
      }
      ctx.fillStyle = enemy.hit > 0 ? '#e7cba1' : '#725333';
      ctx.beginPath(); ctx.ellipse(0, 1, 8, 12, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ae8351'; ctx.beginPath(); ctx.ellipse(0, -5, 6, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#3c3626'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(5, 0); ctx.moveTo(-5, 4); ctx.lineTo(5, 4); ctx.moveTo(-4, 8); ctx.lineTo(4, 8); ctx.stroke();
      ctx.fillStyle = '#f6cc75'; ctx.fillRect(-4, -8, 2, 2); ctx.fillRect(2, -8, 2, 2);
      ctx.strokeStyle = '#ccb587'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-3, -11); ctx.lineTo(-7, -16); ctx.moveTo(3, -11); ctx.lineTo(7, -16); ctx.stroke();
    } else if (enemy.type === 'skeleton') {
      ctx.strokeStyle = enemy.hit > 0 ? '#fff0c7' : '#b8b39b';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(0, 10); ctx.moveTo(-6, 10); ctx.lineTo(-9, 20); ctx.moveTo(5, 10); ctx.lineTo(8, 20); ctx.moveTo(-8, -1); ctx.lineTo(-15, 8); ctx.moveTo(8, -1); ctx.lineTo(13, 7); ctx.stroke();
      ctx.strokeStyle = '#d2cdb2'; ctx.lineWidth = 1.7;
      for (let rib = 0; rib < 3; rib++) {
        ctx.beginPath(); ctx.moveTo(-7, rib * 4 - 2); ctx.quadraticCurveTo(0, rib * 4 + 3, 7, rib * 4 - 2); ctx.stroke();
      }
      ctx.fillStyle = enemy.hit > 0 ? '#fff3ce' : '#c8c3a7';
      ctx.beginPath(); ctx.ellipse(0, -14, 10, 11, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#343c33';
      ctx.beginPath(); ctx.ellipse(-4, -15, 3, 4, -0.3, 0, Math.PI * 2); ctx.ellipse(4, -15, 3, 4, 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(-4, -7, 8, 2);
      ctx.strokeStyle = '#635f4d'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-2, -9); ctx.lineTo(-2, -4); ctx.moveTo(2, -9); ctx.lineTo(2, -4); ctx.stroke();
      ctx.fillStyle = '#4b6255'; ctx.fillRect(-7, -4, 14, 3); ctx.fillRect(-8, 10, 16, 4);
      ctx.strokeStyle = '#9fa99b'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(14, 9); ctx.lineTo(20, -12); ctx.stroke();
      ctx.strokeStyle = '#d9dfc8'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(15, 7); ctx.lineTo(21, -14); ctx.stroke();
      ctx.strokeStyle = '#ac9569'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(10, 3); ctx.lineTo(20, 6); ctx.stroke();
    } else if (enemy.type === 'wraith') {
      const sway = Math.sin(this._clock * 6 + enemy.phase) * 3;
      ctx.fillStyle = 'rgba(83,164,171,.08)'; ctx.beginPath(); ctx.ellipse(0, 0, 24, 30, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = enemy.hit > 0 ? '#cce8df' : '#497a80';
      ctx.beginPath(); ctx.moveTo(-9, -12); ctx.quadraticCurveTo(-14, -27, 0, -29); ctx.quadraticCurveTo(15, -24, 10, -10); ctx.lineTo(20, 11); ctx.lineTo(10, 5); ctx.lineTo(12 + sway, 22); ctx.lineTo(3, 15); ctx.lineTo(-3 + sway, 27); ctx.lineTo(-8, 13); ctx.lineTo(-16, 17); ctx.lineTo(-12, 4); ctx.lineTo(-21, 11); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#193b43';
      ctx.beginPath(); ctx.moveTo(-7, -13); ctx.quadraticCurveTo(-5, -24, 0, -24); ctx.quadraticCurveTo(7, -22, 7, -13); ctx.lineTo(0, -5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#a9e8de'; ctx.fillRect(-5, -16, 3, 2); ctx.fillRect(3, -16, 3, 2);
      ctx.strokeStyle = '#8abbba'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-10, -8); ctx.quadraticCurveTo(-12, 4, -14, 10); ctx.moveTo(10, -8); ctx.lineTo(16, 7); ctx.moveTo(0, 1); ctx.lineTo(2 + sway, 13); ctx.stroke();
    } else {
      ctx.fillStyle = enemy.hit > 0 ? '#d1e1c9' : '#466554';
      ctx.beginPath(); ctx.moveTo(-10, -12); ctx.lineTo(-20, 8); ctx.lineTo(-14, 6); ctx.lineTo(-13, 18); ctx.lineTo(-5, 12); ctx.lineTo(0, 19); ctx.lineTo(6, 12); ctx.lineTo(13, 17); ctx.lineTo(14, 6); ctx.lineTo(20, 8); ctx.lineTo(10, -12); ctx.closePath(); ctx.fill();
      ctx.fillStyle = enemy.hit > 0 ? '#e5efce' : '#718574'; ctx.beginPath(); ctx.ellipse(0, -10, 11, 12, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#6b7861'; ctx.beginPath(); ctx.moveTo(-9, -17); ctx.lineTo(-15, -28); ctx.lineTo(-13, -12); ctx.moveTo(9, -17); ctx.lineTo(15, -28); ctx.lineTo(13, -12); ctx.fill();
      ctx.fillStyle = '#182f26'; ctx.beginPath(); ctx.ellipse(-5, -11, 3.5, 4, -0.3, 0, Math.PI * 2); ctx.ellipse(5, -11, 3.5, 4, 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#c0db99'; ctx.fillRect(-6, -11, 2, 2); ctx.fillRect(4, -11, 2, 2);
      ctx.strokeStyle = '#344e3e'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-4, -2); ctx.lineTo(4, -2); ctx.moveTo(-2, -4); ctx.lineTo(-2, 0); ctx.moveTo(2, -4); ctx.lineTo(2, 0); ctx.stroke();
      ctx.strokeStyle = '#809079'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(-14, 9); ctx.moveTo(10, 0); ctx.lineTo(14, 9); ctx.stroke();
    }
    if (!enemy.boss && enemy.hp < enemy.maxHp) {
      const width = enemy.radius * 1.75;
      const y = enemy.appearance ? -enemy.radius * 2.25 - 4 : -enemy.radius - 18;
      ctx.fillStyle = '#131c17'; ctx.fillRect(-width / 2, y, width, 3);
      ctx.fillStyle = enemy.type === 'brute' ? '#ce9966' : '#a79373'; ctx.fillRect(-width / 2, y, width * Math.max(0, enemy.hp / enemy.maxHp), 3);
    }
    ctx.restore();
  }
  _drawBossTelegraphs(ctx) {
    for (const boss of this.bosses) {
      if (!this._visible(boss, 430)) continue;
      if (boss.dashState !== 'telegraph' && boss.dashState !== 'dash') continue;
      const charging = boss.dashState === 'telegraph';
      const length = boss.dashSpeed * boss.dashDuration;
      const width = boss.radius + this.player.radius + 5;
      ctx.save();
      ctx.translate(boss.x, boss.y);
      ctx.rotate(Math.atan2(boss.dashY, boss.dashX));
      const pulse = 0.64 + Math.sin(this._clock * 13) * 0.12;
      ctx.fillStyle = boss.superBoss ? 'rgba(199,67,55,.13)' : 'rgba(221,168,62,.12)';
      ctx.fillRect(0, -width, length, width * 2);
      ctx.strokeStyle = boss.superBoss ? '#e98976' : '#efc76a';
      ctx.globalAlpha = charging ? pulse : 0.32;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([9, 7]);
      ctx.strokeRect(0, -width, length, width * 2);
      ctx.setLineDash([]);
      for (let i = 1; i <= 3; i++) {
        const x = length * i / 4;
        ctx.beginPath(); ctx.moveTo(x - 10, -9); ctx.lineTo(x, 0); ctx.lineTo(x - 10, 9); ctx.stroke();
      }
      if (charging) {
        ctx.globalAlpha = 0.85;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 0, boss.radius + 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - boss.dashTimer / boss.dashWindup)); ctx.stroke();
      }
      ctx.restore();
    }
  }
  _drawBossBody(ctx, enemy) {
    if (enemy.appearance && !enemy.finalBoss) {
      this._drawThemedEnemyBody(ctx, enemy);
      return;
    }
    if (enemy.finalBoss && enemy.characterId) {
      ctx.save();
      const accent = this.mapDefinition.accent;
      const aura = ctx.createRadialGradient(0, -12, 7, 0, -12, 105);
      aura.addColorStop(0, accent + '44'); aura.addColorStop(1, accent + '00');
      ctx.fillStyle = aura; ctx.fillRect(-105, -117, 210, 210);
      ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.globalAlpha = 0.7;
      ctx.beginPath(); ctx.ellipse(0, 17, 57, 25, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.save(); ctx.scale(2.35, 2.35);
      this._drawCharacter(ctx, enemy.characterId, this._clock * 2);
      ctx.restore();
      ctx.fillStyle = '#ecc784'; ctx.strokeStyle = '#fff0bb'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-15, -77); ctx.lineTo(-20, -93); ctx.lineTo(-8, -87); ctx.lineTo(0, -100); ctx.lineTo(8, -87); ctx.lineTo(20, -93); ctx.lineTo(15, -77); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(0, -84, 3, 0, Math.PI * 2); ctx.fill();
      if (enemy.hit > 0) {
        ctx.strokeStyle = '#fff1c9'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(0, -16, 37, 45, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
      return;
    }
    const superBoss = enemy.superBoss;
    ctx.save();
    if (superBoss) ctx.scale(1.29, 1.29);
    const aura = ctx.createRadialGradient(0, -9, 7, 0, -9, 75);
    aura.addColorStop(0, superBoss ? 'rgba(196,72,56,.16)' : 'rgba(218,176,78,.14)');
    aura.addColorStop(1, 'rgba(218,176,78,0)');
    ctx.fillStyle = aura; ctx.fillRect(-75, -84, 150, 150);
    ctx.fillStyle = superBoss ? '#632f35' : '#454532';
    ctx.beginPath(); ctx.moveTo(-20, -20); ctx.lineTo(-37, 30); ctx.lineTo(-23, 25); ctx.lineTo(-14, 35); ctx.lineTo(0, 29); ctx.lineTo(15, 35); ctx.lineTo(25, 25); ctx.lineTo(37, 30); ctx.lineTo(20, -20); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#282b24'; ctx.fillRect(-18, 16, 11, 18); ctx.fillRect(7, 16, 11, 18);
    ctx.fillStyle = enemy.hit > 0 ? '#f8e8b5' : superBoss ? '#ad8552' : '#bfa267';
    ctx.beginPath(); ctx.moveTo(-19, -20); ctx.lineTo(-30, -12); ctx.lineTo(-30, 2); ctx.lineTo(-21, 8); ctx.lineTo(-14, 24); ctx.lineTo(0, 28); ctx.lineTo(14, 24); ctx.lineTo(21, 8); ctx.lineTo(30, 2); ctx.lineTo(30, -12); ctx.lineTo(19, -20); ctx.closePath(); ctx.fill();
    ctx.fillStyle = superBoss ? '#6b3b38' : '#62613e';
    ctx.beginPath(); ctx.moveTo(-13, -13); ctx.lineTo(13, -13); ctx.lineTo(17, 9); ctx.lineTo(0, 22); ctx.lineTo(-17, 9); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#e5c98c'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(-25, -10); ctx.lineTo(-18, -15); ctx.moveTo(25, -10); ctx.lineTo(18, -15); ctx.moveTo(-12, -10); ctx.lineTo(-14, 7); ctx.lineTo(0, 18); ctx.lineTo(14, 7); ctx.lineTo(12, -10); ctx.stroke();
    ctx.fillStyle = '#d4af69';
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(7, 1); ctx.lineTo(0, 11); ctx.lineTo(-7, 1); ctx.closePath(); ctx.fill();
    ctx.fillStyle = superBoss ? '#d36158' : '#e7d89c'; ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = enemy.hit > 0 ? '#fff0c7' : '#a68b57';
    ctx.beginPath(); ctx.moveTo(-15, -15); ctx.lineTo(-17, -36); ctx.lineTo(-9, -47); ctx.lineTo(9, -47); ctx.lineTo(17, -36); ctx.lineTo(15, -15); ctx.lineTo(0, -10); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#262d26';
    ctx.beginPath(); ctx.moveTo(-11, -32); ctx.lineTo(-2, -28); ctx.lineTo(-3, -23); ctx.lineTo(-11, -25); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(11, -32); ctx.lineTo(2, -28); ctx.lineTo(3, -23); ctx.lineTo(11, -25); ctx.closePath(); ctx.fill();
    ctx.fillStyle = superBoss ? '#ff8e76' : '#f8e19d'; ctx.fillRect(-9, -28, 6, 2); ctx.fillRect(3, -28, 6, 2);
    ctx.strokeStyle = '#ead096'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(0, -43); ctx.lineTo(0, -15); ctx.moveTo(-12, -37); ctx.lineTo(-7, -43); ctx.moveTo(12, -37); ctx.lineTo(7, -43); ctx.stroke();
    ctx.fillStyle = '#d2b77d';
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(side * 12, -39); ctx.quadraticCurveTo(side * 38, -37, side * 30, -59); ctx.lineTo(side * 24, -48); ctx.lineTo(side * 11, -44); ctx.closePath(); ctx.fill();
    }
    if (superBoss) {
      ctx.strokeStyle = '#b1745f'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(0, -27, 42, Math.PI * 1.02, Math.PI * 1.98); ctx.stroke();
      ctx.fillStyle = '#e4b77a';
      for (let i = 0; i < 5; i++) {
        const angle = Math.PI * 1.12 + i / 4 * Math.PI * 0.76;
        const x = Math.cos(angle) * 43, y = -27 + Math.sin(angle) * 43;
        ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.lineTo(x + 3, y); ctx.lineTo(x, y + 5); ctx.lineTo(x - 3, y); ctx.closePath(); ctx.fill();
      }
    }
    ctx.strokeStyle = '#806b49'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(35, 30); ctx.lineTo(40, -37); ctx.stroke();
    ctx.strokeStyle = '#ddbc78'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(36, 28); ctx.lineTo(41, -37); ctx.stroke();
    ctx.fillStyle = '#d0b47b';
    ctx.beginPath(); ctx.moveTo(40, -53); ctx.lineTo(45, -36); ctx.lineTo(57, -30); ctx.lineTo(50, -18); ctx.lineTo(42, -30); ctx.lineTo(34, -18); ctx.lineTo(29, -30); ctx.lineTo(37, -37); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#f1d69b'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(40, -49); ctx.lineTo(42, -34); ctx.lineTo(53, -29); ctx.stroke();
    ctx.restore();
  }
  _drawMenuCreatures(ctx) {
    const creatures = [
      { x: 248, y: -151, type: 'shade', radius: 16, phase: 2 },
      { x: -112, y: 218, type: 'shade', radius: 16, phase: 5 },
      { x: 298, y: 122, type: 'bat', radius: 12, phase: 1 },
      { x: 91, y: -252, type: 'bat', radius: 12, phase: 3 }
    ];
    ctx.globalAlpha = 0.72;
    for (const creature of creatures) this._drawEnemy(ctx, { ...creature, hp: 1, maxHp: 1, hit: 0 });
    ctx.globalAlpha = 1;
  }
  _drawFireflies(ctx) {
    const view = this._view;
    const cell = 210;
    ctx.fillStyle = '#a7ab77';
    for (let x = Math.floor(view.left / cell); x <= Math.ceil(view.right / cell); x++) {
      for (let y = Math.floor(view.top / cell); y <= Math.ceil(view.bottom / cell); y++) {
        const phase = this._hash(x, y, 9) * Math.PI * 2;
        ctx.globalAlpha = 0.06 + Math.max(0, Math.sin(this._clock * 0.9 + phase)) * 0.22;
        const fx = x * cell + this._hash(x, y, 10) * cell + Math.sin(this._clock * 0.3 + phase) * 12;
        const fy = y * cell + this._hash(x, y, 11) * cell + Math.cos(this._clock * 0.4 + phase) * 9;
        ctx.fillRect(fx, fy, 1.7, 1.7);
      }
    }
    ctx.globalAlpha = 1;
  }
  _drawWeather(ctx) {
    const view = this._view;
    const cell = 150;
    const snow = this.mapId === 'snow';
    ctx.fillStyle = snow ? '#eef4fa' : '#bfe7ee';
    for (let x = Math.floor(view.left / cell); x <= Math.ceil(view.right / cell); x++) {
      for (let y = Math.floor(view.top / cell); y <= Math.ceil(view.bottom / cell); y++) {
        const seed = this._hash(x, y, 31);
        const speed = snow ? 26 + seed * 22 : -(18 + seed * 16);
        const travel = ((this._clock * speed + seed * cell) % cell + cell) % cell;
        const px = x * cell + this._hash(x, y, 32) * cell + Math.sin(this._clock * 0.8 + seed * 6) * 8;
        const py = y * cell + travel;
        const size = snow ? 1.4 + seed * 1.4 : 1 + seed * 2;
        ctx.globalAlpha = snow ? 0.3 + seed * 0.3 : 0.16 + seed * 0.18;
        if (snow) ctx.fillRect(px, py, size, size);
        else { ctx.beginPath(); ctx.arc(px, py, size, 0, Math.PI * 2); ctx.fill(); }
      }
    }
    ctx.globalAlpha = 1;
  }

  _initAudio() {
    try {
      if (!this._audio) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        this._audio = new AudioContext();
        this._master = this._audio.createGain();
        this._master.gain.value = this._muted ? 0 : 0.12;
        this._master.connect(this._audio.destination);
      }
      if (this._audio.state === 'suspended' || this._audio.state === 'interrupted') this._audio.resume().catch(() => {});
    } catch (_) { this._audio = null; }
  }
  _sound(kind) {
    if (!this._audio || this._muted || this._audio.state !== 'running') return;
    try {
      const settings = {
        shot: [720, 240, 0.055, 'triangle', 0.19],
        kill: [160, 60, 0.08, 'triangle', 0.18],
        gem: [1060, 1530, 0.06, 'sine', 0.11],
        hurt: [120, 42, 0.18, 'sawtooth', 0.22],
        level: [440, 880, 0.42, 'sine', 0.34],
        death: [180, 24, 0.65, 'triangle', 0.4],
        boss: [95, 48, 0.75, 'sawtooth', 0.25]
      }[kind];
      const now = this._audio.currentTime;
      const osc = this._audio.createOscillator();
      const gain = this._audio.createGain();
      osc.type = settings[3];
      osc.frequency.setValueAtTime(settings[0], now);
      osc.frequency.exponentialRampToValueAtTime(settings[1], now + settings[2]);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(settings[4], now + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.001, now + settings[2]);
      osc.connect(gain); gain.connect(this._master);
      osc.start(now); osc.stop(now + settings[2] + 0.01);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    } catch (_) {  }
  }
}
VesperGame.DIFFICULTIES = Object.freeze([
  { id: 'easy', name: 'Fácil', hint: 'Monstros mais frágeis, lentos e com menos dano.', enemyHealth: 0.78, enemySpeed: 0.92, enemyDamage: 0.75, spawnInterval: 1.14 },
  { id: 'medium', name: 'Médio', hint: 'A experiência equilibrada do jogo.', enemyHealth: 1, enemySpeed: 1, enemyDamage: 1, spawnInterval: 1 },
  { id: 'hard', name: 'Difícil', hint: 'Monstros bem mais fortes, rápidos e numerosos.', enemyHealth: 1.55, enemySpeed: 1.16, enemyDamage: 1.5, spawnInterval: 0.7 }
].map(mode => Object.freeze(mode)));
VesperGame.MAPS = Object.freeze([
  { id: 'castle', name: 'Castelo', subtitle: 'Mansão do Vampiro', unlockCharacter: 'vampire', bossName: 'VAMPIRO', width: 4800, height: 3600, accent: '#c78491' },
  { id: 'egypt', name: 'Egito Antigo', subtitle: 'Deserto e pirâmides', unlockCharacter: 'mummy', bossName: 'MÚMIA', width: 4800, height: 3600, accent: '#e0b75d' },
  { id: 'swamp', name: 'Pântano', subtitle: 'Lagoas e cabanas', unlockCharacter: 'zombie', bossName: 'ZUMBI', width: 4800, height: 3600, accent: '#79b99b' },
  { id: 'halloween', name: 'Modo Halloween', subtitle: 'Abóboras e cemitério', unlockCharacter: 'jack', bossName: 'JACK O’ LANTERN', width: 4800, height: 3600, accent: '#eaa05f' },
  { id: 'sea', name: 'Fundo do Mar', subtitle: 'Naufrágio e recifes', unlockCharacter: 'kraken', bossName: 'KRAKEN', width: 4800, height: 3600, accent: '#5fb8c4' },
  { id: 'snow', name: 'Montanhas Geladas', subtitle: 'Neve e pinheiros', unlockCharacter: 'yeti', bossName: 'YETI', width: 4800, height: 3600, accent: '#a9c8e6' },
  { id: 'city', name: 'Cidade Sombria', subtitle: 'Ruas à noite', unlockCharacter: 'darkmouse', bossName: 'DARK MOUSE', width: 4800, height: 3600, accent: '#8f9bd6' },
  { id: 'west', name: 'Velho Oeste', subtitle: 'Poeira e saloons', unlockCharacter: 'sheriff', bossName: 'XERIFE', width: 4800, height: 3600, accent: '#d9a05a' }
].map(map => Object.freeze(map)));
window.VesperGame = VesperGame;
