'use strict';
const C = require('../core/consts');
const { T, roundRect, text, button, paragraph, wrap } = require('../ui');

const INK_NAMES = ['细', '中', '粗'];
const PRESETS = [4, 6, 9];

const RULES = [
  ['选一对', '纸上每个数字恰好两枚。轮到你时任选一枚还没连过的数字，点一下可以看看另一枚在哪；按住并拖动才算正式起笔。'],
  ['一笔连过去', '可以斜划、大幅绕弯，也可以掠过别的数字或停下来想一想。笔尖到达同号的另一枚才收笔。'],
  ['连成换人', '连成的线和这对数字外围的圈都留在纸上，轮到对方。连成最后一对的人获胜。'],
  ['碰线即负', '碰到纸上的旧线、已连数字的圈，或碰到本笔先前画过的部分（回描、闭圈、交叉成 8 字），在第一次接触时判负。贴得再近，只要墨迹没碰上就没事。'],
  ['也算输', '正式起笔后中途抬手、主动表示画不完、限时局超过 60 秒。换手时若剩下的数对都已无路可连，轮到的人直接判负。']
];

class Menu {
  constructor(app) { this.app = app; this.rules = false; this.picker = null; }
  touchStart() {}
  touchMove() {}
  touchEnd() {}

  // 首页上那张示意小纸：十二枚数字，一条刚连好的线
  drawSample(ctx, x, y, w, h) {
    roundRect(ctx, x + 1.5, y + 2.5, w, h, 6); ctx.fillStyle = T.paperEdge; ctx.fill();
    roundRect(ctx, x, y, w, h, 6); ctx.fillStyle = T.paper; ctx.fill();
    const nums = [[4, .32, .16], [5, .10, .30], [2, .50, .34], [4, .86, .40], [6, .93, .20], [1, .07, .58], [5, .28, .62],
      [3, .05, .88], [3, .29, .86], [6, .62, .90], [1, .80, .78], [2, .95, .92]];
    const X = (u) => x + 14 + u * (w - 28), Y = (v) => y + 12 + v * (h - 24);
    ctx.beginPath();
    ctx.moveTo(X(.10), Y(.56));
    ctx.bezierCurveTo(X(.34), Y(.10), X(.50), Y(1.02), X(.77), Y(.78));
    ctx.lineWidth = this.app.opts.ink * 0.4; ctx.lineCap = 'round'; ctx.strokeStyle = T.pens[0]; ctx.stroke(); // 示意线跟着所选粗细变
    nums.forEach(n => text(ctx, String(n[0]), X(n[1]), Y(n[2]), { size: 19, color: n[0] === 1 ? T.pens[0] : T.ink, align: 'center' }));
  }

  draw(ctx) {
    const app = this.app, w = app.w, h = app.h, cx = w / 2;
    const top = app.capsule.bottom + 12, bottom = h - app.safeBottom - 14;
    const bw = Math.min(320, w - 48), bx = cx - bw / 2;
    // 内容总高固定，在可用高度内居中偏上
    let sampleH = Math.min(150, (bottom - top) - 508);
    if (sampleH < 100) sampleH = 0; // 小屏放不下示意图就不画
    const total = 466 + (sampleH ? sampleH + 22 : 0);
    let y = top + Math.max(0, (bottom - top - total) * 0.4);

    text(ctx, '数字连连看', cx, y + 24, { size: 32, bold: true, align: 'center' });
    text(ctx, '同一张纸，一人一笔。碰到线的人输。', cx, y + 62, { size: 14, color: T.muted, align: 'center' });
    y += 86;
    if (sampleH) { this.drawSample(ctx, bx, y, bw, sampleH); y += sampleH + 22; }

    button(app, ctx, { key: 'local', x: bx, y, w: bw, h: 60, kind: 'primary', color: T.pens[0], label: '同屏对画', sub: '两人轮流接手机，慢慢画', onTap: () => app.startLocal() });
    y += 72;
    button(app, ctx, { key: 'host', x: bx, y, w: bw, h: 60, kind: 'ghost', color: T.pens[1], label: '邀请微信好友', sub: '两部手机，同一张纸、同一笔迹', onTap: () => app.hostRoom() });
    y += 66;
    button(app, ctx, { key: 'join', x: bx, y, w: bw, h: 38, kind: 'plain', color: T.muted, size: 14, label: '输入房号加入', onTap: () => this.askRoom() });
    y += 50;

    // 选项：纸上的数字、线条粗细、限时
    ctx.strokeStyle = T.paperEdge; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(bx, y); ctx.lineTo(bx + bw, y); ctx.stroke();
    y += 10;
    const o = app.opts;
    text(ctx, '纸上的数字', bx, y + 20, { size: 15 });
    text(ctx, C.describeValues(o.values) + '  ›', bx + bw, y + 20, { size: 16, bold: true, color: T.pens[0], align: 'right' });
    app.hot.push({ key: 'values', x: bx, y, w: bw, h: 40, onTap: () => { this.picker = o.values.slice(); } });
    y += 46;
    text(ctx, '线条粗细', bx, y + 20, { size: 15 });
    INK_NAMES.forEach((name, i) => {
      const ink = C.INK_OPTIONS[i], on = o.ink === ink, sw = 54;
      button(app, ctx, {
        key: 'ink' + i, x: bx + bw - (3 - i) * (sw + 6) + 6, y: y + 2, w: sw, h: 36, radius: 18, size: 15,
        kind: on ? 'primary' : 'ghost', color: on ? T.pens[0] : T.muted, label: name,
        onTap: () => { o.ink = ink; app.saveOpts(); }
      });
    });
    y += 46;
    text(ctx, '每手限时 60 秒', bx, y + 20, { size: 15 });
    this.drawSwitch(ctx, bx + bw - 52, y + 6, o.timed);
    app.hot.push({ key: 'timed', x: bx, y, w: bw, h: 40, onTap: () => { o.timed = !o.timed; app.saveOpts(); } });
    y += 52;
    button(app, ctx, { key: 'rules', x: cx - 60, y, w: 120, h: 38, kind: 'plain', color: T.pens[0], size: 14, bold: true, label: '怎么玩', onTap: () => { this.rules = true; } });

    if (this.rules) this.drawRules(ctx);
    if (this.picker) this.drawPicker(ctx);
  }

