"use strict";
/* 零依赖静态服务器，替代 `python3 -m http.server`：
   Windows 上 python3 常指向应用商店的别名存根（退出码 9009 且无输出），不能依赖。
   用法：npm run serve            默认 http://127.0.0.1:8080
        npm run serve -- --port 8081
        npm run serve -- --host 0.0.0.0   （手机同局域网调试用） */
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
function arg(name, fallback) { const i = argv.indexOf('--' + name); return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback; }
const port = Number(arg('port', 8080)) || 8080;
const host = arg('host', '127.0.0.1');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8', '.map': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.sha256': 'text/plain; charset=utf-8'
};

const server = http.createServer(function (req, res) {
  let url;
  try { url = decodeURIComponent((req.url || '/').split('?')[0]); }
  catch (e) { res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('400 Bad Request'); return; }
  let file = path.join(root, url === '/' ? 'index.html' : url);
  /* 目录穿越保护：解析后的路径必须仍在项目根目录内。 */
  if (file !== root && !file.startsWith(root + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' }).end('403 Forbidden'); return;
  }
  fs.stat(file, function (err, stat) {
    if (!err && stat.isDirectory()) file = path.join(file, 'index.html');
    fs.readFile(file, function (e, buf) {
      if (e) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 Not Found: ' + url); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(buf);
    });
  });
});

server.on('error', function (e) {
  if (e.code === 'EADDRINUSE') console.error('端口 ' + port + ' 已被占用，换一个：npm run serve -- --port ' + (port + 1));
  else console.error(e.message);
  process.exit(1);
});

server.listen(port, host, function () {
  const base = 'http://' + host + ':' + port;
  console.log('游戏      ' + base + '/index.html');
  console.log('地图预览  ' + base + '/tools/map-preview.html');
  console.log('特效预览  ' + base + '/tools/combat-preview.html');
  console.log('Ctrl+C 停止');
});
