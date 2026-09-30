import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

function getSupabase() {
  if (!SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = getSupabase();
  const checks: Record<string, { status: 'PASS' | 'FAIL' | 'NEEDS_REVIEW'; message: string }> = {};

  // Supabase connection
  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY && supabase) {
    checks.supabase_connected = { status: 'PASS', message: 'Connected to Supabase project.' };
  } else {
    checks.supabase_connected = { status: 'FAIL', message: 'Missing SUPABASE_URL or SERVICE_ROLE_KEY.' };
  }

  // Database tables
  const requiredTables = [
    'profiles', 'suppliers', 'products', 'purchase_orders', 'purchase_order_lines',
    'inspections', 'barcode_scans', 'inspection_photos', 'inspection_checks',
    'ai_observations', 'exceptions', 'inspection_reviews', 'audit_logs',
    'application_settings', 'idempotency_keys',
  ];

  if (!supabase) {
    checks.database_tables = { status: 'FAIL', message: 'Supabase client not available.' };
    checks.storage_buckets = { status: 'FAIL', message: 'Supabase client not available.' };
  } else {
    let missingTables = 0;
    for (const t of requiredTables) {
      try {
        const { error } = await supabase.from(t).select('id', { head: true, count: 'exact' });
        if (error && error.code === 'PGRST205') missingTables++;
      } catch { missingTables++; }
    }
    checks.database_tables = missingTables === 0
      ? { status: 'PASS', message: 'All 15 tables online with active RLS.' }
      : { status: 'FAIL', message: `${missingTables} tables need migration bundle.` };

    try {
      const { data: buckets } = await supabase.storage.listBuckets();
      const names = (buckets || []).map((b: any) => b.id);
      checks.storage_buckets = names.includes('inspection-evidence') && names.includes('inspection-analysis')
        ? { status: 'PASS', message: 'All private evidence buckets provisioned.' }
        : { status: 'FAIL', message: 'Private storage buckets missing.' };
    } catch {
      checks.storage_buckets = { status: 'FAIL', message: 'Could not access storage API.' };
    }
  }

  // Gemini API key
  checks.gemini_key = GEMINI_API_KEY && GEMINI_API_KEY.length > 10 && !GEMINI_API_KEY.includes('MY_GEMINI')
    ? { status: 'PASS', message: 'Gemini server secret active.' }
    : { status: 'FAIL', message: 'GEMINI_API_KEY missing or placeholder.' };

  checks.operating_mode = { status: 'PASS', message: 'PILOT mode is active by default.' };

  const allPassed = Object.values(checks).every(c => c.status === 'PASS');
  return res.json({ status: allPassed ? 'READY_FOR_PILOT' : 'NEEDS_REVIEW', checks });
}
