"use strict";
(function () {
  var isWx = typeof wx !== 'undefined' && typeof wx.createCanvas === 'function';
  if (isWx) {
    require('./src/config.js'); require('./src/rules.js'); require('./src/combat.js'); require('./src/platform.js'); require('./src/audio.js');
    require('./src/gameplay.js'); require('./src/renderer.js'); require('./src/input.js');
  }
  var root = typeof GameGlobal !== 'undefined' ? GameGlobal : window;
  var PM = root.PixelMow, P = PM.Platform, GP = PM.Gameplay;
  P.setupCanvas(); PM.Input.bind(); GP.state.last = P.now();
  function loop() {
    var current = P.now(), dt = (current - GP.state.last) / 1000; GP.state.last = current;
    dt = Math.max(0, Math.min(0.05, dt));
    if (GP.state.state === 'playing' && !GP.state.paused) GP.update(dt);
    PM.Renderer.render(dt); requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
