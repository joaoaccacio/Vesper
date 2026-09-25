'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { tradeKeyOf } = require('./vesper-arena.js');

const LIMITS = Object.freeze({ listings: 10, offers: 20, items: 5, coins: 1000000, shown: 120, total: 600, deliveries: 200, bids: 30 });
const SETUP = 'CREATE TABLE IF NOT EXISTS vesper_store (key text PRIMARY KEY, value jsonb NOT NULL)';
const READ = 'SELECT value FROM vesper_store WHERE key = $1';
const CLAIM = "INSERT INTO vesper_store (key, value) VALUES ($1, 'null') ON CONFLICT (key) DO NOTHING";
const WRITE = 'UPDATE vesper_store SET value = $2 WHERE key = $1';

const ownerOf = account => crypto.createHash('sha256').update(account).digest('hex');
const makeId = () => crypto.randomBytes(8).toString('hex');
const cleanName = name => String(name || '').trim().slice(0, 14) || 'Jogador';
const shape = saved => ({
  listings: Array.isArray(saved?.listings) ? saved.listings : [],
  deliveries: saved?.deliveries && typeof saved.deliveries === 'object' ? saved.deliveries : {}
});

class FileStore {
  constructor(file) {
    this.file = file || '';
    this.docs = new Map();
    if (!this.file) return;
    try {
      const saved = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) this.docs = new Map(Object.entries(saved));
    } catch (_) {}
  }

  async setup() {}

  async update(key, change, write) {
    const current = this.docs.has(key) ? this.docs.get(key) : null;
    if (!write) return change(current);
    const draft = structuredClone(current);
    const result = change(draft);
    if (result.error) return result;
    const docs = new Map(this.docs).set(key, result.value === undefined ? draft : result.value);
    if (this.file) {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file + '.tmp', JSON.stringify(Object.fromEntries(docs)));
      fs.renameSync(this.file + '.tmp', this.file);
    }
    this.docs = docs;
    return result;
  }
}

class PgStore {
  constructor(url, Pool) {
    this.url = url;
    this.Pool = Pool;
    this.pool = null;
    this.ready = null;
  }

  setup() {
    if (!this.ready) {
      this.ready = (async () => {
        if (!this.pool) {
          const Pool = this.Pool || require('pg').Pool;
          this.pool = new Pool({ connectionString: this.url, max: 3, connectionTimeoutMillis: 20000, query_timeout: 20000 });
          this.pool.on('error', error => process.stderr.write('Banco das Trocas: ' + error.message + '\n'));
        }
        await this.pool.query(SETUP);
      })().catch(error => { this.ready = null; throw error; });
    }
    return this.ready;
  }

  async update(key, change, write) {
    await this.setup();
    const client = await this.pool.connect();
    let failure;
    try {
      if (!write) return change((await client.query(READ, [key])).rows[0]?.value ?? null);
      await client.query('BEGIN');
      await client.query(CLAIM, [key]);
      const current = (await client.query(READ + ' FOR UPDATE', [key])).rows[0]?.value ?? null;
      const result = change(current);
      if (!result.error) await client.query(WRITE, [key, JSON.stringify(result.value === undefined ? current : result.value)]);
      await client.query(result.error ? 'ROLLBACK' : 'COMMIT');
      return result;
    } catch (error) {
      failure = error;
      throw error;
    } finally {
      client.release(failure);
    }
  }
}

class Book {
  constructor(state) {
    this.listings = state.listings;
    this.deliveries = state.deliveries;
  }

  deliver(owner, change) {
    const box = this.deliveries[owner] || (this.deliveries[owner] = []);
    box.push({ id: makeId(), coins: 0, add: [], remove: [], lock: [], unlock: [], note: '', ...change });
    if (box.length > LIMITS.deliveries) box.splice(0, box.length - LIMITS.deliveries);
  }

  refund(offer, note) {
    this.deliver(offer.buyer, { coins: offer.coins, unlock: offer.items, note });
  }

