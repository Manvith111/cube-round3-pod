import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { inspectionId, newStatus, overrideReason, managerName = 'Receiving Manager' } = req.body;
    if (!inspectionId || !newStatus || !overrideReason) {
      return res.status(400).json({ error: 'Inspection ID, new status, and override reason are required.' });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL || '';
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ error: 'Supabase service role key not configured.' });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    await supabase.from('inspections').update({
      status: newStatus,
      final_decision: newStatus,
      final_decision_reason: `[Manager Override by ${managerName}]: ${overrideReason}`,
      reviewed_at: new Date().toISOString(),
    }).eq('id', inspectionId);

    return res.json({ success: true, newStatus });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Override failed';
    return res.status(500).json({ error: message });
  }
}
