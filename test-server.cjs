'use strict';

process.env.VESPER_MATCH_SECONDS = process.env.VESPER_MATCH_SECONDS || '3';
process.env.VESPER_BOT_FILL = process.env.VESPER_BOT_FILL || '0.4';
process.env.VESPER_CAPACITY = process.env.VESPER_CAPACITY || '4';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { createServer, encodeFrame } = require('./vesper-server.cjs');
const { Market, FileStore, PgStore } = require('./vesper-market.cjs');
const { Accounts } = require('./vesper-accounts.cjs');
const VesperArena = require('./vesper-arena.js');

const { CONFIG, Arena } = VesperArena;
const failures = [];
let passed = 0;

const tests = [];
function test(name, run) { tests.push({ name, run }); }

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const servers = new Map();
const accounts = new Map();
let people = 0;

function listen(options = {}) {
  const server = createServer({ dataDir: null, ...options });
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      servers.set(server.address().port, server);
      resolve({ server, port: server.address().port });
    });
  });
}

function account(server, name, password = 'segredo1') {
  const key = server.address().port + ':' + name.toLowerCase();
  if (!accounts.has(key)) {
    accounts.set(key, new Promise((resolve, reject) => {
      server.hub.accounts.handle({ address: 'teste:' + name, send: reply => (reply.ok ? resolve(reply.session) : reject(new Error('conta de teste: ' + reply.error))) }, { op: 'register', name, password });
    }));
  }
  return accounts.get(key);
}

class Client {
  constructor(port, headers = {}) {
    this.port = port;
    this.rid = 0;
    this.messages = [];
    this.socket = new WebSocket('ws://127.0.0.1:' + port, { headers });
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener('open', () => resolve(this));
      this.socket.addEventListener('error', () => reject(new Error('conexao falhou')));
    });
    this.ready.catch(() => {});
    this.socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      this.messages.push(message);
      if (message.t === 'joined') this.joined = message;
      if (message.t === 's') this.snapshot = message;
      if (message.t === 'over') this.over = message;
    });
  }
  send(value) {
    if (!['join', 'create', 'enter'].includes(value.t) || 'session' in value) { this.socket.send(JSON.stringify(value)); return; }
    const name = /^[A-Za-z0-9À-ÖØ-öø-ÿ_.-]{3,14}$/.test(value.name || '') ? value.name : 'Jogador' + ++people;
    account(servers.get(this.port), name).then(session => this.socket.send(JSON.stringify({ ...value, session })));
  }
  ask(message, timeout = 4000) {
    const rid = 'r' + ++this.rid;
    this.send({ ...message, rid });
    return this.waitFor(reply => reply.rid === rid, timeout);
  }
  close() { try { this.socket.close(); } catch (_) {  } }
  async waitFor(predicate, timeout = 4000) {
    const limit = Date.now() + timeout;
    while (Date.now() < limit) {
      const found = this.messages.find(predicate);
      if (found) return found;
      await wait(20);
    }
    throw new Error('mensagem esperada nao chegou');
  }
}

test('o quadro WebSocket vai e volta com cargas curtas, medias e longas', () => {
  for (const size of [5, 200, 70000]) {
    const payload = 'x'.repeat(size);
    const frame = encodeFrame(0x1, payload);
    const first = frame[1] & 0x7f;
    const offset = first < 126 ? 2 : first === 126 ? 4 : 10;
    assert.equal(frame[0], 0x81);
    assert.equal(frame.length - offset, Buffer.byteLength(payload));
    assert.equal(frame.subarray(offset).toString('utf8'), payload);
  }
});

test('dois clientes entram na mesma sala e enxergam um ao outro', async () => {
  const { server, port } = await listen();
  try {
    const one = new Client(port);
    await one.ready;
    one.send({ t: 'join', name: 'Guino', skin: 'orc' });
    const first = await one.waitFor(message => message.t === 'joined');
    const two = new Client(port);
    await two.ready;
    two.send({ t: 'join', name: 'Amiga', skin: 'cyborg' });
    const second = await two.waitFor(message => message.t === 'joined');
    assert.equal(first.room, second.room, 'A segunda pessoa entra na sala aberta');
    assert.notEqual(first.id, second.id);
    assert.equal(first.capacity, CONFIG.capacity);
    const roster = second.roster;
    assert.ok(roster.some(entry => entry.name === 'Guino' && entry.skin === 'orc'));
    assert.ok(roster.some(entry => entry.name === 'Amiga' && entry.skin === 'cyborg'));
    const joinEvent = await one.waitFor(message => (message.e || []).some(event => event.e === 'join' && event.name === 'Amiga'));
    assert.ok(joinEvent);
    const snapshot = await one.waitFor(message => message.t === 's' && message.f.length >= 2);
    assert.ok(snapshot.f.every(row => row.length === 11));
    one.close(); two.close();
  } finally { server.closeAll(); }
});

test('o servidor manda no movimento e normaliza entrada exagerada', async () => {
  const { server, port } = await listen();
  try {
    const client = new Client(port);
    await client.ready;
    client.send({ t: 'join', name: 'Guino', skin: 'alien' });
    const joined = await client.waitFor(message => message.t === 'joined');
    const room = server.hub.rooms.get(joined.room);
    const fighter = room.arena.fighters.find(item => item.id === joined.id);
    const startX = fighter.x;
    client.send({ t: 'in', x: 900, y: 0, f: 0 });
    await wait(400);
    assert.ok(Math.hypot(fighter.mx, fighter.my) <= 1.0001, 'A direcao e normalizada');
    const travelled = Math.abs(fighter.x - startX);
    const ceiling = CONFIG.speed * 0.6;
    assert.ok(travelled > 10, 'O lutador andou de verdade');
    assert.ok(travelled < ceiling, 'Ninguem anda mais rapido que o limite do servidor');
    client.close();
  } finally { server.closeAll(); }
});

test('a cadencia de tiro obedece a arma, mesmo com o cliente pedindo mais', async () => {
  const { server, port } = await listen();
  try {
    const client = new Client(port);
    await client.ready;
    client.send({ t: 'join', name: 'Guino', skin: 'alien' });
    const joined = await client.waitFor(message => message.t === 'joined');
    const room = server.hub.rooms.get(joined.room);
    room.arena.join({ bot: true });
    for (let i = 0; i < 40; i++) { client.send({ t: 'in', x: 0, y: 0, f: 1 }); }
    await wait(1000);
    const shots = client.messages
      .filter(message => message.t === 's')
      .flatMap(message => (message.e || []).filter(event => event.e === 'shot' && event.id === joined.id));
    const weapon = VesperArena.weaponFor(1);
    assert.ok(shots.length >= 1, 'O tiro acontece');
    assert.ok(shots.length <= Math.ceil(1.2 / weapon.interval), 'O servidor limita a cadencia');
    client.close();
  } finally { server.closeAll(); }
});

test('sala cheia abre outra sala automaticamente', async () => {
  const { server, port } = await listen();
  try {
    const clients = [];
    const rooms = [];
    for (let i = 0; i < CONFIG.capacity + 2; i++) {
      const client = new Client(port);
      await client.ready;
      client.send({ t: 'join', name: 'P' + i, skin: 'alien' });
      const joined = await client.waitFor(message => message.t === 'joined');
      rooms.push(joined.room);
      clients.push(client);
    }
    assert.equal(new Set(rooms).size, 2, 'Passou da capacidade, nasce a segunda sala');
    assert.equal(rooms.filter(room => room === rooms[0]).length, CONFIG.capacity);
    for (const client of clients) client.close();
  } finally { server.closeAll(); }
});

test('os bots preenchem a sala e saem quando chega gente', async () => {
  const { server, port } = await listen();
  try {
    const client = new Client(port);
    await client.ready;
    client.send({ t: 'join', name: 'Guino', skin: 'alien' });
    const joined = await client.waitFor(message => message.t === 'joined');
    const room = server.hub.rooms.get(joined.room);
    await wait(800);
    assert.equal(room.arena.fighters.length, CONFIG.capacity, 'A sala fica cheia');
    assert.equal(room.arena.bots, CONFIG.capacity - 1);
    const names = room.arena.fighters.map(fighter => fighter.name);
    assert.equal(new Set(names).size, names.length, 'Sem nomes repetidos');
    const friend = new Client(port);
    await friend.ready;
    friend.send({ t: 'join', name: 'Amiga', skin: 'orc' });
    await friend.waitFor(message => message.t === 'joined');
    assert.equal(room.arena.fighters.length, CONFIG.capacity, 'O humano toma o lugar de um bot');
    assert.equal(room.arena.humans, 2);
    client.close(); friend.close();
  } finally { server.closeAll(); }
});

