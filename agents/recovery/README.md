# Recovery Manager

This folder contains the Round 2 Recovery Manager integrated with the CUBE
contract. It reads fee rows from the stage inputs (with the repository sample
report retained as a compatibility fixture), consumes all previous evidence,
and produces one charge-level Evidence Record.

Recovery semantics are intentionally asymmetric:

- `FAIL` means the evidence contradicts the charge and a claim may be recommended.
- `PASS` means the evidence supports the charge and no claim is recommended.
- `UNCERTAIN` means the evidence is silent or insufficient and is never claimed.

The adapter is in-process Python and is also exposed through the shared
`/health` and `/run` FastAPI endpoints. If `GEMINI_API_KEY` is configured, it
makes one batched model call for the complete unit; model failures return a
pending output rather than crashing the workflow. Without a key, the
deterministic Round 2 rules provide the available evidence mapping.
