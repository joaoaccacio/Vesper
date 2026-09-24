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

  VesperGame.createAdmin = ({ progress, onChange }) => {
    const Profile = VesperGame.OnlineProfile;
    const login = $('admin-login-overlay');
    const panel = $('admin-panel');
    const search = $('admin-search');
    const results = $('admin-results');
    const key = maskField($('admin-key'));
    let checking = false;
    login.hidden = true;
    panel.hidden = true;

    const catalog = () => {
      const items = [{ id: 'coins', name: 'Moedas', kind: 'Moedas' }];
      for (const skin of VesperGame.ONLINE.SKINS) {
        if (skin.id === 'alien') continue;
        const character = VesperGame.CHARACTERS.find(item => item.id === skin.id);
        items.push({ id: 'skin:' + skin.id, name: character.name, kind: character.both ? 'Skin offline e online' : 'Skin do Online' });
      }
      for (const accessory of VesperGame.ONLINE.ACCESSORIES) items.push({ id: 'acc:' + accessory.id, name: accessory.name, kind: 'Acessório' });
      for (const character of VesperGame.CHARACTERS.filter(item => item.unlockType === 'map')) items.push({ id: 'map:' + character.unlockMap, name: character.name, kind: 'Personagem do offline' });
      return items;
    };

    const owns = item => {
      if (item.id === 'coins') return true;
      if (item.id.startsWith('map:')) return progress.has(item.id.slice(4));
      return Profile.has(item.id);
    };

    const log = text => { $('admin-log').textContent = text; };

    function change(item, add, amount) {
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

    function render() {
      const query = search.value;
      const amount = Number((query.match(/\d+/) || [0])[0]);
      const ranked = catalog().map(item => ({ item, score: similarity(query, item.name) }))
        .filter(entry => entry.score >= 0.45).sort((a, b) => b.score - a.score).slice(0, 6);
      const top = ranked[0];
      $('admin-hint').textContent = !plain(query) ? 'Digite o nome de uma skin, acessório, personagem ou "moedas".'
        : !top ? 'Nada encontrado.' : plain(query).replace(/\d+/g, '').trim() !== plain(top.item.name) ? `Você quis dizer: ${top.item.name}?` : '';
      results.replaceChildren(...ranked.map(({ item }) => {
        const row = document.createElement('li');
        const name = document.createElement('strong');
        name.textContent = item.name;
        const kind = document.createElement('span');
        const has = owns(item);
        kind.textContent = item.id === 'coins' ? `Saldo: ${Profile.load().coins.toLocaleString('pt-BR')}` : `${item.kind} · ${has ? 'você tem' : 'você não tem'}`;
        const info = document.createElement('div');
        info.append(name, kind);
        row.append(info);
        let input = null;
        if (item.id === 'coins') {
          input = document.createElement('input');
          input.type = 'number'; input.min = '0'; input.step = '1'; input.value = String(amount || 100);
          input.setAttribute('aria-label', 'Quantidade de moedas');
          row.append(input);
        }
        for (const add of [true, false]) {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = add ? 'pegar' : 'remover';
          button.disabled = item.id !== 'coins' && has === add;
          button.addEventListener('click', () => change(item, add, input && input.value));
          row.append(button);
        }
        return row;
      }));
    }

    function closeLogin() {
      login.hidden = true;
      key.clear();
      $('admin-error').hidden = true;
      $('admin-btn').focus({ preventScroll: true });
    }

    function closePanel() {
      panel.hidden = true;
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
        if (reply.ok) {
          closeLogin();
          panel.hidden = false;
          render();
          search.focus({ preventScroll: true });
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
        VesperGame.Server.close();
      });
    }

    $('admin-key').addEventListener('keydown', event => {
      if (event.code === 'Enter' || event.code === 'NumpadEnter') { event.preventDefault(); enter(); }
    });
    $('admin-enter-btn').addEventListener('click', enter);
    $('admin-cancel-btn').addEventListener('click', closeLogin);
    $('admin-close-btn').addEventListener('click', closePanel);
    search.addEventListener('input', render);
    window.addEventListener('keydown', event => {
      if (event.code !== 'Escape') return;
      if (!panel.hidden) closePanel();
      else if (!login.hidden) closeLogin();
      else return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);

    return {
      open() {
        key.clear();
        $('admin-error').hidden = true;
        login.hidden = false;
        $('admin-key').focus({ preventScroll: true });
      },
      get active() { return !login.hidden || !panel.hidden; }
    };
  };
})();
