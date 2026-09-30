import { corsHeaders, getSupabaseServiceClient, getSupabaseUserClient } from '../_shared/supabaseClient.ts';
import { CreateInspectionInputSchema } from '../_shared/zodSchemas.ts';
import { logAuditEvent } from '../_shared/auditLogger.ts';

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders() });
  }

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const userClient = getSupabaseUserClient(authHeader);
    const serviceClient = getSupabaseServiceClient();

    // Authenticate operator
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized. Valid bearer token required.' }), {
        status: 401,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    }

    // Get operator profile
    const { data: profile } = await serviceClient
      .from('profiles')
      .select('id, role, full_name, is_active')
      .eq('id', user.id)
      .single();

    if (!profile || !profile.is_active) {
      return new Response(JSON.stringify({ error: 'Operator profile not active or not found.' }), {
        status: 403,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const validated = CreateInspectionInputSchema.safeParse(body);
    if (!validated.success) {
      return new Response(JSON.stringify({ error: 'Validation failed', details: validated.error.issues }), {
        status: 400,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    }

    const { po_id, po_line_id, carton_count_observed, units_per_carton_observed } = validated.data;

    // Verify Purchase Order exists
    const { data: po, error: poError } = await serviceClient
      .from('purchase_orders')
      .select('id, po_number, status')
      .eq('id', po_id)
      .single();

    if (poError || !po) {
      return new Response(JSON.stringify({ error: `Purchase Order ${po_id} not found.` }), {
        status: 404,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    }

    // Determine target PO Line
    let targetPoLineId = po_line_id;
    if (!targetPoLineId) {
      const { data: firstLine } = await serviceClient
        .from('purchase_order_lines')
        .select('id')
        .eq('purchase_order_id', po_id)
        .limit(1)
        .single();
      targetPoLineId = firstLine?.id;
    }

    // Check operating mode (default PILOT)
    const { data: setting } = await serviceClient
      .from('application_settings')
      .select('value')
      .eq('key', 'operating_mode')
      .single();
    const operatingMode = setting?.value?.mode || 'PILOT';

    // Insert inspection
    const { data: inspection, error: insertError } = await serviceClient
      .from('inspections')
      .insert({
        po_id,
        po_line_id: targetPoLineId || null,
        operator_id: user.id,
        status: 'IN_PROGRESS',
        mode: operatingMode,
        carton_count_observed: carton_count_observed || null,
        units_per_carton_observed: units_per_carton_observed || null,
      })
      .select('*, purchase_orders(po_number)')
      .single();

    if (insertError) {
      return new Response(JSON.stringify({ error: 'Failed to create inspection', details: insertError }), {
        status: 500,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    }

    // Log audit
    await logAuditEvent(serviceClient, {
      entity_type: 'inspection',
      entity_id: inspection.id,
      action: 'INSPECTION_CREATED',
      actor_id: user.id,
      actor_role: profile.role,
      new_state: inspection,
      metadata: { po_number: po.po_number, mode: operatingMode },
    });

    return new Response(JSON.stringify({ success: true, inspection }), {
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

// Default export for Deno runtime
export default handler;
