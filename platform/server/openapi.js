// OpenAPI 3.1 description of the Portal API, generated from the live express
// routes, the enterprise-system routers and the tool registry (whose JSON
// schemas are the same ones the server validates against). The spec is built
// per user: system routes and tools appear only for systems that user may
// open, so the documentation never reveals more than the account can reach.
import { publicTools } from './mcp/tools.js';
import { SYSTEMS, canAccess } from './systems/registry.js';

const VERSION = '1.0.0';

// Summaries for the core routes ("METHOD path" → [tag, English, Arabic]).
const DOCS = {
  'GET /api/health': ['Operations', 'Liveness probe', 'فحص أن الخدمة تعمل'],
  'GET /api/ready': ['Operations', 'Readiness probe: database, migrations; reports Vault and model status', 'جاهزية الخدمة'],
  'POST /api/auth/login': ['Identity', 'Sign in; sets the HttpOnly session cookie', 'تسجيل الدخول'],
  'POST /api/auth/logout': ['Identity', 'Sign out and revoke the session', 'تسجيل الخروج'],
  'GET /api/identity/public-key': ['Identity', 'Ed25519 public key that verifies SSO assertions (PEM)', 'المفتاح العام للدخول الموحد'],
  'GET /api/identity/sso/authorize': ['Identity', 'SSO into Vault: redirects with a signed, single-use assertion', 'الدخول الموحد إلى Vault'],
  'GET /api/me': ['Identity', 'Current user, role, capabilities and preferences', 'المستخدم الحالي'],
  'GET /api/me/tokens': ['Identity', 'List your personal access tokens (values are never returned)', 'رموز الوصول الشخصية'],
  'POST /api/me/tokens': ['Identity', 'Create a personal access token (shown once) for MCP / API clients', 'إنشاء رمز وصول'],
  'DELETE /api/me/tokens/{id}': ['Identity', 'Revoke a personal access token', 'إلغاء رمز وصول'],
  'GET /api/stream': ['Realtime', 'Server-Sent Events: changes that affect you (tasks, projects, alerts, allocations…)', 'البث الحي للتغييرات'],
  'GET /api/summary': ['Work', 'Daily summary', 'الملخص اليومي'],
  'GET /api/projects': ['Work', 'Projects visible to you', 'المشاريع'],
  'GET /api/projects/{id}': ['Work', 'One project with tasks and progress', 'تفاصيل مشروع'],
  'GET /api/tasks': ['Work', 'Tasks visible to you (?mine=1, ?status=…)', 'المهام'],
  'GET /api/events': ['Work', 'Upcoming appointments', 'المواعيد'],
  'GET /api/alerts': ['Work', 'Your alerts', 'التنبيهات'],
  'POST /api/alerts/{id}/read': ['Work', 'Mark an alert as read', 'تعليم التنبيه كمقروء'],
  'GET /api/search': ['Work', 'Search everything you may access', 'البحث'],
  'GET /api/kpis': ['ADAA I', 'Monitoring indicators within your scope (outside-Vault sources)', 'مؤشرات أداء'],
  'GET /api/portfolio': ['Strategic portfolio', 'Strategic projects: progress, budget, allocations, milestones', 'المحفظة الاستراتيجية'],
  'GET /api/assignments': ['Strategic portfolio', 'Work assigned to you by others (tasks, allocations)', 'ما أُسند إليّ'],
  'GET /api/allocations': ['Strategic portfolio', 'Resource allocations you may see', 'تخصيص الموارد'],
  'GET /api/capacity': ['Strategic portfolio', 'Your allocated capacity', 'السعة المخصصة'],
  'GET /api/capacity/team': ['Strategic portfolio', "Your team's allocated capacity (managers)", 'سعة الفريق'],
  'POST /api/tools/{name}': ['Tools', 'Execute any tool by name (see the Tools section for each input schema)', 'تنفيذ أداة'],
  'POST /api/confirmations/{id}': ['Tools', 'Accept or reject a pending confirmation ({accept: true|false})', 'تأكيد إجراء معلّق'],
  'POST /api/actions/{id}/undo': ['Tools', 'Undo a reversible action (id = actionId from a tool result)', 'التراجع عن إجراء'],
  'POST /api/chat': ['Assistant', 'Send a message to Ask AI; streams NDJSON progress events ending with stage=final', 'محادثة المساعد'],
  'GET /api/chat/result/{requestId}': ['Assistant', 'Result of a chat request by its idempotency key', 'نتيجة طلب محادثة'],
  'GET /api/conversations': ['Assistant', 'Your conversations', 'المحادثات'],
  'GET /api/conversations/{id}': ['Assistant', 'One conversation with its messages', 'محادثة'],
  'POST /api/uploads': ['Assistant', 'Upload a file for analysis in chat (outside Vault; raw body)', 'رفع ملف للتحليل'],
  'POST /api/su/upload': ['Smart Uploader', 'Deliver a file into Vault (inbound only; returns an opaque receipt)', 'إرسال ملف إلى Vault'],
  'POST /api/voice/transcribe': ['Assistant', 'Speech to text (audio/* body)', 'تحويل الصوت إلى نص'],
  'GET /api/documents': ['Documents', 'Documents you can access', 'المستندات'],
  'GET /api/documents/{id}/export.pdf': ['Documents', 'Export a document as PDF', 'تصدير PDF'],
  'GET /api/documents/{id}/export.docx': ['Documents', 'Export a document as Word', 'تصدير Word'],
  'GET /api/dashboard': ['Dashboard', 'Your dashboard layout', 'لوحة المعلومات'],
  'GET /api/office/agents': ['Agents Office', 'Your office agents', 'وكلاء المكتب'],
  'POST /api/office/runs/{id}/approve': ['Agents Office', 'Approve prepared work (interactive session only — not with tokens)', 'اعتماد عمل الوكيل'],
  'GET /api/systems': ['Enterprise systems', 'Systems you may open, with data classification and AI policy', 'الأنظمة المتاحة'],
  'GET /api/workspace': ['Enterprise systems', 'Home workspace cards from your systems', 'بطاقات مساحة العمل'],
  'PUT /api/systems/{key}/prefs': ['Enterprise systems', 'Pin a system / opt in to assistant access (where the policy allows)', 'تفضيلات النظام'],
  'GET /api/admin/caps': ['Administration', 'Capability catalogue and grants', 'الصلاحيات'],
  'PUT /api/admin/caps': ['Administration', 'Grant or revoke a capability (requires confirm: true; audited)', 'منح/سحب صلاحية'],
  'PUT /api/admin/domains/{key}': ['Administration', 'Change a data domain AI policy (requires confirm: true; locked domains refuse)', 'سياسة بيانات النطاق'],
  'GET /api/openapi.json': ['Operations', 'This OpenAPI document, generated for your account', 'هذا التوثيق'],
  'POST /mcp': ['MCP', 'Model Context Protocol endpoint (JSON-RPC 2.0 over HTTP): initialize, tools/list, tools/call', 'خادم MCP'],
};

