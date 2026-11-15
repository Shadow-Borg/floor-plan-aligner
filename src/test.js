// Logic tests against a sample plan: node src/test.js "<path to ground floor plan.dxf>"
const C=require('./t_core.js'),fs=require('fs');
let pass=0,fail=0;
const ok=(c,msg,extra)=>{if(c)pass++;else{fail++;console.log('  FAIL:',msg,extra===undefined?'':extra);}};
const near=(a,b,t)=>Math.abs(a-b)<=(t||0.01);
const load=()=>{const DX=C.parseDXF(fs.readFileSync(process.argv[2],'utf8'));return C.makeModel(DX,C.defaultRoles(DX),null,'t');};
let M=load();
const b=C.structBBox(M),ox=b[0],oy=-7677.022334289681;
const R=o=>C.rectOf(M,o).map((v,i)=>+(v-(i%2?oy:ox)).toFixed(1));
const wallAt=(x,y)=>M.walls.find(w=>{const r=R(w);return x>=r[0]&&x<=r[2]&&y>=r[1]&&y<=r[3];});
const sugAt=(x,y)=>M.sugs.find(w=>{const r=R(w);return x>=r[0]&&x<=r[2]&&y>=r[1]&&y<=r[3];});
const openAt=(x,y)=>M.opens.find(w=>{const r=R(w);return x>=r[0]&&x<=r[2]&&y>=r[1]&&y<=r[3];});
function add(c,val,choice){M.P.push(c.ox,c.oy);M.P0.push(c.ox,c.oy);const q=Object.assign({},c,{id:M.nid++,p:M.P.length/2-1,site:null});M.dims.push(q);const r=C.setDimension(M,q,val,choice);return [q,r];}
const probe=(x,y)=>C.probe(M,ox+x,oy+y);
const val=d=>C.dimVal(M,d,M.P);

console.log('STAGE 1: wall objects and correction tools');
ok(M.unit==='cm'&&M.th.includes(23)&&M.th.includes(15),'units detected, and both the 23 and the 15 cm wall thickness',[M.unit,M.th]);
ok(M.walls.length>=18,'wall pieces found',M.walls.length);
ok(M.opens.filter(o=>o.type==='window').length===7,'seven windows hosted in walls',M.opens.length);
ok(M.sugs.length>=6,'uncertain items are suggestions',M.sugs.length);
ok(M.walls.every(w=>{const r=C.rectOf(M,w);return r[2]>r[0]&&r[3]>r[1];}),'every wall is a real rectangle');
// a tap selects one wall piece, not all walls
let hit=C.pickAt(M,ox+11,oy+200,5);
ok(hit[0]&&hit[0].t==='open','tap on a window picks the window',hit[0]&&hit[0].t);
hit=C.pickAt(M,ox+11,oy+350,5);
ok(hit.length===1&&hit[0].t==='wall','tap on a wall picks exactly one wall piece',hit.map(h=>h.t));
const wL=hit[0].o,rL=R(wL);
ok(rL[2]-rL[0]===23&&rL[3]-rL[1]<500,'the picked piece is one stretch of the left wall',rL);
// split and merge
const n0=M.walls.length,w2=C.splitWall(M,wL,ox+11,oy+350);
ok(w2&&M.walls.length===n0+1&&near(R(wL)[3],350)&&near(R(w2)[1],350),'split a wall where it was tapped',[R(wL),w2&&R(w2)]);
ok(C.splitWall(M,wL,ox+11,oy+R(wL)[1]+0.5)===null,'split refuses a point at the very end');
const nb=C.neighbours(M,wL);ok(nb.includes(w2),'the two halves can be joined again');
const mg=C.mergeWalls(M,wL,w2);
ok(mg&&M.walls.length===n0&&near(R(mg)[1],rL[1])&&near(R(mg)[3],rL[3]),'join restores the original piece',mg&&R(mg));
// add, resize and delete an opening
const o1=C.addOpening(M,mg,ox+11,oy+350,'door');let ro=R(o1);
ok(o1.dir==='y'&&near(ro[3]-ro[1],90)&&ro[0]===0&&ro[2]===23&&near((ro[1]+ro[3])/2,350),'door added at the tapped point, 90 wide, full wall thickness',ro);
C.setCoord(M,o1.b,1,C.rectOf(M,o1)[1]+100);ok(near(R(o1)[3]-R(o1)[1],100),'door width changed to 100');
const nOp=M.opens.length;M.opens.splice(M.opens.indexOf(o1),1);
ok(M.opens.length===nOp-1&&wallAt(11,350)===mg,'deleting the door leaves the wall solid');
// suggestions: the unhatched strip becomes a wall, the gap becomes a door, a wrong one is rejected
const s1=sugAt(700,702);ok(!!s1,'the unhatched strip above the stair is offered as a suggestion',M.sugs.map(R));
const nw=M.walls.length;C.acceptSug(M,s1,'wall');
ok(M.walls.length>=nw&&!!wallAt(700,702)&&!sugAt(700,702),'accepted as wall: now solid there');
const s2=sugAt(444,600);ok(!!s2&&s2.guess==='door','bedroom-dining gap offered as a door');
const od=C.acceptSug(M,s2,'door');
ok(od&&od.type==='door'&&!!wallAt(444,600)&&openAt(444,600)===od,'accepted as door: wall healed with a door in it');
ok(C.rectOf(M,wallAt(444,600))[3]-C.rectOf(M,wallAt(444,600))[1]>300,'the healed wall is one continuous piece',R(wallAt(444,600)));
const s3=sugAt(467,60),ns=M.sugs.length;C.acceptSug(M,s3,'none');
ok(M.sugs.length===ns-1&&!wallAt(467,60),'rejected suggestion leaves nothing behind');
// draw a wall across the kitchen door gap, then accept the rest
const dw=C.drawWall(M,ox+473,oy+1025,ox+569,oy+1025);
ok(dw&&near(R(dw)[1],1014)&&near(R(dw)[3],1037)&&near(R(dw)[0],471)&&near(R(dw)[2],571),'drawn wall lines up with the wall it continues and snaps to the wall ends',dw&&R(dw));
for(const [x,y] of [[218,420],[388,458]]){const s=sugAt(x,y);ok(!!s&&s.guess==='door','door gap in a 15 cm wall is suggested',M.sugs.map(R));if(s)C.acceptSug(M,s,'none');}
for(const s of M.sugs.slice())C.acceptSug(M,s,s.guess);
// two door gaps the tool cannot see by itself (15 cm toilet walls): draw the wall across, then put a door in it
const t1=C.drawWall(M,ox+180,oy+420,ox+256,oy+420),t2=C.drawWall(M,ox+345,oy+458,ox+431,oy+458);
ok(t1&&near(R(t1)[0],178)&&near(R(t1)[2],258)&&near(R(t1)[1],413)&&near(R(t1)[3],428),'wall drawn across the toilet door takes the 15 cm wall it continues',t1&&R(t1));
ok(t2&&near(R(t2)[0],343)&&near(R(t2)[2],433)&&near(R(t2)[1],451)&&near(R(t2)[3],466),'wall drawn across the bedroom door',t2&&R(t2));
const d1=C.addOpening(M,t1,ox+218,oy+420,'door'),d2=C.addOpening(M,t2,ox+388,oy+458,'door');
ok(near(R(d1)[2]-R(d1)[0],48)&&near(R(d2)[2]-R(d2)[0],54),'doors added into short walls are sized to fit',[R(d1),R(d2)]);
ok(M.sugs.length===0,'all suggestions resolved');
const src=M.cls.filter(c=>c==='src').length;ok(src>100,'original wall lines are kept only as underlay',src);
const G=C.massGrid(M),ed=C.outline(G);
ok(ed.length>20&&ed.every(g=>g[0]===g[2]||g[1]===g[3]),'wall outline is generated from the objects',ed.length);

