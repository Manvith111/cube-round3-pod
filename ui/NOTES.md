# Notes for the Pod

## Changes made outside `ui/` (with the owners' permission)

- `agents/receiving/app.py`, `agent.json`: rewritten. Photos are analysed **one model call per photo** (requested by the Pod lead), via an OpenAI-compatible vision endpoint (Groq): `VLM_API_KEY`, `VLM_BASE_URL`, `VLM_MODEL_GROQ`. The model only observes; fixed rules turn each observation into PASS/FAIL/UNCERTAIN; checks are combined across photos; each photo's result is kept in `payload.per_image`. No photos: a labelled CSV replay (`csv-replay`, calls 0). Photos but no key or all calls failed: a `pending` record. Optional `progress_hook` lets a host watch progress. **This departs from the "one batched model call per unit" rule.** Replaces the old code, which called a shut-down model (`gemini-2.0-flash`, off since 2026-06-01) with file names only, never the image data.
- `agents/returns/core/rtn/config.py` (+ docs, one line of `.env.example`): the Groq model is now read from `VLM_MODEL_GROQ`, not `VLM_MODEL`, because Pack reads `VLM_MODEL` for its Gemini model and both run in one process.
- Nothing else in `orchestration/`, `shared/`, `tests/`, `data/sample/`, `data/expected/` or `flow.json` was changed.

## Requests for the Pod

1. **Pack and Returns share `VLM_MODEL`** (a Gemini name vs a Groq name). Fixed for Returns/Receiving above; Pack should get its own name.
2. **Prep, Pack, Recovery default to `gemini-2.5-flash`**, which new Google keys cannot use ("no longer available to new users"). Make the model name configurable per agent.
3. **Pack labels every non-JPEG as `image/png`**, wrong for `.webp` (suspected, never confirmed by a successful run). It also sends all images in one call.
4. **Recovery ignores images** and calls the model with text only; Prep returns UNCERTAIN with no photos. The repo's golden tests expect COMPLETED/CLEAN for sample units, so 4 tests fail on `test`.
5. **Captures are stored by unit id only, not by org** (`data/input/<unit>/<stage>/`). In the wrong-company test the orchestrator still sent the images to the agent before the agent refused. Consider an org level in the path.
6. **No shared naming rule for Receiving, Prep, Pack images.** The UI saves `1.jpg`, `2.png`, ... Returns uses `reference_*` / `returned_*`. Please agree one rule.
7. **Returns condition:** a Groq vision model accepted at most 3 images per call; the agent sends every reference and returned photo in one call. The UI sends one pair.
8. **`.env.example`** still describes only `GEMINI_API_KEY` for Receiving; update it to the Groq settings.
9. **`data/input/UNIT1/`** (original test images) is untracked but not ignored; do not `git add .`.
10. **Windows:** `discover_inputs` returns backslash refs, and the dead-agent test gets `agent_timeout` instead of `agent_unavailable`; 2 of the repo's own tests fail for that reason.
11. **UI limits seen in the orchestrator:** it has no single-stage entry point (the UI builds a one-step flow in memory), and no override can be applied before a workflow exists.
12. **Agent down test:** supported. The UI points the orchestrator's own `HttpClient` at a closed port; all agents are `inproc` in `agent.json`.

## Test results so far (real agents, `test` branch, 2026-10-09)

| Track | Unit and images | Saved to | sha256 matched | Verdict | Source | Problems |
|---|---|---|---|---|---|---|
| Receiving | UNIT-0014, 7 files (`1.png` ... `7.jpg`) | `data/input/UNIT-0014/receiving/` | yes in an earlier run of the same 7 files; not re-checked in the latest Groq run | FAIL (combined) | real model `qwen/qwen3.8-27b`, 7 calls, one per photo | many UNCERTAIN checks; Groq rate-limit waits of ~23 s per photo; identity FAIL is likely because the test photos do not show the product the sample data describes for UNIT-0014 (not checked by hand) |
| Prep | UNIT-0014, no image | none | n/a | UNCERTAIN | no model call | no Prep image supplied |
| Pack | UNIT-0008, 4 files (`1.jpg` ... `4.webp`) | `data/input/UNIT-0008/pack/` | yes | none (error) | no model answer | Gemini 429 (quota), then 403 "project denied access" on the replacement key |
| Returns | UNIT-0014, pair 1 (`reference_1.png` + `returned_1.png`) | `data/input/UNIT-0014/returns/` | yes (2 of 8 files sent) | FAIL, confidence 0.5 | real model `qwen/qwen3.8-27b`, 1 call | verdict varied between runs of the same pair; pair 1 is two stray files from an earlier session, `returned_1.png` equals `reference_3.png` |
| Recovery | UNIT-0014, no image | none | n/a | none (error) | no model answer | Gemini 429, then blocked project |

