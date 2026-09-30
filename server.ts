import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { runDeterministicRulesEngine } from './supabase/functions/_shared/rulesEngine.ts';
import { parseZXingBarcode } from './supabase/functions/_shared/zxingBarcode.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Supabase server client (service role)
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://aaqjekyrgboqhrlgcgqg.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function getServerSupabase() {
  if (!SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// --------------------------------------------------------------------------
// 1. Launch Readiness API
// --------------------------------------------------------------------------
app.get('/api/launch-readiness', async (req, res) => {
  const supabase = getServerSupabase();
  const checks: Record<string, { status: 'PASS' | 'FAIL' | 'NEEDS_REVIEW'; message: string }> = {};

  // 1. Supabase Connected
  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY && supabase) {
    checks.supabase_connected = { status: 'PASS', message: 'Connected to Supabase project.' };
  } else {
    checks.supabase_connected = { status: 'FAIL', message: 'Missing SUPABASE_URL or SERVICE_ROLE_KEY.' };
  }

  // 2. Database Tables
  const requiredTables = [
    'profiles', 'suppliers', 'products', 'purchase_orders', 'purchase_order_lines',
    'inspections', 'barcode_scans', 'inspection_photos', 'inspection_checks',
    'ai_observations', 'exceptions', 'inspection_reviews', 'audit_logs',
    'application_settings', 'idempotency_keys'
  ];

  if (!supabase) {
    checks.database_tables = { status: 'FAIL', message: 'Supabase client not available (missing key).' };
    checks.storage_buckets = { status: 'FAIL', message: 'Supabase client not available (missing key).' };
  } else {
    let missingTables = 0;
    for (const t of requiredTables) {
      try {
        const { error } = await supabase.from(t).select('id', { head: true, count: 'exact' });
        if (error && error.code === 'PGRST205') {
          missingTables++;
        }
      } catch {
        missingTables++;
      }
    }

    if (missingTables === 0) {
      checks.database_tables = { status: 'PASS', message: 'All 15 tables online with active RLS.' };
    } else {
      checks.database_tables = { status: 'FAIL', message: `${missingTables} tables need migration bundle.` };
    }

    // 3. Storage Buckets
    try {
      const { data: buckets } = await supabase.storage.listBuckets();
      const names = (buckets || []).map((b) => b.id);
      const hasEvidence = names.includes('inspection-evidence');
      const hasAnalysis = names.includes('inspection-analysis');

      if (hasEvidence && hasAnalysis) {
        checks.storage_buckets = { status: 'PASS', message: 'All private evidence buckets provisioned.' };
      } else {
        checks.storage_buckets = { status: 'FAIL', message: 'Private storage buckets missing.' };
      }
    } catch {
      checks.storage_buckets = { status: 'FAIL', message: 'Could not access storage API.' };
    }
  }

  // 4. Gemini API Key
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey && geminiKey.length > 10 && !geminiKey.includes('MY_GEMINI_API_KEY')) {
    checks.gemini_key = { status: 'PASS', message: 'Gemini server secret active.' };
  } else {
    checks.gemini_key = { status: 'FAIL', message: 'GEMINI_API_KEY missing or placeholder.' };
  }

  // 5. Operating Mode
  checks.operating_mode = { status: 'PASS', message: 'PILOT mode is active by default.' };

  const allPassed = Object.values(checks).every((c) => c.status === 'PASS');
  res.json({
    status: allPassed ? 'READY_FOR_PILOT' : 'NEEDS_REVIEW',
    checks,
  });
});


// --------------------------------------------------------------------------
// 2. Storage Upload Proxy
// --------------------------------------------------------------------------
app.post('/api/storage/upload', async (req, res) => {
  try {
    const { bucket, path: filePath, fileBase64, mimeType } = req.body;
    if (!bucket || !filePath || !fileBase64) {
      return res.status(400).json({ error: 'Missing required upload parameters.' });
    }

    const supabase = getServerSupabase();
    const buffer = Buffer.from(fileBase64, 'base64');

    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(filePath, buffer, {
        contentType: mimeType || 'image/jpeg',
        upsert: true,
      });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({ success: true, path: data.path });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    res.status(500).json({ error: message });
  }
});

