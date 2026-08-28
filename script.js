/* ============ Constants ============ */
const HABITS = [
  {key:'breakfast', icon:'🍳', label:'Breakfast'},
  {key:'fruits', icon:'🍎', label:'Fruits'},
  {key:'lunch', icon:'🍛', label:'Lunch'},
  {key:'tablets', icon:'💊', label:'Morning Tablets'},
  {key:'dinner', icon:'🍽️', label:'Dinner'},
  {key:'nightTablet', icon:'💊', label:'Night Tablet'},
  {key:'study', icon:'📚', label:'Study'},
];
const LEARNED = {key:'learned', icon:'💡', label:'New Thing Learned'};
const ALL_KEYS = HABITS.map(h=>h.key).concat(['learned']);
const TOTAL_ITEMS = 8;
const DOW_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/* ============ State ============ */
let state = {
  data: {},          // { 'YYYY-MM-DD': {breakfast:bool,...,learned:string} }
  weekStart: null,   // Date (Monday)
  view: 'dashboard',
  expandedDay: null, // ISO string
  selectedPrevWeek: null, // ISO monday string
  month: null,       // 'YYYY-MM'
};

/* ============ Date helpers ============ */
function todayDate(){ const d = new Date(); d.setHours(0,0,0,0); return d; }
function parseISO(s){ const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); }
function isoLocal(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function addDays(d,n){ const r = new Date(d); r.setDate(r.getDate()+n); return r; }
function mondayOf(d){ const day = d.getDay(); const diff = (day===0?-6:1-day); return addDays(d, diff); }
function fmtShort(d){ return d.getDate()+' '+MONTH_SHORT[d.getMonth()]; }
function dayName(d){ return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d.getDay()]; }
function weekDates(monday){ return Array.from({length:7},(_,i)=>addDays(monday,i)); }
function sameDate(a,b){ return isoLocal(a)===isoLocal(b); }
function daysInMonth(y,m){ return new Date(y, m+1, 0).getDate(); }

/* ============ Data helpers ============ */
function rec(ds){ return state.data[ds] || {}; }
function isDone(ds,key){
  const r = rec(ds);
  if(key==='learned') return !!(r.learned && r.learned.trim().length>0);
  return !!r[key];
}
function completedCount(ds){
  let c=0;
  HABITS.forEach(h=>{ if(isDone(ds,h.key)) c++; });
  if(isDone(ds,'learned')) c++;
  return c;
}
function hasAnyRecord(ds){ return !!state.data[ds] && Object.keys(state.data[ds]).length>0 && completedCount(ds)>=0 && (Object.values(state.data[ds]).some(v=> v===true || (typeof v==='string' && v.trim()) )); }

function toggleHabit(ds,key){
  if(!state.data[ds]) state.data[ds]={};
  state.data[ds][key] = !state.data[ds][key];
  markUnsaved();
  saveData(); render();
}
let learnedDebounceTimer = null;
function setLearned(ds,text){
  if(!state.data[ds]) state.data[ds]={};
  state.data[ds].learned = text;
  markUnsaved();
  clearTimeout(learnedDebounceTimer);
  learnedDebounceTimer = setTimeout(()=>{ saveData(); }, 600);
}
function resetDay(ds){
  delete state.data[ds];
  markUnsaved();
  saveData(); render();
}

/* ============ Autosave status (Google-Docs style) ============ */
let saveStatus = 'saved'; // 'saved' | 'saving' | 'unsaved' | 'error'
let saveStatusTimer = null;
function markUnsaved(){
  saveStatus = 'unsaved';
  paintSaveStatus();
}
function paintSaveStatus(){
  const el = document.getElementById('saveStatus');
  if(el) el.innerHTML = saveStatusHTML();
}
function saveStatusHTML(){
  if(saveStatus==='saving') return '<span class="sdot saving"></span>Saving…';
  if(saveStatus==='unsaved') return '<span class="sdot unsaved"></span>Unsaved changes';
  if(saveStatus==='error') return '<span class="sdot error"></span>Save failed — check storage';
  return '<span class="sdot saved"></span>All changes saved';
}

