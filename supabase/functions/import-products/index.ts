import { corsHeaders, getSupabaseServiceClient, getSupabaseUserClient } from '../_shared/supabaseClient.ts';
import { ImportProductsInputSchema } from '../_shared/zodSchemas.ts';
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

    // Role check: Only managers can import products
    const { data: profile } = await serviceClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'RECEIVING_MANAGER') {
      return new Response(JSON.stringify({ error: 'Forbidden: Only Receiving Managers can import product catalogue items.' }), {
        status: 403,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const validated = ImportProductsInputSchema.safeParse(body);
    if (!validated.success) {
      return new Response(JSON.stringify({ error: 'Validation failed', details: validated.error.issues }), {
        status: 400,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    }

    const { products } = validated.data;
    const imported: unknown[] = [];

    for (const item of products) {
      const { data, error } = await serviceClient
        .from('products')
        .upsert({
          sku: item.sku,
          barcode_gtin: item.barcode_gtin,
          name: item.name,
          description: item.description || null,
          variant: item.variant || null,
          colour: item.colour || null,
          units_per_carton: item.units_per_carton,
          dimensions_cm: item.dimensions_cm || null,
          weight_kg: item.weight_kg || null,
          reference_image_url: item.reference_image_url || null,
        }, { onConflict: 'sku' })
        .select('*')
        .single();

      if (error) {
        return new Response(JSON.stringify({ error: `Failed to import product ${item.sku}`, details: error }), {
          status: 500,
          headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
        });
      }
      imported.push(data);
    }

    // Log audit
    await logAuditEvent(serviceClient, {
      entity_type: 'product_catalogue',
      entity_id: user.id,
      action: 'PRODUCTS_IMPORTED',
      actor_id: user.id,
      actor_role: profile.role,
      metadata: { count: imported.length },
    });

    return new Response(JSON.stringify({ success: true, count: imported.length, products: imported }), {
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
