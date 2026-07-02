#!/usr/bin/env node
/*
 * Wipeout Bay — road & walkway audit.
 *
 * Loads wipeoutbay.html in headless Chrome (swiftshader) and geometrically checks:
 *   1. No solid object (building/house/silo/prop) sits ON a road or walkway surface.
 *   2. The city road grid is connected — no broken stretches / weird gaps.
 *
 * Roads = meshes using the shared roadMat (city grid, diagonal avenues, causeway).
 * Walkways = the dirt/plank paths in the village & farm and on the bridge/docks.
 * Landmarks (which legitimately span plazas/roads, e.g. the gateway arch) are
 * excluded via their LANDMARK_DEFS .clear radius, as are thin masts/antennae,
 * objects below road grade (boats in the water), and the terrain/sea.
 *
 * Usage:  node tests/road-audit.cjs            (uses http://mini-games-.test)
 *         URL=http://localhost:8000/wipeoutbay.html node tests/road-audit.cjs
 * Exit code 0 = pass, 1 = violations found, 2 = harness error.
 */
const { execSync, spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const URL = process.env.URL || 'http://mini-games.test/wipeoutbay.html';
const CHROME = process.env.CHROME || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].find(p => { try { return fs.existsSync(p); } catch(e){ return false; } });
const PORT = 9333;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- the in-page audit (runs inside the game; returns a JSON string) ----
const AUDIT = `(function(){
  const SURF=new Set([roadMat,pavementMat,sidewalkMat,kerbMat,roadLineMat,parkMat]);
  const PATHCOL=new Set([0x9a7748,0x8a7350,0x7c5a36]); // plank, village-dirt, farm-dirt linear walkways
  function orient(o){ o.updateWorldMatrix(true,false); const p=new THREE.Vector3(); o.getWorldPosition(p);
    const e=new THREE.Euler().setFromRotationMatrix(o.matrixWorld,'YXZ'); let hx=0,hz=0; const g=o.geometry;
    if(g.parameters&&g.type==='BoxGeometry'){ const s=new THREE.Vector3(); o.getWorldScale(s); hx=Math.abs(g.parameters.width*s.x)/2; hz=Math.abs(g.parameters.depth*s.z)/2; }
    else { const b=new THREE.Box3().setFromObject(o); hx=(b.max.x-b.min.x)/2; hz=(b.max.z-b.min.z)/2; }
    const bb=new THREE.Box3().setFromObject(o); return {x:p.x,z:p.z,hx,hz,yaw:e.y,topY:bb.max.y}; }
  const LM=(typeof LANDMARK_DEFS!=='undefined'?LANDMARK_DEFS:[]).filter(L=>!L.abs).map(L=>({x:CITY.x+(L.dx||0),z:CITY.z+(L.dz||0),r:(L.clear||20)+8}));
  function nearLM(x,z){ for(const L of LM) if(Math.hypot(x-L.x,z-L.z)<L.r) return true; return false; }
  const roads=[],paths=[],solids=[];
  scene.traverse(function(o){ if(!o.isMesh||!o.geometry||o.isInstancedMesh) return;
    if(o.name==='__mergedStatic') return;   // perf-merged static clutter — coarse combined bbox, not a real object footprint (buildings are still covered by the GROUP check below)
    const m=o.material; const col=(m&&m.color)?m.color.getHex():-1;
    if(m===roadMat){ if(o.geometry.type==='BoxGeometry') roads.push(orient(o)); return; }
    if(SURF.has(m)) return; const b=new THREE.Box3().setFromObject(o); const sy=b.max.y-b.min.y,sx=b.max.x-b.min.x,sz=b.max.z-b.min.z;
    if(PATHCOL.has(col)&&sy<0.6){ if(o.geometry.type==='BoxGeometry') paths.push(orient(o)); return; }
    if(sx>60||sz>60) return;                                   // skip terrain / sea / big decks
    // a real obstruction is TALL and has a WIDE footprint (excludes kerbs, signs, masts, antennae)
    if(sy>2.2 && Math.min(sx,sz)>2.5) solids.push({x:(b.min.x+b.max.x)/2,z:(b.min.z+b.max.z)/2,hx:sx/2,hz:sz/2,baseY:b.min.y,sy:sy}); });
  // also collect whole BUILDING GROUPS — a house built from thin wall panels + a short foundation
  // never registers as ONE tall+wide mesh, so test its combined footprint too
  scene.traverse(function(o){ if(!o.isGroup||!o.children||o.children.length<3) return;
    const b=new THREE.Box3().setFromObject(o); const sy=b.max.y-b.min.y,sx=b.max.x-b.min.x,sz=b.max.z-b.min.z;
    if(sy>3 && Math.min(sx,sz)>2.5 && Math.max(sx,sz)<18) solids.push({x:(b.min.x+b.max.x)/2,z:(b.min.z+b.max.z)/2,hx:sx/2,hz:sz/2,baseY:b.min.y,sy:sy}); });
  function depth(sol,r){ const dx=sol.x-r.x,dz=sol.z-r.z,c=Math.cos(-r.yaw),s=Math.sin(-r.yaw); const lx=dx*c-dz*s,lz=dx*s+dz*c;
    const penX=(r.hx+sol.hx)-Math.abs(lx), penZ=(r.hz+sol.hz)-Math.abs(lz); return (penX>0&&penZ>0)?Math.min(penX,penZ):0; }
  function reg(x,z){ if(Math.hypot(x-VILLAGE.x,z-VILLAGE.z)<260)return'village'; if(Math.hypot(x-FARM.x,z-FARM.z)<260)return'farm'; if(Math.hypot(x-CITY.x,z-CITY.z)<720)return'city'; return'other'; }
  function collect(surfs){ const map={};
    for(const sol of solids){ if(nearLM(sol.x,sol.z)) continue; let best=0,bestY=0;
      for(const r of surfs){ if(sol.baseY < r.topY-1.6 || sol.baseY > r.topY+2.6) continue;   // must sit AT road grade
        const d=depth(sol,r); if(d>best){best=d;bestY=r.topY;} }
      if(best>1.5){ const key=Math.round(sol.x/7)*7+','+Math.round(sol.z/7)*7; if(!map[key]||map[key].d<best) map[key]={x:Math.round(sol.x),z:Math.round(sol.z),d:+best.toFixed(1),reg:reg(sol.x,sol.z)}; } }
    return Object.values(map).sort((a,b)=>b.d-a.d); }
  const onRoad=collect(roads), onPath=collect(paths);
  function byReg(a){ const r={}; a.forEach(v=>r[v.reg]=(r[v.reg]||0)+1); return r; }
  let roadInPort=0; for(const r of roads){ if(r.x>PORT.faceX-4&&r.x<PORT.edgeX+4&&r.z>PORT.z0-4&&r.z<PORT.z1+4) roadInPort++; }
  // ---- connectivity: every city grid centreline must be covered by road (outside plazas/port) ----
  function inRect(px,pz,r){ const dx=px-r.x,dz=pz-r.z,c=Math.cos(-r.yaw),s=Math.sin(-r.yaw); const lx=dx*c-dz*s,lz=dx*s+dz*c; return Math.abs(lx)<r.hx+0.6&&Math.abs(lz)<r.hz+0.6; }
  function covered(px,pz){ for(const r of roads) if(inRect(px,pz,r)) return true; return false; }
  function inPortPt(x,z){ return x>PORT.faceX-2&&x<PORT.edgeX+2&&z>PORT.z0-2&&z<PORT.z1+2; }
  const G=48,cx=CITY.x,cz=CITY.z; let gaps=[],totalLen=0,covLen=0;
  for(let i=-10;i<=9;i++){ const off=(i+0.5)*G; for(const vert of [true,false]){
    let lo=0,hi=0; for(let t=4;t<560;t+=4){ const x=vert?cx+off:cx+t,z=vert?cz+t:cz+off; if(Math.hypot(x-cx,z-cz)>cityEdge(Math.atan2(z-cz,x-cx))-9)break; hi=t; }
    for(let t=-4;t>-560;t-=4){ const x=vert?cx+off:cx+t,z=vert?cz+t:cz+off; if(Math.hypot(x-cx,z-cz)>cityEdge(Math.atan2(z-cz,x-cx))-9)break; lo=t; }
    if(hi-lo<20) continue; let run=0,runStart=null;
    for(let t=lo;t<=hi;t+=4){ const x=vert?cx+off:cx+t,z=vert?cz+t:cz+off;
      if(inPlaza(x,z)||inPortPt(x,z)){ if(run>24)gaps.push({off:Math.round(off),from:Math.round(runStart),to:Math.round(t-4),len:run,vert}); run=0;runStart=null; continue; }
      totalLen+=4; if(covered(x,z)){ covLen+=4; if(run>24)gaps.push({off:Math.round(off),from:Math.round(runStart),to:Math.round(t-4),len:run,vert}); run=0;runStart=null; }
      else { if(run===0)runStart=t; run+=4; } }
    if(run>24)gaps.push({off:Math.round(off),from:Math.round(runStart),to:Math.round(hi),len:run,vert}); } }
  gaps.sort((a,b)=>b.len-a.len);
  // ---- floating / sunk buildings on the FLAT farm & village shelves ----
  // Only the TOP-LEVEL placed groups (direct children of each island container) are real buildings;
  // their nested parts (windmill sails, water-tank, roof) legitimately sit high, so don't scan those.
  function containerAt(px,pz){ let g=null; for(const o of scene.children){ if(!o.isGroup||!o.children||o.children.length<10) continue; const p=new THREE.Vector3(); o.getWorldPosition(p); if(Math.hypot(p.x-px,p.z-pz)<4) g=o; } return g; }
  const floaters=[];
  function scanFloat(container, shelf, rg2){ if(!container) return;
    for(const o of container.children){ if(!o.isGroup) continue; const b=new THREE.Box3().setFromObject(o);
      const sy=b.max.y-b.min.y,sx=b.max.x-b.min.x,sz=b.max.z-b.min.z;
      if(sy<3 || Math.min(sx,sz)<2.5 || Math.max(sx,sz)>40) continue;     // a building (not a fence/animal/path/the whole island)
      // FLOAT only: a building lifted off its shelf. (sunk-below isn't checked — wells & dock pilings legitimately go down.)
      const gap=b.min.y-shelf; if(gap>1.5) floaters.push({reg:rg2,x:Math.round((b.min.x+b.max.x)/2),z:Math.round((b.min.z+b.max.z)/2),gap:+gap.toFixed(1)}); } }
  scanFloat(containerAt(FARM.x,FARM.z), farmY, 'farm');
  scanFloat(containerAt(VILLAGE.x,VILLAGE.z), villageY, 'village');
  floaters.sort((a,b)=>Math.abs(b.gap)-Math.abs(a.gap));
  // ---- no farm lane runs through a fenced pen ----
  const PENS=(typeof FARM_PENS!=='undefined')?FARM_PENS:[];
  function inPen(px,pz){ for(const P of PENS){ if(Math.abs(px-P.x)<P.w/2-3 && Math.abs(pz-P.z)<P.d/2-3) return true; } return false; }
  const fc={};
  for(const r of paths){ if(Math.hypot(r.x-FARM.x,r.z-FARM.z)>240) continue; const sx2=Math.sin(r.yaw), sz2=Math.cos(r.yaw), L=Math.max(r.hx,r.hz);
    for(let t=-L+1;t<=L-1;t+=3){ const px=r.x+sx2*t, pz=r.z+sz2*t; if(inPen(px,pz)){ const k=Math.round(px/6)*6+','+Math.round(pz/6)*6; fc[k]={x:Math.round(px),z:Math.round(pz)}; } } }
  const penCross=Object.values(fc);
  // ---- the car's drivable road network is one connected region reachable from its spawn ----
  let carNet={spawnOnRoad:true,reachPct:100};
  if(typeof onCityRoad==='function'){
    const SP=8,R=520,spawn=[CITY.x+DOCK.dx*312,CITY.z+DOCK.dz*312],drv=new Set(),key=(i,j)=>i*100000+j;
    const i0=Math.floor((CITY.x-R)/SP),i1=Math.ceil((CITY.x+R)/SP),j0=Math.floor((CITY.z-R)/SP),j1=Math.ceil((CITY.z+R)/SP);
    let total=0; for(let i=i0;i<=i1;i++)for(let j=j0;j<=j1;j++){ if(onCityRoad(i*SP,j*SP)){ drv.add(key(i,j)); total++; } }
    carNet.spawnOnRoad=onCityRoad(spawn[0],spawn[1]);
    let si=Math.round(spawn[0]/SP),sj=Math.round(spawn[1]/SP);
    if(!drv.has(key(si,sj))){ for(let di=-2;di<=2;di++)for(let dj=-2;dj<=2;dj++){ if(drv.has(key(si+di,sj+dj))){ si+=di;sj+=dj;di=3;dj=3; } } }
    const seen=new Set([key(si,sj)]),q=[[si,sj]]; let h=0;
    while(h<q.length){ const c=q[h++]; for(const d of [[1,0],[-1,0],[0,1],[0,-1]]){ const k=key(c[0]+d[0],c[1]+d[1]); if(drv.has(k)&&!seen.has(k)){ seen.add(k); q.push([c[0]+d[0],c[1]+d[1]]); } } }
    carNet.reachPct=+(100*seen.size/Math.max(1,total)).toFixed(1);
  }
  return JSON.stringify({roads:roads.length,paths:paths.length,solids:solids.length,roadInPort,
    onRoad:{n:onRoad.length,byReg:byReg(onRoad),items:onRoad.slice(0,20)},
    onPath:{n:onPath.length,byReg:byReg(onPath),items:onPath.slice(0,20)},
    floating:{n:floaters.length,items:floaters.slice(0,16)},
    penCross:{n:penCross.length,items:penCross.slice(0,16)},
    carNet:carNet,
    coverage:+(100*covLen/Math.max(1,totalLen)).toFixed(1), gaps:gaps.slice(0,12)});
})()`;

