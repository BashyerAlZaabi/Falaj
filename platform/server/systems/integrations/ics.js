// Personal calendar feed — pure functions (no database access) so the masking
// and RFC 5545 formatting can be tested in isolation.
//
//   feedItems({ meetings, events, tasks, lang, baseUrl, options, now }) → items
//   buildIcs({ name, description, items, now })                          → text/calendar
//
// Confidential meetings are reduced to a busy block: no title, location,
// description, attendees or link ever leave the platform for them.
import crypto from 'node:crypto';

const CRLF = '\r\n';
const pad = (n) => String(n).padStart(2, '0');

// UTC date-time: 20260925T070000Z
export function utcStamp(value) {
  const d = new Date(value);
  if (Number.isNaN(+d)) return null;
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}
// DATE value: 20260925
export const dateValue = (ymd) => String(ymd).slice(0, 10).replace(/-/g, '');
const nextDay = (ymd) => { const d = new Date(`${String(ymd).slice(0, 10)}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };

// TEXT escaping (RFC 5545 §3.3.11): backslash, semicolon, comma, newline.
export function escapeText(s) {
  return String(s ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

// Content lines are folded at 75 octets without splitting a UTF-8 sequence
// (continuation lines start with one space, which counts toward the limit).
export function foldLine(line) {
  const out = []; let cur = ''; let bytes = 0; let limit = 75;
  for (const ch of line) {
    const b = Buffer.byteLength(ch, 'utf8');
    if (bytes + b > limit) { out.push(cur); cur = ' '; bytes = 1; limit = 75; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.join(CRLF);
}

const stableUid = (kind, id) => `${kind}-${crypto.createHash('sha256').update(`${kind}:${id}`).digest('hex').slice(0, 20)}@swp.calendar`;

// Anything the meetings system marks as confidential/restricted is masked.
export function isConfidentialMeeting(m) {
  if (!m) return false;
  const cls = String(m.classification || m.confidentiality || m.level || '').toLowerCase();
  return !!(m.confidential || m.is_confidential || m.masked || m.secret || m.restricted
    || ['confidential', 'restricted', 'secret'].includes(cls)
    || m.domain === 'meetings.confidential' || m.visibility === 'confidential' || m.visibility === 'restricted');
}

function meetingTimes(m) {
  let start = m.starts_at || m.start_at || m.start || m.starts || m.scheduled_at || m.datetime || null;
  let end = m.ends_at || m.end_at || m.end || m.ends || null;
  // date + time pairs are local UAE time (UTC+4)
  if (!start && m.date && (m.start_time || m.time)) start = `${String(m.date).slice(0, 10)}T${String(m.start_time || m.time).slice(0, 5)}:00+04:00`;
  if (!end && m.date && m.end_time) end = `${String(m.date).slice(0, 10)}T${String(m.end_time).slice(0, 5)}:00+04:00`;
  if (!end && start && Number.isFinite(+m.duration_min)) end = new Date(Date.parse(start) + +m.duration_min * 60e3).toISOString();
  return { start, end };
}

const T = {
  busy: ['مشغول — اجتماع سري', 'Busy — confidential meeting'],
  task: ['مهمة', 'Task'],
  meeting: ['اجتماع', 'Meeting'],
  open: ['افتح في منصة العمل الذكية', 'Open in the Smart Work Platform'],
  priority: ['الأولوية', 'Priority'],
  pr: { urgent: ['عاجلة', 'Urgent'], high: ['عالية', 'High'], medium: ['متوسطة', 'Medium'], low: ['منخفضة', 'Low'] },
};

// Normalise meetings (from the meetings system), platform events and my open
// tasks into feed items. `options` toggles each source.
export function feedItems({ meetings = [], events = [], tasks = [], lang = 'ar', baseUrl = '', options = {}, now = new Date() } = {}) {
  const tr = (pair) => (lang === 'en' ? pair[1] : pair[0]);
  const opt = { meetings: options.include_meetings !== false, events: options.include_events !== false, tasks: options.include_tasks !== false };
  const items = [];
  if (opt.meetings) {
    for (const m of meetings) {
      const { start, end } = meetingTimes(m);
      if (!start || Number.isNaN(Date.parse(start)) || !m.id) continue;
      if (isConfidentialMeeting(m)) {
        items.push({ uid: stableUid('mt', m.id), kind: 'meeting', start: new Date(start).toISOString(), end: end && !Number.isNaN(Date.parse(end)) ? new Date(end).toISOString() : null,
          summary: tr(T.busy), location: null, description: null, url: null, classification: 'CONFIDENTIAL', transp: 'OPAQUE', masked: true });
        continue;
      }
      const title = m.title || m.title_ar || m.subject || tr(T.meeting);
      const href = baseUrl ? `${baseUrl}/#/sys/meetings/m/${encodeURIComponent(m.id)}` : null;
      items.push({ uid: stableUid('mt', m.id), kind: 'meeting', start: new Date(start).toISOString(), end: end && !Number.isNaN(Date.parse(end)) ? new Date(end).toISOString() : null,
        summary: title, location: m.location || m.room || (m.online ? 'Online' : null), description: [m.agenda_summary || null, href ? `${tr(T.open)}: ${href}` : null].filter(Boolean).join('\n') || null,
        url: href, classification: 'PRIVATE', transp: 'OPAQUE', masked: false });
    }
  }
  if (opt.events) {
    for (const e of events) {
      if (!e.starts_at || Number.isNaN(Date.parse(e.starts_at))) continue;
      items.push({ uid: stableUid('ev', e.id), kind: 'event', start: new Date(e.starts_at).toISOString(), end: e.ends_at && !Number.isNaN(Date.parse(e.ends_at)) ? new Date(e.ends_at).toISOString() : null,
        summary: e.title, location: e.location || null, description: baseUrl ? `${tr(T.open)}: ${baseUrl}/#/home` : null, url: null, classification: 'PRIVATE', transp: 'OPAQUE', masked: false });
    }
  }
  if (opt.tasks) {
    const from = new Date(now); from.setUTCDate(from.getUTCDate() - 7);
    const fromYmd = from.toISOString().slice(0, 10);
    for (const t of tasks) {
      if (!t.due_date || t.status === 'done' || t.deleted_at || String(t.due_date).slice(0, 10) < fromYmd) continue;
      const p = T.pr[t.priority];
      items.push({ uid: stableUid('tk', t.id), kind: 'task', allDay: true, date: String(t.due_date).slice(0, 10),
        summary: `${tr(T.task)}: ${t.title}`, location: null,
        description: [p ? `${tr(T.priority)}: ${tr(p)}` : null, baseUrl ? `${tr(T.open)}: ${baseUrl}/#/tasks` : null].filter(Boolean).join('\n') || null,
        url: null, classification: 'PRIVATE', transp: 'TRANSPARENT', masked: false });
    }
  }
  return items.sort((a, b) => String(a.start || `${a.date}T00:00:00Z`).localeCompare(String(b.start || `${b.date}T00:00:00Z`)));
}

