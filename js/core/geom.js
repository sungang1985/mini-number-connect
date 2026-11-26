'use strict';
// 点到线段的距离平方。只用加减乘除，保证各 JS 引擎结果逐位一致。
function dist2PointSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  const cx = ax + dx * t - px, cy = ay + dy * t - py;
  return cx * cx + cy * cy;
}
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
module.exports = { dist2PointSeg, clamp };
