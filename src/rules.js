"use strict";
(function (root) {
  var PM = root.PixelMow, C = PM.Config;
  var byId = Object.create(null);
  C.skills.forEach(function (s) { byId[s.id] = s; });
  function skill(id) { return byId[id]; }
  function has(s, tag) { return s.tags.indexOf(tag) >= 0; }
  function owned(state) { return C.skills.filter(function (s) { return state.skills[s.id] && state.skills[s.id].owned; }); }
  function bonds(state) {
    var result = {};
    owned(state).forEach(function (s) { s.tags.forEach(function (tag) { result[tag] = (result[tag] || 0) + 1; }); });
    return result;
  }
  function bondsUnlocked(state) { return owned(state).length >= C.bondUnlockSkills; }
  function bonus(counts, tag) {
    var f = C.factions[tag], n = counts[tag] || 0;
    return f.bond ? (n >= 4 ? f.bond[1] : n >= 2 ? f.bond[0] : 0) : 0;
  }
  function baseCount(s, tag) {
    return tag === 'multi' ? s.targets || 1 : tag === 'gather' ? 1 : tag === 'bounce' ? s.bounces || 0 : tag === 'chain' ? s.chains || 0 : 0;
  }
  function cardMax(s, tag) {
    var f = C.factions[tag];
    if (f.cap === undefined) return Infinity;
    if (tag === 'split') return f.cap - 1; // 首张开启 2 个，此后每级 +1。
    return Math.ceil((f.cap - (f.totalCap ? baseCount(s, tag) : 0)) / f.step - 1e-9);
  }
  var cards = [], cardMap = Object.create(null);
  C.skills.forEach(function (s) {
    if (s.id !== C.loadout.initial) cards.push({ id: 'get:' + s.id, skill: s.id, unlock: s.id, name: '获得·' + s.name, color: s.color, cat: '解锁', max: 1 });
    s.tags.filter(function (tag) { return (s.noCards || []).indexOf(tag) < 0; }).concat(['damage', 'attribute']).forEach(function (tag) {
      var f = C.factions[tag];
      cards.push({ id: s.id + ':' + tag, skill: s.id, tag: tag, name: s.name + '·' + f.name,
        color: s.color, cat: f.cap === undefined ? '强度' : '强化', max: cardMax(s, tag), cost: f.cap === undefined ? '' : '本技能伤害 -5%（加算）' });
    });
  });
  cards.forEach(function (c) { cardMap[c.id] = c; });
  function eligible(state, id) {
    var s = skill(id), list = owned(state);
    if (!s || list.some(function (v) { return v.id === id; })) return false;
    if (state.mode !== 'endless' && list.length >= C.loadout.slots) return false;
    if (list.some(function (v) { return (v.excludes || []).indexOf(s.el) >= 0; })) return false;
    if ((s.excludes || []).some(function (el) { return list.some(function (v) { return v.el === el; }); })) return false;
    if (s.mode !== 'fullscreen') return state.mode === 'endless' || state.candidates.indexOf(id) >= 0;
    return Object.keys(s.cond).every(function (el) { return list.filter(function (v) { return v.el === el; }).length >= s.cond[el]; });
  }
  function pool(state) {
    return cards.filter(function (c) {
      return c.unlock ? eligible(state, c.unlock) : state.skills[c.skill] && state.skills[c.skill].owned && (state.cardLevels[c.id] || 0) < c.max;
    }).map(function (c) { return { card: c, level: state.cardLevels[c.id] || 0 }; });
  }
  function derive(state, id) {
    var s = skill(id), counts = bondsUnlocked(state) ? bonds(state) : {}, tax = 0;
    function level(tag) { return state.cardLevels[id + ':' + tag] || 0; }
    function amount(tag) {
      if (!has(s, tag)) return 0;
      var f = C.factions[tag], own = level(tag) * f.step;
      if (tag === 'split') return level(tag) ? Math.min(f.cap, level(tag) + 1) + bonus(counts, tag) : 0;
      own += f.totalCap ? baseCount(s, tag) : 0;
      return Math.min(f.cap, own) + bonus(counts, tag);
    }
    s.tags.forEach(function (tag) { tax += level(tag) * .05; });
    var damageBonus = level('damage') * .2 + level('attribute') * .1;
    var attack = C.power.base * s.ratio * Math.max(0, 1 + (state.player.damageBonus || 0) + damageBonus - tax);
    return { id: id, dmg: attack, cd: s.persistent ? 0 : Math.max(s.minCd, s.cd * (1 - amount('cooldown') - (state.player.haste || 0))) * 1000,
      count: has(s, 'multi') ? amount('multi') : 1, child: amount('split'), pierce: amount('pierce'),
      radius: (s.radius || C.combat.radius) * (1 + amount('range')), duration: has(s, 'duration') ? (s.duration || C.combat.duration) + amount('duration') : 0,
      breach: amount('breach'), slow: amount('slow'), freezeChance: has(s, 'freeze') ? Math.min(1, C.combat.freezeChance + amount('freeze')) : 0, freeze: C.combat.freeze,
      knock: has(s, 'knock') ? C.combat.knock * (1 + amount('knock')) : 0, gather: amount('gather'),
      chain: amount('chain'), chainRange: C.combat.chainRange * (1 + amount('range')), bounce: amount('bounce'),
      speed: C.combat.projectileSpeed, r: s.area === 'area' ? 7 : 4, shape: s.el === 'fire' ? 'orb' : s.el === 'ice' ? 'shard' : s.el === 'poison' ? 'blob' : s.el === 'wind' ? 'gale' : 'bolt' };
  }
  function damage(attack, defense, breach, level, wave) {
    if (!isFinite(attack) || !isFinite(defense) || !isFinite(breach)) return 0;
    var raw = attack - Math.max(0, defense) * (1 - Math.max(0, Math.min(1, breach)));
    // 攻防相等也触发保底；容忍加算产生的微小浮点误差。
    return raw <= 1e-9 ? 25 + (level || 1) + (wave || 1) : raw;
  }
  function describe(card, level) {
    var s = skill(card.skill);
    if (card.unlock) return s.persistent ? '常驻单层中毒；此后禁选风系' :
      '攻击 ' + C.power.base * s.ratio + ' · 冷却 ' + s.cd + 's（最短 ' + s.minCd + 's）· ' + (s.mode === 'fullscreen' ? '全屏' : (s.targets || 1) + ' 目标');
    var tag = card.tag, f = C.factions[tag], value = Math.min(level, card.max) * f.step;
    if (tag === 'split') return '命中后分裂 ' + (level + 1) + ' 个半伤子弹，最多一代';
    if (tag === 'duration') return '本技能持续时间 +' + value.toFixed(1) + ' 秒';
    if (f.totalCap) return '本技能' + f.name + ' ' + (baseCount(s, tag) + value) + (tag === 'bounce' ? ' 次' : ' 个目标') + '（羁绊另计）';
    return '本技能' + f.name + (tag === 'cooldown' ? ' -' : ' +') + Math.round(value * 100) + '%（加算）';
  }
  function progress(raw) {
    var p = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    var out = { version: 3, stars: [], flawless: [], coins: 0, meta: {}, candidates: [], endless: { bestWave: 0, bestKills: 0 }, doubleSpeedUnlocked: p.doubleSpeedUnlocked === true };
    ['bestWave', 'bestKills'].forEach(function (key) {
      var n = p.endless && p.endless[key];
      out.endless[key] = Number.isFinite(n) ? Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(n))) : 0;
    });
    C.levels.forEach(function (_, i) {
      var n = Array.isArray(p.stars) ? Number(p.stars[i]) : 0;
      out.stars[i] = isFinite(n) ? Math.max(0, Math.min(3, Math.floor(n))) : 0;
      out.flawless[i] = !!(Array.isArray(p.flawless) && p.flawless[i]);
    });
    out.coins = Number.isFinite(p.coins) ? Math.max(0, p.coins) : 0;
    C.meta.upgrades.forEach(function (u) {
      var n = p.meta && p.meta[u.id];
      // 保留已购等级，按当前上限清洗；成长百分比从配置读取。
      out.meta[u.id] = Number.isFinite(n) ? Math.max(0, Math.min(u.max, Math.floor(n))) : 0;
    });
    var ids = Array.isArray(p.candidates) ? p.candidates : C.loadout.defaults;
    ids.forEach(function (id) {
      var s = skill(id);
      if (s && id !== C.loadout.initial && s.mode !== 'fullscreen' && out.candidates.indexOf(id) < 0 && out.candidates.length < C.loadout.candidates) out.candidates.push(id);
    });
    return out;
  }
  PM.Rules = { skill: skill, has: has, cards: cards, card: function (id) { return cardMap[id]; }, owned: owned, bonds: bonds, bondsUnlocked: bondsUnlocked,
    bonus: bonus, cardMax: cardMax, eligible: eligible, pool: pool, derive: derive, damage: damage, describe: describe, progress: progress };
})(typeof GameGlobal !== 'undefined' ? GameGlobal : window);
