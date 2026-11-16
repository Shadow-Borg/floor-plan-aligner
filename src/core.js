/* =====================================================================
   CORE (no DOM): DXF reading, line recognition, measuring
   ===================================================================== */
const UNIT_M={mm:0.001,cm:0.01,m:1,in:0.0254,ft:0.3048};
const UNIT_DP={mm:0,cm:1,m:3,in:2,ft:3};
const epsOf=M=>0.001/UNIT_M[M.unit];
const duOf=M=>M.du||M.unit;                     // unit used to show and enter sizes
/* item classes: layer names follow the AIA / US National CAD Standard, line weights (mm on paper) follow the ISO 128 series */
const CLS={
  wall:    {n:'Wall',            layer:'A-WALL',     aci:7,lw:0.5, col:'#111'},
  window:  {n:'Window',          layer:'A-GLAZ',     aci:4,lw:0.25,col:'#0a7f9c'},
  stair:   {n:'Stair',           layer:'A-FLOR-STRS',aci:2,lw:0.25,col:'#8a6d00'},
  interior:{n:'Interior fitting',layer:'A-FLOR-CASE',aci:6,lw:0.18,col:'#a04aa0'},
  src:     {n:'Original wall line',layer:'A-WALL',aci:7,lw:0.18,col:'#7aa7d9'},
  line:    {n:'Other line',      layer:'A-FLOR-OTLN',aci:7,lw:0.35,col:'#111'}
};
const OPN_TINT={Window:'#bfeaf5',Door:'#c5efc5',Opening:'#c5efc5'},STAIR_TINT='#fff3b0';
const RAY_SKIP={interior:1,stair:1,src:1};
const paperU=(M,mm,sc)=>mm*0.001*(sc||M.sc||100)/UNIT_M[M.unit];      // paper millimetres -> drawing units
const textH=(M,t,sc)=>paperU(M,t.room&&t.s.length<=24?3.5:2.5,sc);    // ISO 3098 lettering heights
function layerHint(name){
  return /STRS|STAIR/i.test(name)?'stair':/GLAZ|WINDOW|^WIN/i.test(name)?'window':/CASE|FIXT|INTERIOR|CUPB|KITCH|A-DOOR/i.test(name)?'interior':/WALL|COLS|COLUMN/i.test(name)?'wall':null;
}            // 1 mm in drawing units