/* ============ Storage ============ */
/* Uses Claude's in-app storage when this page is previewed inside Claude.ai.
   Falls back to the browser's own localStorage when opened as a normal
   website/file, so data is never silently lost either way.
   Routine data is stored SHARED — anyone opening this same Claude artifact
   link sees and contributes to the same routine. The current week-view
   pointer stays personal, so each viewer can browse weeks independently. */
const hasCloudStorage = (typeof window!=='undefined') && !!window.storage && typeof window.storage.get==='function';
const canLiveSync = hasCloudStorage;

async function storageGet(key, shared){
  if(hasCloudStorage){
    try{ const r = await window.storage.get(key, !!shared); return r ? r.value : null; }
    catch(e){ /* fall through to localStorage */ }
  }
  try{ return localStorage.getItem(key); }catch(e){ return null; }
}
async function storageSet(key, value, shared){
  if(hasCloudStorage){
    try{ await window.storage.set(key, value, !!shared); return true; }
    catch(e){ /* fall through to localStorage */ }
  }
  try{ localStorage.setItem(key, value); return true; }catch(e){ return false; }
}

let lastKnownDataString = '{}';

async function loadState(){
  try{
    const v = await storageGet('routine-data', true);
    state.data = v ? JSON.parse(v) : {};
    lastKnownDataString = JSON.stringify(state.data);
  }catch(e){ state.data = {}; }
  try{
    const v = await storageGet('routine-weekstart', false);
    state.weekStart = v ? parseISO(v) : mondayOf(todayDate());
  }catch(e){ state.weekStart = mondayOf(todayDate()); }
  const now = todayDate();
  state.month = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
}
async function saveData(){
  saveStatus = 'saving';
  paintSaveStatus();
  const str = JSON.stringify(state.data);
  const ok = await storageSet('routine-data', str, true);
  if(ok) lastKnownDataString = str;
  clearTimeout(saveStatusTimer);
  saveStatus = ok ? 'saved' : 'error';
  paintSaveStatus();
  if(ok){
    // brief confirmation state, matching the "Saved" flash pattern in Docs
    saveStatusTimer = setTimeout(()=>{ if(saveStatus==='saved'){ paintSaveStatus(); } }, 1500);
  }
}
async function saveWeekStart(){
  await storageSet('routine-weekstart', isoLocal(state.weekStart), false);
}

/* ---- Live sync: poll shared storage so updates from the other person
   show up here without a manual reload. Skipped while actively typing
   in a "learned today" box, so we never clobber an in-progress edit. */
async function pollForRemoteUpdates(){
  if(!canLiveSync) return;
  const active = document.activeElement;
  const isTypingLearned = active && active.matches && active.matches('[data-action="learned"]');
  if(isTypingLearned || saveStatus==='saving' || saveStatus==='unsaved') return;
  try{
    const v = await storageGet('routine-data', true);
    if(v && v !== lastKnownDataString){
      lastKnownDataString = v;
      state.data = JSON.parse(v);
      render();
      flashSyncBadge();
    }
  }catch(e){ /* ignore transient errors */ }
}
function flashSyncBadge(){
  const el = document.getElementById('saveStatus');
  if(!el) return;
  el.innerHTML = '<span class="sdot synced"></span>Updated just now';
  setTimeout(()=>{ if(document.getElementById('saveStatus')) paintSaveStatus(); }, 1800);
}
setInterval(pollForRemoteUpdates, 6000);
document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) pollForRemoteUpdates(); });

/* Warn before leaving the tab if a debounced save hasn't flushed yet */
window.addEventListener('beforeunload', (e)=>{
  if(saveStatus==='unsaved' || saveStatus==='saving'){
    e.preventDefault(); e.returnValue='';
  }
});

