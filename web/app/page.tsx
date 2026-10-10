'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

export default function VesperInvertedLandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isIn, setIsIn] = useState(false);

  useEffect(() => {
    // Two rAFs fallback to ensure all entrance animations settle cleanly
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => {
        setIsIn(true);
      });
      return () => cancelAnimationFrame(raf2);
    });
    return () => cancelAnimationFrame(raf1);
  }, []);

  return (
    <div className={`vesper-inverted-root ${menuOpen ? 'menu-open' : ''} ${isIn ? 'animations-ready' : ''}`}>
      <style dangerouslySetInnerHTML={{ __html: VESPER_INVERTED_STYLES }} />

      {/* Page Structure */}
      <div className="page">

        {/* 2. Hero (bottom-centered, exact typography & tokens) */}
        <main className="hero" id="top">
          <div className="hero-copy">
            {/* Badge */}
            <div className="badge appear appear--pop">
              <svg
                className="badge-star"
                width="18"
                height="20"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M12 2.6C12.55 2.6 12.88 3.15 13.08 4.7c.62 4.7 1.52 5.6 6.22 6.22 1.55.2 2.1.53 2.1 1.08s-.55.88-2.1 1.08c-4.7.62-5.6 1.52-6.22 6.22-.2 1.55-.53 2.1-1.08 2.1s-.88-.55-1.08-2.1c-.62-4.7-1.52-5.6-6.22-6.22C3.15 12.88 2.6 12.55 2.6 12s.55-.88 2.1-1.08c4.7-.62 5.6-1.52 6.22-6.22C11.12 3.15 11.45 2.6 12 2.6Z" />
              </svg>
              <span>Operational AI Infrastructure</span>
            </div>

            {/* H1 Headline with Instrument Serif italic for "AI agents" */}
            <h1 className="headline">
              <span className="headline-line appear appear--mask">
                Deploy <em>AI agents</em> across your
              </span>
              <span className="headline-line appear appear--mask">
                commerce pipeline in minutes.
              </span>
            </h1>

            {/* Lede paragraph */}
            <p className="lede appear appear--soft">
              Automate multi-agent physical verification and financial audits from inbound receiving to dispute resolution with immutable cryptographic evidence.
            </p>

            {/* Hero Action Buttons */}
            <div className="hero-actions">
              <Link href="/pipeline" className="btn btn-solid hero-btn appear appear--btn">
                <span>Launch Pipeline Trace</span>
              </Link>
              <a href="#how-it-works" className="btn btn-ghost hero-btn appear appear--side">
                <span>See How It Works</span>
              </a>
            </div>
          </div>
        </main>

        {/* 3. Stats Footer */}
        <footer className="stats stats-centered">
          {/* Stat 1: Dual-pill workflow icon */}
          <div className="stat appear appear--stat">
            <svg className="stat-icon" width="20" height="20" viewBox="0 0 24 24" fill="none">
              <rect x="3.4" y="2.6" width="7.2" height="18.8" rx="3.6" fill="#0F172A" fillOpacity="0.8" />
              <rect x="13.4" y="2.6" width="7.2" height="18.8" rx="3.6" fill="#64748B" fillOpacity="0.4" />
              <rect x="9.2" y="10.9" width="5.6" height="2.2" rx="1.1" fill="#0F172A" />
            </svg>
            <span className="stat-label">5 Specialized Agents Orchestrated</span>
          </div>
        </footer>
      </div>

      {/* Informative Content Sections: How It Works, 5 Agents, FAQs */}
      <div className="content-drawer">
        {/* SECTION: HOW IT WORKS */}
        <section id="how-it-works" className="content-section">
          <div className="section-head">
            <span className="section-tag">System Architecture</span>
            <h2 className="section-title">Centralized Orchestration & Evidence Chain</h2>
            <p className="section-desc">
              Agents never communicate peer-to-peer. Every physical hand-off passes through the central Orchestrator, which validates schema contracts, verifies SHA-256 seals, updates immutable workflow states, and routes downstream hand-offs.
            </p>
          </div>

          <div className="grid-3">
            <div className="card">
              <div className="card-badge">01</div>
              <h3 className="card-title">Orchestrated Hand-offs</h3>
              <p className="card-copy">
                Each agent operates as an independent microservice. All state transitions, retry policies, and route selections (FBA vs. MFN) are strictly governed by the authoritative Orchestrator.
              </p>
            </div>
            <div className="card">
              <div className="card-badge">02</div>
              <h3 className="card-title">Cryptographic Integrity</h3>
              <p className="card-copy">
                Every judgment produces an immutable, content-addressed Evidence Record with canonical SHA-256 hashes. Downstream decisions cite verifiable upstream record identifiers.
              </p>
            </div>
            <div className="card">
              <div className="card-badge">03</div>
              <h3 className="card-title">Multi-Tenant Isolation</h3>
              <p className="card-copy">
                Strict organisation-level tenant partition boundaries. Any request for another organization’s data is rejected immediately with a 404 / AgentRejected security event.
              </p>
            </div>
          </div>
        </section>

        {/* SECTION: THE FIVE AGENT SUBSYSTEMS */}
        <section id="modules" className="content-section">
          <div className="section-head">
            <span className="section-tag">Modular Subsystems</span>
            <h2 className="section-title">The Five Autonomous Agents</h2>
            <p className="section-desc">
              From inbound receiving through pre-seal audits to channel dispute recovery, each agent fulfills a dedicated operational responsibility.
            </p>
          </div>

          <div className="grid-agents">
            <div className="agent-card">
              <div className="agent-meta">
                <span className="agent-stage">STAGE 01</span>
                <span className="agent-scope">Inbound Ingest</span>
              </div>
              <h4 className="agent-title">Receiving Manager</h4>
              <p className="agent-role">Inbound Supplier Verification</p>
              <p className="agent-copy">
                Authenticates shipments against Purchase Orders. Analyzes carton integrity, unit counts, physical transit damage, and supplier shortfalls to establish an untampered baseline.
              </p>
              <div className="agent-proof">
                <div><span>Input Data:</span> Pallet photos, carton labels, PO manifest</div>
                <div><span>Output Record:</span> <strong>RCV Evidence Record</strong></div>
              </div>
            </div>

            <div className="agent-card">
              <div className="agent-meta">
                <span className="agent-stage">STAGE 02</span>
                <span className="agent-scope">Fulfillment Inbound (FBA)</span>
              </div>
              <h4 className="agent-title">Prep Manager</h4>
              <p className="agent-role">FBA Prep Compliance</p>
              <p className="agent-copy">
                Enforces Amazon packaging compliance for inbound FBA units: polybag sealing verification, suffocation warning legibility, and FNSKU barcode placement.
              </p>
              <div className="agent-proof">
                <div><span>Input Data:</span> Packaging photos, FNSKU close-up, FBA work order</div>
                <div><span>Output Record:</span> <strong>PRP Evidence Record</strong></div>
              </div>
            </div>

            <div className="agent-card">
              <div className="agent-meta">
                <span className="agent-stage">STAGE 03</span>
                <span className="agent-scope">Direct-to-Consumer (MFN)</span>
              </div>
              <h4 className="agent-title">Pack Manager</h4>
              <p className="agent-role">Pre-Seal Carton Audit</p>
              <p className="agent-copy">
                Inspects open cartons immediately prior to tape sealing for merchant-fulfilled orders. Verifies exact SKU presence and quantities, flagging missing or extra items.
              </p>
              <div className="agent-proof">
                <div><span>Input Data:</span> Overhead open box capture, packing slip manifest</div>
                <div><span>Output Record:</span> <strong>PCK Evidence Record</strong></div>
              </div>
            </div>

            <div className="agent-card">
              <div className="agent-meta">
                <span className="agent-stage">STAGE 04</span>
                <span className="agent-scope">Post-Sale Operations</span>
              </div>
              <h4 className="agent-title">Returns Manager</h4>
              <p className="agent-role">Condition Grading & Disposition</p>
              <p className="agent-copy">
                Assesses returned merchandise against original dispatch proofs. Grades physical item condition on Amazon’s scale and issues disposition verdicts: restock, refurbish, or liquidate.
              </p>
              <div className="agent-proof">
                <div><span>Input Data:</span> Customer return photos, dispatch records</div>
                <div><span>Output Record:</span> <strong>RTN Evidence Record</strong></div>
              </div>
            </div>

            <div className="agent-card">
              <div className="agent-meta">
                <span className="agent-stage">STAGE 05</span>
                <span className="agent-scope">Financial Audit</span>
              </div>
              <h4 className="agent-title">Recovery Manager</h4>
              <p className="agent-role">Channel Loss Recovery</p>
              <p className="agent-copy">
                Audits marketplace and carrier fee reports against accumulated upstream evidence. Substantiates dispute positions with cited records to recover unwarranted charges.
              </p>
              <div className="agent-proof">
                <div><span>Input Data:</span> Upstream evidence chain (RCV, PRP/PCK, RTN) + fee report</div>
                <div><span>Output Record:</span> <strong>RCY Evidence Record</strong></div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION: EVIDENCE CONTRACT & FAQS */}
        <section id="faqs" className="content-section">
          <div className="section-head">
            <span className="section-tag">Common Inquiries</span>
            <h2 className="section-title">Frequently Asked Questions</h2>
          </div>

          <div className="faq-list">
            <div className="faq-item">
              <h4 className="faq-q">What is the Evidence Contract v1.0?</h4>
              <p className="faq-a">
                It is a standardized schema specification governing every agent’s input and output. Every output contains an immutable Evidence Record with check-level verdicts, confidence ratings, model provenance, and a SHA-256 content hash.
              </p>
            </div>
            <div className="faq-item">
              <h4 className="faq-q">How does the system handle uncertain decisions?</h4>
              <p className="faq-a">
                UNCERTAIN is a first-class verdict. If visual evidence is occluded or insufficient, the agent preserves the evidence and flags <code>needs_human: true</code>. The workflow enters a BLOCKED state until an operator resolves it with a traceable override.
              </p>
            </div>
            <div className="faq-item">
              <h4 className="faq-q">Can an agent alter historical workflow state?</h4>
              <p className="faq-a">
                Never. Agents produce evidence used to inform transitions, but state ownership belongs exclusively to the central Orchestrator. All human overrides are append-only and cite the exact evidence records they supersede.
              </p>
            </div>
          </div>

          {/* Bottom Action Card */}
          <div className="ready-card">
            <h3>Ready to Execute Live Verification?</h3>
            <p>Launch the interactive Pipeline Trace to test benchmark cases or capture real photos with live webcam inspection.</p>
            <Link href="/pipeline" className="btn btn-solid ready-btn">
              <span>Open Pipeline Trace</span>
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

