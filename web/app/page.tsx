'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

export default function VantageLandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [motionPending, setMotionPending] = useState(true);

  useEffect(() => {
    // 3500ms fallback timeout to clear motion-pending
    const timer = setTimeout(() => {
      setMotionPending(false);
    }, 1200);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className={`vantage-root ${motionPending ? 'motion-pending' : ''}`}>
      <style dangerouslySetInnerHTML={{ __html: VANTAGE_STYLES }} />

      <main className="viewport">
        <section className="screen" id="screen">
          {/* Full-bleed edge-to-edge background video */}
          <video
            className="background"
            autoPlay
            muted
            loop
            playsInline
            disablePictureInPicture
            aria-hidden="true"
          >
            <source
              src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260808_064556_051587f1-74a1-4336-8c05-4dde3594ed05.mp4"
              type="video/mp4"
            />
          </video>

          {/* Header Top Bar */}
          <header className={`header ${menuOpen ? 'menu-open' : ''}`}>
            {/* 1. Brand SVG Logo */}
            <Link href="/" className="brand" aria-label="Vantage home">
              <svg width="25" height="25" viewBox="0 0 25 25" fill="none">
                <defs>
                  <clipPath id="brand-disc">
                    <circle cx="12.5" cy="12.5" r="12" />
                  </clipPath>
                </defs>
                <g clipPath="url(#brand-disc)">
                  <rect width="25" height="25" fill="#ededed" />
                  <path d="M12.5 0 L25 12.5 L12.5 25 Z" fill="#050606" />
                  <path d="M0 12.5 L12.5 0 L12.5 25 Z" fill="#737778" />
                  <path d="M6 6 L19 12.5 L6 19 Z" fill="#fafafa" />
                  <path d="M12.5 6 L19 12.5 L12.5 19 Z" fill="#0a0b0b" />
                </g>
              </svg>
            </Link>

            {/* Header Actions / Navigation */}
            <div className="header-actions" id="tablet-navigation">
              <nav className="nav" aria-label="Primary">
                <Link href="/" className="nav-link active">
                  Home
                </Link>
                <Link href="/pipeline" className="nav-link">
                  About
                </Link>
                <Link href="/pipeline" className="nav-link">
                  Services
                </Link>
                <Link href="/pipeline" className="nav-link">
                  Contact
                </Link>
              </nav>

              {/* Time Panel */}
              <div className="time-panel">
                <span className="time-label">Timezone</span>
                <span className="time-val">9:47 PM&nbsp; • &nbsp;14 July 2026</span>
              </div>

              {/* Sign Up / Launch CTA */}
              <Link href="/pipeline" className="sign-up">
                Sign Up
              </Link>
            </div>

            {/* Menu Toggle for Tablet/Mobile */}
            <button
              type="button"
              className="menu-toggle"
              aria-label="Toggle navigation"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
                {menuOpen ? (
                  <>
                    <line x1="4" y1="4" x2="16" y2="16" />
                    <line x1="16" y1="4" x2="4" y2="16" />
                  </>
                ) : (
                  <>
                    <line x1="3" y1="6" x2="17" y2="6" />
                    <line x1="3" y1="14" x2="17" y2="14" />
                  </>
                )}
              </svg>
            </button>
          </header>

          {/* Hero Section */}
          <section className="hero">
            <div className="hero-content">
              {/* Exact Headline with scaleX transforms */}
              <h1 className="hero-title">
                <span className="line line-one">
                  <span className="line-reveal">Stop Digging</span>
                </span>
                <span className="line line-two">
                  <span className="line-reveal">Through Dashboards.</span>
                </span>
              </h1>

              {/* Exact Body Copy with original wording and line breaks */}
              <p className="hero-copy">
                Your metrics are scattered across a dozen dashboards.<br />
                Vantage bring them into one clear signal, so every<br />
                decision is backed by data you actually trust.
              </p>

              {/* Primary CTA (links to pipeline) */}
              <Link href="/pipeline" className="primary-cta" aria-label="Get Started">
                <span className="label">Get Started</span>
                <span className="arrow-box">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="2" y1="7" x2="12" y2="7" />
                    <polyline points="8 3 12 7 8 11" />
                  </svg>
                </span>
              </Link>
            </div>

            {/* Glass Demo Card (Bottom-Right) */}
            <article className="demo-card" onAnimationEnd={() => setMotionPending(false)}>
              <div className="demo-visual">
                <div className="demo-img" />
                <Link href="/pipeline" className="play" aria-label="Play demo">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="#FFFFFF">
                    <polygon points="3,1 11,6 3,11" />
                  </svg>
                </Link>
              </div>
              <Link href="/pipeline" className="watch-button">
                <span>Watch Demo</span>
              </Link>
            </article>
          </section>
        </section>
      </main>
    </div>
  );
}