/* ---- Manual backup / restore (portable across browsers/devices) ---- */
function exportBackup(){
  const payload = { exportedAt: new Date().toISOString(), data: state.data };
  const blob = new Blob([JSON.stringify(payload,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `threadline-backup-${isoLocal(todayDate())}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
function importBackupFile(file){
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const parsed = JSON.parse(reader.result);
      const incoming = parsed && parsed.data ? parsed.data : parsed;
      if(!incoming || typeof incoming !== 'object') throw new Error('bad file');
      state.data = Object.assign({}, state.data, incoming);
      markUnsaved();
      saveData(); render();
      alert('Backup restored successfully.');
    }catch(e){
      alert('Could not read that file — please choose a Threadline backup .json file.');
    }
  };
  reader.readAsText(file);
}

/* ============ Stats ============ */
function computeRangeStats(dateList){
  // dateList: array of ISO date strings
  const totalPossible = dateList.length * TOTAL_ITEMS;
  let totalCompleted = 0;
  const habitTotals = {}; ALL_KEYS.forEach(k=>habitTotals[k]=0);
  const dayPct = dateList.map(ds=>{
    const c = completedCount(ds);
    totalCompleted += c;
    ALL_KEYS.forEach(k=>{ if(isDone(ds,k)) habitTotals[k]++; });
    return {ds, c, pct: Math.round(c/TOTAL_ITEMS*100)};
  });
  const pct = totalPossible ? Math.round(totalCompleted/totalPossible*100) : 0;
  let bestDay = dayPct.length ? dayPct.reduce((a,b)=> b.pct>a.pct?b:a, dayPct[0]) : null;
  const habitEntries = Object.entries(habitTotals);
  let mostHabit = habitEntries.length ? habitEntries.reduce((a,b)=> b[1]>a[1]?b:a) : null;
  let leastHabit = habitEntries.length ? habitEntries.reduce((a,b)=> b[1]<a[1]?b:a) : null;
  return { totalCompleted, totalPossible, pending: totalPossible-totalCompleted, pct, dayPct, habitTotals, mostHabit, leastHabit, bestDay };
}

function habitLabel(key){
  if(key==='learned') return LEARNED;
  return HABITS.find(h=>h.key===key);
}

function computeStreak(){
  let streak=0;
  let d = todayDate();
  if(completedCount(isoLocal(d))===0) d = addDays(d,-1);
  while(completedCount(isoLocal(d))>0){ streak++; d=addDays(d,-1); }
  return streak;
}
function overallScore(){
  const keys = Object.keys(state.data).filter(k=>completedCount(k)>0 || Object.keys(state.data[k]).length>0);
  if(!keys.length) return null;
  let sum=0; keys.forEach(ds=> sum += completedCount(ds)/TOTAL_ITEMS);
  return Math.round(sum/keys.length*100);
}
function allTrackedDates(){
  return Object.keys(state.data).filter(ds=> completedCount(ds)>0 ).sort();
}
function weeksWithData(){
  const set = new Set();
  allTrackedDates().forEach(ds=> set.add(isoLocal(mondayOf(parseISO(ds)))));
  return Array.from(set).sort().reverse();
}

/* ============ SVG helpers ============ */
function ringSVG(pct, size, stroke, color){
  const r = (size-stroke)/2, c = 2*Math.PI*r;
  const off = c*(1-pct/100);
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="var(--sand)" stroke-width="${stroke}"/>
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}"
      stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}"
      transform="rotate(-90 ${size/2} ${size/2})" style="transition:stroke-dashoffset .5s ease"/>
    <text x="50%" y="53%" text-anchor="middle" font-family="Outfit,sans-serif" font-weight="700" font-size="${size*0.22}" fill="var(--ink)">${pct}%</text>
  </svg>`;
}

/* ============ Rendering ============ */
const app = document.getElementById('app');

function render(){
  const currentWeekMonday = isoLocal(mondayOf(todayDate()));
  const viewingMonday = isoLocal(state.weekStart);
  const dates = weekDates(state.weekStart);
  const weekLabel = `${fmtShort(dates[0])} – ${fmtShort(dates[6])}`;
  const isThisWeek = currentWeekMonday === viewingMonday;

  let body = '';
  if(state.view==='dashboard') body = renderDashboard(dates);
  else if(state.view==='weekly') body = renderWeeklyTracker(dates);
  else if(state.view==='weeklyAnalysis') body = renderWeeklyAnalysis();
  else if(state.view==='monthlyAnalysis') body = renderMonthlyAnalysis();

  app.innerHTML = `
  <div class="topbar">
    <div class="brand">
      <div class="brand-mark"></div>
      <div><h1>Threadline</h1><span>Daily Routine Tracker</span></div>
    </div>
    <nav class="tabs">
      <button data-nav="dashboard" class="${state.view==='dashboard'?'active':''}">🏠 Dashboard</button>
      <button data-nav="weekly" class="${state.view==='weekly'?'active':''}">📅 Weekly Tracker</button>
      <button data-nav="weeklyAnalysis" class="${state.view==='weeklyAnalysis'?'active':''}">📊 Weekly Analysis</button>
      <button data-nav="monthlyAnalysis" class="${state.view==='monthlyAnalysis'?'active':''}">📈 Monthly Analysis</button>
    </nav>
    <div class="topbar-right">
      <span id="saveStatus" class="savestatus">${saveStatusHTML()}</span>
      <div class="week-indicator">${isThisWeek?'CURRENT WEEK':'VIEWING'} · <span class="mono">${weekLabel}</span></div>
      ${canLiveSync ? '<button class="iconbtn" data-action="syncNow" title="Check for the latest updates now">🔄 Sync now</button>' : ''}
      <button class="iconbtn" data-action="exportData" title="Save a backup file">⬇️ Backup</button>
      <button class="iconbtn" data-action="importData" title="Restore from a backup file">⬆️ Restore</button>
      <input type="file" id="importFileInput" accept="application/json" style="display:none">
    </div>
  </div>
  ${canLiveSync ? '' : `<div class="syncnotice">⚠️ Live sync is off in this view — open this same Claude conversation link on both devices to see each other's updates automatically. Use Backup/Restore to transfer data manually otherwise.</div>`}
  <div class="container">${body}</div>
  `;
}

/* ---- Shared: week bar ---- */
function weekBarHTML(){
  const dates = weekDates(state.weekStart);
  return `
  <div class="card weekbar">
    <button class="navbtn" data-action="prevWeek">←</button>
    <div class="daterange">${fmtShort(dates[0])} <span style="color:#B8C2BC">–</span> ${fmtShort(dates[6])}, ${dates[0].getFullYear()}</div>
    <input type="date" id="weekPicker" value="${isoLocal(state.weekStart)}" data-action="pickWeek">
    <button class="today-btn" data-action="goToday">Today</button>
    <button class="navbtn" data-action="nextWeek">→</button>
  </div>`;
}

/* ---- Dashboard ---- */
function renderDashboard(dates){
  const todayISO = isoLocal(todayDate());
  const expanded = state.expandedDay || (dates.some(d=>isoLocal(d)===todayISO) ? todayISO : isoLocal(dates[0]));
  const stats = computeRangeStats(dates.map(isoLocal));
  const streak = computeStreak();
  const score = overallScore();

  const cards = dates.map(d=>{
    const ds = isoLocal(d);
    const c = completedCount(ds);
    const pct = Math.round(c/TOTAL_ITEMS*100);
    const beads = ALL_KEYS.map(k=>`<span class="bead ${isDone(ds,k)?'on':''}"></span>`).join('');
    return `<div class="daycard ${ds===expanded?'selected':''} ${ds===todayISO?'istoday':''}" data-action="expandDay" data-date="${ds}">
      <div class="dow">${dayName(d).slice(0,3)}</div>
      <div class="dnum">${d.getDate()}</div>
      <div class="beadrow">${beads}</div>
      <div class="pct">${pct}%</div>
    </div>`;
  }).join('');

  return `
    ${weekBarHTML()}
    <div class="badgebar">
      <div class="badge"><span class="em">🔥</span> Streak <span class="v">${streak} day${streak===1?'':'s'}</span></div>
      <div class="badge"><span class="em">⭐</span> Routine Score <span class="v">${score===null?'—':score+'%'}</span></div>
      <div class="badge"><span class="em">✅</span> This week <span class="v">${stats.totalCompleted}/${stats.totalPossible}</span></div>
    </div>
    <div class="daygrid">${cards}</div>
    ${renderDayPanel(expanded)}
    ${renderWeeklyStatsBlock(stats)}
  `;
}

function renderDayPanel(ds){
  const d = parseISO(ds);
  const items = HABITS.map(h=>{
    const on = isDone(ds,h.key);
    return `<div class="habititem ${on?'done':''}" data-action="toggleHabit" data-date="${ds}" data-habit="${h.key}">
      <span class="icon">${h.icon}</span><span class="label">${h.label}</span>
      <span class="checkdot">✓</span>
    </div>`;
  }).join('');
  const learnedVal = rec(ds).learned || '';
  const learnedDone = isDone(ds,'learned');
  return `
  <div class="card daypanel">
    <div class="head">
      <div><h3>${dayName(d)}, ${fmtShort(d)}</h3><div class="sub">${completedCount(ds)}/${TOTAL_ITEMS} completed</div></div>
      <button class="resetbtn" data-action="resetDay" data-date="${ds}">Reset day</button>
    </div>
    <div class="habitlist">
      ${items}
      <div class="learnbox ${learnedDone?'done':''}">
        <div class="lhead"><span>💡</span> New Thing Learned Today</div>
        <textarea placeholder="Write what you learned…" data-action="learned" data-date="${ds}">${escapeHtml(learnedVal)}</textarea>
      </div>
    </div>
  </div>`;
}

function renderWeeklyStatsBlock(stats){
  const bestDayName = stats.bestDay ? dayName(parseISO(stats.bestDay.ds)) : '—';
  const mostHab = stats.mostHabit ? habitLabel(stats.mostHabit[0]) : null;
  const leastHab = stats.leastHabit ? habitLabel(stats.leastHabit[0]) : null;
  return `
  <div class="section-title"><div><h2>Weekly Progress</h2><p>How this week's routine is shaping up</p></div></div>
  <div class="statgrid">
    <div class="card ringwrap">
      ${ringSVG(stats.pct,108,11,'var(--sage)')}
      <div class="nums">
        <div class="big">${stats.pct}% complete</div>
        <div class="row"><span>Completed</span><b>${stats.totalCompleted}</b></div>
        <div class="row"><span>Pending</span><b>${stats.pending}</b></div>
        <div class="row"><span>Possible</span><b>${stats.totalPossible}</b></div>
      </div>
    </div>
    <div class="card statcard">
      <div class="minirow"><span class="tag">🏆 Best day</span><span class="val">${bestDayName}</span></div>
      <div class="minirow"><span class="tag">${mostHab?mostHab.icon:''} Most consistent</span><span class="val">${mostHab?mostHab.label:'—'}</span></div>
      <div class="minirow"><span class="tag">${leastHab?leastHab.icon:''} Least completed</span><span class="val">${leastHab?leastHab.label:'—'}</span></div>
    </div>
    <div class="card statcard">
      ${ALL_KEYS.map(k=>{
        const hl = habitLabel(k);
        const tot = stats.habitTotals[k]||0;
        return `<div class="minirow"><span class="tag">${hl.icon} ${hl.label}</span><span class="val">${tot}/7</span></div>`;
      }).join('')}
    </div>
  </div>`;
}

/* ---- Weekly Tracker (matrix) ---- */
function renderWeeklyTracker(dates){
  const rows = HABITS.map(h=>{
    const cells = dates.map(d=>{
      const ds = isoLocal(d);
      const on = isDone(ds,h.key);
      return `<td class="center"><div class="cellcheck ${on?'on':''}" data-action="toggleHabit" data-date="${ds}" data-habit="${h.key}">✓</div></td>`;
    }).join('');
    return `<tr><td class="habitcol">${h.icon} ${h.label}</td>${cells}</tr>`;
  }).join('');

  const learnCells = dates.map(d=>{
    const ds = isoLocal(d);
    return `<td class="learnrow"><textarea placeholder="…" data-action="learned" data-date="${ds}">${escapeHtml(rec(ds).learned||'')}</textarea></td>`;
  }).join('');

  const totalsCells = dates.map(d=>{
    const ds = isoLocal(d);
    return `<td>${completedCount(ds)}/${TOTAL_ITEMS}</td>`;
  }).join('');

  const head = dates.map(d=>`<th>${dayName(d).slice(0,3)}<br><span class="mono">${d.getDate()}</span></th>`).join('');

  return `
    ${weekBarHTML()}
    <div class="section-title"><div><h2>Weekly Tracker</h2><p>Edit any day in the week at a glance</p></div>
      <button class="resetbtn" data-action="resetTodayGlobal">Reset today's tasks</button>
    </div>
    <div class="card matrixwrap">
      <table class="matrix">
        <thead><tr><th class="habitcol">Habit</th>${head}</tr></thead>
        <tbody>
          ${rows}
          <tr><td class="habitcol">💡 Learned</td>${learnCells}</tr>
        </tbody>
        <tfoot><tr><td class="habitcol">Total</td>${totalsCells}</tr></tfoot>
      </table>
    </div>
  `;
}

/* ---- Weekly Analysis ---- */
function renderWeeklyAnalysis(){
  const weeks = weeksWithData();
  if(!weeks.length){
    return `<div class="section-title"><div><h2>Weekly Analysis</h2><p>Look back at any completed week</p></div></div>
      ${emptyState('📭','No previous weeks yet','Start tracking your days on the Dashboard — your finished weeks will show up here.')}`;
  }
  const selected = state.selectedPrevWeek && weeks.includes(state.selectedPrevWeek) ? state.selectedPrevWeek : weeks[0];
  const rows = weeks.map(wk=>{
    const mon = parseISO(wk);
    const ds = weekDates(mon).map(isoLocal);
    const st = computeRangeStats(ds);
    return `<div class="weekrow ${wk===selected?'active':''}" data-action="selectPrevWeek" data-week="${wk}">
      <div class="wdates">${fmtShort(mon)} – ${fmtShort(addDays(mon,6))}</div>
      <div class="barmini"><i style="width:${st.pct}%"></i></div>
      <div class="wpct">${st.pct}%</div>
    </div>`;
  }).join('');

  const mon = parseISO(selected);
  const ds = weekDates(mon).map(isoLocal);
  const st = computeRangeStats(ds);
  const bestDayName = st.bestDay? dayName(parseISO(st.bestDay.ds)) : '—';
  const mostHab = st.mostHabit ? habitLabel(st.mostHabit[0]) : null;
  const leastHab = st.leastHabit ? habitLabel(st.leastHabit[0]) : null;

  const learnEntries = ds.filter(d=> isDone(d,'learned')).map(d=>{
    return `<div class="lentry"><b>${fmtShort(parseISO(d))}</b>${escapeHtml(rec(d).learned)}</div>`;
  }).join('') || `<div class="lentry" style="color:#9AA59E">Nothing logged this week.</div>`;

  return `
    <div class="section-title"><div><h2>Weekly Analysis</h2><p>Select a week to see the full breakdown</p></div></div>
    <div class="weeklist">${rows}</div>

    <div class="statgrid">
      <div class="card ringwrap">
        ${ringSVG(st.pct,108,11,'var(--clay)')}
        <div class="nums">
          <div class="big">${fmtShort(mon)} – ${fmtShort(addDays(mon,6))}</div>
          <div class="row"><span>Completed</span><b>${st.totalCompleted}</b></div>
          <div class="row"><span>Missed</span><b>${st.pending}</b></div>
        </div>
      </div>
      <div class="card statcard">
        <div class="minirow"><span class="tag">🏆 Best day</span><span class="val">${bestDayName}</span></div>
        <div class="minirow"><span class="tag">${mostHab?mostHab.icon:''} Most consistent</span><span class="val">${mostHab?mostHab.label:'—'}</span></div>
        <div class="minirow"><span class="tag">${leastHab?leastHab.icon:''} Least completed</span><span class="val">${leastHab?leastHab.label:'—'}</span></div>
      </div>
      <div class="card statcard">
        ${ALL_KEYS.map(k=>{
          const hl = habitLabel(k); const tot = st.habitTotals[k]||0;
          return `<div class="minirow"><span class="tag">${hl.icon} ${hl.label}</span><span class="val">${tot}/7</span></div>`;
        }).join('')}
      </div>
    </div>

    <div class="card detailblock">
      <h4>💡 What was learned this week</h4>
      <div class="learnlog">${learnEntries}</div>
    </div>
  `;
}

/* ---- Monthly Analysis ---- */
function renderMonthlyAnalysis(){
  const [y,m] = state.month.split('-').map(Number);
  const dim = daysInMonth(y, m-1);
  const today = todayDate();
  const isCurrentOrPastMonth = (y < today.getFullYear()) || (y===today.getFullYear() && m-1 <= today.getMonth());
  const lastDayToCount = (y===today.getFullYear() && m-1===today.getMonth()) ? today.getDate() : dim;

  const monthPicker = `<div class="monthpick"><label class="mono" style="font-size:12px;color:#8B978F">Month</label>
    <input type="month" id="monthPicker" value="${state.month}" data-action="pickMonth"></div>`;

  if(!isCurrentOrPastMonth){
    return `<div class="toprow"><div><h2>Monthly Analysis</h2></div>${monthPicker}</div>
      ${emptyState('🗓️','Nothing here yet','This month has not happened yet — come back once you have logged some days.')}`;
  }

  const monthDates = Array.from({length:lastDayToCount},(_,i)=> `${y}-${String(m).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`);
  const anyData = monthDates.some(ds=> completedCount(ds)>0);
  const st = computeRangeStats(monthDates);

  if(!anyData){
    return `<div class="toprow"><div><h2>Monthly Analysis</h2></div>${monthPicker}</div>
      ${emptyState('📭','No data for this month','Track a few days this month to unlock the full analysis.')}`;
  }

  // group by week (Mon-Sun) for weekly comparison chart
  const weekMap = {};
  monthDates.forEach(ds=>{
    const wk = isoLocal(mondayOf(parseISO(ds)));
    if(!weekMap[wk]) weekMap[wk] = [];
    weekMap[wk].push(ds);
  });
  const weekKeys = Object.keys(weekMap).sort();
  const weekStats = weekKeys.map(wk=>({wk, st: computeRangeStats(weekMap[wk])}));
  const bestWeek = weekStats.reduce((a,b)=> b.st.pct>a.st.pct?b:a, weekStats[0]);
  const bestDay = st.bestDay;
  const mostHab = st.mostHabit? habitLabel(st.mostHabit[0]) : null;
  const leastHab = st.leastHabit? habitLabel(st.leastHabit[0]) : null;

  const bars = weekStats.map((w,i)=>`
    <div class="bcol">
      <div class="bval">${w.st.pct}%</div>
      <div class="bar" style="height:${Math.max(w.st.pct,3)}%"></div>
      <div class="blabel">Wk ${i+1}</div>
    </div>`).join('');

  // donut for habit-wise
  const colors = ['#6E9E86','#C97B4A','#8FB89E','#E0A876','#4F7A64','#D9C79A','#A9C6B6','#B98A5F'];
  let cursor = 0;
  const totalHabitSum = ALL_KEYS.reduce((s,k)=> s + (st.habitTotals[k]||0), 0) || 1;
  const gradientParts = ALL_KEYS.map((k,i)=>{
    const val = st.habitTotals[k]||0;
    const deg = val/totalHabitSum*360;
    const part = `${colors[i%colors.length]} ${cursor}deg ${cursor+deg}deg`;
    cursor += deg;
    return part;
  }).join(', ');
  const legend = ALL_KEYS.map((k,i)=>{
    const hl = habitLabel(k);
    return `<div class="litem"><span class="lname"><span class="swatch" style="background:${colors[i%colors.length]}"></span>${hl.icon} ${hl.label}</span><span class="lval">${st.habitTotals[k]||0}</span></div>`;
  }).join('');

  // calendar heatmap
  const firstOfMonth = new Date(y, m-1, 1);
  const leadBlanks = (firstOfMonth.getDay()+6)%7; // make Monday=0
  const calCells = [];
  for(let i=0;i<leadBlanks;i++) calCells.push(`<div class="calcell empty"></div>`);
  for(let day=1; day<=dim; day++){
    const ds = `${y}-${String(m).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const hasPassed = day<=lastDayToCount;
    let bg = 'var(--sand)', color='var(--ink-2)';
    if(hasPassed){
      const pct = completedCount(ds)/TOTAL_ITEMS;
      if(pct>=0.9){bg='var(--sage)';color='#fff';}
      else if(pct>=0.5){bg='var(--sage-tint)';color='var(--sage-dark)';}
      else if(pct>0){bg='var(--clay-tint)';color='var(--clay)';}
      else {bg='var(--sand)';color='#9AA59E';}
    } else { bg='transparent'; color='#D8D0C0'; }
    calCells.push(`<div class="calcell" style="background:${bg};color:${color};${hasPassed?'':'border:1px dashed var(--line)'}" title="${ds}">${day}</div>`);
  }

  return `
    <div class="toprow"><div><h2>Monthly Analysis</h2><p style="color:#8B978F;font-size:13px;margin-top:2px">${MONTH_SHORT[m-1]} ${y} overview</p></div>${monthPicker}</div>

    <div class="statgrid">
      <div class="card ringwrap">
        ${ringSVG(st.pct,108,11,'var(--sage)')}
        <div class="nums">
          <div class="big">${st.pct}% complete</div>
          <div class="row"><span>Completed</span><b>${st.totalCompleted}</b></div>
          <div class="row"><span>Missed</span><b>${st.pending}</b></div>
        </div>
      </div>
      <div class="card statcard">
        <div class="minirow"><span class="tag">🏆 Best week</span><span class="val">Wk ${weekStats.indexOf(bestWeek)+1} · ${bestWeek.st.pct}%</span></div>
        <div class="minirow"><span class="tag">📌 Best day</span><span class="val">${bestDay?dayName(parseISO(bestDay.ds))+' '+fmtShort(parseISO(bestDay.ds)):'—'}</span></div>
      </div>
      <div class="card statcard">
        <div class="minirow"><span class="tag">${mostHab?mostHab.icon:''} Most completed</span><span class="val">${mostHab?mostHab.label:'—'}</span></div>
        <div class="minirow"><span class="tag">${leastHab?leastHab.icon:''} Least completed</span><span class="val">${leastHab?leastHab.label:'—'}</span></div>
      </div>
    </div>

    <div class="chartrow">
      <div class="card">
        <div style="padding:14px 18px 0"><h4 style="font-size:14px;color:var(--ink)">Weekly completion</h4></div>
        <div class="barchart">${bars}</div>
      </div>
      <div class="card donutwrap">
        <div class="donut" style="background:conic-gradient(${gradientParts})"></div>
        <div class="legend">${legend}</div>
      </div>
    </div>

    <div class="card calmonth">
      <h4 style="font-size:14px;color:var(--ink)">Daily performance</h4>
      <div class="calgrid">
        ${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=>`<div class="caldow">${d}</div>`).join('')}
        ${calCells.join('')}
      </div>
    </div>
  `;
}

function emptyState(emoji,title,text){
  return `<div class="card empty-state"><div class="emoji">${emoji}</div><h3>${title}</h3><p>${text}</p></div>`;
}

function escapeHtml(s){
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ============ Events (delegated) ============ */
app.addEventListener('click', (e)=>{
  const el = e.target.closest('[data-action], [data-nav]');
  if(!el) return;
  const nav = el.getAttribute('data-nav');
  if(nav){ state.view = nav; state.expandedDay=null; render(); return; }

  const action = el.getAttribute('data-action');
  if(action==='prevWeek'){ state.weekStart = addDays(state.weekStart,-7); saveWeekStart(); render(); }
  else if(action==='nextWeek'){ state.weekStart = addDays(state.weekStart,7); saveWeekStart(); render(); }
  else if(action==='goToday'){ state.weekStart = mondayOf(todayDate()); state.expandedDay=null; saveWeekStart(); render(); }
  else if(action==='expandDay'){ state.expandedDay = el.getAttribute('data-date'); render(); }
  else if(action==='toggleHabit'){ toggleHabit(el.getAttribute('data-date'), el.getAttribute('data-habit')); }
  else if(action==='resetDay'){ if(confirm('Reset all tracking for this day?')) resetDay(el.getAttribute('data-date')); }
  else if(action==='resetTodayGlobal'){ if(confirm("Reset today's tasks?")) resetDay(isoLocal(todayDate())); }
  else if(action==='selectPrevWeek'){ state.selectedPrevWeek = el.getAttribute('data-week'); render(); }
  else if(action==='exportData'){ exportBackup(); }
  else if(action==='importData'){ document.getElementById('importFileInput').click(); }
  else if(action==='syncNow'){ pollForRemoteUpdates(); }
});

app.addEventListener('change', (e)=>{
  if(e.target.id==='importFileInput' && e.target.files && e.target.files[0]){
    importBackupFile(e.target.files[0]);
  }
});

app.addEventListener('change', (e)=>{
  const el = e.target;
  if(el.id==='weekPicker'){
    state.weekStart = mondayOf(parseISO(el.value));
    state.expandedDay=null;
    saveWeekStart(); render();
  } else if(el.id==='monthPicker'){
    state.month = el.value; render();
  }
});

app.addEventListener('input', (e)=>{
  const el = e.target.closest('[data-action="learned"]');
  if(!el) return;
  const ds = el.getAttribute('data-date');
  setLearned(ds, el.value);
});

/* ============ Init ============ */
(async function init(){
  await loadState();
  render();
})();
