// Dashboard layout (view settings) is separate from source data. Widgets only
// describe HOW to show data; values are always computed live from the source
// with the user's scope.
import { one, all, run, uid, now, json, tx } from '../db.js';
import * as W from './work.js';
import { listDocuments } from './documents.js';
import { notify } from '../bus.js';
import { isSpmo, isInternal } from '../policy.js';

export const WIDGET_TYPES = {
  summary: { views: ['cards'], label_ar: 'ملخص اليوم', label_en: 'Daily summary' },
  kpi: { views: ['stat'], label_ar: 'مؤشر', label_en: 'KPI' },
  projects: { views: ['cards', 'table', 'bar'], label_ar: 'المشاريع', label_en: 'Projects' },
  tasks: { views: ['list', 'table', 'bar', 'donut'], label_ar: 'المهام', label_en: 'Tasks' },
  week_progress: { views: ['bar', 'table'], label_ar: 'إنجاز هذا الأسبوع', label_en: 'This week' },
  events: { views: ['list'], label_ar: 'المواعيد', label_en: 'Appointments' },
  alerts: { views: ['list'], label_ar: 'التنبيهات', label_en: 'Alerts' },
  documents: { views: ['list'], label_ar: 'آخر المستندات', label_en: 'Recent documents' },
  // strategic execution: work given to me, the strategic portfolio, team capacity
  assigned: { views: ['list'], label_ar: 'كُلّفت به', label_en: 'Assigned to me' },
  portfolio: { views: ['cards', 'table', 'bar'], label_ar: 'المحفظة الاستراتيجية', label_en: 'Strategic portfolio' },
  capacity: { views: ['list', 'bar'], label_ar: 'سعة الفريق', label_en: 'Team capacity' },
};
const SIZES = ['s', 'm', 'l'];

const mkWidget = (type, extra = {}) => ({ id: uid('w_'), type, view: WIDGET_TYPES[type].views[0], filters: {}, size: 'm', ...extra });

// Portfolio widgets by role/capability: everyone internal sees what others gave
// them; the SPMO, the president and managers see the strategic portfolio;
// managers and the SPMO see their team's capacity.
function portfolioWidgets(user) {
  if (!isInternal(user)) return [];
  const spmo = isSpmo(user);
  const out = [mkWidget('assigned')];
  if (spmo || user.role !== 'employee') out.push(mkWidget('portfolio', { size: 'l' }));
  if (spmo || user.role === 'manager') out.push(mkWidget('capacity'));
  return out;
}

export function defaultLayout(user) {
  const w = mkWidget;
  const base = [
    w('summary', { size: 'l' }),
    w('tasks', { title: 'مهامي', filters: { mine: true, open: true } }),
    w('events'),
    w('projects', { view: 'cards' }),
    w('alerts'),
    w('documents'),
  ];
  if (user.role !== 'employee') base.splice(1, 0, w('kpi', { filters: { metric: 'delayed_projects' }, size: 's' }), w('kpi', { filters: { metric: 'avg_progress' }, size: 's' }));
  return placePortfolio(base, portfolioWidgets(user), isSpmo(user));
}

// Sensible positions: "assigned" next to my tasks; the portfolio (and capacity)
// right after the summary/KPI band for the SPMO, after my work for everyone else.
function placePortfolio(layout, add, spmoFirst) {
  const out = [...layout];
  const has = (type) => out.some((x) => x.type === type);
  const idx = (type) => out.findIndex((x) => x.type === type);
  const afterBand = () => { let i = 0; while (i < out.length && ['summary', 'kpi'].includes(out[i].type)) i++; return i; };
  const assigned = add.find((x) => x.type === 'assigned');
  const port = add.find((x) => x.type === 'portfolio');
  const cap = add.find((x) => x.type === 'capacity');
  if (port && !has('portfolio')) {
    const at = spmoFirst ? afterBand() : (idx('tasks') >= 0 ? idx('tasks') + 1 : afterBand());
    out.splice(at, 0, port);
    if (cap && !has('capacity')) out.splice(at + 1, 0, cap);
  } else if (cap && !has('capacity')) out.splice(afterBand(), 0, cap);
  if (assigned && !has('assigned')) {
    const ti = idx('tasks');
    out.splice(ti >= 0 ? ti + 1 : afterBand(), 0, assigned);
  }
  return out;
}

// One-time, idempotent additions to dashboards saved before a widget existed.
// The marker is per user and per migration, so a card the user later removes
// is never added back.
const MIGRATIONS = [{ key: 'portfolio_v1', apply: (user, layout) => placePortfolio(layout, portfolioWidgets(user), isSpmo(user)) }];
const applied = (userId, key) => !!one('SELECT 1 FROM dashboard_migrations WHERE user_id=? AND key=?', userId, key);
const markApplied = (userId, key) => run('INSERT OR IGNORE INTO dashboard_migrations (user_id,key) VALUES (?,?)', userId, key);

