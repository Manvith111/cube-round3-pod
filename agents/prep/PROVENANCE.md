# Provenance — Prep Manager

| | |
|---|---|
| **Round 2 origin** | OpsConsole Prep Manager ("Pancha Pandava") — the judged, complete module |
| **Owner** | @Manvith111 |
| **Original stack** | TypeScript / Next.js (Cloudflare), multi-provider vision (Gemini / Anthropic / OpenAI) |
| **What was ported** | The decision design was ported faithfully to Python for in-process orchestration: the FBA v1 rule pack (`rules.py`, from `src/lib/prepRequirements.ts`), the "AI observes / rules decide" split, the Gemini observation prompt (`vision.py`, from `src/lib/vision.ts`), and the deterministic engine (`evaluate` in `app.py`, from `src/lib/rules.ts`). |
| **What changed for Round 3** | Output is mapped onto the shared Evidence Contract (`shared/utils/records.py`); the 5-value Round 2 verdict is reduced to the contract's `PASS/FAIL/UNCERTAIN` (NOT_APPLICABLE / NOT_VERIFIABLE checks are omitted from `checks[]` and summarised in `payload.manual_checks_required`). Photo bytes are read from the orchestrator's content-addressed `inputs`. |
| **Honesty notes** | This is a content-hashed record, not tamper-evidence. `payload.measurements` is `null`: this agent is camera-only and does not physically measure weight/dimensions (finding F-07). Without an API key the agent returns honest UNCERTAIN records — that is not the agent "passing". |
