# Pod Test UI

A small local web page for checking that **image input, processing and output work** in the Round 3 Pod system. You choose a track, add images, run it through the real orchestrator, and see exactly what it returned.

It is a test harness, not part of the product. It calls the existing orchestrator (`orchestration/orchestrator.py`) and shows the answer. It does not judge anything itself.

## Run it

Python 3.11+, from the repo root:

```powershell
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe -m ui.server
```

Open http://127.0.0.1:8200. Change the port with `UI_PORT`.

The server listens on `127.0.0.1` only and has **no login**. Do not expose it. It reads `.env` in the repo root when it starts, so restart it after editing `.env`.

Extra packages used by some agents (not in `requirements.txt`, install into the venv only): `openai`, `pydantic-settings`, `tenacity`, `python-dotenv` (Returns), `google-genai` (Pack, Recovery).

## Settings (`.env`, names only)

| Variable | Used by |
|---|---|
| `VLM_API_KEY`, `VLM_BASE_URL`, `VLM_MODEL_GROQ` | Returns and Receiving (an OpenAI-compatible vision endpoint, Groq by default) |
| `GEMINI_API_KEY` | Prep, Pack, Recovery |
| `VLM_MODEL` | Pack's Gemini model name. The UI also copies it to `PREP_MODEL` (Prep) and `MODEL_NAME` (Recovery) |
| `GROQ_API_KEY` | copied to `VLM_API_KEY` by the UI if `VLM_API_KEY` is not set |

Keys stay on the server. They are never sent to the browser or printed.

## Using it

1. **Choose a track** (Receiving, Prep, Pack, Returns, Recovery).
2. **Choose a unit.** Company (`org_demo_alpha` or `org_demo_bravo`) and a unit ID that exists in `data/sample/`. Test units used so far: `UNIT-0014` (fba, returned) and `UNIT-0008` (merchant-fulfilled).
3. **Add images.** Upload, or copy from file paths. Files are saved to `data/input/<unit>/<stage>/`, the place the orchestrator already looks. Originals are only read. Nothing is overwritten. Each unit folder gets its own `.gitignore`, so test images stay out of git.
   - Returns uses `reference_N.<ext>` (catalogue) and `returned_N.<ext>`.
   - Other tracks use `1.<ext>`, `2.<ext>`, ... (no shared rule exists yet, see NOTES.md).
4. **Run.** "One stage" calls only that agent through the orchestrator (labelled as such). "Whole workflow" runs the full flow and shows skipped stages with the reason.
5. **Read the result.** Plain words first. Each stage card shows the verdict and where the answer came from (**Real model**, **Replay**, **No model call**). Click a card for checks, images used, sha256 values and raw JSON (Agent Input, Agent Output, Evidence Record).

Extras:
- **Returns pair:** the folder may hold several `reference_N`/`returned_N` photos, but only the chosen pair is sent to the model.
- **Receiving live progress:** photos are analysed one at a time, with a spinner per check that becomes a tick when that photo is done. Events are real (nothing is timed or faked).
- **More checks:** wrong company (refusal is recorded), no image, agent down.
- **Override:** records a person's decision through the orchestrator's own override, original record unchanged.

Each run is stored under `out/ui/runs/<run_id>/` (git-ignored).

## Limits

- One run at a time. Local use only. No authentication.
- Live progress exists for Receiving only.
- A one-stage test skips routing, and its workflow status/outcome describe that single stage only.
- Pack makes one model call for all its images by design.
- On Windows the `ref` paths in `inputs[]` use backslashes, shown as returned.
- I have not been able to look at the page in a browser; the endpoints and scripts were exercised, the layout was not.

## Tests

The repo's tests treat `data/input/` as empty. With test images present, run them with an empty input folder or they make real model calls:

```powershell
$env:INPUT_DIR = "$env:TEMP\empty_input"; New-Item -ItemType Directory -Force $env:INPUT_DIR | Out-Null
.venv\Scripts\python.exe -m pytest -q
```

6 tests fail on the `test` branch with or without this UI (2 Windows path/timeout quirks, 4 because Prep and Recovery return UNCERTAIN without photos).
