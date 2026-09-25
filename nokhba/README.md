# Nokhba · نخبة — AI-powered learning platform

Nokhba is a bilingual (English / Arabic, full RTL) learning platform in the spirit of Udacity, with an AI tutor woven into every learning surface: a persistent lesson tutor with Socratic "guided" mode, a daily AI learning plan, AI quizzes and flashcards with spaced repetition, project-based learning with AI rubric review, a skills graph, an AI course creator for instructors, and an enterprise mode with AI skills-gap analysis. The interface is an Apple-quality glassmorphism design system that works in light, dark, desktop and mobile.

> Demo mode works **offline with no API key**: the built-in `local` AI provider answers every AI feature from the real course context, so the whole product can be explored end to end before connecting Anthropic, OpenAI, Azure OpenAI or a local LLM.

## Stack

Next.js 16 (App Router, Turbopack, React 19) · TypeScript · Tailwind CSS v4 + shadcn/ui (Radix) · Framer Motion · PostgreSQL + Prisma 6 · Auth.js v5 · Zod · React Hook Form · Recharts · Vitest · Playwright.

## Quick start

```bash
cd nokhba
cp .env.example .env            # set DATABASE_URL and AUTH_SECRET (openssl rand -base64 32)
npm install                     # runs prisma generate
docker compose up -d db         # or point DATABASE_URL at any PostgreSQL 14+
npx prisma migrate deploy       # create the schema
npm run db:seed                 # demo users, 10 courses, 4 paths, projects, assessments, an organization
npm run dev                     # http://localhost:3000
```

Full stack in containers: `docker compose up --build` (PostgreSQL with pgvector + the app).

### Demo accounts (password for all: `Nokhba123!`)

| Role | Email | What to look at |
|---|---|---|
| Learner (active) | `sara@nokhba.demo` | Dashboard, daily plan, lessons with AI tutor, flashcards, skills graph, certificate `NKB-2026-DEMO01` |
| Learner (new, Arabic) | `new@nokhba.demo` | Onboarding wizard → personalised recommendations |
| Instructor | `amal.alkaabi@nokhba.demo` | Instructor dashboard, course builder, AI course creator, project reviews |
| Course manager | `content@nokhba.demo` | Publishing, categories, paths |
| Admin / Super admin | `admin@nokhba.demo` · `super@nokhba.demo` | Admin portal, AI settings, audit log, analytics |
| Organization manager | `manager@ada.demo` | Enterprise mode: people, programs, AI skills-gap analysis |
| Organization member | `huda@ada.demo` | Assigned programs |

## AI providers

Set `AI_PROVIDER` in `.env` (administrators can also switch providers, models, tone and RAG settings at runtime in **Admin › AI**):

| Provider | Env | Notes |
|---|---|---|
| `local` (default) | – | Offline demo provider; deterministic answers built from the learner's real context |
| `anthropic` | `ANTHROPIC_API_KEY`, optional `AI_MODEL` | Claude with adaptive thinking; streaming |
| `openai` | `OPENAI_API_KEY`, optional `OPENAI_BASE_URL`, `AI_MODEL` | Any OpenAI-compatible chat completions API |
| `azure` | `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_DEPLOYMENT` | Azure OpenAI |
| local LLM | `AI_PROVIDER=openai`, `OPENAI_BASE_URL=http://localhost:11434/v1` | Ollama, vLLM, LM Studio… |

Keys never reach the browser: UI components call `/api/ai/*` route handlers only; the orchestrator (`ai/orchestrator.ts`) builds the context (profile, skills, streak, lesson text, retrieved chunks), renders a versioned prompt template, applies the safety layer (platform rules, untrusted-data blocks, injection detection, output scrubbing) and calls the provider through the model gateway (timeouts, fallback, structured outputs with Zod + repair retry).

### Retrieval (RAG)

Approved course content is chunked and embedded at seed/publish time into `ContentChunk`. The default backend ranks in application code with a local hash embedder (works offline). For production scale enable pgvector with `prisma/sql/pgvector.sql`, set `RAG_VECTOR_BACKEND=pgvector`, choose an embedding provider (`OPENAI_API_KEY` or `VOYAGE_API_KEY`) and re-index from Admin › AI.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Development / production build / production server |
| `npm run typecheck` · `npm run lint` | TypeScript strict · ESLint |
| `npm test` | Vitest unit tests (`tests/unit`) — permissions, safety, RAG, validation, SM-2, grading |
| `npm run test:e2e` | Playwright end-to-end tests (`tests/e2e`) against a running server |
| `npm run db:migrate` · `db:seed` · `db:reset` · `db:studio` | Prisma workflows |
| `node scripts/browse.cjs --as sara@nokhba.demo --paths /home --locale ar --width 390` | Visual/RTL/console check of any page |

## Architecture

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the layout, conventions (i18n, auth, permissions, design system, AI layer, analytics, validation), route map and testing notes. In short:

```
UI (server components + client islands)
  → /api/* route handlers & server actions (auth, zod, rate limit, audit)
    → server/services/* (progress, skills, recommendations, assessments, projects, certificates…)
      → Prisma → PostgreSQL

AI: UI → /api/ai/* → orchestrator → context builder → prompt manager → gateway → provider
```

Security: role/permission model (`lib/auth/permissions.ts`), ownership checks on every mutation, Zod validation on every body, in-memory rate limiting (swap for Redis in multi-instance deployments), prompt-injection protection, upload type/size validation, audit log for privileged actions, secure headers set in `proxy.ts`.

## Deployment

- **Docker**: `Dockerfile` (standalone Next.js output) + `docker-compose.yml`. Migrations run on container start (`prisma migrate deploy`).
- **Any Node host** (Vercel, Fly, Render, a VM): set the env vars from `.env.example`, run `prisma migrate deploy`, then `npm run build && npm start`. Uploads are stored on disk under `storage/` — mount a volume or swap `lib/storage.ts` for an S3-compatible provider.
- **Social sign-in**: set the Google / Microsoft Entra ID / Apple variables in `.env.example`; providers switch on automatically.

## Continuous integration

`.github/workflows/nokhba-ci.yml` runs lint, type-check and unit tests on every push, then builds, migrates, seeds and runs the Playwright suite against a PostgreSQL service.
