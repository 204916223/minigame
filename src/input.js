"use strict";
(function (root) {
  var PM = root.PixelMow = root.PixelMow || {}, P = PM.Platform, GP = PM.Gameplay, A = PM.Audio;
  var lastTapAt = -Infinity;
  function inside(x, y, rect) { return rect && x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h; }
  function tap(x, y) {
    var tapAt = P.now(); if (tapAt - lastTapAt < 250) return; lastTapAt = tapAt;
    var G = GP.state; A.unlock();
    if (G.speedUnlockOpen && G.state === 'playing') {
      if (inside(x, y, G.ui.speedBuy)) GP.buyDoubleSpeed();
      else if (inside(x, y, G.ui.speedCancel)) GP.closeSpeedUnlock();
      return;
    }
    if (G.state === 'levelselect' || G.state === 'endlessselect') {
      if (G.pageTurn && G.pageTurn.time > 0) return;
      if (inside(x, y, G.ui.selectPrev)) { GP.changeSelectionPage(-1); return; }
      if (inside(x, y, G.ui.selectNext)) { GP.changeSelectionPage(1); return; }
    }
    if (G.state === 'meta') {
      if (G.metaResetOpen) {
        if (inside(x, y, G.ui.metaResetConfirm)) GP.resetMeta();
        else if (inside(x, y, G.ui.metaResetCancel)) GP.closeMetaReset();
        return;
      }
      var rows = G.ui.metaRows || [];
      for (var r = 0; r < rows.length; r++) if (inside(x, y, rows[r])) { GP.buyMeta(rows[r].id); return; }
      if (inside(x, y, G.ui.metaBack)) GP.leaveMeta();
      else if (inside(x, y, G.ui.metaReset)) GP.openMetaReset();
      return;
    }
    if (G.state === 'menu') {
      if (G.loadoutOpen) {
        if (inside(x, y, G.ui.loadoutDone)) { G.loadoutOpen = false; return; }
        var candidates = G.ui.candidates || [];
        for (var j = 0; j < candidates.length; j++) if (inside(x, y, candidates[j])) { GP.toggleCandidate(candidates[j].id); return; }
        return;
      }
      if (inside(x, y, G.ui.heroPrev)) GP.changeCharacter(-1);
      else if (inside(x, y, G.ui.heroNext)) GP.changeCharacter(1);
      else if (inside(x, y, G.ui.loadout)) G.loadoutOpen = true;
      else if (inside(x, y, G.ui.shop)) GP.openMeta();
      else if (inside(x, y, G.ui.start)) GP.openLevelSelect();
      return;
    }
    if (G.state === 'endlessselect') {
      if (inside(x, y, G.ui.menu)) GP.openMenu();
      else if (inside(x, y, G.ui.shop)) GP.openMeta();
      else if (inside(x, y, G.ui.endlessStart)) GP.resetRun(-1);
      return;
    }
    if (G.state === 'levelselect') {
      if (inside(x, y, G.ui.menu)) { GP.openMenu(); return; }
      if (inside(x, y, G.ui.shop)) { GP.openMeta(); return; }
      for (var l = 0; l < G.ui.levelButtons.length; l++) { var item = G.ui.levelButtons[l];
        if (inside(x, y, item) && item.unlocked) { GP.resetRun(item.index); return; } }
      return;
    }
    if (G.state === 'levelup') {
      if (G.refreshes > 0 && inside(x, y, G.ui.refresh)) { GP.refreshChoices(); return; }
      for (var i = 0; i < G.ui.cards.length; i++) if (inside(x, y, G.ui.cards[i])) { GP.applyChoice(G.ui.cards[i].choice); return; }
      return;
    }
    if (G.state === 'over') { if (inside(x, y, G.ui.retry)) GP.resetRun(G.selectedLevel); else if (inside(x, y, G.ui.back)) GP.returnToSelection(); return; }
    if (G.state === 'cleared') {
      if (inside(x, y, G.ui.retry)) GP.resetRun(G.selectedLevel);
      else if (inside(x, y, G.ui.next) && GP.canContinue()) GP.resetRun(G.selectedLevel + 1);
      else if (inside(x, y, G.ui.back)) GP.openLevelSelect(); return;
    }
    if (G.state === 'playing') {
      if (G.paused) {
        if (inside(x, y, G.ui.resume)) GP.pause(false);
        else if (inside(x, y, G.ui.pauseBack)) { GP.pause(false); GP.returnToSelection(); }
        return;
      }
      if (inside(x, y, G.ui.pause)) { GP.pause(true); return; }
      if (inside(x, y, G.ui.speed)) { GP.toggleBattleSpeed(); return; }
      if (inside(x, y, G.ui.skillPrev)) { GP.changeSkillPage(-1); return; }
      if (inside(x, y, G.ui.skillNext)) { GP.changeSkillPage(1); return; }
      var slots = G.ui.skillSlots || [];
      for (var slot = 0; slot < slots.length; slot++) if (inside(x, y, slots[slot])) { GP.selectSkill(slots[slot].id); return; }
    }
  }
  function bind() {
    var canvas = P.canvas();
    if (P.isWx) wx.onTouchStart(function (event) { var touch = (event.touches && event.touches[0]) || (event.changedTouches && event.changedTouches[0]);
      if (touch) { var point = P.logical(touch.clientX, touch.clientY); tap(point.x, point.y); } });
    else {
      canvas.addEventListener('pointerdown', function (event) { var point = P.logical(event.clientX, event.clientY, canvas.getBoundingClientRect()); tap(point.x, point.y); });
      window.addEventListener('keydown', function (event) { var G = GP.state;
        if (event.code === 'Space' && G.state === 'menu' && !G.loadoutOpen) { event.preventDefault(); A.unlock(); GP.openLevelSelect(); }
        else if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && (G.state === 'levelselect' || G.state === 'endlessselect')) {
          event.preventDefault(); GP.changeSelectionPage(event.key === 'ArrowLeft' ? -1 : 1);
        }
        else if ((event.key === 'p' || event.key === 'P') && G.state === 'playing') GP.pause(!G.paused);
        else if (event.key === 'm' || event.key === 'M') GP.toast(A.toggle() ? '已静音' : '声音开启', '#cdd6ee');
      });
      window.addEventListener('resize', P.setupCanvas);
    }
  }
  PM.Input = { bind: bind, tap: tap };
})(typeof GameGlobal !== 'undefined' ? GameGlobal : window);
