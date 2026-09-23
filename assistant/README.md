# 🤖 المساعد الذكي المتصل بـ MCP — Claude + MCP Assistant

مساعد ذكي مبني على **Claude** يربط تطبيقات الشركة ببعضها عبر **MCP** (Model Context Protocol):
يسأل كل تطبيق متصل ويجمع الجواب في مكان واحد. نفس الكود يشتغل بأكثر من «ملف تعريف» (Profile):

| الملف | لمن | خوادم MCP |
|---|---|---|
| `mcp.audit.json` | **شركات التدقيق** (مثل EY وغيرها) | منصة المهام · التحليلات · الموظفين والوقت والاستقلالية |
| `mcp.config.json` | تطبيق فلج الزراعي | خادم المزرعة |

```
 صفحة المحادثة /chat/  ─┐
 تطبيقك (HTTP API)     ─┼─▶  خادم المساعد  ──Claude API──▶  Claude
 الطرفية (npm run chat) ─┘        │
                                   └── MCP hub ──▶ engagements  (منصة المهام)
                                                ──▶ analytics    (تحليل البيانات)
                                                ──▶ people       (الموظفين والوقت والاستقلالية)
                                                ──▶ أي خادم MCP آخر: Outlook/Gmail، SharePoint/Drive، ERP، Jira…
```

## 🏢 مساعد شركة التدقيق

```bash
cd assistant
npm install
cp .env.example .env        # ضع ANTHROPIC_API_KEY
npm run start:audit         # افتح http://localhost:8787/chat/
```

أسئلة يقدر يجاوبها بجمع أكثر من تطبيق:
- «أعطني ملخص حالة ENG-001»: يجمع مواعيد التسليم وطلبات PBC المتأخرة والملاحظات المفتوحة والساعات المستخدمة وفحص الاستقلالية.
- «شغّل اختبارات القيود اليومية ولخّص أخطرها» (ISA 240): مبالغ مدوّرة، أو أقل بقليل من حدّ الاعتماد، أو نهاية الفترة، أو عطلة نهاية الأسبوع، أو قيود يدوية من الإدارة العليا، أو مستخدم غير متوقع، أو مدين للإيرادات.
- «قارن الأخطاء غير المعدّلة بالأهمية النسبية» (ISA 450 / 320).
- «هل يوجد تعارض استقلالية في فرق المهام؟»
- «سجّل ٦ ساعات لفاطمة على ENG-001» أو «علّم PBC-103 كمستلم»: هذه كتابة، ولا تتم إلا بطلب صريح.

### أدوات تطبيقات التدقيق (16 أداة)

| الخادم | يمثّل | الأدوات |
|---|---|---|
| `engagements` | منصة إدارة المهام | `list_engagements` · `get_engagement` · `list_pbc_requests` · `update_pbc_request` ✍️ · `list_findings` · `log_finding` ✍️ · `misstatements_vs_materiality` |
| `analytics` | منصة تحليل البيانات | `get_trial_balance` · `analytical_review` · `journal_entry_testing` · `calculate_materiality` · `select_sample` |
| `people` | الموارد البشرية / الوقت والفوترة / الاستقلالية | `list_staff` · `engagement_hours` · `log_time` ✍️ · `independence_check` |

✍️ = أداة تكتب في أنظمة الشركة.

البيانات حالياً **تجريبية ولعملاء وهميين** (`mcp/audit/data.js`). لربط أنظمة شركتك الحقيقية:
1. استبدل الدوال في `mcp/audit/*-server.js` باستدعاءات لواجهات أنظمتكم (API أو قاعدة بيانات أو ملفات ERP المستخرجة)، مع الإبقاء على أسماء الأدوات ومدخلاتها.
2. أو أضف خوادم MCP جاهزة للأنظمة التي عندكم (البريد، والمستندات، والتقويم، وإدارة المهام) في `mcp.audit.json`.

