"use strict";
var fs = require('fs'), path = require('path'), child = require('child_process');
function walk(dir) { return fs.readdirSync(dir, { withFileTypes: true }).reduce(function (all, entry) {
  var file = path.join(dir, entry.name); return all.concat(entry.isDirectory() ? walk(file) : (/\.js$/.test(file) ? [file] : []));
}, []); }
var files = walk(path.resolve(__dirname, '..')).filter(function (file) { return file.indexOf('node_modules') < 0; });
files.forEach(function (file) { child.execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' }); });
JSON.parse(fs.readFileSync(path.resolve(__dirname, '../game.json'), 'utf8'));
JSON.parse(fs.readFileSync(path.resolve(__dirname, '../project.config.json'), 'utf8'));
console.log('Checked ' + files.length + ' JavaScript files and 2 JSON files.');