test('cair e voltar em poucos segundos devolve o mesmo lutador', async () => {
  const { server, port } = await listen();
  try {
    const client = new Client(port);
    await client.ready;
    client.send({ t: 'join', name: 'Guino', skin: 'alien' });
    const joined = await client.waitFor(message => message.t === 'joined');
    const room = server.hub.rooms.get(joined.room);
    const fighter = room.arena.fighters.find(item => item.id === joined.id);
    fighter.kills = 3;
    fighter.level = 5;
    client.close();
    await wait(300);
    assert.ok(room.arena.fighters.some(item => item.id === joined.id), 'O lugar fica guardado');
    const back = new Client(port);
    await back.ready;
    back.send({ t: 'join', name: 'Guino', skin: 'alien', token: joined.token });
    const resumed = await back.waitFor(message => message.t === 'joined');
    assert.equal(resumed.resumed, true);
    assert.equal(resumed.id, joined.id);
    assert.equal(room.arena.fighters.find(item => item.id === joined.id).kills, 3, 'O progresso continua');
    back.close();
  } finally { server.closeAll(); }
});

test('o fim da partida manda ranking com moedas e bots marcados', async () => {
  const { server, port } = await listen();
  try {
    const client = new Client(port);
    await client.ready;
    client.send({ t: 'join', name: 'Guino', skin: 'alien' });
    const joined = await client.waitFor(message => message.t === 'joined');
    const room = server.hub.rooms.get(joined.room);
    const fighter = room.arena.fighters.find(item => item.id === joined.id);
    fighter.level = 10;
    fighter.kills = 6;
    fighter.humanKills = 2;
    fighter.botKills = 4;
    const over = await client.waitFor(message => message.t === 'over', 8000);
    assert.equal(over.ranking.length, room.arena.fighters.length);
    const mine = over.ranking.find(entry => entry.id === joined.id);
    assert.equal(mine.rank, 1);
    const weighted = 2 * CONFIG.humanReward + 4 * CONFIG.botReward;
    assert.equal(mine.coins, Math.round(VesperArena.coinsFor(1, 10, weighted)));
    assert.ok(over.ranking.some(entry => entry.bot === true), 'Os bots vem marcados');
    assert.ok(mine.coins > VesperArena.coinsFor(1, 10, 0), 'Abates pagam moedas');
    client.close();
  } finally { server.closeAll(); }
});

test('mensagem invalida ou fora de ordem nao derruba o servidor', async () => {
  const { server, port } = await listen();
  try {
    const client = new Client(port);
    await client.ready;
    client.send({ t: 'in', x: 1, y: 1, f: 1 });
    client.socket.send('isto nao e json');
    client.send({ t: 'desconhecido' });
    client.send({ t: 'join', name: '', skin: 'inexistente' });
    const joined = await client.waitFor(message => message.t === 'joined');
    const room = server.hub.rooms.get(joined.room);
    const fighter = room.arena.fighters.find(item => item.id === joined.id);
    assert.match(fighter.name, /^Jogador\d+$/, 'O nome vem da conta, nao do que o cliente mandou');
    assert.equal(fighter.skin, 'alien');
    client.send({ t: 'in', x: 'a', y: null, f: 1 });
    await wait(200);
    assert.ok(Number.isFinite(fighter.x) && Number.isFinite(fighter.y));
    client.close();
  } finally { server.closeAll(); }
});

test('a arena roda uma partida inteira sem estourar limites', () => {
  const arena = new Arena();
  arena.fill();
  let maxShots = 0;
  const steps = Math.ceil(CONFIG.matchSeconds * CONFIG.tickRate) + 20;
  for (let i = 0; i < steps; i++) {
    arena.step(1 / CONFIG.tickRate);
    maxShots = Math.max(maxShots, arena.shots.length);
    for (const fighter of arena.fighters) {
      assert.ok(Number.isFinite(fighter.x) && Number.isFinite(fighter.y) && Number.isFinite(fighter.hp));
      assert.ok(fighter.level >= 1 && fighter.level <= CONFIG.levelCap);
    }
  }
  assert.equal(arena.finished, true);
  assert.ok(maxShots <= CONFIG.shotLimit);
  const ranking = arena.ranking();
  assert.equal(ranking.length, CONFIG.capacity);
  assert.equal(ranking[0].rank, 1);
});

test('as variaveis de ambiente aceitam zero para desligar a espera por gente', () => {
  const output = require('node:child_process').execFileSync(process.execPath,
    ['-e', "process.stdout.write(String(require('./vesper-arena.js').CONFIG.botFill))"],
    { env: { ...process.env, VESPER_BOT_FILL: '0' }, encoding: 'utf8' });
  assert.equal(output, '0', 'VESPER_BOT_FILL=0 enche a sala na hora');
  const padrao = require('node:child_process').execFileSync(process.execPath,
    ['-e', "process.stdout.write(String(require('./vesper-arena.js').CONFIG.botFill))"],
    { env: { ...process.env, VESPER_BOT_FILL: 'abc' }, encoding: 'utf8' });
  assert.equal(padrao, '8', 'Valor invalido volta para o padrao');
});

test('o bot para de atirar quando perde o alvo', () => {
  const arena = new Arena();
  const bot = arena.join({ bot: true, skin: 'alien' });
  const alvo = arena.join({ bot: true, skin: 'orc' });
  bot.x = 0; bot.y = 0;
  alvo.x = 120; alvo.y = 0;
  bot.think = 1;
  bot.target = alvo;
  arena.stepBot(bot, 0.05);
  assert.equal(bot.firing, true, 'Com alvo por perto o bot atira');
  alvo.alive = false;
  arena.stepBot(bot, 0.05);
  assert.equal(bot.firing, false, 'Sem alvo o bot para de atirar');
});

test('quem para de mandar entrada para de andar no servidor', () => {
  const arena = new Arena();
  const humano = arena.join({ name: 'Guino', skin: 'alien' });
  humano.x = 0;
  humano.y = 0;
  arena.input(humano.id, 1, 0, false);
  arena.step(0.05);
  const andou = humano.x;
  assert.ok(Math.abs(andou - 0) >= 0, 'Andou com a entrada recebida');
  for (let i = 0; i < Math.ceil(CONFIG.inputTimeout / 0.05) + 2; i++) arena.step(0.05);
  const parado = humano.x;
  arena.step(0.05);
  assert.equal(humano.mx, 0, 'A entrada orfa e zerada');
  assert.equal(humano.x, parado, 'E o lutador para de andar sozinho');
  arena.input(humano.id, 1, 0, false);
  arena.step(0.05);
  assert.ok(humano.x > parado, 'Voltando a mandar entrada, volta a andar');
});

test('a mira automatica trata caixa de XP como qualquer alvo', () => {
  const arena = new Arena();
  const humano = arena.join({ name: 'Guino', skin: 'alien' });
  const rival = arena.join({ bot: true, skin: 'orc' });
  humano.x = 0; humano.y = 0; humano.spawnGuard = 0;
  rival.x = 400; rival.y = 0; rival.spawnGuard = 0; rival.think = 99; rival.target = null;
  for (const crate of arena.crates) crate.respawn = 99;
  const caixa = arena.crates[0];
  caixa.respawn = 0; caixa.x = 0; caixa.y = 150;
  arena.step(0.05);
  assert.ok(Math.abs(humano.aim - Math.PI / 2) < 1e-6, 'A caixa mais perto vira o alvo');
  caixa.y = 600;
  arena.step(0.05);
  assert.ok(Math.abs(humano.aim) < 1e-6, 'O rival mais perto vira o alvo');
  rival.spawnGuard = 1;
  arena.step(0.05);
  assert.ok(Math.abs(humano.aim - Math.PI / 2) < 1e-6, 'Quem acabou de nascer e intocavel nao prende a mira');
});

test('tiro a queima-roupa acerta quem esta colado', () => {
  const arena = new Arena();
  const humano = arena.join({ name: 'Guino', skin: 'alien' });
  const rival = arena.join({ bot: true, skin: 'orc' });
  for (const crate of arena.crates) crate.respawn = 99;
  humano.x = 0; humano.y = 0; humano.spawnGuard = 0;
  rival.x = 6; rival.y = 0; rival.spawnGuard = 0; rival.think = 99; rival.target = null;
  arena.input(humano.id, 0, 0, true);
  const events = arena.step(0.05);
  assert.ok(events.some(event => event.e === 'hit' && event.id === rival.id && event.by === humano.id));
});

