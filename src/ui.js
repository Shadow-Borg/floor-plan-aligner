/* =====================================================================
   UI: touch-first. Two modes: Edit (correct the drawing) and Measure (site sizes).
   ===================================================================== */
if(typeof document!=='undefined')(function(){
const $=id=>document.getElementById(id);
const cv=$('cv'),ctx=cv.getContext('2d'),sheet=$('sheet');
let M=null,DX=null,roles=null,V={cx:0,cy:0,k:1},VW=null,W=0,Hh=0,dpr=1;
let backCy=null,mode='edit',tool=null,sel=null,cand=[],hits=[],handles=[],hist=[],redoS=[],pending=false,saveT=0,fileDirty=false,GEO=null,RMS=null,loupe=null,boxR=null,snapHint=null,nhits=[],vb=null;
const LAY={walls:1,opens:1,stairs:1,fit:1,furn:1,text:1,dims:1,notes:1,under:0};
const NCOL={note:'#0b6bcb',defect:'#c62828',check:'#b45309'};
const esc=escH;
const num=v=>parseFloat(String(v).replace(',','.'))*UNIT_M[duOf(M)]/UNIT_M[M.unit];
const U=()=>duOf(M);
const cap=s=>s[0].toUpperCase()+s.slice(1);
function toast(msg,ms){const t=$('toast');t.textContent=msg;t.style.display='block';clearTimeout(toast.t);toast.t=setTimeout(()=>t.style.display='none',ms||2600);}
function showSheet(html,pos){if(backCy!=null){V.cy=backCy;backCy=null;}sheet.className='sheet '+(pos||'bottom');sheet.innerHTML=html;sheet.style.display='block';sheet.scrollTop=0;}
function hideSheet(){sheet.style.display='none';sheet.innerHTML='';if(backCy!=null){V.cy=backCy;backCy=null;draw();}}
function askBox(msg,yes,cb){$('askMsg').textContent=msg;$('askYes').textContent=yes||'OK';$('ask').style.display='flex';
  $('askYes').onclick=()=>{$('ask').style.display='none';cb();};$('askNo').onclick=()=>{$('ask').style.display='none';};}
const geo=()=>{if(!GEO){const G=massGrid(M);GEO={G,edges:outline(G),poche:pocheRects(G),win:winLines(M)};}return GEO;};
const rms=()=>RMS||(RMS=rooms(M));

/* ---- storage ---- */
const DB={
  open(){return new Promise((res,rej)=>{const r=indexedDB.open('siteplan',1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});},
  async set(k,v){const db=await this.open();return new Promise((res,rej)=>{const t=db.transaction('kv','readwrite');t.objectStore('kv').put(v,k);t.oncomplete=()=>res();t.onerror=()=>rej(t.error);});},
  async get(k){const db=await this.open();return new Promise((res,rej)=>{const q=db.transaction('kv').objectStore('kv').get(k);q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error);});}
};
function autosave(){clearTimeout(saveT);saveT=setTimeout(()=>{if(M)DB.set('current',M).catch(()=>{});},400);}

/* ---- view ---- */
function resize(){
  dpr=window.devicePixelRatio||1;const r=cv.getBoundingClientRect();W=r.width;Hh=r.height;
  cv.width=Math.round(W*dpr);cv.height=Math.round(Hh*dpr);draw();
}
const sx=x=>(x-VW.cx)*VW.k+VW.ox,sy=y=>VW.oy-(y-VW.cy)*VW.k;
const s2w=(px,py)=>[(px-W/2)/V.k+V.cx,V.cy-(py-Hh/2)/V.k];
function fit(){
  if(!M)return;const b=structBBox(M);if(!b)return;
  V.cx=(b[0]+b[2])/2;V.cy=(b[1]+b[3])/2;
  V.k=0.86*Math.min(W/Math.max(b[2]-b[0],1e-6),Hh/Math.max(b[3]-b[1],1e-6));draw();
}
function zoomAt(px,py,f){const w=s2w(px,py);V.k*=f;V.cx=w[0]-(px-W/2)/V.k;V.cy=w[1]+(py-Hh/2)/V.k;}
function focusOn(r,minPx){
  V.cx=(r[0]+r[2])/2;V.cy=(r[1]+r[3])/2;
  const small=Math.min(r[2]-r[0],r[3]-r[1]);if(small*V.k<minPx)V.k=minPx/small;
  const big=Math.max(r[2]-r[0],r[3]-r[1]);if(big*V.k>Math.min(W,Hh)*0.7)V.k=Math.min(W,Hh)*0.7/big;
  draw();
}
function draw(){if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;render();});}
const fillR=(r)=>ctx.fillRect(sx(r[0]),sy(r[3]),(r[2]-r[0])*VW.k,(r[3]-r[1])*VW.k);
const strokeR=(r)=>ctx.strokeRect(sx(r[0]),sy(r[3]),(r[2]-r[0])*VW.k,(r[3]-r[1])*VW.k);
const lineShown=c=>c==='src'?false:c==='interior'?!!LAY.fit:c==='stair'?!!LAY.stairs:true;
function scene(){                              // the plan itself, drawn with the current view (also used by the loupe)
  const P=M.P,G=geo();
  if(LAY.under){
    ctx.strokeStyle='#8fbdf0';ctx.lineWidth=1;ctx.beginPath();
    for(const s of M.segs){if(s[3])continue;ctx.moveTo(sx(M.P0[2*s[0]]),sy(M.P0[2*s[0]+1]));ctx.lineTo(sx(M.P0[2*s[1]]),sy(M.P0[2*s[1]+1]));}
    ctx.stroke();
  }
  if(LAY.stairs){ctx.fillStyle=STAIR_TINT;for(const f of M.stairs)fillR(flightBox(M,f));}
  if(LAY.walls){ctx.fillStyle='#cfd4db';for(const r of G.poche)fillR(r);}
  if(LAY.opens)for(const o of M.opens){ctx.fillStyle=o.type==='window'?OPN_TINT.Window:OPN_TINT.Door;fillR(rectOf(M,o));}
  if(mode==='edit')for(const s of M.sugs){
    const r=rectOf(M,s);ctx.fillStyle='rgba(245,158,11,.22)';fillR(r);
    ctx.strokeStyle='#b45309';ctx.lineWidth=1.5;ctx.setLineDash([5,4]);strokeR(r);ctx.setLineDash([]);
    ctx.fillStyle='#b45309';ctx.font='700 14px system-ui,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('?',sx((r[0]+r[2])/2),sy((r[1]+r[3])/2));
  }
  if(LAY.furn){
    ctx.strokeStyle='#a9b0ba';ctx.lineWidth=1;ctx.beginPath();
    for(const g of M.decor){
      const cx=sx(g.cx+g.dx),cy=sy(g.cy+g.dy),hw=g.hw*VW.k,hh=g.hh*VW.k;
      if(cx+hw<0||cx-hw>W||cy+hh<0||cy-hh>Hh)continue;
      for(const p of g.paths)for(let i=0;i<p.length;i+=2){const x=sx(p[i]+g.dx),y=sy(p[i+1]+g.dy);i?ctx.lineTo(x,y):ctx.moveTo(x,y);}
    }
    ctx.stroke();
  }
  if(LAY.furn)for(const sm of M.syms)for(const q of symPaths(M,sm)){
    ctx.beginPath();for(let i=0;i<q.pts.length;i+=2){const x=sx(q.pts[i]),y=sy(q.pts[i+1]);i?ctx.lineTo(x,y):ctx.moveTo(x,y);}
    if(q.mode!=='l')ctx.closePath();ctx.lineWidth=1;ctx.strokeStyle='#6b7480';
    if(q.mode==='f'){ctx.fillStyle='#fff';ctx.fill();}else if(q.mode==='s'){ctx.fillStyle='rgba(110,140,100,.26)';ctx.fill();}else if(q.mode==='d'){ctx.fillStyle='#39424e';ctx.fill();}
    ctx.stroke();
  }
  ctx.lineJoin='round';
  for(const c of ['interior','stair','window','line','wall']){
    if(!lineShown(c))continue;
    ctx.strokeStyle=CLS[c].col;ctx.lineWidth=Math.max(0.8,CLS[c].lw*4);ctx.beginPath();
    M.segs.forEach((s,i)=>{
      if(s[3]||M.cls[i]!==c)return;
      const x1=P[2*s[0]],y1=P[2*s[0]+1],x2=P[2*s[1]],y2=P[2*s[1]+1];
      ctx.moveTo(sx(x1),sy(y1));
      if(s[2]){const m=bulgeMid(x1,y1,x2,y2,s[2]);for(let i=0;i<m.length;i+=2)ctx.lineTo(sx(m[i]),sy(m[i+1]));}
      ctx.lineTo(sx(x2),sy(y2));
    });
    if(c==='line')for(const a of M.arcs){
      const p=arcPts(P[2*a[0]],P[2*a[0]+1],a[1],a[2],a[3]);
      for(let i=0;i<p.length;i+=2){const x=sx(p[i]),y=sy(p[i+1]);i?ctx.lineTo(x,y):ctx.moveTo(x,y);}
    }
    ctx.stroke();
  }
  if(LAY.walls){
    if(LAY.opens){ctx.strokeStyle='#0a7f9c';ctx.lineWidth=1;ctx.beginPath();for(const g of G.win){ctx.moveTo(sx(g[0]),sy(g[1]));ctx.lineTo(sx(g[2]),sy(g[3]));}ctx.stroke();}
    ctx.strokeStyle='#111';ctx.lineWidth=2.2;ctx.lineCap='square';ctx.beginPath();
    for(const g of G.edges){ctx.moveTo(sx(g[0]),sy(g[1]));ctx.lineTo(sx(g[2]),sy(g[3]));}
    ctx.stroke();ctx.lineCap='butt';
    if(mode==='edit'){ctx.strokeStyle='rgba(90,100,115,.55)';ctx.lineWidth=0.8;ctx.setLineDash([3,3]);for(const w of M.walls)strokeR(rectOf(M,w));ctx.setLineDash([]);}
  }
  if(LAY.text)for(const t of M.texts){
    const px=textH(M,t)*VW.k;if(px<5)continue;
    ctx.save();ctx.translate(sx(P[2*t.p]),sy(P[2*t.p+1]));if(t.rot)ctx.rotate(-t.rot*Math.PI/180);
    ctx.font=Math.min(px,60)+'px ISOCPEUR,"Arial Narrow",Arial,sans-serif';ctx.fillStyle='#39424e';
    ctx.textAlign=t.ha;ctx.textBaseline=t.va;ctx.fillText(t.s,0,0);ctx.restore();
  }
}
function pill(mx,my,label,color){
  ctx.font='600 14px system-ui,sans-serif';
  const tw=ctx.measureText(label).width+14,r={x:mx-tw/2,y:my-14,w:tw,h:28};
  ctx.setLineDash([]);ctx.fillStyle='#fff';ctx.strokeStyle=color;ctx.lineWidth=1.4;
  ctx.beginPath();ctx.rect(r.x,r.y,r.w,r.h);ctx.fill();ctx.stroke();
  ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,mx,my+0.5);
  return r;
}
function drawDim(d,color,label,dashed){
  const g=dimGeom(M,d),x1=sx(g[0]),y1=sy(g[1]),x2=sx(g[2]),y2=sy(g[3]);
  ctx.strokeStyle=color;ctx.lineWidth=1.6;ctx.setLineDash(dashed?[6,4]:[]);
  ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();ctx.setLineDash([]);
  ctx.beginPath();for(const [x,y] of [[x1,y1],[x2,y2]]){ctx.moveTo(x-5,y+5);ctx.lineTo(x+5,y-5);}ctx.stroke();
  const f=d.ax==='x'?0.5:0.3,r=pill(x1+(x2-x1)*f,y1+(y2-y1)*f,label,color);r.d=d;return r;
}
function selRect(){return sel&&(sel.t==='wall'||sel.t==='open'||sel.t==='sug')?rectOf(M,sel.o):null;}
function render(){
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,Hh);hits=[];handles=[];nhits=[];
  if(!M)return;
  VW={cx:V.cx,cy:V.cy,k:V.k,ox:W/2,oy:Hh/2};
  scene();
  const P=M.P;
  if(sel){
    const r=selRect();
    if(r){
      ctx.fillStyle='rgba(11,107,203,.22)';fillR(r);ctx.strokeStyle='#0b6bcb';ctx.lineWidth=2.5;strokeR(r);
      if(mode==='edit'&&sel.t!=='sug'){
        const k=(sel.t==='open'?sel.o.dir:wallDir(M,sel.o))==='x'?0:1,mid=(r[1-k]+r[3-k])/2;
        for(const hi of [0,1]){
          const c=r[k+2*hi],x=sx(k?mid:c),y=sy(k?c:mid);
          handles.push({x,y,p:hi?highP(M,sel.o,k):lowP(M,sel.o,k),k});
          ctx.fillStyle='#fff';ctx.strokeStyle='#0b6bcb';ctx.lineWidth=3;ctx.beginPath();ctx.arc(x,y,9,0,7);ctx.fill();ctx.stroke();
        }
      }
    }
    if(sel.t==='sym'){
      const x=sx(P[2*sel.o.p]),y=sy(P[2*sel.o.p+1]),rr=Math.max(16,symRad(M,sel.o)*VW.k);
      ctx.strokeStyle='#0b6bcb';ctx.lineWidth=2;ctx.setLineDash([6,4]);ctx.beginPath();ctx.arc(x,y,rr,0,7);ctx.stroke();ctx.setLineDash([]);
      if(mode==='edit'){handles.push({x,y,p:sel.o.p,k:2});ctx.fillStyle='#fff';ctx.lineWidth=3;ctx.beginPath();ctx.arc(x,y,9,0,7);ctx.fill();ctx.stroke();}
    }
    if(sel.t==='line'){
      ctx.strokeStyle='#0b6bcb';ctx.lineWidth=4;ctx.beginPath();
      for(const i of sel.segs){const s=M.segs[i];ctx.moveTo(sx(P[2*s[0]]),sy(P[2*s[0]+1]));ctx.lineTo(sx(P[2*s[1]]),sy(P[2*s[1]+1]));}
      ctx.stroke();
    }
  }
  if(LAY.dims||mode==='measure'){
    for(const g of M.diags){
      const r=diagRect(M,g),i=diagInfo(M,g);
      ctx.strokeStyle=i.color;ctx.lineWidth=1;ctx.setLineDash([4,4]);ctx.beginPath();
      ctx.moveTo(sx(r[0]),sy(r[1]));ctx.lineTo(sx(r[2]),sy(r[3]));ctx.moveTo(sx(r[0]),sy(r[3]));ctx.lineTo(sx(r[2]),sy(r[1]));ctx.stroke();
      const h=pill(sx((r[0]+r[2])/2),sy((r[1]+r[3])/2)-30,i.label,i.color);h.g=g;hits.push(h);
    }
    for(const d of M.dims){const st=dimStatus(M,d);hits.push(drawDim(d,st.color,st.label,false));}
  }
  if(LAY.notes)M.notes.forEach((nt,i)=>{
    const x=sx(P[2*nt.p]),y=sy(P[2*nt.p+1]),c=NCOL[nt.kind]||NCOL.note;
    ctx.fillStyle='#fff';ctx.strokeStyle=c;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,y-16);ctx.lineTo(x+15,y+9);ctx.lineTo(x-15,y+9);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.fillStyle=c;ctx.font='700 12px system-ui,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(i+1,x,y+1);nhits.push({x,y,nt});
  });
  for(const c of cand)drawDim(c,'#0b6bcb',fmt(M,dimVal(M,c,P)),true);
  for(const h of snapHint||[]){
    ctx.strokeStyle='#d6249f';ctx.lineWidth=1.3;ctx.setLineDash([6,4]);ctx.beginPath();
    if(h.k===0){ctx.moveTo(sx(h.v),0);ctx.lineTo(sx(h.v),Hh);}else{ctx.moveTo(0,sy(h.v));ctx.lineTo(W,sy(h.v));}
    ctx.stroke();ctx.setLineDash([]);
  }
  if(tool&&tool.t==='draw'&&tool.p){ctx.fillStyle='#0b6bcb';ctx.beginPath();ctx.arc(sx(tool.p[0]),sy(tool.p[1]),6,0,7);ctx.fill();}
  if(boxR){ctx.strokeStyle='#0b6bcb';ctx.lineWidth=1.5;ctx.setLineDash([6,4]);ctx.strokeRect(boxR[0],boxR[1],boxR[2]-boxR[0],boxR[3]-boxR[1]);ctx.setLineDash([]);}
  if(loupe){                                   // magnifier above the finger with a crosshair on the exact point
    const R=58,lx=Math.max(R+4,Math.min(W-R-4,loupe.x)),ly=loupe.y-R-70<4?loupe.y+R+70:loupe.y-R-70,w=s2w(loupe.cx,loupe.cy);
    ctx.save();ctx.beginPath();ctx.arc(lx,ly,R,0,7);ctx.clip();ctx.fillStyle='#fff';ctx.fillRect(lx-R,ly-R,2*R,2*R);
    VW={cx:w[0],cy:w[1],k:V.k*2.5,ox:lx,oy:ly};scene();VW={cx:V.cx,cy:V.cy,k:V.k,ox:W/2,oy:Hh/2};
    ctx.strokeStyle='#c62828';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(lx-14,ly);ctx.lineTo(lx+14,ly);ctx.moveTo(lx,ly-14);ctx.lineTo(lx,ly+14);ctx.stroke();
    ctx.restore();
    ctx.strokeStyle='#1b1f24';ctx.lineWidth=2;ctx.beginPath();ctx.arc(lx,ly,R,0,7);ctx.stroke();
    if(snapHint&&snapHint.length)pill(lx,ly+R+18<Hh-16?ly+R+18:ly-R-18,'Snap: '+snapHint.map(h=>h.n).join(' + '),'#d6249f');
    ctx.strokeStyle='#c62828';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(loupe.cx-9,loupe.cy);ctx.lineTo(loupe.cx+9,loupe.cy);ctx.moveTo(loupe.cx,loupe.cy-9);ctx.lineTo(loupe.cx,loupe.cy+9);ctx.stroke();
  }
}

