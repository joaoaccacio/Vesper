'use strict';
const fs = require('node:fs');
let html = fs.readFileSync('index.html', 'utf8');
if (html.includes('id="maps-view"')) throw new Error('Campaign layout already migrated.');
const start = html.indexOf('      <div class="menu-panel characters-panel"');
const end = html.indexOf('    </section>', start);
if (start < 0 || end < 0) throw new Error('Expected current Claude menu not found.');
const panels = `      <div class="menu-panel maps-panel" id="maps-view" role="region" aria-labelledby="maps-title" hidden>
        <div class="campaign-heading"><div><p class="panel-kicker">JOGO OFFLINE</p><h2 id="maps-title">Escolha o mapa</h2></div><button class="map-character" id="map-character-btn" aria-label="Trocar personagem"><canvas id="map-character-preview" aria-hidden="true"></canvas><span><small>SEU PERSONAGEM</small><strong id="map-character-name">Humano</strong></span><svg class="icon" aria-hidden="true"><use href="#i-users"/></svg></button></div>
        <div class="campaign-note"><span><svg class="icon" aria-hidden="true"><use href="#i-skull"/></svg>Minichefe · 02:30</span><span><svg class="icon" aria-hidden="true"><use href="#i-crown"/></svg>Chefe final · 04:00</span></div>
        <div class="map-grid" id="map-grid"></div>
        <div class="campaign-bottom"><button class="secondary back-btn" id="maps-back-btn"><svg class="icon" aria-hidden="true"><use href="#i-back"/></svg> VOLTAR</button><span class="campaign-progress" id="maps-progress">0 / 4 CONCLUÍDOS</span></div>
      </div>
      <div class="menu-panel characters-panel" id="characters-view" role="region" aria-labelledby="characters-title" hidden>
        <div class="campaign-heading"><div><p class="panel-kicker">ESCOLHA SUA APARÊNCIA</p><h2 id="characters-title">Personagens</h2></div><span class="campaign-progress" id="characters-progress">3 / 12</span></div>
        <p class="characters-hint">Derrote os chefes finais para conquistar novos personagens. Todos têm os mesmos atributos.</p>
        <div class="roster-heading"><h3>DESBLOQUEIE JOGANDO</h3><span id="earned-count">3 / 8</span></div><div class="character-grid" id="character-grid"></div>
        <div class="roster-heading"><h3>PERSONAGENS POR MOEDAS</h3><span>ONLINE · EM BREVE</span></div><div class="coin-grid" id="coin-grid"></div>
        <p class="coin-note">Disponíveis futuramente com moedas ganhas no modo Online.</p>
        <div class="campaign-bottom"><button class="secondary back-btn" id="characters-back-btn"><svg class="icon" aria-hidden="true"><use href="#i-back"/></svg> VOLTAR</button></div>
      </div>
`;
html = html.slice(0,start) + panels + html.slice(end);
html = html.replace('      <div class="joystick"', `      <aside class="minimap" id="minimap" aria-label="Mapa inteiro"><div class="minimap-header"><span class="minimap-name" id="minimap-name">Castelo</span><span class="player-key"><i></i>VOCÊ</span></div><canvas id="minimap-canvas" width="348" height="262" aria-label="Mapa inteiro da fase. O ponto vermelho indica sua posição."></canvas><div class="stage-objective" id="stage-objective">Minichefe em 02:30</div></aside>
      <div class="joystick"`);
html = html.replace('  </main>', `    <div class="overlay" id="victory-overlay" hidden><section class="dialog victory-dialog" role="dialog" aria-modal="true" aria-labelledby="victory-title"><svg class="icon dialog-seal" aria-hidden="true"><use href="#i-crown"/></svg><p class="dialog-kicker">FASE CONCLUÍDA</p><h2 id="victory-title">Vitória!</h2><div class="victory-stats"><div><strong id="victory-time">04:00</strong><span>TEMPO</span></div><div><strong id="victory-kills">0</strong><span>ABATES</span></div><div><strong id="victory-level">1</strong><span>NÍVEL</span></div></div><div class="victory-unlocks" id="victory-unlocks"></div><div class="victory-buttons"><button class="primary" id="victory-map-btn">ESCOLHER MAPA</button><button class="secondary" id="victory-characters-btn">VER PERSONAGENS</button></div><button class="secondary" id="victory-retry-btn">JOGAR NOVAMENTE</button></section></div>
  </main>`);
html = html.replace('  <script data-module="ui">', '  <script src="vesper-characters.js"></script>\n  <script data-module="ui">');
html = html.replace('</head>', '<style data-module="campaign">\n' + fs.readFileSync('vesper-campaign.css','utf8') + '\n</style>\n</head>');
fs.writeFileSync('index.html', html, 'utf8');
console.log('Campaign screens added while retaining existing menu, HUD and Online artwork.');