  view(me) {
    const mine = this.listings.filter(listing => listing.owner === me);
    const offers = [];
    for (const listing of this.listings) {
      for (const offer of listing.offers) {
        if (offer.buyer === me) offers.push({ id: offer.id, listing: listing.id, item: listing.item, seller: listing.seller, coins: offer.coins, items: offer.items });
      }
    }
    return {
      market: this.listings.filter(listing => listing.owner !== me).slice(-LIMITS.shown).reverse().map(listing => ({
        id: listing.id, item: listing.item, seller: listing.seller,
        offered: listing.offers.some(offer => offer.buyer === me)
      })),
      listings: mine.map(listing => ({
        id: listing.id, item: listing.item,
        offers: listing.offers.map(offer => ({ id: offer.id, buyer: offer.buyerName, coins: offer.coins, items: offer.items }))
      })),
      offers,
      deliveries: me ? this.deliveries[me] || [] : []
    };
  }

  revokeItem(owner, key) {
    for (const listing of this.listings.filter(item => item.owner === owner && item.item === key)) {
      this.listings.splice(this.listings.indexOf(listing), 1);
      for (const offer of listing.offers) this.refund(offer, 'Anúncio retirado');
    }
    for (const listing of this.listings) {
      for (const offer of listing.offers.filter(item => item.buyer === owner && item.items.includes(key))) {
        listing.offers.splice(listing.offers.indexOf(offer), 1);
        this.refund(offer, '');
      }
    }
  }

  busyItems(me) {
    const busy = new Set();
    for (const listing of this.listings) {
      if (listing.owner === me) busy.add(listing.item);
      for (const offer of listing.offers) if (offer.buyer === me) for (const item of offer.items) busy.add(item);
    }
    return busy;
  }
}

const OPERATIONS = {
  state() { return ''; },

  ack(me, name, message) {
    const ids = new Set(Array.isArray(message.ids) ? message.ids.map(String) : []);
    if (this.deliveries[me]) {
      this.deliveries[me] = this.deliveries[me].filter(delivery => !ids.has(delivery.id));
      if (!this.deliveries[me].length) delete this.deliveries[me];
    }
    return '';
  },

  list(me, name, message) {
    const item = tradeKeyOf(message.item);
    if (!item) return 'item';
    if (this.listings.length >= LIMITS.total) return 'cheio';
    if (this.listings.filter(listing => listing.owner === me).length >= LIMITS.listings) return 'limite';
    if (this.busyItems(me).has(item)) return 'ocupado';
    this.listings.push({ id: makeId(), owner: me, seller: name, item, offers: [], created: Date.now() });
    this.deliver(me, { lock: [item] });
    return '';
  },

  withdraw(me, name, message) {
    const index = this.listings.findIndex(listing => listing.id === message.listing && listing.owner === me);
    if (index < 0) return 'anuncio';
    const [listing] = this.listings.splice(index, 1);
    for (const offer of listing.offers) this.refund(offer, 'Anúncio retirado');
    this.deliver(me, { unlock: [listing.item] });
    return '';
  },

  offer(me, name, message) {
    const listing = this.listings.find(item => item.id === message.listing);
    if (!listing) return 'anuncio';
    if (listing.owner === me) return 'proprio';
    if (listing.offers.some(offer => offer.buyer === me)) return 'repetida';
    if (listing.offers.length >= LIMITS.bids) return 'lotado';
    const coins = Math.floor(Number(message.coins) || 0);
    if (coins < 0 || coins > LIMITS.coins) return 'moedas';
    const items = [...new Set(Array.isArray(message.items) ? message.items.map(tradeKeyOf) : [])];
    if (items.includes(null) || items.length > LIMITS.items) return 'item';
    if (!coins && !items.length) return 'vazia';
    const busy = this.busyItems(me);
    if (items.some(item => busy.has(item))) return 'ocupado';
    let open = 0;
    for (const entry of this.listings) open += entry.offers.filter(offer => offer.buyer === me).length;
    if (open >= LIMITS.offers) return 'limite';
    listing.offers.push({ id: makeId(), buyer: me, buyerName: name, coins, items, created: Date.now() });
    this.deliver(me, { coins: -coins, lock: items });
    return '';
  },

  cancel(me, name, message) {
    for (const listing of this.listings) {
      const index = listing.offers.findIndex(offer => offer.id === message.offer && offer.buyer === me);
      if (index < 0) continue;
      const [offer] = listing.offers.splice(index, 1);
      this.refund(offer, '');
      return '';
    }
    return 'oferta';
  },

  refuse(me, name, message) {
    const listing = this.listings.find(item => item.id === message.listing && item.owner === me);
    if (!listing) return 'anuncio';
    const index = listing.offers.findIndex(offer => offer.id === message.offer);
    if (index < 0) return 'oferta';
    const [offer] = listing.offers.splice(index, 1);
    this.refund(offer, 'Oferta recusada');
    return '';
  },

  accept(me, name, message) {
    const index = this.listings.findIndex(item => item.id === message.listing && item.owner === me);
    if (index < 0) return 'anuncio';
    const listing = this.listings[index];
    const offer = listing.offers.find(item => item.id === message.offer);
    if (!offer) return 'oferta';
    this.listings.splice(index, 1);
    for (const other of listing.offers) if (other !== offer) this.refund(other, 'Item vendido para outra pessoa');
    this.deliver(me, { coins: offer.coins, add: offer.items, remove: [listing.item], unlock: [listing.item], note: 'Troca feita com ' + offer.buyerName });
    this.deliver(offer.buyer, { add: [listing.item], remove: offer.items, unlock: offer.items, note: 'Oferta aceita por ' + listing.seller });
    return '';
  }
};

