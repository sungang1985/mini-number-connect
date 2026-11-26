'use strict';
// 全部规则参数都以“纸面逻辑单位”表示。纸面固定为 720×1000，
// 各端只做等比缩放，所以两台手机拿到的坐标与判定完全相同。
const C = {
  W: 720,
  H: 1000,
  INK: 8,        // 默认墨线宽度。两条线的中心线距离 <= 线宽，即墨迹相触
  INK_OPTIONS: [5, 8, 12], // 可选线宽：细 / 中 / 粗。每局固定一种，判定随之变化
  R: 32,         // 数字的起笔 / 到达半径
  STEP: 5,       // 笔尖至少移动这么远才落下一个新笔迹点（原地停顿不产生笔迹）
  PROBE: 2,      // 沿笔尖行进方向逐步判定的步长
  SELF_SKIP_INK: 3, // 紧跟笔尖、长度为线宽这么多倍的一段视为“正常衔接”，不参与本笔自触判定
  MIN_GAP: 96,   // 两枚数字圆心的最小间距
  MARGIN: 72,    // 数字离纸边的最小距离
  MIN_PAIRS: 2,
  MAX_PAIRS: 10,
  DEFAULT_PAIRS: 6,
  MAX_VALUE: 20, // 自选数字的范围 1..MAX_VALUE
  TURN_MS: 60000 // 限时局每手时长
};

// 把外来的设置（本地存档、好友房消息）整理成合法值
C.cleanValues = function (values) {
  const out = [];
  if (Array.isArray(values)) {
    for (const v of values) {
      const n = Math.floor(Number(v));
      if (n >= 1 && n <= 99 && out.indexOf(n) < 0) out.push(n);
    }
  }
  out.sort((a, b) => a - b);
  if (out.length < C.MIN_PAIRS || out.length > C.MAX_PAIRS) {
    out.length = 0;
    for (let v = 1; v <= C.DEFAULT_PAIRS; v++) out.push(v);
  }
  return out;
};
C.cleanInk = function (ink) { return C.INK_OPTIONS.indexOf(ink) >= 0 ? ink : C.INK; };
// 例：1 – 6；或 3、7、12
C.describeValues = function (values) {
  const run = values.every((v, i) => v === values[0] + i);
  if (run && values.length > 2) return values[0] + ' – ' + values[values.length - 1];
  if (values.length <= 5) return values.join('、');
  return values.slice(0, 4).join('、') + ' 等 ' + values.length + ' 个';
};

module.exports = C;