### 🔐 الأمان والامتثال
- **سجل تدقيق:** ضع `TOOL_LOG_FILE=./tool-calls.jsonl` ليُسجَّل كل استدعاء أداة بوقته ومدخلاته (من دون المخرجات).
- مفتاح Claude وأسرار الأنظمة تبقى على الخادم وفي `.env`، ولا تصل للمتصفح.
- أدوات الكتابة لا تعمل إلا بطلب صريح من المستخدم، والمساعد لا يعطي رأياً تدقيقياً ولا يوقّع على شيء.
- قبل التشغيل على بيانات عملاء حقيقية: أضف تسجيل دخول (SSO) أمام الخادم، وقيّد `ALLOWED_ORIGINS`، وراجع سياسة الشركة في مشاركة البيانات مع مزوّدي الذكاء الاصطناعي.

---

# 🌱 مساعد فلج (الملف الافتراضي)

## 🚀 التشغيل السريع

يحتاج Node.js 22.9 أو أحدث.

```bash
cd assistant
npm install
cp .env.example .env        # ثم ضع مفتاحك: ANTHROPIC_API_KEY=sk-ant-...
npm start                   # المساعد + التطبيق على http://localhost:8787/app/
```

ثم فعّل المساعد في التطبيق من `app/js/config.js`:

```js
ASSISTANT_URL: 'http://localhost:8787',
```

افتح التطبيق ← تبويب ✨ المساعد ← واسأل: «أي منطقة تحتاج ريّ؟» أو «اسقِ المنطقة ٤ عشرين دقيقة».
إذا لم يُضبط `ASSISTANT_URL` أو تعذّر الوصول للخادم، يرجع التطبيق تلقائياً للردود المحلية القديمة.

**تجربة من الطرفية:** `npm run chat` (أو `npm run chat:audit`)

## 🔌 ربط المساعد بخوادم MCP أخرى

عدّل `mcp.config.json` أو `mcp.audit.json` (نفس صيغة Claude Desktop، مع قسم `assistant` اختياري للاسم والتعليمات والأسئلة المقترحة):

```json
{
  "assistant": {
    "name": "Audit Assistant",
    "profile": "profiles/audit.md",
    "suggestions": ["أعطني ملخص حالة كل المهام"]
  },
  "mcpServers": {
    "engagements": { "command": "node", "args": ["mcp/audit/engagement-server.js"] },

    "files": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "./docs"]
    },

    "my-remote": {
      "url": "https://example.com/mcp",
      "headers": { "Authorization": "Bearer ${MY_TOKEN}" }
    }
  }
}
```

- `command` / `args` / `env` / `cwd` ← خادم محلي (stdio).
- `url` / `headers` ← خادم بعيد (Streamable HTTP).
- `${VAR}` يُستبدل بمتغيّر البيئة (ضع الأسرار في `.env` لا في الملف).
- `"disabled": true` لإيقاف خادم مؤقتاً.

كل أداة تظهر لـ Claude باسم `<server>__<tool>`. اعرض ما تم ربطه عبر `GET /api/health`.

## 🧰 أدوات خادم فلج (MCP)

| الأداة | الوصف |
|---|---|
| `get_farm_overview` | ملخّص المزرعة: كل المناطق ورطوبتها، ما يحتاج ريّ، الأجهزة المعطّلة |
| `get_zone_details` | قراءات منطقة: رطوبة، حرارة، رطوبة جو، pH، N/P/K |
| `list_fields` | الحقول: المحصول، المساحة، المصاريف والإيرادات (درهم)، موعد الحصاد |
| `list_devices` | أجهزة إنترنت الأشياء وحالتها مع تشخيص |
| `get_weather` | الطقس الحالي وتوقّع الغد |
| `get_market_prices` | أسعار السوق اليوم (درهم/كجم) |
| `recommend_irrigation` | هل أسقي؟ كم دقيقة؟ وأفضل وقت |
| `start_irrigation` | تشغيل الريّ لمنطقة (يغيّر المزرعة — لا يُستدعى إلا بطلب صريح) |
| `get_irrigation_log` | سجل عمليات الريّ |

