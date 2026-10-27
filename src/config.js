"use strict";
(function (root) {
  var PM = root.PixelMow = root.PixelMow || {};

  /* 波次数量规则（全局统一，关卡只改怪物组合与刷怪节奏）：
     第 1-3 波 每波 20 只；第 4-6 波 每波 30 只；第 7-9 波 每波 50 只；
     第 10 波 50 只小怪 + 1 只首领（首领占用该波最后一次刷怪名额，故为 51）。 */
  var WAVE_KILLS = [20, 20, 20, 30, 30, 30, 50, 50, 50, 51];
  var LAST_WAVE = WAVE_KILLS.length - 1;

  /* tiers = [1-3 波, 4-6 波, 7-9 波, 第 10 波] 四档配置，展开成 10 个波次 */
  function tierOf(waveIndex) { return waveIndex < 3 ? 0 : (waveIndex < 6 ? 1 : (waveIndex < 9 ? 2 : 3)); }
  function buildWaves(tierPools, tierIntervals) {
    var waves = [];
    for (var i = 0; i < WAVE_KILLS.length; i++) {
      var t = tierOf(i);
      waves.push({ kills: WAVE_KILLS[i], interval: tierIntervals[t], pool: tierPools[t], boss: i === LAST_WAVE });
    }
    return waves;
  }
  function buildLevel(name, hpScale, speedScale, tierPools, tierIntervals) {
    return { name: name, hpScale: hpScale, speedScale: speedScale, waves: buildWaves(tierPools, tierIntervals) };
  }

  PM.Config = {
    width: 480,
    height: 640,
    totalSlots: 5,
    intermissionSeconds: 3,
    waveCount: WAVE_KILLS.length,
    hero: { x: 240, y: 552 },
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
    enemyTypes: {
      grunt: { spr: 'slime', cell: 3, hp: 3, spd: 25, xp: 1, dmg: 5, color: '#7cff6b', r: 13 },
      runner: { spr: 'runner', cell: 3, hp: 2, spd: 43, xp: 1, dmg: 4, color: '#ffd166', r: 10 },
      bat: { spr: 'bat', cell: 3, hp: 4, spd: 34, xp: 2, dmg: 6, color: '#ff5d6c', r: 12, sway: true },
      tank: { spr: 'tank', cell: 4, hp: 14, spd: 14, xp: 4, dmg: 12, color: '#b197fc', r: 19 },
      boss: { spr: 'boss', cell: 6, hp: 38, spd: 9, xp: 18, dmg: 25, color: '#ff8787', r: 30, boss: true }
    },
    skills: [
      { id: 'multishot', name: '多重射击', icon: '✳', color: '#38bdf8', max: 6,
        describe: function (next) { return '齐射弹道提升至 ' + (1 + next) + ' 发'; }, base: '增加同时攻击的目标数。' },
      { id: 'pierce', name: '贯穿弹', icon: '➹', color: '#c084fc', max: 6,
        describe: function (next) { return '每发额外贯穿 ' + next + ' 个敌人'; }, base: '同一发子弹不会重复命中。' },
      { id: 'boom', name: '爆裂弹', icon: '✸', color: '#fb923c', max: 6,
        describe: function (next) { return '爆炸半径 ' + (44 + (next - 1) * 12) + '，溅射伤害 ' + (1 + next * 0.5).toFixed(1); }, base: '命中处造成范围伤害。' },
      { id: 'rapid', name: '快速装填', icon: '⚡', color: '#facc15', max: 6,
        describe: function (next) { return '射击间隔缩短至 ' + Math.round(1000 * Math.pow(0.88, next)) + 'ms'; }, base: '提高持续输出能力。' }
    ],
    levels: [
      buildLevel('草地前哨', 1.00, 1.00,
        [{ grunt: 1, runner: 0.25 },
         { grunt: 1, runner: 0.50, bat: 0.20 },
         { grunt: 1, runner: 0.55, bat: 0.40 },
         { grunt: 1, runner: 0.60, bat: 0.50, tank: 0.10 }],
        [1.20, 1.10, 1.00, 0.95]),
      buildLevel('暮色小径', 1.15, 1.03,
        [{ grunt: 1, runner: 0.55, bat: 0.15 },
         { grunt: 0.80, runner: 0.55, bat: 0.40 },
         { grunt: 0.70, runner: 0.50, bat: 0.50, tank: 0.12 },
         { grunt: 0.60, runner: 0.55, bat: 0.55, tank: 0.20 }],
        [1.10, 1.02, 0.95, 0.90]),
      buildLevel('紫晶废墟', 1.35, 1.06,
        [{ grunt: 0.80, runner: 0.60, bat: 0.30, tank: 0.10 },
         { grunt: 0.70, runner: 0.55, bat: 0.50, tank: 0.18 },
         { grunt: 0.60, runner: 0.50, bat: 0.55, tank: 0.28 },
         { grunt: 0.50, runner: 0.50, bat: 0.60, tank: 0.35 }],
        [1.05, 0.98, 0.90, 0.85]),
      buildLevel('熔岩裂谷', 1.60, 1.09,
        [{ grunt: 0.40, runner: 0.60, bat: 0.60, tank: 0.12 },
         { grunt: 0.35, runner: 0.60, bat: 0.65, tank: 0.25 },
         { runner: 0.60, bat: 0.70, tank: 0.35 },
         { runner: 0.55, bat: 0.75, tank: 0.45 }],
        [1.00, 0.92, 0.85, 0.80]),
      buildLevel('终焉核心', 1.90, 1.12,
        [{ grunt: 0.30, runner: 0.60, bat: 0.70, tank: 0.20 },
         { runner: 0.60, bat: 0.75, tank: 0.35 },
         { runner: 0.55, bat: 0.80, tank: 0.50 },
         { runner: 0.50, bat: 0.85, tank: 0.60 }],
        [0.95, 0.86, 0.80, 0.75])
    ]
  };
})(typeof GameGlobal !== 'undefined' ? GameGlobal : window);
