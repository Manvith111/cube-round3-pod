import { corsHeaders, getSupabaseServiceClient, getSupabaseUserClient } from '../_shared/supabaseClient.ts';
import { ImportPurchaseOrdersInputSchema } from '../_shared/zodSchemas.ts';
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

    const { data: profile } = await serviceClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'RECEIVING_MANAGER') {
      return new Response(JSON.stringify({ error: 'Forbidden: Only Receiving Managers can import Purchase Orders.' }), {
        status: 403,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const validated = ImportPurchaseOrdersInputSchema.safeParse(body);
    if (!validated.success) {
      return new Response(JSON.stringify({ error: 'Validation failed', details: validated.error.issues }), {
        status: 400,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    }

    const { purchase_orders } = validated.data;
    const createdPOs: unknown[] = [];

    for (const poItem of purchase_orders) {
      // Find or create supplier
      const { data: supplier, error: supError } = await serviceClient
        .from('suppliers')
        .select('id')
        .eq('code', poItem.supplier_code)
        .single();

      if (supError || !supplier) {
        return new Response(JSON.stringify({ error: `Supplier with code "${poItem.supplier_code}" not found.` }), {
          status: 404,
          headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
        });
      }

      // Upsert PO
      const { data: po, error: poError } = await serviceClient
        .from('purchase_orders')
        .upsert({
          po_number: poItem.po_number,
          supplier_id: supplier.id,
          expected_delivery_date: poItem.expected_delivery_date || null,
          notes: poItem.notes || null,
          status: 'ISSUED',
        }, { onConflict: 'po_number' })
        .select('*')
        .single();

      if (poError || !po) {
        return new Response(JSON.stringify({ error: `Failed to insert PO ${poItem.po_number}`, details: poError }), {
          status: 500,
          headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
        });
      }

      // Insert Lines
      for (const line of poItem.lines) {
        const { data: product, error: prodError } = await serviceClient
          .from('products')
          .select('id')
          .eq('sku', line.sku)
          .single();

        if (prodError || !product) {
          return new Response(JSON.stringify({ error: `Product SKU "${line.sku}" not found in catalogue.` }), {
            status: 404,
            headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
          });
        }

        await serviceClient.from('purchase_order_lines').upsert({
          purchase_order_id: po.id,
          product_id: product.id,
          expected_cartons: line.expected_cartons,
          units_per_carton: line.units_per_carton,
          expected_total_units: line.expected_total_units,
          line_status: 'PENDING',
        }, { onConflict: 'purchase_order_id,product_id' });
      }

      createdPOs.push(po);
    }

    // Log audit
    await logAuditEvent(serviceClient, {
      entity_type: 'purchase_orders',
      entity_id: user.id,
      action: 'PURCHASE_ORDERS_IMPORTED',
      actor_id: user.id,
      actor_role: profile.role,
      metadata: { count: createdPOs.length },
    });

    return new Response(JSON.stringify({ success: true, count: createdPOs.length, purchase_orders: createdPOs }), {
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
