import { corsHeaders, getSupabaseServiceClient, getSupabaseUserClient } from '../_shared/supabaseClient.ts';
import { ManagerReviewInspectionInputSchema } from '../_shared/zodSchemas.ts';
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

    // Role check: Only managers can execute reviews or overrides
    const { data: profile } = await serviceClient
      .from('profiles')
      .select('role, full_name')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'RECEIVING_MANAGER') {
      return new Response(JSON.stringify({ error: 'Forbidden: Only Receiving Managers can review or override inspections.' }), {
        status: 403,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const validated = ManagerReviewInspectionInputSchema.safeParse(body);
    if (!validated.success) {
      return new Response(JSON.stringify({ error: 'Validation failed', details: validated.error.issues }), {
        status: 400,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    }

    const { inspection_id, review_decision, review_mode, comments } = validated.data;

    // Fetch current inspection
    const { data: inspection, error: inspError } = await serviceClient
      .from('inspections')
      .select('*, purchase_order_lines(*)')
      .eq('id', inspection_id)
      .single();

    if (inspError || !inspection) {
      return new Response(JSON.stringify({ error: 'Inspection not found.' }), {
        status: 404,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    }

    // Insert review record into inspection_reviews
    const { data: reviewRecord, error: reviewError } = await serviceClient
      .from('inspection_reviews')
      .insert({
        inspection_id,
        reviewer_id: user.id,
        original_decision: inspection.final_decision || inspection.status,
        review_decision,
        review_mode,
        comments,
      })
      .select('*')
      .single();

    if (reviewError) {
      return new Response(JSON.stringify({ error: 'Failed to record review', details: reviewError }), {
        status: 500,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    }

    // Resolve or update exceptions
    if (review_decision === 'ACCEPT') {
      await serviceClient
        .from('exceptions')
        .update({
          status: review_mode === 'MANAGER_OVERRIDE' ? 'APPROVED_OVERRIDE' : 'OPEN',
          manager_notes: comments,
          resolved_by: user.id,
          resolved_at: new Date().toISOString(),
        })
        .eq('inspection_id', inspection_id);
    } else if (review_decision === 'REJECT_SHIPMENT') {
      await serviceClient
        .from('exceptions')
        .update({
          status: 'REJECTED_SHIPMENT',
          manager_notes: comments,
          resolved_by: user.id,
          resolved_at: new Date().toISOString(),
        })
        .eq('inspection_id', inspection_id);
    }

    // Determine new inspection status
    const newStatus =
      review_decision === 'ACCEPT'
        ? 'ACCEPT'
        : review_decision === 'EXCEPTION' || review_decision === 'REJECT_SHIPMENT'
        ? 'EXCEPTION'
        : 'IN_PROGRESS';

    const { data: updatedInspection, error: updateError } = await serviceClient
      .from('inspections')
      .update({
        status: newStatus,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        final_decision_reason: `[Manager Review by ${profile.full_name}]: ${comments}`,
      })
      .eq('id', inspection_id)
      .select('*')
      .single();

    if (updateError) {
      return new Response(JSON.stringify({ error: 'Failed to update inspection status', details: updateError }), {
        status: 500,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    }

    // If accepted, update PO line received counts
    if (review_decision === 'ACCEPT' && inspection.po_line_id) {
      const cartonCount = inspection.carton_count_observed || 0;
      const totalUnits = inspection.total_quantity_observed || 0;

      await serviceClient
        .from('purchase_order_lines')
        .update({
          received_cartons: cartonCount,
          received_total_units: totalUnits,
          line_status: 'COMPLETE',
        })
        .eq('id', inspection.po_line_id);
    }

    // Log audit
    await logAuditEvent(serviceClient, {
      entity_type: 'inspection',
      entity_id: inspection_id,
      action: 'INSPECTION_REVIEW_DECIDED',
      actor_id: user.id,
      actor_role: profile.role,
      previous_state: inspection,
      new_state: updatedInspection,
      metadata: { review_decision, review_mode, comments },
    });

    return new Response(JSON.stringify({
      success: true,
      inspection: updatedInspection,
      review: reviewRecord,
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
