// RTN evidence viewer frontend. No build step, no framework — plain DOM
// manipulation is enough for this surface. All real work (VLM call,
// policy engine, evidence write) happens server-side via
// POST /units/evaluate-upload.

const componentsList = document.getElementById("componentsList");
const addComponentBtn = document.getElementById("addComponentBtn");
const form = document.getElementById("evalForm");
const statusLine = document.getElementById("statusLine");
const submitBtn = document.getElementById("submitBtn");
const resultsEmpty = document.getElementById("resultsEmpty");
const resultsContent = document.getElementById("resultsContent");

function addComponentRow(partName = "", essential = true) {
  const row = document.createElement("div");
  row.className = "component-row";
  row.innerHTML = `
    <input type="text" placeholder="part name, e.g. screw_lid" value="${partName}" class="comp-name" />
    <label class="essential-label"><input type="checkbox" class="comp-essential" ${essential ? "checked" : ""}/> essential</label>
    <button type="button" class="remove-comp" title="remove">✕</button>
  `;
  row.querySelector(".remove-comp").addEventListener("click", () => row.remove());
  componentsList.appendChild(row);
}

addComponentBtn.addEventListener("click", () => addComponentRow());
// seed with one example row
addComponentRow("", true);

function wirePreview(inputId, previewId) {
  const input = document.getElementById(inputId);
  const preview = document.getElementById(previewId);
  input.addEventListener("change", () => {
    preview.innerHTML = "";
    [...input.files].forEach((file) => {
      const url = URL.createObjectURL(file);
      const img = document.createElement("img");
      img.src = url;
      img.title = file.name;
      preview.appendChild(img);
    });
  });
}
wirePreview("referenceFiles", "referencePreview");
wirePreview("returnedFiles", "returnedPreview");

function setStatus(message, kind) {
  statusLine.textContent = message;
  statusLine.className = "status-line" + (kind ? ` ${kind}` : "");
}

function collectExpectedComponents() {
  const rows = [...componentsList.querySelectorAll(".component-row")];
  return rows
    .map((row) => {
      const name = row.querySelector(".comp-name").value.trim();
      const essential = row.querySelector(".comp-essential").checked;
      return name ? { part_name: name, essential } : null;
    })
    .filter(Boolean);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  submitBtn.disabled = true;
  resultsContent.classList.add("hidden");
  resultsEmpty.classList.remove("hidden");
  resultsEmpty.textContent = "Running pipeline (one batched VLM call)… this can take a few seconds.";
  setStatus("Submitting…");

  try {
    const formData = new FormData();
    const fd = new FormData(form);
    for (const [key, value] of fd.entries()) {
      if (key === "reference_files" || key === "returned_files") continue;
      formData.append(key, value);
    }
    formData.append("expected_components_json", JSON.stringify(collectExpectedComponents()));

    const refFiles = document.getElementById("referenceFiles").files;
    const retFiles = document.getElementById("returnedFiles").files;
    [...refFiles].forEach((f) => formData.append("reference_files", f));
    [...retFiles].forEach((f) => formData.append("returned_files", f));

    if (refFiles.length === 0 && retFiles.length === 0) {
      setStatus("Add at least one reference or returned image.", "error");
      submitBtn.disabled = false;
      resultsEmpty.textContent = "Submit a unit to see the evidence record here.";
      return;
    }

    const resp = await fetch("/units/evaluate-upload", { method: "POST", body: formData });
    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`${resp.status} ${resp.statusText}: ${errText}`);
    }
    const record = await resp.json();
    renderRecord(record);
    setStatus(`Done. record_id=${record.record_id} status=${record.status}`, "ok");
  } catch (err) {
    setStatus(`Failed: ${err.message}`, "error");
    resultsEmpty.textContent = "Submit a unit to see the evidence record here.";
  } finally {
    submitBtn.disabled = false;
  }
});

function badge(text, cls) {
  return `<span class="badge ${cls}">${escapeHtml(text)}</span>`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = String(str);
  return div.innerHTML;
}

function renderRecord(record) {
  resultsEmpty.classList.add("hidden");
  resultsContent.classList.remove("hidden");

  const refImages = (record.images || []).filter((i) => i.role === "reference");
  const retImages = (record.images || []).filter((i) => i.role === "returned");

  const imageCompareHtml = `
    <div class="image-compare">
      <div class="image-col">
        <h4>Reference (${refImages.length})</h4>
        ${refImages.map((i) => `<img src="${i.path_or_url}" alt="${escapeHtml(i.image_id)}" />`).join("") || '<p style="color:var(--text-dim); font-size:0.8rem;">none provided</p>'}
      </div>
      <div class="image-col">
        <h4>Returned (${retImages.length})</h4>
        ${retImages.map((i) => `<img src="${i.path_or_url}" alt="${escapeHtml(i.image_id)}" />`).join("") || '<p style="color:var(--text-dim); font-size:0.8rem;">none provided</p>'}
      </div>
    </div>
  `;

  let outcomeHtml = "";
  if (record.outcome) {
    const o = record.outcome;
    outcomeHtml = `
      <div class="outcome-banner">
        <div class="disposition disp-${o.disposition}">${escapeHtml(o.disposition)}</div>
        <div>identity=${escapeHtml(o.identity_verdict)} · completeness=${escapeHtml(o.completeness_summary)} · condition=${escapeHtml(o.amazon_condition)}</div>
        <div class="rationale">${escapeHtml(o.rationale)}</div>
      </div>
    `;
  } else {
    outcomeHtml = `
      <div class="outcome-banner">
        <div class="disposition disp-PENDING">PENDING — ${escapeHtml(record.status)}</div>
        <div class="rationale">No outcome yet. The VLM call likely failed or timed out; the case was preserved (fail-open) rather than dropped. See the identity check below for the error detail.</div>
      </div>
    `;
  }

  const checksHtml = (record.checks || [])
    .map((c) => {
      const eqCls = `eq-${c.evidence_quality}`;
      return `
        <div class="check-card">
          <div class="check-head">
            <span class="check-key">${escapeHtml(c.check_key)}</span>
            <span>${badge(c.evidence_quality, eqCls)} ${badge(`conf ${c.confidence.toFixed(2)}`, "")}</span>
          </div>
          <div class="verdict">${escapeHtml(c.verdict)}</div>
          <div class="detail">${escapeHtml(c.detail)}</div>
          <div class="meta">model=${escapeHtml(c.model_version)} · latency=${c.latency_ms}ms</div>
        </div>
      `;
    })
    .join("");

  resultsContent.innerHTML = `
    ${imageCompareHtml}
    ${outcomeHtml}
    <h3 style="font-size:0.9rem; color:var(--text-dim);">Per-check evidence</h3>
    ${checksHtml || '<p style="color:var(--text-dim); font-size:0.85rem;">No checks recorded.</p>'}
    <details class="raw-toggle">
      <summary>Raw evidence record JSON</summary>
      <pre>${escapeHtml(JSON.stringify(record, null, 2))}</pre>
    </details>
  `;
}
