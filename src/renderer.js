"use strict";
(function (root) {
  var PM = root.PixelMow = root.PixelMow || {}, C = PM.Config, P = PM.Platform, GP = PM.Gameplay;
  var gridOffset = 0;
  function ctx() { return P.ctx(); }
  function weaponColor(id) { var w = C.weapons.filter(function (item) { return item.id === id; })[0]; return w ? w.color : '#bff4ff'; }
  /* 每系一套画法：普攻细长弹、火系火球拖尾、风系弯月刃、冰系菱形冰晶、毒系滴落毒液（雷系为即时落雷，无弹丸） */
  function drawProjectile(b) { var c = ctx(), col = weaponColor(b.weapon);
    c.save(); c.translate(b.x, b.y); c.rotate(Math.atan2(b.vy, b.vx));
    if (b.shape === 'orb') { c.fillStyle = 'rgba(255,146,43,.30)'; c.fillRect(-b.r * 3.4, -b.r * .5, b.r * 3.4, b.r);
      c.fillStyle = col; c.beginPath(); c.arc(0, 0, b.r, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#fff3bf'; c.beginPath(); c.arc(b.r * .3, 0, b.r * .45, 0, Math.PI * 2); c.fill(); }
    else if (b.shape === 'gale') { c.strokeStyle = col; c.lineWidth = 2.5;
      c.beginPath(); c.arc(0, 0, b.r, -Math.PI * .72, Math.PI * .72); c.stroke();
      c.globalAlpha = .5; c.beginPath(); c.arc(-b.r * .55, 0, b.r * .68, -Math.PI * .62, Math.PI * .62); c.stroke(); c.globalAlpha = 1; }
    else if (b.shape === 'shard') { c.fillStyle = col; c.beginPath(); c.moveTo(b.r * 1.7, 0); c.lineTo(0, -b.r * .8);
      c.lineTo(-b.r * 1.3, 0); c.lineTo(0, b.r * .8); c.closePath(); c.fill();
      c.fillStyle = 'rgba(255,255,255,.8)'; c.fillRect(-b.r * .3, -1, b.r * 1.4, 2); }
    else if (b.shape === 'blob') { c.fillStyle = col; c.beginPath(); c.arc(0, 0, b.r, 0, Math.PI * 2); c.fill();
      c.globalAlpha = .7; c.beginPath(); c.arc(-b.r * 1.5, b.r * .35, b.r * .55, 0, Math.PI * 2); c.fill();
      c.globalAlpha = .4; c.beginPath(); c.arc(-b.r * 2.5, -b.r * .25, b.r * .35, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1; }
    else { c.fillStyle = 'rgba(191,244,255,.35)'; c.fillRect(-b.r * 3, -1, b.r * 2.4, 2);
      c.fillStyle = col; c.fillRect(-b.r, -b.r * .55, b.r * 2, b.r * 1.1); }
    c.restore(); }
  function weaponLevel(id) { var G = GP.state, sum = 0;
    C.cards.forEach(function (card) { if (card.weapon === id && !card.unlock) sum += (G.cardLevels[card.id] || 0); }); return sum; }
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
    G.zones.forEach(function (z) { var fade = Math.max(0, 1 - z.age / z.life), color = z.kind === 'poison' ? '#a9e34b' : '#ff7b2b';
      c.globalAlpha = fade * .26; c.fillStyle = color; c.beginPath(); c.arc(z.x, z.y, z.r, 0, Math.PI * 2); c.fill();
      c.globalAlpha = fade * .7; c.strokeStyle = color; c.lineWidth = 1; c.stroke(); }); c.globalAlpha = 1;
    G.booms.forEach(function (b) { var k = b.age / b.life, radius = b.r * (.5 + k * .9); c.globalAlpha = (1 - k) * .85; c.strokeStyle = '#ffcf6b'; c.lineWidth = 4;
      c.beginPath(); c.arc(b.x, b.y, radius, 0, Math.PI * 2); c.stroke(); }); c.globalAlpha = 1;
    G.arcs.forEach(function (a) { var k = 1 - a.age / a.life; c.globalAlpha = k; c.strokeStyle = '#ffe066'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(a.x1, a.y1); var steps = 4;
      for (var s = 1; s < steps; s++) { var t = s / steps;
        c.lineTo(a.x1 + (a.x2 - a.x1) * t + (Math.random() - .5) * 12, a.y1 + (a.y2 - a.y1) * t + (Math.random() - .5) * 12); }
      c.lineTo(a.x2, a.y2); c.stroke(); c.globalAlpha = 1; });
    G.bullets.forEach(drawProjectile);
    G.enemies.forEach(function (e) { sprite(C.sprites[e.spr], e.x, e.y, e.cell);
      if (e.freezeT > 0) { c.globalAlpha = .5; c.fillStyle = '#74c0fc'; c.fillRect(e.x - e.r, e.y - e.r, e.r * 2, e.r * 2); c.globalAlpha = 1; }
      else if (e.poisonT > 0) { c.globalAlpha = .3; c.fillStyle = '#a9e34b'; c.fillRect(e.x - e.r, e.y - e.r, e.r * 2, e.r * 2); c.globalAlpha = 1; }
      if (e.flash > 0) { c.globalAlpha = e.flash * .8; c.fillStyle = '#fff'; c.fillRect(e.x - e.r, e.y - e.r, e.r * 2, e.r * 2); c.globalAlpha = 1; }
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
    if (G.player.damageMul > 1) text('★' + G.player.starBonus + ' 伤害 +' + Math.round((G.player.damageMul - 1) * 100) + '%', C.width - 55, top + 59, 10, '#ffd166', 'right', 'middle', 'bold');
    var waveText = GP.isBossActive() ? '第 ' + (G.waveIndex + 1) + '/' + C.waveCount + ' 波  首领战' : '第 ' + (G.waveIndex + 1) + '/' + C.waveCount + ' 波  击杀 ' + G.waveKills + '/' + w.kills;
    text(waveText, 58, top + 43, 12, '#cdd6ee', 'left', 'middle', 'bold');
    text(formatTime(G.time), C.width - 55, top + 43, 12, '#8b95b3', 'right', 'middle');
    G.ui.pause = { x: C.width - 42, y: top + 30, w: 32, h: 26 }; rounded(G.ui.pause.x, G.ui.pause.y, 32, 26, 6); c.fillStyle = 'rgba(17,26,48,.9)'; c.fill(); c.strokeStyle = '#33456f'; c.stroke();
    c.fillStyle = '#cdd6ee'; c.fillRect(G.ui.pause.x + 10, G.ui.pause.y + 7, 3, 12); c.fillRect(G.ui.pause.x + 18, G.ui.pause.y + 7, 3, 12);
  }
  function skills() { var c = ctx(), G = GP.state, size = 52, gap = 8, y = Math.min(C.height - size - 16, P.safeBottom() - size - 12);
    var total = C.weapons.length, x0 = (C.width - (total * size + (total - 1) * gap)) / 2;
    C.weapons.forEach(function (w, i) {
      var x = x0 + i * (size + gap), state = G.weapons[w.id]; rounded(x, y, size, size, 11);
      c.fillStyle = 'rgba(14,21,38,.9)'; c.fill(); c.lineWidth = 2;
      c.strokeStyle = state && state.owned ? w.color : '#2c3a60'; c.stroke();
      if (!state || !state.owned) { text('+', x + size / 2, y + size / 2 - 2, 20, '#3d4a70', 'center', 'middle', 'bold');
        text(w.name.slice(0, 2), x + size / 2, y + size + 10, 9, '#5b6787', 'center', 'middle'); return; }
      var d = state.derived, shownDmg = d.dmg * (G.player.damageMul || 1);
      text(w.icon, x + size / 2, y + 18, 20, w.color, 'center', 'middle', 'bold');
      var fraction = Math.max(0, Math.min(1, state.cd / d.cd));
      if (fraction > 0) { c.save(); rounded(x, y, size, size, 11); c.clip(); c.beginPath(); c.moveTo(x + size / 2, y + size / 2);
        c.arc(x + size / 2, y + size / 2, size, -Math.PI / 2, -Math.PI / 2 + fraction * Math.PI * 2); c.closePath(); c.fillStyle = 'rgba(4,8,16,.72)'; c.fill(); c.restore(); }
      if (state.cd > 1) text((state.cd / 1000).toFixed(1), x + size / 2, y + 19, 12, '#fff', 'center', 'middle', 'bold');
      text('×' + d.count + ' ' + (shownDmg < 10 ? shownDmg.toFixed(1) : Math.round(shownDmg)), x + size / 2, y + size - 9, 9, '#cdd6ee', 'center', 'middle', 'bold');
      var lv = weaponLevel(w.id); if (lv) text('Lv' + lv, x + size - 4, y + 4, 9, '#ffd166', 'right', 'top', 'bold');
      text(w.name.slice(0, 2), x + size / 2, y + size + 10, 9, '#8b95b3', 'center', 'middle');
    });
    var owned = GP.ownedWeapons();
    text('武器 ' + owned + '/' + C.weaponSlots + (owned >= C.weaponSlots ? ' · 已满，只出强化卡' : ''), C.width / 2, y - 8, 10,
      owned >= C.weaponSlots ? '#ffb27d' : '#5b6787', 'center', 'middle');
  }
  function menu() { var c = ctx(), G = GP.state; c.fillStyle = 'rgba(6,9,17,.9)'; c.fillRect(0, 0, C.width, C.height);
    text('像素割草', C.width / 2, 155, 40, '#5ad1ff', 'center', 'middle', 'bold'); text('关卡制 · 每关十波 · 六系法术自由组合', C.width / 2, 220, 15, '#8b95b3', 'center', 'middle');
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
    var starTotal = 0; (G.progress.stars || []).forEach(function (n) { starTotal += n || 0; });
    text('星辉：第 2 关起每颗星 +15% 伤害' + (starTotal ? '（当前 ★' + starTotal + ' → +' + (starTotal * 15) + '%）' : ''),
      C.width / 2, 592, 11, '#8b95b3', 'center', 'middle');
  }
  var CAT_COLOR = { 强度: '#7cff6b', 数量: '#8fe9ff', 机制: '#ffd43b', 解锁: '#ff922b' };
  function weaponIcon(id) { var w = C.weapons.filter(function (item) { return item.id === id; })[0]; return w ? w.icon : '✦'; }
  function levelUp() { var c = ctx(), G = GP.state; c.fillStyle = 'rgba(6,9,17,.84)'; c.fillRect(0, 0, C.width, C.height);
    var canUnlock = GP.canLevelUpKind('unlock'), canUpgrade = GP.canLevelUpKind('upgrade');
    var kind = G.levelUpKind;
    text('升 级', C.width / 2, 62, 22, '#ffd166', 'center', 'middle', 'bold');
    G.ui.tabs = [];
    var tabs = [];
    if (canUnlock) tabs.push({ kind: 'unlock', label: '获得新技能' });
    if (canUpgrade) tabs.push({ kind: 'upgrade', label: '技能强化' });
    var tw = 170, th = 36, gap = 20, tx0 = (C.width - (tabs.length * tw + (tabs.length - 1) * gap)) / 2;
    tabs.forEach(function (tab, i) {
      var x = tx0 + i * (tw + gap), y = 84, active = kind === tab.kind;
      G.ui.tabs.push({ x: x, y: y, w: tw, h: th, kind: tab.kind, enabled: true });
      rounded(x, y, tw, th, 10); c.fillStyle = active ? '#33b3e6' : '#16203a'; c.fill();
      c.strokeStyle = active ? '#8fe9ff' : '#33456f'; c.lineWidth = active ? 2 : 1; c.stroke();
      text(tab.label, x + tw / 2, y + th / 2 + 1, 14, active ? '#05121c' : '#cdd6ee', 'center', 'middle', 'bold');
    });
    text(kind === 'unlock' ? '武器格 ' + GP.ownedWeapons() + '/' + C.weaponSlots + ' · 新技能会占一个格子'
      : '数量与机制卡会牺牲伤害，看清代价再选', C.width / 2, 142, 12, '#8b95b3', 'center', 'middle');
    G.ui.cards = G.choices.map(function (choice, i) {
      var rect = { x: 60, y: 162 + i * 104, w: 360, h: 92, choice: choice }, card = choice.card, next = choice.level + 1;
      rounded(rect.x, rect.y, rect.w, rect.h, 12); c.fillStyle = '#16203a'; c.fill();
      c.strokeStyle = card.color; c.lineWidth = 1.5; c.stroke();
      text(weaponIcon(card.weapon), rect.x + 30, rect.y + 34, 24, card.color, 'center', 'middle', 'bold');
      var tag = card.cat === '解锁' ? '新技能' : card.cat, tagW = tag.length * 12 + 10;
      rounded(rect.x + rect.w - tagW - 12, rect.y + 12, tagW, 20, 6); c.fillStyle = CAT_COLOR[card.cat] || '#33456f'; c.fill();
      text(tag, rect.x + rect.w - tagW / 2 - 12, rect.y + 22, 12, '#0b1224', 'center', 'middle', 'bold');
      text(card.name + (card.max > 1 ? '  Lv.' + next : ''), rect.x + 58, rect.y + 26, 16, '#fff', 'left', 'middle', 'bold');
      text(card.desc(next), rect.x + 58, rect.y + 50, 12, '#aeb8d2', 'left', 'middle');
      if (card.cost) text('代价 · ' + card.cost, rect.x + 58, rect.y + 72, 12, '#ff8787', 'left', 'middle', 'bold');
      else if (card.cat === '强度') text('无副作用', rect.x + 58, rect.y + 72, 12, '#7cff6b', 'left', 'middle');
      else text('解锁新武器', rect.x + 58, rect.y + 72, 12, '#ffb27d', 'left', 'middle');
      return rect; });
    if (G.pendingLevelUps > 1) text('还有 ' + (G.pendingLevelUps - 1) + ' 次升级待选择', C.width / 2, 486, 13, '#8fe9ff', 'center', 'middle');
  }
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
      if (G.state === 'levelup') levelUp(); else if (G.state === 'over') over(); else if (G.state === 'cleared') cleared(); else if (G.paused) pause();
    }
  }
  PM.Renderer = { render: render };
})(typeof GameGlobal !== 'undefined' ? GameGlobal : window);
