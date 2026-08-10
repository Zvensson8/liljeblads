# Agent-grafer i Liljeblads

Mål: **små, styrda grafer** — inte 100 autonoma agenter.  
Alltid **org-scopade**, alltid **loggade**, auto endast om policy tillåter.

## Gemensamma principer

| Princip | Implementation |
|---------|----------------|
| Org-isolering | Aktiv org + `organization_id` + RLS |
| HITL default | `ai_suggested_actions` (pending) före write |
| Policy | `organization_agent_policies` + `agentPolicy.ts` |
| Körlogg | `agent_runs` / `agent_processed_files` |
| Cron-auth | `x-cron-secret` (`cronAuth.ts`) |

```text
Trigger → Guard(org/policy) → Fetch → Analyze → Propose/Write → Notify → Log
                ↑________________ feedback (accept/reject) ______________|
```

---

## 1. Service / risk-graf (ROI #1)

**Status:** i produktion via `risk-suggest-actions` + `riskSuggestions` + `riskFeedback`.

```text
[cron vecka/dag] → [per org]
  → hämta properties/components
  → Weibull/risk batch
  → filtrera policy (nivå, confidence, typ)
  → dedupe (öppen WO / pending förslag)
  → insert ai_suggested_actions (pending)
  → (valfritt) notis admin
  → snapshots

[WO completed] → stäng risk-förslag + snapshot  (riskFeedback)
[approve/reject] → finjustera trösklar          (riskPolicyTuning)
```

| Nod | Kod |
|-----|-----|
| Fetch + rank | `supabase/functions/risk-suggest-actions` |
| Policy | `organization_agent_policies`, `src/lib/agentPolicy.ts` |
| UI HITL | `AIActionCard`, `PendingActionsWidget`, `AgentActivity` |
| Feedback WO | `src/lib/riskFeedback.ts` |
| Trösklar | `src/lib/riskPolicyTuning.ts` |

**Cron (rekommenderat):**

```text
# Veckovis måndag 06:00 UTC (eller behåll daglig 0 6 * * *)
0 6 * * 1  → risk-suggest-actions
```

**Kör manuellt:**

```powershell
$secret = ...
Invoke-RestMethod -Method POST `
  -Uri ".../functions/v1/risk-suggest-actions" `
  -Headers @{ "x-cron-secret" = $secret; "Content-Type" = "application/json" } `
  -Body '{}'
# En org: body { "organization_id": "<uuid>" }
```

---

## 2. Jarvis-graf (PDF → WO)

**Status:** LangGraph i `jarvis-worker` (`graph.py`). Utökad med match-kvalitet + misslyckad-match-nod.

```text
start_run → discover → parse → extract
  → match (property + component + score)
  → branch:
       high confidence + live → create_work_order
       hitl / low confidence  → suggest_work_order (HITL-kö)
       no property match      → failed_match (status failed, failed/)
  → mark_processed → archive/failed → finish_run → e-post
```

| MODE | Beteende |
|------|----------|
| `live` | Direkt WO om match OK |
| `hitl` | Alltid pending förslag (rekommenderat) |
| `dry_run` | Ingen write |

Osäker match: score under tröskel → tvinga HITL även i `live`.

---

## 3. Org-onboarding (multi-org)

**Status:** UI-checklista (semi-agent, ingen auto-skriv).

```text
[dashboard load] → kolla aktiv org:
  saknar fastigheter?
  saknar fler medlemmar?
  saknar logotyp?
  saknar pending AI-förslag att granska?
→ visa "Nästa steg"-kort med länkar
```

Kod: `src/components/dashboard/OrgOnboardingChecklist.tsx`

---

## 4. Drift-måndagsrapport

**Status:** edge function `weekly-org-digest`.

```text
[måndag 07:00 UTC] → per org
  → WO öppna + förfallna
  → todos förfallna
  → pending risk-förslag
  → (valfritt) LLM-sammanfattning
  → Resend till org owner/admin e-post
```

```text
0 7 * * 1  → weekly-org-digest
```

Kräver `RESEND_API_KEY`. Utan nyckel: function returnerar dry-run stats.

---

## 5. Chat som orchestrator

**Status:** `ai-chat` + `jarvisTools` (tools redan multi-tool).

```text
User message
  → Guard: JWT + active/membership org
  → Planner: model + tool schemas
  → Executor: jarvisTools (list_*, risk, suggest_*)
  → Guard: tool args scoped till org
  → Response + optional ai_suggested_actions
```

Ingen monolitisk ombyggnad — guard + org från `profiles.active_organization_id`.

---

## Prioritering

| # | Graf | Nästa förbättring |
|---|------|-------------------|
| 1 | Risk | Veckocron + tröskel-tuning (klart i kod) |
| 2 | Jarvis | Match-score + failed_match (klart i worker) |
| 3 | Onboarding | Checklist-widget (klart i UI) |
| 4 | Måndagsrapport | Deploy `weekly-org-digest` + cron |
| 5 | Chat | Org-guard på tools (förstärkt) |

## Anti-mål

- Agenter som skriver om sin egen kod i prod  
- Cross-org automation utan founder-kontext  
- 10+ parallella agenter utan mätbar nytta  
