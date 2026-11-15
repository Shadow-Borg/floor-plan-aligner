/* =====================================================================
   OBJECTS (no DOM): walls and openings as things you can select and correct.
   A wall piece and an opening are rectangles; each keeps its two corner
   points in M.P, so the same stretch operations move lines and objects.
   ===================================================================== */
const pref=p=>-(p+1);
function rectOf(M,o,P){P=P||M.P;const x0=P[2*o.a],y0=P[2*o.a+1],x1=P[2*o.b],y1=P[2*o.b+1];return [Math.min(x0,x1),Math.min(y0,y1),Math.max(x0,x1),Math.max(y0,y1)];}
const lowP=(M,o,k)=>M.P[2*o.a+k]<=M.P[2*o.b+k]?o.a:o.b;
const highP=(M,o,k)=>M.P[2*o.a+k]<=M.P[2*o.b+k]?o.b:o.a;
const wallDir=(M,w)=>{const r=rectOf(M,w);return (r[2]-r[0])>=(r[3]-r[1])?'x':'y';};
function uniq(a,e){a.sort((p,q)=>p-q);const o=[];for(const v of a)if(!o.length||v-o[o.length-1]>e)o.push(v);return o;}
function nearIdx(a,v){let b=0,bd=Infinity;for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-v);if(d<bd){bd=d;b=i;}}return b;}
/* new geometry is placed on the current plan; its place on the original drawing copies the shift of the nearest wall corner */
function shiftAt(M,x,y){
  let best=-1,bd=Infinity;const P=M.P;
  for(const w of M.walls)for(const p of [w.a,w.b]){const d=Math.abs(P[2*p]-x)+Math.abs(P[2*p+1]-y);if(d<bd){bd=d;best=p;}}
  return best<0?[0,0]:[M.P0[2*best]-P[2*best],M.P0[2*best+1]-P[2*best+1]];
}
function addPt(M,x,y){const s=shiftAt(M,x,y);M.P.push(x,y);M.P0.push(x+s[0],y+s[1]);return M.P.length/2-1;}
function newWall(M,r,kind){const a=addPt(M,r[0],r[1]),b=addPt(M,r[2],r[3]),w={id:M.nid++,a,b,kind:kind||'wall'};M.walls.push(w);return w;}
function newOpen(M,r,dir,type){const a=addPt(M,r[0],r[1]),b=addPt(M,r[2],r[3]),o={id:M.nid++,a,b,dir,type};M.opens.push(o);return o;}
const distRect=(r,x,y)=>Math.hypot(Math.max(r[0]-x,0,x-r[2]),Math.max(r[1]-y,0,y-r[3]));
function inMass(M,x,y,t){for(const w of M.walls){const r=rectOf(M,w);if(x>=r[0]-t&&x<=r[2]+t&&y>=r[1]-t&&y<=r[3]+t)return true;}return false;}
/* original wall and window lines that now lie inside a wall object are kept only for the underlay */
function consumeLines(M){
  const P=M.P,t=epsOf(M)*2;
  M.segs.forEach((q,i)=>{
    if(q[3])return;const c=M.cls[i];if(c!=='wall'&&c!=='window')return;
    const x1=P[2*q[0]],y1=P[2*q[0]+1],x2=P[2*q[1]],y2=P[2*q[1]+1];
    if(inMass(M,x1,y1,t)&&inMass(M,x2,y2,t)&&inMass(M,(x1+x2)/2,(y1+y2)/2,t)){M.cls[i]='src';M.man[i]=1;}
  });
}

