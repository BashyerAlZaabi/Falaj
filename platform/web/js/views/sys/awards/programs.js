// Awards › «البرامج» — spotlight on the programme open for nominations, all
// programmes with their three-stage timeline, programme details (criteria,
// descriptors, categories, rules) and, for the awards admin, the programme
// editor and lifecycle actions (open, close & evaluate, rank, new cycle, cancel).
import { h, icon, L, fmtDate, fmtNum, toast, modal, confirmDialog, formDialog, menu, emptyState, statTile, statRow, act, card, grid } from '../../../sys-kit.js';
import { call, refresh, href, P_STATUS, ELIG, KIND, chip, demoChip, nm, medal, phaseTrack, daysText, back, eligible, eyebrow, kv, count, num } from './common.js';

export async function view(ctx, me, rest) {
  if (rest[0]) return detail(ctx, me, rest[0]);
  const list = await call('/programs');
  const wrap = h('div.aw-programs');
  if (!list.length) {
    wrap.append(emptyState({ icon: 'award', title: L('لا توجد برامج جوائز منشورة حالياً', 'No award programmes published yet'),
      body: me.admin ? L('ابدأ ببرنامج جديد: حدّد الفئات والمعايير الموزونة ومواعيد الترشيح والتقييم.', 'Start a programme: categories, weighted criteria and the nomination and evaluation windows.') : L('ستظهر هنا برامج الجوائز عند فتح باب الترشيح.', 'Programmes appear here when nominations open.'),
      actions: me.admin ? [{ label: L('برنامج جديد', 'New programme'), primary: true, icon: 'plus', onClick: () => openEditor(ctx) }] : [] }));
    return wrap;
  }
  if (me.admin) wrap.append(adminStats(list));
  const featured = list.find((p) => p.phase.window_open) || list.find((p) => p.status === 'evaluation') || null;
  if (featured) wrap.append(spotlight(ctx, me, featured));
  const others = list.filter((p) => p !== featured);
  if (others.length) {
    wrap.append(h('div.aw-section-head', h('h2', L('جميع البرامج', 'All programmes')), h('span.faint', count(list.length, ['برنامج واحد', 'برنامجان', 'برامج', 'برنامجاً'], ['programme', 'programmes']))),
      h('div.aw-prog-grid', others.map((p) => programCard(ctx, me, p))));
  }
  return wrap;
}

function adminStats(list) {
  const open = list.filter((p) => p.status === 'nominations');
  const evalP = list.filter((p) => p.status === 'evaluation');
  const received = open.reduce((a, p) => a + (p.admin?.active || 0), 0);
  const awaiting = open.reduce((a, p) => a + (p.admin?.by_status?.awaiting_consent || 0), 0);
  const cov = evalP.reduce((a, p) => ({ t: a.t + (p.admin?.coverage?.total || 0), c: a.c + (p.admin?.coverage?.complete || 0) }), { t: 0, c: 0 });
  const ready = evalP.filter((p) => p.admin?.coverage && p.admin.coverage.total && p.admin.coverage.complete === p.admin.coverage.total).length;
  return statRow([
    statTile({ label: L('برامج مفتوحة للترشيح', 'Open for nominations'), value: open.length, icon: 'circleDot', tone: 'good' }),
    statTile({ label: L('ترشيحات مستلمة', 'Nominations received'), value: received, icon: 'inbox', hint: awaiting ? L(`${fmtNum(awaiting)} بانتظار موافقة المرشح`, `${awaiting} awaiting consent`) : L('أرقام مجمّعة دون أسماء', 'Aggregates only, no names') }),
    statTile({ label: L('اكتمال تقييم اللجنة', 'Committee coverage'), value: cov.t ? `\u2066${fmtNum(Math.round((cov.c / cov.t) * 100))}%\u2069` : null, icon: 'scale', tone: cov.t && cov.c < cov.t ? 'warn' : 'emph', hint: cov.t ? L(`${fmtNum(cov.c)} من ${fmtNum(cov.t)} بتقييمين أو أكثر`, `${cov.c} of ${cov.t} with ≥ 2 reviews`) : L('لا برامج قيد التقييم', 'Nothing under evaluation') }),
    statTile({ label: L('جاهز للاعتماد', 'Ready to finalise'), value: ready, icon: 'stamp', tone: ready ? 'emph' : null, href: ready ? href('committee', 'rank', evalP.find((p) => p.admin.coverage.complete === p.admin.coverage.total)?.id) : null }),
  ]);
}