/* ---- header, bar, tool bar ---- */
function refresh(){
  GEO=null;RMS=null;
  $('empty').style.display=M?'none':'flex';
  $('tools').style.display=M?'flex':'none';
  $('bSave').style.display=$('bList').style.display=$('bView').style.display=M?'':'none';
  $('bSnap').style.display=M&&mode==='edit'?'':'none';if(M){$('bSnap').textContent=M.snap!==0?'Snap on':'Snap off';$('bSnap').className=M.snap!==0?'on':'';}
  $('pname').textContent=M?M.name:'Site Plan Adjuster';
  if(!M){$('pinfo').textContent='No plan open';$('bar').style.display='none';$('stage').className='';return;}
  const nc=conflicts(M,M.P,null);
  $('pinfo').textContent=U()+' · '+M.dims.length+' measured'+(nc?' · '+nc+' conflict'+(nc>1?'s':''):'');
  $('bSave').textContent=fileDirty?'Save ●':'Saved';$('bSave').className=fileDirty?'dirty':'';
  $('tEdit').className=mode==='edit'?'on':'';$('tMeasure').className=mode==='measure'?'on':'';
  $('tUndo').disabled=!hist.length;$('tRedo').disabled=!redoS.length;
  let txt,btn=null;
  if(tool&&tool.t==='draw'){txt=tool.p?'Tap where the wall ends':'Tap where the wall starts';btn=['Cancel',()=>setTool(null)];}
  else if(tool&&tool.t==='box'){txt='Drag a box around the lines to select';btn=['Cancel',()=>setTool(null)];}
  else if(tool&&tool.t==='note'){txt='Tap the spot the note is about';btn=['Cancel',()=>setTool(null)];}
  else if(tool&&tool.t==='sym'){txt='Tap where the '+SYM[tool.type].n.toLowerCase()+' goes';btn=['Cancel',()=>setTool(null)];}
  else if(mode==='edit'){txt=M.sugs.length?M.sugs.length+' suggestion'+(M.sugs.length>1?'s':'')+' to check. Tap any item to correct it.':'Edit: tap a wall, opening or line to correct it.';if(M.sugs.length)btn=['Review',reviewNext];}
  else txt='Measure: tap a room, opening, column or stair.';
  $('barText').textContent=txt;$('barBtn').style.display=btn?'':'none';if(btn){$('barBtn').textContent=btn[0];$('barBtn').onclick=btn[1];}
  $('bar').style.display='flex';
  if($('stage').className!=='withbar'){$('stage').className='withbar';resize();}
}
function changed(){fileDirty=true;refresh();draw();autosave();}
function setMode(m){mode=m;tool=null;sel=null;cand=[];hideSheet();refresh();draw();}
function setTool(t){tool=t;sel=null;cand=[];boxR=null;snapHint=null;hideSheet();refresh();draw();}