/* ---- conversion: recognised lines and fills -> wall pieces, openings and suggestions ---- */
function buildObjects(M){
  const P=M.P,e=epsOf(M),isT=w=>M.th.some(T=>Math.abs(T-w)<=e*2),maxT=M.th.length?Math.max(...M.th):0;
  M.walls=[];M.opens=[];M.sugs=[];
  const TP=M.fills.length&&M.thMain?M.thMain:M.th;       // thicknesses trusted for unhatched strips
  let det=[];try{det=openings(M);}catch(_){}
  const dr=o=>o.k?[o.c1,o.lo,o.c2,o.hi]:[o.lo,o.c1,o.hi,o.c2];
  /* strips: the space between two wall lines one wall thickness apart */
  const H=[],V=[];
  M.segs.forEach((q,i)=>{
    if(q[2]||q[3])return;const c=M.cls[i];if(c!=='wall'&&c!=='window')return;
    const x1=P[2*q[0]],y1=P[2*q[0]+1],x2=P[2*q[1]],y2=P[2*q[1]+1];
    if(Math.abs(y2-y1)<=e&&Math.abs(x2-x1)>e)H.push([y1,Math.min(x1,x2),Math.max(x1,x2)]);
    else if(Math.abs(x2-x1)<=e&&Math.abs(y2-y1)>e)V.push([x1,Math.min(y1,y2),Math.max(y1,y2)]);
  });
  const bands=new Map();
  [H,V].forEach((S,si)=>{
    S.sort((a,b)=>a[0]-b[0]);
    for(let i=0;i<S.length;i++)for(let j=i+1;j<S.length;j++){
      const d=S[j][0]-S[i][0];if(d>maxT+e*2)break;if(!TP.some(T=>Math.abs(T-d)<=e*2))continue;
      const lo=Math.max(S[i][1],S[j][1]),hi=Math.min(S[i][2],S[j][2]);if(hi-lo<=e)continue;
      const key=si+':'+Math.round(S[i][0]/e)+':'+Math.round(S[j][0]/e);
      if(!bands.has(key))bands.set(key,{si,c0:S[i][0],c1:S[j][0],iv:[]});
      bands.get(key).iv.push([lo,hi]);
    }
  });
  const strips=[];
  for(const b of bands.values()){
    b.iv.sort((p,q)=>p[0]-q[0]);let cur=null;
    const out=v=>strips.push(b.si===0?[v[0],b.c0,v[1],b.c1,'x']:[b.c0,v[0],b.c1,v[1],'y']);
    for(const v of b.iv){if(cur&&v[0]<=cur[1]+e)cur[1]=Math.max(cur[1],v[1]);else{if(cur)out(cur);cur=[v[0],v[1]];}}
    if(cur)out(cur);
  }
  /* grid of every x and y that matters; a cell is wall if it is filled, inside a window, or (no fills in the drawing) inside a strip */
  const xa=[],ya=[];
  for(const f of M.fills)for(const p of f)for(const i of p){xa.push(P[2*i]);ya.push(P[2*i+1]);}
  for(const r of strips){xa.push(r[0],r[2]);ya.push(r[1],r[3]);}
  for(const o of det){const r=dr(o);xa.push(r[0],r[2]);ya.push(r[1],r[3]);}
  const xs=uniq(xa,e),ys=uniq(ya,e),nx=xs.length-1,ny=ys.length-1;
  if(nx<1||ny<1)return;
  const solid=new Uint8Array(nx*ny),hasFill=M.fills.length>0,inR=(r,x,y)=>x>r[0]&&x<r[2]&&y>r[1]&&y<r[3];
  const wins=det.filter(o=>o.type==='Window').map(dr);
  for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
    const cx=(xs[i]+xs[i+1])/2,cy=(ys[j]+ys[j+1])/2;
    if(fillAt(M,cx,cy)>=0||wins.some(r=>inR(r,cx,cy))||(!hasFill&&strips.some(r=>inR(r,cx,cy))))solid[j*nx+i]=1;
  }
  /* cut the wall mass into pieces: runs one wall thickness wide become walls that end at junctions; the rest become blocks */
  const asg=new Int32Array(nx*ny).fill(-1),pcs=[];
  const S=(i,j)=>solid[j*nx+i]===1,free=(i,j)=>i>=0&&j>=0&&i<nx&&j<ny&&S(i,j)&&asg[j*nx+i]<0;
  const claim=p=>{for(let j=p.j0;j<p.j1;j++)for(let i=p.i0;i<p.i1;i++)asg[j*nx+i]=p.n;};
  const add=(i0,i1,j0,j1,t)=>{const p={i0,i1,j0,j1,t,n:pcs.length};pcs.push(p);return p;};
  let open=new Map();
  for(let j=0;j<ny;j++){
    const next=new Map();let i=0;
    while(i<nx){
      if(!S(i,j)){i++;continue;}
      const s=i;while(i<nx&&S(i,j))i++;
      if(isT(xs[i]-xs[s])){const key=s+':'+i;let p=open.get(key);if(p)p.j1=j+1;else p=add(s,i,j,j+1,'v');next.set(key,p);}
    }
    open=next;
  }
  pcs.forEach(claim);
  const nv=pcs.length;open=new Map();
  for(let i=0;i<nx;i++){
    const next=new Map();let j=0;
    while(j<ny){
      if(!S(i,j)){j++;continue;}
      const s=j;while(j<ny&&S(i,j))j++;
      let ok=isT(ys[j]-ys[s]);for(let q=s;q<j&&ok;q++)if(asg[q*nx+i]>=0)ok=false;
      if(ok){const key=s+':'+j;let p=open.get(key);if(p)p.i1=i+1;else p=add(i,i+1,s,j,'h');next.set(key,p);}
    }
    open=next;
  }
  for(let n=nv;n<pcs.length;n++)claim(pcs[n]);
  const rowFree=(p,j)=>{for(let i=p.i0;i<p.i1;i++)if(!free(i,j))return false;return true;};
  const colFree=(p,i)=>{for(let j=p.j0;j<p.j1;j++)if(!free(i,j))return false;return true;};
  for(const p of pcs)if(p.t==='v')while(rowFree(p,p.j1)){for(let i=p.i0;i<p.i1;i++)asg[p.j1*nx+i]=p.n;p.j1++;}
  for(const p of pcs)if(p.t==='v')while(rowFree(p,p.j0-1)){p.j0--;for(let i=p.i0;i<p.i1;i++)asg[p.j0*nx+i]=p.n;}
  for(const p of pcs)if(p.t==='h')while(colFree(p,p.i1)){for(let j=p.j0;j<p.j1;j++)asg[j*nx+p.i1]=p.n;p.i1++;}
  for(const p of pcs)if(p.t==='h')while(colFree(p,p.i0-1)){p.i0--;for(let j=p.j0;j<p.j1;j++)asg[j*nx+p.i0]=p.n;}
  open=new Map();const nb=pcs.length;
  for(let j=0;j<ny;j++){
    const next=new Map();let i=0;
    while(i<nx){
      if(!free(i,j)){i++;continue;}
      const s=i;while(i<nx&&free(i,j))i++;
      const key=s+':'+i;let p=open.get(key);if(p)p.j1=j+1;else p=add(s,i,j,j+1,'b');next.set(key,p);
    }
    open=next;
  }
  for(let n=nb;n<pcs.length;n++)claim(pcs[n]);
  for(const p of pcs){
    const r=[xs[p.i0],ys[p.j0],xs[p.i1],ys[p.j1]],w=r[2]-r[0],h=r[3]-r[1];
    newWall(M,r,p.t==='b'&&Math.max(w,h)<2.5*Math.min(w,h)?'col':'wall');
  }
  for(const o of det)if(o.type==='Window')newOpen(M,dr(o),o.k?'x':'y','window');
  /* everything uncertain becomes a suggestion for the user to accept, change or reject */
  const sugR=[],sug=(r,dir,guess)=>{
    for(const q of sugR){const ix=Math.min(r[2],q[2])-Math.max(r[0],q[0]),iy=Math.min(r[3],q[3])-Math.max(r[1],q[1]);
      if(ix>e&&iy>e&&ix*iy>0.5*Math.min((r[2]-r[0])*(r[3]-r[1]),(q[2]-q[0])*(q[3]-q[1])))return;}
    sugR.push(r);M.sugs.push({id:M.nid++,a:addPt(M,r[0],r[1]),b:addPt(M,r[2],r[3]),dir,guess});
  };
  for(const o of det)if(o.type!=='Window')sug(dr(o),o.k?'x':'y',o.type==='Door'?'door':'opening');
  if(hasFill)for(const r of strips){
    const i0=nearIdx(xs,r[0]),i1=nearIdx(xs,r[2]),j0=nearIdx(ys,r[1]),j1=nearIdx(ys,r[3]),dx=r[4]==='x';
    const n0=dx?i0:j0,n1=dx?i1:j1,clear=n=>{for(let m=dx?j0:i0;m<(dx?j1:i1);m++)if(S(dx?n:m,dx?m:n))return false;return true;};
    let n=n0;
    while(n<n1){
      if(!clear(n)){n++;continue;}
      const s=n;while(n<n1&&clear(n))n++;
      const q=dx?[xs[s],r[1],xs[n],r[3]]:[r[0],ys[s],r[2],ys[n]];
      if((dx?q[2]-q[0]:q[3]-q[1])>e*20)sug(q,r[4],'wall');
    }
  }
  consumeLines(M);
}

