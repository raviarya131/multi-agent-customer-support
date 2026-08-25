# Multi-Agent Customer Support Resolution Engine

An **e-commerce** customer-support engine that classifies, decomposes, investigates, and resolves customer tickets through coordinated specialist AI agents — with a full-featured ops console, real-time collaboration, sentiment detection, and live KB generation.

---

## Documentation 

| Doc | Purpose |
|-----|---------|
| **[architecture.md](architecture.md)** | System context, deployment, flows, diagrams |
| **[hld.md](hld.md)** | High-level design — layers, modules, interfaces |
| **[technical-decisions.md](technical-decisions.md)** | ADRs — what we chose and why |
| **[lld.md](lld.md)** | Low-level design — schemas, contracts, endpoints, file map |

---

## System architecture (summary)

See **[architecture.md](architecture.md)** for full diagrams. Quick view:

```
┌─────────────────────────────────────────────────────────────────────┐
│  Browser (Next.js 15, shadcn/ui, dark-only)                         │
│                                                                     │
│  Customer chat  │  Tickets  │  Escalations  │  Team  │  Platform   │
│  (streaming)    │  (admin)  │  (agent)      │(collab)│  (config)   │
└───────────────────────────────────┬─────────────────────────────────┘
                                    │ REST + SSE
┌───────────────────────────────────▼─────────────────────────────────┐
│  Express API  (port 4100)                                           │
│                                                                     │
│  Auth · Tickets · Escalations · Notifications · Feedback           │
│  Observability · Platform-config proxy · Team/Collab SSE           │
│                                                                     │
│  SQLite (node:sqlite, no native build)                             │
│  tables: tickets · messages · runs · escalations · human_agents   │
│          notifications · feedback · agent_presence · team_activity │
│          case_notes · config_audit_log · faqs                      │
└───────────────────────────────────┬─────────────────────────────────┘
                                    │ HTTP (admin-token)
┌───────────────────────────────────▼─────────────────────────────────┐
│  Agent System  (port 5000)   — LangGraph StateGraph                │
│                                                                     │
│  Pipeline (8 steps, each a typed pure function):                   │
│  guard → classify → sentiment → decompose → investigate(parallel)  │
│         → severity → escalation → synthesize                       │
│                                                                     │
│  Specialist agents (5):  Technical · Billing · Policy · Orders     │
│                          · Products  (+ runtime-addable)           │
│                                                                     │
│  Shared framework:                                                  │
│    gateway/   single LLM door (OpenAI-compat / Azure / Groq …)    │
│    handlers/  declarative JSON use-case runner                     │
│    kb/        TF-IDF retriever + markdown library + LLM generator │
│    tools/     orderLookup · productLookup · lookupErrorCode …     │
│    policies/  live-editable config (guard, escalation, intent)    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Quick start

```bash
cd C:\dishant\techathon
npm install

# Optional: copy env template and add your LLM key.
# Without a key, all steps fall back to deterministic heuristics — runs offline too.
copy .env.example .env

