import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://aaqjekyrgboqhrlgcgqg.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFhcWpla3lyZ2JvcWhybGdjZ3FnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MDYwMzg1NCwiZXhwIjoyMTA2MTc5ODU0fQ.Cp8mqGckZwLuM9cDQwMufZcDXrQEqfAcnmSLvbwjdPc';

async function checkConnection() {
  console.log(`Connecting to Supabase: ${SUPABASE_URL}...`);
  const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const tables = [
    'profiles',
    'suppliers',
    'products',
    'purchase_orders',
    'purchase_order_lines',
    'inspections',
    'barcode_scans',
    'inspection_photos',
    'inspection_checks',
    'ai_observations',
    'exceptions',
    'inspection_reviews',
    'audit_logs',
    'application_settings',
    'idempotency_keys',
  ];

  console.log('Checking database tables status:');
  let readyCount = 0;
  for (const t of tables) {
    try {
      const { data, error } = await client.from(t).select('id', { head: true, count: 'exact' });
      if (error) {
        console.log(`  [✗ MISSING/NOT READY] ${t} - Code: ${error.code} (${error.message})`);
      } else {
        console.log(`  [✓ READY] ${t}`);
        readyCount++;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  [✗ ERROR] ${t}: ${msg}`);
    }
  }

  console.log('\nChecking Storage buckets:');
  try {
    const { data: buckets, error: bErr } = await client.storage.listBuckets();
    if (bErr) {
      console.log(`  Storage Error: ${bErr.message}`);
    } else {
      const names = (buckets || []).map((b) => b.id);
      console.log(`  Found ${buckets?.length || 0} buckets: ${names.join(', ') || 'None'}`);
    }
  } catch (err) {
    console.log(`  Storage Exception:`, err);
  }

  console.log(`\nResult: ${readyCount}/${tables.length} tables present.`);
}

checkConnection();