/* ---- derived geometry: wall mass grid, outline, rooms ---- */
function massGrid(M,P){
  P=P||M.P;const e=epsOf(M),xa=[],ya=[];
  const W=M.walls.map(w=>rectOf(M,w,P)),O=M.opens.map(o=>({r:rectOf(M,o,P),t:o.type}));
  for(const r of W){xa.push(r[0],r[2]);ya.push(r[1],r[3]);}
  for(const o of O){xa.push(o.r[0],o.r[2]);ya.push(o.r[1],o.r[3]);}
  const xs=uniq(xa,e/4),ys=uniq(ya,e/4),nx=Math.max(0,xs.length-1),ny=Math.max(0,ys.length-1),mass=new Uint8Array(nx*ny),hole=new Uint8Array(nx*ny);
  const paint=(r,arr,v,only)=>{const i0=nearIdx(xs,r[0]),i1=nearIdx(xs,r[2]),j0=nearIdx(ys,r[1]),j1=nearIdx(ys,r[3]);
    for(let j=j0;j<j1;j++)for(let i=i0;i<i1;i++)if(!only||only[j*nx+i])arr[j*nx+i]=v;};
  for(const r of W)paint(r,mass,1);
  for(const o of O)paint(o.r,hole,o.t==='window'?2:1,mass);
  return {xs,ys,nx,ny,mass,hole};
}
function outline(G){                         // boundary of the cut wall (mass minus openings) as merged line pieces
  const {xs,ys,nx,ny,mass,hole}=G,out=[],p=(i,j)=>i>=0&&j>=0&&i<nx&&j<ny&&mass[j*nx+i]===1&&hole[j*nx+i]===0;
  for(let i=0;i<=nx;i++){let s=-1;for(let j=0;j<=ny;j++){const on=j<ny&&p(i-1,j)!==p(i,j);if(on&&s<0)s=j;if(!on&&s>=0){out.push([xs[i],ys[s],xs[i],ys[j]]);s=-1;}}}
  for(let j=0;j<=ny;j++){let s=-1;for(let i=0;i<=nx;i++){const on=i<nx&&p(i,j-1)!==p(i,j);if(on&&s<0)s=i;if(!on&&s>=0){out.push([xs[s],ys[j],xs[i],ys[j]]);s=-1;}}}
  return out;
}
function pocheRects(G){                       // the cut wall as few rectangles, for filling
  const {xs,ys,nx,ny,mass,hole}=G,out=[];let open=new Map();
  for(let j=0;j<ny;j++){
    const next=new Map();let i=0;
    while(i<nx){
      if(!(mass[j*nx+i]&&!hole[j*nx+i])){i++;continue;}
      const s=i;while(i<nx&&mass[j*nx+i]&&!hole[j*nx+i])i++;
      const key=s+':'+i;let r=open.get(key);if(r)r[3]=ys[j+1];else{r=[xs[s],ys[j],xs[i],ys[j+1]];out.push(r);}next.set(key,r);
    }
    open=next;
  }
  return out;
}
function winLines(M,P){                       // plan symbol of a window: both faces and the glass line
  const out=[];
  for(const o of M.opens)if(o.type==='window'){
    const r=rectOf(M,o,P);
    if(o.dir==='y')for(const x of [r[0],(r[0]+r[2])/2,r[2]])out.push([x,r[1],x,r[3]]);
    else for(const y of [r[1],(r[1]+r[3])/2,r[3]])out.push([r[0],y,r[2],y]);
  }
  return out;
}
/* rooms: spaces fully closed by walls (openings count as closed) */
function rooms(M,P){
  P=P||M.P;const G=massGrid(M,P),{xs,ys,nx,ny,mass}=G,comp=new Int32Array(nx*ny).fill(-1),list=[];
  for(let j0=0;j0<ny;j0++)for(let i0=0;i0<nx;i0++){
    if(mass[j0*nx+i0]||comp[j0*nx+i0]>=0)continue;
    const id=list.length,st=[[i0,j0]];comp[j0*nx+i0]=id;let area=0,edge=false,x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
    while(st.length){
      const [i,j]=st.pop();area+=(xs[i+1]-xs[i])*(ys[j+1]-ys[j]);
      if(i===0||j===0||i===nx-1||j===ny-1)edge=true;
      x0=Math.min(x0,xs[i]);x1=Math.max(x1,xs[i+1]);y0=Math.min(y0,ys[j]);y1=Math.max(y1,ys[j+1]);
      for(const [a,b] of [[i+1,j],[i-1,j],[i,j+1],[i,j-1]])if(a>=0&&b>=0&&a<nx&&b<ny&&!mass[b*nx+a]&&comp[b*nx+a]<0){comp[b*nx+a]=id;st.push([a,b]);}
    }
    list.push({id,area,closed:!edge,box:[x0,y0,x1,y1],name:null,labels:[]});
  }
  const R={G,comp,list};
  for(const t of M.texts){if(!t.room||t.s.length>24)continue;const r=roomAt(R,P[2*t.p],P[2*t.p+1]);if(r&&r.closed){r.labels.push([t.s,P[2*t.p],P[2*t.p+1]]);if(!r.name)r.name=t.s;}}
  return R;
}
function roomAt(R,x,y){
  const {xs,ys,nx,ny}=R.G;if(!nx||!ny||x<xs[0]||x>xs[nx]||y<ys[0]||y>ys[ny])return null;
  let i=0;while(i<nx-1&&xs[i+1]<x)i++;let j=0;while(j<ny-1&&ys[j+1]<y)j++;
  const c=R.comp[j*nx+i];return c<0?null:R.list[c];
}
/* a space holding several room names (rooms joined by an open gap) is named by the nearest label */
function roomName(r,x,y){if(!r||!r.labels.length)return null;let b=r.labels[0],bd=Infinity;for(const l of r.labels){const d=Math.hypot(l[1]-x,l[2]-y);if(d<bd){bd=d;b=l;}}return b[0];}
function roomTable(M){                        // each named closed room: area on the drawing and as built, in square metres
  const now=rooms(M,M.P),was=rooms(M,M.P0),u=UNIT_M[M.unit]*UNIT_M[M.unit],out=[];
  for(const t of M.texts){
    if(!t.room||t.s.length>24)continue;
    const a=roomAt(now,M.P[2*t.p],M.P[2*t.p+1]),b=roomAt(was,M.P0[2*t.p],M.P0[2*t.p+1]);
    if(a&&a.closed&&a.name===t.s)out.push({name:a.labels.map(l=>l[0]).join(' + '),now:a.area*u,was:b&&b.closed?b.area*u:null});
  }
  return out;
}