npm run dev:all          # starts all three services
```

| Service          | URL                      | Command              |
|------------------|--------------------------|----------------------|
| Frontend (web)   | http://localhost:3100    | `npm run dev:web`    |
| API + SQLite     | http://localhost:4100    | `npm run dev:api`    |
| Agent System     | http://localhost:5000    | `npm run dev:agent`  |

---

## Pipeline steps

| # | Step | Kind | What it does |
|---|------|------|--------------|
| 1 | **Guard** | rule | Detects hard-signal phrases (`"talk to a manager"`, `"chargeback"`) → sets `force_escalation` |
| 2 | **Classify** | LLM + rule fallback | Intent + confidence per domain; `is_multi_issue`; low-confidence `fallback` flag |
| 3 | **Sentiment** | LLM + heuristic fallback | Conversation-aware tone: `label`, `score`, `frustration`, `drivers`, `trend` |
| 4 | **Decompose** | LLM + rule fallback | Splits mixed ticket into independent sub-problems (one per domain) |
| 5 | **Investigate** | LLM per agent | `Promise.all` fan-out to specialists; each returns `findings`, `actions`, `reasoning`, `evidence`, `confidence` |
| 6 | **Severity** | rule | Severity from agent findings (not wording); priority = severity + capped sentiment nudge |
| 7 | **Escalation** | rule + LLM | Gate checks 5 policies (guard, severity, unresolved, conflicts, frustration+repeat); builds handoff plan |
| 8 | **Synthesize** | LLM + template fallback | Merges all reports into one customer-ready reply with reasoning + evidence |

Every step appends a typed event to `audit_trail[]` — you can trace every word of the final answer back to its source.

---

## Specialist agents (5)

| Domain | Handles | Tools | KB files |
|--------|---------|-------|----------|
| **Technical** | Login errors, checkout/payment-page issues, site errors | `lookupErrorCode` | `troubleshooting.md` |
| **Billing** | Charges, double payments, refunds, invoices | `subscriptionLookup`, `dbQuery` | `billing_policy.md`, `refund_policy.md` |
| **Policy** | Returns, cancellation, warranty, data/privacy | `dbQuery` | `refund_policy.md`, `cancellation_policy.md`, `amendment_policy.md` |
| **Orders** | Status, tracking, delivery, cancel/change | `orderLookup` | `shipping_delivery.md` |
| **Products** | Availability, stock, price, variants, specs | `productLookup` | `product_catalog.md` |

Each agent = `createAgent({ useCasesDir: "./usecases" })` pointed at its own declarative JSON use cases. Adding a new agent requires one `index.ts` + a `usecases/` folder + one line in `registry.ts`. Adding a new use case requires only a JSON file — no code.

Platform admins can **add custom specialist agents at runtime** from the admin console without restarting.

---

## Feature overview

### Core capabilities

- **Intent classification** — LLM-backed with confidence per domain; keyword fallback for offline
- **Multi-agent decomposition + parallel fan-out** — `Promise.all` across specialists; wall-clock vs sum-of-parts timing logged
- **Unified resolution with reasoning** — merged findings, actions, evidence, all traceable to agents
- **Severity + priority assessment** — from findings (not customer wording), with sentiment nudge
- **Escalation handling** — 5 configurable rules; human agent assignment by department + least-load balancing
- **Context across follow-ups** — `prior_context` passes resolution + history; message count drives repeat-contact logic
- **Full audit trail** — every step emits a typed `AuditEvent` (timestamp, actor, kind `llm|rule|heuristic`, summary, detail)

### Stretch goals 

| Goal | Where |
|------|-------|
| **Sentiment analysis + frustration detection** | `steps/sentiment.ts` — LLM-first, conversation-aware; `frustration` flag, `drivers`, `trend`; shown on Tickets, Escalations, Observability |
| **Suggested KB article generation** | `shared/kb/generate.ts` + Platform → Knowledge Base → "Generate draft"; LLM draft from resolved ticket, editable before saving |
| **Real-time agent collaboration dashboard** | `/collaboration` — SSE live feed, presence (heartbeats), roster with load bars, activity stream, team case-notes (internal, not customer-visible) |

### Admin console pages

| URL | Who | What |
|-----|-----|------|
| `/tickets` | admin | All tickets with sentiment, intent, severity; searchable/filterable; click → side sheet + lifecycle stepper |
| `/escalations` | admin, agent | Open/resolved cases; reply, handoff, resolve; internal team notes; 6s poll for live replies |
| `/collaboration` | admin, agent | Live team roster + presence + load bars; SSE activity feed; recent case notes |
| `/observability` | admin | All pipeline runs; filter by category/sentiment/outcome; click → pipeline flow + agent verdicts + audit trail |
| `/trace/:ticketId` | admin, agent | Full-page trace viewer: pipeline step graph + classification/decomp/agents/audit tabs; fan-out diagram |
| `/feedback` | admin | Customer thumbs-up/down on AI replies; KPIs; filterable table |
| `/platform` | admin | Policies · Specialists · FAQ · Knowledge Base · Audit log · Human agents |

### Platform controls (admin)

- **Policies** — hard-check guard signals (on/off + phrase), escalation rules (5 toggles), intent confidence thresholds
- **Specialists** — view built-in agents; add custom runtime agents (name, description, keywords, team)
- **FAQ** — add/edit/delete canned answers checked before the LLM classifier; match modes: `contains` / `exact` / `regex`
- **Knowledge Base** — CRUD over `*.md` files; **AI article suggestion** from a resolved ticket (LLM draft, review then save)
- **Audit log** — every admin config change with actor, action, target, timestamp

---

## Running a single part

```bash
# Run one specialist agent directly
npm --workspace apps/agent run agent -- billing    "I was charged twice"
npm --workspace apps/agent run agent -- technical  "Checkout keeps failing"
npm --workspace apps/agent run agent -- orders     "Where is ORD-1001?"
npm --workspace apps/agent run agent -- products   "Is the Wireless Earbuds Pro in stock?"

# Run one pipeline step
npm --workspace apps/agent run step -- classify   "App crashes and I was charged twice"
npm --workspace apps/agent run step -- sentiment  "THIS IS THE THIRD TIME!!!"
npm --workspace apps/agent run step -- decompose  "Crash on login and double charge"

