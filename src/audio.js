"use strict";
(function (root) {
  var PM = root.PixelMow = root.PixelMow || {}, P = PM.Platform;
  var ac = null, muted = false;
  function ensure() {
    if (!ac) {
      try {
        if (P.isWx && wx.createWebAudioContext) ac = wx.createWebAudioContext();
        else if (!P.isWx) ac = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) { ac = null; }
    }
    return ac;
  }
  function unlock() {
    var a = ensure();
    if (a && a.state === 'suspended' && a.resume) {
      try { var promise = a.resume(); if (promise && promise.catch) promise.catch(function () {}); } catch (e) {}
    }
  }
  function tone(f, d, type, gain, slide) {
    if (muted) return;
    var a = ensure(); if (!a || a.state === 'suspended') return;
    try {
      var t = a.currentTime, o = a.createOscillator(), v = a.createGain();
      o.type = type || 'square'; o.frequency.setValueAtTime(f, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d);
      v.gain.setValueAtTime(0.0001, t); v.gain.exponentialRampToValueAtTime(gain || 0.05, t + 0.005);
      v.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(v); v.connect(a.destination);
      o.start(t); o.stop(t + d + 0.02); o.onended = function () { try { o.disconnect(); v.disconnect(); } catch (e) {} };
    } catch (e) {}
  }
  PM.Audio = {
    unlock: unlock,
    toggle: function () { muted = !muted; return muted; },
    shoot: function () { tone(660, 0.06, 'square', 0.03, -240); },
    hit: function () { tone(220, 0.05, 'square', 0.02, -60); },
    boom: function () { tone(120, 0.18, 'sawtooth', 0.05, -70); },
    hurt: function () { tone(140, 0.18, 'sawtooth', 0.06, -90); },
    level: function () { [523, 659, 784].forEach(function (f, i) { setTimeout(function () { tone(f, 0.12, 'triangle', 0.05); }, i * 70); }); },
    pick: function () { tone(880, 0.08, 'triangle', 0.05, 220); },
    clear: function () { [523, 659, 784, 1046].forEach(function (f, i) { setTimeout(function () { tone(f, 0.14, 'triangle', 0.05); }, i * 65); }); },
    alarm: function () { tone(330, 0.22, 'square', 0.05, 110); },
    fail: function () { tone(190, 0.4, 'sawtooth', 0.07, -140); }
  };
})(typeof GameGlobal !== 'undefined' ? GameGlobal : window);