test('o mesmo cliente nao entra duas vezes na partida', async () => {
  const { server, port } = await listen();
  const client = new Client(port);
  try {
    await client.ready;
    client.send({ t: 'join', name: 'Guino', skin: 'alien' });
    const joined = await client.waitFor(message => message.t === 'joined');
    client.send({ t: 'join', name: 'Guino', skin: 'alien' });
    await wait(150);
    const room = server.hub.rooms.get(joined.room);
    assert.equal(room.arena.humans, 1);
    assert.equal(client.messages.filter(message => message.t === 'joined').length, 1);
  } finally { client.close(); server.closeAll(); }
});

test('subir de nivel fica mais caro a cada nivel, sem pesar no comeco', () => {
  const { nextXpFor } = VesperArena;
  assert.equal(nextXpFor(1), 22, 'O primeiro nivel continua igual');
  assert.ok(nextXpFor(2) <= 36, 'O segundo nivel quase nao muda');
  let previousStep = 0;
  for (let level = 2; level < CONFIG.levelCap; level++) {
    const step = nextXpFor(level) - nextXpFor(level - 1);
    assert.ok(step > previousStep, 'O salto de XP cresce no nivel ' + level);
    previousStep = step;
  }
  assert.ok(nextXpFor(11) < nextXpFor(1) * 12, 'Nem o ultimo nivel fica absurdo');
});

test('doze armas: dano e cadencia sobem juntos ate a 10, e as duas ultimas batem muito mais forte', () => {
  const { WEAPONS } = VesperArena;
  assert.equal(CONFIG.levelCap, 12);
  assert.equal(CONFIG.botLevelCap, 10);
  assert.deepEqual(WEAPONS.map(weapon => weapon.name), ['Revólver', 'Pistola', 'Pistola Automática', 'Escopeta', 'Carabina', 'Rifle',
    'Submetralhadora', 'Rifle de Assalto', 'AK-47', 'Metralhadora', 'Canhão de Plasma Vesper', 'Lançador de Granada Vesper']);
  for (let i = 1; i < 10; i++) {
    assert.ok(WEAPONS[i].damage > WEAPONS[i - 1].damage, 'Dano sobe na arma ' + (i + 1));
    assert.ok(WEAPONS[i].interval < WEAPONS[i - 1].interval, 'Cadencia sobe na arma ' + (i + 1));
    assert.ok(WEAPONS[i].speed > WEAPONS[i - 1].speed, 'O tiro fica mais rapido na arma ' + (i + 1));
  }
  const [plasma, grenade] = WEAPONS.slice(10);
  assert.ok(plasma.heavy && grenade.heavy);
  assert.ok(plasma.damage >= WEAPONS[9].damage * 5 && grenade.damage > plasma.damage);
  assert.ok(Math.max(plasma.speed, grenade.speed) < WEAPONS[0].speed, 'Os projeteis especiais sao os mais lentos');
});

test('bots param no nivel 10 e so gente chega aos niveis 11 e 12', () => {
  const arena = new Arena();
  const bot = arena.join({ bot: true, skin: 'alien' });
  const human = arena.join({ name: 'Guino', skin: 'alien' });
  arena.grantXp(bot, 100000);
  arena.grantXp(human, 100000);
  assert.equal(bot.level, CONFIG.botLevelCap);
  assert.equal(human.level, CONFIG.levelCap);
  assert.equal(human.maxHp, VesperArena.WEAPONS[11].hp);
});

test('arma especial so atira de novo quando o projetil chega, com meio segundo a mais se acertar', () => {
  const arena = new Arena();
  const human = arena.join({ name: 'Guino', skin: 'alien' });
  const target = arena.join({ bot: true, skin: 'orc' });
  for (const crate of arena.crates) crate.respawn = 999;
  arena.grantXp(human, 100000);
  human.x = 0; human.y = 0; human.spawnGuard = 0;
  target.x = 300; target.y = 0; target.spawnGuard = 0; target.think = 999; target.target = null; target.hp = target.maxHp = 5000;
  arena.input(human.id, 0, 0, true);
  const shots = [];
  const hits = [];
  for (let i = 0; i < 60; i++) {
    arena.input(human.id, 0, 0, true);
    for (const event of arena.step(0.05)) {
      if (event.e === 'shot' && event.id === human.id) shots.push(arena.elapsed);
      if (event.e === 'hit' && event.by === human.id) hits.push(arena.elapsed);
    }
    target.x = 300; target.y = 0;
  }
  assert.ok(shots.length >= 2 && hits.length >= 1);
  assert.ok(hits[0] > shots[0] + 0.6, 'O projetil especial e lento');
  assert.ok(shots[1] >= hits[0] + CONFIG.heavyReload - 0.051, 'Depois de acertar espera meio segundo');
  const miss = new Arena();
  const shooter = miss.join({ name: 'Guino', skin: 'alien' });
  const runner = miss.join({ bot: true, skin: 'orc' });
  for (const crate of miss.crates) crate.respawn = 999;
  miss.grantXp(shooter, 100000);
  shooter.x = 0; shooter.y = 0; shooter.spawnGuard = 0;
  runner.x = 300; runner.y = 0; runner.spawnGuard = 0; runner.think = 999; runner.target = null;
  miss.input(shooter.id, 0, 0, true);
  miss.step(0.05);
  assert.equal(shooter.heavyShots, 1);
  runner.y = 400;
  let ended = 0;
  for (let i = 0; i < 40 && !ended; i++) {
    miss.input(shooter.id, 0, 0, false);
    miss.step(0.05);
    if (shooter.heavyShots === 0) ended = miss.elapsed;
  }
  assert.ok(ended > 0, 'O tiro perdido termina ao chegar no ponto do alvo');
  assert.ok(shooter.fireTimer <= 0, 'Errando, o meio segundo extra e ignorado');
});

test('veneno mostra o dano em pulsos, nao a cada quadro', () => {
  const arena = new Arena();
  const plague = arena.join({ name: 'P', skin: 'plague' });
  const victim = arena.join({ bot: true, skin: 'alien' });
  victim.spawnGuard = 0; victim.think = 999; victim.target = null; victim.hp = victim.maxHp = 5000;
  arena.hurt(victim, 10, plague.id, 8, 1);
  let pulses = 0;
  for (let i = 0; i < 70; i++) for (const event of arena.step(0.05)) if (event.e === 'hit' && event.p) pulses++;
  assert.ok(pulses >= 5 && pulses <= 8, 'Veneno avisa poucas vezes: ' + pulses);
  assert.ok(victim.hp < 5000 - 10 - 20, 'Mas continua tirando vida');
});

test('acessorios chegam limpos ao servidor e os bots tambem usam', () => {
  const arena = new Arena();
  const human = arena.join({ name: 'Guino', skin: 'banana', acc: ['mini', 'coroa', 'hat', 'hat'] });
  assert.deepEqual(human.acc, ['hat', 'mini']);
  assert.equal(human.skin, 'banana', 'Skin dos dois modos vale no Online');
  assert.deepEqual(arena.roster().find(entry => entry.id === human.id).acc, ['hat', 'mini']);
  for (let i = 0; i < 40; i++) arena.join({ bot: true });
  const ids = VesperArena.ACCESSORIES.map(item => item.id);
  assert.ok(arena.fighters.every(fighter => fighter.acc.every(id => ids.includes(id))));
  assert.ok(arena.fighters.some(fighter => fighter.bot && fighter.acc.length), 'Bots tambem aparecem com acessorio');
});

test('a mira das armas especiais adianta o alvo que esta andando', () => {
  const arena = new Arena();
  const human = arena.join({ name: 'Guino', skin: 'alien' });
  const target = arena.join({ bot: true, skin: 'orc' });
  human.x = 0; human.y = 0;
  target.x = 300; target.y = 0; target.mx = 0; target.my = 1;
  arena.aimAt(human, target);
  assert.equal(human.aim, 0, 'Com arma normal mira onde o alvo esta');
  arena.grantXp(human, 100000);
  arena.aimAt(human, target);
  assert.ok(human.aim > 0.3, 'Com arma especial mira onde o alvo vai estar');
  assert.ok(human.aimDistance > 300, 'E o projetil voa ate o ponto previsto');
});