# Run the whole pipeline (no API/web)
npm --workspace apps/agent run pipeline -- "App crashes after login and I was charged twice"
```

---

## Demo scenarios

| Message | What to show |
|---------|-------------|
| `I was charged twice this month.` | Billing-only → 1 agent → Trace: single agent report + evidence |
| `Checkout keeps failing and I was charged twice.` | **Multi-agent** → Trace: fan-out diagram, 2 parallel agents, merged result |
| `Where is my order and is the keyboard back in stock?` | **Multi-agent** → Orders + Products in parallel |
| `Something feels wrong with my account.` | Low-confidence → **fallback** path visible in classification |
| `THIS IS THE THIRD TIME!!! talk to a manager!` | Hard-signal guard + angry sentiment → escalated; Escalations page |
| Submit again on same ticket | **Follow-up** — message count rises, `prior_context` shown in audit |
| (empty message) | Graceful validation error |
| Add an FAQ in Platform | FAQ match short-circuits LLM; `faq` category in Observability |
| Open Collaboration tab while working case | Heartbeat → online in Team roster; team note → activity feed |
| Resolve a ticket → Platform → KB → Generate | AI article draft from resolution |

---

## Project structure

```
techathon/
├── apps/
│   ├── web/                        Next.js 15, shadcn/ui, dark-only
│   │   ├── app/
│   │   │   ├── page.tsx            Customer chat (streaming SSE)
│   │   │   ├── tickets/            Admin ticket dashboard
│   │   │   ├── escalations/        Escalation case management
│   │   │   ├── collaboration/      Real-time team dashboard
│   │   │   ├── observability/      Pipeline run browser
│   │   │   ├── trace/[ticketId]/   Full-page visual trace viewer
│   │   │   ├── feedback/           Thumbs-up/down admin view
│   │   │   └── platform/           Admin config (policies/FAQ/KB/agents)
│   │   ├── components/
│   │   │   ├── flow.tsx            PipelineFlow (step graph, SSE-driven)
│   │   │   ├── views.tsx           RunDetails, RunTraceCard, AgentReportDetails …
│   │   │   ├── sentiment-badge.tsx Mood pill (label + score + trend)
│   │   │   └── admin-nav.tsx       Shared nav + NotificationBell
│   │   └── app/platform/
│   │       ├── page.tsx            Tab shell (imports tab components)
│   │       ├── ui.tsx              Shared UI atoms: Field, Toggle, ThresholdField
│   │       └── tabs/               One file per tab (kb/usecases/tools/specialists/faq/policies/audit)
│   │
│   ├── api/                        Express + node:sqlite  (port 4100)
│   │   └── src/
│   │       ├── server.ts           App setup + auth + ticket routes
│   │       ├── routes/
│   │       │   ├── middleware.ts   Auth middleware + requireRole + helpers
│   │       │   ├── tickets.ts      (ticket logic lives in server.ts)
│   │       │   ├── escalations.ts  Escalation management routes
│   │       │   ├── platform.ts     Platform config proxy routes
│   │       │   └── admin.ts        Dashboard, observability, feedback, collab
│   │       ├── db/
│   │       │   ├── schema.ts       DDL + migrations + db instance
│   │       │   ├── tickets.ts      Ticket/message/run queries
│   │       │   ├── escalations.ts  Escalation queries
│   │       │   ├── notifications.ts Notifications, feedback, config audit
│   │       │   ├── collab.ts       Presence, team activity, case notes
│   │       │   ├── agents.ts       Human agent DB rows
│   │       │   └── index.ts        Re-exports everything
│   │       ├── collab.ts           In-memory SSE broker (collab events)
│   │       ├── agentAdmin.ts       Proxy to agent admin routes
│   │       ├── humans.ts           Human agent roster + dept routing
│   │       └── notify.ts           In-app + email notifications
│   │
│   └── agent/                      LangGraph TS pipeline  (port 5000)
│       └── src/
│           ├── graph.ts            LangGraph StateGraph definition
│           ├── nodes.ts            One async function per pipeline step
│           ├── pipeline.ts         Linear fallback runner (same contract)
│           ├── contracts/types.ts  All shared TypeScript types
│           ├── steps/              guard · classifier · sentiment · decomposer
│           │                       orchestrator · severity · escalation · synthesizer
│           ├── agents/             technical/ billing/ policy/ orders/ products/
│           │                       (index.ts + usecases/*.json per domain)
│           └── shared/
│               ├── gateway/        Single LLM door (callLLM, provider adapters)
│               ├── core/           guardrails, logger, types
│               ├── handlers/       Declarative JSON use-case runner
│               ├── kb/             store · retriever (TF-IDF) · generate (LLM)
│               ├── tools/          orderLookup · productLookup · lookupErrorCode …
│               └── policies/       store · agents (live config) · faq
└── .env.example
```

---

## Requirements status

| Goal | Status | Notes |
|------|--------|-------|
| **FG1** Accept support requests | ✅ | REST + streaming SSE; channel-agnostic API |
| **FG2** Classify intent + route | ✅ | 5 domains; confidence scores; FAQ short-circuit; offline keyword fallback |
| **FG3** Decompose + parallel fan-out | ✅ | `Promise.all` across specialists; fan-out diagram in Trace |
| **FG4** Specialized agents (5) | ✅ | Technical · Billing · Policy · Orders · Products; declarative JSON use cases |
| **FG5** Severity + escalation | ✅ | 5 configurable rules; least-load agent assignment; handoff to manager |
| **FG6** Unified customer response | ✅ | Merged findings + actions + evidence; LLM synthesis + template fallback |
| **FG7** Context across follow-ups | ✅ | `prior_context`, `message_count`, full history per ticket |
| **FG8** Audit every step | ✅ | Typed `AuditEvent[]` per step; full trace in Observability + Trace viewer |
| **SG1** Sentiment + frustration | ✅ | LLM-first, conversation-aware; `frustration` flag, `drivers[]`, `trend` |
| **SG2** KB article generation | ✅ | LLM draft from resolved ticket; admin reviews before saving |
| **SG3** Real-time collab dashboard | ✅ | SSE feed, presence heartbeats, roster with load bars, team notes |

---

## Decision log

See **[technical-decisions.md](technical-decisions.md)** for full ADRs (20 decisions with context, alternatives, consequences).

| Decision | Chosen |
|----------|--------|
| Orchestration | LangGraph + linear fallback |
| Database | `node:sqlite` |
| LLM access | Single `callLLM()` gateway |
| Agents | Declarative JSON use cases |
| KB retrieval | TF-IDF (vector-ready interface) |
| Real-time | SSE (pipeline + collab) |
| Escalation | Policy gate + meaningful HITL |

---

## Known limitations

- **Tools are mocked.** `orderLookup`, `productLookup`, `lookupErrorCode` return realistic in-memory data. Swap a tool's `run()` for a real API call; the pipeline and use cases don't change.
- **Knowledge base retrieval is keyword-based (TF-IDF).** Embedding/vector search can slot in behind the same `retrieveFromScope` interface.
- **Single-process, single-node.** SQLite and the in-memory collab broker are not distributed. Suitable for demo; production would use Postgres + Redis pub/sub.
- **No Zendesk/Linear/Jira integration.** The intake API is channel-agnostic — see Roadmap for how this extends.
- **Email notifications are best-effort** via Resend (optional). In-app notifications always work.
- **No automated test suite.** Steps are pure functions testable in isolation via the CLI; a test suite is a natural next step.

---

## Roadmap — multi-channel intake

The API intake endpoint (`POST /api/tickets`) is already **channel-agnostic**: it accepts `{ message, customer_id?, ticket_id? }` as plain JSON. Adding a new channel is purely additive — no pipeline or agent code changes:

| Channel | Work required |
|---------|--------------|
| **Email** | A webhook receiver (SendGrid/Postmark inbound) that parses the email body → `POST /api/tickets`. Attachments become KB context. |
| **Voice transcript** | A Whisper / Deepgram webhook that transcribes audio → plain text → `POST /api/tickets`. |
| **Zendesk / Freshdesk / Jira** | An inbound webhook from the platform → `POST /api/tickets` (creates a local mirror); resolution → write-back via platform API (`PUT /tickets/:id`). |
| **Linear** | Same pattern: Linear webhook on issue creation → classify + resolve → post comment back via Linear API. |
| **Slack** | Slack Events API `message` event → `POST /api/tickets`; resolution → Slack reply thread. |

The audit trail, observability dashboard, and escalation flow all work identically regardless of channel.

---

## Team contributions

| Member | Contribution |
|--------|-------------|
| **Dishant** | Base system setup · API server · SQLite schema · frontend (chat UI + admin console) · end-to-end integration |
| **Pawan** | Priority and severity assessment pipeline step (`steps/severity.ts`) |
| **Abhinav** | Intent router and classification (`steps/classifier.ts`, confidence scoring, fallback routing) |
| **Faraaz** | Ticket decomposition and multi-agent fan-out (`steps/decomposer.ts`, `Promise.all` orchestration, fan-out diagram) |
| **Bargawa** | Agent orchestration integration · audit trail design (`AuditEvent[]`, per-step logging) · FAQ pipeline |
| **Niharika** | Specialist agents (Technical · Billing · Policy · Orders · Products) · management dashboard (Platform tab) |
