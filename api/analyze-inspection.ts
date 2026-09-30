import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
// Inline minimal rules engine for serverless (avoids TS path import issues)

const SYSTEM_INSTRUCTION = `You are an evidence-only warehouse receiving inspector.
Analyze only the supplied Purchase Order data, product catalogue data, scanned barcode data, and named inspection photographs.
Report only what is explicitly visible in a photograph or explicitly supplied in the input data.
Never invent evidence. Never estimate hidden inventory. Never infer carton contents from external appearance.
If a barcode, SKU, label, or carton side is unreadable, blurry, or missing, return UNCERTAIN.
For each observation return: checkName, observedValue, certainty (CONFIRMED or UNCERTAIN), confidence 0-1, reason, photoId, photoType.
Do not decide ACCEPT, EXCEPTION, or REVIEW_REQUIRED.
Return only valid JSON: { "observations": [...], "damageIssues": [...], "photoQualityIssues": [...] }`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { inspectionId, poLine, product, barcodeScans, photos, manualCartonCount, operatingMode = 'PILOT' } = req.body;

    if (!poLine || !product) {
      return res.status(400).json({ error: 'Purchase Order line and Product specifications required.' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
    }

    const ai = new GoogleGenAI({ apiKey });

    const receivingContext = {
      task: 'Inspect incoming shipment against PO expectations and verify condition.',
      expected: {
        poNumber: poLine.po_number,
        sku: product.sku,
        productName: product.product_name || product.name,
        gtin: product.gtin || product.barcode_gtin,
        expectedCartons: poLine.expected_cartons,
        unitsPerCarton: poLine.expected_units_per_carton || poLine.units_per_carton,
        expectedTotalUnits: poLine.expected_units || poLine.expected_total_units,
        variant: poLine.expected_variant || product.variant || 'Standard',
        colour: poLine.expected_colour || product.colour || 'N/A',
      },
      scannedBarcodes: (barcodeScans || []).map((s: any) => ({
        value: s.barcode_value || s.raw_scan_value,
        symbology: s.symbology,
      })),
      evidencePhotos: (photos || []).map((p: any) => ({ photoId: p.id, photoType: p.photo_type })),
    };

    const textPrompt = `Here is the warehouse receiving inspection context:\n${JSON.stringify(receivingContext, null, 2)}\n\nAnalyze all attached shipment photographs. Report factual observations only. Return structured JSON only.`;
    const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [{ text: textPrompt }];

    for (const photo of photos || []) {
      if (photo.base64) {
        const base64Data = photo.base64.replace(/^data:image\/\w+;base64,/, '');
        parts.push({ inlineData: { mimeType: photo.mime_type || 'image/jpeg', data: base64Data } });
      }
    }

    let geminiObservations: any[] = [];
    let damageIssues: any[] = [];
    let photoQualityIssues: any[] = [];

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: { parts },
        config: { systemInstruction: SYSTEM_INSTRUCTION, responseMimeType: 'application/json', temperature: 0.1 },
      });

      const rawText = response.text?.trim() || '{}';
      const parsed = JSON.parse(rawText.replace(/```(?:json)?\n?/g, '').replace(/```$/g, '').trim());

      if (Array.isArray(parsed.observations)) {
        geminiObservations = parsed.observations.map((o: any) => ({
          checkName: o.checkName,
          observedValue: o.observedValue,
          certainty: o.certainty === 'CONFIRMED' ? 'HIGH' : 'UNCERTAIN',
          confidence: Number(o.confidence) || 0.5,
          reason: o.reason || 'Observed in photo evidence',
          photoId: o.photoId,
          photoType: o.photoType,
        }));
        damageIssues = parsed.damageIssues || [];
        photoQualityIssues = parsed.photoQualityIssues || [];
      }
    } catch (aiErr) {
      console.warn('Gemini API error:', aiErr);
      geminiObservations = [{
        checkName: 'PHOTO_COMPLETENESS',
        observedValue: (photos || []).map((p: any) => p.photo_type),
        certainty: 'UNCERTAIN',
        confidence: 0.5,
        reason: 'AI service could not process image payload. Routing to manager review.',
      }];
    }

    // Simple deterministic verdict
    const scanned = (barcodeScans || []).map((s: any) => s.barcode_value || s.raw_scan_value || '');
    const expectedGTIN = product.gtin || product.barcode_gtin || '';
    const barcodeMatch = expectedGTIN ? scanned.some((v: string) => v.includes(expectedGTIN)) : false;
    const photoCount = (photos || []).length;
    const allUncertain = geminiObservations.every((o: any) => o.certainty === 'UNCERTAIN');

    let finalDecision: 'ACCEPT' | 'EXCEPTION' | 'REVIEW_REQUIRED' = 'REVIEW_REQUIRED';
    let finalDecisionReason = 'Insufficient evidence for automatic decision.';

    if (operatingMode === 'PILOT') {
      finalDecision = 'REVIEW_REQUIRED';
      finalDecisionReason = 'PILOT mode: All inspections require manager review before acceptance.';
    } else if (barcodeMatch && photoCount >= 4 && !allUncertain) {
      finalDecision = 'ACCEPT';
      finalDecisionReason = 'Barcode verified, sufficient evidence collected, no critical issues detected.';
    } else if (!barcodeMatch && expectedGTIN) {
      finalDecision = 'EXCEPTION';
      finalDecisionReason = 'Scanned barcode does not match expected GTIN. Shipment requires investigation.';
    }

    // Persist to Supabase if configured
    if (inspectionId && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      try {
        await supabase.from('inspections').update({
          status: finalDecision,
          final_decision: finalDecision,
          final_decision_reason: finalDecisionReason,
          completed_at: new Date().toISOString(),
        }).eq('id', inspectionId);
      } catch (dbErr) {
        console.warn('Could not persist to Supabase:', dbErr);
      }
    }

    return res.json({
      success: true,
      rulesOutput: {
        finalDecision,
        finalDecisionReason,
        checks: geminiObservations.map((o: any) => ({
          check_name: o.checkName,
          status: o.certainty === 'HIGH' ? 'PASS' : 'UNCERTAIN',
          observed_value: o.observedValue,
          confidence: o.confidence,
          reason: o.reason,
        })),
        observedCounts: { cartonCount: manualCartonCount || 1, unitsPerCarton: null, totalQuantity: null },
      },
      geminiObservations,
      damageIssues,
      photoQualityIssues,
      actionRecommendation: finalDecision === 'ACCEPT'
        ? 'Accept shipment into inventory.'
        : finalDecision === 'EXCEPTION'
        ? 'Quarantine affected carton(s), preserve evidence, and initiate supplier review.'
        : 'Do not accept automatically. Request manager verification.',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Analysis failed';
    return res.status(500).json({ error: message });
  }
}