test('servidor privado: codigo de 6 digitos, sala de espera, sem bots e so o criador comeca', async () => {
  const { server, port } = await listen();
  const host = new Client(port), friend = new Client(port), late = new Client(port), lost = new Client(port);
  try {
    await Promise.all([host.ready, friend.ready, late.ready, lost.ready]);
    host.send({ t: 'create', name: 'Guino', skin: 'banana', acc: ['crown'] });
    const lobby = await host.waitFor(message => message.t === 'lobby');
    assert.match(lobby.code, /^\d{6}$/);
    assert.equal(lobby.host, true);
    lost.send({ t: 'enter', code: lobby.code === '000000' ? '000001' : '000000', name: 'X' });
    assert.equal((await lost.waitFor(message => message.t === 'error')).reason, 'code');
    friend.send({ t: 'enter', code: lobby.code, name: 'Amiga', skin: 'soldier' });
    const seen = await friend.waitFor(message => message.t === 'lobby');
    assert.equal(seen.host, false);
    assert.deepEqual(seen.players.map(player => player.name), ['Guino', 'Amiga']);
    assert.deepEqual(seen.players[0].acc, ['crown']);
    await host.waitFor(message => message.t === 'lobby' && message.players.length === 2);
    friend.send({ t: 'start' });
    await wait(120);
    assert.equal(friend.messages.some(message => message.t === 'joined'), false, 'So o criador comeca');
    host.send({ t: 'start' });
    await host.waitFor(message => message.t === 'joined');
    await friend.waitFor(message => message.t === 'joined');
    await wait(700);
    const room = server.hub.codes.get(lobby.code);
    assert.equal(room.arena.bots, 0, 'Servidor privado nao tem bots');
    assert.equal(room.arena.fighters.length, 2);
    late.send({ t: 'enter', code: lobby.code, name: 'Atrasado' });
    assert.equal((await late.waitFor(message => message.t === 'error')).reason, 'started');
    const status = JSON.parse(await new Promise(resolve => http.get('http://127.0.0.1:' + port + '/status', response => {
      let body = ''; response.on('data', chunk => { body += chunk; }); response.on('end', () => resolve(body));
    })));
    assert.equal(status.rooms.length, 0, 'Sala privada nao aparece no status publico');
  } finally { for (const client of [host, friend, late, lost]) client.close(); server.closeAll(); }
});

test('quando o criador sai da sala de espera todos sao avisados e o codigo morre', async () => {
  const { server, port } = await listen();
  const host = new Client(port), friend = new Client(port), again = new Client(port), open = new Client(port);
  try {
    await Promise.all([host.ready, friend.ready, again.ready, open.ready]);
    host.send({ t: 'create', name: 'Guino' });
    const { code } = await host.waitFor(message => message.t === 'lobby');
    open.send({ t: 'join', name: 'Publico' });
    const joined = await open.waitFor(message => message.t === 'joined');
    assert.notEqual(server.hub.rooms.get(joined.room).code, code, 'Partida publica nunca cai na sala privada');
    friend.send({ t: 'enter', code, name: 'Amiga' });
    await friend.waitFor(message => message.t === 'lobby');
    host.send({ t: 'bye' });
    assert.equal((await friend.waitFor(message => message.t === 'closed')).reason, 'host');
    again.send({ t: 'enter', code, name: 'Outra' });
    assert.equal((await again.waitFor(message => message.t === 'error')).reason, 'code');
  } finally { for (const client of [host, friend, again, open]) client.close(); server.closeAll(); }
});

test('senha do painel de admin e conferida no servidor e barrada depois de varias tentativas', async () => {
  const { server, port } = await listen();
  const client = new Client(port);
  try {
    await client.ready;
    for (let i = 1; i <= 5; i++) {
      client.send({ t: 'admin', rid: i, key: 'errada' + i });
      const reply = await client.waitFor(message => message.t === 'admin' && message.rid === i, 8000);
      assert.equal(reply.ok, false);
      assert.equal(reply.wait, undefined);
    }
    client.send({ t: 'admin', rid: 6, key: 'outra' });
    const blocked = await client.waitFor(message => message.t === 'admin' && message.rid === 6);
    assert.equal(blocked.ok, false);
    assert.ok(blocked.wait >= 1, 'Depois de cinco erros precisa esperar');
    const source = fs.readFileSync(path.join(__dirname, 'vesper-server.cjs'), 'utf8');
    assert.ok(/salt: '[0-9a-f]{32}', hash: '[0-9a-f]{64}', rounds: \d+/.test(source), 'So o resumo da senha fica no codigo');
  } finally { client.close(); server.closeAll(); }
});

test('trocas: anunciar, ofertar, recusar, aceitar e retirar mexem so no que foi combinado', async () => {
  const market = new Market();
  const seller = 'a'.repeat(32), buyer = 'b'.repeat(32), rival = 'c'.repeat(32);
  const replies = [];
  const client = { send: message => replies.push(message) };
  const ask = async (account, name, op, extra = {}) => { await market.handle(client, { t: 'm', rid: replies.length, op, ...extra }, account ? { owner: account, name } : null); return replies.at(-1); };
  assert.equal((await ask(null, 'X', 'list', { item: 'acc:crown' })).error, 'conta', 'Sem conta nao anuncia');
  assert.equal((await ask(null, 'X', 'state')).ok, true, 'Sem conta ainda da para ver a loja');
  assert.equal((await ask(seller, 'Vendedor', 'list', { item: 'skin:alien' })).error, 'item');
  const listed = await ask(seller, 'Vendedor', 'list', { item: 'acc:crown' });
  assert.equal(listed.ok, true);
  assert.deepEqual(listed.data.deliveries.at(-1).lock, ['acc:crown']);
  assert.equal((await ask(seller, 'Vendedor', 'list', { item: 'acc:crown' })).error, 'ocupado');
  const listing = (await ask(buyer, 'Comprador', 'state')).data.market[0];
  assert.equal(listing.seller, 'Vendedor');
  assert.equal((await ask(seller, 'Vendedor', 'offer', { listing: listing.id, coins: 10 })).error, 'proprio');
  assert.equal((await ask(buyer, 'Comprador', 'offer', { listing: listing.id })).error, 'vazia');
  const offered = await ask(buyer, 'Comprador', 'offer', { listing: listing.id, coins: 500, items: ['skin:soldier'] });
  assert.equal(offered.ok, true);
  assert.deepEqual({ coins: offered.data.deliveries.at(-1).coins, lock: offered.data.deliveries.at(-1).lock }, { coins: -500, lock: ['skin:soldier'] });
  assert.equal((await ask(buyer, 'Comprador', 'offer', { listing: listing.id, coins: 1 })).error, 'repetida');
  await ask(rival, 'Rival', 'offer', { listing: listing.id, coins: 900 });
  const mine = (await ask(seller, 'Vendedor', 'state')).data.listings[0];
  assert.equal(mine.offers.length, 2);
  const rivalOffer = mine.offers.find(offer => offer.buyer === 'Rival');
  await ask(seller, 'Vendedor', 'refuse', { listing: listing.id, offer: rivalOffer.id });
  assert.equal((await ask(rival, 'Rival', 'state')).data.deliveries.at(-1).coins, 900, 'Recusar devolve as moedas');
  assert.equal((await ask(buyer, 'Comprador', 'state')).data.market.length, 1, 'Recusar deixa o anuncio no ar');
  const buyerOffer = (await ask(seller, 'Vendedor', 'state')).data.listings[0].offers[0];
  await ask(seller, 'Vendedor', 'accept', { listing: listing.id, offer: buyerOffer.id });
  const sold = (await ask(seller, 'Vendedor', 'state')).data;
  assert.equal(sold.listings.length, 0);
  const paid = sold.deliveries.at(-1);
  assert.deepEqual({ coins: paid.coins, add: paid.add, remove: paid.remove }, { coins: 500, add: ['skin:soldier'], remove: ['acc:crown'] });
  const got = (await ask(buyer, 'Comprador', 'state')).data.deliveries.at(-1);
  assert.deepEqual({ add: got.add, remove: got.remove }, { add: ['acc:crown'], remove: ['skin:soldier'] });
  const pending = (await ask(buyer, 'Comprador', 'state')).data.deliveries;
  assert.ok(pending.length > 0);
  await ask(buyer, 'Comprador', 'ack', { ids: pending.map(delivery => delivery.id) });
  assert.equal((await ask(buyer, 'Comprador', 'state')).data.deliveries.length, 0, 'Entrega confirmada sai da fila');
  await ask(seller, 'Vendedor', 'list', { item: 'skin:banana' });
  const second = (await ask(rival, 'Rival', 'state')).data.market[0];
  await ask(rival, 'Rival', 'offer', { listing: second.id, coins: 40 });
  const offerId = (await ask(rival, 'Rival', 'state')).data.offers[0].id;
  await ask(rival, 'Rival', 'cancel', { offer: offerId });
  assert.equal((await ask(rival, 'Rival', 'state')).data.deliveries.at(-1).coins, 40, 'Cancelar devolve as moedas');
  await ask(rival, 'Rival', 'offer', { listing: second.id, items: ['acc:hat'] });
  await ask(seller, 'Vendedor', 'withdraw', { listing: second.id });
  assert.deepEqual((await ask(rival, 'Rival', 'state')).data.deliveries.at(-1).unlock, ['acc:hat'], 'Retirar o anuncio devolve as ofertas');
  assert.equal((await ask(rival, 'Rival', 'state')).data.market.length, 0);
});

