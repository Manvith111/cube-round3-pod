"use strict";
// Plain JS front end. It only DISPLAYS what the server returned: no mock data, no invented verdicts, no fake delays.
const $ = (id) => document.getElementById(id);
const NAMES = { receiving: "Receiving", prep: "Prep", pack: "Pack", returns: "Returns", recovery: "Recovery" };
const BLURB = {
  receiving: "Photos of a delivery arriving",
  prep: "Photos of a prepared unit",
  pack: "Photo of the open box",
  returns: "Catalogue vs returned item",
  recovery: "Fee claims, from earlier evidence",
};
const ROLE_BTN = { capture: "Add images", reference: "Add reference photos", returned: "Add returned photos" };
const state = { meta: null, track: "receiving", run: null, sel: null, busy: false, caseInfo: null, raw: new Map(), seq: 0 };

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// Show a value exactly as returned: null stays "null", objects become JSON.
function show(v) {
  if (v === null) return "null";
  if (v === undefined) return "(not present)";
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}
const short = (v, n = 150) => { const s = show(v); return s.length > n ? s.slice(0, n) + "..." : s; };
const pill = (v) => `<span class="pill ${v ? esc(v) : "none"}">${esc(v ?? "no verdict")}</span>`;
const kv = (pairs) => pairs.map(([k, v]) => `<div class="kv"><span>${esc(k)}</span><span>${v}</span></div>`).join("");
const stem = (ref) => (String(ref).replace(/\\/g, "/").split("/").pop() || "").replace(/\.[^.]+$/, "").toLowerCase();

function rawButton(label, obj) {
  const id = `raw-${++state.seq}`;
  state.raw.set(id, obj);
  return `<button type="button" class="btn raw-toggle" data-raw="${id}" aria-expanded="false" aria-controls="${id}">${esc(label)}</button><pre class="raw" id="${id}" hidden></pre>`;
}
document.addEventListener("click", (ev) => {
  const btn = ev.target.closest(".raw-toggle");
  if (!btn) return;
  const pre = document.getElementById(btn.dataset.raw);
  const open = pre.hidden;
  if (open && !pre.textContent) pre.textContent = JSON.stringify(state.raw.get(btn.dataset.raw), null, 2);
  pre.hidden = !open;
  btn.setAttribute("aria-expanded", String(open));
});

