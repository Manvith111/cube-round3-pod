# agents/returns/  ·  Returns Manager

**Owner:** @Srikar-segmentation-fault  ·  **Agent id:** `returns-manager@1.0.0`  ·  **Mode:** in-process Python (`handle()`), HTTP optional

Checks a returned item from photos: is it what was sold (identity), is it complete, what condition is it in (Amazon's published scale), and what should happen to it (`restock`, `refurbish`, `liquidate`, `dispose`, `pending_review`).

> **Read this first: what has and has not been tested.**
> - The **real model path has only been tested with a fake model**, not a live API. No real VLM call has been made from this folder inside the Pod. The Round 2 code ran against a live Groq model in Round 2; that does not count as a test of this adapter.
> - The **CSV replay is a labelled replay**, not this agent's judgment. It runs when a request has no photos (the sample units the contract tests use). It copies the operator's disposition from the organiser's sample CSV. Its records say `model.name: "csv-replay"`, `model.calls: 0`, and `payload.replay: true`.

## What it does

`app.py` is a thin adapter. The Round 2 agent lives untouched in `core/rtn/` (only its import paths changed). Which of three paths runs depends on the request:

| Request has | Result |
|---|---|
| Photos **and** `VLM_API_KEY` | **Real agent.** One batched vision-model call per unit, then Round 2's deterministic rules grade condition on Amazon's scale and choose a disposition. |
| Photos, but no key, or the model/any dependency fails, or photos are unusable | A **pending** record (`status: pending`, `verdict: UNCERTAIN`, `needs_human: true`). It is never a silent replay. |
| No photos | A **labelled CSV replay** of the sample row (see above). |

Always: if the unit is not under `subject.org_id` in the Returns data, `handle()` raises `LookupError` (HTTP 404). No other org's data is read.

## Inputs

- **Photos** are the orchestrator's `inputs[]`, found in `data/input/<subject_id>/returns/`. Name them **`reference_*`** (catalogue photos of the item as sold) and **`returned_*`** (the returned item). At least one of each is needed; otherwise the result is a pending record. Only files under that subject's folder are ever read.
- **Order info and expected parts** (SKU, ASIN, parts list) come from `returns_sample.csv` via `shared.utils.sample_data`. The CSV has no product name, so the SKU is used as the name. Every part is treated as essential because the CSV has no essential flag.
- **Previous evidence** (Pack, Receiving) is listed in `upstream_refs` and `payload.upstream_considered`, with the latest override applied to each record's verdict. It is **not used in any judgment**: the model never sees it and no check cites it.

## Output

Checks (verdict is `PASS` / `FAIL` / `UNCERTAIN`; `UNCERTAIN` always carries a reason and is never turned into `PASS` or `FAIL`):

| `check_key` | `PASS` | `FAIL` | `UNCERTAIN` |
|---|---|---|---|
| `identity_match` | MATCH | NO_MATCH | VLM unsure, poor evidence, or model and embedding disagree |
| `completeness` | all parts present | a part is missing | a part could not be seen |
| `condition` | graded on Amazon's scale | never used | evidence too poor to grade |

The grade goes in `payload.amazon_condition`. An `UNSELLABLE` item is **not** a `FAIL`: the item did come back, and the outcome is still a disposition. **This mapping is provisional and needs Pod confirmation (finding F-11).**

`decision.outcome` is the disposition in lowercase. If it is `pending_review`, the verdict is never `PASS` and `needs_human` is true.

The model block is `{name: <model id>, version: "unpinned", calls: 1, cost_usd: null}`. `cost_usd` is null because the provider price is unknown, and `payload.cost_note` says so.

## Run it

```sh
# The real path needs these (imported lazily, not in the Pod's requirements.txt yet):
pip install "openai>=1.40,<2" "pydantic-settings>=2.3,<3" "tenacity>=8.2,<9" "python-dotenv>=1.0,<2"
# Environment variable names (values in your own .env, never committed): see .env.example
#   VLM_API_KEY  VLM_BASE_URL  VLM_MODEL  VLM_TIMEOUT_SECONDS  VLM_MAX_RETRIES

uvicorn agents.returns.app:app --port 8104     # GET /health, POST /run
curl localhost:8104/health
```

Set `"mode": "http"` in `agent.json` only if you want the orchestrator to call it over HTTP. The default is in-process.

Tests:

```sh
pytest agents/returns/tests agents/returns/core/tests   # adapter + the copied Round 2 tests (not part of `make test`)
pytest                                                  # the Pod's suite
```

The replay path and the Pod's `make test` need none of the extra packages.

## Limits

- **No live-API test of the real path** (see the box at the top). Prompt, schema strictness, latency, and real-photo quality are unverified inside the Pod. No Round 2 evaluation numbers are repeated here.
- **Time budget:** the Round 2 client allows 45 s per attempt and retries transient API errors up to `VLM_MAX_RETRIES` times, which can exceed the orchestrator's default 30 s `timeout_s` over HTTP. In-process mode does not enforce the timeout. `model.calls` reports 1 batched call per unit; retries are not counted.
- **Previous evidence is not used for judgment.** Cross-checking against what Pack sent or Receiving's arrival condition is not implemented.
- **Condition-to-verdict mapping is provisional** (F-11), and disposition rules are Round 2's own, not an Amazon rule.
- **Identity fusion** (image-embedding similarity) is a Round 2 stub that is switched off, so identity rests on the VLM alone plus the evidence-quality gate.
- **The model name has no pinned version**: the provider does not return a snapshot id, so `version` is `"unpinned"`.
- `core/rtn/api/` (the Round 2 web UI) is copied for completeness and is not used.
- A content hash is not tamper-evidence.

More detail, test results and Pod questions: [`INTEGRATION-NOTES.md`](INTEGRATION-NOTES.md). Origin: [`PROVENANCE.md`](PROVENANCE.md).