test('a loja de trocas sobrevive a reinicio do servidor', async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'vesper-'));
  const file = path.join(folder, 'vesper.json');
  await new Market(new FileStore(file)).handle({ send() {} }, { t: 'm', op: 'list', item: 'skin:penguin' }, { owner: 'd'.repeat(24), name: 'Guino' });
  let seen = null;
  await new Market(new FileStore(file)).handle({ send: message => { seen = message; } }, { t: 'm', op: 'state' }, { owner: 'e'.repeat(24), name: 'Outro' });
  assert.equal(seen.data.market.length, 1);
  assert.equal(seen.data.market[0].item, 'skin:penguin');
  fs.rmSync(folder, { recursive: true, force: true });
});

function fakeDatabase() {
  const db = { rows: new Map(), holders: new Map(), waiting: new Map(), down: false };
  const check = () => { if (db.down) throw new Error('banco fora do ar'); };
  const free = (key, holder) => {
    if (db.holders.get(key) !== holder) return;
    db.holders.delete(key);
    const next = (db.waiting.get(key) || []).shift();
    if (next) next();
  };
  db.Pool = class {
    constructor(options) { db.options = options; }
    on() {}
    async query() { check(); return { rows: [] }; }
    async connect() {
      check();
      const holder = {};
      const locked = new Set();
      let claimed = new Set();
      let updated = new Map();
      const finish = () => {
        claimed = new Set();
        updated = new Map();
        for (const key of locked) free(key, holder);
        locked.clear();
      };
      return {
        async query(sql, params = []) {
          check();
          const key = params[0];
          if (sql.startsWith('INSERT')) { claimed.add(key); return { rows: [] }; }
          if (sql.startsWith('SELECT')) {
            if (sql.endsWith('FOR UPDATE')) {
              while (db.holders.has(key) && db.holders.get(key) !== holder) {
                await new Promise(resolve => db.waiting.set(key, [...(db.waiting.get(key) || []), resolve]));
              }
              db.holders.set(key, holder);
              locked.add(key);
            }
            const value = updated.has(key) ? updated.get(key) : db.rows.has(key) ? db.rows.get(key) : claimed.has(key) ? null : undefined;
            return { rows: value === undefined ? [] : [{ value: JSON.parse(JSON.stringify(value)) }] };
          }
          if (sql.startsWith('UPDATE')) updated.set(key, JSON.parse(params[1]));
          if (sql === 'COMMIT') for (const [name, value] of updated) db.rows.set(name, value);
          if (sql === 'COMMIT' || sql === 'ROLLBACK') finish();
          return { rows: [] };
        },
        release() { finish(); }
      };
    }
  };
  return db;
}

test('com banco de dados a loja fica salva, duas instancias nao perdem ofertas e queda do banco nao apaga nada', async () => {
  const db = fakeDatabase();
  const replies = [];
  const client = { send: message => replies.push(message) };
  const open = () => new Market(new PgStore('postgres://vesper', db.Pool));
  const ask = async (market, owner, op, extra = {}) => { await market.handle(client, { t: 'm', op, ...extra }, { owner, name: 'Guino' }); return replies.at(-1); };
  const first = open(), second = open();
  const seller = 'a'.repeat(24);
  const listed = await ask(first, seller, 'list', { item: 'acc:crown' });
  assert.equal(listed.ok, true);
  assert.equal(db.options.connectionString, 'postgres://vesper');
  const id = listed.data.listings[0].id;
  await Promise.all(['b', 'c', 'd', 'e'].map((letter, index) => ask(index % 2 ? first : second, letter.repeat(24), 'offer', { listing: id, coins: 100 + index })));
  assert.equal((await ask(second, seller, 'state')).data.listings[0].offers.length, 4, 'Ofertas ao mesmo tempo em duas instancias nao se perdem');
  db.down = true;
  assert.equal((await ask(first, seller, 'withdraw', { listing: id })).error, 'servidor');
  assert.equal((await ask(open(), seller, 'state')).error, 'servidor');
  db.down = false;
  const again = open();
  assert.equal((await ask(again, seller, 'state')).data.listings[0].offers.length, 4, 'Reinicio e queda do banco nao apagam a loja');
  assert.equal((await ask(again, 'b'.repeat(24), 'state')).data.deliveries.at(-1).coins, -100);
  const accounts = new Accounts(again.store, again);
  const out = [];
  const talk = { address: 'banco', send: message => out.push(message) };
  await Promise.all(['Primeira', 'primeira'].map(name => accounts.handle(talk, { op: 'register', name, password: 'segredo1' })));
  assert.equal(out.filter(reply => reply.ok).length, 1, 'Dois cadastros iguais ao mesmo tempo viram uma conta so');
  assert.equal(out.find(reply => !reply.ok).error, 'existe');
});

test('contas: criar, entrar, sessao, sair, salvar perfil e senha nunca guardada em texto', async () => {
  const { server, port } = await listen();
  const client = new Client(port), later = new Client(port);
  try {
    await Promise.all([client.ready, later.ready]);
    const made = await client.ask({ t: 'acct', op: 'register', name: 'Guino', password: 'segredo1', profile: { coins: 70, owned: ['alien'], account: 'f'.repeat(32), stamp: 10 } });
    assert.equal(made.ok, true);
    assert.equal(made.name, 'Guino');
    assert.equal((await client.ask({ t: 'acct', op: 'register', name: 'GUINO', password: 'outrasenha' })).error, 'existe', 'Nome repetido nao importa maiuscula');
    for (const name of ['ab', 'a b', 'Admin', 'administrador1', 'Vesper', 'x'.repeat(15), '<script>', '', 'Guin\u043e', 'Guino\u200b']) {
      assert.equal((await client.ask({ t: 'acct', op: 'register', name, password: 'segredo1' })).error, 'nome', 'Nome recusado: ' + name);
    }
    assert.equal((await later.ask({ t: 'acct', op: 'register', name: 'ADM', password: 'segredo1' })).ok, true, 'O primeiro a registrar ADM fica com o nome');
    assert.equal((await later.ask({ t: 'acct', op: 'register', name: 'adm', password: 'segredo1' })).error, 'existe', 'Ninguem mais usa ADM');
    for (const name of ['ADM1', 'A.D.M', 'adm_', 'Admin']) assert.equal((await later.ask({ t: 'acct', op: 'register', name, password: 'segredo1' })).error, 'nome', 'Imitacao de ADM recusada: ' + name);
    assert.equal((await client.ask({ t: 'acct', op: 'register', name: 'Curta', password: '12345' })).error, 'senha');
    assert.equal((await client.ask({ t: 'acct', op: 'register', name: 'Longa', password: 'x'.repeat(73) })).error, 'senha');
    assert.equal((await client.ask({ t: 'acct', op: 'register', name: 'Objeto', password: { length: 9 } })).error, 'senha');
    assert.equal((await client.ask({ t: 'acct', op: 'login', name: 'Guino', password: 'errada1' })).error, 'login');
    assert.equal((await client.ask({ t: 'acct', op: 'login', name: 'Ninguem', password: 'segredo1' })).error, 'login', 'Nome que nao existe da o mesmo erro');
    const back = await client.ask({ t: 'acct', op: 'login', name: 'guino', password: 'segredo1' });
    assert.equal(back.ok, true);
    assert.equal(back.name, 'Guino');
    assert.equal(back.profile.coins, 70);
    assert.equal('account' in back.profile, false, 'O codigo antigo do navegador nao fica guardado');
    assert.equal((await client.ask({ t: 'acct', op: 'me', session: back.session })).name, 'Guino');
    const [part, secret] = back.session.split('.');
    assert.equal((await client.ask({ t: 'acct', op: 'me', session: part + '.' + '0'.repeat(secret.length) })).error, 'sessao', 'Sessao inventada nao vale');
    assert.equal((await client.ask({ t: 'acct', op: 'me', session: Buffer.from('outro').toString('base64url') + '.' + secret })).error, 'sessao', 'Sessao de outra conta nao vale');
    assert.equal((await later.ask({ t: 'acct', op: 'save', session: back.session, profile: { coins: 90, stamp: 20 } })).ok, true);
    const older = await later.ask({ t: 'acct', op: 'save', session: made.session, profile: { coins: 5, stamp: 15 } });
    assert.equal(older.error === 'velho' || older.error === 'devagar', true);
    await wait(1600);
    const stale = await later.ask({ t: 'acct', op: 'save', session: made.session, profile: { coins: 5, stamp: 15 } });
    assert.equal(stale.error, 'velho', 'Perfil mais antigo nao apaga o mais novo');
    assert.equal(stale.profile.coins, 90);
    await wait(1600);
    assert.equal((await later.ask({ t: 'acct', op: 'save', session: made.session, profile: { junk: 'x'.repeat(9000) } })).error, 'perfil');
    assert.equal((await later.ask({ t: 'acct', op: 'logout', session: back.session })).ok, true);
    assert.equal((await later.ask({ t: 'acct', op: 'me', session: back.session })).error, 'sessao', 'Depois de sair a sessao morre');
    assert.equal((await later.ask({ t: 'acct', op: 'me', session: made.session })).ok, true, 'Sair em um lugar nao derruba o outro');
    const stored = JSON.stringify(server.hub.store.docs.get('user:guino'));
    assert.equal(stored.includes('segredo1'), false, 'A senha nunca e guardada');
    assert.equal(stored.includes(secret), false, 'A sessao e guardada so como resumo');
    assert.match(server.hub.store.docs.get('user:guino').hash, /^[0-9a-f]{64}$/);
    assert.equal((await later.ask({ t: 'acct', op: 'nada' })).error, 'pedido');
    assert.equal((await later.ask({ t: 'acct', op: 'constructor' })).error, 'pedido');
  } finally { client.close(); later.close(); server.closeAll(); }
});

