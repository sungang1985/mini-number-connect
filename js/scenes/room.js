'use strict';
const { T, text, button, paragraph } = require('../ui');

// 好友房等候页：房主等好友进来，或好友正在加入
class Room {
  constructor(app, o) {
    this.app = app;
    this.hosting = o.hosting;
    this.roomId = o.roomId || null;
    this.pairs = o.pairs;
    this.timed = o.timed;
  }
  touchStart() {}
  touchMove() {}
  touchEnd() {}

  draw(ctx, now) {
    const app = this.app, w = app.w, h = app.h;
    const cx = w / 2;
    let y = Math.max(app.capsule.bottom + 40, h * 0.17);
    text(ctx, '好友房', cx, y, { size: 26, bold: true, align: 'center' });
    y += 54;
    const dots = '.'.repeat(1 + Math.floor(now / 450) % 3);
    if (!this.hosting) {
      text(ctx, '正在加入房间 ' + this.roomId + ' ' + dots, cx, y, { size: 16, color: T.muted, align: 'center' });
    } else if (!this.roomId) {
      text(ctx, '正在开房 ' + dots, cx, y, { size: 16, color: T.muted, align: 'center' });
    } else {
      text(ctx, '房号', cx, y, { size: 13, color: T.muted, align: 'center' });
      y += 44;
      text(ctx, this.roomId.split('').join(' '), cx, y, { size: 44, bold: true, color: T.pens[0], align: 'center' });
      y += 50;
      text(ctx, '1 – ' + this.pairs + ' · ' + (this.timed ? '每手限时 60 秒' : '不限时，慢慢画'), cx, y, { size: 14, color: T.muted, align: 'center' });
      y += 26;
      text(ctx, '等好友进来就开局，谁先画随机决定 ' + dots, cx, y, { size: 14, color: T.muted, align: 'center' });
      y += 44;
      const bw = Math.min(300, w - 56);
      button(app, ctx, {
        key: 'invite', x: cx - bw / 2, y, w: bw, h: 52, kind: 'primary', color: T.pens[0], label: '发送邀请给微信好友',
        onTap: () => wx.shareAppMessage(app.shareInfo())
      });
      y += 70;
      const tipW = Math.min(300, w - 56);
      paragraph(ctx, '好友点开邀请卡片就会进入这张纸；也可以在首页“输入房号加入”。', cx - tipW / 2, y, tipW, { size: 12, color: T.faint });
    }
    const bw = 120;
    button(app, ctx, {
      key: 'cancel', x: cx - bw / 2, y: h - app.safeBottom - 76, w: bw, h: 44, kind: 'plain', color: T.muted, label: '取消',
      onTap: () => app.toMenu()
    });
  }
}
module.exports = { Room };
