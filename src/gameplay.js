"use strict";
(function (root) {
  var PM = root.PixelMow = root.PixelMow || {}, C = PM.Config, P = PM.Platform, A = PM.Audio;
  var R = PM.Rules, CARDS = R.cards, SKILLS = C.skills;

  /* 升级所需经验：3、7、12、17、23；之后每级增量在 +6 基础上逐级再 +1 平滑外推 */
  var XP_TABLE = [3, 7, 12, 17, 23];
  function xpNeed(level) {
    if (level <= XP_TABLE.length) return XP_TABLE[level - 1];
    var need = XP_TABLE[XP_TABLE.length - 1], step = 6;
    for (var i = XP_TABLE.length; i < level; i++) { need += step; step += 1; }
    return need;
  }
  function calculateStars(ratio) { return ratio > 0.9 ? 3 : (ratio > 0.6 ? 2 : (ratio > 0.3 ? 1 : 0)); }

  function makeState() {
    return {
      state: 'menu', mode: 'campaign', paused: false, last: 0, time: 0, selectedLevel: 0, skillPage: 0, pageTurn: null,
      battleSpeed: 1, speedUnlockOpen: false,
      player: {}, skills: {}, cardLevels: {}, cardOrder: [],
      enemies: [], bullets: [], parts: [], booms: [], floaters: [], zones: [], arcs: [], telegraphs: [],
      spawnTimer: 0, shake: 0, damageFlash: 0,
      waveIndex: 0, waveKills: 0, waveSpawned: 0, bossSpawned: false,
      waveLead: 0, pendingLevelUps: 0, refreshes: 0, coins: 0, lastCoins: 0, metaReturn: null, metaResetOpen: false,
      choices: [], choicesCompleted: 0, choiceHistory: [], currentOfferElements: [], fullscreenSince: null, progress: R.progress(P.loadProgress()), result: null,
      candidates: [], equippedOrder: [], focusedSkill: C.loadout.initial, sweeps: [],
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

  function isEndless() { return G.mode === 'endless'; }
  function levelConfig() { return isEndless() ? C.endless : C.levels[G.selectedLevel]; }
  function waveConfig() {
    if (!isEndless()) return levelConfig().waves[G.waveIndex];
    var e = C.endless;
    return { kills: e.normals + e.miniBosses + e.bosses, miniBosses: e.miniBosses, bosses: e.bosses, boss: true,
      pool: e.pool, interval: Math.max(e.minInterval, e.interval / Math.pow(C.spawnSpeedPerWave, G.waveIndex)) };
  }
  function dangerY() { return C.hero.y - 8; }
  function toast(text, color) { G.toast = { text: text, color: color || '#fff', time: 1.6 }; }

  function recomputeDerived() {
    SKILLS.forEach(function (s) {
      var state = G.skills[s.id] || { cd: 0, owned: s.id === C.loadout.initial };
      state.derived = R.derive(G, s.id); G.skills[s.id] = state;
    });
  }
  function toggleCandidate(id) {
    var s = R.skill(id);
    if (G.state !== 'menu' || !s || s.id === C.loadout.initial || s.mode === 'fullscreen') return false;
    var ids = G.progress.candidates, index = ids.indexOf(id);
    if (index >= 0) ids.splice(index, 1);
    else { if (ids.length >= C.loadout.candidates) { toast('最多带入 7 个候选技能，请先取消一个'); return false; } ids.push(id); }
    P.saveProgress(G.progress); return true;
  }
  function resetRun(levelIndex) {
    if (levelIndex === -1 && !isEndlessUnlocked()) { toast('前三关至少一星通关后解锁无尽模式'); return false; }
    bankCoins();
    G.state = 'playing'; G.mode = levelIndex === -1 ? 'endless' : 'campaign'; G.paused = false; G.last = P.now(); G.time = 0; G.selectedLevel = levelIndex; G.skillPage = 0;
    G.battleSpeed = 1; G.speedUnlockOpen = false;
    var totalStars = 0, starList = G.progress.stars || [];
    for (var si = 0; si < starList.length; si++) totalStars += starList[si] || 0;
    var starMul = isEndless() || levelIndex >= (C.starBonus.fromLevel || 1) ? 1 + (C.starBonus.perStar || 0) * totalStars : 1;
    var meta = G.progress.meta || {};
    var upgAtk = metaUpgrade('atk'), upgHp = metaUpgrade('hp'), upgShield = metaUpgrade('shield'), upgDef = metaUpgrade('def'), upgHaste = metaUpgrade('haste');
    var atkMul = 1 + (meta.atk || 0) * upgAtk.per;
    var maxhp = C.hero.hp * (1 + (meta.hp || 0) * upgHp.per);
    var shield = (meta.shield || 0) * upgShield.per;
    var defense = C.hero.defense * (1 + (meta.def || 0) * upgDef.per);
    var hastePct = Math.min(upgHaste.cap, (meta.haste || 0) * upgHaste.per);
    G.player = { hp: maxhp, maxhp: maxhp, shield: shield, maxShield: shield, defense: defense, cdMul: 1 - hastePct,
      lvl: 1, xp: 0, xpv: xpNeed(1), kills: 0, aim: -Math.PI / 2,
      starBonus: totalStars, damageBonus: (starMul - 1) + (atkMul - 1), damageMul: starMul + atkMul - 1, haste: hastePct };
    G.coins = 0; G.lastCoins = 0;
    G.cardLevels = {}; G.cardOrder = [];
    G.candidates = isEndless() ? SKILLS.filter(function (s) { return s.id !== C.loadout.initial; }).map(function (s) { return s.id; }) : G.progress.candidates.slice();
    G.equippedOrder = [C.loadout.initial]; G.focusedSkill = C.loadout.initial; G.sweeps = [];
    G.skills = {}; SKILLS.forEach(function (w) { G.skills[w.id] = { owned: w.id === 'basic', cd: 0 }; });
    G.enemies = []; G.bullets = []; G.parts = []; G.booms = []; G.floaters = []; G.zones = []; G.arcs = []; G.telegraphs = [];
    G.spawnTimer = 0.7; G.shake = 0; G.damageFlash = 0; G.waveIndex = 0; G.waveKills = 0; G.waveSpawned = 0;
    G.bossSpawned = false; G.waveLead = C.waveLeadSeconds; G.pendingLevelUps = 0; G.refreshes = 0;
    G.choices = []; G.choicesCompleted = 0; G.choiceHistory = []; G.currentOfferElements = []; G.fullscreenSince = null;
    G.ui.cards = []; G.result = null; recomputeDerived();
    toast((isEndless() ? '无尽模式 · ' : '') + '第 1 波', '#8fe9ff'); return true;
  }
  function isEndlessUnlocked() { return G.progress.stars.slice(0, C.endless.unlockClears).length === C.endless.unlockClears &&
    G.progress.stars.slice(0, C.endless.unlockClears).every(function (n) { return n > 0; }); }
  function isDoubleSpeedUnlocked() { return G.progress.doubleSpeedUnlocked || G.progress.stars[0] > 0; }
  function toggleBattleSpeed() {
    if (G.state !== 'playing' || G.paused) return false;
    if (!isDoubleSpeedUnlocked()) { G.speedUnlockOpen = true; G.paused = true; return true; }
    G.battleSpeed = G.battleSpeed === 2 ? 1 : 2; G.last = P.now(); return true;
  }
  function closeSpeedUnlock() {
    if (!G.speedUnlockOpen) return false;
    G.speedUnlockOpen = false; G.paused = false; G.last = P.now(); return true;
  }
  function buyDoubleSpeed() {
    if (G.state !== 'playing' || !G.speedUnlockOpen) return false;
    if (!isDoubleSpeedUnlocked()) {
      if (G.progress.coins + G.coins < C.doubleSpeedCost) return false;
      // 优先使用局外金币，差额使用本局已获得金币；不提前结算整局。
      var banked = Math.min(G.progress.coins, C.doubleSpeedCost);
      G.progress.coins -= banked; G.coins -= C.doubleSpeedCost - banked;
      G.progress.doubleSpeedUnlocked = true; P.saveProgress(G.progress);
    }
    closeSpeedUnlock(); G.battleSpeed = 2; A.pick(); return true;
  }
  function isLevelUnlocked(index) { return index === -1 ? isEndlessUnlocked() : index === 0 || (G.progress.stars[index - 1] || 0) > 0; }
  function chooseWeighted(pool) {
    var keys = Object.keys(pool), total = 0, i;
    for (i = 0; i < keys.length; i++) total += pool[keys[i]];
    var n = Math.random() * total;
    for (i = 0; i < keys.length; i++) { n -= pool[keys[i]]; if (n <= 0) return keys[i]; }
    return keys[0];
  }
  /* 怪物强度曲线：波次成长 × 波内逐只成长 × 关卡系数，第二只一定比第一只硬 */
  /* 角色升级仅影响 1-3 波血量、4-6 波防御，后续波次不再随等级增强。 */
  function enemyPhaseStat() { return G.waveIndex < 3 ? 'hp' : (G.waveIndex < 6 ? 'def' : null); }
  function spawnEnemy(key, sx, sy) {
    var type = C.enemyTypes[key], level = levelConfig(), curve = C.curve;
    var waveMul = Math.pow(curve.waveHpGrowth, G.waveIndex), defWaveMul = Math.pow(curve.waveDefGrowth, G.waveIndex);
    var idx = G.waveSpawned, spawnMul = 1 + curve.spawnGrowth * idx;
    var lvlMul = 1 + ((C.curve.levelEnemyGrowth || 1) - 1) * Math.max(0, G.player.lvl - 1);
    var phase = enemyPhaseStat();
    var hpMul = phase === 'hp' ? lvlMul : 1, defMul = phase === 'def' ? lvlMul : 1;
    var spdMul = curve.waveSpeedMultipliers[G.waveIndex] || 1;
    if (isEndless()) {
      waveMul = 1 + C.endless.hpGrowth * G.waveIndex; defWaveMul = 1 + C.endless.defGrowth * G.waveIndex;
      spawnMul = hpMul = defMul = 1;
      spdMul = Math.min(C.endless.speedCap, 1 + C.endless.speedGrowth * G.waveIndex);
    }
    var hp = type.hp * C.enemyHpMultiplier * level.hpScale * hpMul * waveMul * spawnMul;
    var x = sx === undefined ? 20 + Math.random() * (C.width - 40) : Math.max(12, Math.min(C.width - 12, sx));
    var y = sy === undefined ? -30 : sy;
    var elements = Object.keys(C.elements), el = elements[(Math.random() * elements.length) | 0];
    G.enemies.push({ id: ++spawnEnemy.uid, key: key, x: x, y: y,
      hp: hp, maxhp: hp, spd: type.spd * level.speedScale * spdMul, xp: type.xp,
      el: el, r: type.r, cell: type.cell, spr: type.spr, color: C.elements[el].color, def: type.def * level.defScale * defMul * defWaveMul * spawnMul,
      resist: type.resist, sway: type.sway ? 7 + Math.random() * 7 : 0, phase: Math.random() * Math.PI * 2,
      flash: 0, freezeT: 0, poisonT: 0, poisonDps: 0, boss: !!type.boss, miniboss: !!type.miniboss, dead: false });
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
    var bosses = w.bosses || (w.boss ? 1 : 0);
    var needsBoss = bosses > 0 && G.waveSpawned >= w.kills - bosses;
    if (needsBoss) { spawnEnemy('boss', x, y); G.bossSpawned = true; A.alarm(); toast('⚠ 首领来袭！', '#ff8787'); return; }
    if (G.waveSpawned >= w.kills - w.miniBosses - bosses) {
      spawnEnemy('miniboss', x, y); A.alarm(); toast('小首领来袭！', '#ff8787'); return;
    }
    spawnEnemy(chooseWeighted(w.pool), x, y);
  }
  var combat = PM.Combat.create(G, { kill: killEnemy, sound: function (name) { if (A[name]) A[name](); } });
  function updateSkills(dt) {
    SKILLS.forEach(function (s) {
      var state = G.skills[s.id]; if (!state || !state.owned) return;
      state.cd -= dt * 1000;
      if (state.cd <= 0) state.cd = combat.cast(state.derived) ? (s.persistent ? C.combat.persistentTick * 1000 : state.derived.cd) : 120;
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
  /* 主角每升 1 级，按当前阶段给怪 +5%（线性）：1-3 波血量、4-6 波防御。 */
  function scaleEnemiesOnLevelUp() {
    if (isEndless()) return; // 无尽只按波次成长，避免角色升级突破速度上限。
    var phase = enemyPhaseStat();
    if (!phase) return;
    var g = C.curve.levelEnemyGrowth || 1;
    if (g === 1) return;
    var newMul = 1 + (g - 1) * Math.max(0, G.player.lvl - 1);
    var oldMul = 1 + (g - 1) * Math.max(0, G.player.lvl - 2);
    var ratio = oldMul > 0 ? newMul / oldMul : 1;
    G.enemies.forEach(function (e) {
      if (e.dead) return;
      if (phase === 'hp') { e.maxhp *= ratio; e.hp *= ratio; }
      else if (phase === 'def') { e.def = (e.def || 0) * ratio; }
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
    enemy.dead = true; G.player.kills++; G.waveKills++;
    G.coins += (C.meta.killCoins || 1) * (isEndless() ? C.endless.coinMultiplier : 1);
    var xp = enemy.xp * C.xpMultiplier * (isEndless() ? C.endless.xpMultiplier : 1);
    G.floaters.push({ x: enemy.x, y: enemy.y, text: '+' + xp, color: '#b8ff6b', age: 0, life: 0.9 });
    burst(enemy.x, enemy.y, enemy.color, enemy.boss ? 36 : 12, enemy.boss ? 300 : 150);
    G.shake = Math.max(G.shake, enemy.boss ? 13 : 3); A.hit();
    addExperience(xp);
  }
  function isFinalWave() { return !isEndless() && G.waveIndex >= levelConfig().waves.length - 1; }
  function waveSpawnComplete() { return G.waveSpawned >= waveConfig().kills; }
  function fieldClear() { return !G.enemies.some(function (e) { return !e.dead; }); }
  /* 末波刷完且场上残敌全部清除才结算；中途不清场。 */
  function settleCombatFlow() {
    if (G.state !== 'playing') return;
    if (isFinalWave() && waveSpawnComplete() && fieldClear()) {
      G.pendingLevelUps = 0; G.choices = []; G.ui.cards = []; finishLevel(); return;
    }
    if (G.pendingLevelUps > 0) openLevelUp();
  }
  function ownedSkills() { return SKILLS.filter(function (w) { return G.skills[w.id] && G.skills[w.id].owned; }).length; }
  function shuffled(list) {
    for (var i = list.length - 1; i > 0; i--) { var j = (Math.random() * (i + 1)) | 0, tmp = list[i]; list[i] = list[j]; list[j] = tmp; }
    return list;
  }
  // 历史记录已完成的两轮选项元素；刷新属于同一轮，不推进保底或连续次数。
  function repeatedElement(el) {
    return G.choiceHistory.length === 2 && G.choiceHistory.every(function (round) { return round.indexOf(el) >= 0; });
  }
  function recordOffers() {
    G.choices.forEach(function (ch) {
      if (!ch.card.unlock) return;
      var el = R.skill(ch.card.unlock).el;
      if (G.currentOfferElements.indexOf(el) < 0) G.currentOfferElements.push(el);
    });
  }
  function fullscreenChance() {
    return G.fullscreenSince === null ? 0 : Math.min(100, 30 + 10 * (G.choicesCompleted - G.fullscreenSince));
  }
  // 全屏共用一次概率判定，命中后直接占一项；不能再经普通抽样漏出或漏掉。
  function buildChoices() {
    var available = R.pool(G), fullscreens = available.filter(function (ch) { return ch.card.unlock && R.skill(ch.card.unlock).mode === 'fullscreen'; });
    if (!fullscreens.length) G.fullscreenSince = null;
    else if (G.fullscreenSince === null) G.fullscreenSince = G.choicesCompleted;
    var pool = available.filter(function (ch) {
      return !ch.card.unlock || (R.skill(ch.card.unlock).mode !== 'fullscreen' && !repeatedElement(R.skill(ch.card.unlock).el));
    });
    var upgrades = pool.filter(function (ch) { return !ch.card.unlock; }), skills = pool.filter(function (ch) { return ch.card.unlock; });
    var selected = [];
    if (fullscreens.length && Math.random() * 100 < fullscreenChance()) selected.push(fullscreens[(Math.random() * fullscreens.length) | 0]);
    if (upgrades.length) selected.push(upgrades[(Math.random() * upgrades.length) | 0]);
    if ((G.choicesCompleted + 1) % 3 === 0 && skills.length && !selected.some(function (ch) { return ch.card.unlock; })) selected.push(skills[(Math.random() * skills.length) | 0]);
    var rest = shuffled(pool.filter(function (ch) { return selected.indexOf(ch) < 0; })).slice(0, 4 - selected.length);
    return shuffled(selected.concat(rest));
  }
  function openLevelUp() {
    G.currentOfferElements = []; G.choices = buildChoices(); recordOffers();
    if (!G.choices.length) { G.pendingLevelUps = 0; return; }
    G.state = 'levelup'; A.level();
  }
  function refreshChoices() {
    if (G.state !== 'levelup' || G.refreshes <= 0) return false;
    var next = buildChoices();
    if (!next.length) return false;
    G.refreshes--;
    G.choices = next; recordOffers(); G.ui.cards = []; A.pick();
    return true;
  }
  function applyChoice(choice) {
    if (G.state !== 'levelup' || !choice || !choice.card) return false;
    var card = R.card(choice.card.id);
    if (!card || !G.choices.some(function (ch) { return ch.card.id === card.id; }) || !R.pool(G).some(function (ch) { return ch.card.id === card.id; })) return false;
    if (card.unlock) {
      G.skills[card.unlock].owned = true; G.equippedOrder.push(card.unlock);
      if (R.skill(card.unlock).mode === 'fullscreen') G.fullscreenSince = null;
      toast('获得 ' + R.skill(card.unlock).name + '！', R.skill(card.unlock).color);
    } else {
      if (!G.cardLevels[card.id]) G.cardOrder.push(card.id);
      G.cardLevels[card.id] = (G.cardLevels[card.id] || 0) + 1;
    }
    recomputeDerived(); G.focusedSkill = card.skill;
    G.skillPage = isEndless() ? Math.floor(G.equippedOrder.indexOf(card.skill) / C.loadout.slots) : 0;
    recordOffers();
    G.choiceHistory.push(G.currentOfferElements.slice());
    if (G.choiceHistory.length > 2) G.choiceHistory.shift();
    G.choicesCompleted++; G.currentOfferElements = [];
    G.pendingLevelUps = Math.max(0, G.pendingLevelUps - 1); G.choices = []; G.ui.cards = []; A.pick();
    if (G.pendingLevelUps > 0) openLevelUp();
    else { G.state = 'playing'; G.last = P.now(); }
    return true;
  }
  function nextWave() {
    var completed = G.waveIndex + 1, gained = isEndless() ? completed % 3 === 0 : completed === 3 || completed === 6 || completed === 9;
    G.waveIndex++; G.waveKills = 0; G.waveSpawned = 0; G.bossSpawned = false; G.spawnTimer = 0.2;
    G.waveLead = C.waveLeadSeconds; G.last = P.now();
    if (updateEndlessRecords()) P.saveProgress(G.progress);
    if (gained) G.refreshes++;
    toast('第 ' + (G.waveIndex + 1) + ' 波来临' + (gained ? ' · 刷新机会 +1' : ''), '#8fe9ff');
  }
  function finishLevel() {
    var ratio = G.player.hp / G.player.maxhp, stars = calculateStars(ratio), flawless = ratio >= 0.999999;
    bankCoins();
    G.result = { stars: stars, flawless: flawless, ratio: ratio, coins: G.lastCoins };
    if (stars > (G.progress.stars[G.selectedLevel] || 0)) G.progress.stars[G.selectedLevel] = stars;
    if (flawless) G.progress.flawless[G.selectedLevel] = true;
    P.saveProgress(G.progress); G.state = 'cleared'; G.telegraphs = []; A.clear();
  }
  function hurtPlayer(attack) {
    if (G.state !== 'playing') return;
    var remaining = R.damage(attack, G.player.defense, 0, G.player.lvl, G.waveIndex + 1);
    if (G.player.shield > 0) {
      var absorbed = Math.min(G.player.shield, remaining);
      G.player.shield -= absorbed; remaining -= absorbed;
    }
    if (remaining > 0) G.player.hp -= remaining;
    G.damageFlash = 1; G.shake = Math.max(G.shake, 8); A.hurt();
    if (G.player.hp <= 0) {
      G.player.hp = 0; bankCoins(); G.state = 'over'; G.enemies = []; G.bullets = []; G.zones = []; G.telegraphs = []; A.fail();
    }
  }
  function updateEffects(dt) {
    G.parts.forEach(function (p) { p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.gravity) p.vy += p.gravity * dt; p.vx *= 0.94; });
    G.parts = G.parts.filter(function (p) { return p.age < p.life; });
    G.booms.forEach(function (b) { b.age += dt; }); G.booms = G.booms.filter(function (b) { return b.age < b.life; });
    G.arcs.forEach(function (a) { a.age += dt; }); G.arcs = G.arcs.filter(function (a) { return a.age < a.life; });
    G.sweeps.forEach(function (v) { v.age += dt; }); G.sweeps = G.sweeps.filter(function (v) { return v.age < v.life; });
    G.floaters.forEach(function (f) { f.age += dt; f.y -= 30 * dt; }); G.floaters = G.floaters.filter(function (f) { return f.age < f.life; });
    G.shake = Math.max(0, G.shake - dt * 40); G.damageFlash = Math.max(0, G.damageFlash - dt * 2); G.toast.time -= dt;
  }
  function updateStep(dt) {
    if (G.state !== 'playing' || G.paused) return;
    G.time += dt * 1000; G.spawnTimer -= dt;
    if (G.spawnTimer <= 0 && G.waveSpawned < waveConfig().kills) {
      spawnBatch();
      G.spawnTimer = waveConfig().interval * C.spawnGroupTimeFactor * (0.8 + Math.random() * 0.4) * (G.waveIndex < (C.curve.openingReliefWaves || 1) ? (C.curve.openingRelief || 1) : 1);
    }
    /* 本波最后一只怪已出场 → 倒计时接下一波，全程不打断 */
    if (waveSpawnComplete()) { if (!isFinalWave()) { G.waveLead -= dt; if (G.waveLead <= 0) nextWave(); } }
    else G.waveLead = C.waveLeadSeconds;
    updateSkills(dt);
    G.enemies.forEach(function (e) {
      if (e.dead) return;
      combat.statuses(e, dt); if (e.dead) return;
      if (e.freezeT > 0) { e.freezeT -= dt; }
      else e.y += e.spd * dt * (1 - Math.min(.9, e.slow || 0));
      if (e.sway && e.freezeT <= 0) { e.phase += dt * 3; e.x += Math.sin(e.phase) * e.sway * dt * 6; e.x = Math.max(12, Math.min(C.width - 12, e.x)); }
      e.flash = Math.max(0, e.flash - dt * 6);
      if (e.y >= dangerY()) { e.dead = true; hurtPlayer(e.hp); burst(e.x, dangerY(), e.color, 10, 160); }
    });
    if (G.state === 'playing') combat.update(dt);
    G.enemies = G.enemies.filter(function (e) { return !e.dead; });
    settleCombatFlow(); updateEffects(dt);
  }
  function update(dt) {
    // 2× 按原步长多推进一次，避免放大单步导致高速弹道、生成技或状态结算跳帧。
    var steps = G.battleSpeed === 2 && isDoubleSpeedUnlocked() ? 2 : 1;
    for (var i = 0; i < steps; i++) {
      if (G.state !== 'playing' || G.paused) break;
      updateStep(dt);
    }
  }
  function updateEndlessRecords() {
    if (!isEndless() || !G.player || !Number.isFinite(G.player.kills)) return false;
    var record = G.progress.endless, wave = Math.max(record.bestWave, G.waveIndex), kills = Math.max(record.bestKills, G.player.kills);
    var changed = wave !== record.bestWave || kills !== record.bestKills;
    record.bestWave = wave; record.bestKills = kills; return changed;
  }
  function bankCoins() {
    var changed = updateEndlessRecords();
    if (G.coins) {
      G.lastCoins = G.coins;
      G.progress.coins = (G.progress.coins || 0) + G.coins;
      G.coins = 0; changed = true;
    }
    if (changed) P.saveProgress(G.progress);
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
    return upg.base + upg.costStep * lv;
  }
  function buyMeta(id) {
    if (G.metaResetOpen) return false;
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
  function metaResetQuote() {
    var spent = 0, levels = 0;
    C.meta.upgrades.forEach(function (upg) {
      var lv = G.progress.meta[upg.id] || 0;
      // 每项价格独立递增，按已购各级的原价求和，不能用当前下一级价格乘等级。
      spent += lv * upg.base + upg.costStep * lv * (lv - 1) / 2; levels += lv;
    });
    return { levels: levels, spent: spent, refund: Math.floor(spent * C.meta.refundRatio) };
  }
  function openMetaReset() {
    if (G.state !== 'meta' || !metaResetQuote().levels) return false;
    G.metaResetOpen = true; return true;
  }
  function closeMetaReset() { G.metaResetOpen = false; }
  function resetMeta() {
    if (G.state !== 'meta' || !G.metaResetOpen) return false;
    var quote = metaResetQuote(); G.metaResetOpen = false;
    if (!quote.levels) return false;
    C.meta.upgrades.forEach(function (upg) { G.progress.meta[upg.id] = 0; });
    G.progress.coins += quote.refund; P.saveProgress(G.progress); A.pick(); return true;
  }
  function openMeta() {
    if (G.state === 'playing' || G.state === 'levelup' || G.state === 'over' || G.state === 'cleared') return;
    G.metaReturn = G.state === 'meta' ? G.metaReturn : G.state;
    G.metaResetOpen = false; G.state = 'meta';
  }
  function leaveMeta() { G.metaResetOpen = false; G.state = ['levelselect', 'endlessselect'].indexOf(G.metaReturn) >= 0 ? G.metaReturn : 'menu'; G.metaReturn = null; }
  function loadoutReady() { return G.progress.candidates.length === C.loadout.candidates; }
  function canSelectLevel() { return loadoutReady() || isEndlessUnlocked(); }
  function openLevelSelect() {
    if (!canSelectLevel()) {
      toast('请先选满 7 个候选技能（当前 ' + G.progress.candidates.length + '/7）', '#ffd166');
      return false;
    }
    bankCoins(); G.pageTurn = null; G.state = 'levelselect'; return true;
  }
  function openEndlessSelect() { bankCoins(); G.paused = false; G.pageTurn = null; G.state = 'endlessselect'; return true; }
  function changeSelectionPage(delta) {
    if (G.state !== 'levelselect' && G.state !== 'endlessselect') return false;
    var page = G.state === 'levelselect' ? 0 : 1, next = page + delta;
    if (next < 0 || next > 1 || next === page || (G.pageTurn && G.pageTurn.time > 0)) return false;
    G.pageTurn = { from: page, to: next, time: .24, duration: .24, direction: delta };
    G.state = next === 0 ? 'levelselect' : 'endlessselect'; return true;
  }
  function returnToSelection() { return isEndless() ? openEndlessSelect() : openLevelSelect(); }
  function canContinue() { return !isEndless() && G.result && G.result.stars > 0 && G.selectedLevel + 1 < C.levels.length; }
  function ownedCards() {
    return G.cardOrder.map(function (id) {
      var card = CARDS.filter(function (item) { return item.id === id; })[0];
      return { card: card, level: G.cardLevels[id] };
    });
  }
  function selectSkill(id) {
    if (G.state !== 'playing' || G.paused || !G.skills[id] || !G.skills[id].owned) return false;
    G.focusedSkill = id; G.skillPage = isEndless() ? Math.floor(G.equippedOrder.indexOf(id) / C.loadout.slots) : 0; return true;
  }
  function changeSkillPage(delta) {
    if (!isEndless() || G.state !== 'playing' || G.paused) return false;
    var next = G.skillPage + delta, pages = Math.ceil(G.equippedOrder.length / C.loadout.slots);
    if (next < 0 || next >= pages) return false;
    G.skillPage = next; G.focusedSkill = G.equippedOrder[next * C.loadout.slots]; return true;
  }
  PM.Gameplay = {
    state: G, combat: combat, toggleCandidate: toggleCandidate, choicePool: function () { return R.pool(G); }, buildChoices: buildChoices, update: update, resetRun: resetRun, openLevelSelect: openLevelSelect, openEndlessSelect: openEndlessSelect, returnToSelection: returnToSelection, openMenu: function () { bankCoins(); G.state = 'menu'; }, applyChoice: applyChoice,
    isLevelUnlocked: isLevelUnlocked, isEndless: isEndless, isEndlessUnlocked: isEndlessUnlocked, loadoutReady: loadoutReady, canSelectLevel: canSelectLevel, canContinue: canContinue, calculateStars: calculateStars,
    grantExperience: grantExperience, isBossActive: hasBoss, ownedCards: ownedCards, xpNeed: xpNeed,
    ownedSkills: ownedSkills, selectSkill: selectSkill, changeSkillPage: changeSkillPage, changeSelectionPage: changeSelectionPage,
    recompute: recomputeDerived, refreshChoices: refreshChoices, fullscreenChance: fullscreenChance,
    isDoubleSpeedUnlocked: isDoubleSpeedUnlocked, toggleBattleSpeed: toggleBattleSpeed, buyDoubleSpeed: buyDoubleSpeed, closeSpeedUnlock: closeSpeedUnlock,
    openMeta: openMeta, leaveMeta: leaveMeta, buyMeta: buyMeta, metaCost: metaCost, totalStars: totalStars, bankCoins: bankCoins,
    metaResetQuote: metaResetQuote, openMetaReset: openMetaReset, closeMetaReset: closeMetaReset, resetMeta: resetMeta,
    pause: function (value) { if (G.speedUnlockOpen) return; G.paused = value; G.last = P.now(); },
    toast: toast, dangerY: dangerY, waveConfig: waveConfig
  };
})(typeof GameGlobal !== 'undefined' ? GameGlobal : window);
