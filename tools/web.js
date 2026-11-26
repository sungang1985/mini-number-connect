'use strict';
// 浏览器预览用：把小游戏代码打成一个脚本，并用一层很薄的 wx 兼容层跑在网页里。
// 只用于开发时预览和自动化测试，不属于小游戏包。
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// 极简 CommonJS 打包：从 game.js 出发，递归收集相对路径的 require
function bundle() {
  const mods = {};
  const visit = (file) => {
    const id = path.relative(ROOT, file).split(path.sep).join('/');
    if (mods[id]) return id;
    mods[id] = true;
    const src = fs.readFileSync(file, 'utf8');
    const out = src.replace(/require\(\s*'(\.[^']+)'\s*\)/g, (_, rel) => {
      let target = path.resolve(path.dirname(file), rel);
      if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) target += '.js';
      return "__req('" + visit(target) + "')";
    });
    mods[id] = out;
    return id;
  };
  const entry = visit(path.join(ROOT, 'game.js'));
  let js = '(function(){var __defs={},__cache={};function __req(id){if(__cache[id])return __cache[id].exports;var m=__cache[id]={exports:{}};__defs[id](m,m.exports);return m.exports;}\n';
  for (const id in mods) js += '__defs[' + JSON.stringify(id) + ']=function(module,exports){\n' + mods[id] + '\n};\n';
  js += '__req(' + JSON.stringify(entry) + ');})();';
  return js;
}

const SHIM = fs.readFileSync(path.join(__dirname, 'wx-shim.js'), 'utf8');

function page(opts) {
  opts = opts || {};
  const script = (body) => '<script>' + body.replace(/<\/script/g, '<\\/script') + '</script>';
  return [
    opts.fragment ? '' : '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">',
    opts.fragment ? '' : '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">',
    '<title>数字连连看</title>',
    '<style>html,body{margin:0;height:100%;background:#e8e3d7;overflow:hidden;overscroll-behavior:none}',
    'canvas{display:block;margin:0 auto;touch-action:none;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}',
    '#nc-share{position:fixed;left:12px;right:12px;top:56px;pointer-events:none;padding:10px 12px;border-radius:10px;background:#2a3036;color:#fff;font:13px/1.5 sans-serif;word-break:break-all;display:none}',
    '#nc-modal{position:fixed;inset:0;background:rgba(42,48,54,.45);display:flex;align-items:center;justify-content:center;font:15px/1.5 "PingFang SC","Microsoft YaHei",sans-serif;color:#2a3036}',
    '#nc-modal>div{background:#fdfbf5;border-radius:14px;padding:20px;width:min(280px,calc(100% - 64px))}',
    '#nc-modal b{font-size:17px}#nc-modal p{margin:8px 0 18px;color:#7d827f}#nc-modal div div{display:flex;gap:10px}',
    '#nc-modal button{flex:1;height:42px;border-radius:10px;border:1px solid #2a3036;background:#fdfbf5;color:#2a3036;font:inherit;font-weight:bold}',
    '#nc-modal #nc-modal-ok{background:#2a3036;color:#fff}',
    '</style>' + (opts.fragment ? '' : '</head><body>') + '<div id="nc-share"></div>',
    script('window.__NC_SERVER__=' + (opts.serverExpr || '""') + ';'),
    script(SHIM),
    opts.inline ? script(bundle()) : '<script src="/game.bundle.js"></script>',
    opts.fragment ? '' : '</body></html>'
  ].join('\n');
}

module.exports = { bundle, page };