class Market {
  constructor(store = new FileStore('')) {
    this.store = store;
  }

  async handle(client, message, who) {
    const reply = (ok, data, error) => client.send({ t: 'mr', rid: message.rid, ok, data, error });
    const run = Object.prototype.hasOwnProperty.call(OPERATIONS, message.op) ? OPERATIONS[message.op] : null;
    if (!run) { reply(false, null, 'pedido'); return; }
    if (!who && message.op !== 'state') { reply(false, null, 'conta'); return; }
    try {
      const result = await this.store.update('market', raw => {
        const state = shape(raw);
        const book = new Book(state);
        const error = who ? run.call(book, who.owner, cleanName(who.name), message) : '';
        return error ? { error } : { data: book.view(who ? who.owner : ''), value: state };
      }, Boolean(who) && message.op !== 'state');
      if (result.error) reply(false, null, result.error);
      else reply(true, result.data);
    } catch (error) {
      process.stderr.write('Trocas: ' + error.message + '\n');
      reply(false, null, 'servidor');
    }
  }
}

Market.prototype.rename = function (from, to) {
  return this.store.update('market', raw => {
    const state = shape(raw);
    for (const listing of state.listings) {
      if (listing.owner === from) listing.owner = to;
      for (const offer of listing.offers) if (offer.buyer === from) offer.buyer = to;
    }
    if (state.deliveries[from]) {
      state.deliveries[to] = [...(state.deliveries[to] || []), ...state.deliveries[from]];
      delete state.deliveries[from];
    }
    return { value: state };
  }, true);
};

Market.prototype.banish = function (owner) {
  return this.store.update('market', raw => {
    const state = shape(raw);
    const book = new Book(state);
    for (const listing of state.listings.filter(item => item.owner === owner)) {
      state.listings.splice(state.listings.indexOf(listing), 1);
      for (const offer of listing.offers) book.refund(offer, 'Anúncio retirado');
    }
    for (const listing of state.listings) {
      for (const offer of listing.offers.filter(item => item.buyer === owner)) {
        listing.offers.splice(listing.offers.indexOf(offer), 1);
        book.refund(offer, '');
      }
    }
    return { value: state };
  }, true);
};

Market.prototype.grant = function (owner, change, revoke = '') {
  return this.store.update('market', raw => {
    const state = shape(raw);
    const book = new Book(state);
    if (revoke) book.revokeItem(owner, revoke);
    book.deliver(owner, change);
    return { value: state };
  }, true);
};

module.exports = { Market, FileStore, PgStore, LIMITS, ownerOf };
