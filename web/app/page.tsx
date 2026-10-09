import Link from 'next/link';
import {
  ArrowRight,
  Workflow,
  Lock,
  Scale
} from 'lucide-react';

export default function IndustrialLandingPage() {
  const agentModules = [
    {
      id: 'receiving',
      title: 'Receiving Manager',
      scope: 'Inbound Ingest',
      role: 'Inbound Supplier Verification',
      desc: 'Authenticates supplier shipments against Purchase Orders. Analyzes carton integrity, unit counts, physical transit damage, and supplier shortfalls to establish an untampered baseline.',
      inputArtifacts: 'Pallet photos, carton labels, PO manifest lines',
      outputArtifact: 'RCV Evidence Record (Supplier baseline condition)'
    },
    {
      id: 'prep',
      title: 'Prep Manager',
      scope: 'Fulfillment Inbound (FBA)',
      role: 'FBA Prep Compliance',
      desc: 'Enforces Amazon packaging compliance for inbound FBA units: polybag sealing verification, suffocation warning legibility, and FNSKU barcode placement.',
      inputArtifacts: 'Front/back packaging photos, FNSKU label close-up, FBA work order',
      outputArtifact: 'PRP Evidence Record (Packaging compliance proof)'
    },
    {
      id: 'pack',
      title: 'Pack Manager',
      scope: 'Direct-to-Consumer (MFN)',
      role: 'Pre-Seal Carton Audit',
      desc: 'Inspects open cartons immediately prior to tape sealing for merchant-fulfilled and 3PL orders. Verifies exact SKU presence, quantities, and flags unlisted or missing items.',
      inputArtifacts: 'Overhead open box capture, packing slip manifest lines',
      outputArtifact: 'PCK Evidence Record (Carton manifest proof at sealing)'
    },
    {
      id: 'returns',
      title: 'Returns Manager',
      scope: 'Post-Sale Operations',
      role: 'Condition Grading & Disposition',
      desc: 'Assesses returned merchandise against original packing evidence. Grades physical item condition on Amazon’s scale and issues disposition verdicts: restock, refurbish, or liquidate.',
      inputArtifacts: 'Customer return photos, original dispatch records',
      outputArtifact: 'RTN Evidence Record (Condition grade & disposition)'
    },
    {
      id: 'recovery',
      title: 'Recovery Manager',
      scope: 'Financial Audit',
      role: 'Channel Loss Recovery',
      desc: 'Audits carrier and marketplace fee charge sheets against all accumulated upstream records. Pinpoints fee discrepancies and substantiates claims for reimbursement.',
      inputArtifacts: 'All prior evidence records (RCV, PRP/PCK, RTN) + marketplace fee report',
      outputArtifact: 'RCY Evidence Record (Dispute positions: CONTRADICTS / SUPPORTS)'
    }
  ];

  return (
    <div className="space-y-16 py-6 sm:py-10 max-w-6xl mx-auto px-4 sm:px-6">
      {/* 1. HERO SECTION */}
      <section className="text-center max-w-4xl mx-auto space-y-6">
        <h1 className="font-display font-extrabold text-4xl sm:text-6xl text-slate-900 tracking-tight leading-tight">
          Automated Commerce Integrity. <br className="hidden sm:inline" />
          From Inbound to Dispute.
        </h1>

        <p className="text-base sm:text-lg font-medium text-slate-600 max-w-3xl mx-auto leading-relaxed">
          An enterprise multi-agent verification system uniting five specialized agents through one authoritative orchestrator.
          Every physical handoff creates an immutable, content-addressed Evidence Record ensuring operational and financial traceability.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
          <Link
            href="/pipeline"
            className="px-8 py-4 rounded-2xl neu-btn-highlight font-display font-extrabold text-sm uppercase tracking-wider flex items-center gap-2 shadow-md hover:scale-[1.02] transition"
          >
            <span>Launch Pipeline Trace</span>
            <ArrowRight className="w-4 h-4 stroke-[2.5]" />
          </Link>
          <a
            href="#architecture"
            className="px-8 py-4 rounded-2xl neu-btn-secondary font-display font-bold text-sm uppercase tracking-wider text-slate-900"
          >
            <span>System Architecture</span>
          </a>
        </div>
      </section>

      {/* 2. THE THREE CORE PILLARS */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="rounded-[28px] neu-flat p-6 sm:p-8 space-y-3">
          <div className="w-10 h-10 rounded-2xl neu-icon-well flex items-center justify-center text-[#773C30]">
            <Workflow className="w-5 h-5 stroke-[2.2]" />
          </div>
          <h3 className="font-display font-bold text-lg text-slate-900">
            Orchestrated Hand-offs
          </h3>
          <p className="text-xs font-medium text-slate-600 leading-relaxed">
            Agents never couple directly to one another. All state transitions, route selections, and retries are governed by the central Orchestrator.
          </p>
        </div>

        <div className="rounded-[28px] neu-flat p-6 sm:p-8 space-y-3">
          <div className="w-10 h-10 rounded-2xl neu-icon-well flex items-center justify-center text-[#773C30]">
            <Lock className="w-5 h-5 stroke-[2.2]" />
          </div>
          <h3 className="font-display font-bold text-lg text-slate-900">
            Cryptographic Integrity
          </h3>
          <p className="text-xs font-medium text-slate-600 leading-relaxed">
            Every judgment produces a canonical SHA-256 sealed Evidence Record. All downstream decisions cite verifiable upstream record identifiers.
          </p>
        </div>

        <div className="rounded-[28px] neu-flat p-6 sm:p-8 space-y-3">
          <div className="w-10 h-10 rounded-2xl neu-icon-well flex items-center justify-center text-[#773C30]">
            <Scale className="w-5 h-5 stroke-[2.2]" />
          </div>
          <h3 className="font-display font-bold text-lg text-slate-900">
            Multi-Tenant Isolation
          </h3>
          <p className="text-xs font-medium text-slate-600 leading-relaxed">
            Strict tenant partition boundaries. All data lookups and storage mechanisms enforce organisation-level tenancy across the entire workflow.
          </p>
        </div>
      </section>

      {/* 3. AGENT SUBSYSTEMS DIRECTORY */}
      <section id="architecture" className="rounded-[32px] neu-flat p-8 sm:p-12 space-y-8">
        <div className="border-b border-[var(--neu-border-color)] pb-4 space-y-1">
          <span className="text-[10px] font-mono font-bold uppercase text-[#773C30] tracking-wider">
            Modular Subsystems
          </span>
          <h2 className="font-display font-extrabold text-2xl text-slate-900 tracking-tight">
            The Five Autonomous Agents
          </h2>
          <p className="text-xs text-slate-500">
            Each agent operates as an independent microservice adhering to the shared Evidence Contract v1.0.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {agentModules.map((ag, idx) => (
            <div key={ag.id} className="rounded-2xl neu-pressed-sm p-6 space-y-4 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold text-slate-400">STAGE 0{idx + 1}</span>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-lg bg-white/80 text-slate-700 border border-slate-200">
                    {ag.scope}
                  </span>
                </div>
                <h3 className="font-display font-bold text-base text-slate-900">{ag.title}</h3>
                <p className="text-[11px] font-semibold text-[#773C30]">{ag.role}</p>
                <p className="text-xs text-slate-600 leading-relaxed pt-1">{ag.desc}</p>
              </div>

              <div className="pt-3 border-t border-[var(--neu-border-color)] space-y-1.5 text-[11px] font-mono">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase">Input Data:</span>
                  <span className="text-slate-700">{ag.inputArtifacts}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase">Output Evidence:</span>
                  <span className="text-slate-900 font-bold">{ag.outputArtifact}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 4. CALL TO ACTION */}
      <section className="rounded-[32px] neu-flat p-8 sm:p-12 text-center space-y-6 max-w-3xl mx-auto">
        <h2 className="font-display font-extrabold text-2xl sm:text-3xl text-slate-900">
          Ready to Inspect Live Workflows?
        </h2>
        <p className="text-sm font-medium text-slate-600 leading-relaxed">
          Launch the interactive Pipeline Trace to execute benchmark units or test custom image captures through the central Orchestrator.
        </p>
        <Link
          href="/pipeline"
          className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl neu-btn-highlight font-display font-extrabold text-sm uppercase tracking-wider"
        >
          <span>Open Pipeline Trace</span>
          <ArrowRight className="w-4 h-4 stroke-[2.5]" />
        </Link>
      </section>
    </div>
  );
}
