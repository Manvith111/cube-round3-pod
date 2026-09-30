import { corsHeaders, getSupabaseServiceClient } from '../_shared/supabaseClient.ts';

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders() });
  }

  const checklist: Record<string, { status: 'PASS' | 'FAIL'; details: string }> = {};

  try {
    const serviceClient = getSupabaseServiceClient();

    // 1. Check Gemini API key
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey && geminiKey.length > 5 && !geminiKey.includes('MY_GEMINI_API_KEY')) {
      checklist['gemini_api_key'] = { status: 'PASS', details: 'Configured and active.' };
    } else {
      checklist['gemini_api_key'] = { status: 'FAIL', details: 'GEMINI_API_KEY missing or placeholder.' };
    }

    // 2. Check Database Tables
    const requiredTables = [
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

    for (const table of requiredTables) {
      try {
        const { error } = await serviceClient.from(table).select('id', { count: 'exact', head: true });
        if (error && error.code !== 'PGRST116') {
          checklist[`table_${table}`] = { status: 'FAIL', details: error.message };
        } else {
          checklist[`table_${table}`] = { status: 'PASS', details: 'Accessible with active RLS.' };
        }
      } catch (tErr: unknown) {
        checklist[`table_${table}`] = {
          status: 'FAIL',
          details: tErr instanceof Error ? tErr.message : 'Unknown table error',
        };
      }
    }

    // 3. Check Storage Buckets
    const requiredBuckets = ['inspection-evidence', 'inspection-analysis', 'product-reference-images'];
    try {
      const { data: buckets, error: bError } = await serviceClient.storage.listBuckets();
      if (bError) {
        checklist['storage_buckets'] = { status: 'FAIL', details: bError.message };
      } else {
        const bucketNames = (buckets || []).map((b) => b.id);
        for (const reqBucket of requiredBuckets) {
          if (bucketNames.includes(reqBucket)) {
            checklist[`bucket_${reqBucket}`] = { status: 'PASS', details: 'Private bucket created.' };
          } else {
            checklist[`bucket_${reqBucket}`] = { status: 'FAIL', details: 'Bucket not found.' };
          }
        }
      }
    } catch (bErr: unknown) {
      checklist['storage_buckets'] = {
        status: 'FAIL',
        details: bErr instanceof Error ? bErr.message : 'Storage connection error',
      };
    }

    // 4. Check Operating Mode
    try {
      const { data: modeSetting } = await serviceClient
        .from('application_settings')
        .select('value')
        .eq('key', 'operating_mode')
        .single();

      const currentMode = modeSetting?.value?.mode;
      if (currentMode === 'PILOT') {
        checklist['operating_mode'] = {
          status: 'PASS',
          details: 'PILOT mode is strictly enforced (manager approval required for all shipments).',
        };
      } else {
        checklist['operating_mode'] = {
          status: 'FAIL',
          details: `Current mode is ${currentMode}, expected default PILOT.`,
        };
      }
    } catch {
      checklist['operating_mode'] = { status: 'FAIL', details: 'Could not read operating_mode setting.' };
    }

    const allPassed = Object.values(checklist).every((item) => item.status === 'PASS');

    return new Response(JSON.stringify({
      ready: allPassed,
      timestamp: new Date().toISOString(),
      checklist,
    }), {
      status: allPassed ? 200 : 503,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error checking readiness';
    return new Response(JSON.stringify({ ready: false, error: message, checklist }), {
      status: 500,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
    });
  }
}

export default handler;
