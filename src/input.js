"use strict";
(function (root) {
  var PM = root.PixelMow = root.PixelMow || {}, P = PM.Platform, GP = PM.Gameplay, A = PM.Audio;
  var lastTapAt = -Infinity;
  var keys = Object.create(null);
  var joy = null, joyPointer = null;
  /* 键盘移动：WASD 与方向键等价；斜向由 gameplay 归一化，不额外加速。 */
  var MOVE_KEYS = { KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0],
    ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
  function inside(x, y, rect) { return rect && x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h; }
  function syncKeys() {
    var x = 0, y = 0;
    Object.keys(MOVE_KEYS).forEach(function (code) {
      if (!keys[code]) return;
      x += MOVE_KEYS[code][0]; y += MOVE_KEYS[code][1];
    });
    var len = Math.hypot(x, y);
    GP.setMove(len ? x / len : 0, len ? y / len : 0);
  }
  function startJoy(x, y) {
    joy = { active: true, ox: x, oy: y, x: 0, y: 0 };
    GP.state.joy = joy; GP.setMove(0, 0);
  }
  function moveJoy(x, y) {
    if (!joy) return;
    var dx = x - joy.ox, dy = y - joy.oy, len = Math.hypot(dx, dy), radius = 46;
    if (len < 8) { joy.x = joy.y = 0; GP.setMove(0, 0); return; }
    var clamped = Math.min(1, len / radius);
    joy.x = dx / len * clamped; joy.y = dy / len * clamped;
    GP.setMove(joy.x, joy.y);
  }
  function endJoy() {
    if (joy && GP.state.joy === joy) GP.state.joy = null;
    joy = null; joyPointer = null; GP.setMove(0, 0);
  }
  /* tap 返回 true 表示命中了 UI；未命中时把按下点交给摇杆，避免拖拽起始点被当成点击。 */
  function tap(x, y) {
    var tapAt = P.now(); if (tapAt - lastTapAt < 250) return false; lastTapAt = tapAt;
    var G = GP.state; A.unlock();
    if (G.state === 'meta') {
      var rows = G.ui.metaRows || [];
      for (var r = 0; r < rows.length; r++) if (inside(x, y, rows[r])) { GP.buyMeta(rows[r].id); return true; }
      if (inside(x, y, G.ui.metaBack)) GP.leaveMeta();
      return true;
    }
    if (G.state === 'menu') {
      var candidates = G.ui.candidates || [];
      for (var j = 0; j < candidates.length; j++) if (inside(x, y, candidates[j])) { GP.toggleCandidate(candidates[j].id); return true; }
      if (inside(x, y, G.ui.shop)) GP.openMeta(); else if (inside(x, y, G.ui.start)) GP.openLevelSelect();
      return true;
    }
    if (G.state === 'levelselect') {
      if (inside(x, y, G.ui.menu)) { GP.openMenu(); return true; }
      if (inside(x, y, G.ui.shop)) { GP.openMeta(); return true; }
      for (var l = 0; l < G.ui.levelButtons.length; l++) { var item = G.ui.levelButtons[l];
        if (inside(x, y, item) && item.unlocked) { GP.resetRun(item.index); return true; } }
      return false;
    }
    if (G.state === 'levelup') {
      if (G.refreshes > 0 && inside(x, y, G.ui.refresh)) { GP.refreshChoices(); return true; }
      for (var i = 0; i < G.ui.cards.length; i++) if (inside(x, y, G.ui.cards[i])) { GP.applyChoice(G.ui.cards[i].choice); return true; }
      return false;
    }
    if (G.state === 'over') { if (inside(x, y, G.ui.retry)) GP.resetRun(G.selectedLevel); else if (inside(x, y, G.ui.back)) GP.openLevelSelect(); return true; }
    if (G.state === 'cleared') {
      if (inside(x, y, G.ui.retry)) GP.resetRun(G.selectedLevel);
      else if (inside(x, y, G.ui.next) && GP.canContinue()) GP.resetRun(G.selectedLevel + 1);
      else if (inside(x, y, G.ui.back)) GP.openLevelSelect();
      return true;
    }
    if (G.state === 'playing') {
      if (G.paused) {
        if (inside(x, y, G.ui.resume)) GP.pause(false);
        else if (inside(x, y, G.ui.pauseBack)) { GP.pause(false); GP.openLevelSelect(); }
        return true;
      }
      if (inside(x, y, G.ui.pause)) { GP.pause(true); return true; }
      if (inside(x, y, G.ui.skillPrev)) { GP.changeSkillPage(-1); return true; }
      if (inside(x, y, G.ui.skillNext)) { GP.changeSkillPage(1); return true; }
      var slots = G.ui.skillSlots || [];
      for (var slot = 0; slot < slots.length; slot++) if (inside(x, y, slots[slot])) { GP.selectSkill(slots[slot].id); return true; }
    }
    return false;
  }
  function canDrag() { var G = GP.state; return G.state === 'playing' && !G.paused; }
  function bind() {
    var canvas = P.canvas();
    if (P.isWx) {
      wx.onTouchStart(function (event) { var touch = (event.touches && event.touches[0]) || (event.changedTouches && event.changedTouches[0]);
        if (!touch) return; var point = P.logical(touch.clientX, touch.clientY);
        if (tap(point.x, point.y)) return; if (canDrag()) startJoy(point.x, point.y); });
      if (wx.onTouchMove) wx.onTouchMove(function (event) { var touch = (event.touches && event.touches[0]) || (event.changedTouches && event.changedTouches[0]);
        if (!touch || !joy) return; var point = P.logical(touch.clientX, touch.clientY); moveJoy(point.x, point.y); });
      if (wx.onTouchEnd) wx.onTouchEnd(endJoy);
      if (wx.onTouchCancel) wx.onTouchCancel(endJoy);
    } else {
      canvas.addEventListener('pointerdown', function (event) {
        var point = P.logical(event.clientX, event.clientY, canvas.getBoundingClientRect());
        if (tap(point.x, point.y) || !canDrag()) return;
        joyPointer = event.pointerId; startJoy(point.x, point.y);
      });
      canvas.addEventListener('pointermove', function (event) {
        if (joyPointer === null || event.pointerId !== joyPointer) return;
        var point = P.logical(event.clientX, event.clientY, canvas.getBoundingClientRect()); moveJoy(point.x, point.y);
      });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (name) {
        canvas.addEventListener(name, function (event) { if (joyPointer !== null && event.pointerId === joyPointer) endJoy(); });
      });
      window.addEventListener('keydown', function (event) {
        var G = GP.state;
        if (MOVE_KEYS[event.code]) { event.preventDefault(); keys[event.code] = true; syncKeys(); return; }
        if (event.code === 'Space' && G.state === 'menu') { event.preventDefault(); A.unlock(); GP.openLevelSelect(); }
        else if ((event.key === 'p' || event.key === 'P') && G.state === 'playing') { GP.pause(!G.paused); endJoy(); }
        else if (event.key === 'm' || event.key === 'M') GP.toast(A.toggle() ? '已静音' : '声音开启', '#cdd6ee');
      });
      window.addEventListener('keyup', function (event) {
        if (!MOVE_KEYS[event.code]) return;
        event.preventDefault(); keys[event.code] = false; syncKeys();
      });
      window.addEventListener('blur', function () { keys = Object.create(null); syncKeys(); endJoy(); });
      window.addEventListener('resize', P.setupCanvas);
    }
  }
  PM.Input = { bind: bind, tap: tap, startJoy: startJoy, moveJoy: moveJoy, endJoy: endJoy };
})(typeof GameGlobal !== 'undefined' ? GameGlobal : window);