const VESPER_INVERTED_STYLES = `
/* --------------------------------------------------------------------------
   Vesper.ai Inverted Theme (Pure White Background, Dark Shades Floating)
   Exact Typography: Inter 500 & Instrument Serif Italic 400
   -------------------------------------------------------------------------- */
:root {
  --bg: #FFFFFF;
  --text: #0F172A;
  --muted: #64748B;
  --stat: #334155;
  --border: rgba(15, 23, 42, 0.12);
  --border-soft: rgba(15, 23, 42, 0.08);

  --logo: 15.5px;
  --logo-mark: 22px;
  --nav: 14px;
  --nav-h: 40px;
  --btn: 13.5px;
  --btn-h: 40px;
  --hero-btn-h: 42px;
  --h1: 48px;
  --lede: 15.5px;
  --badge: 12.5px;
  --stat-size: 13.5px;
  --header-y: 22px;
  --header-x: 40px;
  --stats-x: 72px;
  --stats-y: 36px;
  --hero-gap: 85px;
  --copy-max: 860px;
  --lede-max: 470px;
}

.vesper-inverted-root {
  position: relative;
  width: 100%;
  min-height: 100vh;
  background-color: transparent !important;
  color: var(--text);
  font-family: "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
  overflow-x: hidden;
}

/* Background floating shades & inverted video (dark floating shades on pure white, constant across entire scroll) */
.hero-photo-wrapper {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  pointer-events: none;
  z-index: 0;
}

.hero-video-invert {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  filter: invert(1) hue-rotate(180deg) contrast(1.15) opacity(0.3);
  mix-blend-mode: multiply;
  pointer-events: none;
}

.floating-shade {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  pointer-events: none;
  opacity: 0.18;
}

.shade-1 {
  width: 550px;
  height: 550px;
  background: radial-gradient(circle, #0F172A 0%, rgba(15, 23, 42, 0) 70%);
  top: -100px;
  left: 20%;
  animation: float-1 38s ease-in-out infinite alternate;
}

.shade-2 {
  width: 480px;
  height: 480px;
  background: radial-gradient(circle, #334155 0%, rgba(51, 65, 85, 0) 70%);
  top: 35%;
  right: 15%;
  animation: float-2 44s ease-in-out infinite alternate;
}

.shade-3 {
  width: 600px;
  height: 600px;
  background: radial-gradient(circle, #020617 0%, rgba(2, 6, 23, 0) 70%);
  bottom: -150px;
  left: 30%;
  animation: float-3 50s ease-in-out infinite alternate;
}

@keyframes float-1 {
  0% { transform: translate(0, 0) scale(1); }
  100% { transform: translate(60px, 80px) scale(1.12); }
}
@keyframes float-2 {
  0% { transform: translate(0, 0) scale(1.05); }
  100% { transform: translate(-80px, -60px) scale(0.95); }
}
@keyframes float-3 {
  0% { transform: translate(0, 0) scale(0.95); }
  100% { transform: translate(-50px, 70px) scale(1.08); }
}

/* Page Frame */
.page {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-rows: auto 1fr auto;
  min-height: 100vh;
  min-height: 100dvh;
}

/* 1. Header (3-column grid) */
.header {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  padding: var(--header-y) var(--header-x) 10px;
  z-index: 50;
  position: relative;
}

.logo {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  justify-self: start;
  font-size: var(--logo);
  font-weight: 600;
  letter-spacing: -0.03em;
  color: var(--text);
  text-decoration: none;
}

.logo-mark {
  color: #0F172A;
  transition: transform 0.3s ease;
}
.logo:hover .logo-mark {
  transform: rotate(-15deg);
}

.logo-suffix {
  font-weight: 400;
  color: var(--muted);
}

/* Liquid-metal pill Nav (Inverted to clean light metal / frosted silver with crisp borders) */
.nav {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-self: center;
}

.nav-pill {
  height: var(--nav-h);
  padding: 0 18px;
  border-radius: 7px;
  overflow: hidden;
  position: relative;
  border: 1px solid rgba(15, 23, 42, 0.14);
  background: linear-gradient(105deg, #FFFFFF 0%, #F1F5F9 48%, #E2E8F0 100%);
  color: #0F172A;
  font-size: var(--nav);
  font-weight: 450;
  letter-spacing: -0.01em;
  white-space: nowrap;
  display: flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.9);
  transition: all 0.35s ease;
}

.nav-pill::before {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(115deg, transparent 30%, rgba(255, 255, 255, 0.8) 50%, transparent 70%);
  transform: translateX(-120%);
  transition: transform 0.6s ease;
}

.nav-pill:hover::before {
  transform: translateX(120%);
}

.nav-pill:hover {
  border-color: rgba(15, 23, 42, 0.35);
  background: linear-gradient(105deg, #FFFFFF 0%, #E2E8F0 45%, #CBD5E1 100%);
  box-shadow: 0 3px 12px rgba(15, 23, 42, 0.08), inset 0 1px 0 #FFFFFF;
  transform: translateY(-1px);
}

/* Header Right */
.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
  justify-self: end;
}

/* Shared Buttons (Inverted Liquid-Glass Language) */
.btn {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: var(--btn-h);
  padding: 0 16px;
  border-radius: 6px;
  font-size: var(--btn);
  font-weight: 500;
  letter-spacing: -0.02em;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  text-decoration: none;
  transition: all 0.35s ease;
}

.btn::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(115deg, transparent 20%, rgba(255, 255, 255, 0.35) 48%, transparent 76%);
  transform: translateX(-130%);
  transition: transform 0.65s ease;
  pointer-events: none;
}

.btn:hover::after {
  transform: translateX(130%);
}

/* Solid Button: Crisp obsidian black button with inset rim */
.btn-solid {
  background: linear-gradient(180deg, #0F172A 0%, #1E293B 48%, #0F172A 100%);
  color: #FFFFFF !important;
  border: 1px solid #0F172A;
  box-shadow: 0 2px 6px rgba(15, 23, 42, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.2);
}

.btn-solid:hover {
  background: linear-gradient(180deg, #1E293B 0%, #334155 42%, #1E293B 100%);
  border-color: #334155;
  box-shadow: 0 6px 20px rgba(15, 23, 42, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.3);
  transform: translateY(-1px);
}

/* Ghost Button: Frosted white with subtle dark rim */
.btn-ghost {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(241, 245, 249, 0.8) 50%, rgba(226, 232, 240, 0.7));
  color: #0F172A !important;
  border: 1px solid rgba(15, 23, 42, 0.15);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  box-shadow: 0 1px 4px rgba(15, 23, 42, 0.05), inset 0 1px 0 #FFFFFF;
}

.btn-ghost:hover {
  background: linear-gradient(135deg, #FFFFFF, rgba(226, 232, 240, 0.9) 48%, rgba(203, 213, 225, 0.8));
  border-color: rgba(15, 23, 42, 0.3);
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.1), inset 0 1px 0 #FFFFFF;
  transform: translateY(-1px);
}

.hero-btn {
  height: var(--hero-btn-h);
  padding: 0 20px;
  font-size: 14px;
}

/* Mobile burger */
.burger {
  display: none;
  width: 42px;
  height: 42px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.85);
  cursor: pointer;
  padding: 10px;
  flex-direction: column;
  justify-content: space-between;
  align-items: center;
  z-index: 60;
}

.burger-bar {
  width: 16px;
  height: 1.5px;
  background: #0F172A;
  border-radius: 1px;
  transition: transform 0.25s ease, opacity 0.2s ease;
}

/* 2. Hero: positioned lower so badge starts slightly below middle of screen */
.hero {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 100px 24px 40px;
  min-height: calc(100vh - 160px);
}

.hero-copy {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  max-width: var(--copy-max);
  width: 100%;
}

/* Badge */
.badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 22px;
  padding: 8px 16px;
  border-radius: 20px;
  border: 1px solid rgba(15, 23, 42, 0.12);
  background: linear-gradient(90deg, #F8FAFC 0%, #EDF2F7 52%, #E2E8F0 100%);
  color: #0F172A;
  font-size: var(--badge);
  font-weight: 500;
  letter-spacing: -0.01em;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
}

.badge-star {
  color: #0F172A;
  filter: drop-shadow(0 0 2px rgba(15, 23, 42, 0.2));
}

/* Headline */
.headline {
  font-size: var(--h1);
  font-weight: 500;
  letter-spacing: -0.045em;
  line-height: 1.12;
  color: var(--text);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.headline-line {
  display: block;
  overflow: hidden;
  padding: 0.06em 0.15em 0.14em;
}

.headline em {
  font-family: "Instrument Serif", "Times New Roman", Times, serif;
  font-style: italic;
  font-weight: 400;
  font-size: 1.08em;
  letter-spacing: -0.03em;
  color: #475569;
}

/* Lede */
.lede {
  max-width: var(--lede-max);
  margin-top: 18px;
  color: var(--muted);
  font-size: var(--lede);
  font-weight: 400;
  line-height: 1.55;
  letter-spacing: -0.015em;
}

/* Actions */
.hero-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  margin-top: 26px;
}

/* 3. Stats Footer */
.stats {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 0 var(--stats-x) var(--stats-y);
  padding-bottom: max(var(--stats-y), env(safe-area-inset-bottom));
  color: var(--stat);
}

.stat {
  display: inline-flex;
  align-items: center;
  gap: 14px;
  font-size: var(--stat-size);
  letter-spacing: -0.015em;
  white-space: nowrap;
}

.stat-icon {
  flex-shrink: 0;
}

.stat-icon-wide {
  flex-shrink: 0;
}

.stat-label {
  font-weight: 500;
  color: #334155;
}

/* 4. Content Drawer & Detailed Informative Sections */
.content-drawer {
  position: relative;
  z-index: 10;
  background: transparent;
  border-top: 1px solid var(--border);
  padding: 80px 24px 100px;
  max-width: 1200px;
  margin: 0 auto;
}

.content-section {
  margin-bottom: 96px;
}

.section-head {
  text-align: center;
  max-width: 680px;
  margin: 0 auto 52px;
}

.section-tag {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #773C30;
  margin-bottom: 8px;
}

.section-title {
  font-size: 32px;
  font-weight: 700;
  letter-spacing: -0.03em;
  color: #0F172A;
  margin-bottom: 14px;
}

.section-desc {
  font-size: 15px;
  color: #64748B;
  line-height: 1.6;
}

.grid-3 {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 24px;
}

.card {
  padding: 32px;
  border-radius: 16px;
  border: 1px solid rgba(15, 23, 42, 0.09);
  background: rgba(255, 255, 255, 0.88);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-shadow: 0 4px 18px rgba(15, 23, 42, 0.04);
  transition: transform 0.25s ease, box-shadow 0.25s ease;
}

.card:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.08);
}

.card-badge {
  display: inline-block;
  font-size: 11px;
  font-family: monospace;
  font-weight: 700;
  color: #773C30;
  margin-bottom: 12px;
}

.card-title {
  font-size: 18px;
  font-weight: 600;
  color: #0F172A;
  margin-bottom: 10px;
}

.card-copy {
  font-size: 13.5px;
  color: #475569;
  line-height: 1.6;
}

/* Agent cards grid: MS Word center sort (top row 3 cards, bottom row 2 cards centered) */
.grid-agents {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 24px;
}

.agent-card {
  flex: 0 1 calc(33.333% - 16px);
  min-width: 310px;
  max-width: 370px;
  padding: 28px;
  border-radius: 16px;
  border: 1px solid rgba(15, 23, 42, 0.09);
  background: rgba(255, 255, 255, 0.88);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.04);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.agent-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.agent-stage {
  font-size: 10px;
  font-family: monospace;
  font-weight: 700;
  color: #94A3B8;
}

.agent-scope {
  font-size: 10.5px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 6px;
  background: #F1F5F9;
  color: #334155;
}

.agent-title {
  font-size: 17px;
  font-weight: 700;
  color: #0F172A;
  margin-bottom: 4px;
}

.agent-role {
  font-size: 12px;
  font-weight: 600;
  color: #773C30;
  margin-bottom: 10px;
}

.agent-copy {
  font-size: 13px;
  color: #475569;
  line-height: 1.55;
  margin-bottom: 20px;
}

.agent-proof {
  padding-top: 14px;
  border-top: 1px solid rgba(15, 23, 42, 0.08);
  font-size: 11px;
  color: #64748B;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.agent-proof span {
  font-weight: 600;
  color: #334155;
}

/* FAQ list */
.faq-list {
  max-width: 800px;
  margin: 0 auto 64px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.faq-item {
  padding: 24px;
  border-radius: 12px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  background: #F8FAFC;
}

.faq-q {
  font-size: 16px;
  font-weight: 600;
  color: #0F172A;
  margin-bottom: 8px;
}

.faq-a {
  font-size: 13.5px;
  color: #475569;
  line-height: 1.6;
}

/* Ready Call to action */
.ready-card {
  text-align: center;
  padding: 48px 32px;
  border-radius: 20px;
  background: linear-gradient(135deg, #F8FAFC 0%, #EDF2F7 100%);
  border: 1px solid rgba(15, 23, 42, 0.12);
  max-width: 720px;
  margin: 0 auto;
}

.ready-card h3 {
  font-size: 24px;
  font-weight: 700;
  color: #0F172A;
  margin-bottom: 10px;
}

.ready-card p {
  font-size: 14px;
  color: #64748B;
  max-width: 500px;
  margin: 0 auto 24px;
  line-height: 1.5;
}

.ready-btn {
  height: 44px;
  padding: 0 28px;
  font-size: 14px;
}

/* --------------------------------------------------------------------------
   Entrance Keyframes & Motion Specification
   -------------------------------------------------------------------------- */
.appear {
  opacity: 1;
  animation-duration: 1.05s;
  animation-fill-mode: both;
  animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
}

.appear--scale { animation-name: in-scale; }
.appear--soft  { animation-name: in-soft; }
.appear--pop   { animation-name: in-pop; }
.appear--mask  { animation-name: in-mask; }
.appear--btn   { animation-name: in-btn; }
.appear--side  { animation-name: in-side; }
.appear--stat  { animation-name: in-stat; }

.header .logo.appear--scale          { animation-delay: 0.08s; }
.nav .nav-pill:nth-child(1)          { animation-delay: 0.16s; }
.nav .nav-pill:nth-child(2)          { animation-delay: 0.28s; }
.nav .nav-pill:nth-child(3)          { animation-delay: 0.40s; }
.nav .nav-pill:nth-child(4)          { animation-delay: 0.52s; }
.header-cta.appear--scale            { animation-delay: 0.34s; }
.badge.appear--pop                   { animation-delay: 0.22s; }
.headline-line:nth-child(1)          { animation-delay: 0.42s; }
.headline-line:nth-child(2)          { animation-delay: 0.62s; }
.lede.appear--soft                   { animation-delay: 0.82s; animation-duration: 1.25s; }
.hero-btn.appear--btn                { animation-delay: 0.96s; }
.hero-btn.appear--side               { animation-delay: 1.10s; }
.stat:nth-child(1)                   { animation-delay: 1.12s; }
.stat:nth-child(2)                   { animation-delay: 1.28s; }
.stat:nth-child(3)                   { animation-delay: 1.44s; }

.badge-star {
  animation: in-star 0.9s cubic-bezier(0.16, 1, 0.3, 1) 0.28s both;
}

.headline em {
  animation: in-em 1.2s cubic-bezier(0.16, 1, 0.3, 1) 0.72s both;
}

@keyframes in-scale {
  from { opacity: 0; transform: scale(0.84); }
  to { opacity: 1; transform: scale(1); }
}

@keyframes in-soft {
  from { opacity: 0; transform: translateY(14px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes in-mask {
  from { opacity: 0; transform: translateY(40%); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes in-pop {
  0% { opacity: 0; transform: scale(0.9); }
  70% { opacity: 1; transform: scale(1.03); }
  100% { opacity: 1; transform: scale(1); }
}

@keyframes in-btn {
  from { opacity: 0; transform: translateY(18px) scale(0.94); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

@keyframes in-side {
  from { opacity: 0; transform: translateX(22px); }
  to { opacity: 1; transform: translateX(0); }
}

@keyframes in-stat {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes in-star {
  0% { transform: scale(0.2) rotate(-50deg); opacity: 0; }
  65% { transform: scale(1.2) rotate(8deg); opacity: 1; }
  100% { transform: scale(1) rotate(0deg); opacity: 1; }
}

@keyframes in-em {
  0% { opacity: 0.35; filter: blur(4px); }
  100% { opacity: 1; filter: blur(0px); }
}

/* Settle state after animations */
.animations-ready .appear {
  opacity: 1;
}

/* --------------------------------------------------------------------------
   Responsive Breakpoints
   -------------------------------------------------------------------------- */
@media (max-width: 900px) {
  .header {
    grid-template-columns: 1fr auto auto;
    gap: 8px;
    padding: 16px 18px;
  }
  .burger {
    display: flex;
  }
  .menu-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 40;
    background: rgba(15, 23, 42, 0.4);
    backdrop-filter: blur(20px);
    opacity: 0;
    visibility: hidden;
    transition: all 0.28s ease;
  }
  .menu-open .menu-backdrop {
    opacity: 1;
    visibility: visible;
  }
  .nav {
    position: fixed;
    inset: 0;
    z-index: 45;
    flex-direction: column;
    justify-content: center;
    gap: 14px;
    padding: 96px 22px 32px;
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(24px);
    opacity: 0;
    visibility: hidden;
    transform: translateY(-8px);
    transition: all 0.28s ease;
  }
  .menu-open .nav {
    opacity: 1;
    visibility: visible;
    transform: translateY(0);
  }
  .nav-pill {
    width: 100%;
    height: 52px;
    font-size: 18px;
    border-radius: 10px;
  }
  .menu-open .burger .burger-bar:nth-child(1) {
    transform: translateY(6.5px) rotate(45deg);
  }
  .menu-open .burger .burger-bar:nth-child(2) {
    opacity: 0;
  }
  .menu-open .burger .burger-bar:nth-child(3) {
    transform: translateY(-6.5px) rotate(-45deg);
  }
  .stats {
    flex-direction: column;
    align-items: center;
    gap: 16px;
    padding: 20px 24px 36px;
  }
  .headline {
    font-size: 36px;
  }
}

@media (max-width: 560px) {
  .headline {
    font-size: 32px;
  }
  .hero-actions {
    flex-direction: column;
    width: 100%;
  }
  .hero-btn {
    width: 100%;
  }
}

/* --------------------------------------------------------------------------
   DARK MODE OVERRIDES (Exact Vesper.ai Palette: Pure #000, white/zinc glass, #fff accents)
   -------------------------------------------------------------------------- */
html.dark .vesper-inverted-root {
  color: #FFFFFF !important;
}

html.dark .badge {
  background: linear-gradient(90deg, #7d7d7d 0%, #2a2a2a 52%, #0a0a0a 100%) !important;
  color: #F2F2F2 !important;
  border: 0 !important;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.7) !important;
}

html.dark .badge-star {
  color: #FFFFFF !important;
  filter: drop-shadow(0 0 4px rgba(255, 255, 255, 0.6)) !important;
}

html.dark .headline {
  color: #FFFFFF !important;
}

html.dark .headline em {
  color: #9A9A9A !important;
}

html.dark .lede {
  color: #9A9A9A !important;
}

/* Vesper Solid: linear-gradient(180deg, #ffffff 0%, #e7e7e7 48%, #cfcfcf 100%) */
html.dark .btn-solid {
  background: linear-gradient(180deg, #FFFFFF 0%, #E7E7E7 48%, #CFCFCF 100%) !important;
  color: #111111 !important;
  border: 1px solid #FFFFFF !important;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.95), 0 0 22px rgba(255, 255, 255, 0.2) !important;
}

html.dark .btn-solid:hover {
  background: linear-gradient(180deg, #FFFFFF 0%, #F3F6FF 42%, #D5DEF2 100%) !important;
  border-color: #F2F6FF !important;
  box-shadow: inset 0 1px 0 #FFFFFF, 0 0 26px rgba(255, 255, 255, 0.35), 0 8px 18px rgba(255, 255, 255, 0.14) !important;
}

/* Vesper Ghost: linear-gradient(135deg, rgba(255,255,255,0.12), rgba(0,0,0,0.5) 46%, rgba(150,170,200,0.1)) */
html.dark .btn-ghost {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.12), rgba(0, 0, 0, 0.5) 46%, rgba(150, 170, 200, 0.1)) !important;
  color: #FFFFFF !important;
  border: 1px solid rgba(198, 198, 198, 0.55) !important;
  backdrop-filter: blur(16px) !important;
  -webkit-backdrop-filter: blur(16px) !important;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12) !important;
}

html.dark .btn-ghost:hover {
  border-color: rgba(220, 230, 255, 0.8) !important;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22), 0 0 24px rgba(255, 255, 255, 0.25) !important;
}

html.dark .stats {
  color: #D8D8D8 !important;
}

html.dark .stat-label {
  color: #E8E8E8 !important;
}

html.dark .content-drawer {
  border-top-color: rgba(255, 255, 255, 0.16) !important;
}

html.dark .section-tag {
  color: #D8D8D8 !important;
}

html.dark .section-title {
  color: #FFFFFF !important;
}

html.dark .section-desc {
  color: #9A9A9A !important;
}

html.dark .card,
html.dark .agent-card {
  background: rgba(18, 18, 18, 0.75) !important;
  border-color: rgba(255, 255, 255, 0.14) !important;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.75) !important;
}

html.dark .card:hover,
html.dark .agent-card:hover {
  border-color: rgba(255, 255, 255, 0.28) !important;
  box-shadow: 0 14px 44px rgba(0, 0, 0, 0.9) !important;
}

html.dark .card-title,
html.dark .agent-title {
  color: #FFFFFF !important;
}

html.dark .card-copy,
html.dark .agent-copy {
  color: #D8D8D8 !important;
}

html.dark .card-badge {
  color: #E8E8E8 !important;
}

html.dark .agent-stage {
  color: #9A9A9A !important;
}

html.dark .agent-scope {
  background: rgba(35, 35, 35, 0.8) !important;
  color: #D8D8D8 !important;
  border: 1px solid rgba(255, 255, 255, 0.12) !important;
}

html.dark .agent-role {
  color: #E8E8E8 !important;
}

html.dark .agent-proof {
  border-top-color: rgba(255, 255, 255, 0.14) !important;
  color: #9A9A9A !important;
}

html.dark .agent-proof span {
  color: #FFFFFF !important;
}

html.dark .faq-item {
  background: rgba(18, 18, 18, 0.7) !important;
  border-color: rgba(255, 255, 255, 0.12) !important;
}

html.dark .faq-q {
  color: #FFFFFF !important;
}

html.dark .faq-a {
  color: #D8D8D8 !important;
}

html.dark .ready-card {
  background: linear-gradient(135deg, rgba(20, 20, 20, 0.92) 0%, rgba(30, 30, 30, 0.85) 100%) !important;
  border-color: rgba(255, 255, 255, 0.18) !important;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.8) !important;
}

html.dark .ready-card h3 {
  color: #FFFFFF !important;
}

html.dark .ready-card p {
  color: #9A9A9A !important;
}
`;

