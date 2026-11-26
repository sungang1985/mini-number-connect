'use strict';
// 好友房的联机服务器地址（server/server.js 部署后的 wss 地址）。
// 留空时“邀请微信好友”不可用，同屏对画不受影响。
// 上线前还需把该域名加入小游戏后台的 socket 合法域名。
const SERVER_URL = '';

module.exports = {
  // 本地预览页（tools/dev-server.js）会注入 __NC_SERVER__ 指向本机服务
  serverUrl: (typeof __NC_SERVER__ !== 'undefined' && __NC_SERVER__) || SERVER_URL
};