/* ---- measuring against objects ---- */
function hitsAxis(M,x,y,k,sign,wallsOnly){     // nearest wall face or blocking line along one axis
  const e=epsOf(M),o=k?y:x,c=k?x:y;let best=null;
  for(const w of M.walls){
    const r=rectOf(M,w),f0=r[k],f1=r[k+2];
    if(c<=r[1-k]+e/2||c>=r[3-k]-e/2)continue;
    let t,low;
    if(sign>0){if(o<f0-e/2){t=f0-o;low=true;}else if(o<f1-e/2){t=f1-o;low=false;}else continue;}
    else{if(o>f1+e/2){t=o-f1;low=false;}else if(o>f0+e/2){t=o-f0;low=true;}else continue;}
    if(!best||t<best.t)best={t,ref:pref(low?lowP(M,w,k):highP(M,w,k)),wall:w,perp:true};
  }
  if(!wallsOnly){const h=rayHits(M,x,y,k?0:sign,k?sign:0,Infinity)[0];if(h&&(!best||h.t<best.t))best={t:h.t,ref:h.seg,wall:null,perp:h.perp};}
  return best;
}
function enclosed(M,x,y){
  if(M.walls&&M.walls.length)return [[0,1],[0,-1],[1,1],[1,-1]].every(d=>!!hitsAxis(M,x,y,d[0],d[1],true));
  return [[1,0],[-1,0],[0,1],[0,-1]].every(d=>rayHits(M,x,y,d[0],d[1],Infinity,{only:'wall'}).length>0);
}
function probe(M,x,y){
  const res=[];
  for(const ax of ['x','y']){
    const k=ax==='x'?0:1,n=hitsAxis(M,x,y,k,-1),p=hitsAxis(M,x,y,k,1);
    if(n&&p&&n.perp&&p.perp)res.push({ax,a:n.ref,b:p.ref,ox:x,oy:y});
  }
  return res;
}
const wallOfRef=(M,ref)=>{if(ref>=0)return null;const p=-ref-1;return M.walls.find(w=>w.a===p||w.b===p)||null;};
const objById=(M,id)=>M.walls.find(w=>w.id===id)||M.opens.find(o=>o.id===id)||null;
/* the stretch of wall mass, along one wall line, that hangs together with this wall */
function stripInterval(M,k,lo,hi,w){
  const e=epsOf(M),iv=[],mine=rectOf(M,w);
  for(const q of M.walls){const r=rectOf(M,q);if(Math.min(r[k+2],hi)-Math.max(r[k],lo)>e)iv.push([r[1-k],r[3-k]]);}
  iv.sort((a,b)=>a[0]-b[0]);
  const has=c=>c&&c[0]<=mine[1-k]+e&&c[1]>=mine[3-k]-e;let cur=null;
  for(const v of iv){if(cur&&v[0]<=cur[1]+e)cur[1]=Math.max(cur[1],v[1]);else{if(has(cur))return cur;cur=[v[0],v[1]];}}
  return has(cur)?cur:[mine[1-k],mine[3-k]];
}
/* the ways a changed size can be taken up */
function candidates(M,d,delta){
  const out=[],k=d.ax==='x'?0:1,e=epsOf(M),P=M.P,A=k?'bottom':'left',B=k?'top':'right';
  if(d.kind==='st'){
    const cur=dimVal(M,d,P),f=(cur+delta)/cur,pts=stairPts(M,d.tr),b=flightBox(M,{tr:d.tr}),lo=k?b[1]:b[0],hi=k?b[3]:b[2];
    out.push({key:'fix-a',rank:0,label:'Keep the '+A+' end fixed',op:{k,scale:f,fixed:lo,pts,move:delta}});
    out.push({key:'fix-b',rank:0.5,label:'Keep the '+B+' end fixed',op:{k,scale:f,fixed:hi,pts,move:delta}});
    return out;
  }
  if(d.kind==='sw'){
    const pts=stairPts(M,d.tr),q=M.segs[d.a],lo=Math.min(P[2*q[0]+k],P[2*q[1]+k]),hi=Math.max(P[2*q[0]+k],P[2*q[1]+k]);
    out.push({key:'side-b',rank:0,label:'Move the '+B+' edge',op:{k,lo:hi-e,hi:hi+e,move:delta,pts}});
    out.push({key:'side-a',rank:0.5,label:'Move the '+A+' edge',op:{k,lo:lo-e,hi:lo+e,move:-delta,pts}});
    return out;
  }
  if(d.kind==='ow'||d.kind==='cw'){          // width of an opening or column: move one side
    const w=d.kind==='ow'?' jamb':' side';
    out.push({key:'side-b',rank:0,label:'Move the '+B+w,op:{k,pts:[-d.b-1],move:delta}});
    out.push({key:'side-a',rank:0.5,label:'Move the '+A+w,op:{k,pts:[-d.a-1],move:-delta}});
    return out;
  }
  if(d.kind==='oo'||d.kind==='co'){          // position of an opening or column: move the whole thing
    const o=objById(M,d.oid);if(!o)return out;
    const onB=-d.b-1===o.a||-d.b-1===o.b;
    out.push({key:'obj',rank:0,label:'Move the '+(d.kind==='oo'?'opening':'column'),op:{k,pts:[o.a,o.b],move:(onB?1:-1)*delta,dr:d.kind==='oo'?rectOf(M,o):null}});
    return out;
  }
  const wa=wallOfRef(M,d.a),wb=wallOfRef(M,d.b),same=wa&&wa===wb;
  for(const side of ['b','a']){
    const sign=side==='b'?1:-1,ref=d[side],face=faceOf(M,P,ref,d.ax),w=side==='b'?wb:wa,W=side==='b'?B:A,off=side==='a'?0.5:0;
    if(w&&!same){
      const r=rectOf(M,w),iv=stripInterval(M,k,r[k],r[k+2],w),out1=sign>0?r[k+2]+e*3:r[k]-e*3,mid=(r[1-k]+r[3-k])/2;
      const ext=!hitsAxis(M,k?mid:out1,k?out1:mid,k,sign,true);
      out.push({key:'wall-'+side,rank:(ext?2:0)+off,label:ext?'Move the '+W+' outer wall':'Move the '+W+' wall, next room absorbs',
        op:{k,lo:r[k]-e,hi:r[k+2]+e,move:sign*delta,k2:true,lo2:iv[0]-e,hi2:iv[1]+e,decor:true}});
    }else if(w){
      const r=rectOf(M,w),thick=(wallDir(M,w)==='x')!==(d.ax==='x'),iv=thick?stripInterval(M,k,r[k],r[k+2],w):[r[1-k],r[3-k]];
      out.push({key:'wall-'+side,rank:3+off,label:'Move the '+W+(thick?' face':' end')+' of this wall',
        op:{k,lo:face-e,hi:face+e,move:sign*delta,k2:true,lo2:iv[0]-e,hi2:iv[1]+e}});
    }else if(ref>=0){
      const q=M.segs[ref],u=P[2*q[0]+1-k],v=P[2*q[1]+1-k];
      out.push({key:'wall-'+side,rank:6+off,label:'Move the '+W+' line',op:{k,lo:face-e,hi:face+e,move:sign*delta,k2:true,lo2:Math.min(u,v)-e,hi2:Math.max(u,v)+e}});
    }
    out.push({key:'shift-'+side,rank:4+off,label:'Shift everything on the '+W+' side',op:{k,lo:sign>0?face-e:-Infinity,hi:sign>0?Infinity:face+e,move:sign*delta}});
  }
  return out;
}
/* a stair moves as one piece: each flight, with the lines that belong to it, follows its own centre */
function stairBodies(M){
  const P=M.P,fl=(M.stairs||[]).map(f=>{const b=flightBox(M,f);return {b,c:[(b[0]+b[2])/2,(b[1]+b[3])/2],pts:new Set()};});
  if(!fl.length)return fl;
  M.segs.forEach((q,i)=>{
    if(q[3]||M.cls[i]!=='stair')return;
    const x=(P[2*q[0]]+P[2*q[1]])/2,y=(P[2*q[0]+1]+P[2*q[1]+1])/2;let best=fl[0],bd=Infinity;
    for(const f of fl){const d=distRect(f.b,x,y);if(d<bd){bd=d;best=f;}}
    best.pts.add(q[0]);best.pts.add(q[1]);
  });
  return fl;
}
function applyOp(M,P,op,withDecor){
  const k=op.k;
  if(op.pts){
    for(const p of op.pts){const i=2*p+k,v=P[i];if(op.scale!=null)P[i]=op.fixed+(v-op.fixed)*op.scale;else if(op.lo==null||(v>=op.lo&&v<=op.hi))P[i]=v+op.move;}
    if(withDecor&&op.dr)for(const g of M.decor){const x=g.cx+g.dx,y=g.cy+g.dy,m=Math.max(op.dr[2]-op.dr[0],op.dr[3]-op.dr[1]);
      if(distRect(op.dr,x,y)<=m){if(k)g.dy+=op.move;else g.dx+=op.move;}}
    return;
  }
  const o=k?-1:1,bodies=stairBodies(M),rigid=new Set();
  for(const b of bodies){
    for(const p of b.pts)rigid.add(p);
    if(b.c[k]<op.lo||b.c[k]>op.hi||(op.k2&&(b.c[1-k]<op.lo2||b.c[1-k]>op.hi2)))continue;
    for(const p of b.pts)P[2*p+k]+=op.move;
  }
  for(let i=k;i<P.length;i+=2){
    const v=P[i];if(v<op.lo||v>op.hi||(rigid.size&&rigid.has((i-k)/2)))continue;
    if(op.k2){const u=P[i+o];if(u<op.lo2||u>op.hi2)continue;}
    P[i]=v+op.move;
  }
  if(withDecor&&(!op.k2||op.decor))for(const g of M.decor){
    const c=k?g.cy+g.dy:g.cx+g.dx;if(c<op.lo||c>op.hi)continue;
    if(op.k2){const cc=k?g.cx+g.dx:g.cy+g.dy,hc=k?g.hw:g.hh;if(cc+hc<op.lo2||cc-hc>op.hi2)continue;}
    if(k)g.dy+=op.move;else g.dx+=op.move;
  }
}
/* sizes offered when an opening or a column is tapped */
function openDims(M,o,side){
  const e=epsOf(M),r=rectOf(M,o),ax=o.dir,k=ax==='x'?0:1,T=r[3-k]-r[1-k],cross=side>0?r[3-k]+T*1.3:r[1-k]-T*1.3,c0=side>0?r[3-k]+e*20:r[1-k]-e*20;
  const pt=(c,cr)=>k?[cr,c]:[c,cr],mid=pt((r[k]+r[k+2])/2,cross),nm=o.type[0].toUpperCase()+o.type.slice(1),room=nearestRoom(M,mid[0],mid[1]),sfx=room?' ('+room+')':'';
  const out=[{kind:'ow',ax,a:pref(lowP(M,o,k)),b:pref(highP(M,o,k)),oid:o.id,ox:mid[0],oy:mid[1],pk:2,name:nm+' width'+sfx}];
  const p1=pt(r[k],c0),h1=hitsAxis(M,p1[0],p1[1],k,-1);
  if(h1&&h1.perp&&h1.t>e*2)out.push({kind:'oo',ax,a:h1.ref,b:pref(lowP(M,o,k)),oid:o.id,ox:mid[0],oy:mid[1],pk:0,name:nm+' from '+(k?'bottom':'left')+' corner'+sfx});
  const p2=pt(r[k+2],c0),h2=hitsAxis(M,p2[0],p2[1],k,1);
  if(h2&&h2.perp&&h2.t>e*2)out.push({kind:'oo',ax,a:pref(highP(M,o,k)),b:h2.ref,oid:o.id,ox:mid[0],oy:mid[1],pk:0,name:nm+' from '+(k?'top':'right')+' corner'+sfx});
  return out;
}
function colDims(M,w){
  const e=epsOf(M),r=rectOf(M,w),xm=(r[0]+r[2])/2,ym=(r[1]+r[3])/2,out=[];
  out.push({kind:'cw',ax:'x',a:pref(lowP(M,w,0)),b:pref(highP(M,w,0)),oid:w.id,ox:xm,oy:ym,pk:-2,name:'Column size ↔'});
  out.push({kind:'cw',ax:'y',a:pref(lowP(M,w,1)),b:pref(highP(M,w,1)),oid:w.id,ox:xm,oy:ym,pk:-2,name:'Column size ↕'});
  const off=(x,y,k,sign,word)=>{
    const h=hitsAxis(M,x,y,k,sign);if(!h||!h.perp||h.t<=e*2)return;
    const me=pref(sign>0?highP(M,w,k):lowP(M,w,k));
    out.push({kind:'co',ax:k?'y':'x',a:sign>0?me:h.ref,b:sign>0?h.ref:me,oid:w.id,ox:xm,oy:ym,pk:2,name:'Column from '+word});
  };
  off(r[0]-e,ym,0,-1,'left');off(r[2]+e,ym,0,1,'right');off(xm,r[1]-e,1,-1,'bottom');off(xm,r[3]+e,1,1,'top');
  return out;
}
function dimName(M,d,R){
  if(d.name)return d.name;
  const wa=wallOfRef(M,d.a),wb=wallOfRef(M,d.b);
  if(wa&&wa===wb)return (wallDir(M,wa)==='x')!==(d.ax==='x')?'Wall thickness':'Wall length';
  const g=dimGeom(M,d),x=(g[0]+g[2])/2,y=(g[1]+g[3])/2,r=R?roomAt(R,x,y):null;
  return (roomName(r,x,y)||nearestRoom(M,x,y)||'Space')+(d.ax==='x'?' ↔':' ↕');
}

