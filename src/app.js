/* =====================================================================
   共享引擎：渲染器 / 相机 / 控制器 / 标签渲染器 / 灯光 / 主循环框架
   两个视图（SN2 亲核取代、智能敷料分层）共用一套引擎，各用独立 scene。
   ===================================================================== */
const canvasBox = document.getElementById('canvasBox');
const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
renderer.setSize(canvasBox.clientWidth, canvasBox.clientHeight);
canvasBox.appendChild(renderer.domElement);

const sceneSN2 = new THREE.Scene();
sceneSN2.background = new THREE.Color('#FAFAFA');
sceneSN2.fog = new THREE.Fog('#FAFAFA', 22, 40);
const sceneDressing = new THREE.Scene();
sceneDressing.background = new THREE.Color('#FAFAFA');
sceneDressing.fog = new THREE.Fog('#FAFAFA', 22, 40);
const sceneAssembly = new THREE.Scene();
sceneAssembly.background = new THREE.Color('#FAFAFA');
sceneAssembly.visible = false;
// 组装场景灯光
sceneAssembly.add(new THREE.AmbientLight(0xffffff, 0.7));
const asmDir = new THREE.DirectionalLight(0xffffff, 0.9); asmDir.position.set(4, 8, 6); sceneAssembly.add(asmDir);
const asmDir2 = new THREE.DirectionalLight(0xffffff, 0.3); asmDir2.position.set(-4, 3, -5); sceneAssembly.add(asmDir2);
// 地面网格（辅助定位）
const asmGrid = new THREE.GridHelper(10, 20, 0xD4D4D8, 0xE4E4E7);
asmGrid.position.y = -0.001;
sceneAssembly.add(asmGrid);

const camera = new THREE.PerspectiveCamera(45, canvasBox.clientWidth/canvasBox.clientHeight, 0.1, 200);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.enableZoom = true; controls.enablePan = true; controls.zoomSpeed = 1.1;
controls.minDistance = 2.5; controls.maxDistance = 28;
renderer.domElement.style.touchAction = 'none'; // 防止浏览器手势抢占，保证拖拽/缩放/平移都由 OrbitControls 接管

// CSS2D 标签渲染器（DOM 标签，天然面向相机）
const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(canvasBox.clientWidth, canvasBox.clientHeight);
labelRenderer.domElement.style.position='absolute'; labelRenderer.domElement.style.inset='0'; labelRenderer.domElement.style.pointerEvents='none';
canvasBox.appendChild(labelRenderer.domElement);

// 视图管理
let activeView = 'sn2';
function switchView(name){
  if(name===activeView) return;
  if(activeView==='sn2'){ playing=false; playBtnUI(); clearSelection(); }
  else if(activeView==='dressing'){ dressingPlaying=false; dressingPlayBtnUI(); dressingClearSelection(); }
  activeView=name;
  document.querySelectorAll('.view-tab').forEach(b=>b.classList.toggle('active', b.dataset.view===name));
  document.getElementById('view-sn2').style.display      = name==='sn2'?'':'none';
  document.getElementById('view-dressing').style.display = name==='dressing'?'':'none';
  document.getElementById('view-assembly').style.display  = name==='assembly'?'':'none';
  document.getElementById('dock-sn2').style.display      = name==='sn2'?'':'none';
  document.getElementById('dock-dressing').style.display = name==='dressing'?'':'none';
  document.getElementById('dock-assembly').style.display = name==='assembly'?'':'none';
  document.getElementById('badgeSn2').style.display      = name==='sn2'?'':'none';
  document.getElementById('badgeDressing').style.display = name==='dressing'?'':'none';
  document.getElementById('badgeAssembly').style.display  = name==='assembly'?'':'none';
  sceneSN2.visible      = name==='sn2';
  sceneDressing.visible = name==='dressing';
  sceneAssembly.visible = name==='assembly';
  // CSS2DRenderer 不主动移除切走场景的标签 DOM，切换后清空，下一帧按当前场景重建
  labelRenderer.domElement.innerHTML = '';
  if(viewTween){ viewTween=null; controls.enabled=true; }
  if(name==='sn2'){
    camera.position.set(...DEFAULT_CAM.pos);
    controls.target.set(...DEFAULT_CAM.target);
    refreshStageUI(time);
  } else if(name==='dressing'){
    camera.position.set(...DRESSING_DEFAULT_CAM.pos);
    controls.target.set(...DRESSING_DEFAULT_CAM.target);
    dressingRefreshStageUI(dressingTime);
  } else if(name==='assembly'){
    camera.position.set(0, 3.5, 9);
    controls.target.set(0, 0.5, 0);
    assemblyMode = true;
    document.getElementById('btnAssemblyMode').classList.add('on');
    controls.enabled = false;
    setStatus('组装模式：左侧托盘选原子，点击地面放置；成键连线');
    refreshAssemblyUI();
  }
}
document.querySelectorAll('.view-tab').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view)));

function renderOnce(){
  const sc = activeView==='sn2' ? sceneSN2 : activeView==='dressing' ? sceneDressing : sceneAssembly;
  renderer.render(sc, camera); labelRenderer.render(sc, camera);
}

function onResize(){
  const w=canvasBox.clientWidth, h=canvasBox.clientHeight;
  if(!w || !h) return;
  camera.aspect=w/h; camera.updateProjectionMatrix();
  renderer.setSize(w,h); labelRenderer.setSize(w,h);
  renderOnce();   // 窗口在后台时 rAF 会被节流，尺寸变完后先画一帧，避免留白
}
window.addEventListener('resize',onResize);
// 首次加载时 Dock/托盘还没撑开，clientHeight 会偏小；补两拍，并用 ResizeObserver 长期跟随
requestAnimationFrame(()=>onResize());
setTimeout(onResize, 350);
try{ new ResizeObserver(()=>onResize()).observe(canvasBox); }catch(e){}

// 帧率降级：持续低帧率则自动关闭粒子
let fpsAcc=0, fpsN=0, fpsAvg=60, degraded=false;
function onFps(dt){ fpsAcc+=dt; fpsN++;
  if(fpsN>=30){ fpsAvg=1000/(fpsAcc/fpsN); fpsAcc=0; fpsN=0;
    if(fpsAvg<26 && !degraded){ degraded=true; flowsVisible=false; dressingFlowsVisible=false;
      document.getElementById('chkFlow').checked=false; document.getElementById('chkDressingFlow').checked=false;
      document.getElementById('fpsNote').style.display='block'; }
    if(fpsAvg>34 && degraded){ degraded=false; flowsVisible=true; dressingFlowsVisible=true;
      document.getElementById('chkFlow').checked=true; document.getElementById('chkDressingFlow').checked=true;
      document.getElementById('fpsNote').style.display='none'; }
  }
}

/* =====================================================================
   视图 A：SN2 亲核取代机理
   ===================================================================== */

/* ---------- 可调参数区（机理设定不变）---------- */
const TOTAL = 12.5;

const STAGES = [
  {id:0, title:"反应物：CH₃Br 与 OH⁻",
   desc:"OH⁻ 从卤代烷的背面靠近碳原子——SN2 的关键是“背面进攻”。"},
  {id:1, title:"背面进攻",
   desc:"OH⁻ 沿碳–溴键的延长线逼近碳，碳原子开始接受亲核试剂的孤对电子。"},
  {id:2, title:"过渡态（五配位三角双锥）",
   desc:"O 与 Br 分居碳两侧成 180°，三个氢平铺赤道面（120°）；C–O 与 C–Br 半成键半断键，电子同步转移。"},
  {id:3, title:"断键与反转（瓦尔登翻转）",
   desc:"Br⁻ 携带 C–Br 键电子对离开，碳上的三个氢翻到另一侧，构型反转。"},
  {id:4, title:"产物：CH₃OH 与 Br⁻",
   desc:"生成甲醇与游离溴离子，取代一步完成，没有中间体。"}
];
(function(){ let t=0; const seg=[0,2.5,5.5,8.5,11.5,TOTAL];
  STAGES.forEach((s,i)=>{s.start=seg[i]; s.end=seg[i+1];}); })();

const KEYFRAMES = [
  {t:0.0, P:{C:[0,0,0], h1:[0.217,0.613,0.000], h2:[0.217,-0.306,0.531], h3:[0.217,-0.306,-0.531],
            Br:[-1.17,0,0], O:[4.50,0.65,0], NuH:[5.12,0.85,0.20]},
   bonds:{CBr:1.0, CO:0.0}},
  {t:2.5, P:{C:[0,0,0], h1:[0.217,0.613,0.000], h2:[0.217,-0.306,0.531], h3:[0.217,-0.306,-0.531],
            Br:[-1.17,0,0], O:[2.00,0.40,0], NuH:[2.62,0.60,0.20]},
   bonds:{CBr:1.0, CO:0.0}},
  {t:5.5, P:{C:[0,0,0], h1:[0.000,0.650,0.000], h2:[0.000,-0.325,0.563], h3:[0.000,-0.325,-0.563],
            Br:[-1.60,0,0], O:[0.86,0,0], NuH:[1.32,0.32,0.18]},
   bonds:{CBr:0.35, CO:0.65}},
  {t:8.5, P:{C:[0,0,0], h1:[-0.217,0.613,0.000], h2:[-0.217,-0.306,0.531], h3:[-0.217,-0.306,-0.531],
            Br:[-3.40,0.30,0], O:[0.86,0,0], NuH:[1.32,0.32,0.18]},
   bonds:{CBr:0.0, CO:1.0}},
  {t:11.5,P:{C:[0,0,0], h1:[-0.217,0.613,0.000], h2:[-0.217,-0.306,0.531], h3:[-0.217,-0.306,-0.531],
            Br:[-3.70,0.20,0], O:[0.86,0,0], NuH:[1.32,0.32,0.18]},
   bonds:{CBr:0.0, CO:1.0}},
  {t:12.5,P:{C:[0,0,0], h1:[-0.217,0.613,0.000], h2:[-0.217,-0.306,0.531], h3:[-0.217,-0.306,-0.531],
            Br:[-3.70,0.20,0], O:[0.86,0,0], NuH:[1.32,0.32,0.18]},
   bonds:{CBr:0.0, CO:1.0}}
];

