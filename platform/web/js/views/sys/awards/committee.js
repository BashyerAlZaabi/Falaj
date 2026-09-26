// Awards › «اللجنة» — the committee's queue (automatic recusal notices), the
// scoring workspace (1–5 per criterion against descriptors, live weighted
// score, declared conflicts of interest) and, for the awards admin, ranking
// and finalisation. Members only ever see their own review; the admin sees
// aggregates. Draft scores/selections live in this module across soft refreshes.
import { h, icon, L, fmtDate, fmtNum, toast, modal, confirmDialog, emptyState, act, statTile, statRow, avatar, accessLogList } from '../../../sys-kit.js';
import { call, refresh, href, NKIND, RECUSAL, LEVEL, nm, dept, medal, person, teamStack, back, restricted, eyebrow, demoChip, score, daysText, count, chip, N_STATUS } from './common.js';
import { excellenceMini } from './nominate.js';

const drafts = new Map(); // nominationId → { scores: {criterion: n}, comment }
const picks = new Map(); // programmeId → { winners: Map(nominationId → citation), note }

export async function view(ctx, me, rest) {
  if (rest[0] === 'rank' && rest[1]) return rankingView(ctx, me, rest[1]);
  if (rest[0]) return scoringView(ctx, me, rest[0]);
  const q = await call('/committee');
  const wrap = h('div.aw-committee');
  wrap.append(statRow([
    statTile({ label: L('بانتظار تقييمك', 'Awaiting your review'), value: q.stats.pending, icon: 'hourglass', tone: q.stats.pending ? 'warn' : 'good', hint: q.stats.pending ? L('ابدأ بالأقدم — التقييم مستقل وسري', 'Start with the oldest — scoring is independent and confidential') : L('أنجزت كل ما يخصك', 'You’re all caught up') }),
    statTile({ label: L('قيّمتها', 'Reviewed'), value: q.stats.done, icon: 'circleCheck', tone: 'good', hint: L('يمكن تعديل تقييمك حتى نهاية مرحلة التقييم', 'Editable until evaluation ends') }),
    statTile({ label: L('تنحٍّ لضمان الحياد', 'Recused for impartiality'), value: q.stats.recused, icon: 'shieldBan', tone: 'sand', hint: L('ترشيحات من إدارتك أو قدّمتها أو أنت المرشح فيها', 'Your department, your own nominations or yourself') }),
  ]));
  wrap.append(h('div.callout.aw-recusal-rules', icon('scale'), h('div', h('strong', L('قواعد الحياد', 'Impartiality rules')), h('p', L(`لا يقيّم العضو نفسه، ولا ترشيحاً قدّمه، ولا مرشحاً من إدارته — ويمكنه إعلان تعارض مصالح لأي سبب آخر. لا يُعتمد ترشيح بأقل من ${count(q.min_reviews, ['تقييم واحد', 'تقييمين', 'تقييمات', 'تقييماً'], ['review', 'reviews'])}، ولا يرى أي عضو درجات غيره.`, `No member scores themselves, a nomination they submitted or a nominee from their department — and may declare any other conflict. Each nomination needs at least ${q.min_reviews} reviews; nobody sees other members’ scores.`)))));
  if (!q.programs.length) {
    wrap.append(emptyState({ icon: 'scale', title: L('لا توجد برامج قيد التقييم الآن', 'Nothing is under evaluation right now'), body: L('تصل الترشيحات إلى اللجنة عند إغلاق باب الترشيح في أي برنامج.', 'Nominations reach the committee when a programme’s nomination window closes.'),
      actions: [{ label: L('برامج الجوائز', 'Award programmes'), onClick: () => { location.hash = href('programs'); } }] }));
    return wrap;
  }
  for (const p of q.programs) {
    const pending = p.items.filter((x) => !x.recusal && !x.my_review);
    wrap.append(h('section.aw-cm-prog',
      h('div.aw-cm-head', medal(p.kind), h('div.grow', h('h2', nm(p)), h('span.faint', [p.cycle, L(`ينتهي التقييم ${fmtDate(p.evaluation_closes)}`, `Evaluation ends ${fmtDate(p.evaluation_closes)}`), daysText(p.phase.days_left, { verb: 'end' })].filter(Boolean).join(' · '))),
        pending.length ? h('a.btn.primary', { href: href('committee', pending[0].id) }, icon('play'), L('ابدأ التقييم', 'Start scoring')) : null,
        q.is_admin ? h('a.btn', { href: href('committee', 'rank', p.id) }, icon('listOrdered'), L('الترتيب والاعتماد', 'Ranking & finalise')) : null),
      // what needs the member first: pending, then reviewed, then recused
      h('div.aw-cm-grid', [...p.items].sort((a, b) => rankOf(a) - rankOf(b)).map((x) => queueCard(x)))));
  }
  return wrap;
}