/* ---- correcting the drawing (these change the plan and the stored drawing together) ---- */
function pickAt(M,x,y,rad,show){               // everything within finger reach of a point, best first
  const hits=[];
  for(const o of M.opens){const d=distRect(rectOf(M,o),x,y);if(d<=rad)hits.push({t:'open',o,d,pr:0});}
  for(const s of M.sugs){const d=distRect(rectOf(M,s),x,y);if(d<=rad)hits.push({t:'sug',o:s,d,pr:1});}
  for(const w of M.walls){const d=distRect(rectOf(M,w),x,y);if(d<=rad)hits.push({t:'wall',o:w,d,pr:2});}
  const sg=nearestSeg(M,x,y,rad);
  if(sg>=0&&(!show||show(M.cls[sg])))hits.push({t:'line',o:sg,d:ptSeg(x,y,M.P[2*M.segs[sg][0]],M.P[2*M.segs[sg][0]+1],M.P[2*M.segs[sg][1]],M.P[2*M.segs[sg][1]+1]),pr:3});
  hits.sort((a,b)=>(a.d>0)-(b.d>0)||a.pr-b.pr||a.d-b.d);
  return hits;
}
function setCoord(M,p,k,v){const d=v-M.P[2*p+k];M.P[2*p+k]+=d;M.P0[2*p+k]+=d;}
function splitWall(M,w,x,y){
  const k=wallDir(M,w)==='x'?0:1,r=rectOf(M,w),pos=k?y:x,e=epsOf(M);
  if(pos<=r[k]+e*20||pos>=r[k+2]-e*20)return null;
  const hi=highP(M,w,k),lo=lowP(M,w,k),f=(pos-r[k])/(r[k+2]-r[k]),pos0=M.P0[2*lo+k]+f*(M.P0[2*hi+k]-M.P0[2*lo+k]);
  const mk=(src)=>{M.P.push(M.P[2*src],M.P[2*src+1]);M.P0.push(M.P0[2*src],M.P0[2*src+1]);const p=M.P.length/2-1;M.P[2*p+k]=pos;M.P0[2*p+k]=pos0;return p;};
  const endLow=mk(hi),startHigh=mk(lo);      // new end of the first piece, new start of the second
  const w2={id:M.nid++,a:startHigh,b:hi,kind:w.kind};
  if(w.a===hi)w.a=endLow;else w.b=endLow;
  M.walls.splice(M.walls.indexOf(w)+1,0,w2);
  return w2;
}
function mergeable(M,w,q){
  if(w===q||w.kind!==q.kind)return -1;
  const e=epsOf(M)*2,a=rectOf(M,w),b=rectOf(M,q);
  for(const k of [0,1])if(Math.abs(a[1-k]-b[1-k])<=e&&Math.abs(a[3-k]-b[3-k])<=e&&Math.min(a[k+2],b[k+2])-Math.max(a[k],b[k])>=-e)return k;
  return -1;
}
const neighbours=(M,w)=>M.walls.filter(q=>mergeable(M,w,q)>=0);
function mergeWalls(M,w,q){
  const k=mergeable(M,w,q);if(k<0)return null;
  const lo=rectOf(M,w)[k]<=rectOf(M,q)[k]?w:q,hi=lo===w?q:w;
  if(rectOf(M,hi)[k+2]>rectOf(M,lo)[k+2]){const pl=highP(M,lo,k),ph=highP(M,hi,k);if(lo.a===pl)lo.a=ph;else lo.b=ph;}
  M.walls.splice(M.walls.indexOf(hi),1);
  return lo;
}
function deleteWall(M,w){
  const r=rectOf(M,w);M.walls.splice(M.walls.indexOf(w),1);
  M.opens=M.opens.filter(o=>{const q=rectOf(M,o),x=(q[0]+q[2])/2,y=(q[1]+q[3])/2;return !(x>=r[0]&&x<=r[2]&&y>=r[1]&&y<=r[3])||inMass(M,x,y,0);});
}
function addOpening(M,w,x,y,type){
  const k=wallDir(M,w)==='x'?0:1,r=rectOf(M,w),u=UNIT_M[M.unit],len=r[k+2]-r[k],m=Math.min(0.05/u,len*0.1);
  let wd=({door:0.9,window:1.2,opening:1.0}[type]||0.9)/u;if(wd>len-2*m)wd=len*0.6;
  const c=Math.max(r[k]+m,Math.min(r[k+2]-m-wd,(k?y:x)-wd/2));
  return newOpen(M,k?[r[0],c,r[2],c+wd]:[c,r[1],c+wd,r[3]],k?'y':'x',type);
}
function autoMerge(M,w){let n=0;for(const q of neighbours(M,w)){if(M.walls.indexOf(w)<0||n++>1)break;const m=mergeWalls(M,w,q);if(m)w=m;}return w;}
function acceptSug(M,s,as){
  M.sugs.splice(M.sugs.indexOf(s),1);
  if(as==='none')return null;
  const r=rectOf(M,s);let w={id:M.nid++,a:s.a,b:s.b,kind:'wall'};M.walls.push(w);
  let o=null;if(as!=='wall')o=newOpen(M,r,s.dir,as);
  autoMerge(M,w);consumeLines(M);
  return o||w;
}
function drawWall(M,x1,y1,x2,y2){               // a new wall between two tapped points, lined up with a wall it starts from
  const e=epsOf(M),u=UNIT_M[M.unit],k=Math.abs(x2-x1)>=Math.abs(y2-y1)?0:1,T=M.th.length?M.th.slice().sort((a,b)=>b-a)[0]:0.23/u;
  let c=k?x1:y1,lo=c-T/2,hi=c+T/2,a=Math.min(k?y1:x1,k?y2:x2),b=Math.max(k?y1:x1,k?y2:x2);
  for(const w of M.walls){const r=rectOf(M,w);if((wallDir(M,w)==='x')===(k===0)&&c>=r[1-k]-T&&c<=r[3-k]+T&&a<=r[k+2]+T*2&&b>=r[k]-T*2){lo=r[1-k];hi=r[3-k];break;}}
  const tol=0.1/u,snap=v=>{let best=v,bd=tol;for(const w of M.walls){const r=rectOf(M,w);if(r[3-k]<lo-e||r[1-k]>hi+e)continue;for(const f of [r[k],r[k+2]])if(Math.abs(f-v)<bd){bd=Math.abs(f-v);best=f;}}return best;};
  a=snap(a);b=snap(b);if(b-a<=e*20)return null;
  const w=newWall(M,k?[lo,a,hi,b]:[a,lo,b,hi],'wall');consumeLines(M);
  return w;
}

