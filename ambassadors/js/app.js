/* =========================================================
   سفراء فلج — مدير مشروع السفراء
   تطبيق ويب صرف: الحالة تُحفظ في localStorage بلا أي خادم.
   ========================================================= */

const STORE_KEY = 'falaj_ambassadors_v1';

/* ---------- بيانات تجريبية أولية ---------- */
function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function seedState() {
  return {
    ambassadors: [
      { id: 1, name: 'مريم الكعبي',   region: 'العين',      status: 'active',   points: 320 },
      { id: 2, name: 'سيف المنصوري',  region: 'أبوظبي',     status: 'active',   points: 275 },
      { id: 3, name: 'حصة الشامسي',   region: 'دبي',        status: 'active',   points: 240 },
      { id: 4, name: 'محمد النعيمي',   region: 'الشارقة',    status: 'inactive', points: 150 },
      { id: 5, name: 'شما الظاهري',   region: 'رأس الخيمة', status: 'active',   points: 95  },
    ],
    tasks: [
      { id: 1, title: 'حملة توعية بترشيد الريّ في المدارس', ambassadorId: 1, priority: 'high',   status: 'doing', due: daysFromNow(3)  },
      { id: 2, title: 'جولة تعريفية بنظام فلج في مزرعة الواحة', ambassadorId: 2, priority: 'medium', status: 'todo',  due: daysFromNow(7)  },
      { id: 3, title: 'تغطية إعلامية لفعالية يوم البيئة',       ambassadorId: 3, priority: 'high',   status: 'todo',  due: daysFromNow(5)  },
      { id: 4, title: 'ورشة تدريب السفراء الجدد',               ambassadorId: 1, priority: 'medium', status: 'done',  due: daysFromNow(-4) },
      { id: 5, title: 'تقرير شهري عن استهلاك المياه',            ambassadorId: 5, priority: 'low',    status: 'doing', due: daysFromNow(10) },
      { id: 6, title: 'تنسيق زيارة مدرسية لمركز فلج',            ambassadorId: 4, priority: 'low',    status: 'done',  due: daysFromNow(-9) },
    ],
    events: [
      { id: 1, title: 'ملتقى سفراء فلج الربعي',      location: 'واحة العين',        date: daysFromNow(12), ambassadorIds: [1, 2, 3] },
      { id: 2, title: 'معرض الابتكار الزراعي',        location: 'مركز أدنيك، أبوظبي', date: daysFromNow(25), ambassadorIds: [2, 5] },
      { id: 3, title: 'يوم تطوعي: زراعة أشجار الغاف', location: 'الشارقة',            date: daysFromNow(-6), ambassadorIds: [3, 4] },
    ],
    activity: [
      { text: 'انضمّت شما الظاهري إلى فريق السفراء', when: daysFromNow(-2) },
      { text: 'أُنجزت ورشة تدريب السفراء الجدد',      when: daysFromNow(-4) },
      { text: 'أُطلقت حملة ترشيد الريّ في المدارس',    when: daysFromNow(-5) },
    ],
    nextId: 100,
  };
}

/* ---------- الحالة ---------- */
let state;
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    state = raw ? JSON.parse(raw) : seedState();
  } catch { state = seedState(); }
}
function save() { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
function nid() { return state.nextId++; }

function logActivity(text) {
  state.activity.unshift({ text, when: daysFromNow(0) });
  state.activity = state.activity.slice(0, 12);
}

/* ---------- أدوات ---------- */
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const AVATAR_COLORS = ['#00f5a0', '#00d4ff', '#ffd23f', '#ff8a3d', '#a855ff', '#ff2d8e', '#2e9bff'];
const MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

function ambById(id) { return state.ambassadors.find((a) => a.id === id); }
function ambName(id) { const a = ambById(id); return a ? a.name : 'غير مُسنَد'; }
function initials(name) { return name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join(''); }
function avatarColor(id) { return AVATAR_COLORS[id % AVATAR_COLORS.length]; }

function fmtDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return `${d.getDate()} ${MONTHS_AR[d.getMonth()]}`;
}
function daysUntil(iso) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((new Date(iso + 'T00:00:00') - today) / 86400000);
}
function dueLabel(iso) {
  const n = daysUntil(iso);
  if (n < 0)  return { text: `متأخرة ${-n} يوم`, overdue: true };
  if (n === 0) return { text: 'اليوم', overdue: false };
  if (n === 1) return { text: 'غدًا', overdue: false };
  return { text: `بعد ${n} أيام`, overdue: false };
}