function parseDXF(text){
  const L=text.split(/\r\n|\r|\n/), recs=[];
  let sec=null, rec=null, insunits=0;
  for(let i=0;i+1<L.length;i+=2){
    const c=parseInt(L[i],10), s=L[i+1];
    if(c===0){
      const t=s.trim();
      if(t==='SECTION'){sec=(L[i+3]||'').trim();i+=2;rec=null;continue;}
      if(t==='ENDSEC'){sec=null;rec=null;continue;}
      if(t==='EOF')break;
      if(sec==='BLOCKS'||sec==='ENTITIES'){rec={t,sec,g:[]};recs.push(rec);}else rec=null;
      continue;
    }
    if(sec==='HEADER'){if(c===9&&s.trim()==='$INSUNITS')insunits=parseInt(L[i+3],10)||0;continue;}
    if(rec){
      const v=(c>=10&&c<60)||(c>=110&&c<150)||(c>=210&&c<240)?parseFloat(s):
              (c>=60&&c<100)||(c>=170&&c<180)||(c>=270&&c<290)?parseInt(s,10):s.trim();
      rec.g.push([c,v]);
    }
  }
  const out={insunits,blocks:{},ents:[]};
  let blk=null, poly=null;
  for(const r of recs){
    if(r.t==='BLOCK'){blk={name:String(gv(r,2,'')),bx:gv(r,10,0),by:gv(r,20,0),ents:[]};continue;}
    if(r.t==='ENDBLK'){if(blk)out.blocks[blk.name]=blk;blk=null;continue;}
    const dst=r.sec==='BLOCKS'?(blk?blk.ents:null):out.ents;
    if(!dst)continue;
    if(r.sec==='ENTITIES'&&gv(r,67,0)===1)continue;          // paper space
    if(r.t==='POLYLINE'){const f=gv(r,70,0);poly={t:'P',layer:String(gv(r,8,'0')),pts:[],bl:[],closed:(f&1)===1,skip:(f&80)!==0,dst};continue;}
    if(r.t==='VERTEX'){if(poly){poly.pts.push(gv(r,10,0),gv(r,20,0));poly.bl.push(gv(r,42,0));}continue;}
    if(r.t==='SEQEND'){if(poly&&!poly.skip&&poly.pts.length>=4){const d=poly.dst;delete poly.dst;delete poly.skip;d.push(poly);}poly=null;continue;}
    const e=convertEnt(r);
    if(e)dst.push(e);
  }
  return out;
}
function gv(r,c,d){for(const p of r.g)if(p[0]===c)return p[1];return d;}
function cleanText(s){
  return String(s).replace(/\\P/g,' ').replace(/\\[LlOoKk~]/g,'').replace(/\\[A-Za-z][^;\\{}]*;/g,'')
    .replace(/[{}]/g,'').replace(/%%[cdpCDP]/g,'').replace(/\s+/g,' ').trim();
}
function convertEnt(r){
  const layer=String(gv(r,8,'0')), flip=gv(r,230,1)<0, fx=flip?-1:1;
  switch(r.t){
    case 'LINE':return {t:'L',layer,pts:[gv(r,10,0),gv(r,20,0),gv(r,11,0),gv(r,21,0)]};
    case 'LWPOLYLINE':{
      const pts=[],bl=[];let x=0;
      for(const [c,v] of r.g){
        if(c===10)x=v;else if(c===20){pts.push(fx*x,v);bl.push(0);}
        else if(c===42&&bl.length)bl[bl.length-1]=fx*v;
      }
      return pts.length>=4?{t:'P',layer,pts,bl,closed:(gv(r,70,0)&1)===1}:null;
    }
    case 'ARC':{
      let a1=gv(r,50,0),a2=gv(r,51,360);
      if(flip){const t=a1;a1=180-a2;a2=180-t;}
      return {t:'A',layer,c:[fx*gv(r,10,0),gv(r,20,0)],r:gv(r,40,0),a1,a2};
    }
    case 'CIRCLE':return {t:'A',layer,c:[fx*gv(r,10,0),gv(r,20,0)],r:gv(r,40,0),a1:0,a2:360};
    case 'ELLIPSE':{
      const cx=gv(r,10,0),cy=gv(r,20,0),mx=gv(r,11,1),my=gv(r,21,0),k=gv(r,40,1);
      let u1=gv(r,41,0),u2=gv(r,42,Math.PI*2);if(u2<=u1)u2+=Math.PI*2;
      const pts=[],n=32;
      for(let i=0;i<=n;i++){const u=u1+(u2-u1)*i/n,c=Math.cos(u),s=Math.sin(u);pts.push(cx+c*mx-s*k*my,cy+c*my+s*k*mx);}
      return {t:'P',layer,pts,bl:new Array(pts.length/2).fill(0),closed:false};
    }
    case 'TEXT':{
      const h72=gv(r,72,0),h73=gv(r,73,0),al=(h72||h73)&&gv(r,11,null)!==null;
      const s=cleanText(gv(r,1,''));if(!s)return null;
      return {t:'T',layer,p:[al?gv(r,11,0):gv(r,10,0),al?gv(r,21,0):gv(r,20,0)],h:gv(r,40,1),s,rot:gv(r,50,0),
        ha:h72===1||h72===4?'center':h72===2?'right':'left',va:h73===3?'top':h73===2||h72===4?'middle':'alphabetic'};
    }
    case 'MTEXT':{
      let s='';for(const [c,v] of r.g)if(c===3)s+=v;
      s=cleanText(s+gv(r,1,''));if(!s)return null;
      const at=gv(r,71,1)-1;
      return {t:'T',layer,p:[gv(r,10,0),gv(r,20,0)],h:gv(r,40,1),s,rot:gv(r,50,0),
        ha:['left','center','right'][at%3]||'left',va:['top','middle','bottom'][Math.floor(at/3)]||'top'};
    }
    case 'INSERT':return {t:'I',layer,name:String(gv(r,2,'')),p:[fx*gv(r,10,0),gv(r,20,0)],sx:fx*gv(r,41,1),sy:gv(r,42,1),rot:fx*gv(r,50,0)};
    case 'HATCH':return convertHatch(r,layer);
  }
  return null;
}
function convertHatch(r,layer){
  const paths=[];let cur=null,poly=false,started=false,et=0,arc=null,x=0;
  const flush=()=>{
    if(arc&&arc.r>0&&cur){
      let a1=arc.a1||0,a2=arc.a2||0;
      if(arc.ccw===0){a1=-a1;a2=-a2;if(a2>a1)a2-=360;}else if(a2<a1)a2+=360;
      const n=Math.max(4,Math.ceil(Math.abs(a2-a1)/12));
      for(let i=0;i<n;i++){const a=(a1+(a2-a1)*i/n)*Math.PI/180;cur.push(arc.x+arc.r*Math.cos(a),arc.y+arc.r*Math.sin(a));}
    }
    arc=null;
  };
  for(const [c,v] of r.g){
    if(c===91){started=true;continue;}
    if(!started)continue;
    if(c===75||c===98)break;
    if(c===92){flush();cur=[];paths.push(cur);poly=(v&2)!==0;et=0;continue;}
    if(!cur)continue;
    if(poly){if(c===10)x=v;else if(c===20)cur.push(x,v);}
    else if(c===72){flush();et=v;if(v===2)arc={x:0,y:0};}
    else if(et===1){if(c===10)x=v;else if(c===20)cur.push(x,v);}
    else if(et===2&&arc){if(c===10)arc.x=v;else if(c===20)arc.y=v;else if(c===40)arc.r=v;else if(c===50)arc.a1=v;else if(c===51)arc.a2=v;else if(c===73)arc.ccw=v;}
  }
  flush();
  const good=paths.filter(p=>p.length>=6);
  return good.length?{t:'H',layer,paths:good,solid:gv(r,70,0)===1}:null;
}

