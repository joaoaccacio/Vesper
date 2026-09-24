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
    'online-respawn','online-results-overlay','daily-view','daily-grid','accessories-view','accessory-grid',
    'both-grid','letter-overlay','private-view','lobby-view','trades-view'].map(id => [id, $(id)]));
  const clock = seconds => {
    const total = Math.max(0, Math.floor(seconds));
    return `${Math.floor(total / 60).toString().padStart(2, '0')}:${(total % 60).toString().padStart(2, '0')}`;
  };
  const characters = VesperGame.CHARACTERS;
  const maps = VesperGame.MAPS;
  const difficulties = VesperGame.DIFFICULTIES;
  const offlineCharacters = characters.filter(character => ['free', 'map', 'all'].includes(character.unlockType));
  const bothCharacters = characters.filter(character => character.both);
  const campaignCharacters = [...offlineCharacters, ...bothCharacters];
  const onlineSkins = VesperGame.ONLINE.skinCatalog();
  const shopSkins = onlineSkins.filter(skin => skin.shop && !bothCharacters.some(character => character.id === skin.id));
  const accessories = VesperGame.ONLINE.ACCESSORIES;
  const dailyRewards = VesperGame.ONLINE.DAILY_REWARDS;
  const unlockDayOf = id => (dailyRewards.find(reward => reward.id === id) || {}).day;
  const coinsText = value => value.toLocaleString('pt-BR');
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
    || (['coins', 'daily'].includes(character.unlockType) && profile.owned.includes(character.id));
  const isEarned = character => ['map', 'all'].includes(character.unlockType) && isUnlocked(character);
  const unlockedCount = () => offlineCharacters.filter(isUnlocked).length;
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
    ui['stage-objective'].textContent = data.stageBossStatus || 'Minichefe em 02:00';
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
  function saveProgress() {
    try { localStorage.setItem('vesper.progress.v2', JSON.stringify({ version: 2, completedMaps: [...completedMaps] })); } catch (_) {  }
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
    saveProgress();
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
  const bothCards = new Map();
  const accessoryCards = new Map();
  const dailyCells = [];
  const boardRows = [];
  let weaponTier = 0;
  let nextMenuView = null;
  function updateNewBadge() {
    ui['characters-new'].hidden = !characters.some(character => (isEarned(character) || (character.both && isUnlocked(character))) && !seenCharacters.has(character.id));
    const daily = VesperGame.OnlineProfile.dailyState();
    $('daily-new').hidden = !daily.ready;
    $('daily-new').textContent = daily.ready ? '1' : '';
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
    ui['daily-view'].hidden = view !== 'daily';
    ui['accessories-view'].hidden = view !== 'accessories';
    ui['private-view'].hidden = view !== 'private';
    ui['lobby-view'].hidden = view !== 'lobby';
    ui['trades-view'].hidden = view !== 'trades';
    if (previous === 'trades' && view !== 'trades') trades.hide();
    if (view === 'online') { renderOnline(); startPortraits(); }
    else if (view === 'private') { renderPrivate(); stopPortraits(); }
    else if (view === 'trades') { trades.show(); stopPortraits(); }
    else if (view === 'daily') { renderDaily(); stopPortraits(); }
    else if (view === 'accessories') { renderAccessories(); startPortraits(); }
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
      : view === 'characters' ? (cards.get(characterId) || bothCards.get(characterId) || skinCards.get(profile.skin) || bothCards.get(profile.skin))?.button
      : view === 'private' ? $('private-name')
      : view === 'lobby' ? $('lobby-leave-btn')
      : view === 'trades' ? document.querySelector('.trades-tab')
      : view === 'maps' ? mapCards.get(lastMapId).button
      : view === 'difficulty' ? ui['difficulty-choices'].children[1]
      : view === 'daily' ? ($('daily-claim-btn').disabled ? $('daily-back-btn') : $('daily-claim-btn'))
      : view === 'accessories' ? accessoryCards.get(accessories[0].id).button
      : $({ online: 'online-btn', characters: 'characters-btn', daily: 'daily-btn', private: 'private-btn', lobby: 'private-btn', trades: 'trades-btn' }[previous] || 'start-btn');
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
    for (const character of offlineCharacters) {
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
    renderBoth();
    renderSkins();
  }
  function renderBoth() {
    $('both-count').textContent = `${bothCharacters.filter(isUnlocked).length} / ${bothCharacters.length}`;
    for (const character of bothCharacters) {
      let card = bothCards.get(character.id);
      if (!card) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.characterId = character.id;
        const portrait = document.createElement('canvas');
        portrait.className = 'character-portrait';
        portrait.setAttribute('aria-hidden', 'true');
        const name = document.createElement('strong');
        name.className = 'character-name';
        name.textContent = character.name;
        const status = document.createElement('span');
        status.className = 'character-status';
        const rule = document.createElement('p');
        rule.className = 'character-rule';
        button.append(portrait, name, status, rule);
        button.addEventListener('click', () => selectBoth(character.id));
        ui['both-grid'].append(button);
        card = { button, portrait, status, rule };
        bothCards.set(character.id, card);
      }
      const unlocked = isUnlocked(character);
      const price = VesperGame.OnlineProfile.priceOf(character.id);
      const offline = unlocked && characterId === character.id;
      const online = unlocked && profile.skin === character.id;
      card.button.className = `character-card coin-card${unlocked ? '' : ' is-locked'}${offline || online ? ' is-using' : ''}`;
      card.button.setAttribute('aria-pressed', String(offline && online));
      const icon = document.createElement('span');
      icon.innerHTML = offline || online ? '<svg class="icon" aria-hidden="true"><use href="#i-check"/></svg>'
        : unlocked ? '' : '<svg class="icon" aria-hidden="true"><use href="#i-lock"/></svg>';
      const label = document.createElement('span');
      label.textContent = !unlocked ? (character.unlockType === 'coins' ? 'COMPRAR' : 'BLOQUEADO') : offline && online ? 'EM USO NOS DOIS' : offline ? 'EM USO NO OFFLINE' : online ? 'EM USO NO ONLINE' : 'USAR NOS DOIS';
      card.status.replaceChildren(icon, label);
      const rule = unlocked ? 'Offline e Online' : character.unlockType === 'coins' ? `${coinsText(price)} moedas` : `Login diário · dia ${character.unlockDay}`;
      card.rule.textContent = rule;
      card.button.setAttribute('aria-label', unlocked ? `${character.name}, ${label.textContent.toLowerCase()}` : `${character.name}, bloqueado. ${rule}`);
    }
  }
  function selectBoth(id) {
    const character = bothCharacters.find(item => item.id === id);
    if (!character) return;
    if (!isUnlocked(character) && character.unlockType === 'coins') {
      const result = VesperGame.OnlineProfile.buy(id);
      profile = result.profile;
      if (!result.ok) { toast(`Faltam ${coinsText(result.missing || VesperGame.OnlineProfile.priceOf(id))} moedas.`, 2800); return; }
    }
    if (!isUnlocked(character)) { toast(`Liberado no dia ${character.unlockDay} do login diário.`, 2600); return; }
    characterId = id;
    game.setCharacter(id);
    try { localStorage.setItem('vesper.character.v1', id); } catch (_) {  }
    profile = VesperGame.OnlineProfile.select(id).profile;
    toast(`${character.name} em uso no offline e no Online.`, 2400);
    renderCharacters();
  }
  function rewardLabel(reward) {
    if (reward.type === 'coins') return `${reward.amount} moedas`;
    if (reward.type === 'accessory') return accessories.find(item => item.id === reward.id).name;
    if (reward.type === 'skin') return `Skin ${characters.find(item => item.id === reward.id).name}`;
    return 'Presente misterioso';
  }
  function renderDaily() {
    profile = VesperGame.OnlineProfile.load();
    const state = VesperGame.OnlineProfile.dailyState();
    $('daily-progress').textContent = `${state.claimed} / ${dailyRewards.length}`;
    dailyRewards.forEach((reward, index) => {
      let cell = dailyCells[index];
      if (!cell) {
        const button = document.createElement('button');
        button.type = 'button';
        const day = document.createElement('small');
        day.textContent = `DIA ${reward.day}`;
        const art = document.createElement('canvas');
        art.className = 'daily-art';
        art.width = 148; art.height = 116;
        art.setAttribute('aria-hidden', 'true');
        const label = document.createElement('strong');
        label.textContent = rewardLabel(reward);
        const mark = document.createElement('span');
        mark.className = 'daily-mark';
        button.append(day, art, label, mark);
        button.addEventListener('click', () => pickDaily(index));
        ui['daily-grid'].append(button);
        cell = { button, art, mark };
        dailyCells.push(cell);
      }
      const claimed = index < state.claimed;
      const ready = state.ready && index === state.claimed;
      cell.button.className = `daily-cell${reward.type === 'coins' ? '' : ' is-special'}${claimed ? ' is-claimed' : ready ? ' is-ready' : ' is-locked'}`;
      cell.button.setAttribute('aria-label', `Dia ${reward.day}: ${rewardLabel(reward)}. ${claimed ? 'Resgatado.' : ready ? 'Disponível hoje.' : 'Ainda não liberado.'}`);
      cell.mark.innerHTML = claimed ? '<svg class="icon" aria-hidden="true"><use href="#i-check"/></svg>' : '';
      game.drawRewardArt(cell.art, reward, characterId);
    });
    const claim = $('daily-claim-btn');
    claim.disabled = !state.ready;
    claim.textContent = state.done ? 'TUDO RESGATADO' : state.ready ? `RESGATAR DIA ${state.claimed + 1}` : 'VOLTE AMANHÃ';
    $('daily-note').textContent = state.done ? 'Você completou os 15 dias. Obrigado por jogar!'
      : state.ready ? 'O prêmio de hoje já está liberado.' : `Amanhã: ${rewardLabel(state.next)}.`;
    updateNewBadge();
  }
  function pickDaily(index) {
    const state = VesperGame.OnlineProfile.dailyState();
    if (state.ready && index === state.claimed) claimDaily();
    else if (dailyRewards[index].type === 'gift' && index < state.claimed) openLetter();
  }
  function claimDaily() {
    const result = VesperGame.OnlineProfile.claimDaily();
    if (!result.ok) return;
    profile = result.profile;
    const reward = result.reward;
    game.setAccessories(profile.worn);
    renderDaily();
    if (reward.type === 'gift') { openLetter(); return; }
    toast(reward.type === 'coins' ? `+${reward.amount} moedas · saldo ${profile.coins.toLocaleString('pt-BR')}`
      : reward.type === 'accessory' ? `${rewardLabel(reward)} equipado. Troque na tela de Acessórios.`
      : `${characters.find(item => item.id === reward.id).name} liberada no offline e no Online.`, 3200);
  }
  function openLetter() {
    ui['letter-overlay'].hidden = false;
    $('letter-close-btn').focus({ preventScroll: true });
  }
  function closeLetter() {
    ui['letter-overlay'].hidden = true;
    if (menuView === 'daily') $('daily-back-btn').focus({ preventScroll: true });
  }
  function renderAccessories() {
    profile = VesperGame.OnlineProfile.load();
    $('accessories-progress').textContent = `${profile.accessories.length} / ${accessories.length}`;
    for (const accessory of accessories) {
      let card = accessoryCards.get(accessory.id);
      if (!card) {
        const button = document.createElement('button');
        button.type = 'button';
        const portrait = document.createElement('canvas');
        portrait.className = 'character-portrait';
        portrait.setAttribute('aria-hidden', 'true');
        const name = document.createElement('strong');
        name.className = 'character-name';
        name.textContent = accessory.name;
        const status = document.createElement('span');
        status.className = 'character-status';
        const rule = document.createElement('p');
        rule.className = 'character-rule';
        button.append(portrait, name, status, rule);
        button.addEventListener('click', () => toggleAccessory(accessory.id));
        ui['accessory-grid'].append(button);
        card = { button, portrait, status, rule };
        accessoryCards.set(accessory.id, card);
      }
      const owned = profile.accessories.includes(accessory.id);
      const worn = profile.worn.includes(accessory.id);
      const forSale = Number.isFinite(accessory.price);
      card.button.className = `character-card accessory-card${owned ? '' : ' is-locked'}${worn ? ' is-using' : ''}`;
      card.button.setAttribute('aria-pressed', String(worn));
      const icon = document.createElement('span');
      icon.innerHTML = worn ? '<svg class="icon" aria-hidden="true"><use href="#i-check"/></svg>'
        : owned ? '' : '<svg class="icon" aria-hidden="true"><use href="#i-lock"/></svg>';
      const label = document.createElement('span');
      label.textContent = worn ? 'EM USO' : owned ? 'COLOCAR' : forSale ? 'COMPRAR' : 'BLOQUEADO';
      card.status.replaceChildren(icon, label);
      card.rule.textContent = owned ? (worn ? 'Clique para tirar' : 'Clique para colocar') : forSale ? `${coinsText(accessory.price)} moedas` : `Login diário · dia ${unlockDayOf(accessory.id)}`;
      card.button.setAttribute('aria-label', `${accessory.name}. ${card.rule.textContent}`);
    }
    drawPortraits();
  }
  function toggleAccessory(id) {
    const accessory = accessories.find(item => item.id === id);
    if (!profile.accessories.includes(id) && Number.isFinite(accessory.price)) {
      const bought = VesperGame.OnlineProfile.buyAccessory(id);
      profile = bought.profile;
      if (!bought.ok) { toast(`Faltam ${coinsText(bought.missing || accessory.price)} moedas.`, 2800); return; }
      game.setAccessories(profile.worn);
      toast(`${accessory.name} comprado e colocado.`, 2400);
      renderAccessories();
      return;
    }
    const result = VesperGame.OnlineProfile.toggleAccessory(id);
    if (!result.ok) { toast(`Liberado no dia ${unlockDayOf(id)} do login diário.`, 2600); return; }
    profile = result.profile;
    game.setAccessories(profile.worn);
    toast(`${accessory.name} ${profile.worn.includes(id) ? 'colocado' : 'retirado'}.`, 2000);
    renderAccessories();
  }
  function unlockRule(character) {
    if (character.unlockType === 'map') return `Conclua ${maps.find(map => map.id === character.unlockMap).name}`;
    if (character.unlockType === 'all') return `Conclua todos os mapas (${completedMaps.size}/${maps.length})`;
    if (character.unlockType === 'coins') return 'Moedas ganhas no modo Online';
    return 'Disponível desde o início';
  }
  function renderSkins() {
    $('skins-coins').textContent = profile.coins.toLocaleString('pt-BR');
    $('skins-count').textContent = `${shopSkins.filter(skin => profile.owned.includes(skin.id)).length} / ${shopSkins.length}`;
    for (const skin of shopSkins) {
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
    const numerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
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
    $('maps-progress').textContent = `${completedMaps.size} / ${maps.length} CONCLUÍDOS`;
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
      game.drawCharacterPreview(canvas, profile.skin, false, profile.worn);
      return;
    }
    if (menuView === 'accessories') {
      for (const accessory of accessories) {
        const card = accessoryCards.get(accessory.id);
        if (!card) continue;
        const size = Math.round((card.portrait.getBoundingClientRect().width || 150) * ratio);
        if (card.portrait.width !== size) { card.portrait.width = size; card.portrait.height = size; }
        game.drawCharacterPreview(card.portrait, characterId, !profile.accessories.includes(accessory.id), [accessory.id]);
      }
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
    for (const character of offlineCharacters) {
      const card = cards.get(character.id);
      if (card) paint(card.portrait, character.id, !isUnlocked(character));
    }
    for (const character of bothCharacters) {
      const card = bothCards.get(character.id);
      if (card) paint(card.portrait, character.id, !isUnlocked(character));
    }
    for (const skin of shopSkins) {
      const card = skinCards.get(skin.id);
      if (card) paint(card.portrait, skin.id, !profile.owned.includes(skin.id));
    }
    const badge = $('accessories-preview');
    const box = badge.getBoundingClientRect();
    const width = Math.round((box.width || 40) * ratio), height = Math.round((box.height || 46) * ratio);
    if (badge.width !== width || badge.height !== height) { badge.width = width; badge.height = height; }
    game.drawCharacterPreview(badge, characterId, false, profile.worn);
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
    conexao: 'Não foi possível entrar no Online agora. Tente de novo em instantes.',
    tempo: 'A conexão demorou demais. Tente de novo.',
    queda: 'A conexão caiu.',
    sala: 'A partida foi encerrada.',
    full: 'Todas as partidas estão cheias. Tente de novo em instantes.',
    code: 'Não existe servidor com esse código.',
    started: 'Essa partida já começou.',
    host: 'O criador fechou a sala.',
    'sem-websocket': 'Este navegador não tem suporte ao Online.'
  };
  let roomMode = 'public';
  function privateError(message) {
    $('private-error').textContent = message;
    $('private-error').hidden = !message;
  }
  function renderPrivate() {
    if (!$('private-name').value) $('private-name').value = profile.name;
    privateError('');
  }
  function openPrivate(room) {
    const name = String($('private-name').value || '').trim().slice(0, 14);
    if (name.length < 2) {
      privateError('Escreva um nome com pelo menos duas letras.');
      $('private-name').focus({ preventScroll: true });
      return;
    }
    if (room !== 'create' && !/^\d{6}$/.test(room)) {
      privateError('O código tem 6 números.');
      $('private-code').focus({ preventScroll: true });
      return;
    }
    profile = VesperGame.OnlineProfile.setName(name);
    roomMode = 'private';
    $('lobby-code').textContent = room === 'create' ? '······' : room;
    $('lobby-hint').textContent = 'Conectando…';
    $('lobby-list').replaceChildren();
    $('lobby-start-btn').hidden = true;
    showMenuView('lobby');
    game.startOnline({ name: profile.name, skin: profile.skin, acc: profile.worn, room });
  }
  function onPrivateLobby(data) {
    $('lobby-code').textContent = data.code;
    $('lobby-hint').textContent = data.host ? 'Passe este código para seus amigos entrarem.' : 'Aguardando o criador começar a partida.';
    $('lobby-start-btn').hidden = !data.host;
    $('lobby-start-btn').disabled = false;
    $('lobby-list').replaceChildren(...data.players.map(player => {
      const item = document.createElement('li');
      const portrait = document.createElement('canvas');
      portrait.width = 72; portrait.height = 76;
      portrait.setAttribute('aria-hidden', 'true');
      game.drawCharacterPreview(portrait, player.skin, false, Array.isArray(player.acc) ? player.acc : []);
      const text = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = player.name;
      const skin = document.createElement('span');
      skin.textContent = (characters.find(character => character.id === player.skin) || { name: player.skin }).name;
      const tag = document.createElement('small');
      tag.textContent = [player.id === data.hostId ? 'CRIADOR' : '', player.id === data.you ? 'VOCÊ' : ''].filter(Boolean).join(' · ');
      text.append(name, skin, tag);
      item.append(portrait, text);
      return item;
    }));
  }
  function refreshAccount() {
    profile = VesperGame.OnlineProfile.load();
    if (!campaignCharacters.some(character => character.id === characterId && isUnlocked(character))) {
      characterId = characters[0].id;
      try { localStorage.setItem('vesper.character.v1', characterId); } catch (_) {  }
    }
    if (!game.onlineActive) game.setCharacter(characterId);
    game.setAccessories(profile.worn);
    updateNewBadge();
    if (menuView === 'characters') renderCharacters();
    else if (menuView === 'accessories') renderAccessories();
    else if (menuView === 'online') renderOnline();
    else if (menuView === 'maps') renderMaps();
  }
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
    roomMode = 'public';
    showOnlineError('');
    showMenuView('online-loading');
    connect();
  }
  function connect() {
    $('online-loading-fill').style.width = '35%';
    $('online-loading-step').textContent = 'Preparando a arena';
    game.startOnline({ name: profile.name, skin: profile.skin, acc: profile.worn });
  }
  function onOnlineJoined() {
    $('online-loading-fill').style.width = '100%';
    $('online-loading-step').textContent = 'Entrando na partida';
  }
  function onOnlineError(reason) {
    nextMenuView = null;
    const message = ERRORS[reason] || 'Não foi possível entrar na partida.';
    if (roomMode === 'private') {
      showMenuView('private');
      privateError(message);
    } else {
      showMenuView('online');
      showOnlineError(message);
    }
  }
  function renderOnlineHud(data) {
    $('online-weapon').textContent = data.weapon;
    $('online-board-count').textContent = data.players;
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
      row.row.className = entry.you ? 'is-you' : '';
      row.rank.textContent = entry.rank;
      row.name.textContent = entry.name;
      row.score.textContent = `NV.${entry.level} · ${entry.kills}`;
    });
    $('online-feed').textContent = data.feed.slice(-3).join('\n');
    ui['online-respawn'].hidden = !(data.respawn > 0);
    if (data.respawn > 0) $('online-respawn-time').textContent = Math.ceil(data.respawn);
  }
  function onOnlineResults(data) {
    profile = VesperGame.OnlineProfile.load();
    $('online-results-kicker').textContent = `FIM DA PARTIDA · ${data.players} JOGADORES`;
    const rows = data.ranking.slice(0, 8);
    if (!rows.some(row => row.you)) rows.push(data.you);
    const list = $('online-results-list');
    list.replaceChildren();
    for (const row of rows) {
      const item = document.createElement('li');
      item.className = `${row.you ? 'is-you' : ''}${row.rank <= 3 ? ' is-top' : ''}`.trim();
      const rank = document.createElement('b'); rank.textContent = `${row.rank}º`;
      const name = document.createElement('span'); name.textContent = row.you ? `${row.name} (você)` : row.name;
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
    if (roomMode === 'private') {
      nextMenuView = 'private';
      game.leaveOnline();
      return;
    }
    nextMenuView = 'online-loading';
    game.leaveOnline();
    connect();
  }
  game = new VesperGame($('game-canvas'), {
    onHud, onLevelUp, onGameOver, onVictory, onState, onOnlineResults, onOnlineJoined, onOnlineError, onPrivateLobby,
    onBossSpawn: boss => toast(boss.finalBoss ? 'CHEFE FINAL' : 'MINICHEFE', 2400)
  });
  const trades = VesperGame.createTrades({ game, toast, onChange: refreshAccount });
  const admin = VesperGame.createAdmin({
    progress: {
      has: id => completedMaps.has(id),
      set: (id, done) => { if (done) completedMaps.add(id); else completedMaps.delete(id); saveProgress(); }
    },
    onChange: refreshAccount
  });
  game.setCharacter(characterId);
  game.setAccessories(profile.worn);
  showMenuView('main', false);
  updateNewBadge();
  if (/^https?:$/.test(location.protocol)) trades.sync();
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
  $('private-btn').addEventListener('click', () => showMenuView('private'));
  $('private-back-btn').addEventListener('click', () => showMenuView('main'));
  $('private-create-btn').addEventListener('click', () => openPrivate('create'));
  $('private-enter-btn').addEventListener('click', () => openPrivate(String($('private-code').value || '').trim()));
  $('private-code').addEventListener('input', () => { $('private-code').value = $('private-code').value.replace(/\D/g, '').slice(0, 6); });
  $('private-code').addEventListener('keydown', event => {
    if (event.code !== 'Enter' && event.code !== 'NumpadEnter') return;
    event.preventDefault();
    openPrivate(String($('private-code').value || '').trim());
  });
  $('lobby-start-btn').addEventListener('click', () => { if (game.startPrivateMatch()) $('lobby-start-btn').disabled = true; });
  $('lobby-leave-btn').addEventListener('click', () => { game.leaveOnline(); showMenuView('private'); });
  $('trades-btn').addEventListener('click', () => showMenuView('trades'));
  $('trades-back-btn').addEventListener('click', () => showMenuView('main'));
  $('admin-btn').addEventListener('click', () => admin.open());
  $('online-again-btn').addEventListener('click', playAgain);
  $('online-skins-btn').addEventListener('click', () => { nextMenuView = 'characters'; charactersReturnView = 'online'; game.leaveOnline(); });
  $('online-menu-btn').addEventListener('click', () => game.leaveOnline());
  $('characters-btn').addEventListener('click', () => { charactersReturnView = 'main'; showMenuView('characters'); });
  $('daily-btn').addEventListener('click', () => showMenuView('daily'));
  $('daily-back-btn').addEventListener('click', () => showMenuView('main'));
  $('daily-claim-btn').addEventListener('click', claimDaily);
  $('letter-close-btn').addEventListener('click', closeLetter);
  $('accessories-btn').addEventListener('click', () => showMenuView('accessories'));
  $('accessories-back-btn').addEventListener('click', () => showMenuView('characters'));
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
    if (event.code === 'Escape' && !ui['letter-overlay'].hidden) { event.preventDefault(); closeLetter(); }
    else if (event.code === 'Escape' && game.state === 'menu' && menuView !== 'main') {
      event.preventDefault();
      const destination = menuView === 'characters' ? charactersReturnView
        : menuView === 'accessories' ? 'characters'
        : menuView === 'difficulty' ? 'maps'
        : menuView === 'online-loading' ? 'online'
        : menuView === 'lobby' ? 'private' : 'main';
      if (menuView === 'online-loading' || menuView === 'lobby') game.leaveOnline();
      showMenuView(destination);
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