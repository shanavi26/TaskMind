let tasks = [];
let history = [];
let busy = false;
let calendarEmail = localStorage.getItem('taskmindCalendarEmail') || '';

function nowStr(){
  return new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
}
function esc(s){
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function parseJSON(raw){
  let s = String(raw || '').trim()
    .replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/```\s*$/i,'').trim();
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if(a !== -1 && b !== -1){
    try { return JSON.parse(s.slice(a, b + 1)); } catch {}
  }
  try { return JSON.parse(s); } catch {}
  return {type:'chat', reply:s || 'Got it.'};
}
function normalizeDueDate(value){
  if(!value || String(value).toLowerCase() === 'null') return null;
  const s = String(value).trim();
  const d = new Date(s);
  if(!isNaN(d)) return d.toISOString().slice(0,10);
  return s;
}
function formatDueDate(value){
  const iso = normalizeDueDate(value);
  if(!iso) return null;
  const d = new Date(iso + 'T00:00:00');
  if(isNaN(d)) return iso;
  return d.toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'});
}
function addMsg(role, text){
  const wrap = document.getElementById('cmsgs');
  const el = document.createElement('div');
  el.className = 'msg ' + role;
  const av = document.createElement('div');
  av.className = 'av ' + (role === 'ai' ? 'aia' : 'usa');
  av.textContent = role === 'ai' ? 'C' : 'Me';
  const body = document.createElement('div');
  body.className = 'mbody';
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = text;
  const time = document.createElement('div');
  time.className = 'mtime';
  time.textContent = nowStr();
  body.appendChild(bubble); body.appendChild(time); el.appendChild(av); el.appendChild(body);
  wrap.appendChild(el); wrap.scrollTop = wrap.scrollHeight;
}
function showTyping(){
  const wrap = document.getElementById('cmsgs');
  const el = document.createElement('div');
  el.className = 'typdiv'; el.id = 'typdiv';
  el.innerHTML = `<div class="av aia">C</div><div class="tbubble"><div class="td"></div><div class="td"></div><div class="td"></div></div>`;
  wrap.appendChild(el); wrap.scrollTop = wrap.scrollHeight;
}
function hideTyping(){ document.getElementById('typdiv')?.remove(); }
function setBusy(v){ busy = v; document.getElementById('sbtn').disabled = v; }
function setCalendarEmail(email){
  calendarEmail = (email || '').trim();
  localStorage.setItem('taskmindCalendarEmail', calendarEmail);
  document.getElementById('calendarEmailText').textContent = calendarEmail || 'not set';
}
function currentTasksForAI(){
  return tasks.map(t => ({
    title: t.title,
    priority: t.priority,
    dueDate: t.dueDate,
    done: !!t.done,
    subtasks: t.subtasks.map(s => s.text)
  }));
}
function render(){
  const tbody = document.getElementById('tbody');
  const done = tasks.filter(t => t.done).length;
  const total = tasks.length;
  const pct = total ? Math.round((done/total)*100) : 0;
  document.getElementById('tmeta').textContent = total ? `${total} task${total !== 1 ? 's' : ''} · ${done} completed` : 'No tasks yet';
  document.getElementById('plabel').textContent = `${done} of ${total} complete`;
  document.getElementById('ppct').textContent = pct + '%';
  document.getElementById('pfill').style.width = pct + '%';
  document.getElementById('calendarEmailText').textContent = calendarEmail || 'not set';

  if(!tasks.length){
    tbody.innerHTML = `<div class="empty"><div class="etitle">No tasks yet</div><div class="esub">Describe what you need to get done. TaskMind can ask one short follow-up, update existing tasks, keep dates consistent, and open events in Google Calendar.</div></div>`;
    return;
  }
  const groups = [
    {dc:'dh', label:'High Priority', items: tasks.filter(t => !t.done && t.priority === 'high')},
    {dc:'dm', label:'Medium Priority', items: tasks.filter(t => !t.done && t.priority === 'medium')},
    {dc:'dl', label:'Low Priority', items: tasks.filter(t => !t.done && t.priority === 'low')},
    {dc:'dd', label:'Completed', items: tasks.filter(t => t.done)}
  ].filter(g => g.items.length);

  tbody.innerHTML = groups.map(g => `
    <div class="sec">
      <div class="slabel"><span class="dot ${g.dc}"></span>${g.label}<span class="scount">${g.items.length}</span></div>
      ${g.items.map(cardHTML).join('')}
    </div>
  `).join('');
}
function cardHTML(t){
  const badgeClass = {high:'bh', medium:'bm', low:'bl'}[t.priority] || 'bm';
  const due = formatDueDate(t.dueDate);
  return `
    <div class="tcard ${t.done ? 'done' : ''}">
      <div class="ttop">
        <div class="ck ${t.done ? 'on' : ''}" data-task="${t.id}" title="Mark task complete">${t.done ? '✓' : ''}</div>
        <div class="tinfo">
          <div class="tname">${esc(t.title)}</div>
          <div class="tbadges">
            <span class="badge ${badgeClass}">${esc(t.priority)}</span>
            ${due ? `<span class="badge bd">📅 ${esc(due)}</span>` : ''}
            ${calendarEmail ? `<span class="badge bg">${esc(calendarEmail)}</span>` : ''}
          </div>
        </div>
        <div class="tside">
          <button class="ibtn" data-cal="${t.id}" title="Open in Google Calendar">📅</button>
          <button class="ibtn" data-del="${t.id}" title="Delete">✕</button>
        </div>
      </div>
      ${t.subtasks && t.subtasks.length ? `<div class="swrap">
        ${t.subtasks.map((s, i) => `
          <div class="si">
            <div class="sc ${s.done ? 'on' : ''}" data-sub="${t.id}|${i}" title="Mark step complete">${s.done ? '✓' : ''}</div>
            <div class="st ${s.done ? 'ds' : ''}">${esc(s.text)}</div>
          </div>`).join('')}
      </div>` : ''}
    </div>`;
}
function normalizeTask(t, idx){
  return {
    id: Date.now() + idx + Math.floor(Math.random()*1000),
    title: String(t.title || 'Untitled'),
    priority: ['high','medium','low'].includes(t.priority) ? t.priority : 'medium',
    dueDate: normalizeDueDate(t.dueDate),
    done: false,
    subtasks: (t.subtasks || []).map(s => ({text: String(s), done: false}))
  };
}
function findTaskIndexByTarget(target){
  const q = String(target || '').trim().toLowerCase();
  if(!q) return -1;
  let idx = tasks.findIndex(t => t.title.toLowerCase() === q);
  if(idx !== -1) return idx;
  idx = tasks.findIndex(t => t.title.toLowerCase().includes(q) || q.includes(t.title.toLowerCase()));
  return idx;
}
function applyUpdate(ops){
  if(!Array.isArray(ops)) return;
  ops.forEach((op, i) => {
    const action = op.action;
    const idx = findTaskIndexByTarget(op.target);
    const fields = op.fields || {};
    if(action === 'add'){
      tasks.push(normalizeTask({
        title: fields.title || op.target || 'New task',
        priority: fields.priority || 'medium',
        dueDate: fields.dueDate || null,
        subtasks: fields.subtasks || []
      }, i));
      return;
    }
    if(idx === -1) return;
    const task = tasks[idx];
    if(action === 'delete'){
      tasks.splice(idx, 1);
    } else if(action === 'complete'){
      task.done = true;
    } else if(action === 'reopen'){
      task.done = false;
    } else if(action === 'edit'){
      if(fields.title) task.title = String(fields.title);
      if(fields.priority && ['high','medium','low'].includes(fields.priority)) task.priority = fields.priority;
      if('dueDate' in fields) task.dueDate = normalizeDueDate(fields.dueDate);
      if(Array.isArray(fields.subtasks)) task.subtasks = fields.subtasks.map(s => ({text: String(s), done: false}));
    }
  });
}
function googleCalendarUrl(task){
  const title = encodeURIComponent(task.title);
  const details = encodeURIComponent(
    task.subtasks && task.subtasks.length
      ? "Steps:\n" + task.subtasks.map((s, i) => `${i+1}. ${s.text}`).join('\n')
      : "Added from TaskMind"
  );
  let start = new Date();
  if(task.dueDate){
    const d = new Date(task.dueDate + 'T09:00:00');
    if(!isNaN(d)) start = d;
  }
  const end = new Date(start.getTime() + 60*60*1000);
  const fmt = d => d.toISOString().replace(/[-:]/g,'').split('.')[0] + 'Z';
  const auth = calendarEmail ? `&authuser=${encodeURIComponent(calendarEmail)}` : '';
  return `https://calendar.google.com/calendar/render?action=TEMPLATE${auth}&text=${title}&dates=${fmt(start)}/${fmt(end)}&details=${details}`;
}
function openModal(title, subtitle, value, onSave){
  const root = document.getElementById('modalRoot');
  root.innerHTML = `
    <div class="moverlay">
      <div class="mbox">
        <h3>${esc(title)}</h3>
        <div class="msub">${esc(subtitle)}</div>
        <div class="field">
          <label>Email</label>
          <input id="modalEmail" type="email" value="${esc(value || '')}" placeholder="name@gmail.com">
        </div>
        <div class="mbtns">
          <button class="mbcancel" id="modalCancel">Cancel</button>
          <button class="mbok" id="modalSave">Save</button>
        </div>
      </div>
    </div>`;
  document.getElementById('modalCancel').onclick = () => root.innerHTML = '';
  document.getElementById('modalSave').onclick = () => {
    onSave(document.getElementById('modalEmail').value.trim());
    root.innerHTML = '';
  };
  root.querySelector('.moverlay').onclick = e => { if(e.target.classList.contains('moverlay')) root.innerHTML = ''; };
}
async function send(){
  const cta = document.getElementById('cta');
  const text = cta.value.trim();
  if(!text || busy) return;
  cta.value = ''; cta.style.height = 'auto';
  addMsg('user', text); showTyping(); setBusy(true);
  history.push({role:'user', content:text});
  try{
    const res = await fetch('/api/chat', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({history, currentTasks: currentTasksForAI()})
    });
    const data = await res.json();
    hideTyping();
    if(!res.ok){ addMsg('ai', data.error || 'Request failed'); setBusy(false); return; }
    const parsed = parseJSON(data.reply);
    if(parsed.type === 'question'){
      addMsg('ai', parsed.reply || 'One quick question before I plan this.');
    } else if(parsed.type === 'tasks' && Array.isArray(parsed.tasks)){
      addMsg('ai', parsed.reply || 'Here is your task plan.');
      tasks.push(...parsed.tasks.map(normalizeTask));
      render();
    } else if(parsed.type === 'update' && Array.isArray(parsed.operations)){
      applyUpdate(parsed.operations);
      addMsg('ai', parsed.reply || 'Updated your existing tasks.');
      render();
    } else {
      addMsg('ai', parsed.reply || data.reply || 'Got it.');
    }
    history.push({role:'assistant', content:data.reply});
  }catch(err){
    hideTyping();
    addMsg('ai', err.message || 'Request failed');
  }
  setBusy(false);
}

