const $ = s => document.querySelector(s);
const panel = $('#trainingPanel');
const tabsEl = $('#modeTabs');
let session = null;
let mode = 'client';
let coachState = { workspaceId: '', clientId: '', clients: [], programs: [], versionId: '', days: [], search: [], progress: null };
let clientState = { program: null, days: [], loggingDay: null };

function esc(v='') { return String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function toast(text, bad=false) { const el=$('#trainingToast'); el.textContent=text; el.classList.remove('hidden'); el.classList.toggle('danger',bad); setTimeout(()=>el.classList.add('hidden'),3500); }
async function api(path, options={}) {
  const r = await fetch(path, { credentials:'include', headers:{ 'content-type':'application/json', ...(options.headers||{}) }, ...options });
  const data = await r.json().catch(()=>({}));
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}
function membershipsByWorkspace() {
  const out = new Map();
  for (const m of session?.memberships || []) {
    if (!out.has(m.workspace_id)) out.set(m.workspace_id,{ id:m.workspace_id,name:m.workspace_name,type:m.workspace_type,roles:[] });
    out.get(m.workspace_id).roles.push(m.role);
  }
  return [...out.values()];
}
function isCoach() { return !!session?.user?.is_platform_admin || (session?.memberships||[]).some(m=>['trainer','owner','admin'].includes(m.role)); }
function tabs() {
  const items=[['client','Мій план']];
  if (isCoach()) items.push(['coach','Coach']);
  tabsEl.innerHTML=items.map(([id,label])=>`<button class="${mode===id?'active':''}" data-mode="${id}">${label}</button>`).join('');
  tabsEl.querySelectorAll('button').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;tabs();render();});
}

async function loadClient() {
  const data=await api('/training/client/program');
  clientState.program=data.program; clientState.days=data.days||[]; clientState.loggingDay=null;
}
function clientHome() {
  const p=clientState.program;
  if (!p) return `<div class="card empty"><h2>Активної програми ще немає</h2><p>Якщо ти працюєш з тренером — після Publish його план зʼявиться тут автоматично.</p><div class="row" style="justify-content:center"><label>Вага тіла <input id="soloBw" type="number" step="0.1" placeholder="кг"></label><button id="soloBwBtn" class="primary">Зберегти вагу</button></div></div>`;
  return `<div class="stack">
    <article class="card"><div class="eyebrow">${esc(p.trainer_name||'varangym')}</div><h2>${esc(p.name)}</h2><p class="muted">Версія ${esc(p.version_number)} · опубліковано ${p.published_at?new Date(p.published_at).toLocaleDateString():''}</p></article>
    <div class="row"><label class="grow">Вага тіла <input id="clientBw" type="number" step="0.1" placeholder="кг"></label><button id="clientBwBtn" class="ghost">Зберегти</button></div>
    ${clientState.days.map((d,i)=>`<article class="day-card"><div class="day-head"><div class="grow"><div class="eyebrow">День ${i+1}</div><h2>${esc(d.title||'Тренування')}</h2></div><button class="primary log-day" data-day="${i}">Записати тренування</button></div>${(d.exercises||[]).map(ex=>`<div class="item"><strong>${esc(ex.name)}</strong><div class="exercise-meta">${esc(ex.equipment||'')} · ${esc(ex.primaryMuscle||'')}</div><div class="mini">${esc(ex.prescription?.sets||3)} підходи × ${esc(ex.prescription?.reps||10)} · відпочинок ${esc(ex.prescription?.restSec||90)} с</div>${ex.coachNotes?`<div class="mini muted">${esc(ex.coachNotes)}</div>`:''}</div>`).join('')}</article>`).join('')}
  </div>`;
}
function workoutForm(dayIndex) {
  const d=clientState.days[dayIndex];
  return `<div class="stack"><button id="backPlan" class="ghost">← До плану</button><article class="card"><div class="eyebrow">Запис тренування</div><h2>${esc(d.title||'Тренування')}</h2><p class="muted">Внеси фактичну вагу і повтори. Історію потім побачить тренер.</p></article>
  ${(d.exercises||[]).map((ex,ei)=>{const n=Math.max(1,Number(ex.prescription?.sets||3));return `<article class="workout-exercise" data-ei="${ei}"><h3>${esc(ex.name)}</h3><div class="exercise-meta">план: ${n} × ${esc(ex.prescription?.reps||10)}</div>${Array.from({length:n},(_,si)=>`<div class="set-grid"><strong>#${si+1}</strong><input class="set-weight" data-si="${si}" type="number" step="0.5" placeholder="кг"><input class="set-reps" data-si="${si}" type="number" step="1" value="${esc(ex.prescription?.reps||10)}" placeholder="повтори"></div>`).join('')}</article>`}).join('')}
  <button id="finishWorkout" class="primary full">Завершити і зберегти</button></div>`;
}
async function saveBodyweight(id) { const v=Number($(id)?.value); if(!v) return; await api('/training/bodyweight',{method:'POST',body:JSON.stringify({weight:v})}); toast('Вагу збережено'); $(id).value=''; }
async function finishWorkout(dayIndex) {
  const day=clientState.days[dayIndex];
  const exercises=(day.exercises||[]).map((ex,ei)=>{
    const root=panel.querySelector(`[data-ei="${ei}"]`);
    const weights=[...root.querySelectorAll('.set-weight')];
    return { exerciseId:ex.exerciseId,name:ex.name,prescription:ex.prescription,sets:weights.map((w,si)=>({weight:Number(w.value)||0,reps:Number(root.querySelector(`.set-reps[data-si="${si}"]`).value)||0,done:true,type:'straight',phase:'work'})) };
  });
  await api('/training/workouts',{method:'POST',body:JSON.stringify({workspaceId:clientState.program.workspace_id,programVersionId:clientState.program.version_id,name:day.title||clientState.program.name,exercises})});
  toast('Тренування збережено'); clientState.loggingDay=null; renderClient();
}
function wireClient() {
  $('#soloBwBtn')?.addEventListener('click',()=>saveBodyweight('#soloBw').catch(e=>toast(e.message,true)));
  $('#clientBwBtn')?.addEventListener('click',()=>saveBodyweight('#clientBw').catch(e=>toast(e.message,true)));
  panel.querySelectorAll('.log-day').forEach(b=>b.onclick=()=>{clientState.loggingDay=Number(b.dataset.day);renderClient();});
  $('#backPlan')?.addEventListener('click',()=>{clientState.loggingDay=null;renderClient();});
  $('#finishWorkout')?.addEventListener('click',()=>finishWorkout(clientState.loggingDay).catch(e=>toast(e.message,true)));
}
function renderClient(){ panel.innerHTML=clientState.loggingDay===null?clientHome():workoutForm(clientState.loggingDay);wireClient(); }

