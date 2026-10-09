# Integration notes: Returns Manager

Owner @Srikar-segmentation-fault. Branch `test`. Everything changed is under `agents/returns/`, plus appended comment lines in `.env.example`.

## 1. What was found, copied and changed

**Found:** `agents/returns/` held the organiser stub (`app.py`, `agent.json`, `README.md`, `__init__.py`) that replays `returns_sample.csv`. The Round 2 code was *not* in the folder, so it was **copied** in from the owner's local clone of the Round 2 repo (`4efa167`, see `PROVENANCE.md`). The Round 2 clone was only read, never modified.

**Copied** (into `agents/returns/core/`): `rtn/` (schemas, perception, policy, audit, `reference_data/amazon_condition_scale.json`, and the unused Round 2 web UI under `rtn/api/`) and `tests/`. 32 files, about 108 KB.
**Not copied:** `.env`, `evidence_store/`, `data/` (uploads and about 16 MB of fixture images, rule R9), Round 2 docs, deploy files.

**Changed in the copy:** only import paths (`rtn.` became `agents.returns.core.rtn.`) in 16 files, plus a `pytest.importorskip("pydantic_settings")` guard in `core/tests/test_tenant_isolation.py`. Prompts, rules and schemas are unchanged. No test was deleted or weakened.

**Added:** `app.py` (adapter, replaces the stub), `agent.json`, `README.md`, `PROVENANCE.md`, this file, `tests/test_adapter.py`, `core/__init__.py`, `tests/__init__.py`.

**Outside the folder:** `.env.example` has Returns variable names appended (commented placeholders). No existing line was changed. Nothing else outside `agents/returns/` was touched.

## 2. What the adapter does

- Looks up the unit in the Returns sample data under `subject.org_id`; not found raises `LookupError` (HTTP 404).
- **Photos + key:** one batched model call via Round 2's pipeline (storage replaced by a no-op), mapped to checks `identity_match`, `completeness`, `condition`, built with `build_record()` / `build_output()`.
- **Photos but no key, or any error:** `pending_output(...)`. Never raises, never replays.
- **No photos:** a labelled CSV replay (`model.name: csv-replay`, `calls: 0`). Not this agent's judgment.
- Previous evidence goes in `upstream_refs` and `payload.upstream_considered` (latest override applied). It is not used in any judgment.

## 3. How to run it

```sh
uvicorn agents.returns.app:app --port 8104          # HTTP: GET /health, POST /run
pytest agents/returns/tests agents/returns/core/tests
```

The real path needs the packages and variables in section 5. `agent.json` stays `"mode": "inproc"`.

## 4. Test results

Environment: Windows, PowerShell, Python 3.14.7. **`make` is not installed**, so the Makefile steps were run by hand with the repo's `.venv`. The real-API and Makefile-based runs are therefore not done.

**Commands run** (all inside `cube-round3-pod`):

```sh
python -m venv .venv                                  # make setup, step 1
cp .env.example .env                                  # make setup, step 2 (placeholders only; git-ignored)
.venv/Scripts/python -m pip install -r requirements.txt
.venv/Scripts/python -m pytest                        # make test, run before AND after my changes
.venv/Scripts/python -m orchestration.run --unit UNIT-0014 --org org_demo_alpha    # make case
.venv/Scripts/python -m pytest agents/returns/tests agents/returns/core/tests
# local only, not committed: pip install openai tenacity pydantic-settings python-dotenv  (to run the fake-model tests)
```

**Pod suite (`pytest`, same as `make test`):**

| | failed | passed | skipped |
|---|---|---|---|
| Before my changes (clean `origin/test`) | 6 | 86 | 1 |
| After my changes | 6 | 86 | 1 |

The set of failing tests is identical before and after: **0 new failures, 0 fixed.**

**The 6 pre-existing failures** (all fail on untouched `origin/test`; none are Returns tests; I did not edit `orchestration/` or `tests/`):

1. `tests/e2e/test_end_to_end.py::test_claim_names_amount_and_cites_evidence`: "sample data should contain at least one claim".
2. `tests/e2e/test_end_to_end.py::test_captures_in_data_input_become_content_addressed_inputs`: expected `UNIT-0001/receiving/carton.jpg`, got `UNIT-0001\receiving\carton.jpg`. **Looks Windows-specific**: `discover_inputs()` in `orchestration/orchestrator.py` builds refs with `str(path.relative_to(...))`, which uses backslashes on Windows. (This also means Returns refs arrive with backslashes on Windows; the adapter accepts both.)
3. `tests/e2e/test_examples.py::test_example_cases_still_produce_the_documented_outcome[happy-path]`: got `BLOCKED / NEEDS_REVIEW`, expected `COMPLETED / CLEAN`.
4. `tests/e2e/test_examples.py::test_example_cases_still_produce_the_documented_outcome[end-to-end]`: got `BLOCKED / NEEDS_REVIEW`, expected `COMPLETED / ...`.
5. `tests/e2e/test_http.py::test_dead_agent_is_recorded_not_hidden`: expected `agent_unavailable`, got `agent_timeout`. Possibly environment-related; not investigated.
6. `tests/integration/test_agent_contracts.py::test_recovery_honours_overrides_of_previous_evidence`: got `SILENT`, expected `CONTRADICTS`.

Likely link for 3, 4 and 6 (**not verified**): in the `make case UNIT=UNIT-0014` run, Prep returned `UNCERTAIN / pending_review` (it needs a Gemini key), which makes the workflow `BLOCKED` and leaves Recovery's Prep-based charge `SILENT`. 1, 2 and 5 have different visible causes.