function nominateActions(ctx, me, p, { hero = false } = {}) {
  if (!p.phase.window_open) return [];
  const self = p.allow_self && eligible(p, ctx.user) && p.eligibility !== 'team' && !(p.my_nominees || []).includes(ctx.user.id);
  const cls = hero ? 'a.btn.lg.aw-hero-btn' : 'a.btn.sm.primary';
  return [
    h(cls, { href: href('nominate', p.id) }, icon('userPlus'), p.eligibility === 'team' ? L('رشّح فريقاً', 'Nominate a team') : L('رشّح زميلاً', 'Nominate a colleague')),
    self ? h(hero ? 'a.btn.lg.aw-hero-ghost' : 'a.btn.sm', { href: href('nominate', p.id, 'self') }, L('رشّح نفسك', 'Nominate yourself')) : null,
  ];
}

function spotlight(ctx, me, p) {
  const ph = p.phase;
  const big = p.status === 'nominations' ? ph.days_left : p.status === 'evaluation' ? ph.days_to_announce : null;
  return h('section.aw-spotlight', { 'aria-label': nm(p) },
    h('div.aw-spot-glow', { 'aria-hidden': 'true' }),
    h('div.aw-spot-main',
      h('div.aw-spot-top', medal(p.kind, 'lg'), h('div.grow',
        h('div.aw-spot-eyebrow', icon(p.status === 'nominations' ? 'sparkle' : 'scale'), p.status === 'nominations' ? L('باب الترشيح مفتوح الآن', 'Nominations are open') : L('قيد تقييم اللجنة', 'Under committee review'), p.cycle ? h('span.aw-dot', '·') : null, p.cycle || null),
        h('h2.aw-spot-title', nm(p)),
        h('p.aw-spot-desc', L(p.description_ar, p.description_en || p.description_ar)))),
      h('div.aw-spot-cats', p.categories.map((c) => h('span.aw-spot-cat', icon('tag'), nm(c))), h('span.aw-spot-cat.ghost', icon('people'), L(...ELIG[p.eligibility]))),
      phaseTrack(p, { tone: 'on-dark' }),
      h('div.aw-spot-actions',
        ...nominateActions(ctx, me, p, { hero: true }),
        h('a.btn.lg.aw-hero-link', { href: href('programs', p.id) }, L('المعايير والتفاصيل', 'Criteria & details'), icon('chevron', 'flip-rtl')),
        p.my_nominations ? h('span.aw-spot-note', icon('circleCheck'), L(`قدّمت ${count(p.my_nominations, ['ترشيح واحد', 'ترشيحان', 'ترشيحات', 'ترشيحاً'], ['nomination', 'nominations'])} في هذا البرنامج`, `You submitted ${p.my_nominations} here`)) : null)),
    big != null ? h('div.aw-spot-count', { role: 'img', 'aria-label': p.status === 'nominations' ? daysText(big) : L(`${big} يوماً على إعلان النتائج`, `${big} days to results`) },
      h('span.aw-spot-num.num.tabular', fmtNum(Math.max(0, big))),
      h('span.aw-spot-unit', p.status === 'nominations' ? L('يوماً على إغلاق الترشيح', 'days until nominations close') : L('يوماً على إعلان النتائج', 'days until results')),
      h('span.aw-spot-date', fmtDate(p.status === 'nominations' ? p.nomination_closes : p.announce_on))) : null);
}

function statusLine(p) {
  const ph = p.phase;
  if (p.status === 'nominations') return ph.window_open ? daysText(ph.days_left) : ph.not_yet_open ? L(`يفتح في ${fmtDate(p.nomination_opens)}`, `Opens ${fmtDate(p.nomination_opens)}`) : L('انتهت مدة الترشيح — بانتظار بدء التقييم', 'Nomination window ended — awaiting evaluation');
  if (p.status === 'evaluation') return ph.evaluation_overdue ? L('تجاوز موعد التقييم', 'Evaluation overdue') : L(`النتائج في ${fmtDate(p.announce_on)}`, `Results on ${fmtDate(p.announce_on)}`);
  if (p.status === 'announced') return L(`أُعلنت في ${fmtDate(p.announced_at)}`, `Announced ${fmtDate(p.announced_at)}`);
  if (p.status === 'draft') return L('مسودة — لا يراها الموظفون بعد', 'Draft — not visible to staff yet');
  return L('أُلغي البرنامج', 'Programme cancelled');
}

