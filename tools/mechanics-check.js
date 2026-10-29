"use strict";
// 与 npm test 共用实际断言，防止另一套检查长期漂移。
const {spawnSync}=require('node:child_process');const path=require('node:path'),fs=require('node:fs');
const tests=fs.readdirSync(path.resolve(__dirname,'../tests')).filter(file=>file.endsWith('.test.js')).map(file=>'tests/'+file);
const result=spawnSync(process.execPath,['--test',...tests],{cwd:path.resolve(__dirname,'..'),stdio:'inherit'});process.exit(result.status===null?1:result.status);
