# 🌱 مساعد فلج الذكي — FALAJ Smart Assistant (Claude + MCP)

مساعد زراعي ذكي مبني على **Claude**، يتصل بأي خادم **MCP** (Model Context Protocol) ويستخدم أدواته.
ويأتي معه **خادم MCP خاص بمزرعة فلج** يعرض بيانات المزرعة (الرطوبة، المستشعرات، الحقول، الطقس، الأسعار، الريّ)
— وتقدر تربط نفس الخادم بـ Claude Desktop أو Claude Code أو claude.ai.

```
 تطبيق فلج (app/)  ──HTTP──▶  خادم المساعد (src/server.js)  ──Claude API──▶  Claude
                                    │
                                    └── MCP hub ──▶  falaj  (mcp/falaj-server.js)   ← مدمج
                                                 ──▶  أي خادم MCP آخر تضيفه في mcp.config.json
```

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

**تجربة من الطرفية:** `npm run chat`

## 🔌 ربط المساعد بخوادم MCP أخرى

عدّل `mcp.config.json` (نفس صيغة Claude Desktop):

```json
{
  "mcpServers": {
    "falaj": { "command": "node", "args": ["mcp/falaj-server.js"] },

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

### ربط خادم فلج بـ Claude Desktop / Claude Code

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
| `MCP_CONFIG` | `./mcp.config.json` | مسار ملف خوادم MCP |

## 🌐 النشر

التطبيق على GitHub Pages ملفات ثابتة، فالمساعد يحتاج مكاناً يشغّل Node (Render، Railway، Fly.io، VPS…):

1. انشر مجلد `assistant/` بأمر تشغيل `npm start`.
2. ضع `ANTHROPIC_API_KEY` في متغيّرات البيئة للمنصة، و`ALLOWED_ORIGINS` برابط موقعك.
3. ضع رابط الخادم في `ASSISTANT_URL` داخل `app/js/config.js`.

> 🔐 مفتاح Claude يبقى على الخادم فقط — لا تضعه أبداً في ملفات التطبيق.

## 🗂️ البنية

```
assistant/
  src/server.js       ← HTTP API: POST /api/chat, GET /api/health (+ يخدم التطبيق)
  src/agent.js        ← حلقة Claude: يستدعي أدوات MCP حتى يكتمل الجواب
  src/mcp-hub.js      ← عميل MCP: يتصل بكل الخوادم في mcp.config.json
  src/cli.js          ← محادثة من الطرفية
  mcp/falaj-server.js ← خادم MCP لمزرعة فلج (stdio أو HTTP)
  mcp/farm-data.js    ← بيانات المزرعة التجريبية
  mcp.config.json     ← قائمة خوادم MCP
```
