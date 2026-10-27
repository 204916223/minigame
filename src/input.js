"use strict";
(function (root) {
  var PM = root.PixelMow = root.PixelMow || {}, P = PM.Platform, GP = PM.Gameplay, A = PM.Audio;
  var lastTapAt = -Infinity;
  function inside(x, y, rect) { return rect && x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h; }
  function tap(x, y) {
    var tapAt = P.now(); if (tapAt - lastTapAt < 250) return; lastTapAt = tapAt;
    var G = GP.state; A.unlock();
    if (G.state === 'menu') { if (inside(x, y, G.ui.start)) GP.openLevelSelect(); return; }
    if (G.state === 'levelselect') { for (var l = 0; l < G.ui.levelButtons.length; l++) { var item = G.ui.levelButtons[l];
      if (inside(x, y, item) && item.unlocked) { GP.resetRun(item.index); return; } } return; }
    if (G.state === 'levelup') {
      if (G.refreshes > 0 && inside(x, y, G.ui.refresh)) { GP.refreshChoices(); return; }
      for (var i = 0; i < G.ui.cards.length; i++) if (inside(x, y, G.ui.cards[i])) { GP.applyChoice(G.ui.cards[i].choice); return; }
      return;
    }
    if (G.state === 'over') { if (inside(x, y, G.ui.retry)) GP.resetRun(G.selectedLevel); else if (inside(x, y, G.ui.back)) GP.openLevelSelect(); return; }
    if (G.state === 'cleared') {
      if (inside(x, y, G.ui.retry)) GP.resetRun(G.selectedLevel);
      else if (inside(x, y, G.ui.next) && GP.canContinue()) GP.resetRun(G.selectedLevel + 1);
      else if (inside(x, y, G.ui.back)) GP.openLevelSelect(); return;
    }
    if (G.state === 'playing') {
      if (G.paused) {
        if (inside(x, y, G.ui.resume)) GP.pause(false);
        else if (inside(x, y, G.ui.pauseBack)) { GP.pause(false); GP.openLevelSelect(); }
        return;
      }
      if (inside(x, y, G.ui.pause)) GP.pause(true);
    }
  }
  function bind() {
    var canvas = P.canvas();
    if (P.isWx) wx.onTouchStart(function (event) { var touch = (event.touches && event.touches[0]) || (event.changedTouches && event.changedTouches[0]);
      if (touch) { var point = P.logical(touch.clientX, touch.clientY); tap(point.x, point.y); } });
    else {
      canvas.addEventListener('pointerdown', function (event) { var point = P.logical(event.clientX, event.clientY, canvas.getBoundingClientRect()); tap(point.x, point.y); });
      window.addEventListener('keydown', function (event) { var G = GP.state;
        if (event.code === 'Space' && G.state === 'menu') { event.preventDefault(); A.unlock(); GP.openLevelSelect(); }
        else if ((event.key === 'p' || event.key === 'P') && G.state === 'playing') GP.pause(!G.paused);
        else if (event.key === 'm' || event.key === 'M') GP.toast(A.toggle() ? '已静音' : '声音开启', '#cdd6ee');
      });
      window.addEventListener('resize', P.setupCanvas);
    }
  }
  PM.Input = { bind: bind, tap: tap };
})(typeof GameGlobal !== 'undefined' ? GameGlobal : window);
