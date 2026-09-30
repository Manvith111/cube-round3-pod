import { createClient } from '@supabase/supabase-js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { inspectionId, newStatus, overrideReason, managerName = 'Receiving Manager' } = req.body;
    if (!inspectionId || !newStatus || !overrideReason) return res.status(400).json({ error: 'Inspection ID, new status, and override reason are required.' });
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!key) return res.status(500).json({ error: 'Supabase service role key not configured.' });
    const supabase = createClient(process.env.SUPABASE_URL || '', key, { auth: { autoRefreshToken: false, persistSession: false } });
    await supabase.from('inspections').update({ status: newStatus, final_decision: newStatus, final_decision_reason: `[Manager Override by ${managerName}]: ${overrideReason}`, reviewed_at: new Date().toISOString() }).eq('id', inspectionId);
    return res.json({ success: true, newStatus });
  } catch (err: unknown) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Override failed' });
  }
}
