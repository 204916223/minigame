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
      waveLead: 0, pendingLevelUps: 0, refreshes: 0, coins: 0, lastCoins: 0, metaReturn: null,
      choices: [], progress: P.loadProgress(), result: null,
      ui: { cards: [], levelButtons: [], metaRows: [], metaBack: null, shop: null },
      toast: { text: '', color: '#fff', time: 0 }
    };
  }
  var G = makeState();
  if (!G.progress.stars) G.progress.stars = [];
  if (!G.progress.flawless) G.progress.flawless = [];
  if (!G.progress.coins) G.progress.coins = 0;
  if (!G.progress.meta) G.progress.meta = { atk: 0, hp: 0, shield: 0, def: 0, haste: 0 };
  C.meta.upgrades.forEach(function (u) { if (G.progress.meta[u.id] === undefined) G.progress.meta[u.id] = 0; });

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
    d.cd = Math.max(60, (d.cd || 0) * (G.player.cdMul || 1));
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
    bankCoins();
    G.state = 'playing'; G.paused = false; G.last = P.now(); G.time = 0; G.selectedLevel = levelIndex;
    var totalStars = 0, starList = G.progress.stars || [];
    for (var si = 0; si < starList.length; si++) totalStars += starList[si] || 0;
    var starMul = levelIndex >= (C.starBonus.fromLevel || 1) ? 1 + (C.starBonus.perStar || 0) * totalStars : 1;
    var meta = G.progress.meta || {};
    var upgAtk = metaUpgrade('atk'), upgHp = metaUpgrade('hp'), upgShield = metaUpgrade('shield'), upgDef = metaUpgrade('def'), upgHaste = metaUpgrade('haste');
    var atkMul = 1 + (meta.atk || 0) * (upgAtk ? upgAtk.per : 0.08);
    var maxhp = 140 + (meta.hp || 0) * (upgHp ? upgHp.per : 40);
    var shield = (meta.shield || 0) * (upgShield ? upgShield.per : 25);
    var defPct = Math.min(upgDef ? upgDef.cap : 0.6, (meta.def || 0) * (upgDef ? upgDef.per : 0.05));
    var hastePct = Math.min(upgHaste ? upgHaste.cap : 0.5, (meta.haste || 0) * (upgHaste ? upgHaste.per : 0.05));
    G.player = { hp: maxhp, maxhp: maxhp, shield: shield, maxShield: shield, defense: defPct, cdMul: 1 - hastePct,
      lvl: 1, xp: 0, xpv: xpNeed(1), kills: 0, aim: -Math.PI / 2,
      starBonus: totalStars, damageMul: starMul * atkMul };
    G.coins = 0; G.lastCoins = 0;
    G.cardLevels = {}; G.cardOrder = [];
    G.weapons = {}; WEAPONS.forEach(function (w) { G.weapons[w.id] = { owned: w.id === 'basic', cd: 0 }; });
    G.enemies = []; G.bullets = []; G.parts = []; G.booms = []; G.floaters = []; G.zones = []; G.arcs = [];
    G.spawnTimer = 0.7; G.shake = 0; G.damageFlash = 0; G.waveIndex = 0; G.waveKills = 0; G.waveSpawned = 0;
    G.bossSpawned = false; G.waveLead = C.waveLeadSeconds; G.pendingLevelUps = 0; G.refreshes = 0;
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
  /* 每级成长按波次分阶段：1-3 波加血量，4-6 波加防御，7-10 波加速度 */
  function enemyPhaseStat() { return G.waveIndex < 3 ? 'hp' : (G.waveIndex < 6 ? 'def' : 'speed'); }
  function spawnEnemy(key, sx, sy) {
    var type = C.enemyTypes[key], level = levelConfig(), curve = C.curve;
    var waveMul = Math.pow(curve.waveHpGrowth, G.waveIndex), dmgWaveMul = Math.pow(curve.waveDmgGrowth, G.waveIndex);
    var idx = G.waveSpawned, spawnMul = 1 + curve.spawnGrowth * idx;
    var lvlMul = 1 + ((C.curve.levelEnemyGrowth || 1) - 1) * Math.max(0, G.player.lvl - 1);
    var phase = enemyPhaseStat();
    var hpMul = phase === 'hp' ? lvlMul : 1, defMul = phase === 'def' ? lvlMul : 1, spdMul = phase === 'speed' ? lvlMul : 1;
    var hp = type.hp * level.hpScale * (level.hpMul || 1) * hpMul * waveMul * spawnMul;
    var x = sx === undefined ? 20 + Math.random() * (C.width - 40) : Math.max(12, Math.min(C.width - 12, sx));
    var y = sy === undefined ? -30 : sy;
    G.enemies.push({ id: ++spawnEnemy.uid, key: key, x: x, y: y,
      hp: hp, maxhp: hp, spd: type.spd * level.speedScale * spdMul, xp: type.xp,
      dmg: type.dmg * level.hpScale * dmgWaveMul * spawnMul,
      r: type.r, cell: type.cell, spr: type.spr, color: type.color, def: defMul,
      resist: type.resist, sway: type.sway ? 7 + Math.random() * 7 : 0, phase: Math.random() * Math.PI * 2,
      flash: 0, freezeT: 0, poisonT: 0, poisonDps: 0, boss: !!type.boss, dead: false });
    G.waveSpawned++;
  }
  spawnEnemy.uid = 0;
  function hasBoss() { return G.enemies.some(function (e) { return e.boss && !e.dead; }); }
  function spawnBatch() {
    var w = waveConfig();
    var lvl = Math.max(1, G.player.lvl);
    var groupBase = C.spawnGroupBase + C.spawnGroupPerLevel * (lvl - 1);
    var group = Math.floor(groupBase) + Math.floor(Math.random() * ((C.spawnGroupRandom || 0) + 1));
    group = Math.min(C.spawnGroupMax || 99, Math.max(1, group));
    group = Math.min(group, w.kills - G.waveSpawned);
    /* 同一批怪随机撒点：x/y 都散开，并做最小间距检查，避免固定列、重叠 */
    var placed = [];
    var ySpan = Math.min(110, 40 + group * 2.5);
    for (var i = 0; i < group; i++) {
      var x, y, tries = 0;
      do {
        x = 24 + Math.random() * (C.width - 48);
        y = -30 - Math.random() * ySpan;
        tries++;
      } while (tries < 12 && placed.some(function (p) {
        var dx = p.x - x, dy = p.y - y; return dx * dx + dy * dy < 26 * 26;
      }));
      placed.push({ x: x, y: y });
      spawnForWave(x, y);
    }
    return group;
  }
  function spawnForWave(x, y) {
    var w = waveConfig();
    if (G.waveSpawned >= w.kills) return;
    var needsBoss = !!w.boss && G.waveSpawned === w.kills - 1;
    if (needsBoss) { spawnEnemy('boss', x, y); G.bossSpawned = true; A.alarm(); toast('⚠ 首领来袭！', '#ff8787'); return; }
    spawnEnemy(chooseWeighted(w.pool), x, y);
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
      /* chainLightning 收的是「子弹形状」的参数，这里显式转换，别把 dmg/damage 混着用
         主目标被这一下电死也要从它倒下的位置继续传导；chain 总数包含主目标 */
      chainLightning({ damage: derived.dmg, chain: derived.chain, chainRange: derived.chainRange,
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
  /* 闪电传导：从命中点按距离逐个跳，伤害逐跳衰减，最多 chain 个目标（含第一个被命中的目标） */
  function chainLightning(bullet, from) {
    var reached = {}, damage = bullet.damage, current = from, hops = Math.max(0, (bullet.chain | 0) - 1);
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
    enemy.hp -= damage * (G.player.damageMul || 1) / (enemy.def || 1); enemy.flash = 1;
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
  /* 隐藏机制：主角每升 1 级，按当前波次阶段给怪 +5%（线性）：1-3 波血、4-6 波防、7-10 波速 */
  function scaleEnemiesOnLevelUp() {
    var g = C.curve.levelEnemyGrowth || 1;
    if (g === 1) return;
    var newMul = 1 + (g - 1) * Math.max(0, G.player.lvl - 1);
    var oldMul = 1 + (g - 1) * Math.max(0, G.player.lvl - 2);
    var ratio = oldMul > 0 ? newMul / oldMul : 1;
    var phase = enemyPhaseStat();
    G.enemies.forEach(function (e) {
      if (e.dead) return;
      if (phase === 'hp') { e.maxhp *= ratio; e.hp *= ratio; }
      else if (phase === 'def') { e.def = (e.def || 1) * ratio; }
      else { e.spd *= ratio; }
    });
  }
  function collectLevelUps() {
    while (G.player.xp >= G.player.xpv) {
      G.player.xp -= G.player.xpv; G.player.lvl++; G.player.xpv = xpNeed(G.player.lvl);
      G.player.maxhp += 10; G.player.hp = Math.min(G.player.maxhp, G.player.hp + 14); G.pendingLevelUps++;
      scaleEnemiesOnLevelUp();
    }
  }
  function addExperience(amount) { G.player.xp += amount; collectLevelUps(); }
  function grantExperience(amount) { addExperience(amount); settleCombatFlow(); }
  function killEnemy(enemy, source) {
    if (enemy.dead) return;
    enemy.dead = true; G.player.kills++; G.waveKills++; G.coins += (C.meta.killCoins || 1);
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
  /* 混合卡池：随机从「新技能」和「已有武器的强化」里抽 3 张。
     还没选过任何新技能时只出新技能，避免一上来只堆普攻强化；
     选过技能之后新技能和强化随机混出，不想选可以刷新。 */
  function buildChoices() {
    var unlocks = [], ups = [];
    if (ownedWeapons() < C.weaponSlots) {
      CARDS.forEach(function (card) {
        if (card.unlock && !G.weapons[card.unlock].owned) unlocks.push({ card: card, level: 0 });
      });
    }
    CARDS.forEach(function (card) {
      if (card.unlock) return;
      var lv = G.cardLevels[card.id] || 0;
      if (lv >= card.max || !G.weapons[card.weapon].owned) return;
      ups.push({ card: card, level: lv });
    });
    var pool = ownedWeapons() > 1 ? unlocks.concat(ups) : unlocks;
    if (!pool.length) pool = unlocks.concat(ups);
    return shuffled(pool).slice(0, 3);
  }
  function openLevelUp() {
    G.choices = buildChoices();
    if (!G.choices.length) { G.pendingLevelUps = 0; return; }
    G.state = 'levelup'; A.level();
  }
  function refreshChoices() {
    if (G.state !== 'levelup' || G.refreshes <= 0) return false;
    var next = buildChoices();
    if (!next.length) return false;
    G.refreshes--;
    G.choices = next; G.ui.cards = []; A.pick();
    return true;
  }
  function applyChoice(choice) {
    var card = choice.card;
    if (!G.cardLevels[card.id]) G.cardOrder.push(card.id);
    G.cardLevels[card.id] = (G.cardLevels[card.id] || 0) + 1;
    if (card.unlock) { G.weapons[card.unlock].owned = true; toast('获得 ' + card.name + '！', weaponBase(card.unlock).color); }
    recomputeDerived();
    G.pendingLevelUps = Math.max(0, G.pendingLevelUps - 1); G.choices = []; G.ui.cards = []; A.pick();
    if (G.pendingLevelUps > 0) openLevelUp();
    else { G.state = 'playing'; G.last = P.now(); }
  }
  function nextWave() {
    var completed = G.waveIndex + 1, gained = completed === 3 || completed === 6 || completed === 9;
    G.waveIndex++; G.waveKills = 0; G.waveSpawned = 0; G.bossSpawned = false; G.spawnTimer = 0.2;
    G.waveLead = C.waveLeadSeconds; G.last = P.now();
    if (gained) G.refreshes++;
    toast('第 ' + (G.waveIndex + 1) + ' 波来临' + (gained ? ' · 刷新机会 +1' : ''), '#8fe9ff');
  }
  function finishLevel() {
    var ratio = G.player.hp / G.player.maxhp, stars = calculateStars(ratio), flawless = ratio >= 0.999999;
    bankCoins();
    G.result = { stars: stars, flawless: flawless, ratio: ratio, coins: G.lastCoins };
    if (stars > (G.progress.stars[G.selectedLevel] || 0)) G.progress.stars[G.selectedLevel] = stars;
    if (flawless) G.progress.flawless[G.selectedLevel] = true;
    P.saveProgress(G.progress); G.state = 'cleared'; A.clear();
  }
  function hurtPlayer(damage) {
    if (G.state !== 'playing') return;
    var remaining = damage;
    if (G.player.shield > 0) {
      var absorbed = Math.min(G.player.shield, remaining);
      G.player.shield -= absorbed; remaining -= absorbed;
    }
    if (remaining > 0) G.player.hp -= remaining * (1 - (G.player.defense || 0));
    G.damageFlash = 1; G.shake = Math.max(G.shake, 8); A.hurt();
    if (G.player.hp <= 0) {
      G.player.hp = 0; bankCoins(); G.state = 'over'; G.enemies = []; G.bullets = []; G.zones = []; A.fail();
    }
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
    if (G.spawnTimer <= 0 && G.waveSpawned < waveConfig().kills) {
      var group = spawnBatch();
      G.spawnTimer = waveConfig().interval * C.spawnGroupTimeFactor * (0.8 + Math.random() * 0.4) * (G.waveIndex < (C.curve.openingReliefWaves || 1) ? (C.curve.openingRelief || 1) : 1);
    }
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
  function bankCoins() {
    if (!G.coins) return;
    G.lastCoins = G.coins;
    G.progress.coins = (G.progress.coins || 0) + G.coins;
    G.coins = 0;
    P.saveProgress(G.progress);
  }
  function totalStars() {
    var n = 0, list = G.progress.stars || [];
    for (var i = 0; i < list.length; i++) n += list[i] || 0;
    return n;
  }
  function metaUpgrade(id) { return C.meta.upgrades.filter(function (u) { return u.id === id; })[0]; }
  function metaCost(id) {
    var upg = metaUpgrade(id); if (!upg) return 0;
    var lv = (G.progress.meta && G.progress.meta[id]) || 0;
    return Math.round(upg.base * Math.pow(upg.growth, lv));
  }
  function buyMeta(id) {
    var upg = metaUpgrade(id); if (!upg) return false;
    var lv = (G.progress.meta && G.progress.meta[id]) || 0;
    if (lv >= upg.max) return false;
    var cost = metaCost(id);
    if ((G.progress.coins || 0) < cost) return false;
    G.progress.coins -= cost;
    G.progress.meta[id] = lv + 1;
    P.saveProgress(G.progress);
    A.pick();
    return true;
  }
  function openMeta() {
    if (G.state === 'playing' || G.state === 'levelup' || G.state === 'over' || G.state === 'cleared') return;
    G.metaReturn = G.state === 'meta' ? G.metaReturn : G.state;
    G.state = 'meta';
  }
  function leaveMeta() { G.state = G.metaReturn === 'levelselect' ? 'levelselect' : 'menu'; G.metaReturn = null; }
  function openLevelSelect() { bankCoins(); G.state = 'levelselect'; }
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
    recompute: recomputeDerived, refreshChoices: refreshChoices,
    openMeta: openMeta, leaveMeta: leaveMeta, buyMeta: buyMeta, metaCost: metaCost, totalStars: totalStars, bankCoins: bankCoins,
    pause: function (value) { G.paused = value; G.last = P.now(); },
    toast: toast, dangerY: dangerY, waveConfig: waveConfig
  };
})(typeof GameGlobal !== 'undefined' ? GameGlobal : window);