test('contas: tentativas erradas bloqueiam por endereco e por nome, e o endereco vem do Cloudflare', async () => {
  const { server, port } = await listen();
  const first = new Client(port, { 'True-Client-IP': '10.0.0.1', 'X-Forwarded-For': '1.1.1.1' });
  const spoof = new Client(port, { 'True-Client-IP': '10.0.0.1', 'X-Forwarded-For': '2.2.2.2' });
  const other = new Client(port, { 'True-Client-IP': '10.0.0.2' });
  try {
    await Promise.all([first.ready, spoof.ready, other.ready]);
    await account(server, 'Alvo');
    for (let i = 0; i < 10; i++) assert.equal((await first.ask({ t: 'acct', op: 'login', name: 'Outro' + i, password: 'errada' + i })).error, 'login');
    const blocked = await spoof.ask({ t: 'acct', op: 'login', name: 'Alvo', password: 'segredo1' });
    assert.equal(blocked.error, 'espera', 'Trocar o X-Forwarded-For nao escapa do bloqueio');
    assert.ok(blocked.wait >= 1);
    assert.equal((await other.ask({ t: 'acct', op: 'login', name: 'Alvo', password: 'segredo1' })).ok, true, 'Outro endereco continua entrando');
    for (let i = 0; i < 10; i++) await other.ask({ t: 'acct', op: 'login', name: 'Alvo', password: 'errada' + i });
    const third = new Client(port, { 'True-Client-IP': '10.0.0.3' });
    await third.ready;
    assert.equal((await third.ask({ t: 'acct', op: 'login', name: 'Alvo', password: 'segredo1' })).error, 'espera', 'Muitos erros no mesmo nome travam o nome');
    third.close();
    for (let i = 0; i < 5; i++) await other.ask({ t: 'admin', key: 'errada' + i }, 8000);
    assert.ok((await other.ask({ t: 'admin', key: 'mais' })).wait >= 1);
    assert.equal((await first.ask({ t: 'admin', key: 'uma' }, 8000)).wait, undefined, 'O bloqueio da senha mestra vale por endereco, nao para todo mundo');
  } finally { for (const client of [first, spoof, other]) client.close(); server.closeAll(); }
});

test('sem conta nao entra no Online nem em sala, e o nome vem da conta', async () => {
  const { server, port } = await listen();
  const plain = new Client(port), fake = new Client(port), real = new Client(port), host = new Client(port);
  try {
    await Promise.all([plain.ready, fake.ready, real.ready, host.ready]);
    plain.send({ t: 'join', session: '', name: 'Guino' });
    assert.equal((await plain.waitFor(message => message.t === 'error')).reason, 'conta');
    fake.send({ t: 'create', session: Buffer.from('guino').toString('base64url') + '.abc', name: 'Guino' });
    assert.equal((await fake.waitFor(message => message.t === 'error')).reason, 'conta');
    const session = await account(server, 'Verdade');
    real.send({ t: 'join', session, name: 'Impostor', skin: 'orc' });
    const joined = await real.waitFor(message => message.t === 'joined');
    const room = server.hub.rooms.get(joined.room);
    assert.equal(room.arena.fighters.find(fighter => fighter.id === joined.id).name, 'Verdade', 'O nome que o cliente manda e ignorado');
    host.send({ t: 'create', session: await account(server, 'Anfitriao'), name: 'Outro' });
    const lobby = await host.waitFor(message => message.t === 'lobby');
    assert.deepEqual(lobby.players.map(player => player.name), ['Anfitriao']);
    plain.send({ t: 'enter', session: 'x', code: lobby.code, name: 'Penetra' });
    assert.equal((await plain.waitFor(message => message.t === 'error' && message !== plain.messages[0])).reason, 'conta');
  } finally { for (const client of [plain, fake, real, host]) client.close(); server.closeAll(); }
});

test('trocas pelo servidor: sem conta so le, e o nome do anuncio vem da conta', async () => {
  const { server, port } = await listen();
  const client = new Client(port);
  try {
    await client.ready;
    const session = await account(server, 'Vendedora');
    assert.equal((await client.ask({ t: 'm', op: 'state' })).ok, true);
    assert.equal((await client.ask({ t: 'm', op: 'list', item: 'acc:crown' })).error, 'conta');
    assert.equal((await client.ask({ t: 'm', op: 'list', session: session + 'x', item: 'acc:crown' })).error, 'conta');
    const listed = await client.ask({ t: 'm', op: 'list', session, name: 'Falsa', item: 'acc:crown' });
    assert.equal(listed.ok, true);
    const view = await client.ask({ t: 'm', op: 'state' });
    assert.equal(view.data.market[0].seller, 'Vendedora');
    assert.deepEqual(view.data.deliveries, [], 'A loja publica nao mostra entregas de ninguem');
  } finally { client.close(); server.closeAll(); }
});