const SPECIES = {
  C:  {name:"碳 C（反应中心）",  desc:"SN2 的反应中心。反应中它的三个氢从一侧翻到另一侧，构型反转，但始终保持着四面体配位（过渡态时暂时被“压平”）。"},
  h1: {name:"氢 H",              desc:"碳上的取代基之一。随反应发生，从进攻侧的对面翻转过去，正是瓦尔登反转的可视化表现。"},
  h2: {name:"氢 H",              desc:"同上，与 h1/h3 共同构成碳上的“三脚架”，在过渡态向外张开、随后翻到另一侧。"},
  h3: {name:"氢 H",              desc:"同上，与 h1/h2 共同构成碳上的“三脚架”。"},
  Br: {name:"溴 Br（离去基团）", desc:"C–Br 键的电子对被溴带走，Br 以 Br⁻ 的形式离开。良好的离去基团是 SN2 能发生的条件之一。"},
  O:  {name:"氧 O（亲核试剂）",  desc:"OH⁻ 的氧带有孤对电子，从背面进攻碳。富电子的亲核试剂是 SN2 的另一必要条件。"},
  NuH:{name:"氢 H（OH⁻ 的 H）",  desc:"属于亲核试剂 OH⁻，与氧一起整体参与反应，最终成为产物甲醇（CH₃OH）上的羟基氢。"}
};

const VIEWS = {
  front:{pos:[0.0,0.4,8.8],  target:[0,0,0]},
  side :{pos:[8.8,0.2,0.2],  target:[0,0,0]},
  top  :{pos:[0.2,8.8,0.2],  target:[0,0,0]}
};
const DEFAULT_CAM = {pos:[5.2,2.6,6.4], target:[0,0,0]};

const FLOWS = [
  {a:"O",   b:"C",  win:[1.0,5.5], label:"O 孤对电子 → C（成键）"},
  {a:"C",   b:"Br", win:[3.5,8.5], label:"C–Br 键电子 → Br（离去）"}
];

/* ---------- SN2 场景构建 ---------- */
const ELEM = {C:'#5A6570', H:'#D9DEE2', Br:'#A23B2E', O:'#D94F4F'};
const R    = {C:0.30, H:0.20, Br:0.42, O:0.32};

const atoms = {};
const clickables = [];
const bondMeshes = {};

function sphere(el, r){
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(r, 28, 22),
    new THREE.MeshStandardMaterial({color:ELEM[el], roughness:0.45, metalness:0.05})
  );
  return m;
}
function bondMesh(){
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09,0.09,1,10),
    new THREE.MeshStandardMaterial({color:'#52525B', transparent:true, opacity:1})
  );
  sceneSN2.add(m); return m;
}
function placeBond(mesh, a, b, op){
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  const dir = new THREE.Vector3().subVectors(b,a);
  const len = dir.length();
  mesh.scale.set(1, len, 1);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir.clone().normalize());
  mesh.material.opacity = op;
  mesh.visible = op > 0.01;
}
function atom(name, el, labelText){
  const mesh = sphere(el, R[el]);
  sceneSN2.add(mesh);
  const div = document.createElement('div');
  div.textContent = labelText;
  div.style.cssText = "background:rgba(255,255,255,.72);border:1px solid rgba(24,24,27,.08);border-radius:7px;"
    +"backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);padding:2px 8px;font-size:11px;color:#18181B;"
    +"font-weight:600;font-family:Inter,-apple-system,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;"
    +"white-space:nowrap;box-shadow:0 1px 2px rgba(24,24,27,.05);pointer-events:none;";
  const lbl = new CSS2DObject(div);
  lbl.position.set(0, R[el]+0.55, 0);
  sceneSN2.add(lbl);
  mesh.userData.species = name;
  mesh.userData.base = {el, emissive:0x000000};
  clickables.push(mesh);
  atoms[name] = {mesh, label:lbl, species:name};
}

atom('C',   'C',  'C');
atom('h1',  'H',  'H');
atom('h2',  'H',  'H');
atom('h3',  'H',  'H');
atom('Br',  'Br', 'Br');
atom('O',   'O',  'OH⁻');
atom('NuH', 'H',  'H');

bondMeshes.CH1=bondMesh(); bondMeshes.CH2=bondMesh(); bondMeshes.CH3=bondMesh();
bondMeshes.CBr=bondMesh(); bondMeshes.ONuH=bondMesh(); bondMeshes.CO=bondMesh();

sceneSN2.add(new THREE.AmbientLight(0xffffff, 0.75));
const key = new THREE.DirectionalLight(0xffffff, 1.1); key.position.set(6,8,5); sceneSN2.add(key);
const fill = new THREE.DirectionalLight(0xffffff, 0.35); fill.position.set(-5,3,-4); sceneSN2.add(fill);

const flowArrows=[], flowDots=[];
function makeFlow(f){
  const A = ()=>atoms[f.a].mesh.position.clone(), B=()=>atoms[f.b].mesh.position.clone();
  const arrow = new THREE.ArrowHelper(new THREE.Vector3(1,0,0), new THREE.Vector3(), 1, 0x3ECF8E, 0.18, 0.12);
  arrow.userData.makeFlow = true; sceneSN2.add(arrow);
  const dots=[];
  for(let i=0;i<9;i++){ const d=new THREE.Mesh(new THREE.SphereGeometry(0.07,10,10),
    new THREE.MeshBasicMaterial({color:0x3ECF8E})); sceneSN2.add(d); dots.push(d); }
  flowArrows.push({arrow, f, A, B});
  flowDots.push(...dots.map(d=>({mesh:d, f, A, B})));
}
FLOWS.forEach(makeFlow);
let flowsVisible = true;
function updateFlows(time){
  flowArrows.forEach(({arrow,f,A,B})=>{
    const on = f.win[0] <= time && time <= f.win[1];
    arrow.visible = flowsVisible && on;
    if(arrow.visible){
      const a=A(), b=B(), dir=b.clone().sub(a); const len=dir.length();
      arrow.position.copy(a); arrow.setDirection(dir.normalize()); arrow.setLength(len*0.8,0.18,0.12);
    }
  });
  flowDots.forEach(d=>{
    const on = d.f.win[0] <= time && time <= d.f.win[1];
    d.mesh.visible = flowsVisible && on;
    if(on){
      const p=( (time - d.f.win[0]) / (d.f.win[1]-d.f.win[0]) * 2.2 ) % 1;
      const a=d.A(), b=d.B();
      const off = flowDots.indexOf(d)/flowDots.length;
      const ph = (p + off) % 1;
      d.mesh.position.lerpVectors(a,b,ph);
    }
  });
}

function sample(time){
  if(time<=KEYFRAMES[0].t) return {P:firstP(), bonds:firstB()};
  let i=0; while(i<KEYFRAMES.length-1 && time>KEYFRAMES[i+1].t) i++;
  const k0=KEYFRAMES[i], k1=KEYFRAMES[i+1];
  const f = Math.min(1, Math.max(0,(time-k0.t)/(k1.t-k0.t)));
  const P={}, bonds={};
  for(const key in k0.P){ const a=k0.P[key], b=k1.P[key];
    P[key]=[a[0]+(b[0]-a[0])*f, a[1]+(b[1]-a[1])*f, a[2]+(b[2]-a[2])*f]; }
  for(const key in k0.bonds){ bonds[key]=k0.bonds[key]+(k1.bonds[key]-k0.bonds[key])*f; }
  return {P,bonds};
}
const firstP=()=>KEYFRAMES[0].P, firstB=()=>KEYFRAMES[0].bonds;

function applyPose(time){
  const {P,bonds}=sample(time);
  for(const key in P){ atoms[key].mesh.position.set(...P[key]);
    atoms[key].label.position.set(P[key][0], P[key][1]+R[atoms[key].mesh.userData.base.el]+0.55, P[key][2]); }
  placeBond(bondMeshes.CH1, atoms.C.mesh.position, atoms.h1.mesh.position, 1);
  placeBond(bondMeshes.CH2, atoms.C.mesh.position, atoms.h2.mesh.position, 1);
  placeBond(bondMeshes.CH3, atoms.C.mesh.position, atoms.h3.mesh.position, 1);
  placeBond(bondMeshes.CBr, atoms.C.mesh.position, atoms.Br.mesh.position, bonds.CBr);
  placeBond(bondMeshes.ONuH, atoms.O.mesh.position, atoms.NuH.mesh.position, 1);
  placeBond(bondMeshes.CO,   atoms.C.mesh.position, atoms.O.mesh.position, bonds.CO);
}

function currentStage(time){
  let s=0; STAGES.forEach((st,i)=>{ if(time>=st.start) s=i; }); return s;
}
function refreshStageUI(time){
  const s=currentStage(time);
  document.querySelectorAll('#stageList .stage-item').forEach((el,i)=>{
    el.classList.toggle('active', i===s);
  });
  document.getElementById('stageNow').innerHTML = `当前：<b>${STAGES[s].title}</b>`;
  const C=atoms.C.label.element, O=atoms.O.label.element, Br=atoms.Br.label.element;
  if(s>=3){ C.textContent='C（CH₃OH）'; O.textContent='O（CH₃OH）'; Br.textContent='Br⁻'; }
  else    { C.textContent='C';          O.textContent='OH⁻';       Br.textContent='Br'; }
}

let time=0, playing=false;
const timeline=document.getElementById('timeline'), timeLabel=document.getElementById('timeLabel');
const ICON_PLAY='<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M8 5.14v13.72c0 .9.97 1.44 1.75.97l10.5-6.86a1.13 1.13 0 0 0 0-1.94L9.75 4.17A1.14 1.14 0 0 0 8 5.14Z"/></svg>';
const ICON_PAUSE='<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1"/><rect x="13.5" y="5" width="4" height="14" rx="1"/></svg>';
function playBtnUI(){ btnPlay.innerHTML = playing ? ICON_PAUSE+'<span>暂停</span>' : ICON_PLAY+'<span>播放</span>'; }
function syncTimelineUI(){
  timeline.value = time/TOTAL*1000;
  timeLabel.textContent=time.toFixed(1)+'s';
  timeline.style.setProperty('--fill', (time/TOTAL*100).toFixed(1)+'%');
}
timeline.addEventListener('input',()=>{ time=timeline.value/1000*TOTAL; syncTimelineUI(); refreshStageUI(time); });
const btnPlay=document.getElementById('btnPlay');
btnPlay.addEventListener('click',()=>{ playing=!playing; playBtnUI(); });
document.getElementById('btnPrev').addEventListener('click',()=>{ time=Math.max(0,STAGES[Math.max(0,currentStage(time)-1)].start); syncTimelineUI(); refreshStageUI(time); });
document.getElementById('btnNext').addEventListener('click',()=>{ const s=currentStage(time);
  if(s<STAGES.length-1){ time=STAGES[s+1].start; syncTimelineUI(); refreshStageUI(time);} });

let viewTween=null;
function animateCameraTo(pos,target){
  const p0=camera.position.clone(), t0=controls.target.clone();
  const p1=new THREE.Vector3(...pos), t1=new THREE.Vector3(...target);
  viewTween={p0,t0,p1,t1,start:performance.now(),dur:900};
  controls.enabled=false;
}
document.querySelectorAll('#dock-sn2 [data-view]').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('#dock-sn2 [data-view]').forEach(x=>x.removeAttribute('data-active'));
  b.setAttribute('data-active','');
  const v=VIEWS[b.dataset.view]; animateCameraTo(v.pos,v.target);
}));
controls.addEventListener('start',()=>{ if(viewTween){ viewTween=null; controls.enabled=true; } });

