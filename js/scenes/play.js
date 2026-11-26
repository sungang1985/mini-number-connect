'use strict';
const C = require('../core/consts');
const { Game } = require('../core/game');
const { randomSeed } = require('../core/rng');
const { clamp } = require('../core/geom');
const { T, roundRect, text, button, font, wrap } = require('../ui');

const BOTTOM_H = 96;     // 底栏高度：对局中放提示与“画不完”，结束后放结果与再来一局
const PICK_SLOP = 16;    // 手指落在数字圈外这么近也算点中，起笔点收回到圈内
const PEEK_MS = 1300;    // 点一下数字后，另一枚亮起的时长
const RESULT_DELAY = 600;

class Play {
  // o: {mode:'local'|'online', seat, seed, pairs, timed, first}
  constructor(app, o) {
    this.app = app;
    this.mode = o.mode;
    this.seat = o.seat || 0;
    this.timed = !!o.timed;
    this.pairs = o.pairs;
    this.peerLeft = false;
    this.setup(o.seed, o.first);
  }

  setup(seed, first) {
    this.game = new Game({ seed, pairs: this.pairs, first });
    this.pending = null;   // 按下了某个数字、尚未正式起笔
    this.drawing = false;  // 本机手指正在画
    this.peek = null;      // {value, until}
    this.outbox = [];      // 待发给好友的笔迹点
    this.turnStart = Date.now();
    this.seenTurn = this.game.turn;
    this.overAt = 0;
    this.againMine = null;
    this.againPeer = null;
    this.banner = { text: this.name(first) + '先画', player: first, t0: Date.now() };
  }

  get online() { return this.mode === 'online'; }
  isMine() { return !this.online || this.game.turn === this.seat; }
  name(p) { return this.online ? (p === this.seat ? '你' : '好友') : (p === 0 ? '甲' : '乙'); }

  layout() {
    const app = this.app;
    const top = app.capsule.bottom + 10;
    const bottomH = BOTTOM_H + app.safeBottom;
    const availW = app.w - 16, availH = app.h - top - bottomH - 6;
    const s = Math.min(availW / C.W, availH / C.H);
    return { s, x: (app.w - C.W * s) / 2, y: top + (availH - C.H * s) / 2, barY: app.h - bottomH };
  }

  toPaper(p) {
    const L = this.layout();
    return { x: (p.x - L.x) / L.s, y: (p.y - L.y) / L.s };
  }

  send(k, extra) {
    if (!this.online || !this.app.net) return;
    const m = { t: 'g', k };
    if (extra) for (const key in extra) m[key] = extra[key];
    this.app.net.send(m);
  }
  flush() {
    if (this.outbox.length) { this.send('pts', { p: this.outbox }); this.outbox = []; }
  }

