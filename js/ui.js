'use strict';
// 配色与绘制小工具。画面取“一张草稿纸”的意思：米白纸、墨色数字、两支颜色的笔。
const T = {
  desk: '#e8e3d7',
  paper: '#fdfbf5',
  paperEdge: '#d9d2c2',
  ink: '#2a3036',
  muted: '#7d827f',
  faint: '#b9b6ab',
  pens: ['#1d6f7a', '#b5502a'],
  pensSoft: ['rgba(29,111,122,0.13)', 'rgba(181,80,42,0.13)'],
  danger: '#c23a2b',
  white: '#ffffff'
};
const FONT = '"PingFang SC","Helvetica Neue",Helvetica,Arial,"Microsoft YaHei",sans-serif';

function font(ctx, size, bold) { ctx.font = (bold ? 'bold ' : '') + Math.round(size) + 'px ' + FONT; }

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function text(ctx, str, x, y, opt) {
  opt = opt || {};
  font(ctx, opt.size || 15, opt.bold);
  ctx.fillStyle = opt.color || T.ink;
  ctx.textAlign = opt.align || 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(str, x, y);
}

const NO_HEAD = '，。、；：！？）》」”'; // 不放在行首的标点
const NO_TAIL = '（《「“';

// 中文按字折行；返回各行
function wrap(ctx, str, maxW, size, bold) {
  font(ctx, size, bold);
  const lines = [];
  for (const para of String(str).split('\n')) {
    let line = '';
    for (const ch of para) {
      if (line && ctx.measureText(line + ch).width > maxW && NO_HEAD.indexOf(ch) < 0) {
        // 行尾不留开括号
        const tail = line[line.length - 1];
        if (NO_TAIL.indexOf(tail) >= 0 && line.length > 1) { lines.push(line.slice(0, -1)); line = tail + ch; }
        else { lines.push(line); line = ch; }
      } else line += ch;
    }
    lines.push(line);
  }
  return lines;
}

function paragraph(ctx, str, x, y, maxW, opt) {
  opt = opt || {};
  const size = opt.size || 14, lh = opt.lineHeight || size * 1.55;
  const lines = wrap(ctx, str, maxW, size, opt.bold);
  for (let i = 0; i < lines.length; i++) text(ctx, lines[i], x, y + lh * (i + 0.5), opt);
  return lines.length * lh;
}

// 画按钮并登记点击区域。kind: primary | ghost | plain
function button(app, ctx, b) {
  const pressed = app.pressedKey === b.key;
  const r = b.radius == null ? 12 : b.radius;
  const color = b.color || T.ink;
  ctx.save();
  if (b.disabled) ctx.globalAlpha = 0.38;
  roundRect(ctx, b.x, b.y, b.w, b.h, r);
  if (b.kind === 'primary') {
    ctx.fillStyle = color; ctx.fill();
    if (pressed) { ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fill(); }
  } else if (b.kind === 'ghost') {
    ctx.fillStyle = pressed ? 'rgba(42,48,54,0.10)' : T.paper; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = color; ctx.stroke();
  } else if (pressed) {
    ctx.fillStyle = 'rgba(42,48,54,0.08)'; ctx.fill();
  }
  const fg = b.kind === 'primary' ? T.white : color;
  if (b.sub) {
    text(ctx, b.label, b.x + b.w / 2, b.y + b.h / 2 - 8, { size: b.size || 16, bold: true, color: fg, align: 'center' });
    text(ctx, b.sub, b.x + b.w / 2, b.y + b.h / 2 + 11, { size: 11, color: fg, align: 'center' });
  } else {
    text(ctx, b.label, b.x + b.w / 2, b.y + b.h / 2 + 0.5, { size: b.size || 16, bold: b.kind !== 'plain' || b.bold, color: fg, align: 'center' });
  }
  ctx.restore();
  if (!b.disabled) app.hot.push(b);
}

module.exports = { T, font, roundRect, text, wrap, paragraph, button };
