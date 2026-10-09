import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const unit_id = body.unit_id || 'UNIT-0006';
    const org_id = body.org_id || 'org_demo_bravo';

    const custom_payload = body.custom_payload;
    const reqRoute = custom_payload?.route;
    const reqReturned = typeof custom_payload?.returned === 'boolean' ? custom_payload.returned : undefined;

    // Python orchestrator runner script: pulls exact CSV row for each agent,
    // passes through orchestrator with true hand-off evidence bundle
    const pythonScript = `
import sys, os, json, csv, time
from pathlib import Path

rootDir = Path(r"D:\\cube-round3-pod")
sys.path.insert(0, str(rootDir))

from orchestration.orchestrator import run_workflow, load_flow, default_flow_path, bundle
from orchestration.store import FileStore
from shared.utils import sample_data

unit_id = "${unit_id}"
org_id = "${org_id}"

# Pull exact raw rows from each agent's respective sample file
sample_dir = rootDir / "data" / "sample"

def get_row(filename, uid, org):
    p = sample_dir / filename
    if not p.exists():
        return None
    with open(p, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            if r.get("unit_id") == uid and r.get("org_id") == org:
                return dict(r)
    return None

def get_fee_rows(uid, org):
    p = sample_dir / "fee_report_sample.csv"
    if not p.exists():
        return []
    res = []
    with open(p, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            if r.get("unit_id") == uid and r.get("org_id") == org:
                res.append(dict(r))
    return res

raw_sample_inputs = {
    "receiving": get_row("receiving_sample.csv", unit_id, org_id),
    "prep": get_row("prep_sample.csv", unit_id, org_id),
    "pack": get_row("pack_sample.csv", unit_id, org_id),
    "returns": get_row("returns_sample.csv", unit_id, org_id),
    "fees": get_fee_rows(unit_id, org_id)
}

req_route = ${reqRoute ? `"${reqRoute}"` : 'None'}
req_returned = ${reqReturned !== undefined ? (reqReturned ? 'True' : 'False') : 'None'}

default_route = sample_data.route(unit_id, org_id) if hasattr(sample_data, "route") else "unknown"
default_returned = sample_data.has("returns", unit_id, org_id) if hasattr(sample_data, "has") else False

route = req_route if req_route else default_route
returned = req_returned if req_returned is not None else default_returned

case = {
    "org_id": org_id,
    "unit_id": unit_id,
    "route": route,
    "returned": returned
}

flow = load_flow(default_flow_path())
store = FileStore()

workflow = run_workflow(case, flow, store)
evidence_bundle = bundle(workflow, store)

result = {
    "workflow": workflow,
    "evidence": evidence_bundle.get("evidence", {}),
    "case": case,
    "raw_inputs": raw_sample_inputs
}

# Also save historical execution audit trail
history_dir = rootDir / "out" / "history"
history_dir.mkdir(parents=True, exist_ok=True)
hist_file = history_dir / f"{workflow['workflow_id']}_{int(time.time())}.json"
hist_file.write_text(json.dumps(result, indent=2))

print("###JSON_START###")
print(json.dumps(result))
print("###JSON_END###")
`;

    let pythonBin = path.resolve('D:/cube-round3-pod/.venv/Scripts/python.exe');
    if (!fs.existsSync(pythonBin)) {
      const sysPy = 'C:/Users/ys304/AppData/Local/Programs/Python/Python312/python.exe';
      pythonBin = fs.existsSync(sysPy) ? sysPy : 'python';
    }
    const workingDir = path.resolve('D:/cube-round3-pod');

    return new Promise<NextResponse>((resolve) => {
      const pyProcess = spawn(pythonBin, ['-c', pythonScript], {
        cwd: workingDir,
        env: { ...process.env, LOG_LEVEL: 'WARNING' }
      });

      let stdout = '';
      let stderr = '';

      pyProcess.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });

      pyProcess.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      pyProcess.on('close', (code) => {
        if (code !== 0 && !stdout.includes('###JSON_START###')) {
          resolve(
            NextResponse.json(
              { error: `Orchestrator failed (code ${code}): ${stderr || stdout}` },
              { status: 500 }
            )
          );
          return;
        }

        const startIdx = stdout.indexOf('###JSON_START###');
        const endIdx = stdout.indexOf('###JSON_END###');

        if (startIdx !== -1 && endIdx !== -1) {
          const jsonText = stdout
            .substring(startIdx + '###JSON_START###'.length, endIdx)
            .trim();
          try {
            const data = JSON.parse(jsonText);

            // Optional Supabase Postgres Sync
            const supabaseUrl = process.env.SUPABASE_URL;
            const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
            if (supabaseUrl && supabaseKey && !supabaseUrl.includes('your-project')) {
              fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/execution_history`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${supabaseKey}`,
                  'apikey': supabaseKey,
                  'Content-Type': 'application/json',
                  'Prefer': 'return=minimal'
                },
                body: JSON.stringify({
                  workflow_id: data.workflow?.workflow_id,
                  unit_id: data.case?.unit_id,
                  org_id: data.case?.org_id,
                  route: data.case?.route,
                  status: data.workflow?.status,
                  final_outcome: data.workflow?.final_outcome,
                  stage_count: Object.keys(data.evidence || {}).length,
                  full_report: data
                })
              }).catch((e) => console.warn('Supabase DB sync warning:', e));
            }

            resolve(NextResponse.json(data));
          } catch (e: any) {
            resolve(
              NextResponse.json(
                { error: `Failed to parse orchestrator JSON: ${e.message}`, raw: stdout },
                { status: 500 }
              )
            );
          }
        } else {
          resolve(
            NextResponse.json(
              { error: 'Orchestrator output marker missing', raw: stdout, stderr },
              { status: 500 }
            )
          );
        }
      });

      pyProcess.on('error', (err) => {
        resolve(NextResponse.json({ error: `Process spawn error: ${err.message}` }, { status: 500 }));
      });
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