/* ---- history ---- */
function snap(){return {P:M.P.slice(),P0:M.P0.slice(),ns:M.segs.length,dec:M.decor.map(g=>[g.dx,g.dy]),
  j:JSON.stringify({walls:M.walls,opens:M.opens,sugs:M.sugs,dims:M.dims,diags:M.diags,cls:M.cls,man:M.man,stairs:M.stairs,notes:M.notes,syms:M.syms,nid:M.nid})};}
function restore(h){M.P=h.P.slice();M.P0=h.P0.slice();M.segs.length=h.ns;M.decor.forEach((g,i)=>{g.dx=h.dec[i][0];g.dy=h.dec[i][1];});Object.assign(M,JSON.parse(h.j));}
function pushHist(){hist.push(snap());if(hist.length>40)hist.shift();redoS=[];}
function undo(){if(!hist.length)return;redoS.push(snap());restore(hist.pop());sel=null;cand=[];hideSheet();changed();toast('Undone');}
function redo(){if(!redoS.length)return;hist.push(snap());restore(redoS.pop());sel=null;cand=[];hideSheet();changed();toast('Redone');}

/* ---- files ---- */
function importDXF(text,name){
  let dx;
  try{dx=parseDXF(text);}catch(err){toast('Could not read this file');return;}
  if(!dx.ents.length){toast('No drawing entities found. Is this a DXF file?',4000);return;}
  DX=dx;roles=defaultRoles(DX);hist=[];redoS=[];sel=null;cand=[];mode='edit';tool=null;
  M=makeModel(DX,roles,null,name.replace(/\.dxf$/i,''));fixModel(M);
  fileDirty=true;refresh();fit();autosave();openSetup(true);
}
function rebuild(){
  const keep={unit:M.unit,name:M.name,pl:M.pl,fin:M.fin,sc:M.sc,du:M.du,th:M.th.slice(),thAll:M.thAll};
  M=buildModel(DX,roles,keep.unit,keep.name);Object.assign(M,{pl:keep.pl,fin:keep.fin,sc:keep.sc,du:keep.du,th:keep.th,thAll:keep.thAll,thMain:null});
  addJambs(M);buildObjects(M);fixModel(M);hist=[];redoS=[];sel=null;cand=[];refresh();fit();autosave();
}
function fixModel(m){
  m.diags=m.diags||[];if(m.pl==null)m.pl=0.012/UNIT_M[m.unit];m.fin=!!m.fin;if(!m.sc)m.sc=100;
  m.notes=m.notes||[];m.syms=m.syms||[];m.out=m.out||{};if(m.snap==null)m.snap=1;if(!m.step)m.step=0.01;m.hd=m.hd||{};
  m.man=m.man||[];m.hint=m.hint||[];m.ov=m.ov||{};m.mo=m.mo||[];m.stairs=m.stairs||[];
  if(!m.cls)classify(m);
  if(!m.walls){m.walls=[];m.opens=[];m.sugs=[];buildObjects(m);if(m.dims.length){m.dims=[];m.diags=[];setTimeout(()=>toast('Older project: measurements were cleared, please re-enter them',5000),600);}}
}
function loadProject(obj){
  if(!obj||!obj.P||!obj.segs){toast('Not a Site Plan project file');return;}
  M=obj;fixModel(M);DX=null;hist=[];redoS=[];sel=null;cand=[];mode=M.dims.length?'measure':'edit';hideSheet();fileDirty=false;refresh();fit();autosave();toast('Project loaded');
}
function download(name,text,type){
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([text],{type}));
  a.download=name;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),5000);
}
function saveFile(){download(M.name+'.siteplan.json',JSON.stringify(M),'application/json');fileDirty=false;refresh();toast('Project file saved. Keep it in Files.');}
function printReport(){$('print').innerHTML=reportHTML(M,new Date().toLocaleDateString());setTimeout(()=>window.print(),250);}
$('file').addEventListener('change',async ev=>{
  const f=ev.target.files[0];ev.target.value='';if(!f)return;
  const text=await f.text();
  if(text.trimStart().startsWith('{')){try{loadProject(JSON.parse(text));}catch(e){toast('Could not read project file');}}
  else importDXF(text,f.name);
});
const pickFile=()=>$('file').click();

/* ---- plan setup ---- */
function openSetup(first){
  const canLayers=DX&&!hist.length&&!M.dims.length;
  let h='<h3>Plan setup</h3>';
  h+='<label class="f">Drawing units</label><select id="sUnit">'+Object.keys(UNIT_M).map(u=>'<option'+(u===M.unit?' selected':'')+'>'+u+'</option>').join('')+'</select>';
  h+='<label class="f">Wall thicknesses ('+U()+') &ndash; tap to switch on or off</label><div id="sTh">';
  const all=[...new Set([...M.thAll,...M.th])].sort((a,b)=>a-b);
  h+=all.map(t=>'<span class="chip'+(M.th.includes(t)?' on':'')+'" data-t="'+t+'">'+fmt(M,t)+'</span>').join('')||'<span class="hint">None detected</span>';
  h+='</div><div class="row"><input type="text" inputmode="decimal" id="sAdd" placeholder="Add thickness"><button id="sAddB" style="flex:0 0 80px">Add</button></div>';
  h+='<label class="f">Site sizes are measured on</label><select id="sFin"><option value="0">Bare walls (unplastered)</option><option value="1"'+(M.fin?' selected':'')+'>Finished surfaces (plastered)</option></select>';
  h+='<label class="f">Plaster thickness per face ('+U()+')</label><input type="text" inputmode="decimal" id="sPl" value="'+fmt(M,M.pl)+'">';
  h+='<label class="f">Show and enter sizes in (millimetres is the ISO convention)</label><select id="sDu">'+Object.keys(UNIT_M).map(u=>'<option'+(u===U()?' selected':'')+'>'+u+'</option>').join('')+'</select>';
  h+='<label class="f">Snap step when nothing is near ('+M.unit+')</label><select id="sStep">'+[0.005,0.01,0.05,0.1].map(q=>'<option value="'+q+'"'+(q===M.step?' selected':'')+'>'+(+(q/UNIT_M[M.unit]).toFixed(3))+'</option>').join('')+'</select>';
  h+='<label class="f">Print scale</label><select id="sSc">'+[20,50,100,200].map(q=>'<option value="'+q+'"'+(q===M.sc?' selected':'')+'>1:'+q+'</option>').join('')+'</select>';
  if(canLayers){
    const st=layerStats(DX);
    h+='<label class="f">Layers &ndash; walls and columns should be Structure</label>';
    h+=Object.keys(st).sort().map(k=>'<div class="lay"><span>'+esc(k)+' ('+st[k]+')</span><select data-l="'+esc(k)+'">'+
      ['structure','decor','hide'].map(r=>'<option value="'+r+'"'+((roles[k]||'structure')===r?' selected':'')+'>'+({structure:'Structure',decor:'Furniture',hide:'Hide'}[r])+'</option>').join('')+'</select></div>').join('');
  }
  h+='<p class="hint">Found '+M.walls.length+' wall pieces, '+M.opens.length+' openings, '+M.stairs.length+' stairs, '+M.sugs.length+' suggestions to check.</p>';
  h+='<div class="row" style="margin-top:10px"><button class="pri" id="sDone">'+(first?'Check the plan':'Done')+'</button></div>';
  showSheet(h,'top');
  const redo2=()=>{if(canLayers)rebuild();else changed();openSetup(first);};
  $('sUnit').onchange=ev=>{M.unit=ev.target.value;M.pl=0.012/UNIT_M[M.unit];if(canLayers){detectThickness(M);}redo2();};
  sheet.querySelectorAll('.chip').forEach(c=>c.onclick=()=>{const t=+c.dataset.t,i=M.th.indexOf(t);if(i>=0)M.th.splice(i,1);else M.th.push(t);redo2();});
  $('sAddB').onclick=()=>{const v=num($('sAdd').value);if(v>0&&!M.th.includes(v)){M.th.push(v);redo2();}};
  $('sFin').onchange=ev=>{M.fin=ev.target.value==='1';autosave();};
  $('sPl').onchange=ev=>{const v=num(ev.target.value);if(v>=0){M.pl=v;changed();}};
  $('sDu').onchange=ev=>{M.du=ev.target.value;changed();openSetup(first);};
  $('sSc').onchange=ev=>{M.sc=+ev.target.value;changed();};
  $('sStep').onchange=ev=>{M.step=+ev.target.value;autosave();};
  sheet.querySelectorAll('select[data-l]').forEach(s=>s.onchange=()=>{roles[s.dataset.l]=s.value;redo2();});
  $('sDone').onclick=()=>{hideSheet();if(first)toast(M.sugs.length?'Check the items marked ? first, then switch to Measure':'Tap any item to correct it, then switch to Measure',4500);};
}

