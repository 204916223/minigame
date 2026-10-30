"use strict";
(function (root) {
  var PM = root.PixelMow = root.PixelMow || {};
  var C = PM.Config;
  var isWx = typeof wx !== 'undefined' && typeof wx.createCanvas === 'function';
  // 本次清档使用独立空间，仍打开的旧版页面只能写旧键，不能覆盖新进度。
  // 后续普通发布保持此键不变；再次改键意味着再次清档。
  var SAVE_KEY = 'pixelMowProgress.v3';
  var canvas, ctx, viewW, viewH, scale = 1, offX = 0, offY = 0, inputX = 1, inputY = 1;
  var safeTop = 0, safeBottom = C.height;

  function setupCanvas() {
    if (isWx) {
      canvas = canvas || wx.createCanvas();
      var info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      viewW = canvas.width; viewH = canvas.height;
      inputX = viewW / (info.windowWidth || viewW);
      inputY = viewH / (info.windowHeight || viewH);
      scale = Math.min(viewW / C.width, viewH / C.height);
      offX = (viewW - C.width * scale) / 2; offY = (viewH - C.height * scale) / 2;
      var area = info.safeArea || { top: 0, bottom: info.windowHeight || viewH };
      safeTop = Math.max(0, (area.top * inputY - offY) / scale);
      safeBottom = Math.min(C.height, (area.bottom * inputY - offY) / scale);
    } else {
      // 浏览器工具栏展开/收起时，使用实际可见高度，CSS 再扣除硬件安全区和边距。
      if (window.visualViewport && document.documentElement) {
        document.documentElement.style.setProperty('--viewport-height', window.visualViewport.height + 'px');
      }
      canvas = document.getElementById('game');
      var rect = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      viewW = canvas.width; viewH = canvas.height;
      inputX = viewW / rect.width; inputY = viewH / rect.height;
      scale = Math.min(viewW / C.width, viewH / C.height);
      offX = (viewW - C.width * scale) / 2; offY = (viewH - C.height * scale) / 2;
      safeTop = 0; safeBottom = C.height;
    }
    ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
  }
  function logical(clientX, clientY, rect) {
    var x = clientX, y = clientY;
    if (rect) { x -= rect.left; y -= rect.top; }
    return { x: (x * inputX - offX) / scale, y: (y * inputY - offY) / scale };
  }
  function beginFrame() {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#05070d'; ctx.fillRect(0, 0, viewW, viewH);
    ctx.setTransform(scale, 0, 0, scale, offX, offY);
  }
  function now() { return isWx ? Date.now() : performance.now(); }
  function loadProgress() {
    ['pixelMowProgress', 'pixelMowProgress.beforeV2'].forEach(function (key) {
      try {
        if (isWx) wx.removeStorageSync(key);
        else localStorage.removeItem(key);
      } catch (e) { /* 删除失败也不读取旧档，新旧存档空间完全隔离。 */ }
    });
    var data;
    try {
      var raw = isWx ? wx.getStorageSync(SAVE_KEY) : localStorage.getItem(SAVE_KEY);
      data = typeof raw === 'string' && raw ? JSON.parse(raw) : raw;
    } catch (e) { data = null; }
    var normalized = PM.Rules.progress(data);
    if (JSON.stringify(data) !== JSON.stringify(normalized)) saveProgress(normalized);
    return normalized;
  }
  function saveProgress(data) {
    try {
      if (isWx) wx.setStorageSync(SAVE_KEY, data);
      else localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (e) {}
  }
  PM.Platform = {
    isWx: isWx, setupCanvas: setupCanvas, logical: logical, beginFrame: beginFrame, now: now,
    canvas: function () { return canvas; }, ctx: function () { return ctx; },
    safeTop: function () { return safeTop; }, safeBottom: function () { return safeBottom; },
    loadProgress: loadProgress, saveProgress: saveProgress
  };
})(typeof GameGlobal !== 'undefined' ? GameGlobal : window);