- **Not verified:** a full workflow with every agent giving a real answer (Gemini was blocked). A full run on 2026-10-09 ended `FAILED` because Recovery errored; Returns gave a real answer in it.
- **Safety checks:** wrong company, no image and agent down were run on the earlier stub branch and behaved as described (refusal recorded as `agent_rejected`; dead agent recorded as an error, never success). They were not re-run on the real agents.
- **Override:** the endpoint works (OVR-001 recorded, original record unchanged); an override that changes the outcome was not tested.
- **Schemas:** Agent Output and Evidence Record validated in every run that produced a record.
- **Receiving schema/hash/tenancy** were also checked offline with fake model answers (no network).

## Assumptions and open questions

- Units come from `data/sample/cases.json`; `UNIT-0014` (fba, returned) and `UNIT-0008` (mfn) were used.
- Free-tier Gemini limits are unofficial figures from a third-party page; not verified on the key.
- Should the Groq vision model be the default for Receiving, or should Gemini return once a working key exists?
- Which Prep image should be used for the Prep test?

## Prep, Pack and Recovery moved from Gemini to Groq (2026-10-09)

Done at the Pod lead's request, because Gemini keys were blocked for the test project. All five agents now use one provider and the same settings (`VLM_API_KEY`, `VLM_BASE_URL`, `VLM_MODEL_GROQ`). Files changed outside `ui/`:

- `shared/utils/groq_vision.py` (new): one OpenAI-compatible chat call with the same retry and rate-limit handling as Receiving. The key goes in a header only.
- `agents/prep/vision.py`, `agents/pack/app.py`, `agents/recovery/app.py`: the Gemini call is replaced; the rules engines are unchanged. `agent.json` of each, `.env.example` and `ui/README.md` updated. `ui/envfile.py` no longer copies `VLM_MODEL` to `PREP_MODEL` / `MODEL_NAME` (nothing reads them now).
- **Groq's vision model takes at most 3 images per request** (from Groq's docs). Prep and Pack now send photos in groups of 3 (`VLM_MAX_IMAGES`) and merge the observations cautiously; a unit with 4 photos makes 2 calls. This departs from the old one-call-per-unit rule. Merge rules: a sighting in any group counts as seen; two confident counts that disagree give no count (UNCERTAIN); Prep keeps the decisive, most confident observation per check.
- A model told to answer in JSON is not held to a schema the way Gemini was, so Prep and Pack check every value first; anything odd becomes the cautious value, never a PASS or FAIL.
- **Bug fixed in Pack** (it affected the Gemini path too): check names such as `line.presence.SKU-1` do not match the Evidence schema (`^[a-z][a-z0-9_]*$`), so the orchestrator rejected every real Pack record as `invalid_output`. They are now `line_presence_sku_1`. Also `.webp` photos are no longer labelled `image/png`.
- Pack and Prep no longer report a cost (`cost_usd` is null): the old figure was Gemini pricing.
- Recovery makes the same single call as before; as before, its rules decide every charge and the model's reply does not change a verdict.

Verified with the real model (`qwen/qwen3.8-27b`) through the UI backend: Prep on UNIT-0014 (1 call), Pack on UNIT-0008 (4 photos, 2 calls, record accepted), Recovery on UNIT-0014 (1 call). The repo's tests give the same 6 failures as before this change. Not verified: answer quality (for example, whether Pack's "extra item" FAIL on UNIT-0008 is right), and a full workflow with every agent answering.