/* ---- Edit mode: select and correct ---- */
const lineName={stair:'Stair',interior:'Ignored fitting',line:'Other line',wall:'Wall line',window:'Window line'};
function describe(h){
  if(h.t==='wall'){const r=rectOf(M,h.o);return (h.o.kind==='col'?'Column ':'Wall ')+fmt(M,Math.min(r[2]-r[0],r[3]-r[1]))+' × '+fmt(M,Math.max(r[2]-r[0],r[3]-r[1]));}
  if(h.t==='open'){const r=rectOf(M,h.o),k=h.o.dir==='x'?0:1;return cap(h.o.type)+', '+fmt(M,r[k+2]-r[k])+' wide';}
  if(h.t==='sug')return 'Suggestion: '+h.o.guess+'?';
  if(h.t==='sym')return SYM[h.o.type].n;
  return 'Line: '+lineName[M.cls[h.o]];
}
function select(s){
  const keep=sel&&s&&sel.o===s.o&&sheet.style.display!=='none'?sheet.scrollTop:0;
  sel=s;cand=[];
  if(!s){hideSheet();draw();return;}
  if(s.t==='line')s.segs=s.segs||segGroup(M,s.o);
  if(s.t==='wall')panelWall();else if(s.t==='open')panelOpen();else if(s.t==='sug')panelSug();else if(s.t==='sym')panelSym();else panelLines();
  sheet.scrollTop=keep;reveal();draw();
}
/* keep the selected item in view above the panel */
function reveal(wy){
  if(sheet.style.display==='none'||window.innerWidth>=900)return;
  const c=cv.getBoundingClientRect(),s=sheet.getBoundingClientRect(),r=wy==null?selRect():null;
  if(wy==null){if(r)wy=(r[1]+r[3])/2;else if(sel&&sel.t==='sym')wy=M.P[2*sel.o.p+1];else if(sel&&sel.pt)wy=sel.pt[1];else return;}
  const y=Hh/2-(wy-V.cy)*V.k;let lo,hi;                 // free strip of the plan area, above or below the panel
  if(/bottom/.test(sheet.className)){lo=0;hi=s.top-c.top;}else{lo=s.bottom-c.top;hi=Hh;}
  if(hi-lo<90||(y>lo+30&&y<hi-30))return;
  if(backCy==null)backCy=V.cy;
  V.cy=wy+((lo+hi)/2-Hh/2)/V.k;
}
function editTap(px,py){
  const w=s2w(px,py),all=pickAt(M,w[0],w[1],18/V.k,lineShown),inside=all.filter(h=>h.d===0&&h.t!=='line');
  if(!inside.length&&LAY.furn){const sy=M.syms.map(q=>({q,d:Math.hypot(M.P[2*q.p]-w[0],M.P[2*q.p+1]-w[1])})).filter(z=>z.d<=Math.max(symRad(M,z.q)*0.8,20/V.k)).sort((a,b)=>a.d-b.d)[0];if(sy){select({t:'sym',o:sy.q,pt:w});return;}}
  if(!all.length){select(null);return;}
  if(inside.length||all.length===1){const h=inside[0]||all[0];select({t:h.t,o:h.o,pt:w});return;}
  let h='<h3>Which one?</h3>';
  all.slice(0,4).forEach((q,i)=>h+='<button class="big" data-i="'+i+'" style="font-size:16px">'+esc(describe(q))+'</button>');
  showSheet(h,'bottom');
  sheet.querySelectorAll('.big').forEach(b=>b.onclick=()=>{const q=all[+b.dataset.i];select({t:q.t,o:q.o,pt:w});});
}
function hostOf(o){const r=rectOf(M,o),x=(r[0]+r[2])/2,y=(r[1]+r[3])/2;return M.walls.find(w=>{const q=rectOf(M,w);return x>=q[0]&&x<=q[2]&&y>=q[1]&&y<=q[3];})||null;}
function nudgeRow(id,label,val){return '<label class="f">'+label+' ('+U()+')</label><div class="nudge"><button data-n="'+id+'" data-s="-1">−</button><input type="text" inputmode="decimal" id="'+id+'" value="'+fmt(M,val)+'"><button data-n="'+id+'" data-s="1">+</button></div>';}
function wireNudge(apply){
  const step=0.01/UNIT_M[M.unit];
  sheet.querySelectorAll('[data-n]').forEach(b=>b.onclick=()=>{const i=$(b.dataset.n);apply(b.dataset.n,num(i.value)+(+b.dataset.s)*step);});
  sheet.querySelectorAll('.nudge input').forEach(i=>i.onchange=()=>apply(i.id,num(i.value)));
}
function panelWall(){
  const w=sel.o,r=rectOf(M,w),k=wallDir(M,w)==='x'?0:1,nb=neighbours(M,w);
  let h='<h3>'+esc(describe({t:'wall',o:w}))+' '+U()+'</h3>';
  h+='<label class="f" style="margin-top:0">Add where you tapped</label><div class="row tight"><button data-a="door">Door</button><button data-a="window">Window</button><button data-a="opening">Opening</button></div>';
  h+='<div class="row tight" style="margin-top:8px"><button data-a="split">Split here</button><button data-a="merge"'+(nb.length?'':' disabled')+'>Join</button><button data-a="kind">'+(w.kind==='col'?'To wall':'To column')+'</button></div>';
  h+=nudgeRow('wLen','Length',r[k+2]-r[k])+nudgeRow('wThk','Thickness',r[3-k]-r[1-k]);
  h+='<div class="row" style="margin-top:10px"><button data-a="del" class="danger">Delete</button><button data-a="close">Close</button></div>';
  h+='<p class="hint">Drag the round handles to change the length.</p>';
  showSheet(h,'bottom');
  const act={
    door:()=>addO('door'),window:()=>addO('window'),opening:()=>addO('opening'),
    split:()=>{pushHist();const n=splitWall(M,w,sel.pt[0],sel.pt[1]);if(!n){hist.pop();toast('Tap the wall away from its ends, then Split');return;}changed();select({t:'wall',o:w,pt:sel.pt});toast('Wall split in two');},
    merge:()=>{pushHist();let m=w;for(const q of nb){const z=mergeWalls(M,m,q);if(z)m=z;}changed();select({t:'wall',o:m,pt:sel.pt});toast('Pieces joined');},
    kind:()=>{pushHist();w.kind=w.kind==='col'?'wall':'col';changed();select({t:'wall',o:w,pt:sel.pt});},
    del:()=>askBox('Delete this wall piece and the openings in it?','Delete',()=>{pushHist();deleteWall(M,w);sel=null;hideSheet();changed();}),
    close:()=>select(null)
  };
  const addO=type=>{pushHist();const pt=sel.pt.slice(),sn=snapAxis(M,k,pt[k],10/V.k,null,pt[1-k],null);if(sn.n)pt[k]=sn.v;const o=addOpening(M,w,pt[0],pt[1],type);changed();select({t:'open',o,pt:sel.pt});toast(cap(type)+' added. Drag the handles or type its size.');};
  sheet.querySelectorAll('[data-a]').forEach(b=>b.onclick=act[b.dataset.a]);
  wireNudge((id,v)=>{
    if(!(v>0))return;pushHist();
    if(id==='wLen')setCoord(M,highP(M,w,k),k,r[k]+v);
    else{const c=(r[1-k]+r[3-k])/2;setCoord(M,lowP(M,w,1-k),1-k,c-v/2);setCoord(M,highP(M,w,1-k),1-k,c+v/2);}
    changed();select({t:'wall',o:w,pt:sel.pt});
  });
}
function panelOpen(){
  const o=sel.o,r=rectOf(M,o),k=o.dir==='x'?0:1,host=hostOf(o),hr=host?rectOf(M,host):r;
  const sl=oSill(M,o),ht=oHt(M,o);
  let h='<h3>'+cap(o.type)+' '+(openTags(M).tag.get(o.id)||'')+'</h3><div class="row">'+['door','window','opening'].map(t=>'<button data-ty="'+t+'"'+(t===o.type?' class="pri"':'')+'>'+cap(t)+'</button>').join('')+'</div>';
  h+=nudgeRow('oWid','Width',r[k+2]-r[k])+nudgeRow('oPos','From the '+(k?'bottom':'left')+' end of its wall',r[k]-hr[k]);
  h+=nudgeRow('oSill','Sill height above floor',sl)+nudgeRow('oHt','Opening height',ht);
  h+='<div class="kv" style="margin-top:8px"><span>Lintel level (sill + height)</span><b>'+fmt(M,sl+ht)+' '+U()+'</b></div>';
  h+='<button data-a="all" style="width:100%;margin-top:8px">Use these heights for all '+o.type+'s</button>';
  h+='<div class="row" style="margin-top:10px"><button data-a="del" class="danger">Delete</button><button data-a="close">Close</button></div>';
  h+='<p class="hint">Deleting an opening leaves the wall solid there. Drag the round handles to move its ends.</p>';
  showSheet(h,'bottom');
  sheet.querySelectorAll('[data-ty]').forEach(b=>b.onclick=()=>{pushHist();o.type=b.dataset.ty;changed();select({t:'open',o,pt:sel.pt});});
  sheet.querySelector('[data-a=del]').onclick=()=>{pushHist();M.opens.splice(M.opens.indexOf(o),1);sel=null;hideSheet();changed();toast('Opening removed, wall is solid there');};
  sheet.querySelector('[data-a=close]').onclick=()=>select(null);
  sheet.querySelector('[data-a=all]').onclick=()=>{pushHist();let n=0;for(const q of M.opens)if(q.type===o.type){q.sill=sl;q.ht=ht;n++;}M.hd[o.type]=[sl*UNIT_M[M.unit],ht*UNIT_M[M.unit]];changed();toast('Heights set on '+n+' '+o.type+(n>1?'s':'')+'; new ones will use them too');};
  wireNudge((id,v)=>{
    if((id==='oWid'||id==='oHt')&&!(v>0))return;if(id==='oSill'&&!(v>=0))return;pushHist();
    if(id==='oSill')o.sill=v;else if(id==='oHt')o.ht=v;
    else if(id==='oWid')setCoord(M,highP(M,o,k),k,r[k]+v);
    else{const d=hr[k]+v-r[k];setCoord(M,lowP(M,o,k),k,r[k]+d);setCoord(M,highP(M,o,k),k,r[k+2]+d);}
    changed();select({t:'open',o,pt:sel.pt});
  });
}
function panelSug(){
  const s=sel.o,r=rectOf(M,s),k=s.dir==='x'?0:1;
  let h='<h3>Is this '+(s.guess==='opening'?'an':'a')+' '+s.guess+'?</h3><p class="hint" style="margin:0 0 8px">'+fmt(M,r[k+2]-r[k])+' '+U()+' long, '+fmt(M,r[3-k]-r[1-k])+' thick. '+M.sugs.length+' left to check.</p>';
  h+='<div class="row">'+['wall','door','window','opening'].map(t=>'<button data-as="'+t+'"'+(t===s.guess?' class="pri"':'')+'>'+cap(t)+'</button>').join('')+'</div>';
  h+='<div class="row" style="margin-top:8px"><button data-as="none">Nothing here</button><button id="gNext">Skip</button></div>';
  showSheet(h,'bottom');
  sheet.querySelectorAll('[data-as]').forEach(b=>b.onclick=()=>{
    pushHist();acceptSug(M,s,b.dataset.as);sel=null;changed();
    toast(b.dataset.as==='none'?'Left empty':'Set as '+b.dataset.as);
    if(M.sugs.length)reviewNext();else{hideSheet();fit();toast('All suggestions checked. Switch to Measure when the plan looks right.',4000);}
  });
  $('gNext').onclick=()=>reviewNext(s);
}
function reviewNext(after){
  if(!M.sugs.length){select(null);return;}
  const i=after&&after.id?M.sugs.indexOf(after):-1,s=M.sugs[(i+1)%M.sugs.length];
  focusOn(rectOf(M,s),22);select({t:'sug',o:s,pt:[0,0]});
}
function panelLines(){
  const c=M.cls[sel.o],n=sel.segs.length;
  let h='<h3>'+lineName[c]+(n>1?' ('+n+' lines)':'')+'</h3><div class="row tight">'+[['stair','Stair'],['interior','Ignore'],['line','Other']].map(q=>'<button data-lc="'+q[0]+'"'+(q[0]===c?' class="pri"':'')+'>'+q[1]+'</button>').join('')+'</div>';
  if(n>1)h+='<label class="lay" style="margin-top:8px"><input type="checkbox" id="iGrp" checked><span>Apply to all '+n+' connected lines</span></label>';
  h+='<div class="row" style="margin-top:8px"><button data-a="del" class="danger">Remove from plan</button><button data-a="close">Close</button></div>';
  h+='<p class="hint">Ignore: fittings such as counters and cupboards; measurements pass through them. To make a wall here, use Add &rarr; Draw wall.</p>';
  showSheet(h,'bottom');
  const list=()=>!$('iGrp')||$('iGrp').checked?sel.segs:[sel.o];
  sheet.querySelectorAll('[data-lc]').forEach(b=>b.onclick=()=>{pushHist();setLineClass(M,list(),b.dataset.lc);sel=null;hideSheet();changed();toast('Set as '+lineName[b.dataset.lc].toLowerCase());});
  sheet.querySelector('[data-a=del]').onclick=()=>{pushHist();for(const i of list()){M.cls[i]='src';M.man[i]=1;}sel=null;hideSheet();changed();toast('Removed from the plan');};
  sheet.querySelector('[data-a=close]').onclick=()=>select(null);
}
function panelSym(){
  const o=sel.o;
  let h='<h3>'+SYM[o.type].n+'</h3><div class="row tight"><button data-a="r90">Turn 90°</button><button data-a="r15">Turn 15°</button><button data-a="sm">Smaller</button><button data-a="bg">Bigger</button></div>';
  h+='<div class="row" style="margin-top:10px"><button data-a="del" class="danger">Delete</button><button data-a="close">Close</button></div><p class="hint">Drag the round handle to move it.</p>';
  showSheet(h,'bottom');
  const act={r90:()=>{o.rot=((o.rot||0)+90)%360;},r15:()=>{o.rot=((o.rot||0)+15)%360;},sm:()=>{o.k=Math.max(0.4,(o.k||1)/1.1);},bg:()=>{o.k=Math.min(3,(o.k||1)*1.1);}};
  sheet.querySelectorAll('[data-a]').forEach(b=>b.onclick=()=>{
    const a=b.dataset.a;if(a==='close'){select(null);return;}
    pushHist();if(a==='del'){M.syms.splice(M.syms.indexOf(o),1);sel=null;hideSheet();changed();return;}
    act[a]();changed();
  });
}
function openNote(nt,w){
  let kind=nt?nt.kind:'note';
  let h='<h3>'+(nt?'Note '+(M.notes.indexOf(nt)+1):'New note')+'</h3><div class="row" id="nKind">'+[['note','Note'],['defect','Defect'],['check','To check']].map(q=>'<button data-k="'+q[0]+'">'+q[1]+'</button>').join('')+'</div>';
  h+='<label class="f">What to record about this spot</label><textarea id="nTxt" rows="3">'+(nt?esc(nt.s):'')+'</textarea>';
  h+='<div class="row" style="margin-top:12px"><button id="nCancel">Cancel</button>'+(nt?'<button id="nDel" class="danger">Delete</button>':'')+'<button class="pri" id="nOk">Save</button></div>';
  showSheet(h,'top');reveal(nt?M.P[2*nt.p+1]:w[1]);draw();
  const mark=()=>sheet.querySelectorAll('[data-k]').forEach(b=>b.className=b.dataset.k===kind?'pri':'');
  sheet.querySelectorAll('[data-k]').forEach(b=>b.onclick=()=>{kind=b.dataset.k;mark();});mark();
  if(!nt)setTimeout(()=>$('nTxt').focus(),50);
  $('nCancel').onclick=()=>{tool=null;hideSheet();refresh();draw();};
  if(nt)$('nDel').onclick=()=>{pushHist();M.notes.splice(M.notes.indexOf(nt),1);hideSheet();changed();toast('Note deleted');};
  $('nOk').onclick=()=>{
    const s=$('nTxt').value.trim();if(!s){toast('Type the note first');return;}
    pushHist();if(nt){nt.s=s;nt.kind=kind;}else M.notes.push({id:M.nid++,p:addPt(M,w[0],w[1]),s,kind});
    tool=null;hideSheet();changed();toast('Note saved. It is listed in List and in the report.');
  };
}
function openSyms(){
  let h='<h3>Place a symbol</h3><div>'+Object.keys(SYM).map(k=>'<span class="chip" data-s="'+k+'">'+SYM[k].n+'</span>').join('')+'</div><p class="hint">Pick one, then tap the plan where it goes. Symbols appear in the drawing outputs.</p><div class="row" style="margin-top:10px"><button id="yClose">Close</button></div>';
  showSheet(h,'bottom');$('yClose').onclick=hideSheet;
  sheet.querySelectorAll('[data-s]').forEach(c=>c.onclick=()=>{mode='edit';setTool({t:'sym',type:c.dataset.s});});
}
function openAdd(){
  let h='<h3>Add</h3><div class="menu"><button id="aWall">Draw a wall (tap start, tap end)</button><button id="aNote">Add a note at a spot</button><button id="aSym">Place a symbol (furniture, tree, car)</button><button id="aBox">Select lines with a box</button>';
  h+='<p class="hint">To add a door or window: in Edit, tap the wall where it belongs, then choose Add door or Add window.</p><button id="aClose">Close</button></div>';
  showSheet(h,'bottom');
  $('aWall').onclick=()=>{mode='edit';setTool({t:'draw',p:null});};
  $('aBox').onclick=()=>{mode='edit';setTool({t:'box'});};
  $('aNote').onclick=()=>setTool({t:'note'});
  $('aSym').onclick=openSyms;
  $('aClose').onclick=hideSheet;
}

