// Ideas — إدارة الأفكار.
// Idea bank with challenges (campaigns), votes, comments and follows; a committee
// pipeline (submitted → screening → evaluation → approved | needs info | rejected
// → in implementation → implemented) with blind weighted scoring and strict
// segregation of duties; implementation through platform projects; anonymous
// submission (hidden from peers, visible to the committee with an access log).
// Domain logic: ./ideas/service.js · seed: ./ideas/seed.js · Ask AI: ./ideas/assistant.js
import { defineSystem } from './registry.js';
import * as K from './kit.js';
import * as S from './ideas/service.js';
import { seed } from './ideas/seed.js';
import { tools, intents, assist } from './ideas/assistant.js';

const { wrap } = K;

function routes(r) {
  // overview (hero, stats, trending, next action)
  r.get('/', wrap((req) => S.overview(req.user)));
  r.get('/meta', wrap(async (req) => ({ categories: S.CATEGORIES, statuses: S.STATUS, weights: S.WEIGHTS, criteria: S.CRITERIA_LABELS, min_scores: S.MIN_SCORES, committee: S.isCommittee(req.user), objectives: await S.objectives(req.user) })));
  r.get('/objectives', wrap(async (req) => { const items = await S.objectives(req.user); return { available: items.length > 0, items }; }));
  // ideas
  r.get('/ideas', wrap((req) => S.listIdeas(req.user, { q: req.query.q, category: req.query.category, status: req.query.status, campaign: req.query.campaign, department: req.query.department, sort: req.query.sort, limit: req.query.limit })));
  r.get('/mine', wrap((req) => S.myIdeas(req.user)));
  r.get('/similar', wrap((req) => S.similarIdeas(req.user, String(req.query.text || '').slice(0, 600), { exclude: req.query.exclude })));
  r.post('/ideas', wrap((req) => S.createIdea(req.user, req.body)));
  r.get('/ideas/:id', wrap((req) => S.detail(req.user, req.params.id)));
  r.put('/ideas/:id', wrap((req) => S.updateIdea(req.user, req.params.id, req.body)));
  r.delete('/ideas/:id', wrap((req) => S.deleteDraft(req.user, req.params.id, req.body || {})));
  r.post('/ideas/:id/submit', wrap((req) => S.submitIdea(req.user, req.params.id, req.body)));
  r.post('/ideas/:id/withdraw', wrap((req) => S.withdrawIdea(req.user, req.params.id, req.body)));
  // committee workflow
  r.post('/ideas/:id/transition', wrap((req) => S.transitionIdea(req.user, req.params.id, req.body)));
  r.put('/ideas/:id/score', wrap((req) => S.scoreIdea(req.user, req.params.id, req.body)));
  r.post('/ideas/:id/assist', wrap((req) => assist(req.user, req.params.id)));
  r.post('/ideas/:id/implement', wrap((req) => S.implementIdea(req.user, req.params.id, req.body)));
  r.post('/ideas/:id/complete', wrap((req) => S.completeIdea(req.user, req.params.id, req.body)));
  // social
  r.post('/ideas/:id/vote', wrap((req) => S.vote(req.user, req.params.id, req.body)));
  r.post('/ideas/:id/follow', wrap((req) => S.follow(req.user, req.params.id, req.body)));
  r.post('/ideas/:id/comments', wrap((req) => S.addComment(req.user, req.params.id, req.body)));
  r.delete('/ideas/:id/comments/:cid', wrap((req) => S.deleteComment(req.user, req.params.id, req.params.cid, req.body || {})));
  r.post('/ideas/:id/comments/:cid/hide', wrap((req) => S.hideComment(req.user, req.params.id, req.params.cid, req.body)));
  // challenges
  r.get('/campaigns', wrap((req) => S.listCampaigns(req.user)));
  r.get('/campaigns/:id', wrap((req) => S.getCampaign(req.user, req.params.id)));
  r.post('/campaigns', wrap((req) => S.createCampaign(req.user, req.body)));
  r.put('/campaigns/:id', wrap((req) => S.updateCampaign(req.user, req.params.id, req.body)));
  // committee queue & scoring matrix
  r.get('/committee', wrap((req) => S.committeeQueue(req.user)));
}

defineSystem({
  key: 'ideas',
  name_ar: 'إدارة الأفكار', name_en: 'Ideas',
  description_ar: 'اقتراح الأفكار والتصويت والتقييم من اللجنة وتحويلها إلى مشاريع',
  description_en: 'Submit ideas, vote, committee evaluation and turning ideas into projects',
  icon: 'lightbulb', category: 'people',
  access: (u) => K.isStaff(u),
  defaultPinned: () => true,
  caps: [
    { cap: 'ideas.committee', ar: 'لجنة تقييم الأفكار', en: 'Ideas evaluation committee' },
  ],
  domains: [
    { key: 'ideas.pool', name_ar: 'بنك الأفكار', name_en: 'Ideas pool', classification: 'internal', ai: 'allowed' },
  ],
  schema: S.schema,
  seed,
  routes,
  tools,
  intents,
  agent: {
    name_ar: 'مساعد بنك الأفكار', name_en: 'Ideas assistant',
    description_ar: 'يحفظ فكرتك كمسودة أو يرسلها للجنة، ويعرض أبرز الأفكار وحالة أفكارك والتحديات المفتوحة',
    description_en: 'Saves or submits your idea, shows top ideas, your ideas and open challenges',
    instructions: 'نفّذ ضمن صلاحيات المستخدم في نظام الأفكار فقط. لا تخترع أرقام الأثر؛ إن لم يذكر المستخدم المشكلة والحل فاحفظ الفكرة كمسودة. لا تكشف هوية مقدّمي الأفكار المخفية.',
  },
  workspace: (u) => S.workspace(u),
  gameRules: S.GAME_RULES,
  gameEvents: (userId) => S.gameEvents(userId),
});