const rankOf = (x) => (x.recusal ? 2 : x.my_review ? 1 : 0);
function queueCard(x) {
  const who = h('div.aw-cm-who', x.team_name ? h('span.aw-team-ic', icon('usersRound')) : avatar(L(x.nominee.name_ar, x.nominee.name_en)), h('div.grow', h('strong', x.team_name || nm(x.nominee)), h('span.faint', x.team_name ? L(`${count(x.team_size, ['عضو واحد', 'عضوان', 'أعضاء', 'عضواً'], ['member', 'members'])} · بقيادة ${nm(x.nominee)}`, `${x.team_size} members · led by ${nm(x.nominee)}`) : dept(x.nominee))));
  if (x.recusal) {
    return h('article.aw-cm-card.recused', { 'aria-label': L('متنحٍّ', 'Recused') }, who, h('span.chip.tiny.outline.aw-cm-cat', nm(x.category)),
      h('div.aw-cm-recusal', icon('shieldBan'), h('span', L('متنحٍّ — ', 'Recused — '), L(...RECUSAL[x.recusal]))));
  }
  return h(`a.aw-cm-card${x.my_review ? '.done' : '.todo'}`, { href: href('committee', x.id) },
    who, h('span.chip.tiny.outline.aw-cm-cat', nm(x.category)),
    h('p.aw-cm-sum', x.summary),
    h('div.aw-cm-foot', x.my_review ? h('span.chip.tiny.good', icon('circleCheck'), L('قيّمت · ', 'Reviewed · '), h('span.num', `${score(x.my_review.weighted)} / 5`)) : h('span.chip.tiny.warn', icon('hourglass'), L('بانتظار تقييمك', 'Awaiting your review')),
      demoChip(x), h('span.grow'), h('span.aw-cm-go', x.my_review ? L('تعديل', 'Edit') : L('قيّم الآن', 'Score now'), icon('chevron', 'flip-rtl'))));
}