const PRI = { high: 'عالية', medium: 'متوسطة', low: 'منخفضة' };
const COLS = [
  { key: 'todo',  label: 'جديدة',        color: '#2e9bff' },
  { key: 'doing', label: 'قيد التنفيذ',  color: '#ffd23f' },
  { key: 'done',  label: 'مكتملة',       color: '#00f5a0' },
];

/* ---------- التبويبات ---------- */
$('#tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.tab');
  if (!btn) return;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === btn));
  document.querySelectorAll('.screen').forEach((s) =>
    s.classList.toggle('hidden', s.id !== 'screen-' + btn.dataset.tab));
});

/* ---------- لوحة التحكم ---------- */
function renderDashboard() {
  const active = state.ambassadors.filter((a) => a.status === 'active').length;
  const open = state.tasks.filter((t) => t.status !== 'done').length;
  const done = state.tasks.filter((t) => t.status === 'done').length;
  const upcoming = state.events.filter((e) => daysUntil(e.date) >= 0).length;
  const points = state.ambassadors.reduce((s, a) => s + a.points, 0);

  $('#kpiGrid').innerHTML = [
    { icon: '🧑‍🤝‍🧑', value: state.ambassadors.length, label: `السفراء (${active} نشط)` },
    { icon: '📋', value: open,     label: 'مهام مفتوحة' },
    { icon: '✅', value: done,     label: 'مهام مكتملة' },
    { icon: '📅', value: upcoming, label: 'فعاليات قادمة' },
    { icon: '⭐', value: points,   label: 'إجمالي النقاط' },
  ].map((k) => `
    <div class="kpi">
      <span class="kpi-icon">${k.icon}</span>
      <span class="kpi-value">${k.value}</span>
      <span class="kpi-label">${k.label}</span>
    </div>`).join('');

  const total = state.tasks.length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  $('#taskProgressLabel').textContent = `${done} من ${total} (${pct}٪)`;
  $('#taskProgressBar').style.width = pct + '%';
  $('#taskLegend').innerHTML = COLS.map((c) => {
    const n = state.tasks.filter((t) => t.status === c.key).length;
    return `<span><i class="dot" style="background:${c.color}"></i>${c.label}: ${n}</span>`;
  }).join('');

  const dueSoon = state.tasks
    .filter((t) => t.status !== 'done')
    .sort((a, b) => a.due.localeCompare(b.due))
    .slice(0, 5);
  $('#dueSoonList').innerHTML = dueSoon.length
    ? dueSoon.map((t) => {
        const d = dueLabel(t.due);
        return `<li><span>${esc(t.title)}</span>
          <span class="when ${d.overdue ? 'task-due overdue' : ''}">${d.text}</span></li>`;
      }).join('')
    : '<li class="empty">لا مهام مفتوحة — أحسنتم! 🎉</li>';

  $('#activityList').innerHTML = state.activity.length
    ? state.activity.slice(0, 5).map((a) =>
        `<li><span>${esc(a.text)}</span><span class="when">${fmtDate(a.when)}</span></li>`).join('')
    : '<li class="empty">لا نشاطات بعد</li>';
}

/* ---------- السفراء ---------- */
function renderAmbassadors() {
  $('#ambassadorGrid').innerHTML = state.ambassadors.map((a) => {
    const open = state.tasks.filter((t) => t.ambassadorId === a.id && t.status !== 'done').length;
    const done = state.tasks.filter((t) => t.ambassadorId === a.id && t.status === 'done').length;
    return `
    <div class="amb-card">
      <div class="amb-top">
        <div class="avatar" style="background:${avatarColor(a.id)}">${esc(initials(a.name))}</div>
        <div>
          <div class="amb-name">${esc(a.name)}</div>
          <div class="amb-region">📍 ${esc(a.region)}</div>
        </div>
        <span class="chip ${a.status}">${a.status === 'active' ? 'نشط' : 'غير نشط'}</span>
      </div>
      <div class="amb-stats">
        <span>⭐ <b>${a.points}</b> نقطة</span>
        <span>📋 <b>${open}</b> مفتوحة</span>
        <span>✅ <b>${done}</b> مكتملة</span>
      </div>
      <div class="amb-actions">
        <button class="btn btn-ghost btn-sm" data-edit-amb="${a.id}">تعديل</button>
        <button class="btn btn-ghost btn-sm" data-points="${a.id}">+10 ⭐</button>
        <button class="btn btn-danger btn-sm" data-del-amb="${a.id}">حذف</button>
      </div>
    </div>`;
  }).join('') || '<p class="muted">لا يوجد سفراء بعد — أضف أول سفير!</p>';
}

