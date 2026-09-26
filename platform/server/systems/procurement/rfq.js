// Requests for quotation: drafting (spec, shortlist, committee), sealed bids,
// two-key opening, weighted evaluation, recommendation → committee approval →
// legal review → purchase order → contract. Plus the provider side of the portal.
//
// Sealed bids: before opening nobody internal can read bid contents (only the
// count, and only for the officer and the assigned committee). A provider only
// ever sees its own bid and its own outcome.
// Bid contents after opening: the officer, non-recused committee members and —
// from the legal stage — the legal reviewer. Every such view is access-logged.
import {
  one, all, run, uid, now, tx, json, Forbidden, NotFound, BadRequest, Conflict,
  isStaff, isExternal, requireStaff, usersWithCap, userBrief, hasCap,
  audit, logAccess, accessLog, changed, alert, transition, clean, round, inList,
} from '../kit.js';
import { SYS, CATEGORIES, RFQ_STATUS, RFQ_FLOW, labelsAr, nextNumber, isOfficer, isLegal, isCommittee, DEFAULT_CRITERIA, DEFAULT_TECH_WEIGHT, DEFAULT_MIN_TECH } from './schema.js';
import { visibleRequest, requestRow, itemsOf, event, markOfficer, toSourcing, backToProcurement, issuePo, prRecipients } from './requests.js';
import { providerEligibility, providerBrief, providerUserIds, eligibleProviders, shortlist as providerShortlist } from '../providers.js';
import { providerOfUser } from '../providers/service.js';
import { declaredConflicts, conflictWith, userConflictWith } from './conflicts.js';

const RFQ_AR = labelsAr(RFQ_STATUS);
export const OPENED = ['opened', 'evaluated', 'recommended', 'committee_approved', 'legal_approved', 'awarded'];
const LEGAL_STAGE = ['committee_approved', 'legal_approved', 'awarded'];
export const MASK = ['أ', 'ب', 'ج', 'د', 'هـ', 'و', 'ز', 'ح', 'ط', 'ي', 'ك', 'ل'];
export const maskLabel = (i) => `المورّد ${MASK[i] || i + 1}`;
const nowMs = () => Date.now();
export const isClosed = (q) => !!q.closes_at && Date.parse(q.closes_at) <= nowMs();
export const displayStatus = (q) => (q.status === 'open' && isClosed(q) ? 'closed' : q.status);

// ---------------- conflicts of interest (integrity system, optional) ----------------
const providerFull = (id) => (id ? one('SELECT id,name_ar,name_en,org_id FROM providers_companies WHERE id=?', id) : null);
const bidProvider = (bidId) => providerFull(one('SELECT provider_id FROM procurement_bids WHERE id=?', bidId || '')?.provider_id);
// The officer and the legal reviewer act on the award itself: a declared conflict
// with the provider concerned bars them from recommending / approving / awarding it.
async function requireNoConflict(user, providers, what) {
  if (await userConflictWith(user.id, providers)) throw new Forbidden(`لديك تضارب مصالح مُفصح عنه مع أحد الموردين المعنيين — لا يمكنك ${what}؛ يتولاه زميل آخر`);
}
// Members with a declared vendor conflict (with any invited provider) are recused: they
// cannot hold an opening key, score or vote, and their scores are excluded.
export async function syncRecusals(q) {
  const members = all('SELECT * FROM procurement_committee WHERE rfq_id=? AND recused=0', q.id);
  if (!members.length) return false;
  const invited = all('SELECT p.id,p.name_ar,p.name_en,p.org_id FROM procurement_invites i JOIN providers_companies p ON p.id=i.provider_id WHERE i.rfq_id=?', q.id);
  let any = false;
  for (const m of members) {
    const hit = conflictWith(await declaredConflicts(m.member_id), invited);
    if (!hit) continue;
    run("UPDATE procurement_committee SET recused=1, recusal_reason=?, recusal_source='integrity', recused_at=? WHERE rfq_id=? AND member_id=?", 'تضارب مصالح مُفصح عنه في نظام الإفصاح مع أحد الموردين المدعوين', now(), q.id, m.member_id);
    if (q.key1_by === m.member_id && q.status === 'open') run('UPDATE procurement_rfqs SET key1_by=NULL, key1_at=NULL WHERE id=?', q.id);
    audit(null, 'procurement.recusal.auto', q.id, { member: m.member_id, provider: hit.provider.id });
    event(q.request_id, q.id, 'recused', m.member_id, 'تنحٍّ تلقائي بسبب تضارب مصالح مُفصح عنه');
    any = true;
  }
  return any;
}

// ---------------- scope ----------------
function rfqScope(user, a = 'q') {
  if (!isStaff(user)) return { sql: '0', params: [] };
  if (isOfficer(user)) return { sql: '1', params: [] };
  const legal = isLegal(user) ? 1 : 0;
  return {
    sql: `(EXISTS (SELECT 1 FROM procurement_committee c WHERE c.rfq_id=${a}.id AND c.member_id=?) OR (${legal}=1 AND ${a}.status IN (${inList(LEGAL_STAGE)})) OR ${a}.legal_by=?)`,
    params: [user.id, ...LEGAL_STAGE, user.id],
  };
}
export function visibleRfq(user, id) {
  requireStaff(user);
  const s = rfqScope(user);
  const q = one(`SELECT q.* FROM procurement_rfqs q WHERE q.id=? AND ${s.sql}`, id, ...s.params);
  if (!q) throw new NotFound('طلب العروض غير موجود أو غير متاح لك');
  return q;
}
const rfqRow = (id) => one('SELECT * FROM procurement_rfqs WHERE id=?', id);
const memberOf = (q, userId) => one('SELECT * FROM procurement_committee WHERE rfq_id=? AND member_id=?', q.id, userId);
const activeMembers = (q) => all('SELECT * FROM procurement_committee WHERE rfq_id=? AND recused=0', q.id);
function canSeeBids(user, q) {
  if (!OPENED.includes(q.status)) return false;
  if (isOfficer(user)) return true;
  const m = memberOf(q, user.id);
  if (m && !m.recused) return true;
  return isLegal(user) && (LEGAL_STAGE.includes(q.status) || q.legal_by === user.id);
}
function requireActiveMember(user, q) {
  const m = memberOf(q, user.id);
  if (!m) throw new Forbidden('هذا الإجراء لأعضاء لجنة التقييم المعيّنين لهذا الطلب');
  if (m.recused) throw new Forbidden('أنت متنحٍّ عن هذا الطلب بسبب تضارب مصالح — لا يمكنك المشاركة في الفتح أو التقييم أو التصويت');
  return m;
}
function requireOfficer(user) { if (!isOfficer(user)) throw new Forbidden('هذا الإجراء من صلاحية أخصائي المشتريات'); }
function rfqRecipients(q, { providers = false } = {}) {
  const ids = new Set(usersWithCap('procurement.officer'));
  for (const m of all('SELECT member_id FROM procurement_committee WHERE rfq_id=?', q.id)) ids.add(m.member_id);
  if (LEGAL_STAGE.includes(q.status) || q.legal_by) for (const id of usersWithCap('procurement.legal')) ids.add(id);
  if (providers) for (const p of all('SELECT provider_id FROM procurement_invites WHERE rfq_id=?', q.id)) for (const u of providerUserIds(p.provider_id)) ids.add(u);
  return [...ids];
}
function notify(q, opts) {
  const pr = requestRow(q.request_id);
  changed(SYS, [...rfqRecipients(rfqRow(q.id), opts), ...(pr ? prRecipients(pr) : [])], q.id);
}