**Returns-only tests:**

| Run | Result |
|---|---|
| `agents/returns/tests` (adapter), optional packages installed | 20 passed |
| `agents/returns/core/tests` (Round 2), optional packages installed | 44 passed |
| Same, optional packages **not** installed | adapter 14 passed / 6 skipped; core 42 passed / 1 skipped |

These are outside the Pod's `testpaths`, so `make test` does not collect them.

**`make case UNIT=UNIT-0014 ORG=org_demo_alpha` (equivalent):** all five stages ran. Returns completed as `PASS / liquidate` (a labelled replay, since no photos). Overall workflow `BLOCKED / NEEDS_REVIEW` because of Prep's UNCERTAIN, not Returns.

**Checked specifically:**
- Wrong tenant is refused: `LookupError` in-process; HTTP `404` on `/run` (checked with FastAPI's test client, which also returned `200` for the right org and `ok` on `/health`).
- A forced model error gives a `pending` record, with no checks, `UNCERTAIN`, `needs_human: true`.
- Photos without a key give `pending`, not a replay.
- An `UNCERTAIN` case stays `UNCERTAIN` on both the replay and the (fake-model) real path.
- Refs pointing at another subject, `..`, or absolute paths are never read.

**NOT verified:** the real path against a live model. All real-path tests use a fake VLM client. Real photo quality, prompt behaviour, latency, rate limits and the actual `VLM_*` settings are untested inside the Pod.

## 5. Dependencies

**Packages for the Pod's `requirements.txt`** (not edited by me; imported lazily, only on the real path). Versions I tested with:

```text
openai>=1.40,<2            # tested 1.109.1
pydantic-settings>=2.3,<3  # tested 2.15.0
tenacity>=8.2,<9           # tested 8.5.0
python-dotenv>=1.0,<2      # tested 1.2.4
```

(`pydantic` itself already arrives through `fastapi`.)

**Environment variable names** (already appended to `.env.example`, placeholders only): `VLM_API_KEY`, `VLM_BASE_URL`, `VLM_MODEL_GROQ` (not `VLM_MODEL`: the Pack agent already uses that name for its Gemini model), `VLM_TIMEOUT_SECONDS`, `VLM_MAX_RETRIES`. Optional: `INPUT_DIR` (already listed in the Pod's example). `GEMINI_API_KEY` is **not** used.

**Hosted services / databases:** one external service, an OpenAI-compatible vision-model endpoint (Round 2 default: Groq at `https://api.groq.com/openai/v1`; the model name is read from `VLM_MODEL_GROQ`, with no default in the Pod's example). No database. Round 2's local JSONL evidence store is disabled; the orchestrator owns storage.

## 6. Open questions that need the Pod

My assumption is stated for each. I have not acted outside `agents/returns/` on any of them.

1. **Capture filename convention** (shared `data/input/` convention). The orchestrator only lists files in `data/input/<subject>/returns/`, with no roles. I use `reference_*` and `returned_*` filenames. Other agents may expect something else.
2. **Order info comes from the sample CSV** (data source). SKU, ASIN and parts list are read from `returns_sample.csv` via `shared.utils.sample_data`. It has no product name (the SKU is used) and no essential-part flag (all parts are treated as essential, which can push a missing part to `UNSELLABLE`). Where should real order data come from?
3. **Condition mapping is provisional, needs Pod confirmation (F-11).** `identity_match` and `completeness` map directly. `condition` is `PASS` when graded and `UNCERTAIN` when `UNDETERMINED`; the grade is in `payload.amazon_condition`; `UNSELLABLE` is not a `FAIL`. Recovery reads a Returns `PASS` as "the item came back" for `refund_issued_item_not_returned`, so this choice affects claims. Also F-11 itself (FBA-routed units having a seller-side Returns record) is unresolved.
4. **Disposition values are lowercased.** Round 2 uses `RESTOCK` etc.; the contract uses `restock`, `refurbish`, `liquidate`, `dispose`, `pending_review`. `PENDING_REVIEW` becomes `pending_review`.
5. **Replay in the contract tests.** The Pod's tests send no photos, so Returns answers with a labelled replay, which copies the operator's disposition. Should the Pod accept a replay in the flow, or should the tests ship photo fixtures?
6. **`unit_scope` and F-08.** I use the default `unit_scope: "unit"` for Returns records, with `order_id`, `sku` and `asin` in `subject.refs`. Not independently checked against F-08.
7. **Upstream evidence is listed but not used.** Cross-checking against Pack contents or Receiving's arrival condition would be new logic. Not done.
8. **Time budget.** The Round 2 client can exceed the default 30 s `timeout_s` with retries when run over HTTP; in-process mode does not enforce it.
9. **`client_id`** is set to `org_id` for Round 2's schema, since the Pod contract has no client concept. `captured_at` for real runs is taken from the sample row, not from the photos.
10. **`requirements.txt`**: someone on the Pod needs to add the four packages above. Until then, the real path returns a `pending` record that names the missing package.

Not touched or affected by Returns: F-07, F-09, F-10, F-12.

## 7. Still a stub or not working

- The **CSV replay** is a labelled replay of organiser data. It is not an agent decision.
- The **real model path is untested against a live API** (section 4).
- **Embedding fusion** for identity is a Round 2 stub that is off.
- **Previous evidence** is not used in judgments.
- `core/rtn/api/` (Round 2 web UI) is present but unused.
- `make` could not be run on this machine; its steps were done by hand.
- The 6 pre-existing failures above remain.