/* ---- Measure mode ---- */
const findDim=c=>M.dims.find(d=>d.ax===c.ax&&d.a===c.a&&d.b===c.b&&(d.kind||null)===(c.kind||null));
function candSheet(title,extra){
  let h='<h3>'+esc(title)+'</h3>';
  cand.forEach((c,i)=>{
    const ex=findDim(c),cur=dimVal(M,c,M.P),des=dimVal(M,c,M.P0);
    h+='<button class="big" data-i="'+i+'">'+(c.ax==='x'?'↔ ':'↕ ')+fmt(M,cur)+' '+U()+
      '<small>'+esc(dimName(M,c,rms()))+(Math.abs(cur-des)>epsOf(M)/2?' · drawing '+fmt(M,des):'')+(ex?' · already measured':'')+'</small></button>';
  });
  h+=(extra||'')+'<p class="hint">Tap a size to enter what you measured on site.</p>';
  showSheet(h,'bottom');
  sheet.querySelectorAll('.big').forEach(b=>b.onclick=()=>{const c=cand[+b.dataset.i],ex=findDim(c);cand=[c];draw();openEdit(ex||c,!ex);});
  if(cand.length){const g=dimGeom(M,cand[0]);reveal(Math.min(g[1],g[3]));draw();}
}
function measureTap(px,py,room){
  for(const r of hits)if(px>=r.x-8&&px<=r.x+r.w+8&&py>=r.y-8&&py<=r.y+r.h+8){cand=[];if(r.g)openDiag(r.g,false);else openEdit(r.d,false);draw();return;}
  const w=s2w(px,py),rad=10/V.k;
  if(!room){
    const o=M.opens.map(q=>({q,d:distRect(rectOf(M,q),w[0],w[1])})).filter(z=>z.d<=rad).sort((a,b)=>a.d-b.d)[0];
    if(o){
      const r=rectOf(M,o.q),k=o.q.dir==='x'?0:1;let side=(k?w[0]:w[1])<(r[1-k]+r[3-k])/2?-1:1;
      if(openDims(M,o.q,-side).length>openDims(M,o.q,side).length)side=-side;      // prefer the room side, where corner distances exist
      const show=()=>{cand=openDims(M,o.q,side);draw();
        candSheet(cap(o.q.type)+' '+(openTags(M).tag.get(o.q.id)||''),'<button id="pHt" style="width:100%;margin-bottom:8px">Sill and height on site ('+fmt(M,oSillS(M,o.q))+' / '+fmt(M,oHtS(M,o.q))+')</button><div class="row"><button id="pSide">Other side</button><button id="pRoom">Measure room</button></div>');
        $('pHt').onclick=()=>openHeights(o.q);$('pSide').onclick=()=>{side=-side;show();};$('pRoom').onclick=()=>measureTap(px,py,true);};
      show();return;
    }
    const c=M.walls.find(q=>q.kind==='col'&&distRect(rectOf(M,q),w[0],w[1])===0);
    if(c){cand=colDims(M,c);draw();candSheet('Column','<button id="pRoom" style="width:100%">Measure as a room instead</button>');$('pRoom').onclick=()=>measureTap(px,py,true);return;}
    const fl=LAY.stairs?stairAt(M,w[0],w[1]):null;
    if(fl){cand=stairDims(M,fl);draw();candSheet('Stair, '+(fl.tr.length-1)+' treads','<button id="pRoom" style="width:100%">Measure the room instead</button>');$('pRoom').onclick=()=>measureTap(px,py,true);return;}
  }
  cand=probe(M,w[0],w[1]);draw();
  if(!cand.length){hideSheet();toast('No walls found on both sides here');return;}
  const cx=cand.find(c=>c.ax==='x'),cy=cand.find(c=>c.ax==='y'),p=M.fin?M.pl:0,rm=roomAt(rms(),w[0],w[1]);
  const same=cx&&wallOfRef(M,cx.a)&&wallOfRef(M,cx.a)===wallOfRef(M,cx.b);
  const title=same?'Wall':rm&&rm.closed?(roomName(rm,w[0],w[1])||'Room')+' · '+(rm.area*UNIT_M[M.unit]*UNIT_M[M.unit]).toFixed(2)+' m²':'Measured here';
  candSheet(title,cx&&cy&&!same?'<button id="pDiag" style="width:100%">Check diagonals (should be '+fmt(M,Math.hypot(dimVal(M,cx,M.P)-2*p,dimVal(M,cy,M.P)-2*p))+' '+U()+')</button>':'');
  if(cx&&cy&&!same)$('pDiag').onclick=()=>{
    const ex=M.diags.find(g=>g.xa===cx.a&&g.xb===cx.b&&g.ya===cy.a&&g.yb===cy.b);
    cand=[];draw();openDiag(ex||{xa:cx.a,xb:cx.b,ya:cy.a,yb:cy.b,name:roomName(rm,w[0],w[1])||nearestRoom(M,w[0],w[1])||'Space',d1:null,d2:null,fin:M.fin},!ex);
  };
}
function openHeights(o){
  cand=[];draw();
  let h='<h3>'+cap(o.type)+' '+(openTags(M).tag.get(o.id)||'')+' heights</h3>';
  h+='<div class="kv"><span>Drawing: sill / height / lintel</span><b>'+fmt(M,oSill(M,o))+' / '+fmt(M,oHt(M,o))+' / '+fmt(M,oSill(M,o)+oHt(M,o))+' '+U()+'</b></div>';
  h+='<label class="f">Sill height on site, above floor ('+U()+')</label><input class="num" type="text" inputmode="decimal" id="hS" value="'+(o.sS!=null?fmt(M,o.sS):'')+'" placeholder="'+fmt(M,oSill(M,o))+'">';
  h+='<label class="f">Opening height on site ('+U()+')</label><input class="num" type="text" inputmode="decimal" id="hH" value="'+(o.sH!=null?fmt(M,o.sH):'')+'" placeholder="'+fmt(M,oHt(M,o))+'">';
  h+='<p class="hint">Leave a box empty to keep the drawing value. The lintel level is sill + height.</p>';
  h+='<div class="row" style="margin-top:12px"><button id="hCancel">Cancel</button><button class="pri" id="hOk">Save</button></div>';
  showSheet(h,'top');{const r=rectOf(M,o);reveal((r[1]+r[3])/2);draw();}
  $('hCancel').onclick=hideSheet;
  $('hOk').onclick=()=>{
    const a=$('hS').value.trim(),b=$('hH').value.trim(),va=num(a),vb2=num(b);
    if((a&&!(va>=0))||(b&&!(vb2>0))){toast('Enter the heights as numbers');return;}
    pushHist();o.sS=a?va:null;o.sH=b?vb2:null;hideSheet();changed();toast('Lintel level on site: '+fmt(M,oSillS(M,o)+oHtS(M,o))+' '+U());
  };
}
function openEdit(d,isNew){
  const cur=dimVal(M,d,M.P),des=dimVal(M,d,M.P0),name=dimName(M,d,rms());
  const pk=d.pk!=null?d.pk:(name==='Wall thickness'?-2:name==='Wall length'?0:2),fin0=d.site!=null?!!d.fin:!!M.fin;
  let h='<h3>'+esc(name)+'</h3>';
  h+='<div class="kv"><span>Drawing</span><b>'+fmt(M,des)+' '+U()+'</b></div><div class="kv"><span>Plan now</span><b>'+fmt(M,cur)+' '+U()+'</b></div>';
  h+='<label class="f">Site measurement ('+U()+')</label><div class="row" style="flex-wrap:nowrap"><input class="num" type="text" inputmode="decimal" id="eVal" value="'+(d.site!=null?fmt(M,d.fin?d.raw:d.site):'')+'" placeholder="'+fmt(M,cur)+'"><button id="eSame" style="flex:0 0 96px">As plan</button></div>';
  h+='<label class="f">Measured on</label><select id="eFin"><option value="0">Bare wall (unplastered)</option><option value="1"'+(fin0?' selected':'')+'>Finished surface (plastered)</option></select><p class="hint" id="eBare" style="margin-top:4px"></p>';
  h+='<label class="f">What moves</label><select id="eMode"><option value="auto">Auto (fewest conflicts)</option>'+
    candidates(M,d,0).map(c=>'<option value="'+c.key+'">'+c.label+'</option>').join('')+'<option value="none">Record only as a check, move nothing</option></select>';
  h+='<div class="row" style="margin-top:12px"><button id="eCancel">Cancel</button>'+(isNew?'':'<button id="eDel" class="danger">Remove</button>')+'<button class="pri" id="eOk">Apply</button></div>';
  showSheet(h,'top');
  {const g=dimGeom(M,d);reveal((g[1]+g[3])/2);draw();}
  const inp=$('eVal');setTimeout(()=>{inp.focus();inp.select();},50);
  const read=()=>{const v=num(inp.value),fin=$('eFin').value==='1';return {v,fin,s:fin?v+pk*M.pl:v};};
  const hint=()=>{const r=read();$('eBare').textContent=r.fin&&pk&&r.v>0?'Bare size used on the plan: '+fmt(M,r.s)+' '+U()+' (plaster '+fmt(M,M.pl)+' per face)':r.fin&&!pk?'Plaster does not change this distance.':'';};
  inp.oninput=hint;$('eFin').onchange=hint;hint();
  $('eSame').onclick=()=>{const fin=$('eFin').value==='1';inp.value=fmt(M,fin?cur-pk*M.pl:cur);hint();};
  const go=()=>{
    const r=read(),v=r.s;pushHist();
    if(isNew){
      M.P.push(d.ox,d.oy);M.P0.push(d.ox,d.oy);
      d={id:M.nid++,ax:d.ax,a:d.a,b:d.b,p:M.P.length/2-1,name,site:null,how:null,kind:d.kind||null,oid:d.oid,tr:d.tr};M.dims.push(d);
    }
    const c=setDimension(M,d,v,$('eMode').value);
    d.pk=pk;d.fin=r.fin;d.raw=r.v;
    cand=[];hideSheet();changed();
    const nc=conflicts(M,M.P,null);
    const what=d.how==='none'?'Recorded as a check, plan not changed':!c?'Recorded, no change needed':c.label+': '+fmt(M,Math.abs(c.op.move))+' '+U();
    toast(what+(nc?' · '+nc+' conflict'+(nc>1?'s':'')+' (red)':''),nc?4500:2600);
  };
  const apply=()=>{
    const r=read(),v=r.s;
    if(!(r.v>0&&v>0)){toast('Enter the measured size');return;}
    if($('eMode').value!=='none'&&Math.abs(v-cur)>0.1*cur)askBox('This changes the size by '+fmt(M,Math.abs(v-cur))+' '+U()+' (from '+fmt(M,cur)+' to '+fmt(M,v)+'). Apply?','Apply',go);else go();
  };
  $('eOk').onclick=apply;
  inp.onkeydown=ev=>{if(ev.key==='Enter')apply();};
  $('eCancel').onclick=()=>{cand=[];hideSheet();draw();};
  if(!isNew)$('eDel').onclick=()=>{pushHist();M.dims=M.dims.filter(q=>q!==d);hideSheet();changed();toast('Measurement removed (plan left as is)');};
}
function openDiag(g,isNew){
  const r=diagRect(M,g),pp=g.fin?M.pl:0,exp=Math.hypot(r[2]-r[0]-2*pp,r[3]-r[1]-2*pp);
  let h='<h3>'+esc(g.name)+' diagonals</h3>';
  h+='<div class="kv"><span>Room on plan</span><b>'+fmt(M,r[2]-r[0])+' × '+fmt(M,r[3]-r[1])+' '+U()+'</b></div>';
  h+='<div class="kv"><span>Each diagonal should be</span><b>'+fmt(M,exp)+' '+U()+'</b></div>';
  h+='<label class="f">Diagonal 1: bottom-left to top-right ('+U()+')</label><input class="num" type="text" inputmode="decimal" id="g1" value="'+(g.d1!=null?fmt(M,g.d1):'')+'" placeholder="'+fmt(M,exp)+'">';
  h+='<label class="f">Diagonal 2: top-left to bottom-right ('+U()+')</label><input class="num" type="text" inputmode="decimal" id="g2" value="'+(g.d2!=null?fmt(M,g.d2):'')+'" placeholder="'+fmt(M,exp)+'">';
  h+='<p class="hint">Measure the room sizes first. This is a check only; the plan stays square.'+(g.fin?' Diagonals are taken between finished (plastered) corners.':'')+'</p>';
  h+='<div class="row" style="margin-top:12px"><button id="gCancel">Cancel</button>'+(isNew?'':'<button id="gDel" class="danger">Remove</button>')+'<button class="pri" id="gOk">Save</button></div>';
  showSheet(h,'top');
  $('gCancel').onclick=hideSheet;
  if(!isNew)$('gDel').onclick=()=>{pushHist();M.diags=M.diags.filter(q=>q!==g);hideSheet();changed();};
  $('gOk').onclick=()=>{
    const a=num($('g1').value),b=num($('g2').value);
    if(!(a>0&&b>0)){toast('Enter both diagonals');return;}
    pushHist();
    if(isNew){g.id=M.nid++;M.diags.push(g);}
    g.d1=a;g.d2=b;hideSheet();changed();
    const i=diagInfo(M,g);
    toast(i.ok?'Room is square':'Out of square by '+fmt(M,Math.abs(i.off))+' '+U()+(Math.abs(i.mis)>0.01/UNIT_M[M.unit]?', and diagonals do not fit the room size ('+(i.mis>0?'+':'')+fmt(M,i.mis)+')':''),4500);
  };
}

