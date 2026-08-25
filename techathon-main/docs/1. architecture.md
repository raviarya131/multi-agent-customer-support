# System Architecture

Multi-Agent Customer Support Resolution Engine — e-commerce domain

**Docs chain:** [`README.md`](README.md) → **architecture.md** → [`hld.md`](hld.md) → [`technical-decisions.md`](technical-decisions.md) → [`lld.md`](lld.md)

---

## 1. What we built

A **three-service** system that accepts customer support messages, runs them through an **8-step LangGraph pipeline** with **five specialist AI agents**, persists tickets and audit trails, and hands off to **human agents** when policy or risk requires it.

| Concern | Where it lives |
|---------|----------------|
| Customer & admin UI | `apps/web` (Next.js 15) |
| Auth, persistence, HITL, SSE | `apps/api` (Express + SQLite) |
| Classification, agents, synthesis | `apps/agent` (LangGraph + shared framework) |

Services communicate **only over HTTP**. No cross-imports between `web`, `api`, and `agent`.

---

## 2. System context

```mermaid
flowchart TB
    subgraph Users
        C[Customer]
        A[Support Agent]
        AD[Admin / Developer]
    end

    subgraph Platform["Support Engine"]
        WEB[Next.js Frontend<br/>:3100]
        API[Express API<br/>:4100]
        AGENT[Agent Pipeline<br/>:5000]
        DB[(SQLite)]
    end

    subgraph External
        LLM[LLM Provider<br/>OpenAI-compat / Azure / Groq]
    end

    C --> WEB
    A --> WEB
    AD --> WEB
    WEB <-->|REST + SSE| API
    API <--> DB
    API -->|POST /run, /run/stream| AGENT
    AGENT --> LLM
```

---

## 3. Logical architecture (two planes)

```mermaid
flowchart LR
    subgraph Application["Application plane"]
        UI[Presentation<br/>Chat · Dashboards · Platform]
        APP[Application API<br/>Tickets · Escalations · Auth]
        STORE[(Persistence<br/>Tickets · Runs · Escalations)]
    end

    subgraph Intelligence["Agent plane"]
        PIPE[Pipeline orchestrator<br/>8 steps]
        SPEC[Specialist agents ×5<br/>Declarative use cases]
        SHARED[Shared framework<br/>Gateway · KB · Tools · Policies]
    end

    UI <--> APP
    APP <--> STORE
    APP <-->|PipelineState JSON| PIPE
    PIPE --> SPEC
    SPEC --> SHARED
```

| Plane | Responsibility | Stateless? |
|-------|----------------|------------|
| **Application** | Who is the user, what tickets exist, who owns escalations, notifications | No — owns SQLite |
| **Agent** | How to classify, investigate, and compose a reply | Yes — state passed in/out per run |

---

## 4. Deployment view

```mermaid
flowchart TB
    subgraph Monorepo["techathon/ (npm workspaces)"]
        subgraph web["apps/web"]
            PAGES[app/* pages]
            COMP[components/]
            LIB[lib/api · auth · types]
        end

        subgraph api["apps/api"]
            SRV[server.ts]
            RT[routes/<br/>admin · escalations · platform]
            DBM[db/<br/>schema · tickets · collab …]
            COLLAB[collab.ts SSE broker]
        end

        subgraph agent["apps/agent"]
            GRAPH[graph.ts LangGraph]
            NODES[nodes.ts]
            STEPS[steps/*]
            AGENTS[agents/*]
            SHARED[shared/*]
            CFG[runtime-config/]
        end
    end

    web -->|NEXT_PUBLIC_API_URL| api
    api -->|AGENT_URL| agent
```

| Service | Port | Start command |
|---------|------|---------------|
| Web | 3100 | `npm run dev:web` |
| API | 4100 | `npm run dev:api` |
| Agent | 5000 | `npm run dev:agent` |
| All | — | `npm run dev:all` |

---

## 5. End-to-end request flow

```mermaid
sequenceDiagram
    participant C as Customer browser
    participant W as Next.js
    participant A as Express API
    participant D as SQLite
    participant G as Agent pipeline
    participant L as LLM

    C->>W: Type message
    W->>A: POST /api/tickets/stream (Bearer token)
    A->>D: ensureTicket, addMessage, load history
    A->>G: POST /run/stream (PipelineInput)
    
    loop 8 pipeline steps
        G->>L: callLLM (when step uses LLM)
        L-->>G: structured JSON
        G-->>A: SSE progress event
        A-->>W: SSE forward
        W-->>C: Live thought UI
    end

    G-->>A: final PipelineState
    A->>D: saveRun(state_json)
    alt escalation.escalate
        A->>D: createEscalation, pickAssignee
        A-->>C: HITL handoff message
    else resolved
        A-->>C: AI resolution + feedback bar
    end
```

---

## 6. Agent pipeline (8 steps)

```mermaid
flowchart TD
    START([Customer message]) --> G[1 Guard<br/>hard signals]
    G --> CL[2 Classify<br/>intent + FAQ short-circuit]
    CL --> SN[3 Sentiment<br/>conversation-aware]
    SN --> DC[4 Decompose<br/>sub-problems]
    DC --> INV[5 Investigate<br/>parallel fan-out]
    INV --> SV[6 Severity<br/>from findings]
    SV --> EG{7 Escalation gate}
    EG -->|escalate| EH[Escalation agent<br/>handoff plan]
    EG -->|no| SY[8 Synthesize]
    EH --> SY
    SY --> END([Resolution JSON])

    G -.->|force_escalation| EG
    CL -.->|greeting / out_of_scope / faq| SY
```

