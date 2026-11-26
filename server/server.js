'use strict';
// 好友房联机服务：只负责开房、配对、定先手、转发笔迹。
// 规则判定在两端各自用同一份引擎完成（同一种子 + 同一串笔迹点 = 同一结果），
// 所以这里不需要理解游戏内容。
//
//   PORT=8080 node server/server.js
//
// 线上需放在 wss（TLS）之后，并把域名配置到小游戏后台的 socket 合法域名。
const http = require('http');
const { WebSocketServer } = require('ws');

const MIN_PAIRS = 4, MAX_PAIRS = 9;
const ROOM_IDLE_MS = 30 * 60 * 1000;
const MAX_ROOMS = 5000;

function createRelay(wssOptions) {
  const wss = new WebSocketServer(Object.assign({ maxPayload: 64 * 1024 }, wssOptions));
  const rooms = new Map(); // id -> {id, seats:[ws,ws], pairs, timed, seed, first, votes:[mode,mode], playing, touched}

  const send = (ws, obj) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); };
  const newSeed = () => (Math.floor(Math.random() * 0x7fffffff) + 1);

  function newRoomId() {
    for (let i = 0; i < 50; i++) {
      const id = String(1000 + Math.floor(Math.random() * 9000));
      if (!rooms.has(id)) return id;
    }
    for (;;) {
      const id = String(100000 + Math.floor(Math.random() * 900000));
      if (!rooms.has(id)) return id;
    }
  }

  function start(room) {
    room.playing = true;
    room.votes = [null, null];
    room.touched = Date.now();
    room.seats.forEach((ws, seat) => send(ws, {
      t: 'start', seat, seed: room.seed, first: room.first, pairs: room.pairs, timed: room.timed
    }));
  }

  function leave(ws) {
    const room = ws.room;
    if (!room) return;
    ws.room = null;
    rooms.delete(room.id);
    room.seats.forEach(other => {
      if (other && other !== ws) { other.room = null; send(other, { t: 'left' }); }
    });
  }

  function handle(ws, m) {
    if (!m || typeof m.t !== 'string') return;
    const room = ws.room;
    switch (m.t) {
      case 'hb': return;
      case 'create': {
        leave(ws);
        if (rooms.size >= MAX_ROOMS) return send(ws, { t: 'err', code: 'full' });
        const pairs = Math.min(MAX_PAIRS, Math.max(MIN_PAIRS, Math.floor(Number(m.pairs)) || 6));
        const r = { id: newRoomId(), seats: [ws, null], pairs, timed: !!m.timed, seed: 0, first: 0, votes: [null, null], playing: false, touched: Date.now() };
        rooms.set(r.id, r);
        ws.room = r; ws.seat = 0;
        return send(ws, { t: 'room', id: r.id });
      }
      case 'join': {
        leave(ws);
        const r = rooms.get(String(m.id));
        if (!r) return send(ws, { t: 'err', code: 'noroom' });
        if (r.seats[1]) return send(ws, { t: 'err', code: 'full' });
        r.seats[1] = ws; ws.room = r; ws.seat = 1;
        r.seed = newSeed();
        r.first = Math.random() < 0.5 ? 0 : 1; // 谁先画由开局随机决定
        return start(r);
      }
      case 'g': { // 对局动作：原样转给另一端
        if (!room || !room.playing) return;
        room.touched = Date.now();
        return send(room.seats[1 - ws.seat], m);
      }
      case 'again': { // 再来一局：双方选了同一种方式才开
        if (!room || !room.playing || (m.mode !== 'swap' && m.mode !== 'new')) return;
        room.votes[ws.seat] = m.mode;
        send(room.seats[1 - ws.seat], { t: 'again', mode: m.mode });
        if (room.votes[0] && room.votes[0] === room.votes[1]) {
          if (m.mode === 'swap') room.first = 1 - room.first;          // 原纸换先手
          else { room.seed = newSeed(); room.first = Math.random() < 0.5 ? 0 : 1; }
          start(room);
        }
        return;
      }
      case 'leave': return leave(ws);
      default: return;
    }
  }

  wss.on('connection', (ws) => {
    ws.alive = true;
    ws.on('pong', () => { ws.alive = true; });
    ws.on('message', (data, isBinary) => {
      if (isBinary) return;
      let m;
      try { m = JSON.parse(data.toString()); } catch (e) { return; }
      handle(ws, m);
    });
    ws.on('close', () => leave(ws));
    ws.on('error', () => {});
  });

  const timer = setInterval(() => {
    const now = Date.now();
    wss.clients.forEach(ws => {
      if (!ws.alive) return ws.terminate();
      ws.alive = false;
      ws.ping();
    });
    rooms.forEach(r => {
      if (now - r.touched > ROOM_IDLE_MS) r.seats.forEach(ws => { if (ws) { leave(ws); ws.close(); } });
    });
  }, 30000);
  wss.on('close', () => clearInterval(timer));
  return wss;
}

module.exports = { createRelay };

if (require.main === module) {
  const port = Number(process.env.PORT) || 8080;
  const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok'); });
  createRelay({ server });
  server.listen(port, () => console.log('数字连连看 联机服务已启动，端口 ' + port));
}