/* ---- list, layers, menu ---- */
function openList(){
  cand=[];draw();
  let h='<h3>Measurements</h3>';
  if(!M.dims.length)h+='<p class="hint">Nothing measured yet. Switch to Measure and tap inside a room.</p>';
  else{
    h+='<table><tr><th>Where</th><th>Drawing</th><th>Site</th><th>Diff</th></tr>';
    M.dims.forEach((d,i)=>{const st=dimStatus(M,d);
      h+='<tr data-i="'+i+'"'+(st.bad?' class="c"':'')+'><td>'+esc(dimName(M,d,rms()))+(st.bad?' (conflict)':'')+'</td><td>'+fmt(M,st.des)+'</td><td>'+fmt(M,d.site)+'</td><td>'+(st.dev>0?'+':'')+fmt(M,st.dev)+'</td></tr>';});
    h+='</table><p class="hint">Tap a row to open it. Red rows no longer match the plan.</p>';
  }
  const bad=M.dims.filter(d=>dimStatus(M,d).bad);
  if(bad.length){
    h+='<h3 style="margin-top:14px">Closure check</h3>';
    for(const d of bad){const st=dimStatus(M,d),c=chainFor(M,d);
      h+='<p class="hint" style="color:var(--bad)"><b>'+esc(dimName(M,d,rms()))+'</b>: measured '+fmt(M,d.site)+', plan gives '+fmt(M,st.cur)+'.'+(c?' '+esc(c.text)+', closure error '+(c.err>0?'+':'')+fmt(M,c.err)+'.':'')+'</p>';}
  }
  if(M.diags.length){
    h+='<h3 style="margin-top:14px">Diagonal check</h3><table><tr><th>Room</th><th>D1</th><th>D2</th><th>Result</th></tr>';
    M.diags.forEach((g,i)=>{const q=diagInfo(M,g);h+='<tr data-g="'+i+'"><td>'+esc(g.name)+'</td><td>'+fmt(M,g.d1)+'</td><td>'+fmt(M,g.d2)+'</td><td style="color:'+q.color+'">'+q.label+'</td></tr>';});
    h+='</table>';
  }
  const rt=roomTable(M);
  if(rt.length){
    h+='<h3 style="margin-top:14px">Room areas (m²)</h3><table><tr><th>Room</th><th>Drawing</th><th>As built</th><th>Diff</th></tr>';
    for(const r of rt)h+='<tr><td>'+esc(r.name)+'</td><td>'+(r.was==null?'–':r.was.toFixed(2))+'</td><td>'+r.now.toFixed(2)+'</td><td>'+(r.was==null?'–':(r.now-r.was>0?'+':'')+(r.now-r.was).toFixed(2))+'</td></tr>';
    h+='</table>';
  }else h+='<p class="hint">Room areas appear once the rooms are closed by walls. Check the suggestions in Edit.</p>';
  const OT=openTags(M);
  if(OT.rows.length){
    h+='<h3 style="margin-top:14px">Doors and windows ('+U()+')</h3><table><tr><th>Tag</th><th>Nos</th><th>Width</th><th>Height</th><th>Sill</th><th>Lintel</th></tr>';
    for(const r of OT.rows)h+='<tr><td>'+r.tag+'</td><td>'+r.n+'</td><td>'+fmt(M,r.w)+'</td><td>'+fmt(M,r.ht)+'</td><td>'+fmt(M,r.sill)+'</td><td>'+fmt(M,r.lintel)+'</td></tr>';
    h+='</table>';
  }
  if(M.notes.length){
    h+='<h3 style="margin-top:14px">Notes</h3><table><tr><th>No.</th><th>Kind</th><th>Note</th></tr>';
    M.notes.forEach((nt,i)=>h+='<tr data-n="'+i+'"><td>'+(i+1)+'</td><td style="color:'+(NCOL[nt.kind]||NCOL.note)+'">'+nt.kind+'</td><td style="text-align:left">'+esc(nt.s)+'</td></tr>');
    h+='</table>';
  }
  h+='<div class="row" style="margin-top:10px"><button id="lClose">Close</button></div>';
  showSheet(h,'top');
  $('lClose').onclick=hideSheet;
  sheet.querySelectorAll('tr[data-n]').forEach(r=>r.onclick=()=>{const nt=M.notes[+r.dataset.n];V.cx=M.P[2*nt.p];V.cy=M.P[2*nt.p+1];draw();openNote(nt);});
  sheet.querySelectorAll('tr[data-i]').forEach(r=>r.onclick=()=>{const d=M.dims[+r.dataset.i],g=dimGeom(M,d);mode='measure';refresh();V.cx=(g[0]+g[2])/2;V.cy=(g[1]+g[3])/2;draw();openEdit(d,false);});
  sheet.querySelectorAll('tr[data-g]').forEach(r=>r.onclick=()=>openDiag(M.diags[+r.dataset.g],false));
}
function openLayers(){
  const rows=[['walls','Walls'],['opens','Doors and windows'],['stairs','Stairs'],['fit','Interior fittings'],['furn','Furniture and symbols'],['text','Text'],['dims','Site dimensions'],['notes','Notes'],['under','Original drawing (underlay)']];
  let h='<h3>Show</h3>'+rows.map(r=>'<label class="lay"><input type="checkbox" data-y="'+r[0]+'"'+(LAY[r[0]]?' checked':'')+'><span>'+r[1]+'</span></label>').join('')+'<div class="row" style="margin-top:10px"><button id="yClose">Close</button></div>';
  showSheet(h,'bottom');
  sheet.querySelectorAll('[data-y]').forEach(c=>c.onchange=()=>{LAY[c.dataset.y]=c.checked?1:0;draw();});
  $('yClose').onclick=hideSheet;
}
function openMenu(){
  cand=[];draw();
  let h='<h3>Menu</h3><div class="menu"><button id="mOpen">Open DXF or project file</button>';
  if(M)h+='<button id="mSave">Save project file</button><button id="mView">Drawing: preview and export (PDF, DXF, image)</button><button id="mCsv">Export measurements (CSV for Excel)</button><button id="mLay">Show or hide layers</button><button id="mFit">Fit plan to screen</button><button id="mSetup">Plan setup (units, wall thickness, layers)</button><button id="mReset" class="danger">Clear site measurements</button>';
  h+='<button id="mClose">Close</button></div><p class="hint">Drawing (top bar) shows the finished plan and exports it. Two-finger tap: undo. Three-finger tap: redo. Touch and hold: magnifier for exact taps.</p>';
  showSheet(h,'top');
  $('mOpen').onclick=()=>{hideSheet();pickFile();};
  $('mClose').onclick=hideSheet;
  if(M){
    $('mSave').onclick=()=>{hideSheet();saveFile();};
    $('mView').onclick=()=>{hideSheet();openView();};
    $('mCsv').onclick=()=>{hideSheet();download(M.name+' measurements.csv',reportCSV(M),'text/csv');};
    $('mLay').onclick=openLayers;
    $('mFit').onclick=()=>{hideSheet();fit();};
    $('mSetup').onclick=()=>openSetup(false);
    $('mReset').onclick=()=>askBox('Remove all site measurements and return the plan to the drawing sizes? Corrections made in Edit are kept.','Clear',()=>{
      pushHist();M.P=M.P0.slice();M.decor.forEach(g=>{g.dx=0;g.dy=0;});M.dims=[];M.diags=[];hideSheet();changed();});
  }
}
/* ---- the drawing: preview with pan and zoom, options, export ---- */
function viewRender(keep){
  const F=sheetFit(M,{date:new Date().toLocaleDateString()}),body=$('vBody');
  body.innerHTML=planSVG(M,null,F);
  const svg=body.querySelector('svg');if(!svg)return;
  const full=svg.getAttribute('viewBox').split(' ').map(Number);
  svg.removeAttribute('width');svg.removeAttribute('height');svg.style.width='100%';svg.style.height='100%';
  if(!keep||!vb)vb=full.slice();svg.setAttribute('viewBox',vb.join(' '));
  $('vStyle').value=outOpt(M).style;
  $('vInfo').textContent='Scale 1:'+F.sc+' on '+F.paper+(F.land?' landscape':' portrait')+(F.sc>M.sc?' (reduced from 1:'+M.sc+' to fit; choose A3 in Options to keep it)':'')+' · pinch or scroll to zoom';
}
function openView(){sel=null;cand=[];hideSheet();vb=null;$('view').style.display='flex';viewRender(false);}
function viewOptions(){
  const o=outOpt(M),rows=[['dims','Dimension strings outside the plan'],['grid','Grid lines and bubbles'],['rt','Room tags (name, size, area)'],['ot','Door and window tags'],['notes','Notes'],['txt','Other text from the drawing']];
  let h='<h3>Drawing options</h3><label class="f" style="margin-top:0">Paper</label><select id="oPaper"><option>A4</option><option'+(o.paper==='A3'?' selected':'')+'>A3</option></select>';
  h+='<label class="f">Scale (made smaller automatically if the paper is too small)</label><select id="oSc">'+[20,50,100,200].map(q=>'<option value="'+q+'"'+(q===M.sc?' selected':'')+'>1:'+q+'</option>').join('')+'</select>';
  h+=rows.map(q=>'<label class="lay"><input type="checkbox" data-o="'+q[0]+'"'+(o[q[0]]?' checked':'')+'><span>'+q[1]+'</span></label>').join('');
  h+='<div class="row" style="margin-top:10px"><button id="oClose" class="pri">Done</button></div>';
  showSheet(h,'top');
  const upd=()=>{autosave();viewRender(false);};
  $('oPaper').onchange=ev=>{M.out.paper=ev.target.value;upd();};
  $('oSc').onchange=ev=>{M.sc=+ev.target.value;upd();};
  sheet.querySelectorAll('[data-o]').forEach(c=>c.onchange=()=>{M.out[c.dataset.o]=c.checked?1:0;upd();});
  $('oClose').onclick=hideSheet;
}
function savePNG(){
  const F=sheetFit(M,{date:new Date().toLocaleDateString()}),svg=planSVG(M,null,F),px=200/25.4,img=new Image();
  img.onload=()=>{
    const c=document.createElement('canvas');c.width=Math.round(F.w*px);c.height=Math.round(F.h*px);
    c.getContext('2d').drawImage(img,0,0,c.width,c.height);
    c.toBlob(b=>{const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=M.name+' plan.png';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),5000);},'image/png');
  };
  img.onerror=()=>toast('Could not make the image on this device. Use PDF instead.',4000);
  img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
}
function viewExport(){
  let h='<h3>Export</h3><div class="menu"><button id="xPdf">PDF: drawing and report (print, then Save as PDF)</button><button id="xPng">Image of the drawing (PNG)</button><button id="xDxf">DXF for AutoCAD (technical style, real dimensions)</button><button id="xCsv">Tables as CSV for Excel</button><button id="xClose">Close</button></div>';
  h+='<p class="hint">PDF and image use the style chosen above. In the print dialog choose the paper shown and 100% scale for a true-scale print.</p>';
  showSheet(h,'top');
  $('xPdf').onclick=()=>{hideSheet();printReport();};
  $('xPng').onclick=()=>{hideSheet();savePNG();};
  $('xDxf').onclick=()=>{hideSheet();download(M.name+' as-built.dxf',exportDXF(M),'application/dxf');};
  $('xCsv').onclick=()=>{hideSheet();download(M.name+' measurements.csv',reportCSV(M),'text/csv');};
  $('xClose').onclick=hideSheet;
}
$('bView').onclick=openView;$('vClose').onclick=()=>{$('view').style.display='none';hideSheet();draw();};
$('vStyle').onchange=ev=>{M.out.style=ev.target.value;autosave();viewRender(true);};
$('vOpt').onclick=viewOptions;$('vOut').onclick=viewExport;
$('bSnap').onclick=()=>{M.snap=M.snap!==0?0:1;autosave();refresh();toast(M.snap?'Snap on: catches ends, faces, middles and centre lines':'Snap off: sizes still round to the step');};
{const vp=new Map();let pd=null;const body=$('vBody');
  const setVB=()=>{const svg=body.querySelector('svg');if(svg&&vb)svg.setAttribute('viewBox',vb.map(v=>+v.toFixed(3)).join(' '));};
  const zoomV=(cx,cy,f)=>{const r=body.getBoundingClientRect(),sc=Math.max(vb[2]/r.width,vb[3]/r.height),ox=vb[0]+vb[2]/2+(cx-r.left-r.width/2)*sc,oy=vb[1]+vb[3]/2+(cy-r.top-r.height/2)*sc;
    vb[2]/=f;vb[3]/=f;const s2=sc/f;vb[0]=ox-(cx-r.left-r.width/2)*s2-vb[2]/2;vb[1]=oy-(cy-r.top-r.height/2)*s2-vb[3]/2;setVB();};
  body.addEventListener('pointerdown',e=>{try{body.setPointerCapture(e.pointerId);}catch(_){}vp.set(e.pointerId,{x:e.clientX,y:e.clientY});pd=null;});
  body.addEventListener('pointermove',e=>{
    const p=vp.get(e.pointerId);if(!p||!vb)return;const r=body.getBoundingClientRect(),sc=Math.max(vb[2]/r.width,vb[3]/r.height);
    if(vp.size===1){vb[0]-=(e.clientX-p.x)*sc;vb[1]-=(e.clientY-p.y)*sc;setVB();}
    p.x=e.clientX;p.y=e.clientY;
    if(vp.size===2){const [a,b]=[...vp.values()],d=Math.hypot(a.x-b.x,a.y-b.y);if(pd)zoomV((a.x+b.x)/2,(a.y+b.y)/2,d/pd);pd=d;}
  });
  const end=e=>{vp.delete(e.pointerId);pd=null;};body.addEventListener('pointerup',end);body.addEventListener('pointercancel',end);
  body.addEventListener('wheel',e=>{e.preventDefault();if(vb)zoomV(e.clientX,e.clientY,Math.exp(-e.deltaY*0.0015));},{passive:false});
}
$('bMenu').onclick=openMenu;$('bList').onclick=openList;$('bOpen0').onclick=pickFile;$('bSave').onclick=()=>saveFile();
$('tEdit').onclick=()=>setMode('edit');$('tMeasure').onclick=()=>setMode('measure');$('tAdd').onclick=openAdd;$('tUndo').onclick=undo;$('tRedo').onclick=redo;