console.log('STAGE 2: rooms and measuring on objects');
const rm=C.rooms(M),named=rm.list.filter(r=>r.closed&&r.name).map(r=>r.name);
ok(['BEDROOM','TOILET','LIVING ROOM'].every(n=>named.includes(n)),'closed rooms are found and named',named);
const bed=rm.list.find(r=>r.name==='BEDROOM');ok(bed&&near(bed.area*1e-4,(410*390+160*38)*1e-4,0.01),'bedroom area matches its size',bed&&bed.area*1e-4);
let c=probe(200,200);const bx=c.find(d=>d.ax==='x'),by=c.find(d=>d.ax==='y');
ok(bx&&near(val(bx),410)&&by&&near(val(by),390),'bedroom measures 410 x 390 wall to wall',c.map(val));
ok(C.dimName(M,bx,rm)==='BEDROOM ↔','dimension named after its room',C.dimName(M,bx,rm));
c=probe(444,600);ok(c.find(d=>d.ax==='x')&&near(val(c.find(d=>d.ax==='x')),23),'a tap inside a wall gives its thickness, even at a door');
c=probe(700,850);ok(near(val(c.find(d=>d.ax==='y')),300),'kitchen fittings are ignored when measuring',c.map(val));
// bedroom 410 -> 400: the wall to the living room moves, the door in it moves with it, living room absorbs
const liv0=val(probe(600,300).find(d=>d.ax==='x')),doorX0=R(od)[0],bb0=C.structBBox(M).slice();
const [qb,rb]=add(bx,400,'auto');
ok(rb&&rb.key==='wall-b'&&near(val(qb),400),'bedroom set to 400 by moving the right wall',rb&&rb.label);
ok(near(val(probe(600,300).find(d=>d.ax==='x')),liv0+10),'living room absorbed the 10');
ok(near(R(od)[0],doorX0-10)&&near(R(od)[2]-R(od)[0],23),'the door in that wall moved with it');
ok(C.structBBox(M).every((v,i)=>near(v,bb0[i])),'overall building size unchanged');
ok(near(C.rooms(M).list.find(r=>r.name==='BEDROOM').area*1e-4,(400*390+150*38)*1e-4,0.01),'bedroom area follows the new size');
// living room 356 -> set to drawing 346 must not disturb the bedroom
const [ql,rl]=add(probe(600,300).find(d=>d.ax==='x'),346,'auto');
ok(near(val(ql),346)&&near(val(qb),400)&&C.conflicts(M,M.P,null)===0,'second room measured without breaking the first',[rl&&rl.label,val(qb)]);
// record-only overall check and closure text
const thr={ax:'x',a:qb.a,b:ql.b,ox:ox+300,oy:oy+250,name:'OVERALL'};const [qt]=add(thr,775,'none');
const ch=C.chainFor(M,qt);ok(C.dimStatus(M,qt).bad&&ch&&near(ch.sum,769)&&near(ch.err,6),'closure check explains the mismatch',ch);
M.dims.pop();
// opening: width and distance from the corner
const win=openAt(11,200),ds=C.openDims(M,win,1);
ok(ds.length===3&&near(val(ds[0]),180,0.01)&&near(val(ds[1]),89.8,0.1),'window offers width and corner distances',ds.map(d=>d.name+'='+val(d).toFixed(1)));
const [qo,ro2]=add(ds[1],97,'auto');ok(ro2.key==='obj'&&near(val(qo),97)&&near(R(win)[3]-R(win)[1],180,0.01),'corner distance moves the whole window',R(win));
const [qw,rw]=add(C.openDims(M,win,1)[0],160,'auto');
ok(near(val(qw),160)&&near(val(qo),97)&&rw.key==='side-b','width change moves the far jamb and keeps the measured distance',rw.key);
// column
const col=C.drawWall(M,ox+150,oy+172,ox+180,oy+172);col.kind='col';C.setCoord(M,col.a,1,oy+150);C.setCoord(M,col.b,1,oy+195);
const cd=C.colDims(M,col);ok(cd.length===6&&near(val(cd[0]),30)&&near(val(cd[1]),45),'column offers two sizes and four distances',cd.map(d=>d.name+'='+val(d)));
const cl=cd.find(d=>d.name==='Column from left'),[qc,rc]=add(cl,100,'auto');
ok(rc.key==='obj'&&near(val(qc),100)&&near(R(col)[2]-R(col)[0],30),'distance moves the column without resizing it',R(col));
// stair
const f=M.stairs[0],sd=C.stairDims(M,f);
ok(f&&f.tr.length===16&&near(val(sd[0]),27)&&near(val(sd[1]),405),'stair recognised with 15 treads of 27',sd.map(val));
const [qs,rs]=add(sd[0],25,'auto');ok(near(val(qs),25)&&near(val(C.stairDims(M,f)[1]),375),'tread 25 rescales the flight to 375');
ok(C.conflicts(M,M.P,null)===0,'no conflicts after all edits',C.conflicts(M,M.P,null));