document.getElementById('btnReset').addEventListener('click',()=>{
  playing=false; playBtnUI(); time=0; syncTimelineUI();
  controls.target.copy(new THREE.Vector3(...DEFAULT_CAM.target));
  camera.position.copy(new THREE.Vector3(...DEFAULT_CAM.pos));
  if(viewTween){ viewTween=null; controls.enabled=true; } clearSelection(); refreshStageUI(time);
});

let selected=null;
const infoBody=document.getElementById('infoBody');
function clearSelection(){
  if(selected){ selected.forEach(m=>{ m.material.emissive.setHex(m.userData.base.emissive); }); selected=null;
    infoBody.innerHTML='<div class="placeholder">点击场景里的某个分子查看说明</div>'; }
}
const raycaster=new THREE.Raycaster();
let downPos=null;
renderer.domElement.addEventListener('pointerdown',e=>downPos={x:e.clientX,y:e.clientY});
renderer.domElement.addEventListener('pointerup',e=>{
  if(activeView!=='sn2') return;
  if(!downPos) return;
  const moved=Math.hypot(e.clientX-downPos.x, e.clientY-downPos.y);
  downPos=null; if(moved>6) return; // 判定为拖拽，不响应点击
  const rect=renderer.domElement.getBoundingClientRect();
  const ndc=new THREE.Vector2(((e.clientX-rect.left)/rect.width)*2-1, -((e.clientY-rect.top)/rect.height)*2+1);
  raycaster.setFromCamera(ndc,camera);
  const hit=raycaster.intersectObjects(clickables,false)[0];
  clearSelection();
  if(hit){
    const sp=hit.object.userData.species;
    const info=SPECIES[sp];
    const meshes=[hit.object];
    meshes.forEach(m=>{ m.material.emissive.setHex(0x10B981); });
    selected=meshes;
    infoBody.innerHTML=`<div class="species">${info.name}</div><div class="desc">${info.desc}</div>`;
  }
});

document.getElementById('chkFlow').addEventListener('change',e=>{ flowsVisible=e.target.checked; });

/* =====================================================================
   视图 B：智能敷料分层
   ===================================================================== */
/* ---------- 敷料参数 ---------- */
const DRESSING_TOTAL = 9;                // 渗液动画总时长（秒）
const W = 3.4, D = 2.2;                  // 敷料长宽
const LAYER_THICK = {base:0.34, flow:0.16, sense:0.22, top:0.08};
const LAYER_Y_MIN = {base:-1.06, flow:-0.52, sense:0.16, top:0.94};   // 合拢（e=0.15）
const LAYER_Y_MAX = {base:-1.08, flow:-0.62, sense:0.52, top:1.40};   // 展开（e=1.0，base 稳贴创面、仅上部三层拉开）
const layerDefs = [
  {id:'top',   thick:0.08, opacity:0.22},
  {id:'sense', thick:0.22, opacity:0.30},
  {id:'flow',  thick:0.16, opacity:0.26},
  {id:'base',  thick:0.34, opacity:0.34}
];
const WINDOWS = [
  {id:'wpH',  name:'pH 窗',      color:0x2563EB, label:'pH',    x:-0.92, z:-0.62,
   desc:'感染伤口偏碱，pH 指示剂变色（黄→蓝）。健康 4–6、感染≈8，差值大不易误判。'},
  {id:'wLIP', name:'脂肪酶窗',   color:0xF59E0B, label:'脂酶',  x:0.00,  z:-0.62,
   desc:'细菌分泌脂肪酶切断酯键→底物被切→黄→绿显色（Singh 2019 直接原型）。'},
  {id:'wPRO', name:'蛋白酶窗',   color:0xF97316, label:'蛋白酶',x:0.92,  z:-0.62,
   desc:'细菌分泌蛋白酶切断肽键→显色；床旁检测已有 WOUNDCHEK 商品化思路。'},
  {id:'wMPO', name:'MPO 窗',     color:0x8B5CF6, label:'MPO',   x:-0.92, z:0.62,
   desc:'中性粒细胞激活释放 MPO，紫色深浅对应感染活性区间 20–85 U/mL（PMC9408953）。'},
  {id:'wFLU', name:'荧光复核窗', color:0x10B981, label:'荧光',  x:0.00,  z:0.62,
   desc:'独立荧光通道，与比色信号互相印证，降低误判。'},
  {id:'wQC',  name:'质控对照窗', color:0xDC2626, label:'质控',  x:0.92,  z:0.62,
   desc:'“送分题”：任何有效渗液必显色；不显色→本次无效，从机制上防假阴性。'}
];
const DRESSING_LAYERS = [
  {id:'top',   name:'透明观察层', desc:'透明顶盖，透过它肉眼直接判读六个窗口的显色，无需开盖、不接触样品。'},
  {id:'sense', name:'传感层',     desc:'六窗阵列所在的反应板：pH、脂肪酶、蛋白酶、MPO 四个比色窗 + 荧光复核 + 质控对照。'},
  {id:'flow',  name:'导流层',     desc:'微流控通道把同一滴渗液均匀分到六个窗口——一源六窗，互不干扰。'},
  {id:'base',  name:'渗液接触层', desc:'亲肤水凝胶贴合伤口创面，吸收渗液作为样品入口，兼顾敷料透气。'}
];
const DRESSING_STAGES = [
  {id:0, title:'四层总览',  desc:'爆炸图看清内部：观察层 / 传感层 / 导流层 / 接触层。', act:'overview'},
  {id:1, title:'渗液路径',  desc:'同一滴渗液从接触层进入，沿导流层分流到六个窗口。', act:'flow'},
  {id:2, title:'六窗阵列',  desc:'三指标比色 + 荧光复核 + 质控对照，一次读全。',       act:'windows'},
  {id:3, title:'质控逻辑',  desc:'质控窗是“送分题”——不显色即本次无效，防假阴性。',   act:'qc'}
];
const DRESSING_VIEWS = {
  overall:{pos:[4.6,3.4,5.6],  target:[0,0.1,0]},
  top    :{pos:[0.05,7.4,0.05],target:[0,0.15,0]},
  side   :{pos:[6.6,0.4,0.1],  target:[0,0.1,0]}
};
const DRESSING_DEFAULT_CAM = {pos:[4.6,3.4,5.6], target:[0,0.1,0]};
const DRESSING_NAV_INFO = {
  overview:{name:'智能敷料 · 四层结构',
    desc:'整体思路：把“渗液 → 反应 → 显色”做成可贴敷的四层器件。观察层负责透明判读，传感层装载六个反应窗，导流层负责分液，接触层贴合伤口取样。'},
  flow:{name:'渗液路径 · 一源六窗',
    desc:'渗液在接触层被吸收后，经导流层微流控通道均匀分流到六个窗口。同一份样品并行读出多个信号，各窗互不干扰——这就是“一次读全”的关键。'},
  windows:{name:'六窗阵列 · 三指标 + 双保险',
    desc:'pH、脂肪酶、蛋白酶、MPO 四个比色窗对应不同感染线索；荧光复核窗与比色互相印证；质控对照窗保证结果可信。多信号正交，降低单指标误判。'},
  qc:{name:'质控逻辑 · 送分题',
    desc:'质控窗的显色与样品无关——任何有效渗液都应让它显色。如果质控窗不显色，说明渗液过稀、溶血或试剂失效，本次结果判定为“无效”，从机制上防假阴性。'}
};
const LABEL_CSS = "background:rgba(255,255,255,.72);border:1px solid rgba(24,24,27,.08);border-radius:7px;"
  +"backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);padding:2px 7px;font-size:10.5px;color:#18181B;"
  +"font-weight:600;font-family:Inter,-apple-system,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;"
  +"white-space:nowrap;box-shadow:0 1px 2px rgba(24,24,27,.05);pointer-events:none;";

/* ---------- 敷料场景构建 ---------- */
const layerMeshes={}, layerEdges={}, layerLabels={}, windowMeshes={}, windowLabels={}, channelMeshes=[];
const dressingClickables=[];
let entryMesh=null;
const dressingParticles=[];