function programCard(ctx, me, p) {
  const foot = [];
  if (p.status === 'announced') foot.push(h('a.btn.sm.tertiary', { href: href('hall') }, icon('trophy'), L(`الفائزون (${fmtNum(p.winners_count || 0)})`, `Winners (${p.winners_count || 0})`)));
  foot.push(...nominateActions(ctx, me, p));
  if (me.admin) foot.push(...adminButtons(ctx, p));
  return h(`article.card.aw-prog.s-${p.status}`,
    h('div.aw-prog-head', medal(p.kind), h('div.grow', h('a.aw-prog-title', { href: href('programs', p.id) }, nm(p)), h('div.aw-prog-meta', p.cycle ? h('span', p.cycle) : null, h('span', L(...KIND[p.kind])))), chip(P_STATUS, p.status)),
    h('p.aw-prog-desc', L(p.description_ar, p.description_en || p.description_ar)),
    phaseTrack(p),
    h('div.aw-prog-status', icon(p.status === 'announced' ? 'trophy' : p.status === 'evaluation' ? 'scale' : 'clock'), h('span', statusLine(p)), demoChip(p)),
    me.admin && p.admin ? adminMini(p) : null,
    foot.length ? h('div.aw-prog-foot', foot) : null);
}

function adminMini(p) {
  const s = p.admin;
  const bits = [];
  if (p.status === 'nominations' || p.status === 'draft') bits.push([L('ترشيحات', 'Nominations'), s.active], [L('بانتظار الموافقة', 'Awaiting consent'), s.by_status.awaiting_consent || 0]);
  if (s.coverage) bits.push([L('ترشيحات للتقييم', 'Under review'), s.coverage.total], [L('بتقييمين+', '≥2 reviews'), s.coverage.complete]);
  if (!bits.length) return null;
  return h('div.aw-prog-admin', { 'aria-label': L('مؤشرات للمسؤول (مجمّعة)', 'Admin aggregates') }, icon('lock'), bits.map(([k, v]) => h('span', h('b.num.tabular', fmtNum(v)), k)));
}

function adminButtons(ctx, p) {
  const out = [];
  const more = [];
  if (p.status === 'draft') {
    out.push(h('button.btn.sm.primary', { type: 'button', onclick: (e) => transition(e.currentTarget, p, 'nominations') }, icon('play'), L('فتح باب الترشيح', 'Open nominations')));
    more.push({ label: L('تعديل البرنامج', 'Edit programme'), icon: 'pencil', onClick: () => openEditor(ctx, p) });
  }
  if (p.status === 'nominations') {
    out.push(h('button.btn.sm', { type: 'button', onclick: (e) => transition(e.currentTarget, p, 'evaluation') }, icon('scale'), L('إغلاق الترشيح وبدء التقييم', 'Close & start evaluation')));
    more.push({ label: L('تعديل الوصف والتواريخ', 'Edit description & dates'), icon: 'pencil', onClick: () => openEditor(ctx, p) });
  }
  if (p.status === 'evaluation') out.push(h('a.btn.sm.primary', { href: href('committee', 'rank', p.id) }, icon('listOrdered'), L('الترتيب والاعتماد', 'Ranking & finalise')));
  if (p.status === 'announced') out.push(h('a.btn.sm', { href: href('committee', 'rank', p.id) }, icon('listOrdered'), L('سجل القرار', 'Decision record')));
  more.push({ label: L('دورة جديدة من هذا البرنامج', 'New cycle from this programme'), icon: 'copy', onClick: () => copyCycle(ctx, p) });
  if (['draft', 'nominations', 'evaluation'].includes(p.status)) more.push({ sep: true }, { label: L('إلغاء البرنامج', 'Cancel programme'), icon: 'ban', danger: true, onClick: () => transition(null, p, 'cancelled') });
  out.push(h('button.icon-btn.aw-more', { type: 'button', 'aria-label': L('إجراءات أخرى', 'More actions'), 'aria-haspopup': 'menu', onclick: (e) => menu(e.currentTarget, more) }, icon('more')));
  return out;
}

