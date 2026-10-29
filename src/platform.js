"use strict";
(function (root) {
  var PM = root.PixelMow = root.PixelMow || {};
  var C = PM.Config;
  var isWx = typeof wx !== 'undefined' && typeof wx.createCanvas === 'function';
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
    try {
      var raw = isWx ? wx.getStorageSync('pixelMowProgress') : localStorage.getItem('pixelMowProgress');
      if (!raw) return { stars: [] };
      var data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      var normalized = PM.Rules.progress(data);
      if (JSON.stringify(data) !== JSON.stringify(normalized)) {
        try {
          if (!data || data.version !== 2) {
            var key = 'pixelMowProgress.beforeV2';
            if (isWx) { if (!wx.getStorageSync(key)) wx.setStorageSync(key, data); }
            else if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(data));
          }
          saveProgress(normalized);
        } catch (writeError) { /* 存储不可写时，仍使用已成功读取的数据。 */ }
      }
      return normalized;
    } catch (e) { return { stars: [] }; }
  }
  function saveProgress(data) {
    try {
      if (isWx) wx.setStorageSync('pixelMowProgress', data);
      else localStorage.setItem('pixelMowProgress', JSON.stringify(data));
    } catch (e) {}
  }
  PM.Platform = {
    isWx: isWx, setupCanvas: setupCanvas, logical: logical, beginFrame: beginFrame, now: now,
    canvas: function () { return canvas; }, ctx: function () { return ctx; },
    safeTop: function () { return safeTop; }, safeBottom: function () { return safeBottom; },
    loadProgress: loadProgress, saveProgress: saveProgress
  };
})(typeof GameGlobal !== 'undefined' ? GameGlobal : window);
