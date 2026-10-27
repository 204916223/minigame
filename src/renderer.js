"use strict";
(function (root) {
  var PM = root.PixelMow = root.PixelMow || {}, C = PM.Config, P = PM.Platform, GP = PM.Gameplay;
  var gridOffset = 0;
  function ctx() { return P.ctx(); }
  function rounded(x, y, w, h, r) { var c = ctx(); r = Math.min(r, w / 2, h / 2); c.beginPath(); c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function text(value, x, y, size, color, align, baseline, weight) { var c = ctx(); c.font = (weight || '') + ' ' + size + 'px "PingFang SC","Microsoft YaHei",sans-serif';
    c.fillStyle = color; c.textAlign = align || 'left'; c.textBaseline = baseline || 'alphabetic'; c.fillText(value, x, y); }
  function button(rect, label, color, textColor) { var c = ctx(); rounded(rect.x, rect.y, rect.w, rect.h, 12); c.fillStyle = color; c.fill();
    text(label, rect.x + rect.w / 2, rect.y + rect.h / 2 + 1, 18, textColor || '#05121c', 'center', 'middle', 'bold'); }
  function bar(x, y, w, h, fraction, fill, label) { var c = ctx(); rounded(x, y, w, h, h / 2); c.fillStyle = 'rgba(11,18,36,.88)'; c.fill(); c.strokeStyle = '#2a3454'; c.lineWidth = 1; c.stroke();
    if (fraction > 0) { c.save(); rounded(x, y, w, h, h / 2); c.clip(); c.fillStyle = fill; c.fillRect(x, y, w * Math.min(1, fraction), h); c.restore(); }
    if (label) text(label, x + w / 2, y + h / 2 + 0.5, 10, '#fff', 'center', 'middle', 'bold'); }
  function sprite(pattern, x, y, cell) { var c = ctx(), palette = C.palette, ox = x - pattern[0].length * cell / 2, oy = y - pattern.length * cell / 2;
    for (var r = 0; r < pattern.length; r++) for (var col = 0; col < pattern[r].length; col++) { var color = palette[pattern[r][col]];
      if (color) { c.fillStyle = color; c.fillRect((ox + col * cell) | 0, (oy + r * cell) | 0, cell, cell); } } }
  function background(dt) { var c = ctx(); c.fillStyle = '#070a12'; c.fillRect(-20, -20, C.width + 40, C.height + 40); gridOffset = (gridOffset + dt * 40) % 40;
    c.strokeStyle = 'rgba(60,80,130,.10)'; c.lineWidth = 1;
    for (var x = 0; x < C.width; x += 40) { c.beginPath(); c.moveTo(x + .5, 0); c.lineTo(x + .5, C.height); c.stroke(); }
    for (var y = -40 + gridOffset; y < C.height; y += 40) { c.beginPath(); c.moveTo(0, y + .5); c.lineTo(C.width, y + .5); c.stroke(); } }
  function battlefield() { var c = ctx(), G = GP.state, danger = GP.dangerY();
    c.fillStyle = 'rgba(255,93,108,.18)'; c.fillRect(0, danger - 12, C.width, 14); c.fillStyle = 'rgba(255,93,108,.55)'; c.fillRect(0, danger, C.width, 2);
    G.booms.forEach(function (b) { var k = b.age / b.life, radius = b.r * (.5 + k * .9); c.globalAlpha = (1 - k) * .85; c.strokeStyle = '#ffcf6b'; c.lineWidth = 4;
      c.beginPath(); c.arc(b.x, b.y, radius, 0, Math.PI * 2); c.stroke(); }); c.globalAlpha = 1;
    G.bullets.forEach(function (b) { c.fillStyle = b.boom ? '#ffcf6b' : '#bff4ff'; c.fillRect((b.x - b.r) | 0, (b.y - b.r) | 0, b.r * 2, b.r * 2); });
    G.enemies.forEach(function (e) { sprite(C.sprites[e.spr], e.x, e.y, e.cell); if (e.flash > 0) { c.globalAlpha = e.flash * .8; c.fillStyle = '#fff'; c.fillRect(e.x - e.r, e.y - e.r, e.r * 2, e.r * 2); c.globalAlpha = 1; }
      if (e.hp < e.maxhp) { var w = e.r * 2; c.fillStyle = '#0b1224'; c.fillRect(e.x - w / 2, e.y - e.r - 7, w, 3); c.fillStyle = '#ff5d6c'; c.fillRect(e.x - w / 2, e.y - e.r - 7, w * Math.max(0, e.hp / e.maxhp), 3); } });
    sprite(C.sprites.hero, C.hero.x, C.hero.y, 4); c.strokeStyle = 'rgba(143,233,255,.5)'; c.lineWidth = 2; c.beginPath(); c.moveTo(C.hero.x, C.hero.y - 14);
    c.lineTo(C.hero.x + Math.cos(G.player.aim || -Math.PI / 2) * 14, C.hero.y - 14 + Math.sin(G.player.aim || -Math.PI / 2) * 14); c.stroke();
    G.parts.forEach(function (p) { c.globalAlpha = 1 - p.age / p.life; c.fillStyle = p.color; c.fillRect(p.x | 0, p.y | 0, p.size, p.size); }); c.globalAlpha = 1;
    G.floaters.forEach(function (f) { c.globalAlpha = 1 - f.age / f.life; text(f.text, f.x, f.y, 12, f.color, 'center', 'middle', 'bold'); }); c.globalAlpha = 1;
    if (G.damageFlash > 0) { c.fillStyle = 'rgba(255,40,60,' + G.damageFlash * .28 + ')'; c.fillRect(0, 0, C.width, C.height); }
  }
  function hud() { var c = ctx(), G = GP.state, top = Math.max(8, P.safeTop() + 6), w = GP.waveConfig();
    bar(10, top, C.width - 20, 15, G.player.hp / G.player.maxhp, '#ff5d6c', 'HP ' + Math.ceil(G.player.hp) + ' / ' + G.player.maxhp);
    bar(10, top + 18, C.width - 20, 9, G.player.xp / G.player.xpv, '#7cff6b', '');
    text('Lv.' + G.player.lvl, 10, top + 43, 12, '#ffd166', 'left', 'middle', 'bold');
    var waveText = GP.isBossActive() ? '第 ' + (G.waveIndex + 1) + '/' + C.waveCount + ' 波  首领战' : '第 ' + (G.waveIndex + 1) + '/' + C.waveCount + ' 波  击杀 ' + G.waveKills + '/' + w.kills;
    text(waveText, 58, top + 43, 12, '#cdd6ee', 'left', 'middle', 'bold');
    text(formatTime(G.time), C.width - 55, top + 43, 12, '#8b95b3', 'right', 'middle');
    G.ui.pause = { x: C.width - 42, y: top + 30, w: 32, h: 26 }; rounded(G.ui.pause.x, G.ui.pause.y, 32, 26, 6); c.fillStyle = 'rgba(17,26,48,.9)'; c.fill(); c.strokeStyle = '#33456f'; c.stroke();
    c.fillStyle = '#cdd6ee'; c.fillRect(G.ui.pause.x + 10, G.ui.pause.y + 7, 3, 12); c.fillRect(G.ui.pause.x + 18, G.ui.pause.y + 7, 3, 12);
  }
  function skills() { var c = ctx(), G = GP.state, size = 46, gap = 6, y = Math.min(C.height - size - 12, P.safeBottom() - size - 8);
    for (var i = 0; i < C.totalSlots; i++) { var x = 10 + i * (size + gap), id = i ? G.skillOrder[i - 1] : null; rounded(x, y, size, size, 10); c.fillStyle = 'rgba(14,21,38,.88)'; c.fill(); c.strokeStyle = i === 0 ? '#3f7fb0' : '#2c3a60'; c.lineWidth = 2; c.stroke();
      if (i === 0) { text('⊕', x + 23, y + 23, 24, '#8fe9ff', 'center', 'middle', 'bold'); var fraction = Math.max(0, Math.min(1, G.player.cd / G.player.cdBase));
        if (fraction > 0) { c.save(); rounded(x, y, size, size, 10); c.clip(); c.beginPath(); c.moveTo(x + 23, y + 23); c.arc(x + 23, y + 23, size, -Math.PI / 2, -Math.PI / 2 + fraction * Math.PI * 2); c.closePath(); c.fillStyle = 'rgba(4,8,16,.72)'; c.fill(); c.restore(); }
        if (G.player.cd > 1) text((G.player.cd / 1000).toFixed(1), x + 23, y + 24, 14, '#fff', 'center', 'middle', 'bold');
      } else if (id) { var skill = C.skills.filter(function (item) { return item.id === id; })[0]; text(skill.icon, x + 23, y + 23, 24, skill.color, 'center', 'middle', 'bold'); text(String(G.skills[id]), x + 40, y + 40, 11, '#ffd166', 'right', 'bottom', 'bold'); }
      else text('+', x + 23, y + 23, 22, '#33456f', 'center', 'middle', 'bold');
    }
  }
  function menu() { var c = ctx(), G = GP.state; c.fillStyle = 'rgba(6,9,17,.9)'; c.fillRect(0, 0, C.width, C.height);
    text('像素割草', C.width / 2, 155, 40, '#5ad1ff', 'center', 'middle', 'bold'); text('关卡制 · 每关十波 · 自动索敌', C.width / 2, 220, 15, '#8b95b3', 'center', 'middle');
    text('守住阵地，保留更多生命赢取星星', C.width / 2, 248, 14, '#8b95b3', 'center', 'middle');
    G.ui.start = { x: 150, y: 390, w: 180, h: 54 }; button(G.ui.start, '选 择 关 卡', '#33b3e6');
  }
  function drawStars(x, y, stars, flawless, size) { var c = ctx(), gap = size + 12, start = x - gap;
    for (var i = 0; i < 3; i++) { if (flawless) { c.strokeStyle = '#fff3a3'; c.lineWidth = 3; rounded(start + i * gap - size / 2 - 5, y - size / 2 - 5, size + 10, size + 10, 8); c.stroke(); }
      text('★', start + i * gap, y, size, i < stars ? '#ffd166' : '#26324f', 'center', 'middle', 'bold'); }
  }
  function levelSelect() { var c = ctx(), G = GP.state; c.fillStyle = '#070a12'; c.fillRect(0, 0, C.width, C.height); text('选 择 关 卡', C.width / 2, 72, 26, '#e8ecf7', 'center', 'middle', 'bold');
    G.ui.levelButtons = []; C.levels.forEach(function (level, i) { var unlocked = GP.isLevelUnlocked(i), y = 105 + i * 82, rect = { x: 55, y: y, w: 370, h: 66, index: i, unlocked: unlocked }; G.ui.levelButtons.push(rect);
      rounded(rect.x, rect.y, rect.w, rect.h, 12); c.fillStyle = unlocked ? '#16203a' : '#0c111e'; c.fill(); c.strokeStyle = unlocked ? '#33456f' : '#20283b'; c.stroke();
      text((i + 1) + '. ' + level.name, rect.x + 18, y + 24, 16, unlocked ? '#fff' : '#596176', 'left', 'middle', 'bold');
      if (unlocked) drawStars(rect.x + 275, y + 35, G.progress.stars[i] || 0, !!G.progress.flawless[i], 22); else text('🔒', rect.x + 330, y + 33, 20, '#596176', 'center', 'middle');
    });
  }
  function levelUp() { var c = ctx(), G = GP.state; c.fillStyle = 'rgba(6,9,17,.84)'; c.fillRect(0, 0, C.width, C.height); text('升 级 ！ 三 选 一', C.width / 2, 118, 22, '#ffd166', 'center', 'middle', 'bold');
    G.ui.cards = G.choices.map(function (choice, i) { var rect = { x: 80, y: 155 + i * 98, w: 320, h: 84, choice: choice }, skill = choice.skill, next = choice.level + 1;
      rounded(rect.x, rect.y, rect.w, rect.h, 12); c.fillStyle = '#16203a'; c.fill(); c.strokeStyle = '#33456f'; c.stroke();
      text(skill.icon, rect.x + 34, rect.y + 42, 24, skill.color, 'center', 'middle', 'bold'); text(skill.name + '  Lv.' + next, rect.x + 66, rect.y + 27, 16, '#fff', 'left', 'middle', 'bold');
      text(skill.describe(next), rect.x + 66, rect.y + 56, 12, '#aeb8d2', 'left', 'middle'); return rect; });
    if (G.pendingLevelUps > 1) text('还有 ' + (G.pendingLevelUps - 1) + ' 次升级待选择', C.width / 2, 470, 13, '#8fe9ff', 'center', 'middle');
  }
  function intermission() { var c = ctx(), G = GP.state, seconds = Math.max(1, Math.ceil(G.intermission)); c.fillStyle = 'rgba(6,9,17,.7)'; c.fillRect(0, 0, C.width, C.height);
    text('第 ' + (G.waveIndex + 1) + ' 波清除', C.width / 2, 260, 28, '#7cff6b', 'center', 'middle', 'bold'); text(seconds + ' 秒后进入第 ' + (G.waveIndex + 2) + ' 波', C.width / 2, 312, 18, '#e8ecf7', 'center', 'middle'); }
  function pause() { var c = ctx(), G = GP.state; c.fillStyle = 'rgba(6,9,17,.74)'; c.fillRect(0, 0, C.width, C.height); text('已 暂 停', C.width / 2, 260, 28, '#e8ecf7', 'center', 'middle', 'bold');
    G.ui.resume = { x: 160, y: 315, w: 160, h: 50 }; button(G.ui.resume, '继 续', '#33b3e6');
    G.ui.pauseBack = { x: 160, y: 382, w: 160, h: 46 }; button(G.ui.pauseBack, '返回选关', '#26324f', '#cdd6ee'); }
  function over() { var c = ctx(), G = GP.state; c.fillStyle = 'rgba(6,9,17,.88)'; c.fillRect(0, 0, C.width, C.height); text('阵 地 失 守', C.width / 2, 190, 34, '#ff5d6c', 'center', 'middle', 'bold');
    text('第 ' + (G.waveIndex + 1) + ' 波 · 击杀 ' + G.player.kills, C.width / 2, 255, 16, '#e8ecf7', 'center', 'middle');
    G.ui.retry = { x: 150, y: 345, w: 180, h: 52 }; button(G.ui.retry, '重 试 本 关', '#e6495a', '#2a0308'); G.ui.back = { x: 170, y: 420, w: 140, h: 42 }; button(G.ui.back, '关卡选择', '#26324f', '#cdd6ee'); }
  function cleared() { var c = ctx(), G = GP.state, result = G.result; c.fillStyle = 'rgba(6,9,17,.92)'; c.fillRect(0, 0, C.width, C.height); text('关 卡 通 过', C.width / 2, 150, 34, '#7cff6b', 'center', 'middle', 'bold');
    drawStars(C.width / 2, 235, result.stars, result.flawless, 42); text('剩余生命 ' + Math.round(result.ratio * 100) + '%', C.width / 2, 300, 17, '#e8ecf7', 'center', 'middle');
    if (result.flawless) text('完美通关 · 满血三星边框', C.width / 2, 330, 14, '#fff3a3', 'center', 'middle', 'bold');
    else if (!result.stars) text('需要剩余生命大于 30% 才能解锁下一关', C.width / 2, 330, 13, '#ff8787', 'center', 'middle');
    G.ui.retry = { x: 75, y: 390, w: 150, h: 50 }; button(G.ui.retry, '再战一次', '#26324f', '#cdd6ee');
    if (GP.canContinue()) { G.ui.next = { x: 255, y: 390, w: 150, h: 50 }; button(G.ui.next, '下一关', '#33b3e6'); } else G.ui.next = null;
    G.ui.back = { x: 170, y: 466, w: 140, h: 42 }; button(G.ui.back, '关卡选择', '#26324f', '#cdd6ee');
  }
  function formatTime(ms) { var seconds = Math.floor(ms / 1000); return ('0' + Math.floor(seconds / 60)).slice(-2) + ':' + ('0' + seconds % 60).slice(-2); }
  function render(dt) { var c = ctx(), G = GP.state; P.beginFrame(); background(dt);
    if (G.state === 'menu') menu(); else if (G.state === 'levelselect') levelSelect(); else {
      c.save(); if (G.shake > 0) c.translate((Math.random() - .5) * G.shake, (Math.random() - .5) * G.shake); battlefield(); c.restore(); hud(); skills();
      if (G.toast.time > 0 && G.state === 'playing') text(G.toast.text, C.width / 2, Math.max(112, P.safeTop() + 96), 18, G.toast.color, 'center', 'middle', 'bold');
      if (G.state === 'levelup') levelUp(); else if (G.state === 'intermission') intermission(); else if (G.state === 'over') over(); else if (G.state === 'cleared') cleared(); else if (G.paused) pause();
    }
  }
  PM.Renderer = { render: render };
})(typeof GameGlobal !== 'undefined' ? GameGlobal : window);