const VANTAGE_STYLES = `
/* Vantage Pure CSS Implementation */
.vantage-root {
  position: fixed;
  inset: 0;
  z-index: 50;
  overflow: hidden;
  background: #000;
  color-scheme: dark;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  user-select: none;
}

.vantage-root .viewport {
  position: absolute;
  inset: 0;
  isolation: isolate;
  background: #000;
  overflow: hidden;
}

.vantage-root .screen {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 100%;
  height: 100%;
  background: #000;
  overflow: hidden;

  --gutter-start: clamp(36px, 4.177vw, 96px);
  --gutter-end: clamp(36px, 4.04vw, 96px);
  --header-top: clamp(20px, 2.264vh, 30px);
  --hero-bottom: clamp(34px, 5.19vh, 64px);
  --display-size: clamp(58px, 7.64vh, 88px);
  --display-leading: clamp(72px, 9.34vh, 106px);
  --copy-size: clamp(14px, 1.70vh, 19px);
  --copy-leading: clamp(19px, 2.17vh, 24px);
  --title-copy-gap: clamp(15px, 2.08vh, 24px);
  --copy-cta-gap: clamp(24px, 3.11vh, 36px);
  --cta-width: clamp(142px, 15.09vh, 168px);
  --cta-height: clamp(38px, 3.96vh, 44px);
  --compact-control-font-size: clamp(17px, 1.75vh, 19px);
  --action-control-font-size: clamp(17px, 1.78vh, 19.5px);
  --primary-control-font-size: clamp(17px, 1.77vh, 19.25px);
  --card-width: clamp(150px, 18.96vh, 215px);
}

/* Background video */
.vantage-root .background {
  position: absolute;
  inset: 0;
  z-index: -3;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  pointer-events: none;
  user-select: none;
}

/* Vignette overlay */
.vantage-root .screen::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -2;
  pointer-events: none;
  background:
    linear-gradient(180deg, rgba(0,0,0,.03), transparent 24%, transparent 82%, rgba(0,0,0,.05)),
    radial-gradient(ellipse at 44% 54%, transparent 30%, rgba(0,0,0,.055) 100%);
}

/* Header */
.vantage-root .header {
  position: absolute;
  inset: var(--header-top) var(--gutter-end) auto var(--gutter-start);
  height: 48px;
  display: flex;
  align-items: center;
  white-space: nowrap;
  z-index: 20;
}

.vantage-root .brand {
  position: relative;
  display: flex;
  align-items: center;
  filter: drop-shadow(0 1px 2px rgba(0,0,0,.3));
  transition: opacity 140ms ease;
}
.vantage-root .brand:hover {
  opacity: 0.85;
}

.vantage-root .header-actions {
  display: flex;
  align-items: center;
  width: 100%;
}

.vantage-root .nav {
  display: flex;
  align-items: center;
  margin-left: clamp(36px, 3.03vw, 48px);
  gap: clamp(32px, 2.9vw, 43px);
}

.vantage-root .nav-link {
  position: relative;
  font-size: 16px;
  font-weight: 430;
  letter-spacing: -0.36px;
  color: rgba(229, 229, 230, 0.77);
  text-decoration: none;
  text-shadow: 0 1px 3px rgba(0,0,0,.55);
  transition: color 140ms ease, opacity 140ms ease;
}
.vantage-root .nav-link:hover {
  color: #FFFFFF;
}
.vantage-root .nav-link.active {
  color: #FFFFFF;
}
.vantage-root .nav-link.active::after {
  content: "";
  position: absolute;
  left: 0;
  bottom: -6px;
  width: 44px;
  height: 2px;
  background: rgba(255, 255, 255, 0.82);
  border-radius: 1px;
}

.vantage-root .time-panel {
  margin-left: auto;
  width: 211px;
  height: 48px;
  padding-left: 12px;
  border-left: 2px solid rgba(230, 230, 230, 0.52);
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.vantage-root .time-label {
  font-size: 13px;
  font-weight: 420;
  color: rgba(240, 240, 240, 0.77);
  line-height: 1.2;
}
.vantage-root .time-val {
  font-size: 14px;
  font-weight: 440;
  color: rgba(255, 255, 255, 0.93);
  line-height: 1.2;
  margin-top: 2px;
}

.vantage-root .sign-up {
  width: 109px;
  height: 42px;
  border-radius: 7px;
  background: #FFFFFF;
  color: #101010;
  font-size: 15px;
  font-weight: 460;
  letter-spacing: -0.34px;
  text-decoration: none;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: clamp(20px, 1.95vw, 29px);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.72), 0 1px 5px rgba(0,0,0,.34);
  transition: transform 140ms ease, filter 140ms ease;
}
.vantage-root .sign-up:hover {
  filter: brightness(1.08);
  transform: translateY(-1px);
}

.vantage-root .menu-toggle {
  display: none;
  background: transparent;
  border: none;
  color: #FFFFFF;
  cursor: pointer;
  padding: 8px;
}

/* Hero Section */
.vantage-root .hero {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.vantage-root .hero-content {
  position: absolute;
  left: var(--gutter-start);
  bottom: var(--hero-bottom);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  pointer-events: auto;
  z-index: 10;
}

.vantage-root .hero-title {
  font-size: var(--display-size);
  line-height: var(--display-leading);
  font-weight: 500;
  letter-spacing: -2.1px;
  white-space: nowrap;
  text-shadow: 0 2px 2px rgba(0,0,0,.44);
  margin: 0 0 var(--title-copy-gap);
  display: flex;
  flex-direction: column;
}

.vantage-root .line {
  display: block;
  transform-origin: left center;
}
.vantage-root .line-one {
  color: #FFFFFF;
  transform: scaleX(0.775);
}
.vantage-root .line-two {
  color: rgba(211, 207, 207, 0.78);
  transform: scaleX(0.793);
}

.vantage-root .hero-copy {
  color: rgba(226, 229, 228, 0.84);
  font-size: var(--copy-size);
  line-height: var(--copy-leading);
  font-weight: 350;
  letter-spacing: 0.13px;
  text-shadow: 0 1px 3px rgba(0,0,0,.7);
  width: clamp(390px, 31.67vw, 500px);
  margin: 0 0 var(--copy-cta-gap);
}

.vantage-root .primary-cta {
  position: relative;
  width: var(--cta-width);
  height: var(--cta-height);
  border-radius: 7px;
  background: #FFFFFF;
  color: #111111;
  box-shadow: 0 1px 5px rgba(0,0,0,.38);
  display: flex;
  align-items: center;
  text-decoration: none;
  transition: transform 140ms ease, filter 140ms ease;
}
.vantage-root .primary-cta:hover {
  filter: brightness(1.08);
  transform: translateY(-1px);
}
.vantage-root .primary-cta .label {
  position: absolute;
  left: 8.125%;
  font-size: var(--action-control-font-size);
  font-weight: 450;
  letter-spacing: -0.3px;
}
.vantage-root .primary-cta .arrow-box {
  position: absolute;
  right: 3.125%;
  top: 14.286%;
  width: 20.625%;
  height: 71.429%;
  border-radius: 7px;
  background: #070909;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Demo Card (Bottom-Right) */
.vantage-root .demo-card {
  position: absolute;
  right: var(--gutter-end);
  bottom: var(--hero-bottom);
  width: var(--card-width);
  aspect-ratio: 201 / 265;
  border: 1px solid rgba(255, 255, 255, 0.13);
  border-radius: clamp(12px, 1.52vh, 18px);
  background: linear-gradient(145deg, rgba(24, 22, 20, 0.80), rgba(5, 12, 14, 0.86));
  box-shadow:
    0 2px 10px rgba(0, 0, 0, 0.44),
    0 0 0 3px rgba(255, 255, 255, 0.035) inset,
    0 0 0 1px rgba(0, 0, 0, 0.9);
  backdrop-filter: blur(14px) saturate(108%);
  -webkit-backdrop-filter: blur(14px) saturate(108%);
  padding: 8px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  pointer-events: auto;
  z-index: 10;
}

.vantage-root .demo-visual {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: 8px;
  background: #101a1e;
  overflow: hidden;
}

.vantage-root .demo-img {
  width: 100%;
  height: 100%;
  background: radial-gradient(circle at 40% 40%, rgba(220, 38, 38, 0.8), rgba(37, 99, 235, 0.7) 60%, #050c0e 100%);
  filter: brightness(0.89) saturate(0.93) contrast(1.03);
}

.vantage-root .play {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 38px;
  height: 38px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.34);
  background: rgba(3, 5, 7, 0.47);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  transition: transform 140ms ease, background 140ms ease;
}
.vantage-root .play:hover {
  transform: translate(-50%, -50%) scale(1.08);
  background: rgba(3, 5, 7, 0.7);
}

.vantage-root .watch-button {
  width: 100%;
  height: 34px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.21);
  background: linear-gradient(145deg, rgba(26, 34, 36, 0.86), rgba(16, 29, 33, 0.9));
  color: #FFFFFF;
  font-size: 13px;
  font-weight: 430;
  display: flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  transition: filter 140ms ease;
}
.vantage-root .watch-button:hover {
  filter: brightness(1.15);
}

/* Entrance Animations */
.vantage-root.motion-pending .brand {
  animation: entrance-brand 580ms cubic-bezier(0.16, 1, 0.3, 1) 60ms forwards;
}
.vantage-root.motion-pending .nav-link {
  animation: entrance-nav 480ms cubic-bezier(0.16, 1, 0.3, 1) 130ms forwards;
}
.vantage-root.motion-pending .time-panel {
  animation: entrance-nav 520ms cubic-bezier(0.16, 1, 0.3, 1) 180ms forwards;
}
.vantage-root.motion-pending .sign-up {
  animation: entrance-action 520ms cubic-bezier(0.16, 1, 0.3, 1) 220ms forwards;
}
.vantage-root.motion-pending .line-one .line-reveal {
  animation: entrance-line 800ms cubic-bezier(0.22, 1, 0.36, 1) 300ms forwards;
}
.vantage-root.motion-pending .line-two .line-reveal {
  animation: entrance-line 850ms cubic-bezier(0.22, 1, 0.36, 1) 440ms forwards;
}
.vantage-root.motion-pending .hero-copy {
  animation: entrance-copy 620ms cubic-bezier(0.16, 1, 0.3, 1) 740ms forwards;
}
.vantage-root.motion-pending .primary-cta {
  animation: entrance-action 560ms cubic-bezier(0.16, 1, 0.3, 1) 960ms forwards;
}
.vantage-root.motion-pending .demo-card {
  animation: entrance-card 920ms cubic-bezier(0.22, 1, 0.36, 1) 1040ms forwards;
}

@keyframes entrance-brand {
  from { opacity: 0; transform: translateY(7px) scale(0.94); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes entrance-nav {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes entrance-action {
  from { opacity: 0; transform: translateY(8px) scale(0.985); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes entrance-line {
  from { opacity: 0; transform: translate3d(0, 110%, 0) skewY(2deg); }
  to { opacity: 1; transform: translate3d(0, 0, 0) skewY(0); }
}
@keyframes entrance-copy {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes entrance-card {
  from { opacity: 0; transform: translateY(12px) scale(0.968); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

/* Tablet & Mobile Breakpoints */
@media (max-width: 820px) {
  .vantage-root .menu-toggle {
    display: block;
    margin-left: auto;
  }
  .vantage-root .header-actions {
    position: fixed;
    top: 70px;
    right: 20px;
    width: min(320px, calc(100vw - 40px));
    flex-direction: column;
    align-items: flex-start;
    padding: 20px;
    border-radius: 16px;
    border: 1px solid rgba(255,255,255,0.15);
    background: rgba(15, 23, 42, 0.95);
    backdrop-filter: blur(18px);
    opacity: 0;
    visibility: hidden;
    transform: translateY(-8px) scale(0.985);
    transition: all 0.2s ease;
    gap: 16px;
  }
  .vantage-root .header.menu-open .header-actions {
    opacity: 1;
    visibility: visible;
    transform: translateY(0) scale(1);
  }
  .vantage-root .nav {
    flex-direction: column;
    align-items: flex-start;
    margin: 0;
    gap: 14px;
    width: 100%;
  }
  .vantage-root .time-panel {
    margin: 0;
    border-left: none;
    border-top: 1px solid rgba(255,255,255,0.15);
    padding: 10px 0 0 0;
    width: 100%;
  }
  .vantage-root .sign-up {
    margin: 0;
    width: 100%;
  }
  .vantage-root .demo-card {
    display: none;
  }
  .vantage-root .hero-copy br {
    display: none;
  }
}
`;
