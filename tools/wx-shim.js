// 网页预览用的 wx 兼容层：只实现本游戏用到的接口。
(function () {
  window.__NC_DEBUG__ = {};
  var MAX_W = 520; // 桌面浏览器里把画面限制成手机宽度
  var canvas = null;
  var first = true;
  function size() {
    return { w: Math.min(window.innerWidth, MAX_W), h: window.innerHeight };
  }
  function fit() {
    if (!canvas) return;
    var s = size();
    canvas.style.width = s.w + 'px';
    canvas.style.height = s.h + 'px';
  }
  var handlers = { start: [], move: [], end: [], cancel: [] };
  function fire(kind, ev) {
    var r = canvas.getBoundingClientRect();
    var t = { identifier: ev.pointerId, clientX: ev.clientX - r.left, clientY: ev.clientY - r.top };
    handlers[kind].forEach(function (fn) { fn({ changedTouches: [t], touches: [t] }); });
  }
  var resizeFns = [];
  window.addEventListener('resize', function () { fit(); resizeFns.forEach(function (f) { f(); }); });

  var query = {};
  location.search.replace(/^\?/, '').split('&').forEach(function (kv) {
    if (!kv) return;
    var p = kv.split('=');
    query[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || '');
  });

  window.wx = {
    createCanvas: function () {
      var c = document.createElement('canvas');
      if (first) {
        first = false;
        canvas = c;
        document.body.insertBefore(c, document.body.firstChild);
        fit();
        c.addEventListener('pointerdown', function (e) { try { c.setPointerCapture(e.pointerId); } catch (x) {} fire('start', e); e.preventDefault(); });
        c.addEventListener('pointermove', function (e) { if (e.buttons || e.pointerType === 'touch') fire('move', e); e.preventDefault(); });
        c.addEventListener('pointerup', function (e) { fire('end', e); e.preventDefault(); });
        c.addEventListener('pointercancel', function (e) { fire('cancel', e); });
        c.addEventListener('contextmenu', function (e) { e.preventDefault(); });
      }
      return c;
    },
    getWindowInfo: function () {
      var s = size();
      return { windowWidth: s.w, windowHeight: s.h, pixelRatio: window.devicePixelRatio || 1, safeArea: { top: 0, bottom: s.h } };
    },
    getSystemInfoSync: function () { return this.getWindowInfo(); },
    getMenuButtonBoundingClientRect: function () {
      var s = size();
      return { top: 10, bottom: 42, left: s.w - 8, right: s.w - 8, width: 0, height: 32 };
    },
    onTouchStart: function (f) { handlers.start.push(f); },
    onTouchMove: function (f) { handlers.move.push(f); },
    onTouchEnd: function (f) { handlers.end.push(f); },
    onTouchCancel: function (f) { handlers.cancel.push(f); },
    onWindowResize: function (f) { resizeFns.push(f); },
    getStorageSync: function (k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    setStorageSync: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    setKeepScreenOn: function () {},
    showShareMenu: function () {},
    onShareAppMessage: function () {},
    vibrateShort: function () { try { navigator.vibrate && navigator.vibrate(15); } catch (e) {} },
    getLaunchOptionsSync: function () { return { query: query }; },
    onShow: function () {},
    shareAppMessage: function (o) {
      var url = location.origin + location.pathname + '?' + o.query;
      var el = document.getElementById('nc-share');
      el.textContent = '（预览）把这个链接发给好友：' + url;
      el.style.display = 'block';
      window.__ncShareUrl = url;
      setTimeout(function () { el.style.display = 'none'; }, 12000);
    },
    showModal: function (o) {
      setTimeout(function () {
        var res;
        if (o.editable) {
          var v = window.prompt(o.title + (o.placeholderText ? '（' + o.placeholderText + '）' : ''), '');
          res = { confirm: v !== null, cancel: v === null, content: v || '' };
        } else {
          // 网页里自己画一个确认框（部分内嵌环境不支持 confirm）
          var mask = document.createElement('div');
          mask.id = 'nc-modal';
          var box = document.createElement('div');
          var h = document.createElement('b'); h.textContent = o.title || '';
          var c = document.createElement('p'); c.textContent = o.content || '';
          var no = document.createElement('button'); no.id = 'nc-modal-cancel'; no.textContent = o.cancelText || '取消';
          var yes = document.createElement('button'); yes.id = 'nc-modal-ok'; yes.textContent = o.confirmText || '确定';
          var row = document.createElement('div');
          row.appendChild(no); row.appendChild(yes);
          box.appendChild(h); box.appendChild(c); box.appendChild(row); mask.appendChild(box);
          document.body.appendChild(mask);
          var done = function (ok) { mask.remove(); o.success && o.success({ confirm: ok, cancel: !ok }); };
          no.onclick = function () { done(false); };
          yes.onclick = function () { done(true); };
          return;
        }
        o.success && o.success(res);
      }, 0);
    },
    connectSocket: function (o) {
      var cb = {};
      var ws;
      try { ws = new WebSocket(o.url); } catch (e) { setTimeout(function () { o.fail && o.fail(e); }, 0); }
      if (ws) {
        ws.onopen = function () { cb.open && cb.open(); };
        ws.onmessage = function (e) { cb.message && cb.message({ data: e.data }); };
        ws.onclose = function () { cb.close && cb.close(); };
        ws.onerror = function () { cb.error && cb.error(); };
      }
      return {
        onOpen: function (f) { cb.open = f; }, onMessage: function (f) { cb.message = f; },
        onClose: function (f) { cb.close = f; }, onError: function (f) { cb.error = f; },
        send: function (m) { ws && ws.readyState === 1 && ws.send(m.data); },
        close: function () { ws && ws.close(); }
      };
    }
  };
})();