function buildDressing(){
  layerDefs.forEach(L=>{
    const mat=L.id==='base'
      ? new THREE.MeshPhysicalMaterial({color:0xBEE9D2,roughness:0.2,metalness:0,transparent:true,opacity:0.4,clearcoat:0.7,clearcoatRoughness:0.22,side:THREE.DoubleSide}) // 亲肤水凝胶：湿润透明、带光泽
      : new THREE.MeshStandardMaterial({color:0xF1F5F9,roughness:0.75,metalness:0,transparent:true,opacity:L.opacity,side:THREE.DoubleSide});
    const m=new THREE.Mesh(new THREE.BoxGeometry(W,L.thick,D), mat);
    m.userData.layerId=L.id; sceneDressing.add(m); layerMeshes[L.id]=m; dressingClickables.push(m);
    const e=new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry),
      new THREE.LineBasicMaterial({color:0x18181B,transparent:true,opacity:0.28}));
    sceneDressing.add(e); layerEdges[L.id]=e;
    const div=document.createElement('div'); div.textContent=L.name; div.style.cssText=LABEL_CSS;
    const lbl=new CSS2DObject(div); sceneDressing.add(lbl); layerLabels[L.id]=lbl;
  });
  /* 创面基底：皮肤地台 + 泛红伤口区 + 渗出液垫（非点击对象，固定不动；
     爆炸展开时 base 稳贴创面、上部三层拉开，露出“渗液→反应→显色”的内部路径） */
  const SKIN_Y=-1.41; // 地台中心；上表面 -1.30，与 base 合拢位贴合
  const skinPad=new THREE.Mesh(new THREE.BoxGeometry(W+1.1,0.22,D+1.1),
    new THREE.MeshStandardMaterial({color:0xE8C7B2,roughness:0.95,metalness:0}));
  skinPad.position.y=SKIN_Y; sceneDressing.add(skinPad);
  const wound=new THREE.Mesh(new THREE.CylinderGeometry(0.62,0.62,0.03,32),
    new THREE.MeshStandardMaterial({color:0xE08E7C,roughness:0.85,metalness:0,transparent:true,opacity:0.9}));
  wound.position.y=SKIN_Y+0.11+0.015; sceneDressing.add(wound);   // 皮肤上表面，炎症泛红
  const exudate=new THREE.Mesh(new THREE.CylinderGeometry(0.5,0.5,0.05,32),
    new THREE.MeshStandardMaterial({color:0xD8C79E,roughness:0.35,metalness:0,transparent:true,opacity:0.62,emissive:0x8A7A4A,emissiveIntensity:0.15}));
  exudate.position.y=SKIN_Y+0.11+0.03+0.025; sceneDressing.add(exudate); // 创面渗出液薄垫
  WINDOWS.forEach(w=>{
    const m=new THREE.Mesh(new THREE.CylinderGeometry(0.17,0.17,0.05,28),
      new THREE.MeshStandardMaterial({color:0xffffff,roughness:0.35,metalness:0.05,transparent:true,opacity:0.95}));
    m.userData.windowId=w.id; sceneDressing.add(m); windowMeshes[w.id]=m; dressingClickables.push(m);
    const div=document.createElement('div'); div.textContent=w.label; div.style.cssText=LABEL_CSS;
    const lbl=new CSS2DObject(div); sceneDressing.add(lbl); windowLabels[w.id]=lbl;
  });
  WINDOWS.forEach(w=>{
    const len=Math.hypot(w.x,w.z);
    const m=new THREE.Mesh(new THREE.BoxGeometry(len,0.02,0.11),
      new THREE.MeshStandardMaterial({color:0x94A3B8,transparent:true,opacity:0.5,roughness:0.8,metalness:0}));
    m.position.set(w.x/2,0,w.z/2);
    m.rotation.y=-Math.atan2(w.z,w.x);
    sceneDressing.add(m); channelMeshes.push(m);
  });
  entryMesh=new THREE.Mesh(new THREE.SphereGeometry(0.15,24,18),
    new THREE.MeshStandardMaterial({color:0x3ECF8E,roughness:0.15,metalness:0,transparent:true,opacity:0.85,emissive:0x3ECF8E,emissiveIntensity:0.35}));
  entryMesh.scale.set(1,1.35,1); // 悬在入口的渗液滴（拉长呈水滴形）
  sceneDressing.add(entryMesh);
  for(let i=0;i<12;i++){
    const m=new THREE.Mesh(new THREE.SphereGeometry(0.07,12,12),
      new THREE.MeshStandardMaterial({color:0x3ECF8E,roughness:0.25,metalness:0,transparent:true,opacity:0.95,emissive:0x3ECF8E,emissiveIntensity:0.4}));
    sceneDressing.add(m);
    dressingParticles.push({mesh:m, wIndex:i%6, phase:(i*0.37)%1});
  }
  sceneDressing.add(new THREE.AmbientLight(0xffffff,0.75));
  const dk=new THREE.DirectionalLight(0xffffff,1.1); dk.position.set(6,8,5); sceneDressing.add(dk);
  const df=new THREE.DirectionalLight(0xffffff,0.35); df.position.set(-5,3,-4); sceneDressing.add(df);
}

/* ---------- 敷料状态与控制 ---------- */
let dressingTime=0, dressingPlaying=false, dressingFlowsVisible=true, dressingExplosion=0.45;
let dressingViewTween=null, dressingSelected=null;

function layerY(id){
  const k=(dressingExplosion-0.15)/0.85;
  return LAYER_Y_MIN[id]+(LAYER_Y_MAX[id]-LAYER_Y_MIN[id])*k;
}
function dressingApply(t){
  const yOf=layerY;
  layerDefs.forEach(L=>{
    const y=yOf(L.id);
    layerMeshes[L.id].position.y=y; layerEdges[L.id].position.y=y;
    const edge=layerEdges[L.id];
    edge.material.color.setHex(dressingSelected && dressingSelected.kind==='layer' && dressingSelected.id===L.id ? 0x22A06B : 0x18181B);
    edge.material.opacity=dressingSelected && dressingSelected.kind==='layer' && dressingSelected.id===L.id ? 0.9 : 0.28;
    layerLabels[L.id].position.set(W/2+0.62, y, 0);
  });
  channelMeshes.forEach(cm=>{ cm.position.y=yOf('flow')+0.10; });
  const sy=yOf('sense');
  WINDOWS.forEach((w,i)=>{
    windowMeshes[w.id].position.set(w.x, sy+LAYER_THICK.sense/2+0.03, w.z);
    windowLabels[w.id].position.set(w.x, sy+LAYER_THICK.sense/2+0.40, w.z);
    const on0=1.2+i*0.55, on1=2.2+i*0.55;
    const p=Math.min(1,Math.max(0,(t-on0)/(on1-on0)));
    const col=new THREE.Color(w.color);
    const mat=windowMeshes[w.id].material;
    mat.color.copy(new THREE.Color(0xffffff)).lerp(col,p);
    mat.emissive.copy(new THREE.Color(0x000000)).lerp(col,p*0.35);
  });
  if(t>=2.2+5*0.55){
    const f=windowMeshes.wFLU;
    f.material.emissiveIntensity=0.55+Math.sin(performance.now()/220)*0.25;
  }
  entryMesh.position.set(0, yOf('base')+LAYER_THICK.base/2+0.03, 0);
  const em=entryMesh.material;
  if(t<1.2){ em.opacity=0.6+Math.sin(performance.now()/180)*0.2; }          // 吸入前：液滴悬停微脉冲
  else { em.opacity=Math.max(0,0.8-(t-1.2)*0.55); }                          // 吸入后：液滴淡出
  const E=new THREE.Vector3(0, yOf('base')-LAYER_THICK.base/2-0.10, 0);      // 起点：创面渗出侧，穿过接触层被吸收
  const C=new THREE.Vector3(0, yOf('flow')+LAYER_THICK.flow/2+0.16, 0);
  dressingParticles.forEach(pt=>{
    const w=WINDOWS[pt.wIndex];
    const T=new THREE.Vector3(w.x, yOf('sense')+LAYER_THICK.sense/2+0.24, w.z);
    const pp=(t*0.5+pt.phase)%1;
    if(pp<0.3){ pt.mesh.position.lerpVectors(E,C,pp/0.3); pt.mesh.scale.set(1,1.5,1); pt.mesh.material.opacity=0.95; }
    else { pt.mesh.position.copy(C).lerp(T,(pp-0.3)/0.7); const s=0.62; pt.mesh.scale.set(s,s*1.3,s); pt.mesh.material.opacity=0.85; }
    pt.mesh.visible=dressingFlowsVisible;
  });
  // 选中窗高亮（每帧覆盖，取消选择即自动恢复显色态）
  if(dressingSelected && dressingSelected.kind==='window'){
    const m=windowMeshes[dressingSelected.id];
    m.material.emissive.setHex(0x10B981); m.material.emissiveIntensity=0.85;
  }
}

function dressingPlayBtnUI(){
  document.getElementById('dressingPlay').innerHTML =
    dressingPlaying ? ICON_PAUSE+'<span>暂停</span>' : ICON_PLAY+'<span>播放渗液</span>';
}
function dressingSyncTimelineUI(){
  const tl=document.getElementById('dressingTimeline');
  tl.value=dressingTime/DRESSING_TOTAL*1000;
  tl.style.setProperty('--fill',(dressingTime/DRESSING_TOTAL*100).toFixed(1)+'%');
  document.getElementById('dressingTimeLabel').textContent=dressingTime.toFixed(1)+'s';
}
function dressingRefreshStageUI(t){
  const labels=['渗液吸入接触层','六窗分流显色中','质控通过 · 本次结果可信','可判读：对照色卡分档'];
  const s=t<1.2 ? 0 : (t<2.2+5*0.55 ? 1 : (t<6.8 ? 2 : 3));
  document.getElementById('dressingStageNow').innerHTML=`当前：<b>${labels[s]}</b>`;
}
function dressingClearSelection(){
  dressingSelected=null;
  document.getElementById('dressingInfoBody').innerHTML='<div class="placeholder">点击场景里的层或窗口查看说明</div>';
}
function dressingSelect(kind,id){
  dressingSelected={kind,id};
  const body=document.getElementById('dressingInfoBody');
  if(kind==='layer'){
    const L=DRESSING_LAYERS.find(x=>x.id===id);
    body.innerHTML=`<div class="species">${L.name}</div><div class="desc">${L.desc}</div>`;
  } else {
    const w=WINDOWS.find(x=>x.id===id);
    body.innerHTML=`<div class="species">${w.name}</div><div class="desc">${w.desc}</div>`;
  }
}
function dressingAnimateCameraTo(pos,target){
  const p0=camera.position.clone(), t0=controls.target.clone();
  const p1=new THREE.Vector3(...pos), t1=new THREE.Vector3(...target);
  dressingViewTween={p0,t0,p1,t1,start:performance.now(),dur:900};
  controls.enabled=false;
}
function setExplosion(v){
  dressingExplosion=v/100;
  document.getElementById('explosion').value=v;
  document.getElementById('explosionLabel').textContent=(v/100).toFixed(2);
}
function dressingGo(act,itemEl){
  document.querySelectorAll('#dressingStageList .stage-item').forEach(el=>el.classList.remove('active'));
  if(itemEl) itemEl.classList.add('active');
  const body=document.getElementById('dressingInfoBody');
  const info=DRESSING_NAV_INFO[act];
  body.innerHTML=`<div class="species">${info.name}</div><div class="desc">${info.desc}</div>`;
  dressingSelected=null;
  if(act==='overview'){ setExplosion(50); dressingAnimateCameraTo(DRESSING_VIEWS.overall.pos,DRESSING_VIEWS.overall.target); }
  else if(act==='flow'){ setExplosion(35); dressingAnimateCameraTo(DRESSING_VIEWS.side.pos,DRESSING_VIEWS.side.target);
    dressingTime=2.8; dressingSyncTimelineUI(); dressingRefreshStageUI(dressingTime); }
  else if(act==='windows'){ setExplosion(50); dressingAnimateCameraTo(DRESSING_VIEWS.top.pos,DRESSING_VIEWS.top.target); }
  else if(act==='qc'){ setExplosion(50); dressingAnimateCameraTo(DRESSING_VIEWS.overall.pos,DRESSING_VIEWS.overall.target);
    dressingSelected={kind:'window',id:'wQC'};
    body.innerHTML=`<div class="species">${DRESSING_NAV_INFO.qc.name}</div><div class="desc">${DRESSING_NAV_INFO.qc.desc}</div>`; }
}

