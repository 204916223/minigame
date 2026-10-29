"use strict";
const {spawnSync}=require('node:child_process');const path=require('node:path');
const result=spawnSync(process.execPath,['--test','--test-name-pattern=屏幕外','tests/combat.test.js'],{cwd:path.resolve(__dirname,'..'),stdio:'inherit'});process.exit(result.status===null?1:result.status);