// ---------------- scoring ----------------
async function scoringView(ctx, me, id) {
  const n = await call(`/nominations/${id}`);
  const top = back(href('committee'), L('قائمة التقييم', 'Review queue'));
  if (n.view === 'recused') {
    return h('div.aw-detail', top, h('section.card', emptyState({ icon: 'shieldBan', title: L('أنت متنحٍّ عن تقييم هذا الترشيح', 'You are recused from this nomination'), body: `${L(...RECUSAL[n.recusal])}. ${L('لا تظهر لك تفاصيل الترشيح ولا تقييمات الآخرين.', 'Its details and others’ scores are hidden from you.')}` })));
  }
  if (!['committee', 'admin'].includes(n.view) || !n.criteria) {
    return h('div.aw-detail', top, h('section.card', emptyState({ icon: 'lock', title: L('لا يمكنك تقييم هذا الترشيح', 'You cannot score this nomination'), body: L('أنت طرف في هذا الترشيح، لذا تتابعه من «ترشيحاتي» دون أي اطلاع على التقييم.', 'You are a party to this nomination; follow it in “My nominations” without access to scoring.'), actions: [{ label: L('ترشيحاتي', 'My nominations'), onClick: () => { location.hash = href('mine', n.id); } }] })));
  }
  if (!drafts.has(id)) drafts.set(id, { scores: { ...(n.review?.scores || {}) }, comment: n.review?.comment || '' });
  const d = drafts.get(id);
  const crit = n.criteria;
  const done = crit.filter((c) => d.scores[c.id]).length;
  const weighted = done === crit.length ? crit.reduce((a, c) => a + d.scores[c.id] * c.weight, 0) / crit.reduce((a, c) => a + c.weight, 0) : null;
  const partial = done ? crit.filter((c) => d.scores[c.id]).reduce((a, c) => a + d.scores[c.id] * c.weight, 0) / crit.filter((c) => d.scores[c.id]).reduce((a, c) => a + c.weight, 0) : null;

  const scale = (c) => h('div.aw-scale', { role: 'radiogroup', 'aria-label': L(`درجة «${c.name_ar}»`, `Score for “${nm(c)}”`) }, [1, 2, 3, 4, 5].map((v) => {
    const on = d.scores[c.id] === v;
    const desc = c.descriptors.find((x) => x.level === v);
    return h(`button.aw-scale-btn${on ? '.on' : ''}${d.scores[c.id] && v <= d.scores[c.id] ? '.fill' : ''}`, {
      type: 'button', role: 'radio', 'aria-checked': String(on), 'data-fk': `s-${c.id}-${v}`, disabled: !n.can_review || null,
      'aria-label': `${v} — ${L(...LEVEL[v - 1])}${desc ? ` — ${L(desc.ar, desc.en || desc.ar)}` : ''}`,
      onclick: () => { d.scores[c.id] = v; ctx.rerender(); },
      onkeydown: (e) => { const dir = document.documentElement.dir === 'rtl' ? -1 : 1; const k = { ArrowRight: dir, ArrowLeft: -dir, ArrowUp: 1, ArrowDown: -1 }[e.key]; if (k) { e.preventDefault(); d.scores[c.id] = Math.max(1, Math.min(5, (d.scores[c.id] || 3) + k)); ctx.rerender(); } },
    }, h('b', String(v)), h('span', L(...LEVEL[v - 1])));
  }));
  const criteria = crit.map((c, i) => {
    const j = n.justifications.find((x) => x.criterion_id === c.id);
    const sel = d.scores[c.id] ? c.descriptors.find((x) => x.level === d.scores[c.id]) : null;
    return h(`section.card.aw-score-crit${d.scores[c.id] ? '.scored' : ''}`,
      h('div.aw-just-head', h('span.aw-just-n', String(i + 1)), h('strong.grow', nm(c)), h('span.chip.tiny.outline.num', `${fmtNum(c.weight)}%`)),
      h('p.aw-score-just', j?.text || '—'),
      h('div.aw-score-levels', [1, 3, 5].map((l) => { const x = c.descriptors.find((y) => y.level === l); return x ? h(`span.aw-score-level${d.scores[c.id] === l ? '.on' : ''}`, h('b', String(l)), L(x.ar, x.en || x.ar)) : null; })),
      scale(c),
      sel && ![1, 3, 5].includes(sel.level) ? h('p.faint.tiny', L(sel.ar, sel.en || sel.ar)) : null);
  });

  const save = h('button.btn.primary.lg.block', { type: 'button', disabled: !n.can_review || weighted == null || null, onclick: async (e) => {
    const body = { scores: crit.map((c) => ({ criterion_id: c.id, score: d.scores[c.id] })), comment: d.comment.trim() || undefined };
    const r = await act(e.currentTarget, () => call(`/nominations/${id}/review`, { method: 'PUT', body }));
    if (!r) return;
    drafts.delete(id);
    toast(L('حُفظ تقييمك', 'Your review was saved'));
    location.hash = r.next ? href('committee', r.next) : href('committee');
    refresh();
  } }, icon('circleCheck'), n.review ? L('تحديث التقييم', 'Update review') : L('حفظ التقييم', 'Save review'));
  const pctVal = weighted ?? partial;
  const panel = h('aside.aw-score-side',
    h('section.card.aw-score-panel',
      eyebrow(L('تقييمك المستقل', 'Your independent review'), 'scale'),
      h('div.aw-score-big', pctVal == null ? h('span.aw-score-empty', L('لم تبدأ', 'Not started')) : h('span.num.tabular', score(pctVal)), h('small', '/ 5')),
      h('div.aw-score-bar', { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': pctVal == null ? 0 : Math.round((pctVal / 5) * 100), 'aria-label': L('الدرجة الموزونة', 'Weighted score') }, h('i', { style: { width: `${pctVal == null ? 0 : Math.round((pctVal / 5) * 100)}%` } })),
      h('p.faint.tiny', weighted == null ? L(`قيّمت ${fmtNum(done)} من ${fmtNum(crit.length)} معايير`, `${done} of ${crit.length} criteria scored`) : L('الدرجة الموزونة حسب أوزان المعايير', 'Weighted by the criteria weights')),
      h('div.form-row', h('label.lbl', { for: 'aw-comment' }, L('ملاحظة لرئيس اللجنة (اختياري)', 'Note for the chair (optional)')),
        h('textarea.field', { id: 'aw-comment', 'data-fk': 'comment', rows: 3, maxlength: 1500, disabled: !n.can_review || null, oninput: (e) => { d.comment = e.target.value; } }, d.comment)),
      save,
      n.review ? h('p.faint.tiny', L(`آخر حفظ ${fmtDate(n.review.updated_at || n.review.submitted_at)}`, `Last saved ${fmtDate(n.review.updated_at || n.review.submitted_at)}`)) : null,
      n.can_recuse ? h('button.btn.sm.ghost.aw-recuse-btn', { type: 'button', onclick: (e) => recuse(e.currentTarget, n) }, icon('shieldBan'), L('إعلان تعارض مصالح والتنحي', 'Declare a conflict & recuse')) : null,
      !n.can_review && n.recusal ? h('div.callout', icon('shieldBan'), L(...RECUSAL[n.recusal])) : null),
    n.view === 'admin' && n.aggregate ? h('section.card.aw-admin-agg', h('h2.card-title', L('للمسؤول: التغطية', 'Admin: coverage')),
      h('p', L(`${fmtNum(n.aggregate.reviews)} من ${fmtNum(n.aggregate.eligible)} تقييمات مؤهلة`, `${n.aggregate.reviews} of ${n.aggregate.eligible} eligible reviews`)),
      h('details', h('summary', L('سجل الاطلاع', 'Access log')), accessLogList(n.access_log))) : null);

  return h('div.aw-detail.aw-scoring',
    top, restricted(),
    h('section.card.aw-nom-hero',
      h('div.aw-score-nominee',
        n.team_name ? h('span.aw-team-ic.lg', icon('usersRound')) : avatar(n.nominee.name_ar, 'lg'),
        h('div.grow', eyebrow([nm(n.program), nm(n.category)].join(' · ')), h('h2.aw-detail-title', n.team_name || nm(n.nominee)),
          h('div.aw-prog-meta', n.team_name ? teamStack(n.team) : h('span', [n.nominee.title_ar ? L(n.nominee.title_ar, n.nominee.title_en) : null, dept(n.nominee)].filter(Boolean).join(' · ')), h('span.chip.tiny.outline', L(...NKIND[n.kind])), demoChip(n))),
        chip(N_STATUS, n.status)),
      h('blockquote.aw-quote', n.summary),
      n.consent_note ? h('p.aw-consent-quote', icon('messageSquare'), h('span', h('strong', L('كلمة المرشح: ', 'Nominee’s note: ')), n.consent_note)) : null),
    h('div.sys-grid.main-side',
      h('div.aw-stack-col', ...criteria,
        n.evidence?.length ? h('section.card', h('h2.card-title', L('الأدلة', 'Evidence')), h('ul.aw-ev-read', n.evidence.map((e) => h('li', icon(e.link ? 'link' : 'fileText'), e.link ? h('a', { href: e.link, target: e.link.startsWith('http') ? '_blank' : null, rel: 'noopener noreferrer' }, e.title) : h('span', e.title), e.note ? h('span.faint', ` — ${e.note}`) : null)))) : null,
        h('section.card', h('div.aw-card-head', h('h2.card-title', L('ملخص نقاط التميّز', 'Excellence summary')), h('span.faint.tiny', L('أرفقه المرشح بنفسه', 'Attached by the nominee'))),
          n.excellence ? excellenceMini(n.excellence) : h('p.faint', L('لم يرفق المرشح ملخصاً.', 'The nominee did not attach one.'))),
        n.kind === 'self' ? null : h('section.card', h('h2.card-title', L('مقدّم الترشيح', 'Nominator')), person(n.nominator))),
      panel));
}

async function recuse(btn, n) {
  const ta = h('textarea.field', { rows: 3, maxlength: 500, 'aria-label': L('سبب التنحي', 'Reason'), placeholder: L('مثال: صلة قرابة، أو عمل مشترك مباشر مع المرشح', 'e.g. a family tie or direct joint work with the nominee') });
  const err = h('div.error-text', { role: 'alert' });
  let reason = '';
  const ok = await modal(L('إعلان تعارض مصالح', 'Declare a conflict of interest'), h('div.aw-recuse', h('p.muted', L('سيُسجّل تنحّيك عن هذا الترشيح نهائياً ويُحذف تقييمك إن وُجد. يرى رئيس اللجنة التنحي لضمان استكمال النصاب.', 'You will be permanently recused from this nomination and any review you saved is deleted. The chair sees the recusal to keep quorum.')), ta, err),
    [{ label: L('إلغاء', 'Cancel'), value: false }, { label: L('تأكيد التنحي', 'Confirm recusal'), value: true, danger: true }],
    { beforeClose: () => { reason = ta.value.trim(); if (reason.length < 5) { err.textContent = L('اذكر السبب باختصار (5 أحرف على الأقل)', 'Briefly state the reason (5+ characters)'); return false; } return true; } });
  if (!ok) return;
  const r = await act(btn, () => call(`/nominations/${n.id}/recuse`, { method: 'POST', body: { reason, confirm: true } }), { success: L('سُجّل تنحّيك عن هذا الترشيح', 'Your recusal was recorded') });
  if (!r) return;
  drafts.delete(n.id);
  location.hash = r.next ? href('committee', r.next) : href('committee');
  refresh();
}

// ---------------- ranking & finalisation (awards admin) ----------------
async function rankingView(ctx, me, pid) {
  if (!me.admin) return emptyState({ icon: 'lock', title: L('الترتيب متاح لمسؤول برامج الجوائز فقط', 'Ranking is for the awards admin only') });
  const r = await call(`/programs/${pid}/ranking`);
  const p = r.program;
  const announced = p.status === 'announced';
  if (!picks.has(pid)) picks.set(pid, { winners: new Map(r.categories.flatMap((c) => c.suggested.map((id) => [id, c.nominations.find((x) => x.id === id)?.summary || '']))), note: '' });
  const sel = picks.get(pid);
  const override = r.categories.some((c) => [...sel.winners.keys()].some((id) => c.nominations.some((x) => x.id === id) && !c.suggested.includes(id)));
  const total = r.categories.reduce((a, c) => a + c.nominations.length, 0);
  const reviews = r.categories.reduce((a, c) => a + c.nominations.reduce((b, x) => b + x.reviews, 0), 0);

  const head = h('section.card.aw-nom-hero',
    h('div.aw-prog-head', medal(p.kind, 'lg'), h('div.grow', eyebrow(announced ? L('سجل القرار', 'Decision record') : L('الترتيب والاعتماد', 'Ranking & finalisation'), 'listOrdered'), h('h2.aw-detail-title', nm(p)),
      h('div.aw-prog-meta', h('span', p.cycle), announced ? h('span', L(`أُعلنت ${fmtDate(p.announced_at)}`, `Announced ${fmtDate(p.announced_at)}`)) : h('span', L(`النتائج المخططة ${fmtDate(p.announce_on)}`, `Planned results ${fmtDate(p.announce_on)}`))))),
    statRow([
      statTile({ label: L('ترشيحات للتقييم', 'Nominations'), value: total, icon: 'inbox' }),
      statTile({ label: L('مكتملة النصاب', 'Quorum reached'), value: total - r.missing, unit: `/ ${fmtNum(total)}`, icon: 'circleCheck', tone: r.missing ? 'warn' : 'good', hint: L(`${count(r.min_reviews, ['تقييم واحد', 'تقييمان', 'تقييمات', 'تقييماً'], ['review', 'reviews'])} على الأقل لكل ترشيح`, `At least ${r.min_reviews} reviews each`) }),
      statTile({ label: L('تقييمات مستلمة', 'Reviews received'), value: reviews, icon: 'scale', hint: L(`لجنة من ${fmtNum(r.members.length)} أعضاء`, `${r.members.length}-member committee`) }),
    ]));

  const catSection = (c) => h('section.card.aw-rank-cat',
    h('div.aw-card-head', h('h2.card-title', nm(c)), h('span.chip.tiny.outline', count(c.max_winners, ['فائز واحد', 'فائزان', 'فائزين', 'فائزاً'], ['winner', 'winners']))),
    c.nominations.length ? h('ol.aw-rank-list', c.nominations.map((x) => rankRow(ctx, c, x, sel, announced))) : h('p.faint', L('لا ترشيحات في هذه الفئة', 'No nominations in this category')));

  const blocks = [back(href('committee'), L('اللجنة', 'Committee')), restricted(), head];
  if (r.conflicted && !announced) blocks.push(h('div.callout.aw-conflict', icon('shieldAlert'), L('قدّمت ترشيحاً أو رُشّحت في هذا البرنامج، لذا لا يمكنك اعتماد نتائجه — يعتمدها مسؤول آخر لبرامج الجوائز.', 'You nominated or were nominated in this programme, so another awards admin must finalise it.')));
  if (r.missing && !announced) blocks.push(h('div.callout.aw-missing', icon('hourglass'), L(`${count(r.missing, ['ترشيح واحد', 'ترشيحان', 'ترشيحات', 'ترشيحاً'], ['nomination', 'nominations'])} لم يبلغ النصاب بعد. يظهر أمام كل ترشيح من ينتظر تقييمه.`, `${r.missing} nomination(s) lack quorum. Pending reviewers are listed on each.`)));
  blocks.push(...r.categories.map(catSection));
  if (announced) {
    if (r.decision_note) blocks.push(h('section.card', h('h2.card-title', L('مبرر القرار', 'Decision rationale')), h('p', r.decision_note)));
  } else {
    const noteBox = h('textarea.field', { id: 'aw-note', 'data-fk': 'rank-note', rows: 3, maxlength: 1000, placeholder: L('لماذا اختير فائز من خارج الترتيب الأعلى؟ (20 حرفاً على الأقل)', 'Why pick a winner outside the top rank? (20+ characters)'), oninput: (e) => { sel.note = e.target.value; } }, sel.note);
    const n = sel.winners.size;
    blocks.push(h(`section.card.aw-finalize${n && r.ready && !r.conflicted ? '.ready' : ''}`,
      h('div.grow', h('strong', n ? L(`سيُعلن ${count(n, ['فائز واحد', 'فائزان', 'فائزين', 'فائزاً'], ['winner', 'winners'])}`, `${n} winner(s) will be announced`) : L('لم تختر فائزين بعد', 'No winners selected')),
        h('p.faint', L('يصبح الفائزون وتكريمهم مرئيين لجميع الموظفين في قاعة التميّز. تبقى الدرجات والترشيحات سرية.', 'Winners and citations become visible to all staff in the Hall of excellence. Scores and nominations stay confidential.')),
        override ? h('div.form-row', h('label.lbl', { for: 'aw-note' }, L('مبرر الاختيار من خارج الترتيب', 'Override rationale'), h('span.req', ' *')), noteBox) : null,
        !r.ready ? h('p.aw-final-why', icon('hourglass'), L('يُفعَّل الاعتماد عندما يبلغ كل ترشيح النصاب — التقييم العادل يشمل الجميع.', 'Finalising unlocks once every nomination has quorum — a fair process reviews everyone.')) : null),
      h('button.btn.primary.lg', { type: 'button', disabled: !n || !r.ready || r.conflicted || null, onclick: (e) => finalize(e.currentTarget, p, sel) }, icon('stamp'), L('اعتماد الفائزين وإعلان النتائج', 'Finalise & announce'))));
  }
  return h('div.aw-detail.aw-ranking', blocks);
}

function rankRow(ctx, c, x, sel, announced) {
  const picked = announced ? x.status === 'winner' : sel.winners.has(x.id);
  const pctW = x.average == null ? 0 : Math.round((x.average / 5) * 100);
  const toggle = () => {
    if (sel.winners.has(x.id)) sel.winners.delete(x.id);
    else {
      const inCat = [...sel.winners.keys()].filter((id) => c.nominations.some((y) => y.id === id));
      if (inCat.length >= c.max_winners) sel.winners.delete(inCat[0]);
      sel.winners.set(x.id, x.summary || '');
    }
    ctx.rerender();
  };
  return h(`li.aw-rank-row${picked ? '.picked' : ''}${x.complete ? '' : '.short'}`,
    h('span.aw-rank-n', x.rank ? String(x.rank) : '—'),
    h('div.aw-rank-who', x.team_name ? h('span.aw-team-ic', icon('usersRound')) : avatar(L(x.nominee.name_ar, x.nominee.name_en)), h('div.grow', h('strong', x.team_name || nm(x.nominee)), h('span.faint', x.team_name ? x.team.map(nm).join('، ') : dept(x.nominee))), demoChip(x)),
    h('div.aw-rank-score',
      h('div.aw-rank-bar', h('i', { style: { width: `${pctW}%` } })),
      h('span.num.tabular', x.average == null ? '—' : `${score(x.average)} / 5`),
      h('span.faint.tiny', L(`${fmtNum(x.reviews)} من ${fmtNum(x.eligible)} تقييمات`, `${x.reviews} of ${x.eligible} reviews`))),
    h('div.aw-rank-state',
      x.complete ? h('span.chip.tiny.good', icon('circleCheck'), L('مكتمل النصاب', 'Quorum')) : h('span.chip.tiny.warn', icon('hourglass'), L('ينقصه تقييم', 'Needs reviews')),
      x.short_of_reviewers ? h('span.chip.tiny.crit', icon('alert'), L('أعضاء مؤهلون غير كافين', 'Too few eligible members')) : null,
      !x.complete && x.pending_reviewers.length ? h('span.faint.tiny', L(`بانتظار: ${x.pending_reviewers.map(nm).join('، ')}`, `Waiting for: ${x.pending_reviewers.map(nm).join(', ')}`)) : null),
    announced ? (picked ? h('span.chip.sand', icon('trophy'), L('فائز', 'Winner')) : h('span.chip.tiny.outline', L('لم يُختر', 'Not selected')))
      : h('label.aw-rank-pick', h('input', { type: 'checkbox', checked: picked || null, disabled: !x.complete || null, 'aria-label': L(`اختيار ${x.team_name || nm(x.nominee)} فائزاً`, `Select ${x.team_name || nm(x.nominee)} as winner`), onchange: toggle }), L('فائز', 'Winner')),
    h('details.aw-rank-more',
      h('summary', L('التفاصيل المجمّعة', 'Aggregated details')),
      h('p.aw-rank-sum', x.summary),
      h('ul.aw-rank-crit', x.per_criterion.map((pc) => h('li', h('span.grow', nm(pc)), h('span.aw-mini-bar', h('i', { style: { width: `${pc.average == null ? 0 : (pc.average / 5) * 100}%` } })), h('b.num.tabular', pc.average == null ? '—' : score(pc.average, 1))))),
      x.recusals.length ? h('p.faint.tiny', icon('shieldBan'), L('تنحٍّ: ', 'Recused: '), x.recusals.map((rc) => `${nm(rc.member)} (${L(...RECUSAL[rc.reason])})`).join('، ')) : null,
      x.comments.length ? h('div.aw-rank-comments', h('span.aw-lbl', L('ملاحظات الأعضاء (دون أسماء)', 'Member notes (unattributed)')), x.comments.map((t) => h('p', `«${t}»`))) : null,
      !announced && picked ? h('div.form-row', h('label.lbl', { for: `aw-cit-${x.id}` }, L('نص التكريم على الشهادة', 'Certificate citation')),
        h('textarea.field', { id: `aw-cit-${x.id}`, 'data-fk': `cit-${x.id}`, rows: 2, maxlength: 400, oninput: (e) => { sel.winners.set(x.id, e.target.value); } }, sel.winners.get(x.id) || '')) : null,
      announced && x.citation_ar ? h('p.aw-citation', `«${L(x.citation_ar, x.citation_en || x.citation_ar)}»`) : null));
}

async function finalize(btn, p, sel) {
  const ok = await confirmDialog(L('اعتماد الفائزين وإعلان النتائج؟', 'Finalise winners and announce?'),
    L('إجراء نهائي: يُعلن الفائزون لجميع الموظفين في قاعة التميّز، ويُبلّغ كل المرشحين ومقدّمي الترشيحات بالنتيجة. تبقى الدرجات سرية.', 'Final: winners are announced to all staff and every nominee and nominator is notified. Scores stay confidential.'),
    { confirmLabel: L('اعتماد وإعلان', 'Finalise & announce') });
  if (!ok) return;
  const body = { winners: [...sel.winners].map(([id, cit]) => ({ nomination_id: id, citation_ar: (cit || '').trim() || undefined })), note: sel.note.trim() || undefined, confirm: true };
  const r = await act(btn, () => call(`/programs/${p.id}/finalize`, { method: 'POST', body }));
  if (!r) return;
  picks.delete(p.id);
  toast(L('أُعلنت النتائج — مبروك للفائزين!', 'Results announced — congratulations to the winners!'));
  location.hash = href('hall');
  refresh();
}
void restricted; void chip;
