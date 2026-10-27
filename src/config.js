"use strict";
(function (root) {
  var PM = root.PixelMow = root.PixelMow || {};

  /* 波次数量规则：每波 200 起，逐波递增到末波 501；
     末波 500 只小怪 + 1 只首领（首领占用最后一个刷怪名额）。 */
  var WAVE_KILLS = [200, 220, 250, 280, 320, 360, 400, 440, 470, 501];
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
    /* 出怪速度每波至少 +10%（间隔等比缩小）；每次成组刷 13~18 只 */
    spawnSpeedPerWave: SPAWN_SPEED_PER_WAVE,
    spawnGroup: 13,
    spawnGroupRandom: 5,
    spawnGroupTimeFactor: 1.0,
    /* 武器槽上限：占满后卡池不再发「获得新武器」的解锁卡，只强化已有武器 */
    weaponSlots: 5,
    waveCount: WAVE_KILLS.length,
    hero: { x: 240, y: 552 },

    /* 怪物强度曲线：波次成长 + 波内逐只成长 + 关卡系数，第二只一定比第一只硬
     openingRelief 只放宽前 openingReliefWaves 波的刷怪间隔；
     levelEnemyGrowth：主角每升 1 级，场上和之后刷出的怪防御/血量/速度线性 +5% */
    curve: { waveHpGrowth: 1.035, waveDmgGrowth: 1.018, spawnGrowth: 0.0018, openingRelief: 1.0, openingReliefWaves: 0, levelEnemyGrowth: 1.05 },
    /* 控制上限：冰冻最长 2s（受抗性衰减），击退不能把怪推出屏幕 */
    control: { freezeCap: 2, knockMinY: -20 },
    /* 交战线：敌人必须先走进画面（y >= enterY）才会被锁定/溅射/传导/灼烧，
       否则武器会在屏幕外就把怪杀掉，玩家看不到敌人出场 */
    combat: { enterY: 8 },
    /* 星辉：从第二关起，每颗已获得的星给全队伤害 +15%（加法叠加），
       用来奖励三星通关并托住后期难度 */
    starBonus: { perStar: 0.15, fromLevel: 1 },

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
      grunt:  { spr: 'slime',  cell: 3, hp: 2.2, spd: 25, xp: 1, dmg: 2.5, color: '#7cff6b', r: 13,
        resist: { freeze: 0, knock: 0, poison: 0 } },
      runner: { spr: 'runner', cell: 3, hp: 3,   spd: 46, xp: 2, dmg: 3,   color: '#ffd166', r: 10,
        resist: { freeze: 0.10, knock: 0.15, poison: 0 } },
      bat:    { spr: 'bat',    cell: 3, hp: 4.5, spd: 34, xp: 3, dmg: 4,   color: '#ff5d6c', r: 12, sway: true,
        resist: { freeze: 0.20, knock: 0.35, poison: 0.10 } },
      tank:   { spr: 'tank',   cell: 4, hp: 9,   spd: 14, xp: 6, dmg: 7,   color: '#b197fc', r: 19,
        resist: { freeze: 0.35, knock: 0.70, poison: 0.20 } },
      boss:   { spr: 'boss',   cell: 6, hp: 38,  spd: 9,  xp: 30, dmg: 18, color: '#ff8787', r: 30, boss: true,
        resist: { freeze: 0.60, knock: 0.85, poison: 0.35 } }
    },

    /* 六系武器：各自独立冷却、独立伤害、独立数量与特效结算
       basic 快 / fire 高伤 / wind 击退 / thunder 传导 / frost 冰冻 / poison 持续伤害 */
    weapons: [
      { id: 'basic', name: '普通攻击', icon: '⊕', color: '#8fe9ff', kind: 'homing', shape: 'bolt',
        cdBase: 2000, dmgBase: 3.6, countBase: 1, pierceBase: 0, speed: 470, turn: 11, r: 4,
        tag: '2s 一发，唯一快攻' },
      { id: 'fire', name: '火系法术', icon: '✹', color: '#ff922b', kind: 'lob', shape: 'orb',
        cdBase: 5500, dmgBase: 26, countBase: 1, speed: 300, r: 8, splash: 74, splashRatio: 0.6,
        tag: '6s 一发，落点溅射' },
      { id: 'wind', name: '风系法术', icon: '≋', color: '#9be15d', kind: 'homing', shape: 'gale',
        cdBase: 5000, dmgBase: 3.4, countBase: 2, speed: 420, turn: 6, r: 7, knock: 54,
        tag: '5s 一轮，把敌人吹退' },
      { id: 'thunder', name: '雷系法术', icon: '⚡', color: '#ffe066', kind: 'instant', shape: 'instant',
        cdBase: 6000, dmgBase: 8, countBase: 1, speed: 0, turn: 0, r: 0,
        chain: 10, chainRange: 130, chainDecay: 0.85, tag: '7s 一道，即时落雷传导 10 目标' },
      { id: 'frost', name: '冰系法术', icon: '❄', color: '#74c0fc', kind: 'homing', shape: 'shard',
        cdBase: 6000, dmgBase: 4.2, countBase: 1, speed: 300, turn: 9, r: 6, freeze: 0.9,
        tag: '6.5s 一支，冻住敌人' },
      { id: 'poison', name: '毒系法术', icon: '☣', color: '#a9e34b', kind: 'lob', shape: 'blob',
        cdBase: 7000, dmgBase: 3, countBase: 1, speed: 260, r: 7, splash: 46, splashRatio: 0.5,
        dotDps: 1.5, dotDur: 5, tag: '8s 一坨，抛物毒液 + 持续掉血' }
    ],

    /* 卡池：cat = 强度（无副作用）/ 数量（掉伤害）/ 机制（掉伤害）/ 解锁（获得新武器）
       gain 与 tax 同时生效：dmg、cd、freeze、knock、dotDur、chainDecay 走乘法；
       count、pierce、child、burn、chain、toxic 走加法 */
    cards: [
      { id: 'b_split', weapon: 'basic', cat: '数量', name: '齐射分裂', color: '#8fe9ff', max: 6,
        gain: { count: 1 }, tax: { dmg: 0.70 },
        desc: function (lv) { return '弹道 +1（当前 ' + (1 + lv) + ' 发）'; }, cost: '每发伤害 -30%' },
      { id: 'b_power', weapon: 'basic', cat: '强度', name: '高爆弹药', color: '#ffd166', max: 5,
        gain: { dmg: 1.40 }, desc: function () { return '普攻伤害 +40%（乘法叠加）'; } },
      { id: 'b_rapid', weapon: 'basic', cat: '强度', name: '快速装填', color: '#a3bffa', max: 4,
        gain: { cd: 0.86 }, desc: function (lv) { return '冷却 -14%（当前 ' + (2 * Math.pow(0.86, lv)).toFixed(2) + 's）'; } },

      { id: 'f_unlock', weapon: 'fire', cat: '解锁', name: '火系法术', color: '#ff922b', max: 1, unlock: 'fire',
        desc: function () { return '获得火系：6s 一发重火球，落点溅射'; } },
      { id: 'f_power', weapon: 'fire', cat: '强度', name: '烈焰核心', color: '#ff922b', max: 4,
        gain: { dmg: 1.40 }, desc: function () { return '火球伤害 +40%（乘法叠加）'; } },
      { id: 'f_count', weapon: 'fire', cat: '数量', name: '双球齐出', color: '#ffa94d', max: 2,
        gain: { count: 1 }, tax: { dmg: 0.70 },
        desc: function (lv) { return '火球 +1（当前 ' + (1 + lv) + ' 颗）'; }, cost: '每颗伤害 -30%' },
      { id: 'f_burn', weapon: 'fire', cat: '机制', name: '烧伤地带', color: '#ff6b6b', max: 2,
        gain: { burn: 1 }, tax: { dmg: 0.80 },
        desc: function (lv) { return '落点留下烧伤区 5s，每 0.4s 灼烧 ' + (1.6 * lv).toFixed(1); }, cost: '火球伤害 -20%' },

      { id: 'w_unlock', weapon: 'wind', cat: '解锁', name: '风系法术', color: '#9be15d', max: 1, unlock: 'wind',
        desc: function () { return '获得风系：5s 两股气刃，命中把敌人向后吹退'; } },
      { id: 'w_power', weapon: 'wind', cat: '强度', name: '风暴之怒', color: '#9be15d', max: 4,
        gain: { dmg: 1.40 }, desc: function () { return '气刃伤害 +40%（乘法叠加）'; } },
      { id: 'w_count', weapon: 'wind', cat: '数量', name: '气刃分裂', color: '#b2f2bb', max: 3,
        gain: { count: 1 }, tax: { dmg: 0.70 },
        desc: function (lv) { return '气刃 +1（当前 ' + (2 + lv) + ' 股）'; }, cost: '每股伤害 -30%' },
      { id: 'w_knock', weapon: 'wind', cat: '机制', name: '飓风冲击', color: '#66a80f', max: 2,
        gain: { knock: 1.60 }, tax: { dmg: 0.80 },
        desc: function (lv) { return '击退距离 +60%（' + Math.round(54 * Math.pow(1.6, lv)) + 'px）'; }, cost: '每股伤害 -20%' },

      { id: 't_unlock', weapon: 'thunder', cat: '解锁', name: '雷系法术', color: '#ffe066', max: 1, unlock: 'thunder',
        desc: function () { return '获得雷系：7s 一道即时落雷，向附近传导最多 10 个目标'; } },
      { id: 't_power', weapon: 'thunder', cat: '强度', name: '高压电容', color: '#ffe066', max: 4,
        gain: { dmg: 1.40 }, desc: function () { return '闪电伤害 +40%（乘法叠加）'; } },
      { id: 't_chain', weapon: 'thunder', cat: '机制', name: '超导网络', color: '#ffd43b', max: 4,
        gain: { chain: 5 }, tax: { dmg: 0.85 },
        desc: function (lv) { return '传导目标 +5（当前 ' + (10 + lv * 5) + ' 个）'; }, cost: '每跳伤害 -15%' },
      { id: 't_count', weapon: 'thunder', cat: '数量', name: '双重放电', color: '#fab005', max: 2,
        gain: { count: 1 }, tax: { dmg: 0.70 },
        desc: function (lv) { return '同时落下 ' + (1 + lv) + ' 道闪电'; }, cost: '每道伤害 -30%' },

      { id: 'i_unlock', weapon: 'frost', cat: '解锁', name: '冰系法术', color: '#74c0fc', max: 1, unlock: 'frost',
        desc: function () { return '获得冰系：6.5s 一支冰晶，冻住敌人 0.9s（受抗性影响）'; } },
      { id: 'i_power', weapon: 'frost', cat: '强度', name: '极寒核心', color: '#74c0fc', max: 4,
        gain: { dmg: 1.40 }, desc: function () { return '冰锥伤害 +40%（乘法叠加）'; } },
      { id: 'i_freeze', weapon: 'frost', cat: '机制', name: '霜冻延长', color: '#a5d8ff', max: 2,
        gain: { freeze: 1.55 }, tax: { dmg: 0.85 },
        desc: function (lv) { return '冰冻时长 +55%（上限 2s，当前 ' + Math.min(2, 0.75 * Math.pow(1.55, lv)).toFixed(2) + 's）'; }, cost: '冰锥伤害 -15%' },
      { id: 'i_count', weapon: 'frost', cat: '数量', name: '冰锥分裂', color: '#4dabf7', max: 3,
        gain: { count: 1 }, tax: { dmg: 0.70 },
        desc: function (lv) { return '冰锥 +1（当前 ' + (1 + lv) + ' 支）'; }, cost: '每支伤害 -30%' },

      { id: 'p_unlock', weapon: 'poison', cat: '解锁', name: '毒系法术', color: '#a9e34b', max: 1, unlock: 'poison',
        desc: function () { return '获得毒系：8s 一坨抛物毒液，命中上毒 5s 持续掉血'; } },
      { id: 'p_power', weapon: 'poison', cat: '强度', name: '剧毒浓缩', color: '#a9e34b', max: 4,
        gain: { dmg: 1.40 }, desc: function () { return '毒伤与直接伤害 +40%（乘法叠加）'; } },
      { id: 'p_dur', weapon: 'poison', cat: '机制', name: '蔓延瘟疫', color: '#94d82d', max: 2,
        gain: { dotDur: 1.50 }, tax: { dmg: 0.85 },
        desc: function (lv) { return '中毒持续 +50%（当前 ' + (4 * Math.pow(1.5, lv)).toFixed(1) + 's）'; }, cost: '毒伤 -15%' },
      { id: 'p_burst', weapon: 'poison', cat: '机制', name: '腐爆', color: '#66a80f', max: 1,
        gain: { toxic: 1 }, tax: { dmg: 0.80 },
        desc: function () { return '中毒敌人死亡时炸出毒雾区 5s，继续传染'; }, cost: '毒伤 -20%' }
    ],

    levels: [
      buildLevel('草地前哨', 1.00, 1.00, 1.75,
        [{ grunt: 1, runner: 0.25 },
         { grunt: 1, runner: 0.50, bat: 0.20 },
         { grunt: 1, runner: 0.55, bat: 0.40 },
         { grunt: 1, runner: 0.60, bat: 0.50, tank: 0.10 }],
        1.603),
      buildLevel('暮色小径', 1.05, 1.03, 1.90,
        [{ grunt: 1, runner: 0.55, bat: 0.15 },
         { grunt: 0.80, runner: 0.55, bat: 0.40 },
         { grunt: 0.70, runner: 0.50, bat: 0.50, tank: 0.12 },
         { grunt: 0.60, runner: 0.55, bat: 0.55, tank: 0.20 }],
        1.523),
      buildLevel('紫晶废墟', 1.10, 1.06, 2.10,
        [{ grunt: 0.80, runner: 0.60, bat: 0.30, tank: 0.10 },
         { grunt: 0.70, runner: 0.55, bat: 0.50, tank: 0.18 },
         { grunt: 0.60, runner: 0.50, bat: 0.55, tank: 0.28 },
         { grunt: 0.50, runner: 0.50, bat: 0.60, tank: 0.35 }],
        1.463),
      buildLevel('熔岩裂谷', 1.12, 1.09, 2.04,
        [{ grunt: 0.50, runner: 0.60, bat: 0.60, tank: 0.08 },
         { grunt: 0.35, runner: 0.60, bat: 0.65, tank: 0.18 },
         { runner: 0.60, bat: 0.70, tank: 0.35 },
         { runner: 0.55, bat: 0.75, tank: 0.45 }],
        1.403),
      buildLevel('终焉核心', 1.20, 1.12, 1.85,
        [{ grunt: 0.40, runner: 0.60, bat: 0.70, tank: 0.10 },
         { grunt: 0.20, runner: 0.60, bat: 0.75, tank: 0.25 },
         { runner: 0.55, bat: 0.80, tank: 0.50 },
         { runner: 0.50, bat: 0.85, tank: 0.60 }],
        1.303)
    ]
  };
})(typeof GameGlobal !== 'undefined' ? GameGlobal : window);
