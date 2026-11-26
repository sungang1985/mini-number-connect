'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const WebSocket = require('ws');
const { createRelay } = require('../server/server');
const { Game } = require('../js/core/game');

function client(port) {
  const ws = new WebSocket('ws://127.0.0.1:' + port);
  const inbox = [], waiters = [];
  ws.on('message', d => {
    const m = JSON.parse(d.toString());
    const w = waiters.shift();
    if (w) w(m); else inbox.push(m);
  });
  return {
    ws,
    opened: new Promise(r => ws.on('open', r)),
    send: (o) => ws.send(JSON.stringify(o)),
    next: () => new Promise((resolve, reject) => {
      if (inbox.length) return resolve(inbox.shift());
      const t = setTimeout(() => reject(new Error('等消息超时')), 2000);
      waiters.push(m => { clearTimeout(t); resolve(m); });
    })
  };
}

test('好友房：开房、加入、同步笔迹、再来一局、离开', async () => {
  const server = http.createServer();
  const wss = createRelay({ server });
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const a = client(port), b = client(port), c = client(port);
  await Promise.all([a.opened, b.opened, c.opened]);

  b.send({ t: 'join', id: '0000' });
  assert.deepStrictEqual(await b.next(), { t: 'err', code: 'noroom' });

  a.send({ t: 'create', pairs: 6, timed: true });
  const room = await a.next();
  assert.strictEqual(room.t, 'room');
  assert.match(room.id, /^\d{4}$/);

  b.send({ t: 'join', id: room.id });
  const sa = await a.next(), sb = await b.next();
  assert.deepStrictEqual([sa.t, sa.seat, sb.t, sb.seat], ['start', 0, 'start', 1]);
  assert.deepStrictEqual([sa.seed, sa.first, sa.pairs, sa.timed], [sb.seed, sb.first, 6, true]);

  c.send({ t: 'join', id: room.id });
  assert.deepStrictEqual(await c.next(), { t: 'err', code: 'full' });

  // 两端各建一份引擎；先手端画，另一端重放收到的笔迹，结果应完全一致
  const ga = new Game(sa), gb = new Game(sb);
  const [drawer, watcher, gd, gw] = sa.first === 0 ? [a, b, ga, gb] : [b, a, gb, ga];
  const from = gd.numbers[0], to = gd.numbers[gd.partner(0)];
  assert.ok(gd.begin(from.id, from.x, from.y));
  drawer.send({ t: 'g', k: 'begin', n: from.id, x: from.x, y: from.y });
  const pts = [];
  let res = 'ok';
  for (let k = 1; k <= 400 && res === 'ok'; k++) {
    const x = Math.round(from.x + (to.x - from.x) * k / 400), y = Math.round(from.y + (to.y - from.y) * k / 400);
    res = gd.extend(x, y); pts.push(x, y);
  }
  drawer.send({ t: 'g', k: 'pts', p: pts });
  const m1 = await watcher.next(), m2 = await watcher.next();
  assert.ok(gw.begin(m1.n, m1.x, m1.y));
  let rw = 'ok';
  for (let i = 0; i < m2.p.length && rw === 'ok'; i += 2) rw = gw.extend(m2.p[i], m2.p[i + 1]);
  assert.strictEqual(rw, res);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(gw)), JSON.parse(JSON.stringify(gd)));

  // 再来一局：意见不同不开；都选原纸换先手才开，种子不变、先手交换
  a.send({ t: 'again', mode: 'new' });
  assert.deepStrictEqual(await b.next(), { t: 'again', mode: 'new' });
  b.send({ t: 'again', mode: 'swap' });
  assert.deepStrictEqual(await a.next(), { t: 'again', mode: 'swap' });
  a.send({ t: 'again', mode: 'swap' });
  assert.deepStrictEqual(await b.next(), { t: 'again', mode: 'swap' });
  const ra = await a.next(), rb = await b.next();
  assert.deepStrictEqual([ra.t, ra.seed, ra.first, rb.first], ['start', sa.seed, 1 - sa.first, 1 - sa.first]);

  a.ws.close();
  assert.deepStrictEqual(await b.next(), { t: 'left' });
  b.send({ t: 'join', id: room.id }); // 房间已随之关闭
  assert.deepStrictEqual(await b.next(), { t: 'err', code: 'noroom' });

  b.ws.close(); c.ws.close();
  wss.close(); server.close();
});
