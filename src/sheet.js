/* =====================================================================
   SHEET (no DOM): snapping, opening heights and tags, notes, symbols,
   the dimension layout, and the drawings that go out (SVG for PDF, DXF, CSV).
   ===================================================================== */

/* ---- snapping: coordinates worth catching along one axis ---- */
function snapList(M,k,skip){
  const out=[];
  for(const w of M.walls){
    if(w===skip)continue;
    const r=rectOf(M,w),along=w.kind!=='col'&&(wallDir(M,w)==='x')===(k===0),lo=r[1-k],hi=r[3-k];
    out.push({v:r[k],n:along?'end':'face',lo,hi},{v:r[k+2],n:along?'end':'face',lo,hi},{v:(r[k]+r[k+2])/2,n:along?'middle':'centre line',lo,hi,soft:1});
  }
  for(const o of M.opens){
    if(o===skip||(o.dir==='x')!==(k===0))continue;
    const r=rectOf(M,o),lo=r[1-k],hi=r[3-k];
    out.push({v:r[k],n:'jamb',lo,hi},{v:r[k+2],n:'jamb',lo,hi},{v:(r[k]+r[k+2])/2,n:'opening centre',lo,hi,soft:1});
  }
  return out;
}
/* nearest catch within reach; otherwise round the length from `base` to the step */
function snapAxis(M,k,v,tol,skip,cross,base){
  let best=null,bs=Infinity;
  if(M.snap!==0)for(const t of snapList(M,k,skip)){
    const d=Math.abs(t.v-v);if(d>tol)continue;
    const dc=cross==null?0:Math.max(t.lo-cross,0,cross-t.hi),s=d+(t.soft?tol*0.25:0)+Math.min(dc,1e6)*1e-7;
    if(s<bs){bs=s;best={v:t.v,n:(dc>epsOf(M)?'in line with ':'')+t.n};}
  }
  if(best)return best;
  const st=(M.step||0.01)/UNIT_M[M.unit];
  return {v:base==null?v:base+Math.round((v-base)/st)*st,n:null};
}
function snapPoint(M,x,y,tol){
  const a=snapAxis(M,0,x,tol,null,y,null),b=snapAxis(M,1,y,tol,null,x,null);
  return {x:a.v,y:b.v,nx:a.n,ny:b.n};
}

/* ---- opening heights and tags ---- */
const HD={door:[0,2.1],window:[0.9,1.2],opening:[0,2.1]};      // sill, height in metres
function hDef(M,type){const d=(M.hd&&M.hd[type])||HD[type]||HD.door,u=UNIT_M[M.unit];return [d[0]/u,d[1]/u];}
const oSill=(M,o)=>o.sill!=null?o.sill:hDef(M,o.type)[0];
const oHt=(M,o)=>o.ht!=null?o.ht:hDef(M,o.type)[1];
const oSillS=(M,o)=>o.sS!=null?o.sS:oSill(M,o);                 // as built: the site value when one was taken
const oHtS=(M,o)=>o.sH!=null?o.sH:oHt(M,o);
function openTags(M){
  const c=0.01/UNIT_M[M.unit],PRE={door:'D',window:'W',opening:'O'},ord={door:0,window:1,opening:2},tag=new Map(),rows=[],by=new Map(),cnt={};
  const list=M.opens.map(o=>{const r=rectOf(M,o),k=o.dir==='x'?0:1;return {o,w:r[k+2]-r[k],x:r[0],y:r[3]};});
  list.sort((a,b)=>ord[a.o.type]-ord[b.o.type]||b.y-a.y||a.x-b.x);
  for(const q of list){
    const o=q.o,ht=oHtS(M,o),sl=oSillS(M,o),key=o.type+':'+Math.round(q.w/c)+':'+Math.round(ht/c)+':'+Math.round(sl/c);
    let g=by.get(key);
    if(!g){cnt[o.type]=(cnt[o.type]||0)+1;g={tag:PRE[o.type]+cnt[o.type],type:o.type,w:q.w,ht,sill:sl,lintel:sl+ht,n:0};by.set(key,g);rows.push(g);}
    g.n++;tag.set(o.id,g.tag);
  }
  return {tag,rows};
}

/* ---- symbols: sizes in metres about the centre; f filled, s soft fill, d dark fill, c outline, l line ---- */
const circ=(cx,cy,rx,ry,n)=>{const p=[];n=n||24;for(let i=0;i<n;i++){const a=i/n*2*Math.PI;p.push(cx+rx*Math.cos(a),cy+(ry||rx)*Math.sin(a));}return p;};
const rc=(x,y,w,h)=>[x,y,x+w,y,x+w,y+h,x,y+h];
const blob=(r,sd)=>{const p=[];for(let i=0;i<40;i++){const a=i/40*2*Math.PI,q=r*(1+0.07*Math.sin(5*a+sd)+0.05*Math.sin(9*a+sd*2));p.push(q*Math.cos(a),q*Math.sin(a));}return p;};
const SYM={
  bed2:{n:'Double bed',w:1.6,h:2,d:[[rc(-.8,-1,1.6,2),'f'],[rc(-.7,.5,.62,.38),'f'],[rc(.08,.5,.62,.38),'f'],[[-.8,.35,.8,.35],'l']]},
  bed1:{n:'Single bed',w:.95,h:2,d:[[rc(-.475,-1,.95,2),'f'],[rc(-.33,.5,.66,.38),'f'],[[-.475,.35,.475,.35],'l']]},
  sofa:{n:'Sofa',w:2.1,h:.9,d:[[rc(-1.05,-.45,2.1,.9),'f'],[rc(-1.05,.25,2.1,.2),'f'],[rc(-1.05,-.45,.2,.7),'f'],[rc(.85,-.45,.2,.7),'f'],[[-.28,-.45,-.28,.25],'l'],[[.28,-.45,.28,.25],'l']]},
  chair:{n:'Armchair',w:.85,h:.85,d:[[rc(-.425,-.425,.85,.85),'f'],[rc(-.425,.25,.85,.175),'f'],[rc(-.425,-.425,.15,.675),'f'],[rc(.275,-.425,.15,.675),'f']]},
  table:{n:'Dining table',w:1.7,h:1.8,d:[[rc(-.7,.5,.4,.4),'f'],[rc(-.2,.5,.4,.4),'f'],[rc(.3,.5,.4,.4),'f'],[rc(-.7,-.9,.4,.4),'f'],[rc(-.2,-.9,.4,.4),'f'],[rc(.3,-.9,.4,.4),'f'],[rc(-.85,-.45,1.7,.9),'f']]},
  wc:{n:'WC',w:.4,h:.7,d:[[rc(-.2,.15,.4,.2),'f'],[circ(0,-.1,.18,.25),'f']]},
  basin:{n:'Wash basin',w:.5,h:.4,d:[[rc(-.25,-.2,.5,.4),'f'],[circ(0,-.02,.17,.12),'c']]},
  sink:{n:'Kitchen sink',w:1,h:.5,d:[[rc(-.5,-.25,1,.5),'f'],[rc(-.42,-.17,.36,.34),'c'],[rc(.06,-.17,.36,.34),'c']]},
  car:{n:'Car',w:1.8,h:4.4,d:[[[-.9,-1.9,-.75,-2.2,.75,-2.2,.9,-1.9,.9,1.8,.7,2.2,-.7,2.2,-.9,1.8],'f'],[[-.72,.95,.72,.95,.62,.3,-.62,.3],'c'],[[-.62,-1.15,.62,-1.15,.7,-1.6,-.7,-1.6],'c'],[[-.62,.3,-.62,-1.15],'l'],[[.62,.3,.62,-1.15],'l']]},
  tree:{n:'Tree',w:2.8,h:2.8,d:[[blob(1.3,0),'s'],[blob(.85,2),'s'],[blob(.42,4),'s'],[circ(0,0,.07),'d']]},
  plant:{n:'Plant',w:.7,h:.7,d:[[blob(.32,1),'s'],[blob(.17,3),'s']]},
  entry:{n:'Entry arrow',w:.6,h:.6,d:[[[-.28,-.22,.28,-.22,0,.28],'d']]},
  north:{n:'North arrow',w:1.2,h:1.2,d:[[circ(0,0,.55),'c'],[[0,.55,-.2,-.35,0,-.18],'d'],[[0,.55,.2,-.35,0,-.18],'c']]}
};
function symPaths(M,s){
  const D=SYM[s.type];if(!D)return [];
  const f=(s.k||1)/UNIT_M[M.unit],a=(s.rot||0)*Math.PI/180,c=Math.cos(a),n=Math.sin(a),x0=M.P[2*s.p],y0=M.P[2*s.p+1];
  return D.d.map(q=>{const p=q[0],o=new Array(p.length);for(let i=0;i<p.length;i+=2){o[i]=x0+(p[i]*c-p[i+1]*n)*f;o[i+1]=y0+(p[i]*n+p[i+1]*c)*f;}return {pts:o,mode:q[1]};});
}
const symRad=(M,s)=>{const D=SYM[s.type];return D?Math.max(D.w,D.h)/2*(s.k||1)/UNIT_M[M.unit]:0;};

