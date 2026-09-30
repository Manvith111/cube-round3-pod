import { corsHeaders, getSupabaseServiceClient, getSupabaseUserClient } from '../_shared/supabaseClient.ts';
import { CreateSignedEvidenceUrlInputSchema } from '../_shared/zodSchemas.ts';

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
    const validated = CreateSignedEvidenceUrlInputSchema.safeParse(body);
    if (!validated.success) {
      return new Response(JSON.stringify({ error: 'Validation failed', details: validated.error.issues }), {
        status: 400,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    }

    const { storage_path, bucket_name, expires_in_seconds } = validated.data;

    // Check permissions
    const { data: profile } = await serviceClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const isManager = profile?.role === 'RECEIVING_MANAGER';

    // If bucket is inspection-evidence or inspection-analysis, check if operator owns the inspection
    if (bucket_name === 'inspection-evidence' || bucket_name === 'inspection-analysis') {
      const inspectionIdPrefix = storage_path.split('/')[0];
      if (!isManager) {
        const { data: inspection } = await serviceClient
          .from('inspections')
          .select('operator_id')
          .eq('id', inspectionIdPrefix)
          .single();

        if (!inspection || inspection.operator_id !== user.id) {
          return new Response(JSON.stringify({ error: 'Forbidden: You do not have permission to view evidence for this inspection.' }), {
            status: 403,
            headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
          });
        }
      }
    }

    // Generate signed URL
    const { data, error } = await serviceClient.storage
      .from(bucket_name)
      .createSignedUrl(storage_path, expires_in_seconds);

    if (error || !data?.signedUrl) {
      return new Response(JSON.stringify({ error: 'Failed to generate signed URL', details: error }), {
        status: 500,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      signedUrl: data.signedUrl,
      expiresAt: new Date(Date.now() + expires_in_seconds * 1000).toISOString(),
    }), {
      status: 200,
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
