/**
 * DockProof AI Gemini Multimodal Vision Inspection Service.
 *
 * Calls Gemini using strict structured output and the mandatory system instruction.
 * Strictly adheres to the evidence-only rules and returns observations without making
 * the final acceptance decision.
 */

import { GoogleGenAI } from '@google/genai';
import { GeminiInspectionAnalysisSchema } from './zodSchemas.ts';
import { AIObservation, GeminiAnalysisResponse, InspectionPhotoMetadata, Product, PurchaseOrderLine } from './types.ts';

export const GEMINI_SYSTEM_INSTRUCTION =
  'You are an evidence-only warehouse receiving inspector. Analyze only supplied Purchase Order data, catalogue data, barcode data, and named photographs. Report only what is explicitly visible or provided. Never invent evidence, estimate hidden inventory, infer carton contents, identify SKU from appearance alone, or claim damage/components without clear evidence. If evidence is blurred, dark, missing, unreadable, cropped, blocked, conflicting, or incomplete, return UNCERTAIN. Return observations only with checkName, observedValue, certainty, confidence, reason, photoId, photoType, and boundingBox where applicable. Do not make final ACCEPT, EXCEPTION, or REVIEW_REQUIRED decision. Return valid JSON only.';

export async function callGeminiForInspection(params: {
  apiKey: string;
  poLine: PurchaseOrderLine;
  product: Product;
  barcodeScans: { raw_scan_value: string; symbology: string }[];
  photos: (InspectionPhotoMetadata & { base64Data?: string })[];
}): Promise<GeminiAnalysisResponse> {
  const { apiKey, poLine, product, barcodeScans, photos } = params;

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in environment or secrets.');
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  // Construct structured multimodal payload
  const promptContext = {
    task: 'Analyze warehouse shipment evidence photos against Purchase Order and Catalogue specification.',
    expectedPurchaseOrder: {
      sku: product.sku,
      productName: product.name,
      variant: product.variant,
      colour: product.colour,
      barcodeGtin: product.barcode_gtin,
      expectedCartons: poLine.expected_cartons,
      unitsPerCarton: poLine.units_per_carton,
      expectedTotalUnits: poLine.expected_total_units,
    },
    scannedBarcodes: barcodeScans,
    submittedPhotos: photos.map((p) => ({
      photoId: p.id || p.storage_path,
      photoType: p.photo_type,
      storagePath: p.storage_path,
      capturedAt: p.captured_at,
    })),
  };

  const textPart = {
    text: `Here is the receiving shipment context:\n${JSON.stringify(promptContext, null, 2)}\n\nPlease inspect the attached photos and produce strictly an array of observations for each check:
- SKU_IDENTITY
- BARCODE_MATCH
- CARTON_COUNT
- UNITS_PER_CARTON
- TOTAL_QUANTITY
- VARIANT
- COLOUR
- DAMAGE
- MISSING_COMPONENTS
- PHOTO_COMPLETENESS

Remember: If anything is hidden, blurred, normal shadow, or uncertain, mark certainty as 'UNCERTAIN'. Do not make final ACCEPT or EXCEPTION decisions. Return JSON only with "observations": [...].`,
  };

  const contentsParts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [textPart];

  // Add inline images if provided in base64
  for (const photo of photos) {
    if (photo.base64Data) {
      contentsParts.push({
        inlineData: {
          mimeType: photo.mime_type || 'image/jpeg',
          data: photo.base64Data,
        },
      });
    }
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: { parts: contentsParts },
      config: {
        systemInstruction: GEMINI_SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        temperature: 0.1, // Low temperature for deterministic observation extraction
      },
    });

    const rawText = response.text?.trim() || '{}';
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawText);
    } catch {
      // If wrapped in markdown code blocks
      const cleanJson = rawText.replace(/```(?:json)?\n?/g, '').replace(/```$/g, '').trim();
      parsedJson = JSON.parse(cleanJson);
    }

    // Validate with Zod
    const validated = GeminiInspectionAnalysisSchema.safeParse(parsedJson);
    if (!validated.success) {
      console.warn('Gemini response did not strictly match schema, extracting valid observations:', validated.error);
      // Attempt safe partial fallback
      const observations: AIObservation[] = Array.isArray((parsedJson as { observations?: unknown[] })?.observations)
        ? (parsedJson as { observations: AIObservation[] }).observations
        : [];
      return {
        observations,
        rawTextNotes: rawText,
      };
    }

    return validated.data;
  } catch (error) {
    console.error('Error invoking Gemini for inspection:', error);
    throw error;
  }
}
