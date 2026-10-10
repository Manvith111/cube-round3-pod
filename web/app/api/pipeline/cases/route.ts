import { NextResponse } from 'next/server';

const BACKEND = (process.env.POD_BACKEND_URL || 'http://127.0.0.1:8200').replace(/\/$/, '');

const FALLBACK = [
  { unit_id: 'UNIT-0006', org_id: 'org_demo_bravo', route: 'mfn', returned: false, has_pack: true, has_prep: false, has_returns: false, label: 'UNIT-0006 [MFN] • org_demo_bravo' },
  { unit_id: 'UNIT-0008', org_id: 'org_demo_alpha', route: 'mfn', returned: false, has_pack: true, has_prep: false, has_returns: false, label: 'UNIT-0008 [MFN] • org_demo_alpha' },
  { unit_id: 'UNIT-0009', org_id: 'org_demo_bravo', route: 'mfn', returned: true, has_pack: true, has_prep: false, has_returns: true, label: 'UNIT-0009 [MFN + RETURN] • org_demo_bravo' },
  { unit_id: 'UNIT-0014', org_id: 'org_demo_alpha', route: 'fba', returned: true, has_pack: false, has_prep: true, has_returns: true, label: 'UNIT-0014 [FBA + RETURN] • org_demo_alpha' },
  { unit_id: 'UNIT-0002', org_id: 'org_demo_alpha', route: 'fba', returned: false, has_pack: false, has_prep: true, has_returns: false, label: 'UNIT-0002 [FBA] • org_demo_alpha' },
];

export async function GET() {
  try {
    const resp = await fetch(`${BACKEND}/api/pipeline-cases`, { cache: 'no-store' });
    if (resp.ok) {
      const data = await resp.json();
      if (Array.isArray(data?.cases) && data.cases.length > 0) {
        return NextResponse.json({ cases: data.cases });
      }
    }
  } catch {
    // fall through to the static fallback list below
  }
  return NextResponse.json({ cases: FALLBACK });
}