async function coachWorkspaces() {
  if (session.user.is_platform_admin) {
    const d=await api('/api/admin/workspaces');
    return (d.workspaces||[]).filter(w=>w.type!=='platform_direct').map(w=>({id:w.id,name:w.name,type:w.type,roles:['platform_admin']}));
  }
  return membershipsByWorkspace().filter(w=>w.roles.some(r=>['trainer','owner','admin'].includes(r)));
}
async function loadCoachWorkspace(id) {
  coachState.workspaceId=id; coachState.clientId='';coachState.programs=[];coachState.progress=null;
  const d=await api(`/api/coach/clients?workspaceId=${encodeURIComponent(id)}`);coachState.clients=d.clients||[];
}
async function selectClient(id) {
  coachState.clientId=id;coachState.versionId='';coachState.days=[];coachState.progress=null;
  const d=await api(`/training/programs?workspaceId=${encodeURIComponent(coachState.workspaceId)}&clientId=${encodeURIComponent(id)}`);coachState.programs=d.programs||[];
}
function coachShell(workspaces) {
  const selected=coachState.clients.find(c=>c.id===coachState.clientId);
  return `<div class="training-grid"><aside class="stack"><article class="card"><h2>Workspace</h2><select id="workspaceSelect"><option value="">Оберіть…</option>${workspaces.map(w=>`<option value="${w.id}" ${w.id===coachState.workspaceId?'selected':''}>${esc(w.name)}</option>`).join('')}</select></article>
  <article class="card"><h2>Клієнти</h2><div class="list">${coachState.clients.length?coachState.clients.map(c=>`<button class="ghost client-pick ${c.id===coachState.clientId?'active':''}" data-id="${c.id}"><strong>${esc(c.display_name)}</strong><div class="mini muted">${c.workouts_30d||0} трен. / 30 днів</div></button>`).join(''):`<div class="empty">Ще немає клієнтів</div>`}</div></article></aside>
  <section class="stack">${selected?coachClient(selected):`<article class="card empty"><h2>Оберіть клієнта</h2><p>Тут буде програма, прогрес і бібліотека вправ.</p></article>`}</section></div>`;
}
function coachClient(c) {
  const editor=coachState.versionId?programEditor():'';
  const progress=coachState.progress?progressView():'';
  return `<article class="card"><div class="eyebrow">client</div><h2>${esc(c.display_name)}</h2><p class="muted">${esc(c.email||'')} · останнє тренування ${c.last_workout_at?new Date(c.last_workout_at).toLocaleDateString():'—'}</p><div class="row"><button id="progressBtn" class="ghost">Прогрес</button><button id="newProgramBtn" class="primary">Нова програма</button></div></article>
  ${coachState.programs.length?`<article class="card"><h3>Програми</h3><div class="list">${coachState.programs.map(p=>`<div class="item"><strong>${esc(p.name)}</strong><div class="mini muted">версія ${p.latest_version||0} · ${p.published_version_id?'опубліковано':'чернетка'}</div></div>`).join('')}</div></article>`:''}
  ${progress}${editor}`;
}
function progressView(){const p=coachState.progress;return `<article class="card"><div class="kpi-grid"><div class="kpi"><span class="muted">Тренувань</span><strong>${p.workouts?.length||0}</strong></div><div class="kpi"><span class="muted">Остання вага</span><strong>${p.bodyweights?.[0]?.weight||'—'}</strong></div><div class="kpi"><span class="muted">Вправ у прогресі</span><strong>${p.performances?.length||0}</strong></div></div><h3>Останні тренування</h3><div class="list">${(p.workouts||[]).slice(0,10).map(w=>`<div class="item"><strong>${esc(w.name)}</strong><div class="mini muted">${new Date(w.started_at).toLocaleDateString()} · ${w.completed_sets||0} підходів · volume ${Math.round(Number(w.volume||0))}</div></div>`).join('')||'<div class="empty">Ще немає історії</div>'}</div></article>`}
function programEditor(){return `<article class="card stack"><div class="row"><div class="grow"><div class="eyebrow">program editor</div><h2>Нова програма</h2></div><button id="addDayBtn" class="ghost">+ День</button></div>
  <div class="row"><input id="exerciseSearch" class="grow" placeholder="Пошук серед 1300+ вправ"><button id="searchBtn" class="ghost">Знайти</button><button id="customExBtn" class="ghost">+ Своя вправа</button></div>
  <div id="searchResults" class="scroll">${searchResults()}</div>
  <div id="daysEditor" class="stack">${daysEditor()}</div>
  <div class="row"><button id="saveProgramBtn" class="ghost">Зберегти чернетку</button><button id="publishProgramBtn" class="primary">Publish клієнту</button></div></article>`}