/* ---- geometry helpers ---- */
function bulgeMid(x1,y1,x2,y2,b){            // intermediate points of a bulged segment
  const out=[],ex=x2-x1,ey=y2-y1,c=Math.hypot(ex,ey);
  if(!b||c<1e-12)return out;
  const th=4*Math.atan(b),h=(c/2)/Math.tan(th/2),cx=(x1+x2)/2-ey/c*h,cy=(y1+y2)/2+ex/c*h;
  const r=Math.hypot(x1-cx,y1-cy),a1=Math.atan2(y1-cy,x1-cx),n=Math.max(3,Math.ceil(Math.abs(th)/0.2));
  for(let i=1;i<n;i++){const a=a1+th*i/n;out.push(cx+r*Math.cos(a),cy+r*Math.sin(a));}
  return out;
}
function polyPts(e){
  const out=[],n=e.pts.length/2;
  for(let i=0;i<n;i++){
    out.push(e.pts[2*i],e.pts[2*i+1]);
    const j=i+1<n?i+1:(e.closed?0:-1);
    if(j>=0&&e.bl[i])out.push(...bulgeMid(e.pts[2*i],e.pts[2*i+1],e.pts[2*j],e.pts[2*j+1],e.bl[i]));
  }
  if(e.closed)out.push(e.pts[0],e.pts[1]);
  return out;
}
function arcPts(cx,cy,r,a1,a2){
  if(a2<=a1)a2+=360;
  const n=Math.max(6,Math.ceil((a2-a1)/10)),out=[];
  for(let i=0;i<=n;i++){const a=(a1+(a2-a1)*i/n)*Math.PI/180;out.push(cx+r*Math.cos(a),cy+r*Math.sin(a));}
  return out;
}
const IDENT=[1,0,0,1,0,0];
function mmul(m,l){return [m[0]*l[0]+m[2]*l[1],m[1]*l[0]+m[3]*l[1],m[0]*l[2]+m[2]*l[3],m[1]*l[2]+m[3]*l[3],m[0]*l[4]+m[2]*l[5]+m[4],m[1]*l[4]+m[3]*l[5]+m[5]];}
function tx(m,p){const o=new Array(p.length);for(let i=0;i<p.length;i+=2){o[i]=+(m[0]*p[i]+m[2]*p[i+1]+m[4]).toFixed(4);o[i+1]=+(m[1]*p[i]+m[3]*p[i+1]+m[5]).toFixed(4);}return o;}
function flatten(ents,m,depth,out,blocks){
  for(const e of ents){
    if(e.t==='L')out.push(tx(m,e.pts));
    else if(e.t==='P')out.push(tx(m,polyPts(e)));
    else if(e.t==='A')out.push(tx(m,arcPts(e.c[0],e.c[1],e.r,e.a1,e.a2)));
    else if(e.t==='I'&&depth<6){
      const b=blocks[e.name];if(!b)continue;
      const r=e.rot*Math.PI/180,c=Math.cos(r),s=Math.sin(r),l=[c*e.sx,s*e.sx,-s*e.sy,c*e.sy,0,0];
      l[4]=e.p[0]-(l[0]*b.bx+l[2]*b.by);l[5]=e.p[1]-(l[1]*b.bx+l[3]*b.by);
      flatten(b.ents,mmul(m,l),depth+1,out,blocks);
    }
  }
}
/* break a block reference into its parts so that walls, stairs and so on drawn as blocks are recognised */
function explode(ents,m,depth,inh,out,blocks){
  for(const e of ents){
    const layer=e.layer==='0'&&inh?inh:e.layer;
    if(e.t==='L')out.push({t:'S',layer,pts:tx(m,e.pts),closed:false});
    else if(e.t==='P'){
      if(e.bl.some(Boolean))out.push({t:'D',layer,pts:tx(m,polyPts(e))});
      else out.push({t:'S',layer,pts:tx(m,e.pts),closed:e.closed});
    }
    else if(e.t==='A')out.push({t:'D',layer,pts:tx(m,arcPts(e.c[0],e.c[1],e.r,e.a1,e.a2))});
    else if(e.t==='T')out.push({t:'T',layer,p:tx(m,e.p),h:e.h*Math.hypot(m[0],m[1]),s:e.s,rot:e.rot+Math.atan2(m[1],m[0])*180/Math.PI,ha:e.ha,va:e.va});
    else if(e.t==='I'&&depth<6){
      const b=blocks[e.name];if(!b)continue;
      const r=e.rot*Math.PI/180,c=Math.cos(r),sn=Math.sin(r),l=[c*e.sx,sn*e.sx,-sn*e.sy,c*e.sy,0,0];
      l[4]=e.p[0]-(l[0]*b.bx+l[2]*b.by);l[5]=e.p[1]-(l[1]*b.bx+l[3]*b.by);
      explode(b.ents,mmul(m,l),depth+1,layer,out,blocks);
    }
  }
}
function mkGroup(paths){
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  for(const p of paths)for(let i=0;i<p.length;i+=2){if(p[i]<x0)x0=p[i];if(p[i]>x1)x1=p[i];if(p[i+1]<y0)y0=p[i+1];if(p[i+1]>y1)y1=p[i+1];}
  return {paths,cx:(x0+x1)/2,cy:(y0+y1)/2,hw:(x1-x0)/2,hh:(y1-y0)/2,dx:0,dy:0};
}

