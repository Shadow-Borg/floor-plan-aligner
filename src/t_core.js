const fs=require('fs'),path=require('path');
const src=['core.js','objects.js','sheet.js'].map(f=>fs.readFileSync(path.join(__dirname,f),'utf8')).join('\n');
const m={exports:{}};new Function('module',src)(m);module.exports=m.exports;
