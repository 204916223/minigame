"use strict";
// 与 npm test 共用实际断言，防止另一套检查长期漂移。
const {spawnSync}=require('node:child_process');const path=require('node:path');
const result=spawnSync(process.execPath,['--test','tests/gameplay.test.js','tests/combat.test.js','tests/ui.test.js'],{cwd:path.resolve(__dirname,'..'),stdio:'inherit'});process.exit(result.status===null?1:result.status);
