# SupportEmgine — Multi-Agent Customer Support Resolution Engine

AI-powered e-commerce support platform that classifies, investigates, resolves, and escalates customer tickets using parallel specialist agents (Technical, Billing, Policy, Orders, Products).

Repo: [niharika150107/SupportEmgine](https://github.com/niharika150107/SupportEmgine)

---

## Prerequisites

See [`requirements.txt`](./requirements.txt) for the checklist. In short:

| Need | Details |
|------|---------|
| **Node.js** | v18+ (LTS recommended) — [nodejs.org](https://nodejs.org/) |
| **npm** | v9+ (included with Node) |
| **Groq API key** | Free key from [console.groq.com/keys](https://console.groq.com/keys) |
| **Ports free** | `3100` (web), `4100` (api), `5000` (agent) |

> Without an API key the stack still starts; classify / agents / synthesis fall back to deterministic heuristics.

---

## Quick setup (Windows / macOS / Linux)

```bash
# 1) Go into the project folder
cd techathon-main

# 2) Install dependencies
npm install

# 3) Create your env file
copy .env.example .env          # Windows
# cp .env.example .env          # macOS / Linux

# 4) Edit .env and set your Groq key:
#    GROQ_API_KEY=gsk_...
#    GROQ_MODEL=llama-3.3-70b-versatile
#    LLM_PROVIDER=groq

# 5) Point the web app at the API (create once)
#    apps/web/.env.local  →  NEXT_PUBLIC_API_URL=http://localhost:4100

# 6) Start everything
npm run dev:all
```

Then open:

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3100 |
| API | http://localhost:4100 |
| Agent | http://localhost:5000 |

---

## Environment files

### Root `.env` (agent + api)

Copy from [`.env.example`](./.env.example). Minimal Groq config:

```env
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=llama-3.3-70b-versatile
LLM_PROVIDER=groq

AGENT_PORT=5000
API_PORT=4100
AGENT_URL=http://localhost:5000
API_DB_PATH=support.db
```

**Never commit `.env`** — it is gitignored. Share keys only via a password manager or team secret store.

### Web `apps/web/.env.local`

```env
NEXT_PUBLIC_API_URL=http://localhost:4100
```

---

## Useful commands

```bash
# All three services
npm run dev:all

# One service at a time
npm run dev:web
npm run dev:api
npm run dev:agent

# Smoke-test the agent pipeline (no UI)
npm --workspace apps/agent run pipeline -- "I was charged twice this month."

# Run a single specialist
npm --workspace apps/agent run agent -- billing "I was charged twice"
```

---

## Project structure

```
techathon-main/
├── apps/
│   ├── web/       Next.js 15 UI (port 3100)
│   ├── api/       Express + SQLite API (port 4100)
│   └── agent/     LangGraph multi-agent pipeline (port 5000)
├── docs/          Architecture, HLD, LLD, ADRs
├── .env.example   Env template (copy → .env)
├── requirements.txt
├── package.json   npm workspaces root
└── README.md      This file
```

More design detail: [`docs/0. README.md`](./docs/0.%20README.md)

---

## How the LLM is wired

All model calls go through a single gateway (`apps/agent/src/shared/gateway/`).

| Provider | Env vars |
|----------|----------|
| **Groq** (default for local) | `GROQ_API_KEY`, `GROQ_MODEL`, `LLM_PROVIDER=groq` |
| Custom OpenAI-compatible | `LLM_ENDPOINT`, `LLM_MODEL`, `LLM_API_KEY`, `LLM_PROVIDER=custom` |
| OpenAI / Azure / Gemini / Anthropic | See `.env.example` |

Current recommended free path: **Groq** + `llama-3.3-70b-versatile`.

---

## Demo tickets to try

| Message | Expected behaviour |
|---------|-------------------|
| `I was charged twice this month.` | Billing agent |
| `Checkout keeps failing and I was charged twice.` | Multi-agent (Technical + Billing) |
| `Where is my order and is the keyboard back in stock?` | Orders + Products |
| `THIS IS THE THIRD TIME!!! talk to a manager!` | Guard + escalation |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `node` / `npm` not found | Install Node LTS and reopen the terminal |
| Port already in use | Stop the other process, or change ports in `.env` / web config |
| LLM falls back to heuristics | Check `GROQ_API_KEY` and `LLM_PROVIDER=groq` in root `.env`, then restart `dev:agent` |
| Web can't reach API | Ensure `apps/web/.env.local` has `NEXT_PUBLIC_API_URL=http://localhost:4100` |
| `npm install` fails | Delete `node_modules` and `package-lock.json`, run `npm install` again |

---

## Security notes

- Do not paste API keys into chat, screenshots, or commits.
- If a key was exposed, revoke it at [console.groq.com/keys](https://console.groq.com/keys) and create a new one.
- Keep `.env` local only.

---

## Team

Built during internship / techathon. Specialist agents and platform dashboard contributions include Niharika and teammates (see [`docs/0. README.md`](./docs/0.%20README.md) for the full contribution table).
