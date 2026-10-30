"use strict";
// 网页版云端账号与进度同步：登录浮层 + 存档自动上云。
// 微信小游戏端不加载本文件能力；SDK 未加载（离线/CDN 失败）时自动退回游客模式。
(function (root) {
  var PM = root.PixelMow, P = PM.Platform;
  var isWx = typeof wx !== 'undefined' && typeof wx.createCanvas === 'function';
  var hasSdk = typeof root.WorkBuddyCloud !== 'undefined' && !!WorkBuddyCloud.createWorkBuddyCloud;
  var hasDom = typeof document !== 'undefined' && !!document.body;
  if (isWx || !hasSdk || !hasDom) return;

  // 云服务公开配置：仅标识应用（服务端按发布域名校验 Origin），不含任何私密凭据。
  var ENDPOINT = 'https://pixel-mow-11999.app.workbuddy.host';
  var OAUTH_RELAY = 'https://www.workbuddy.cn/v2/as/genie-baas/oauth';
  var PUBLISHABLE_KEY = 'wbpk_ee6Bx4RaYxptTy62dN9uFP_jHABwVPbseEz41du7cdoEtAYohGL9o0y';
  var SESSION_KEY = 'pixelMowAccount';
  var REWARD_KEY = 'pixelMowPendingRegistrationReward';
  var authBusy = false;
  var SAVE_KEY = 'pixelMowProgress.v3'; // 与 platform.js 保持一致

  var cloud = WorkBuddyCloud.createWorkBuddyCloud({
    endpoint: ENDPOINT, oauthRelayBaseUrl: OAUTH_RELAY, publishableKey: PUBLISHABLE_KEY
  });

  var session = null; // { id, account, hash }
  var syncTimer = null, toastTimer = null;
  var el = {};

  function readJson(key) {
    try { var raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  function sha256Hex(text) {
    if (!root.crypto || !crypto.subtle) return Promise.reject(new Error('当前环境不支持加密，请通过 HTTPS 访问'));
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    });
  }
  function hashOf(account, password) { return sha256Hex('pixel-mow:' + account + ':' + password); }
  function mapErr(err) {
    var msg = (err && err.message) || '';
    if (msg.indexOf('account_exists') >= 0) return '该账号已被注册';
    if (msg.indexOf('invalid_account') >= 0) return '账号需 2-24 个字符';
    if (msg.indexOf('invalid_password') >= 0) return '密码至少 4 位';
    if (msg.indexOf('HTTPS') >= 0) return msg;
    return '网络异常，请稍后重试';
  }

  // 存档 <-> 数据表字段
  function saveArgs(progress) {
    return {
      p_coins: Math.floor(progress.coins || 0),
      p_star1: progress.stars[0] | 0, p_star2: progress.stars[1] | 0, p_star3: progress.stars[2] | 0,
      p_star4: progress.stars[3] | 0, p_star5: progress.stars[4] | 0,
      p_best_wave: Math.floor(progress.endless.bestWave || 0),
      p_best_kills: Math.floor(progress.endless.bestKills || 0),
      p_up_atk: progress.meta.atk | 0, p_up_def: progress.meta.def | 0, p_up_hp: progress.meta.hp | 0,
      p_up_shield: progress.meta.shield | 0, p_up_haste: progress.meta.haste | 0,
      p_double_speed: progress.doubleSpeedUnlocked === true,
      p_progress: progress
    };
  }
  function progressFromRow(row) {
    var saved = row && row.progress;
    if (saved && typeof saved === 'object' && saved.version === 3) return PM.Rules.progress(saved);
    return PM.Rules.progress({
      version: 3,
      stars: [row.star1, row.star2, row.star3, row.star4, row.star5],
      flawless: [],
      coins: Number(row.coins) || 0,
      meta: { atk: row.up_atk, def: row.up_def, hp: row.up_hp, shield: row.up_shield, haste: row.up_haste },
      candidates: [],
      endless: { bestWave: row.endless_best_wave, bestKills: row.endless_best_kills },
      doubleSpeedUnlocked: row.double_speed === true
    });
  }

  // 进度保存 → 防抖 1.5 秒后同步云端
  var baseSave = P.saveProgress;
  P.saveProgress = function (data) {
    baseSave(data);
    if (!session) return;
    root.clearTimeout(syncTimer);
    syncTimer = root.setTimeout(function () {
      if (!session) return;
      var args = saveArgs(data);
      args.p_id = session.id;
      args.p_password_hash = session.hash;
      cloud.database.rpc('player_save', args).then(function (res) {
        if (res && res.error) toast('云端保存失败：' + mapErr(res.error));
      }).catch(function () { toast('云端保存失败，请检查网络'); });
    }, 1500);
  };

  function setSession(row, hash) {
    session = { id: row.id, account: row.account, hash: hash };
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch (e) {}
    if (el.badge) el.badge.textContent = '☁ ' + row.account;
  }
  function clearSession() {
    session = null;
    try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
    if (el.badge) el.badge.textContent = '☁ 游客 · 登录';
  }
  function applyProgress(row) {
    var cloudProgress = progressFromRow(row);
    var local = PM.Rules.progress(readJson(SAVE_KEY));
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(cloudProgress)); } catch (e) {}
    // 本地与云端一致则无缝进入游戏；不一致时刷新页面以加载云端进度。
    if (JSON.stringify(local) !== JSON.stringify(cloudProgress)) root.location.reload();
  }

  function buildUi() {
    var style = document.createElement('style');
    style.textContent =
      '#pm-cloud-overlay{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(5,7,13,.92);font-family:ui-monospace,Menlo,Consolas,monospace}' +
      '#pm-cloud-panel{width:min(320px,86vw);box-sizing:border-box;padding:24px 22px;background:#0b1120;border:2px solid #232c47;border-radius:12px;color:#dfe6ff;text-align:center}' +
      '#pm-cloud-title{font-size:22px;letter-spacing:6px;margin-bottom:6px}' +
      '.pm-cloud-sub{font-size:11px;color:#7d89ad;margin-bottom:12px}' +
      '.pm-cloud-status{min-height:16px;font-size:12px;color:#f0c674;margin-bottom:8px;word-break:break-all}' +
      '.pm-cloud-form input{display:block;width:100%;box-sizing:border-box;margin:8px 0;padding:10px 12px;background:#05070d;border:1px solid #2b3763;border-radius:8px;color:#dfe6ff;font:inherit;font-size:14px;outline:none}' +
      '.pm-cloud-form input:focus{border-color:#4c6fff}' +
      '.pm-cloud-row{display:flex;gap:8px;margin-top:10px}' +
      '.pm-cloud-row button{flex:1;padding:10px 0;border:1px solid #3550c8;border-radius:8px;background:#1b2c74;color:#fff;font:inherit;font-size:14px;cursor:pointer}' +
      '.pm-cloud-row button:hover{background:#24399a}' +
      '.pm-cloud-row button.pm-cloud-ghost{background:transparent;border-color:#2b3763;color:#7d89ad}' +
      '.pm-cloud-row button.pm-cloud-ghost:hover{background:#10182f}' +
      '.pm-cloud-user{font-size:14px;margin:10px 0 2px}' +
      '#pm-cloud-toast{position:fixed;left:50%;bottom:32px;transform:translateX(-50%);z-index:10000;padding:8px 16px;background:#1b2c74;border:1px solid #3550c8;border-radius:8px;color:#fff;font:12px ui-monospace,monospace;opacity:0;transition:opacity .25s;pointer-events:none}' +
      '#pm-cloud-badge{position:fixed;top:10px;right:12px;z-index:9998;padding:4px 10px;background:rgba(11,17,32,.7);border:1px solid #2b3763;border-radius:999px;color:#9fb0e8;font:11px ui-monospace,monospace;cursor:pointer;max-width:40vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}';
    document.head.appendChild(style);

    var overlay = document.createElement('div');
    overlay.id = 'pm-cloud-overlay';
    overlay.innerHTML =
      '<div id="pm-cloud-panel">' +
      '<div id="pm-cloud-title">像素割草</div>' +
      '<div class="pm-cloud-sub">新账号注册赠送 2000 金币 · 登录后可跨设备继续</div>' +
      '<div class="pm-cloud-status" id="pm-cloud-status"></div>' +
      '<div class="pm-cloud-form" id="pm-cloud-form" style="display:none">' +
      '<input id="pm-cloud-account" placeholder="账号（2-24 字符）" maxlength="24" autocomplete="username" />' +
      '<input id="pm-cloud-password" type="password" placeholder="密码（至少 4 位）" maxlength="64" autocomplete="current-password" />' +
      '<div class="pm-cloud-row"><button id="pm-cloud-login" type="button">登 录</button>' +
      '<button id="pm-cloud-register" type="button">注 册</button></div>' +
      '<div class="pm-cloud-row"><button id="pm-cloud-guest" type="button" class="pm-cloud-ghost">游客试玩（仅保存在本机）</button></div>' +
      '</div>' +
      '<div class="pm-cloud-form" id="pm-cloud-session" style="display:none">' +
      '<div class="pm-cloud-user" id="pm-cloud-user"></div>' +
      '<div class="pm-cloud-row"><button id="pm-cloud-continue" type="button">继续游戏</button>' +
      '<button id="pm-cloud-logout" type="button" class="pm-cloud-ghost">退出登录</button></div>' +
      '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    var toastEl = document.createElement('div');
    toastEl.id = 'pm-cloud-toast';
    document.body.appendChild(toastEl);

    var badge = document.createElement('button');
    badge.id = 'pm-cloud-badge';
    badge.type = 'button';
    badge.textContent = '☁ 游客 · 登录';
    badge.style.display = 'none';
    document.body.appendChild(badge);

    el = {
      overlay: overlay,
      status: document.getElementById('pm-cloud-status'),
      form: document.getElementById('pm-cloud-form'),
      session: document.getElementById('pm-cloud-session'),
      user: document.getElementById('pm-cloud-user'),
      account: document.getElementById('pm-cloud-account'),
      password: document.getElementById('pm-cloud-password'),
      badge: badge,
      toast: toastEl
    };

    document.getElementById('pm-cloud-login').addEventListener('click', doLogin);
    document.getElementById('pm-cloud-register').addEventListener('click', doRegister);
    document.getElementById('pm-cloud-guest').addEventListener('click', function () { clearSession(); hide(); });
    document.getElementById('pm-cloud-continue').addEventListener('click', hide);
    document.getElementById('pm-cloud-logout').addEventListener('click', function () { clearSession(); root.location.reload(); });
    badge.addEventListener('click', function () {
      if (session) showSession();
      else showForm('');
    });
    [el.account, el.password].forEach(function (input) {
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });
    });
  }

  function setStatus(text) { el.status.textContent = text || ''; }
  function showForm(message) {
    setStatus(message);
    el.form.style.display = '';
    el.session.style.display = 'none';
    el.overlay.style.display = 'flex';
    el.badge.style.display = 'none';
  }
  function showSession() {
    setStatus('');
    el.user.textContent = '当前账号：' + session.account + '（进度已云端保存）';
    el.form.style.display = 'none';
    el.session.style.display = '';
    el.overlay.style.display = 'flex';
    el.badge.style.display = 'none';
  }
  function hide() {
    el.overlay.style.display = 'none';
    el.badge.style.display = '';
  }
  function toast(text) {
    el.toast.textContent = text;
    el.toast.style.opacity = '1';
    root.clearTimeout(toastTimer);
    toastTimer = root.setTimeout(function () { el.toast.style.opacity = '0'; }, 2600);
  }

  function validate() {
    var account = (el.account.value || '').trim();
    var password = el.password.value || '';
    if (account.length < 2) { setStatus('账号至少 2 个字符'); return null; }
    if (password.length < 4) { setStatus('密码至少 4 位'); return null; }
    return { account: account, password: password };
  }
  // 注册成功后立即保存奖励，再加载进度；失败标记留在本机，下次登录重试。
  function registrationReward(row, hash, isNew) {
    var pending = readJson(REWARD_KEY), progress = progressFromRow(row);
    var owed = isNew || (pending && pending.id === row.id && pending.account === row.account);
    if (!owed) return Promise.resolve(row);
    if (progress.rewards.registration) {
      try { localStorage.removeItem(REWARD_KEY); } catch (e) {}
      return Promise.resolve(row);
    }
    try { localStorage.setItem(REWARD_KEY, JSON.stringify({ id: row.id, account: row.account })); } catch (e) {}
    progress.coins += PM.Config.rewards.registration;
    progress.rewards.registration = true;
    var args = saveArgs(progress); args.p_id = row.id; args.p_password_hash = hash;
    return cloud.database.rpc('player_save', args).then(function (res) {
      if (res && res.error) throw new Error('registration_reward_pending');
      try { localStorage.removeItem(REWARD_KEY); } catch (e) {}
      return Object.assign({}, row, { progress: progress, coins: progress.coins });
    }).catch(function () { throw new Error('registration_reward_pending'); });
  }
  function authenticate(isNew) {
    if (authBusy) return;
    var input = validate(); if (!input) return;
    authBusy = true; setStatus(isNew ? '注册中…' : '登录中…');
    hashOf(input.account, input.password).then(function (hash) {
      return cloud.database.rpc(isNew ? 'player_register' : 'player_login', { p_account: input.account, p_password_hash: hash }).then(function (res) {
        if (res && res.error) throw res.error;
        if (!res || !res.data) { setStatus('账号或密码错误'); return; }
        // 保存会话，奖励上传失败时刷新页面也能继续重试。
        setSession(res.data, hash);
        return registrationReward(res.data, hash, isNew).then(function (row) { applyProgress(row); hide(); });
      });
    }).catch(function (err) {
      setStatus(err.message === 'registration_reward_pending' ? '账号已创建，赠送金币尚未保存，请点击登录重试' : mapErr(err));
    }).then(function () { authBusy = false; });
  }
  function doLogin() { authenticate(false); }
  function doRegister() { authenticate(true); }

  buildUi();
  var stored = readJson(SESSION_KEY);
  if (stored && stored.id && stored.account && stored.hash) {
    setStatus('正在登录 ' + stored.account + ' …');
    cloud.database.rpc('player_login', { p_account: stored.account, p_password_hash: stored.hash }).then(function (res) {
      if (res && !res.error && res.data) {
        setSession(res.data, stored.hash);
        return registrationReward(res.data, stored.hash, false).then(function (row) {
          applyProgress(row); hide();
        });
      } else {
        clearSession();
        showForm('云端登录已失效，请重新登录或游客试玩');
      }
    }).catch(function (err) { showForm(err.message === 'registration_reward_pending' ? '赠送金币尚未保存，请点击登录重试' : '暂时连不上云端，可游客试玩或稍后重试'); });
  } else {
    showForm('');
  }
})(typeof GameGlobal !== 'undefined' ? GameGlobal : window);