document.getElementById('sbtn').addEventListener('click', send);
document.getElementById('cta').addEventListener('keydown', e => {
  if(e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); send(); }
});
document.getElementById('cta').addEventListener('input', e => {
  e.target.style.height = 'auto';
  e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
});
document.getElementById('logoutBtn').addEventListener('click', async () => {
  await fetch('/logout', {method:'POST'}); location.href = '/';
});
document.getElementById('sortBtn').addEventListener('click', () => {
  const rank = {high:0, medium:1, low:2};
  tasks.sort((a,b) => (rank[a.priority] ?? 1) - (rank[b.priority] ?? 1));
  render();
});
document.getElementById('clearBtn').addEventListener('click', () => { tasks = []; render(); });
document.getElementById('calendarSettingsBtn').addEventListener('click', () => {
  openModal('Google Calendar email', 'This version opens Google Calendar event pages for the Gmail you enter.', calendarEmail, setCalendarEmail);
});
document.getElementById('exportAllBtn').addEventListener('click', () => {
  if(!tasks.length){ addMsg('ai', 'No tasks to sync yet.'); return; }
  tasks.filter(t => !t.done).forEach((task, i) => setTimeout(() => window.open(googleCalendarUrl(task), '_blank'), i * 500));
});
document.getElementById('tbody').addEventListener('click', e => {
  const taskBtn = e.target.closest('[data-task]');
  const subBtn = e.target.closest('[data-sub]');
  const delBtn = e.target.closest('[data-del]');
  const calBtn = e.target.closest('[data-cal]');
  if(taskBtn){
    const id = Number(taskBtn.dataset.task);
    const t = tasks.find(x => x.id === id);
    if(t){ t.done = !t.done; render(); }
    return;
  }
  if(subBtn){
    const [id, idx] = subBtn.dataset.sub.split('|').map(Number);
    const t = tasks.find(x => x.id === id);
    if(t && t.subtasks[idx]){ t.subtasks[idx].done = !t.subtasks[idx].done; render(); }
    return;
  }
  if(delBtn){
    const id = Number(delBtn.dataset.del);
    tasks = tasks.filter(t => t.id !== id); render();
    return;
  }
  if(calBtn){
    const id = Number(calBtn.dataset.cal);
    const task = tasks.find(t => t.id === id);
    if(task) window.open(googleCalendarUrl(task), '_blank');
  }
});

setCalendarEmail(calendarEmail);
addMsg('ai', "Hey! I'm TaskMind — your AI task planner. Tell me what you need to get done. I can ask one short follow-up, update existing tasks, keep dates consistent, and open tasks in Google Calendar.");
render();