| Step | Kind | Primary output |
|------|------|----------------|
| Guard | Rule | `guard.force_escalation` |
| Classify | LLM + keywords | `classification` (category, intents, multi-issue) |
| Sentiment | LLM + heuristic | `sentiment` (label, frustration, trend) |
| Decompose | LLM + heuristic | `sub_problems[]` |
| Investigate | LLM per agent | `agent_reports[]`, `investigation` |
| Severity | Rule | `severity.level`, `severity.priority` |
| Escalation | Rule gate + LLM | `escalation.escalate`, team, urgency |
| Synthesize | LLM + template | `resolution` (customer-facing reply) |

**Hard-signal shortcut:** When guard matches (legal, security, human request), decompose routes **only to policy** → `escalate_to_human` — no billing/technical fan-out.

---

## 7. Specialist agent model

```mermaid
flowchart TB
    ORCH[Orchestrator fan-out] --> T[Technical]
    ORCH --> B[Billing]
    ORCH --> P[Policy]
    ORCH --> O[Orders]
    ORCH --> PR[Products]

    subgraph Framework["Shared framework (per agent)"]
        UC[Use case JSONs]
        HAND[Declarative handler]
        TOOLS[Tool pool]
        KB[KB retriever TF-IDF]
        GW[callLLM gateway]
    end

    T & B & P & O & PR --> HAND
    HAND --> TOOLS
    HAND --> KB
    HAND --> GW
```

| Specialist | Domain | Example use cases |
|------------|--------|-------------------|
| Technical | Login, checkout errors, app crashes | `error_diagnosis`, `account_access` |
| Billing | Charges, refunds, payment policies | `explain_charge`, `refund_eligibility`, `payment_policies` |
| Policy | Returns, cancellation, escalation | `return_policy`, `escalate_to_human` |
| Orders | Tracking, cancel/change | `order_tracking`, `cancel_change_order` |
| Products | Catalog, availability | `product_availability`, `product_info` |

Adding a use case = **one JSON file** in `agents/<domain>/usecases/`. Adding a specialist = **agent record** in Platform + `createAgent()` at boot.

---

## 8. Human-in-the-loop (HITL)

```mermaid
stateDiagram-v2
    [*] --> Active: Customer opens ticket
    Active --> AIProcessing: New message (no open escalation)
    AIProcessing --> Active: Resolved, no escalation
    AIProcessing --> Escalated: escalation.escalate = true
    Escalated --> LiveChat: Customer sends follow-up
    LiveChat --> Escalated: Agent replies via /escalations/:id/reply
    Escalated --> Resolved: Agent resolves case
    Resolved --> Active: Customer reopens / new issue
```

| Mode | Trigger | Message path |
|------|---------|--------------|
| **AI pipeline** | No open escalation on ticket | `POST /api/tickets` → full 8-step run |
| **Live human chat** | Open escalation exists | `POST /api/tickets/:id/messages` → human agent inbox |
| **Reopen triage** | Prior escalation resolved | Continuity step decides same owner vs new case |

Escalation assignment: **department** from primary domain → **least-loaded** human agent in that department.


---

## 10. Configuration & observability

```mermaid
flowchart TB
    ADMIN[Platform admin UI] -->|PUT /api/platform/*| API
    API -->|proxy| AGADMIN[Agent /admin routes]
    AGADMIN --> CFG[runtime-config/*.json]
    CFG -->|hot reload| PIPE[Next pipeline run]

    PIPE --> AUDIT[audit_trail in PipelineState]
    AUDIT --> DB[(runs.state_json)]
    AUDIT --> JSONL[logs/audit.jsonl]
    DB --> OBS[Observability UI]
    DB --> TRACE[Trace viewer]
```

| Config surface | File | Effect |
|----------------|------|--------|
| Guard phrases | `policies.json` | Hard-signal escalation |
| Escalation rules | `policies.json` | Which gates may open HITL |
| Intent thresholds | `policies.json` | Multi-issue + fallback |
| Specialist agents | `agents.json` | Routing keywords + teams |
| FAQ | `faq.json` | Pre-LLM canned answers |
| KB articles | `library/*.md` | Per-use-case retrieval scope |

---

## 11. Security boundaries

| Boundary | Mechanism |
|----------|-----------|
| API auth | Bearer session tokens; `requireRole(user \| agent \| admin)` |
| Agent admin | Separate admin token for `/admin/*` on agent service |
| Tool scope | Use case declares allowed tools; handler enforces |
| KB scope | Use case declares allowed files; retriever enforces |
| LLM prompts | `GUARDRAILS_BLOCK` on every system prompt (anti-injection, no fabrication) |
| SSE collab | Token via query string (EventSource limitation) |

---

## 13. Other Points

1. **Separation of concerns** — Application owns persistence and HITL; agent plane is stateless and swappable.
2. **Parallel specialists** — Mixed tickets decompose into independent sub-problems; `Promise.all` fan-out with per-agent timeout.
3. **Traceability** — Every customer-facing word traces to `agent_reports` + `audit_trail`; reasoning/evidence never LLM-invented in synthesis.
4. **Meaningful escalation** — Gate driven by risk signals and repeat frustration, not every `needs_info`; security/legal hard-signals bypass multi-domain split.