/* ---- model ---- */
const DECOR_RE=/furn|equip|mob|plant|tree|car|sanit|fixture|elec|defpoints|title|border|dim|grid|axis|note/i;
function layerStats(DX){
  const st={};
  for(const e of DX.ents){
    if(e.t==='I'){const pr=[];explode([e],IDENT,0,null,pr,DX.blocks);for(const p of pr)st[p.layer]=(st[p.layer]||0)+1;}
    else st[e.layer]=(st[e.layer]||0)+1;
  }
  return st;
}
function defaultRoles(DX){
  const roles={};
  for(const k in layerStats(DX))roles[k]=/^(SITE-|WALL-FILL$|A-ANNO-DIMS|A-ANNO-NOTE|A-ANNO-IDEN|A-ANNO-SCHD|A-GRID$|A-WALL-PATT$)/i.test(k)?'hide':DECOR_RE.test(k)?'decor':'structure';
  return roles;
}
function buildModel(DX,roles,unit,name){
  const M={v:1,name:name||'Plan',unit:unit||'cm',th:[],thAll:[],P:[],P0:null,segs:[],arcs:[],texts:[],fills:[],decor:[],dims:[],diags:[],nid:1,pl:0.012/UNIT_M[unit||'cm'],fin:false,hint:[],man:[],ov:{},mo:[],stairs:[],sc:100,du:null,walls:[],opens:[],sugs:[]};M.v=2;
  const addP=(x,y)=>{M.P.push(x,y);return M.P.length/2-1;};
  for(const e of DX.ents){
    const role=roles[e.layer]||'structure';
    if(role==='hide')continue;
    if(e.t==='I'){
      const pr=[],dec=[];explode([e],IDENT,0,null,pr,DX.blocks);
      for(const p of pr){
        const r=roles[p.layer]||(DECOR_RE.test(p.layer)?'decor':'structure');
        if(r==='hide')continue;
        if(p.t==='T'){if(r==='structure')M.texts.push({p:addP(p.p[0],p.p[1]),h:p.h,s:p.s,rot:p.rot,ha:p.ha,va:p.va,room:false});continue;}
        if(r==='structure'&&p.t==='S'){
          const ix=[],k=p.pts.length/2;
          for(let i=0;i<k;i++)ix.push(addP(p.pts[2*i],p.pts[2*i+1]));
          for(let i=0;i<k-1;i++)if(Math.hypot(p.pts[2*i+2]-p.pts[2*i],p.pts[2*i+3]-p.pts[2*i+1])>1e-9){M.segs.push([ix[i],ix[i+1],0]);M.hint.push(layerHint(p.layer));}
          if(p.closed&&k>2){M.segs.push([ix[k-1],ix[0],0]);M.hint.push(layerHint(p.layer));}
        }else dec.push(p.closed?p.pts.concat([p.pts[0],p.pts[1]]):p.pts);
      }
      if(dec.length)M.decor.push(mkGroup(dec));
      continue;
    }
    if(role==='decor'&&(e.t==='L'||e.t==='P'||e.t==='A')){
      const paths=[];flatten([e],IDENT,0,paths,DX.blocks);
      if(paths.length)M.decor.push(mkGroup(paths));
      continue;
    }
    if(e.t==='T'){M.texts.push({p:addP(e.p[0],e.p[1]),h:e.h,s:e.s,rot:e.rot,ha:e.ha,va:e.va,room:role==='structure'});continue;}
    if(e.t==='H'){
      if(e.solid)M.fills.push(e.paths.map(pp=>{const ix=[];for(let i=0;i<pp.length;i+=2)ix.push(addP(pp[i],pp[i+1]));return ix;}));
      continue;
    }
    if(e.t==='L'){
      if(Math.hypot(e.pts[2]-e.pts[0],e.pts[3]-e.pts[1])<1e-9)continue;
      M.segs.push([addP(e.pts[0],e.pts[1]),addP(e.pts[2],e.pts[3]),0]);M.hint.push(layerHint(e.layer));
    }else if(e.t==='P'){
      const ix=[],n=e.pts.length/2;
      for(let i=0;i<n;i++)ix.push(addP(e.pts[2*i],e.pts[2*i+1]));
      for(let i=0;i<n-1;i++){M.segs.push([ix[i],ix[i+1],e.bl[i]||0]);M.hint.push(layerHint(e.layer));}
      if(e.closed&&n>2){M.segs.push([ix[n-1],ix[0],e.bl[n-1]||0]);M.hint.push(layerHint(e.layer));}
    }else if(e.t==='A'){
      M.arcs.push([addP(e.c[0],e.c[1]),e.r,e.a1,e.a2]);
    }
  }
  M.P0=M.P.slice();
  return M;
}
function structBBox(M){
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  for(const s of M.segs)for(let j=0;j<2;j++){const x=M.P[2*s[j]],y=M.P[2*s[j]+1];if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}
  if(x0===Infinity)return null;
  return [x0,y0,x1,y1];
}
/* spacing between parallel overlapping wall lines, weighted by overlap length */
function spacings(M,maxD){
  const H=[],V=[],P=M.P,w=new Map();
  for(const s of M.segs){
    if(s[2]||s[3])continue;
    const x1=P[2*s[0]],y1=P[2*s[0]+1],x2=P[2*s[1]],y2=P[2*s[1]+1],len=Math.hypot(x2-x1,y2-y1);
    if(Math.abs(y2-y1)<=1e-5*len)H.push([y1,Math.min(x1,x2),Math.max(x1,x2)]);
    else if(Math.abs(x2-x1)<=1e-5*len)V.push([x1,Math.min(y1,y2),Math.max(y1,y2)]);
  }
  for(const S of [H,V]){
    S.sort((a,b)=>a[0]-b[0]);
    for(let i=0;i<S.length;i++)for(let j=i+1;j<S.length;j++){
      const d=S[j][0]-S[i][0];
      if(d>maxD)break;
      if(d<1e-9)continue;
      const ov=Math.min(S[i][2],S[j][2])-Math.max(S[i][1],S[j][1]);
      if(ov>0.5*d){const k=Number(d.toPrecision(4));w.set(k,(w.get(k)||0)+ov);}
    }
  }
  return w;
}
function guessUnit(M){
  const w=spacings(M,450);let best=null,bw=0;
  for(const [u,lo,hi] of [['m',0.07,0.45],['cm',7,45],['mm',70,450]])
    for(const [d,wt] of w)if(d>=lo&&d<=hi&&wt>bw){bw=wt;best=u;}
  if(best)return best;
  const b=structBBox(M);if(!b)return 'cm';
  const ext=Math.max(b[2]-b[0],b[3]-b[1]);
  return ext<150?'m':ext<6000?'cm':'mm';
}
function detectThickness(M){
  const u=UNIT_M[M.unit],lo=0.05/u,hi=0.6/u;
  const list=[...spacings(M,hi)].filter(([d])=>d>=lo&&d<=hi).sort((a,b)=>b[1]-a[1]).slice(0,6);
  M.thAll=list.map(x=>x[0]);
  M.th=list.filter(x=>x[1]>=0.6*list[0][1]).map(x=>x[0]);
}