  // ---- 手指 ----
  touchStart(p) {
    const g = this.game;
    if (g.phase !== 'select' || !this.isMine()) return;
    const q = this.toPaper(p);
    const id = g.pick(q.x, q.y, C.R + PICK_SLOP);
    if (id < 0) return;
    const n = g.numbers[id];
    let dx = q.x - n.x, dy = q.y - n.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > C.R - 1) { dx *= (C.R - 1) / d; dy *= (C.R - 1) / d; } // 起笔点收进数字圈内
    this.pending = { id, x: Math.round(n.x + dx), y: Math.round(n.y + dy) };
    this.peek = { value: n.value, until: Infinity };
    this.send('peek', { n: id });
  }

  touchMove(p) {
    const g = this.game;
    const q = this.toPaper(p);
    const x = clamp(Math.round(q.x), C.EDGE, C.W - C.EDGE), y = clamp(Math.round(q.y), C.EDGE, C.H - C.EDGE);
    if (this.pending && !this.drawing) {
      const s = this.pending;
      if ((x - s.x) * (x - s.x) + (y - s.y) * (y - s.y) < C.STEP * C.STEP) return;
      // 拖动了：正式起笔
      if (g.startError(s.id, s.x, s.y)) {
        this.app.toast('这里压着旧线或圈，换到数字另一侧起笔');
        this.pending = null;
        if (this.peek) this.peek.until = Date.now() + PEEK_MS;
        return;
      }
      g.begin(s.id, s.x, s.y);
      this.drawing = true;
      this.send('begin', { n: s.id, x: s.x, y: s.y });
    }
    if (!this.drawing) return;
    const pts = g.cur.pts, lx = pts[pts.length - 2], ly = pts[pts.length - 1];
    if ((x - lx) * (x - lx) + (y - ly) * (y - ly) < C.STEP * C.STEP) return; // 原地停顿不落笔迹
    const res = g.extend(x, y);
    this.outbox.push(x, y);
    if (res !== 'ok') {
      this.flush();
      this.drawing = false; this.pending = null;
      this.afterChange();
    }
  }

  touchEnd() {
    if (this.drawing) {
      // 正式起笔后中途抬手：判负
      this.flush();
      this.game.lift();
      this.send('lift');
      this.drawing = false; this.pending = null;
      this.afterChange();
    } else if (this.pending) {
      this.pending = null; // 只是点一下看看
      if (this.peek) this.peek.until = Date.now() + PEEK_MS;
    }
  }

  afterChange() {
    const g = this.game, now = Date.now();
    if (g.phase === 'over') {
      if (!this.overAt) {
        this.overAt = now;
        this.peek = null; this.banner = null;
        try { wx.vibrateShort({ type: g.result.reason === 'complete' ? 'light' : 'heavy' }); } catch (e) { /* 忽略 */ }
      }
    } else if (g.turn !== this.seenTurn) {
      this.seenTurn = g.turn;
      this.turnStart = now;
      this.peek = null;
      this.banner = { text: '轮到' + this.name(g.turn), player: g.turn, t0: now };
    }
  }

  update(now) {
    this.flush();
    const g = this.game;
    // 限时由“正在画的那一端”裁定，再通知对面，避免两端时钟不一致
    if (this.timed && g.phase !== 'over' && this.isMine() && now - this.turnStart >= C.TURN_MS) {
      g.timeout();
      this.send('timeout');
      this.drawing = false; this.pending = null;
      this.afterChange();
    }
  }

  // ---- 好友那端发来的动作，在本机引擎里原样重放 ----
  onNet(m) {
    const g = this.game;
    if (m.t === 'again') { this.againPeer = m.mode; return; }
    if (m.t === 'left') {
      this.peerLeft = true;
      g.abandon(1 - this.seat);
      this.afterChange();
      return;
    }
    if (m.t !== 'g' || g.phase === 'over' || g.turn === this.seat) return;
    if (m.k === 'peek') {
      const n = g.numbers[m.n];
      if (n && !n.done && g.phase === 'select') this.peek = { value: n.value, until: Date.now() + PEEK_MS };
    } else if (m.k === 'begin') {
      if (g.begin(m.n, m.x, m.y)) this.peek = null;
    } else if (m.k === 'pts' && Array.isArray(m.p)) {
      for (let i = 0; i + 1 < m.p.length; i += 2) if (g.extend(+m.p[i], +m.p[i + 1]) !== 'ok') break;
    } else if (m.k === 'lift') g.lift();
    else if (m.k === 'giveup') g.giveUp();
    else if (m.k === 'timeout') g.timeout();
    this.afterChange();
  }

  askGiveUp() {
    wx.showModal({
      title: '这一手画不完？', content: '确认后本局判' + (this.online ? '你' : this.name(this.game.turn)) + '负。',
      confirmText: '认输', cancelText: '再想想',
      success: (r) => {
        if (!r.confirm || this.game.phase === 'over' || !this.isMine() || this.app.scene !== this) return;
        this.flush();
        this.game.giveUp();
        this.send('giveup');
        this.drawing = false; this.pending = null;
        this.afterChange();
      }
    });
  }

  askExit() {
    const g = this.game;
    if (g.phase === 'over' || (!this.online && g.moves === 0)) { this.app.toMenu(); return; }
    wx.showModal({
      title: this.online ? '离开房间？' : '结束这一局？', content: this.online ? '离开后好友会直接获胜。' : '这张纸不会保留。',
      confirmText: '离开', cancelText: '继续画',
      success: (r) => { if (r.confirm && this.app.scene === this) this.app.toMenu(); }
    });
  }

  rematch(mode) {
    if (this.online) {
      if (this.peerLeft) return;
      this.againMine = mode;
      this.app.net.send({ t: 'again', mode });
      return;
    }
    // 同屏：原纸换先手，或换一张新纸（先手重新随机）
    if (mode === 'swap') this.setup(this.game.seed, 1 - this.game.first);
    else this.setup(randomSeed(), Math.random() < 0.5 ? 0 : 1);
  }

  // ---- 画面 ----
  strokePath(ctx, L, pts, color) {
    ctx.beginPath();
    ctx.moveTo(L.x + pts[0] * L.s, L.y + pts[1] * L.s);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(L.x + pts[i] * L.s, L.y + pts[i + 1] * L.s);
    if (pts.length === 2) ctx.lineTo(L.x + pts[0] * L.s + 0.01, L.y + pts[1] * L.s);
    // 画出来的线宽就是判定用的线宽：看得见的墨迹相触才算撞线
    ctx.lineWidth = C.INK * L.s;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    ctx.stroke();
  }

  draw(ctx, now) {
    const app = this.app, g = this.game, L = this.layout();
    const pw = C.W * L.s, ph = C.H * L.s;

    // 纸
    roundRect(ctx, L.x + 1.5, L.y + 2.5, pw, ph, 5); ctx.fillStyle = T.paperEdge; ctx.fill();
    roundRect(ctx, L.x, L.y, pw, ph, 5); ctx.fillStyle = T.paper; ctx.fill();

    // 高亮的一对：正在画的，或点一下看看的
    let hi = null;
    if (g.cur) hi = g.cur.value;
    else if (this.peek) { if (this.peek.until < now) this.peek = null; else hi = this.peek.value; }
    if (hi !== null && g.phase !== 'over') {
      const pulse = 1 + 0.07 * Math.sin(now / 170);
      for (const n of g.numbers) {
        if (n.value !== hi || n.done) continue;
        const isTarget = g.cur ? n.id === g.cur.to : !(this.pending && this.pending.id === n.id);
        ctx.beginPath();
        ctx.arc(L.x + n.x * L.s, L.y + n.y * L.s, C.R * L.s * (isTarget ? pulse : 1), 0, Math.PI * 2);
        ctx.fillStyle = T.pensSoft[g.turn]; ctx.fill();
        ctx.lineWidth = isTarget ? 1.6 : 1; ctx.strokeStyle = T.pens[g.turn]; ctx.stroke();
      }
    }

    // 已连成的一对：外围的圈留在纸上并且挡线，颜色跟连线的人
    for (const n of g.numbers) {
      if (!n.done) continue;
      ctx.beginPath();
      ctx.arc(L.x + n.x * L.s, L.y + n.y * L.s, C.R * L.s, 0, Math.PI * 2);
      ctx.fillStyle = T.pensSoft[n.by]; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = T.pens[n.by]; ctx.stroke();
    }

    // 墨线
    for (const st of g.strokes) this.strokePath(ctx, L, st.pts, T.pens[st.player]);
    const live = g.cur || g.failed;
    if (live) this.strokePath(ctx, L, live.pts, T.pens[live.player]);

    // 数字：字形只作标记，不挡线
    for (const n of g.numbers) {
      ctx.save();
      ctx.translate(L.x + n.x * L.s, L.y + n.y * L.s);
      ctx.rotate(n.tilt);
      const active = g.cur && g.cur.value === n.value;
      font(ctx, 54 * L.s, n.done || active || n.value === hi);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      // 垫一圈纸色，线从数字上掠过时仍看得清
      ctx.lineWidth = 5 * L.s + 1; ctx.lineJoin = 'round'; ctx.strokeStyle = T.paper;
      ctx.strokeText(String(n.value), 0, 2 * L.s);
      ctx.fillStyle = n.done ? T.pens[n.by] : active ? T.pens[g.cur.player] : T.ink;
      ctx.fillText(String(n.value), 0, 2 * L.s);
      ctx.restore();
    }

    // 首次接触处标叉
    if (g.result && g.result.mark) {
      const mx = L.x + g.result.mark.x * L.s, my = L.y + g.result.mark.y * L.s, r = 8;
      const cross = (lw, color) => {
        ctx.beginPath();
        ctx.moveTo(mx - r, my - r); ctx.lineTo(mx + r, my + r);
        ctx.moveTo(mx + r, my - r); ctx.lineTo(mx - r, my + r);
        ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.strokeStyle = color; ctx.stroke();
      };
      const hits = g.result.reason === 'old' || g.result.reason === 'self' || g.result.reason === 'ring';
      cross(6, T.paper);
      cross(2.6, hits ? T.danger : T.ink);
    }

    this.drawHeader(ctx, now);
    if (this.banner) this.drawBanner(ctx, now, L);
    if (g.phase === 'over') {
      if (now - this.overAt >= RESULT_DELAY) this.drawResult(ctx, L);
    } else this.drawBar(ctx, L);
  }

  drawHeader(ctx, now) {
    const app = this.app, g = this.game, cap = app.capsule;
    const cy = cap.top + cap.height / 2;
    button(app, ctx, { key: 'exit', x: 6, y: cy - 20, w: 44, h: 40, kind: 'plain', color: T.muted, size: 24, label: '‹', onTap: () => this.askExit() });
    const over = g.phase === 'over';
    const label = over ? '本局结束' : (this.online ? (this.isMine() ? '轮到你' : '好友的回合') : '轮到' + this.name(g.turn));
    font(ctx, 15, true);
    const tw = ctx.measureText(label).width + 26;
    roundRect(ctx, 52, cy - 15, tw, 30, 15);
    ctx.fillStyle = over ? T.muted : T.pens[g.turn]; ctx.fill();
    text(ctx, label, 52 + tw / 2, cy + 0.5, { size: 15, bold: true, color: T.white, align: 'center' });
    let x = 52 + tw + 12;
    if (this.timed && !over) {
      const left = Math.max(0, Math.ceil((C.TURN_MS - (now - this.turnStart)) / 1000));
      text(ctx, left + ' 秒', x, cy + 0.5, { size: 16, bold: true, color: left <= 10 ? T.danger : T.ink });
      x += 52;
    }
    if (!over && x + 70 < cap.left - 8) {
      const left = g.numbers.filter(n => !n.done).length / 2;
      text(ctx, '还剩 ' + left + ' 对', x, cy + 0.5, { size: 13, color: T.muted });
    }
  }

  drawBanner(ctx, now, L) {
    const t = (now - this.banner.t0) / 1400;
    if (t >= 1) { this.banner = null; return; }
    const alpha = t < 0.12 ? t / 0.12 : t > 0.7 ? (1 - t) / 0.3 : 1;
    ctx.save();
    ctx.globalAlpha = alpha * 0.94;
    font(ctx, 20, true);
    const bw = ctx.measureText(this.banner.text).width + 48, bh = 46;
    const x = (this.app.w - bw) / 2, y = L.y + 14;
    roundRect(ctx, x, y, bw, bh, 23);
    ctx.fillStyle = T.pens[this.banner.player]; ctx.fill();
    text(ctx, this.banner.text, this.app.w / 2, y + bh / 2 + 0.5, { size: 20, bold: true, color: T.white, align: 'center' });
    ctx.restore();
  }

  drawBar(ctx, L) {
    const app = this.app, g = this.game;
    const y = L.barY + 6, pad = 16, btnW = 92;
    let hint;
    if (!this.isMine()) hint = g.phase === 'draw' ? '好友正在画，笔迹和你这边同步' : '好友正在挑数字…';
    else if (g.phase === 'draw') hint = '一笔连到另一枚 ' + g.cur.value + '，碰线、碰圈或抬手就输';
    else hint = '点一枚数字看另一枚在哪；按住它拖动，一笔连过去';
    const lines = wrap(ctx, hint, app.w - pad * 2 - btnW - 12, 13.5, false);
    const lh = 20, ty = y + 36 - lines.length * lh / 2;
    lines.forEach((l, i) => text(ctx, l, pad, ty + lh * (i + 0.5), { size: 13.5, color: T.muted }));
    button(app, ctx, {
      key: 'giveup', x: app.w - pad - btnW, y: y + 14, w: btnW, h: 44, kind: 'ghost', color: T.pens[1], size: 15, label: '画不完',
      disabled: !this.isMine() || this.drawing, onTap: () => this.askGiveUp()
    });
  }

  reasonText() {
    const r = this.game.result, who = this.name(r.loser);
    switch (r.reason) {
      case 'complete': return this.name(r.winner) + '连成了最后一对';
      case 'old': return who + '碰到了旧线';
      case 'ring': return who + '碰到了已连数字的圈';
      case 'self': return who + '碰到了本笔画过的线';
      case 'lift': return who + '中途抬手了';
      case 'giveup': return who + '表示画不完';
      case 'timeout': return who + '超过了 60 秒';
      case 'stuck': return '剩下的数对都无路可连，轮到' + who;
      case 'left': return '好友离开了房间';
      default: return '';
    }
  }

  drawResult(ctx, L) {
    const app = this.app, r = this.game.result, pad = 16;
    const y = L.barY + 2;
    const title = this.online ? (r.winner === this.seat ? '你赢了' : '好友赢了') : this.name(r.winner) + ' 获胜';
    text(ctx, title, pad, y + 18, { size: 19, bold: true, color: T.pens[r.winner] });
    font(ctx, 19, true);
    const tw = ctx.measureText(title).width;
    const reason = this.reasonText();
    const room = app.w - pad * 2 - tw - 12;
    let size = 13.5;
    font(ctx, size, false);
    if (ctx.measureText(reason).width > room) size = 12;
    text(ctx, reason, pad + tw + 12, y + 19, { size, color: T.muted });

    const by = y + 40, bh = 46, gap = 8;
    if (this.online && this.peerLeft) {
      button(app, ctx, { key: 'back', x: pad, y: by, w: app.w - pad * 2, h: bh, kind: 'primary', color: T.ink, label: '返回首页', onTap: () => app.toMenu() });
      return;
    }
    const backW = 64, bw = (app.w - pad * 2 - backW - gap * 2) / 2;
    const sub = (mode, fallback) => {
      if (!this.online) return fallback;
      if (this.againMine === mode) return this.againPeer === mode ? '马上开始…' : '等好友同意…';
      if (this.againPeer === mode) return '好友也想，点此同意';
      return fallback;
    };
    // 结束后可以用这张纸的原始数字布局交换先手，再试一种走法
    button(app, ctx, { key: 'swap', x: pad, y: by, w: bw, h: bh, kind: 'primary', color: T.ink, size: 15, label: '原纸换先手', sub: sub('swap', '同样的数字，换人先画'), onTap: () => this.rematch('swap') });
    button(app, ctx, { key: 'new', x: pad + bw + gap, y: by, w: bw, h: bh, kind: 'ghost', color: T.ink, size: 15, label: '换一张纸', sub: sub('new', '重新撒数字'), onTap: () => this.rematch('new') });
    button(app, ctx, { key: 'back', x: pad + (bw + gap) * 2, y: by, w: backW, h: bh, kind: 'plain', color: T.muted, size: 14, label: '返回', onTap: () => app.toMenu() });
  }
}
module.exports = { Play };
