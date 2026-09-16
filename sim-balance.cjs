/* Deterministic balance smoke test: node sim-balance.cjs [seconds] [seeds...]
   Uses normal initial HP/stats, actual automatic attacks and actual level choices.
   Only input is selected; no invulnerability, forced rewards or damage overrides. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { harness } = require('./test-vesper.cjs');

const duration = Number(process.argv[2]) || 360;
const seeds = process.argv.slice(3).length ? process.argv.slice(3).map(Number) : [7, 42];
const maps = ['castle', 'egypt', 'swamp', 'halloween'];
const reports = [];
for (const mapId of maps) for (const seed of seeds) {
  const { game: g } = harness({ width: 1280, height: 800, seed });
  g.setCharacter('human');
  g.start(mapId);
  const bossesSeen = new Map();
  const bossesKilled = [];
  const choices = [];
  const killEnemy = g._killEnemy.bind(g);
  g._killEnemy = function (victim) {
    if (victim.boss && !victim.dead && g.state === 'playing') bossesKilled.push({ spawnAt: victim.spawnAt, finalBoss: victim.finalBoss, at: Number(g.elapsed.toFixed(2)) });
    return killEnemy(victim);
  };
  let heading = { x: 1, y: 0 };
  let lowestHp = g.player.hp;
  let collisions = 0;
  let peakEnemies = 0;
  let step = 0;
  const dt = 0.05;

  function chooseUpgrade() {
    const p = g.player;
    const rank = {
      projectile: 100 - p.projectiles * 6,
      damage: 72,
      cadence: 67,
      speed: p.speed < 255 ? 58 : p.speed < 300 ? 38 : 12,
      pickup: p.pickup < 140 ? 53 : 22,
      vitality: p.hp < p.maxHp * 0.45 ? 110 : p.hp < p.maxHp * 0.7 ? 69 : 18
    };
    const option = [...g._options].sort((a, b) => (rank[b.id] || 0) - (rank[a.id] || 0))[0];
    choices.push({ level: g.level, id: option.id, at: Number(g.elapsed.toFixed(2)) });
    g.chooseUpgrade(option.id);
  }

  function chooseDirection() {
    const p = g.player;
    const nearby = g.enemies.filter(e => !e.dead && Math.hypot(e.x - p.x, e.y - p.y) < 480);
    let target = null, bestValue = -Infinity;
    for (const gem of g.gems) {
      if (gem.attracted) continue;
      const distance = Math.hypot(gem.x - p.x, gem.y - p.y);
      if (distance > 900) continue;
      const value = Math.sqrt(gem.value) / (distance + 45);
      if (value > bestValue) { bestValue = value; target = gem; }
    }
    const finalBoss = g.enemies.find(e => e.finalBoss && !e.dead);
    if(finalBoss && (!target || Math.hypot(finalBoss.x-p.x,finalBoss.y-p.y)>650)) target=finalBoss;
    let goalX, goalY;
    if (target) {
      const dx = target.x - p.x, dy = target.y - p.y, length = Math.hypot(dx, dy) || 1;
      goalX = dx / length; goalY = dy / length;
    } else {
      const radius = Math.hypot(p.x, p.y) || 1;
      goalX = -p.y / radius + (650 - radius) / 650 * p.x / radius;
      goalY = p.x / radius + (650 - radius) / 650 * p.y / radius;
      if (radius < 3) { goalX = 1; goalY = 0; }
      const length = Math.hypot(goalX, goalY) || 1;
      goalX /= length; goalY /= length;
    }
    let best = -Infinity, chosen = heading;
    for (let i = 0; i < 24; ++i) {
      const angle = i * Math.PI / 12;
      const x = Math.cos(angle), y = Math.sin(angle);
      let score = (x * goalX + y * goalY) * 8 + (x * heading.x + y * heading.y) * 1.1;
      const bounds=g.worldBounds;
      const projectedX=p.x+x*p.speed*1.3,projectedY=p.y+y*p.speed*1.3;
      const wallClearance=Math.min(projectedX-bounds.left,bounds.right-projectedX,projectedY-bounds.top,bounds.bottom-projectedY)-p.radius;
      if(wallClearance<150)score-=(150-wallClearance)**2/50;
      for (const e of nearby) {
        const dx = p.x - e.x, dy = p.y - e.y;
        const distance = Math.hypot(dx, dy) || 1;
        for (const future of [0.25, 0.65, 1.05]) {
          const playerX = p.x + x * p.speed * future, playerY = p.y + y * p.speed * future;
          const enemyX = e.x + dx / distance * e.speed * future, enemyY = e.y + dy / distance * e.speed * future;
          const clearance = Math.hypot(playerX - enemyX, playerY - enemyY) - p.radius - e.radius;
          if (clearance < 110) score -= (110 - clearance) ** 2 / 260 * (e.boss ? 1.25 : 1);
          if (clearance < 7) score -= 100;
        }
      }
      if (score > best) { best = score; chosen = { x, y }; }
    }
    heading = chosen;
  }

  while (g.elapsed < duration - dt / 2 && !['gameover','victory'].includes(g.state)) {
    while (g.state === 'upgrade') chooseUpgrade();
    if (step % 3 === 0) chooseDirection();
    g.setMovement(heading.x, heading.y);
    const hpBefore = g.player.hp;
    g._update(dt);
    if (g.player.hp < hpBefore) ++collisions;
    lowestHp = Math.min(lowestHp, g.player.hp);
    peakEnemies = Math.max(peakEnemies, g.enemies.length);
    for (const boss of g.enemies.filter(e => e.boss && !e.dead)) if (!bossesSeen.has(boss.id)) bossesSeen.set(boss.id, { spawnAt: boss.spawnAt, finalBoss: boss.finalBoss, maxHp: boss.maxHp });
    ++step;
  }
  const report = {
    mapId, seed, elapsed: Number(g.elapsed.toFixed(2)), state:g.state, victory:g.state==='victory', survivedToTarget: g.state !== 'gameover',
    level: g.level, kills: g.kills, hp: g.player.hp, maxHp: g.player.maxHp,
    lowestHp, contactHits: collisions, bossesSpawned: [...bossesSeen.values()], bossesKilled,
    liveBosses: g.enemies.filter(e => e.boss && !e.dead).map(e => ({ spawnAt: e.spawnAt, finalBoss:e.finalBoss, hpPercent: Math.round(e.hp / e.maxHp * 100) })),
    peakEnemies, stats: { speed: g.player.speed, damage: g.player.damage, projectiles: g.player.projectiles, attackInterval: g.player.attackInterval, pickup: g.player.pickup },
    choices
  };
  reports.push(report);
  console.log(`map=${mapId} seed=${seed} time=${report.elapsed}s state=${report.state} level=${report.level} kills=${report.kills} HP=${report.hp}/${report.maxHp} bossKills=${bossesKilled.length}/${bossesSeen.size} contactHits=${collisions}`);
}
const sourceSha256 = crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, 'vesper-engine.js'))).digest('hex');
const output = { duration, sourceSha256, policy: '24-direction, world-boundary and collision avoidance with gem attraction and final-boss approach; picks only offered upgrades; normal human HP/stats', reports };
const reportPath = path.join(__dirname, 'balance-report.json');
fs.writeFileSync(reportPath, JSON.stringify(output, null, 2) + '\n');
console.log(`Saved ${reportPath}`);