test('painel: senha mestra da um token, conta comum nao entra, promover e rebaixar valem na hora e presentes chegam', async () => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync('chave-de-teste', Buffer.from(salt, 'hex'), 1000, 32, 'sha256').toString('hex');
  const { server, port } = await listen({ admin: { salt, hash, rounds: 1000, tries: 5, window: 600000, hours: 2 } });
  const boss = new Client(port), friend = new Client(port);
  try {
    await Promise.all([boss.ready, friend.ready]);
    const amiga = await account(server, 'Amiga');
    await account(server, 'Chefe');
    assert.equal((await boss.ask({ t: 'staff', op: 'find', name: 'Amiga' })).error, 'negado');
    assert.equal((await boss.ask({ t: 'staff', op: 'find', name: 'Amiga', token: 'f'.repeat(64) })).error, 'negado');
    assert.equal((await friend.ask({ t: 'staff', op: 'find', name: 'Amiga', session: amiga })).error, 'negado', 'Conta comum nao usa o painel');
    const wrong = await boss.ask({ t: 'admin', key: 'errada' });
    assert.equal(wrong.ok, false);
    assert.equal(wrong.token, undefined);
    const right = await boss.ask({ t: 'admin', key: 'chave-de-teste' });
    assert.equal(right.ok, true);
    assert.match(right.token, /^[0-9a-f]{64}$/);
    const token = right.token;
    assert.equal(JSON.stringify([...server.hub.adminTokens.keys()]).includes(token), false, 'O token fica guardado so como resumo');
    const found = await boss.ask({ t: 'staff', op: 'find', name: 'amiga', token });
    assert.deepEqual({ name: found.data.name, admin: found.data.admin }, { name: 'Amiga', admin: false });
    assert.equal((await boss.ask({ t: 'staff', op: 'find', name: 'Ninguem', token })).error, 'nome');
    assert.equal((await boss.ask({ t: 'staff', op: 'role', name: 'Amiga', admin: true, token })).data.admin, true);
    assert.equal((await friend.ask({ t: 'staff', op: 'find', name: 'Chefe', session: amiga })).ok, true, 'Promovida ja usa o painel');
    assert.equal((await friend.ask({ t: 'staff', op: 'role', name: 'Amiga', admin: false, session: amiga })).error, 'proprio');
    assert.equal((await boss.ask({ t: 'staff', op: 'role', name: 'Amiga', admin: false, token })).data.admin, false);
    assert.equal((await friend.ask({ t: 'staff', op: 'find', name: 'Chefe', session: amiga })).error, 'negado', 'Rebaixada perde o painel na hora');
    assert.equal((await friend.ask({ t: 'm', op: 'list', session: amiga, item: 'acc:crown' })).ok, true);
    assert.equal((await boss.ask({ t: 'staff', op: 'give', name: 'Amiga', coins: 300, token })).ok, true);
    assert.equal((await boss.ask({ t: 'staff', op: 'give', name: 'Amiga', item: 'skin:orc', token })).ok, true);
    assert.equal((await boss.ask({ t: 'staff', op: 'give', name: 'Amiga', item: 'acc:crown', take: true, token })).ok, true);
    for (const coins of [0, -5, 'abc', 2000000, null]) assert.equal((await boss.ask({ t: 'staff', op: 'give', name: 'Amiga', coins, token })).error, 'moedas', 'Moedas recusadas: ' + coins);
    assert.equal((await boss.ask({ t: 'staff', op: 'give', name: 'Amiga', item: 'skin:alien', token })).error, 'item');
    const mine = await friend.ask({ t: 'm', op: 'state', session: amiga });
    assert.equal(mine.data.listings.length, 0, 'Tirar um item anunciado tira o anuncio');
    const gifts = mine.data.deliveries.slice(-3);
    assert.deepEqual([gifts[0].coins, gifts[1].add, gifts[2].remove], [300, ['skin:orc'], ['acc:crown']]);
    server.hub.adminTokens.set([...server.hub.adminTokens.keys()][0], Date.now() - 1);
    assert.equal((await boss.ask({ t: 'staff', op: 'find', name: 'Amiga', token })).error, 'negado', 'Token vencido nao vale');
    const html = fs.readFileSync(path.join(__dirname, 'VESPER', 'index.html'), 'utf8');
    const source = fs.readFileSync(path.join(__dirname, 'vesper-server.cjs'), 'utf8');
    const real = source.match(/salt: '([0-9a-f]{32})', hash: '([0-9a-f]{64})'/);
    assert.ok(real);
    assert.equal(html.includes(real[1]) || html.includes(real[2]) || /pbkdf2|scrypt/i.test(html), false, 'O jogo que vai para o navegador nao tem nada da senha');
  } finally { boss.close(); friend.close(); server.closeAll(); }
});

test('chutar codigos de sala privada trava depois de muitos erros', async () => {
  const { server, port } = await listen();
  const host = new Client(port), guesser = new Client(port), later = new Client(port);
  try {
    await Promise.all([host.ready, guesser.ready, later.ready]);
    host.send({ t: 'create', name: 'Anfitriao' });
    const { code } = await host.waitFor(message => message.t === 'lobby');
    const session = await account(server, 'Chutador');
    for (let i = 0; i < 20; i++) {
      const wrong = String((Number(code) + 1 + i) % 1000000).padStart(6, '0');
      guesser.send({ t: 'enter', session, code: wrong });
      await guesser.waitFor(message => message.t === 'error' && guesser.messages.filter(item => item.t === 'error').length === i + 1);
    }
    assert.ok(guesser.messages.every(message => message.t !== 'error' || message.reason === 'code'));
    later.send({ t: 'enter', session, code });
    assert.equal((await later.waitFor(message => message.t === 'error')).reason, 'codigos', 'Mesmo com o codigo certo precisa esperar');
  } finally { for (const client of [host, guesser, later]) client.close(); server.closeAll(); }
});

test('banir tira o jogador da partida, fecha a conta, limpa a loja e desbanir devolve o acesso', async () => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync('chave-de-teste', Buffer.from(salt, 'hex'), 1000, 32, 'sha256').toString('hex');
  const { server, port } = await listen({ admin: { salt, hash, rounds: 1000, tries: 5, window: 600000, hours: 2 } });
  const boss = new Client(port), player = new Client(port), shop = new Client(port), mod = new Client(port);
  try {
    await Promise.all([boss.ready, player.ready, shop.ready, mod.ready]);
    const amiga = await account(server, 'Amiga');
    const rival = await account(server, 'Rival');
    const guardia = await account(server, 'Guardia');
    await account(server, 'Chefe');
    const { token } = await boss.ask({ t: 'admin', key: 'chave-de-teste' });
    for (const name of ['Guardia', 'Chefe']) assert.equal((await boss.ask({ t: 'staff', op: 'role', name, admin: true, token })).ok, true);
    player.send({ t: 'join', session: amiga, skin: 'orc' });
    const joined = await player.waitFor(message => message.t === 'joined');
    const room = server.hub.rooms.get(joined.room);
    const listed = await shop.ask({ t: 'm', op: 'list', session: amiga, item: 'acc:crown' });
    const listing = listed.data.listings[0].id;
    assert.equal((await shop.ask({ t: 'm', op: 'offer', session: rival, listing, coins: 50 })).ok, true);
    assert.equal((await mod.ask({ t: 'staff', op: 'ban', name: 'Guardia', banned: true, session: guardia })).error, 'voce', 'Ninguem bane a propria conta');
    assert.equal((await mod.ask({ t: 'staff', op: 'ban', name: 'Chefe', banned: true, session: guardia })).error, 'admin', 'Administrador precisa perder o cargo antes');
    assert.equal((await shop.ask({ t: 'staff', op: 'ban', name: 'Rival', banned: true, session: amiga })).error, 'negado', 'Conta comum nao bane');
    const banned = await mod.ask({ t: 'staff', op: 'ban', name: 'amiga', banned: true, session: guardia });
    assert.equal(banned.data.banned, true);
    assert.equal((await player.waitFor(message => message.t === 'closed')).reason, 'banido', 'Quem esta jogando e avisado e sai');
    assert.equal(room.arena.fighters.some(fighter => fighter.name === 'Amiga'), false, 'O lutador sai da partida na hora');
    assert.equal((await shop.ask({ t: 'acct', op: 'me', session: amiga })).error, 'sessao');
    assert.equal((await shop.ask({ t: 'm', op: 'list', session: amiga, item: 'skin:orc' })).error, 'conta');
    assert.equal((await shop.ask({ t: 'acct', op: 'login', name: 'Amiga', password: 'segredo1' })).error, 'banido');
    assert.equal((await shop.ask({ t: 'acct', op: 'login', name: 'Amiga', password: 'errada1' })).error, 'login', 'Senha errada nao revela o banimento');
    const again = new Client(port);
    await again.ready;
    again.send({ t: 'join', session: amiga });
    assert.equal((await again.waitFor(message => message.t === 'error')).reason, 'conta');
    again.close();
    const market = await shop.ask({ t: 'm', op: 'state', session: rival });
    assert.equal(market.data.market.length, 0, 'Os anuncios de quem foi banido saem da loja');
    assert.equal(market.data.deliveries.at(-1).coins, 50, 'Quem tinha oferta recebe as moedas de volta');
    assert.equal((await mod.ask({ t: 'staff', op: 'role', name: 'Amiga', admin: true, session: guardia })).error, 'banido');
    assert.equal((await boss.ask({ t: 'staff', op: 'ban', name: 'Amiga', banned: false, token })).data.banned, false);
    assert.equal((await shop.ask({ t: 'acct', op: 'login', name: 'Amiga', password: 'segredo1' })).ok, true, 'Desbanida entra de novo');
  } finally { for (const client of [boss, player, shop, mod]) client.close(); server.closeAll(); }
});