/* ---- what the drawing shows besides the plan: dimension strings, grid, tags, notes; nothing overlaps ---- */
const OUT0={style:'pres',paper:'A4',dims:1,grid:0,rt:1,ot:1,notes:1,txt:1};
const outOpt=(M,o)=>Object.assign({},OUT0,M.out||{},o||{});
const tw=(s,h)=>String(s).length*h*0.6;
const keptH=(M,t,sc)=>Math.max(paperU(M,1.8,sc),Math.min(textH(M,t,sc),t.h>0?t.h:Infinity));
function textBox(M,t,sc){                      // rough extent of a drawing text
  const h=keptH(M,t,sc),w=tw(t.s,h),x=M.P[2*t.p]-(t.ha==='center'?w/2:t.ha==='right'?w:0),y=M.P[2*t.p+1]-(t.va==='middle'?h/2:t.va==='top'?h:0);
  return t.rot?[x-h,y-w,x+h,y+w]:[x,y,x+w,y+h];
}
function planBox(M,G,sc){
  const {xs,ys,nx,ny,mass}=G;let b=null;
  for(let j=0;j<ny;j++)for(let i=0;i<nx;i++)if(mass[j*nx+i]){
    if(!b)b=[xs[i],ys[j],xs[i+1],ys[j+1]];else{b[0]=Math.min(b[0],xs[i]);b[1]=Math.min(b[1],ys[j]);b[2]=Math.max(b[2],xs[i+1]);b[3]=Math.max(b[3],ys[j+1]);}
  }
  if(!b){const s=structBBox(M);return s?{mass:s,all:s.slice()}:null;}
  const m=2.5/UNIT_M[M.unit],q=[b[0]-m,b[1]-m,b[2]+m,b[3]+m],P=M.P,o=b.slice(),inq=(x,y)=>x>=q[0]&&x<=q[2]&&y>=q[1]&&y<=q[3];
  const grow=(x,y)=>{o[0]=Math.min(o[0],x);o[1]=Math.min(o[1],y);o[2]=Math.max(o[2],x);o[3]=Math.max(o[3],y);};
  M.segs.forEach((s,i)=>{
    if(s[3]||M.cls[i]==='src')return;const x1=P[2*s[0]],y1=P[2*s[0]+1],x2=P[2*s[1]],y2=P[2*s[1]+1];
    if(inq(x1,y1)&&inq(x2,y2)){grow(x1,y1);grow(x2,y2);}
  });
  for(const s of M.syms||[]){if(s.type==='tree'||s.type==='plant')continue;const x=P[2*s.p],y=P[2*s.p+1],r=symRad(M,s);grow(x-r,y-r);grow(x+r,y+r);}
  for(const t of M.texts){const bx=textBox(M,t,sc);if(inq(bx[0],bx[1])&&inq(bx[2],bx[3])){grow(bx[0],bx[1]);grow(bx[2],bx[3]);}}
  return {mass:b,all:o};
}
function sheetGeom(M,opt){
  const o=outOpt(M,opt),sc=o.sc||M.sc||100,mm=v=>paperU(M,v,sc),e=epsOf(M),P=M.P,G=massGrid(M),pb=planBox(M,G,sc),u=UNIT_M[M.unit];
  const L={sc,G,o,dims:[],grid:[],rtags:[],otags:[],notes:[],hide:new Set(),ext:null,box:null};
  if(!pb)return L;
  const B=pb.all,mb=pb.mass,maxT=M.th.length?Math.max(...M.th):0.3/u,boxes=[];
  L.box=B;
  const hit=b=>boxes.some(q=>b[0]<q[2]&&b[2]>q[0]&&b[1]<q[3]&&b[3]>q[1]);
  const put=c=>{for(const q of c)if(!hit(q.box)){boxes.push(q.box);return q;}boxes.push(c[0].box);return c[0];};
  /* a wall or opening is on a side of the building when nothing stands beyond it */
  const ray=(al,cr,k,s)=>hitsAxis(M,k?cr:al,k?al:cr,1-k,s,true);
  const free=(r,k,s)=>{const f=(s>0?r[3-k]:r[1-k])+s*e*2;return [0.25,0.5,0.75].some(t=>!ray(r[k]+(r[k+2]-r[k])*t,f,k,s));};
  const reach=(r,k,s)=>{if(free(r,k,s))return true;const h=ray((r[k]+r[k+2])/2,(s>0?r[3-k]:r[1-k])+s*e*2,k,s);return !!h&&h.t<=maxT+e*4&&!!h.wall&&free(rectOf(M,h.wall),k,s);};
  const margin=[0,0,0,0],seen={};                // left, bottom, right, top (paper mm used by the strings)
  if(o.dims)for(const sd of [[0,-1],[1,-1],[0,1],[1,1]]){
    const k=sd[0],s=sd[1],lo=mb[k],hi=mb[k+2],p1=[],p2=[];
    for(const w of M.walls){const r=rectOf(M,w);if((w.kind==='col'||(wallDir(M,w)==='x')!==(k===0))&&reach(r,k,s))p2.push(r[k],r[k+2]);}
    for(const q of M.opens){if((q.dir==='x')!==(k===0))continue;const r=rectOf(M,q);if(free(r,k,s))p1.push(r[k],r[k+2]);}
    const tiers=[];
    if(p1.length)tiers.push(uniq([lo,hi,...p1],e*5));        // openings
    const t2=uniq([lo,hi,...p2],e*5);if(t2.length>2)tiers.push(t2);   // wall to wall
    tiers.push([lo,hi]);                                      // overall
    let n=0;const edge=s>0?B[3-k]:B[1-k];
    for(const t of tiers){
      const key=k+':'+t.map(v=>Math.round(v/e/5)).join(',');if(seen[key])continue;seen[key]=1;
      const c=edge+s*mm(9+7*n);n++;
      for(let i=0;i<t.length-1;i++)L.dims.push({k,a:t[i],b:t[i+1],c,e:edge+s*mm(2),s:fmt(M,t[i+1]-t[i])});
    }
    if(n)margin[k===0?(s<0?1:3):(s<0?0:2)]=9+7*(n-1)+4;
  }
  const h25=mm(2.5),gap=mm(0.8);
  const dimBox=(d,off,sh)=>{
    const w=tw(d.s,h25)+mm(1.2);let x,y;
    if(d.k===0){x=(d.a+d.b)/2+sh;y=d.c+off*(gap+h25/2);return {x,y,box:[x-w/2,y-h25/2,x+w/2,y+h25/2]};}
    x=d.c-off*(gap+h25/2);y=(d.a+d.b)/2+sh;return {x,y,box:[x-h25/2,y-w/2,x+h25/2,y+w/2]};
  };
  const wide=d=>tw(d.s,h25)+mm(1.4)<=d.b-d.a;
  for(const d of L.dims)if(wide(d)){const q=put([dimBox(d,1,0)]);d.tx=q.x;d.ty=q.y;}
  for(const d of L.dims)if(!wide(d)){
    const sh=(d.b-d.a)/2+tw(d.s,h25)/2+mm(0.6),c=[dimBox(d,1,0),dimBox(d,-1,0),dimBox(d,1,sh),dimBox(d,1,-sh),dimBox(d,-1,sh),dimBox(d,-1,-sh)],q=put(c);
    d.tx=q.x;d.ty=q.y;d.moved=q!==c[0];
  }
  /* structural grid: the centre lines of the main walls */
  if(o.grid)for(const k of [0,1]){
    const m=new Map(),span=mb[3-k]-mb[1-k];
    for(const w of M.walls){
      const r=rectOf(M,w);if(w.kind!=='col'&&(wallDir(M,w)==='x')===(k===0))continue;
      const v=(r[k]+r[k+2])/2,key=Math.round(v/(maxT/2)),q=m.get(key)||{v,len:0};q.len+=r[3-k]-r[1-k];m.set(key,q);
    }
    const list=[...m.values()].filter(q=>q.len>=0.35*span).sort((a,b)=>a.v-b.v),keep=[];
    for(const q of list)if(!keep.length||q.v-keep[keep.length-1].v>maxT*1.5)keep.push(q);
    const rad=mm(3),a=B[1-k]-mm(margin[k?0:1]+4),b=B[3-k]+mm(margin[k?2:3]+4);
    keep.forEach((q,i)=>L.grid.push({k,v:q.v,a,b,r:rad,label:k?String.fromCharCode(65+i%26):String(i+1)}));
  }
  /* texts kept from the drawing, then notes, room tags and opening tags, each placed clear of the others */
  const R=rooms(M,P),R0=rooms(M,M.P0),labs=new Map();
  M.texts.forEach((t,i)=>{
    if(!roomLabel(t))return;const x=P[2*t.p],y=P[2*t.p+1],r=roomAt(R,x,y);
    if(r&&r.closed){if(o.rt)L.hide.add(i);if(!labs.has(r.id))labs.set(r.id,[]);const bx=textBox(M,t,sc);labs.get(r.id).push({s:t.s,x:t.rot?x:(bx[0]+bx[2])/2,y:t.rot?y:(bx[1]+bx[3])/2});}
  });
  if(o.txt)M.texts.forEach((t,i)=>{
    if(!L.hide.has(i))boxes.push(textBox(M,t,sc));
  });
  if(o.notes)(M.notes||[]).forEach((nt,i)=>{const x=P[2*nt.p],y=P[2*nt.p+1],r=mm(2.6);boxes.push([x-r,y-r,x+r,y+r]);L.notes.push({x,y,r,n:i+1,kind:nt.kind||'note'});});
  for(const sy of M.syms||[]){const x=P[2*sy.p],y=P[2*sy.p+1],q=symRad(M,sy)*0.7;boxes.push([x-q,y-q,x+q,y+q]);}
  if(o.rt)for(const r of R.list){
    if(!r.closed||r.area*u*u<1)continue;
    let ls=labs.get(r.id);
    if(!ls){const x=(r.box[0]+r.box[2])/2,y=(r.box[1]+r.box[3])/2;if(roomAt(R,x,y)!==r)continue;ls=[{s:'',x,y}];}
    ls.forEach((lb,li)=>{
      const lines=[];
      if(lb.s)lines.push({s:lb.s.toUpperCase(),h:mm(3.5),b:1});
      if(ls.length===1){
        const w=r.box[2]-r.box[0],l=r.box[3]-r.box[1],sf=shiftAt(M,lb.x,lb.y),r0=roomAt(R0,lb.x+sf[0],lb.y+sf[1]);
        lines.push({s:fmt(M,w)+' x '+fmt(M,l),h:mm(2.5)});
        if(r0&&r0.closed){const w0=r0.box[2]-r0.box[0],l0=r0.box[3]-r0.box[1];if(Math.abs(w-w0)>e*5||Math.abs(l-l0)>e*5)lines.push({s:'DWG '+fmt(M,w0)+' x '+fmt(M,l0),h:mm(2.5),dev:1});}
      }
      if(li===0)lines.push({s:(r.area*u*u).toFixed(2)+' m2',h:mm(2.5)});
      if(!lines.length)return;
      const W=Math.max(...lines.map(q=>tw(q.s,q.h))),H=lines.reduce((a,q)=>a+q.h*1.4,0),c=[];
      for(const dy of [0,1,-1,2,-2,3,-3])for(const dx of [0,1,-1]){const x=lb.x+dx*W*0.3,y=lb.y+dy*mm(3.5);c.push({x,y,box:[x-W/2,y-H/2,x+W/2,y+H/2]});}
      const q=put(c);L.rtags.push({x:q.x,y:q.y,w:W,h:H,lines});
    });
  }
  if(o.ot){
    const OT=openTags(M);
    for(const q of M.opens){
      const r=rectOf(M,q),k=q.dir==='x'?0:1,T=r[3-k]-r[1-k],c=(r[k]+r[k+2])/2,m=(r[1-k]+r[3-k])/2,rad=mm(2.8),d=T/2+rad+mm(1.2),cs=[];
      const mk=(sg,sh)=>{const al=c+sh,cr=m+sg*d,x=k?cr:al,y=k?al:cr;return {x,y,box:[x-rad,y-rad,x+rad,y+rad]};};
      const in1=mk(1,0),ra=roomAt(R,in1.x,in1.y),first=ra&&ra.closed?1:-1;
      for(const sh of [0,rad*2.2,-rad*2.2,rad*4.4,-rad*4.4])for(const sg of [first,-first])cs.push(mk(sg,sh));
      const p=put(cs);L.otags.push({x:p.x,y:p.y,r:rad,s:OT.tag.get(q.id)||'',hex:q.type==='window'});
    }
  }
  const g=o.grid&&L.grid.length?9:0,m=margin.map(v=>mm(v+2+g)),sb=structBBox(M)||B;
  L.ext=[Math.min(B[0]-m[0],sb[0]-mm(4)),Math.min(B[1]-m[1],sb[1]-mm(4))-mm(14),Math.max(B[2]+m[2],sb[2]+mm(4)),Math.max(B[3]+m[3],sb[3]+mm(4))];
  for(const s of M.syms||[]){const x=P[2*s.p],y=P[2*s.p+1],q=symRad(M,s)+mm(2);L.ext[0]=Math.min(L.ext[0],x-q);L.ext[1]=Math.min(L.ext[1],y-q-mm(14));L.ext[2]=Math.max(L.ext[2],x+q);L.ext[3]=Math.max(L.ext[3],y+q);}
  return L;
}
function dimParts(d,mm){                        // the lines of one dimension: line, two extension lines, two ticks
  const k=d.k,s=d.c>=d.e?1:-1,ov=mm(1.5),t=mm(1),pt=(al,cr)=>k?[cr,al]:[al,cr],A=pt(d.a,d.c),B=pt(d.b,d.c);
  return {line:[A[0],A[1],B[0],B[1]],ext:[[...pt(d.a,d.e),...pt(d.a,d.c+s*ov)],[...pt(d.b,d.e),...pt(d.b,d.c+s*ov)]],
    ticks:[[A[0]-t,A[1]-t,A[0]+t,A[1]+t],[B[0]-t,B[1]-t,B[0]+t,B[1]+t]],o1:pt(d.a,d.e),o2:pt(d.b,d.e),def:B};
}
/* the smallest standard scale, not below the chosen one, at which the sheet fits the paper */
const PAPER={A4:[210,297],A3:[297,420]};
function sheetFit(M,opt){
  const o=outOpt(M,opt),p=PAPER[o.paper]||PAPER.A4,a=p[0]-20,b=p[1]-20,base=M.sc||100;let last=null;
  for(const q of [base,50,100,200,500,1000]){
    if(q<base)continue;
    const L=sheetGeom(M,Object.assign({},o,{sc:q}));if(!L.ext)return {L,sc:q,land:false,paper:o.paper};
    const w=(L.ext[2]-L.ext[0])/paperU(M,1,q),h=(L.ext[3]-L.ext[1])/paperU(M,1,q);
    last={L,sc:q,land:w>h,paper:o.paper,w,h};
    if((w<=a&&h<=b)||(w<=b&&h<=a)){last.land=!(w<=a&&h<=b);return last;}
  }
  return last;
}
const printScale=M=>sheetFit(M).sc;
const lineLayer=c=>c==='src'?null:CLS[c==='wall'?'wall':c==='window'?'window':c].layer;
/* door leaf and swing for doors that have none drawn */
function doorSwings(M,R){
  const out=[],P=M.P;
  for(const o of M.opens){
    if(o.type!=='door')continue;
    const r=rectOf(M,o),k=o.dir==='x'?0:1,W=r[k+2]-r[k],cx=(r[0]+r[2])/2,cy=(r[1]+r[3])/2;
    if(M.arcs.some(a=>Math.hypot(P[2*a[0]]-cx,P[2*a[0]+1]-cy)<W*1.3))continue;
    if(M.segs.some((s,i)=>s[2]&&!s[3]&&M.cls[i]!=='src'&&Math.hypot((P[2*s[0]]+P[2*s[1]])/2-cx,(P[2*s[0]+1]+P[2*s[1]+1])/2-cy)<W*1.3))continue;
    const pt=(al,cr)=>k?[cr,al]:[al,cr],probe=sg=>{const p=pt((r[k]+r[k+2])/2,(sg>0?r[3-k]:r[1-k])+sg*W*0.5),q=roomAt(R,p[0],p[1]);return q&&q.closed?q.area:Infinity;};
    const sg=probe(1)<=probe(-1)?1:-1,f=sg>0?r[3-k]:r[1-k],h=pt(r[k],f),arc=[];
    for(let i=0;i<=12;i++){const a=Math.PI/2*(1-i/12),p=pt(r[k]+W*Math.cos(a),f+sg*W*Math.sin(a));arc.push(p[0],p[1]);}
    out.push({leaf:[h[0],h[1],arc[0],arc[1]],arc});
  }
  return out;
}