/* ---- measuring ---- */
function rayHits(M,ox,oy,dx,dy,maxT,opt){
  const P=M.P,e=epsOf(M),out=[];
  for(let i=0;i<M.segs.length;i++){
    const s=M.segs[i],sc=M.cls?M.cls[i]:null;
    if(opt?((s[3]&&!opt.virt)||(opt.only?sc!==opt.only:!!RAY_SKIP[sc])):(s[3]||RAY_SKIP[sc]))continue;
    const x1=P[2*s[0]],y1=P[2*s[0]+1],ex=P[2*s[1]]-x1,ey=P[2*s[1]+1]-y1;
    const den=dx*ey-dy*ex;
    if(Math.abs(den)<1e-12)continue;
    const t=((x1-ox)*ey-(y1-oy)*ex)/den;
    if(t<=e*0.5||t>maxT)continue;
    const len=Math.hypot(ex,ey),u=((x1-ox)*dy-(y1-oy)*dx)/den,tol=e/len;
    if(u<-tol||u>1+tol)continue;
    out.push({t,seg:i,perp:Math.abs(ex*dx+ey*dy)/len<0.01&&!s[2]});
  }
  out.sort((a,b)=>a.t-b.t);
  return out;
}
const faceOf=(M,P,ref,ax)=>P[2*(ref<0?-ref-1:M.segs[ref][0])+(ax==='x'?0:1)];   // ref: line number, or -(point+1)
function dimVal(M,d,P){
  if(d.kind==='sw'){const q=M.segs[d.a],k=d.ax==='x'?0:1;return Math.abs(P[2*q[1]+k]-P[2*q[0]+k]);}
  return Math.abs(faceOf(M,P,d.b,d.ax)-faceOf(M,P,d.a,d.ax));
}
/* the four ways a dimension change can be absorbed */
/* ---- doors, windows, columns ---- */
/* wall ends that are only drawn by the wall fill get an invisible jamb line, so door openings can be found */
function addJambs(M){
  if(!(M.dims.length||(M.mo&&M.mo.length)||(M.man&&M.man.some(Boolean)))){
    M.segs=M.segs.filter(q=>!q[3]);
    const P=M.P,e=epsOf(M);
    for(const f of M.fills)for(const p of f)for(let i=0;i<p.length;i++){
      const a=p[i],b=p[(i+1)%p.length],dx=Math.abs(P[2*a]-P[2*b]),dy=Math.abs(P[2*a+1]-P[2*b+1]);
      if(!((dx<=e)!==(dy<=e)))continue;
      if(M.th.some(T=>Math.abs(T-Math.max(dx,dy))<=e*2))M.segs.push([a,b,0,1]);
    }
  }
  classify(M);
}
function fillAt(M,x,y){
  const P=M.P;
  for(let n=0;n<M.fills.length;n++){
    let c=false;
    for(const p of M.fills[n])for(let i=0,j=p.length-1;i<p.length;j=i++){
      const xi=P[2*p[i]],yi=P[2*p[i]+1],xj=P[2*p[j]],yj=P[2*p[j]+1];
      if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)c=!c;
    }
    if(c)return n;
  }
  return -1;
}