/* ---- taps and tools ---- */
function tap(px,py){
  if(!M)return;
  let w=s2w(px,py);
  if(tool&&tool.t==='note'){openNote(null,w);return;}
  if(tool&&tool.t==='sym'){pushHist();const sy={id:M.nid++,p:addPt(M,w[0],w[1]),type:tool.type,rot:0,k:1};M.syms.push(sy);tool=null;changed();select({t:'sym',o:sy,pt:w});toast(SYM[sy.type].n+' placed. Drag its handle to move it.');return;}
  if(!tool&&LAY.notes){const n=nhits.find(q=>Math.hypot(q.x-px,q.y-py)<=20);if(n){openNote(n.nt);return;}}
  if(tool&&tool.t==='draw'){
    if(M.snap!==0){const sp=snapPoint(M,w[0],w[1],10/V.k);w=[sp.x,sp.y];}
    if(!tool.p){tool.p=w;refresh();draw();return;}
    pushHist();const nw=drawWall(M,tool.p[0],tool.p[1],w[0],w[1]);
    if(!nw){hist.pop();toast('Too short. Tap the end point further away.');return;}
    tool=null;changed();select({t:'wall',o:nw,pt:w});toast('Wall added');return;
  }
  if(mode==='edit')editTap(px,py);else measureTap(px,py);
}
function boxSelect(r){
  const a=s2w(r[0],r[3]),b=s2w(r[2],r[1]),P=M.P,list=[];
  M.segs.forEach((q,i)=>{if(q[3]||!lineShown(M.cls[i]))return;
    if([q[0],q[1]].every(p=>P[2*p]>=a[0]&&P[2*p]<=b[0]&&P[2*p+1]>=a[1]&&P[2*p+1]<=b[1]))list.push(i);});
  tool=null;boxR=null;refresh();
  if(!list.length){toast('No lines inside the box');draw();return;}
  select({t:'line',o:list[0],segs:list,pt:a});
}

