'use strict';
// 好友房的 WebSocket 连接。消息均为 JSON。
class Net {
  constructor(url, onMessage, onClose) {
    this.url = url;
    this.onMessage = onMessage;
    this.onClose = onClose;
    this.open = false;
    this.closed = false;
    this.queue = [];
    this.task = wx.connectSocket({ url, fail: () => this._down() });
    this.task.onOpen(() => {
      this.open = true;
      this.queue.forEach(m => this._raw(m));
      this.queue = [];
    });
    this.task.onMessage(res => {
      if (this.closed) return;
      let msg;
      try { msg = JSON.parse(res.data); } catch (e) { return; }
      this.onMessage(msg);
    });
    this.task.onClose(() => this._down());
    this.task.onError(() => this._down());
    this.beat = setInterval(() => this.send({ t: 'hb' }), 20000);
  }
  _raw(str) { this.task.send({ data: str }); }
  send(obj) {
    if (this.closed) return;
    const str = JSON.stringify(obj);
    if (this.open) this._raw(str); else this.queue.push(str);
  }
  _down() {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.beat);
    this.onClose();
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.beat);
    try { this.task.close({}); } catch (e) { /* 已断开 */ }
  }
}
module.exports = { Net };