/* ---------- 敷料控件绑定 ---------- */
document.getElementById('dressingPlay').addEventListener('click',()=>{ dressingPlaying=!dressingPlaying; dressingPlayBtnUI(); });
document.getElementById('dressingReset').addEventListener('click',()=>{
  dressingPlaying=false; dressingPlayBtnUI(); dressingTime=0; dressingSyncTimelineUI();
  controls.target.copy(new THREE.Vector3(...DRESSING_DEFAULT_CAM.target));
  camera.position.copy(new THREE.Vector3(...DRESSING_DEFAULT_CAM.pos));
  if(dressingViewTween){ dressingViewTween=null; controls.enabled=true; }
  setExplosion(45); dressingClearSelection(); dressingRefreshStageUI(dressingTime);
});
document.querySelectorAll('#dock-dressing [data-dview]').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('#dock-dressing [data-dview]').forEach(x=>x.removeAttribute('data-active'));
  b.setAttribute('data-active','');
  const v=DRESSING_VIEWS[b.dataset.dview]; dressingAnimateCameraTo(v.pos,v.target);
}));
controls.addEventListener('start',()=>{ if(dressingViewTween){ dressingViewTween=null; controls.enabled=true; } });
document.getElementById('chkDressingFlow').addEventListener('change',e=>{ dressingFlowsVisible=e.target.checked; });
const explosionEl=document.getElementById('explosion');
explosionEl.addEventListener('input',()=>setExplosion(parseInt(explosionEl.value,10)));
const dtl=document.getElementById('dressingTimeline');
dtl.addEventListener('input',()=>{ dressingTime=parseInt(dtl.value,10)/1000*DRESSING_TOTAL; dressingSyncTimelineUI(); dressingRefreshStageUI(dressingTime); });

/* ---------- 敷料点击 ---------- */
renderer.domElement.addEventListener('pointerup',e=>{
  if(activeView!=='dressing') return;
  if(!downPos) return;
  const moved=Math.hypot(e.clientX-downPos.x, e.clientY-downPos.y);
  downPos=null; if(moved>6) return;
  const rect=renderer.domElement.getBoundingClientRect();
  const ndc=new THREE.Vector2(((e.clientX-rect.left)/rect.width)*2-1, -((e.clientY-rect.top)/rect.height)*2+1);
  raycaster.setFromCamera(ndc,camera);
  const hit=raycaster.intersectObjects(dressingClickables,false)[0];
  if(hit){
    const ud=hit.object.userData;
    if(ud.layerId) dressingSelect('layer',ud.layerId);
    else if(ud.windowId) dressingSelect('window',ud.windowId);
  } else { dressingClearSelection(); }
});

/* ---------- 敷料面板构建与初始化 ---------- */
const dressingStageList=document.getElementById('dressingStageList');
DRESSING_STAGES.forEach(s=>{
  const it=document.createElement('div'); it.className='stage-item';
  it.innerHTML=`<div class="n">0${s.id+1}</div><div class="t">${s.title}</div><div class="d">${s.desc}</div>`;
  it.addEventListener('click',()=>dressingGo(s.act,it));
  dressingStageList.appendChild(it);
});
document.getElementById('dressingStageCount').textContent=DRESSING_STAGES.length+' 项';
if(dressingStageList.children[0]) dressingStageList.children[0].classList.add('active');
buildDressing();
setExplosion(45);
dressingTime=0; dressingSyncTimelineUI(); dressingRefreshStageUI(0); dressingPlayBtnUI();
window.__appReady = true; // 自检标记：双场景已构建

// hash 路由：加载时直达指定视图（#dressing 智能敷料 / #sn2 亲核反应），便于分享与自检
if(location.hash==='#dressing'){ switchView('dressing'); }
else if(location.hash==='#sn2'){ switchView('sn2'); }

/* =====================================================================
   主循环
   ===================================================================== */
let last=performance.now();
function animate(now){
  requestAnimationFrame(animate);
  let dt=now-last; last=now; dt=Math.min(dt,60); onFps(dt);
  if(activeView==='sn2'){
    if(playing){ time+=dt/1000; if(time>=TOTAL){ time=TOTAL; playing=false; playBtnUI(); }
      syncTimelineUI(); refreshStageUI(time); }
    if(viewTween){
      const p=Math.min(1,(now-viewTween.start)/viewTween.dur);
      const e=p<0.5?2*p*p:1-Math.pow(-2*p+2,2)/2;
      camera.position.lerpVectors(viewTween.p0,viewTween.p1,e);
      controls.target.lerpVectors(viewTween.t0,viewTween.t1,e);
      if(p>=1){ viewTween=null; controls.enabled=true; }
    }
    applyPose(time);
    updateFlows(time);
  } else {
    if(dressingPlaying){ dressingTime+=dt/1000; if(dressingTime>=DRESSING_TOTAL){ dressingTime=DRESSING_TOTAL; dressingPlaying=false; dressingPlayBtnUI(); }
      dressingSyncTimelineUI(); dressingRefreshStageUI(dressingTime); }
    if(dressingViewTween){
      const p=Math.min(1,(now-dressingViewTween.start)/dressingViewTween.dur);
      const e=p<0.5?2*p*p:1-Math.pow(-2*p+2,2)/2;
      camera.position.lerpVectors(dressingViewTween.p0,dressingViewTween.p1,e);
      controls.target.lerpVectors(dressingViewTween.t0,dressingViewTween.t1,e);
      if(p>=1){ dressingViewTween=null; controls.enabled=true; }
    }
    dressingApply(dressingTime);
  }
  controls.update();
  const activeScene = activeView==='sn2' ? sceneSN2
                    : activeView==='dressing' ? sceneDressing
                    : sceneAssembly;
  renderer.render(activeScene, camera);
  labelRenderer.render(activeScene, camera);
}
requestAnimationFrame(animate);

// 构建左侧阶段列表 UI（SN2）
const stageList=document.getElementById('stageList');
STAGES.forEach(s=>{
  const it=document.createElement('div'); it.className='stage-item';
  it.innerHTML=`<div class="n">STEP ${s.id+1}</div><div class="t">${s.title}</div><div class="d">${s.desc}</div>`;
  it.addEventListener('click',()=>{ time=s.start; syncTimelineUI(); refreshStageUI(time); });
  stageList.appendChild(it);
});
document.getElementById('stageCount').textContent = STAGES.length+' 步';
refreshStageUI(0); syncTimelineUI(); playBtnUI();

/* =====================================================================
   分子组装模式（第三视图）
   ===================================================================== */
const CPK = {
  H:  {color:'#FFFFFF', size:0.22, valence:1},
  C:  {color:'#2D2D2D', size:0.38, valence:4},
  N:  {color:'#3B82F6', size:0.34, valence:3},
  O:  {color:'#EF4444', size:0.32, valence:2},
  Na: {color:'#9B59B6', size:0.42, valence:1},
  Mg: {color:'#8B5CF6', size:0.40, valence:2},
  Cl: {color:'#22C55E', size:0.42, valence:1},
};
const ELEMENTS = ['H','C','N','O','Na','Mg','Cl'];
const MOLECULE_LIBRARY = [
  {name:'水 Water',        formula:'H₂O',   counts:{H:2,O:1}},
  {name:'二氧化碳 CO₂',    formula:'CO₂',   counts:{C:1,O:2}},
  {name:'甲烷 CH₄',        formula:'CH₄',   counts:{C:1,H:4}},
  {name:'氨 NH₃',          formula:'NH₃',   counts:{N:1,H:3}},
  {name:'氯化氢 HCl',      formula:'HCl',   counts:{H:1,Cl:1}},
  {name:'氯化钠 NaCl',      formula:'NaCl',  counts:{Na:1,Cl:1}},
  {name:'氧气 O₂',         formula:'O₂',    counts:{O:2}},
  {name:'氢气 H₂',         formula:'H₂',    counts:{H:2}},
  {name:'氮气 N₂',         formula:'N₂',    counts:{N:2}},
  {name:'氯气 Cl₂',        formula:'Cl₂',   counts:{Cl:2}},
  {name:'甲醇 CH₃OH',      formula:'CH₃OH', counts:{C:1,O:1,H:4}},
  {name:'乙烯 C₂H₄',       formula:'C₂H₄',  counts:{C:2,H:4}},
  {name:'乙烷 C₂H₆',       formula:'C₂H₆',  counts:{C:2,H:6}},
];
let asmAtoms = [];
let asmBonds = [];
let nextAtomId = 1, nextBondId = 1;
let assemblyMode = false;
let bondingMode = false;
let selectedAtom = null;
let pendingBondAtom = null;
let placingElement = null;
let dragAtom = null;
let dragMolecule = null;
let dragStart = null;
let justDragged = false;
const asmRay = new THREE.Raycaster();
const asmMouse = new THREE.Vector2();

function setStatus(t){ document.getElementById('assemblyStatus').textContent = t; }
function sub(n){ return String(n).replace(/[0-9]/g,d=>'₀₁₂₃₄₅₆₇₈₉'[d]); }

const tray = document.getElementById('atomTray');
ELEMENTS.forEach(el=>{
  const btn = document.createElement('button');
  btn.className='atom-btn'; btn.dataset.element=el;
  btn.innerHTML = `<div class="atom-dot" style="background:${CPK[el].color}"></div>${el}`;
  btn.addEventListener('click',()=>{
    document.querySelectorAll('.atom-btn').forEach(b=>b.classList.remove('selected'));
    btn.classList.add('selected');
    if(bondingMode) exitBonding();
    placingElement = el;
    setStatus(`已选 ${el}，点击场景地面放置；Esc 取消选择`);
  });
  tray.appendChild(btn);
});

/* ================= 组装：数据 → 渲染 =================
   真值只有 atom.pos / bond.order；mesh 每帧从数据同步。 */

const BOND_STYLE = {
  1: { n: 1, r: 0.085, o: [0] },
  2: { n: 2, r: 0.055, o: [-0.11, 0.11] },
  3: { n: 3, r: 0.050, o: [-0.13, 0, 0.13] }
};

function setAtomPos(atom, p){
  atom.pos = { x:p.x, y:p.y, z:p.z };
  atom.mesh.position.set(p.x, p.y, p.z);
}

function highlightAtom(atom, on){
  if(!atom) return;
  if(on){ atom.mesh.material.emissive = new THREE.Color('#3ECF8E'); atom.mesh.material.emissiveIntensity = 0.55; }
  else  { atom.mesh.material.emissive = new THREE.Color(0x000000); atom.mesh.material.emissiveIntensity = 0; }
}

function addAtom(element, position){
  const cfg = CPK[element];
  const geo = new THREE.SphereGeometry(cfg.size, 24, 24);
  const mat = new THREE.MeshStandardMaterial({color:cfg.color, roughness:0.4, metalness:0.1});
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.atomId = nextAtomId;
  sceneAssembly.add(mesh);
  const atom = { id:nextAtomId++, element, pos:{x:position.x, y:position.y, z:position.z}, mesh, bonds:[] };
  mesh.position.set(atom.pos.x, atom.pos.y, atom.pos.z);
  asmAtoms.push(atom);
  return atom;
}
function getAtom(id){ return asmAtoms.find(a=>a.id===id); }

