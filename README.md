# DockProof AI — Smart Receiving Verification Platform

## 1. Problem Understanding
Warehouse receiving docks face a high volume of inbound shipments that require meticulous inspection. Manual inspection is slow, prone to human error, and lacks verifiable evidence. Operators often fail to capture proper photographic evidence, misread barcodes, or accept damaged/incorrect variants due to fatigue or time constraints. When discrepancies arise later, there is rarely an immutable, visual audit trail linking the physical condition of the goods at the dock to the purchase order.

## 2. Solution Overview
DockProof AI is a mobile-first, real-time logistics application designed to run on rugged warehouse scanners, tablets, and desktop workstations. It enforces a verifiable receiving process by:
- Using device cameras and ZXing to decode barcodes and verify GTINs against the product catalogue.
- Guiding operators to capture specific photographic evidence (labels, carton sides, overview).
- Applying client-side quality gates to ensure photos aren't blurry, dark, or obscured by glare.
- Utilizing Google Gemini 2.0 Flash to analyze the visual evidence factually.
- Passing AI observations into a Deterministic Rules Engine to generate a final verification decision (PASS, EXCEPTION, or REVIEW_REQUIRED).
- Persisting all evidence to an immutable ledger on Supabase PostgreSQL.

## 3. Setup

### Prerequisites
- Node.js (v18 or newer)
- npm or pnpm
- A Supabase Project
- A Google Gemini API Key
- Vercel (for production deployment)

### Local Environment Setup
1. Clone the repository: `git clone https://github.com/PavaniPatluri/DockProof-AI.git`
2. Install dependencies: `npm install --legacy-peer-deps`
3. Create a `.env` file in the root directory:
   ```bash
   GEMINI_API_KEY="your-gemini-api-key"
   SUPABASE_URL="https://your-project.supabase.co"
   SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
   ```
4. Start the development server:
   ```bash
   npm run dev
   ```
   The app will be available at `http://localhost:3000`.

### Database Setup
1. Navigate to your Supabase SQL Editor.
2. Run the `supabase/all_migrations_bundle.sql` script to create the 15 relational tables and Row Level Security policies.
3. Ensure the `inspection-evidence` and `inspection-analysis` buckets are created in Supabase Storage.

## 4. Usage
DockProof enforces a strict **Zero Dummy Data Policy**. You must start by onboarding real data.
1. **Onboard Master Data:** Navigate to the Dashboard and add Suppliers and Products (or use CSV imports).
2. **Create Purchase Orders:** Create open POs for incoming shipments.
3. **Start Inspection:** An operator selects the PO and SKU on the dock.
4. **Scan Barcode:** Use the physical scanner or camera to read the barcode.
5. **Capture Evidence:** The UI will guide the operator to take 6 specific photos (Label, Front, Left, Right, Top, Overview). The client-side gate will warn if the photo is blurry.
6. **Submit for AI Verification:** The payload is sent to the backend. Gemini extracts visual observations, and the deterministic engine scores it.
7. **Manager Review (PILOT mode):** The system operates in PILOT mode by default, meaning all automated decisions must be verified and signed off by a Receiving Manager.

## 5. Assumptions
- **Connectivity:** The receiving dock has a stable internet or Wi-Fi connection to transmit photos and reach the Supabase/Vercel APIs.
- **Hardware:** Operators use devices with a functional rear camera or a dedicated 2D barcode scanner that inputs as a keyboard wedge.
- **Data Completeness:** The warehouse has pre-loaded accurate GTINs and expected variants in the product catalogue before shipments arrive.
- **Lighting:** While there is a quality gate for darkness, extreme edge-case warehouse lighting is assumed to be adequate for photographic evidence.

## 6. Limitations
- **Interior Inspection:** The AI cannot X-ray boxes. It can only verify what is explicitly visible on the exterior of the cartons or if the carton is physically opened and photographed. Hidden damage or missing interior components cannot be caught without an open-box photo.
- **Vercel Payload Limits:** The serverless architecture strictly limits incoming request sizes to 4.5MB. Therefore, photos uploaded from gallery/camera are dynamically downscaled in the browser via HTML5 Canvas before uploading. Extremely high-resolution RAW images are not supported.
- **AI Hallucination Failsafe:** While Gemini is prompted to be an "evidence-only inspector," there is a marginal risk of false positives. To mitigate this, the AI *never* makes the final decision—it only produces observations which the strict deterministic rules engine evaluates.
