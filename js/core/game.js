'use strict';
const C = require('./consts');
const { dist2PointSeg, clamp } = require('./geom');
const { makeLayout } = require('./layout');
const { connectableValues } = require('./reach');

const INK2 = C.INK * C.INK;
const R2 = C.R * C.R;
const RING = C.R + C.INK / 2; // 墨线中心离已连数字的圆心这么近，墨迹就碰到了圈
const RING2 = RING * RING;

// 一局游戏的全部规则。不依赖任何平台 API：
// 同一种子 + 同一串输入点，在任何设备上得到同一结果，好友房两端各跑一份即可。
class Game {
  constructor(opts) {
    this.seed = opts.seed >>> 0;
    this.pairs = opts.pairs || C.DEFAULT_PAIRS;
    this.first = opts.first ? 1 : 0;
    this.numbers = makeLayout(this.seed, this.pairs);
    this.strokes = [];      // 已连成的线 {player, value, pts:[x0,y0,x1,y1,...]}
    this.turn = this.first; // 0 或 1
    this.phase = 'select';  // select 选数 | draw 正式起笔后 | over 结束
    this.cur = null;        // 正在画的一笔
    this.failed = null;     // 判负的那一笔，留在纸上给双方看
    this.result = null;     // {winner, loser, reason, mark}
    this.moves = 0;
  }

  partner(id) {
    const v = this.numbers[id].value;
    for (const n of this.numbers) if (n.value === v && n.id !== id) return n.id;
    return -1;
  }

  // 离 (x,y) 最近、且在 maxDist 以内的未连数字
  pick(x, y, maxDist) {
    let best = -1, bd = maxDist * maxDist;
    for (const n of this.numbers) {
      if (n.done) continue;
      const dx = n.x - x, dy = n.y - y, d = dx * dx + dy * dy;
      if (d <= bd) { bd = d; best = n.id; }
    }
    return best;
  }

  touchesOld(px, py) {
    for (let s = 0; s < this.strokes.length; s++) {
      const p = this.strokes[s].pts;
      for (let k = 0; k + 3 < p.length; k += 2) {
        if (dist2PointSeg(px, py, p[k], p[k + 1], p[k + 2], p[k + 3]) <= INK2) return true;
      }
    }
    return false;
  }

  // 已连成的数字，外围的圈留在纸上并且挡线
  touchesRing(px, py) {
    for (const n of this.numbers) {
      if (!n.done) continue;
      const dx = px - n.x, dy = py - n.y;
      if (dx * dx + dy * dy <= RING2) return true;
    }
    return false;
  }

  // 能否从 (x,y) 起笔；返回 null 表示可以，否则给出原因
  startError(id, x, y) {
    if (this.phase !== 'select') return 'phase';
    const n = this.numbers[id];
    if (!n || n.done) return 'done';
    const dx = x - n.x, dy = y - n.y;
    if (dx * dx + dy * dy > R2) return 'far';
    if (x < C.EDGE || y < C.EDGE || x > C.W - C.EDGE || y > C.H - C.EDGE) return 'far';
    if (this.touchesOld(x, y) || this.touchesRing(x, y)) return 'ink';
    return null;
  }

  // 正式起笔
  begin(id, x, y) {
    x = Math.round(x); y = Math.round(y);
    if (this.startError(id, x, y)) return false;
    this.cur = {
      player: this.turn, value: this.numbers[id].value,
      from: id, to: this.partner(id),
      pts: [x, y], arc: [0], len: 0
    };
    this.phase = 'draw';
    return true;
  }

  // 笔尖在 (px,py)、已画弧长 s 时，墨迹是否碰到了别的墨迹
  _touch(px, py, s) {
    if (this.touchesOld(px, py)) return 'old';
    if (this.touchesRing(px, py)) return 'ring';
    const c = this.cur, p = c.pts, arc = c.arc;
    const limit = s - C.SELF_SKIP;
    for (let i = 0; i + 1 < arc.length; i++) {
      if (arc[i] >= limit) break;
      const ax = p[2 * i], ay = p[2 * i + 1];
      let bx = p[2 * i + 2], by = p[2 * i + 3];
      if (arc[i + 1] > limit) { // 只取落在“正常衔接”范围之外的那一截
        const f = (limit - arc[i]) / (arc[i + 1] - arc[i]);
        bx = ax + (bx - ax) * f; by = ay + (by - ay) * f;
      }
      if (dist2PointSeg(px, py, ax, ay, bx, by) <= INK2) return 'self';
    }
    return null;
  }