async function transition(btn, p, to) {
  const copy = {
    nominations: null,
    evaluation: [L('إغلاق باب الترشيح وبدء التقييم؟', 'Close nominations and start evaluation?'),
      L(`${p.admin?.by_status?.awaiting_consent ? `${count(p.admin.by_status.awaiting_consent, ['ترشيح واحد', 'ترشيحان', 'ترشيحات', 'ترشيحاً'], ['nomination', 'nominations'])} دون موافقة المرشح سيُغلق دون تقييم. ` : ''}${p.phase.window_open ? 'ما زال الترشيح مفتوحاً حتى ' + fmtDate(p.nomination_closes) + ' — سيُغلق مبكراً. ' : ''}سيُحال كل ترشيح مكتمل إلى لجنة الجوائز مع التنحي التلقائي، ولا يمكن التراجع.`,
        `${p.admin?.by_status?.awaiting_consent ? `${p.admin.by_status.awaiting_consent} nomination(s) without consent will lapse. ` : ''}Complete nominations go to the committee with automatic recusal. This cannot be undone.`), L('إغلاق وبدء التقييم', 'Close & evaluate'), false],
    cancelled: [L(`إلغاء «${nm(p)}»؟`, `Cancel “${nm(p)}”?`), L('سيتوقف البرنامج ولن تُستكمل ترشيحاته، وسيُبلّغ أصحاب الترشيحات. لا يمكن التراجع.', 'The programme stops and nominations are not completed; people involved are notified. This cannot be undone.'), L('إلغاء البرنامج', 'Cancel programme'), true],
  }[to];
  if (copy) { const ok = await confirmDialog(copy[0], copy[1], { danger: copy[3], confirmLabel: copy[2] }); if (!ok) return; }
  const r = await act(btn, () => call(`/programs/${p.id}/transition`, { method: 'POST', body: { to, confirm: to !== 'nominations' ? true : undefined } }),
    { success: to === 'nominations' ? L('فُتح باب الترشيح — أصبح البرنامج مرئياً لجميع الموظفين', 'Nominations are open — visible to all staff') : to === 'evaluation' ? L('بدأ التقييم وأُبلغ أعضاء اللجنة', 'Evaluation started; the committee was notified') : L('أُلغي البرنامج', 'Programme cancelled') });
  if (r) refresh();
}

async function copyCycle(ctx, p) {
  const shift = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCFullYear(x.getUTCFullYear() + n); return x.toISOString().slice(0, 10); };
  const v = await formDialog({
    title: L(`دورة جديدة من «${nm(p)}»`, `New cycle of “${nm(p)}”`), intro: L('تُنسخ الفئات والمعايير والأهلية كما هي في مسودة جديدة يمكنك تعديلها قبل فتح الترشيح.', 'Categories, criteria and eligibility are copied into a new draft you can edit before opening.'),
    fields: [
      { name: 'cycle', label: L('اسم الدورة', 'Cycle'), required: true, full: true, placeholder: L('مثال: دورة 2027', 'e.g. 2027 cycle') },
      { name: 'nomination_opens', label: L('فتح الترشيح', 'Nominations open'), type: 'date', required: true },
      { name: 'nomination_closes', label: L('إغلاق الترشيح', 'Nominations close'), type: 'date', required: true },
      { name: 'evaluation_closes', label: L('نهاية التقييم', 'Evaluation ends'), type: 'date', required: true },
      { name: 'announce_on', label: L('إعلان النتائج', 'Announcement'), type: 'date', required: true },
    ],
    values: { cycle: '', nomination_opens: shift(p.nomination_opens, 1), nomination_closes: shift(p.nomination_closes, 1), evaluation_closes: shift(p.evaluation_closes, 1), announce_on: shift(p.announce_on, 1) },
    submitLabel: L('إنشاء المسودة', 'Create draft'),
  });
  if (!v) return;
  const r = await act(null, () => call(`/programs/${p.id}/copy`, { method: 'POST', body: v }), { success: L('أُنشئت مسودة الدورة الجديدة', 'New cycle drafted') });
  if (r) { location.hash = href('programs', r.id); refresh(); }
}