export function getDashboard(user) {
  let row = one('SELECT * FROM dashboards WHERE user_id=?', user.id);
  if (!row) {
    tx(() => {
      run('INSERT INTO dashboards (user_id,layout,version) VALUES (?,?,1)', user.id, JSON.stringify(defaultLayout(user)));
      for (const m of MIGRATIONS) markApplied(user.id, m.key); // the default already includes them
    });
    row = one('SELECT * FROM dashboards WHERE user_id=?', user.id);
  } else {
    for (const m of MIGRATIONS) {
      if (applied(user.id, m.key)) continue;
      const layout = json(row.layout, []);
      const next = m.apply(user, layout);
      tx(() => {
        if (next.length !== layout.length) {
          const addedType = next.find((w) => !layout.some((x) => x.id === w.id))?.type || 'widget';
          run('INSERT INTO dashboard_versions (id,user_id,version,layout,reason) VALUES (?,?,?,?,?)', uid('dv_'), user.id, row.version, row.layout, `add ${addedType}`);
          run('UPDATE dashboards SET layout=?, version=version+1, updated_at=? WHERE user_id=?', JSON.stringify(next), now(), user.id);
        }
        markApplied(user.id, m.key);
      });
      row = one('SELECT * FROM dashboards WHERE user_id=?', user.id);
    }
  }
  return { layout: json(row.layout, []), version: row.version, updated_at: row.updated_at };
}

function saveLayout(user, layout, reason) {
  const cur = getDashboard(user);
  tx(() => {
    run('INSERT INTO dashboard_versions (id,user_id,version,layout,reason) VALUES (?,?,?,?,?)', uid('dv_'), user.id, cur.version, JSON.stringify(cur.layout), reason);
    run('UPDATE dashboards SET layout=?, version=version+1, updated_at=? WHERE user_id=?', JSON.stringify(layout), now(), user.id);
  });
  notify([user.id], { type: 'changed', entity: 'dashboard' });
  return getDashboard(user);
}

function validateWidget(w) {
  if (!WIDGET_TYPES[w.type]) throw new W.BadInput(`نوع عنصر غير مدعوم: ${w.type}`);
  if (w.view && !WIDGET_TYPES[w.type].views.includes(w.view)) throw new W.BadInput(`طريقة العرض "${w.view}" غير مدعومة لهذا العنصر. المتاح: ${WIDGET_TYPES[w.type].views.join('، ')}`);
  if (w.size && !SIZES.includes(w.size)) throw new W.BadInput('حجم غير صالح');
  if (w.type === 'kpi' && !['active_projects', 'delayed_projects', 'avg_progress', 'task_completion', 'overdue_tasks', 'week_done'].includes(w.filters?.metric)) throw new W.BadInput('مؤشر غير معروف');
}

export function addWidget(user, input) {
  const d = getDashboard(user);
  const w = { id: uid('w_'), type: input.type, title: input.title || null, view: input.view || WIDGET_TYPES[input.type]?.views[0], filters: input.filters || {}, size: input.size || 'm' };
  validateWidget(w);
  const layout = [...d.layout];
  const pos = Number.isInteger(input.position) ? Math.max(0, Math.min(layout.length, input.position)) : layout.length;
  layout.splice(pos, 0, w);
  const after = saveLayout(user, layout, `add ${w.type}`);
  return { result: { widget: w, dashboard: after }, undo: { tool: 'restore_dashboard', input: { version: d.version } } };
}

export function updateWidget(user, input) {
  const d = getDashboard(user);
  const i = d.layout.findIndex((w) => w.id === input.id);
  if (i < 0) throw new W.BadInput('العنصر غير موجود في الداشبورد');
  const w = { ...d.layout[i] };
  for (const k of ['view', 'title', 'size']) if (input[k] !== undefined) w[k] = input[k];
  if (input.filters !== undefined) w.filters = { ...w.filters, ...input.filters };
  if (input.sort !== undefined) w.sort = input.sort;
  validateWidget(w);
  const layout = [...d.layout]; layout[i] = w;
  const after = saveLayout(user, layout, `update ${w.id}`);
  return { result: { widget: w, dashboard: after }, undo: { tool: 'restore_dashboard', input: { version: d.version } } };
}

export function reorderWidgets(user, { order }) {
  const d = getDashboard(user);
  if (!Array.isArray(order)) throw new W.BadInput('الترتيب المطلوب غير محدد');
  const byId = new Map(d.layout.map((w) => [w.id, w]));
  const seen = new Set();
  const layout = [];
  for (const id of order) if (byId.has(id) && !seen.has(id)) { layout.push(byId.get(id)); seen.add(id); }
  for (const w of d.layout) if (!seen.has(w.id)) layout.push(w);
  const after = saveLayout(user, layout, 'reorder');
  return { result: { dashboard: after }, undo: { tool: 'restore_dashboard', input: { version: d.version } } };
}

