import { corsHeaders, getSupabaseServiceClient, getSupabaseUserClient } from '../_shared/supabaseClient.ts';
import { ExportInspectionReportInputSchema } from '../_shared/zodSchemas.ts';

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

    const url = new URL(req.url);
    const inspectionIdQuery = url.searchParams.get('inspection_id');
    const formatQuery = url.searchParams.get('format') || 'json';

    let bodyData: { inspection_id?: string; format?: string } = {};
    if (req.method === 'POST') {
      try {
        bodyData = await req.json();
      } catch {
        // empty body ok if query params used
      }
    }

    const validated = ExportInspectionReportInputSchema.safeParse({
      inspection_id: bodyData.inspection_id || inspectionIdQuery,
      format: bodyData.format || formatQuery,
    });

    if (!validated.success) {
      return new Response(JSON.stringify({ error: 'Validation failed', details: validated.error.issues }), {
        status: 400,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    }

    const { inspection_id, format } = validated.data;

    // Fetch full inspection graph
    const { data: inspection, error: inspError } = await serviceClient
      .from('inspections')
      .select(`
        *,
        purchase_orders(*, suppliers(*)),
        purchase_order_lines(*, products(*)),
        profiles:operator_id(id, full_name, email, badge_id),
        inspection_checks(*),
        exceptions(*),
        barcode_scans(*),
        inspection_photos(*),
        inspection_reviews(*, profiles:reviewer_id(full_name))
      `)
      .eq('id', inspection_id)
      .single();

    if (inspError || !inspection) {
      return new Response(JSON.stringify({ error: 'Inspection not found.' }), {
        status: 404,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    }

    // Role check: Operators can only export their own inspection reports
    const { data: profile } = await serviceClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'RECEIVING_MANAGER' && inspection.operator_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden.' }), {
        status: 403,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    }

    if (format === 'markdown') {
      const po = inspection.purchase_orders;
      const supplier = po?.suppliers;
      const product = inspection.purchase_order_lines?.products;

      let md = `# DockProof AI — Smart Receiving Verification Report\n\n`;
      md += `**Inspection ID:** \`${inspection.id}\`\n`;
      md += `**Date:** ${new Date(inspection.created_at).toLocaleString()}\n`;
      md += `**Operating Mode:** ${inspection.mode}\n`;
      md += `**Final Decision:** **${inspection.final_decision || inspection.status}**\n`;
      md += `**Decision Reason:** ${inspection.final_decision_reason || 'N/A'}\n\n`;
      md += `## 1. Purchase Order & Shipment Details\n`;
      md += `- **PO Number:** ${po?.po_number || 'N/A'}\n`;
      md += `- **Supplier:** ${supplier?.name || 'N/A'} (${supplier?.code || 'N/A'})\n`;
      md += `- **SKU:** ${product?.sku || 'N/A'}\n`;
      md += `- **Product Name:** ${product?.name || 'N/A'}\n`;
      md += `- **GTIN Barcode:** ${product?.barcode_gtin || 'N/A'}\n`;
      md += `- **Observed Cartons:** ${inspection.carton_count_observed ?? 'Unverified'} (Expected: ${inspection.purchase_order_lines?.expected_cartons})\n`;
      md += `- **Total Units:** ${inspection.total_quantity_observed ?? 'Unverified'} (Expected: ${inspection.purchase_order_lines?.expected_total_units})\n\n`;

      md += `## 2. Verification Checks (${inspection.inspection_checks?.length || 0})\n\n`;
      md += `| Check Name | Essential | Status | Confidence | Reason |\n`;
      md += `|---|:---:|:---:|:---:|---|\n`;
      for (const ch of inspection.inspection_checks || []) {
        md += `| \`${ch.check_name}\` | ${ch.is_essential ? 'YES' : 'NO'} | **${ch.status}** | ${(ch.confidence * 100).toFixed(0)}% | ${ch.reason} |\n`;
      }

      md += `\n## 3. Discrepancies & Exceptions (${inspection.exceptions?.length || 0})\n\n`;
      if (inspection.exceptions?.length === 0) {
        md += `*No discrepancies detected.*\n\n`;
      } else {
        for (const exc of inspection.exceptions || []) {
          md += `- **[${exc.severity}] ${exc.exception_type}**: ${exc.root_cause} (Status: ${exc.status})\n`;
        }
      }

      md += `\n## 4. Manager Reviews & Audits\n\n`;
      if (inspection.inspection_reviews?.length === 0) {
        md += `*Pending Manager Review in PILOT mode.*\n\n`;
      } else {
        for (const rev of inspection.inspection_reviews || []) {
          md += `- **${rev.review_decision}** by ${rev.profiles?.full_name || 'Manager'}: ${rev.comments} (${new Date(rev.created_at).toLocaleString()})\n`;
        }
      }

      return new Response(md, {
        status: 200,
        headers: { ...corsHeaders(), 'Content-Type': 'text/markdown; charset=utf-8' },
      });
    }

    return new Response(JSON.stringify({ success: true, report: inspection }), {
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