/* ---- pointer input: pan, pinch, tap, hold for magnifier, drag handles, finger-count gestures ---- */
const ptrs=new Map();let moved=false,pinch=null,gest=null,holdT=0,drag=null;
const local=e=>{const r=cv.getBoundingClientRect();return [e.clientX-r.left,e.clientY-r.top];};
function hintAt(px,py){                         // what a wall point would catch here, shown while the magnifier is up
  snapHint=null;if(!M||!tool||tool.t!=='draw'||M.snap===0)return;
  const w=s2w(px,py),sp=snapPoint(M,w[0],w[1],10/V.k);snapHint=[];if(sp.nx)snapHint.push({k:0,v:sp.x,n:sp.nx});if(sp.ny)snapHint.push({k:1,v:sp.y,n:sp.ny});
}
const OFF=64;                                  // the crosshair sits this far above the finger
cv.addEventListener('pointerdown',e=>{
  try{cv.setPointerCapture(e.pointerId);}catch(_){}
  const [x,y]=local(e);ptrs.set(e.pointerId,{x,y,sx:x,sy:y});
  if(ptrs.size===1){
    moved=false;gest={max:1,t0:Date.now(),moved:false};drag=null;loupe=null;
    if(M&&mode==='edit'&&!tool){const h=handles.find(q=>Math.hypot(q.x-x,q.y-y)<=24);if(h)drag={h,started:false};}
    if(M&&tool&&tool.t==='box')drag={box:[x,y]};
    clearTimeout(holdT);
    if(M&&!drag)holdT=setTimeout(()=>{if(ptrs.size===1&&!moved){loupe={x,y,cx:x,cy:y-OFF};hintAt(x,y-OFF);draw();}},380);
  }else{moved=true;pinch=null;clearTimeout(holdT);loupe=null;drag=null;boxR=null;if(gest)gest.max=Math.max(gest.max,ptrs.size);draw();}
});
cv.addEventListener('pointermove',e=>{
  const p=ptrs.get(e.pointerId);if(!p)return;
  const [x,y]=local(e),dx=x-p.x,dy=y-p.y;p.x=x;p.y=y;
  if(Math.hypot(x-p.sx,y-p.sy)>10&&gest)gest.moved=true;
  if(ptrs.size===1){
    if(drag&&drag.h){
      if(!drag.started){if(Math.hypot(x-p.sx,y-p.sy)<4)return;drag.started=true;pushHist();}
      const w=s2w(x,y),k=drag.h.k;let cx=x,cy=y;
      if(k===2){setCoord(M,drag.h.p,0,w[0]);setCoord(M,drag.h.p,1,w[1]);snapHint=null;}
      else{
        const o=sel.o,other=drag.h.p===o.a?o.b:o.a,sn=snapAxis(M,k,w[k],10/V.k,o,w[1-k],M.P[2*other+k]);
        setCoord(M,drag.h.p,k,sn.v);snapHint=sn.n?[{k,v:sn.v,n:sn.n}]:null;
        if(k)cy=Hh/2-(sn.v-V.cy)*V.k;else cx=(sn.v-V.cx)*V.k+W/2;
      }
      GEO=null;RMS=null;loupe={x,y,cx,cy};moved=true;draw();return;
    }
    if(drag&&drag.box){boxR=[Math.min(drag.box[0],x),Math.min(drag.box[1],y),Math.max(drag.box[0],x),Math.max(drag.box[1],y)];moved=true;draw();return;}
    if(loupe){loupe={x,y,cx:x,cy:y-OFF};hintAt(x,y-OFF);draw();return;}
    if(!moved&&Math.hypot(x-p.sx,y-p.sy)>8){moved=true;clearTimeout(holdT);}
    if(moved){V.cx-=dx/V.k;V.cy+=dy/V.k;draw();}
  }else if(ptrs.size===2){
    const [a,b]=[...ptrs.values()],dist=Math.hypot(a.x-b.x,a.y-b.y),mx=(a.x+b.x)/2,my=(a.y+b.y)/2;
    if(pinch&&pinch.dist>0){if(Math.abs(dist-pinch.d0)>12&&gest)gest.moved=true;zoomAt(mx,my,dist/pinch.dist);V.cx-=(mx-pinch.mx)/V.k;V.cy+=(my-pinch.my)/V.k;draw();}
    pinch={dist,mx,my,d0:pinch?pinch.d0:dist};
  }
});
const up=e=>{
  const p=ptrs.get(e.pointerId);ptrs.delete(e.pointerId);if(ptrs.size<2)pinch=null;clearTimeout(holdT);
  if(ptrs.size>0||!p)return;
  const ok=e.type==='pointerup';
  if(gest&&gest.max>=2){
    if(ok&&!gest.moved&&Date.now()-gest.t0<450&&M){if(gest.max===2)undo();else if(gest.max===3)redo();}
    gest=null;loupe=null;draw();return;
  }
  if(drag&&drag.h){const st=drag.started;drag=null;loupe=null;snapHint=null;if(st){changed();if(sel)select({t:sel.t,o:sel.o,pt:sel.pt});}else if(ok)tap(p.x,p.y);return;}
  if(drag&&drag.box){const r=boxR;drag=null;if(ok&&r&&r[2]-r[0]>12&&r[3]-r[1]>12)boxSelect(r);else{boxR=null;draw();}return;}
  if(loupe){const l=loupe;loupe=null;snapHint=null;draw();if(ok)tap(l.cx,l.cy);return;}
  if(ok&&!moved)tap(p.x,p.y);
};
cv.addEventListener('pointerup',up);cv.addEventListener('pointercancel',up);
cv.addEventListener('contextmenu',e=>e.preventDefault());
cv.addEventListener('wheel',e=>{e.preventDefault();const [x,y]=local(e);zoomAt(x,y,Math.exp(-e.deltaY*0.0015));draw();},{passive:false});
document.addEventListener('gesturestart',e=>e.preventDefault());
window.addEventListener('resize',resize);
window.addEventListener('beforeunload',e=>{if(M&&fileDirty&&M.dims.length){e.preventDefault();e.returnValue='';}});

/* ---- start ---- */
resize();refresh();
const q=new URLSearchParams(location.search).get('load');
if(q)fetch(q).then(r=>r.text()).then(t=>importDXF(t,q.split('/').pop())).catch(()=>toast('Could not load '+q));
else DB.get('current').then(m=>{if(m&&m.P&&!M){M=m;fixModel(M);mode=M.dims.length?'measure':'edit';refresh();fit();}}).catch(()=>{});
window.__sp={get M(){return M;},view:()=>({cx:V.cx,cy:V.cy,k:V.k,W,H:Hh}),get mode(){return mode;},get sel(){return sel;}};
})();