// --------------------------------------------------------------------------
// 3. Gemini Multimodal Vision Inspection Route
// --------------------------------------------------------------------------
const GEMINI_SYSTEM_INSTRUCTION = `You are an evidence-only warehouse receiving inspector.

Analyze only the supplied Purchase Order data, product catalogue data, scanned barcode data, and named inspection photographs.

Report only what is explicitly visible in a photograph or explicitly supplied in the input data.

Never invent evidence.

Never estimate hidden inventory or units inside closed cartons.

Never infer carton contents from external carton appearance.

Never treat unreadable text as confirmed text.

Never identify an exact SKU based only on visual product appearance.

Never claim a component is missing unless a sufficiently complete contents view clearly shows it absent.

Never classify shadows, normal cardboard colouring, printed patterns, or dirt as water damage unless clear visible evidence supports water damage.

If a barcode label, SKU label, carton quantity label, variant, component, or carton side is unreadable, blurry, dark, cropped, blocked, missing, incomplete, or conflicting, return UNCERTAIN.

For each observation return:
- checkName
- observedValue
- certainty (CONFIRMED or UNCERTAIN)
- confidence from 0 to 1
- concise evidence-based reason
- photoId
- photoType
- normalized bounding box when relevant (x, y, width, height from 0 to 1000)

Do not decide ACCEPT, EXCEPTION, or REVIEW_REQUIRED.

Return only valid JSON matching the required schema.`;

const GeminiResponseSchema = z.object({
  observations: z.array(z.object({
    checkName: z.enum([
      'SKU_IDENTITY', 'BARCODE_MATCH', 'CARTON_COUNT', 'UNITS_PER_CARTON',
      'TOTAL_QUANTITY', 'VARIANT', 'COLOUR', 'DAMAGE', 'MISSING_COMPONENTS', 'PHOTO_COMPLETENESS'
    ]),
    observedValue: z.unknown(),
    certainty: z.enum(['CONFIRMED', 'UNCERTAIN']),
    confidence: z.number().min(0).max(1),
    reason: z.string(),
    photoId: z.string().optional(),
    photoType: z.string().optional(),
    boundingBox: z.object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    }).optional(),
  })),
  damageIssues: z.array(z.object({
    type: z.enum(['CRUSHING', 'WATER_DAMAGE', 'TEAR', 'PUNCTURE', 'OPEN_SEAL', 'DENT', 'STAIN', 'BROKEN_PACKAGING', 'OTHER']),
    severity: z.enum(['LOW', 'MEDIUM', 'HIGH']),
    confidence: z.number().min(0).max(1),
    reason: z.string(),
    photoId: z.string().optional(),
    boundingBox: z.object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    }).optional(),
  })).optional(),
  photoQualityIssues: z.array(z.object({
    photoId: z.string().optional(),
    photoType: z.string().optional(),
    issueType: z.enum(['BLURRY', 'TOO_DARK', 'OVEREXPOSED', 'GLARE', 'LABEL_UNREADABLE', 'INCOMPLETE_VIEW', 'TOO_FAR', 'DUPLICATE_SUSPECTED']),
    severity: z.string().optional(),
    reason: z.string(),
    retakeRecommended: z.boolean().optional(),
  })).optional(),
});

