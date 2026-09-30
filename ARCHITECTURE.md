# DockProof AI Architecture

## 1. Architecture
DockProof AI is built on a modern, serverless stack utilizing a split frontend/backend architecture designed for rugged mobile and desktop environments. 

- **Frontend:** React 19 SPA built with Vite and styled using Tailwind CSS (Material Design 3 Token System).
- **Backend APIs:** Vercel Serverless Functions (`api/` directory) in Node.js.
- **Database / Storage:** Supabase (PostgreSQL 15 tables, RLS, and object storage buckets).
- **AI Engine:** Google Gemini 2.0 Flash (Multimodal Vision).

## 2. Components
1. **Client UI:** Handles routing, state management (Zustand/Context), theme switching, and guides operators through inspections.
2. **ZXing Barcode Engine:** WebAssembly-backed barcode scanner built into the client for real-time EAN/UPC/Code-128 decoding.
3. **Client Quality Gate:** Uses HTML5 Canvas to measure image luminance and contrast (Laplacian variance) to warn users about blurry or dark photos before they are uploaded.
4. **Vercel Serverless Gateway:** Handles API requests (`/api/analyze-inspection`, `/api/launch-readiness`). Validates payloads and orchestrates the AI calls.
5. **Deterministic Rules Engine:** A hard-coded TypeScript engine sitting between the AI and the Database. It takes raw facts from the AI and calculates final shipment status (`ACCEPT`, `EXCEPTION`, `REVIEW_REQUIRED`).
6. **Supabase PostgreSQL:** Stores products, purchase orders, inspections, barcode scans, exceptions, and audit logs.
7. **Supabase Storage:** Stores encrypted/private base64 images of the received goods.

## 3. Data Flow
1. **Initiation:** Operator selects a PO and SKU in the React Client.
2. **Barcode Scan:** Operator scans the physical carton. The client matches the GTIN against the Supabase `products` table.
3. **Capture & Gate:** Operator captures 6 required photos. The browser processes these via Canvas, ensures they pass the quality gate, and compresses them (max 1280x1280, 0.85 JPEG) to fit within serverless limits.
4. **Submission:** The client POSTs the base64 photos and the PO metadata to `/api/analyze-inspection`.
5. **AI Extraction:** The Vercel function formats the photos and prompts Gemini 2.0 Flash. Gemini returns a strict JSON array of 10 observations (e.g., `TOTAL_QUANTITY`, `DAMAGE`, `VARIANT`).
6. **Rule Evaluation:** The Vercel function passes the AI observations + Barcode scan results into the Deterministic Rules Engine.
7. **Database Persistence:** The Vercel function writes the final verdict and inspection metadata to Supabase via the Service Role Key.
8. **Client Rendering:** The API responds to the client, which navigates to the `InspectionReportView` to display the color-coded verdict and checks.

## 4. Model/Agent Usage
- **Model Used:** `gemini-2.0-flash`
- **Role:** Purely observational "Evidence-Only Inspector."
- **Prompt Strategy:** The model is strictly instructed via a detailed `SYSTEM_INSTRUCTION` to *never* invent evidence, *never* guess hidden contents, and *never* make the final business decision. It is forced to return exactly 10 strict `checkNames` (e.g., `BARCODE_MATCH`, `SKU_IDENTITY`, `DAMAGE`). 
- **Certainty Flags:** The model returns a certainty flag (`HIGH` vs `UNCERTAIN`) for each check. If a photo is unclear, the model must return `UNCERTAIN`. 

## 5. Important Engineering Decisions

### 5.1. Client-Side Image Compression
Vercel Serverless Functions enforce a strict 4.5MB payload limit. Because modern mobile cameras easily capture 4–6MB photos, uploading 6 base64 photos directly would cause a `413 Payload Too Large` error. We implemented a client-side HTML5 Canvas downscaler that enforces a maximum dimension of 1280px and applies a 0.85 JPEG compression algorithm, shrinking a 24MB payload to ~1.5MB before it hits the network.

### 5.2. Deterministic AI Guardrails
LLMs are prone to hallucination, especially when asked to make high-stakes business decisions (like accepting $50,000 worth of inventory). To combat this, we explicitly stripped decision-making power from Gemini. Gemini outputs raw visual facts (e.g., "I see 5 boxes, the label says standard"). A deterministic, hard-coded TypeScript rules engine evaluates those facts against the Supabase Purchase Order to determine the `PASS` or `FAIL` status.

### 5.3. Avoidance of `@vercel/node` Peer Conflicts
During deployment, the `@vercel/node` package conflicted heavily with `vite` and `esbuild` peer dependencies, blocking production builds. We removed the package entirely and rewrote the serverless functions to use native standard `(req: any, res: any)` types, bypassing the type conflict entirely and allowing seamless Vercel deployments.

### 5.4. Single Page App API Rewrites
Because the app is a Vite SPA, client-side routing must fall back to `index.html`. However, the API functions reside in `/api/`. We implemented a strict `vercel.json` routing matrix that safely intercepts `/api/inspections/analyze` to point to the serverless function, while routing all unmatched paths `/(.*)` to the React router.