function toGraph(atoms){
  const set = new Set(atoms.map(a=>a.id));
  const bonds = asmBonds.filter(b=>set.has(b.a) && set.has(b.b));
  return {
    atoms: atoms.map(a=>({ id:a.id, el:a.element })),
    bonds: bonds.map(b=>({ id:b.id, a:b.a, b:b.b, order:b.order||1 }))
  };
}
function sumOrderOf(atomId){ return CHEM.bondSum(toGraph(asmAtoms), atomId); }
function remainingValence(atom){ return CHEM.cap(atom.element) - sumOrderOf(atom.id); }

function makeBondGroup(order){
  const st = BOND_STYLE[order] || BOND_STYLE[1];
  const g = new THREE.Group();
  st.o.forEach(off=>{
    const geo = new THREE.CylinderGeometry(st.r, st.r, 1, 12);
    const mat = new THREE.MeshStandardMaterial({
      color: order>1 ? '#7E858E' : '#9CA3AF', roughness:0.5, metalness:0.2
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(off, 0, 0);
    g.add(m);
  });
  return g;
}

function updateBondMesh(bond){
  const a = getAtom(bond.a), b = getAtom(bond.b);
  if(!a || !b) return;
  const pa = a.pos, pb = b.pos;
  const mid = new THREE.Vector3((pa.x+pb.x)/2, (pa.y+pb.y)/2, (pa.z+pb.z)/2);
  const dir = new THREE.Vector3(pb.x-pa.x, pb.y-pa.y, pb.z-pa.z);
  const L = dir.length() || 0.001;
  bond.mesh.position.copy(mid);
  bond.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir.normalize());
  bond.mesh.children.forEach(c=>{ c.scale.y = L; });
}

function disposeGroup(g){
  if(!g) return;
  g.traverse(o=>{ if(o.geometry) o.geometry.dispose(); if(o.material) o.material.dispose(); });
}

function rebuildBondMesh(bond){
  sceneAssembly.remove(bond.mesh);
  disposeGroup(bond.mesh);
  bond.mesh = makeBondGroup(bond.order||1);
  sceneAssembly.add(bond.mesh);
  updateBondMesh(bond);
}

function addBond(a, b, order){
  order = order || 1;
  const graph = toGraph(asmAtoms);
  if(!CHEM.canBond(graph, a.id, b.id, order)){
    const over = (CHEM.bondSum(graph,a.id) + order > CHEM.cap(a.element)) ? a : b;
    flashAtom(over);
    setStatus(`${over.element} 价键已满（上限 ${CHEM.cap(over.element)}），不能再成键`);
    return false;
  }
  const bond = { id:nextBondId++, a:a.id, b:b.id, order, mesh:null };
  a.bonds.push({ b:b.id, bond:bond.id });
  b.bonds.push({ a:a.id, bond:bond.id });
  asmBonds.push(bond);
  bond.mesh = makeBondGroup(order);
  sceneAssembly.add(bond.mesh);
  updateBondMesh(bond);
  refreshMolecules();
  arrangeMolecule(a);
  return true;
}

function removeBond(bond){
  const a = getAtom(bond.a), b = getAtom(bond.b);
  if(a) a.bonds = a.bonds.filter(x=>x.bond!==bond.id);
  if(b) b.bonds = b.bonds.filter(x=>x.bond!==bond.id);
  sceneAssembly.remove(bond.mesh);
  disposeGroup(bond.mesh);
  asmBonds = asmBonds.filter(x=>x.id!==bond.id);
}

function removeAtom(atom){
  [...atom.bonds].forEach(ba=>{ const bond=asmBonds.find(x=>x.id===ba.bond); if(bond) removeBond(bond); });
  sceneAssembly.remove(atom.mesh);
  atom.mesh.geometry.dispose(); atom.mesh.material.dispose();
  asmAtoms = asmAtoms.filter(x=>x.id!==atom.id);
  if(selectedAtom===atom) selectedAtom=null;
  if(pendingBondAtom===atom) pendingBondAtom=null;
  refreshMolecules();
  rebuildLonePairs();
}

function flashAtom(atom){
  if(!atom) return;
  const orig = atom.mesh.material.color.getHex();
  atom.mesh.material.color.set('#E5533D');
  setTimeout(()=>atom.mesh.material.color.set(orig), 280);
}

/* ---------- 几何整形：core 算出目标坐标，这里只做动画 ---------- */
let arranging = false, pendingPlan = null, arrangeDisabled = false;
let instantArrange = false;               // ?mol= 深链时置 true：直接落位，便于截图与复现

function planGeometry(atoms){
  const graph = toGraph(atoms);
  const res = CHEM.plan(graph);
  // 命中模板时把模板键级写回真实键
  Object.keys(res.orders).forEach(bid=>{
    const bond = asmBonds.find(b=>String(b.id)===String(bid));
    const target = res.orders[bid];
    if(bond && (bond.order||1)!==target){ bond.order = target; rebuildBondMesh(bond); }
  });
  return atoms.map(a=>({ atom:a, pos:res.pos[a.id] }));
}

function arrangeMolecule(seedAtom){
  if(arrangeDisabled) return;
  const mol = identifyMolecules().find(m=>m.group.some(a=>a.id===seedAtom.id));
  if(!mol || mol.group.length<2) return;
  if(arranging){ pendingPlan = mol; return; }
  startArrange(mol);
}

function startArrange(mol){
  const targets = planGeometry(mol.group);
  if(instantArrange){                     // 深链/截图模式：直接落位，不留中间态
    targets.forEach(t=>setAtomPos(t.atom, t.pos));
    asmBonds.forEach(b=>updateBondMesh(b));
    refreshMolecules(); rebuildLonePairs(); showReason(targets[0] && targets[0].atom);
    arranging = false;
    if(pendingPlan){ const next = pendingPlan; pendingPlan = null; startArrange(next); }
    return;
  }
  const starts = targets.map(t=>({ x:t.atom.pos.x, y:t.atom.pos.y, z:t.atom.pos.z }));
  arranging = true;
  const t0 = performance.now(), dur = 600;
  function step(now){
    let k = (now-t0)/dur; if(k>1) k=1;
    const e = 1-Math.pow(1-k,3);
    targets.forEach((t,i)=>{
      const s = starts[i], p = t.pos;
      setAtomPos(t.atom, { x:s.x+(p.x-s.x)*e, y:s.y+(p.y-s.y)*e, z:s.z+(p.z-s.z)*e });
    });
    asmBonds.forEach(b=>updateBondMesh(b));
    if(k<1) requestAnimationFrame(step);
    else {
      targets.forEach(t=>setAtomPos(t.atom, t.pos));
      asmBonds.forEach(b=>updateBondMesh(b));
      arranging = false;
      refreshMolecules();
      rebuildLonePairs();
      showReason(targets[0] && targets[0].atom);
      if(pendingPlan){ const next = pendingPlan; pendingPlan = null; startArrange(next); }
    }
  }
  requestAnimationFrame(step);
}

/* ---------- 孤对电子 ---------- */
let lonePairOn = false;
let lpMeshes = [];

function neighborDirs(atom){
  const out = [];
  atom.bonds.forEach(ba=>{
    const nb = getAtom(ba.b);
    if(!nb) return;
    out.push(new THREE.Vector3(nb.pos.x-atom.pos.x, nb.pos.y-atom.pos.y, nb.pos.z-atom.pos.z).normalize());
  });
  return out;
}

function lonePairDirs(dirs, lp){
  const out = [];
  if(lp<=0) return out;
  if(dirs.length===0){
    for(let i=0;i<lp;i++) out.push(new THREE.Vector3(Math.cos(i*2.1), Math.sin(i*2.1), 0.4).normalize());
    return out;
  }
  const bis = new THREE.Vector3();
  dirs.forEach(d=>bis.add(d));
  if(bis.length()<1e-6) bis.set(0,1,0);
  bis.normalize().multiplyScalar(-1);          // 背对已成键方向
  if(lp===1){ out.push(bis.clone()); return out; }
  if(lp===2 && dirs.length>=2){
    const nrm = new THREE.Vector3().crossVectors(dirs[0], dirs[1]);
    if(nrm.length()<1e-6) nrm.set(0,0,1);
    nrm.normalize();
    out.push(bis.clone().applyAxisAngle(nrm,  55*Math.PI/180));
    out.push(bis.clone().applyAxisAngle(nrm, -55*Math.PI/180));
    return out;
  }
  if(lp===3){
    const axis = dirs[0].clone().multiplyScalar(-1);
    const u = new THREE.Vector3(0,1,0);
    if(Math.abs(axis.dot(u))>0.9) u.set(1,0,0);
    const p1 = new THREE.Vector3().crossVectors(axis,u).normalize();
    for(let i=0;i<3;i++) out.push(p1.clone().applyAxisAngle(axis, i*2*Math.PI/3).multiplyScalar(0.85).add(axis.multiplyScalar(0.5)).normalize());
    return out;
  }
  for(let i=0;i<lp;i++) out.push(bis.clone().applyAxisAngle(new THREE.Vector3(0,1,0), i*1.4));
  return out;
}

function rebuildLonePairs(){
  lpMeshes.forEach(m=>{ sceneAssembly.remove(m); m.geometry.dispose(); m.material.dispose(); });
  lpMeshes = [];
  if(!lonePairOn) return;
  const graph = toGraph(asmAtoms);
  asmAtoms.forEach(atom=>{
    const lp = CHEM.lonePairs(atom.element, CHEM.bondSum(graph, atom.id));
    if(lp<=0) return;
    const dirs = neighborDirs(atom);
    lonePairDirs(dirs, lp).forEach(d=>{
      // 双点要“横着”排开才看得见：取同时垂直于孤对方向与视线的轴，两点必然落在屏幕平面上
      const perp = new THREE.Vector3();
      const camDir = new THREE.Vector3();
      camera.getWorldDirection(camDir);
      perp.crossVectors(camDir, d);
      if(perp.length() < 1e-3) perp.set(1,0,0);
      perp.normalize();
      const base = new THREE.Vector3(atom.pos.x, atom.pos.y, atom.pos.z)
        .add(d.clone().multiplyScalar(CPK[atom.element].size + 0.20));
      [-0.075, 0.075].forEach(off=>{
        const geo = new THREE.SphereGeometry(0.075, 12, 12);
        const mat = new THREE.MeshStandardMaterial({color:'#7C8FA6', roughness:0.5, emissive:'#2F3E4E', emissiveIntensity:0.25});
        const m = new THREE.Mesh(geo, mat);
        m.position.copy(base).add(perp.clone().multiplyScalar(off));
        sceneAssembly.add(m);
        lpMeshes.push(m);
      });
    });
  });
}

/* ---------- 分子识别：图同构 ---------- */
function identifyMolecules(){
  const visited = new Set(), mols = [];
  for(const atom of asmAtoms){
    if(visited.has(atom.id)) continue;
    const queue=[atom]; visited.add(atom.id);
    const counts={}, group=[];
    while(queue.length){
      const cur=queue.shift(); group.push(cur);
      counts[cur.element]=(counts[cur.element]||0)+1;
      cur.bonds.forEach(ba=>{
        const nb=getAtom(ba.b);
        if(nb && !visited.has(nb.id)){ visited.add(nb.id); queue.push(nb); }
      });
    }
    const hit = CHEM.matchTemplate(toGraph(group));
    const match = hit
      ? { name:hit.template.name, formula:hit.template.formula, reason:hit.template.reason||'', id:hit.template.id }
      : null;
    mols.push({ group, counts, match });
  }
  return mols;
}

function formulaString(counts){
  const parts=[];
  if(counts.C) parts.push('C'+(counts.C>1?sub(counts.C):''));
  if(counts.H) parts.push('H'+(counts.H>1?sub(counts.H):''));
  Object.keys(counts).filter(k=>k!=='C'&&k!=='H').sort().forEach(k=>{ parts.push(k+(counts[k]>1?sub(counts[k]):'')); });
  return parts.join('');
}

function refreshMolecules(){
  const body=document.getElementById('assemblyInfoBody');
  const mols=identifyMolecules();
  // 一旦连通图命中模板，键级立刻按模板回写（CO₂ 两根双键、N₂ 三键）
  mols.forEach(m=>{
    if(!m.match) return;
    const orders = CHEM.ordersFor(toGraph(m.group));
    Object.keys(orders).forEach(bid=>{
      const bond = asmBonds.find(b=>String(b.id)===String(bid));
      if(bond && (bond.order||1)!==orders[bid]){ bond.order = orders[bid]; rebuildBondMesh(bond); }
    });
  });
  if(mols.length===0){ body.innerHTML='<p class="placeholder">放置原子并成键后，这里显示识别到的分子</p>'; }
  else {
    body.innerHTML='';
    mols.forEach(m=>{
      const card=document.createElement('div');
      card.className='mol-card';
      const name = m.match ? m.match.name : '未识别分子';
      const formula = m.match ? m.match.formula : formulaString(m.counts);
      const hasFormula = m.match && name.replace(/\s/g,'').includes(m.match.formula.replace(/\s/g,''));
      const meta = (hasFormula ? '' : formula + ' · ') + m.group.length + ' 个原子';
      const bondMeta = m.match ? '' : ' · VSEPR 兜底';
      card.innerHTML=`<div class="mol-name">${name}</div><div class="mol-formula">${meta}${bondMeta}</div>`;
      body.appendChild(card);
    });
  }
  document.getElementById('assemblyAtomCount').textContent = asmAtoms.length+' 个';
}

function refreshAssemblyUI(){ refreshMolecules(); }

/* ---------- 整形解释卡 ---------- */
function showReason(atom){
  const el = document.getElementById('reasonCard');
  if(!el) return;
  const mol = atom ? identifyMolecules().find(m=>m.group.some(a=>a.id===atom.id)) : null;
  if(!mol || !mol.match || !mol.match.reason){ el.style.display='none'; return; }
  const graph = toGraph(mol.group);
  const center = mol.group.find(a=>CHEM.neighbors(graph, a.id).length >= 2) || mol.group[0];
  const lp = CHEM.lonePairs(center.element, CHEM.bondSum(graph, center.id));
  const dom = CHEM.neighbors(graph, center.id).length + lp;
  const ideal = CHEM.angleForDomains(dom, 0);
  const real = CHEM.angleForDomains(dom, lp);
  el.style.display='block';
  el.innerHTML =
    `<div class="rc-head">${mol.match.formula} <span>${mol.match.name}</span></div>` +
    `<div class="rc-body">${center.element} 上有 <b>${lp}</b> 对孤对，加上 ${CHEM.neighbors(graph,center.id).length} 根键，` +
    `共 <b>${dom}</b> 个电子域 → ${dom===4?'四面体':dom===3?'平面三角':'直线'}骨架 ${ideal}°；` +
    `${lp>0?`孤对电子云更胖，把键角压到 <b>${real.toFixed(1)}°</b>。`:`没有孤对，键角就是 ${ideal}°。`}</div>` +
    `<div class="rc-note">${mol.match.reason}</div>`;
}

function pickAtoms(e){
  const rect=renderer.domElement.getBoundingClientRect();
  asmMouse.x=((e.clientX-rect.left)/rect.width)*2-1;
  asmMouse.y=-((e.clientY-rect.top)/rect.height)*2+1;
  asmRay.setFromCamera(asmMouse,camera);
  const meshes=asmAtoms.map(a=>a.mesh);
  return asmRay.intersectObjects(meshes).map(h=>getAtom(h.object.userData.atomId)).filter(Boolean);
}

function onAssemblyClick(e){
  if(arranging) return;
  if(activeView!=='assembly' || justDragged){ justDragged=false; return; }
  if(placingElement){
    const rect=renderer.domElement.getBoundingClientRect();
    asmMouse.x=((e.clientX-rect.left)/rect.width)*2-1;
    asmMouse.y=-((e.clientY-rect.top)/rect.height)*2+1;
    asmRay.setFromCamera(asmMouse,camera);
    const plane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
    const pt=new THREE.Vector3();
    if(asmRay.ray.intersectPlane(plane,pt)){
      addAtom(placingElement,pt);
      refreshMolecules();
      setStatus(`已放置 ${placingElement}；继续点地面放，或 Esc 结束放置`);
    }
    return;
  }
  if(bondingMode){
    const hits=pickAtoms(e);
    if(hits.length){
      const atom=hits[0];
      if(!pendingBondAtom){
        pendingBondAtom=atom; highlightAtom(atom,true);
        setStatus(`已选 ${atom.element}，再点一个原子成键（Esc 取消）`);
      } else if(pendingBondAtom.id===atom.id){
        highlightAtom(pendingBondAtom,false); pendingBondAtom=null;
        setStatus('已取消成键选择');
      } else {
        const a=pendingBondAtom, b=atom;
        highlightAtom(a,false); pendingBondAtom=null;
        if(addBond(a,b)) setStatus(`已成键：${a.element}–${b.element}`);
      }
    } else exitBonding();
    return;
  }
  if(selectedAtom) highlightAtom(selectedAtom,false);
  selectedAtom=null;
  const hits=pickAtoms(e);
  if(hits.length){
    const atom=hits[0]; selectedAtom=atom; highlightAtom(atom,true);
    setStatus(`选中 ${atom.element}（剩余价键 ${remainingValence(atom)}/${CPK[atom.element].valence}）`);
  }
}
function exitBonding(){
  if(pendingBondAtom) highlightAtom(pendingBondAtom,false);
  pendingBondAtom=null; bondingMode=false;
  document.getElementById('btnBond').classList.remove('on');
  setStatus('已退出成键模式');
}
function onAssemblyDown(e){
  if(activeView!=='assembly' || !assemblyMode) return;
  if(placingElement || bondingMode) return;
  const hits=pickAtoms(e);
  if(hits.length){
    dragAtom=hits[0];
    dragMolecule=identifyMolecules().find(m=>m.group.some(a=>a.id===dragAtom.id));
    dragStart={x:e.clientX,y:e.clientY};
  }
}
function onAssemblyMove(e){
  if(!dragAtom || activeView!=='assembly') return;
  if(dragStart){
    const dx=e.clientX-dragStart.x, dy=e.clientY-dragStart.y;
    if(Math.hypot(dx,dy)>8) justDragged=true;
  }
  const rect=renderer.domElement.getBoundingClientRect();
  asmMouse.x=((e.clientX-rect.left)/rect.width)*2-1;
  asmMouse.y=-((e.clientY-rect.top)/rect.height)*2+1;
  asmRay.setFromCamera(asmMouse,camera);
  const plane=new THREE.Plane(new THREE.Vector3(0,1,0),-dragAtom.pos.y);
  const pt=new THREE.Vector3();
  if(asmRay.ray.intersectPlane(plane,pt)){
    const delta=pt.clone().sub(new THREE.Vector3(dragAtom.pos.x, dragAtom.pos.y, dragAtom.pos.z));
    if(dragMolecule){
      dragMolecule.group.forEach(a=>{
        setAtomPos(a, { x:a.pos.x+delta.x, y:a.pos.y+delta.y, z:a.pos.z+delta.z });
      });
      asmBonds.forEach(bond=>{ if(dragMolecule.group.some(a=>a.id===bond.a)) updateBondMesh(bond); });
      rebuildLonePairs();
    }
  }
}
function onAssemblyUp(){ dragAtom=null; dragMolecule=null; dragStart=null; }

document.getElementById('btnAssemblyMode').addEventListener('click',()=>{
  assemblyMode=!assemblyMode;
  document.getElementById('btnAssemblyMode').classList.toggle('on',assemblyMode);
  controls.enabled=!assemblyMode;
  setStatus(assemblyMode ? '组装模式：托盘选原子→点地面放置；成键连线' : '查看模式：拖拽旋转/缩放/平移');
});
document.getElementById('btnBond').addEventListener('click',()=>{
  if(!assemblyMode){ setStatus('先点"组装模式"进入'); return; }
  if(arranging){ setStatus('等整形动画结束再成键'); return; }
  bondingMode=!bondingMode;
  if(bondingMode){                       // 成键优先于放置，避免两种模式互相吞点击
    placingElement=null;
    document.querySelectorAll('.atom-btn').forEach(b=>b.classList.remove('selected'));
  }
  document.getElementById('btnBond').classList.toggle('on',bondingMode);
  if(!bondingMode) exitBonding();
  else setStatus('成键模式：依次点两个原子成键（Esc/右键退出）');
});
document.getElementById('btnDeleteAtom').addEventListener('click',()=>{
  if(selectedAtom){ const el=selectedAtom.element; removeAtom(selectedAtom); setStatus(`已删除 ${el} 及其所有键`); }
  else setStatus('先在场景里点选一个原子');
});
document.getElementById('btnClearAssembly').addEventListener('click',()=>{
  [...asmAtoms].forEach(a=>removeAtom(a));
  setStatus('已清空场景');
});
document.getElementById('btnDemoArrange').addEventListener('click',()=>{
  if(activeView!=='assembly') return;
  [...asmAtoms].forEach(a=>removeAtom(a));
  setStatus('演示中：Cl2 成键聚拢…');
  const c1=addAtom('Cl',new THREE.Vector3(-5,2,-5));
  const c2=addAtom('Cl',new THREE.Vector3(5,2,5));
  setTimeout(()=>{ addBond(c1,c2); setStatus('演示中：H2O 折角…'); }, 200);
  setTimeout(()=>{
    [...asmAtoms].forEach(a=>removeAtom(a));
    const o=addAtom('O',new THREE.Vector3(0,0,0));
    const h1=addAtom('H',new THREE.Vector3(3,0,0));
    const h2=addAtom('H',new THREE.Vector3(-3,0,1));
    addBond(o,h1); addBond(o,h2);
    setStatus('演示中：CH4 正四面体…');
  }, 1200);
  setTimeout(()=>{
    [...asmAtoms].forEach(a=>removeAtom(a));
    const c=addAtom('C',new THREE.Vector3(0,0,0));
    const hs=[addAtom('H',new THREE.Vector3(3,0,0)),addAtom('H',new THREE.Vector3(-3,0,0)),addAtom('H',new THREE.Vector3(0,3,0)),addAtom('H',new THREE.Vector3(0,-3,0))];
    hs.forEach((h,i)=>setTimeout(()=>addBond(c,h), i*250));
    setStatus('演示完成：查看三个分子整形效果');
  }, 2200);
});
window.addEventListener('keydown',e=>{
  if(activeView!=='assembly') return;
  if(e.key==='Escape'){
    exitBonding(); placingElement=null;
    document.querySelectorAll('.atom-btn').forEach(b=>b.classList.remove('selected'));
    setStatus('已取消当前操作');
  }
  if((e.key==='Delete'||e.key==='Backspace') && selectedAtom){ removeAtom(selectedAtom); }
});
renderer.domElement.addEventListener('contextmenu',e=>{ if(activeView==='assembly' && bondingMode){ e.preventDefault(); exitBonding(); }});

/* 统一用 Pointer Events：触屏与鼠标同一套路径 */
let pDown = null;
renderer.domElement.addEventListener('pointerdown', e=>{
  pDown = { x:e.clientX, y:e.clientY, t:performance.now() };
  onAssemblyDown(e);
});
window.addEventListener('pointermove', e=>{ onAssemblyMove(e); });
window.addEventListener('pointerup', e=>{
  onAssemblyUp();
  if(pDown && activeView==='assembly'){
    const dx=e.clientX-pDown.x, dy=e.clientY-pDown.y;
    if(Math.hypot(dx,dy) < 10 && performance.now()-pDown.t < 500) onAssemblyClick(e);
  }
  pDown = null;
});
renderer.domElement.addEventListener('pointercancel', ()=>{ pDown=null; onAssemblyUp(); });

/* ================= 内置自检（20 条核心断言 + 应用层断言） ================= */
function appChecks(){
  const rows = [];
  function one(id, name, fn){
    let r;
    try { r = fn(); } catch(e){ r = { pass:false, detail:'异常: '+e.message }; }
    rows.push({ id, name, pass:!!r.pass, detail:r.detail||'' });
  }
  // 21 双键渲染：CO2 每根键 2 根圆柱
  one(21, '双键渲染 2 根圆柱', ()=>{
    buildFromTemplate('CO2', true);
    const bonds = asmBonds;
    const ok = bonds.length===2 && bonds.every(b=>(b.order||1)===2 && b.mesh.children.length===2);
    return { pass: ok, detail: bonds.map(b=>'order'+b.order+'/'+b.mesh.children.length+'柱').join(' ') };
  });
  // 22 三键渲染：N2 3 根
  one(22, '三键渲染 3 根圆柱', ()=>{
    buildFromTemplate('N2', true);
    const bonds = asmBonds;
    const ok = bonds.length===1 && (bonds[0].order||1)===3 && bonds[0].mesh.children.length===3;
    return { pass: ok, detail: bonds.map(b=>'order'+b.order+'/'+b.mesh.children.length+'柱').join(' ') };
  });
  // 23 手工成键后 CO2 自动升级键级
  one(23, '手工 CO₂ 自动升键级', ()=>{
    clearScene();
    const c = addAtom('C', new THREE.Vector3(0,0,0));
    const o1 = addAtom('O', new THREE.Vector3(2,0,0));
    const o2 = addAtom('O', new THREE.Vector3(-2,0,0));
    addBond(c,o1); addBond(c,o2);
    const graph = toGraph(asmAtoms);
    const hit = CHEM.matchTemplate(graph);
    const ok = !!hit && hit.template.id==='CO2' && asmBonds.every(b=>b.order===2);
    return { pass: ok, detail: hit ? ('命中 '+hit.template.id+'，键级 '+asmBonds.map(b=>b.order).join('/')) : '未命中模板' };
  });
  return rows;
}

function showSelfTest(res, extra){
  const rows = res.rows.concat(extra);
  const pass = rows.filter(r=>r.pass).length;
  const fail = rows.length - pass;

  let bar = document.getElementById('selftestBar');
  if(!bar){
    bar = document.createElement('div');
    bar.id = 'selftestBar';
    document.body.appendChild(bar);
  }
  bar.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:86px;z-index:10000;'
    + 'background:#fff;border:1px solid '+(fail?'#E5533D':'#3ECF8E')+';border-radius:10px;'
    + 'padding:8px 14px;font:12px ui-monospace,Menlo,Consolas,monospace;color:#1F2933;'
    + 'box-shadow:0 6px 18px rgba(0,0,0,.08);cursor:pointer;white-space:nowrap';
  bar.textContent = 'SELFTEST ' + pass + '/' + rows.length + ' PASS' + (fail?(' · '+fail+' FAIL'):'');
  bar.style.borderColor = fail ? '#E5533D' : '#3ECF8E';

  let panel = document.getElementById('selfTestPanel');
  if(!panel){
    panel = document.createElement('div');
    panel.id='selfTestPanel';
    panel.style.cssText='position:fixed;right:16px;top:56px;z-index:9999;width:min(480px,94vw);max-height:70vh;'
      + 'overflow:auto;background:#fff;border:1px solid #E4E8ED;border-radius:10px;padding:12px 14px;'
      + 'font:12px/1.7 ui-monospace,Menlo,Consolas,monospace;color:#1F2933;box-shadow:0 10px 30px rgba(0,0,0,.10)';
    document.body.appendChild(panel);
  }
  const head = '<div style="display:flex;justify-content:space-between;margin-bottom:8px">'
    + '<span style="font-weight:600;font-size:13px">自检明细 '+pass+'/'+rows.length+'</span>'
    + '<span id="selfTestClose" style="cursor:pointer;color:#6B7785">关闭</span></div>';
  const body = rows.map(r=>'<div style="display:flex;gap:8px;margin:2px 0">'
    + '<span style="flex:0 0 40px;color:'+(r.pass?'#3ECF8E':'#E5533D')+'">'+(r.pass?'PASS':'FAIL')+'</span>'
    + '<span style="flex:0 0 34px;color:#6B7785">#'+r.id+'</span>'
    + '<span style="flex:1">'+r.name+'</span>'
    + '<span style="color:#6B7785;white-space:nowrap">'+r.detail+'</span></div>').join('');
  panel.innerHTML = head + body;
  panel.style.display = 'none';
  bar.onclick = ()=>{ panel.style.display = panel.style.display==='none' ? 'block' : 'none'; };
  document.getElementById('selfTestClose').onclick = ()=>panel.remove();
  return { pass, total: rows.length, fail };
}

function runSelfTest(){
  arrangeDisabled = true;
  let core, extra;
  try {
    core = CHEM.runAssertions();
    extra = appChecks();
  } finally {
    arrangeDisabled = false;
    clearScene();
    refreshMolecules();
  }
  const r = showSelfTest(core, extra);
  setStatus('自检：' + r.pass + '/' + r.total + ' 通过（场景已清空）');
  return r;
}

/* ---------- 一键生成标准分子 ---------- */
function clearScene(){ [...asmAtoms].forEach(a=>removeAtom(a)); lpMeshes=[]; }

function buildFromTemplate(id, silent){
  const tpl = CHEM.TEMPLATES.find(t=>t.id===id);
  if(!tpl) return;
  clearScene();
  arrangeDisabled = true;
  const n = tpl.els.length;
  const atoms = tpl.els.map((el,i)=> addAtom(el, new THREE.Vector3((i-(n-1)/2)*1.6, 0.6+(i%3)*0.5, ((i%4)-1.5)*0.9)));
  tpl.edges.forEach(e=>{ addBond(atoms[e[0]], atoms[e[1]], e[2]); });
  arrangeDisabled = false;
  const mol = identifyMolecules().find(m=>m.group.length===n);
  if(mol) startArrange(mol);
  if(!silent) setStatus('已生成 ' + tpl.formula + '（' + tpl.name + '）');
}

function generateAndReport(id){
  if(arranging) return;
  buildFromTemplate(id, false);
}

/* ---------- 按钮 ---------- */
document.getElementById('btnSelfTest').addEventListener('click', ()=>runSelfTest());

const btnLP = document.getElementById('btnLonePair');
if(btnLP){
  btnLP.addEventListener('click', ()=>{
    lonePairOn = !lonePairOn;
    btnLP.classList.toggle('on', lonePairOn);
    rebuildLonePairs();
    setStatus(lonePairOn ? '已显示孤对电子（灰色双点）' : '已隐藏孤对电子');
  });

  // 手机端：托盘从顶部下拉，避免和底部 Dock 打架
  const btnTray = document.getElementById('trayToggle');
  if(btnTray) btnTray.addEventListener('click', ()=>{
    const open = document.body.classList.toggle('tray-open');
    btnTray.classList.toggle('on', open);
  });
  const btnTrayClose = document.getElementById('trayClose');
  if(btnTrayClose) btnTrayClose.addEventListener('click', ()=>{
    document.body.classList.remove('tray-open');
    if(btnTray) btnTray.classList.remove('on');
    onResize();
  });
}

const genRow = document.getElementById('genRow');
if(genRow){
  ['H2O','CO2','CH4','NH3','C2H4','C2H6','C2H2','HCl','O2','N2','Cl2','H2O2','CH3OH','C2H5OH','Me2O']
  .forEach(id=>{
    const tpl = CHEM.TEMPLATES.find(t=>t.id===id);
    if(!tpl) return;
    const b = document.createElement('button');
    b.className='gen-btn';
    b.textContent = tpl.formula;
    b.title = tpl.name;
    b.addEventListener('click', ()=>{
      if(activeView!=='assembly') switchView('assembly');
      generateAndReport(id);
    });
    genRow.appendChild(b);
  });
}

/* ---------- 深链：?mol=CO2 直接生成该分子；?lp=1 打开孤对 ---------- */
const _qs = new URLSearchParams(location.search);
if(_qs.get('lp') === '1'){
  lonePairOn = true;
  const b = document.getElementById('btnLonePair');
  if(b) b.classList.add('on');
}
if(_qs.get('mol')){
  instantArrange = true;
  switchView('assembly');
  setTimeout(()=>{
    generateAndReport(_qs.get('mol'));
    setTimeout(()=>{ rebuildLonePairs(); onResize(); }, 900);
  }, 300);
}

if(location.search.indexOf('selftest=1')>=0){
  switchView('assembly');
  setTimeout(()=>runSelfTest(), 400);
}

refreshAssemblyUI();
