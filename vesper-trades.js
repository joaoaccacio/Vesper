(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const ERRORS = Object.freeze({
    conta: 'Não foi possível identificar sua conta.', item: 'Esse item não pode ser trocado.', cheio: 'A loja está cheia agora. Tente mais tarde.',
    limite: 'Você chegou ao limite de anúncios ou ofertas.', ocupado: 'Esse item já está em outro anúncio ou oferta.',
    anuncio: 'Esse anúncio não existe mais.', proprio: 'Esse anúncio é seu.', repetida: 'Você já fez uma oferta nesse anúncio.',
    moedas: 'Quantidade de moedas inválida.', vazia: 'Ofereça moedas ou algum item.', oferta: 'Essa oferta não existe mais.',
    conexao: 'Sem conexão com o servidor.', tempo: 'O servidor demorou para responder.', 'sem-websocket': 'Este navegador não tem suporte às Trocas.'
  });

  VesperGame.createTrades = ({ game, toast, onChange }) => {
    const Profile = VesperGame.OnlineProfile;
    const tabs = [...document.querySelectorAll('.trades-tab')];
    let view = { market: [], listings: [], offers: [] };
    let tab = 'market';
    let shown = false;
    let busy = false;
    let timer = null;
    let target = null;

    const nameOf = key => {
      const [kind, id] = key.split(':');
      if (kind === 'acc') return (VesperGame.ONLINE.ACCESSORIES.find(item => item.id === id) || { name: id }).name;
      return (VesperGame.CHARACTERS.find(item => item.id === id) || { name: id }).name;
    };
    const describe = (coins, items) => [coins ? `${coins.toLocaleString('pt-BR')} moedas` : '', ...items.map(nameOf)].filter(Boolean).join(' + ');
    const status = text => { $('trades-status').textContent = text; };

    function art(key) {
      const canvas = document.createElement('canvas');
      canvas.className = 'trades-art';
      canvas.width = 120; canvas.height = 120;
      canvas.setAttribute('aria-hidden', 'true');
      const [kind, id] = key.split(':');
      if (kind === 'skin') game.drawCharacterPreview(canvas, id, false);
      else game.drawRewardArt(canvas, { type: 'accessory', id }, Profile.load().skin);
      return canvas;
    }

    function button(label, action, primary = false) {
      const element = document.createElement('button');
      element.type = 'button';
      element.className = primary ? 'trades-action is-main' : 'trades-action';
      element.textContent = label;
      element.addEventListener('click', action);
      return element;
    }

    function card(key, lines, actions) {
      const element = document.createElement('article');
      element.className = 'trades-card';
      const title = document.createElement('strong');
      title.textContent = nameOf(key);
      element.append(art(key), title);
      for (const text of lines) {
        const line = document.createElement('p');
        line.textContent = text;
        element.append(line);
      }
      const row = document.createElement('div');
      row.className = 'trades-actions';
      row.append(...actions);
      element.append(row);
      return element;
    }

    function empty(text) {
      const element = document.createElement('p');
      element.className = 'trades-empty';
      element.textContent = text;
      return element;
    }

    function render() {
      const profile = Profile.load();
      $('trades-coins').textContent = profile.coins.toLocaleString('pt-BR');
      for (const item of tabs) {
        item.classList.toggle('is-active', item.dataset.tab === tab);
        item.setAttribute('aria-selected', String(item.dataset.tab === tab));
      }
      const body = $('trades-body');
      if (tab === 'market') {
        body.replaceChildren(...(view.market.length ? view.market.map(listing => card(listing.item, [`Anunciado por ${listing.seller}`],
          [listing.offered ? button('OFERTA ENVIADA', () => { tab = 'offers'; render(); }) : button('FAZER OFERTA', () => openOffer(listing), true)]))
          : [empty('Ninguém anunciou nada ainda. Seja o primeiro na aba Anunciar.')]));
      } else if (tab === 'mine') {
        body.replaceChildren(...(view.listings.length ? view.listings.map(listing => {
          const offers = listing.offers.map(offer => {
            const row = document.createElement('div');
            row.className = 'trades-offer-row';
            const text = document.createElement('span');
            text.textContent = `${offer.buyer} oferece ${describe(offer.coins, offer.items)}`;
            row.append(text, button('ACEITAR', () => act('accept', { listing: listing.id, offer: offer.id }, 'Troca feita!'), true),
              button('RECUSAR', () => act('refuse', { listing: listing.id, offer: offer.id }, 'Oferta recusada.')));
            return row;
          });
          const element = card(listing.item, [listing.offers.length ? `${listing.offers.length} oferta(s)` : 'Nenhuma oferta ainda'],
            [button('RETIRAR ANÚNCIO', () => act('withdraw', { listing: listing.id }, 'Anúncio retirado.'))]);
          element.append(...offers);
          return element;
        }) : [empty('Você não tem anúncios. Use a aba Anunciar.')]));
      } else if (tab === 'offers') {
        body.replaceChildren(...(view.offers.length ? view.offers.map(offer => card(offer.item,
          [`De ${offer.seller}`, `Você ofereceu ${describe(offer.coins, offer.items)}`],
          [button('CANCELAR OFERTA', () => act('cancel', { offer: offer.id }, 'Oferta cancelada.'))]))
          : [empty('Você não fez ofertas.')]));
      } else {
        const items = Profile.tradeable();
        body.replaceChildren(...(items.length ? items.map(key => card(key, ['Fica disponível na Loja até você retirar'],
          [button('ANUNCIAR', () => act('list', { item: key }, 'Anúncio publicado.'), true)]))
          : [empty('Você não tem skins do Online, skins dos dois modos ou acessórios livres para anunciar.')]));
      }
    }

    async function call(op, payload) {
      const profile = Profile.load();
      const identity = { t: 'm', account: Profile.account(), name: profile.name || 'Jogador' };
      let reply = await VesperGame.Server.request({ ...identity, op, ...payload });
      if (!reply.ok) throw new Error(reply.error || 'conexao');
      const result = Profile.applyDeliveries(reply.data.deliveries);
      if (result.applied.length) {
        const ack = await VesperGame.Server.request({ ...identity, op: 'ack', ids: result.applied });
        if (ack.ok) reply = ack;
        onChange();
      }
      for (const note of result.notes) toast(note, 3200);
      view = reply.data;
    }

    async function act(op, payload = {}, success = '') {
      if (busy) return;
      busy = true;
      status('Atualizando…');
      try {
        await call(op, payload);
        status('');
        if (success) toast(success, 2600);
      } catch (error) {
        status(ERRORS[error.message] || 'Não foi possível completar agora.');
      } finally {
        busy = false;
        if (shown) render();
      }
    }

    function openOffer(listing) {
      target = listing;
      $('trades-offer-title').textContent = `Oferta por ${nameOf(listing.item)}`;
      $('trades-offer-coins').value = '0';
      $('trades-offer-coins').max = String(Profile.load().coins);
      const picks = Profile.tradeable().map(key => {
        const label = document.createElement('label');
        label.className = 'trades-pick';
        const check = document.createElement('input');
        check.type = 'checkbox';
        check.value = key;
        const text = document.createElement('span');
        text.textContent = nameOf(key);
        label.append(check, text);
        return label;
      });
      $('trades-offer-items').replaceChildren(...(picks.length ? picks : [empty('Nenhum item livre para oferecer.')]));
      $('trades-offer').hidden = false;
      $('trades-offer-coins').focus({ preventScroll: true });
    }

    function closeOffer() {
      target = null;
      $('trades-offer').hidden = true;
    }

    function sendOffer() {
      if (!target) return;
      const coins = Math.floor(Number($('trades-offer-coins').value) || 0);
      const items = [...$('trades-offer-items').querySelectorAll('input:checked')].map(input => input.value);
      if (coins < 0 || coins > Profile.load().coins) { status('Você não tem essas moedas.'); return; }
      if (!coins && !items.length) { status('Ofereça moedas ou algum item.'); return; }
      const listing = target;
      closeOffer();
      act('offer', { listing: listing.id, coins, items }, 'Oferta enviada.');
    }

    for (const item of tabs) item.addEventListener('click', () => { tab = item.dataset.tab; closeOffer(); render(); });
    $('trades-offer-send').addEventListener('click', sendOffer);
    $('trades-offer-cancel').addEventListener('click', closeOffer);

    return {
      show() {
        shown = true;
        tab = 'market';
        closeOffer();
        render();
        act('state');
        clearInterval(timer);
        timer = setInterval(() => { if (!busy && !target) act('state'); }, 15000);
      },
      hide() {
        shown = false;
        closeOffer();
        clearInterval(timer);
        VesperGame.Server.close();
      },
      sync() {
        if (!Profile.load().account) return Promise.resolve();
        return call('state').catch(() => {}).finally(() => { if (!shown) VesperGame.Server.close(); });
      }
    };
  };
})();
