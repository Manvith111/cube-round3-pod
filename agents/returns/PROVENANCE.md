# Provenance: Returns Manager

| | |
|---|---|
| **Round 2 repo** | https://github.com/Srikar-segmentation-fault/cube26-rtn-0257-srikar-segmentation-fault |
| **Round 2 commit** | `4efa1671b6d35e77e9e7ebc89fb422388d93839c` (`main`, "Fix setuptools package discovery for deployment") |
| **Owner** | @Srikar-segmentation-fault |
| **What it does** | Checks a returned item from photos: is it the item sold (identity), is it complete (parts list), what condition is it in (Amazon's published scale), and what to do with it (restock, refurbish, liquidate, dispose, or pending review). One batched vision-model call per unit; condition and disposition come from deterministic rules, never from the model. |
| **Original stack** | Python 3.12, FastAPI, OpenAI-compatible chat API (Groq default), local JSONL evidence store. |
| **What was copied** | `rtn/` (including `reference_data/amazon_condition_scale.json`) and `tests/` into `core/`. Not copied: `.env`, `evidence_store/`, `data/` (uploads and about 16 MB of fixture images, rule R9), the Round 2 docs and deploy files. |
| **What changed** | Only the import paths in `core/` (`rtn.` became `agents.returns.core.rtn.`), and a skip guard in `core/tests/test_tenant_isolation.py` for a missing package. The Round 2 prompts, rules and schemas are unchanged. `core/rtn/api/` (the Round 2 web UI) is copied but not used. |
| **What was added** | `app.py` (the adapter), `agent.json`, `README.md`, `tests/test_adapter.py`, `INTEGRATION-NOTES.md`. |
| **Honesty notes** | The record carries a content hash only, not tamper-evidence. A record with `model.name` = `csv-replay` is a replay of the organiser's sample CSV, not this agent's judgment. |