/* ---- recognising what each line is ---- */
function ptSeg(px,py,x1,y1,x2,y2){
  const dx=x2-x1,dy=y2-y1,l=dx*dx+dy*dy;let t=l?((px-x1)*dx+(py-y1)*dy)/l:0;t=Math.max(0,Math.min(1,t));
  return Math.hypot(px-x1-t*dx,py-y1-t*dy);
}
function flightBox(M,f){
  const P=M.P,a=M.segs[f.tr[0]],b=M.segs[f.tr[f.tr.length-1]];
  const xs=[P[2*a[0]],P[2*a[1]],P[2*b[0]],P[2*b[1]]],ys=[P[2*a[0]+1],P[2*a[1]+1],P[2*b[0]+1],P[2*b[1]+1]];
  return [Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];
}
function classify(M){
  const P=M.P,e=epsOf(M),n=M.segs.length,old=M.cls||[],man=M.man||(M.man=[]),hint=M.hint||(M.hint=[]);
  M.ov=M.ov||{};M.mo=M.mo||[];
  const cls=M.cls=new Array(n).fill('line');
  const G=M.segs.map(q=>{
    const x1=P[2*q[0]],y1=P[2*q[0]+1],x2=P[2*q[1]],y2=P[2*q[1]+1],h=Math.abs(y2-y1)<=e,v=Math.abs(x2-x1)<=e;
    return {x1,y1,x2,y2,o:q[2]||q[3]||h===v?-1:h?0:1};
  });
  /* 1 walls: two parallel lines one wall thickness apart, or a line along the wall fill */
  const H=[],V=[];
  G.forEach((g,i)=>{if(g.o===0)H.push([g.y1,Math.min(g.x1,g.x2),Math.max(g.x1,g.x2),i]);else if(g.o===1)V.push([g.x1,Math.min(g.y1,g.y2),Math.max(g.y1,g.y2),i]);});
  const maxT=M.th.length?Math.max(...M.th):0,FE=[[],[]];
  for(const f of M.fills)for(const p of f)for(let i=0;i<p.length;i++){
    const a=p[i],b=p[(i+1)%p.length],xa=P[2*a],ya=P[2*a+1],xb=P[2*b],yb=P[2*b+1];
    if(Math.abs(ya-yb)<=e&&Math.abs(xa-xb)>e)FE[0].push([ya,Math.min(xa,xb),Math.max(xa,xb)]);
    else if(Math.abs(xa-xb)<=e&&Math.abs(ya-yb)>e)FE[1].push([xa,Math.min(ya,yb),Math.max(ya,yb)]);
  }
  [H,V].forEach((S,si)=>{
    S.sort((a,b)=>a[0]-b[0]);
    for(let i=0;i<S.length;i++)for(let j=i+1;j<S.length;j++){
      const d=S[j][0]-S[i][0];if(d>maxT+e*2)break;
      if(Math.min(S[i][2],S[j][2])-Math.max(S[i][1],S[j][1])>e&&(M.fills.length&&M.thMain?M.thMain:M.th).some(T=>Math.abs(T-d)<=e*2)){cls[S[i][3]]='wall';cls[S[j][3]]='wall';}
    }
    for(const q of S)if(cls[q[3]]!=='wall'&&FE[si].some(f=>Math.abs(f[0]-q[0])<=e&&Math.min(f[2],q[2])-Math.max(f[1],q[1])>e))cls[q[3]]='wall';
  });
  G.forEach((g,i)=>{                        // a short line one wall thickness long that joins two wall lines is a wall end
    if(g.o<0||cls[i]==='wall'||!M.th.some(T=>Math.abs(T-Math.hypot(g.x2-g.x1,g.y2-g.y1))<=e*2))return;
    let a=false,b=false;
    for(let j=0;j<n&&!(a&&b);j++){
      if(cls[j]!=='wall')continue;const h=G[j];
      if(!a&&ptSeg(g.x1,g.y1,h.x1,h.y1,h.x2,h.y2)<=e*2)a=true;
      if(!b&&ptSeg(g.x2,g.y2,h.x1,h.y1,h.x2,h.y2)<=e*2)b=true;
    }
    if(a&&b)cls[i]='wall';
  });
  /* 2 windows: lines inside a window opening */
  let ops=[];try{ops=openings(M);}catch(_){}
  for(const o of ops)if(o.type==='Window'){
    const inb=(x,y)=>{const t=o.k?y:x,a=o.k?x:y;return t>=o.lo-e&&t<=o.hi+e&&a>=o.c1-e&&a<=o.c2+e;};
    G.forEach((g,i)=>{if(!M.segs[i][3]&&inb(g.x1,g.y1)&&inb(g.x2,g.y2))cls[i]='window';});
  }
  /* 3 stairs: four or more equal parallel lines at an even spacing of 15 to 45 cm */
  M.stairs=[];
  const lim=[0.15/UNIT_M[M.unit],0.45/UNIT_M[M.unit]],grp=new Map();
  G.forEach((g,i)=>{
    if(g.o<0)return;
    const isSt=(man[i]&&old[i]==='stair')||hint[i]==='stair';
    if((cls[i]!=='line'&&!isSt)||(man[i]&&old[i]!=='stair'))return;
    const lo=g.o?Math.min(g.y1,g.y2):Math.min(g.x1,g.x2),hi=g.o?Math.max(g.y1,g.y2):Math.max(g.x1,g.x2),key=g.o+':'+Math.round(lo/(e*4))+':'+Math.round(hi/(e*4));
    if(!grp.has(key))grp.set(key,[]);
    grp.get(key).push({i,c:g.o?g.x1:g.y1});
  });
  for(const [key,g] of grp){
    g.sort((a,b)=>a.c-b.c);
    let st=0;
    while(st<g.length-1){
      const d0=g[st+1].c-g[st].c;let t=st+1;
      if(d0>=lim[0]&&d0<=lim[1])while(t+1<g.length&&Math.abs(g[t+1].c-g[t].c-d0)<=e*3)t++;
      if(t-st+1>=4){const tr=g.slice(st,t+1).map(x=>x.i);tr.forEach(i=>cls[i]='stair');M.stairs.push({o:+key[0],tr});st=t+1;}else st++;
    }
  }
  const touch=(g,h)=>ptSeg(g.x1,g.y1,h.x1,h.y1,h.x2,h.y2)<=e*2||ptSeg(g.x2,g.y2,h.x1,h.y1,h.x2,h.y2)<=e*2||ptSeg(h.x1,h.y1,g.x1,g.y1,g.x2,g.y2)<=e*2||ptSeg(h.x2,h.y2,g.x1,g.y1,g.x2,g.y2)<=e*2;
  const m=1.5/UNIT_M[M.unit];
  for(const f of M.stairs){                 // lines touching the treads (strings, winders, arrows) join the stair
    const b=flightBox(M,f);let ch=true,pass=0;
    while(ch&&pass++<6){
      ch=false;
      G.forEach((g,i)=>{
        if(cls[i]!=='line'||M.segs[i][3]||man[i])return;
        const mx=(g.x1+g.x2)/2,my=(g.y1+g.y2)/2;
        if(mx<b[0]-m||mx>b[2]+m||my<b[1]-m||my>b[3]+m)return;
        for(let j=0;j<n;j++)if(cls[j]==='stair'&&touch(g,G[j])){cls[i]='stair';ch=true;break;}
      });
    }
  }
  /* 4 layer names and manual choices win over the guesses */
  for(let i=0;i<n;i++){const h=hint[i];if(h&&h!=='wall')cls[i]=h;else if(h==='wall'&&cls[i]==='line')cls[i]='wall';}
  for(let i=0;i<n;i++)if(man[i]&&old[i])cls[i]=old[i];
  /* 5 interior fittings: any other line with a wall on all four sides. Measurements ignore these. */
  const dirs=[[1,0],[-1,0],[0,1],[0,-1]],inner=[];
  G.forEach((g,i)=>{
    if(cls[i]!=='line'||M.segs[i][3]||man[i]||hint[i])return;
    const mx=(g.x1+g.x2)/2,my=(g.y1+g.y2)/2;
    if(enclosed(M,mx,my))inner.push(i);
  });
  for(const i of inner)cls[i]='interior';
}
function stairAt(M,x,y){return (M.stairs||[]).find(f=>{const b=flightBox(M,f);return x>=b[0]&&x<=b[2]&&y>=b[1]&&y<=b[3];})||null;}
function stairPts(M,tr){
  const P=M.P,e=epsOf(M),b=flightBox(M,{tr}),set=new Set(),inb=p=>P[2*p]>=b[0]-e&&P[2*p]<=b[2]+e&&P[2*p+1]>=b[1]-e&&P[2*p+1]<=b[3]+e;
  M.segs.forEach((q,i)=>{if(M.cls[i]==='stair'&&inb(q[0])&&inb(q[1])){set.add(q[0]);set.add(q[1]);}});
  return [...set];
}
function stairDims(M,f){
  const b=flightBox(M,f),v=f.o===1,ax=v?'x':'y',n=f.tr.length;
  const at=fr=>v?[(b[0]+b[2])/2,b[1]+(b[3]-b[1])*fr]:[b[0]+(b[2]-b[0])*fr,(b[1]+b[3])/2];
  const mk=(kind,axis,a,bb,fr,name)=>{const p=at(fr);return {kind,ax:axis,a,b:bb,tr:f.tr,ox:p[0],oy:p[1],pk:0,name};};
  return [mk('st',ax,f.tr[0],f.tr[1],0.75,'Stair tread depth'),mk('st',ax,f.tr[0],f.tr[n-1],0.25,'Stair flight length ('+(n-1)+' treads)'),mk('sw',v?'y':'x',f.tr[0],f.tr[0],0.5,'Stair width')];
}
function nearestSeg(M,x,y,m){
  let best=-1,bd=m;const P=M.P;
  M.segs.forEach((q,i)=>{if(q[3]||M.cls[i]==='src')return;const d=ptSeg(x,y,P[2*q[0]],P[2*q[0]+1],P[2*q[1]],P[2*q[1]+1]);if(d<bd){bd=d;best=i;}});
  return best;
}
function segGroup(M,seg){                   // lines of the same kind that touch each other
  const P=M.P,e=epsOf(M)*2,c=M.cls[seg],seen=new Set([seg]),st=[seg];
  const xy=i=>{const q=M.segs[i];return [P[2*q[0]],P[2*q[0]+1],P[2*q[1]],P[2*q[1]+1]];};
  while(st.length){
    const a=xy(st.pop());
    M.segs.forEach((q,j)=>{
      if(q[3]||seen.has(j)||M.cls[j]!==c)return;
      const b=xy(j);
      if(ptSeg(a[0],a[1],b[0],b[1],b[2],b[3])<=e||ptSeg(a[2],a[3],b[0],b[1],b[2],b[3])<=e||ptSeg(b[0],b[1],a[0],a[1],a[2],a[3])<=e||ptSeg(b[2],b[3],a[0],a[1],a[2],a[3])<=e){seen.add(j);st.push(j);}
    });
  }
  return [...seen];
}
function setLineClass(M,list,c){for(const i of list){M.cls[i]=c;M.man[i]=1;}classify(M);}
function inFill(M,x,y){
  const P=M.P;
  for(const f of M.fills){
    let c=false;
    for(const p of f)for(let i=0,j=p.length-1;i<p.length;j=i++){
      const xi=P[2*p[i]],yi=P[2*p[i]+1],xj=P[2*p[j]],yj=P[2*p[j]+1];
      if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)c=!c;
    }
    if(c)return true;
  }
  return false;
}
/* an opening is the stretch between two jamb lines (short lines across a wall): empty = door, extra lines inside = window */
function openings(M){
  const P=M.P,e=epsOf(M),out=[],groups=new Map(),maxW=2.6/UNIT_M[M.unit];
  M.segs.forEach((q,i)=>{
    if(q[2])return;
    const x1=P[2*q[0]],y1=P[2*q[0]+1],x2=P[2*q[1]],y2=P[2*q[1]+1],dx=Math.abs(x2-x1),dy=Math.abs(y2-y1);
    let k;if(dy<=e&&dx>e)k=0;else if(dx<=e&&dy>e)k=1;else return;
    const len=k?dy:dx;if(!M.th.some(T=>Math.abs(T-len)<=e*2))return;
    const lo=k?Math.min(y1,y2):Math.min(x1,x2),key=k+':'+Math.round(lo/(e*4))+':'+Math.round(len/(e*4));
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push({i,c:k?x1:y1,lo,hi:lo+len,k});
  });
  for(const g of groups.values()){
    g.sort((a,b)=>a.c-b.c);
    for(let n=0;n+1<g.length;n++){
      const A=g[n],B=g[n+1],w=B.c-A.c;
      if(w<=e*2||w>maxW)continue;
      const mid=(A.c+B.c)/2,T=A.hi-A.lo,d=e*5;
      const h=rayHits(M,A.k?mid:A.lo-d,A.k?A.lo-d:mid,A.k?0:1,A.k?1:0,T+2*d).filter(x=>x.perp).length;
      const solid=M.fills.length?inFill(M,A.k?mid:A.lo+T/2,A.k?A.lo+T/2:mid):h===2;
      if(!solid)out.push({k:A.k,lo:A.lo,hi:A.hi,c1:A.c,c2:B.c,j1:A.i,j2:B.i,type:h>=3?'Window':h?'Opening':'Door'});
    }
  }
  /* a wall end facing a cross wall: the opening runs from the wall end to that wall's face */
  for(const g of groups.values())for(const A of g){
    const T=A.hi-A.lo,bc=A.lo+T/2;
    for(const dir of [1,-1]){
      const h=rayHits(M,A.k?A.c:bc,A.k?bc:A.c,A.k?dir:0,A.k?0:dir,maxW)[0];
      if(!h||!h.perp||h.t<=e*2)continue;
      const q=M.segs[h.seg];
      if(Math.hypot(P[2*q[1]]-P[2*q[0]],P[2*q[1]+1]-P[2*q[0]+1])<=T+e*2)continue;      // another wall end: handled above
      const mid=A.c+dir*h.t/2,d=e*5;
      const solid=M.fills.length?inFill(M,A.k?mid:bc,A.k?bc:mid):rayHits(M,A.k?mid:A.lo-d,A.k?A.lo-d:mid,A.k?0:1,A.k?1:0,T+2*d).length>0;
      if(solid)continue;
      out.push(dir>0?{k:A.k,lo:A.lo,hi:A.hi,c1:A.c,c2:A.c+h.t,j1:A.i,j2:h.seg,type:'Door',fixed:'b',cap:A.i}
                    :{k:A.k,lo:A.lo,hi:A.hi,c1:A.c-h.t,c2:A.c,j1:h.seg,j2:A.i,type:'Door',fixed:'a',cap:A.i});
    }
  }
  for(const m of M.mo||[]){                 // openings marked by hand
    const q=M.segs[m.cap];if(!q)continue;
    const k=Math.abs(P[2*q[0]+1]-P[2*q[1]+1])<=e?0:1,al=j=>P[2*M.segs[j][0]+(1-k)],c1=al(m.j1),c2=al(m.j2);
    out.unshift({k,lo:Math.min(P[2*q[0]+k],P[2*q[1]+k]),hi:Math.max(P[2*q[0]+k],P[2*q[1]+k]),c1:Math.min(c1,c2),c2:Math.max(c1,c2),j1:m.j1,j2:m.j2,type:m.type,fixed:m.fixed||undefined,cap:m.fixed?m.cap:undefined});
  }
  const seen=new Set();
  return out.filter(o=>{
    const key=o.j1+':'+o.j2;if(seen.has(key))return false;seen.add(key);
    const t=M.ov&&M.ov[key];if(t==='none')return false;if(t)o.type=t;
    return true;
  });
}
/* a small closed rectangle around the tapped point: treated as a column or block */
function conflicts(M,P,except){
  const e=epsOf(M)*0.5;let n=0;
  for(const d of M.dims)if(d!==except&&d.site!=null&&Math.abs(dimVal(M,d,P)-d.site)>e)n++;
  return n;
}
function pickCandidate(M,d,delta,choice){
  const cs=candidates(M,d,delta);
  for(const c of cs){const P2=M.P.slice();applyOp(M,P2,c.op,false);c.conf=conflicts(M,P2,d);}
  if(choice&&choice!=='auto')return cs.find(c=>c.key===choice);
  cs.sort((a,b)=>a.conf-b.conf||a.rank-b.rank);
  return cs[0];
}
function setDimension(M,d,val,choice){
  const delta=val-dimVal(M,d,M.P);let c=null;
  if(choice!=='none'&&Math.abs(delta)>epsOf(M)/10){c=pickCandidate(M,d,delta,choice);applyOp(M,M.P,c.op,true);}
  d.site=val;d.how=choice==='none'?'none':c?c.key:(d.how==='none'?null:d.how||null);
  return c;
}
function nearestRoom(M,x,y){
  let best=null,bd=Infinity;
  for(const t of M.texts){
    if(!t.room||t.s.length>24)continue;
    const d=Math.hypot(M.P[2*t.p]-x,M.P[2*t.p+1]-y);
    if(d<bd){bd=d;best=t.s;}
  }
  return best;
}
const fmt=(M,v)=>{const u=duOf(M);return String(+(v*UNIT_M[M.unit]/UNIT_M[u]).toFixed(UNIT_DP[u]));};