// RFC 5545 VCALENDAR (METHOD:PUBLISH), CRLF line endings, folded lines.
export function buildIcs({ name, description, items = [], now = new Date() } = {}) {
  const stamp = utcStamp(now);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Smart Work Platform//Integration Center//AR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(name || 'Smart Work Platform')}`];
  if (description) lines.push(`X-WR-CALDESC:${escapeText(description)}`);
  lines.push('REFRESH-INTERVAL;VALUE=DURATION:PT30M', 'X-PUBLISHED-TTL:PT30M');
  for (const it of items) {
    const ev = ['BEGIN:VEVENT', `UID:${it.uid}`, `DTSTAMP:${stamp}`];
    if (it.allDay) {
      ev.push(`DTSTART;VALUE=DATE:${dateValue(it.date)}`, `DTEND;VALUE=DATE:${dateValue(nextDay(it.date))}`);
    } else {
      const s = utcStamp(it.start); if (!s) continue;
      ev.push(`DTSTART:${s}`);
      const e = it.end ? utcStamp(it.end) : null;
      if (e && e > s) ev.push(`DTEND:${e}`); else ev.push('DURATION:PT30M');
    }
    ev.push(`SUMMARY:${escapeText(it.summary)}`);
    if (it.location) ev.push(`LOCATION:${escapeText(it.location)}`);
    if (it.description) ev.push(`DESCRIPTION:${escapeText(it.description)}`);
    if (it.url) ev.push(`URL:${String(it.url).replace(/[\r\n]/g, '')}`);
    ev.push(`CLASS:${it.classification || 'PRIVATE'}`, `TRANSP:${it.transp || 'OPAQUE'}`, 'STATUS:CONFIRMED', 'END:VEVENT');
    lines.push(...ev);
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join(CRLF) + CRLF;
}
