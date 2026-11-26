'use strict';
const test = require('node:test');
const assert = require('node:assert');
const C = require('../js/core/consts');
const { Game } = require('../js/core/game');
const { makeLayout } = require('../js/core/layout');
const { connectableValues } = require('../js/core/reach');

// 手工摆一张纸：nums = [[value,x,y],...]
function board(nums, first) {
  const g = new Game({ seed: 1, pairs: 4, first: first || 0 });
  g.numbers = nums.map((n, i) => ({ id: i, value: n[0], x: n[1], y: n[2], tilt: 0, done: false, by: -1 }));
  g.pairs = nums.length / 2;
  return g;
}
// 沿折线拖动，按 STEP 间距送点，模拟真实手指
function drag(g, pts) {
  let res = 'ok';
  for (let i = 1; i < pts.length && res === 'ok'; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / C.STEP));
    for (let k = 1; k <= n && res === 'ok'; k++) res = g.extend(ax + (bx - ax) * k / n, ay + (by - ay) * k / n);
  }
  return res;
}
const std = () => board([[1, 100, 300], [1, 500, 300], [2, 100, 500], [2, 500, 500], [3, 300, 100], [3, 300, 700], [4, 600, 800], [4, 650, 900]]);

test('布局：每个数字恰好两枚，同种子同布局，间距足够', () => {
  for (let pairs = C.MIN_PAIRS; pairs <= C.MAX_PAIRS; pairs++) {
    for (let seed = 1; seed <= 40; seed++) {
      const a = makeLayout(seed, pairs), b = makeLayout(seed, pairs);
      assert.deepStrictEqual(a, b);
      assert.strictEqual(a.length, pairs * 2);
      const cnt = {};
      a.forEach(n => { cnt[n.value] = (cnt[n.value] || 0) + 1; });
      for (let v = 1; v <= pairs; v++) assert.strictEqual(cnt[v], 2);
      for (let i = 0; i < a.length; i++) {
        assert.ok(a[i].x >= C.MARGIN && a[i].x <= C.W - C.MARGIN && a[i].y >= C.MARGIN && a[i].y <= C.H - C.MARGIN);
        for (let j = i + 1; j < a.length; j++) {
          assert.ok(Math.hypot(a[i].x - a[j].x, a[i].y - a[j].y) >= C.R * 2 + C.INK * 4);
        }
      }
    }
  }
  assert.notDeepStrictEqual(makeLayout(1, 6), makeLayout(2, 6));
});

test('连成换人：笔尖抵达同号目标即收笔，线留在纸上', () => {
  const g = std();
  assert.ok(g.begin(0, 100, 300));
  assert.strictEqual(drag(g, [[100, 300], [500, 300]]), 'done');
  assert.strictEqual(g.turn, 1);
  assert.strictEqual(g.phase, 'select');
  assert.strictEqual(g.strokes.length, 1);
  assert.ok(g.numbers[0].done && g.numbers[1].done);
  const p = g.strokes[0].pts;
  // 墨线停在目标圈的边上
  assert.ok(Math.abs(Math.hypot(p[p.length - 2] - 500, p[p.length - 1] - 300) - C.R) < 0.01);
});

test('掠过别的未连数字时继续画', () => {
  const g = board([[1, 100, 300], [1, 500, 300], [2, 300, 300], [2, 300, 600]]);
  g.begin(0, 100, 300);
  assert.strictEqual(drag(g, [[100, 300], [500, 300]]), 'done');
  assert.ok(!g.numbers[2].done);
});

test('起笔：只能从未连数字的圈内、且不压旧线的位置起笔', () => {
  const g = board([[1, 100, 300], [1, 500, 300], [2, 300, 300], [2, 300, 600]]);
  assert.strictEqual(g.startError(0, 100, 340), 'far');
  g.begin(0, 100, 300); drag(g, [[100, 300], [500, 300]]);
  assert.strictEqual(g.startError(0, 100, 300), 'done');
  assert.strictEqual(g.startError(2, 300, 300), 'ink');   // 旧线正从 2 上掠过
  assert.strictEqual(g.startError(2, 300, 320), null);    // 圈内换个位置就能起笔
  assert.ok(g.begin(2, 300, 320));
  assert.strictEqual(drag(g, [[300, 320], [300, 600]]), 'done');
  assert.strictEqual(g.result.reason, 'complete');
  assert.strictEqual(g.result.winner, 1); // 完成最后一对的人获胜
});

test('撞线：交叉旧线立即判负，叉号标在首次接触处', () => {
  const g = std();
  g.begin(0, 100, 300); drag(g, [[100, 300], [500, 300]]);
  g.begin(4, 300, 100);
  assert.strictEqual(drag(g, [[300, 100], [300, 700]]), 'old');
  assert.deepStrictEqual([g.result.loser, g.result.winner, g.result.reason], [1, 0, 'old']);
  assert.ok(Math.abs(g.result.mark.x - 300) < 1e-6);
  assert.ok(Math.abs(g.result.mark.y - (300 - C.INK)) < 1e-3); // 墨迹外缘刚好相触的位置
  assert.strictEqual(g.strokes.length, 1);
  assert.ok(g.failed);
});