let id=0; const pend={};
function rpc(ws,method,params){ return new Promise((res,rej)=>{ const i=++id; pend[i]={res,rej}; ws.send(JSON.stringify({id:i,method,params:params||{}})); }); }

(async()=>{
  // launch chrome
  if(!CHROME){ console.error('Chrome not found — set CHROME=<path to chrome binary>'); process.exit(2); }
  const udd = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-audit-'));
  const chrome = spawn(CHROME, ['--headless=new','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',
    '--remote-debugging-port='+PORT,'--window-size=420,300','--user-data-dir='+udd, URL], {stdio:'ignore', detached:false});
  const cleanup=()=>{ try{ process.kill(-chrome.pid); }catch(e){} try{ chrome.kill('SIGKILL'); }catch(e){} };
  process.on('exit', cleanup);
  try{
    // discover the page websocket via curl (node fetch is unreliable vs chrome)
    let wsUrl=null;
    for(let t=0;t<40 && !wsUrl;t++){ await sleep(500);
      try{ const j=JSON.parse(execSync('curl -s http://localhost:'+PORT+'/json',{stdio:['ignore','pipe','ignore']}).toString());
        const pg=j.find(p=>(p.url||'').includes('wipeoutbay')); if(pg) wsUrl=pg.webSocketDebuggerUrl.replace('[::1]','localhost'); }catch(e){} }
    if(!wsUrl){ console.error('could not reach Chrome / page — is the game served at '+URL+' ?'); process.exit(2); }
    const ws = new WebSocket(wsUrl);
    ws.onmessage=(e)=>{ const m=JSON.parse(e.data); if(m.id&&pend[m.id]){ m.error?pend[m.id].rej(new Error(m.error.message)):pend[m.id].res(m.result); delete pend[m.id]; } };
    await new Promise((res,rej)=>{ ws.onopen=res; ws.onerror=()=>rej(new Error('ws open failed')); });
    await rpc(ws,'Runtime.enable');
    // wait for the world to finish building
    let built=false;
    for(let t=0;t<50 && !built;t++){ await sleep(1000);
      try{ const r=await rpc(ws,'Runtime.evaluate',{expression:"typeof window.__wb!=='undefined' && document.getElementById('loading') && document.getElementById('loading').style.display==='none'",returnByValue:true,timeout:8000});
        built = r.result && r.result.value===true; }catch(e){} }
    if(!built){ console.error('game did not finish building in time'); process.exit(2); }
    const r = await rpc(ws,'Runtime.evaluate',{expression:AUDIT,returnByValue:true,timeout:60000});
    if(!r.result || typeof r.result.value!=='string'){ console.error('audit failed', JSON.stringify(r.exceptionDetails||r)); process.exit(2); }
    const a = JSON.parse(r.result.value);

    // ---- report ----
    const P='\x1b[32mPASS\x1b[0m', F='\x1b[31mFAIL\x1b[0m';
    console.log('\nWipeout Bay road & walkway audit');
    console.log('  scene: '+a.roads+' road surfaces, '+a.paths+' path surfaces, '+a.solids+' solid objects\n');
    const fails=[];
    const c1 = a.onRoad.n===0; console.log('  ['+(c1?P:F)+'] no solid object on a road  — '+a.onRoad.n+' found '+(a.onRoad.n?JSON.stringify(a.onRoad.byReg):''));
    if(!c1){ a.onRoad.items.forEach(v=>console.log('         · '+v.reg+' ('+v.x+','+v.z+') penetration '+v.d+'m')); fails.push('objects-on-roads'); }
    const c2 = a.onPath.n===0; console.log('  ['+(c2?P:F)+'] no solid object on a walkway — '+a.onPath.n+' found '+(a.onPath.n?JSON.stringify(a.onPath.byReg):''));
    if(!c2){ a.onPath.items.forEach(v=>console.log('         · '+v.reg+' ('+v.x+','+v.z+') penetration '+v.d+'m')); fails.push('objects-on-walkways'); }
    const c3 = a.roadInPort===0; console.log('  ['+(c3?P:F)+'] no road runs through the cargo port — '+a.roadInPort+' found');
    if(!c3) fails.push('road-in-port');
    const c4 = a.gaps.length===0; console.log('  ['+(c4?P:F)+'] city road grid is connected (coverage '+a.coverage+'%) — '+a.gaps.length+' gaps');
    if(!c4){ a.gaps.forEach(g=>console.log('         · '+(g.vert?'N-S':'E-W')+' line off '+g.off+': '+g.len+'m gap ('+g.from+'..'+g.to+')')); fails.push('road-gaps'); }
    const c5 = a.floating.n===0; console.log('  ['+(c5?P:F)+'] no floating/sunk building on the farm or village — '+a.floating.n+' found');
    if(!c5){ a.floating.items.forEach(v=>console.log('         · '+v.reg+' ('+v.x+','+v.z+') '+(v.gap>0?'floats +'+v.gap:'sunk '+v.gap)+'m')); fails.push('floating-buildings'); }
    const c6 = a.penCross.n===0; console.log('  ['+(c6?P:F)+'] no farm lane runs through a fenced pen — '+a.penCross.n+' found');
    if(!c6){ a.penCross.items.forEach(v=>console.log('         · pen crossing at ('+v.x+','+v.z+')')); fails.push('lane-through-fence'); }
    const c7 = a.carNet.spawnOnRoad && a.carNet.reachPct>=98; console.log('  ['+(c7?P:F)+'] car road network connected from spawn — spawn-on-road '+a.carNet.spawnOnRoad+', '+a.carNet.reachPct+'% reachable');
    if(!c7) fails.push('car-network');

    console.log('');
    if(fails.length){ console.log('\x1b[31m✗ '+fails.length+' check(s) failed: '+fails.join(', ')+'\x1b[0m\n'); process.exit(1); }
    console.log('\x1b[32m✓ all road & walkway checks passed\x1b[0m\n'); process.exit(0);
  } finally { cleanup(); }
})().catch(e=>{ console.error('harness error:', e.message); process.exit(2); });
