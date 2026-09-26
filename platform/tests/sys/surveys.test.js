// Surveys: anonymity by design, author-only results, capability to author, external isolation.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { as, done } from './_stack.js';
import { segmentByDepartment, computeResults, MIN_GROUP } from '../../server/systems/surveys/analysis.js';

after(done);
let survey;

test('staff see surveys waiting for them and can answer exactly once', async () => {
  let ahmed; let p;
  for (const u of ['sara', 'fatima', 'omar', 'noura', 'reem', 'saeed', 'ahmed', 'hamad', 'majed', 'yousef', 'aisha']) {
    ahmed = await as(u); p = await ahmed.get('/api/sys/surveys/pending');
    assert.equal(p.status, 200);
    survey = p.data.pending.find((s) => s.anonymous) || p.data.pending[0];
    if (survey) { ahmed.who = u; break; }
  }
  assert.ok(survey, 'a seeded open survey is pending for some staff member');
  const full = (await ahmed.get(`/api/sys/surveys/surveys/${survey.id}`)).data;
  const qs = (full.questions || full.sections?.flatMap((s) => s.questions) || []);
  const answers = {};
  for (const q of qs) {
    if (['rating'].includes(q.type)) answers[q.id] = 4;
    else if (q.type === 'nps') answers[q.id] = 8;
    else if (q.type === 'yes_no' || q.type === 'yesno') answers[q.id] = true;
    else if (q.type === 'single') answers[q.id] = q.options?.[0]?.id;
    else if (q.type === 'multi' || q.type === 'multiple') answers[q.id] = [q.options?.[0]?.id];
    else answers[q.id] = 'ملاحظة تجريبية للاختبار';
  }
  const r = await ahmed.post(`/api/sys/surveys/surveys/${survey.id}/responses`, { answers });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const again = await ahmed.post(`/api/sys/surveys/surveys/${survey.id}/responses`, { answers });
  assert.ok([400, 409].includes(again.status), `second answer refused (${again.status})`);
});

test('results are for the author only and never expose who answered what', async () => {
  const outsider = await as('fatima');
  assert.ok([403, 404].includes((await outsider.get(`/api/sys/surveys/surveys/${survey.id}/results`)).status));
  const owner = survey.author_id || survey.owner_id;
  const authors = { u_hessa: 'hessa', u_salem: 'salem', u_latifa: 'latifa' };
  const author = await as(authors[owner] || 'hessa');
  const res = await author.get(`/api/sys/surveys/surveys/${survey.id}/results`);
  if (res.status === 200 && survey.anonymous !== false) {
    const txt = JSON.stringify(res.data);
    assert.doesNotMatch(txt, /"user_id"/, 'no respondent ids in anonymous results');
  }
});

test('creating surveys needs the surveys.author capability', async () => {
  const fatima = await as('fatima');
  assert.equal((await fatima.post('/api/sys/surveys/surveys', { title: 'استبيان غير مصرّح' })).status, 403);
  const salem = await as('salem');
  const ok = await salem.post('/api/sys/surveys/surveys', { title: 'نبض الفريق الشهري', template: 'pulse' });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
});

test('external identities cannot reach surveys; individual responses are AI-locked', async () => {
  assert.equal((await (await as('horizon')).get('/api/sys/surveys/pending')).status, 403);
  const domains = (await (await as('mariam')).get('/api/admin/domains')).data;
  const d = domains.find((x) => x.key === 'surveys.responses');
  assert.equal(d.ai_policy, 'off'); assert.equal(d.ai_locked, 1);
});

test('segments: an optional question never lets a small group be derived as overall minus the published groups', () => {
  // Department A: 6 responses, all answer q1 (3). Department B: 5 responses, only 4 answer q1 (5).
  const q1 = { id: 'q1', type: 'rating', text: 'optional rating', required: 0 };
  const q2 = { id: 'q2', type: 'rating', text: 'required rating', required: 1 };
  const responses = [...Array(6)].map((_, i) => ({ id: `a${i}`, dept_id: 'A' })).concat([...Array(5)].map((_, i) => ({ id: `b${i}`, dept_id: 'B' })));
  const answers = [];
  for (const r of responses) {
    answers.push({ response_id: r.id, question_id: 'q2', num: r.dept_id === 'A' ? 4 : 2 });
    if (r.dept_id === 'A') answers.push({ response_id: r.id, question_id: 'q1', num: 3 });
    else if (r.id !== 'b4') answers.push({ response_id: r.id, question_id: 'q1', num: 5 });
  }
  const seg = segmentByDepartment({ questions: [q1, q2], responses, answers, departments: [{ id: 'A', name_ar: 'أ' }, { id: 'B', name_ar: 'ب' }] });
  const A = seg.rows.find((r) => r.id === 'A'); const B = seg.rows.find((r) => r.id === 'B');
  assert.equal(B.metrics.q1, null, 'B has only 4 answers to q1');
  // overall (10 answers) − A (6 answers) would reveal the 4 answers of B
  assert.ok(!(seg.overall.q1 != null && A.metrics.q1 != null), `q1 must not be published for A alongside the overall (A=${A.metrics.q1}, overall=${seg.overall.q1})`);
  // the complete question is unaffected
  assert.equal(A.metrics.q2, 4); assert.equal(B.metrics.q2, 2);
  const res = computeResults({ questions: [q1, q2], sections: [], responses, answers, departments: [{ id: 'A' }, { id: 'B' }] });
  assert.equal(res.hidden, false); assert.ok(MIN_GROUP === 5);
});
