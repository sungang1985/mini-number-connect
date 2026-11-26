'use strict';
const C = require('./core/consts');
const { randomSeed } = require('./core/rng');
const { T, roundRect, text, wrap } = require('./ui');
const { Net } = require('./net');
const config = require('./config');
const { Menu } = require('./scenes/menu');
const { Room } = require('./scenes/room');
const { Play } = require('./scenes/play');

const ERR_TEXT = {
  noroom: '房间不存在或已结束',
  full: '房间已满',
  bad: '请求有误'
};

class App {
  constructor() {
    this.canvas = wx.createCanvas();
    this.ctx = this.canvas.getContext('2d');
    this.hot = [];          // 本帧可点击的按钮
    this.pressed = null;
    this.pressedKey = null;
    this.touchId = null;
    this.toastMsg = null;
    this.net = null;
    this.lastRoomQuery = null;
    // 设置：纸上有哪些数字、线条粗细、是否限时
    this.opts = { values: C.cleanValues(null), ink: C.INK, timed: false };
    try {
      const saved = wx.getStorageSync('nc_opts');
      if (saved) {
        let values = saved.values;
        if (!values && saved.pairs) { values = []; for (let v = 1; v <= saved.pairs; v++) values.push(v); } // 旧版存档
        this.opts = { values: C.cleanValues(values), ink: C.cleanInk(saved.ink), timed: !!saved.timed };
      }
    } catch (e) { /* 首次进入 */ }
    this.measure();
    this.scene = new Menu(this);
    this.bindInput();
    this.bindWx();
    const loop = () => { this.frame(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  measure() {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    this.w = info.windowWidth;
    this.h = info.windowHeight;
    this.dpr = info.pixelRatio || 1;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    const safe = info.safeArea;
    this.safeTop = safe ? safe.top : 20;
    this.safeBottom = safe ? Math.max(0, this.h - safe.bottom) : 0;
    // 右上角胶囊按钮：标题栏与它同一行，内容从它下方开始
    let cap = null;
    try { cap = wx.getMenuButtonBoundingClientRect(); } catch (e) { /* 部分环境没有 */ }
    if (!cap || !cap.height) cap = { top: this.safeTop + 6, bottom: this.safeTop + 38, left: this.w - 12, height: 32 };
    this.capsule = cap;
  }

  saveOpts() { try { wx.setStorageSync('nc_opts', this.opts); } catch (e) { /* 忽略 */ } }

  bindInput() {
    const pick = (e) => {
      const list = e.changedTouches || [];
      for (let i = 0; i < list.length; i++) if (list[i].identifier === this.touchId) return list[i];
      return null;
    };
    const pt = (t) => ({ x: t.clientX, y: t.clientY });
    wx.onTouchStart((e) => {
      if (this.touchId !== null) return; // 只认第一根手指
      const t = e.changedTouches[0];
      this.touchId = t.identifier;
      const p = pt(t);
      const b = this.hit(p);
      if (b) { this.pressed = b; this.pressedKey = b.key; } else this.scene.touchStart(p);
    });
    wx.onTouchMove((e) => {
      const t = pick(e);
      if (!t || this.pressed) return;
      this.scene.touchMove(pt(t));
    });
    const end = (e, cancelled) => {
      const t = pick(e);
      if (!t) return;
      this.touchId = null;
      const p = pt(t);
      if (this.pressed) {
        const b = this.hit(p);
        const key = this.pressedKey;
        this.pressed = null; this.pressedKey = null;
        if (!cancelled && b && b.key === key) b.onTap();
      } else this.scene.touchEnd(p);
    };
    wx.onTouchEnd((e) => end(e, false));
    wx.onTouchCancel((e) => end(e, true));
  }

  hit(p) {
    for (let i = this.hot.length - 1; i >= 0; i--) {
      const b = this.hot[i];
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return b;
    }
    return null;
  }

  bindWx() {
    try { wx.setKeepScreenOn({ keepScreenOn: true }); } catch (e) { /* 忽略 */ }
    try { wx.showShareMenu({ menus: ['shareAppMessage'] }); } catch (e) { /* 忽略 */ }
    if (wx.onShareAppMessage) wx.onShareAppMessage(() => this.shareInfo());
    if (wx.onWindowResize) wx.onWindowResize(() => this.measure());
    // 从好友的邀请卡片进来：自动加入对应房间
    const tryJoin = (query) => {
      const room = query && query.room;
      if (!room || room === this.lastRoomQuery) return;
      this.lastRoomQuery = room;
      if (this.scene instanceof Menu) this.joinRoom(String(room));
    };
    try { tryJoin(wx.getLaunchOptionsSync().query); } catch (e) { /* 忽略 */ }
    if (wx.onShow) wx.onShow((res) => tryJoin(res && res.query));
  }

  shareInfo() {
    const room = this.scene instanceof Room ? this.scene.roomId : null;
    return room
      ? { title: '一张纸，一人一笔，碰线就输。来和我对画', query: 'room=' + room }
      : { title: '数字连连看：一张纸，一人一笔，碰线就输', query: '' };
  }

  toast(msg, ms) { this.toastMsg = { msg, until: Date.now() + (ms || 2200) }; }

  go(scene) { this.scene = scene; this.pressed = null; this.pressedKey = null; }

  toMenu() {
    if (this.net) { this.net.send({ t: 'leave' }); this.net.close(); this.net = null; }
    this.go(new Menu(this));
  }

  startLocal() {
    this.go(new Play(this, {
      mode: 'local', seed: randomSeed(), values: this.opts.values.slice(), ink: this.opts.ink, timed: this.opts.timed,
      first: Math.random() < 0.5 ? 0 : 1 // 谁先画由开局随机决定
    }));
  }

  connect() {
    if (!config.serverUrl) {
      this.toast('还没有配置联机服务器（js/config.js），先试试同屏对画', 3200);
      return false;
    }
    if (this.net) this.net.close();
    const net = new Net(config.serverUrl, (m) => { if (this.net === net) this.onNet(m); }, () => {
      if (this.net !== net) return;
      this.net = null;
      this.toast('连接已断开');
      this.go(new Menu(this));
    });
    this.net = net;
    return true;
  }

  hostRoom() {
    if (!this.connect()) return;
    this.net.send({ t: 'create', values: this.opts.values, ink: this.opts.ink, timed: this.opts.timed });
    this.go(new Room(this, { hosting: true, values: this.opts.values, ink: this.opts.ink, timed: this.opts.timed }));
  }

  joinRoom(id) {
    id = String(id || '').replace(/\D/g, '');
    if (!id) { this.toast('请输入数字房号'); return; }
    if (!this.connect()) return;
    this.net.send({ t: 'join', id });
    this.go(new Room(this, { hosting: false, roomId: id }));
  }

  onNet(m) {
    if (m.t === 'room') {
      if (this.scene instanceof Room) this.scene.roomId = m.id;
    } else if (m.t === 'start') {
      this.go(new Play(this, {
        mode: 'online', seat: m.seat, seed: m.seed, values: C.cleanValues(m.values), ink: C.cleanInk(m.ink), timed: !!m.timed, first: m.first
      }));
    } else if (m.t === 'err') {
      this.toast(ERR_TEXT[m.code] || '联机出错');
      this.toMenu();
    } else if (this.scene.onNet) {
      this.scene.onNet(m);
    }
  }

  frame() {
    const ctx = this.ctx, now = Date.now();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = T.desk;
    ctx.fillRect(0, 0, this.w, this.h);
    this.hot.length = 0;
    if (this.scene.update) this.scene.update(now);
    this.scene.draw(ctx, now);
    if (this.toastMsg) {
      if (now > this.toastMsg.until) this.toastMsg = null; else this.drawToast(ctx);
    }
  }

  drawToast(ctx) {
    const msg = this.toastMsg.msg;
    const maxW = this.w - 64;
    const lines = wrap(ctx, msg, maxW - 28, 14, false);
    let tw = 0;
    lines.forEach(l => { tw = Math.max(tw, ctx.measureText(l).width); });
    const bw = tw + 28, bh = lines.length * 21 + 16;
    const x = (this.w - bw) / 2, y = this.h * 0.42 - bh / 2;
    roundRect(ctx, x, y, bw, bh, 10);
    ctx.fillStyle = 'rgba(42,48,54,0.92)';
    ctx.fill();
    lines.forEach((l, i) => text(ctx, l, this.w / 2, y + 8 + 21 * (i + 0.5), { size: 14, color: T.white, align: 'center' }));
  }
}

module.exports = {
  start() {
    const app = new App();
    if (typeof __NC_DEBUG__ !== 'undefined') __NC_DEBUG__.app = app; // 仅网页预览 / 自动化测试用
    return app;
  }
};