// ---------------- programme editor (awards.admin) ----------------
const blankCriterion = () => ({ name_ar: '', name_en: '', weight: 25, descriptors: [{ level: 1, ar: '' }, { level: 3, ar: '' }, { level: 5, ar: '' }] });
export async function openEditor(ctx, p = null) {
  const today = new Date(); const d = (n) => { const x = new Date(today); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const locked = p && p.status !== 'draft'; // after nominations open: description & later dates only
  const s = p ? {
    name_ar: p.name_ar, name_en: p.name_en, description_ar: p.description_ar, description_en: p.description_en, kind: p.kind, cycle: p.cycle, eligibility: p.eligibility, allow_self: p.allow_self,
    nomination_opens: p.nomination_opens, nomination_closes: p.nomination_closes, evaluation_closes: p.evaluation_closes, announce_on: p.announce_on,
    categories: p.categories.map((c) => ({ name_ar: c.name_ar, name_en: c.name_en, description_ar: c.description_ar, max_winners: c.max_winners })),
    criteria: p.criteria.map((c) => ({ name_ar: c.name_ar, name_en: c.name_en, description_ar: c.description_ar, weight: c.weight, descriptors: [1, 3, 5].map((l) => ({ level: l, ar: c.descriptors.find((x) => x.level === l)?.ar || '' })) })),
  } : { name_ar: '', name_en: '', description_ar: '', description_en: '', kind: 'excellence', cycle: '', eligibility: 'all_staff', allow_self: true, nomination_opens: d(1), nomination_closes: d(21), evaluation_closes: d(40), announce_on: d(50), categories: [{ name_ar: '', max_winners: 1 }], criteria: [blankCriterion(), blankCriterion(), blankCriterion(), blankCriterion()] };

  const err = h('div.error-text.aw-ed-err', { role: 'alert' });
  const inp = (key, label, { type = 'text', full, max, dis, rows } = {}) => {
    const id = `aw-ed-${key}`;
    const el = type === 'textarea' ? h('textarea.field', { id, rows: rows || 3, maxlength: max, disabled: dis || null, oninput: (e) => { s[key] = e.target.value; } }, s[key] || '')
      : type === 'select' ? null
        : h('input.field', { id, type, value: s[key] ?? '', maxlength: max, disabled: dis || null, oninput: (e) => { s[key] = e.target.value; } });
    return h(`div.form-row${full ? '.full' : ''}`, h('label.lbl', { for: id }, label), el);
  };
  const sel = (key, label, opts, dis) => h('div.form-row', h('label.lbl', { for: `aw-ed-${key}` }, label),
    h('select.field', { id: `aw-ed-${key}`, disabled: dis || null, onchange: (e) => { s[key] = e.target.value; } }, opts.map(([v, t]) => h('option', { value: v, selected: s[key] === v || null }, t))));

  const cats = h('div.aw-ed-list');
  const drawCats = () => cats.replaceChildren(...s.categories.map((c, i) => h('div.aw-ed-row',
    h('input.field', { value: c.name_ar, placeholder: L('اسم الفئة', 'Category name'), 'aria-label': L(`اسم الفئة ${i + 1}`, `Category ${i + 1} name`), maxlength: 120, disabled: locked || null, oninput: (e) => { c.name_ar = e.target.value; } }),
    h('input.field.aw-ed-small', { type: 'number', min: 1, max: 5, value: c.max_winners || 1, 'aria-label': L('عدد الفائزين', 'Winners'), 'data-tip': L('الحد الأقصى للفائزين', 'Max winners'), disabled: locked || null, oninput: (e) => { c.max_winners = Number(e.target.value) || 1; } }),
    locked || s.categories.length < 2 ? null : h('button.icon-btn', { type: 'button', 'aria-label': L('حذف الفئة', 'Remove category'), onclick: () => { s.categories.splice(i, 1); drawCats(); } }, icon('x')))),
  locked || s.categories.length >= 6 ? '' : h('button.btn.sm.ghost', { type: 'button', onclick: () => { s.categories.push({ name_ar: '', max_winners: 1 }); drawCats(); } }, icon('plus'), L('إضافة فئة', 'Add category')));

  const sum = h('span.chip.tiny');
  const drawSum = () => { const t = s.criteria.reduce((a, c) => a + (Number(c.weight) || 0), 0); sum.className = `chip tiny ${t === 100 ? 'good' : 'warn'}`; sum.replaceChildren(icon(t === 100 ? 'circleCheck' : 'alert'), L(`مجموع الأوزان ${t}%`, `Weights total ${t}%`)); };
  const crits = h('div.aw-ed-list');
  const LV = { 1: ['الحد الأدنى', 'Minimum'], 3: ['المتوقع', 'Expected'], 5: ['المتميز', 'Outstanding'] };
  const critRow = (c, i) => h('div.aw-ed-crit',
    h('div.aw-ed-row',
      h('input.field', { value: c.name_ar, placeholder: L('اسم المعيار', 'Criterion'), 'aria-label': L(`اسم المعيار ${i + 1}`, `Criterion ${i + 1}`), maxlength: 120, disabled: locked || null, oninput: (e) => { c.name_ar = e.target.value; } }),
      h('label.aw-ed-weight', h('input.field.aw-ed-small', { type: 'number', min: 5, max: 60, step: 5, value: c.weight, 'aria-label': L('الوزن %', 'Weight %'), disabled: locked || null, oninput: (e) => { c.weight = Number(e.target.value) || 0; drawSum(); } }), '%'),
      locked || s.criteria.length <= 2 ? null : h('button.icon-btn', { type: 'button', 'aria-label': L('حذف المعيار', 'Remove criterion'), onclick: () => { s.criteria.splice(i, 1); drawCrits(); } }, icon('x'))),
    h('div.aw-ed-desc', c.descriptors.map((dd) => h('label.aw-ed-level',
      h('span', h('b', String(dd.level)), ' ', L(...(LV[dd.level] || ['', '']))),
      h('input.field', { value: dd.ar, maxlength: 240, placeholder: L('وصف هذا المستوى', 'Describe this level'), disabled: locked || null, oninput: (e) => { dd.ar = e.target.value; } })))));
  const drawCrits = () => {
    crits.replaceChildren(...s.criteria.map(critRow),
      locked || s.criteria.length >= 8 ? '' : h('button.btn.sm.ghost', { type: 'button', onclick: () => { s.criteria.push(blankCriterion()); drawCrits(); } }, icon('plus'), L('إضافة معيار', 'Add criterion')));
    drawSum();
  };
  drawCats(); drawCrits();

  const body = h('div.aw-editor',
    locked ? h('div.callout', icon('lock'), L('بعد فتح باب الترشيح تُقفل الفئات والمعايير والأهلية حفاظاً على عدالة الترشيحات المقدّمة؛ يمكنك تعديل الوصف وتمديد التواريخ.', 'Once nominations open, categories, criteria and eligibility are locked to keep submitted nominations fair; you can edit the description and extend dates.')) : null,
    h('h4.aw-ed-h', L('الأساسيات', 'Basics')),
    h('div.form-grid',
      inp('name_ar', L('اسم البرنامج', 'Programme name'), { max: 140, full: false }), inp('name_en', L('الاسم بالإنجليزية', 'English name'), { max: 140 }),
      inp('cycle', L('الدورة', 'Cycle'), { max: 60, dis: locked }),
      sel('kind', L('النوع', 'Kind'), Object.entries(KIND).map(([k, v]) => [k, L(...v)]), locked),
      inp('description_ar', L('الوصف', 'Description'), { type: 'textarea', full: true, max: 1200 }),
      sel('eligibility', L('الأهلية', 'Eligibility'), Object.entries(ELIG).map(([k, v]) => [k, L(...v)]), locked),
      h('div.form-row', h('span.lbl', L('الترشيح الذاتي', 'Self-nomination')), h('label.check-label', h('input', { type: 'checkbox', checked: s.allow_self || null, disabled: locked || null, onchange: (e) => { s.allow_self = e.target.checked; } }), L('يُسمح للموظف بترشيح نفسه', 'Staff may nominate themselves')))),
    h('h4.aw-ed-h', L('المواعيد', 'Timeline')),
    h('div.aw-ed-dates',
      inp('nomination_opens', L('فتح الترشيح', 'Nominations open'), { type: 'date', dis: locked }), inp('nomination_closes', L('إغلاق الترشيح', 'Nominations close'), { type: 'date' }),
      inp('evaluation_closes', L('نهاية التقييم', 'Evaluation ends'), { type: 'date' }), inp('announce_on', L('إعلان النتائج', 'Announcement'), { type: 'date' })),
    h('h4.aw-ed-h', L('الفئات', 'Categories'), h('span.faint.tiny', L('(وعدد الفائزين لكل فئة)', '(and winners per category)'))), cats,
    h('h4.aw-ed-h', L('معايير التقييم الموزونة', 'Weighted criteria'), sum), h('p.helper', L('تُقيّم اللجنة كل معيار من 1 إلى 5؛ صف المستويات 1 و3 و5 ليكون التقييم متسقاً بين الأعضاء.', 'The committee scores each criterion 1–5; describe levels 1, 3 and 5 so members score consistently.')), crits,
    err);

  const payload = () => {
    const base = { name_ar: s.name_ar.trim(), name_en: s.name_en?.trim() || undefined, description_ar: s.description_ar?.trim() || '', nomination_closes: s.nomination_closes, evaluation_closes: s.evaluation_closes, announce_on: s.announce_on };
    if (locked) return base;
    return { ...base, description_en: s.description_en || undefined, kind: s.kind, cycle: s.cycle?.trim() || '', eligibility: s.eligibility, allow_self: !!s.allow_self, nomination_opens: s.nomination_opens,
      categories: s.categories.map((c) => ({ name_ar: c.name_ar.trim(), name_en: c.name_en || undefined, description_ar: c.description_ar || undefined, max_winners: c.max_winners || 1 })),
      criteria: s.criteria.map((c) => ({ name_ar: c.name_ar.trim(), name_en: c.name_en || undefined, description_ar: c.description_ar || undefined, weight: Number(c.weight), descriptors: c.descriptors.filter((x) => x.ar.trim()).map((x) => ({ level: x.level, ar: x.ar.trim() })) })) };
  };
  let saved = null;
  await modal(p ? L(`تعديل «${nm(p)}»`, `Edit “${nm(p)}”`) : L('برنامج جوائز جديد', 'New award programme'), body,
    [{ label: L('إلغاء', 'Cancel'), value: false }, { label: p ? L('حفظ التعديلات', 'Save changes') : L('حفظ كمسودة', 'Save as draft'), value: true, primary: true }], {
      wide: true,
      beforeClose: async () => {
        err.textContent = '';
        if (!s.name_ar.trim()) { err.textContent = L('اكتب اسم البرنامج', 'Enter the programme name'); return false; }
        const total = s.criteria.reduce((a, c) => a + (Number(c.weight) || 0), 0);
        if (!locked && total !== 100) { err.textContent = L(`مجموع أوزان المعايير يجب أن يساوي 100 (الحالي ${total})`, `Weights must total 100 (now ${total})`); return false; }
        try { saved = await call(p ? `/programs/${p.id}` : '/programs', { method: p ? 'PUT' : 'POST', body: payload() }); return true; }
        catch (e) { err.textContent = e.message; return false; }
      },
    });
  if (saved) { toast(p ? L('حُفظت التعديلات', 'Changes saved') : L('أُنشئت مسودة البرنامج — افتح باب الترشيح عندما تكون جاهزاً', 'Draft created — open nominations when ready')); if (!p) location.hash = href('programs', saved.id); refresh(); }
}

// ---------------- detail ----------------
async function detail(ctx, me, id) {
  const p = await call(`/programs/${id}`);
  const lvl = (c, l) => c.descriptors.find((x) => x.level === l);
  const criteria = card(h('div.aw-card-head', h('h2.card-title', L('معايير التقييم', 'Evaluation criteria')), h('span.faint.tiny', L('تمنح اللجنة كل معيار درجة من 1 إلى 5 حسب الأوصاف', 'The committee scores each criterion 1–5 against these descriptors'))),
    h('ol.aw-crit-list', p.criteria.map((c) => h('li.aw-crit',
      h('div.aw-crit-head', h('strong', nm(c)), h('span.aw-weight', h('span.aw-weight-track', h('i', { style: { width: `${c.weight}%` } })), h('b.num.tabular', `${fmtNum(c.weight)}%`))),
      c.description_ar ? h('p.faint', L(c.description_ar, c.description_en || c.description_ar)) : null,
      h('div.aw-levels', [1, 3, 5].map((l) => lvl(c, l) ? h(`div.aw-level.l${l}`, h('span.aw-level-n', h('b', String(l)), L(...[null, ['الحد الأدنى', 'Minimum'], null, ['المتوقع', 'Expected'], null, ['المتميز', 'Outstanding']][l])), h('p', L(lvl(c, l).ar, lvl(c, l).en || lvl(c, l).ar))) : null))))));
  const cats = card(L('الفئات', 'Categories'), h('ul.aw-cat-list', p.categories.map((c) => h('li', icon('tag'), h('div.grow', h('strong', nm(c)), c.description_ar ? h('p.faint', L(c.description_ar, c.description_en || c.description_ar)) : null), h('span.chip.tiny.outline', count(c.max_winners, ['فائز واحد', 'فائزان', 'فائزين', 'فائزاً'], ['winner', 'winners']))))));
  const rules = card(L('الأهلية والقواعد', 'Eligibility & rules'), kv([
    [L('من يُرشَّح', 'Who can be nominated'), L(...ELIG[p.eligibility])],
    [L('الترشيح الذاتي', 'Self-nomination'), p.allow_self ? L('مسموح', 'Allowed') : L('غير مسموح', 'Not allowed')],
    [L('موافقة المرشح', 'Nominee consent'), L('مطلوبة لكل ترشيح من زميل أو مدير', 'Required for every nomination by others')],
    [L('حد الترشيحات', 'Limit'), L(`حتى ${fmtNum(me.max_per_nominator)} ترشيحات لكل موظف`, `Up to ${me.max_per_nominator} per person`)],
    [L('الحياد', 'Impartiality'), L(`تنحٍّ تلقائي لأعضاء اللجنة عن ترشيحات إداراتهم، ولا يُعتمد ترشيح بأقل من ${count(me.min_reviews, ['تقييم واحد', 'تقييمين', 'تقييمات', 'تقييماً'], ['review', 'reviews'])}`, `Members recuse from their own department; at least ${me.min_reviews} reviews each`)],
    [L('السرية', 'Confidentiality'), L('الترشيحات والدرجات سرية؛ يُعلن الفائزون فقط', 'Nominations and scores stay confidential; only winners are published')],
  ]));
  const dates = card(L('المواعيد', 'Key dates'), kv([
    [L('فتح الترشيح', 'Nominations open'), h('span', fmtDate(p.nomination_opens))], [L('إغلاق الترشيح', 'Nominations close'), h('span', fmtDate(p.nomination_closes))],
    [L('نهاية التقييم', 'Evaluation ends'), h('span', fmtDate(p.evaluation_closes))], [L('إعلان النتائج', 'Announcement'), h('span', fmtDate(p.announced_at || p.announce_on))],
  ]));
  const admin = me.admin && p.admin ? card(h('div.aw-card-head', h('h2.card-title', L('لوحة المسؤول', 'Admin panel')), h('span.chip.tiny.outline', icon('lock'), L('مجمّع دون أسماء', 'Aggregates only'))),
    h('ul.aw-agg', p.categories.map((c) => h('li', h('span.grow', nm(c)), h('b.num.tabular', fmtNum(p.admin.by_category[c.id] || 0))))),
    h('div.aw-prog-foot', adminButtons(ctx, p))) : null;
  return h('div.aw-detail',
    back(href('programs'), L('كل البرامج', 'All programmes')),
    h('section.card.aw-detail-hero',
      h('div.aw-prog-head', medal(p.kind, 'lg'), h('div.grow', eyebrow([p.cycle, L(...KIND[p.kind])].filter(Boolean).join(' · ')), h('h2.aw-detail-title', nm(p)), h('div.aw-prog-meta', chip(P_STATUS, p.status), h('span', statusLine(p)), demoChip(p)))),
      h('p.aw-detail-desc', L(p.description_ar, p.description_en || p.description_ar)),
      phaseTrack(p),
      h('div.aw-prog-foot', nominateActions(ctx, me, p), p.status === 'announced' ? h('a.btn.sm.tertiary', { href: href('hall') }, icon('trophy'), L('الفائزون', 'Winners')) : null)),
    grid('main-side', h('div.aw-stack-col', criteria, cats), h('div.aw-stack-col', admin, rules, dates)));
}
void num;
