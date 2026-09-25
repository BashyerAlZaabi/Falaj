// Awards › «قاعة التميّز» — the public winners wall (announced programmes only:
// name, department, category, citation — never scores or nomination content)
// and a printable certificate for each winner.
import { h, icon, L, fmtDate, fmtNum, emptyState, avatar } from '../../../sys-kit.js';
import { call, href, nm, dept, title, medal, back, eyebrow, demoChip, count } from './common.js';

export async function view(ctx, me, rest) {
  if (rest[0]) return certificate(ctx, rest[0]);
  const hall = await call('/hall');
  const wrap = h('div.aw-hall');
  wrap.append(h('section.aw-hall-hero',
    h('div.aw-hall-laurel', { 'aria-hidden': 'true' }, icon('trophy')),
    h('div.aw-hall-hero-text',
      h('span.aw-hall-eyebrow', icon('sparkle'), L('تكريم مؤسسي', 'Institutional recognition')),
      h('h2', L('قاعة التميّز', 'Hall of excellence')),
      h('p', L('نحتفي بزملائنا وفرقنا الذين جسّدوا قيم الخدمة العامة: الإتقان، والمبادرة، والنزاهة، وروح الفريق.', 'Celebrating colleagues and teams who embody public-service values: mastery, initiative, integrity and teamwork.'))),
    h('dl.aw-hall-stats',
      stat(hall.stats.winners, L('التكريمات', 'Honours')), stat(hall.stats.people, L('الزملاء المكرّمون', 'Colleagues honoured')), stat(hall.stats.departments, L('الإدارات الممثّلة', 'Departments')))));
  const mine = hall.winners.filter((w) => w.mine);
  if (mine.length) {
    wrap.append(h('section.aw-mine-win', medal(mine[0].program.kind, 'md'),
      h('div.grow', h('strong', L('مبروك! أنت ضمن المكرّمين', 'Congratulations — you are among the honourees')), h('span.faint', mine.map((w) => `${nm(w.program)} · ${nm(w.category)}`).join(' — '))),
      h('a.btn.primary', { href: href('hall', mine[0].id) }, icon('award'), L('شهادتي', 'My certificate'))));
  }
  if (!hall.winners.length) {
    wrap.append(emptyState({ icon: 'trophy', title: L('لم تُعلن نتائج بعد', 'No results announced yet'), body: L('عند اعتماد نتائج أي برنامج يظهر الفائزون هنا ليحتفي بهم الجميع.', 'When a programme’s results are finalised, winners appear here for everyone to celebrate.'),
      actions: me.open_programs ? [{ label: L('رشّح زميلاً', 'Nominate a colleague'), primary: true, onClick: () => { location.hash = href('nominate'); } }] : [{ label: L('برامج الجوائز', 'Award programmes'), onClick: () => { location.hash = href('programs'); } }] }));
    return wrap;
  }
  for (const p of hall.programs) {
    const winners = hall.winners.filter((w) => w.program.id === p.id);
    wrap.append(h('section.aw-hall-prog',
      h('div.aw-hall-prog-head', medal(p.kind), h('div.grow', h('h3', nm(p)), h('span.faint', [p.cycle, L(`أُعلنت ${fmtDate(p.announced_at)}`, `Announced ${fmtDate(p.announced_at)}`), count(winners.length, ['فائز واحد', 'فائزان', 'فائزين', 'فائزاً'], ['winner', 'winners'])].filter(Boolean).join(' · ')))),
      h('div.aw-wall', winners.map(winnerCard))));
  }
  return wrap;
}
const stat = (v, label) => h('div', h('dt.num.tabular', fmtNum(v)), h('dd', label));

function winnerCard(w) {
  const team = w.team?.length ? w.team : null;
  return h(`article.aw-winner${w.mine ? '.mine' : ''}`,
    h('div.aw-winner-ribbon', icon('award'), h('span', nm(w.category))),
    h('div.aw-winner-face', team
      ? h('div.aw-winner-team', team.slice(0, 4).map((u) => avatar(u.name_ar)))
      : h('div.aw-winner-ring', avatar(w.nominee.name_ar))),
    h('h4.aw-winner-name', w.team_name || nm(w.nominee)),
    h('p.aw-winner-meta', team ? team.map(nm).join(' · ') : [title(w.nominee), dept(w.nominee)].filter(Boolean).join(' · ')),
    w.citation_ar ? h('blockquote.aw-winner-cite', L(w.citation_ar, w.citation_en || w.citation_ar)) : null,
    h('div.aw-winner-foot', demoChip(w), h('span.grow'), h('a.btn.sm.tertiary', { href: href('hall', w.id) }, icon('fileText'), L('الشهادة', 'Certificate'))));
}

async function certificate(ctx, id) {
  const w = await call(`/winners/${id}`).catch((e) => { if (e.status === 404) return null; throw e; });
  if (!w) return h('div.aw-detail', back(href('hall'), L('قاعة التميّز', 'Hall of excellence')), emptyState({ icon: 'award', title: L('الشهادة غير متاحة', 'Certificate not available'), body: L('تظهر الشهادات للفائزين المعلنين فقط.', 'Certificates exist for announced winners only.') }));
  const who = w.team_name || nm(w.nominee);
  return h('div.aw-cert-page',
    h('div.aw-cert-tools', back(href('hall'), L('قاعة التميّز', 'Hall of excellence')), h('span.grow'), demoChip(w),
      h('button.btn.primary', { type: 'button', onclick: () => window.print() }, icon('download'), L('طباعة / حفظ PDF', 'Print / save PDF'))),
    h('article.aw-cert', { 'aria-label': L('شهادة تقدير', 'Certificate of recognition') },
      h('div.aw-cert-frame',
        h('div.aw-cert-corner.tl'), h('div.aw-cert-corner.tr'), h('div.aw-cert-corner.bl'), h('div.aw-cert-corner.br'),
        h('div.aw-cert-seal', icon('trophy')),
        h('p.aw-cert-kicker', L('لجنة الجوائز المؤسسية', 'Institutional Awards Committee')),
        h('h2.aw-cert-title', L('شهادة تقدير', 'Certificate of Recognition')),
        h('p.aw-cert-lead', L('تتشرف لجنة الجوائز بمنح هذه الشهادة إلى', 'The Awards Committee is honoured to present this certificate to')),
        h('p.aw-cert-name', who),
        h('p.aw-cert-sub', w.team?.length ? w.team.map(nm).join(' · ') : [title(w.nominee), dept(w.nominee)].filter(Boolean).join(' · ')),
        h('p.aw-cert-award', L(`${nm(w.program)} — فئة «${nm(w.category)}»`, `${nm(w.program)} — “${nm(w.category)}”`), w.program.cycle ? h('span', ` · ${w.program.cycle}`) : null),
        w.citation_ar ? h('p.aw-cert-cite', L(w.citation_ar, w.citation_en || w.citation_ar)) : null,
        h('div.aw-cert-foot',
          h('div', h('span.aw-cert-lbl', L('تاريخ الإعلان', 'Announced on')), h('strong', fmtDate(w.program.announced_at)), h('span.num.faint', new Date(w.program.announced_at).getUTCFullYear())),
          h('div.aw-cert-mark', { 'aria-hidden': 'true' }, eyebrow(L('التميّز في الخدمة العامة', 'Excellence in public service'))),
          h('div', h('span.aw-cert-lbl', L('اعتمدها', 'Approved by')), h('strong', w.announced_by ? nm(w.announced_by) : L('لجنة الجوائز', 'Awards committee')), h('span.faint', L('عن لجنة الجوائز المؤسسية', 'On behalf of the Awards Committee')))))));
}
