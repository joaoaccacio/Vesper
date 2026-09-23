(() => {
  'use strict';

  const TAU = Math.PI * 2;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  const ARENA = Object.freeze({
    id: 'arena', name: 'Catedral em Ruínas', subtitle: 'Arena Vesper',
    width: 4000, height: 3000, accent: '#d8b066', bossName: 'ARENA', unlockCharacter: null
  });

  const WEAPONS = Object.freeze([
    { tier: 1, name: 'Revólver', damage: 18, interval: 0.53, projectiles: 1, spread: 0.05, speed: 620, hp: 180 },
    { tier: 2, name: 'Pistola', damage: 17, interval: 0.41, projectiles: 1, spread: 0.05, speed: 650, hp: 220 },
    { tier: 3, name: 'Pistola Automática', damage: 14, interval: 0.28, projectiles: 1, spread: 0.07, speed: 670, hp: 260 },
    { tier: 4, name: 'Escopeta', damage: 50, interval: 0.84, projectiles: 1, spread: 0.09, speed: 600, hp: 300 },
    { tier: 5, name: 'Submetralhadora', damage: 16, interval: 0.225, projectiles: 1, spread: 0.08, speed: 700, hp: 340 },
    { tier: 6, name: 'Carabina', damage: 36, interval: 0.42, projectiles: 1, spread: 0.04, speed: 760, hp: 380 },
    { tier: 7, name: 'Rifle', damage: 52, interval: 0.51, projectiles: 1, spread: 0.03, speed: 820, hp: 420 },
    { tier: 8, name: 'Fuzil de Assalto', damage: 27, interval: 0.22, projectiles: 1, spread: 0.06, speed: 800, hp: 460 },
    { tier: 9, name: 'AK-47', damage: 30, interval: 0.21, projectiles: 1, spread: 0.07, speed: 840, hp: 500 },
    { tier: 10, name: 'Metralhadora Vesper', damage: 28, interval: 0.165, projectiles: 1, spread: 0.08, speed: 880, hp: 540 }
  ].map(weapon => Object.freeze(weapon)));

  const SKINS = Object.freeze([
    { id: 'alien', price: 0, skill: null },
    { id: 'spider', price: 150, skill: { id: 'cadence', value: 1.1, label: 'Velocidade de ataque +10%' } },
    { id: 'skeleton', price: 220, skill: { id: 'cadence', value: 1.15, label: 'Velocidade de ataque +15%' } },
    { id: 'orc', price: 300, skill: { id: 'damage', value: 1.2, label: 'Dano +20%' } },
    { id: 'invisible', price: 380, skill: { id: 'speed', value: 1.25, label: 'Velocidade +25%' } },
    { id: 'cyborg', price: 450, skill: { id: 'projectile', value: 1, label: '+1 projétil' } },
    { id: 'plague', price: 520, skill: { id: 'poison', value: 0.4, label: 'Tiros envenenam por 3s' } },
    { id: 'frankenstein', price: 600, skill: { id: 'damage', value: 1.3, label: 'Dano +30%' } }
  ].map(skin => Object.freeze(skin)));

  const BOT_NAMES = Object.freeze([
    'Aaron', 'Adam', 'Adrian', 'Alan', 'Albert', 'Alex', 'Alexis', 'Allison', 'Amanda', 'Amber',
    'Amy', 'Andrea', 'Andrew', 'Angela', 'Anna', 'Anthony', 'Arthur', 'Ashley', 'Austin', 'Barbara',
    'Benjamin', 'Bethany', 'Billy', 'Blake', 'Bobby', 'Bradley', 'Brandon', 'Brenda', 'Brett', 'Brian',
    'Brianna', 'Brittany', 'Brooke', 'Bruce', 'Bryan', 'Caleb', 'Cameron', 'Carl', 'Carlos', 'Carol',
    'Caroline', 'Casey', 'Catherine', 'Chad', 'Charles', 'Charlie', 'Chase', 'Chelsea', 'Cheryl', 'Chris',
    'Christian', 'Christina', 'Claire', 'Cody', 'Cole', 'Colin', 'Connor', 'Corey', 'Courtney', 'Craig',
    'Crystal', 'Curtis', 'Cynthia', 'Dakota', 'Dana', 'Daniel', 'Danielle', 'David', 'Dean', 'Deborah',
    'Denise', 'Dennis', 'Derek', 'Devin', 'Diana', 'Donald', 'Donna', 'Douglas', 'Drew', 'Dustin',
    'Dylan', 'Eddie', 'Edward', 'Elijah', 'Elizabeth', 'Ella', 'Ellie', 'Emily', 'Emma', 'Eric',
    'Erica', 'Erin', 'Ethan', 'Eugene', 'Evan', 'Faith', 'Frank', 'Gabriel', 'Garrett', 'Gary',
    'Gavin', 'George', 'Gina', 'Grace', 'Grant', 'Gregory', 'Hailey', 'Hannah', 'Harold', 'Harry',
    'Heather', 'Heidi', 'Helen', 'Holly', 'Hunter', 'Ian', 'Isaac', 'Isabella', 'Jack', 'Jackson',
    'Jacob', 'James', 'Jamie', 'Janet', 'Jared', 'Jasmine', 'Jason', 'Jeffrey', 'Jenna', 'Jennifer',
    'Jeremy', 'Jesse', 'Jessica', 'Jimmy', 'Joel', 'John', 'Johnny', 'Jonathan', 'Jordan', 'Joseph',
    'Joshua', 'Julia', 'Julie', 'Justin', 'Karen', 'Kate', 'Katherine', 'Kathy', 'Kayla', 'Keith',
    'Kelly', 'Kenneth', 'Kevin', 'Kimberly', 'Kristen', 'Kyle', 'Larry', 'Laura', 'Lauren', 'Leah',
    'Leslie', 'Levi', 'Liam', 'Linda', 'Lindsay', 'Lisa', 'Logan', 'Lori', 'Lucas', 'Luke',
    'Madison', 'Marcus', 'Margaret', 'Maria', 'Mark', 'Martin', 'Mary', 'Mason', 'Matthew', 'Megan',
    'Melissa', 'Michael', 'Michelle', 'Miles', 'Mitchell', 'Molly', 'Monica', 'Morgan', 'Nancy', 'Natalie',
    'Nathan', 'Nicholas', 'Nicole', 'Noah', 'Nora', 'Olivia', 'Oscar', 'Owen', 'Pamela', 'Zachary'
  ]);

  const env = typeof process === 'object' && process.env ? process.env : {};
  const number = (value, fallback) => {
    const parsed = Number(value);
    return value !== '' && value !== undefined && value !== null && Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  };

  const CONFIG = Object.freeze({
    matchSeconds: number(env.VESPER_MATCH_SECONDS, 300), capacity: number(env.VESPER_CAPACITY, 15), levelCap: 10, respawnSeconds: 4, spawnGuard: 2,
    crates: 22, crateHp: 34, crateXp: 20, crateRespawn: 12, crateRadius: 17,
    botFill: number(env.VESPER_BOT_FILL, 8), botStrafe: 0.3, botSpeed: 0.88, botDamage: 0.6, botRange: 560, botHunt: 1400, botAim: 0.34,
    shotLimit: 180, tagRange: 560, tickRate: 20, joinSeconds: 240, graceSeconds: 30,
    reconnectSeconds: 30, humanReward: 2, botReward: 0.5, inputTimeout: 0.6, snapDistance: 420,
    speed: 210, radius: 14, shotRadius: 4, shotLife: 0.9, zoneColumns: 5, zoneRows: 3
  });

  const nextXpFor = level => 22 + (level - 1) * 13;
  const killXpFor = level => 10 + level * 6;
  const weaponFor = level => WEAPONS[clamp(Math.floor(level), 1, CONFIG.levelCap) - 1];
  const skinFor = id => SKINS.find(skin => skin.id === id) || SKINS[0];

  const coinsFor = (rank, level, kills) =>
    (rank === 1 ? 60 : rank === 2 ? 42 : rank === 3 ? 32 : Math.max(6, 26 - rank)) + level * 3 + kills * 2;

  function bonusOf(skinId) {
    const skill = skinFor(skinId).skill;
    const bonus = { damage: 1, cadence: 1, speed: 1, projectile: 0, poison: 0 };
    if (skill && Object.prototype.hasOwnProperty.call(bonus, skill.id)) bonus[skill.id] = skill.value;
    return bonus;
  }

  const bounds = Object.freeze({
    left: -ARENA.width / 2, right: ARENA.width / 2,
    top: -ARENA.height / 2, bottom: ARENA.height / 2,
    width: ARENA.width, height: ARENA.height
  });

  function buildZones() {
    const zones = [];
    for (let row = 0; row < CONFIG.zoneRows; row++) {
      for (let column = 0; column < CONFIG.zoneColumns; column++) {
        zones.push(Object.freeze({
          x: bounds.left + bounds.width * (column + 0.5) / CONFIG.zoneColumns,
          y: bounds.top + bounds.height * (row + 0.5) / CONFIG.zoneRows,
          width: bounds.width / CONFIG.zoneColumns,
          height: bounds.height / CONFIG.zoneRows
        }));
      }
    }
    return Object.freeze(zones);
  }

  const ZONES = buildZones();

  function segmentHit(x1, y1, x2, y2, circle, radius) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared ? clamp(((circle.x - x1) * dx + (circle.y - y1) * dy) / lengthSquared, 0, 1) : 0;
    return (circle.x - x1 - dx * t) ** 2 + (circle.y - y1 - dy * t) ** 2 <= radius * radius ? t : -1;
  }

  class Arena {
    constructor(options = {}) {
      this.random = typeof options.random === 'function' ? options.random : Math.random;
      this.remaining = CONFIG.matchSeconds;
      this.elapsed = 0;
      this.finished = false;
      this.fighters = [];
      this.crates = [];
      this.shots = [];
      this.events = [];
      this.tick = 0;
      this._nextId = 1;
      this._nextShot = 1;
      this._names = this._shuffled(BOT_NAMES.slice());
      this._zones = this._shuffled(ZONES.slice());
      this._zoneCursor = 0;
      for (let i = 0; i < CONFIG.crates; i++) this.crates.push(this._makeCrate(i));
    }

    _shuffled(list) {
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(this.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
      return list;
    }

    _makeCrate(index) {
      return {
        index,
        x: bounds.left + 180 + this.random() * (bounds.width - 360),
        y: bounds.top + 180 + this.random() * (bounds.height - 360),
        hp: CONFIG.crateHp, radius: CONFIG.crateRadius, respawn: 0
      };
    }

    get humans() { return this.fighters.filter(fighter => !fighter.bot).length; }
    get bots() { return this.fighters.filter(fighter => fighter.bot).length; }
    get open() { return this.fighters.length - this.bots < CONFIG.capacity && !this.finished; }

    nextBotName() {
      const used = new Set(this.fighters.map(fighter => fighter.name));
      const free = this._names.find(name => !used.has(name));
      return free || 'Bot ' + this._nextId;
    }

    nextZone(fighter) {
      if (this._zoneCursor < this._zones.length) return this._zones[this._zoneCursor++];
      return this.farthestZone(fighter);
    }

    farthestZone(fighter) {
      let best = ZONES[0];
      let bestDistance = -1;
      for (const zone of ZONES) {
        let nearest = Infinity;
        for (const other of this.fighters) {
          if (other === fighter || !other.alive) continue;
          nearest = Math.min(nearest, Math.hypot(other.x - zone.x, other.y - zone.y));
        }
        if (nearest > bestDistance) { bestDistance = nearest; best = zone; }
      }
      return best;
    }

    place(fighter, zone) {
      const spot = zone || this.farthestZone(fighter);
      const inset = 110;
      fighter.x = clamp(spot.x + (this.random() - 0.5) * Math.max(0, spot.width - inset * 2), bounds.left + inset, bounds.right - inset);
      fighter.y = clamp(spot.y + (this.random() - 0.5) * Math.max(0, spot.height - inset * 2), bounds.top + inset, bounds.bottom - inset);
      return fighter;
    }

    join(options = {}) {
      const bot = Boolean(options.bot);
      const skin = SKINS.some(item => item.id === options.skin) ? options.skin : SKINS[Math.floor(this.random() * SKINS.length)].id;
      const weapon = WEAPONS[0];
      const fighter = {
        id: this._nextId++,
        name: String(options.name || (bot ? this.nextBotName() : 'Jogador')).slice(0, 14),
        skin: bot ? skin : (SKINS.some(item => item.id === options.skin) ? options.skin : 'alien'),
        bot,
        level: 1, xp: 0, nextXp: nextXpFor(1), humanKills: 0, botKills: 0,
        hp: weapon.hp, maxHp: weapon.hp,
        x: 0, y: 0, aim: 0, kills: 0, deaths: 0,
        alive: true, respawn: 0, spawnGuard: CONFIG.spawnGuard,
        fireTimer: 0, poison: 0, poisonDps: 0, poisonBy: 0,
        mx: 0, my: 0, firing: false, lastInput: 0,
        think: 0, strafe: 1, target: null,
        order: this.random()
      };
      fighter.bonus = bonusOf(fighter.skin);
      this.place(fighter, this.nextZone(fighter));
      this.fighters.push(fighter);
      this.events.push({ e: 'join', id: fighter.id, name: fighter.name, skin: fighter.skin, bot: fighter.bot });
      return fighter;
    }

    leave(id) {
      const index = this.fighters.findIndex(fighter => fighter.id === id);
      if (index < 0) return null;
      const [fighter] = this.fighters.splice(index, 1);
      this.shots = this.shots.filter(shot => shot.owner !== id);
      for (const other of this.fighters) if (other.target === fighter) other.target = null;
      this.events.push({ e: 'left', id: fighter.id, name: fighter.name });
      return fighter;
    }

    worstBot() {
      let worst = null;
      for (const fighter of this.fighters) {
        if (!fighter.bot) continue;
        if (!worst || fighter.level < worst.level || (fighter.level === worst.level && fighter.kills < worst.kills)) worst = fighter;
      }
      return worst;
    }

    fill() {
      while (this.fighters.length < CONFIG.capacity) this.join({ bot: true });
    }

    input(id, mx, my, firing) {
      const fighter = this.fighters.find(item => item.id === id && !item.bot);
      if (!fighter) return false;
      const x = Number.isFinite(mx) ? mx : 0;
      const y = Number.isFinite(my) ? my : 0;
      const length = Math.hypot(x, y);
      const divisor = Math.max(1, length);
      fighter.mx = x / divisor;
      fighter.my = y / divisor;
      fighter.firing = Boolean(firing);
      fighter.lastInput = this.elapsed;
      return true;
    }

    nearestRival(fighter) {
      let best = null;
      let bestDistance = Infinity;
      for (const other of this.fighters) {
        if (other === fighter || !other.alive || other.spawnGuard > 0) continue;
        const distance = (other.x - fighter.x) ** 2 + (other.y - fighter.y) ** 2;
        if (distance < bestDistance) { bestDistance = distance; best = other; }
      }
      return best;
    }

    nearestCrate(fighter) {
      let best = null;
      let bestDistance = Infinity;
      for (const crate of this.crates) {
        if (crate.respawn > 0) continue;
        const distance = (crate.x - fighter.x) ** 2 + (crate.y - fighter.y) ** 2;
        if (distance < bestDistance) { bestDistance = distance; best = crate; }
      }
      return best;
    }

    nearestTarget(fighter) {
      const rival = this.nearestRival(fighter);
      const crate = this.nearestCrate(fighter);
      if (!rival || !crate) return rival || crate;
      const distance = target => (target.x - fighter.x) ** 2 + (target.y - fighter.y) ** 2;
      return distance(crate) < distance(rival) ? crate : rival;
    }

    grantXp(fighter, amount) {
      if (fighter.level >= CONFIG.levelCap) return;
      fighter.xp += amount;
      while (fighter.xp >= fighter.nextXp && fighter.level < CONFIG.levelCap) {
        fighter.xp -= fighter.nextXp;
        fighter.level++;
        fighter.nextXp = nextXpFor(fighter.level);
        const weapon = weaponFor(fighter.level);
        const gained = weapon.hp - fighter.maxHp;
        fighter.maxHp = weapon.hp;
        fighter.hp = Math.min(fighter.maxHp, fighter.hp + gained + weapon.hp * 0.25);
        this.events.push({ e: 'level', id: fighter.id, level: fighter.level });
      }
      if (fighter.level >= CONFIG.levelCap) { fighter.xp = 0; fighter.nextXp = nextXpFor(CONFIG.levelCap); }
    }

    hurt(target, amount, byId, poison = 0) {
      if (!target.alive || !(amount > 0) || target.spawnGuard > 0) return;
      target.hp -= amount;
      if (poison > 0) { target.poison = 3; target.poisonDps = poison; target.poisonBy = byId; }
      this.events.push({ e: 'hit', id: target.id, by: byId, damage: Math.round(amount) });
      if (target.hp <= 0) this.kill(target, byId);
    }

    kill(victim, byId) {
      if (!victim.alive) return;
      victim.alive = false;
      victim.hp = 0;
      victim.deaths++;
      victim.respawn = CONFIG.respawnSeconds;
      victim.poison = 0;
      victim.firing = false;
      const killer = this.fighters.find(fighter => fighter.id === byId);
      if (killer && killer !== victim) {
        killer.kills++;
        if (victim.bot) killer.botKills++; else killer.humanKills++;
        this.grantXp(killer, killXpFor(victim.level));
      }
      this.events.push({ e: 'kill', id: victim.id, by: killer && killer !== victim ? killer.id : 0 });
    }

    respawn(fighter) {
      const weapon = weaponFor(fighter.level);
      fighter.alive = true;
      fighter.maxHp = weapon.hp;
      fighter.hp = weapon.hp;
      fighter.spawnGuard = CONFIG.spawnGuard;
      fighter.fireTimer = 0;
      fighter.poison = 0;
      this.place(fighter, this.farthestZone(fighter));
      this.events.push({ e: 'spawn', id: fighter.id, x: Math.round(fighter.x), y: Math.round(fighter.y) });
    }

    fire(fighter) {
      const weapon = weaponFor(fighter.level);
      const count = weapon.projectiles + fighter.bonus.projectile;
      const damage = weapon.damage * fighter.bonus.damage * (fighter.bot ? CONFIG.botDamage : 1);
      const poison = fighter.bonus.poison > 0 ? damage * fighter.bonus.poison : 0;
      fighter.fireTimer = weapon.interval / fighter.bonus.cadence;
      for (let i = 0; i < count; i++) {
        if (this.shots.length >= CONFIG.shotLimit) break;
        const spread = weapon.spread * (count > 1 ? (i / (count - 1) - 0.5) * 2 : (this.random() - 0.5));
        const angle = fighter.aim + spread;
        const shot = {
          id: this._nextShot++,
          x: fighter.x + Math.cos(angle) * 22,
          y: fighter.y - 2 + Math.sin(angle) * 22,
          vx: Math.cos(angle) * weapon.speed, vy: Math.sin(angle) * weapon.speed,
          px: fighter.x, py: fighter.y - 2,
          damage, poison, owner: fighter.id, tier: weapon.tier, life: CONFIG.shotLife
        };
        this.shots.push(shot);
        this.events.push({
          e: 'shot', id: fighter.id, x: Math.round(shot.x), y: Math.round(shot.y),
          a: Number(angle.toFixed(3)), s: weapon.speed, t: weapon.tier, p: poison > 0 ? 1 : 0
        });
      }
    }

    breakCrate(crate, damage, breaker) {
      if (crate.respawn > 0) return;
      crate.hp -= damage;
      if (crate.hp > 0) return;
      crate.respawn = CONFIG.crateRespawn;
      this.grantXp(breaker, CONFIG.crateXp);
      this.events.push({ e: 'crate', index: crate.index, by: breaker.id });
    }

    stepBot(bot, dt) {
      bot.think -= dt;
      if (bot.think <= 0) {
        bot.think = 0.35 + this.random() * 0.45;
        bot.strafe = this.random() < 0.5 ? -1 : 1;
        const rival = this.nearestRival(bot);
        const close = rival && Math.hypot(rival.x - bot.x, rival.y - bot.y) < CONFIG.botHunt;
        bot.target = close && this.random() > 0.2 ? rival : (this.nearestCrate(bot) || rival);
      }
      const target = bot.target;
      const isFighter = Boolean(target && target.skin);
      if (!target || (isFighter && !target.alive) || (!isFighter && target.respawn > 0)) {
        bot.target = null;
        bot.firing = false;
        return;
      }
      const dx = target.x - bot.x;
      const dy = target.y - bot.y;
      const distance = Math.hypot(dx, dy) || 1;
      const prefer = isFighter ? 210 : 24;
      const approach = distance > prefer + 40 ? 1 : distance < prefer - 40 ? -1 : 0;
      const sideways = isFighter ? CONFIG.botStrafe : 0;
      bot.mx = (dx / distance) * approach - (dy / distance) * bot.strafe * sideways;
      bot.my = (dy / distance) * approach + (dx / distance) * bot.strafe * sideways;
      const length = Math.hypot(bot.mx, bot.my) || 1;
      bot.mx /= length;
      bot.my /= length;
      bot.aim = Math.atan2(dy, dx) + (this.random() - 0.5) * Math.max(0.05, CONFIG.botAim - bot.level * 0.02);
      bot.firing = isFighter && distance < CONFIG.botRange;
      if (!isFighter && distance < 40) this.breakCrate(target, weaponFor(bot.level).damage * 0.6, bot);
    }

    stepFighter(fighter, dt) {
      fighter.spawnGuard = Math.max(0, fighter.spawnGuard - dt);
      if (fighter.poison > 0) {
        fighter.poison -= dt;
        this.hurt(fighter, fighter.poisonDps * dt, fighter.poisonBy);
      }
      if (!fighter.alive) {
        fighter.respawn -= dt;
        if (fighter.respawn <= 0) this.respawn(fighter);
        return;
      }
      if (fighter.bot) this.stepBot(fighter, dt);
      else if (this.elapsed - fighter.lastInput > CONFIG.inputTimeout) {
        fighter.mx = 0;
        fighter.my = 0;
        fighter.firing = false;
      }
      const speed = CONFIG.speed * fighter.bonus.speed * (fighter.bot ? CONFIG.botSpeed : 1);
      fighter.x = clamp(fighter.x + fighter.mx * speed * dt, bounds.left + CONFIG.radius + 24, bounds.right - CONFIG.radius - 24);
      fighter.y = clamp(fighter.y + fighter.my * speed * dt, bounds.top + CONFIG.radius + 24, bounds.bottom - CONFIG.radius - 24);
      if (!fighter.bot) {
        const target = this.nearestTarget(fighter);
        if (target) fighter.aim = Math.atan2(target.y - fighter.y, target.x - fighter.x);
        else if (Math.hypot(fighter.mx, fighter.my) > 0.08) fighter.aim = Math.atan2(fighter.my, fighter.mx);
      }
      fighter.fireTimer -= dt;
      if (fighter.firing && fighter.fireTimer <= 0) this.fire(fighter);
    }

    stepShots(dt) {
      for (let i = this.shots.length - 1; i >= 0; i--) {
        const shot = this.shots[i];
        const fromX = shot.px;
        const fromY = shot.py;
        shot.px = shot.x;
        shot.py = shot.y;
        shot.x += shot.vx * dt;
        shot.y += shot.vy * dt;
        shot.life -= dt;
        if (shot.x < bounds.left || shot.x > bounds.right || shot.y < bounds.top || shot.y > bounds.bottom) shot.life = 0;
        let victim = null;
        let earliest = Infinity;
        for (const fighter of this.fighters) {
          if (!fighter.alive || fighter.id === shot.owner || fighter.spawnGuard > 0) continue;
          const hit = segmentHit(fromX, fromY, shot.x, shot.y, fighter, CONFIG.radius + CONFIG.shotRadius);
          if (hit >= 0 && hit < earliest) { earliest = hit; victim = fighter; }
        }
        let crate = null;
        for (const item of this.crates) {
          if (item.respawn > 0) continue;
          const hit = segmentHit(fromX, fromY, shot.x, shot.y, item, item.radius + CONFIG.shotRadius);
          if (hit >= 0 && hit < earliest) { earliest = hit; victim = null; crate = item; }
        }
        if (victim) {
          this.hurt(victim, shot.damage, shot.owner, shot.poison);
          this.shots.splice(i, 1);
        } else if (crate) {
          const breaker = this.fighters.find(fighter => fighter.id === shot.owner);
          if (breaker) this.breakCrate(crate, shot.damage, breaker);
          this.shots.splice(i, 1);
        } else if (shot.life <= 0) this.shots.splice(i, 1);
      }
    }

    step(dt) {
      if (this.finished) return this.drain();
      this.tick++;
      this.elapsed += dt;
      this.remaining = Math.max(0, CONFIG.matchSeconds - this.elapsed);
      for (const fighter of this.fighters.slice()) this.stepFighter(fighter, dt);
      this.stepShots(dt);
      for (const crate of this.crates) {
        if (crate.respawn <= 0) continue;
        crate.respawn -= dt;
        if (crate.respawn > 0) continue;
        const fresh = this._makeCrate(crate.index);
        crate.x = fresh.x;
        crate.y = fresh.y;
        crate.hp = CONFIG.crateHp;
        crate.respawn = 0;
        this.events.push({ e: 'crate', index: crate.index, x: Math.round(crate.x), y: Math.round(crate.y) });
      }
      if (this.remaining <= 0) this.finished = true;
      return this.drain();
    }

    drain() {
      const events = this.events;
      this.events = [];
      return events;
    }

    roster() {
      return this.fighters.map(fighter => ({ id: fighter.id, name: fighter.name, skin: fighter.skin, bot: fighter.bot }));
    }

    crateState() {
      return this.crates.map(crate => ({ index: crate.index, x: Math.round(crate.x), y: Math.round(crate.y), broken: crate.respawn > 0 ? 1 : 0 }));
    }

    snapshot() {
      return {
        k: this.tick,
        r: Number(this.remaining.toFixed(2)),
        f: this.fighters.map(fighter => [
          fighter.id, Math.round(fighter.x), Math.round(fighter.y), Number(fighter.aim.toFixed(2)),
          fighter.level, Math.round(fighter.hp), fighter.maxHp, fighter.kills,
          fighter.alive ? 1 : 0, fighter.alive ? 0 : Number(Math.max(0, fighter.respawn).toFixed(1)),
          Math.round(fighter.xp)
        ]),
        c: this.crates.map(crate => (crate.respawn > 0 ? 0 : 1))
      };
    }

    ranking() {
      const board = this.fighters.slice().sort((a, b) =>
        b.level - a.level || b.kills - a.kills || b.xp - a.xp || a.order - b.order);
      return board.map((fighter, index) => ({
        rank: index + 1, id: fighter.id, name: fighter.name, skin: fighter.skin,
        level: fighter.level, kills: fighter.kills, deaths: fighter.deaths, bot: fighter.bot,
        humanKills: fighter.humanKills, botKills: fighter.botKills
      }));
    }
  }

  const VesperArena = Object.freeze({
    TAU, ARENA, WEAPONS, SKINS, BOT_NAMES, CONFIG, ZONES, bounds,
    clamp, nextXpFor, killXpFor, weaponFor, skinFor, coinsFor, bonusOf, segmentHit, Arena
  });

  if (typeof module === 'object' && module.exports) module.exports = VesperArena;
  else if (typeof window === 'object') window.VesperArena = VesperArena;
})();