test('贴线通过 / 相切判负', () => {
  // 旧线 y=300。新线与它平行：中心距 INK+1 时两笔墨迹之间仍有缝，可过；恰为 INK 时相切，判负
  const mk = () => {
    const g = board([[1, 200, 300], [1, 500, 300], [2, 100, 320], [2, 620, 320], [3, 100, 700], [3, 600, 700]]);
    g.begin(0, 200, 300); drag(g, [[200, 300], [500, 300]]);
    return g;
  };
  let g = mk();
  g.begin(2, 100, 300 + C.INK + 1);
  assert.strictEqual(drag(g, [[100, 309], [620, 309]]), 'done');
  g = mk();
  g.begin(2, 100, 300 + C.INK);
  assert.strictEqual(drag(g, [[100, 308], [620, 308]]), 'old');
});

test('能绕过线头就能连；自己上一轮的旧线同样算旧线', () => {
  const g = std();
  g.begin(0, 100, 300); drag(g, [[100, 300], [500, 300]]);        // 甲连 1
  g.begin(2, 100, 500);                                            // 乙连 2，不碍事
  assert.strictEqual(drag(g, [[100, 500], [500, 500]]), 'done');
  g.begin(4, 300, 100);                                            // 甲连 3：从两条线头外侧兜过去
  assert.strictEqual(drag(g, [[300, 100], [40, 100], [40, 700], [300, 700]]), 'done');
  // 乙连 4 成功后，再验证甲碰自己早先的线也判负
  g.begin(6, 600, 800);
  assert.strictEqual(drag(g, [[600, 800], [650, 900]]), 'done');
  assert.strictEqual(g.result.winner, 1);
  const h = std();
  h.begin(0, 100, 300); drag(h, [[100, 300], [500, 300]]);
  h.begin(6, 600, 800); drag(h, [[600, 800], [650, 900]]);
  h.begin(4, 300, 100);
  assert.strictEqual(drag(h, [[300, 100], [300, 700]]), 'old');
  assert.strictEqual(h.result.loser, 0);
});

test('本笔：留有空隙的回弯可以继续画', () => {
  const g = std();
  g.begin(0, 100, 300);
  // 走出去再折回来，两段之间留 INK+2 的间距
  assert.strictEqual(drag(g, [[100, 300], [100, 200], [400, 200], [400, 200 + C.INK + 2], [200, 200 + C.INK + 2], [200, 400], [500, 400], [500, 300]]), 'done');
});

test('本笔：直角急转、缓弯、原地停顿都不误判', () => {
  const g = std();
  g.begin(0, 100, 300);
  assert.strictEqual(drag(g, [[100, 300], [200, 300], [200, 200], [300, 200]]), 'ok');
  for (let i = 0; i < 50; i++) assert.strictEqual(g.extend(300, 200), 'ok'); // 停住想一想
  const n = g.cur.pts.length;
  assert.strictEqual(g.extend(300, 200), 'ok');
  assert.strictEqual(g.cur.pts.length, n);
  // 半径 2×INK 的小圆弧掉头
  const arc = [];
  for (let a = -90; a <= 90; a += 10) arc.push([300 + 16 * Math.cos(a * Math.PI / 180), 216 + 16 * Math.sin(a * Math.PI / 180)]);
  assert.strictEqual(drag(g, [[300, 200]].concat(arc, [[250, 232]])), 'ok');
});

test('本笔：原路回描在首次接触时判负', () => {
  const g = std();
  g.begin(0, 100, 300);
  assert.strictEqual(drag(g, [[100, 300], [300, 300], [250, 300]]), 'self');
  assert.strictEqual(g.result.reason, 'self');
  assert.ok(g.result.mark.x > 285, '回描几个单位内就应判出');
});

test('本笔：交叉成“8”字、回到起点闭圈、擦到一点都判负', () => {
  let g = std();
  g.begin(0, 100, 300);
  assert.strictEqual(drag(g, [[100, 300], [300, 300], [300, 200], [200, 200], [200, 400]]), 'self');
  assert.ok(Math.abs(g.result.mark.x - 200) < 1e-6 && Math.abs(g.result.mark.y - (300 - C.INK)) < 1e-3);

  g = std();
  g.begin(0, 100, 300);
  assert.strictEqual(drag(g, [[100, 300], [200, 300], [200, 200], [100, 200], [100, 300]]), 'self'); // 回到起点
  assert.ok(g.result.mark.y < 300);

  g = std();
  g.begin(0, 100, 300);
  // 绕回来只擦到先前的线：中心距恰为 INK
  assert.strictEqual(drag(g, [[100, 300], [300, 300], [300, 200], [200, 200], [200, 300 - C.INK], [150, 300 - C.INK]]), 'self');
  g = std();
  g.begin(0, 100, 300);
  assert.strictEqual(drag(g, [[100, 300], [300, 300], [300, 200], [200, 200], [200, 300 - C.INK - 1], [150, 300 - C.INK - 1]]), 'ok');
});

