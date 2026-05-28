# BloxSmith.pro Pro Features Roadmap

This is a large scope (17+ features). I'll ship it in **3 phases** so you get value fast and can steer between phases. Each phase ends with a working preview you can test in Studio.

## Phase 1 — Core agent + trust (ship first)

The "must-have" set you ranked highest. Makes BloxSmith feel like a real builder, not a chatbot.

1. **Build Agent mode** — new toggle in the project chat. AI returns a structured plan (scripts, folders, RemoteEvents, DataStore, UI, monetization) + a **Build This In Studio** button that queues all `plugin_actions` at once.
2. **AI Task Board** — plan items render as cards with Build / Edit / Skip / Regenerate buttons. Backed by a new `project_tasks` table.
3. **Studio Sync Status panel** — top-of-project widget showing plugin connection, place name, Studio mode, last sync, MCP status, credits. Extends existing `plugin_connections` + `plugin_context`.
4. **"See It In Studio" preview** — after each generation, show a tree of what was inserted and where, with a "How to test it" snippet. Derived from existing `actions` snapshots.
5. **Fix Console Errors** — paste-box on project page. AI analyzes, locates the file in `project_files`, proposes a fix, queues a sync. Logs to `studio_errors`.
6. **Version History + Rollback** — promote the existing per-message Revert into a full version timeline page. Uses existing `agent_messages.actions.snapshot`.

## Phase 2 — Content & monetization

Features that pull users in and help them ship games.

7. **Game Idea Generator** — category-filtered AI page returning name, loop, features, monetization, difficulty, **Build** button (feeds Build Agent).
8. **Template Store** — new `/templates` route + `templates` table. Seed with 12 starter kits (free + credit-gated). One-click clone into a new project.
9. **Monetization Builder** — guided UI generating Gamepass / DevProduct / VIP scaffolds with full Lua + insertion plan.
10. **Script Placement Checker** — lint pass on every AI output and on demand: flags wrong Script/LocalScript, wrong service location, missing RemoteEvents.
11. **Prompt Enhancer** — "✨ Improve" button next to the chat input. Rewrites short prompts into rich specs, asks before sending.

## Phase 3 — Premium / depth

Differentiators vs. generic AI chat.

12. **AI Game Doctor** — full project scan: broken scripts, security holes (RemoteEvents without checks), DataStore misuse, exploit risks, performance flags. Output as a report page.
13. **Game Analytics Helper** — paste stats form → AI diagnosis with concrete fixes.
14. **Update Generator** — Create Update button: patch notes, new content idea, Discord post, Roblox page update, all in one.
15. **Roblox Page Writer** — title/description/tags/badges/gamepass/social copy generator.
16. **Marketplace** — extension of Template Store for individual systems (coin, pet, shop, sword, admin, NPC dialogue).
17. **Team Projects polish** — existing collaborators get shared chat (already partial), permissions UI, build history.

## Technical notes (skip if not interested)

```text
DB additions (Phase 1):
  project_tasks(id, project_id, user_id, plan_id, title, kind,
                status, payload, position, created_at, updated_at)
  build_plans(id, project_id, user_id, prompt, plan jsonb,
              status, created_at)
  Phase 2 adds: templates, template_installs
  Phase 3 adds: project_scans, game_analytics_reports

Server fns (new in src/lib/):
  build-agent.functions.ts     plan()/buildAll()/buildTask()
  tasks.functions.ts           CRUD + reorder
  errors.functions.ts          analyzeError()/fixError()
  templates.functions.ts       list/clone
  monetization.functions.ts    generateMonetization()
  scanner.functions.ts         scanProject()
  analytics.functions.ts       analyzeStats()
  enhance.functions.ts         enhancePrompt()

Reused infra:
  - Lovable AI Gateway (already wired in ai.functions.ts)
  - existing plugin_actions queue → Studio sync (unchanged contract)
  - existing spend_credits_atomic for paid actions
  - existing agent_messages.actions.snapshot for version history
  - Build Agent uses tool calling (createFile/editFile/queueInsert)
    with stopWhen: stepCountIs(50)

New routes:
  /project/$id  → adds BuildAgentPanel, TaskBoard, SyncStatus,
                  ErrorFixer, VersionTimeline tabs
  /templates    → store
  /ideas        → idea generator
  /tools/doctor /tools/analytics /tools/page-writer (Phase 3)

Credit costs (suggested, configurable):
  Build Agent plan        2
  Build Agent execute     5 + 1/task
  Fix error               1
  Doctor scan             5
  Template clone          0 (free) or 10 (premium kits)
```

## What I need from you

**Approve this plan and I'll start Phase 1 right away.** Phase 1 ships as one preview build. Want me to start there, or re-order anything?
