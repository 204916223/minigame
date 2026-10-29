"use strict";
(function (root) {
  var PM = root.PixelMow = root.PixelMow || {};

  /* 波次数量规则：前期少、后期多，20 → 30 → 40 → 55 → 75 → 100 → 140 → 200 → 320 → 501；
     末波 500 只小怪 + 1 只首领（首领占用最后一个刷怪名额）。 */
  var WAVE_KILLS = [20, 30, 40, 55, 75, 100, 140, 200, 320, 501];
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
        pool: tierPools[t], boss: i === LAST_WAVE });
    }
    return waves;
  }
  /* hpMul：只放大怪物血量，不放大接触伤害；配合星辉把每关平均通过率压到 ~75% */
  function buildLevel(name, hpScale, speedScale, hpMul, tierPools, baseInterval) {
    return { name: name, hpScale: hpScale, speedScale: speedScale, hpMul: hpMul, waves: buildWaves(tierPools, baseInterval) };
  }

  PM.Config = {
    width: 480,
    height: 640,
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
    hero: { x: 240, y: 552 },

    /* 怪物强度曲线：波次成长 + 波内逐只成长 + 关卡系数，第二只一定比第一只硬
     openingRelief 只放宽前 openingReliefWaves 波的刷怪间隔；
     levelEnemyGrowth：主角每升 1 级，场上和之后刷出的怪防御/血量/速度线性 +5% */
    curve: { waveHpGrowth: 1.035, waveDmgGrowth: 1.018, spawnGrowth: 0.0018, openingRelief: 1.0, openingReliefWaves: 0, levelEnemyGrowth: 1.05 },
    /* 控制上限：冰冻最长 2s（受抗性衰减），击退不能把怪推出屏幕 */
    control: { freezeCap: 2, knockMinY: 8 },
    /* 交战线：敌人必须先走进画面（y >= enterY）才会被锁定/溅射/传导/灼烧，
       否则武器会在屏幕外就把怪杀掉，玩家看不到敌人出场 */
    combat: { enterY: 8, radius: 55, duration: 3, projectileSpeed: 400,
      knock: 30, freeze: 1, chainRange: 110, zoneTick: 1, zoneDamageRatio: .25, persistentTick: 1 },
    /* 星辉：从第二关起，每颗已获得的星给全队伤害 +15%（加法叠加），
       用来奖励三星通关并托住后期难度 */
    starBonus: { perStar: 0.15, fromLevel: 1 },
    /* 局外养成：每击杀 1 只怪 +1 金币，金币在局外升级（菜单/选关里的「局外强化」） */
    meta: {
      killCoins: 1,
      upgrades: [
        { id: 'atk', name: '攻击力', desc: '每级 +19% 全队伤害', base: 30, growth: 1.40, max: 20, per: 0.19, unit: '% 伤害' },
        { id: 'hp', name: '生命上限', desc: '每级 +75 最大生命', base: 20, growth: 1.35, max: 20, per: 75, unit: 'HP' },
        { id: 'shield', name: '护盾', desc: '每级 +50 开局护盾', base: 25, growth: 1.40, max: 20, per: 50, unit: '护盾' },
        { id: 'def', name: '防御', desc: '每级 +10% 减伤（上限 60%）', base: 30, growth: 1.40, max: 20, per: 0.10, cap: 0.6, unit: '% 减伤' },
        { id: 'haste', name: '攻击速度', desc: '每级 -10% 全技能冷却（上限 50%）', base: 35, growth: 1.40, max: 20, per: 0.10, cap: 0.5, unit: '% 冷却' }
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
      grunt:  { def: 0.1, spr: 'slime',  cell: 3, hp: 2.2, spd: 25, xp: 1, dmg: 2.5, color: '#7cff6b', r: 13,
        resist: { freeze: 0, knock: 0, poison: 0 } },
      runner: { def: 0.2, spr: 'runner', cell: 3, hp: 3,   spd: 46, xp: 2, dmg: 3,   color: '#ffd166', r: 10,
        resist: { freeze: 0.10, knock: 0.15, poison: 0 } },
      bat:    { def: 0.3, spr: 'bat',    cell: 3, hp: 4.5, spd: 34, xp: 3, dmg: 4,   color: '#ff5d6c', r: 12, sway: true,
        resist: { freeze: 0.20, knock: 0.35, poison: 0.10 } },
      tank:   { def: 0.8, spr: 'tank',   cell: 4, hp: 9,   spd: 14, xp: 6, dmg: 7,   color: '#b197fc', r: 19,
        resist: { freeze: 0.35, knock: 0.70, poison: 0.20 } },
      boss:   { def: 1, spr: 'boss',   cell: 6, hp: 38,  spd: 9,  xp: 30, dmg: 18, color: '#ff8787', r: 30, boss: true,
        resist: { freeze: 0.60, knock: 0.85, poison: 0.35 } }
    },

    // 图中空白冷却、半径、持续时间是试玩初值；有区间的冷却从最大值开始。
    power: { base: 10 },
    loadout: { candidates: 7, slots: 6, initial: 'basic',
      defaults: ['laser', 'blackhole', 'chain', 'lightning', 'waterball', 'geyser', 'fireball'] },
    elements: {
      physical: { name: '物理', color: '#8fe9ff', icon: '⊕' },
      elec: { name: '电', color: '#ffe066', icon: '⚡' },
      fire: { name: '火', color: '#ff922b', icon: '✹' },
      wind: { name: '风', color: '#9be15d', icon: '≋' },
      ice: { name: '冰', color: '#74c0fc', icon: '❄' },
      water: { name: '水', color: '#38bdf8', icon: '◉' },
      poison: { name: '毒', color: '#a9e34b', icon: '☣' }
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
      { id: 'basic', name: '白银子弹', el: 'physical', mode: 'bolt', area: 'single', cd: 5, minCd: 1, ratio: 1, tags: ['cooldown','multi','split','pierce'] },
      { id: 'laser', name: '折射激光', el: 'physical', mode: 'bolt', area: 'line', cd: 10, minCd: 5, ratio: 1.25, tags: ['cooldown','bounce'], bounces: 3 },
      { id: 'blackhole', name: '黑洞', el: 'physical', mode: 'generate', area: 'area', cd: 6, ratio: 1.5, tags: ['cooldown','range','multi'] },
      { id: 'chain', name: '闪电链接', el: 'elec', mode: 'bolt', area: 'line', cd: 2.5, ratio: .5, tags: ['cooldown','range','multi','slow','chain'], chains: 5 },
      { id: 'lightning', name: '落雷', el: 'elec', mode: 'generate', area: 'area', cd: 4, ratio: 1, tags: ['cooldown','range','multi','slow'] },
      { id: 'thunderstorm', name: '雷暴', el: 'elec', mode: 'fullscreen', area: 'all', cd: 15, ratio: 1, tags: ['cooldown','slow'], cond: { elec: 2, water: 2 } },
      { id: 'fireball', name: '火球术', el: 'fire', mode: 'bolt', area: 'area', cd: 3, ratio: 1.25, tags: ['cooldown','duration','range','multi'] },
      { id: 'meteor', name: '天火流星', el: 'fire', mode: 'generate', area: 'area', cd: 5, ratio: 1.5, tags: ['cooldown','duration','range','multi'] },
      { id: 'firestorm', name: '火焰漩涡', el: 'fire', mode: 'fullscreen', area: 'all', cd: 15, ratio: .75, tags: ['cooldown'], cond: { fire: 2, wind: 2 } },
      { id: 'windblade', name: '风刃', el: 'wind', mode: 'bolt', area: 'single', cd: 1.5, ratio: .5, tags: ['cooldown','multi','split','knock','pierce'] },
      { id: 'tornado', name: '龙卷风', el: 'wind', mode: 'generate', area: 'area', cd: 5, ratio: 1, tags: ['cooldown','range','multi','gather'] },
      { id: 'tidalwave', name: '排山倒海', el: 'wind', mode: 'fullscreen', area: 'all', cd: 15, ratio: .5, tags: ['cooldown','knock'], cond: { wind: 2, elec: 2 } },
      { id: 'icecone', name: '冰锥', el: 'ice', mode: 'bolt', area: 'single', cd: 2.5, ratio: 1, tags: ['cooldown','multi','split','freeze'] },
      { id: 'crystal', name: '结晶', el: 'ice', mode: 'generate', area: 'area', cd: 5, ratio: 1.25, tags: ['cooldown','range','multi','freeze'] },
      { id: 'blizzard', name: '极寒风暴', el: 'ice', mode: 'fullscreen', area: 'all', cd: 15, ratio: .5, tags: ['cooldown','freeze'], cond: { ice: 2, wind: 2 } },
      { id: 'waterball', name: '水球术', el: 'water', mode: 'bolt', area: 'single', cd: 2, ratio: .75, tags: ['cooldown','breach','multi','split'] },
      { id: 'geyser', name: '喷涌', el: 'water', mode: 'generate', area: 'area', cd: 4, ratio: 1, tags: ['cooldown','range','breach','multi'] },
      { id: 'flood', name: '水漫金山', el: 'water', mode: 'fullscreen', area: 'all', cd: 15, ratio: 1, tags: ['cooldown','breach'], cond: { water: 2, wind: 2 } },
      { id: 'poisonbottle', name: '毒瓶', el: 'poison', mode: 'bolt', area: 'area', cd: 2, ratio: .75, tags: ['cooldown','duration','range','multi'] },
      { id: 'miasma', name: '瘴雾', el: 'poison', mode: 'generate', area: 'area', cd: 4, ratio: .5, tags: ['cooldown','duration','range','multi'] },
      { id: 'unknown', name: '不可知域', el: 'poison', mode: 'fullscreen', area: 'all', cd: 0, ratio: .1, tags: ['duration'], cond: { poison: 2 }, excludes: ['wind'], noCards: ['duration'], persistent: true }
    ],

    levels: [
      buildLevel('草地前哨', 1.00, 1.00, 1.75,
        [{ grunt: 1, runner: 0.25 },
         { grunt: 1, runner: 0.50, bat: 0.20 },
         { grunt: 1, runner: 0.55, bat: 0.40 },
         { grunt: 1, runner: 0.60, bat: 0.50, tank: 0.10 }],
        8.0),
      buildLevel('暮色小径', 1.05, 1.03, 1.90,
        [{ grunt: 1, runner: 0.55, bat: 0.15 },
         { grunt: 0.80, runner: 0.55, bat: 0.40 },
         { grunt: 0.70, runner: 0.50, bat: 0.50, tank: 0.12 },
         { grunt: 0.60, runner: 0.55, bat: 0.55, tank: 0.20 }],
        8.0),
      buildLevel('紫晶废墟', 1.10, 1.06, 2.10,
        [{ grunt: 0.80, runner: 0.60, bat: 0.30, tank: 0.10 },
         { grunt: 0.70, runner: 0.55, bat: 0.50, tank: 0.18 },
         { grunt: 0.60, runner: 0.50, bat: 0.55, tank: 0.28 },
         { grunt: 0.50, runner: 0.50, bat: 0.60, tank: 0.35 }],
        8.0),
      buildLevel('熔岩裂谷', 1.12, 1.09, 2.04,
        [{ grunt: 0.50, runner: 0.60, bat: 0.60, tank: 0.08 },
         { grunt: 0.35, runner: 0.60, bat: 0.65, tank: 0.18 },
         { runner: 0.60, bat: 0.70, tank: 0.35 },
         { runner: 0.55, bat: 0.75, tank: 0.45 }],
        8.0),
      buildLevel('终焉核心', 1.20, 1.12, 1.85,
        [{ grunt: 0.40, runner: 0.60, bat: 0.70, tank: 0.10 },
         { grunt: 0.20, runner: 0.60, bat: 0.75, tank: 0.25 },
         { runner: 0.55, bat: 0.80, tank: 0.50 },
         { runner: 0.50, bat: 0.85, tank: 0.60 }],
        8.0)
    ]
  };
  PM.Config.skills.forEach(function (s) {
    var el = PM.Config.elements[s.el]; s.color = el.color; s.icon = el.icon;
    s.minCd = s.minCd === undefined ? (s.cd ? Math.max(.25, s.cd * .2) : 0) : s.minCd;
  });
})(typeof GameGlobal !== 'undefined' ? GameGlobal : window);