/* floors of the closed rooms as rectangles */
function floorRects(R){
  const {xs,ys,nx,ny}=R.G,out=[];
  for(let j=0;j<ny;j++){let i=0;while(i<nx){const c=R.comp[j*nx+i];if(c<0||!R.list[c].closed){i++;continue;}const a=i;while(i<nx&&R.comp[j*nx+i]>=0&&R.list[R.comp[j*nx+i]].closed)i++;out.push([xs[a],ys[j],xs[i],ys[j+1]]);}}
  return out;
}
/* a first furnishing from the room names: each piece goes against a wall that has no opening behind it */
function autoFurnish(M){
  const R=rooms(M),u=UNIT_M[M.unit],maxT=M.th.length?Math.max(...M.th):0.3/u,labs=new Map(),added=[],P=M.P;
  for(const t of M.texts){if(!roomLabel(t))continue;const x=P[2*t.p],y=P[2*t.p+1],r=roomAt(R,x,y);if(r&&r.closed){if(!labs.has(r.id))labs.set(r.id,[]);labs.get(r.id).push({s:t.s,x,y});}}
  const put=(type,x,y,rot)=>{const s={id:M.nid++,p:addPt(M,x,y),type,rot,k:1};M.syms.push(s);added.push(s);};
  const want=s=>/bed/i.test(s)?['bed2']:/living|hall|lounge|drawing/i.test(s)?['sofa']:/dining/i.test(s)?['table']:/toilet|bath|w\.?c/i.test(s)?['wc','basin']:/kitchen/i.test(s)?['sink']:[];
  const O=M.opens.map(o=>rectOf(M,o)),ROT={'1:1':0,'0:-1':90,'1:-1':180,'0:1':270};
  for(const r of R.list){
    const ls=labs.get(r.id);if(!ls)continue;const b=r.box,used={};
    for(const lb of ls)for(const type of want(lb.s)){
      const D=SYM[type],w=D.w/u,d=D.h/u;
      if(ls.length>1){put(type,lb.x+0.6/u,lb.y-d/2-0.5/u,0);continue;}
      for(const sd of [[1,1],[0,-1],[0,1],[1,-1]]){
        const k=sd[0],s=sd[1],a=1-k,key=k+':'+s;if(used[key])continue;
        if(b[a+2]-b[a]<w+0.2/u||b[k+2]-b[k]<d+0.5/u)continue;
        const f=s>0?b[k+2]:b[k],c=(b[a]+b[a+2])/2;
        if(O.some(q=>Math.abs((q[k]+q[k+2])/2-f)<maxT*1.5&&q[a]<c+w/2+0.1/u&&q[a+2]>c-w/2-0.1/u))continue;
        const ck=f-s*(d/2+0.03/u);used[key]=1;put(type,k?c:ck,k?ck:c,ROT[key]);break;
      }
    }
  }
  const pb=planBox(M,massGrid(M),M.sc||100);
  if(pb&&!M.syms.some(s=>s.type==='tree')){const m=pb.mass;put('tree',m[0]-1.7/u,m[1]+1.6/u,0);put('tree',m[2]+1.7/u,m[3]-1.6/u,40);}
  return added.length;
}

