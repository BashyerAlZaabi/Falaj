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
cp .env.example .env        # ضع ANTHROPIC_API_KEY (وباقي المفاتيح اختيارية)
npm run start:audit         # افتح http://localhost:8787/chat/
```

يشتغل فوراً ببيانات تجريبية لكل التطبيقات، وكل تطبيق تضيف مفاتيحه يتحوّل للنظام الحقيقي.

### التطبيقات المتصلة (6 خوادم MCP، 40 أداة)

| الخادم | التطبيق | الأدوات | الوضع الحقيقي |
|---|---|---|---|
| `m365` | **Outlook + التقويم + SharePoint/OneDrive** | `search_emails` · `read_email` · `read_attachment` · `save_attachment_for_import` ✍️ · `draft_email` ✍️ · `list_events` · `create_event` ✍️ · `search_files` · `list_folder` · `read_file` · `save_file` ✍️ | Microsoft Graph (متغيّرات `M365_*`) |
| `erp` | **أنظمة ERP للعملاء** | `erp_status` · `test_erp_connection` · `pull_from_erp` ✍️ · `import_extract` ✍️ · `reconcile_je_to_tb` · `search_gl` | Odoo و Dynamics 365 Business Central مباشرة، وأي ERP آخر (SAP، Oracle، Tally، QuickBooks، Zoho…) عبر ملفات CSV/XLSX |
| `billing` | **الوقت والفوترة** | `engagement_hours` · `log_time` ✍️ · `get_wip` · `list_invoices` · `fee_debtors` · `engagement_economics` · `draft_invoice` ✍️ · `import_timesheet` ✍️ | استيراد CSV/XLSX من أي نظام timesheet |
| `engagements` | منصة إدارة المهام | `list_engagements` · `get_engagement` · `list_pbc_requests` · `update_pbc_request` ✍️ · `list_findings` · `log_finding` ✍️ · `misstatements_vs_materiality` | — |
| `analytics` | تحليل البيانات | `get_trial_balance` · `analytical_review` · `journal_entry_testing` · `calculate_materiality` · `select_sample` | يحلّل ما يُستورد من ERP |
| `people` | الموارد البشرية والاستقلالية | `list_staff` · `independence_check` | — |

✍️ = أداة تكتب أو تغيّر شيئاً، ولا يستخدمها المساعد إلا بطلب صريح. الإيميلات **مسودّات فقط** ولا تُرسل أبداً.

كل الخوادم تشترك في مخزن واحد (`data/audit-store.json`). يعني الوقت المسجّل يظهر في الفوترة، وبيانات ERP المستوردة تحلّلها التحليلات، ولا شيء يضيع عند إعادة التشغيل.

### أمثلة على أسئلة تجمع أكثر من تطبيق
- «هل أرسل العميل ميزان المراجعة بالإيميل؟ حمّله وشغّل اختبارات القيود» ← Outlook ← حفظ المرفق ← استيراد ERP (تجربة أولاً) ← مطابقة القيود مع الميزان ← اختبارات ISA 240
- «هل يوجد ما يهدد الاستقلالية؟» ← سجل الاستقلالية + أتعاب غير مدفوعة من السنة السابقة + إيميل العميل عنها
- «جهّز لي اجتماعات الأسبوع» ← التقويم + حالة كل مهمة + الطلبات المتأخرة
- «اكتب تذكير لـ Gulf Trading بالطلبات المتأخرة» ← PBC ← مسودّة في Outlook
- «كم الأتعاب غير المفوترة؟ جهّز فاتورة ENG-001» ← WIP ← فاتورة مسودّة

### ربط الأنظمة الحقيقية

**Microsoft 365:** سجّل تطبيقاً في Microsoft Entra ID وامنحه صلاحيات Application التالية: `Mail.ReadWrite` و`Calendars.ReadWrite` و`Files.ReadWrite.All` (أو `Sites.Selected` لموقع واحد). بعدها ضع في `.env`:
```
M365_TENANT_ID=…  M365_CLIENT_ID=…  M365_CLIENT_SECRET=…
M365_MAILBOX=audit.manager@yourfirm.com
M365_SHAREPOINT_SITE=yourfirm.sharepoint.com:/sites/Audit
```
قيّد الوصول لصناديق البريد المطلوبة فقط عبر Application Access Policy أو RBAC for Applications في Exchange. وللتجربة السريعة يكفي `M365_ACCESS_TOKEN` من Graph Explorer.

**ERP العملاء:** انسخ `erp.connections.example.json` إلى `erp.connections.json`، واربط كل مهمة بنظام عميلها، وضع الأسرار في `.env`:
- **Odoo 16–18:** `url` و`db` و`username` و`apiKey` (مستخدم بصلاحية قراءة للمحاسبة).
- **Business Central:** تطبيق Entra ID مضاف في BC › Microsoft Entra Applications بصلاحية قراءة.
- **أي نظام آخر:** ضع ملف CSV/XLSX في `data/imports/` (أو يحفظه المساعد من إيميل العميل)، ثم استخدم `import_extract`. أسماء الأعمدة تُتعرّف تلقائياً، وقبل الحفظ يُفحص توازن الميزان والقيود.

**الوقت والفوترة:** صدّر الـ timesheet من نظامكم كـ CSV/XLSX (أعمدة: staff و engagement و hours و date)، وضعه في `data/imports/`، ثم استخدم `import_timesheet`. للربط المباشر بنظامكم: استبدل `load()/update()` في `mcp/audit/store.js` بقاعدة بياناتكم.

> ⚠️ موصلات Odoo و Business Central و Microsoft Graph مكتوبة حسب التوثيق الرسمي ومختبرة على خوادم محاكاة، لكنها لم تُجرَّب بعد على نظام حقيقي. جرّب `test_erp_connection` و`m365_status` أولاً.

### 🔐 الأمان والامتثال
- **سجل تدقيق:** مع `TOOL_LOG_FILE=./tool-calls.jsonl` يُسجَّل كل استدعاء أداة بوقته ومدخلاته.
- **الأسرار** (مفاتيح Claude و Graph و ERP) تبقى في `.env` على الخادم، ولا يُعرض أي سر في مخرجات الأدوات.
- **الملفات:** الاستيراد محصور في مجلد `imports`، والإيميلات مسودّات فقط، و`save_file` لا يكتب فوق ملف موجود.
- **محتوى الإيميلات والمستندات** يُعامل كبيانات وليس كتعليمات، للحماية من حقن الأوامر.
- **المساعد لا يعطي رأياً تدقيقياً** ولا يوقّع على شيء.
- **قبل التشغيل على بيانات عملاء حقيقية:** ضع تسجيل دخول الشركة (SSO) أمام الخادم، وقيّد `ALLOWED_ORIGINS`، وراجع سياسة الشركة في مشاركة البيانات مع مزوّدي الذكاء الاصطناعي.

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

كل الخوادم في `mcp/` تعمل بنفس الطريقة: stdio افتراضياً، أو `--http` (خوادم التدقيق على المنافذ 3401–3406). مثال لخادم فلج:

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
| `AUDIT_DATA_DIR` | `./data` | مخزن التدقيق المشترك ومجلد `imports` |
| `AUDIT_ERP_CONNECTIONS` | `./erp.connections.json` | اتصالات ERP لكل مهمة |
| `M365_*` | — | اتصال Microsoft 365 (انظر `.env.example`) |
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
  mcp/audit/          ← خوادم MCP لتطبيقات شركة التدقيق:
      m365-server.js      Outlook / التقويم / SharePoint  (m365/graph.js حقيقي، m365/demo.js تجريبي)
      erp-server.js       ERP العملاء  (erp/odoo.js، erp/businesscentral.js، erp/normalize.js)
      billing-server.js   الوقت والفوترة
      engagement-server.js · analytics-server.js · people-server.js
      store.js            المخزن المشترك  ·  data.js البيانات الأولية  ·  tables.js قراءة CSV/XLSX
  mcp/falaj-server.js ← خادم MCP لمزرعة فلج
  mcp/lib/serve.js    ← تشغيل أي خادم عبر stdio أو HTTP
  mcp.audit.json      ← ملف تعريف شركة التدقيق
  erp.connections.example.json ← مثال اتصالات ERP
  mcp.config.json     ← ملف تعريف فلج (الافتراضي)
```
