"use strict";
(function (root) {
  var PM = root.PixelMow = root.PixelMow || {}, C = PM.Config, P = PM.Platform, GP = PM.Gameplay, R = PM.Rules;
  var gridOffset = 0;
  function ctx() { return P.ctx(); }
  function skillColor(id) { var w = C.skills.filter(function (item) { return item.id === id; })[0]; return w ? w.color : '#bff4ff'; }
  /* 每系一套画法：普攻细长弹、火系火球拖尾、风系弯月刃、冰系菱形冰晶、毒系滴落毒液（雷系为即时落雷，无弹丸） */
  function drawProjectile(b) { var c = ctx(), col = skillColor(b.skill);
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
  function rounded(x, y, w, h, r) { var c = ctx(); r = Math.min(r, w / 2, h / 2); c.beginPath(); c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function text(value, x, y, size, color, align, baseline, weight) { var c = ctx(); c.font = (weight || '') + ' ' + size + 'px "PingFang SC","Microsoft YaHei",sans-serif';
    c.fillStyle = color; c.textAlign = align || 'left'; c.textBaseline = baseline || 'alphabetic'; c.fillText(value, x, y); }
  function button(rect, label, color, textColor) { var c = ctx(); rounded(rect.x, rect.y, rect.w, rect.h, 12); c.fillStyle = color; c.fill();
    text(label, rect.x + rect.w / 2, rect.y + rect.h / 2 + 1, 18, textColor || '#05121c', 'center', 'middle', 'bold'); }
  function bar(x, y, w, h, fraction, fill, label) { var c = ctx(); rounded(x, y, w, h, h / 2); c.fillStyle = 'rgba(11,18,36,.88)'; c.fill(); c.strokeStyle = '#2a3454'; c.lineWidth = 1; c.stroke();
    if (fraction > 0) { c.save(); rounded(x, y, w, h, h / 2); c.clip(); c.fillStyle = fill; c.fillRect(x, y, w * Math.min(1, fraction), h); c.restore(); }
    if (label) text(label, x + w / 2, y + h / 2 + 0.5, 10, '#fff', 'center', 'middle', 'bold'); }
  function percent(value) { return Number((value * 100).toFixed(1)); }
  function sprite(pattern, x, y, cell, element) { var c = ctx(), palette = C.palette, ox = x - pattern[0].length * cell / 2, oy = y - pattern.length * cell / 2;
    for (var r = 0; r < pattern.length; r++) for (var col = 0; col < pattern[r].length; col++) { var key = pattern[r][col], color = palette[key];
      if (element && color && '03wks'.indexOf(key) < 0) color = 'GPR'.indexOf(key) >= 0 ? element.dark : element.color;
      if (color) { c.fillStyle = color; c.fillRect((ox + col * cell) | 0, (oy + r * cell) | 0, cell, cell); } } }
  function background(dt) { var c = ctx(); c.fillStyle = '#070a12'; c.fillRect(-20, -20, C.width + 40, C.height + 40); gridOffset = (gridOffset + dt * 40) % 40;
    c.strokeStyle = 'rgba(60,80,130,.10)'; c.lineWidth = 1;
    for (var x = 0; x < C.width; x += 40) { c.beginPath(); c.moveTo(x + .5, 0); c.lineTo(x + .5, C.height); c.stroke(); }
    for (var y = -40 + gridOffset; y < C.height; y += 40) { c.beginPath(); c.moveTo(0, y + .5); c.lineTo(C.width, y + .5); c.stroke(); } }
  function battlefield() { var c = ctx(), G = GP.state, danger = GP.dangerY();
    c.fillStyle = 'rgba(255,93,108,.18)'; c.fillRect(0, danger - 12, C.width, 14); c.fillStyle = 'rgba(255,93,108,.55)'; c.fillRect(0, danger, C.width, 2);
    G.zones.forEach(function (z) { var fade = Math.max(0, 1 - z.age / z.life), color = z.color || '#a9e34b';
      c.globalAlpha = fade * .26; c.fillStyle = color; c.beginPath(); c.arc(z.x, z.y, z.r, 0, Math.PI * 2); c.fill();
      c.globalAlpha = fade * .7; c.strokeStyle = color; c.lineWidth = 1; c.stroke(); }); c.globalAlpha = 1;
    G.telegraphs.forEach(function (t) {
      var progress = Math.max(0, Math.min(1, (t.age - t.delay) / t.fillTime)), inner = t.r * (1 - progress);
      c.save(); c.strokeStyle = t.color; c.fillStyle = t.color; c.lineWidth = 2;
      c.globalAlpha = .9; c.beginPath(); c.arc(t.x, t.y, t.r, 0, Math.PI * 2); c.stroke();
      if (progress > 0) {
        // 反向内圆形成空心环，内半径逐渐归零；不用径向扇形进度。
        c.globalAlpha = .32 + progress * .22; c.beginPath(); c.arc(t.x, t.y, t.r, 0, Math.PI * 2);
        c.arc(t.x, t.y, inner, 0, Math.PI * 2, true); c.fill();
        c.globalAlpha = .85; c.lineWidth = 1; c.beginPath(); c.arc(t.x, t.y, inner, 0, Math.PI * 2); c.stroke();
      }
      c.globalAlpha = .9; text(R.skill(t.derived.id).name, t.x, t.y - t.r - 9, 11, t.color, 'center', 'middle');
      c.restore();
    });
    G.booms.forEach(function (b) { var k = b.age / b.life, radius = b.r * (1 + k * .6), color = b.color || '#ffcf6b';
      c.globalAlpha = Math.pow(1 - k, 2) * .4; c.fillStyle = color; c.beginPath(); c.arc(b.x, b.y, b.r, 0, Math.PI * 2); c.fill();
      c.globalAlpha = (1 - k) * .85; c.strokeStyle = color; c.lineWidth = 4;
      c.beginPath(); c.arc(b.x, b.y, radius, 0, Math.PI * 2); c.stroke();
      c.lineWidth = 2;
      for (var i = 0; i < 8; i++) { var angle = i * Math.PI / 4;
        c.beginPath(); c.moveTo(b.x + Math.cos(angle) * radius, b.y + Math.sin(angle) * radius);
        c.lineTo(b.x + Math.cos(angle) * (radius + 8), b.y + Math.sin(angle) * (radius + 8)); c.stroke(); }
    }); c.globalAlpha = 1;
    G.arcs.forEach(function (a) { var k = 1 - a.age / a.life; c.globalAlpha = k; c.strokeStyle = a.color || '#ffe066'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(a.x1, a.y1); var steps = 4;
      for (var s = 1; s < steps; s++) { var t = s / steps;
        c.lineTo(a.x1 + (a.x2 - a.x1) * t + (Math.random() - .5) * 12, a.y1 + (a.y2 - a.y1) * t + (Math.random() - .5) * 12); }
      c.lineTo(a.x2, a.y2); c.stroke(); c.globalAlpha = 1; });
    G.sweeps.forEach(function (v) { c.globalAlpha = (1 - v.age / v.life) * .45; c.fillStyle = v.color; c.fillRect(0, C.height * (1 - v.age / v.life), C.width, 42); }); c.globalAlpha = 1;
    G.bullets.forEach(drawProjectile);
    G.enemies.forEach(function (e) { sprite(C.sprites[e.spr], e.x, e.y, e.cell, C.elements[e.el]);
      if (e.boss) text(e.miniboss ? '小首领' : '最终首领', e.x, e.y - e.r - 16, 10, e.color, 'center', 'middle', 'bold');
      // 状态只描边，保留身体元素色，避免冰冻/中毒时误认属性。
      if (e.freezeT > 0 || e.poisonT > 0) { c.globalAlpha = .85; c.strokeStyle = e.freezeT > 0 ? C.elements.ice.color : C.elements.poison.color; c.lineWidth = 1;
        c.strokeRect(e.x - e.r - 2, e.y - e.r - 2, e.r * 2 + 4, e.r * 2 + 4); c.globalAlpha = 1; }
      if (e.flash > 0) { c.globalAlpha = e.flash * .8; c.fillStyle = '#fff'; c.fillRect(e.x - e.r, e.y - e.r, e.r * 2, e.r * 2); c.globalAlpha = 1; }
      if (e.hp < e.maxhp) { var w = e.r * 2; c.fillStyle = '#0b1224'; c.fillRect(e.x - w / 2, e.y - e.r - 7, w, 3); c.fillStyle = '#ff5d6c'; c.fillRect(e.x - w / 2, e.y - e.r - 7, w * Math.max(0, e.hp / e.maxhp), 3); } });
    sprite(C.sprites.hero, C.hero.x, C.hero.y, 4); c.strokeStyle = 'rgba(143,233,255,.5)'; c.lineWidth = 2; c.beginPath(); c.moveTo(C.hero.x, C.hero.y - 14);
    c.lineTo(C.hero.x + Math.cos(G.player.aim || -Math.PI / 2) * 14, C.hero.y - 14 + Math.sin(G.player.aim || -Math.PI / 2) * 14); c.stroke();
    G.parts.forEach(function (p) { c.globalAlpha = 1 - p.age / p.life; c.fillStyle = p.color; c.fillRect(p.x | 0, p.y | 0, p.size, p.size); }); c.globalAlpha = 1;
    G.floaters.forEach(function (f) { c.globalAlpha = 1 - f.age / f.life; text(f.text, f.x, f.y, 12, f.color, 'center', 'middle', 'bold'); }); c.globalAlpha = 1;
    if (G.damageFlash > 0) { c.fillStyle = 'rgba(255,40,60,' + G.damageFlash * .28 + ')'; c.fillRect(0, 0, C.width, C.height); }
  }
  function hud() { var c = ctx(), G = GP.state, top = Math.max(8, P.safeTop() + 6), w = GP.waveConfig();
    var shield = Math.ceil(G.player.shield || 0);
    bar(10, top, C.width - 20, 15, G.player.hp / G.player.maxhp, '#ff5d6c', 'HP ' + Math.ceil(G.player.hp) + ' / ' + G.player.maxhp + (shield > 0 ? '  盾 ' + shield : ''));
    bar(10, top + 18, C.width - 20, 9, G.player.xp / G.player.xpv, '#7cff6b', '');
    text('Lv.' + G.player.lvl, 10, top + 43, 12, '#ffd166', 'left', 'middle', 'bold');
    text('金币 ' + G.coins, 10, top + 59, 10, '#ffd166', 'left', 'middle', 'bold');
    var waveName = GP.isEndless() ? '无尽 · 第 ' + (G.waveIndex + 1) + ' 波' : '第 ' + (G.waveIndex + 1) + '/' + C.waveCount + ' 波';
    var waveText = waveName + (GP.isBossActive() ? '  首领战' : '  击杀 ' + G.waveKills + '/' + w.kills);
    text(waveText, 58, top + 43, 12, '#cdd6ee', 'left', 'middle', 'bold');
    text(formatTime(G.time), C.width - 55, top + 43, 12, '#8b95b3', 'right', 'middle');
    G.ui.pause = { x: C.width - 42, y: top + 30, w: 32, h: 26 }; rounded(G.ui.pause.x, G.ui.pause.y, 32, 26, 6); c.fillStyle = 'rgba(17,26,48,.9)'; c.fill(); c.strokeStyle = '#33456f'; c.stroke();
    c.fillStyle = '#cdd6ee'; c.fillRect(G.ui.pause.x + 10, G.ui.pause.y + 7, 3, 12); c.fillRect(G.ui.pause.x + 18, G.ui.pause.y + 7, 3, 12);
  }
  function skills() {
    var c = ctx(), G = GP.state, size = 62, gap = 10, y = Math.min(C.height - size - 12, P.safeBottom() - size - 12);
    var x0 = (C.width - (C.loadout.slots * size + (C.loadout.slots - 1) * gap)) / 2;
    G.ui.skillSlots = []; G.ui.skillPrev = G.ui.skillNext = null;
    var offset = GP.isEndless() ? G.skillPage * C.loadout.slots : 0;
    for (var i = 0; i < C.loadout.slots; i++) {
      var x = x0 + i * (size + gap), id = G.equippedOrder[offset + i], s = R.skill(id), state = s && G.skills[id];
      var focused = id === G.focusedSkill;
      rounded(x, y, size, size, 9); c.fillStyle = focused ? '#1c2b3c' : '#0e1526'; c.fill(); c.strokeStyle = focused ? '#e8ecf7' : s ? s.color : '#2c3a60'; c.lineWidth = focused ? 2 : 1; c.stroke(); c.lineWidth = 1;
      if (!s) { text('空', x + size / 2, y + 28, 15, '#5b6787', 'center', 'middle'); continue; }
      G.ui.skillSlots.push({ x: x, y: y, w: size, h: size, id: id });
      text(s.icon, x + size / 2, y + 18, 19, s.color, 'center', 'middle');
      text(s.name, x + size / 2, y + 38, 11, '#e8ecf7', 'center', 'middle');
      text(s.persistent ? '常驻' : (Math.max(0, state.cd) / 1000).toFixed(1) + 's', x + size / 2, y + 53, 10, '#aeb8d2', 'center', 'middle');
    }
    text('装备 ' + GP.ownedSkills() + (GP.isEndless() ? ' · 全部生效' : '/6'), x0, y - 8, 10, '#aeb8d2', 'left', 'middle');
    if (GP.isEndless()) {
      var pages = Math.max(1, Math.ceil(G.equippedOrder.length / C.loadout.slots));
      G.ui.skillPrev = {x:312,y:y-26,w:32,h:22}; G.ui.skillNext = {x:438,y:y-26,w:32,h:22};
      button(G.ui.skillPrev, '‹', G.skillPage > 0 ? '#26324f' : '#10182b', '#aeb8d2');
      text((G.skillPage + 1) + '/' + pages + ' 页', 391, y - 14, 10, '#aeb8d2', 'center', 'middle');
      button(G.ui.skillNext, '›', G.skillPage + 1 < pages ? '#26324f' : '#10182b', '#aeb8d2');
    }
  }
  function bondSidebar(top) {
    var c = ctx(), G = GP.state, counts = R.bonds(G), unlocked = R.bondsUnlocked(G);
    var tags = Object.keys(C.factions).filter(function (tag) { return C.factions[tag].bond && counts[tag]; });
    var bottom = Math.min(C.height, P.safeBottom()) - 114, firstY = top + 36;
    var step = Math.min(22, (bottom - firstY) / Math.max(1, tags.length - 1));
    text('羁绊', 31, top, 11, '#cdd6ee', 'center', 'middle', 'bold');
    text(unlocked ? '2 / 4 件生效' : GP.ownedSkills() + '/3 技能解锁', 31, top + 15, 8, '#8b95b3', 'center', 'middle');
    tags.forEach(function (tag, index) {
      var count = Math.min(4, counts[tag]), y = firstY + index * step, active = unlocked && count >= 2;
      var color = active ? (count >= 4 ? '#ffd166' : '#ff784f') : '#71819f';
      c.fillStyle = 'rgba(7,10,18,.78)'; c.beginPath(); c.arc(18, y, 9.5, 0, Math.PI * 2); c.fill();
      // 四段各表示一个派系技能。圆环只显示羁绊进度，不使用任何技能冷却值。
      c.lineWidth = 1.5; c.lineCap = 'butt';
      for (var segment = 0; segment < 4; segment++) {
        var start = -Math.PI / 2 + segment * Math.PI / 2 + .10;
        c.strokeStyle = segment < count ? color : '#26324a';
        c.beginPath(); c.arc(18, y, 9, start, start + Math.PI / 2 - .20); c.stroke();
      }
      text(C.factions[tag].name, 18, y - 1.5, 5, active ? color : '#aeb8d2', 'center', 'middle', 'bold');
      text(count + '/4', 18, y + 4.5, 4, '#aeb8d2', 'center', 'middle');
    }); c.lineWidth = 1;
  }
  function enhancementSidebar(top) {
    var c = ctx(), G = GP.state, id = G.focusedSkill;
    if (!G.skills[id] || !G.skills[id].owned) id = C.loadout.initial;
    var s = R.skill(id), d = G.skills[id].derived, rows = [], x = C.width - 96;
    function add(label, value, positive) { rows.push({ label: label, value: value, positive: positive !== false }); }
    function signed(value, suffix) { return (value >= 0 ? '+' : '') + value + suffix; }
    if (!s.persistent) add('冷却', '-' + percent(1 - d.cd / (s.cd * 1000)) + '%');
    var damage = percent(d.dmg / (C.power.base * s.ratio) - 1);
    add('伤害', signed(damage, '%'), damage >= 0);
    if (d.count > (s.targets || 1)) add('多重', '+' + (d.count - (s.targets || 1)));
    if (d.child) add('分裂', d.child + ' 目标');
    if (d.pierce) add('穿透', '+' + d.pierce);
    var range = percent(d.radius / (s.radius || C.combat.radius) - 1);
    if (R.has(s, 'range') && range) add('范围', '+' + range + '%');
    var duration = d.duration - (s.duration || C.combat.duration);
    if (!s.persistent && R.has(s, 'duration') && duration) add('持续', '+' + duration.toFixed(1) + 's');
    if (d.breach) add('破防', percent(d.breach) + '%');
    if (d.slow) add('减速', percent(d.slow) + '%');
    if (d.freezeChance) add('冰冻率', percent(d.freezeChance) + '%');
    if (d.knock > C.combat.knock) add('击退', '+' + percent(d.knock / C.combat.knock - 1) + '%');
    if (d.gather > 1) add('聚集', '+' + (d.gather - 1));
    if (d.chain > (s.chains || 0)) add('传导', '+' + (d.chain - (s.chains || 0)));
    if (d.bounce > (s.bounces || 0)) add('折射', '+' + (d.bounce - (s.bounces || 0)));
    var height = 86 + rows.length * 22;
    rounded(x, top - 9, 90, height, 8); c.fillStyle = 'rgba(7,10,18,.80)'; c.fill();
    text('当前强化', x + 45, top, 11, '#e8ecf7', 'center', 'middle', 'bold');
    text(s.name, x + 45, top + 20, 11, s.color, 'center', 'middle', 'bold');
    rows.forEach(function (row, i) {
      text(row.label, x + 7, top + 45 + i * 22, 10, '#aeb8d2', 'left', 'middle');
      text(row.value, x + 83, top + 45 + i * 22, 10, row.positive ? '#e8ecf7' : '#ffb27d', 'right', 'middle');
    });
    text('含羁绊与局外', x + 45, top + 47 + rows.length * 22, 8, '#71819f', 'center', 'middle');
    text('点底部技能切换', x + 45, top + 62 + rows.length * 22, 8, '#8b95b3', 'center', 'middle');
  }
  function menu() {
    var c = ctx(), G = GP.state, candidates = G.progress.candidates;
    c.fillStyle = '#070a12'; c.fillRect(0, 0, C.width, C.height);
    text('像素割草', 26, 45, 28, '#5ad1ff', 'left', 'middle', 'bold');
    text('金币 ' + G.progress.coins, 452, 45, 15, '#ffd166', 'right', 'middle');
    text('局外候选 ' + candidates.length + '/7 · 点选或取消', 26, 85, 17, '#e8ecf7', 'left', 'middle', 'bold');
    text('开局固定白银子弹；候选技能需在局内四选一获得', 26, 110, 12, '#aeb8d2', 'left', 'middle');
    G.ui.candidates = C.skills.filter(function (v) { return v.id !== C.loadout.initial && v.mode !== 'fullscreen'; }).map(function (v, i) {
      var rect = { x: 26 + (i % 2) * 219, y: 134 + Math.floor(i / 2) * 49, w: 209, h: 43, id: v.id };
      var selected = candidates.indexOf(v.id) >= 0;
      rounded(rect.x, rect.y, rect.w, rect.h, 7); c.fillStyle = selected ? '#182d40' : '#10182b'; c.fill(); c.strokeStyle = selected ? v.color : '#29334a'; c.stroke();
      text((selected ? '✓ ' : '+ ') + v.name, rect.x + 12, rect.y + 15, 14, selected ? v.color : '#cdd6ee', 'left', 'middle', 'bold');
      text(v.tags.map(function (t) { return C.factions[t].name; }).join(' / '), rect.x + 12, rect.y + 32, 9, '#aeb8d2', 'left', 'middle');
      return rect;
    });
    text('普通关最多 6 技能；无尽不受备战与装备数量限制', 26, 493, 12, '#aeb8d2', 'left', 'middle');
    text(G.toast.time > 0 ? G.toast.text : '怪物颜色代表元素，同属性攻击伤害减半', 26, 513, 12, G.toast.time > 0 ? '#ffd166' : '#aeb8d2', 'left', 'middle');
    var ready = GP.canSelectLevel();
    G.ui.start = { x: 26, y: 533, w: 270, h: 46 };
    button(G.ui.start, ready ? '选 择 关 卡' : '普通关 · 备战 ' + candidates.length + '/7', ready ? '#33b3e6' : '#1b2438', ready ? '#05121c' : '#8b95b3');
    G.ui.shop = { x: 310, y: 533, w: 144, h: 46 }; button(G.ui.shop, '局 外 强 化', '#26324f', '#cdd6ee');
    text('选关共两页：常规关卡 / 无尽模式', C.width / 2, 606, 12, '#8b95b3', 'center', 'middle');
  }
  function drawStars(x, y, stars, flawless, size) { var c = ctx(), gap = size + 12, start = x - gap;
    for (var i = 0; i < 3; i++) { if (flawless) { c.strokeStyle = '#fff3a3'; c.lineWidth = 3; rounded(start + i * gap - size / 2 - 5, y - size / 2 - 5, size + 10, size + 10, 8); c.stroke(); }
      text('★', start + i * gap, y, size, i < stars ? '#ffd166' : '#26324f', 'center', 'middle', 'bold'); }
  }
  function levelSelect() { var c = ctx(), G = GP.state; c.fillStyle = '#070a12'; c.fillRect(0, 0, C.width, C.height); text('常 规 关 卡', C.width / 2, 48, 26, '#e8ecf7', 'center', 'middle', 'bold');
    G.ui.levelButtons = [];
    C.levels.forEach(function (level, i) { var unlocked = GP.isLevelUnlocked(i), y = 90 + i * 70, rect = { x: 55, y: y, w: 370, h: 60, index: i, unlocked: unlocked && GP.loadoutReady() }; G.ui.levelButtons.push(rect);
      rounded(rect.x, rect.y, rect.w, rect.h, 12); c.fillStyle = unlocked ? '#16203a' : '#0c111e'; c.fill(); c.strokeStyle = unlocked ? '#33456f' : '#20283b'; c.stroke();
      text((i + 1) + '. ' + level.name, rect.x + 18, y + 30, 16, rect.unlocked ? '#fff' : '#596176', 'left', 'middle', 'bold');
      if (unlocked && !GP.loadoutReady()) text('需选满 7 个备战技能',rect.x+350,y+30,10,'#8b95b3','right','middle');
      else if (unlocked) drawStars(rect.x + 275, y + 30, G.progress.stars[i] || 0, !!G.progress.flawless[i], 18); else text('🔒', rect.x + 330, y + 30, 18, '#596176', 'center', 'middle');
    });
    var starTotal = 0; (G.progress.stars || []).forEach(function (n) { starTotal += n || 0; });
    text('星辉：第 2 关起每颗星 +15% 伤害' + (starTotal ? '（当前 ★' + starTotal + ' → +' + (starTotal * 15) + '%）' : ''),
      C.width / 2, 480, 11, '#8b95b3', 'center', 'middle');
  }
  function endlessSelect() {
    var c = ctx(), G = GP.state, unlocked = GP.isEndlessUnlocked(), record = G.progress.endless;
    c.fillStyle = '#070a12'; c.fillRect(0, 0, C.width, C.height);
    text('∞', C.width / 2, 55, 46, '#a378fc', 'center', 'middle', 'bold');
    text('无 尽 模 式', C.width / 2, 106, 28, '#e8ecf7', 'center', 'middle', 'bold');
    [{ x: 38, label: '最高通过波次', value: record.bestWave, unit: '波' },
      { x: 248, label: '单局最多击杀', value: record.bestKills, unit: '只' }].forEach(function (item) {
      rounded(item.x, 154, 194, 112, 14); c.fillStyle = '#1a1630'; c.fill(); c.strokeStyle = '#4a386c'; c.stroke();
      text(item.label, item.x + 97, 180, 13, '#b7a5d6', 'center', 'middle');
      text(item.value, item.x + 97, 218, String(item.value).length > 7 ? 22 : 32, '#e8ecf7', 'center', 'middle', 'bold');
      text(item.unit, item.x + 97, 248, 11, '#8b95b3', 'center', 'middle');
    });
    text('每波 1000 普通怪 + 3 小首领 + 2 大首领', 48, 304, 14, '#cdd6ee', 'left', 'middle');
    text('所有技能均可获取，装备数量不限', 48, 336, 13, '#aeb8d2', 'left', 'middle');
    text('保留全屏前置及风系 / 不可知域互斥', 48, 364, 13, '#aeb8d2', 'left', 'middle');
    text('金币、经验均为普通关的 50%', 48, 392, 13, '#aeb8d2', 'left', 'middle');
    var clears = G.progress.stars.slice(0, C.endless.unlockClears).filter(function (n) { return n > 0; }).length;
    text(unlocked ? '已解锁 · 无需选择备战技能' : '前三关至少一星通关后解锁 · ' + clears + '/3', C.width / 2, 436, 13, unlocked ? '#7cff6b' : '#b7a5d6', 'center', 'middle');
    G.ui.endlessStart = { x: 55, y: 463, w: 370, h: 48 };
    button(G.ui.endlessStart, unlocked ? '开 始 无 尽 挑 战' : '尚 未 解 锁', unlocked ? '#a378fc' : '#1b2438', unlocked ? '#130a22' : '#717c98');
    text('记录保存在当前设备 · 进入下一波即通过上一波', C.width / 2, 419, 10, '#8b95b3', 'center', 'middle');
  }
  function selectionPages(dt) {
    var c = ctx(), G = GP.state, page = G.state === 'levelselect' ? 0 : 1, turn = G.pageTurn;
    function drawPage(index, offset) {
      c.save(); c.translate(offset, 0);
      if (index === 0) levelSelect(); else endlessSelect();
      c.restore();
    }
    c.save(); c.beginPath(); c.rect(0, 0, C.width, 520); c.clip();
    if (turn && turn.time > 0) {
      turn.time = Math.max(0, turn.time - dt);
      var t = 1 - Math.pow(turn.time / turn.duration, 3);
      drawPage(turn.from, -turn.direction * t * C.width);
      drawPage(page, turn.direction * (1 - t) * C.width);
    } else drawPage(page, 0);
    c.restore();
    G.ui.selectPrev = { x: 55, y: 528, w: 60, h: 38 };
    G.ui.selectNext = { x: 365, y: 528, w: 60, h: 38 };
    button(G.ui.selectPrev, '‹', page === 1 ? '#26324f' : '#101522', page === 1 ? '#cdd6ee' : '#414b60');
    button(G.ui.selectNext, '›', page === 0 ? '#26324f' : '#101522', page === 0 ? '#cdd6ee' : '#414b60');
    text((page + 1) + ' / 2', C.width / 2, 541, 17, '#e8ecf7', 'center', 'middle', 'bold');
    text(page === 0 ? '常规关卡' : '无尽模式', C.width / 2, 561, 11, '#8b95b3', 'center', 'middle');
    G.ui.menu = { x: 55, y: 584, w: 170, h: 34 }; button(G.ui.menu, '返回备战', '#26324f', '#cdd6ee');
    G.ui.shop = { x: 255, y: 584, w: 170, h: 34 }; button(G.ui.shop, '局外强化', '#26324f', '#cdd6ee');
  }
  function levelUp() {
    var c = ctx(), G = GP.state;
    c.fillStyle = 'rgba(6,9,17,.94)'; c.fillRect(0, 0, C.width, C.height);
    text('选择技能或强化', C.width / 2, 65, 24, '#ffd166', 'center', 'middle', 'bold');
    text('第 ' + (G.choicesCompleted + 1) + ' 次选择 · 装备 ' + GP.ownedSkills() + (GP.isEndless() ? ' / 不限' : '/6') + ' · 至少一个强化选项', C.width / 2, 96, 12, '#aeb8d2', 'center', 'middle');
    G.ui.cards = G.choices.map(function (choice, i) {
      var card = choice.card, next = choice.level + 1, rect = { x: 26, y: 120 + i * 91, w: 428, h: 81, choice: choice };
      rounded(rect.x, rect.y, rect.w, rect.h, 10); c.fillStyle = '#16203a'; c.fill(); c.strokeStyle = card.color; c.stroke();
      text(card.name + (card.unlock ? '' : ' Lv.' + next), rect.x + 14, rect.y + 19, 16, card.color, 'left', 'middle', 'bold');
      text(card.unlock ? '新技能' : '强化', rect.x + rect.w - 14, rect.y + 19, 11, '#aeb8d2', 'right', 'middle');
      text(R.describe(card, next), rect.x + 14, rect.y + 43, 11, '#e8ecf7', 'left', 'middle');
      var lastSlot = !GP.isEndless() && GP.ownedSkills() === 5;
      var warning = card.unlock && lastSlot ? '占用最后一格，之后只出现强化' : card.cost || (card.unlock ? '独立获得技能，不附带任何强化' : '无伤害代价');
      if (card.unlock === 'chain') warning = '扣防后伤害减半；' + (lastSlot ? '占用最后一格' : '获取不附带强化');
      text(warning, rect.x + 14, rect.y + 64, 11, card.cost ? '#ffb27d' : '#7cff6b', 'left', 'middle');
      return rect;
    });
    if (G.pendingLevelUps > 1) text('还有 ' + (G.pendingLevelUps - 1) + ' 次升级待选择', C.width / 2, 503, 12, '#8fe9ff', 'center', 'middle');
    G.ui.refresh = { x: 160, y: 526, w: 160, h: 40 }; button(G.ui.refresh, '刷新 ×' + G.refreshes, G.refreshes ? '#1b4b5f' : '#141c30', G.refreshes ? '#63e6be' : '#5b6787');
    text('每 3 次选择保底新技能（有合资格候选时）；刷新不计次', C.width / 2, 580, 11, '#aeb8d2', 'center', 'middle');
    text(GP.isEndless() ? '每通过 3 波获得一次刷新 · 特殊强化满级后仅剩两类伤害卡' : '通过第 3 / 6 / 9 波各获得一次刷新', C.width / 2, 597, 11, '#aeb8d2', 'center', 'middle');
    if (GP.fullscreenChance()) text('本轮全屏概率 ' + GP.fullscreenChance() + '% · 未选择继续累计，选中后重置', C.width / 2, 614, 10, '#c8afff', 'center', 'middle');
  }
  function metaScreen() { var c = ctx(), G = GP.state; c.fillStyle = '#070a12'; c.fillRect(0, 0, C.width, C.height);
    text('局 外 强 化', C.width / 2, 52, 26, '#e8ecf7', 'center', 'middle', 'bold');
    text('金币 ' + (G.progress.coins || 0), C.width / 2, 82, 18, '#ffd166', 'center', 'middle', 'bold');
    var stars = GP.totalStars();
    text('星辉 ★' + stars + ' · 攻击 +' + Math.round(stars * C.starBonus.perStar * 100) + '%', C.width / 2, 104, 12, '#ffd166', 'center', 'middle');
    G.ui.metaRows = [];
    C.meta.upgrades.forEach(function (upg, i) {
      var y = 116 + i * 82, lv = (G.progress.meta && G.progress.meta[upg.id]) || 0;
      var maxed = lv >= upg.max, cost = GP.metaCost(upg.id), affordable = !maxed && (G.progress.coins || 0) >= cost;
      rounded(28, y, 424, 76, 12); c.fillStyle = '#16203a'; c.fill(); c.strokeStyle = '#33456f'; c.lineWidth = 1; c.stroke();
      text(upg.name + '  Lv.' + lv + '/' + upg.max, 44, y + 22, 16, '#fff', 'left', 'middle', 'bold');
      text(upg.desc, 44, y + 42, 12, '#aeb8d2', 'left', 'middle');
      var cur = upg.id === 'atk' ? (C.power.base * (1 + lv * upg.per)).toFixed(0) + ' 攻击（+' + percent(lv * upg.per) + '%）'
        : upg.id === 'hp' ? (C.hero.hp * (1 + lv * upg.per)).toFixed(0) + ' HP（+' + percent(lv * upg.per) + '%）'
        : upg.id === 'shield' ? '+' + (lv * upg.per) + ' 护盾'
        : upg.id === 'def' ? (C.hero.defense * (1 + lv * upg.per)).toFixed(0) + ' 防御（+' + percent(lv * upg.per) + '%）'
        : '-' + percent(Math.min(upg.cap, lv * upg.per)) + '% 冷却';
      text('当前 ' + cur, 44, y + 62, 12, '#7cff6b', 'left', 'middle');
      var btn = { x: 330, y: y + 28, w: 104, h: 32, id: upg.id };
      G.ui.metaRows.push(btn);
      rounded(btn.x, btn.y, btn.w, btn.h, 8); c.fillStyle = maxed ? '#20283b' : (affordable ? '#33b3e6' : '#26324f'); c.fill();
      text(maxed ? '已满级' : (cost + ' 金币'), btn.x + btn.w / 2, btn.y + btn.h / 2 + 1, 12,
        maxed ? '#596176' : (affordable ? '#05121c' : '#8b95b3'), 'center', 'middle', 'bold');
    });
    G.ui.metaBack = { x: 160, y: 548, w: 160, h: 42 }; button(G.ui.metaBack, '返 回', '#26324f', '#cdd6ee');
  }
  function pause() { var c = ctx(), G = GP.state; c.fillStyle = 'rgba(6,9,17,.74)'; c.fillRect(0, 0, C.width, C.height); text('已 暂 停', C.width / 2, 260, 28, '#e8ecf7', 'center', 'middle', 'bold');
    G.ui.resume = { x: 160, y: 315, w: 160, h: 50 }; button(G.ui.resume, '继 续', '#33b3e6');
    G.ui.pauseBack = { x: 160, y: 382, w: 160, h: 46 }; button(G.ui.pauseBack, GP.isEndless() ? '返回无尽模式' : '返回选关', '#26324f', '#cdd6ee'); }
  function over() { var c = ctx(), G = GP.state; c.fillStyle = 'rgba(6,9,17,.88)'; c.fillRect(0, 0, C.width, C.height); text('阵 地 失 守', C.width / 2, 190, 34, '#ff5d6c', 'center', 'middle', 'bold');
    text((GP.isEndless() ? '无尽 · ' : '') + '第 ' + (G.waveIndex + 1) + ' 波 · 击杀 ' + G.player.kills, C.width / 2, 255, 16, '#e8ecf7', 'center', 'middle');
    text('本局金币 +' + (G.lastCoins || 0) + ' · 总计 ' + (G.progress.coins || 0), C.width / 2, 284, 13, '#ffd166', 'center', 'middle');
    if (GP.isEndless()) text('最高通过 ' + G.progress.endless.bestWave + ' 波 · 最多击杀 ' + G.progress.endless.bestKills, C.width / 2, 310, 13, '#c8afff', 'center', 'middle');
    G.ui.retry = { x: 150, y: 345, w: 180, h: 52 }; button(G.ui.retry, GP.isEndless() ? '再次挑战' : '重 试 本 关', '#e6495a', '#2a0308'); G.ui.back = { x: 170, y: 420, w: 140, h: 42 }; button(G.ui.back, GP.isEndless() ? '无尽模式' : '关卡选择', '#26324f', '#cdd6ee'); }
  function cleared() { var c = ctx(), G = GP.state, result = G.result; c.fillStyle = 'rgba(6,9,17,.92)'; c.fillRect(0, 0, C.width, C.height); text('关 卡 通 过', C.width / 2, 150, 34, '#7cff6b', 'center', 'middle', 'bold');
    drawStars(C.width / 2, 235, result.stars, result.flawless, 42); text('剩余生命 ' + Math.round(result.ratio * 100) + '%', C.width / 2, 300, 17, '#e8ecf7', 'center', 'middle');
    text('本局金币 +' + (result.coins || 0) + ' · 总计 ' + (G.progress.coins || 0), C.width / 2, 360, 13, '#ffd166', 'center', 'middle');
    if (result.flawless) text('完美通关 · 满血三星边框', C.width / 2, 330, 14, '#fff3a3', 'center', 'middle', 'bold');
    else if (!result.stars) text('需要剩余生命大于 30% 才能解锁下一关', C.width / 2, 330, 13, '#ff8787', 'center', 'middle');
    G.ui.retry = { x: 75, y: 390, w: 150, h: 50 }; button(G.ui.retry, '再战一次', '#26324f', '#cdd6ee');
    if (GP.canContinue()) { G.ui.next = { x: 255, y: 390, w: 150, h: 50 }; button(G.ui.next, '下一关', '#33b3e6'); } else G.ui.next = null;
    G.ui.back = { x: 170, y: 466, w: 140, h: 42 }; button(G.ui.back, '关卡选择', '#26324f', '#cdd6ee');
  }
  function formatTime(ms) { var seconds = Math.floor(ms / 1000), minutes = Math.floor(seconds / 60); return (minutes < 10 ? '0' : '') + minutes + ':' + ('0' + seconds % 60).slice(-2); }
  function render(dt) { var c = ctx(), G = GP.state; P.beginFrame(); background(dt);
    if (G.state !== 'playing') G.toast.time = Math.max(0, G.toast.time - dt);
    if (G.state === 'menu') menu(); else if (G.state === 'levelselect' || G.state === 'endlessselect') selectionPages(dt); else if (G.state === 'meta') metaScreen(); else {
      c.save(); if (G.shake > 0) c.translate((Math.random() - .5) * G.shake, (Math.random() - .5) * G.shake); battlefield(); c.restore(); hud(); skills();
      var sidebarTop = Math.max(90, P.safeTop() + 84); bondSidebar(sidebarTop); enhancementSidebar(sidebarTop);
      if (G.toast.time > 0 && G.state === 'playing') text(G.toast.text, C.width / 2, Math.max(132, P.safeTop() + 116), 18, G.toast.color, 'center', 'middle', 'bold');
      if (G.state === 'levelup') levelUp(); else if (G.state === 'over') over(); else if (G.state === 'cleared') cleared(); else if (G.paused) pause();
    }
  }
  PM.Renderer = { render: render };
})(typeof GameGlobal !== 'undefined' ? GameGlobal : window);