async function api(path, opts = {}) {
  const resp = await fetch(path, { ...opts, headers: { "content-type": "application/json", ...(opts.headers || {}) } });
  const text = await resp.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!resp.ok) {
    const detail = typeof body === "object" && body && "detail" in body ? body.detail : body;
    throw new Error(`HTTP ${resp.status}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
  }
  return body;
}
const mode = () => document.querySelector('input[name="mode"]:checked').value;
const unit = () => $("unit").value.trim();
const stageOf = (id) => state.run?.stages.find((s) => s.stage === id);

function tone(s) {
  if (s.state === "error" || s.stage_error) return "bad";
  return { PASS: "ok", FAIL: "bad", UNCERTAIN: "warn" }[s.verdict] || "warn";
}
function sourceLabel(src) {
  return { model: src.name, replay: "Replay of sample data", no_call: "No model was called", none: "No model ran" }[src.kind]
    || `Not a model (${src.name})`;
}
function sourceChip(src) {
  if (!src) return "";
  return { replay: `<span class="chip bad">Replay</span>`, no_call: `<span class="chip bad">No model call</span>`,
           none: `<span class="chip warn">No model</span>`, model: `<span class="chip real">Real model</span>` }[src.kind]
    || `<span class="chip warn">Not a model</span>`;
}

// ---------------------------------------------------------------- setup
async function init() {
  state.meta = await api("/api/meta");
  $("org").innerHTML = state.meta.orgs.map((o) => `<option>${esc(o)}</option>`).join("");
  $("tracks").innerHTML = state.meta.stages.map((st) => {
    const a = state.meta.agents[st] || {};
    return `<label class="track" data-stage="${esc(st)}"><input type="radio" name="track" value="${esc(st)}">
      <span class="ti" aria-hidden="true">${esc(NAMES[st][0])}</span><span class="tn">${esc(NAMES[st])}</span>
      <span class="td">${esc(BLURB[st])}</span><span class="ta">${esc(a.agent_id)}</span></label>`;
  }).join("");
  document.querySelectorAll('input[name="track"]').forEach((r) => r.addEventListener("change", () => pickTrack(r.value)));
  document.querySelectorAll('input[name="mode"]').forEach((r) => r.addEventListener("change", onChange));
  $("unit").addEventListener("change", onChange);
  $("org").addEventListener("change", onChange);
  $("do-copy").addEventListener("click", doCopy);
  $("run").addEventListener("click", () => doRun(null));
  document.querySelectorAll("button[data-test]").forEach((b) => b.addEventListener("click", () => {
    document.querySelector(".more").open = false;
    doRun(b.dataset.test);
  }));
  pickTrack("receiving");
}

function pickTrack(st) {
  if (state.busy) return;
  state.track = st;
  document.querySelectorAll(".track").forEach((t) => {
    const on = t.dataset.stage === st;
    t.classList.toggle("sel", on);
    t.querySelector("input").checked = on;
  });
  onChange();
}

async function onChange() {
  const st = state.track, n = state.meta.naming[st];
  $("rule").textContent = n.rule;
  $("addbtns").innerHTML = n.roles.map((r) =>
    `<label class="btn filebtn">${esc(ROLE_BTN[r.role] || "Add images")}<input type="file" multiple accept="${esc(state.meta.image_exts.join(","))}" data-role="${esc(r.role)}"></label>`).join("");
  $("addbtns").querySelectorAll("input[type=file]").forEach((i) => i.addEventListener("change", () => doUpload(i)));
  $("roles").innerHTML = n.roles.map((r) => `<label class="block">${esc(r.label)}: one path per line
    <textarea class="paths" data-role="${esc(r.role)}" rows="2" spellcheck="false"></textarea></label>`).join("");
  await loadCase();
  renderRunbar();
}

async function loadCase() {
  const org = $("org").value, u = unit();
  if (!u) return;
  try {
    state.caseInfo = await api(`/api/case?org=${encodeURIComponent(org)}&unit=${encodeURIComponent(u)}`);
    const c = state.caseInfo.case;
    $("caseline").textContent = `${u} in ${org}: route ${c.route}, ${c.returned ? "has a return" : "no return"}.`;
  } catch (e) { state.caseInfo = null; $("caseline").textContent = e.message; }
  renderImages();
}

function currentPair() { const v = $("pair").value; return v && v !== "all" ? Number(v) : null; }

function renderImages() {
  const info = state.caseInfo, st = state.track;
  if (!info) { $("thumbs").innerHTML = ""; $("imgcount").textContent = ""; $("imgfolder").textContent = ""; return; }
  const files = info.captures[st].orchestrator_would_send;
  const pair = st === "returns" ? currentPair() : null;
  $("imgcount").textContent = files.length ? `${files.length} image${files.length === 1 ? "" : "s"} ready` : "No images yet";
  $("imgfolder").textContent = info.captures[st].folder;
  $("thumbs").innerHTML = files.length ? files.map((f) => {
    const s = stem(f.ref), dim = pair !== null && s !== `reference_${pair}` && s !== `returned_${pair}`;
    return `<figure class="thumb${dim ? " dim" : ""}" title="${esc(f.ref)}&#10;sha256 ${esc(f.sha256)}"><img src="/api/capture-file?ref=${encodeURIComponent(f.ref)}" alt="${esc(f.ref)}" loading="lazy">
      <figcaption>${esc(s)}${pair !== null && !dim ? ' <span class="tag-sent">sent</span>' : ""}</figcaption></figure>`;
  }).join("") : `<div class="empty">Add images below. With none, the agent gets <code>inputs: []</code>.</div>`;
}

function renderRunbar() {
  const pairs = state.caseInfo?.returns_pairs || [];
  const show_ = pairs.length && (state.track === "returns" || mode() === "full");
  $("pairwrap").hidden = !show_;
  const old = $("pair").value;
  $("pair").innerHTML = pairs.map((p) => `<option value="${p}">Pair ${p} only</option>`).join("") + `<option value="all">All photos</option>`;
  $("pair").value = [...$("pair").options].some((o) => o.value === old) ? old : String(pairs[0] ?? "all");
  $("pair").onchange = renderImages;
  renderImages();
}

// ---------------------------------------------------------------- captures
function readB64(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(",", 2)[1] || "");
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
}
function showSaved(r) {
  const ok = r.saved.filter((s) => s.status === "saved").length, dup = r.saved.length - ok;
  const errs = r.errors.map((e) => `<li><code>${esc(e.source)}</code>: ${esc(e.error)}</li>`).join("");
  $("capture-result").innerHTML =
    (r.saved.length ? `<p class="muted">Saved ${ok}${dup ? `, ${dup} already there` : ""}. Originals unchanged${r.saved.some((s) => s.original_unchanged === false) ? " (CHECK: one changed)" : ""}.</p>` : "") +
    (errs ? `<div class="err"><strong>Could not save:</strong><ul>${errs}</ul></div>` : "");
  loadCase().then(renderRunbar);
}
async function doUpload(input) {
  const items = [];
  for (const f of input.files) items.push({ role: input.dataset.role, filename: f.name, data_b64: await readB64(f) });
  input.value = "";
  try { showSaved(await api("/api/captures/upload", { method: "POST", body: JSON.stringify({ unit: unit(), stage: state.track, items }) })); }
  catch (e) { $("capture-result").innerHTML = `<div class="err">${esc(e.message)}</div>`; }
}
async function doCopy() {
  const items = [];
  document.querySelectorAll("#roles .paths").forEach((ta) => ta.value.split(/\r?\n/).forEach((line) => {
    if (line.trim()) items.push({ role: ta.dataset.role, path: line.trim() });
  }));
  try { showSaved(await api("/api/captures/copy", { method: "POST", body: JSON.stringify({ unit: unit(), stage: state.track, items }) })); }
  catch (e) { $("capture-result").innerHTML = `<div class="err">${esc(e.message)}</div>`; }
}

// ---------------------------------------------------------------- running
async function doRun(test) {
  const m = mode();
  state.busy = true; state.run = null; state.sel = null;
  const buttons = document.querySelectorAll("#run, .more .btn, .track input");
  buttons.forEach((b) => (b.disabled = true));
  $("stg").textContent = `Running ${m === "single" ? "one stage" : "the whole workflow"}${test ? ` (${test.replace("_", " ")})` : ""}... model calls can take a while.`;
  $("results").innerHTML = "";
  const body = { mode: m, stage: state.track, org_id: $("org").value, unit_id: unit(), test,
                 pair: !$("pairwrap").hidden ? currentPair() : null };
  state.prog = { stages: {}, total: 0, files: [], checks: [], photos: [], model: null };
  try {
    const { run_id } = await api("/api/run/start", { method: "POST", body: JSON.stringify(body) });
    let next = 0;
    for (;;) {
      const p = await api(`/api/run/${encodeURIComponent(run_id)}/progress?after=${next}`);
      next = p.next;
      if (p.events.length) { p.events.forEach(applyEvent); renderProgress(); }
      if (p.done) { if (p.error) throw new Error(p.error); state.run = p.result; break; }
      await new Promise((r) => setTimeout(r, 400));
    }
    $("stg").textContent = `Done in ${(state.run.elapsed_ms / 1000).toFixed(1)} s.`;
  } catch (e) {
    $("stg").textContent = "";
    $("results").innerHTML = `<div class="err"><strong>Run failed.</strong> ${esc(e.message)}</div>`;
  } finally {
    state.busy = false;
    buttons.forEach((b) => (b.disabled = false));
  }
  if (state.run) renderRun();
}

// ---------------------------------------------------------------- live progress (Receiving only for now)
// Every line here is driven by an event the server received while the run was in flight. Nothing is timed or faked.
function applyEvent(e) {
  const p = state.prog;
  if (e.type === "stage_start") { p.stages[e.stage] = "running"; if (e.stage !== "receiving") $("stg").textContent = `Running ${NAMES[e.stage]}...`; }
  else if (e.type === "stage_end") p.stages[e.stage] = e.ok ? "done" : "error";
  else if (e.type === "photos_total") {
    p.total = e.total; p.files = e.files; p.checks = e.checks; p.model = e.model;
    p.photos = e.files.map(() => ({ state: "waiting" }));
  } else if (e.type === "photo_start" && p.photos[e.index]) {
    p.photos[e.index] = { state: "processing" };
    $("stg").textContent = `Processing ${e.file}...`;
  } else if (e.type === "photo_retry" && p.photos[e.index]) {
    p.photos[e.index].note = `Retrying: ${e.reason}. Waiting ${e.wait_s} s.`;
  } else if (e.type === "photo_done" && p.photos[e.index]) {
    p.photos[e.index] = { state: e.status === "analysed" ? "done" : "error", verdicts: e.verdicts, ms: e.ms, error: e.error };
  }
}

const TICK = { PASS: "✓", FAIL: "✕", UNCERTAIN: "?" };
function renderProgress() {
  const p = state.prog;
  if (!p.total) {
    if (p.stages.receiving === "running") $("results").innerHTML = `<div class="card prog"><div class="prog-head"><i class="ring"></i><strong>Receiving</strong><span class="muted">getting ready...</span></div></div>`;
    return;
  }
  const finished = p.photos.filter((x) => x.state === "done" || x.state === "error").length;
  const rows = p.photos.map((ph, i) => {
    const name = esc(p.files[i]);
    const label = { waiting: `${name} <span class="muted">waiting</span>`, processing: `<strong>Processing ${name}</strong>`,
      done: `${name} <span class="muted">${(ph.ms / 1000).toFixed(1)} s</span>`, error: `${name} <span class="pill UNCERTAIN">failed</span>` }[ph.state];
    const icon = ph.state === "processing" ? `<i class="ring" aria-hidden="true"></i>` : ph.state === "done" ? `<i class="tick ok" aria-hidden="true">✓</i>`
      : ph.state === "error" ? `<i class="tick bad" aria-hidden="true">!</i>` : `<i class="dot" aria-hidden="true"></i>`;
    let chips = "";
    if (ph.state !== "waiting") {
      chips = `<div class="pchecks">` + p.checks.map((c, k) => {
        const nice = esc(c.replaceAll("_", " "));
        if (ph.state === "processing") return `<span class="pchip busy" aria-label="${nice}: working"><i class="ring sm" aria-hidden="true"></i>${nice}</span>`;
        if (ph.state === "error") return `<span class="pchip err" aria-label="${nice}: no result"><i class="tick sm bad" aria-hidden="true">!</i>${nice}</span>`;
        const v = ph.verdicts?.[c];
        return `<span class="pchip ${esc(v)} pop" style="animation-delay:${k * 70}ms" aria-label="${nice}: ${esc(v)}"><i class="tick sm ${esc(v)}" aria-hidden="true">${TICK[v] || "?"}</i>${nice}</span>`;
      }).join("") + `</div>`;
    }
    const note = ph.state === "processing" && ph.note ? `<div class="muted pnote">${esc(ph.note)}</div>` : "";
    const err = ph.state === "error" && ph.error ? `<div class="err">${esc(ph.error)}</div>` : "";
    return `<div class="prow ${ph.state}"><div class="pname">${icon}<span>${label}</span></div>${chips}${note}${err}</div>`;
  }).join("");
  $("results").innerHTML = `<div class="card prog"><div class="prog-head">${finished < p.total ? '<i class="ring" aria-hidden="true"></i>' : '<i class="tick ok" aria-hidden="true">✓</i>'}
    <strong>Receiving: one photo at a time</strong><span class="muted">${finished} of ${p.total} done · model ${esc(p.model)}</span></div>${rows}</div>`;
}

// ---------------------------------------------------------------- results
function renderRun() {
  const r = state.run, wf = r.workflow, fo = wf.final_outcome;
  state.raw.clear();
  const single = r.request.mode === "single";
  const real = r.stages.filter((s) => s.source?.kind === "model").length;
  const notReal = r.stages.filter((s) => s.source && s.source.kind !== "model");
  const one = single ? r.stages[0] : null;

  let head, sub;
  if (wf.status === "FAILED") {
    head = `Did not complete ${pill("UNCERTAIN")}`;
    sub = wf.errors.map((e) => `${NAMES[e.stage] || e.stage}: ${e.code}`).join(", ") || wf.status_reason;
  } else if (single && one) {
    head = `${NAMES[one.stage]} says ${pill(one.verdict)}`;
    sub = `Outcome: ${show(one.outcome)}. This covers one stage only, not the whole unit.`;
  } else if (fo) {
    head = `${esc(fo.outcome.replace("_", " "))} ${pill(fo.verdict)}`;
    sub = fo.reason;
  } else { head = "No outcome"; sub = wf.status_reason; }

  let html = "";
  if (r.test) {
    html += `<div class="callout warn"><h4>${esc(r.test.name)}</h4><div class="muted">${esc(r.test.what_ran)}</div>
      <div>Expected: ${esc(r.test.expected)}.<br>Observed errors: ${esc(show(r.test.observed_error_codes))}${r.test.refusal_recorded !== undefined ? `. Refusal recorded: <strong>${r.test.refusal_recorded ? "yes" : "NO"}</strong>` : ""}</div></div>`;
  }
  if (r.notes.length) html += `<div class="callout">${r.notes.map(esc).join("<br>")}</div>`;

  html += `<div class="card sum"><div class="meta"><span class="chip info">${single ? "One-stage test" : "Whole workflow"}</span>
      <span>${esc(r.case.org_id)} · ${esc(r.request.unit_id)} · route ${esc(r.case.route)}</span></div>
    <h3>${head}</h3><p>${esc(sub)}</p>
    <div class="tiles">
      <div class="tile"><small>Workflow status</small><b>${esc(wf.status)}</b></div>
      <div class="tile"><small>${single ? "Confidence" : "Stages judged by a real model"}</small><b>${single && one ? (typeof one.decision?.confidence === "number" ? esc(one.decision.confidence) : "not reported") : `${real} of ${r.stages.filter((s) => s.source).length}`}</b></div>
      <div class="tile"><small>Source of the answer</small><b>${single && one?.source ? esc(sourceLabel(one.source)) : notReal.length ? "see each stage" : "real model"}</b></div>
      <div class="tile"><small>Time</small><b>${(r.elapsed_ms / 1000).toFixed(1)} s</b></div>
    </div>`;
  // One-stage runs show the banner in the stage panel below; the summary only repeats it for whole workflows.
  for (const s of single ? [] : notReal) {
    if (s.source.banner) html += `<div class="banner ${["replay", "no_call"].includes(s.source.kind) ? "" : "soft"}" role="note"><span class="muted" style="color:inherit">${esc(NAMES[s.stage])}:</span> ${esc(s.source.banner)}</div>`;
  }
  html += `</div>`;

  html += `<div class="grid cards">` + r.stages.map((s) => {
    if (s.state === "skipped") return `<div class="scard skip"><span class="sn">${esc(NAMES[s.stage])}</span><span class="pill none">Skipped</span><span class="so">${esc(s.skipped_reason)}</span></div>`;
    if (s.state === "pending") return `<div class="scard skip"><span class="sn">${esc(NAMES[s.stage])}</span><span class="pill none">Did not run</span><span class="so">The workflow stopped before this stage.</span></div>`;
    return `<button type="button" class="scard ${tone(s)}" data-stage="${esc(s.stage)}"><span class="sn">${esc(NAMES[s.stage])}</span>
      <span>${s.stage_error ? `<span class="pill UNCERTAIN">Error</span>` : pill(s.verdict)} ${sourceChip(s.source)}</span>
      <span class="so">${esc(s.stage_error ? s.stage_error.code : show(s.outcome))}</span></button>`;
  }).join("") + `</div>`;

  html += `<div id="detail"></div>`;

  html += `<details class="card sec"><summary>Workflow details</summary>${kv([
    ["workflow_id", `<code>${esc(wf.workflow_id)}</code>`],
    ["status", `${esc(wf.status)}: ${esc(wf.status_reason)}`],
    ["final outcome", fo ? `${esc(fo.outcome)} ${pill(fo.verdict)}` : "null"],
    ["claimable_usd", fo ? esc(show(fo.claimable_usd)) : "-"],
    ["effective verdicts", fo ? Object.entries(fo.effective_verdicts).map(([k, v]) => `${esc(k)} ${pill(v)}`).join(" ") || "(none)" : "-"],
    ["halted", esc(show(wf.halted))],
    ["errors", wf.errors.length ? wf.errors.map((e) => `<code>${esc(e.stage)}: ${esc(e.code)}</code> ${esc(short(e.message, 260))}`).join("<br>") : "none"],
    ["overrides", wf.overrides.length ? wf.overrides.map((o) => `${esc(o.override_id)}: ${esc(o.supersedes.record_id)} ${pill(o.previous_verdict)} to ${pill(o.new_verdict)} by ${esc(o.actor)} (${esc(o.reason)})`).join("<br>") : "none"],
    ["Workflow State schema", r.workflow_schema_errors.length ? `<span class="err">invalid: ${esc(r.workflow_schema_errors.join("; "))}</span>` : "valid"],
  ])}<table><thead><tr><th>time</th><th>event</th><th>stage</th><th>detail</th></tr></thead><tbody>${
    wf.transitions.map((t) => `<tr><td>${esc(t.at)}</td><td>${esc(t.event)}</td><td>${esc(show(t.stage))}</td><td>${esc(show(t.detail))}</td></tr>`).join("")}</tbody></table>${rawButton("View raw JSON: Workflow State", r.raw.workflow_state)}</details>`;

  const recs = r.stages.filter((s) => s.record_id);
  if (recs.length) {
    html += `<details class="card sec"><summary>Override a decision</summary>
      <p class="muted">Calls the orchestrator's own override. The original record stays unchanged.</p>
      <form id="override-form"><div class="formgrid">
        <label>Record <select id="ovr-record">${recs.map((s) => `<option value="${esc(s.record_id)}"${s.verdict === "UNCERTAIN" ? " selected" : ""}>${esc(s.record_id)} (${esc(s.verdict)})</option>`).join("")}</select></label>
        <label>New verdict <select id="ovr-verdict"><option>PASS</option><option>FAIL</option><option>UNCERTAIN</option></select></label>
        <label>Your name <input id="ovr-actor" required autocomplete="off"></label>
      </div>
      <label class="block" style="display:flex;flex-direction:column;gap:4px;margin-top:12px">Reason <textarea id="ovr-reason" rows="2" required></textarea></label>
      <div class="row"><button type="submit" class="btn">Record override</button></div></form><div id="override-result"></div></details>`;
  }

  $("results").innerHTML = html;
  document.querySelectorAll(".scard[data-stage]").forEach((b) => b.addEventListener("click", () => showStage(b.dataset.stage)));
  $("override-form")?.addEventListener("submit", doOverride);
  const first = r.stages.find((s) => s.state !== "skipped" && s.state !== "pending");
  if (single && first) showStage(first.stage, false);
  $("results").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
}

function plain(s) {
  const d = s.decision || {};
  const c = { PASS: 0, FAIL: 0, UNCERTAIN: 0 };
  s.checks.forEach((k) => { c[k.verdict] = (c[k.verdict] || 0) + 1; });
  // plain text only; the caller escapes it
  return s.stage_error
    ? `This stage ended with an error (${s.stage_error.code}). No judgment was made.`
    : `${s.checks.length} checks: ${c.PASS} passed, ${c.FAIL} failed, ${c.UNCERTAIN} uncertain. Outcome: ${show(d.outcome)}. ${d.reason ? short(d.reason, 220) : ""}`;
}

function showStage(id, scroll = true) {
  const s = stageOf(id);
  if (!s || s.state === "skipped" || s.state === "pending") return;
  state.sel = id;
  document.querySelectorAll(".scard").forEach((c) => c.classList.toggle("sel", c.dataset.stage === id));
  const d = s.decision || {}, src = s.source;
  const readers = s.record_id ? state.run.stages.filter((x) => x.client_calls.at(-1)?.previous_evidence_ids.includes(s.record_id)).map((x) => NAMES[x.stage]) : [];

  let h = `<div class="card detail"><h3>${esc(NAMES[id])} ${s.stage_error ? `<span class="pill UNCERTAIN">Error</span>` : pill(s.verdict)} ${sourceChip(src)}</h3>
    <p class="lead">${esc(plain(s))}</p>`;
  if (src?.banner) h += `<div class="banner ${["replay", "no_call"].includes(src.kind) ? "" : "soft"}" role="note">${esc(src.banner)}</div>`;
  if (s.stage_error) h += `<div class="err"><strong>${esc(s.stage_error.code)}</strong><br>${esc(short(s.stage_error.message, 700))}<br><span class="muted">retryable: ${esc(show(s.stage_error.retryable))}</span></div>`;

  h += `<h4>What it checked</h4>` + (s.checks.length ? s.checks.map((k) => `<div class="crow${k.verdict === "UNCERTAIN" ? " unc" : ""}">
      ${pill(k.verdict)}<span class="ck">${esc(k.check_key.replaceAll("_", " "))}</span>
      <span class="cd">${esc(short(k.detail || (k.observed !== undefined ? `observed field: ${show(k.observed)}` : ""), 200))}${k.verdict === "UNCERTAIN" && k.uncertain_reason ? ` <em>(${esc(k.uncertain_reason)})</em>` : ""}${typeof k.confidence === "number" ? ` · confidence ${esc(k.confidence)}` : ""}</span></div>`).join("")
    : `<p class="muted">No checks in the record (an empty list is not a judgment).</p>`);

  // Agents that look at photos one by one (Receiving) keep each photo's own result in payload.per_image.
  const pi = s.raw.evidence_record?.payload?.per_image;
  if (Array.isArray(pi) && pi.length) {
    h += `<h4>Image by image</h4><div class="perimg">` + pi.map((p) => {
      const name = String(p.ref).replace(/\\/g, "/").split("/").pop();
      const rows = p.checks ? Object.values(p.checks).map((c) => `<span class="pc">${pill(c.verdict)} ${esc(c.check_key.replaceAll("_", " "))}</span>`).join("") : "";
      return `<div class="pcard"><img src="/api/capture-file?ref=${encodeURIComponent(p.ref)}" alt="${esc(name)}" loading="lazy">
        <div><strong>${esc(name)}</strong> ${p.status === "analysed" ? "" : '<span class="pill UNCERTAIN">Error</span>'}
        <span class="muted">${p.photo_shows ? esc(p.photo_shows) + " · " : ""}${p.latency_ms != null ? esc(p.latency_ms) + " ms" : ""}${p.photo_usable === false ? " · photo not usable" : ""}</span>
        ${p.error ? `<div class="err">${esc(p.error.code)}: ${esc(short(p.error.message, 320))}</div>` : `<div class="pcs">${rows}</div>`}</div></div>`;
    }).join("") + `</div>`;
  }

  h += `<h4>Images used</h4>`;
  h += s.folder_files.length ? `<div class="thumbs">${s.folder_files.map((f) => `<figure class="thumb${f.in_inputs_sent ? "" : " dim"}" title="sha256 ${esc(f.sha256)}">
      <img src="/api/capture-file?ref=${encodeURIComponent(f.ref)}" alt="${esc(f.name)}" loading="lazy"><figcaption>${esc(f.name)} ${f.in_inputs_sent ? '<span class="tag-sent">sent</span>' : "not sent"}</figcaption></figure>`).join("")}</div>`
    : `<p class="muted">None. The agent was sent <code>inputs: ${esc(JSON.stringify(s.inputs_sent))}</code>.</p>`;

  h += `<details class="sub"><summary>Technical details</summary>` + kv([
    ["model.name", src ? `<code>${esc(src.name)}</code>` : "no record"],
    ["model.calls", src ? `<code>${esc(show(src.calls))}</code>` : "-"],
    ["model.cost_usd", src ? `<code>${esc(show(src.cost_usd))}</code>` : "-"],
    ["model.version / provider", src ? `${esc(show(src.version))} / ${esc(show(src.provider))}` : "-"],
    ["agent", `<code>${esc(show(s.agent_id))}</code>, ${src ? esc(short(src.agent_json.implementation, 120)) : ""}`],
    ["record", `<code>${esc(show(s.record_id))}</code>`],
    ["confidence", `decision ${esc(show(d.confidence))}, agent output ${esc(show(s.output_confidence))}`],
    ["needs_human / next step", `${esc(show(d.needs_human))} / ${esc(short(s.next_step_recommendation, 100))}`],
    ["client", s.client_calls.map((c) => `${esc(c.client)}: ${c.returned_output ? "returned an Agent Output" : `no output (${esc(c.exception?.type)}: ${esc(short(c.exception?.message, 160))})`}`).join("<br>") || "not called"],
    ["earlier records passed in", esc(s.client_calls.at(-1)?.previous_evidence_ids.join(", ") || "none")],
    ["read by later stages", esc(readers.join(", ") || "none")],
    ["Agent Output schema", s.agent_output_schema_errors === null ? "no output came back" : s.agent_output_schema_errors.length ? `<span class="err">invalid: ${esc(s.agent_output_schema_errors.join("; "))}</span>` : "valid"],
    ["Evidence Record schema", s.evidence_schema_errors === null ? "no record" : s.evidence_schema_errors.length ? `<span class="err">invalid: ${esc(s.evidence_schema_errors.join("; "))}</span>` : "valid"],
  ]);
  h += `<h4>inputs[] sent to the agent</h4>` + (s.inputs_sent.length
    ? `<table><thead><tr><th>ref</th><th>sha256</th><th>matches the file on disk</th></tr></thead><tbody>${s.inputs_sent.map((i) =>
      `<tr><td><code>${esc(i.ref)}</code></td><td class="hash">${esc(show(i.sha256))}</td><td>${s.folder_files.some((f) => f.sha256 === i.sha256) ? "yes" : "NO"}</td></tr>`).join("")}</tbody></table>` : `<p class="muted">none</p>`);
  h += `<h4>Inputs the record says it examined</h4>` + (s.evidence_inputs.length
    ? `<table><thead><tr><th>ref</th><th>sha256</th></tr></thead><tbody>${s.evidence_inputs.map((i) => `<tr><td><code>${esc(i.ref)}</code></td><td class="hash">${esc(show(i.sha256))}</td></tr>`).join("")}</tbody></table>` : `<p class="muted">none listed</p>`);
  h += `<h4>evidence_refs and what they point to</h4>` + (s.evidence_refs.length
    ? `<table><thead><tr><th>ref</th><th>points to</th><th>cited by</th></tr></thead><tbody>${s.evidence_refs.map((e) => `<tr><td><code>${esc(e.ref)}</code></td><td>${esc(e.points_to)}</td><td>${esc(e.cited_by.join(", "))}</td></tr>`).join("")}</tbody></table>` : `<p class="muted">no check cites anything</p>`);
  h += `<div class="row">${rawButton("Raw JSON: Agent Output", s.raw.agent_output)}${rawButton("Raw JSON: Evidence Record", s.raw.evidence_record)}${rawButton("Raw JSON: Agent Input sent", s.raw.agent_input)}</div></details></div>`;

  $("detail").innerHTML = h;
  if (scroll) $("detail").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" });
}

// ---------------------------------------------------------------- override
async function doOverride(ev) {
  ev.preventDefault();
  const body = { record_id: $("ovr-record").value, new_verdict: $("ovr-verdict").value, actor: $("ovr-actor").value, reason: $("ovr-reason").value };
  try {
    state.run = await api(`/api/runs/${encodeURIComponent(state.run.run_id)}/override`, { method: "POST", body: JSON.stringify(body) });
    const keep = state.sel;
    renderRun();
    if (keep) showStage(keep, false);
    const fo = state.run.workflow.final_outcome;
    $("results").insertAdjacentHTML("afterbegin", `<div class="callout"><h4>Override recorded</h4>Workflow is now ${esc(state.run.workflow.status)}, outcome ${esc(fo?.outcome)}. The original record is unchanged.</div>`);
  } catch (e) { $("override-result").innerHTML = `<div class="err">${esc(e.message)}</div>`; }
}

init().catch((e) => { document.body.insertAdjacentHTML("afterbegin", `<div class="err">${esc(e.message)}</div>`); });