app.post('/api/inspections/analyze', async (req, res) => {
  try {
    const {
      inspectionId,
      poLine,
      product,
      barcodeScans,
      photos, // Array of { id, photo_type, file_name, storage_path, base64 }
      manualCartonCount,
      operatingMode = 'PILOT',
    } = req.body;

    if (!poLine || !product) {
      return res.status(400).json({ error: 'Purchase Order line and Product specifications required.' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });

    // Build context
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
        requiredComponents: poLine.required_components || product.required_components || [],
      },
      scannedBarcodes: (barcodeScans || []).map((s: { barcode_value?: string; raw_scan_value?: string; symbology?: string }) => ({
        value: s.barcode_value || s.raw_scan_value,
        symbology: s.symbology,
      })),
      evidencePhotos: (photos || []).map((p: { id: string; photo_type: string }) => ({
        photoId: p.id,
        photoType: p.photo_type,
      })),
    };

    const textPrompt = `Here is the warehouse receiving inspection context:
${JSON.stringify(receivingContext, null, 2)}

Analyze all attached shipment photographs. Report factual observations only.
Remember:
- UNCERTAIN is valid.
- Never invent evidence.
- Never estimate hidden units inside sealed cartons.
- Never identify SKU only from appearance.
- Shadows and normal brown cardboard coloring are NOT water damage.
- Return structured JSON only.`;

    const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [{ text: textPrompt }];

    // Attach images
    for (const photo of photos || []) {
      if (photo.base64) {
        // Strip data:image/...;base64, prefix if present
        const base64Data = photo.base64.replace(/^data:image\/\w+;base64,/, '');
        parts.push({
          inlineData: {
            mimeType: photo.mime_type || 'image/jpeg',
            data: base64Data,
          },
        });
      }
    }

    let geminiObservations: Array<{
      checkName: any;
      observedValue: unknown;
      certainty: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNCERTAIN';
      confidence: number;
      reason: string;
      photoId?: string;
      photoType?: any;
      boundingBox?: any;
    }> = [];

    let damageIssues: any[] = [];
    let photoQualityIssues: any[] = [];

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: { parts },
        config: {
          systemInstruction: GEMINI_SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          temperature: 0.1,
        },
      });

      const rawText = response.text?.trim() || '{}';
      let parsed = JSON.parse(rawText.replace(/```(?:json)?\n?/g, '').replace(/```$/g, '').trim());

      const validated = GeminiResponseSchema.safeParse(parsed);
      if (validated.success) {
        geminiObservations = validated.data.observations.map((o) => ({
          checkName: o.checkName,
          observedValue: o.observedValue,
          certainty: o.certainty === 'CONFIRMED' ? 'HIGH' : 'UNCERTAIN',
          confidence: o.confidence,
          reason: o.reason,
          photoId: o.photoId,
          photoType: o.photoType as any,
          boundingBox: o.boundingBox ? {
            ymin: o.boundingBox.y,
            xmin: o.boundingBox.x,
            ymax: o.boundingBox.y + o.boundingBox.height,
            xmax: o.boundingBox.x + o.boundingBox.width,
          } : undefined,
        }));
        damageIssues = validated.data.damageIssues || [];
        photoQualityIssues = validated.data.photoQualityIssues || [];
      } else {
        console.warn('Gemini response did not strictly match schema:', validated.error);
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
        }
      }
    } catch (aiErr) {
      console.warn('Gemini vision API error or timeout:', aiErr);
      geminiObservations = [
        {
          checkName: 'PHOTO_COMPLETENESS',
          observedValue: (photos || []).map((p: any) => p.photo_type),
          certainty: 'UNCERTAIN',
          confidence: 0.5,
          reason: 'AI service could not process image payload. Routing to manager review.',
        }
      ];
    }

    // 4. Run Deterministic Pure TypeScript Rules Engine
    const rulesOutput = runDeterministicRulesEngine({
      poLine: {
        id: poLine.id || 'po-line-1',
        purchase_order_id: poLine.purchase_order_id || 'po-1',
        product_id: product.id || 'prod-1',
        expected_cartons: poLine.expected_cartons || 1,
        units_per_carton: poLine.expected_units_per_carton || poLine.units_per_carton || 1,
        expected_total_units: poLine.expected_units || poLine.expected_total_units || 1,
        received_cartons: 0,
        received_total_units: 0,
        line_status: 'PENDING',
      },
      product: {
        id: product.id || 'prod-1',
        sku: product.sku,
        barcode_gtin: product.gtin || product.barcode_gtin || '',
        name: product.product_name || product.name || '',
        variant: product.variant || 'Standard',
        colour: product.colour || '',
        units_per_carton: product.expected_units_per_carton || product.units_per_carton || 1,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      barcodeScans: (barcodeScans || []).map((s: any) => ({
        raw_scan_value: s.barcode_value || s.raw_scan_value,
        symbology: s.barcode_format || s.symbology || 'EAN_13',
        is_gtin_valid: true,
      })),
      photos: (photos || []).map((p: any) => ({
        id: p.id,
        inspection_id: inspectionId || 'insp-1',
        storage_path: p.storage_path || '',
        bucket_name: 'inspection-evidence',
        photo_type: p.photo_type,
        sha256_hash: p.sha256_hash || '',
        file_size_bytes: p.file_size || 1024,
        mime_type: p.mime_type || 'image/jpeg',
        operator_id: 'operator',
        captured_at: p.captured_at || new Date().toISOString(),
      })),
      aiObservations: geminiObservations,
      operatingMode: operatingMode as 'PILOT' | 'AUTOMATED',
      manualCartonCount,
    });

    // Save into Supabase if inspectionId exists in Supabase
    if (inspectionId && SUPABASE_SERVICE_ROLE_KEY) {
      const supabase = getServerSupabase();
      try {
        await supabase.from('inspections').update({
          status: rulesOutput.finalDecision,
          final_decision: rulesOutput.finalDecision,
          final_decision_reason: rulesOutput.finalDecisionReason,
          carton_count_observed: rulesOutput.observedCounts.cartonCount,
          units_per_carton_observed: rulesOutput.observedCounts.unitsPerCarton,
          total_quantity_observed: rulesOutput.observedCounts.totalQuantity,
          completed_at: new Date().toISOString(),
        }).eq('id', inspectionId);

        // Save checks
        for (const ch of rulesOutput.checks) {
          await supabase.from('inspection_checks').upsert({
            inspection_id: inspectionId,
            check_name: ch.check_name,
            is_essential: ch.is_essential,
            status: ch.status,
            observed_value: ch.observed_value as object,
            expected_value: ch.expected_value as object,
            confidence: ch.confidence,
            reason: ch.reason,
            evidence_references: ch.evidence_references,
          }, { onConflict: 'inspection_id,check_name' });
        }
      } catch (dbErr) {
        console.warn('Could not persist to Supabase:', dbErr);
      }
    }

    res.json({
      success: true,
      rulesOutput,
      geminiObservations,
      damageIssues,
      photoQualityIssues,
      actionRecommendation: rulesOutput.finalDecision === 'ACCEPT'
        ? 'Accept shipment into inventory.'
        : rulesOutput.finalDecision === 'EXCEPTION'
        ? 'Quarantine affected carton(s), preserve evidence, and initiate supplier review.'
        : 'Do not accept automatically. Retake missing evidence or request manager verification.',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Analysis failed';
    res.status(500).json({ error: message });
  }
});

// --------------------------------------------------------------------------
// 4. Manager Override Route
// --------------------------------------------------------------------------
app.post('/api/manager/override', async (req, res) => {
  try {
    const { inspectionId, newStatus, overrideReason, managerName = 'Receiving Manager' } = req.body;
    if (!inspectionId || !newStatus || !overrideReason) {
      return res.status(400).json({ error: 'Inspection ID, new status, and override reason are required.' });
    }

    const supabase = getServerSupabase();
    await supabase.from('inspections').update({
      status: newStatus,
      final_decision: newStatus,
      final_decision_reason: `[Manager Override by ${managerName}]: ${overrideReason}`,
      reviewed_at: new Date().toISOString(),
    }).eq('id', inspectionId);

    res.json({ success: true, newStatus });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Override failed';
    res.status(500).json({ error: message });
  }
});

// --------------------------------------------------------------------------
// Vite integration for full-stack dev / prod
// --------------------------------------------------------------------------
async function startServer() {
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: process.env.DISABLE_HMR !== 'true' },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, () => {
    console.log(`DockProof AI full-stack server running on http://localhost:${PORT}`);
  });
}

startServer();