$('#ambassadorGrid').addEventListener('click', (e) => {
  const edit = e.target.closest('[data-edit-amb]');
  const del  = e.target.closest('[data-del-amb]');
  const pts  = e.target.closest('[data-points]');
  if (edit) openAmbassadorModal(Number(edit.dataset.editAmb));
  if (pts) {
    const a = ambById(Number(pts.dataset.points));
    a.points += 10;
    logActivity(`حصل ${a.name} على 10 نقاط`);
    save(); renderAll();
  }
  if (del) {
    const a = ambById(Number(del.dataset.delAmb));
    if (!confirm(`حذف السفير «${a.name}»؟ ستُلغى إسنادات مهامه.`)) return;
    state.ambassadors = state.ambassadors.filter((x) => x.id !== a.id);
    state.tasks.forEach((t) => { if (t.ambassadorId === a.id) t.ambassadorId = null; });
    state.events.forEach((ev) => { ev.ambassadorIds = ev.ambassadorIds.filter((id) => id !== a.id); });
    logActivity(`غادر ${a.name} فريق السفراء`);
    save(); renderAll();
  }
});

/* ---------- المهام (كانبان) ---------- */
function renderTasks() {
  $('#kanban').innerHTML = COLS.map((col) => {
    const items = state.tasks.filter((t) => t.status === col.key)
      .sort((a, b) => a.due.localeCompare(b.due));
    return `
    <div class="kanban-col">
      <div class="kanban-col-head">
        <i class="dot" style="background:${col.color}"></i>${col.label}
        <span class="count">${items.length}</span>
      </div>
      ${items.map((t) => taskCard(t, col.key)).join('') || '<p class="muted">لا مهام هنا</p>'}
    </div>`;
  }).join('');
}

function taskCard(t, colKey) {
  const d = dueLabel(t.due);
  const moves = {
    todo:  [{ to: 'doing', label: 'ابدأ ◀' }],
    doing: [{ to: 'todo', label: '▶ أرجِع' }, { to: 'done', label: 'أنجِز ✓' }],
    done:  [{ to: 'doing', label: '▶ أعد فتحها' }],
  }[colKey];
  return `
  <div class="task-card">
    <div class="task-title">${esc(t.title)}</div>
    <div class="task-meta">
      <span class="pri ${t.priority}">${PRI[t.priority]}</span>
      <span>👤 ${esc(ambName(t.ambassadorId))}</span>
      <span class="task-due ${d.overdue && colKey !== 'done' ? 'overdue' : ''}">⏰ ${d.text}</span>
    </div>
    <div class="task-actions">
      ${moves.map((m) => `<button class="move-btn" data-move="${t.id}:${m.to}">${m.label}</button>`).join('')}
      <button class="move-btn" data-edit-task="${t.id}">تعديل</button>
      <button class="move-btn" data-del-task="${t.id}" style="color:var(--red)">حذف</button>
    </div>
  </div>`;
}

$('#kanban').addEventListener('click', (e) => {
  const move = e.target.closest('[data-move]');
  const edit = e.target.closest('[data-edit-task]');
  const del  = e.target.closest('[data-del-task]');
  if (move) {
    const [id, to] = move.dataset.move.split(':');
    const t = state.tasks.find((x) => x.id === Number(id));
    t.status = to;
    if (to === 'done') {
      const a = ambById(t.ambassadorId);
      if (a) { a.points += 25; logActivity(`أنجز ${a.name} مهمة «${t.title}» (+25 ⭐)`); }
      else logActivity(`أُنجزت مهمة «${t.title}»`);
    }
    save(); renderAll();
  }
  if (edit) openTaskModal(Number(edit.dataset.editTask));
  if (del) {
    const t = state.tasks.find((x) => x.id === Number(del.dataset.delTask));
    if (!confirm(`حذف مهمة «${t.title}»؟`)) return;
    state.tasks = state.tasks.filter((x) => x.id !== t.id);
    save(); renderAll();
  }
});

