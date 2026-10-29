"use strict";
(function (root) {
  var PM = root.PixelMow, C = PM.Config, R = PM.Rules;
  function distSegment(p, a, b) {
    var dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
    var t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length)) : 0;
    return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
  }
  function create(G, hooks) {
    function onField(e) { return !e.dead && e.hp > 0 && e.y >= C.combat.enterY; }
    function targets() { return G.enemies.filter(onField); }
    function damageEnemy(e, attack, d, scale) {
      if (!onField(e)) return 0;
      var damage = R.damage(attack, e.def || 0, d.breach || 0) * (scale === undefined ? 1 : scale);
      if (!isFinite(damage)) return 0;
      e.hp -= damage; e.flash = damage > 0 ? 1 : e.flash;
      if (e.hp <= 0) hooks.kill(e, d.id);
      return damage;
    }
    function effects(e, d) {
      var resist = e.resist || {};
      if (d.knock) e.y = Math.max(C.combat.enterY, e.y - d.knock * (1 - (resist.knock || 0)));
      if (d.freezeChance && Math.random() < d.freezeChance) e.freezeT = Math.max(e.freezeT || 0, Math.min(C.control.freezeCap, d.freeze * (1 - (resist.freeze || 0))));
      if (d.slow) { e.slowT = 2; e.slow = Math.max(e.slow || 0, d.slow); }
    }
    function hit(e, d, attack) { if (!onField(e)) return; effects(e, d); damageEnemy(e, attack === undefined ? d.dmg : attack, d); }
    function arc(a, b, color) { G.arcs.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, color: color, age: 0, life: .22 }); }
    function boom(x, y, radius, color) { G.booms.push({ x: x, y: y, r: radius, color: color, age: 0, life: .45 }); }
    function dot(e, d, attack) {
      e.dots = e.dots || {};
      // 同技能刷新，不叠加；不同技能各自保留来源、破防和倍率。
      e.dots[d.id] = { attack: attack, breach: d.breach, id: d.id, remaining: d.duration };
      e.poisonT = d.duration;
    }
    function area(x, y, d, leaveZone) {
      var s = R.skill(d.id), affected = targets().filter(function (e) { return Math.hypot(e.x - x, e.y - y) <= d.radius + e.r; });
      affected.slice(0, d.gather).forEach(function (e) { e.x += (x - e.x) * .5; e.y = Math.max(C.combat.enterY, e.y + (y - e.y) * .5); });
      affected.forEach(function (e) { hit(e, d); });
      boom(x, y, d.radius, s.color);
      if (leaveZone && d.duration) G.zones.push({ x: x, y: y, r: d.radius, color: s.color, age: 0, life: d.duration, pending: 0, derived: d });
    }
    function densest(radius, excluded) {
      var pool = targets().filter(function (e) { return !excluded[e.id]; });
      if (!pool.length) return null;
      var best = pool[0], score = -1;
      // 固定 12×16 候选点；落点吸附到候选点附近的敌人脚下。
      for (var row = 0; row < 16; row++) for (var col = 0; col < 12; col++) {
        var x = (col + .5) * C.width / 12, y = C.combat.enterY + row * (C.hero.y - C.combat.enterY) / 16;
        var count = 0, nearest = null, distance = Infinity;
        pool.forEach(function (e) { var dist = Math.hypot(e.x - x, e.y - y); if (dist <= radius) count++; if (dist < distance) { distance = dist; nearest = e; } });
        if (count > score) { score = count; best = nearest; }
      }
      return best;
    }
    function projectile(d, target, origin, child, excluded) {
      var s = R.skill(d.id), angle = Math.atan2(target.y - origin.y, target.x - origin.x);
      G.bullets.push({ skill: d.id, x: origin.x, y: origin.y, vx: Math.cos(angle) * d.speed, vy: Math.sin(angle) * d.speed,
        r: d.r, shape: d.shape, derived: d, damage: d.dmg * (child ? .5 : 1), life: 3, child: !!child,
        targetId: target.id, excluded: excluded, hitIds: {}, pierce: child ? 0 : d.pierce,
        area: child ? 'single' : s.area, end: { x: target.x, y: target.y }, dead: false });
    }
    function split(b, e) {
      if (b.child || b.splitDone || !b.derived.child) return;
      b.splitDone = true;
      targets().filter(function (t) { return t.id !== e.id && !b.hitIds[t.id]; })
        .sort(function (a, c) { return Math.hypot(a.x - e.x, a.y - e.y) - Math.hypot(c.x - e.x, c.y - e.y); })
        .slice(0, b.derived.child).forEach(function (t) { projectile(b.derived, t, e, true, e.id); });
    }
    function chain(from, d, reached) {
      var current = from;
      for (var n = 0; n < d.chain; n++) {
        var next = targets().filter(function (e) { return !reached[e.id] && Math.hypot(e.x - current.x, e.y - current.y) <= d.chainRange; })
          .sort(function (a, b) { return Math.hypot(a.x - current.x, a.y - current.y) - Math.hypot(b.x - current.x, b.y - current.y); })[0];
        if (!next) break;
        reached[next.id] = true; arc(current, next, R.skill(d.id).color); hit(next, d); current = next;
      }
    }
    function laser(d) {
      var angle = (30 + Math.random() * 30) * Math.PI / 180, vx = Math.cos(angle) * (Math.random() < .5 ? -1 : 1), vy = -Math.sin(angle);
      var start = { x: C.hero.x, y: C.hero.y - 16 }, reached = {};
      for (var bounce = 0; bounce <= d.bounce; bounce++) {
        var wall = vx > 0 ? C.width : 0, tx = (wall - start.x) / vx, ty = (C.combat.enterY - start.y) / vy;
        var distance = Math.min(tx, ty), end = { x: start.x + vx * distance, y: start.y + vy * distance };
        arc(start, end, R.skill(d.id).color);
        targets().forEach(function (e) { if (!reached[e.id] && distSegment(e, start, end) <= e.r + 3) { reached[e.id] = true; hit(e, d); } });
        if (ty <= tx) break;
        start = end; vx = -vx;
      }
    }
    function cast(d) {
      var s = R.skill(d.id), pool = targets().sort(function (a, b) { return b.y - a.y; });
      if (!pool.length) return false;
      var origin = { x: C.hero.x, y: C.hero.y - 16 };
      if (s.mode === 'fullscreen') {
        pool.forEach(function (e) { if (s.persistent) dot(e, d, d.dmg); else hit(e, d); });
        if (!s.persistent) { G.sweeps.push({ color: s.color, age: 0, life: .65 }); hooks.sound('boom'); }
      } else if (s.id === 'laser') laser(d);
      else if (s.mode === 'generate') {
        var used = {};
        for (var i = 0; i < d.count; i++) { var t = densest(d.radius, used); if (!t) break; used[t.id] = true; area(t.x, t.y, d, true); }
      } else if (s.id === 'chain') {
        pool.slice(0, d.count).forEach(function (t) {
          var reached = {}; reached[t.id] = true;
          // 初始链接伤害整条路径，传导额外寻找附近目标。
          arc(origin, t, s.color);
          targets().forEach(function (e) { if (distSegment(e, origin, t) <= e.r + 3) { reached[e.id] = true; hit(e, d); } });
          chain(t, d, reached);
        });
      } else pool.slice(0, d.count).forEach(function (t) { projectile(d, t, origin, false); });
      G.player.aim = Math.atan2(pool[0].y - origin.y, pool[0].x - origin.x);
      return true;
    }
    function update(dt) {
      // 子弹采用线段碰撞，低帧率下也不会穿过目标；新分裂子弹留到下一帧。
      G.bullets.slice().forEach(function (b) {
        var old = { x: b.x, y: b.y }; b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
        if (b.area === 'area' && distSegment(b.end, old, b) <= b.r + 2) { area(b.end.x, b.end.y, b.derived, true); b.dead = true; }
        if (!b.dead) {
          var hits = targets().filter(function (e) { return !b.hitIds[e.id] && e.id !== b.excluded && (!b.child || e.id === b.targetId) && distSegment(e, old, b) <= e.r + b.r; })
            .sort(function (a, c) { return Math.hypot(a.x - old.x, a.y - old.y) - Math.hypot(c.x - old.x, c.y - old.y); });
          for (var i = 0; i < hits.length && !b.dead; i++) {
            var e = hits[i]; b.hitIds[e.id] = true;
            if (b.area === 'area') { area(e.x, e.y, b.derived, true); b.dead = true; }
            else { hit(e, b.derived, b.damage); split(b, e); if (b.pierce > 0) b.pierce--; else b.dead = true; }
          }
        }
        if (b.life <= 0 || b.x < -20 || b.x > C.width + 20 || b.y < -20 || b.y > C.height + 20) b.dead = true;
      });
      G.bullets = G.bullets.filter(function (b) { return !b.dead; });
      G.zones.forEach(function (z) {
        var elapsed = Math.min(dt, Math.max(0, z.life - z.age)); z.age += dt; z.pending += elapsed;
        while (z.pending >= C.combat.zoneTick - 1e-9 || (z.age >= z.life && z.pending > 1e-9)) {
          var span = Math.min(C.combat.zoneTick, z.pending); z.pending -= span;
          targets().forEach(function (e) { if (Math.hypot(e.x - z.x, e.y - z.y) <= z.r + e.r) damageEnemy(e, z.derived.dmg * C.combat.zoneDamageRatio, z.derived, span); });
        }
      });
      G.zones = G.zones.filter(function (z) { return z.age < z.life; });
    }
    function statuses(e, dt) {
      Object.keys(e.dots || {}).forEach(function (id) {
        var d = e.dots[id], elapsed = Math.min(dt, d.remaining);
        damageEnemy(e, d.attack, d, elapsed); d.remaining -= dt;
        if (d.remaining <= 0) delete e.dots[id];
      });
      e.poisonT = Math.max(0, (e.poisonT || 0) - dt);
      e.slowT = Math.max(0, (e.slowT || 0) - dt); if (!e.slowT) e.slow = 0;
    }
    return { cast: cast, update: update, statuses: statuses, damageEnemy: damageEnemy, hit: hit, area: area, densest: densest };
  }
  PM.Combat = { create: create, distSegment: distSegment };
})(typeof GameGlobal !== 'undefined' ? GameGlobal : window);