// ---------------- evaluation maths ----------------
const bidsOf = (q) => all("SELECT * FROM procurement_bids WHERE rfq_id=? AND status='submitted' ORDER BY submitted_at", q.id);
export function evaluation(q) {
  const criteria = json(q.criteria, DEFAULT_CRITERIA);
  const items = itemsOf(q.request_id);
  const bids = bidsOf(q);
  const members = activeMembers(q).map((m) => m.member_id);
  const scores = all(`SELECT * FROM procurement_scores WHERE rfq_id=? AND member_id IN (${inList(members)})`, q.id, ...members);
  const rows = bids.map((b, i) => {
    const lines = json(b.lines, []);
    const priced = items.filter((it) => lines.find((l) => l.item_id === it.id && l.unit_price != null));
    const complete = priced.length === items.length;
    const perMember = members.map((mid) => {
      const mine = scores.filter((s) => s.bid_id === b.id && s.member_id === mid);
      if (mine.length < criteria.length) return null;
      return criteria.reduce((a, c) => a + (c.weight * (mine.find((s) => s.criterion === c.key)?.score ?? 0)) / 10, 0);
    });
    const done = perMember.filter((x) => x != null);
    const tech = done.length ? round(done.reduce((a, x) => a + x, 0) / done.length, 1) : null;
    return { bid_id: b.id, provider_id: b.provider_id, label: maskLabel(i), total: b.total, complete, tech, scored_by: done.length, passed: tech != null && tech >= q.min_tech };
  });
  const pool = rows.filter((r) => r.complete && r.passed);
  const lowest = pool.length ? Math.min(...pool.map((r) => r.total)) : null;
  for (const r of rows) {
    r.fin = r.complete && r.passed && lowest ? round((lowest / r.total) * 100, 1) : null;
    r.combined = r.fin != null ? round((q.tech_weight * r.tech + (100 - q.tech_weight) * r.fin) / 100, 1) : null;
  }
  const ranked = rows.filter((r) => r.combined != null).sort((a, b) => b.combined - a.combined);
  ranked.forEach((r, i) => { r.rank = i + 1; });
  const completion = members.map((mid) => ({ member: userBrief(mid), done: bids.every((b) => criteria.every((c) => scores.some((s) => s.bid_id === b.id && s.member_id === mid && s.criterion === c.key))) }));
  return { criteria, tech_weight: q.tech_weight, fin_weight: 100 - q.tech_weight, min_tech: q.min_tech, rows, top: ranked[0]?.bid_id || null, lowest_complete: lowest, completion };
}
const pctDev = (v, base) => (base ? round(((v - base) / base) * 100, 1) : null);
const median = (arr) => { const s = [...arr].sort((a, b) => a - b); if (!s.length) return null; const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const LOW = -25; const HIGH = 30;
// Deterministic findings: abnormal prices (vs estimate and vs other bids), missing items,
// provider documents / status, recusals. Names are only attached for the internal UI.
export function findings(q) {
  const items = itemsOf(q.request_id);
  const bids = bidsOf(q);
  const ev = evaluation(q);
  const estTotal = round(items.reduce((a, i) => a + i.qty * i.est_unit_price, 0), 2);
  const lineRows = items.map((it) => {
    const prices = bids.map((b) => ({ bid_id: b.id, unit_price: json(b.lines, []).find((l) => l.item_id === it.id)?.unit_price ?? null }));
    return {
      item_id: it.id, line_no: it.line_no, description: it.description, qty: it.qty, unit: it.unit, est_unit_price: it.est_unit_price,
      prices: prices.map((p) => {
        if (p.unit_price == null) return { ...p, missing: true, flags: [] };
        const peers = prices.filter((x) => x.bid_id !== p.bid_id && x.unit_price != null).map((x) => x.unit_price);
        const devEst = pctDev(p.unit_price, it.est_unit_price);
        const devPeers = peers.length ? pctDev(p.unit_price, median(peers)) : null;
        const flags = [];
        if (devEst != null && devEst < LOW) flags.push('low_vs_estimate');
        if (devEst != null && devEst > HIGH) flags.push('high_vs_estimate');
        if (devPeers != null && devPeers < LOW) flags.push('low_vs_peers');
        if (devPeers != null && devPeers > HIGH) flags.push('high_vs_peers');
        return { ...p, dev_est: devEst, dev_peers: devPeers, flags };
      }),
    };
  });
  const completeTotals = bids.filter((b) => ev.rows.find((r) => r.bid_id === b.id)?.complete).map((b) => ({ id: b.id, total: b.total }));
  const bidRows = bids.map((b, i) => {
    const r = ev.rows.find((x) => x.bid_id === b.id);
    const flags = [];
    const missing = lineRows.filter((l) => l.prices.find((p) => p.bid_id === b.id)?.missing).map((l) => l.line_no);
    if (missing.length) flags.push({ code: 'missing_items', severity: 'warn', ar: `لم يسعّر ${missing.length === 1 ? 'البند' : 'البنود'} ${missing.join('، ')}`, en: `Missing price for item(s) ${missing.join(', ')}` });
    let devEst = null; let devPeers = null;
    if (r.complete) {
      devEst = pctDev(b.total, estTotal);
      const peers = completeTotals.filter((x) => x.id !== b.id).map((x) => x.total);
      devPeers = peers.length ? pctDev(b.total, median(peers)) : null;
      if (devEst < LOW) flags.push({ code: 'low_vs_estimate', severity: 'warn', ar: `الإجمالي أقل من التقدير بـ ${Math.abs(devEst)}%`, en: `Total ${Math.abs(devEst)}% below estimate` });
      if (devEst > HIGH) flags.push({ code: 'high_vs_estimate', severity: 'warn', ar: `الإجمالي أعلى من التقدير بـ ${devEst}%`, en: `Total ${devEst}% above estimate` });
      if (devPeers != null && devPeers < LOW) flags.push({ code: 'low_vs_peers', severity: 'warn', ar: `الإجمالي أقل من وسيط العروض الأخرى بـ ${Math.abs(devPeers)}%`, en: `Total ${Math.abs(devPeers)}% below the other bids' median` });
      if (devPeers != null && devPeers > HIGH) flags.push({ code: 'high_vs_peers', severity: 'warn', ar: `الإجمالي أعلى من وسيط العروض الأخرى بـ ${devPeers}%`, en: `Total ${devPeers}% above the other bids' median` });
    }
    const lineFlags = lineRows.flatMap((l) => (l.prices.find((p) => p.bid_id === b.id)?.flags || []).map((f) => ({ f, l })));
    for (const { f, l } of lineFlags) {
      const p = l.prices.find((x) => x.bid_id === b.id);
      const v = f.endsWith('estimate') ? p.dev_est : p.dev_peers;
      const vs = f.endsWith('estimate') ? ['السعر التقديري', 'the estimate'] : ['أسعار العروض الأخرى', 'the other bids'];
      flags.push({ code: `line_${f}`, severity: 'info', line_no: l.line_no, ar: `البند ${l.line_no}: ${v < 0 ? 'أقل' : 'أعلى'} من ${vs[0]} بـ ${Math.abs(v)}%`, en: `Item ${l.line_no}: ${Math.abs(v)}% ${v < 0 ? 'below' : 'above'} ${vs[1]}` });
    }
    const el = providerEligibility(b.provider_id);
    for (const x of el.reasons) flags.push({ code: x.code.startsWith('expired') ? 'expired_docs' : 'provider_status', severity: 'crit', ar: x.ar, en: x.en });
    if (r.tech != null && !r.passed) flags.push({ code: 'below_tech_min', severity: 'warn', ar: `الدرجة الفنية ${r.tech} أقل من حد القبول ${q.min_tech}`, en: `Technical score ${r.tech} below the ${q.min_tech} pass mark` });
    return { bid_id: b.id, provider_id: b.provider_id, label: maskLabel(i), total: b.total, complete: r.complete, dev_est: devEst, dev_peers: devPeers, tech: r.tech, fin: r.fin, combined: r.combined, rank: r.rank ?? null, passed: r.passed, eligible_now: el.eligible, flags };
  });
  const recusals = all('SELECT * FROM procurement_committee WHERE rfq_id=? AND recused=1', q.id).map((m) => ({ member: userBrief(m.member_id), reason: m.recusal_reason, source: m.recusal_source }));
  return { est_total: estTotal, bids: bidRows, lines: lineRows, recusals, top: ev.top, thresholds: { low: LOW, high: HIGH } };
}

// ---------------- detail ----------------
function pubInvite(row) {
  const p = providerBrief(row.provider_id);
  const el = providerEligibility(row.provider_id);
  return { provider: p, invited_at: row.invited_at, eligible_now: el.eligible, reasons: el.reasons };
}
function pubRfqSummary(q, user) {
  const pr = requestRow(q.request_id);
  const counts = one("SELECT COUNT(*) n FROM procurement_bids WHERE rfq_id=? AND status='submitted'", q.id).n;
  const member = memberOf(q, user.id);
  return {
    id: q.id, number: q.number, title: q.title, category: q.category, status: displayStatus(q), raw_status: q.status, closes_at: q.closes_at,
    request: pr ? { id: pr.id, number: pr.number, est_total: pr.est_total, department_id: pr.department_id } : null,
    invited: one('SELECT COUNT(*) n FROM procurement_invites WHERE rfq_id=?', q.id).n,
    bid_count: isOfficer(user) || member ? counts : null,
    key1: !!q.key1_by, my_role: isOfficer(user) ? 'officer' : member ? (member.recused ? 'recused' : 'member') : isLegal(user) ? 'legal' : null,
    po_number: q.po_number, is_demo: !!q.is_demo, updated_at: q.updated_at,
  };
}
export function listRfqs(user, { status } = {}) {
  requireStaff(user);
  const s = rfqScope(user);
  return all(`SELECT q.* FROM procurement_rfqs q WHERE ${s.sql} ORDER BY CASE q.status WHEN 'open' THEN 0 WHEN 'draft' THEN 2 WHEN 'awarded' THEN 4 WHEN 'cancelled' THEN 5 ELSE 1 END, q.closes_at`, ...s.params)
    .map((q) => pubRfqSummary(q, user)).filter((q) => !status || q.status === status);
}
export async function getRfq(user, id) {
  let q = visibleRfq(user, id);
  if (await syncRecusals(q)) q = rfqRow(id);
  const pr = requestRow(q.request_id);
  const member = memberOf(q, user.id);
  const seeBids = canSeeBids(user, q);
  logAccess(user, SYS, 'rfq', q.id, seeBids ? 'view_bids' : 'view');
  const items = itemsOf(q.request_id).map((i) => ({ id: i.id, line_no: i.line_no, description: i.description, qty: i.qty, unit: i.unit, est_unit_price: i.est_unit_price, est_total: round(i.qty * i.est_unit_price, 2) }));
  const committee = all('SELECT * FROM procurement_committee WHERE rfq_id=? ORDER BY recused, member_id', q.id).map((m) => ({ member: userBrief(m.member_id), recused: !!m.recused, recusal_reason: m.recused ? m.recusal_reason : null, recusal_source: m.recusal_source, me: m.member_id === user.id }));
  const out = {
    ...pubRfqSummary(q, user),
    request: { id: pr.id, number: pr.number, title: pr.title, requester: userBrief(pr.requester_id), department_id: pr.department_id, dept: one('SELECT name_ar,name_en FROM departments WHERE id=?', pr.department_id), est_total: pr.est_total, needed_by: pr.needed_by, justification: pr.justification },
    items, criteria: json(q.criteria, DEFAULT_CRITERIA), tech_weight: q.tech_weight, min_tech: q.min_tech,
    spec: { doc_id: q.spec_doc_id, mode: q.spec_mode, at: q.spec_at, html: q.spec_html || (q.spec_doc_id ? one('SELECT content_html FROM documents WHERE id=?', q.spec_doc_id)?.content_html : null) || null, published: !!q.spec_html },
    invites: all('SELECT * FROM procurement_invites WHERE rfq_id=? ORDER BY invited_at', q.id).map(pubInvite),
    committee, keys: { first: q.key1_by ? { by: userBrief(q.key1_by), at: q.key1_at } : null, opened: q.opened_by ? { by: userBrief(q.opened_by), at: q.opened_at } : null },
    sealed: !OPENED.includes(q.status) && q.status !== 'cancelled',
    can_see_bids: seeBids,
    recommendation: q.recommended_bid ? { bid_id: q.recommended_bid, by: userBrief(q.recommended_by), at: q.recommended_at, note: q.recommendation_note } : null,
    legal: q.legal_by ? { by: userBrief(q.legal_by), at: q.legal_at, note: q.legal_note } : null,
    award: q.po_number ? { po_number: q.po_number, amount: q.po_amount, contract_id: q.contract_id, at: q.awarded_at } : null,
    cancel_note: q.cancel_note,
    timeline: all('SELECT * FROM procurement_events WHERE rfq_id=? ORDER BY at', q.id).map((e) => ({ action: e.action, note: e.note, at: e.at, who: e.by_id ? userBrief(e.by_id) : null })),
    access_log: seeBids || isOfficer(user) ? accessLog(SYS, 'rfq', q.id, 40) : null,
    can: actions(user, q, member),
  };
  if (isOfficer(user) && q.status === 'draft') out.committee_candidates = usersWithCap('procurement.committee').filter((m) => ![pr.requester_id, q.officer_id, user.id].includes(m)).map(userBrief).filter((u) => u && u.user_type === 'staff');
  if (seeBids) {
    const f = findings(q);
    const ev = evaluation(q);
    const own = all('SELECT * FROM procurement_scores WHERE rfq_id=? AND member_id=?', q.id, user.id);
    const showAggregate = q.status !== 'opened' || isOfficer(user);
    out.bids = bidsOf(q).map((b, i) => {
      const r = ev.rows.find((x) => x.bid_id === b.id); const fb = f.bids.find((x) => x.bid_id === b.id);
      return {
        id: b.id, label: maskLabel(i), provider: providerBrief(b.provider_id), total: b.total, delivery_days: b.delivery_days, validity_days: b.validity_days, technical_note: b.technical_note, submitted_at: b.submitted_at, is_demo: !!b.is_demo,
        lines: json(b.lines, []), complete: r.complete, flags: fb.flags, eligible_now: fb.eligible_now,
        tech: showAggregate ? r.tech : null, fin: showAggregate ? r.fin : null, combined: showAggregate ? r.combined : null, rank: showAggregate ? r.rank ?? null : null, passed: showAggregate ? r.passed : null,
        my_scores: Object.fromEntries(own.filter((s) => s.bid_id === b.id).map((s) => [s.criterion, s.score])),
      };
    });
    out.evaluation = { completion: ev.completion, top: showAggregate ? ev.top : null, lowest_complete: ev.lowest_complete, fin_weight: ev.fin_weight, aggregate_visible: showAggregate };
    out.lines_analysis = f.lines;
    out.analysis = { findings: { est_total: f.est_total, recusals: f.recusals, thresholds: f.thresholds }, narrative: q.analysis ? json(q.analysis, null) : null, mode: q.analysis_mode, at: q.analysis_at, by: q.analysis_by ? userBrief(q.analysis_by) : null };
    out.votes = all('SELECT * FROM procurement_votes WHERE rfq_id=? ORDER BY at', q.id).map((v) => ({ member: userBrief(v.member_id), bid_id: v.bid_id, decision: v.decision, note: v.note, at: v.at }));
  }
  return out;
}
function actions(user, q, member) {
  const officer = isOfficer(user);
  const active = member && !member.recused;
  const pr = requestRow(q.request_id);
  const st = displayStatus(q);
  return {
    edit: officer && q.status === 'draft',
    publish: officer && q.status === 'draft',
    extend: officer && st === 'open',
    invite: officer && (q.status === 'draft' || st === 'open'),
    cancel: officer && !['awarded', 'cancelled'].includes(q.status),
    open_key: !!active && st === 'closed' && q.key1_by !== user.id,
    waiting_second_key: st === 'closed' && q.key1_by === user.id,
    score: !!active && q.status === 'opened',
    analyse: (officer || !!active) && OPENED.includes(q.status) && q.status !== 'awarded',
    finalize: officer && q.status === 'opened',
    recommend: officer && q.status === 'evaluated',
    vote: !!active && q.status === 'recommended' && user.id !== q.recommended_by && user.id !== pr?.requester_id && !one('SELECT 1 FROM procurement_votes WHERE rfq_id=? AND member_id=? AND bid_id=?', q.id, user.id, q.recommended_bid || ''),
    legal: isLegal(user) && q.status === 'committee_approved' && ![pr?.requester_id, q.officer_id].includes(user.id),
    award: officer && q.status === 'legal_approved',
    recuse: !!active && !['awarded', 'cancelled'].includes(q.status),
  };
}

// ---------------- drafting (officer) ----------------
export function startRfq(user, requestId) {
  const pr = visibleRequest(user, requestId);
  markOfficer(user, pr);
  const id = uid('rfq_'); const t = now();
  const committee = usersWithCap('procurement.committee').filter((m) => ![pr.requester_id, user.id].includes(m) && one("SELECT 1 FROM users WHERE id=? AND user_type='staff' AND active=1", m));
  tx(() => {
    run(`INSERT INTO procurement_rfqs (id,number,request_id,title,category,officer_id,status,closes_at,criteria,tech_weight,min_tech,created_at,updated_at) VALUES (?,?,?,?,?,?, 'draft', ?,?,?,?,?,?)`,
      id, nextNumber('RFQ', 23), pr.id, pr.title, pr.category, user.id, new Date(nowMs() + 7 * 864e5).toISOString().slice(0, 16) + ':00.000Z', JSON.stringify(DEFAULT_CRITERIA), DEFAULT_TECH_WEIGHT, DEFAULT_MIN_TECH, t, t);
    for (const m of committee) run('INSERT INTO procurement_committee (rfq_id,member_id) VALUES (?,?)', id, m);
    toSourcing(user, pr, id);
  });
  audit(user, 'procurement.rfq.create', id, { request: pr.id });
  notify(rfqRow(id));
  return id;
}
function draftRfq(user, id) {
  const q = visibleRfq(user, id);
  requireOfficer(user);
  if (q.status !== 'draft') throw new Conflict('لا يمكن تعديل طلب العروض بعد نشره');
  return q;
}
export function updateRfq(user, id, b) {
  const q = draftRfq(user, id);
  const pr = requestRow(q.request_id);
  const sets = []; const params = [];
  if (b.title) { sets.push('title=?'); params.push(clean(b.title, 200)); }
  if (b.closes_at) {
    const ts = Date.parse(b.closes_at);
    if (!Number.isFinite(ts) || ts <= nowMs()) throw new BadRequest('موعد الإغلاق يجب أن يكون في المستقبل');
    sets.push('closes_at=?'); params.push(new Date(ts).toISOString());
  }
  if (b.criteria) {
    if (b.criteria.length < 2 || b.criteria.length > 6) throw new BadRequest('حدّد من 2 إلى 6 معايير فنية');
    const keys = new Set();
    const list = b.criteria.map((c, i) => {
      const ar = clean(c.ar, 120); if (ar.length < 3) throw new BadRequest(`اسم المعيار ${i + 1} مطلوب`);
      if (!Number.isInteger(c.weight) || c.weight < 5 || c.weight > 80) throw new BadRequest('وزن كل معيار بين 5 و80');
      const key = clean(c.key || `c${i + 1}`, 30).replace(/[^a-z0-9_]/gi, '') || `c${i + 1}`;
      if (keys.has(key)) throw new BadRequest('مفاتيح المعايير مكررة'); keys.add(key);
      return { key, ar, en: clean(c.en || c.ar, 120), weight: c.weight };
    });
    if (list.reduce((a, c) => a + c.weight, 0) !== 100) throw new BadRequest('مجموع أوزان المعايير الفنية يجب أن يساوي 100');
    sets.push('criteria=?'); params.push(JSON.stringify(list));
  }
  if (b.tech_weight != null) { if (!Number.isInteger(b.tech_weight) || b.tech_weight < 30 || b.tech_weight > 90) throw new BadRequest('الوزن الفني بين 30 و90'); sets.push('tech_weight=?'); params.push(b.tech_weight); }
  if (b.min_tech != null) { if (!Number.isInteger(b.min_tech) || b.min_tech < 0 || b.min_tech > 90) throw new BadRequest('حد القبول الفني بين 0 و90'); sets.push('min_tech=?'); params.push(b.min_tech); }
  tx(() => {
    if (sets.length) run(`UPDATE procurement_rfqs SET ${sets.join(', ')}, updated_at=? WHERE id=?`, ...params, now(), id);
    if (b.committee) {
      const ids = [...new Set(b.committee)];
      for (const m of ids) {
        const u = one("SELECT id FROM users WHERE id=? AND user_type='staff' AND active=1", m);
        if (!u || !one("SELECT 1 FROM user_caps WHERE user_id=? AND cap='procurement.committee'", m)) throw new BadRequest('عضو اللجنة يجب أن يحمل صلاحية «لجنة تقييم العروض»');
        if (m === pr.requester_id) throw new BadRequest('لا يكون مقدّم الطلب عضواً في لجنة تقييمه');
        if (m === q.officer_id || m === user.id) throw new BadRequest('لا يكون أخصائي المشتريات عضواً في لجنة التقييم');
      }
      const keep = all('SELECT * FROM procurement_committee WHERE rfq_id=?', id);
      run('DELETE FROM procurement_committee WHERE rfq_id=?', id);
      for (const m of ids) {
        const k = keep.find((x) => x.member_id === m);
        run('INSERT INTO procurement_committee (rfq_id,member_id,recused,recusal_reason,recusal_source,recused_at) VALUES (?,?,?,?,?,?)', id, m, k?.recused || 0, k?.recusal_reason || null, k?.recusal_source || null, k?.recused_at || null);
      }
    }
  });
  audit(user, 'procurement.rfq.update', id, { fields: Object.keys(b) });
  notify(rfqRow(id));
  return id;
}
export function shortlistFor(user, id) {
  const q = visibleRfq(user, id);
  requireOfficer(user);
  const s = providerShortlist(q.category);
  const invited = new Set(all('SELECT provider_id FROM procurement_invites WHERE rfq_id=?', q.id).map((r) => r.provider_id));
  const mark = (p) => ({ id: p.id, name_ar: p.name_ar, name_en: p.name_en, category: p.category, status: p.status, rating: p.rating, rating_count: p.rating_count, reasons: p.reasons, warnings: p.warnings, invited: invited.has(p.id) });
  return { category: q.category, eligible: s.eligible.map(mark), excluded: s.excluded.map(mark) };
}
export function invite(user, id, providerIds) {
  const q = visibleRfq(user, id);
  requireOfficer(user);
  if (!(q.status === 'draft' || displayStatus(q) === 'open')) throw new Conflict('لا يمكن إضافة دعوات بعد إغلاق طلب العروض');
  const eligible = new Set(eligibleProviders(q.category).map((p) => p.id));
  const added = [];
  for (const pid of [...new Set(providerIds)]) {
    const p = providerBrief(pid);
    if (!p) throw new BadRequest('مورد غير موجود');
    if (!eligible.has(pid)) {
      const el = providerEligibility(pid);
      throw new Conflict(`«${p.name_ar}» غير مؤهل لهذه الفئة: ${el.reasons.map((x) => x.ar).join('، ') || 'غير مسجّل في الفئة'}`);
    }
    if (run('INSERT OR IGNORE INTO procurement_invites (rfq_id,provider_id,invited_by,invited_at) VALUES (?,?,?,?)', id, pid, user.id, now()).changes) added.push(p);
  }
  audit(user, 'procurement.rfq.invite', id, { providers: added.map((p) => p.id) });
  if (q.status !== 'draft') for (const p of added) for (const u of providerUserIds(p.id)) alert(u, { title: `دعوة لتقديم عرض: ${q.number}`, body: `${q.title} — آخر موعد ${q.closes_at?.slice(0, 16).replace('T', ' ')}`, system: SYS, id });
  notify(rfqRow(id), { providers: q.status !== 'draft' });
  return id;
}
export function uninvite(user, id, providerId) {
  const q = draftRfq(user, id);
  run('DELETE FROM procurement_invites WHERE rfq_id=? AND provider_id=?', q.id, providerId);
  audit(user, 'procurement.rfq.uninvite', id, { provider: providerId });
  notify(q);
  return id;
}
export async function publish(user, id) {
  let q = draftRfq(user, id);
  await syncRecusals(q); q = rfqRow(id);
  const invites = all('SELECT provider_id FROM procurement_invites WHERE rfq_id=?', id);
  if (!invites.length) throw new Conflict('ادعُ مورداً مؤهلاً واحداً على الأقل قبل النشر');
  const eligible = new Set(eligibleProviders(q.category).map((p) => p.id));
  const stale = invites.filter((i) => !eligible.has(i.provider_id));
  if (stale.length) throw new Conflict(`موردون لم يعودوا مؤهلين: ${stale.map((i) => providerBrief(i.provider_id)?.name_ar).join('، ')} — أزل دعوتهم`);
  if (activeMembers(q).length < 2) throw new Conflict('يلزم عضوان على الأقل غير متنحّيين في لجنة التقييم (لفتح العروض بمفتاحين)');
  if (!q.closes_at || Date.parse(q.closes_at) <= nowMs()) throw new Conflict('حدّد موعد إغلاق في المستقبل');
  const spec = q.spec_doc_id ? one('SELECT content_html FROM documents WHERE id=? AND deleted_at IS NULL', q.spec_doc_id)?.content_html : null;
  if (!spec) throw new Conflict('جهّز نطاق العمل والمواصفات قبل النشر');
  transition(q.status, 'open', RFQ_FLOW, RFQ_AR);
  run("UPDATE procurement_rfqs SET status='open', spec_html=?, published_at=?, updated_at=? WHERE id=?", spec, now(), now(), id);
  event(q.request_id, id, 'rfq_published', user, `${invites.length} مورد — الإغلاق ${q.closes_at}`);
  audit(user, 'procurement.rfq.publish', id, { invites: invites.length, closes_at: q.closes_at });
  for (const i of invites) for (const u of providerUserIds(i.provider_id)) alert(u, { title: `دعوة لتقديم عرض: ${q.number}`, body: `${q.title} — آخر موعد ${q.closes_at.slice(0, 16).replace('T', ' ')} (توقيت غرينتش)`, system: SYS, id });
  for (const m of activeMembers(q)) alert(m.member_id, { title: `عُيّنت في لجنة تقييم ${q.number}`, body: q.title, system: SYS, id });
  notify(rfqRow(id), { providers: true });
  return id;
}
export function extend(user, id, { closes_at, reason }) {
  const q = visibleRfq(user, id);
  requireOfficer(user);
  if (displayStatus(q) !== 'open') throw new Conflict('يُمدَّد الموعد قبل الإغلاق فقط');
  const ts = Date.parse(closes_at);
  if (!Number.isFinite(ts) || ts <= Date.parse(q.closes_at)) throw new BadRequest('الموعد الجديد يجب أن يكون بعد الموعد الحالي');
  const why = clean(reason, 300); if (why.length < 5) throw new BadRequest('اذكر سبب التمديد');
  run('UPDATE procurement_rfqs SET closes_at=?, updated_at=? WHERE id=?', new Date(ts).toISOString(), now(), id);
  event(q.request_id, id, 'extended', user, why);
  audit(user, 'procurement.rfq.extend', id, { from: q.closes_at, to: new Date(ts).toISOString(), reason: why });
  for (const i of all('SELECT provider_id FROM procurement_invites WHERE rfq_id=?', id)) for (const u of providerUserIds(i.provider_id)) alert(u, { title: `تمديد موعد ${q.number}`, body: `الموعد الجديد ${new Date(ts).toISOString().slice(0, 16).replace('T', ' ')}`, system: SYS, id });
  notify(rfqRow(id), { providers: true });
  return id;
}
export function cancelRfq(user, id, { reason }) {
  const q = visibleRfq(user, id);
  requireOfficer(user);
  transition(q.status, 'cancelled', RFQ_FLOW, RFQ_AR);
  const why = clean(reason, 500); if (why.length < 5) throw new BadRequest('اذكر سبب الإلغاء');
  const pr = requestRow(q.request_id);
  tx(() => {
    run("UPDATE procurement_rfqs SET status='cancelled', cancel_note=?, updated_at=? WHERE id=?", why, now(), id);
    if (pr.status === 'sourcing') backToProcurement(user, pr, id, why);
  });
  audit(user, 'procurement.rfq.cancel', id, { reason: why });
  if (q.status !== 'draft') for (const i of all('SELECT provider_id FROM procurement_invites WHERE rfq_id=?', id)) for (const u of providerUserIds(i.provider_id)) alert(u, { level: 'warning', title: `أُلغي طلب العروض ${q.number}`, system: SYS, id });
  notify(rfqRow(id), { providers: q.status !== 'draft' });
  return id;
}
export function setSpec(user, id, { doc_id, mode }) {
  run('UPDATE procurement_rfqs SET spec_doc_id=?, spec_mode=?, spec_at=?, updated_at=? WHERE id=?', doc_id, mode, now(), now(), id);
  audit(user, 'procurement.rfq.spec', id, { doc_id, mode });
  notify(rfqRow(id));
}

// ---------------- committee: two-key opening, recusal, scoring, votes ----------------
export async function openKey(user, id) {
  let q = visibleRfq(user, id);
  if (await syncRecusals(q)) q = rfqRow(id);
  requireActiveMember(user, q);
  if (q.status !== 'open') throw new Conflict(`لا يمكن فتح العروض في حالة «${RFQ_AR[q.status]}»`);
  if (!isClosed(q)) throw new Conflict('العروض مختومة — لا يمكن فتحها قبل موعد الإغلاق');
  if (!q.key1_by) {
    const r = run("UPDATE procurement_rfqs SET key1_by=?, key1_at=?, updated_at=? WHERE id=? AND key1_by IS NULL AND status='open'", user.id, now(), now(), id);
    if (!r.changes) throw new Conflict('استُخدم المفتاح الأول للتو — أعد المحاولة');
    event(q.request_id, id, 'key1', user);
    audit(user, 'procurement.rfq.open_key1', id);
    for (const m of activeMembers(q)) if (m.member_id !== user.id) alert(m.member_id, { title: `المفتاح الأول لفتح عروض ${q.number} استُخدم`, body: 'بانتظار المفتاح الثاني من عضو آخر في اللجنة', system: SYS, id });
    notify(rfqRow(id));
    return { stage: 'key1' };
  }
  if (q.key1_by === user.id) throw new Conflict('يلزم عضو لجنة مختلف لاستخدام المفتاح الثاني');
  const r = run("UPDATE procurement_rfqs SET status='opened', opened_by=?, opened_at=?, updated_at=? WHERE id=? AND status='open' AND key1_by IS NOT NULL AND key1_by<>?", user.id, now(), now(), id, user.id);
  if (!r.changes) throw new Conflict('تعذّر فتح العروض — تحقّق من حالة الطلب');
  event(q.request_id, id, 'opened', user, `${bidsOf(q).length} عرض`);
  audit(user, 'procurement.rfq.opened', id, { key1: q.key1_by, key2: user.id, bids: bidsOf(q).length });
  for (const o of usersWithCap('procurement.officer')) alert(o, { title: `فُتحت عروض ${q.number}`, body: 'اللجنة تبدأ التقييم الفني', system: SYS, id });
  notify(rfqRow(id));
  return { stage: 'opened' };
}
export function recuse(user, id, { reason }) {
  const q = visibleRfq(user, id);
  requireActiveMember(user, q);
  if (['awarded', 'cancelled'].includes(q.status)) throw new Conflict('انتهى طلب العروض');
  const why = clean(reason, 500); if (why.length < 5) throw new BadRequest('اذكر طبيعة تضارب المصالح باختصار');
  tx(() => {
    run("UPDATE procurement_committee SET recused=1, recusal_reason=?, recusal_source='self', recused_at=? WHERE rfq_id=? AND member_id=?", why, now(), id, user.id);
    if (q.key1_by === user.id && q.status === 'open') run('UPDATE procurement_rfqs SET key1_by=NULL, key1_at=NULL WHERE id=?', id);
    run('DELETE FROM procurement_votes WHERE rfq_id=? AND member_id=?', id, user.id);
  });
  event(q.request_id, id, 'recused', user, 'تنحٍّ بإفصاح ذاتي عن تضارب مصالح');
  audit(user, 'procurement.recusal.self', id);
  requireOfficerAlert(q, `تنحّى عضو من لجنة ${q.number} بسبب تضارب مصالح`);
  notify(rfqRow(id));
  return id;
}
function requireOfficerAlert(q, title) { for (const o of usersWithCap('procurement.officer')) alert(o, { level: 'warning', title, system: SYS, id: q.id }); }
export async function score(user, id, { bid_id, scores }) {
  let q = visibleRfq(user, id);
  if (await syncRecusals(q)) q = rfqRow(id);
  requireActiveMember(user, q);
  if (q.status !== 'opened') throw new Conflict('التقييم الفني متاح بعد فتح العروض وقبل اعتماد النتيجة');
  const b = one("SELECT * FROM procurement_bids WHERE id=? AND rfq_id=? AND status='submitted'", bid_id, id);
  if (!b) throw new NotFound('العرض غير موجود');
  const criteria = json(q.criteria, DEFAULT_CRITERIA);
  for (const c of criteria) {
    const v = scores?.[c.key];
    if (!Number.isInteger(v) || v < 0 || v > 10) throw new BadRequest(`درجة «${c.ar}» يجب أن تكون عدداً صحيحاً من 0 إلى 10`);
  }
  if (Object.keys(scores).some((k) => !criteria.find((c) => c.key === k))) throw new BadRequest('معيار غير معروف');
  tx(() => { for (const c of criteria) run('INSERT INTO procurement_scores (rfq_id,bid_id,member_id,criterion,score,at) VALUES (?,?,?,?,?,?) ON CONFLICT(rfq_id,bid_id,member_id,criterion) DO UPDATE SET score=excluded.score, at=excluded.at', id, bid_id, user.id, c.key, scores[c.key], now()); });
  audit(user, 'procurement.rfq.score', id, { bid: bid_id });
  logAccess(user, SYS, 'rfq', id, 'score');
  notify(rfqRow(id));
  return id;
}
export async function finalize(user, id) {
  let q = visibleRfq(user, id);
  requireOfficer(user);
  if (await syncRecusals(q)) q = rfqRow(id);
  transition(q.status, 'evaluated', RFQ_FLOW, RFQ_AR);
  const ev = evaluation(q);
  if (ev.completion.length < 2) throw new Conflict('يلزم عضوان على الأقل غير متنحّيين لاعتماد التقييم');
  const pending = ev.completion.filter((c) => !c.done);
  if (pending.length) throw new Conflict(`لم يكمل التقييم الفني: ${pending.map((c) => c.member.name_ar).join('، ')}`);
  if (!ev.top) throw new Conflict('لا يوجد عرض مكتمل ومجتاز للحد الفني — فكّر في إلغاء الطلب وإعادة الطرح');
  run("UPDATE procurement_rfqs SET status='evaluated', updated_at=? WHERE id=?", now(), id);
  event(q.request_id, id, 'evaluated', user);
  audit(user, 'procurement.rfq.evaluated', id, { top: ev.top });
  notify(rfqRow(id));
  return id;
}
export async function recommend(user, id, { bid_id, note }) {
  let q = visibleRfq(user, id);
  requireOfficer(user);
  if (await syncRecusals(q)) q = rfqRow(id);
  transition(q.status, 'recommended', RFQ_FLOW, RFQ_AR);
  const ev = evaluation(q);
  const row = ev.rows.find((r) => r.bid_id === bid_id);
  if (!row) throw new NotFound('العرض غير موجود');
  // An officer with a declared conflict with a bidder may not recommend that bidder,
  // nor use discretion to depart from the committee's ranking.
  await requireNoConflict(user, [bidProvider(bid_id)], 'التوصية بالترسية على هذا المورد');
  if (bid_id !== ev.top && await userConflictWith(user.id, ev.rows.map((r) => providerFull(r.provider_id)))) throw new Forbidden('لديك تضارب مصالح مُفصح عنه مع أحد المتقدمين — لا يمكنك التوصية بغير العرض الأعلى تقييماً؛ يتولاه زميل آخر');
  if (!row.complete) throw new Conflict('لا يمكن التوصية بعرض غير مكتمل التسعير');
  if (!row.passed) throw new Conflict('العرض لم يجتز حد القبول الفني');
  const el = providerEligibility(row.provider_id);
  if (!el.eligible) throw new Conflict(`لا يمكن الترسية على هذا المورد حالياً: ${el.reasons.map((x) => x.ar).join('، ')}`);
  const why = clean(note, 1000);
  if (bid_id !== ev.top && why.length < 10) throw new BadRequest('التوصية بغير العرض الأعلى تقييماً تتطلب مبرراً مكتوباً');
  run("UPDATE procurement_rfqs SET status='recommended', recommended_bid=?, recommended_by=?, recommended_at=?, recommendation_note=?, updated_at=? WHERE id=?", bid_id, user.id, now(), why || null, now(), id);
  run('DELETE FROM procurement_votes WHERE rfq_id=?', id);
  event(q.request_id, id, 'recommended', user, why || null);
  audit(user, 'procurement.rfq.recommend', id, { bid: bid_id, top: ev.top });
  for (const m of activeMembers(q)) alert(m.member_id, { title: `توصية ترسية بانتظار تصويتك: ${q.number}`, system: SYS, id });
  notify(rfqRow(id));
  return id;
}
export async function vote(user, id, { decision, note }) {
  let q = visibleRfq(user, id);
  if (await syncRecusals(q)) q = rfqRow(id);
  requireActiveMember(user, q);
  if (q.status !== 'recommended') throw new Conflict('لا توجد توصية بانتظار التصويت');
  const pr = requestRow(q.request_id);
  if (user.id === q.recommended_by || user.id === pr.requester_id) throw new Forbidden('لا يصوّت صاحب التوصية أو مقدّم الطلب');
  if (one('SELECT 1 FROM procurement_votes WHERE rfq_id=? AND member_id=? AND bid_id=?', id, user.id, q.recommended_bid)) throw new Conflict('صوّتَّ على هذه التوصية مسبقاً');
  const why = clean(note, 1000);
  if (decision === 'reject' && why.length < 5) throw new BadRequest('اذكر سبب عدم الموافقة');
  run('INSERT INTO procurement_votes (rfq_id,member_id,bid_id,decision,note,at) VALUES (?,?,?,?,?,?)', id, user.id, q.recommended_bid, decision, why || null, now());
  audit(user, `procurement.rfq.vote.${decision}`, id, { bid: q.recommended_bid });
  if (decision === 'reject') {
    transition(q.status, 'evaluated', RFQ_FLOW, RFQ_AR);
    run("UPDATE procurement_rfqs SET status='evaluated', recommended_bid=NULL, recommended_by=NULL, recommended_at=NULL, recommendation_note=NULL, updated_at=? WHERE id=?", now(), id);
    event(q.request_id, id, 'committee_rejected', user, why);
    requireOfficerAlert(q, `لم توافق اللجنة على توصية ${q.number}`);
  } else {
    const approvals = one("SELECT COUNT(DISTINCT v.member_id) n FROM procurement_votes v JOIN procurement_committee c ON c.rfq_id=v.rfq_id AND c.member_id=v.member_id AND c.recused=0 WHERE v.rfq_id=? AND v.bid_id=? AND v.decision='approve'", id, q.recommended_bid).n;
    event(q.request_id, id, 'vote_approve', user);
    if (approvals >= 2) {
      transition(q.status, 'committee_approved', RFQ_FLOW, RFQ_AR);
      run("UPDATE procurement_rfqs SET status='committee_approved', updated_at=? WHERE id=?", now(), id);
      event(q.request_id, id, 'committee_approved', null);
      for (const l of usersWithCap('procurement.legal')) if (![pr.requester_id, q.officer_id].includes(l)) alert(l, { title: `مراجعة قانونية مطلوبة: ${q.number}`, body: q.title, system: SYS, id });
    }
  }
  notify(rfqRow(id));
  return id;
}
export async function legalReview(user, id, { decision, note }) {
  const q = visibleRfq(user, id);
  if (!isLegal(user)) throw new Forbidden('المراجعة القانونية من صلاحية الشؤون القانونية');
  const pr = requestRow(q.request_id);
  if ([pr.requester_id, q.officer_id].includes(user.id)) throw new Forbidden('لا يراجع قانونياً من قدّم الطلب أو أعدّ التوصية');
  if (q.status !== 'committee_approved') throw new Conflict('لا توجد ترسية بانتظار المراجعة القانونية');
  if (memberOf(q, user.id)?.recused) throw new Forbidden('أنت متنحٍّ عن هذا الطلب بسبب تضارب مصالح — لا يمكنك مراجعته قانونياً');
  await requireNoConflict(user, [bidProvider(q.recommended_bid)], 'المراجعة القانونية لهذه الترسية');
  const why = clean(note, 1000);
  if (decision === 'return' && why.length < 5) throw new BadRequest('اذكر الملاحظات القانونية');
  if (decision === 'approve') {
    transition(q.status, 'legal_approved', RFQ_FLOW, RFQ_AR);
    run("UPDATE procurement_rfqs SET status='legal_approved', legal_by=?, legal_at=?, legal_note=?, updated_at=? WHERE id=?", user.id, now(), why || null, now(), id);
    event(q.request_id, id, 'legal_approved', user, why || null);
    requireOfficerAlert(q, `اعتمدت الشؤون القانونية ترسية ${q.number} — أصدر أمر الشراء`);
  } else {
    transition(q.status, 'evaluated', RFQ_FLOW, RFQ_AR);
    run("UPDATE procurement_rfqs SET status='evaluated', legal_by=?, legal_at=?, legal_note=?, recommended_bid=NULL, recommended_by=NULL, recommended_at=NULL, recommendation_note=NULL, updated_at=? WHERE id=?", user.id, now(), why, now(), id);
    run('DELETE FROM procurement_votes WHERE rfq_id=?', id);
    event(q.request_id, id, 'legal_returned', user, why);
    requireOfficerAlert(q, `أعادت الشؤون القانونية ${q.number} بملاحظات`);
  }
  audit(user, `procurement.rfq.legal.${decision}`, id);
  logAccess(user, SYS, 'rfq', id, `legal:${decision}`);
  notify(rfqRow(id));
  return id;
}
export async function award(user, id) {
  const q = visibleRfq(user, id);
  requireOfficer(user);
  if (q.status !== 'legal_approved') throw new Conflict('تصدر الترسية بعد اعتماد اللجنة والمراجعة القانونية');
  const bid = one('SELECT * FROM procurement_bids WHERE id=?', q.recommended_bid);
  await requireNoConflict(user, [providerFull(bid.provider_id)], 'إصدار أمر الشراء لهذا المورد');
  const el = providerEligibility(bid.provider_id);
  if (!el.eligible) throw new Conflict(`لا يمكن إصدار أمر الشراء: ${el.reasons.map((x) => x.ar).join('، ')}`);
  const pr = requestRow(q.request_id);
  let po;
  tx(() => {
    transition(q.status, 'awarded', RFQ_FLOW, RFQ_AR);
    po = issuePo(user, pr, { provider_id: bid.provider_id, amount: bid.total, method: 'rfq', rfq: q });
    run("UPDATE procurement_rfqs SET status='awarded', po_number=?, po_amount=?, contract_id=?, awarded_at=?, updated_at=? WHERE id=?", po.po_number, bid.total, po.contract_id, now(), now(), id);
  });
  audit(user, 'procurement.rfq.award', id, { bid: bid.id, po: po.po_number });
  for (const u of providerUserIds(bid.provider_id)) alert(u, { title: `تمت ترسية ${q.number} عليكم`, body: `أمر الشراء ${po.po_number}`, system: SYS, id });
  for (const b of bidsOf(q)) if (b.provider_id !== bid.provider_id) for (const u of providerUserIds(b.provider_id)) alert(u, { title: `صدرت نتيجة ${q.number}`, body: 'لم تتم الترسية عليكم — شكراً لمشاركتكم', system: SYS, id });
  notify(rfqRow(id), { providers: true });
  return po;
}
export function saveAnalysis(user, id, { narrative, mode, model }) {
  run('UPDATE procurement_rfqs SET analysis=?, analysis_mode=?, analysis_at=?, analysis_by=?, updated_at=? WHERE id=?', JSON.stringify({ text: narrative, model: model || null }), mode, now(), user.id, now(), id);
  audit(user, 'procurement.rfq.analysis', id, { mode });
  logAccess(user, SYS, 'rfq', id, 'analysis');
  notify(rfqRow(id));
}
export async function analysable(user, id) {
  let q = visibleRfq(user, id);
  if (await syncRecusals(q)) q = rfqRow(id);
  if (!OPENED.includes(q.status)) throw new Conflict('التحليل متاح بعد فتح العروض فقط');
  if (!isOfficer(user)) requireActiveMember(user, q);
  return q;
}

// ---------------- queues for the committee / legal / officer ----------------
export function rfqQueues(user) {
  if (!isStaff(user)) return [];
  const out = [];
  for (const q of all('SELECT * FROM procurement_rfqs WHERE status NOT IN (\'awarded\',\'cancelled\',\'draft\')')) {
    const m = memberOf(q, user.id); const active = m && !m.recused;
    const st = displayStatus(q);
    const push = (kind, ar, en) => out.push({ kind, ar, en, rfq: { id: q.id, number: q.number, title: q.title, status: st, closes_at: q.closes_at, is_demo: !!q.is_demo } });
    if (active && st === 'closed' && q.key1_by !== user.id) push('open_key', q.key1_by ? 'استخدم المفتاح الثاني لفتح العروض' : 'استخدم مفتاح الفتح الأول', q.key1_by ? 'Use the second opening key' : 'Use the first opening key');
    if (active && q.status === 'opened' && !evaluation(q).completion.find((c) => c.member?.id === user.id)?.done) push('score', 'أكمل التقييم الفني للعروض', 'Complete the technical scoring');
    if (active && q.status === 'recommended' && user.id !== q.recommended_by && !one('SELECT 1 FROM procurement_votes WHERE rfq_id=? AND member_id=? AND bid_id=?', q.id, user.id, q.recommended_bid)) push('vote', 'صوّت على توصية الترسية', 'Vote on the award recommendation');
    if (isLegal(user) && q.status === 'committee_approved') push('legal', 'مراجعة قانونية للترسية', 'Legal review of the award');
    if (isOfficer(user)) {
      if (q.status === 'opened' && evaluation(q).completion.every((c) => c.done) && evaluation(q).completion.length >= 2) push('finalize', 'اعتمد نتيجة التقييم', 'Finalise the evaluation');
      if (q.status === 'evaluated') push('recommend', 'أعدّ توصية الترسية', 'Prepare the award recommendation');
      if (q.status === 'legal_approved') push('award', 'أصدر أمر الشراء', 'Issue the purchase order');
    }
  }
  return out;
}

// ---------------- provider portal ----------------
function portalProviderOf(user) {
  if (!isExternal(user) || !hasCap(user, 'providers.portal')) throw new Forbidden('بوابة الموردين مخصصة لحسابات مقدمي الخدمات');
  const p = providerOfUser(user.id);
  if (!p) throw new NotFound('حسابك غير مرتبط بمورد مسجّل — تواصل مع قسم المشتريات');
  return p;
}
function providerStatusOf(q, bid, providerId) {
  if (q.status === 'cancelled') return 'cancelled';
  if (q.status === 'awarded') {
    const won = one('SELECT provider_id FROM procurement_bids WHERE id=?', q.recommended_bid)?.provider_id === providerId;
    return won ? 'awarded' : bid ? 'not_awarded' : 'closed';
  }
  if (q.status === 'open' && !isClosed(q)) return 'open';
  return bid ? 'under_evaluation' : 'closed';
}
function portalRow(q, p) {
  const bid = one('SELECT * FROM procurement_bids WHERE rfq_id=? AND provider_id=?', q.id, p.id);
  const st = providerStatusOf(q, bid?.status === 'submitted' ? bid : null, p.id);
  return {
    id: q.id, number: q.number, title: q.title, category: q.category, closes_at: q.closes_at, published_at: q.published_at, status: st, is_demo: !!q.is_demo,
    my_bid: bid ? { status: bid.status, total: bid.total, submitted_at: bid.submitted_at, withdrawn_at: bid.withdrawn_at, updated_at: bid.updated_at } : null,
    po_number: st === 'awarded' ? q.po_number : null,
  };
}
export function portalInvitations(user) {
  const p = portalProviderOf(user);
  return all("SELECT q.* FROM procurement_rfqs q JOIN procurement_invites i ON i.rfq_id=q.id WHERE i.provider_id=? AND q.status<>'draft' ORDER BY q.closes_at DESC", p.id).map((q) => portalRow(q, p));
}
function portalRfq(user, id) {
  const p = portalProviderOf(user);
  const q = one("SELECT q.* FROM procurement_rfqs q JOIN procurement_invites i ON i.rfq_id=q.id WHERE q.id=? AND i.provider_id=? AND q.status<>'draft'", id, p.id);
  if (!q) throw new NotFound('طلب العروض غير موجود أو غير متاح لك');
  return { p, q };
}
export function portalInvitation(user, id) {
  const { p, q } = portalRfq(user, id);
  const bid = one('SELECT * FROM procurement_bids WHERE rfq_id=? AND provider_id=?', q.id, p.id);
  const el = providerEligibility(p.id);
  return {
    ...portalRow(q, p),
    spec_html: q.spec_html, criteria: json(q.criteria, DEFAULT_CRITERIA).map((c) => ({ ar: c.ar, en: c.en, weight: c.weight })), tech_weight: q.tech_weight, min_tech: q.min_tech,
    items: itemsOf(q.request_id).map((i) => ({ id: i.id, line_no: i.line_no, description: i.description, qty: i.qty, unit: i.unit })),
    bid: bid ? { status: bid.status, lines: json(bid.lines, []), total: bid.total, delivery_days: bid.delivery_days, validity_days: bid.validity_days, technical_note: bid.technical_note, submitted_at: bid.submitted_at, withdrawn_at: bid.withdrawn_at } : null,
    can_bid: q.status === 'open' && !isClosed(q) && p.status === 'approved',
    provider_status: p.status, eligibility: el,
  };
}
export function submitBid(user, id, b) {
  const { p, q } = portalRfq(user, id);
  if (q.status !== 'open' || isClosed(q)) throw new Conflict('انتهى موعد تقديم العروض');
  if (p.status !== 'approved') throw new Conflict('لا يمكن تقديم عرض: تأهيل شركتكم غير ساري حالياً');
  const items = itemsOf(q.request_id);
  const lines = items.map((it) => {
    const l = (b.lines || []).find((x) => x.item_id === it.id);
    if (l && l.unit_price != null && (!(typeof l.unit_price === 'number') || !Number.isFinite(l.unit_price) || l.unit_price < 0 || l.unit_price > 1e8)) throw new BadRequest(`سعر البند ${it.line_no} غير صالح`);
    return { item_id: it.id, unit_price: l?.unit_price ?? null };
  });
  if ((b.lines || []).some((l) => !items.find((it) => it.id === l.item_id))) throw new BadRequest('بند غير موجود في طلب العروض');
  if (!lines.some((l) => l.unit_price != null)) throw new BadRequest('سعّر بنداً واحداً على الأقل');
  const total = round(lines.reduce((a, l) => a + (l.unit_price == null ? 0 : l.unit_price * items.find((it) => it.id === l.item_id).qty), 0), 2);
  const t = now();
  run(`INSERT INTO procurement_bids (id,rfq_id,provider_id,submitted_by,status,lines,total,delivery_days,validity_days,technical_note,submitted_at,updated_at) VALUES (?,?,?,?, 'submitted', ?,?,?,?,?,?,?)
    ON CONFLICT(rfq_id,provider_id) DO UPDATE SET submitted_by=excluded.submitted_by, status='submitted', lines=excluded.lines, total=excluded.total, delivery_days=excluded.delivery_days, validity_days=excluded.validity_days, technical_note=excluded.technical_note, submitted_at=excluded.submitted_at, withdrawn_at=NULL, updated_at=excluded.updated_at`,
  uid('bid_'), q.id, p.id, user.id, JSON.stringify(lines), total, b.delivery_days, b.validity_days, clean(b.technical_note, 3000) || null, t, t);
  audit(user, 'procurement.bid.submit', q.id, { provider: p.id });
  notify(q);
  return portalInvitation(user, id);
}
export function withdrawBid(user, id) {
  const { p, q } = portalRfq(user, id);
  if (q.status !== 'open' || isClosed(q)) throw new Conflict('لا يمكن سحب العرض بعد موعد الإغلاق');
  const r = run("UPDATE procurement_bids SET status='withdrawn', withdrawn_at=?, updated_at=? WHERE rfq_id=? AND provider_id=? AND status='submitted'", now(), now(), q.id, p.id);
  if (!r.changes) throw new Conflict('لا يوجد عرض مقدّم لسحبه');
  audit(user, 'procurement.bid.withdraw', q.id, { provider: p.id });
  notify(q);
  return portalInvitation(user, id);
}
export { CATEGORIES };