const toOpenApiPath = (p) => p.replace(/:([A-Za-z_]+)/g, '{$1}');
const paramsOf = (p) => [...p.matchAll(/\{([A-Za-z_]+)\}/g)].map((m) => ({ name: m[1], in: 'path', required: true, schema: { type: 'string' } }));
const tagOf = (p) => {
  const seg = p.split('/').filter(Boolean);
  if (seg[0] === 'mcp') return 'MCP';
  const s = seg[1] || 'api';
  return { portfolio: 'Strategic portfolio', allocations: 'Strategic portfolio', assignments: 'Strategic portfolio', capacity: 'Strategic portfolio', 'openapi.json': 'Operations', office: 'Agents Office', admin: 'Administration', game: 'Excellence', documents: 'Documents', dashboard: 'Dashboard', skills: 'Assistant', catalog: 'Assistant', voice: 'Assistant', su: 'Smart Uploader', users: 'Identity', departments: 'Identity' }[s] || s[0].toUpperCase() + s.slice(1);
};
const opId = (method, p) => (method + p.replace(/\{([^}]+)\}/g, 'By_$1').replace(/[^A-Za-z0-9]+/g, '_')).replace(/_+$/, '');

function routesOf(stack, prefix = '') {
  const out = [];
  for (const l of stack || []) {
    if (!l.route) continue;
    const paths = Array.isArray(l.route.path) ? l.route.path : [l.route.path];
    for (const rp of paths) for (const m of Object.keys(l.route.methods)) if (m !== '_all') out.push({ method: m, path: toOpenApiPath(prefix + (rp === '/' ? '' : rp)) });
  }
  return out;
}