البيانات حالياً تجريبية في `mcp/farm-data.js` — استبدل الدوال فيه باستدعاءات المستشعرات أو قاعدة البيانات الحقيقية.

### ربط الخوادم بـ Claude Desktop / Claude Code

كل الخوادم في `mcp/` تعمل بنفس الطريقة: stdio افتراضياً، أو `--http` (خوادم التدقيق على المنافذ 3401 و3402 و3403). مثال لخادم فلج:

**Claude Desktop** — أضف في `claude_desktop_config.json`:

```json
{ "mcpServers": { "falaj": { "command": "node", "args": ["/المسار/الكامل/Falaj/assistant/mcp/falaj-server.js"] } } }
```

**Claude Code:**

```bash
claude mcp add falaj -- node /المسار/الكامل/Falaj/assistant/mcp/falaj-server.js
```

**claude.ai (Custom connector) أو أي عميل عن بُعد** — شغّله كخادم HTTP وانشره على رابط HTTPS:

```bash
MCP_PORT=3334 MCP_AUTH_TOKEN=كلمة-سر npm run mcp:http     # → http://localhost:3334/mcp
```

## ⚙️ الإعدادات (`.env`)

| المتغيّر | الافتراضي | الوصف |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | مفتاح Claude API (مطلوب) |
| `FALAJ_MODEL` | `claude-opus-5` | النموذج |
| `FALAJ_EFFORT` | `medium` | عمق التفكير: `low` … `max` |
| `FALAJ_FALLBACKS` | مفعّل | بديل تلقائي على الخادم إن رفض النموذج طلباً؛ ضع `off` على Bedrock/Vertex/Foundry |
| `PORT` | `8787` | منفذ خادم المساعد |
| `ALLOWED_ORIGINS` | `*` | النطاقات المسموح لها (مثلاً رابط GitHub Pages) |
| `RATE_LIMIT_PER_MIN` | `20` | حدّ الطلبات لكل IP في الدقيقة |
| `MCP_CONFIG` | `./mcp.config.json` | مسار ملف خوادم MCP (أو مرّره كوسيط: `node src/server.js mcp.audit.json`) |
| `TOOL_LOG_FILE` | — | سجل تدقيق JSONL لكل استدعاء أداة |
| `AUDIT_TODAY` | تاريخ اليوم | تثبيت «اليوم» لبيانات التدقيق التجريبية |

## 🌐 النشر

التطبيق على GitHub Pages ملفات ثابتة، فالمساعد يحتاج مكاناً يشغّل Node (Render، Railway، Fly.io، VPS…):

1. انشر مجلد `assistant/` بأمر تشغيل `npm start`.
2. ضع `ANTHROPIC_API_KEY` في متغيّرات البيئة للمنصة، و`ALLOWED_ORIGINS` برابط موقعك.
3. ضع رابط الخادم في `ASSISTANT_URL` داخل `app/js/config.js`.

> 🔐 مفتاح Claude يبقى على الخادم فقط — لا تضعه أبداً في ملفات التطبيق.

## 🗂️ البنية

```
assistant/
  src/server.js       ← HTTP API: POST /api/chat, GET /api/health, صفحة /chat/ (+ يخدم تطبيق فلج)
  src/agent.js        ← حلقة Claude: يستدعي أدوات MCP حتى يكتمل الجواب
  src/mcp-hub.js      ← عميل MCP: يتصل بكل الخوادم + سجل التدقيق
  src/cli.js          ← محادثة من الطرفية
  web/index.html      ← صفحة المحادثة (عربي/إنجليزي، فاتح/داكن)
  profiles/*.md       ← تعليمات المساعد لكل ملف تعريف
  mcp/audit/          ← خوادم MCP لتطبيقات شركة التدقيق + بيانات تجريبية
  mcp/falaj-server.js ← خادم MCP لمزرعة فلج
  mcp/lib/serve.js    ← تشغيل أي خادم عبر stdio أو HTTP
  mcp.audit.json      ← ملف تعريف شركة التدقيق
  mcp.config.json     ← ملف تعريف فلج (الافتراضي)
```
