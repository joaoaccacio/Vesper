(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const ui = Object.fromEntries(['arena','hud','menu','toast','pause-btn','sound-btn',
    'upgrade-overlay','pause-overlay','gameover-overlay','choices','hp-text','hp-fill',
    'hp-bar','xp-text','xp-fill','xp-bar','timer','kills','level','boss-hud','boss-bars',
    'joystick','joystick-knob','menu-main','online-view','characters-view','character-grid',
    'characters-new','unlock-note','maps-view','map-grid','coin-grid','difficulty-view',
    'difficulty-choices','difficulty-map-name','difficulty-map-subtitle','victory-overlay',
    'minimap-canvas','minimap-name','stage-objective','online-loading-view','online-hud',
    'online-respawn','online-results-overlay'].map(id => [id, $(id)]));
  const clock = seconds => {
    const total = Math.max(0, Math.floor(seconds));
    return `${Math.floor(total / 60).toString().padStart(2, '0')}:${(total % 60).toString().padStart(2, '0')}`;
  };
  const characters = VesperGame.CHARACTERS;
  const maps = VesperGame.MAPS;
  const difficulties = VesperGame.DIFFICULTIES;
  const campaignCharacters = characters.filter(character => character.unlockType !== 'coins');
  const onlineSkins = VesperGame.ONLINE.skinCatalog();
  let profile = VesperGame.OnlineProfile.load();
  const completedMaps = new Set();
  const seenCharacters = new Set(characters.filter(character => character.unlockType === 'free').map(character => character.id));
  let best = 0;
  let muted = true;
  let characterId = characters[0].id;
  let lastMapId = maps[0].id;
  let pendingMapId = lastMapId;
  let lastDifficultyId = 'medium';
  try {
    const saved = Number(localStorage.getItem('vesper.best.v1'));
    best = Number.isFinite(saved) && saved > 0 ? saved : 0;
    muted = localStorage.getItem('vesper.sound.v1') !== 'on';
    characterId = localStorage.getItem('vesper.character.v1') || characterId;
  } catch (_) {  }
  try {
    const saved = JSON.parse(localStorage.getItem('vesper.progress.v2') || 'null');
    if (saved?.version === 2 && Array.isArray(saved.completedMaps)) {
      for (const id of saved.completedMaps) if (maps.some(map => map.id === id)) completedMaps.add(id);
    }
  } catch (_) {  }
  try {
    const saved = JSON.parse(localStorage.getItem('vesper.unlocks.seen.v2') || '[]');
    if (Array.isArray(saved)) for (const id of saved) if (characters.some(character => character.id === id)) seenCharacters.add(id);
  } catch (_) {  }
  const isUnlocked = character => character.unlockType === 'free'
    || (character.unlockType === 'map' && completedMaps.has(character.unlockMap))
    || (character.unlockType === 'all' && maps.every(map => completedMaps.has(map.id)))
    || (character.unlockType === 'coins' && profile.owned.includes(character.id));
  const isEarned = character => ['map', 'all'].includes(character.unlockType) && isUnlocked(character);
  const unlockedCount = () => campaignCharacters.filter(isUnlocked).length;
  if (!campaignCharacters.some(character => character.id === characterId && isUnlocked(character))) characterId = characters[0].id;
  $('best-time').textContent = best ? clock(best) : '—';
  let game;
  let options = [];
  let toastTimer;
  const bossRows = new Map();
  const keys = new Set();
  let touchX = 0, touchY = 0, pointerId = null;
  function move() {
    let x = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft')) + touchX;
    let y = Number(keys.has('KeyS') || keys.has('ArrowDown')) - Number(keys.has('KeyW') || keys.has('ArrowUp')) + touchY;
    const length = Math.hypot(x, y);
    if (length > 1) { x /= length; y /= length; }
    game?.setMovement(x, y);
  }
  function releaseInput() {
    keys.clear(); touchX = 0; touchY = 0;
    game?.setFiring(false);
    if (pointerId !== null && ui.joystick.hasPointerCapture?.(pointerId)) ui.joystick.releasePointerCapture?.(pointerId);
    pointerId = null;
    ui['joystick-knob'].style.transform = '';
    move();
  }
  function toast(message, duration = 4500) {
    clearTimeout(toastTimer);
    ui.toast.textContent = message;
    ui.toast.hidden = false;
    ui.toast.classList.remove('faded');
    toastTimer = setTimeout(() => ui.toast.classList.add('faded'), duration);
  }
  function currentDialog() {
    return document.querySelector('.overlay:not([hidden]) [role="dialog"]');
  }
  function onState(state) {
    ui.arena.dataset.state = state;
    if (state === 'menu') {
      const view = nextMenuView || 'main';
      nextMenuView = null;
      showMenuView(view, false);
    } else stopPortraits();
    ui.menu.hidden = state !== 'menu';
    ui.hud.hidden = state === 'menu';
    ui['upgrade-overlay'].hidden = state !== 'upgrade';
    ui['pause-overlay'].hidden = state !== 'paused';
    ui['gameover-overlay'].hidden = state !== 'gameover';
    ui['victory-overlay'].hidden = state !== 'victory';
    ui['online-results-overlay'].hidden = state !== 'results';
    $('pause-restart-btn').hidden = Boolean(game && game.onlineActive);
    ui['pause-btn'].disabled = !['playing', 'paused'].includes(state);
    ui['pause-btn'].setAttribute('aria-label', state === 'paused' ? 'Continuar jogo' : 'Pausar jogo');
    ui['pause-btn'].title = state === 'paused' ? 'Continuar (Esc ou P)' : 'Pausar (Esc ou P)';
    ui['pause-btn'].querySelector('use').setAttribute('href', state === 'paused' ? '#i-play' : '#i-pause');
    if (state !== 'playing') releaseInput();
    queueMicrotask(() => {
      if (ui.arena.dataset.state !== state) return;
      const dialog = currentDialog();
      if (dialog) dialog.querySelector('button')?.focus({ preventScroll: true });
      else if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    });
  }
  function onHud(data) {
    const hp = Math.max(0, Math.ceil(data.hp));
    ui['hp-text'].textContent = `${hp} / ${data.maxHp}`;
    ui['hp-fill'].style.width = `${Math.max(0, Math.min(100, data.hp / data.maxHp * 100))}%`;
    ui['hp-bar'].setAttribute('aria-valuemax', data.maxHp);
    ui['hp-bar'].setAttribute('aria-valuenow', hp);
    ui['xp-text'].textContent = `${Math.floor(data.xp)} / ${data.nextXp} XP`;
    ui['xp-fill'].style.width = `${Math.min(100, data.xp / data.nextXp * 100)}%`;
    ui['xp-bar'].setAttribute('aria-valuemax', data.nextXp);
    ui['xp-bar'].setAttribute('aria-valuenow', Math.min(data.xp, data.nextXp));
    ui.timer.textContent = clock(data.elapsed);
    ui.kills.textContent = data.kills.toLocaleString('pt-BR');
    ui.level.textContent = `NV. ${data.level}`;
    updateBossBars(data.bosses || []);
    ui['minimap-name'].textContent = data.mapName || maps.find(map => map.id === lastMapId).name;
    ui['stage-objective'].textContent = data.stageBossStatus || 'Minichefe em 02:30';
    ui['online-hud'].hidden = !data.online;
    ui.timer.setAttribute('aria-label', data.online ? 'Tempo restante da partida' : 'Tempo de sobrevivência');
    if (data.online) renderOnlineHud(data);
    if (game) {
      game.drawMinimap(ui['minimap-canvas']);
      if (game.player && game.camera) {
        const arena = ui.arena.getBoundingClientRect(), minimap = $('minimap');
        const x = (game.player.x - game.camera.x + game.width / 2) / game.width * arena.width;
        const y = (game.player.y - game.camera.y + game.height / 2) / game.height * arena.height;
        minimap.classList.toggle('is-obscuring', x > arena.width - minimap.offsetWidth - 55 && y > arena.height - minimap.offsetHeight - 55);
      }
    }
  }
  function updateBossBars(bosses) {
    const activeIds = new Set(bosses.map(boss => boss.id));
    for (const [id, row] of bossRows) {
      if (!activeIds.has(id)) { row.element.remove(); bossRows.delete(id); }
    }
    ui['boss-hud'].hidden = bosses.length === 0;
    for (const boss of bosses) {
      let row = bossRows.get(boss.id);
      if (!row) {
        const element = document.createElement('section');
        element.className = boss.superBoss ? 'boss-row super-boss' : 'boss-row';
        element.dataset.bossId = boss.id;
        const heading = document.createElement('div'); heading.className = 'boss-heading';
        const name = document.createElement('span'); name.className = 'boss-name';
        const icon = document.createElement('span');
        icon.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-crown"/></svg>';
        const title = document.createElement('span'); title.textContent = boss.name;
        name.append(icon, title);
        const health = document.createElement('span'); health.className = 'boss-health';
        const track = document.createElement('div'); track.className = 'boss-track';
        track.setAttribute('role', 'progressbar');
        track.setAttribute('aria-label', `${boss.finalBoss ? 'Chefe final' : 'Minichefe'}: ${boss.name}`);
        track.setAttribute('aria-valuemin', '0');
        const fill = document.createElement('div'); fill.className = 'boss-fill';
        track.append(fill); heading.append(name, health); element.append(heading, track);
        ui['boss-bars'].append(element);
        row = { element, health, track, fill };
        bossRows.set(boss.id, row);
      }
      const max = Math.ceil(boss.maxHp);
      const hp = Math.max(0, Math.min(max, Math.ceil(boss.hp)));
      row.health.textContent = `${hp} / ${max}`;
      row.track.setAttribute('aria-valuemax', max);
      row.track.setAttribute('aria-valuenow', hp);
      row.fill.style.width = `${Math.max(0, Math.min(100, boss.hp / boss.maxHp * 100))}%`;
    }
  }
  const iconFor = id => ({damage:'blade',speed:'wind',projectile:'multi',projectiles:'multi',multishot:'multi',cadence:'bolt',attack:'bolt',haste:'bolt',pickup:'gem',magnet:'gem',health:'heart',vitality:'heart',fireRate:'bolt'}[id] || 'sigil');
  function onLevelUp(choices) {
    options = choices;
    $('upgrade-level').textContent = `NÍVEL ${game.level}`;
    ui.choices.replaceChildren();
    choices.forEach((choice, index) => {
      const button = document.createElement('button');
      button.className = 'upgrade';
      button.type = 'button';
      button.dataset.upgrade = choice.id;
      const emblem = document.createElement('span');
      emblem.className = 'upgrade-icon';
      emblem.innerHTML = `<svg class="icon" aria-hidden="true"><use href="#i-${iconFor(choice.id)}"/></svg>`;
      const number = document.createElement('kbd'); number.textContent = index + 1;
      const title = document.createElement('h3'); title.textContent = choice.title;
      const description = document.createElement('p'); description.textContent = choice.description;
      const detail = document.createElement('span'); detail.className = 'upgrade-detail'; detail.textContent = choice.detail || 'VALE ATÉ O FIM DA PARTIDA';
      button.append(emblem, number, title, description, detail);
      button.addEventListener('click', () => selectUpgrade(index));
      ui.choices.append(button);
    });
  }
  function selectUpgrade(index) {
    if (game.state !== 'upgrade' || !options[index]) return;
    const chosen = options[index];
    releaseInput();
    game.chooseUpgrade(chosen.id);
  }
  function commitRecord(seconds) {
    if (!(seconds > best)) return { record: false };
    best = seconds;
    try { localStorage.setItem('vesper.best.v1', String(best)); } catch (_) {  }
    $('best-time').textContent = clock(best);
    updateNewBadge();
    return { record: true };
  }
  function onGameOver(data) {
    $('final-time').textContent = clock(data.elapsed);
    $('final-kills').textContent = data.kills.toLocaleString('pt-BR');
    $('final-level').textContent = data.level;
    $('final-bosses').textContent = data.bossKills || 0;
    const { record } = commitRecord(data.elapsed);
    $('record-note').textContent = record ? 'NOVO RECORDE' : `RECORDE ${clock(best)}`;
    ui['unlock-note'].hidden = true;
    ui['unlock-note'].textContent = '';
  }
  function onVictory(data) {
    const map = maps.find(candidate => candidate.id === data.mapId);
    if (!map) return;
    const before = new Set(characters.filter(isUnlocked).map(character => character.id));
    completedMaps.add(map.id);
    try { localStorage.setItem('vesper.progress.v2', JSON.stringify({ version: 2, completedMaps: [...completedMaps] })); } catch (_) {  }
    commitRecord(data.elapsed);
    updateNewBadge();
    $('victory-title').textContent = `${map.name} concluído`;
    $('victory-time').textContent = clock(data.elapsed);
    $('victory-kills').textContent = data.kills.toLocaleString('pt-BR');
    $('victory-level').textContent = data.level;
    const rewards = characters.filter(character => isUnlocked(character) && !before.has(character.id));
    const host = $('victory-unlocks'); host.replaceChildren();
    if (!rewards.length) {
      const message = document.createElement('p'); message.className = 'reward-repeat';
      message.textContent = 'Você já desbloqueou o personagem deste mapa.';
      host.append(message);
    }
    for (const character of rewards) {
      const card = document.createElement('div'); card.className = 'reward-card';
      const portrait = document.createElement('canvas'); portrait.width = 132; portrait.height = 146; portrait.setAttribute('aria-hidden', 'true');
      const copy = document.createElement('div'); const label = document.createElement('small'); label.textContent = 'DESBLOQUEADO';
      const name = document.createElement('strong'); name.textContent = character.name;
      copy.append(label, name); card.append(portrait, copy); host.append(card);
      game.drawCharacterPreview(portrait, character.id, false);
    }
  }
  let menuView = 'main';
  let charactersReturnView = 'main';
  let portraitFrame = null;
  let lastPortraitTime = 0;
  const cards = new Map();
  const mapCards = new Map();
  const skinCards = new Map();
  const boardRows = [];
  let weaponTier = 0;
  let nextMenuView = null;
  function updateNewBadge() {
    ui['characters-new'].hidden = !characters.some(character => isEarned(character) && !seenCharacters.has(character.id));
  }
  function showMenuView(view, focus = true) {
    const previous = menuView;
    menuView = view;
    ui.menu.dataset.view = view;
    ui['menu-main'].hidden = view !== 'main';
    ui['online-view'].hidden = view !== 'online';
    ui['online-loading-view'].hidden = view !== 'online-loading';
    ui['characters-view'].hidden = view !== 'characters';
    ui['maps-view'].hidden = view !== 'maps';
    ui['difficulty-view'].hidden = view !== 'difficulty';
    if (view === 'online') { renderOnline(); startPortraits(); }
    else if (view === 'characters') {
      renderCharacters();
      for (const character of characters.filter(isUnlocked)) seenCharacters.add(character.id);
      try { localStorage.setItem('vesper.unlocks.seen.v2', JSON.stringify([...seenCharacters])); } catch (_) {  }
      updateNewBadge();
      startPortraits();
    } else if (view === 'maps') { renderMaps(); startPortraits(); }
    else if (view === 'difficulty') { renderDifficulties(); stopPortraits(); }
    else stopPortraits();
    if (!focus) return;
    const target = view === 'online' ? $('online-name')
      : view === 'online-loading' ? $('online-cancel-btn')
      : view === 'characters' ? (cards.get(characterId) || skinCards.get(profile.skin)).button
      : view === 'maps' ? mapCards.get(lastMapId).button
      : view === 'difficulty' ? ui['difficulty-choices'].children[1]
      : $(previous === 'online' ? 'online-btn' : previous === 'characters' ? 'characters-btn' : 'start-btn');
    target?.focus({ preventScroll: true });
  }
  function renderDifficulties() {
    const map = maps.find(item => item.id === pendingMapId) || maps[0];
    ui['difficulty-map-name'].textContent = map.name;
    ui['difficulty-map-subtitle'].textContent = map.subtitle;
    ui['difficulty-view'].style.setProperty('--map-accent', map.accent);
    if (ui['difficulty-choices'].children.length) return;
    for (const mode of difficulties) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'difficulty-card';
      button.dataset.mode = mode.id;
      const marker = document.createElement('small');
      marker.textContent = mode.id === 'easy' ? 'MAIS LEVE' : mode.id === 'medium' ? 'EQUILIBRADO' : 'MAIS INTENSO';
      const name = document.createElement('strong'); name.textContent = mode.name;
      const hint = document.createElement('span'); hint.textContent = mode.hint;
      button.append(marker, name, hint);
      button.addEventListener('click', () => start(pendingMapId, mode.id));
      ui['difficulty-choices'].append(button);
    }
  }
  function chooseMap(mapId) {
    if (!maps.some(map => map.id === mapId)) return;
    pendingMapId = lastMapId = mapId;
    game.setMap(mapId);
    showMenuView('difficulty');
  }
  function renderCharacters() {
    $('characters-progress').textContent = `${unlockedCount()} / ${campaignCharacters.length}`;
    $('earned-count').textContent = `${unlockedCount()} / ${campaignCharacters.length}`;
    for (const character of campaignCharacters) {
      let card = cards.get(character.id);
      if (!card) {
        const button = document.createElement('button');
        button.type = 'button';
        const portrait = document.createElement('canvas');
        portrait.className = 'character-portrait';
        portrait.setAttribute('aria-hidden', 'true');
        const name = document.createElement('strong');
        name.className = 'character-name';
        name.textContent = character.name;
        const status = document.createElement('span');
        status.className = 'character-status';
        const rule = document.createElement('p'); rule.className = 'character-rule';
        button.append(portrait, name, status, rule);
        button.addEventListener('click', () => selectCharacter(character.id));
        ui['character-grid'].append(button);
        card = { button, portrait, status, rule };
        cards.set(character.id, card);
      }
      const unlocked = isUnlocked(character);
      const selected = character.id === characterId;
      card.button.dataset.characterId = character.id;
      card.button.className = `character-card${selected ? ' is-selected' : ''}${unlocked ? '' : ' is-locked'}${isEarned(character) ? ' is-earned' : ''}`;
      card.button.setAttribute('aria-pressed', String(selected));
      card.button.setAttribute('aria-disabled', String(!unlocked));
      card.button.setAttribute('aria-label', unlocked
        ? `${character.name}${selected ? ', selecionado' : ''}`
        : `${character.name}, bloqueado. ${unlockRule(character)}`);
      const icon = document.createElement('span');
      icon.innerHTML = selected || !unlocked ? `<svg class="icon" aria-hidden="true"><use href="#i-${selected ? 'check' : 'lock'}"/></svg>` : '';
      const label = document.createElement('span');
      label.textContent = selected ? 'SELECIONADO' : isEarned(character) ? 'CONQUISTADO' : unlocked ? 'DISPONÍVEL' : 'BLOQUEADO';
      card.status.replaceChildren(icon, label);
      card.rule.textContent = isEarned(character)
        ? character.unlockType === 'all' ? 'Todos os mapas concluídos' : `${maps.find(map => map.id === character.unlockMap).name} concluído`
        : unlockRule(character);
    }
    renderSkins();
  }
  function unlockRule(character) {
    if (character.unlockType === 'map') return `Conclua ${maps.find(map => map.id === character.unlockMap).name}`;
    if (character.unlockType === 'all') return `Conclua todos os mapas (${completedMaps.size}/4)`;
    if (character.unlockType === 'coins') return 'Moedas ganhas no modo Online';
    return 'Disponível desde o início';
  }
  function renderSkins() {
    $('skins-coins').textContent = profile.coins.toLocaleString('pt-BR');
    $('skins-count').textContent = `${profile.owned.length} / ${onlineSkins.length}`;
    for (const skin of onlineSkins) {
      let card = skinCards.get(skin.id);
      if (!card) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.characterId = skin.id;
        const portrait = document.createElement('canvas');
        portrait.className = 'character-portrait';
        portrait.setAttribute('aria-hidden', 'true');
        const name = document.createElement('strong');
        name.className = 'character-name';
        name.textContent = skin.name;
        const status = document.createElement('span');
        status.className = 'character-status';
        const skill = document.createElement('p');
        skill.className = 'character-skill';
        skill.textContent = skin.skill ? skin.skill.label : 'Nenhuma habilidade';
        const price = document.createElement('span');
        price.className = 'character-price';
        button.append(portrait, name, status, skill, price);
        button.addEventListener('click', () => selectSkin(skin.id));
        ui['coin-grid'].append(button);
        card = { button, portrait, status, price };
        skinCards.set(skin.id, card);
      }
      const owned = profile.owned.includes(skin.id);
      const using = owned && profile.skin === skin.id;
      card.button.className = `character-card coin-card${owned ? '' : ' is-locked'}${using ? ' is-using' : ''}`;
      card.button.setAttribute('aria-pressed', String(using));
      card.button.setAttribute('aria-label', owned
        ? `${skin.name}${using ? ', em uso no Online' : ', usar no Online'}`
        : `${skin.name}, comprar por ${skin.price} moedas`);
      const icon = document.createElement('span');
      icon.innerHTML = using ? '<svg class="icon" aria-hidden="true"><use href="#i-check"/></svg>'
        : owned ? '' : '<svg class="icon" aria-hidden="true"><use href="#i-lock"/></svg>';
      const label = document.createElement('span');
      label.textContent = using ? 'EM USO' : owned ? 'USAR' : 'COMPRAR';
      card.status.replaceChildren(icon, label);
      if (owned) card.price.textContent = 'DESBLOQUEADA';
      else {
        const coin = document.createElement('span');
        coin.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-coin"/></svg>';
        const amount = document.createElement('span');
        amount.textContent = skin.price.toLocaleString('pt-BR');
        card.price.replaceChildren(coin, amount);
      }
    }
    drawPortraits();
  }
  function selectSkin(id) {
    const skin = onlineSkins.find(item => item.id === id);
    if (!skin) return;
    if (profile.owned.includes(id)) {
      profile = VesperGame.OnlineProfile.select(id).profile;
      toast(`${skin.name} em uso.`, 2200);
    } else {
      const result = VesperGame.OnlineProfile.buy(id);
      profile = result.profile;
      if (result.ok) toast(`${skin.name} desbloqueada.`, 2400);
      else toast(`Faltam ${(result.missing || skin.price).toLocaleString('pt-BR')} moedas.`, 2800);
    }
    renderSkins();
    updateNewBadge();
  }
  function renderMaps() {
    const numerals = ['I', 'II', 'III', 'IV'];
    for (const [index, map] of maps.entries()) {
      let card = mapCards.get(map.id);
      const rewardName = characters.find(character => character.id === map.unlockCharacter).name;
      if (!card) {
        const button = document.createElement('button'); button.type = 'button'; button.dataset.mapId = map.id;
        button.style.setProperty('--map-accent', map.accent);
        const art = document.createElement('div'); art.className = 'map-art-wrap';
        const canvas = document.createElement('canvas'); canvas.className = 'map-preview'; canvas.setAttribute('aria-hidden', 'true');
        const number = document.createElement('span'); number.className = 'map-index'; number.textContent = numerals[index];
        const completed = document.createElement('span'); completed.className = 'map-completed';
        completed.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-check"/></svg><span>CONCLUÍDO</span>';
        art.append(canvas, number, completed);
        const body = document.createElement('div'); body.className = 'map-card-body';
        const title = document.createElement('h3'); title.textContent = map.name;
        const subtitle = document.createElement('p'); subtitle.className = 'map-subtitle'; subtitle.textContent = map.subtitle;
        const footer = document.createElement('div'); footer.className = 'map-card-footer';
        const reward = document.createElement('span'); reward.className = 'map-reward';
        const play = document.createElement('span'); play.className = 'map-play'; play.textContent = 'JOGAR →';
        footer.append(reward, play); body.append(title, subtitle, footer); button.append(art, body);
        button.addEventListener('click', () => chooseMap(map.id));
        ui['map-grid'].append(button);
        card = { button, canvas, completed, reward }; mapCards.set(map.id, card);
      }
      const completed = completedMaps.has(map.id);
      card.button.className = `map-card${completed ? ' is-completed' : ''}`;
      card.completed.hidden = !completed;
      card.reward.textContent = `${completed ? 'Conquistado' : 'Desbloqueia'}: ${rewardName}`;
      card.button.setAttribute('aria-label', `${map.name}. ${map.subtitle}. ${completed ? 'Concluído.' : `Desbloqueia ${rewardName}.`} Jogar.`);
    }
    $('maps-progress').textContent = `${completedMaps.size} / 4 CONCLUÍDOS`;
    $('map-character-name').textContent = characters.find(character => character.id === characterId).name;
    drawMapPreviews();
    drawPortraits();
  }
  function drawMapPreviews() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    for (const map of maps) {
      const card = mapCards.get(map.id); if (!card) continue;
      const box = card.canvas.getBoundingClientRect();
      card.canvas.width = Math.max(1, Math.round((box.width || 480) * ratio));
      card.canvas.height = Math.max(1, Math.round((box.height || 174) * ratio));
      game.drawMapPreview(card.canvas, map.id);
    }
  }
  function drawPortraits() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const paint = (canvas, id, locked) => {
      const size = Math.round((canvas.getBoundingClientRect().width || 96) * ratio);
      if (canvas.width !== size) { canvas.width = size; canvas.height = size; }
      game.drawCharacterPreview(canvas, id, locked);
    };
    if (menuView === 'online') {
      const canvas = $('online-skin-preview');
      const rect = canvas.getBoundingClientRect();
      const width = Math.round((rect.width || 48) * ratio), height = Math.round((rect.height || 54) * ratio);
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      game.drawCharacterPreview(canvas, profile.skin, false);
      return;
    }
    if (menuView === 'maps') {
      const canvas = $('map-character-preview');
      const rect = canvas.getBoundingClientRect();
      const width = Math.round((rect.width || 42) * ratio), height = Math.round((rect.height || 48) * ratio);
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      game.drawCharacterPreview(canvas, characterId, false);
      return;
    }
    for (const character of campaignCharacters) {
      const card = cards.get(character.id);
      if (card) paint(card.portrait, character.id, !isUnlocked(character));
    }
    for (const skin of onlineSkins) {
      const card = skinCards.get(skin.id);
      if (card) paint(card.portrait, skin.id, !profile.owned.includes(skin.id));
    }
  }
  function animatePortraits(timestamp) {
    if (timestamp - lastPortraitTime >= 50) { drawPortraits(); lastPortraitTime = timestamp; }
    portraitFrame = requestAnimationFrame(animatePortraits);
  }
  function startPortraits() {
    if (portraitFrame === null) portraitFrame = requestAnimationFrame(animatePortraits);
  }
  function stopPortraits() {
    if (portraitFrame !== null) cancelAnimationFrame(portraitFrame);
    portraitFrame = null;
  }
  function selectCharacter(id) {
    const character = characters.find(candidate => candidate.id === id);
    if (!character || !isUnlocked(character)) return;
    characterId = id;
    game.setCharacter(id);
    try { localStorage.setItem('vesper.character.v1', id); } catch (_) {  }
    renderCharacters();
  }
  const ERRORS = {
    conexao: 'Nao foi possivel falar com o servidor. Confira o endereco e se ele esta ligado.',
    tempo: 'O servidor demorou demais para responder.',
    endereco: 'Endereco de servidor invalido.',
    queda: 'A conexao com o servidor caiu.',
    sala: 'A partida foi encerrada pelo servidor.',
    cheio: 'Todos os servidores estao cheios. Tente de novo em instantes.',
    'sem-websocket': 'Este navegador nao tem WebSocket.'
  };
  function showOnlineError(message) {
    $('online-error').textContent = message;
    $('online-error').hidden = !message;
  }
  function renderOnline() {
    const skin = onlineSkins.find(item => item.id === profile.skin) || onlineSkins[0];
    $('online-coins').textContent = profile.coins.toLocaleString('pt-BR');
    $('online-skin-name').textContent = skin.name;
    $('online-skin-skill').textContent = skin.skill ? skin.skill.label : 'Nenhuma habilidade';
    if (!$('online-name').value) $('online-name').value = profile.name;
    $('online-server').placeholder = VesperGame.ONLINE.defaultServer();
    if (!$('online-server').value) $('online-server').value = profile.server;
    showOnlineError('');
  }
  function enterOnline(event) {
    if (event) event.preventDefault();
    const name = String($('online-name').value || '').trim().slice(0, 14);
    if (name.length < 2) {
      showOnlineError('Escreva um nome com pelo menos duas letras.');
      $('online-name').focus({ preventScroll: true });
      return;
    }
    profile = VesperGame.OnlineProfile.setName(name);
    profile = VesperGame.OnlineProfile.setServer($('online-server').value);
    showOnlineError('');
    showMenuView('online-loading');
    connect();
  }
  function connect() {
    const target = VesperGame.ONLINE.normalizeServer(profile.server) || VesperGame.ONLINE.defaultServer();
    $('online-loading-fill').style.width = '35%';
    $('online-loading-step').textContent = 'Conectando ao servidor';
    $('online-loading-server').textContent = target;
    game.startOnline({ name: profile.name, skin: profile.skin, server: profile.server });
  }
  function onOnlineJoined(info) {
    $('online-loading-fill').style.width = '100%';
    $('online-loading-step').textContent = 'Entrando na partida';
    toast(`Servidor #${info.server} · ${info.humans} ${info.humans === 1 ? 'humano' : 'humanos'} · ${info.bots} bots`, 3000);
  }
  function onOnlineError(reason) {
    nextMenuView = null;
    showMenuView('online');
    showOnlineError(ERRORS[reason] || 'Nao foi possivel entrar na partida.');
  }
  function renderOnlineHud(data) {
    $('online-weapon').textContent = data.weapon;
    $('online-board-count').textContent = `${data.humans}H · ${data.bots}B`;
    if (data.weaponTier !== weaponTier) {
      weaponTier = data.weaponTier;
      game.drawOnlineWeapon($('online-weapon-art'), weaponTier);
    }
    while (boardRows.length < data.leaderboard.length) {
      const row = document.createElement('li');
      const rank = document.createElement('b');
      const name = document.createElement('span');
      const score = document.createElement('em');
      row.append(rank, name, score);
      boardRows.push({ row, rank, name, score });
      $('online-board-list').append(row);
    }
    boardRows.forEach((row, index) => {
      const entry = data.leaderboard[index];
      row.row.hidden = !entry;
      if (!entry) return;
      row.row.className = `${entry.you ? 'is-you' : ''}${entry.bot ? ' is-bot' : ''}`.trim();
      row.rank.textContent = entry.rank;
      row.name.textContent = entry.bot ? `${entry.name} [BOT]` : entry.name;
      row.score.textContent = `NV.${entry.level} · ${entry.kills}`;
    });
    $('online-feed').textContent = data.feed.slice(-3).join('\n');
    ui['online-respawn'].hidden = !(data.respawn > 0);
    if (data.respawn > 0) $('online-respawn-time').textContent = Math.ceil(data.respawn);
  }
  function onOnlineResults(data) {
    profile = VesperGame.OnlineProfile.load();
    $('online-results-server').textContent = `SERVIDOR #${data.server} · ${data.humans} ${data.humans === 1 ? 'humano' : 'humanos'} · ${data.bots} bots`;
    const rows = data.ranking.slice(0, 8);
    if (!rows.some(row => row.you)) rows.push(data.you);
    const list = $('online-results-list');
    list.replaceChildren();
    for (const row of rows) {
      const item = document.createElement('li');
      item.className = `${row.you ? 'is-you' : ''}${row.rank <= 3 ? ' is-top' : ''}${row.bot ? ' is-bot' : ''}`.trim();
      const rank = document.createElement('b'); rank.textContent = `${row.rank}º`;
      const name = document.createElement('span'); name.textContent = row.you ? `${row.name} (você)` : row.bot ? `${row.name} [BOT]` : row.name;
      const level = document.createElement('i'); level.textContent = `NÍVEL ${row.level}`;
      const kills = document.createElement('i'); kills.textContent = `${row.kills} ABATES`;
      item.append(rank, name, level, kills);
      list.append(item);
    }
    const amount = document.createElement('strong');
    amount.textContent = `+${data.coins.toLocaleString('pt-BR')}`;
    const detail = document.createElement('span');
    detail.textContent = `moedas · saldo ${profile.coins.toLocaleString('pt-BR')}`;
    $('online-results-reward').replaceChildren(amount, detail);
  }
  function playAgain() {
    nextMenuView = 'online-loading';
    game.leaveOnline();
    connect();
  }
  game = new VesperGame($('game-canvas'), {
    onHud, onLevelUp, onGameOver, onVictory, onState, onOnlineResults, onOnlineJoined, onOnlineError,
    onBossSpawn: boss => toast(boss.finalBoss ? 'CHEFE FINAL' : 'MINICHEFE', 2400)
  });
  game.setCharacter(characterId);
  showMenuView('main', false);
  updateNewBadge();
  function clearTransient() {
    releaseInput();
    options = [];
    clearTimeout(toastTimer);
    ui.toast.hidden = true;
    ui.toast.classList.add('faded');
  }
  function start(mapId = lastMapId, difficultyId = lastDifficultyId) {
    if (typeof mapId !== 'string' || !maps.some(map => map.id === mapId)) mapId = lastMapId;
    if (typeof difficultyId !== 'string' || !difficulties.some(mode => mode.id === difficultyId)) difficultyId = lastDifficultyId;
    clearTransient();
    lastMapId = pendingMapId = mapId;
    lastDifficultyId = difficultyId;
    game.setCharacter(characterId);
    game.start(mapId, difficultyId);
    game.setMuted(muted);
  }
  function toMenu() {
    if (game.state === 'paused') commitRecord(game.elapsed);
    clearTransient();
    game.toMenu();
  }
  function pauseToggle() {
    if (game.state === 'playing') game.pause();
    else if (game.state === 'paused') game.resume();
  }
  function updateSound() {
    ui['sound-btn'].querySelector('use').setAttribute('href', muted ? '#i-muted' : '#i-sound');
    ui['sound-btn'].setAttribute('aria-label', muted ? 'Ativar som' : 'Desativar som');
    ui['sound-btn'].setAttribute('aria-pressed', String(!muted));
    ui['sound-btn'].title = muted ? 'Ativar som (M)' : 'Desativar som (M)';
    game.setMuted(muted);
  }
  function toggleSound() {
    muted = !muted;
    updateSound();
    try { localStorage.setItem('vesper.sound.v1', muted ? 'off' : 'on'); } catch (_) {  }
  }
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else toast('Use a opção de tela cheia do seu navegador.');
    } catch (_) { toast('Tela cheia indisponível neste navegador.'); }
  }
  $('start-btn').addEventListener('click', () => showMenuView('maps'));
  $('restart-btn').addEventListener('click', start);
  $('pause-restart-btn').addEventListener('click', start);
  $('pause-menu-btn').addEventListener('click', toMenu);
  $('gameover-menu-btn').addEventListener('click', toMenu);
  $('online-btn').addEventListener('click', () => showMenuView('online'));
  $('online-form').addEventListener('submit', enterOnline);
  $('online-name').addEventListener('keydown', event => {
    if (event.code !== 'Enter' && event.code !== 'NumpadEnter') return;
    event.preventDefault();
    enterOnline(event);
  });
  $('online-skin-btn').addEventListener('click', () => { charactersReturnView = 'online'; showMenuView('characters'); });
  $('online-cancel-btn').addEventListener('click', () => { game.leaveOnline(); showMenuView('online'); });
  $('online-again-btn').addEventListener('click', playAgain);
  $('online-skins-btn').addEventListener('click', () => { nextMenuView = 'characters'; charactersReturnView = 'online'; game.leaveOnline(); });
  $('online-menu-btn').addEventListener('click', () => game.leaveOnline());
  $('characters-btn').addEventListener('click', () => { charactersReturnView = 'main'; showMenuView('characters'); });
  $('map-character-btn').addEventListener('click', () => { charactersReturnView = 'maps'; showMenuView('characters'); });
  $('maps-back-btn').addEventListener('click', () => showMenuView('main'));
  $('difficulty-back-btn').addEventListener('click', () => showMenuView('maps'));
  $('online-back-btn').addEventListener('click', () => showMenuView('main'));
  $('characters-back-btn').addEventListener('click', () => showMenuView(charactersReturnView));
  $('victory-map-btn').addEventListener('click', () => { toMenu(); showMenuView('maps'); });
  $('victory-characters-btn').addEventListener('click', () => { toMenu(); charactersReturnView = 'maps'; showMenuView('characters'); });
  $('victory-retry-btn').addEventListener('click', () => start(lastMapId));
  $('resume-btn').addEventListener('click', () => game.resume());
  ui['pause-btn'].addEventListener('click', pauseToggle);
  ui['sound-btn'].addEventListener('click', toggleSound);
  $('fullscreen-btn').addEventListener('click', fullscreen);
  const movementCodes = new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowLeft','ArrowDown','ArrowRight']);
  window.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target && event.target.tagName === 'INPUT' && event.code !== 'Escape') return;
    if (movementCodes.has(event.code)) {
      event.preventDefault();
      if (game.state === 'playing') { keys.add(event.code); move(); }
      return;
    }
    if (event.code === 'Space' && game.onlineActive) {
      event.preventDefault();
      if (game.state === 'playing') game.setFiring(true);
      return;
    }
    if (event.code === 'Tab') {
      const dialog = currentDialog();
      if (dialog) {
        const buttons = [...dialog.querySelectorAll('button:not(:disabled)')];
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
      }
      return;
    }
    if (event.repeat) return;
    if (event.code === 'Escape' && game.state === 'menu' && menuView !== 'main') {
      event.preventDefault();
      showMenuView(menuView === 'characters' ? charactersReturnView
        : menuView === 'difficulty' ? 'maps'
        : menuView === 'online-loading' ? 'online' : 'main');
    }
    else if (event.code === 'Escape' || event.code === 'KeyP') { event.preventDefault(); pauseToggle(); }
    else if (event.code === 'KeyM') toggleSound();
    else if (event.code === 'KeyF') fullscreen();
    else if (game.state === 'upgrade' && ['Digit1','Digit2','Numpad1','Numpad2'].includes(event.code)) { event.preventDefault(); selectUpgrade(Number(event.code.slice(-1)) - 1); }
    else if (event.code === 'Enter' && !event.target.closest('button')) {
      if (game.state === 'menu' && menuView === 'main') { event.preventDefault(); showMenuView('maps'); }
      else if (game.state === 'gameover') { event.preventDefault(); start(); }
    }
  });
  window.addEventListener('keyup', event => {
    if (movementCodes.has(event.code)) { keys.delete(event.code); move(); }
    else if (event.code === 'Space') game.setFiring(false);
  });
  function loseFocus() {
    releaseInput();
    if (game.state === 'playing' && !game.onlineActive) game.pause();
  }
  window.addEventListener('blur', loseFocus);
  document.addEventListener('visibilitychange', () => { if (document.hidden) loseFocus(); });
  function setTouch(event) {
    const rect = ui.joystick.getBoundingClientRect();
    let x = event.clientX - rect.left - rect.width / 2;
    let y = event.clientY - rect.top - rect.height / 2;
    const radius = rect.width * .33;
    if (!(radius > 0)) return;
    const length = Math.hypot(x, y);
    if (length > radius) { x *= radius / length; y *= radius / length; }
    touchX = x / radius; touchY = y / radius;
    ui['joystick-knob'].style.transform = `translate(${x}px,${y}px)`;
    move();
  }
  ui.joystick.addEventListener('pointerdown', event => {
    if (game.state !== 'playing' || pointerId !== null) return;
    event.preventDefault(); pointerId = event.pointerId;
    ui.joystick.setPointerCapture(pointerId); setTouch(event);
  });
  ui.joystick.addEventListener('pointermove', event => { if (event.pointerId === pointerId) { event.preventDefault(); setTouch(event); } });
  const endTouch = event => { if (event.pointerId === pointerId) { pointerId = null; touchX = touchY = 0; ui['joystick-knob'].style.transform = ''; move(); } };
  for (const name of ['pointerup','pointercancel','lostpointercapture']) ui.joystick.addEventListener(name, endTouch);
  function resize() {
    game.resize();
    if (game.state !== 'menu') game.drawMinimap(ui['minimap-canvas']);
    else if (menuView === 'maps') { drawMapPreviews(); drawPortraits(); }
  }
  if ('ResizeObserver' in window) {
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(ui.arena);
  }
  window.addEventListener('resize', resize);
  updateSound();
})();