const ERR = { $ref: '#/components/responses/Error' };
function operation(method, path, { tag, summary, description, requestBody, extra = {} } = {}) {
  const d = DOCS[`${method.toUpperCase()} ${path}`];
  const open = ['/api/health', '/api/ready', '/api/auth/login', '/api/identity/public-key'].includes(path);
  const op = {
    tags: [tag || d?.[0] || tagOf(path)],
    summary: summary || d?.[1] || `${method.toUpperCase()} ${path}`,
    ...(description || d?.[2] ? { description: description || d[2] } : {}),
    operationId: opId(method, path),
    parameters: paramsOf(path),
    ...(requestBody ? { requestBody } : ['post', 'put', 'patch'].includes(method) ? { requestBody: { required: false, content: { 'application/json': { schema: { type: 'object' } } } } } : {}),
    responses: { 200: { description: 'OK', content: { 'application/json': { schema: {} } } }, 400: ERR, 401: ERR, 403: ERR, 404: ERR, 428: ERR, 429: ERR },
    ...(open ? { security: [] } : {}),
    ...extra,
  };
  if (!op.parameters.length) delete op.parameters;
  return op;
}

export function buildSpec({ app, systemRouters, user, serverUrl }) {
  const paths = {};
  const add = (method, path, op) => { (paths[path] ||= {})[method] = op; };

  // 1) core routes, straight from express
  for (const r of routesOf(app.router.stack)) {
    if (r.path === '/api/tools/{name}' || (r.path === '/mcp' && r.method === 'get') || !r.path.startsWith('/api') && r.path !== '/mcp') continue; // expanded / pages, not API
    if (r.path.startsWith('/api/admin') && !user.is_admin) continue;
    if (r.path === '/api/chat') {
      add('post', r.path, operation('post', r.path, {
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ChatRequest' } } } },
        extra: { responses: { 200: { description: 'NDJSON stream of progress events; the last has stage = "final"', content: { 'application/x-ndjson': { schema: { $ref: '#/components/schemas/ChatEvent' } } } }, 429: ERR } },
      }));
      continue;
    }
    if (r.path === '/mcp') {
      add('post', r.path, operation('post', r.path, {
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/JsonRpcRequest' } } } },
        extra: { security: [{ bearerToken: [] }], description: 'Use a personal access token. Every tools/call runs with the token owner’s permissions, validation, confirmation and de-duplication. No tool reaches Vault.' },
      }));
      continue;
    }
    add(r.method, r.path, operation(r.method, r.path));
  }

  // 2) enterprise systems the user may open
  const systems = [...SYSTEMS.values()].filter((s) => canAccess(user, s.key));
  for (const s of systems) {
    const router = systemRouters?.get(s.key);
    for (const r of routesOf(router?.stack, `/api/sys/${s.key}`)) {
      add(r.method, r.path, operation(r.method, r.path, { tag: `System: ${s.name_en}`, summary: `${s.name_en} — ${r.method.toUpperCase()} ${r.path.replace(`/api/sys/${s.key}`, '') || '/'}`, description: s.description_en }));
    }
  }

  // 3) tools: one documented operation per tool, with the validated input schema
  const allowedSystems = new Set(systems.map((s) => s.key));
  const tools = publicTools().filter((t) => !t.system || allowedSystems.has(t.system));
  for (const t of tools) {
    const path = `/api/tools/${t.name}`;
    add('post', path, {
      tags: [t.system ? `Tools: ${SYSTEMS.get(t.system)?.name_en || t.system}` : 'Tools'],
      summary: t.name,
      description: `${t.description}${t.destructive ? '\n\n**Requires confirmation**: the first call returns `needs_confirmation`; accept it with `POST /api/confirmations/{id}`.' : ''}${t.mutates ? '\n\nMutating: pass a unique `requestId` — retries with the same id are de-duplicated.' : ''}`,
      operationId: `tool_${t.name}`,
      'x-mutates': !!t.mutates, 'x-destructive': t.destructive || false, ...(t.domain ? { 'x-data-domain': t.domain } : {}), ...(t.system ? { 'x-system': t.system } : {}),
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['input'], properties: { input: t.input_schema || { type: 'object' }, requestId: { type: 'string', description: 'Idempotency key (recommended for mutating tools)' } } } } } },
      responses: { 200: { description: 'Result', content: { 'application/json': { schema: { $ref: '#/components/schemas/ToolResult' } } } }, 400: ERR, 403: ERR, 404: ERR, 429: ERR },
    });
  }

  const tagNames = [...new Set(Object.values(paths).flatMap((ops) => Object.values(ops).flatMap((o) => o.tags)))];
  return {
    openapi: '3.1.0',
    info: {
      title: 'Smart Work Platform API',
      version: VERSION,
      description: [
        'Portal API (everything outside Vault). Every request runs with the caller’s own permissions; the server — not the client — enforces roles, capabilities, data-domain AI policy and confirmation of sensitive actions.',
        '',
        '**Authentication**: browser session cookie (`swp_session`, HttpOnly) or `Authorization: Bearer swp_…` personal access token (create one under Administration → MCP, or `POST /api/me/tokens`).',
        '**CSRF**: cookie-authenticated `POST/PUT/DELETE` must send `X-Requested-With: swp` and, when present, a same-origin `Origin`. Bearer-token requests are exempt.',
        '**External accounts** (external auditors, service providers) can call only their portal systems (`/api/sys/<key>` for systems with an external portal), `/api/me`, `/api/systems`, `/api/alerts`, `/api/stream`. No Ask AI, MCP or Vault.',
        '**Vault** (FS, Marsad) has no read API here by design: data flows into Vault only (`/api/su/upload` returns an opaque receipt).',
        '**Rate limits**: `429` with `Retry-After`; per IP on `/api`, per user on the assistant and voice.',
        '**Errors**: `{ error, message }` — `message` is user-facing Arabic text. `428 confirmation_required` means resend with `confirm: true` after the user agreed.',
        '**Tools**: the same tools power the UI, Ask AI and MCP. Each is documented below with the exact JSON schema the server validates.',
      ].join('\n'),
    },
    servers: [{ url: serverUrl }],
    security: [{ sessionCookie: [], csrfHeader: [] }, { bearerToken: [] }],
    tags: tagNames.map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: {
        sessionCookie: { type: 'apiKey', in: 'cookie', name: 'swp_session' },
        csrfHeader: { type: 'apiKey', in: 'header', name: 'X-Requested-With', description: 'Must equal `swp` on cookie-authenticated mutations' },
        bearerToken: { type: 'http', scheme: 'bearer', bearerFormat: 'swp_…', description: 'Personal access token; acts with its owner’s permissions' },
      },
      responses: { Error: { description: 'Error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } } },
      schemas: {
        Error: { type: 'object', properties: { error: { type: 'string', examples: ['forbidden', 'not_found', 'bad_input', 'confirmation_required', 'rate_limited'] }, message: { type: 'string' } }, required: ['error'] },
        ToolResult: { type: 'object', properties: {
          status: { type: 'string', enum: ['ok', 'error', 'needs_confirmation'] }, result: {}, error: { type: 'string', description: 'User-facing message' },
          code: { type: 'string', examples: ['forbidden', 'not_found', 'bad_input', 'ai_policy', 'unknown_tool'] },
          actionId: { type: ['string', 'null'] }, undoable: { type: 'boolean', description: 'When true: POST /api/actions/{actionId}/undo' }, replayed: { type: 'boolean', description: 'Same requestId seen before; the earlier result is returned' },
          confirmation: { type: 'object', properties: { id: { type: 'string' }, summary: { type: 'string' }, reason: { type: 'string' }, tool: { type: 'string' } } } }, required: ['status'] },
        ChatRequest: { type: 'object', required: ['message'], properties: { message: { type: 'string' }, requestId: { type: 'string', description: 'Idempotency key' }, conversationId: { type: ['string', 'null'] }, voice: { type: 'boolean' }, ui: { type: 'object', description: 'Screen context (view, selected project, open document)' } } },
        ChatEvent: { type: 'object', properties: { stage: { type: 'string', examples: ['planning', 'executing', 'step', 'final'] }, status: { type: 'string' }, text: { type: 'string' }, conversationId: { type: 'string' } } },
        JsonRpcRequest: { type: 'object', required: ['jsonrpc', 'method'], properties: { jsonrpc: { const: '2.0' }, id: { type: ['string', 'number'] }, method: { type: 'string', examples: ['initialize', 'tools/list', 'tools/call'] }, params: { type: 'object' } } },
      },
    },
  };
}
