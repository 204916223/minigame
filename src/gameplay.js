"use strict";
(function (root) {
  var PM = root.PixelMow = root.PixelMow || {}, C = PM.Config, P = PM.Platform, A = PM.Audio;

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
      state: 'menu', paused: false, last: 0, time: 0, selectedLevel: 0,
      player: {}, skills: {}, skillOrder: [], derived: {},
      enemies: [], bullets: [], parts: [], booms: [], floaters: [],
      spawnTimer: 0, shake: 0, damageFlash: 0,
      waveIndex: 0, waveKills: 0, waveSpawned: 0, bossSpawned: false,
      intermission: 0, pendingLevelUps: 0, waveCompletePending: false,
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
  function toast(text, color) { G.toast = { text: text, color: color || '#fff', time: 1.6 }; }
  function recomputeDerived() {
    G.derived.projectiles = 1 + (G.skills.multishot || 0);
    G.derived.pierce = G.skills.pierce || 0;
    G.derived.boom = G.skills.boom || 0;
    G.player.cdBase = Math.round(1000 * Math.pow(0.88, G.skills.rapid || 0));
  }
  function resetRun(levelIndex) {
    G.state = 'playing'; G.paused = false; G.last = P.now(); G.time = 0; G.selectedLevel = levelIndex;
    G.player = { hp: 100, maxhp: 100, lvl: 1, xp: 0, xpv: xpNeed(1), kills: 0, cd: 0, cdBase: 1000, aim: -Math.PI / 2 };
    G.skills = {}; G.skillOrder = []; G.enemies = []; G.bullets = []; G.parts = []; G.booms = []; G.floaters = [];
    G.spawnTimer = 0.7; G.shake = 0; G.damageFlash = 0; G.waveIndex = 0; G.waveKills = 0; G.waveSpawned = 0;
    G.bossSpawned = false; G.intermission = 0; G.pendingLevelUps = 0; G.waveCompletePending = false;
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
  function spawnEnemy(key) {
    var type = C.enemyTypes[key], level = levelConfig();
    G.enemies.push({ id: ++spawnEnemy.uid, key: key, x: 20 + Math.random() * (C.width - 40), y: -30,
      hp: type.hp * level.hpScale, maxhp: type.hp * level.hpScale, spd: type.spd * level.speedScale,
      xp: type.xp, dmg: type.dmg, r: type.r, cell: type.cell, spr: type.spr, color: type.color,
      sway: type.sway ? 7 + Math.random() * 7 : 0, phase: Math.random() * Math.PI * 2,
      flash: 0, boss: !!type.boss, dead: false });
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
  function nearestEnemies(count) {
    return G.enemies.filter(function (e) { return !e.dead && e.hp > 0 && e.y < dangerY() + 40; })
      .sort(function (a, b) { return b.y - a.y; }).slice(0, count);
  }
  function fireBullets() {
    var count = G.derived.projectiles, targets = nearestEnemies(count);
    if (!targets.length) return;
    for (var i = 0; i < count; i++) {
      var target = targets[i % targets.length], angle = Math.atan2(target.y - (C.hero.y - 16), target.x - C.hero.x);
      G.bullets.push({ x: C.hero.x, y: C.hero.y - 16, vx: Math.cos(angle) * 430, vy: Math.sin(angle) * 430,
        speed: 430, target: target, damage: 1, pierce: G.derived.pierce, boom: G.derived.boom,
        r: 4, life: 2.6, turn: 9, hitIds: {}, dead: false });
    }
    G.player.aim = Math.atan2(targets[0].y - (C.hero.y - 16), targets[0].x - C.hero.x);
    puff(C.hero.x, C.hero.y - 20, '#8fe9ff', 3, 120); A.shoot();
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
  function explode(x, y, radius, damage) {
    G.booms.push({ x: x, y: y, r: radius, age: 0, life: 0.35 });
    G.enemies.forEach(function (e) {
      if (e.dead) return; var dx = e.x - x, dy = e.y - y;
      if (dx * dx + dy * dy < radius * radius) { e.hp -= damage; e.flash = 1; if (e.hp <= 0) killEnemy(e); }
    });
    puff(x, y, '#ffb84d', 12, 220); G.shake = Math.max(G.shake, 5); A.boom();
  }
  function hitEnemy(enemy, bullet) {
    enemy.hp -= bullet.damage; enemy.flash = 1; puff(enemy.x, enemy.y, enemy.color, 3, 90);
    if (bullet.boom > 0) explode(enemy.x, enemy.y, 44 + (bullet.boom - 1) * 12, 1 + bullet.boom * 0.5);
    if (enemy.hp <= 0) killEnemy(enemy);
  }
  function collectLevelUps() {
    while (G.player.xp >= G.player.xpv) {
      G.player.xp -= G.player.xpv; G.player.lvl++; G.player.xpv = xpNeed(G.player.lvl);
      G.player.maxhp += 6; G.player.hp = Math.min(G.player.maxhp, G.player.hp + 8); G.pendingLevelUps++;
    }
  }
  function addExperience(amount) { G.player.xp += amount; collectLevelUps(); }
  function grantExperience(amount) { addExperience(amount); settleCombatFlow(); }
  function killEnemy(enemy) {
    if (enemy.dead) return;
    enemy.dead = true; G.player.kills++; G.waveKills++;
    G.floaters.push({ x: enemy.x, y: enemy.y, text: '+' + enemy.xp, color: '#b8ff6b', age: 0, life: 0.9 });
    burst(enemy.x, enemy.y, enemy.color, enemy.boss ? 36 : 12, enemy.boss ? 300 : 150); G.shake = Math.max(G.shake, enemy.boss ? 13 : 3); A.hit();
    addExperience(enemy.xp);
  }
  function isFinalWave() { return G.waveIndex >= levelConfig().waves.length - 1; }
  function isWaveResolved() {
    return G.waveSpawned >= waveConfig().kills && !G.enemies.some(function (e) { return !e.dead; });
  }
  function settleCombatFlow() {
    if (G.state !== 'playing') return;
    if (isWaveResolved()) {
      if (isFinalWave()) {
        G.pendingLevelUps = 0; G.choices = []; G.ui.cards = []; G.waveCompletePending = false; finishLevel(); return;
      }
      G.waveCompletePending = true;
    }
    if (G.pendingLevelUps > 0) { openLevelUp(); return; }
    if (G.waveCompletePending) finishWave();
  }
  function buildChoices() {
    var pool = [];
    C.skills.forEach(function (skill) { var level = G.skills[skill.id] || 0;
      if (level > 0 && level < skill.max) pool.push({ skill: skill, type: 'up', level: level });
      else if (level === 0 && G.skillOrder.length < C.totalSlots - 1) pool.push({ skill: skill, type: 'new', level: 0 });
    });
    for (var i = pool.length - 1; i > 0; i--) { var j = (Math.random() * (i + 1)) | 0, tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp; }
    return pool.slice(0, 3);
  }
  function openLevelUp() {
    G.choices = buildChoices();
    if (!G.choices.length) { G.pendingLevelUps = 0; if (G.waveCompletePending) finishWave(); return; }
    G.state = 'levelup'; A.level();
  }
  function applyChoice(choice) {
    if (!G.skills[choice.skill.id]) G.skillOrder.push(choice.skill.id);
    G.skills[choice.skill.id] = (G.skills[choice.skill.id] || 0) + 1; recomputeDerived();
    G.pendingLevelUps = Math.max(0, G.pendingLevelUps - 1); G.choices = []; G.ui.cards = []; A.pick();
    if (G.pendingLevelUps > 0) openLevelUp();
    else if (G.waveCompletePending) finishWave();
    else { G.state = 'playing'; G.last = P.now(); }
  }
  function finishWave() {
    G.waveCompletePending = false; G.enemies = []; G.bullets = [];
    if (isFinalWave()) { finishLevel(); return; }
    G.state = 'intermission'; G.intermission = C.intermissionSeconds; A.clear();
  }
  function nextWave() {
    G.waveIndex++; G.waveKills = 0; G.waveSpawned = 0; G.bossSpawned = false; G.spawnTimer = 0.5;
    G.state = 'playing'; G.last = P.now(); toast('第 ' + (G.waveIndex + 1) + ' 波', '#8fe9ff');
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
    if (G.player.hp <= 0) { G.player.hp = 0; G.state = 'over'; G.enemies = []; G.bullets = []; A.fail(); }
  }
  function updateBullets(dt) {
    G.bullets.forEach(function (b) {
      var target = b.target;
      if (target && (target.dead || target.hp <= 0)) { b.target = null; target = null; }
      if (target) {
        var desired = Math.atan2(target.y - b.y, target.x - b.x), current = Math.atan2(b.vy, b.vx), delta = desired - current;
        while (delta > Math.PI) delta -= Math.PI * 2; while (delta < -Math.PI) delta += Math.PI * 2;
        var maxTurn = b.turn * dt, next = current + Math.max(-maxTurn, Math.min(maxTurn, delta));
        b.vx = Math.cos(next) * b.speed; b.vy = Math.sin(next) * b.speed;
      }
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.x < -10 || b.x > C.width + 10 || b.y < -10 || b.y > C.height + 10 || b.life <= 0) { b.dead = true; return; }
      for (var i = 0; i < G.enemies.length; i++) { var e = G.enemies[i]; if (e.dead || b.hitIds[e.id]) continue;
        var dx = e.x - b.x, dy = e.y - b.y, rr = e.r + b.r;
        if (dx * dx + dy * dy < rr * rr) {
          b.hitIds[e.id] = true; hitEnemy(e, b);
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
    G.floaters.forEach(function (f) { f.age += dt; f.y -= 30 * dt; }); G.floaters = G.floaters.filter(function (f) { return f.age < f.life; });
    G.shake = Math.max(0, G.shake - dt * 40); G.damageFlash = Math.max(0, G.damageFlash - dt * 2); G.toast.time -= dt;
  }
  function update(dt) {
    if (G.state === 'intermission') { G.intermission -= dt; updateEffects(dt); if (G.intermission <= 0) nextWave(); return; }
    if (G.state !== 'playing' || G.paused) return;
    G.time += dt * 1000; G.spawnTimer -= dt;
    if (G.spawnTimer <= 0 && !G.waveCompletePending && G.waveSpawned < waveConfig().kills) { spawnForWave(); G.spawnTimer = waveConfig().interval * (0.8 + Math.random() * 0.4); }
    G.player.cd -= dt * 1000; if (G.player.cd <= 0) { fireBullets(); G.player.cd = G.player.cdBase; }
    G.enemies.forEach(function (e) {
      if (e.dead) return; e.y += e.spd * dt;
      if (e.sway) { e.phase += dt * 3; e.x += Math.sin(e.phase) * e.sway * dt * 6; e.x = Math.max(12, Math.min(C.width - 12, e.x)); }
      e.flash = Math.max(0, e.flash - dt * 6);
      if (e.y >= dangerY()) { e.dead = true; hurtPlayer(e.dmg); burst(e.x, dangerY(), '#ff5d6c', 10, 160); }
    });
    if (G.state === 'playing') updateBullets(dt);
    G.enemies = G.enemies.filter(function (e) { return !e.dead; });
    settleCombatFlow(); updateEffects(dt);
  }
  function openLevelSelect() { G.state = 'levelselect'; }
  function canContinue() { return G.result && G.result.stars > 0 && G.selectedLevel + 1 < C.levels.length; }
  PM.Gameplay = {
    state: G, update: update, resetRun: resetRun, openLevelSelect: openLevelSelect, applyChoice: applyChoice,
    isLevelUnlocked: isLevelUnlocked, canContinue: canContinue, calculateStars: calculateStars,
    grantExperience: grantExperience, isBossActive: hasBoss,
    pause: function (value) { G.paused = value; G.last = P.now(); },
    toast: toast, dangerY: dangerY, waveConfig: waveConfig
  };
})(typeof GameGlobal !== 'undefined' ? GameGlobal : window);