export function removeWidget(user, { id }) {
  const d = getDashboard(user);
  const w = d.layout.find((x) => x.id === id);
  if (!w) throw new W.BadInput('العنصر غير موجود');
  const after = saveLayout(user, d.layout.filter((x) => x.id !== id), `remove ${id}`);
  return { result: { removed: w, dashboard: after }, undo: { tool: 'restore_dashboard', input: { version: d.version } } };
}

export function listDashboardVersions(user) {
  return all('SELECT version, reason, created_at FROM dashboard_versions WHERE user_id=? ORDER BY version DESC LIMIT 30', user.id);
}

export function restoreDashboard(user, { version, reset }) {
  const d = getDashboard(user);
  let layout;
  if (reset) layout = defaultLayout(user);
  else {
    const v = version != null
      ? one('SELECT layout FROM dashboard_versions WHERE user_id=? AND version=?', user.id, version)
      : one('SELECT layout FROM dashboard_versions WHERE user_id=? ORDER BY version DESC LIMIT 1', user.id);
    if (!v) throw new W.BadInput('لا توجد نسخة سابقة للاستعادة');
    layout = json(v.layout, []);
  }
  const after = saveLayout(user, layout, reset ? 'reset' : `restore v${version ?? 'prev'}`);
  return { result: { dashboard: after }, undo: { tool: 'restore_dashboard', input: { version: d.version } } };
}

// ---------- widget data (always from source, within scope) ----------
const STATUS_AR = { todo: 'قيد الانتظار', in_progress: 'قيد التنفيذ', done: 'منجزة' };
const PRIORITY_AR = { urgent: 'عاجلة', high: 'عالية', medium: 'متوسطة', low: 'منخفضة' };

export function widgetData(user, w) {
  const at = now();
  switch (w.type) {
    case 'summary': return { data: W.dailySummary(user), source: 'projects, tasks, events, alerts', updated_at: at };
    case 'kpi': {
      const k = W.kpis(user).items.find((x) => x.key === w.filters.metric);
      return { data: k, source: k?.source, updated_at: at };
    }
    case 'projects': {
      let rows = W.listProjects(user, { status: w.filters.status, delayed: w.filters.delayed });
      if (w.sort === 'progress') rows.sort((a, b) => (a.progress ?? -1) - (b.progress ?? -1));
      return { data: rows, series: rows.map((p) => ({ label: p.name, value: p.progress, missing: p.progress == null })), source: 'projects', updated_at: at };
    }
    case 'tasks': {
      const f = w.filters || {};
      let rows = W.listTasks(user, { mine: f.mine, overdue: f.overdue, status: f.status, project_id: f.project_id });
      if (f.open) rows = rows.filter((t) => t.status !== 'done');
      const group = f.group_by === 'priority' ? 'priority' : 'status';
      const labels = group === 'priority' ? PRIORITY_AR : STATUS_AR;
      const series = Object.keys(labels).map((k) => ({ key: k, label: labels[k], value: rows.filter((t) => t[group] === k).length }));
      return { data: rows, series, group_by: group, source: 'tasks', updated_at: at };
    }
    case 'week_progress': {
      const start = new Date(W.weekStart());
      const done = W.listTasks(user, { week_done: true, limit: 5000 });
      const days = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
      const series = days.map((label, i) => {
        const d0 = new Date(start.getTime() + i * 864e5).toISOString(); const d1 = new Date(start.getTime() + (i + 1) * 864e5).toISOString();
        return { label, value: done.filter((t) => t.completed_at >= d0 && t.completed_at < d1).length };
      });
      return { data: done, series, total: done.length, source: 'tasks.completed_at', updated_at: at };
    }
    case 'events': return { data: W.listEvents(user), source: 'events', updated_at: at };
    case 'alerts': return { data: W.listAlerts(user), source: 'alerts + derived', updated_at: at };
    case 'documents': return { data: listDocuments(user).slice(0, 6), source: 'documents', updated_at: at };
    case 'assigned': return { data: W.myAssignments(user), source: 'tasks.assigned_by, project_allocations', updated_at: at };
    case 'portfolio': {
      const d = W.portfolio(user, { department_id: w.filters?.department_id, status: w.filters?.status });
      const series = d.projects.map((p) => ({ label: p.name, value: p.progress, expected: p.status === 'active' ? p.expected_progress : null, missing: p.progress == null, state: p.state, id: p.id }));
      return { data: d, series, source: 'projects.progress, project_allocations, project_milestones', updated_at: at };
    }
    case 'capacity': return { data: W.teamCapacity(user, { department_id: w.filters?.department_id }), source: 'project_allocations', updated_at: at };
    default: return { data: null };
  }
}