function searchResults(){return (coachState.search||[]).slice(0,40).map(ex=>`<div class="exercise-result"><div><strong>${esc(ex.name)}</strong><div class="exercise-meta">${esc(ex.equipment_key||'')} · ${esc(ex.primary_muscle_key||'')}</div></div><button class="ghost add-ex" data-id="${ex.id}" data-name="${esc(ex.name)}">Додати</button></div>`).join('') || '<div class="mini muted">Введи назву вправи, наприклад bench press або squat.</div>'}
function daysEditor(){return coachState.days.map((d,di)=>`<div class="day-card" data-day="${di}"><div class="day-head"><label class="grow">Назва дня<input class="day-title" value="${esc(d.title)}"></label><label>День тижня<select class="day-weekday">${[['','—'],[1,'Пн'],[2,'Вт'],[3,'Ср'],[4,'Чт'],[5,'Пт'],[6,'Сб'],[0,'Нд']].map(([v,l])=>`<option value="${v}" ${String(d.weekday??'')===String(v)?'selected':''}>${l}</option>`).join('')}</select></label><button class="ghost remove-day">×</button></div>${d.exercises.map((ex,ei)=>`<div class="program-exercise" data-ei="${ei}"><div class="exercise-title"><strong>${esc(ex.name)}</strong></div><label>Підходи<input class="ex-sets" type="number" min="1" value="${ex.sets}"></label><label>Повтори<input class="ex-reps" type="number" min="1" value="${ex.reps}"></label><label>Відпочинок<input class="ex-rest" type="number" min="0" value="${ex.restSec}"></label><button class="ghost remove-exercise">×</button></div>`).join('')||'<div class="mini muted">Додай вправи з пошуку вище.</div>'}</div>`).join('')}
function syncDaysFromDom(){panel.querySelectorAll('.day-card').forEach((root,di)=>{const d=coachState.days[di];d.title=root.querySelector('.day-title').value;const wd=root.querySelector('.day-weekday').value;d.weekday=wd===''?null:Number(wd);root.querySelectorAll('.program-exercise').forEach((er,ei)=>{const ex=d.exercises[ei];ex.sets=Number(er.querySelector('.ex-sets').value)||1;ex.reps=Number(er.querySelector('.ex-reps').value)||1;ex.restSec=Number(er.querySelector('.ex-rest').value)||0;});});}
async function createProgram(){const name=prompt('Назва програми','Основна програма');if(!name)return;const d=await api('/training/programs',{method:'POST',body:JSON.stringify({workspaceId:coachState.workspaceId,clientId:coachState.clientId,name})});coachState.versionId=d.version.id;coachState.days=[{title:'Понеділок',weekday:1,exercises:[]}];coachState.search=[];toast('Чернетку створено');renderCoach();}
async function searchExercises(){const q=$('#exerciseSearch').value.trim();if(!q)return;const d=await api(`/training/exercises?workspaceId=${encodeURIComponent(coachState.workspaceId)}&scope=global&q=${encodeURIComponent(q)}&limit=60`);coachState.search=d.exercises||[];renderCoach();setTimeout(()=>{$('#exerciseSearch').value=q;},0);}
async function customExercise(){const name=prompt('Назва своєї вправи');if(!name)return;const equipment=prompt('Обладнання (необовʼязково)','');const muscle=prompt('Основний мʼяз (необовʼязково)','');const d=await api('/training/exercises/custom',{method:'POST',body:JSON.stringify({workspaceId:coachState.workspaceId,name,equipment,primaryMuscle:muscle,locale:session.user.locale||'uk'})});coachState.search=[d.exercise,...coachState.search];toast('Вправу створено');renderCoach();}
function addExercise(id,name){if(!coachState.days.length)coachState.days.push({title:'День 1',weekday:null,exercises:[]});coachState.days[coachState.days.length-1].exercises.push({exerciseId:id,name,sets:3,reps:10,restSec:90});renderCoach();}
async function saveDraft(){syncDaysFromDom();await api('/training/programs/save',{method:'POST',body:JSON.stringify({versionId:coachState.versionId,days:coachState.days.map((d,i)=>({title:d.title,weekday:d.weekday,sequenceIndex:i,exercises:d.exercises.map(ex=>({exerciseId:ex.exerciseId,prescription:{sets:ex.sets,reps:ex.reps,restSec:ex.restSec}}))}))})});toast('Чернетку збережено');}
async function publish(){await saveDraft();await api('/training/programs/publish',{method:'POST',body:JSON.stringify({versionId:coachState.versionId})});toast('Програму опубліковано клієнту');coachState.versionId='';await selectClient(coachState.clientId);renderCoach();}
async function loadProgress(){coachState.progress=await api(`/training/coach/progress?workspaceId=${encodeURIComponent(coachState.workspaceId)}&clientId=${encodeURIComponent(coachState.clientId)}`);renderCoach();}
async function renderCoach(){const ws=await coachWorkspaces();panel.innerHTML=coachShell(ws);wireCoach(ws);}
function wireCoach(workspaces){$('#workspaceSelect')?.addEventListener('change',async e=>{if(!e.target.value){coachState={...coachState,workspaceId:'',clients:[],clientId:''};return renderCoach();}await loadCoachWorkspace(e.target.value);renderCoach();});panel.querySelectorAll('.client-pick').forEach(b=>b.onclick=async()=>{await selectClient(b.dataset.id);renderCoach();});$('#newProgramBtn')?.addEventListener('click',()=>createProgram().catch(e=>toast(e.message,true)));$('#progressBtn')?.addEventListener('click',()=>loadProgress().catch(e=>toast(e.message,true)));$('#addDayBtn')?.addEventListener('click',()=>{syncDaysFromDom();coachState.days.push({title:`День ${coachState.days.length+1}`,weekday:null,exercises:[]});renderCoach();});$('#searchBtn')?.addEventListener('click',()=>searchExercises().catch(e=>toast(e.message,true)));$('#exerciseSearch')?.addEventListener('keydown',e=>{if(e.key==='Enter')searchExercises().catch(er=>toast(er.message,true));});$('#customExBtn')?.addEventListener('click',()=>customExercise().catch(e=>toast(e.message,true)));panel.querySelectorAll('.add-ex').forEach(b=>b.onclick=()=>addExercise(b.dataset.id,b.dataset.name));panel.querySelectorAll('.remove-day').forEach((b,di)=>b.onclick=()=>{syncDaysFromDom();coachState.days.splice(di,1);renderCoach();});panel.querySelectorAll('.day-card').forEach((root,di)=>root.querySelectorAll('.remove-exercise').forEach((b,ei)=>b.onclick=()=>{syncDaysFromDom();coachState.days[di].exercises.splice(ei,1);renderCoach();}));$('#saveProgramBtn')?.addEventListener('click',()=>saveDraft().catch(e=>toast(e.message,true)));$('#publishProgramBtn')?.addEventListener('click',()=>publish().catch(e=>toast(e.message,true)));}

async function render(){if(mode==='coach'&&isCoach())return renderCoach();renderClient();}
async function init(){try{session=await api('/api/me');$('#loading').classList.add('hidden');$('#trainingApp').classList.remove('hidden');$('#trainingHello').textContent=`Привіт, ${session.user.display_name}`;$('#trainingIdentity').textContent=session.user.email||session.user.locale||'';await loadClient();tabs();render();}catch(e){$('#loading').classList.add('hidden');$('#signedOut').classList.remove('hidden');}}
init();