  drawSwitch(ctx, x, y, on) {
    roundRect(ctx, x, y, 52, 28, 14);
    ctx.fillStyle = on ? T.pens[0] : T.faint; ctx.fill();
    ctx.beginPath(); ctx.arc(on ? x + 38 : x + 14, y + 14, 11, 0, Math.PI * 2);
    ctx.fillStyle = T.white; ctx.fill();
  }

  askRoom() {
    wx.showModal({
      title: '输入房号', editable: true, placeholderText: '好友房间的 4 位数字', confirmText: '加入',
      success: (r) => { if (r.confirm) this.app.joinRoom(r.content); }
    });
  }

  // 自选纸上的数字：点选 1..20，每个各两枚
  drawPicker(ctx) {
    const app = this.app, w = app.w, h = app.h, sel = this.picker;
    app.hot.length = 0;
    ctx.fillStyle = 'rgba(42,48,54,0.45)'; ctx.fillRect(0, 0, w, h);
    const pw = Math.min(340, w - 32), px = (w - pw) / 2, inner = pw - 40;
    const cols = 5, gap = 8, cw = (inner - gap * (cols - 1)) / cols, chH = 42;
    const rows = Math.ceil(C.MAX_VALUE / cols);
    const ph = 86 + rows * (chH + gap) + 50 + 66, py = Math.max(app.capsule.bottom + 8, (h - ph) / 2);
    roundRect(ctx, px, py, pw, ph, 16); ctx.fillStyle = T.paper; ctx.fill();
    text(ctx, '纸上的数字', px + 20, py + 32, { size: 19, bold: true });
    text(ctx, '选中的数字各出两枚，可选 ' + C.MIN_PAIRS + ' – ' + C.MAX_PAIRS + ' 个', px + 20, py + 62, { size: 13, color: T.muted });
    let y = py + 86;
    for (let v = 1; v <= C.MAX_VALUE; v++) {
      const i = (v - 1) % cols, j = Math.floor((v - 1) / cols), on = sel.indexOf(v) >= 0;
      button(app, ctx, {
        key: 'pick' + v, x: px + 20 + i * (cw + gap), y: y + j * (chH + gap), w: cw, h: chH, radius: 10, size: 17,
        kind: on ? 'primary' : 'ghost', color: on ? T.pens[0] : T.muted, label: String(v),
        onTap: () => {
          const k = sel.indexOf(v);
          if (k >= 0) sel.splice(k, 1);
          else if (sel.length >= C.MAX_PAIRS) app.toast('最多选 ' + C.MAX_PAIRS + ' 个数字');
          else { sel.push(v); sel.sort((a, b) => a - b); }
        }
      });
    }
    y += rows * (chH + gap) + 6;
    text(ctx, '快选', px + 20, y + 17, { size: 13, color: T.muted });
    PRESETS.forEach((n, i) => {
      button(app, ctx, {
        key: 'preset' + n, x: px + 62 + i * 74, y, w: 66, h: 34, radius: 17, size: 14, kind: 'ghost', color: T.muted, label: '1 – ' + n,
        onTap: () => { sel.length = 0; for (let v = 1; v <= n; v++) sel.push(v); }
      });
    });
    const ok = sel.length >= C.MIN_PAIRS;
    button(app, ctx, {
      key: 'pickok', x: px + 20, y: py + ph - 58, w: pw - 40, h: 42, kind: 'primary', color: T.ink, disabled: !ok,
      label: ok ? '用这 ' + sel.length + ' 个数字' : '至少选 ' + C.MIN_PAIRS + ' 个',
      onTap: () => { app.opts.values = sel.slice(); app.saveOpts(); this.picker = null; }
    });
  }

  drawRules(ctx) {
    const app = this.app, w = app.w, h = app.h;
    app.hot.length = 0; // 盖住下面的按钮
    ctx.fillStyle = 'rgba(42,48,54,0.45)'; ctx.fillRect(0, 0, w, h);
    const pw = Math.min(340, w - 32), px = (w - pw) / 2, inner = pw - 40;
    // 先量高度
    let ch = 0;
    RULES.forEach(r => { ch += 24 + wrap(ctx, r[1], inner, 13.5, false).length * 21 + 10; });
    const ph = 58 + ch + 62, py = Math.max(app.capsule.bottom + 8, (h - ph) / 2);
    roundRect(ctx, px, py, pw, ph, 16); ctx.fillStyle = T.paper; ctx.fill();
    text(ctx, '怎么玩', px + 20, py + 32, { size: 19, bold: true });
    let y = py + 58;
    RULES.forEach((r, i) => {
      text(ctx, r[0], px + 20, y + 11, { size: 14, bold: true, color: i >= 3 ? T.pens[1] : T.pens[0] });
      y += 24;
      y += paragraph(ctx, r[1], px + 20, y, inner, { size: 13.5, lineHeight: 21, color: T.ink }) + 10;
    });
    button(app, ctx, { key: 'rulesok', x: px + 20, y: py + ph - 58, w: pw - 40, h: 42, kind: 'primary', color: T.ink, label: '知道了', onTap: () => { this.rules = false; } });
  }
}
module.exports = { Menu };