test('抬手、认输、超时都判当前玩家负；未正式起笔时抬手无事', () => {
  let g = std();
  g.lift();
  assert.strictEqual(g.phase, 'select');
  g.begin(0, 100, 300); drag(g, [[100, 300], [200, 300]]);
  g.lift();
  assert.deepStrictEqual([g.result.loser, g.result.reason], [0, 'lift']);
  g = std(); g.giveUp();
  assert.deepStrictEqual([g.result.loser, g.result.reason], [0, 'giveup']);
  g = board(std().numbers.map(n => [n.value, n.x, n.y]), 1); g.timeout();
  assert.deepStrictEqual([g.result.loser, g.result.reason], [1, 'timeout']);
  assert.strictEqual(g.extend(1, 1), 'ignored');
});

test('无路可连（直接检验连通性判断）', () => {
  const nums = [{ id: 0, value: 3, x: 300, y: 300, done: false }, { id: 1, value: 3, x: 600, y: 800, done: false },
    { id: 2, value: 2, x: 100, y: 800, done: false }, { id: 3, value: 2, x: 200, y: 900, done: false }];
  const ring = (gap) => ({ pts: [240, 240, 360, 240, 360, 360, 240, 360, 240, 240 + gap] });
  // 缺口宽 40：能钻过去
  assert.deepStrictEqual([...connectableValues(nums, [ring(40)])].sort(), [2, 3]);
  // 缺口只有 INK+3：墨迹未相触，但容不下一条线，3 确实无路
  assert.deepStrictEqual([...connectableValues(nums, [ring(C.INK + 3)])], [2]);
  // 再把 2 也隔开
  const wall = { pts: [4, 850, 716, 850] };
  assert.deepStrictEqual([...connectableValues(nums, [ring(C.INK + 3), wall])], []);
  // 贴着纸边留 2×INK+2 的缝则仍可通过
  assert.deepStrictEqual([...connectableValues(nums, [ring(C.INK + 3), { pts: [4 + 2 * C.INK + 2, 850, 716, 850] }])], [2]);
});

test('换手时所有数对无路 → 判当前玩家负', () => {
  const g = board([[1, 60, 850], [1, 680, 850], [2, 100, 700], [2, 200, 950]]);
  g.begin(0, 36, 850);
  g.cur.pts = [36, 850];
  // 甲从左到右画一道几乎贴满纸宽的墙，把两枚 2 隔在两侧
  assert.strictEqual(drag(g, [[36, 850], [10, 850], [10, 800], [710, 800], [710, 845]]), 'done');
  assert.strictEqual(g.phase, 'over');
  assert.deepStrictEqual([g.result.loser, g.result.reason, g.result.winner], [1, 'stuck', 0]);
});

test('两端一致：同一串输入点在两份引擎里得到完全相同的笔迹与结果', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const a = new Game({ seed, pairs: 6, first: seed % 2 }), b = new Game({ seed, pairs: 6, first: seed % 2 });
    let r = seed * 7919;
    const rnd = () => { r = (r * 1103515245 + 12345) & 0x7fffffff; return r / 0x7fffffff; };
    for (let turn = 0; turn < 12 && a.phase !== 'over'; turn++) {
      const free = a.numbers.filter(n => !n.done);
      const from = free[Math.floor(rnd() * free.length)], to = a.numbers[a.partner(from.id)];
      if (!a.begin(from.id, from.x, from.y)) { a.giveUp(); b.giveUp(); break; }
      const sent = [from.id, from.x, from.y];
      b.begin(sent[0], sent[1], sent[2]);
      let x = from.x, y = from.y, res = 'ok';
      for (let k = 0; k < 400 && res === 'ok'; k++) {
        const d = Math.hypot(to.x - x, to.y - y);
        x = Math.round(x + (to.x - x) / d * 6 + (rnd() - 0.5) * 3);
        y = Math.round(y + (to.y - y) / d * 6 + (rnd() - 0.5) * 3);
        res = a.extend(x, y);
        assert.strictEqual(b.extend(JSON.parse(JSON.stringify(x)), y), res);
      }
      if (res === 'ok') { a.lift(); b.lift(); }
    }
    assert.deepStrictEqual(JSON.parse(JSON.stringify(b)), JSON.parse(JSON.stringify(a)));
  }
});