/* ---- the drawing as SVG: 'tech' follows the drawing standards, 'pres' is the presentation style ---- */
function planSVG(M,opt,fitted){
  const F=fitted||sheetFit(M,opt);if(!F||!F.L.ext)return '';
  const L=F.L,o=L.o,pres=o.style==='pres',sc=L.sc,mm=v=>paperU(M,v,sc),f=v=>+v.toFixed(3),P=M.P,G=L.G,u=UNIT_M[M.unit];
  const C=pres?{bg:'#efeae4',wall:'#5a3d33',edge:'#4a3129',ink:'#6b4a3e',thin:'#9a8176',floor:'#e4dad2',tile:'#d2c5bb',white:'#fbf8f4',dim:'#7a5c50',red:'#b3261e',soft:'#a9a294',stair:'#f4eee8'}
              :{bg:'#fff',wall:'#c8c8c8',edge:'#000',ink:'#000',thin:'#555',white:'#fff',dim:'#000',red:'#c00',soft:'none',stair:'none'};
  const x0=L.ext[0],y0=L.ext[1],x1=L.ext[2],y1=L.ext[3],X=x=>f(x-x0),Y=y=>f(y1-y);
  const path=(pts,close)=>{let s='';for(let i=0;i<pts.length;i+=2)s+=(i?'L':'M')+X(pts[i])+' '+Y(pts[i+1]);return s+(close?'Z':'');};
  const stroke=(d,lw,col,extra)=>d?'<path d="'+d+'" fill="none" stroke="'+(col||C.ink)+'" stroke-width="'+f(mm(lw))+'" stroke-linejoin="round"'+(/linecap/.test(extra||'')?'':' stroke-linecap="round"')+(extra||'')+'/>':'';
  const fill=(d,col,st,lw)=>d?'<path d="'+d+'" fill="'+col+'"'+(st?' stroke="'+st+'" stroke-width="'+f(mm(lw||0.18))+'" stroke-linejoin="round"':'')+'/>':'';
  const text=(x,y,s,h,q)=>{q=q||{};
    return '<text transform="translate('+X(x)+' '+Y(y)+')'+(q.rot?' rotate('+f(-q.rot)+')':'')+'" y="'+f(h*0.36)+'" font-size="'+f(h*1.18)+'" text-anchor="'+(q.anchor||'middle')+'" fill="'+(q.col||C.ink)+'"'+
      (q.b?' font-weight="700"':'')+(q.halo===0?'':' paint-order="stroke" stroke="'+(q.hc||C.bg)+'" stroke-width="'+f(h*0.3)+'" stroke-linejoin="round"')+'>'+escH(s)+'</text>';};
  const rect=r=>path([r[0],r[1],r[2],r[1],r[2],r[3],r[0],r[3]],true);
  const W=f((x1-x0)/mm(1)),H=f((y1-y0)/mm(1));
  let s='<svg xmlns="http://www.w3.org/2000/svg" class="plan" width="'+W+'mm" height="'+H+'mm" viewBox="0 0 '+f(x1-x0)+' '+f(y1-y0)+'" font-family="Helvetica,Arial,sans-serif">',d='';
  s+='<rect x="0" y="0" width="'+f(x1-x0)+'" height="'+f(y1-y0)+'" fill="'+C.bg+'"/>';
  const R=rooms(M,P);
  if(pres){                                     // tiled floors in every closed room and through the doorways
    const t=0.6/u;
    s+='<defs><pattern id="tile" width="'+f(t)+'" height="'+f(t)+'" patternUnits="userSpaceOnUse"><rect width="'+f(t)+'" height="'+f(t)+'" fill="'+C.floor+'"/><path d="M0 0H'+f(t)+'M0 0V'+f(t)+'" stroke="'+C.tile+'" stroke-width="'+f(mm(0.13))+'" fill="none"/></pattern></defs>';
    d='';for(const q of floorRects(R))d+=rect(q);
    for(const q of M.opens)if(q.type!=='window')d+=rect(rectOf(M,q));
    s+=fill(d,'url(#tile)');
    d='';for(const fl of M.stairs)d+=rect(flightBox(M,fl));s+=fill(d,C.stair);
  }
  /* furniture from the drawing */
  d='';let dw='';
  for(const g of M.decor){
    const cx=g.cx+g.dx,cy=g.cy+g.dy;if(cx<x0||cx>x1||cy<y0||cy>y1)continue;
    for(const p of g.paths){
      const pts=[];for(let i=0;i<p.length;i+=2)pts.push(p[i]+g.dx,p[i+1]+g.dy);
      const n=pts.length,closed=n>=8&&Math.hypot(pts[0]-pts[n-2],pts[1]-pts[n-1])<epsOf(M)*5;
      if(pres&&closed&&Math.max(g.hw,g.hh)*u<2.5)dw+=path(pts,true);else d+=path(pts);
    }
  }
  s+=fill(dw,C.white,C.thin,0.13)+stroke(d,0.13,C.thin);
  for(const c of ['interior','stair','window','line','wall']){
    d='';
    M.segs.forEach((q,i)=>{
      if(q[3]||(M.cls[i]||'line')!==c)return;
      const xa=P[2*q[0]],ya=P[2*q[0]+1],xb=P[2*q[1]],yb=P[2*q[1]+1];d+=path([xa,ya,...(q[2]?bulgeMid(xa,ya,xb,yb,q[2]):[]),xb,yb]);
    });
    if(c==='line')for(const a of M.arcs)d+=path(arcPts(P[2*a[0]],P[2*a[0]+1],a[1],a[2],a[3]));
    s+=stroke(d,pres?Math.min(CLS[c].lw,0.25):CLS[c].lw,pres?(c==='interior'?C.thin:C.ink):C.ink);
  }
  for(const sy of M.syms||[])for(const q of symPaths(M,sy)){
    const p=path(q.pts,q.mode!=='l');
    if(q.mode==='f')s+=fill(p,C.white,pres?C.thin:C.ink,0.18);
    else if(q.mode==='s')s+='<path d="'+p+'" fill="'+C.soft+'"'+(pres?' fill-opacity="0.38"':'')+' stroke="'+(pres?C.soft:C.thin)+'" stroke-width="'+f(mm(0.13))+'"/>';
    else if(q.mode==='d')s+=fill(p,C.ink);
    else s+=stroke(p,0.18,pres?C.thin:C.ink);
  }
  d='';for(const r of pocheRects(G))d+=rect(r);s+=fill(d,C.wall);
  if(pres){d='';for(const q of M.opens)if(q.type==='window')d+=rect(rectOf(M,q));s+=fill(d,C.white);}
  d='';for(const g of winLines(M))d+=path(g);s+=stroke(d,pres?0.18:0.25,C.edge);
  d='';for(const g of outline(G))d+=path(g);s+=stroke(d,pres?0.25:0.5,C.edge,' stroke-linecap="square"');
  d='';for(const q of doorSwings(M,R))d+=path(q.leaf)+path(q.arc);s+=stroke(d,0.18,pres?C.ink:C.ink);
  /* grid */
  for(const g of L.grid){
    const p=(v,c)=>g.k?[c,v]:[v,c],a=p(g.v,g.a),b=p(g.v,g.b),c1=p(g.v,g.a-g.r),c2=p(g.v,g.b+g.r);
    s+=stroke(path([...a,...b]),0.13,pres?C.thin:C.thin,' stroke-dasharray="'+f(mm(6))+' '+f(mm(1.2))+' '+f(mm(0.8))+' '+f(mm(1.2))+'"');
    for(const c of [c1,c2])s+='<circle cx="'+X(c[0])+'" cy="'+Y(c[1])+'" r="'+f(g.r)+'" fill="'+C.bg+'" stroke="'+C.dim+'" stroke-width="'+f(mm(0.25))+'"/>'+text(c[0],c[1],g.label,mm(3.5),{col:C.dim,halo:0});
  }
  /* dimension strings */
  d='';let dt='';
  for(const q of L.dims){const g=dimParts(q,mm);d+=path(g.line)+path(g.ext[0])+path(g.ext[1]);dt+=path(g.ticks[0])+path(g.ticks[1]);}
  s+=stroke(d,0.18,C.dim)+stroke(dt,0.35,C.dim);
  for(const q of L.dims)s+=text(q.tx,q.ty,q.s,mm(2.5),{rot:q.k?90:0,col:C.dim});
  /* texts kept from the drawing */
  if(o.txt)M.texts.forEach((t,i)=>{
    if(L.hide.has(i))return;const h=keptH(M,t,sc),x=P[2*t.p],y=P[2*t.p+1]+(t.va==='middle'?0:t.va==='top'?-h/2:h/2);
    s+=text(x,y,t.s,h,{rot:t.rot,anchor:{left:'start',center:'middle',right:'end'}[t.ha]||'start',halo:0});
  });
  for(const t of L.rtags){
    let y=t.y+t.h/2;
    for(const q of t.lines){y-=q.h*0.7;s+=text(t.x,y,q.s.replace(/ x /g,' × ').replace(/m2$/,'m²'),q.h,{b:q.b,col:q.dev?C.red:C.ink,hc:pres?C.floor:C.bg});y-=q.h*0.7;}
  }
  for(const t of L.otags){
    if(t.hex){const p=[];for(let i=0;i<6;i++){const a=i*Math.PI/3;p.push(t.x+t.r*1.1*Math.cos(a),t.y+t.r*1.1*Math.sin(a));}s+=fill(path(p,true),C.bg,C.dim,0.25);}
    else s+='<circle cx="'+X(t.x)+'" cy="'+Y(t.y)+'" r="'+f(t.r)+'" fill="'+C.bg+'" stroke="'+C.dim+'" stroke-width="'+f(mm(0.25))+'"/>';
    s+=text(t.x,t.y,t.s,mm(2.2),{col:C.dim,halo:0});
  }
  const NC={note:'#0b6bcb',defect:'#c62828',check:'#b45309'};
  for(const t of L.notes){
    const p=[t.x,t.y+t.r*1.25,t.x-t.r*1.15,t.y-t.r*0.75,t.x+t.r*1.15,t.y-t.r*0.75];
    s+=fill(path(p,true),'#fff',NC[t.kind]||NC.note,0.35)+text(t.x,t.y-t.r*0.12,String(t.n),mm(2.2),{col:NC[t.kind]||NC.note,halo:0,b:1});
  }
  /* scale bar and title */
  const one=1/u,bx=L.box[0],nb=(L.box[2]-L.box[0])>=8*one?5:2,by=y0+mm(3),bh=mm(1.2),fs=mm(2.5);
  for(let i=0;i<nb;i++)s+='<rect x="'+X(bx+i*one)+'" y="'+Y(by+bh)+'" width="'+f(one)+'" height="'+f(bh)+'" fill="'+(i%2?C.bg:C.ink)+'" stroke="'+C.ink+'" stroke-width="'+f(mm(0.18))+'"/>';
  s+=text(bx,by+bh+fs,'0',fs,{halo:0})+text(bx+nb*one,by+bh+fs,nb+' m',fs,{halo:0});
  s+=text(bx+(nb+1.2)*one,by+bh/2,'SCALE 1:'+sc,mm(3.5),{anchor:'start',halo:0,b:1});
  s+=text(bx,y0+mm(10.5),(M.name||'Plan').toUpperCase()+(o.date?'  ·  '+o.date:'')+'  ·  DIMENSIONS IN '+duOf(M).toUpperCase(),fs,{anchor:'start',halo:0});
  return s+'</svg>';
}

