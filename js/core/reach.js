'use strict';
const C = require('./consts');
const { dist2PointSeg } = require('./geom');

// 换手时判断“剩余数对是否确实都没有合法路径”。
// 做法：把纸面划成 2 单位的小格，只有整格都被旧线墨迹盖住的格子才算堵死，
// 再按八连通求连通块。这样得到的可通行区域只会偏大不会偏小——
// 只要这里说“连不通”，就一定真的连不通；拿不准的情况一律留给玩家自己去画。
const CELL = 2;
const COLS = C.W / CELL, ROWS = C.H / CELL;

function buildLabels(numbers, strokes) {
  const blocked = new Uint8Array(COLS * ROWS);
  const thr = C.INK - CELL * 0.7072;
  const thr2 = thr * thr;
  for (let s = 0; s < strokes.length; s++) {
    const p = strokes[s].pts;
    for (let k = 0; k + 3 < p.length; k += 2) {
      const ax = p[k], ay = p[k + 1], bx = p[k + 2], by = p[k + 3];
      let i0 = Math.floor((Math.min(ax, bx) - thr) / CELL), i1 = Math.floor((Math.max(ax, bx) + thr) / CELL);
      let j0 = Math.floor((Math.min(ay, by) - thr) / CELL), j1 = Math.floor((Math.max(ay, by) + thr) / CELL);
      if (i0 < 0) i0 = 0; if (j0 < 0) j0 = 0;
      if (i1 >= COLS) i1 = COLS - 1; if (j1 >= ROWS) j1 = ROWS - 1;
      for (let j = j0; j <= j1; j++) {
        const cy = j * CELL + CELL / 2;
        for (let i = i0; i <= i1; i++) {
          if (dist2PointSeg(i * CELL + CELL / 2, cy, ax, ay, bx, by) <= thr2) blocked[j * COLS + i] = 1;
        }
      }
    }
  }
  // 已连成的数字外围的圈同样挡线
  const rr = C.R + C.INK / 2 - CELL * 0.7072;
  for (const n of numbers) {
    if (!n.done) continue;
    const a0 = Math.max(0, Math.floor((n.x - rr) / CELL)), a1 = Math.min(COLS - 1, Math.floor((n.x + rr) / CELL));
    const b0 = Math.max(0, Math.floor((n.y - rr) / CELL)), b1 = Math.min(ROWS - 1, Math.floor((n.y + rr) / CELL));
    for (let j = b0; j <= b1; j++) {
      for (let i = a0; i <= a1; i++) {
        const dx = i * CELL + CELL / 2 - n.x, dy = j * CELL + CELL / 2 - n.y;
        if (dx * dx + dy * dy <= rr * rr) blocked[j * COLS + i] = 1;
      }
    }
  }
  // 笔尖到不了的纸边窄条同样算堵死
  const e = Math.floor(C.EDGE / CELL);
  for (let j = 0; j < ROWS; j++) {
    for (let i = 0; i < COLS; i++) {
      if (i < e || j < e || i >= COLS - e || j >= ROWS - e) blocked[j * COLS + i] = 1;
    }
  }
  const labels = new Int32Array(COLS * ROWS);
  const queue = new Int32Array(COLS * ROWS);
  let next = 0;
  for (let start = 0; start < labels.length; start++) {
    if (blocked[start] || labels[start]) continue;
    next++;
    let head = 0, tail = 0;
    queue[tail++] = start; labels[start] = next;
    while (head < tail) {
      const c = queue[head++];
      const ci = c % COLS, cj = (c - ci) / COLS;
      for (let dj = -1; dj <= 1; dj++) {
        const nj = cj + dj;
        if (nj < 0 || nj >= ROWS) continue;
        for (let di = -1; di <= 1; di++) {
          const ni = ci + di;
          if (ni < 0 || ni >= COLS) continue;
          const n = nj * COLS + ni;
          if (blocked[n] || labels[n]) continue;
          labels[n] = next; queue[tail++] = n;
        }
      }
    }
  }
  return labels;
}

function discLabels(labels, num) {
  const set = new Set();
  const r = C.R + CELL, r2 = r * r;
  const i0 = Math.max(0, Math.floor((num.x - r) / CELL)), i1 = Math.min(COLS - 1, Math.floor((num.x + r) / CELL));
  const j0 = Math.max(0, Math.floor((num.y - r) / CELL)), j1 = Math.min(ROWS - 1, Math.floor((num.y + r) / CELL));
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const dx = i * CELL + CELL / 2 - num.x, dy = j * CELL + CELL / 2 - num.y;
      if (dx * dx + dy * dy > r2) continue;
      const l = labels[j * COLS + i];
      if (l) set.add(l);
    }
  }
  return set;
}

// 返回仍可能连通的数字值集合
function connectableValues(numbers, strokes) {
  const labels = buildLabels(numbers, strokes);
  const byValue = {};
  for (const n of numbers) if (!n.done) (byValue[n.value] = byValue[n.value] || []).push(n);
  const out = new Set();
  for (const v in byValue) {
    const pair = byValue[v];
    if (pair.length !== 2) continue;
    const a = discLabels(labels, pair[0]), b = discLabels(labels, pair[1]);
    for (const l of a) if (b.has(l)) { out.add(Number(v)); break; }
  }
  return out;
}
module.exports = { connectableValues };
