import { NextRequest, NextResponse } from 'next/server';
import { backend, failure, guardPost } from '@/lib/backend';

export const dynamic = 'force-dynamic';

/**
 * Saves one capture photo into data/input/<unit>/<stage>/ by way of the backend, which is the only place that
 * decides names and checks that the bytes really are an image. Accepts either JSON with image_base64
 * (camera snapshots) or multipart form data with a file (uploads). `role` is only used by Returns:
 * "reference" (catalogue photo) or "returned" (photo of the item that came back); every other stage uses "capture".
 */
export async function POST(req: NextRequest) {
  const refused = guardPost(req, { json: false }); // JSON (camera) or multipart (file upload) are both fine here
  if (refused) return refused;
  try {
    const contentType = req.headers.get('content-type') || '';
    let unitId = '';
    let stage = '';
    let role = 'capture';
    let filename = '';
    let base64 = '';

    if (contentType.includes('application/json')) {
      const json = await req.json();
      unitId = json.unit_id || '';
      stage = json.stage || '';
      role = json.role || 'capture';
      filename = json.filename || `${stage}_camera_${Date.now()}.jpg`;
      const raw: string = json.image_base64 || '';
      base64 = raw.replace(/^data:[A-Za-z0-9+/.-]+;base64,/, '');
    } else {
      const form = await req.formData();
      unitId = (form.get('unit_id') as string) || '';
      stage = (form.get('stage') as string) || '';
      role = (form.get('role') as string) || 'capture';
      const file = form.get('file') as File | null;
      if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
      filename = file.name || `${stage}_capture.jpg`;
      base64 = Buffer.from(await file.arrayBuffer()).toString('base64');
    }

    const result = await backend<{ saved: any[]; errors: { source: string; error: string }[] }>(
      '/api/captures/upload',
      { method: 'POST', body: { unit: unitId, stage, items: [{ role, filename, data_b64: base64 }] } }
    );

    if (result.errors?.length) {
      return NextResponse.json({ error: result.errors[0].error }, { status: 422 });
    }
    const saved = result.saved[0];

    // Optional Supabase Storage copy: only when SUPABASE_URL and a key are set in this app's environment.
    // The path uses the name the backend gave the file, never the browser's file name.
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'commerce-evidence-captures';
    if (supabaseUrl && supabaseKey && !supabaseUrl.includes('your-project') && saved.status === 'saved') {
      try {
        await fetch(`${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/${bucket}/${unitId}/${stage}/${saved.name}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${supabaseKey}`,
            apikey: supabaseKey,
            'Content-Type': 'application/octet-stream',
            'x-upsert': 'true',
          },
          body: Buffer.from(base64, 'base64'),
        });
      } catch (cloudErr) {
        console.warn('Supabase upload sync warning:', cloudErr);
      }
    }

    return NextResponse.json({
      success: true,
      status: saved.status, // "saved" or "already_present"
      saved_path: `data/input/${saved.ref}`,
      filename: saved.name,
      size: saved.size,
    });
  } catch (error) {
    return failure(error);
  }
}