/* ---------- الفعاليات ---------- */
function renderEvents() {
  const sorted = [...state.events].sort((a, b) => a.date.localeCompare(b.date));
  const upcoming = sorted.filter((e) => daysUntil(e.date) >= 0);
  const past = sorted.filter((e) => daysUntil(e.date) < 0).reverse();
  $('#eventsList').innerHTML = [...upcoming, ...past].map((ev) => {
    const d = new Date(ev.date + 'T00:00:00');
    const names = ev.ambassadorIds.map(ambName).join('، ') || 'بلا سفراء بعد';
    const isPast = daysUntil(ev.date) < 0;
    return `
    <div class="event-card ${isPast ? 'past' : ''}">
      <div class="event-date">
        <span class="d">${d.getDate()}</span>
        <span class="m">${MONTHS_AR[d.getMonth()]}</span>
      </div>
      <div class="event-body">
        <div class="event-title">${esc(ev.title)} ${isPast ? '· انتهت' : ''}</div>
        <div class="event-loc">📍 ${esc(ev.location)}</div>
        <div class="event-amb">🧑‍🤝‍🧑 ${esc(names)}</div>
      </div>
      <button class="btn btn-danger btn-sm" data-del-event="${ev.id}">حذف</button>
    </div>`;
  }).join('') || '<p class="muted">لا فعاليات — أضف أول فعالية!</p>';
}

$('#eventsList').addEventListener('click', (e) => {
  const del = e.target.closest('[data-del-event]');
  if (!del) return;
  const ev = state.events.find((x) => x.id === Number(del.dataset.delEvent));
  if (!confirm(`حذف فعالية «${ev.title}»؟`)) return;
  state.events = state.events.filter((x) => x.id !== ev.id);
  save(); renderAll();
});

/* ---------- لوحة الشرف ---------- */
function renderBoard() {
  const sorted = [...state.ambassadors].sort((a, b) => b.points - a.points);
  const max = sorted[0]?.points || 1;
  $('#board').innerHTML = sorted.map((a, i) => `
    <li>
      <span class="rank">${['🥇', '🥈', '🥉'][i] || i + 1}</span>
      <div class="avatar" style="background:${avatarColor(a.id)};width:36px;height:36px;font-size:13px">${esc(initials(a.name))}</div>
      <span class="b-name">${esc(a.name)}</span>
      <div class="b-bar"><div style="width:${Math.round((a.points / max) * 100)}%"></div></div>
      <span class="b-pts">${a.points} ⭐</span>
    </li>`).join('') || '<li class="muted">لا يوجد سفراء بعد</li>';
}

/* ---------- النافذة المنبثقة ---------- */
const scrim = $('#modalScrim');
const form = $('#modalForm');
let onSubmit = null;

function openModal(title, fieldsHTML, submitLabel, handler) {
  $('#modalTitle').textContent = title;
  form.innerHTML = fieldsHTML + `<button type="submit" class="btn btn-primary">${submitLabel}</button>`;
  onSubmit = handler;
  scrim.classList.remove('hidden');
  form.querySelector('input, select')?.focus();
}
function closeModal() { scrim.classList.add('hidden'); onSubmit = null; }
$('#modalClose').addEventListener('click', closeModal);
scrim.addEventListener('click', (e) => { if (e.target === scrim) closeModal(); });
form.addEventListener('submit', (e) => {
  e.preventDefault();
  if (onSubmit) onSubmit(new FormData(form));
});

function ambOptions(selectedId) {
  return `<option value="">غير مُسنَد</option>` + state.ambassadors.map((a) =>
    `<option value="${a.id}" ${a.id === selectedId ? 'selected' : ''}>${esc(a.name)}</option>`).join('');
}

/* --- سفير: إضافة / تعديل --- */
function openAmbassadorModal(id) {
  const a = id ? ambById(id) : null;
  openModal(a ? 'تعديل سفير' : 'سفير جديد', `
    <div class="field"><label>الاسم</label>
      <input name="name" required maxlength="40" value="${a ? esc(a.name) : ''}" placeholder="مثال: نورة السويدي"></div>
    <div class="field"><label>المنطقة</label>
      <input name="region" required maxlength="30" value="${a ? esc(a.region) : ''}" placeholder="مثال: العين"></div>
    <div class="field"><label>الحالة</label>
      <select name="status">
        <option value="active" ${!a || a.status === 'active' ? 'selected' : ''}>نشط</option>
        <option value="inactive" ${a?.status === 'inactive' ? 'selected' : ''}>غير نشط</option>
      </select></div>
  `, a ? 'حفظ التعديلات' : 'إضافة السفير', (fd) => {
    if (a) {
      a.name = fd.get('name').trim(); a.region = fd.get('region').trim(); a.status = fd.get('status');
    } else {
      const na = { id: nid(), name: fd.get('name').trim(), region: fd.get('region').trim(),
                   status: fd.get('status'), points: 0 };
      state.ambassadors.push(na);
      logActivity(`انضمّ ${na.name} إلى فريق السفراء`);
    }
    save(); renderAll(); closeModal();
  });
}
$('#btnAddAmbassador').addEventListener('click', () => openAmbassadorModal(null));

