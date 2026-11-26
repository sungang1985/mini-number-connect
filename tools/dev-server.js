'use strict';
// 本地预览：网页版游戏 + 好友房联机服务跑在同一个端口。
//   npm run dev   →  http://localhost:8080
// 开两个浏览器窗口即可试好友房（一个“邀请微信好友”，另一个打开邀请链接）。
const http = require('http');
const { bundle, page } = require('./web');
const { createRelay } = require('../server/server');

function startDev(port) {
  const server = http.createServer((req, res) => {
    const url = req.url.split('?')[0];
    if (url === '/game.bundle.js') {
      res.writeHead(200, { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'no-store' });
      res.end(bundle());
    } else if (url === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(page({ serverExpr: '(location.protocol==="https:"?"wss://":"ws://")+location.host+"/ws"' }));
    } else { res.writeHead(404); res.end(); }
  });
  createRelay({ server, path: '/ws' });
  return new Promise(resolve => server.listen(port, () => resolve(server)));
}
module.exports = { startDev };

if (require.main === module) {
  const port = Number(process.env.PORT) || 8080;
  startDev(port).then(() => console.log('预览地址 http://localhost:' + port));
}
