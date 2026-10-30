"use strict";
(function (root) {
  var PM = root.PixelMow = root.PixelMow || {};

  /* 总数包含首领：3/6/9/10 波分别有 1/2/3/4 个小首领，末波另有最终首领。 */
  var WAVE_KILLS = [30, 30, 51, 100, 100, 302, 500, 500, 503, 1005];
  var LAST_WAVE = WAVE_KILLS.length - 1;

  /* 出怪速度：每一波都比上一波快至少 10%（间隔 /1.1），越到后面越密 */
  var SPAWN_SPEED_PER_WAVE = 1.10;
  /* tiers = [1-3 波, 4-6 波, 7-9 波, 第 10 波] 四档怪物组合，展开成 10 个波次 */
  function tierOf(waveIndex) { return waveIndex < 3 ? 0 : (waveIndex < 6 ? 1 : (waveIndex < 9 ? 2 : 3)); }
  function buildWaves(tierPools, baseInterval) {
    var waves = [];
    for (var i = 0; i < WAVE_KILLS.length; i++) {
      var t = tierOf(i);
      waves.push({ kills: WAVE_KILLS[i], interval: baseInterval / Math.pow(SPAWN_SPEED_PER_WAVE, i),
        pool: tierPools[t], miniBosses: i === 2 ? 1 : i === 5 ? 2 : i === 8 ? 3 : i === 9 ? 4 : 0, boss: i === LAST_WAVE });
    }
    return waves;
  }
  function buildLevel(name, hpScale, speedScale, defScale, tierPools, baseInterval) {
    return { name: name, hpScale: hpScale, speedScale: speedScale, defScale: defScale, waves: buildWaves(tierPools, baseInterval) };
  }

  PM.Config = {
    width: 480,
    height: 480 * 16 / 9,
    /* 波次衔接：不再插 3 秒全屏横幅，本波最后一只怪出场后倒计时 3s 直接接下一波 */
    waveLeadSeconds: 3,
    /* 出怪速度每波至少 +10%（间隔等比缩小）；
       每批刷怪数随主角等级成长：1 级 3~5、10 级 10~12、20 级 18~20、30 级封顶 26~28 */
    spawnSpeedPerWave: SPAWN_SPEED_PER_WAVE,
    spawnGroupBase: 3,
    spawnGroupPerLevel: 0.8,
    spawnGroupRandom: 2,
    spawnGroupMax: 28,
    spawnGroupTimeFactor: 1.0,
    waveCount: WAVE_KILLS.length,
    doubleSpeedCost: 2000,
    xpMultiplier: .75, // 普通关按原始经验的 75% 发放，无尽在此基础上再乘自身倍率。
    endless: { unlockClears: 3, normals: 1000, miniBosses: 3, bosses: 2,
      hpScale: 1, defScale: 1, speedScale: 1, hpGrowth: .15, defGrowth: .10, speedGrowth: .05, speedCap: 1.5,
      coinMultiplier: .5, xpMultiplier: .5, interval: 1.5, minInterval: .5,
      pool: { grunt: 1, runner: .5, bat: .3, tank: .1 } },
    enemyHpMultiplier: 2,
    rewards: { registration: 2000, firstClear: 1000 },
    characterDamageBonus: .15,
    characters: [
      { id: 'physical', el: 'physical', name: '物理卫士', clears: 0 },
      { id: 'fire', el: 'fire', name: '烈焰卫士', clears: 0 },
      { id: 'poison', el: 'poison', name: '毒雾卫士', clears: 1 },
      { id: 'elec', el: 'elec', name: '雷霆卫士', clears: 2 },
      { id: 'water', el: 'water', name: '潮汐卫士', clears: 3 },
      { id: 'wind', el: 'wind', name: '疾风卫士', clears: 4 },
      { id: 'ice', el: 'ice', name: '寒冰卫士', clears: 5 }
    ],
    hero: { x: 240, y: 480 * 16 / 9 - 120, hp: 400, defense: 100 },

    /* 怪物强度曲线：波次成长 + 波内逐只成长 + 关卡系数，第二只一定比第一只硬
     openingRelief 只放宽前 openingReliefWaves 波的刷怪间隔；
     levelEnemyGrowth：主角升级仅在 1-3 波增加血量、4-6 波增加防御；
     移速按出生波次固定，第 7-10 波分别 +10%/+20%/+30%/+40%，不随等级增长 */
    curve: { waveHpGrowth: 1.035, waveDefGrowth: 1.02, spawnGrowth: 0.0018, openingRelief: 1.0, openingReliefWaves: 0, levelEnemyGrowth: 1.05,
      waveSpeedMultipliers: [1, 1, 1, 1, 1, 1, 1.1, 1.2, 1.3, 1.4] },
    /* 控制上限：冰冻最长 2s（受抗性衰减），击退不能把怪推出屏幕 */
    control: { freezeCap: 2, knockMinY: 8 },
    /* 交战线：敌人必须先走进画面（y >= enterY）才会被锁定/溅射/传导/灼烧，
       否则武器会在屏幕外就把怪杀掉，玩家看不到敌人出场 */
    combat: { enterY: 8, radius: 55, duration: 3, projectileSpeed: 1600,
      knock: 30, freeze: 1, freezeChance: .1, chainRange: 110, zoneTick: 1, zoneDamageRatio: .25, persistentTick: 1,
      generateDelay: .5, generateFill: .5, fullscreenSweepDuration: 3 },
    /* 星辉：从第二关起，每颗已获得的星给全队伤害 +15%（加法叠加），
       用来奖励三星通关并托住后期难度 */
    starBonus: { perStar: 0.15, fromLevel: 1 },
    /* 局外养成：每击杀 1 只怪 +1 金币，金币在局外升级（菜单/选关里的「局外强化」） */
    meta: {
      killCoins: 1,
      refundRatio: .8,
      upgrades: [
        { id: 'atk', name: '攻击力', desc: '每级 +2.5% 基础攻击（初始 200）', base: 1000, costStep: 500, max: 40, per: .025, unit: '% 攻击' },
        { id: 'hp', name: '生命上限', desc: '每级 +5% 基础生命（初始 400）', base: 1000, costStep: 500, max: 40, per: .05, unit: '% 生命' },
        { id: 'shield', name: '护盾', desc: '每级 +50 开局护盾', base: 1000, costStep: 500, max: 40, per: 50, unit: '护盾' },
        { id: 'def', name: '防御', desc: '每级 +5% 基础防御（初始 100）', base: 1000, costStep: 500, max: 40, per: .05, unit: '% 防御' },
        { id: 'haste', name: '攻击速度', desc: '每级 -0.5% 冷却，受技能最短间隔限制', base: 1000, costStep: 500, max: 40, per: .005, cap: .2, unit: '% 冷却' }
      ]
    },

    palette: {
      '.': null, '0': '#1a1f2e', '1': '#38bdf8', '2': '#0ea5e9', '3': '#e2e8f0', '4': '#f472b6',
      'g': '#7cff6b', 'G': '#2f9e44', 'y': '#ffd166', 'o': '#ff922b', 'r': '#ff5d6c', 'R': '#c92a2a',
      'p': '#b197fc', 'P': '#7048e8', 'w': '#e9ecef', 'k': '#495057', 'c': '#63e6be', 'm': '#ff8787', 's': '#f8f9fa'
    },
    sprites: {
      hero: ["..3..3..", "..3333..", ".112211.", ".1wwww1.", ".1wkkw1.", ".2wwww2.", "..2222..", ".k.kk.k."],
      slime: ["..gggg..", ".gggggg.", "ggwggwgg", "gggggggg", "gGggggGg", ".GGGGGG."],
      bat: ["r..rr..r", "rrrrrrrr", "rrwrrwrr", ".rrrrrr.", "..r..r.."],
      tank: [".PPPPPP.", "PPPPPPPP", "PPwPPwPP", "PPPppPPP", "PPPPPPPP", ".P.PP.P.", "k.PPPP.k", "kk....kk"],
      runner: ["..yy..", ".yyyy.", "ywyywy", ".yyyy.", ".y..y."],
      boss: ["..mmmm..", ".mmmmmm.", "mmRmmRmm", "mmmmmmmm", "mwwwwwwm", "mmmmmmmm", ".rmmmmr.", "rr....rr"]
    },
    /* 出场顺序即强度顺序，每一项严格强于前一项；resist 减免对应元素的控制效果 */
    enemyTypes: {
      // hp 为血量翻倍前的基值；第一关首只普通怪实际 150 HP / 50 防御。
      grunt:  { def: 50, spr: 'slime',  cell: 3, hp: 75, spd: 25, xp: 1, r: 13,
        resist: { freeze: 0, knock: 0, poison: 0 } },
      runner: { def: 55, spr: 'runner', cell: 3, hp: 90, spd: 46, xp: 2, r: 10,
        resist: { freeze: 0.10, knock: 0.15, poison: 0 } },
      bat:    { def: 60, spr: 'bat',    cell: 3, hp: 110, spd: 34, xp: 3, r: 12, sway: true,
        resist: { freeze: 0.20, knock: 0.35, poison: 0.10 } },
      tank:   { def: 90, spr: 'tank',   cell: 4, hp: 180, spd: 14, xp: 6, r: 19,
        resist: { freeze: 0.35, knock: 0.70, poison: 0.20 } },
      miniboss: { def: 110, spr: 'boss', cell: 5, hp: 400, spd: 12, xp: 15, r: 25, boss: true, miniboss: true,
        resist: { freeze: 0.45, knock: 0.80, poison: 0.30 } },
      boss:   { def: 120, spr: 'boss',   cell: 6, hp: 600, spd: 9, xp: 30, r: 30, boss: true,
        resist: { freeze: 0.60, knock: 0.85, poison: 0.35 } }
    },

    // 试玩节奏：低伤害短冷却、多初始目标；高伤害长冷却、少初始目标。
    power: { base: 200 },
    bondUnlockSkills: 3,
    loadout: { candidates: 7, slots: 6, initial: 'basic',
      defaults: ['laser', 'blackhole', 'chain', 'lightning', 'waterball', 'geyser', 'fireball'] },
    elements: {
      physical: { name: '物理', color: '#919191', icon: '⊕' },
      elec: { name: '电', color: '#fddf0f', icon: '⚡' },
      fire: { name: '火', color: '#f95938', icon: '✹' },
      wind: { name: '风', color: '#2cb2a9', icon: '≋' },
      ice: { name: '冰', color: '#5a91ff', icon: '❄' },
      water: { name: '水', color: '#48ccff', icon: '◉' },
      poison: { name: '毒', color: '#a378fc', icon: '☣' }
    },
    // cap 为卡自身上限，羁绊在其外相加。totalCap 表示含基础数量。
    factions: {
      cooldown: { name: '冷却', step: .05, cap: .5, bond: [.05, .15] },
      duration: { name: '持续', step: .5, cap: 5, bond: [.5, 1.5] },
      range: { name: '范围', step: .05, cap: .5, bond: [.05, .15] },
      breach: { name: '破防', step: .05, cap: .5, bond: [.05, .15] },
      multi: { name: '多重', step: 1, cap: 10, totalCap: true, bond: [1, 3] },
      split: { name: '分裂', step: 1, cap: 5, totalCap: true, bond: [1, 3] },
      slow: { name: '减速', step: .05, cap: .5, bond: [.05, .15] },
      knock: { name: '击退', step: .05, cap: .5, bond: [.05, .15] },
      freeze: { name: '冰冻', step: .1, cap: .5, bond: [.05, .15] },
      pierce: { name: '穿透', step: 1, cap: 5, totalCap: true, bond: [1, 3] },
      gather: { name: '聚集', step: 1, cap: 20, totalCap: true },
      chain: { name: '传导', step: 5, cap: 50, totalCap: true },
      bounce: { name: '折射', step: 1, cap: 5, totalCap: true },
      damage: { name: '技能伤害', step: .2 },
      attribute: { name: '属性伤害', step: .1 }
    },
    skills: [
      { id: 'basic', name: '白银子弹', el: 'physical', mode: 'bolt', area: 'single', cd: 2, minCd: 1, ratio: 1, tags: ['cooldown','multi','split','pierce'] },
      { id: 'laser', name: '折射激光', el: 'physical', mode: 'bolt', area: 'line', cd: 20, minCd: 10, ratio: 2.5, tags: ['cooldown','bounce'], bounces: 3 },
      { id: 'blackhole', name: '黑洞', el: 'physical', mode: 'generate', area: 'area', cd: 24, minCd: 8, ratio: 1.5, tags: ['cooldown','range','multi'] },
      { id: 'chain', name: '闪电链接', el: 'elec', mode: 'bolt', area: 'line', cd: 4, minCd: 2, ratio: .5, damageScale: .5, targets: 3, tags: ['cooldown','range','multi','slow','chain'], chains: 5 },
      { id: 'lightning', name: '落雷', el: 'elec', mode: 'generate', area: 'area', cd: 20, minCd: 8, ratio: 1, tags: ['cooldown','range','multi','slow'] },
      /* 全屏技能（不可知域除外）固定 10 秒施放一次：fixedCd 让冷却不受冷却卡、羁绊与局外攻速影响，
         全屏技能只提供专属伤害卡，不提供冷却或控制等特殊强化卡（noCards）。 */
      { id: 'thunderstorm', name: '雷暴', el: 'elec', mode: 'fullscreen', area: 'all', cd: 10, fixedCd: true, noCards: ['cooldown'], ratio: 1, tags: ['cooldown','slow'], cond: { elec: 2, water: 2 } },
      { id: 'fireball', name: '火球术', el: 'fire', mode: 'bolt', area: 'area', cd: 10, minCd: 4, ratio: 1.25, tags: ['cooldown','duration','range','multi'] },
      { id: 'meteor', name: '天火流星', el: 'fire', mode: 'generate', area: 'area', cd: 24, minCd: 8, ratio: 1.5, tags: ['cooldown','duration','range','multi'] },
      { id: 'firestorm', name: '火焰漩涡', el: 'fire', mode: 'fullscreen', area: 'all', cd: 10, fixedCd: true, noCards: ['cooldown'], ratio: .75, tags: ['cooldown'], cond: { fire: 2, wind: 2 } },
      { id: 'windblade', name: '风刃', el: 'wind', mode: 'bolt', area: 'single', cd: 6, minCd: 3, ratio: .5, targets: 3, tags: ['cooldown','multi','split','knock','pierce'] },
      { id: 'tornado', name: '龙卷风', el: 'wind', mode: 'generate', area: 'area', cd: 20, minCd: 8, ratio: 1, tags: ['cooldown','range','multi','gather'] },
      { id: 'tidalwave', name: '排山倒海', el: 'wind', mode: 'fullscreen', area: 'all', cd: 10, fixedCd: true, noCards: ['cooldown'], ratio: .5, tags: ['cooldown','knock'], cond: { wind: 2, elec: 2 } },
      { id: 'icecone', name: '冰锥', el: 'ice', mode: 'bolt', area: 'single', cd: 8, minCd: 4, ratio: 1, tags: ['cooldown','multi','split','freeze'] },
      { id: 'crystal', name: '结晶', el: 'ice', mode: 'generate', area: 'area', cd: 22, minCd: 8, ratio: 1.25, tags: ['cooldown','range','multi','freeze'] },
      { id: 'blizzard', name: '极寒风暴', el: 'ice', mode: 'fullscreen', area: 'all', cd: 10, fixedCd: true, noCards: ['cooldown'], ratio: .5, tags: ['cooldown','freeze'], cond: { ice: 2, wind: 2 } },
      { id: 'waterball', name: '水球术', el: 'water', mode: 'bolt', area: 'single', cd: 6, minCd: 3, ratio: .75, targets: 2, tags: ['cooldown','breach','multi','split'] },
      { id: 'geyser', name: '喷涌', el: 'water', mode: 'generate', area: 'area', cd: 20, minCd: 8, ratio: 1, tags: ['cooldown','range','breach','multi'] },
      { id: 'flood', name: '水漫金山', el: 'water', mode: 'fullscreen', area: 'all', cd: 10, fixedCd: true, noCards: ['cooldown'], ratio: 1, tags: ['cooldown','breach'], cond: { water: 2, wind: 2 } },
      { id: 'poisonbottle', name: '毒瓶', el: 'poison', mode: 'bolt', area: 'area', cd: 8, minCd: 4, ratio: .75, targets: 2, tags: ['cooldown','duration','range','multi'] },
      { id: 'miasma', name: '瘴雾', el: 'poison', mode: 'generate', area: 'area', cd: 16, minCd: 8, ratio: .5, targets: 3, tags: ['cooldown','duration','range','multi'] },
      { id: 'unknown', name: '不可知域', el: 'poison', mode: 'fullscreen', area: 'all', cd: 0, ratio: .1, tags: ['duration'], cond: { poison: 2 }, excludes: ['wind'], noCards: ['duration'], persistent: true }
    ],

    levels: [
      buildLevel('草地前哨', 1.00, 1.00, 1.00,
        [{ grunt: 1, runner: 0.25 },
         { grunt: 1, runner: 0.50, bat: 0.20 },
         { grunt: 1, runner: 0.55, bat: 0.40 },
         { grunt: 1, runner: 0.60, bat: 0.50, tank: 0.10 }],
        8.0),
      buildLevel('暮色小径', 1.20, 1.03, 1.12,
        [{ grunt: 1, runner: 0.55, bat: 0.15 },
         { grunt: 0.80, runner: 0.55, bat: 0.40 },
         { grunt: 0.70, runner: 0.50, bat: 0.50, tank: 0.12 },
         { grunt: 0.60, runner: 0.55, bat: 0.55, tank: 0.20 }],
        8.0),
      buildLevel('紫晶废墟', 1.45, 1.06, 1.25,
        [{ grunt: 0.80, runner: 0.60, bat: 0.30, tank: 0.10 },
         { grunt: 0.70, runner: 0.55, bat: 0.50, tank: 0.18 },
         { grunt: 0.60, runner: 0.50, bat: 0.55, tank: 0.28 },
         { grunt: 0.50, runner: 0.50, bat: 0.60, tank: 0.35 }],
        8.0),
      buildLevel('熔岩裂谷', 1.75, 1.09, 1.40,
        [{ grunt: 0.50, runner: 0.60, bat: 0.60, tank: 0.08 },
         { grunt: 0.35, runner: 0.60, bat: 0.65, tank: 0.18 },
         { runner: 0.60, bat: 0.70, tank: 0.35 },
         { runner: 0.55, bat: 0.75, tank: 0.45 }],
        8.0),
      buildLevel('终焉核心', 2.10, 1.12, 1.60,
        [{ grunt: 0.40, runner: 0.60, bat: 0.70, tank: 0.10 },
         { grunt: 0.20, runner: 0.60, bat: 0.75, tank: 0.25 },
         { runner: 0.55, bat: 0.80, tank: 0.50 },
         { runner: 0.50, bat: 0.85, tank: 0.60 }],
        8.0)
    ]
  };
  Object.keys(PM.Config.elements).forEach(function (id) {
    var el = PM.Config.elements[id], hex = el.color.slice(1);
    el.dark = '#' + [0,2,4].map(function (i) { return ('0' + Math.round(parseInt(hex.slice(i,i+2),16) * .6).toString(16)).slice(-2); }).join('');
  });
  PM.Config.characters.forEach(function (hero) {
    var el = PM.Config.elements[hero.el]; hero.color = el.color; hero.dark = el.dark;
  });
  PM.Config.skills.forEach(function (s) {
    // 保留派系标签参与羁绊；全屏的专属强化只开放伤害。
    if (s.mode === 'fullscreen') s.noCards = s.tags.slice();
    var el = PM.Config.elements[s.el]; s.color = el.color; s.icon = el.icon;
    s.minCd = s.minCd === undefined ? 0 : s.minCd;
  });
})(typeof GameGlobal !== 'undefined' ? GameGlobal : window);