const escH=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function dimGeom(M,d){
  if(d.kind==='sw'){const q=M.segs[d.a],P=M.P,p=[P[2*q[0]],P[2*q[0]+1],P[2*q[1]],P[2*q[1]+1]];return (d.ax==='x'?p[0]<=p[2]:p[1]<=p[3])?p:[p[2],p[3],p[0],p[1]];}
  const A=faceOf(M,M.P,d.a,d.ax),B=faceOf(M,M.P,d.b,d.ax);
  const ox=d.p!=null?M.P[2*d.p]:d.ox,oy=d.p!=null?M.P[2*d.p+1]:d.oy;
  return d.ax==='x'?[A,oy,B,oy]:[ox,A,ox,B];
}
function dimStatus(M,d){
  const e=epsOf(M)*0.5,cur=dimVal(M,d,M.P),des=dimVal(M,d,M.P0),dev=d.site-des,bad=Math.abs(cur-d.site)>e,devd=Math.abs(dev)>e;
  const label=bad?fmt(M,d.site)+' ≠ '+fmt(M,cur):fmt(M,d.site)+(devd?' ('+(dev>0?'+':'')+fmt(M,dev)+')':'');
  return {cur,des,dev,bad,devd,label,color:bad?'#c62828':devd?'#b45309':'#1a7f37',
    status:bad?(d.how==='none'?'Check only: plan differs':'Conflict with a later edit'):devd?'Differs from drawing':'As drawn'};
}