  _push(x, y, d) {
    const c = this.cur;
    c.pts.push(x, y);
    c.len += d;
    c.arc.push(c.len);
  }

  // 笔尖移到 (x,y)。返回 ok | done 连成 | old 碰旧线 | ring 碰已连数字的圈 | self 碰本笔 | ignored
  extend(x, y) {
    if (this.phase !== 'draw') return 'ignored';
    const c = this.cur, p = c.pts, n = p.length;
    x = clamp(Math.round(x), C.EDGE, C.W - C.EDGE);
    y = clamp(Math.round(y), C.EDGE, C.H - C.EDGE);
    const ax = p[n - 2], ay = p[n - 1];
    const dx = x - ax, dy = y - ay;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return 'ok';
    const s0 = c.len;
    const tgt = this.numbers[c.to];
    const steps = Math.ceil(len / C.PROBE);
    let lo = 0;
    // 沿笔尖经过的顺序逐步判断：先碰线先判负，先到目标先收笔
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const px = ax + dx * t, py = ay + dy * t;
      let kind = this._touch(px, py, s0 + len * t);
      if (kind) {
        let a = lo, b = t; // 二分求首次接触的位置
        for (let k = 0; k < 24; k++) {
          const m = (a + b) / 2;
          const km = this._touch(ax + dx * m, ay + dy * m, s0 + len * m);
          if (km) { b = m; kind = km; } else a = m;
        }
        const hx = ax + dx * b, hy = ay + dy * b;
        this._push(hx, hy, len * b);
        this._lose(this.turn, kind, { x: hx, y: hy });
        return kind;
      }
      const ex = px - tgt.x, ey = py - tgt.y;
      if (ex * ex + ey * ey <= R2) {
        let a = lo, b = t;
        for (let k = 0; k < 24; k++) {
          const m = (a + b) / 2;
          const mx = ax + dx * m - tgt.x, my = ay + dy * m - tgt.y;
          if (mx * mx + my * my <= R2) b = m; else a = m;
        }
        this._push(ax + dx * b, ay + dy * b, len * b);
        this._complete();
        return 'done';
      }
      lo = t;
    }
    this._push(x, y, len);
    return 'ok';
  }

  _complete() {
    const c = this.cur;
    this.numbers[c.from].done = this.numbers[c.to].done = true;
    this.numbers[c.from].by = this.numbers[c.to].by = c.player;
    this.strokes.push({ player: c.player, value: c.value, pts: c.pts });
    this.cur = null;
    this.moves++;
    if (this.numbers.every(n => n.done)) {
      this.phase = 'over';
      this.result = { winner: c.player, loser: 1 - c.player, reason: 'complete', mark: null };
      return;
    }
    this.turn = 1 - this.turn;
    this.phase = 'select';
    // 只有所有剩余数对都确实无路可走，才直接判当前玩家无法完成
    if (connectableValues(this.numbers, this.strokes).size === 0) this._lose(this.turn, 'stuck', null);
  }

  _lose(player, reason, mark) {
    if (this.cur) { this.failed = this.cur; this.cur = null; }
    this.phase = 'over';
    this.result = { winner: 1 - player, loser: player, reason, mark };
  }

  _tip() {
    if (!this.cur) return null;
    const p = this.cur.pts;
    return { x: p[p.length - 2], y: p[p.length - 1] };
  }

  // 正式起笔后中途抬手
  lift() { if (this.phase === 'draw') this._lose(this.turn, 'lift', this._tip()); }
  // 主动表示本轮画不完
  giveUp() { if (this.phase !== 'over') this._lose(this.turn, 'giveup', this._tip()); }
  // 限时局超时
  timeout() { if (this.phase !== 'over') this._lose(this.turn, 'timeout', this._tip()); }
  // 好友离开房间，留下的一方获胜
  abandon(leaver) {
    if (this.phase === 'over') return;
    if (this.cur) { this.failed = this.cur; this.cur = null; }
    this.phase = 'over';
    this.result = { winner: 1 - leaver, loser: leaver, reason: 'left', mark: null };
  }
}
module.exports = { Game };