/* ---- DXF (AutoCAD 2000 format): layers with line weights, real dimensions, solid wall hatch ---- */
function exportDXF(M,opt){
  const F=sheetFit(M,Object.assign({},opt,{style:'tech'})),L=F.L,sc=L.sc,mm=v=>paperU(M,v,sc),P=M.P,G=L.G,u=UNIT_M[M.unit],du=duOf(M);
  let hn=0x30;const H=()=>(hn++).toString(16).toUpperCase();
  let o=[];const w=(...a)=>{for(const v of a)o.push(v);},n=v=>{const s=String(+(+v).toFixed(4));return /[.e]/.test(s)?s:s+'.0';};
  const th=mm(2.5),hMS=H(),hPS=H(),hStd=H(),hIso=H(),hDim=H(),hPH=H(),R=rooms(M,P);
  const layers=[['0',7,-3],['A-WALL',7,50],['A-WALL-PATT',8,13],['A-GLAZ',4,25],['A-DOOR',3,18],['A-FLOR-STRS',2,25],['A-FLOR-CASE',6,18],['A-FLOR-OTLN',7,25],['A-FURN',8,13],['L-PLNT',3,13],
    ['A-GRID',8,18,'CENTER'],['A-ANNO-TEXT',7,25],['A-ANNO-DIMS',3,18],['A-ANNO-IDEN',5,25],['A-ANNO-NOTE',1,25],['A-ANNO-SCHD',7,25],['Defpoints',7,-3]];
  /* entity writers; `own` is the block record the entity belongs to */
  let own=hMS;
  const ent=(t,Ly,sub)=>w(0,t,5,H(),330,own,100,'AcDbEntity',8,Ly,100,sub);
  const line=(Ly,x1,y1,x2,y2)=>{ent('LINE',Ly,'AcDbLine');w(10,n(x1),20,n(y1),30,'0.0',11,n(x2),21,n(y2),31,'0.0');};
  const pline=(Ly,pts,closed,bl)=>{
    ent('LWPOLYLINE',Ly,'AcDbPolyline');w(90,pts.length/2,70,closed?1:0);
    for(let i=0;i<pts.length;i+=2){w(10,n(pts[i]),20,n(pts[i+1]));if(bl&&bl[i/2])w(42,n(bl[i/2]));}
  };
  const circle=(Ly,x,y,r)=>{ent('CIRCLE',Ly,'AcDbCircle');w(10,n(x),20,n(y),30,'0.0',40,n(r));};
  const HA={left:0,center:1,right:2,start:0,middle:1,end:2},VA={alphabetic:0,bottom:1,middle:2,top:3};
  const text=(Ly,x,y,h,s,rot,ha,va)=>{
    const a=HA[ha]||0,v=VA[va]||0;
    ent('TEXT',Ly,'AcDbText');w(10,n(x),20,n(y),30,'0.0',40,n(h),1,String(s).replace(/[\r\n]+/g,' '));
    if(rot)w(50,n(rot));
    w(7,'ISO');if(a)w(72,a);if(a||v)w(11,n(x),21,n(y),31,'0.0');
    w(100,'AcDbText');if(v)w(73,v);
  };
  const tbl=(name,cnt)=>{const h=H();w(0,'TABLE',2,name,5,h,330,0,100,'AcDbSymbolTable',70,cnt);return h;};
  /* blocks for the dimensions are written first into their own lists */
  const dimBlk=L.dims.map((d,i)=>({d,name:'*D'+(i+1),rec:H(),g:dimParts(d,mm)}));
  const main=o;
  w(0,'SECTION',2,'HEADER',9,'$ACADVER',1,'AC1015',9,'$HANDSEED',5,'FFFFF',9,'$INSUNITS',70,{mm:4,cm:5,m:6,in:1,ft:2}[M.unit]||0,9,'$MEASUREMENT',70,1,9,'$LTSCALE',40,n(mm(1)),9,'$LWDISPLAY',290,1,9,'$DIMSTYLE',2,'ISO-25',9,'$TEXTSTYLE',7,'ISO',0,'ENDSEC');
  w(0,'SECTION',2,'CLASSES',0,'CLASS',1,'ACDBDICTIONARYWDFLT',2,'AcDbDictionaryWithDefault',3,'ObjectDBX Classes',90,0,280,0,281,0,0,'CLASS',1,'ACDBPLACEHOLDER',2,'AcDbPlaceHolder',3,'ObjectDBX Classes',90,0,280,0,281,0,0,'ENDSEC',0,'SECTION',2,'TABLES');
  let t=tbl('VPORT',1);const ex=L.ext||[0,0,1,1];
  w(0,'VPORT',5,H(),330,t,100,'AcDbSymbolTableRecord',100,'AcDbViewportTableRecord',2,'*ACTIVE',70,0,10,'0.0',20,'0.0',11,'1.0',21,'1.0',12,n((ex[0]+ex[2])/2),22,n((ex[1]+ex[3])/2),13,'0.0',23,'0.0',14,'10.0',24,'10.0',15,'10.0',25,'10.0',
    16,'0.0',26,'0.0',36,'1.0',17,'0.0',27,'0.0',37,'0.0',40,n((ex[3]-ex[1])*1.1),41,'1.5',42,'50.0',43,'0.0',44,'0.0',50,'0.0',51,'0.0',71,0,72,100,73,1,74,3,75,0,76,0,77,0,78,0,0,'ENDTAB');
  t=tbl('LTYPE',4);
  const lt=(nm,desc,pat)=>{w(0,'LTYPE',5,H(),330,t,100,'AcDbSymbolTableRecord',100,'AcDbLinetypeTableRecord',2,nm,70,0,3,desc,72,65,73,pat.length,40,n(pat.reduce((a,v)=>a+Math.abs(v),0)));for(const v of pat)w(49,n(v),74,0);};
  lt('ByBlock','',[]);lt('ByLayer','',[]);lt('Continuous','Solid line',[]);lt('CENTER','Center ____ _ ____ _',[12,-2.5,1.5,-2.5]);
  w(0,'ENDTAB');
  t=tbl('LAYER',layers.length);
  for(const q of layers){w(0,'LAYER',5,H(),330,t,100,'AcDbSymbolTableRecord',100,'AcDbLayerTableRecord',2,q[0],70,0,62,q[1],6,q[3]||'Continuous');if(q[0]==='Defpoints')w(290,0);w(370,q[2],390,hPH);}
  w(0,'ENDTAB');
  t=tbl('STYLE',2);
  w(0,'STYLE',5,hStd,330,t,100,'AcDbSymbolTableRecord',100,'AcDbTextStyleTableRecord',2,'Standard',70,0,40,'0.0',41,'1.0',50,'0.0',71,0,42,n(th),3,'txt',4,'');
  w(0,'STYLE',5,hIso,330,t,100,'AcDbSymbolTableRecord',100,'AcDbTextStyleTableRecord',2,'ISO',70,0,40,'0.0',41,'1.0',50,'0.0',71,0,42,n(th),3,'isocp.shx',4,'');
  w(0,'ENDTAB');
  tbl('VIEW',0);w(0,'ENDTAB');tbl('UCS',0);w(0,'ENDTAB');
  t=tbl('APPID',1);w(0,'APPID',5,H(),330,t,100,'AcDbSymbolTableRecord',100,'AcDbRegAppTableRecord',2,'ACAD',70,0,0,'ENDTAB');
  t=tbl('DIMSTYLE',1);w(100,'AcDbDimStyleTable');
  w(0,'DIMSTYLE',105,hDim,330,t,100,'AcDbSymbolTableRecord',100,'AcDbDimStyleTableRecord',2,'ISO-25',70,0,40,'1.0',41,n(mm(2)),42,'0.0',43,n(mm(8)),44,n(mm(1.5)),46,'0.0',
    73,0,74,0,77,1,78,8,140,n(th),142,n(mm(1)),144,n(u/UNIT_M[du]),147,n(mm(0.8)),172,1,271,UNIT_DP[du],340,hIso,0,'ENDTAB');
  t=tbl('BLOCK_RECORD',2+dimBlk.length);
  const brec=(h,nm)=>w(0,'BLOCK_RECORD',5,h,330,t,100,'AcDbSymbolTableRecord',100,'AcDbBlockTableRecord',2,nm,340,0);
  brec(hMS,'*Model_Space');brec(hPS,'*Paper_Space');for(const b of dimBlk)brec(b.rec,b.name);
  w(0,'ENDTAB',0,'ENDSEC',0,'SECTION',2,'BLOCKS');
  const blk=(rec,nm,fl,ps,body)=>{
    w(0,'BLOCK',5,H(),330,rec,100,'AcDbEntity');if(ps)w(67,1);w(8,'0',100,'AcDbBlockBegin',2,nm,70,fl,10,'0.0',20,'0.0',30,'0.0',3,nm,1,'');
    if(body){own=rec;body();own=hMS;}
    w(0,'ENDBLK',5,H(),330,rec,100,'AcDbEntity');if(ps)w(67,1);w(8,'0',100,'AcDbBlockEnd');
  };
  blk(hMS,'*Model_Space',0,0);blk(hPS,'*Paper_Space',0,1);
  for(const b of dimBlk)blk(b.rec,b.name,1,0,()=>{
    const g=b.g,d=b.d;line('0',...g.line);line('0',...g.ext[0]);line('0',...g.ext[1]);line('0',...g.ticks[0]);line('0',...g.ticks[1]);
    text('0',d.tx,d.ty,th,d.s,d.k?90:0,'center','middle');
  });
  w(0,'ENDSEC',0,'SECTION',2,'ENTITIES');
  /* walls: outline and one solid hatch */
  for(const g of outline(G))line('A-WALL',g[0],g[1],g[2],g[3]);
  const pr=pocheRects(G);
  if(pr.length){
    ent('HATCH','A-WALL-PATT','AcDbHatch');w(10,'0.0',20,'0.0',30,'0.0',210,'0.0',220,'0.0',230,'1.0',2,'SOLID',70,1,71,0,91,pr.length);
    for(const r of pr){w(92,3,72,0,73,1,93,4);for(const p of [[r[0],r[1]],[r[2],r[1]],[r[2],r[3]],[r[0],r[3]]])w(10,n(p[0]),20,n(p[1]));w(97,0);}
    w(75,0,76,1,98,0);
  }
  for(const g of winLines(M))line('A-GLAZ',g[0],g[1],g[2],g[3]);
  for(const q of doorSwings(M,R)){line('A-DOOR',...q.leaf);pline('A-DOOR',q.arc,false);}
  M.segs.forEach((s,i)=>{
    if(s[3])return;const Ly=lineLayer(M.cls[i]||'line');if(!Ly)return;
    const x1=P[2*s[0]],y1=P[2*s[0]+1],x2=P[2*s[1]],y2=P[2*s[1]+1];
    if(s[2])pline(Ly,[x1,y1,x2,y2],false,[s[2],0]);else line(Ly,x1,y1,x2,y2);
  });
  for(const a of M.arcs){
    if(a[3]-a[2]>=360)circle('A-FLOR-OTLN',P[2*a[0]],P[2*a[0]+1],a[1]);
    else{ent('ARC','A-FLOR-OTLN','AcDbCircle');w(10,n(P[2*a[0]]),20,n(P[2*a[0]+1]),30,'0.0',40,n(a[1]),100,'AcDbArc',50,n(a[2]),51,n(a[3]));}
  }
  for(const g of M.decor)for(const p of g.paths){
    const pts=[];for(let i=0;i<p.length;i+=2)pts.push(p[i]+g.dx,p[i+1]+g.dy);
    if(pts.length===4)line('A-FURN',pts[0],pts[1],pts[2],pts[3]);else if(pts.length>4)pline('A-FURN',pts,false);
  }
  for(const sy of M.syms||[]){const Ly=sy.type==='tree'||sy.type==='plant'?'L-PLNT':'A-FURN';for(const q of symPaths(M,sy))pline(Ly,q.pts,q.mode!=='l');}
  M.texts.forEach((tx,i)=>{if(!L.hide.has(i))text('A-ANNO-TEXT',P[2*tx.p],P[2*tx.p+1],keptH(M,tx,sc),tx.s,tx.rot,tx.ha,tx.va);});
  for(const g of L.grid){
    const p=(v,c)=>g.k?[c,v]:[v,c],a=p(g.v,g.a),b=p(g.v,g.b);line('A-GRID',a[0],a[1],b[0],b[1]);
    for(const c of [p(g.v,g.a-g.r),p(g.v,g.b+g.r)]){circle('A-ANNO-IDEN',c[0],c[1],g.r);text('A-ANNO-IDEN',c[0],c[1],mm(3.5),g.label,0,'center','middle');}
  }
  for(const b of dimBlk){
    const d=b.d,g=b.g;
    ent('DIMENSION','A-ANNO-DIMS','AcDbDimension');
    w(2,b.name,10,n(g.def[0]),20,n(g.def[1]),30,'0.0',11,n(d.tx),21,n(d.ty),31,'0.0',70,32|(d.moved?128:0),71,5,42,n(d.b-d.a),3,'ISO-25',100,'AcDbAlignedDimension',
      13,n(g.o1[0]),23,n(g.o1[1]),33,'0.0',14,n(g.o2[0]),24,n(g.o2[1]),34,'0.0',50,d.k?'90.0':'0.0',100,'AcDbRotatedDimension');
  }
  for(const tg of L.rtags){let y=tg.y+tg.h/2;for(const q of tg.lines){y-=q.h*0.7;text(q.b?'A-ANNO-TEXT':q.dev?'A-ANNO-NOTE':'A-ANNO-IDEN',tg.x,y,q.h,q.s,0,'center','middle');y-=q.h*0.7;}}
  for(const tg of L.otags){
    if(tg.hex){const p=[];for(let i=0;i<6;i++){const a=i*Math.PI/3;p.push(tg.x+tg.r*1.1*Math.cos(a),tg.y+tg.r*1.1*Math.sin(a));}pline('A-ANNO-IDEN',p,true);}else circle('A-ANNO-IDEN',tg.x,tg.y,tg.r);
    text('A-ANNO-IDEN',tg.x,tg.y,mm(2.2),tg.s,0,'center','middle');
  }
  for(const nt of L.notes){pline('A-ANNO-NOTE',[nt.x,nt.y+nt.r*1.25,nt.x-nt.r*1.15,nt.y-nt.r*0.75,nt.x+nt.r*1.15,nt.y-nt.r*0.75],true);text('A-ANNO-NOTE',nt.x,nt.y-nt.r*0.12,mm(2.2),String(nt.n),0,'center','middle');}
  /* schedule and notes beside the plan */
  if(L.ext){
    let x=L.ext[2]+mm(10),y=L.ext[3]-mm(6);const row=mm(5),OT=openTags(M),col=[0,14,34,52,70,88,108].map(v=>mm(v));
    const put=(cells,h)=>{cells.forEach((c,i)=>text('A-ANNO-SCHD',x+col[i],y,h||th,c,0,'left','middle'));y-=row;};
    if(OT.rows.length){
      text('A-ANNO-SCHD',x,y,mm(3.5),'DOOR AND WINDOW SCHEDULE ('+du+')',0,'left','middle');y-=row*1.2;
      put(['TAG','TYPE','WIDTH','HEIGHT','SILL','LINTEL','NOS']);line('A-ANNO-SCHD',x,y+row/2,x+mm(120),y+row/2);
      for(const r of OT.rows)put([r.tag,r.type.toUpperCase(),fmt(M,r.w),fmt(M,r.ht),fmt(M,r.sill),fmt(M,r.lintel),String(r.n)]);
      y-=row;
    }
    if((M.notes||[]).length){
      text('A-ANNO-NOTE',x,y,mm(3.5),'SITE NOTES',0,'left','middle');y-=row*1.2;
      M.notes.forEach((nt,i)=>{text('A-ANNO-NOTE',x,y,th,(i+1)+'. ['+(nt.kind||'note').toUpperCase()+'] '+nt.s,0,'left','middle');y-=row;});
    }
    text('A-ANNO-SCHD',L.box[0],L.ext[1]+mm(4),mm(3.5),'SCALE 1:'+sc+'  -  '+(M.name||'PLAN').toUpperCase()+'  -  DIMENSIONS IN '+du.toUpperCase(),0,'left','middle');
  }
  const hRoot=H(),hGrp=H(),hPSN=H();
  w(0,'ENDSEC',0,'SECTION',2,'OBJECTS',0,'DICTIONARY',5,hRoot,330,0,100,'AcDbDictionary',281,1,3,'ACAD_GROUP',350,hGrp,3,'ACAD_PLOTSTYLENAME',350,hPSN,0,'DICTIONARY',5,hGrp,330,hRoot,100,'AcDbDictionary',281,1,
    0,'ACDBDICTIONARYWDFLT',5,hPSN,330,hRoot,100,'AcDbDictionary',281,1,3,'Normal',350,hPH,100,'AcDbDictionaryWithDefault',340,hPH,0,'ACDBPLACEHOLDER',5,hPH,330,hPSN,0,'ENDSEC',0,'EOF');
  return main.join('\r\n')+'\r\n';
}