/* ---- checks ---- */
/* closure: find measured sizes plus walls that add up along the same span as d */
function chainFor(M,d){
  if(d.kind)return null;
  const e=epsOf(M)*2,P=M.P,fa=faceOf(M,P,d.a,d.ax),fb=faceOf(M,P,d.b,d.ax),lo=Math.min(fa,fb),hi=Math.max(fa,fb);
  const parts=[];
  for(const q of M.dims){
    if(q===d||q.kind||q.ax!==d.ax||q.site==null)continue;
    const a=faceOf(M,P,q.a,q.ax),b=faceOf(M,P,q.b,q.ax),l=Math.min(a,b),h=Math.max(a,b);
    if(l>=lo-e&&h<=hi+e&&h-l<hi-lo-e)parts.push({q,lo:l,hi:h});
  }
  const maxT=M.th.length?Math.max(...M.th)*1.05:0;
  const go=(x,wallOk,depth)=>{
    if(Math.abs(x-hi)<=e)return [];
    if(depth>14)return null;
    for(const p of parts)if(Math.abs(p.lo-x)<=e){const r=go(p.hi,true,depth+1);if(r)return [{dim:p.q},...r];}
    if(wallOk){
      for(const p of parts){const g=p.lo-x;if(g>e&&g<=maxT+e){const r=go(p.lo,false,depth+1);if(r)return [{wall:g},...r];}}
      const g=hi-x;if(g>e&&g<=maxT+e)return [{wall:g}];
    }
    return null;
  };
  const c=go(lo,true,0);
  if(!c||!c.some(s=>s.dim))return null;
  let sum=0;
  const text=c.map(s=>{if(s.dim){sum+=s.dim.site;return s.dim.name+' '+fmt(M,s.dim.site);}sum+=s.wall;return 'wall '+fmt(M,s.wall);}).join(' + ');
  return {text:text+' = '+fmt(M,sum),sum,err:d.site-sum};
}
function diagRect(M,g){
  const P=M.P,xa=faceOf(M,P,g.xa,'x'),xb=faceOf(M,P,g.xb,'x'),ya=faceOf(M,P,g.ya,'y'),yb=faceOf(M,P,g.yb,'y');
  return [Math.min(xa,xb),Math.min(ya,yb),Math.max(xa,xb),Math.max(ya,yb)];
}
/* diagonals d1 (bottom-left to top-right) and d2: how far the room is out of square */
function diagInfo(M,g){
  const r=diagRect(M,g),p=g.fin?(M.pl||0):0,W=r[2]-r[0]-2*p,D=r[3]-r[1]-2*p,exp=Math.hypot(W,D);
  const off=(g.d1*g.d1-g.d2*g.d2)/(4*W),mis=Math.sqrt((g.d1*g.d1+g.d2*g.d2)/2)-exp,tol=0.01/UNIT_M[M.unit];
  const ok=Math.abs(off)<=tol&&Math.abs(mis)<=tol;
  return {W,D,exp,diff:g.d1-g.d2,off,mis,ok,label:ok?'Square':'Out of square '+fmt(M,Math.abs(off)),color:ok?'#1a7f37':'#b45309'};
}

/* ---- exports ---- */
/* the plan is printed at a true scale; if it does not fit an A4 page at the chosen scale the next smaller scale is used */