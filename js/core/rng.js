'use strict';
// mulberry32：纯整数运算的种子随机数，同一种子在任何设备上给出同一序列。
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function randomSeed() { return (Math.floor(Math.random() * 0x7fffffff) + 1) >>> 0; }
module.exports = { makeRng, randomSeed };
