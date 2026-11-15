// Joins the source files into the single page: node src/build.js
const fs=require('fs'),path=require('path'),d=__dirname;
const rd=f=>fs.readFileSync(path.join(d,f),'utf8');
const strip=s=>s.replace(/\nif\(typeof module!=='undefined'\)module\.exports=\{[\s\S]*?\};\n/,'\n');
let page=rd('page.html');
page=page.replace('/*CORE*/',()=>rd('core.js')).replace('/*OBJECTS*/',()=>strip(rd('objects.js'))).replace('/*UI*/',()=>rd('ui.js'));
const out=path.join(d,'..','index.html');
fs.writeFileSync(out,page);
new Function(page.split('<script>')[1].split('</script>')[0]);   // syntax check
console.log('built',out,page.length,'bytes');