function rawSocket(port, pieces, linger = 400) {
  return new Promise(resolve => {
    const socket = require('node:net').connect(port, '127.0.0.1');
    let data = Buffer.alloc(0);
    let closed = false;
    socket.on('data', chunk => { data = Buffer.concat([data, chunk]); });
    socket.on('close', () => { closed = true; });
    socket.on('error', () => { closed = true; });
    socket.on('connect', async () => {
      socket.write(pieces.handshake || 'GET / HTTP/1.1\r\nHost: 127.0.0.1\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n');
      await wait(60);
      for (const piece of pieces.frames || []) if (!socket.destroyed) socket.write(piece);
      setTimeout(() => { const wasClosed = closed; socket.destroy(); resolve({ closed: wasClosed, data }); }, linger);
    });
  });
}

function clientFrame(opcode, payload, { fin = true, mask = true } = {}) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const header = body.length < 126 ? Buffer.from([(fin ? 0x80 : 0) | opcode, (mask ? 0x80 : 0) | body.length]) : Buffer.from([(fin ? 0x80 : 0) | opcode, (mask ? 0x80 : 0) | 126, body.length >> 8, body.length & 255]);
  if (!mask) return Buffer.concat([header, body]);
  const key = crypto.randomBytes(4);
  return Buffer.concat([header, key, Buffer.from(body.map((byte, i) => byte ^ key[i & 3]))]);
}

function fetchPage(port, pathname, method = 'GET') {
  return new Promise(resolve => {
    http.request({ host: '127.0.0.1', port, path: pathname, method }, response => {
      let body = '';
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body }));
    }).on('error', () => resolve({ status: 0, headers: {}, body: '' })).end();
  });
}

test('seguranca HTTP: endereco malformado nao derruba, arquivos do servidor nao vazam e a pagina tem politica de seguranca', async () => {
  const { server, port } = await listen();
  try {
    for (const bad of ['//[', '/%', 'http://[::1']) {
      await rawSocket(port, { handshake: 'GET ' + bad + ' HTTP/1.1\r\nHost: x\r\n\r\n' }, 150);
    }
    assert.equal((await fetchPage(port, '/status')).status, 200, 'O servidor continua de pe');
    for (const probe of ['/vesper-server.cjs', '/../vesper-server.cjs', '/%2e%2e/vesper-server.cjs', '/data/vesper.json', '/package.json', '/.git/config']) {
      assert.equal((await fetchPage(port, probe)).status, 404, probe);
    }
    assert.notEqual((await fetchPage(port, '/', 'POST')).status, 200);
    const page = await fetchPage(port, '/');
    const policy = page.headers['content-security-policy'];
    assert.match(policy, /script-src 'sha256-/);
    assert.equal(/unsafe/.test(policy), false, 'Nada de unsafe-inline ou unsafe-eval');
    assert.match(policy, /frame-ancestors 'none'/);
    assert.equal(page.headers['x-frame-options'], 'DENY');
    assert.equal(page.headers['x-content-type-options'], 'nosniff');
    const scripts = [...page.body.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)];
    assert.ok(scripts.length > 0);
    for (const [, code] of scripts) assert.ok(policy.includes(crypto.createHash('sha256').update(code, 'utf8').digest('base64')), 'Cada script do jogo esta liberado pelo resumo');
  } finally { server.closeAll(); }
});

test('seguranca WebSocket: quadros malformados, pedacos sem fim, site de fora e excesso de conexoes sao barrados', async () => {
  const { server, port } = await listen();
  const opened = [];
  try {
    assert.ok((await rawSocket(port, { frames: [clientFrame(1, '{"t":"x"}', { mask: false })] })).closed, 'Quadro sem mascara');
    assert.ok((await rawSocket(port, { frames: [clientFrame(9, Buffer.alloc(200, 1))] })).closed, 'Ping grande demais');
    assert.ok((await rawSocket(port, { frames: [clientFrame(0, 'x')] })).closed, 'Continuacao sem comeco');
    const pieces = [clientFrame(1, Buffer.alloc(8000, 32), { fin: false })];
    for (let i = 0; i < 4; i++) pieces.push(clientFrame(0, Buffer.alloc(8000, 32), { fin: false }));
    assert.ok((await rawSocket(port, { frames: pieces }, 600)).closed, 'Mensagem em pedacos maior que o limite');
    const pong = await rawSocket(port, { frames: [clientFrame(9, 'oi')] });
    assert.equal(pong.closed, false, 'Ping normal continua funcionando');
    await rawSocket(port, { frames: ['null', '1', '[]', '{"__proto__":{"poluido":1},"t":"acct","op":"me"}', '{"t":{"x":1}}'].map(text => clientFrame(1, text)) });
    assert.equal(({}).poluido, undefined, 'Nada de poluicao de prototipo');
    const evil = new Client(port, { Origin: 'https://site-malicioso.example' });
    assert.equal(await evil.ready.then(() => true, () => false), false, 'Site de outro dominio nao conecta');
    const own = new Client(port, { Origin: 'http://127.0.0.1:' + port });
    assert.equal(await own.ready.then(() => true, () => false), true, 'A propria pagina conecta');
    own.close();
    for (let i = 0; i < 34; i++) opened.push(new Client(port, { 'True-Client-IP': '7.7.7.7' }));
    const accepted = (await Promise.all(opened.map(client => client.ready.then(() => true, () => false)))).filter(Boolean).length;
    assert.equal(accepted, 30, 'No maximo 30 conexoes por endereco');
    assert.equal((await fetchPage(port, '/status')).status, 200);
  } finally { for (const client of opened) client.close(); server.closeAll(); }
});

test('seguranca de contas e partida: senha fraca, item com sobra, reconexao de outra conta e ofertas demais', async () => {
  const { server, port } = await listen();
  const client = new Client(port), player = new Client(port), thief = new Client(port);
  try {
    await Promise.all([client.ready, player.ready, thief.ready]);
    for (const [name, password] of [['Nova1', '123456'], ['Nova2', 'senha123'], ['Nova3', 'aaaaaaa'], ['Igualzinho', 'igualzinho']]) {
      assert.equal((await client.ask({ t: 'acct', op: 'register', name, password })).error, 'fraca', password);
    }
    assert.equal(VesperArena.tradeKeyOf('acc:crown:extra'), null, 'Chave de item com sobra nao vale');
    assert.equal(VesperArena.tradeKeyOf('acc:crown'), 'acc:crown');
    const dona = await account(server, 'Dona');
    const outro = await account(server, 'Outro');
    player.send({ t: 'join', session: dona, skin: 'orc' });
    const joined = await player.waitFor(message => message.t === 'joined');
    player.close();
    await wait(200);
    thief.send({ t: 'join', session: outro, token: joined.token });
    const taken = await thief.waitFor(message => message.t === 'joined');
    assert.notEqual(taken.id, joined.id, 'O codigo de reconexao nao entrega o lutador para outra conta');
    const market = server.hub.market;
    let last = null;
    await market.handle({ send: message => { last = message; } }, { t: 'm', op: 'list', item: 'acc:crown' }, { owner: 'dono', name: 'Dona' });
    const listing = last.data.listings[0].id;
    for (let i = 0; i < 31; i++) await market.handle({ send: message => { last = message; } }, { t: 'm', op: 'offer', listing, coins: 1 }, { owner: 'lance' + i, name: 'Lance' });
    assert.equal(last.error, 'lotado', 'Um anuncio aceita no maximo 30 ofertas');
  } finally { for (const c of [client, player, thief]) c.close(); server.closeAll(); }
});

test('pedidos demais pela mesma conexao sao barrados sem derrubar o servidor', async () => {
  const { server, port } = await listen();
  const client = new Client(port);
  try {
    await client.ready;
    for (let i = 0; i < 40; i++) client.send({ t: 'acct', op: 'me', rid: 1000 + i, session: '' });
    await client.waitFor(message => message.rid === 1039);
    const replies = client.messages.filter(message => message.rid >= 1000);
    assert.ok(replies.some(message => message.error === 'devagar'), 'Rajada de pedidos e barrada');
    assert.ok(replies.filter(message => message.error === 'sessao').length <= 24);
    await wait(10100);
    assert.equal((await client.ask({ t: 'acct', op: 'me', session: '' })).error, 'sessao', 'Depois de esperar volta a responder');
  } finally { client.close(); server.closeAll(); }
});

(async () => {
  for (const item of tests) {
    try { await item.run(); passed++; process.stdout.write('PASS ' + item.name + '\n'); }
    catch (error) { failures.push(item.name); process.stderr.write('FAIL ' + item.name + ': ' + error.stack + '\n'); }
  }
  process.stdout.write('\n' + passed + ' passou; ' + failures.length + ' falhou.\n');
  process.exit(failures.length ? 1 : 0);
})();
