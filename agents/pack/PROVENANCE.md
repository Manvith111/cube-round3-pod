# PROVENANCE

**Round 2 source repository:** https://github.com/Shyamyemuka/cube26-pck-0105-shyamyemuka

**What this agent does:**
Pack Manager inspects open-box photos of merchant-fulfilled (MFN) orders before sealing.
It calls Google Gemini (vision) with a structured-output schema to observe each order line's
presence, quantity, and any unlisted items, then runs a deterministic rules engine to produce
PASS / FAIL / UNCERTAIN verdicts per check (`items_present`, `quantities_correct`,
`no_extra_items`). The agent fails open on model errors (returns a `pending` record) and
refuses requests for unknown tenants.

**Integration notes:**
- Original code: TypeScript / Next.js with `@google/genai`
- Integration: Python adapter in `agents/pack/app.py` that reimplements the same
  pipeline logic in Python using `google-genai` and the pod's `shared/utils/records.py` helpers.
- Fallback: when no images are provided (stub / test mode), replays the Round 2 sample CSV row
  so `make test` stays green without a real `GEMINI_API_KEY`.
