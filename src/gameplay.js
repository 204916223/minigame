"use strict";
(function (root) {
  var PM = root.PixelMow = root.PixelMow || {}, C = PM.Config, P = PM.Platform, A = PM.Audio;
  var CARDS = C.cards, WEAPONS = C.weapons;

  /* 升级所需经验：3、7、12、17、23；之后每级增量在 +6 基础上逐级再 +1 平滑外推 */
  var XP_TABLE = [3, 7, 12, 17, 23];
  function xpNeed(level) {
    if (level <= XP_TABLE.length) return XP_TABLE[level - 1];
    var need = XP_TABLE[XP_TABLE.length - 1], step = 6;
    for (var i = XP_TABLE.length; i < level; i++) { need += step; step += 1; }
    return need;
  }
  function calculateStars(ratio) { return ratio > 0.9 ? 3 : (ratio > 0.6 ? 2 : (ratio > 0.3 ? 1 : 0)); }
  function weaponBase(id) { return WEAPONS.filter(function (w) { return w.id === id; })[0]; }

  function makeState() {
    return {
      state: 'menu', paused: false, last: 0, time: 0, selectedLevel: 0,
      player: {}, weapons: {}, cardLevels: {}, cardOrder: [],
      enemies: [], bullets: [], parts: [], booms: [], floaters: [], zones: [], arcs: [],
      spawnTimer: 0, shake: 0, damageFlash: 0,
      waveIndex: 0, waveKills: 0, waveSpawned: 0, bossSpawned: false,
      waveLead: 0, pendingLevelUps: 0, lastPickWasUnlock: false,
      choices: [], progress: P.loadProgress(), result: null,
      ui: { cards: [], levelButtons: [] }, toast: { text: '', color: '#fff', time: 0 }
    };
  }
  var G = makeState();
  if (!G.progress.stars) G.progress.stars = [];
  if (!G.progress.flawless) G.progress.flawless = [];

  function levelConfig() { return C.levels[G.selectedLevel]; }
  function waveConfig() { return levelConfig().waves[G.waveIndex]; }
  function dangerY() { return C.hero.y - 8; }
  /* 交战线：敌人必须先走进画面（y >= combat.enterY）才可被锁定/命中，避免在屏幕外被清掉 */
  function onField(e) { return e.y >= C.combat.enterY; }
  function toast(text, color) { G.toast = { text: text, color: color || '#fff', time: 1.6 }; }

  /* 每把武器独立结算：gain 与 tax 同时乘进 dmg/cd/freeze/knock/dotDur，
     count/pierce/child/burn/chain/toxic 累加 */
  var MUL_KEYS = ['dmg', 'cd', 'freeze', 'knock', 'dotDur'], ADD_KEYS = ['count', 'pierce', 'child', 'burn', 'chain', 'toxic'];
  function deriveWeapon(id) {
    var base = weaponBase(id), d = {
      id: id, dmg: base.dmgBase, count: base.countBase || 1, pierce: base.pierceBase || 0,
      cd: base.cdBase || 0, child: 0, burn: 0, toxic: 0,
      kind: base.kind, speed: base.speed, turn: base.turn || 0, r: base.r,
      splash: base.splash || 0, splashRatio: base.splashRatio || 0,
      knock: base.knock || 0, freeze: base.freeze || 0, shape: base.shape || 'bolt',
      chain: base.chain || 0, chainRange: base.chainRange || 0, chainDecay: base.chainDecay || 1,
      dotDps: base.dotDps || 0, dotDur: base.dotDur || 0
    };
    CARDS.forEach(function (card) {
      if (card.weapon !== id) return;
      var lv = G.cardLevels[card.id] || 0; if (!lv) return;
      ['gain', 'tax'].forEach(function (key) {
        var mods = card[key]; if (!mods) return;
        MUL_KEYS.forEach(function (k) { if (mods[k]) d[k] = (d[k] || 1) * Math.pow(mods[k], lv); });
        ADD_KEYS.forEach(function (k) { if (mods[k]) d[k] = (d[k] || 0) + mods[k] * lv; });
      });
    });
    d.dmg = Math.max(0.05, d.dmg);
    d.dotDps = base.dotDps ? Math.max(0.02, d.dotDps * (d.dmg / base.dmgBase)) : 0;
    return d;
  }
  function recomputeDerived() {
    WEAPONS.forEach(function (w) {
      var state = G.weapons[w.id] || { cd: 0, owned: w.id === 'basic' };
      state.derived = deriveWeapon(w.id);
      state.owned = w.id === 'basic' ? true : !!state.owned;
      G.weapons[w.id] = state;
    });
  }
  function resetRun(levelIndex) {
    G.state = 'playing'; G.paused = false; G.last = P.now(); G.time = 0; G.selectedLevel = levelIndex;
    G.player = { hp: 140, maxhp: 140, lvl: 1, xp: 0, xpv: xpNeed(1), kills: 0, aim: -Math.PI / 2 };
    G.cardLevels = {}; G.cardOrder = [];
    G.weapons = {}; WEAPONS.forEach(function (w) { G.weapons[w.id] = { owned: w.id === 'basic', cd: 0 }; });
    G.enemies = []; G.bullets = []; G.parts = []; G.booms = []; G.floaters = []; G.zones = []; G.arcs = [];
    G.spawnTimer = 0.7; G.shake = 0; G.damageFlash = 0; G.waveIndex = 0; G.waveKills = 0; G.waveSpawned = 0;
    G.bossSpawned = false; G.waveLead = C.waveLeadSeconds; G.pendingLevelUps = 0; G.lastPickWasUnlock = false;
    G.choices = []; G.ui.cards = []; G.result = null; recomputeDerived();
    toast('第 1 波', '#8fe9ff');
  }
  function isLevelUnlocked(index) { return index === 0 || (G.progress.stars[index - 1] || 0) > 0; }
  function chooseWeighted(pool) {
    var keys = Object.keys(pool), total = 0, i;
    for (i = 0; i < keys.length; i++) total += pool[keys[i]];
    var n = Math.random() * total;
    for (i = 0; i < keys.length; i++) { n -= pool[keys[i]]; if (n <= 0) return keys[i]; }
    return keys[0];
  }
  /* 怪物强度曲线：波次成长 × 波内逐只成长 × 关卡系数，第二只一定比第一只硬 */
  function spawnEnemy(key) {
    var type = C.enemyTypes[key], level = levelConfig(), curve = C.curve;
    var waveMul = Math.pow(curve.waveHpGrowth, G.waveIndex), dmgWaveMul = Math.pow(curve.waveDmgGrowth, G.waveIndex);
    var idx = G.waveSpawned, spawnMul = 1 + curve.spawnGrowth * idx;
    var hp = type.hp * level.hpScale * waveMul * spawnMul;
    G.enemies.push({ id: ++spawnEnemy.uid, key: key, x: 20 + Math.random() * (C.width - 40), y: -30,
      hp: hp, maxhp: hp, spd: type.spd * level.speedScale, xp: type.xp,
      dmg: type.dmg * level.hpScale * dmgWaveMul * spawnMul,
      r: type.r, cell: type.cell, spr: type.spr, color: type.color,
      resist: type.resist, sway: type.sway ? 7 + Math.random() * 7 : 0, phase: Math.random() * Math.PI * 2,
      flash: 0, freezeT: 0, poisonT: 0, poisonDps: 0, boss: !!type.boss, dead: false });
    G.waveSpawned++;
  }
  spawnEnemy.uid = 0;
  function hasBoss() { return G.enemies.some(function (e) { return e.boss && !e.dead; }); }
  function spawnForWave() {
    var w = waveConfig();
    if (G.waveSpawned >= w.kills) return;
    var needsBoss = !!w.boss && G.waveSpawned === w.kills - 1;
    if (needsBoss) { spawnEnemy('boss'); G.bossSpawned = true; A.alarm(); toast('⚠ 首领来袭！', '#ff8787'); return; }
    spawnEnemy(chooseWeighted(w.pool));
  }
  function living(exclude) { return G.enemies.filter(function (e) { return !e.dead && e.hp > 0 && e !== exclude; }); }
  function nearestEnemies(count, exclude) {
    return living(exclude).filter(function (e) { return onField(e) && e.y < dangerY() + 40; })
      .sort(function (a, b) { return b.y - a.y; }).slice(0, count);
  }
  function makeBullet(derived, target, damage, child) {
    var angle = Math.atan2(target.y - (C.hero.y - 16), target.x - C.hero.x);
    return { weapon: derived.id, kind: derived.kind, shape: derived.shape, x: C.hero.x, y: C.hero.y - 16,
      vx: Math.cos(angle) * derived.speed, vy: Math.sin(angle) * derived.speed,
      speed: derived.speed, turn: derived.turn, target: target, damage: damage, pierce: derived.pierce,
      child: !!child, r: derived.r, life: derived.kind === 'lob' ? 3.2 : 2.6,
      splash: derived.splash, splashRatio: derived.splashRatio, burn: derived.burn,
      knock: derived.knock, freeze: derived.freeze, chain: derived.chain, chainRange: derived.chainRange,
      chainDecay: derived.chainDecay, dotDps: derived.dotDps, dotDur: derived.dotDur, toxic: derived.toxic,
      hitIds: {}, dead: false };
  }
  /* 雷系：不落弹丸，直接从英雄劈到目标再传导，画折线弧光 */
  function castInstant(derived) {
    var targets = nearestEnemies(derived.count);
    if (!targets.length) return false;
    targets.forEach(function (t) {
      G.arcs.push({ x1: C.hero.x, y1: C.hero.y - 16, x2: t.x, y2: t.y, age: 0, life: 0.18 });
      damageEnemy(t, derived.dmg, 'thunder');
      /* chainLightning 收的是「子弹形状」的参数，这里显式转换，别把 dmg/damage 混着用 */
      if (!t.dead) chainLightning({ damage: derived.dmg, chain: derived.chain, chainRange: derived.chainRange,
        chainDecay: derived.chainDecay, freeze: derived.freeze }, t);
      puff(t.x, t.y, '#ffe066', 6, 180);
    });
    G.shake = Math.max(G.shake, 4); A.alarm(); return true;
  }
  function fireWeapon(derived) {
    if (derived.kind === 'instant') return castInstant(derived);
    var targets = nearestEnemies(derived.count);
    if (!targets.length) return false;
    for (var i = 0; i < derived.count; i++) {
      var target = targets[i % targets.length];
      G.bullets.push(makeBullet(derived, target, derived.dmg, false));
    }
    G.player.aim = Math.atan2(targets[0].y - (C.hero.y - 16), targets[0].x - C.hero.x);
    puff(C.hero.x, C.hero.y - 20, weaponBase(derived.id).color, 3, 120);
    if (derived.kind === 'lob') A.boom(); else A.shoot(); return true;
  }
  function updateWeapons(dt) {
    WEAPONS.forEach(function (w) {
      var state = G.weapons[w.id]; if (!state || !state.owned) return;
      state.cd -= dt * 1000;
      /* 场上没怪时不空转冷却，免得空等 5~8 秒 */
      if (state.cd <= 0) { if (fireWeapon(state.derived)) state.cd = state.derived.cd; else state.cd = 120; }
    });
  }
  function puff(x, y, color, count, speed) {
    for (var i = 0; i < count; i++) { var angle = Math.random() * Math.PI * 2, velocity = speed * (0.4 + Math.random() * 0.8);
      G.parts.push({ x: x, y: y, vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity,
        life: 0.3 + Math.random() * 0.3, age: 0, color: color, size: 2 + Math.random() * 2 }); }
  }
  function burst(x, y, color, count, speed) {
    for (var i = 0; i < count; i++) { var angle = Math.random() * Math.PI * 2, velocity = speed * (0.3 + Math.random());
      G.parts.push({ x: x, y: y, vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity - 40,
        life: 0.4 + Math.random() * 0.5, age: 0, color: color, size: 2 + Math.random() * 3, gravity: 260 }); }
  }
  function explode(x, y, radius, damage, burn, dot) {
    G.booms.push({ x: x, y: y, r: radius, age: 0, life: 0.35 });
    living().forEach(function (e) { if (!onField(e)) return; var dx = e.x - x, dy = e.y - y;
      if (dx * dx + dy * dy >= radius * radius) return;
      if (dot && dot.dotDps) poisonEnemy(e, dot.dotDps, dot.dotDur);
      damageEnemy(e, damage, 'splash'); });
    if (burn > 0) addZone(x, y, radius * 1.15, 'burn', { dps: 1.6 * burn });
    puff(x, y, dot && dot.dotDps ? '#a9e34b' : '#ffb84d', 12, 220);
    G.shake = Math.max(G.shake, 5); A.boom();
  }
  function addZone(x, y, r, kind, opt) {
    G.zones.push({ x: x, y: y, r: r, kind: kind, dps: opt.dps || 0, dotDps: opt.dotDps || 0, dotDur: opt.dotDur || 0,
      tick: 0.4, timer: 0.2, age: 0, life: opt.life || 5 });
  }
  /* 二次分裂 / 刃影：50% 伤害，且不再继续分裂 */
  function spawnChildren(derived, enemy) {
    var count = derived.child; if (!count) return;
    var pool = living(enemy).filter(onField);
    for (var i = 0; i < count; i++) {
      var target = pool.length ? pool[(Math.random() * pool.length) | 0] : enemy;
      var angle = Math.random() * Math.PI * 2, speed = derived.speed * 0.9;
      G.bullets.push({ weapon: derived.id, kind: 'homing', shape: derived.shape, x: enemy.x, y: enemy.y,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, speed: speed, turn: derived.turn,
        target: target, damage: derived.dmg * 0.5, pierce: 0, child: true, r: Math.max(2, derived.r - 1),
        life: 1.4, splash: 0, splashRatio: 0, burn: 0, knock: derived.knock * 0.5, freeze: derived.freeze * 0.5,
        chain: 0, chainRange: 0, chainDecay: 1, dotDps: derived.dotDps, dotDur: derived.dotDur, toxic: 0,
        hitIds: {}, dead: false });
    }
  }
  function applyWeaponEffect(bullet, enemy) {
    if (bullet.knock) { var knock = bullet.knock * (1 - (enemy.resist.knock || 0));
      enemy.y = Math.max(C.control.knockMinY, enemy.y - knock);
      puff(enemy.x, enemy.y + 6, '#9be15d', 4, 140); }
    if (bullet.freeze) { var dur = Math.min(C.control.freezeCap, bullet.freeze * (1 - (enemy.resist.freeze || 0)));
      if (dur > 0) { enemy.freezeT = Math.max(enemy.freezeT, dur); puff(enemy.x, enemy.y, '#a5d8ff', 3, 90); } }
    if (bullet.dotDps) poisonEnemy(enemy, bullet.dotDps, bullet.dotDur);
    if (bullet.chain) chainLightning(bullet, enemy);
  }
  function poisonEnemy(enemy, dps, dur) {
    enemy.poisonDps = Math.max(enemy.poisonDps || 0, dps * (1 - (enemy.resist.poison || 0)));
    enemy.poisonT = Math.max(enemy.poisonT || 0, dur * (1 - (enemy.resist.poison || 0)));
  }
  /* 闪电传导：从命中点按距离逐个跳，伤害逐跳衰减，最多 chain 个目标 */
  function chainLightning(bullet, from) {
    var reached = {}, damage = bullet.damage, current = from, hops = Math.max(0, bullet.chain | 0);
    reached[current.id] = true;
    for (var i = 0; i < hops; i++) {
      var best = null, bestD = bullet.chainRange * bullet.chainRange;
      living().forEach(function (e) { if (reached[e.id] || !onField(e)) return; var dx = e.x - current.x, dy = e.y - current.y, d2 = dx * dx + dy * dy;
        if (d2 < bestD) { bestD = d2; best = e; } });
      if (!best) break;
      G.arcs.push({ x1: current.x, y1: current.y, x2: best.x, y2: best.y, age: 0, life: 0.18 });
      reached[best.id] = true; damage *= bullet.chainDecay; current = best;
      damageEnemy(best, damage, 'thunder');
      if (bullet.freeze) applyWeaponEffect({ knock: 0, freeze: bullet.freeze, dotDps: 0, chain: 0 }, best);
    }
  }
  function damageEnemy(enemy, damage, source) {
    if (enemy.dead) return;
    if (!(damage >= 0)) return; /* 数值污染兜底：NaN/undefined 一律不结算 */
    enemy.hp -= damage; enemy.flash = 1;
    if (enemy.hp <= 0) killEnemy(enemy, source);
  }
  function hitEnemy(enemy, bullet) {
    puff(enemy.x, enemy.y, enemy.color, 3, 90);
    applyWeaponEffect(bullet, enemy);
    damageEnemy(enemy, bullet.damage, bullet.weapon);
    if (bullet.kind === 'lob') { explode(enemy.x, enemy.y, bullet.splash, bullet.damage * bullet.splashRatio, bullet.burn, { dotDps: bullet.dotDps, dotDur: bullet.dotDur }); return; }
    if (!bullet.child) spawnChildren(weaponDerived(bullet.weapon), enemy);
  }
  function weaponDerived(id) { var state = G.weapons[id]; return state ? state.derived : null; }
  function collectLevelUps() {
    while (G.player.xp >= G.player.xpv) {
      G.player.xp -= G.player.xpv; G.player.lvl++; G.player.xpv = xpNeed(G.player.lvl);
      G.player.maxhp += 10; G.player.hp = Math.min(G.player.maxhp, G.player.hp + 14); G.pendingLevelUps++;
    }
  }
  function addExperience(amount) { G.player.xp += amount; collectLevelUps(); }
  function grantExperience(amount) { addExperience(amount); settleCombatFlow(); }
  function killEnemy(enemy, source) {
    if (enemy.dead) return;
    enemy.dead = true; G.player.kills++; G.waveKills++;
    G.floaters.push({ x: enemy.x, y: enemy.y, text: '+' + enemy.xp, color: '#b8ff6b', age: 0, life: 0.9 });
    burst(enemy.x, enemy.y, enemy.color, enemy.boss ? 36 : 12, enemy.boss ? 300 : 150);
    G.shake = Math.max(G.shake, enemy.boss ? 13 : 3); A.hit();
    /* 腐爆：中毒敌人死亡炸出毒雾，继续传染别的怪 */
    if (enemy.poisonT > 0 && (G.cardLevels.p_burst || 0) > 0) {
      addZone(enemy.x, enemy.y, enemy.boss ? 90 : 52, 'poison', { life: 5, dotDps: enemy.poisonDps, dotDur: 3 });
      puff(enemy.x, enemy.y, '#a9e34b', 10, 160);
    }
    addExperience(enemy.xp);
  }
  function isFinalWave() { return G.waveIndex >= levelConfig().waves.length - 1; }
  function waveSpawnComplete() { return G.waveSpawned >= waveConfig().kills; }
  function fieldClear() { return !G.enemies.some(function (e) { return !e.dead; }); }
  /* 关卡结束只看末波：最后一只首领倒下即通关；中途不暂停、不清场 */
  function settleCombatFlow() {
    if (G.state !== 'playing') return;
    if (isFinalWave() && waveSpawnComplete() && fieldClear()) {
      G.pendingLevelUps = 0; G.choices = []; G.ui.cards = []; finishLevel(); return;
    }
    if (G.pendingLevelUps > 0) openLevelUp();
  }
  function ownedWeapons() { return WEAPONS.filter(function (w) { return G.weapons[w.id] && G.weapons[w.id].owned; }).length; }
  /* 卡池：未满槽时未获得的武器解锁卡优先塞进三选一，其余随机；机制/数量卡的伤害代价在卡面明写 */
  function shuffled(list) {
    for (var i = list.length - 1; i > 0; i--) { var j = (Math.random() * (i + 1)) | 0, tmp = list[i]; list[i] = list[j]; list[j] = tmp; }
    return list;
  }
  /* 两阶段卡池：一次三选一里不混「获得技能」和「强化」。
     上一次拿了新技能 → 这次只出强化；上一次拿了强化 → 这次可以出未拥有的技能 */
  function buildChoices() {
    var unlocks = [];
    if (!G.lastPickWasUnlock && ownedWeapons() < C.weaponSlots) {
      CARDS.forEach(function (card) {
        if (card.unlock && !G.weapons[card.unlock].owned) unlocks.push({ card: card, level: 0 });
      });
    }
    if (unlocks.length) return shuffled(unlocks).slice(0, 3);
    var ups = [];
    CARDS.forEach(function (card) {
      if (card.unlock) return;
      var lv = G.cardLevels[card.id] || 0;
      if (lv >= card.max || !G.weapons[card.weapon].owned) return;
      ups.push({ card: card, level: lv });
    });
    return shuffled(ups).slice(0, 3);
  }
  function openLevelUp() {
    G.choices = buildChoices();
    if (!G.choices.length) { G.pendingLevelUps = 0; return; }
    G.state = 'levelup'; A.level();
  }
  function applyChoice(choice) {
    var card = choice.card;
    G.lastPickWasUnlock = !!card.unlock;
    if (!G.cardLevels[card.id]) G.cardOrder.push(card.id);
    G.cardLevels[card.id] = (G.cardLevels[card.id] || 0) + 1;
    if (card.unlock) { G.weapons[card.unlock].owned = true; toast('获得 ' + card.name + '！', weaponBase(card.unlock).color); }
    recomputeDerived();
    G.pendingLevelUps = Math.max(0, G.pendingLevelUps - 1); G.choices = []; G.ui.cards = []; A.pick();
    if (G.pendingLevelUps > 0) openLevelUp();
    else { G.state = 'playing'; G.last = P.now(); }
  }
  function nextWave() {
    G.waveIndex++; G.waveKills = 0; G.waveSpawned = 0; G.bossSpawned = false; G.spawnTimer = 0.2;
    G.waveLead = C.waveLeadSeconds; G.last = P.now();
    toast('第 ' + (G.waveIndex + 1) + ' 波来临', '#8fe9ff');
  }
  function finishLevel() {
    var ratio = G.player.hp / G.player.maxhp, stars = calculateStars(ratio), flawless = ratio >= 0.999999;
    G.result = { stars: stars, flawless: flawless, ratio: ratio };
    if (stars > (G.progress.stars[G.selectedLevel] || 0)) G.progress.stars[G.selectedLevel] = stars;
    if (flawless) G.progress.flawless[G.selectedLevel] = true;
    P.saveProgress(G.progress); G.state = 'cleared'; A.clear();
  }
  function hurtPlayer(damage) {
    if (G.state !== 'playing') return;
    G.player.hp -= damage; G.damageFlash = 1; G.shake = Math.max(G.shake, 8); A.hurt();
    if (G.player.hp <= 0) { G.player.hp = 0; G.state = 'over'; G.enemies = []; G.bullets = []; G.zones = []; A.fail(); }
  }
  function updateZones(dt) {
    G.zones.forEach(function (z) {
      z.age += dt; z.timer -= dt;
      if (z.timer <= 0) { z.timer = z.tick;
        living().forEach(function (e) { if (!onField(e)) return; var dx = e.x - z.x, dy = e.y - z.y;
          if (dx * dx + dy * dy >= z.r * z.r) return;
          if (z.kind === 'burn') damageEnemy(e, z.dps * z.tick, 'burn');
          else poisonEnemy(e, z.dotDps, z.dotDur); }); }
    });
    G.zones = G.zones.filter(function (z) { return z.age < z.life; });
  }
  function updateBullets(dt) {
    G.bullets.forEach(function (b) {
      var target = b.target;
      if (target && (target.dead || target.hp <= 0)) { b.target = null; target = null; }
      if (b.kind === 'lob') {
        if (!b.target) b.target = nearestEnemies(1)[0] || null;
        if (b.target) { b.tx = b.target.x; b.ty = Math.max(C.combat.enterY, Math.min(dangerY(), b.target.y)); }
        if (b.tx === undefined) { b.dead = true; return; }
        var ddx = b.tx - b.x, ddy = b.ty - b.y, dist = Math.sqrt(ddx * ddx + ddy * ddy);
        if (dist < 14) { explode(b.x, b.y, b.splash, b.damage, b.burn, { dotDps: b.dotDps, dotDur: b.dotDur }); b.dead = true; return; }
        var lobAngle = Math.atan2(ddy, ddx);
        b.vx = Math.cos(lobAngle) * b.speed; b.vy = Math.sin(lobAngle) * b.speed;
      } else if (target) {
        var desired = Math.atan2(target.y - b.y, target.x - b.x), current = Math.atan2(b.vy, b.vx), delta = desired - current;
        while (delta > Math.PI) delta -= Math.PI * 2; while (delta < -Math.PI) delta += Math.PI * 2;
        var maxTurn = b.turn * dt, next = current + Math.max(-maxTurn, Math.min(maxTurn, delta));
        b.vx = Math.cos(next) * b.speed; b.vy = Math.sin(next) * b.speed;
      }
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.x < -10 || b.x > C.width + 10 || b.y < -10 || b.y > C.height + 10 || b.life <= 0) {
        if (b.kind === 'lob' && b.life <= 0) explode(b.x, b.y, b.splash, b.damage * 0.5, b.burn, { dotDps: b.dotDps, dotDur: b.dotDur });
        b.dead = true; return;
      }
      for (var i = 0; i < G.enemies.length; i++) { var e = G.enemies[i]; if (e.dead || b.hitIds[e.id] || !onField(e)) continue;
        var dx = e.x - b.x, dy = e.y - b.y, rr = e.r + b.r;
        if (dx * dx + dy * dy < rr * rr) {
          b.hitIds[e.id] = true; hitEnemy(e, b);
          if (b.kind === 'lob') { b.dead = true; break; }
          if (b.pierce > 0) { b.pierce--; b.target = null; } else { b.dead = true; break; }
        }
      }
    });
    G.bullets = G.bullets.filter(function (b) { return !b.dead; });
  }
  function updateEffects(dt) {
    G.parts.forEach(function (p) { p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.gravity) p.vy += p.gravity * dt; p.vx *= 0.94; });
    G.parts = G.parts.filter(function (p) { return p.age < p.life; });
    G.booms.forEach(function (b) { b.age += dt; }); G.booms = G.booms.filter(function (b) { return b.age < b.life; });
    G.arcs.forEach(function (a) { a.age += dt; }); G.arcs = G.arcs.filter(function (a) { return a.age < a.life; });
    G.floaters.forEach(function (f) { f.age += dt; f.y -= 30 * dt; }); G.floaters = G.floaters.filter(function (f) { return f.age < f.life; });
    G.shake = Math.max(0, G.shake - dt * 40); G.damageFlash = Math.max(0, G.damageFlash - dt * 2); G.toast.time -= dt;
  }
  function update(dt) {
    if (G.state !== 'playing' || G.paused) return;
    G.time += dt * 1000; G.spawnTimer -= dt;
    if (G.spawnTimer <= 0 && G.waveSpawned < waveConfig().kills) { spawnForWave(); G.spawnTimer = waveConfig().interval * (0.8 + Math.random() * 0.4) * (G.waveIndex < (C.curve.openingReliefWaves || 1) ? (C.curve.openingRelief || 1) : 1); }
    /* 本波最后一只怪已出场 → 倒计时接下一波，全程不打断 */
    if (waveSpawnComplete()) { if (!isFinalWave()) { G.waveLead -= dt; if (G.waveLead <= 0) nextWave(); } }
    else G.waveLead = C.waveLeadSeconds;
    updateWeapons(dt);
    G.enemies.forEach(function (e) {
      if (e.dead) return;
      if (e.poisonT > 0) { e.poisonT -= dt; damageEnemy(e, e.poisonDps * dt, 'poison'); if (e.dead) return; }
      if (e.freezeT > 0) { e.freezeT -= dt; }
      else e.y += e.spd * dt;
      if (e.sway && e.freezeT <= 0) { e.phase += dt * 3; e.x += Math.sin(e.phase) * e.sway * dt * 6; e.x = Math.max(12, Math.min(C.width - 12, e.x)); }
      e.flash = Math.max(0, e.flash - dt * 6);
      if (e.y >= dangerY()) { e.dead = true; hurtPlayer(e.dmg); burst(e.x, dangerY(), '#ff5d6c', 10, 160); }
    });
    if (G.state === 'playing') updateBullets(dt);
    if (G.state === 'playing') updateZones(dt);
    G.enemies = G.enemies.filter(function (e) { return !e.dead; });
    settleCombatFlow(); updateEffects(dt);
  }
  function openLevelSelect() { G.state = 'levelselect'; }
  function canContinue() { return G.result && G.result.stars > 0 && G.selectedLevel + 1 < C.levels.length; }
  function ownedCards() {
    return G.cardOrder.map(function (id) {
      var card = CARDS.filter(function (item) { return item.id === id; })[0];
      return { card: card, level: G.cardLevels[id] };
    });
  }
  PM.Gameplay = {
    state: G, update: update, resetRun: resetRun, openLevelSelect: openLevelSelect, applyChoice: applyChoice,
    isLevelUnlocked: isLevelUnlocked, canContinue: canContinue, calculateStars: calculateStars,
    grantExperience: grantExperience, isBossActive: hasBoss, ownedCards: ownedCards, xpNeed: xpNeed,
    ownedWeapons: ownedWeapons,
    recompute: recomputeDerived,
    pause: function (value) { G.paused = value; G.last = P.now(); },
    toast: toast, dangerY: dangerY, waveConfig: waveConfig
  };
})(typeof GameGlobal !== 'undefined' ? GameGlobal : window);
