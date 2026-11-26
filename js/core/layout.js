'use strict';
const C = require('./consts');
const { makeRng } = require('./rng');

// 由种子生成一张纸：values 里每个数字恰好两枚，位置随意，
// 只保证彼此留出方便辨认和落指的间距。
function makeLayout(seed, list) {
  const rng = makeRng(seed);
  const count = list.length * 2;
  const minGap = C.MIN_GAP; // 再挤也要给两枚数字之间留一条能走线的缝
  let gap = 170;
  let pts = [];
  while (pts.length < count) {
    pts = [];
    let fails = 0;
    while (pts.length < count && fails < 600) {
      const x = C.MARGIN + Math.floor(rng() * (C.W - 2 * C.MARGIN + 1));
      const y = C.MARGIN + Math.floor(rng() * (C.H - 2 * C.MARGIN + 1));
      let ok = true;
      for (let i = 0; i < pts.length; i++) {
        const dx = pts[i].x - x, dy = pts[i].y - y;
        if (dx * dx + dy * dy < gap * gap) { ok = false; break; }
      }
      if (ok) { pts.push({ x, y }); fails = 0; } else fails++;
    }
    if (pts.length < count) gap = Math.max(minGap, gap - 10);
  }
  const values = [];
  for (const v of list) values.push(v, v);
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = values[i]; values[i] = values[j]; values[j] = t;
  }
  return pts.map((p, i) => ({
    id: i, value: values[i], x: p.x, y: p.y,
    tilt: (rng() - 0.5) * 0.24, // 仅用于显示的手写倾斜，不参与判定
    done: false, by: -1
  }));
}
module.exports = { makeLayout };
