'use strict';

process.env.VESPER_MATCH_SECONDS = process.env.VESPER_MATCH_SECONDS || '3';
process.env.VESPER_BOT_FILL = process.env.VESPER_BOT_FILL || '0.4';
process.env.VESPER_CAPACITY = process.env.VESPER_CAPACITY || '4';

const assert = require('node:assert/strict');
const { createServer, encodeFrame } = require('./vesper-server.cjs');
const VesperArena = require('./vesper-arena.js');

const { CONFIG, Arena } = VesperArena;
const failures = [];
let passed = 0;

const tests = [];
function test(name, run) { tests.push({ name, run }); }

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function listen() {
  const server = createServer();
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

class Client {
  constructor(port) {
    this.messages = [];
    this.socket = new WebSocket('ws://127.0.0.1:' + port);
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener('open', () => resolve(this));
      this.socket.addEventListener('error', () => reject(new Error('conexao falhou')));
    });
    this.socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      this.messages.push(message);
      if (message.t === 'joined') this.joined = message;
      if (message.t === 's') this.snapshot = message;
      if (message.t === 'over') this.over = message;
    });
  }
  send(value) { this.socket.send(JSON.stringify(value)); }
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
    assert.equal(fighter.name, 'Jogador');
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

(async () => {
  for (const item of tests) {
    try { await item.run(); passed++; process.stdout.write('PASS ' + item.name + '\n'); }
    catch (error) { failures.push(item.name); process.stderr.write('FAIL ' + item.name + ': ' + error.stack + '\n'); }
  }
  process.stdout.write('\n' + passed + ' passou; ' + failures.length + ' falhou.\n');
  process.exit(failures.length ? 1 : 0);
})();
