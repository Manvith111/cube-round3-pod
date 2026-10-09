import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    const casesPath = path.resolve(process.cwd(), '../data/sample/cases.json');
    const altPath = path.resolve(process.cwd(), 'data/sample/cases.json');
    const target = fs.existsSync(casesPath) ? casesPath : fs.existsSync(altPath) ? altPath : null;

    if (target) {
      const raw = fs.readFileSync(target, 'utf-8');
      const cases = JSON.parse(raw);

      // Check CSV mappings
      const sampleDir = path.dirname(target);
      const readCsvUnits = (filename: string): Set<string> => {
        const p = path.join(sampleDir, filename);
        if (!fs.existsSync(p)) return new Set();
        const lines = fs.readFileSync(p, 'utf-8').split('\n');
        const s = new Set<string>();
        for (let i = 1; i < lines.length; i++) {
          const parts = lines[i].split(',');
          if (parts[1]) s.add(parts[1].trim());
        }
        return s;
      };

      const packUnits = readCsvUnits('pack_sample.csv');
      const prepUnits = readCsvUnits('prep_sample.csv');
      const returnsUnits = readCsvUnits('returns_sample.csv');

      const preview = cases.map((c: any) => ({
        unit_id: c.unit_id,
        org_id: c.org_id,
        route: c.route || 'unknown',
        returned: !!c.returned,
        has_pack: packUnits.has(c.unit_id),
        has_prep: prepUnits.has(c.unit_id),
        has_returns: returnsUnits.has(c.unit_id),
        label: `${c.unit_id} [${(c.route || 'UNKNOWN').toUpperCase()}${c.returned ? ' + RETURN' : ''}] • ${c.org_id}`
      }));

      return NextResponse.json({ cases: preview });
    }

    return NextResponse.json({
      cases: [
        { unit_id: 'UNIT-0006', org_id: 'org_demo_bravo', route: 'mfn', returned: false, has_pack: true, has_prep: false, has_returns: false, label: 'UNIT-0006 [MFN] • org_demo_bravo' },
        { unit_id: 'UNIT-0008', org_id: 'org_demo_alpha', route: 'mfn', returned: false, has_pack: true, has_prep: false, has_returns: false, label: 'UNIT-0008 [MFN] • org_demo_alpha' },
        { unit_id: 'UNIT-0009', org_id: 'org_demo_bravo', route: 'mfn', returned: true, has_pack: true, has_prep: false, has_returns: true, label: 'UNIT-0009 [MFN + RETURN] • org_demo_bravo' },
        { unit_id: 'UNIT-0014', org_id: 'org_demo_alpha', route: 'fba', returned: true, has_pack: false, has_prep: true, has_returns: true, label: 'UNIT-0014 [FBA + RETURN] • org_demo_alpha' },
        { unit_id: 'UNIT-0002', org_id: 'org_demo_alpha', route: 'fba', returned: false, has_pack: false, has_prep: true, has_returns: false, label: 'UNIT-0002 [FBA] • org_demo_alpha' }
      ]
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