/* --- مهمة: إضافة / تعديل --- */
function openTaskModal(id) {
  const t = id ? state.tasks.find((x) => x.id === id) : null;
  openModal(t ? 'تعديل مهمة' : 'مهمة جديدة', `
    <div class="field"><label>عنوان المهمة</label>
      <input name="title" required maxlength="80" value="${t ? esc(t.title) : ''}" placeholder="مثال: حملة توعية…"></div>
    <div class="field"><label>السفير المسؤول</label>
      <select name="ambassadorId">${ambOptions(t?.ambassadorId)}</select></div>
    <div class="field"><label>الأولوية</label>
      <select name="priority">
        <option value="high" ${t?.priority === 'high' ? 'selected' : ''}>عالية</option>
        <option value="medium" ${!t || t.priority === 'medium' ? 'selected' : ''}>متوسطة</option>
        <option value="low" ${t?.priority === 'low' ? 'selected' : ''}>منخفضة</option>
      </select></div>
    <div class="field"><label>الموعد النهائي</label>
      <input type="date" name="due" required value="${t ? t.due : daysFromNow(7)}"></div>
  `, t ? 'حفظ التعديلات' : 'إضافة المهمة', (fd) => {
    const ambId = fd.get('ambassadorId') ? Number(fd.get('ambassadorId')) : null;
    if (t) {
      t.title = fd.get('title').trim(); t.ambassadorId = ambId;
      t.priority = fd.get('priority'); t.due = fd.get('due');
    } else {
      const nt = { id: nid(), title: fd.get('title').trim(), ambassadorId: ambId,
                   priority: fd.get('priority'), status: 'todo', due: fd.get('due') };
      state.tasks.push(nt);
      logActivity(`أُضيفت مهمة «${nt.title}»`);
    }
    save(); renderAll(); closeModal();
  });
}
$('#btnAddTask').addEventListener('click', () => openTaskModal(null));

/* --- فعالية: إضافة --- */
$('#btnAddEvent').addEventListener('click', () => {
  const checks = state.ambassadors.map((a) => `
    <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--label-2);margin-bottom:6px">
      <input type="checkbox" name="amb" value="${a.id}" style="accent-color:var(--green)"> ${esc(a.name)}
    </label>`).join('');
  openModal('فعالية جديدة', `
    <div class="field"><label>اسم الفعالية</label>
      <input name="title" required maxlength="80" placeholder="مثال: ملتقى السفراء"></div>
    <div class="field"><label>المكان</label>
      <input name="location" required maxlength="60" placeholder="مثال: واحة العين"></div>
    <div class="field"><label>التاريخ</label>
      <input type="date" name="date" required value="${daysFromNow(14)}"></div>
    <div class="field"><label>السفراء المشاركون</label>${checks || '<p class="muted">لا سفراء بعد</p>'}</div>
  `, 'إضافة الفعالية', (fd) => {
    const ev = {
      id: nid(), title: fd.get('title').trim(), location: fd.get('location').trim(),
      date: fd.get('date'), ambassadorIds: fd.getAll('amb').map(Number),
    };
    state.events.push(ev);
    logActivity(`أُضيفت فعالية «${ev.title}»`);
    save(); renderAll(); closeModal();
  });
});

/* ---------- إعادة التعيين ---------- */
$('#btnReset').addEventListener('click', () => {
  if (!confirm('إعادة تعيين كل البيانات إلى الوضع التجريبي الأولي؟')) return;
  state = seedState();
  save(); renderAll();
});

/* ---------- التصيير ---------- */
function renderAll() {
  renderDashboard();
  renderAmbassadors();
  renderTasks();
  renderEvents();
  renderBoard();
}

load();
save();
renderAll();
