"use strict";
// 只打包线上运行所需文件，避免把测试、设计稿、Git 或调试入口发布出去。
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'dist');
const files = ['index.html', 'game.js'].concat(
  ['config', 'rules', 'combat', 'platform', 'audio', 'gameplay', 'renderer', 'input'].map(name => 'src/' + name + '.js')
);
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'src'), { recursive: true });
const hashes = files.map(file => {
  const content = fs.readFileSync(path.join(root, file));
  fs.writeFileSync(path.join(out, file), content);
  return crypto.createHash('sha256').update(content).digest('hex') + '  ' + file;
});
// 清单留在发布包外，供发布后逐文件核对。
fs.writeFileSync(path.join(root, 'dist.sha256'), hashes.join('\n') + '\n');
console.log('Web release: ' + out + ' (' + files.length + ' files)');
