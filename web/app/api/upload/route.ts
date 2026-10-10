import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || '';
    let unitId = 'UNIT-CUSTOM-01';
    let stage = 'pack';
    let filename = '';
    let buffer: Buffer;

    if (contentType.includes('application/json')) {
      const json = await req.json();
      unitId = json.unit_id || 'UNIT-CUSTOM-01';
      stage = json.stage || 'pack';
      const base64Data = json.image_base64 || '';
      filename = json.filename || `${stage}_camera_${Date.now()}.jpg`;

      const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        buffer = Buffer.from(matches[2], 'base64');
      } else {
        buffer = Buffer.from(base64Data, 'base64');
      }
    } else {
      const formData = await req.formData();
      unitId = (formData.get('unit_id') as string) || 'UNIT-CUSTOM-01';
      stage = (formData.get('stage') as string) || 'pack';
      const file = formData.get('file') as File;

      if (!file) {
        return NextResponse.json({ error: 'No file provided' }, { status: 400 });
      }

      const bytes = await file.arrayBuffer();
      buffer = Buffer.from(bytes);
      filename = file.name || `${stage}_capture.jpg`;
    }

    // Best-effort local persistence (works in local dev; read-only FS hosts
    // such as Vercel will throw here, so we swallow and rely on Supabase).
    try {
      const baseDir = process.env.POD_DATA_DIR || path.resolve(process.cwd(), 'data/input');
      const inputDir = path.resolve(baseDir, unitId, stage);
      if (!fs.existsSync(inputDir)) {
        fs.mkdirSync(inputDir, { recursive: true });
      }
      fs.writeFileSync(path.join(inputDir, filename), buffer);
    } catch (fsErr) {
      console.warn('Local capture write skipped (read-only FS?):', fsErr);
    }

    // Optional Supabase Cloud Storage Sync
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'commerce-evidence-captures';

    if (supabaseUrl && supabaseKey && !supabaseUrl.includes('your-project')) {
      try {
        const uploadUrl = `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/${bucket}/${unitId}/${stage}/${filename}`;
        await fetch(uploadUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey,
            'Content-Type': 'image/jpeg',
            'x-upsert': 'true'
          },
          body: buffer
        });
      } catch (cloudErr) {
        console.warn('Supabase upload sync warning:', cloudErr);
      }
    }

    return NextResponse.json({
      success: true,
      saved_path: `data/input/${unitId}/${stage}/${filename}`,
      filename,
      size: buffer.length
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
