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
      state: 'menu', mode: 'campaign', paused: false, last: 0, time: 0, selectedLevel: 0, skillPage: 0,
      player: {}, move: { x: 0, y: 0 }, cam: { x: 0, y: 0 }, skills: {}, cardLevels: {}, cardOrder: [],
      enemies: [], bullets: [], parts: [], booms: [], floaters: [], zones: [], arcs: [], telegraphs: [],
      props: [], stones: [], bushes: [], chests: [], chestTimer: 0,
      spawnTimer: 0, shake: 0, damageFlash: 0,
      waveIndex: 0, waveKills: 0, waveSpawned: 0, bossSpawned: false,
      waveLead: 0, pendingLevelUps: 0, refreshes: 0, coins: 0, lastCoins: 0, metaReturn: null,
      choices: [], choicesCompleted: 0, choiceHistory: [], currentOfferElements: [], progress: R.progress(P.loadProgress()), result: null,
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
  /* 镜头始终以角色为中心，并夹在世界边界内；视口即“交战线”，镜头外的敌人不可被攻击。 */
  function clampCamera() {
    G.cam.x = Math.max(0, Math.min(C.world.w - C.width, G.player.x - C.width / 2));
    G.cam.y = Math.max(0, Math.min(C.world.h - C.height, G.player.y - C.height / 2));
  }
  function view() { return { x: G.cam.x, y: G.cam.y, w: C.width, h: C.height }; }
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
    G.player = { x: C.world.w / 2, y: C.world.h / 2, hp: maxhp, maxhp: maxhp, shield: shield, defense: defense,
      lvl: 1, xp: 0, xpv: xpNeed(1), kills: 0, aim: -Math.PI / 2, walk: 0,
      starBonus: totalStars, damageBonus: (starMul - 1) + (atkMul - 1), haste: hastePct,
      /* 宝箱修正：均为本局内的累加值，与局外加成分开存放，互不污染 */
      speedMod: 0, hasteMod: 0, damageMod: 0 };
    G.move = { x: 0, y: 0 }; G.joy = null; clampCamera();    G.coins = 0; G.lastCoins = 0;
    G.cardLevels = {}; G.cardOrder = [];
    G.candidates = isEndless() ? SKILLS.filter(function (s) { return s.id !== C.loadout.initial; }).map(function (s) { return s.id; }) : G.progress.candidates.slice();
    G.equippedOrder = [C.loadout.initial]; G.focusedSkill = C.loadout.initial; G.sweeps = [];
    G.skills = {}; SKILLS.forEach(function (w) { G.skills[w.id] = { owned: w.id === 'basic', cd: 0 }; });
    G.enemies = []; G.bullets = []; G.parts = []; G.booms = []; G.floaters = []; G.zones = []; G.arcs = []; G.telegraphs = [];
    /* 每局重排地图：石头与草丛都随机，使每局的走位路线不同。 */
    G.props = genProps();
    G.stones = G.props.filter(function (p) { return p.kind === 'stone'; });
    G.bushes = G.props.filter(function (p) { return p.kind === 'bush'; });
    G.chests = []; G.chestTimer = C.chest.firstDelay;
    G.spawnTimer = 0.7; G.shake = 0; G.damageFlash = 0; G.waveIndex = 0; G.waveKills = 0; G.waveSpawned = 0;
    G.bossSpawned = false; G.waveLead = C.waveLeadSeconds; G.pendingLevelUps = 0; G.refreshes = 0;
    G.choices = []; G.choicesCompleted = 0; G.choiceHistory = []; G.currentOfferElements = [];
    G.ui.cards = []; G.result = null; recomputeDerived();
    toast((isEndless() ? '无尽模式 · ' : '') + '第 1 波', '#8fe9ff'); return true;
  }
  function isEndlessUnlocked() { return G.progress.stars.slice(0, C.endless.unlockClears).length === C.endless.unlockClears &&
    G.progress.stars.slice(0, C.endless.unlockClears).every(function (n) { return n > 0; }); }
  function isLevelUnlocked(index) { return index === -1 ? isEndlessUnlocked() : index === 0 || (G.progress.stars[index - 1] || 0) > 0; }
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
    var waveMul = Math.pow(curve.waveHpGrowth, G.waveIndex), defWaveMul = Math.pow(curve.waveDefGrowth, G.waveIndex);
    var idx = G.waveSpawned, spawnMul = 1 + curve.spawnGrowth * idx;
    var lvlMul = 1 + ((C.curve.levelEnemyGrowth || 1) - 1) * Math.max(0, G.player.lvl - 1);
    var phase = enemyPhaseStat();
    var hpMul = phase === 'hp' ? lvlMul : 1, defMul = phase === 'def' ? lvlMul : 1, spdMul = phase === 'speed' ? lvlMul : 1;
    if (isEndless()) {
      waveMul = 1 + C.endless.hpGrowth * G.waveIndex; defWaveMul = 1 + C.endless.defGrowth * G.waveIndex;
      spawnMul = hpMul = defMul = 1;
      spdMul = Math.min(C.endless.speedCap, 1 + C.endless.speedGrowth * G.waveIndex);
    }
    var hp = type.hp * C.enemyHpMultiplier * level.hpScale * hpMul * waveMul * spawnMul;
    /* 落点夹在世界内（不是屏幕内）：地图比视口大，屏幕坐标夹取会把整批怪挤到同一侧。 */
    var x = sx === undefined ? C.spawnRing.margin + Math.random() * (C.world.w - C.spawnRing.margin * 2) : Math.max(12, Math.min(C.world.w - 12, sx));
    var y = sy === undefined ? C.spawnRing.margin + Math.random() * (C.world.h - C.spawnRing.margin * 2) : Math.max(12, Math.min(C.world.h - 12, sy));
    var elements = Object.keys(C.elements), el = elements[(Math.random() * elements.length) | 0];
    G.enemies.push({ id: ++spawnEnemy.uid, key: key, x: x, y: y,
      hp: hp, maxhp: hp, spd: type.spd * level.speedScale * spdMul, xp: type.xp,
      el: el, r: type.r, cell: type.cell, spr: type.spr, color: C.elements[el].color, def: type.def * level.defScale * defMul * defWaveMul * spawnMul,
      resist: type.resist, sway: type.sway ? 7 + Math.random() * 7 : 0, phase: Math.random() * Math.PI * 2,
      side: Math.random() < .5 ? 1 : -1,
      flash: 0, freezeT: 0, poisonT: 0, poisonDps: 0, boss: !!type.boss, miniboss: !!type.miniboss, dead: false });
    /* 环形刷点可能正好落在石头里：出生即挤到石头边缘，避免一出生就被判定卡住。 */
    pushOutOfStones(G.enemies[G.enemies.length - 1], type.r);
    G.waveSpawned++;
  }
  spawnEnemy.uid = 0;
  function hasBoss() { return G.enemies.some(function (e) { return e.boss && !e.dead; }); }
  /* 视野外环形随机点：先求角色所在视口沿该角度的出屏距离，再按 1.04~1.4 倍外推到镜头外；
     落点若出了世界边界就换一个角度，怪不会刷在地图墙外。 */
  function ringPoint() {
    var p = G.player, cam = G.cam, margin = C.spawnRing.margin;
    for (var i = 0; i < 16; i++) {
      var angle = Math.random() * Math.PI * 2, cos = Math.cos(angle), sin = Math.sin(angle);
      var tx = Math.abs(cos) < 1e-6 ? Infinity : (cos > 0 ? (cam.x + C.width - p.x) / cos : (cam.x - p.x) / cos);
      var ty = Math.abs(sin) < 1e-6 ? Infinity : (sin > 0 ? (cam.y + C.height - p.y) / sin : (cam.y - p.y) / sin);
      var dist = Math.min(tx, ty) * (C.spawnRing.min + Math.random() * (C.spawnRing.max - C.spawnRing.min));
      var x = p.x + cos * dist, y = p.y + sin * dist;
      if (x >= margin && x <= C.world.w - margin && y >= margin && y <= C.world.h - margin) return { x: x, y: y };
    }
    return { x: Math.max(margin, Math.min(C.world.w - margin, p.x)),
      y: Math.max(margin, Math.min(C.world.h - margin, p.y - C.height / 2 - 40)) };
  }
  /* 地图装饰：每局开始时随机撒点。石头要满足「离出生点 spawnClear」「彼此留 gap」两条约束，
     撒不下就放弃这一块（宁可少一块石头，也不要把地图切成走不通的死角）。 */
  function genProps() {
    var cfg = C.props, list = [], cx = C.world.w / 2, cy = C.world.h / 2;
    function fits(x, y, r, minGap, avoidSpawn) {
      if (avoidSpawn && Math.hypot(x - cx, y - cy) < cfg.spawnClear + r) return false;
      for (var i = 0; i < list.length; i++) {
        var p = list[i];
        if (Math.hypot(p.x - x, p.y - y) < p.r + r + minGap) return false;
      }
      return true;
    }
    for (var i = 0; i < cfg.stoneCount; i++) {
      for (var tries = 0; tries < 60; tries++) {
        var r = cfg.stoneR[0] + Math.random() * (cfg.stoneR[1] - cfg.stoneR[0]);
        var x = cfg.edge + r + Math.random() * (C.world.w - (cfg.edge + r) * 2);
        var y = cfg.edge + r + Math.random() * (C.world.h - (cfg.edge + r) * 2);
        if (!fits(x, y, r, cfg.gap, true)) continue;
        list.push({ kind: 'stone', x: x, y: y, r: r, phase: Math.random() * Math.PI * 2, tone: Math.random() });
        break;
      }
    }
    for (var j = 0; j < cfg.bushCount; j++) {
      for (var t2 = 0; t2 < 40; t2++) {
        var br = cfg.bushR[0] + Math.random() * (cfg.bushR[1] - cfg.bushR[0]);
        var bx = cfg.edge + Math.random() * (C.world.w - cfg.edge * 2);
        var by = cfg.edge + Math.random() * (C.world.h - cfg.edge * 2);
        /* 草丛之间允许轻微重叠，只避开石头本体，且不占用出生点留空区。 */
        if (!fits(bx, by, br * 0.55, 4, true)) continue;
        list.push({ kind: 'bush', x: bx, y: by, r: br, phase: Math.random() * Math.PI * 2, tone: Math.random() });
        break;
      }
    }
    return list;
  }
  /* 前瞻点是否压到石头：敌人绕行用，命中返回那块石头，否则 null。 */
  function stoneHit(x, y, r) {
    var list = G.stones || [];
    for (var i = 0; i < list.length; i++) {
      var s = list[i], dx = x - s.x, dy = y - s.y, min = s.r + r;
      if (dx * dx + dy * dy < min * min) return s;
    }
    return null;
  }
  /* 圆-圆推出：把移动体挤出石头。只平移位置、不改速度方向，
     于是贴着石头走时切向分量会保留下来，表现为沿边缘滑过去而不是被粘住。 */
  function pushOutOfStones(o, r) {
    var list = G.stones || [], moved = false;
    for (var i = 0; i < list.length; i++) {
      var s = list[i], dx = o.x - s.x, dy = o.y - s.y, min = s.r + r;
      var d2 = dx * dx + dy * dy;
      if (d2 >= min * min) continue;
      var d = Math.sqrt(d2);
      if (d < 1e-4) { dx = 0; dy = 1; d = 1; }  // 圆心重合时给个固定方向，避免除零抖动
      o.x = s.x + dx / d * min; o.y = s.y + dy / d * min;
      moved = true;
    }
    return moved;
  }
  /* 草丛判定用收缩半径：站在叶片边缘不算藏进去，避免半透明频繁闪烁。 */
  function inBush(x, y) {
    var list = G.bushes || [];
    for (var i = 0; i < list.length; i++) {
      var b = list[i], dx = x - b.x, dy = y - b.y, rr = b.r * .72;
      if (dx * dx + dy * dy < rr * rr) return true;
    }
    return false;
  }
  /* 宝箱刷新点：只落在当前视口内，玩家能看见才有“要不要冒险去捡”的抉择；
     离角色至少 130px（不会糊在脚下），并避开石头。 */
  function chestPoint() {
    var p = G.player, cam = G.cam, pad = 44, cfg = C.chest;
    for (var i = 0; i < 40; i++) {
      var x = cam.x + pad + Math.random() * (C.width - pad * 2);
      var y = cam.y + pad + Math.random() * (C.height - pad * 2);
      if (Math.hypot(x - p.x, y - p.y) < 130) continue;
      if (stoneHit(x, y, cfg.r + 8)) continue;
      return { x: x, y: y };
    }
    return null;
  }
  function spawnChest() {
    var point = chestPoint();
    if (!point) return false;
    G.chests.push({ id: ++spawnChest.uid, x: point.x, y: point.y, r: C.chest.r,
      age: 0, life: C.chest.life, phase: Math.random() * Math.PI * 2, dead: false });
    return true;
  }
  spawnChest.uid = 0;
  /* 开箱：增益与减益共用同一组幅度（step），只是符号相反，因此强度对称。
     结果只有开箱瞬间才揭晓——宝箱本体在所有方面都长得一样。 */
  function openChest(box) {
    box.dead = true;
    var kind = chooseWeighted(C.chest.weight), st = C.chest.step, p = G.player, name, color;
    if (kind === 'luxury') {
      burst(box.x, box.y, '#ffd166', 34, 260); G.shake = Math.max(G.shake, 10); A.clear();
      G.floaters.push({ x: box.x, y: box.y, text: '豪华奖励', color: '#ffd166', age: 0, life: 1.6 });
      if (isEndless()) {
        /* 无尽模式没有终点，直接结算无从谈起：改为回满生命并给一笔金币 */
        p.hp = p.maxhp; G.coins += 50;
        toast('豪华奖励：回满生命 + 50 金币', '#ffd166');
      } else {
        toast('豪华奖励：本关直接通关', '#ffd166');
        finishLevel(true);
      }
      return;
    }
    if (kind === 'speedUp') { p.speedMod = Math.min(.75, p.speedMod + st.speed); name = '移速 +' + Math.round(st.speed * 100) + '%'; color = '#8fe9ff'; }
    else if (kind === 'speedDown') { p.speedMod = Math.max(-.55, p.speedMod - st.speed); name = '移速 -' + Math.round(st.speed * 100) + '%'; color = '#ff8b8b'; }
    else if (kind === 'hasteUp') { p.hasteMod = Math.min(.5, p.hasteMod + st.haste); name = '攻速 +' + Math.round(st.haste * 100) + '%'; color = '#8fe9ff'; }
    else if (kind === 'hasteDown') { p.hasteMod = Math.max(-.5, p.hasteMod - st.haste); name = '攻速 -' + Math.round(st.haste * 100) + '%'; color = '#ff8b8b'; }
    else if (kind === 'damageUp') { p.damageMod = Math.min(.8, p.damageMod + st.damage); name = '伤害 +' + Math.round(st.damage * 100) + '%'; color = '#8fe9ff'; }
    else { p.damageMod = Math.max(-.6, p.damageMod - st.damage); name = '伤害 -' + Math.round(st.damage * 100) + '%'; color = '#ff8b8b'; }
    recomputeDerived();
    A.level();
    G.floaters.push({ x: box.x, y: box.y, text: name, color: color, age: 0, life: 1.2 });
    burst(box.x, box.y, color, 12, 150);
    toast('宝箱：' + name, color);
  }
  /* 宝箱计时：只在成功落地后重置间隔；同屏满员或找不到落点时 2 秒后再试，
     避免每帧重试把刷新率偷偷拉高。 */
  function updateChests(dt) {
    var cfg = C.chest;
    for (var i = 0; i < G.chests.length; i++) {
      var box = G.chests[i];
      if (box.dead) continue;
      box.age += dt;
      if (box.age >= cfg.life) { box.dead = true; continue; }
      if (Math.hypot(G.player.x - box.x, G.player.y - box.y) <= cfg.pickupR + C.hero.r) openChest(box);
    }
    G.chests = G.chests.filter(function (b) { return !b.dead; });
    if (G.state !== 'playing') return;   // 豪华奖励可能已经结算通关
    G.chestTimer -= dt;
    if (G.chestTimer <= 0) {
      if (G.chests.length < cfg.max && spawnChest()) G.chestTimer = cfg.interval[0] + Math.random() * (cfg.interval[1] - cfg.interval[0]);
      else G.chestTimer = 2;
    }
  }
  function spawnBatch() {
    var w = waveConfig();
    var lvl = Math.max(1, G.player.lvl);
    var groupBase = C.spawnGroupBase + C.spawnGroupPerLevel * (lvl - 1);
    var group = Math.floor(groupBase) + Math.floor(Math.random() * ((C.spawnGroupRandom || 0) + 1));
    group = Math.min(C.spawnGroupMax || 99, Math.max(1, group));
    group = Math.min(group, w.kills - G.waveSpawned);
    /* 每只怪各自取环形点：整批从四周包围角色，而不是从固定一侧涌入。 */
    for (var i = 0; i < group; i++) { var point = ringPoint(); spawnForWave(point.x, point.y); }
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
  /* 隐藏机制：主角每升 1 级，按当前波次阶段给怪 +5%（线性）：1-3 波血、4-6 波防、7-10 波速 */
  function scaleEnemiesOnLevelUp() {
    if (isEndless()) return; // 无尽只按波次成长，避免角色升级突破速度上限。
    var g = C.curve.levelEnemyGrowth || 1;
    if (g === 1) return;
    var newMul = 1 + (g - 1) * Math.max(0, G.player.lvl - 1);
    var oldMul = 1 + (g - 1) * Math.max(0, G.player.lvl - 2);
    var ratio = oldMul > 0 ? newMul / oldMul : 1;
    var phase = enemyPhaseStat();
    G.enemies.forEach(function (e) {
      if (e.dead) return;
      if (phase === 'hp') { e.maxhp *= ratio; e.hp *= ratio; }
      else if (phase === 'def') { e.def = (e.def || 0) * ratio; }
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
  // 每轮保底强化，第 3/6/9… 轮另保底新技能；资格与连续元素限制优先。
  function buildChoices() {
    var pool = R.pool(G).filter(function (ch) { return !ch.card.unlock || !repeatedElement(R.skill(ch.card.unlock).el); });
    var upgrades = pool.filter(function (ch) { return !ch.card.unlock; }), skills = pool.filter(function (ch) { return ch.card.unlock; });
    var selected = [];
    if (upgrades.length) selected.push(upgrades[(Math.random() * upgrades.length) | 0]);
    if ((G.choicesCompleted + 1) % 3 === 0 && skills.length) selected.push(skills[(Math.random() * skills.length) | 0]);
    var rest = shuffled(pool.filter(function (ch) { return selected.indexOf(ch) < 0; })).slice(0, 4 - selected.length);
    return shuffled(selected.concat(rest));
  }
  function openLevelUp() {
    G.currentOfferElements = []; G.choices = buildChoices(); recordOffers();
    if (!G.choices.length) { G.pendingLevelUps = 0; return; }
    G.move = { x: 0, y: 0 }; G.joy = null; G.state = 'levelup'; A.level();
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
    if (gained) G.refreshes++;
    toast('第 ' + (G.waveIndex + 1) + ' 波来临' + (gained ? ' · 刷新机会 +1' : ''), '#8fe9ff');
  }
  /* luxury 为真时是宝箱的豪华奖励：不看剩余生命，直接按满星通关，
     但不算满血（flawless）记录，避免白嫖满血档。 */
  function finishLevel(luxury) {
    var ratio = G.player.hp / G.player.maxhp, stars = luxury ? 3 : calculateStars(ratio), flawless = !luxury && ratio >= 0.999999;
    bankCoins();
    G.result = { stars: stars, flawless: flawless, ratio: ratio, coins: G.lastCoins, luxury: !!luxury };
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
      G.player.hp = 0; bankCoins(); G.state = 'over'; G.move = { x: 0, y: 0 }; G.joy = null;
      G.enemies = []; G.bullets = []; G.zones = []; G.telegraphs = []; A.fail();
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
  /* 移动：move 为 [-1,1] 的方向向量（键盘为八向，摇杆为任意角度），长度大于 1 时归一化封顶。
     先夹世界边界，再被石头推出，最后再夹一次——推出有可能把角色顶到地图外。 */
  function moveHero(dt) {
    var mv = G.move || { x: 0, y: 0 }, len = Math.hypot(mv.x || 0, mv.y || 0);
    if (len > 1e-6) {
      var scale = len > 1 ? 1 / len : 1, speed = C.hero.speed * (1 + (G.player.speedMod || 0)), step = speed * dt;
      G.player.x = Math.max(C.hero.r, Math.min(C.world.w - C.hero.r, G.player.x + mv.x * scale * step));
      G.player.y = Math.max(C.hero.r, Math.min(C.world.h - C.hero.r, G.player.y + mv.y * scale * step));
      G.player.aim = Math.atan2(mv.y, mv.x);
      G.player.walk += dt * 12;
    }
    if (pushOutOfStones(G.player, C.hero.r)) {
      G.player.x = Math.max(C.hero.r, Math.min(C.world.w - C.hero.r, G.player.x));
      G.player.y = Math.max(C.hero.r, Math.min(C.world.h - C.hero.r, G.player.y));
    }
    G.player.inBush = inBush(G.player.x, G.player.y);
    clampCamera();
  }
  function update(dt) {
    if (G.state !== 'playing' || G.paused) return;
    G.time += dt * 1000; G.spawnTimer -= dt;
    moveHero(dt);
    if (G.spawnTimer <= 0 && G.waveSpawned < waveConfig().kills) {
      spawnBatch();
      G.spawnTimer = waveConfig().interval * C.spawnGroupTimeFactor * (0.8 + Math.random() * 0.4) * (G.waveIndex < (C.curve.openingReliefWaves || 1) ? (C.curve.openingRelief || 1) : 1);
    }
    /* 本波最后一只怪已出场 → 倒计时接下一波，全程不打断 */
    if (waveSpawnComplete()) { if (!isFinalWave()) { G.waveLead -= dt; if (G.waveLead <= 0) nextWave(); } }
    else G.waveLead = C.waveLeadSeconds;
    updateSkills(dt);
    /* 敌人全向追击：始终朝角色当前位置直线靠近，贴身即撞线扣血（攻击力=碰撞时剩余生命）。 */
    G.enemies.forEach(function (e) {
      if (e.dead) return;
      combat.statuses(e, dt); if (e.dead) return;
      var dx = G.player.x - e.x, dy = G.player.y - e.y, dist = Math.hypot(dx, dy) || 1;
      if (e.freezeT > 0) e.freezeT -= dt;
      else {
        var step = e.spd * dt * (1 - Math.min(.9, e.slow || 0));
        var dirX = dx / dist, dirY = dy / dist;
        /* 正对石头时推出方向与前进方向共线，会被推回原地卡死；
           所以撞墙前改为沿石头的切线滑行（左右由各自的 e.side 决定）。 */
        var block = stoneHit(e.x + dirX * step * 2, e.y + dirY * step * 2, e.r);
        if (block) {
          var nx = e.x - block.x, ny = e.y - block.y, nl = Math.hypot(nx, ny) || 1;
          nx /= nl; ny /= nl;
          var sign = e.side >= 0 ? 1 : -1;
          var tx = -ny * sign, ty = nx * sign;
          /* 切向为主、朝目标为辅：既贴着石头滑，又不会越绕越远。 */
          dirX = tx * .92 + dirX * .22; dirY = ty * .92 + dirY * .22;
          var dl = Math.hypot(dirX, dirY) || 1; dirX /= dl; dirY /= dl;
        }
        e.x += dirX * step; e.y += dirY * step;
        if (e.sway) {
          e.phase += dt * 3;
          var swayStep = Math.sin(e.phase) * e.sway * dt * 6;
          e.x += -dy / dist * swayStep; e.y += dx / dist * swayStep;
        }
        e.x = Math.max(e.r, Math.min(C.world.w - e.r, e.x));
        e.y = Math.max(e.r, Math.min(C.world.h - e.r, e.y));
        /* 兜底：聚集、击退把敌人拖进石头时挤出来。 */
        if (pushOutOfStones(e, e.r)) {
          e.x = Math.max(e.r, Math.min(C.world.w - e.r, e.x));
          e.y = Math.max(e.r, Math.min(C.world.h - e.r, e.y));
        }
      }
      e.flash = Math.max(0, e.flash - dt * 6);
      if (Math.hypot(G.player.x - e.x, G.player.y - e.y) <= e.r + C.hero.r) {
        e.dead = true; burst(e.x, e.y, e.color, 10, 160); hurtPlayer(e.hp);
      }
    });
    if (G.state === 'playing') combat.update(dt);
    G.enemies = G.enemies.filter(function (e) { return !e.dead; });
    settleCombatFlow(); updateChests(dt); updateEffects(dt);
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
    return upg.base + upg.costStep * lv;
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
  function loadoutReady() { return G.progress.candidates.length === C.loadout.candidates; }
  function canSelectLevel() { return loadoutReady() || isEndlessUnlocked(); }
  function openLevelSelect() {
    if (!canSelectLevel()) {
      toast('请先选满 7 个候选技能（当前 ' + G.progress.candidates.length + '/7）', '#ffd166');
      return false;
    }
    bankCoins(); G.state = 'levelselect'; return true;
  }
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
    state: G, combat: combat, toggleCandidate: toggleCandidate, choicePool: function () { return R.pool(G); }, buildChoices: buildChoices, update: update, resetRun: resetRun, openLevelSelect: openLevelSelect, openMenu: function () { bankCoins(); G.state = 'menu'; }, applyChoice: applyChoice,
    isLevelUnlocked: isLevelUnlocked, isEndless: isEndless, isEndlessUnlocked: isEndlessUnlocked, loadoutReady: loadoutReady, canSelectLevel: canSelectLevel, canContinue: canContinue, calculateStars: calculateStars,
    grantExperience: grantExperience, isBossActive: hasBoss, ownedCards: ownedCards, xpNeed: xpNeed,
    ownedSkills: ownedSkills, selectSkill: selectSkill, changeSkillPage: changeSkillPage,
    recompute: recomputeDerived, refreshChoices: refreshChoices,
    openMeta: openMeta, leaveMeta: leaveMeta, buyMeta: buyMeta, metaCost: metaCost, totalStars: totalStars, bankCoins: bankCoins,
    pause: function (value) { G.paused = value; G.last = P.now(); },
    setMove: function (x, y) { G.move.x = x || 0; G.move.y = y || 0; },
    view: view, clampCamera: clampCamera, ringPoint: ringPoint,
    toast: toast, waveConfig: waveConfig
  };
})(typeof GameGlobal !== 'undefined' ? GameGlobal : window);