console.log('STAGE 4: outputs from objects');
const dxf=C.exportDXF(M),layers=[...new Set(dxf.split('\r\n').filter((l,i,a)=>a[i-1]==='8'))];
ok(['A-WALL','A-WALL-PATT','A-GLAZ','A-FLOR-STRS','A-FLOR-CASE','A-ANNO-TEXT','A-ANNO-DIMS-DEVN'].every(l=>layers.includes(l)),'DXF uses the standard layer names',layers);
const DX2=C.parseDXF(dxf),M2=C.makeModel(DX2,C.defaultRoles(DX2),null,'r');
const bb=C.structBBox(M),b2=C.structBBox(M2);
ok(M2.unit==='cm'&&M2.walls.length>=15,'exported DXF reads back as walls',[M2.unit,M2.walls.length]);
const p2=C.probe(M2,ox+200,oy+200).find(d=>d.ax==='x');ok(p2&&near(C.dimVal(M2,p2,M2.P),400),'re-imported bedroom is 400',p2&&C.dimVal(M2,p2,M2.P));
const svg=C.planSVG(M);ok(svg.includes('SCALE 1:100')&&svg.includes('mm"'),'report plan is at true scale with a scale bar');
const rep=C.reportHTML(M,'x');ok(rep.includes('Room areas')&&rep.includes('BEDROOM')&&rep.includes('Measurements'),'report has measurements and room areas');
const csv=C.reportCSV(M);ok(csv.includes('As-built area')&&csv.includes('Stair tread depth'),'CSV has measurements and areas');
const js=JSON.parse(JSON.stringify(M));ok(js.walls.length===M.walls.length&&near(C.dimVal(js,js.dims[0],js.P),400),'project file round-trips');
console.log(fail?'\nFAILED '+fail+' of '+(pass+fail):'\nall '+pass+' checks passed');
process.exit(fail?1:0);
