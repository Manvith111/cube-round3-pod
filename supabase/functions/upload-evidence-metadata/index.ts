import { corsHeaders, getSupabaseServiceClient, getSupabaseUserClient } from '../_shared/supabaseClient.ts';
import { UploadEvidenceMetadataInputSchema } from '../_shared/zodSchemas.ts';
import { logAuditEvent } from '../_shared/auditLogger.ts';

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders() });
  }

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const userClient = getSupabaseUserClient(authHeader);
    const serviceClient = getSupabaseServiceClient();

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized.' }), {
        status: 401,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const validated = UploadEvidenceMetadataInputSchema.safeParse(body);
    if (!validated.success) {
      return new Response(JSON.stringify({ error: 'Validation failed', details: validated.error.issues }), {
        status: 400,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    }

    const {
      inspection_id,
      storage_path,
      bucket_name,
      photo_type,
      sha256_hash,
      file_size_bytes,
      mime_type,
      captured_at,
    } = validated.data;

    // Verify inspection exists, belongs to this operator, and is in progress
    const { data: inspection, error: inspError } = await serviceClient
      .from('inspections')
      .select('id, operator_id, status')
      .eq('id', inspection_id)
      .single();

    if (inspError || !inspection) {
      return new Response(JSON.stringify({ error: 'Inspection not found.' }), {
        status: 404,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    }

    // Role check: Only the owning operator or a manager can upload evidence
    const { data: profile } = await serviceClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const isManager = profile?.role === 'RECEIVING_MANAGER';
    if (inspection.operator_id !== user.id && !isManager) {
      return new Response(JSON.stringify({ error: 'Forbidden: You do not own this inspection.' }), {
        status: 403,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    }

    if (inspection.status !== 'IN_PROGRESS' && inspection.status !== 'ANALYZING') {
      return new Response(JSON.stringify({ error: `Cannot upload evidence: Inspection is in ${inspection.status} status.` }), {
        status: 400,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    }

    // Check for duplicate hash
    const { data: existingPhoto } = await serviceClient
      .from('inspection_photos')
      .select('id, storage_path')
      .eq('inspection_id', inspection_id)
      .eq('sha256_hash', sha256_hash)
      .maybeSingle();

    if (existingPhoto) {
      return new Response(JSON.stringify({
        warning: 'Photo with identical SHA-256 hash already registered for this inspection.',
        photo: existingPhoto,
      }), {
        status: 200,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    }

    // Insert metadata
    const { data: photo, error: insertError } = await serviceClient
      .from('inspection_photos')
      .insert({
        inspection_id,
        storage_path,
        bucket_name,
        photo_type,
        sha256_hash,
        file_size_bytes,
        mime_type,
        operator_id: user.id,
        captured_at: captured_at || new Date().toISOString(),
      })
      .select('*')
      .single();

    if (insertError) {
      return new Response(JSON.stringify({ error: 'Failed to record photo metadata', details: insertError }), {
        status: 500,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    }

    // Log audit
    await logAuditEvent(serviceClient, {
      entity_type: 'inspection_photo',
      entity_id: photo.id,
      action: 'EVIDENCE_PHOTO_REGISTERED',
      actor_id: user.id,
      actor_role: profile?.role,
      new_state: photo,
      metadata: { photo_type, file_size_bytes, sha256_hash },
    });

    return new Response(JSON.stringify({ success: true, photo }), {
      status: 201,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
    });
  }
}

export default handler;
