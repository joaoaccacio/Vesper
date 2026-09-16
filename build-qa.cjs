// Developer-only visual scenarios. This harness is never included in index.html.
'use strict';
const fs = require('node:fs');
let html = fs.readFileSync('index.html', 'utf8');
const harness = `
  const productionStorage = window.localStorage;
  Object.defineProperty(window, 'localStorage', { value: {
    getItem: key => productionStorage.getItem('vesper.qa.campaign.' + key),
    setItem: (key, value) => productionStorage.setItem('vesper.qa.campaign.' + key, value)
  }});
  const ProductionGame = VesperGame;
  let qaFrozen = true;
  VesperGame = class extends ProductionGame {
    constructor(...args) { super(...args); window.qaGame = this; }
    _update(dt) { if (!qaFrozen) super._update(dt); }
  };
  window.addEventListener('DOMContentLoaded', () => {
    const toolbar = document.createElement('aside');
    toolbar.id = 'qa-tools';
    toolbar.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:30;display:flex;flex-wrap:wrap;gap:4px;max-width:540px;padding:8px;background:#07100fee;border:1px solid #c9a567;font:10px Arial;color:white';
    const status = document.createElement('output');
    status.id = 'qa-status'; status.style.cssText = 'display:block;flex-basis:100%'; status.textContent = 'TESTES · simulação congelada · salvamento isolado';
    toolbar.append(status);
    const game = window.qaGame;
    function startFrozen() {
      qaFrozen = true; game.start(); game.enemies.length = 0;
      game._spawnTimer = Infinity; game._attackTimer = Infinity;
    }
    function scenario(finalBoss) {
      startFrozen();
      if (finalBoss) { game._bossStageCursor = 1; game._stageDefeated.mini = true; }
      game.elapsed = (finalBoss ? 240 : 150) - 0.01;
      ProductionGame.prototype._update.call(game, 0.01);
      const boss = game.bosses[0];
      boss.x = game.player.x + 150; boss.y = game.player.y + 30;
      game._emitHud();
      status.textContent = game.mapId + ' · ' + game.elapsed + 's · ' + boss.name + ' · HP ' + boss.hp + ' · XP ' + boss.xp;
    }
    function add(label, fn) {
      const button = document.createElement('button'); button.textContent = label;
      button.style.cssText = 'padding:7px 10px;background:#263224;color:#eee;border:1px solid #bdad7b;cursor:pointer';
      button.addEventListener('click', fn); toolbar.append(button);
    }
    add('Minichefe 02:30', () => scenario(false));
    add('Final 04:00', () => scenario(true));
    add('Acertar', () => {
      const boss = game.bosses[0]; if (!boss) return;
      game._shoot(); game._updateProjectiles(1); game._emitHud();
      status.textContent = 'Acerto real: ' + Math.ceil(boss.hp) + ' / ' + Math.ceil(boss.maxHp);
    });
    add('Derrotar', () => {
      for (let attempts = 0; game.bosses.length && game.state === 'playing' && attempts < 500; attempts++) {
        game._shoot(); game._updateProjectiles(1);
      }
      game._emitHud();
      status.textContent = game.state + ' · ' + game.bosses.length + ' chefes vivos · ' + game.gems.length + ' gemas · ' + game.gems.reduce((sum,g) => sum + g.value,0) + ' XP';
    });
    add('Seis monstros', () => {
      startFrozen();
      ['shade','bat','crawler','skeleton','wraith','brute'].forEach((type, i) => {
        game._spawnEnemy(type);
        const e = game.enemies[game.enemies.length - 1]; const a = i / 6 * Math.PI * 2;
        e.x = Math.cos(a) * 150; e.y = Math.sin(a) * 150;
      }); game._emitHud(); status.textContent = '6 tipos comuns · pausa de simulação para inspeção visual';
    });
    add('Norte', () => {
      startFrozen(); game.player.y = -900; game.camera.y = -1000; game._clampCamera(); game._emitHud(); status.textContent = game.mapId + ' · marco ao norte';
    });
    add('Limite sudeste', () => {
      startFrozen(); game.player.x = game.worldBounds.right + 100; game.player.y = game.worldBounds.bottom + 100;
      game._clampEntity(game.player); game.camera.x = game.player.x; game.camera.y = game.player.y; game._clampCamera(); game._emitHud();
      status.textContent = 'Limites reais: x=' + game.player.x + ', y=' + game.player.y;
    });
    add('Game over', () => {
      startFrozen(); game._spawnEnemy('brute'); const enemy = game.enemies[0]; enemy.x = game.player.x; enemy.y = game.player.y;
      game.player.hp = 1; game._updateEnemies(.01); status.textContent = 'Dano real: ' + game.state;
    });
    add('Evoluir', () => {
      startFrozen(); game._dropGem(game.player.x,game.player.y,game.nextXp);
      game._updateGems(.02); status.textContent = 'Level up pelo coletor real de XP';
    });
    add('Investida', () => {
      const boss = game.bosses[0]; if (!boss) return;
      boss.dashCooldown = 0;
      ProductionGame.prototype._update.call(game, .02);
      status.textContent = 'Aviso da investida: ' + boss.dashState;
    });
    add('Jogar', () => { qaFrozen = false; game.start(); status.textContent = 'Simulação normal'; });
    add('Ocultar testes', () => { toolbar.hidden = true; toolbar.style.display = 'none'; });
    document.body.append(toolbar);
  });
`;
html = html.replace('<script data-module="ui">', () => '<script>' + harness + '</script>\n<script data-module="ui">');
fs.writeFileSync('qa.html', html, 'utf8');
console.log('Developer visual scenarios written to qa.html.');
