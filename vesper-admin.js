(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const plain = text => String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

  function distance(a, b) {
    const row = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i++) {
      let previous = row[0];
      row[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const saved = row[j];
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
        previous = saved;
      }
    }
    return row[b.length];
  }

  function similarity(query, name) {
    const q = plain(query).replace(/\d+/g, '').trim();
    const n = plain(name);
    if (!q) return 0;
    if (n === q) return 1;
    if (n.startsWith(q)) return 0.95;
    if (n.includes(q)) return 0.9;
    let best = 1 - distance(q, n) / Math.max(q.length, n.length);
    for (const word of n.split(' ')) {
      best = Math.max(best, 0.92 - distance(q, word) / Math.max(q.length, word.length));
      if (q.length >= 3 && word.startsWith(q)) best = Math.max(best, 0.85);
    }
    return best;
  }

  function maskField(input) {
    let secret = '';
    const show = caret => {
      input.value = '*'.repeat(secret.length);
      input.setSelectionRange(caret, caret);
    };
    input.addEventListener('beforeinput', event => {
      event.preventDefault();
      const start = input.selectionStart ?? secret.length;
      const end = input.selectionEnd ?? secret.length;
      if (event.inputType.startsWith('insert')) {
        const text = String(event.data ?? event.dataTransfer?.getData('text/plain') ?? '').replace(/\s/g, '').slice(0, 64 - secret.length + (end - start));
        secret = secret.slice(0, start) + text + secret.slice(end);
        show(start + text.length);
      } else if (event.inputType.startsWith('delete')) {
        const from = start !== end ? start : event.inputType === 'deleteContentBackward' ? Math.max(0, start - 1) : start;
        const to = start !== end ? end : event.inputType === 'deleteContentForward' ? Math.min(secret.length, end + 1) : end;
        secret = secret.slice(0, from) + secret.slice(to);
        show(from);
      }
    });
    input.addEventListener('drop', event => event.preventDefault());
    return {
      get value() { return secret; },
      clear() { secret = ''; input.value = ''; }
    };
  }

  const STAFF_ERRORS = Object.freeze({
    negado: 'Sem permissão. Feche o painel e entre de novo.', nome: 'Não existe jogador com esse nome.',
    item: 'Esse item não pode ser enviado.', moedas: 'Quantidade de moedas inválida.',
    proprio: 'Você não pode tirar o seu próprio cargo.', voce: 'Você não pode banir a sua própria conta.',
    admin: 'Tire o cargo de administrador antes de banir.', banido: 'Essa conta está banida. Desbana antes de promover.', servidor: 'O servidor está fora do ar agora.',
    devagar: 'Muitos pedidos seguidos. Espere alguns segundos.', conexao: 'Sem conexão com o servidor.', tempo: 'O servidor demorou para responder.'
  });

  VesperGame.createAdmin = ({ progress, onChange, game, openGift }) => {
    const Profile = VesperGame.OnlineProfile;
    const login = $('admin-login-overlay');
    const panel = $('admin-panel');
    const search = $('admin-search');
    const results = $('admin-results');
    const key = maskField($('admin-key'));
    let checking = false;
    let auth = null;
    let mode = 'me';
    let target = null;
    let sending = false;
    let armed = false;
    let armTimer = null;
    login.hidden = true;
    panel.hidden = true;

    const catalog = () => {
      const items = [
        { id: 'coins', name: 'Moedas', kind: 'Moedas', art: { type: 'coins', amount: 30 } },
        { id: 'gift', name: 'Presente misterioso', kind: 'Presente do login diário', art: { type: 'gift' } }
      ];
      for (const skin of VesperGame.ONLINE.SKINS) {
        if (skin.id === 'alien') continue;
        const character = VesperGame.CHARACTERS.find(item => item.id === skin.id);
        items.push({ id: 'skin:' + skin.id, name: character.name, kind: character.both ? 'Skin offline e online' : 'Skin do Online', art: { type: 'skin', id: skin.id } });
      }
      for (const accessory of VesperGame.ONLINE.ACCESSORIES) items.push({ id: 'acc:' + accessory.id, name: accessory.name, kind: 'Acessório', art: { type: 'accessory', id: accessory.id } });
      for (const character of VesperGame.CHARACTERS.filter(item => item.unlockType === 'map')) items.push({ id: 'map:' + character.unlockMap, name: character.name, kind: 'Personagem do offline', art: { type: 'skin', id: character.id } });
      return mode === 'players' ? items.filter(item => item.id !== 'gift' && !item.id.startsWith('map:')) : items;
    };

    const owns = item => {
      if (mode === 'players') return item.id === 'coins' || target.items.includes(item.id);
      if (item.id === 'coins' || item.id === 'gift') return true;
      if (item.id.startsWith('map:')) return progress.has(item.id.slice(4));
      return Profile.has(item.id);
    };

    const log = text => { $('admin-log').textContent = text; };
    const staff = message => VesperGame.Server.request({ t: 'staff', ...auth, ...message });
    const failure = error => STAFF_ERRORS[error] || 'Não foi possível completar agora.';

    function change(item, add, amount) {
      if (item.id === 'gift') {
        log('Presente misterioso aberto.');
        openGift();
        return;
      }
      if (item.id === 'coins') {
        const value = Math.max(0, Math.floor(Number(amount) || 0));
        if (!value) { log('Digite uma quantidade de moedas.'); return; }
        Profile.adjustCoins(add ? value : -value);
        log(`${add ? '+' : '-'}${value.toLocaleString('pt-BR')} moedas · saldo ${Profile.load().coins.toLocaleString('pt-BR')}`);
      } else if (item.id.startsWith('map:')) {
        progress.set(item.id.slice(4), add);
        log(`${item.name} ${add ? 'adicionado à' : 'removido da'} sua conta.`);
      } else {
        if (add) Profile.grant(item.id); else Profile.revoke(item.id);
        log(`${item.name} ${add ? 'adicionado à' : 'removido da'} sua conta.`);
      }
      onChange();
      render();
    }

    async function send(item, add, amount) {
      if (sending || !target) return;
      const coins = Math.max(0, Math.floor(Number(amount) || 0));
      if (item.id === 'coins' && !coins) { log('Digite uma quantidade de moedas.'); return; }
      sending = true;
      const who = target.name;
      try {
        const reply = await staff({ op: 'give', name: who, take: !add, ...(item.id === 'coins' ? { coins } : { item: item.id }) });
        if (!reply.ok) { log(failure(reply.error)); return; }
        if (!target || target.name !== who) return;
        if (item.id === 'coins') target.coins = Math.max(0, target.coins + (add ? coins : -coins));
        else target.items = add ? [...new Set([...target.items, item.id])] : target.items.filter(id => id !== item.id);
        const what = item.id === 'coins' ? `${coins.toLocaleString('pt-BR')} moedas` : item.name;
        log(`${add ? 'Enviado para' : 'Retirado de'} ${who}: ${what}. Muda na conta quando a pessoa abrir o jogo.`);
        showTarget();
        render();
      } catch (error) {
        log(failure(error.message));
      } finally {
        sending = false;
      }
    }

    function showTarget() {
      $('admin-card').hidden = !target;
      if (!target) return;
      $('admin-card-name').textContent = target.name;
      $('admin-card-info').textContent = `${target.banned ? 'Banido' : target.admin ? 'Administrador' : 'Jogador'} · ${target.coins.toLocaleString('pt-BR')} moedas · ${target.items.length} ${target.items.length === 1 ? 'item' : 'itens'}`;
      $('admin-role-btn').textContent = target.admin ? 'remover administrador' : 'tornar administrador';
      $('admin-role-btn').className = target.admin ? 'is-admin' : '';
      $('admin-role-btn').hidden = Boolean(target.banned);
      $('admin-ban-btn').textContent = target.banned ? 'desbanir' : armed ? 'confirmar banimento' : 'banir';
      $('admin-ban-btn').className = target.banned ? 'is-admin' : armed ? 'is-danger is-armed' : 'is-danger';
    }

    async function find(event) {
      if (event) event.preventDefault();
      const name = String($('admin-user').value || '').trim();
      if (!name || sending) return;
      sending = true;
      try {
        const reply = await staff({ op: 'find', name });
        disarm();
        target = reply.ok ? reply.data : null;
        log(reply.ok ? '' : failure(reply.error));
        showTarget();
        render();
        if (target) search.focus({ preventScroll: true });
      } catch (error) {
        log(failure(error.message));
      } finally {
        sending = false;
      }
    }

    async function toggleRole() {
      if (!target || sending) return;
      sending = true;
      const who = target.name;
      const admin = !target.admin;
      try {
        const reply = await staff({ op: 'role', name: who, admin });
        if (!reply.ok) { log(failure(reply.error)); return; }
        target = reply.data;
        log(`${who} ${admin ? 'agora é administrador.' : 'não é mais administrador.'}`);
        showTarget();
      } catch (error) {
        log(failure(error.message));
      } finally {
        sending = false;
      }
    }

    function disarm() {
      clearTimeout(armTimer);
      armed = false;
    }

    async function toggleBan() {
      if (!target || sending) return;
      const banned = !target.banned;
      if (banned && !armed) {
        armed = true;
        showTarget();
        armTimer = setTimeout(() => { armed = false; showTarget(); }, 4000);
        return;
      }
      disarm();
      sending = true;
      const who = target.name;
      try {
        const reply = await staff({ op: 'ban', name: who, banned });
        if (!reply.ok) { log(failure(reply.error)); return; }
        target = reply.data;
        log(banned ? `${who} foi banido. A conta não entra mais e os anúncios dela saíram da loja.` : `${who} foi desbanido e pode entrar de novo.`);
      } catch (error) {
        log(failure(error.message));
      } finally {
        sending = false;
        showTarget();
      }
    }

    function setMode(next) {
      mode = next;
      const remote = mode === 'players';
      $('admin-tab-me').classList.toggle('is-active', !remote);
      $('admin-tab-players').classList.toggle('is-active', remote);
      $('admin-tab-me').setAttribute('aria-pressed', String(!remote));
      $('admin-tab-players').setAttribute('aria-pressed', String(remote));
      $('admin-player').hidden = !remote;
      search.placeholder = remote ? 'O que você quer dar ou tirar desse jogador?' : 'O que você quer pegar ou remover da sua conta?';
      search.value = '';
      log('');
      render();
      (remote && !target ? $('admin-user') : search).focus({ preventScroll: true });
    }

    function render() {
      const remote = mode === 'players';
      search.hidden = remote && !target;
      if (remote && !target) {
        $('admin-hint').textContent = 'Digite o nome de usuário de um jogador e clique em abrir.';
        results.replaceChildren();
        return;
      }
      const query = search.value;
      const amount = Number((query.match(/\d+/) || [0])[0]);
      const ranked = catalog().map(item => ({ item, score: similarity(query, item.name) }))
        .filter(entry => entry.score >= 0.45).sort((a, b) => b.score - a.score).slice(0, 6);
      const top = ranked[0];
      $('admin-hint').textContent = !plain(query) ? (remote ? `O que você quer dar ou tirar de ${target.name}? Digite uma skin, acessório ou "moedas".` : 'Digite o nome de uma skin, acessório, personagem ou "moedas".')
        : !top ? 'Nada encontrado.' : plain(query).replace(/\d+/g, '').trim() !== plain(top.item.name) ? `Você quis dizer: ${top.item.name}?` : '';
      const skin = Profile.load().skin;
      results.replaceChildren(...ranked.map(({ item }) => {
        const row = document.createElement('li');
        const art = document.createElement('canvas');
        art.className = 'admin-art';
        art.width = art.height = 104;
        art.setAttribute('aria-hidden', 'true');
        game.drawRewardArt(art, item.art, skin);
        const name = document.createElement('strong');
        name.textContent = item.name;
        const kind = document.createElement('span');
        const has = owns(item);
        const balance = remote ? target.coins : Profile.load().coins;
        kind.textContent = item.id === 'coins' ? `Saldo: ${balance.toLocaleString('pt-BR')}` : item.id === 'gift' ? item.kind
          : `${item.kind} · ${remote ? (has ? 'tem' : 'não tem') : has ? 'você tem' : 'você não tem'}`;
        const info = document.createElement('div');
        info.append(name, kind);
        row.append(art, info);
        let input = null;
        if (item.id === 'coins') {
          input = document.createElement('input');
          input.type = 'number'; input.min = '0'; input.step = '1'; input.value = String(amount || 100);
          input.setAttribute('aria-label', 'Quantidade de moedas');
          row.append(input);
        }
        for (const add of item.id === 'gift' ? [true] : [true, false]) {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = remote ? (add ? 'dar' : 'tirar') : add ? 'pegar' : 'remover';
          button.disabled = item.id !== 'coins' && item.id !== 'gift' && has === add;
          button.addEventListener('click', () => (remote ? send(item, add, input && input.value) : change(item, add, input && input.value)));
          row.append(button);
        }
        return row;
      }));
    }

    function showPanel() {
      panel.hidden = false;
      target = null;
      $('admin-user').value = '';
      showTarget();
      setMode('me');
    }

    function closeLogin() {
      login.hidden = true;
      key.clear();
      $('admin-error').hidden = true;
      $('admin-btn').focus({ preventScroll: true });
    }

    function closePanel() {
      disarm();
      panel.hidden = true;
      auth = null;
      target = null;
      search.value = '';
      log('');
      $('admin-btn').focus({ preventScroll: true });
    }

    function enter() {
      if (checking) return;
      const secret = key.value;
      if (!secret) return;
      checking = true;
      $('admin-enter-btn').disabled = true;
      $('admin-error').hidden = true;
      VesperGame.Server.request({ t: 'admin', key: secret }).then(reply => {
        if (reply.ok && typeof reply.token === 'string') {
          auth = { token: reply.token };
          closeLogin();
          showPanel();
        } else {
          $('admin-error').textContent = reply.wait ? `Muitas tentativas. Tente de novo em ${reply.wait} min.` : 'Senha inválida.';
          $('admin-error').hidden = false;
        }
      }).catch(() => {
        $('admin-error').textContent = 'Sem conexão com o servidor.';
        $('admin-error').hidden = false;
      }).finally(() => {
        checking = false;
        key.clear();
        $('admin-enter-btn').disabled = false;
      });
    }

    $('admin-key').addEventListener('keydown', event => {
      if (event.code === 'Enter' || event.code === 'NumpadEnter') { event.preventDefault(); enter(); }
    });
    $('admin-enter-btn').addEventListener('click', enter);
    $('admin-cancel-btn').addEventListener('click', closeLogin);
    $('admin-close-btn').addEventListener('click', closePanel);
    $('admin-tab-me').addEventListener('click', () => setMode('me'));
    $('admin-tab-players').addEventListener('click', () => setMode('players'));
    $('admin-find').addEventListener('submit', find);
    $('admin-role-btn').addEventListener('click', toggleRole);
    $('admin-ban-btn').addEventListener('click', toggleBan);
    search.addEventListener('input', render);
    window.addEventListener('keydown', event => {
      if (event.code !== 'Escape' || !$('letter-overlay').hidden) return;
      if (!panel.hidden) closePanel();
      else if (!login.hidden) closeLogin();
      else return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);

    return {
      open() {
        const account = VesperGame.Account.state();
        if (account && account.admin) {
          auth = { session: account.session };
          showPanel();
          return;
        }
        key.clear();
        $('admin-error').hidden = true;
        login.hidden = false;
        $('admin-key').focus({ preventScroll: true });
      },
      get active() { return !login.hidden || !panel.hidden; }
    };
  };
})();
