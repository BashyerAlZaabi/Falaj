// ADAA I — monitoring dashboard (outside Vault). Open an indicator, discuss it
// with the assistant, drill into details and take a permitted action.
import { api } from '../api.js';
import { h, icon, modal } from '../ui.js';
import { L, t, fmtNum, fmtDate, fmtTime } from '../i18n.js';
import { barChart } from '../charts.js';
import { runTool, projectCard } from '../widgets.js';
import * as Chat from '../chat.js';
import { state } from '../state.js';

export async function renderAdaa(root) {
  const k = await api('/api/kpis');
  const scopeLbl = { organisation: L('المؤسسة', 'Organisation'), department: L('الإدارة', 'Department'), personal: L('شخصي', 'Personal') }[k.scope];
  root.append(h('div.greet', h('div', h('h1', 'ADAA I'), h('div.small.muted', `${L('داشبورد الرقابة والمتابعة', 'Monitoring & follow-up')} · ${L('النطاق', 'Scope')}: ${scopeLbl} · ${L('حُدّث', 'Updated')} ${fmtTime(k.generated_at)}`)),
    h('span.chip', icon('lock'), L('بيانات FS ومرصاد تبقى داخل Vault ولا تظهر هنا', 'FS & Marsad data stays inside Vault'))));

  const grid = h('div.grid');
  for (const item of k.items) {
    const status = item.status ? h(`span.chip.tiny.${item.status === 'good' ? 'good' : item.status === 'warning' ? 'warn' : 'crit'}`, icon(item.status === 'good' ? 'check' : 'alert'), item.status === 'good' ? L('سليم', 'OK') : L('يحتاج متابعة', 'Attention')) : null;
    grid.append(h('section.card.size-s', { tabindex: 0, role: 'button', style: { cursor: 'pointer' }, onclick: () => openKpi(item, k), onkeydown: (e) => e.key === 'Enter' && openKpi(item, k) },
      h('div.card-head', h('h4', L(item.label_ar, item.label_en)), status),
      h('div.stat', item.value == null ? '—' : fmtNum(item.value), item.unit && item.value != null ? h('span.unit', item.unit) : null),
      item.note_ar ? h('div.tiny.muted', L(item.note_ar, item.note_en)) : null,
      h('div.card-foot', h('span', `${t('dash.source')}: ${item.source}`), h('span', fmtTime(item.updated_at)))));
  }
  root.append(grid);

  const chartCard = h('section.card.size-l', { style: { marginTop: '14px' } }, h('div.card-head', h('h4', L('نسبة إنجاز المشاريع', 'Project progress')), h('span.tiny.muted', L('الأعمدة المنقطة = نسبة غير مسجلة (لا تُحتسب صفراً)', 'Dashed = not reported (not counted as zero)'))),
    k.projects.length ? barChart(k.projects.map((p) => ({ label: p.name, value: p.progress, missing: p.progress == null })), { unit: '%', max: 100, label: L('نسبة إنجاز المشاريع', 'Project progress') }) : h('div.empty', L('لا مشاريع ضمن النطاق', 'No projects in scope')),
    h('div.card-foot', h('span', `${t('dash.source')}: projects.progress`), h('span', fmtTime(k.generated_at))));
  root.append(h('div.grid', { style: { marginTop: '14px' } }, chartCard));

  if (k.by_department.length > 1 || state.me.user.role !== 'employee') {
    root.append(h('div.grid', { style: { marginTop: '14px' } }, h('section.card.size-l', h('div.card-head', h('h4', L('حسب الإدارة', 'By department'))),
      h('table.tbl', h('thead', h('tr', h('th', L('الإدارة', 'Department')), h('th', L('المشاريع', 'Projects')), h('th', L('المتأخرة', 'Delayed')), h('th', L('متوسط الإنجاز المسجل', 'Avg reported progress')))),
        h('tbody', k.by_department.map((d) => h('tr', h('td', L(d.name_ar, d.name_en)), h('td', fmtNum(d.projects)), h('td', d.delayed ? h('span.chip.tiny.crit', fmtNum(d.delayed)) : '0'), h('td', d.avg_progress == null ? '—' : `${d.avg_progress}%`))))))));
  }
}

async function openKpi(item, k) {
  const details = h('div');
  const related = item.key === 'delayed_projects' ? k.projects.filter((p) => p.delayed) : item.key === 'avg_progress' || item.key === 'active_projects' ? k.projects.filter((p) => p.status === 'active') : null;
  details.append(h('div.kv', h('span.muted', L('القيمة', 'Value')), h('strong', item.value == null ? '—' : `${fmtNum(item.value)}${item.unit || ''}`), h('span.muted', t('dash.source')), h('span', item.source), h('span.muted', t('dash.updated')), h('span', `${fmtDate(item.updated_at)} ${fmtTime(item.updated_at)}`)));
  if (related?.length) {
    const full = await api('/api/projects');
    details.append(h('div.section', L('العناصر المرتبطة', 'Related items')), h('ul.list', full.filter((p) => related.some((r) => r.id === p.id)).map(projectCard)));
  } else if (item.key === 'overdue_tasks' || item.key === 'task_completion' || item.key === 'week_done') {
    details.append(h('p.small', h('a', { href: '#/tasks' }, L('عرض المهام بالتفصيل', 'View tasks in detail'))));
  }
  const r = await modal(L(item.label_ar, item.label_en), details, [
    { label: t('close'), value: null },
    { label: L('أضف للداشبورد', 'Add to dashboard'), value: 'pin' },
    { label: L('ناقش مع المساعد', 'Discuss with assistant'), value: 'chat', primary: true },
  ]);
  if (r === 'chat') Chat.focus(L(`بخصوص مؤشر «${item.label_ar}» (${item.value ?? '—'}${item.unit || ''}): `, `About the "${item.label_en}" indicator: `));
  if (r === 'pin') runTool('add_widget', { type: 'kpi', filters: { metric: item.key }, size: 's', position: 0 });
}
