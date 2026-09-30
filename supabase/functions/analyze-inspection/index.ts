import { corsHeaders, getSupabaseServiceClient, getSupabaseUserClient } from '../_shared/supabaseClient.ts';
import { AnalyzeInspectionInputSchema } from '../_shared/zodSchemas.ts';
import { runDeterministicRulesEngine } from '../_shared/rulesEngine.ts';
import { callGeminiForInspection } from '../_shared/geminiService.ts';
import { parseZXingBarcode } from '../_shared/zxingBarcode.ts';
import { checkIdempotency, computeRequestHash, saveIdempotencyRecord } from '../_shared/idempotency.ts';
import { logAuditEvent } from '../_shared/auditLogger.ts';
import { AIObservation, InspectionPhotoMetadata, InspectionReport, OperatingMode } from '../_shared/types.ts';

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
    const validated = AnalyzeInspectionInputSchema.safeParse(body);
    if (!validated.success) {
      return new Response(JSON.stringify({ error: 'Validation failed', details: validated.error.issues }), {
        status: 400,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    }

    const { inspection_id, barcode_scans: rawScans, manual_carton_count } = validated.data;
    const idempotencyKey = req.headers.get('idempotency-key') || validated.data.idempotency_key;

    // 1. Prevent duplicate execution using idempotency keys
    const requestHash = computeRequestHash({ inspection_id, rawScans, manual_carton_count });
    if (idempotencyKey) {
      const existing = await checkIdempotency(serviceClient, idempotencyKey, 'analyze-inspection', requestHash);
      if (existing) {
        return new Response(JSON.stringify(existing.response_body), {
          status: existing.response_status,
          headers: { ...corsHeaders(), 'Content-Type': 'application/json', 'X-Cache': 'IDEMPOTENT_HIT' },
        });
      }
    }

    // 2. Fetch Inspection, PO, and PO Line
    const { data: inspection, error: inspError } = await serviceClient
      .from('inspections')
      .select('*, purchase_orders(*)')
      .eq('id', inspection_id)
      .single();

    if (inspError || !inspection) {
      return new Response(JSON.stringify({ error: 'Inspection not found.' }), {
        status: 404,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    }

    // Fetch Line and Product
    let poLineId = inspection.po_line_id;
    if (!poLineId) {
      const { data: defaultLine } = await serviceClient
        .from('purchase_order_lines')
        .select('id')
        .eq('purchase_order_id', inspection.po_id)
        .limit(1)
        .single();
      poLineId = defaultLine?.id;
    }

    const { data: poLine, error: lineError } = await serviceClient
      .from('purchase_order_lines')
      .select('*, products(*)')
      .eq('id', poLineId)
      .single();

    if (lineError || !poLine || !poLine.products) {
      return new Response(JSON.stringify({ error: 'Purchase Order Line or Product catalogue not found.' }), {
        status: 404,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    }

    const product = poLine.products;

    // 3. Process & store Barcode Scans
    const parsedScans = rawScans.map((s) =>
      parseZXingBarcode(s.raw_scan_value, s.symbology, s.zxing_metadata)
    );

    // Save barcode scans
    for (const scan of parsedScans) {
      await serviceClient.from('barcode_scans').insert({
        inspection_id,
        raw_scan_value: scan.rawValue,
        symbology: scan.symbology,
        is_gtin_valid: scan.isValidGtin,
        zxing_metadata: scan.metadata,
        scanned_by: user.id,
      });
    }

    // 4. Fetch evidence photos
    const { data: photos, error: photoError } = await serviceClient
      .from('inspection_photos')
      .select('*')
      .eq('inspection_id', inspection_id);

    if (photoError || !photos || photos.length === 0) {
      return new Response(JSON.stringify({ error: 'No evidence photos found. At least one photo required.' }), {
        status: 400,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    }

    // 5. Generate secure signed URLs & fetch image data for Gemini
    const photosWithSignedUrls: (InspectionPhotoMetadata & { base64Data?: string })[] = [];
    for (const photo of photos) {
      const { data: signedData } = await serviceClient.storage
        .from(photo.bucket_name || 'inspection-evidence')
        .createSignedUrl(photo.storage_path, 1800); // 30 minutes

      let base64Data: string | undefined;
      // Download private image blob from Supabase Storage using service role to pass directly into Gemini
      try {
        const { data: blobData, error: downloadError } = await serviceClient.storage
          .from(photo.bucket_name || 'inspection-evidence')
          .download(photo.storage_path);

        if (!downloadError && blobData) {
          const arrayBuffer = await blobData.arrayBuffer();
          base64Data = Buffer.from(arrayBuffer).toString('base64');
        }
      } catch (dlErr) {
        console.warn(`Could not download image blob for ${photo.storage_path}:`, dlErr);
      }

      photosWithSignedUrls.push({
        ...photo,
        signed_url: signedData?.signedUrl,
        base64Data,
      });
    }

    // 6. Call Gemini vision inspection service
    const apiKey = process.env.GEMINI_API_KEY || '';
    let geminiResponse: { observations: AIObservation[]; rawTextNotes?: string };

    try {
      geminiResponse = await callGeminiForInspection({
        apiKey,
        poLine,
        product,
        barcodeScans: parsedScans.map((s) => ({ raw_scan_value: s.rawValue, symbology: s.symbology })),
        photos: photosWithSignedUrls,
      });
    } catch (geminiError) {
      console.warn('Gemini call failed or timed out, returning fallback observations for safe rules evaluation:', geminiError);
      geminiResponse = {
        observations: [
          {
            checkName: 'PHOTO_COMPLETENESS',
            observedValue: photos.map((p) => p.photo_type),
            certainty: 'MEDIUM',
            confidence: 0.8,
            reason: `${photos.length} photos supplied for inspection.`,
          },
        ],
      };
    }

    // 7. Store AI observations
    for (const obs of geminiResponse.observations) {
      await serviceClient.from('ai_observations').insert({
        inspection_id,
        raw_ai_response: geminiResponse,
        check_name: obs.checkName,
        observed_value: obs.observedValue as object,
        certainty: obs.certainty,
        confidence: obs.confidence,
        reason: obs.reason,
        photo_id: obs.photoId || null,
        photo_type: obs.photoType || null,
        bounding_box: obs.boundingBox || null,
      });
    }

    // 8. Run deterministic Rules Engine
    const operatingMode: OperatingMode = (inspection.mode as OperatingMode) || 'PILOT';
    const rulesResult = runDeterministicRulesEngine({
      poLine,
      product,
      barcodeScans: parsedScans.map((s) => ({
        raw_scan_value: s.rawValue,
        symbology: s.symbology,
        is_gtin_valid: s.isValidGtin,
        zxing_metadata: s.metadata,
      })),
      photos,
      aiObservations: geminiResponse.observations,
      operatingMode,
      manualCartonCount: manual_carton_count || inspection.carton_count_observed,
    });

    // 9. Save inspection checks
    // Delete any old checks for this inspection if re-analyzing
    await serviceClient.from('inspection_checks').delete().eq('inspection_id', inspection_id);

    for (const check of rulesResult.checks) {
      await serviceClient.from('inspection_checks').insert({
        inspection_id,
        check_name: check.check_name,
        is_essential: check.is_essential,
        status: check.status,
        observed_value: check.observed_value as object,
        expected_value: check.expected_value as object,
        confidence: check.confidence,
        reason: check.reason,
        evidence_references: check.evidence_references,
      });
    }

    // 10. Create Exceptions if verified FAIL exists
    for (const exc of rulesResult.exceptionsToCreate) {
      await serviceClient.from('exceptions').insert({
        inspection_id,
        po_id: inspection.po_id,
        exception_type: exc.exception_type,
        severity: exc.severity,
        status: 'OPEN',
        root_cause: exc.root_cause,
      });
    }

    // 11. Update inspection state
    const updatedInspectionStatus =
      operatingMode === 'PILOT'
        ? 'REVIEW_REQUIRED'
        : rulesResult.finalDecision === 'ACCEPT'
        ? 'ACCEPT'
        : rulesResult.finalDecision === 'EXCEPTION'
        ? 'EXCEPTION'
        : 'REVIEW_REQUIRED';

    const { data: updatedInspection, error: updateError } = await serviceClient
      .from('inspections')
      .update({
        status: updatedInspectionStatus,
        final_decision: rulesResult.finalDecision,
        final_decision_reason: rulesResult.finalDecisionReason,
        carton_count_observed: rulesResult.observedCounts.cartonCount,
        units_per_carton_observed: rulesResult.observedCounts.unitsPerCarton,
        total_quantity_observed: rulesResult.observedCounts.totalQuantity,
        completed_at: new Date().toISOString(),
      })
      .eq('id', inspection_id)
      .select('*')
      .single();

    if (updateError) {
      console.error('Error updating inspection final state:', updateError);
    }

    // 12. Log audit event
    await logAuditEvent(serviceClient, {
      entity_type: 'inspection',
      entity_id: inspection_id,
      action: 'INSPECTION_ANALYZED',
      actor_id: user.id,
      previous_state: inspection,
      new_state: updatedInspection,
      metadata: {
        finalDecision: rulesResult.finalDecision,
        operatingMode,
        checksCount: rulesResult.checks.length,
        exceptionsCount: rulesResult.exceptionsToCreate.length,
      },
    });

    // 13. Construct structured inspection report
    const report: InspectionReport = {
      inspectionId: inspection_id,
      poNumber: inspection.purchase_orders?.po_number || 'N/A',
      sku: product.sku,
      productName: product.name,
      operatorId: user.id,
      status: updatedInspectionStatus,
      operatingMode,
      finalDecision: rulesResult.finalDecision,
      finalDecisionReason: rulesResult.finalDecisionReason,
      isManagerApprovalRequired: rulesResult.isManagerApprovalRequired,
      observedCounts: rulesResult.observedCounts,
      checks: rulesResult.checks,
      exceptions: rulesResult.exceptionsToCreate.map((e) => ({
        type: e.exception_type,
        severity: e.severity,
        cause: e.root_cause,
      })),
      photoCount: photos.length,
      scannedBarcodes: parsedScans.map((s) => s.rawValue),
      createdAt: inspection.created_at,
      completedAt: updatedInspection?.completed_at,
    };

    const responsePayload = {
      success: true,
      report,
    };

    // 14. Save idempotency record
    if (idempotencyKey) {
      await saveIdempotencyRecord(serviceClient, {
        key: idempotencyKey,
        endpoint: 'analyze-inspection',
        requestHash,
        responseStatus: 200,
        responseBody: responsePayload,
        userId: user.id,
      });
    }

    return new Response(JSON.stringify(responsePayload), {
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
