import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { bucket, path: filePath, fileBase64, mimeType } = req.body;
    if (!bucket || !filePath || !fileBase64) {
      return res.status(400).json({ error: 'Missing required upload parameters.' });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL || '';
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ error: 'Supabase service role key not configured.' });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const buffer = Buffer.from(fileBase64, 'base64');
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(filePath, buffer, { contentType: mimeType || 'image/jpeg', upsert: true });

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, path: data.path });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    return res.status(500).json({ error: message });
  }
}