/* ---- report (first page: the drawing; then the tables) and CSV ---- */
function reportHTML(M,dateStr,opt){
  const sg=v=>(v>0?'+':'')+fmt(M,v),R=rooms(M),F=sheetFit(M,Object.assign({date:dateStr},opt)),P=PAPER[F.paper]||PAPER.A4;
  let maxDev=0;for(const d of M.dims)maxDev=Math.max(maxDev,Math.abs(dimStatus(M,d).dev));
  let h='<style>@page{size:'+(F.land?P[1]+'mm '+P[0]+'mm':P[0]+'mm '+P[1]+'mm')+';margin:10mm}</style><div class="pg">'+planSVG(M,null,F)+'</div>';
  h+='<h1>'+escH(M.name)+' &ndash; as-built report</h1><p class="meta">'+escH(dateStr)+' &middot; '+M.dims.length+' measurements &middot; largest difference from drawing: '+fmt(M,maxDev)+' '+duOf(M)+
    ' &middot; drawing at 1:'+F.sc+' on '+F.paper+(F.land?' landscape':' portrait')+' when printed at 100%. All dimensions in '+duOf(M)+'.</p>';
  const OT=openTags(M);
  if(OT.rows.length){
    h+='<h2>Door and window schedule</h2><table><tr><th>Tag</th><th>Type</th><th>Nos</th><th>Width</th><th>Height</th><th>Sill</th><th>Lintel</th></tr>';
    for(const r of OT.rows)h+='<tr><td>'+r.tag+'</td><td>'+r.type+'</td><td>'+r.n+'</td><td>'+fmt(M,r.w)+'</td><td>'+fmt(M,r.ht)+'</td><td>'+fmt(M,r.sill)+'</td><td>'+fmt(M,r.lintel)+'</td></tr>';
    h+='</table><p class="meta">Widths are as built. Heights are the site values where they were measured, otherwise the drawing values. Lintel = sill + height, above floor level.</p>';
  }
  if((M.notes||[]).length){
    h+='<h2>Site notes</h2><table><tr><th>No.</th><th>Kind</th><th>Note</th></tr>';
    M.notes.forEach((nt,i)=>h+='<tr><td>'+(i+1)+'</td><td>'+(nt.kind||'note')+'</td><td style="text-align:left">'+escH(nt.s)+'</td></tr>');
    h+='</table>';
  }
  if(M.dims.length){
    h+='<h2>Measurements</h2><table><tr><th>Where</th><th>Drawing</th><th>Site</th><th>Difference</th><th>Status</th><th>Measured as</th></tr>';
    for(const d of M.dims){const st=dimStatus(M,d);h+='<tr><td>'+escH(dimName(M,d,R))+'</td><td>'+fmt(M,st.des)+'</td><td>'+fmt(M,d.site)+'</td><td>'+sg(st.dev)+'</td><td>'+st.status+'</td><td>'+(d.fin?'Finished '+fmt(M,d.raw):'Bare')+'</td></tr>';}
    h+='</table>';
  }
  const rt=roomTable(M);
  if(rt.length){
    h+='<h2>Room areas</h2><table><tr><th>Room</th><th>Drawing (m&sup2;)</th><th>As built (m&sup2;)</th><th>Difference (m&sup2;)</th></tr>';
    for(const r of rt)h+='<tr><td>'+escH(r.name)+'</td><td>'+(r.was==null?'&ndash;':r.was.toFixed(2))+'</td><td>'+r.now.toFixed(2)+'</td><td>'+(r.was==null?'&ndash;':(r.now-r.was>0?'+':'')+(r.now-r.was).toFixed(2))+'</td></tr>';
    h+='</table><p class="meta">Clear floor area between bare wall faces. Rooms that are not fully closed by walls are left out.</p>';
  }
  const bad=M.dims.filter(d=>dimStatus(M,d).bad);
  if(bad.length){
    h+='<h2>Closure check</h2><ul>';
    for(const d of bad){const st=dimStatus(M,d),c=chainFor(M,d);
      h+='<li><b>'+escH(dimName(M,d,R))+'</b>: measured '+fmt(M,d.site)+', plan gives '+fmt(M,st.cur)+' (mismatch '+sg(d.site-st.cur)+').'+(c?' Chain: '+escH(c.text)+'; closure error '+sg(c.err)+'.':'')+'</li>';}
    h+='</ul>';
  }
  if((M.diags||[]).length){
    h+='<h2>Diagonal check</h2><table><tr><th>Room</th><th>Expected</th><th>Diagonal 1</th><th>Diagonal 2</th><th>Out of square</th><th>Size mismatch</th></tr>';
    for(const g of M.diags){const i=diagInfo(M,g);h+='<tr><td>'+escH(g.name)+'</td><td>'+fmt(M,i.exp)+'</td><td>'+fmt(M,g.d1)+'</td><td>'+fmt(M,g.d2)+'</td><td>'+fmt(M,Math.abs(i.off))+'</td><td>'+sg(i.mis)+'</td></tr>';}
    h+='</table><p class="meta">Diagonal 1 runs bottom-left to top-right. Out of square is how far one wall is shifted sideways relative to the opposite wall.</p>';
  }
  return h;
}
function reportCSV(M){
  const q=s=>'"'+String(s).replace(/"/g,'""')+'"',R=rooms(M),rows=[['Where','Drawing ('+duOf(M)+')','Site','Difference','Plan now','Status','Measured as']];
  for(const d of M.dims){const st=dimStatus(M,d);rows.push([dimName(M,d,R),fmt(M,st.des),fmt(M,d.site),fmt(M,st.dev),fmt(M,st.cur),st.status,d.fin?'Finished '+fmt(M,d.raw):'Bare']);}
  const rt=roomTable(M);
  if(rt.length){rows.push([],['Room','Drawing area (m2)','As-built area (m2)','Difference (m2)']);for(const r of rt)rows.push([r.name,r.was==null?'':r.was.toFixed(2),r.now.toFixed(2),r.was==null?'':(r.now-r.was).toFixed(2)]);}
  const OT=openTags(M);
  if(OT.rows.length){rows.push([],['Tag','Type','Nos','Width','Height','Sill','Lintel']);for(const r of OT.rows)rows.push([r.tag,r.type,r.n,fmt(M,r.w),fmt(M,r.ht),fmt(M,r.sill),fmt(M,r.lintel)]);}
  if((M.notes||[]).length){rows.push([],['Note no.','Kind','Note']);M.notes.forEach((nt,i)=>rows.push([i+1,nt.kind||'note',nt.s]));}
  if((M.diags||[]).length){
    rows.push([],['Diagonal check','Expected','Diagonal 1','Diagonal 2','Out of square','Size mismatch']);
    for(const g of M.diags){const i=diagInfo(M,g);rows.push([g.name,fmt(M,i.exp),fmt(M,g.d1),fmt(M,g.d2),fmt(M,Math.abs(i.off)),fmt(M,i.mis)]);}
  }
  return '﻿'+rows.map(r=>r.map(q).join(',')).join('\r\n')+'\r\n';
}

if(typeof module!=='undefined')module.exports={parseDXF,defaultRoles,layerStats,buildModel,makeModel,guessUnit,detectThickness,addJambs,classify,buildObjects,massGrid,outline,pocheRects,rooms,roomAt,roomTable,
  rectOf,wallDir,roomName,probe,hitsAxis,candidates,applyOp,openDims,colDims,dimName,pickAt,splitWall,mergeWalls,neighbours,deleteWall,addOpening,acceptSug,drawWall,setCoord,addPt,lowP,highP,
  dimVal,dimGeom,dimStatus,conflicts,pickCandidate,setDimension,structBBox,nearestRoom,fmt,chainFor,diagInfo,exportDXF,planSVG,reportHTML,reportCSV,printScale,
  stairAt,stairDims,nearestSeg,segGroup,setLineClass,openings,epsOf,UNIT_M,CLS,
  snapAxis,snapPoint,openTags,oSill,oHt,oSillS,oHtS,hDef,SYM,symPaths,symRad,sheetGeom,sheetFit,outOpt,doorSwings,autoFurnish,floorRects,roomLabel};