/* ---- output to the drawing standards, generated from the objects ---- */
function printScale(M){
  const b=structBBox(M);let sc=M.sc||100;if(!b)return sc;
  const u=UNIT_M[M.unit]*1000;
  for(const q of [sc,100,200,500,1000]){if(q<sc)continue;sc=q;if(((b[2]-b[0])*u/q+16)<=180&&((b[3]-b[1])*u/q+28)<=215)break;}
  return sc;
}
const lineLayer=c=>c==='src'?null:CLS[c==='wall'?'wall':c==='window'?'window':c].layer;
function exportDXF(M){
  const o=[],w=(...a)=>{for(const v of a)o.push(v);},n=v=>String(+(+v).toFixed(4)),P=M.P,th=paperU(M,2.5),tk=paperU(M,1),G=massGrid(M);
  const layers=[['A-WALL',7],['A-WALL-PATT',8],['A-GLAZ',4],['A-FLOR-STRS',2],['A-FLOR-CASE',6],['A-FLOR-OTLN',7],['A-FURN',8],['A-ANNO-TEXT',7],['A-ANNO-DIMS',3],['A-ANNO-DIMS-DEVN',1],['A-ANNO-NOTE-DIAG',5]];
  w(0,'SECTION',2,'HEADER',9,'$ACADVER',1,'AC1009',0,'ENDSEC');
  w(0,'SECTION',2,'TABLES',0,'TABLE',2,'LTYPE',70,1,0,'LTYPE',2,'CONTINUOUS',70,0,3,'Solid line',72,65,73,0,40,'0.0',0,'ENDTAB');
  w(0,'TABLE',2,'LAYER',70,layers.length);
  for(const [nm,c] of layers)w(0,'LAYER',2,nm,70,0,62,c,6,'CONTINUOUS');
  w(0,'ENDTAB',0,'TABLE',2,'STYLE',70,1,0,'STYLE',2,'ISO',70,0,40,'0.0',41,'1.0',50,'0.0',71,0,42,n(th),3,'isocp.shx',4,'',0,'ENDTAB');
  w(0,'ENDSEC',0,'SECTION',2,'ENTITIES');
  const line=(L,x1,y1,x2,y2)=>w(0,'LINE',8,L,10,n(x1),20,n(y1),11,n(x2),21,n(y2));
  const pline=(L,pts,closed,bl)=>{
    w(0,'POLYLINE',8,L,66,1,10,'0.0',20,'0.0',30,'0.0',70,closed?1:0);
    for(let i=0;i<pts.length;i+=2){w(0,'VERTEX',8,L,10,n(pts[i]),20,n(pts[i+1]));if(bl&&bl[i/2])w(42,n(bl[i/2]));}
    w(0,'SEQEND',8,L);
  };
  const HA={left:0,center:1,right:2},VA={alphabetic:0,bottom:1,middle:2,top:3};
  const text=(L,x,y,h,s,rot,ha,va)=>{
    w(0,'TEXT',8,L,7,'ISO',10,n(x),20,n(y),40,n(h),1,String(s).replace(/[\r\n]+/g,' '));
    if(rot)w(50,n(rot));
    const a=HA[ha]||0,v=VA[va]||0;
    if(a||v)w(72,a,73,v,11,n(x),21,n(y));
  };
  for(const g of outline(G))line('A-WALL',g[0],g[1],g[2],g[3]);
  for(const r of pocheRects(G))pline('A-WALL-PATT',[r[0],r[1],r[2],r[1],r[2],r[3],r[0],r[3]],true);
  for(const g of winLines(M))line('A-GLAZ',g[0],g[1],g[2],g[3]);
  M.segs.forEach((s,i)=>{
    if(s[3])return;const L=lineLayer(M.cls[i]||'line');if(!L)return;
    const x1=P[2*s[0]],y1=P[2*s[0]+1],x2=P[2*s[1]],y2=P[2*s[1]+1];
    if(s[2])pline(L,[x1,y1,x2,y2],false,[s[2],0]);else line(L,x1,y1,x2,y2);
  });
  for(const a of M.arcs){
    if(a[3]-a[2]>=360)w(0,'CIRCLE',8,'A-FLOR-OTLN',10,n(P[2*a[0]]),20,n(P[2*a[0]+1]),40,n(a[1]));
    else w(0,'ARC',8,'A-FLOR-OTLN',10,n(P[2*a[0]]),20,n(P[2*a[0]+1]),40,n(a[1]),50,n(a[2]),51,n(a[3]));
  }
  for(const g of M.decor)for(const p of g.paths){
    const pts=[];for(let i=0;i<p.length;i+=2)pts.push(p[i]+g.dx,p[i+1]+g.dy);
    if(pts.length===4)line('A-FURN',pts[0],pts[1],pts[2],pts[3]);else if(pts.length>4)pline('A-FURN',pts,false);
  }
  for(const t of M.texts)text('A-ANNO-TEXT',P[2*t.p],P[2*t.p+1],textH(M,t),t.s,t.rot,t.ha,t.va);
  for(const d of M.dims){
    const g=dimGeom(M,d),st=dimStatus(M,d),L=st.bad||st.devd?'A-ANNO-DIMS-DEVN':'A-ANNO-DIMS';
    line(L,g[0],g[1],g[2],g[3]);line(L,g[0]-tk,g[1]-tk,g[0]+tk,g[1]+tk);line(L,g[2]-tk,g[3]-tk,g[2]+tk,g[3]+tk);
    if(d.ax==='x')text(L,(g[0]+g[2])/2,g[1]+th*0.4,th,st.label,0,'center','bottom');
    else text(L,g[0]-th*0.4,(g[1]+g[3])/2,th,st.label,90,'center','bottom');
  }
  for(const g of M.diags||[]){
    const r=diagRect(M,g),i=diagInfo(M,g);
    line('A-ANNO-NOTE-DIAG',r[0],r[1],r[2],r[3]);line('A-ANNO-NOTE-DIAG',r[0],r[3],r[2],r[1]);
    text('A-ANNO-NOTE-DIAG',(r[0]+r[2])/2,(r[1]+r[3])/2+th*1.2,th,'DIAGONALS '+fmt(M,g.d1)+' / '+fmt(M,g.d2)+' - '+i.label.toUpperCase(),0,'center','bottom');
  }
  w(0,'ENDSEC',0,'EOF');
  return o.join('\r\n')+'\r\n';
}
function planSVG(M){
  const P=M.P,b=structBBox(M);if(!b)return '';
  const sc=printScale(M),mm=v=>paperU(M,v,sc),f=v=>+v.toFixed(3),G=massGrid(M);
  const m=mm(8),x0=b[0]-m,y0=b[1]-m-mm(12),x1=b[2]+m,y1=b[3]+m,fs=mm(2.5);
  const X=x=>f(x-x0),Y=y=>f(y1-y);
  const path=(pts,close)=>{let s='';for(let i=0;i<pts.length;i+=2)s+=(i?'L':'M')+X(pts[i])+' '+Y(pts[i+1]);return s+(close?'Z':'');};
  const stroke=(d,lw,col,extra)=>d?'<path d="'+d+'" fill="none" stroke="'+(col||'#000')+'" stroke-width="'+f(mm(lw))+'" stroke-linejoin="round" stroke-linecap="square"'+(extra||'')+'/>':'';
  let s='<svg xmlns="http://www.w3.org/2000/svg" class="plan" width="'+f((x1-x0)/mm(1))+'mm" height="'+f((y1-y0)/mm(1))+'mm" viewBox="0 0 '+f(x1-x0)+' '+f(y1-y0)+'" font-family="ISOCPEUR,\'Arial Narrow\',Arial,sans-serif">',d='';
  for(const r of pocheRects(G))d+=path([r[0],r[1],r[2],r[1],r[2],r[3],r[0],r[3]],true);
  if(d)s+='<path d="'+d+'" fill="#c8c8c8"/>';
  d='';
  for(const g of M.decor){
    const cx=g.cx+g.dx,cy=g.cy+g.dy;if(cx<x0||cx>x1||cy<y0||cy>y1)continue;
    for(const p of g.paths){const pts=[];for(let i=0;i<p.length;i+=2)pts.push(p[i]+g.dx,p[i+1]+g.dy);d+=path(pts);}
  }
  s+=stroke(d,0.13,'#666');
  for(const c of ['interior','stair','window','line','wall']){
    d='';
    M.segs.forEach((q,i)=>{
      if(q[3]||(M.cls[i]||'line')!==c)return;
      const xa=P[2*q[0]],ya=P[2*q[0]+1],xb=P[2*q[1]],yb=P[2*q[1]+1];d+=path([xa,ya,...(q[2]?bulgeMid(xa,ya,xb,yb,q[2]):[]),xb,yb]);
    });
    if(c==='line')for(const a of M.arcs)d+=path(arcPts(P[2*a[0]],P[2*a[0]+1],a[1],a[2],a[3]));
    s+=stroke(d,CLS[c].lw);
  }
  d='';for(const g of winLines(M))d+=path(g);s+=stroke(d,0.25);
  d='';for(const g of outline(G))d+=path(g);s+=stroke(d,0.5);
  for(const t of M.texts){
    const x=X(P[2*t.p]),y=Y(P[2*t.p+1]);
    s+='<text x="'+x+'" y="'+y+'" font-size="'+f(textH(M,t,sc))+'" text-anchor="'+({left:'start',center:'middle',right:'end'}[t.ha]||'start')+
      '" dominant-baseline="'+({top:'hanging',middle:'central',bottom:'text-after-edge'}[t.va]||'alphabetic')+'"'+(t.rot?' transform="rotate('+f(-t.rot)+' '+x+' '+y+')"':'')+'>'+escH(t.s)+'</text>';
  }
  const label=(x,y,txt,rot,col)=>'<text x="'+X(x)+'" y="'+Y(y)+'" font-size="'+f(fs)+'" fill="'+(col||'#000')+'" text-anchor="middle"'+(rot?' transform="rotate(-90 '+X(x)+' '+Y(y)+')"':'')+'>'+escH(txt)+'</text>';
  for(const g of M.diags||[]){
    const r=diagRect(M,g),i=diagInfo(M,g);
    s+=stroke(path([r[0],r[1],r[2],r[3]])+path([r[0],r[3],r[2],r[1]]),0.18,'#000',' stroke-dasharray="'+f(mm(2))+' '+f(mm(1))+'"')+label((r[0]+r[2])/2,(r[1]+r[3])/2+fs*1.6,'DIAGONALS '+fmt(M,g.d1)+' / '+fmt(M,g.d2)+' - '+i.label.toUpperCase());
  }
  const tk=mm(1);
  for(const q of M.dims){
    const g=dimGeom(M,q),st=dimStatus(M,q),col=st.bad?'#c00':'#000';
    s+=stroke(path(g),0.18,col)+stroke(path([g[0]-tk,g[1]-tk,g[0]+tk,g[1]+tk])+path([g[2]-tk,g[3]-tk,g[2]+tk,g[3]+tk]),0.35,col);
    s+=q.ax==='x'?label((g[0]+g[2])/2,g[1]+mm(0.8),st.label,false,col):label(g[0]-mm(0.8),(g[1]+g[3])/2,st.label,true,col);
  }
  const one=1/UNIT_M[M.unit],nb=(b[2]-b[0])>=8*one?5:2,by=b[1]-m-mm(5),bh=mm(1.2);
  for(let i=0;i<nb;i++)s+='<rect x="'+X(b[0]+i*one)+'" y="'+Y(by+bh)+'" width="'+f(one)+'" height="'+f(bh)+'" fill="'+(i%2?'#fff':'#000')+'" stroke="#000" stroke-width="'+f(mm(0.18))+'"/>';
  s+='<text x="'+X(b[0])+'" y="'+Y(by-fs*1.2)+'" font-size="'+f(fs)+'">0</text><text x="'+X(b[0]+nb*one)+'" y="'+Y(by-fs*1.2)+'" font-size="'+f(fs)+'" text-anchor="middle">'+nb+' m</text>';
  s+='<text x="'+X(b[0]+(nb+1.2)*one)+'" y="'+Y(by)+'" font-size="'+f(mm(3.5))+'">SCALE 1:'+sc+'</text>';
  return s+'</svg>';
}
function reportHTML(M,dateStr){
  const sg=v=>(v>0?'+':'')+fmt(M,v),R=rooms(M);
  let maxDev=0;for(const d of M.dims)maxDev=Math.max(maxDev,Math.abs(dimStatus(M,d).dev));
  let h='<h1>'+escH(M.name)+' &ndash; as-built report</h1><p class="meta">'+escH(dateStr)+' &middot; '+M.dims.length+' measurements &middot; largest difference from drawing: '+fmt(M,maxDev)+' '+duOf(M)+'</p>';
  h+=planSVG(M);
  h+='<p class="meta">Scale 1:'+printScale(M)+' when printed at 100% on A4. All dimensions in '+duOf(M)+'. Site dimensions show the measured value, with the difference from the drawing in brackets. Red: the plan does not match this site value.</p>';
  h+='<h2>Measurements</h2><table><tr><th>Where</th><th>Drawing</th><th>Site</th><th>Difference</th><th>Status</th><th>Measured as</th></tr>';
  for(const d of M.dims){const st=dimStatus(M,d);h+='<tr><td>'+escH(dimName(M,d,R))+'</td><td>'+fmt(M,st.des)+'</td><td>'+fmt(M,d.site)+'</td><td>'+sg(st.dev)+'</td><td>'+st.status+'</td><td>'+(d.fin?'Finished '+fmt(M,d.raw):'Bare')+'</td></tr>';}
  h+='</table>';
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
  if((M.diags||[]).length){
    rows.push([],['Diagonal check','Expected','Diagonal 1','Diagonal 2','Out of square','Size mismatch']);
    for(const g of M.diags){const i=diagInfo(M,g);rows.push([g.name,fmt(M,i.exp),fmt(M,g.d1),fmt(M,g.d2),fmt(M,Math.abs(i.off)),fmt(M,i.mis)]);}
  }
  return '﻿'+rows.map(r=>r.map(q).join(',')).join('\r\n')+'\r\n';
}
/* one call that takes a parsed DXF to a ready model */
function makeModel(DX,roles,unit,name){
  const M=buildModel(DX,roles,unit||'cm',name);M.np=M.P.length;
  if(!unit)M.unit=guessUnit(M);
  M.pl=0.012/UNIT_M[M.unit];detectThickness(M);addJambs(M);buildObjects(M);
  /* thinner partition walls show up as long thin blocks: take their thickness as a wall thickness too and recognise again */
  const u=UNIT_M[M.unit],e=epsOf(M),extra=[];
  for(const w of M.walls){const r=rectOf(M,w),a=Math.min(r[2]-r[0],r[3]-r[1]),b=Math.max(r[2]-r[0],r[3]-r[1]);
    if(b>=3*a&&a>=0.05/u&&a<=0.6/u&&!M.th.concat(extra).some(T=>Math.abs(T-a)<=e*2))extra.push(+a.toFixed(4));}
  if(extra.length){M.thMain=M.th.slice();M.th.push(...extra);M.P=M.P0.slice(0,M.np);M.P0=M.P.slice();M.segs=M.segs.filter(q=>!q[3]);M.cls=null;M.man=[];M.walls=[];M.opens=[];M.sugs=[];addJambs(M);buildObjects(M);}
  return M;
}

if(typeof module!=='undefined')module.exports={parseDXF,defaultRoles,layerStats,buildModel,makeModel,guessUnit,detectThickness,addJambs,classify,buildObjects,massGrid,outline,pocheRects,rooms,roomAt,roomTable,
  rectOf,wallDir,roomName,probe,hitsAxis,candidates,applyOp,openDims,colDims,dimName,pickAt,splitWall,mergeWalls,neighbours,deleteWall,addOpening,acceptSug,drawWall,setCoord,
  dimVal,dimGeom,dimStatus,conflicts,pickCandidate,setDimension,structBBox,nearestRoom,fmt,chainFor,diagInfo,exportDXF,planSVG,reportHTML,reportCSV,printScale,
  stairAt,stairDims,nearestSeg,segGroup,setLineClass,openings,epsOf,UNIT_M,CLS};
