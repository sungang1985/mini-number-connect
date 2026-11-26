'use strict';
// 生成单文件网页版（只有同屏对画，不含联机）：dist/index.html
const fs = require('fs');
const path = require('path');
const { page } = require('./web');
const out = path.join(__dirname, '..', 'dist');
fs.mkdirSync(out, { recursive: true });
// --fragment：不带 <html>/<head> 外壳，供嵌入别的页面
fs.writeFileSync(path.join(out, 'index.html'), page({ inline: true, fragment: process.argv.includes('--fragment') }));
console.log('已生成 dist/index.html');
