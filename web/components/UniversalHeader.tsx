'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function UniversalHeader() {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const pathname = usePathname();
  const isPipeline = pathname === '/pipeline';

  return (
    <header className={`universal-site-header ${menuOpen ? 'menu-open' : ''}`}>
      <style dangerouslySetInnerHTML={{ __html: UNIVERSAL_HEADER_STYLES }} />

      {/* Mobile backdrop */}
      {menuOpen && (
        <div
          className="universal-menu-backdrop"
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Left: Brand Logo */}
      <Link
        href="/"
        className="universal-logo"
        aria-label="Commerce Pipeline - Operational AI Infrastructure"
      >
        <svg
          className="universal-logo-mark"
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <g transform="rotate(-30 12 12)">
            <circle cx="7.3" cy="3.2" r="1.45" />
            <rect x="5.5" y="4.7" width="3.6" height="14.6" rx="1.8" />
            <rect x="14.9" y="4.7" width="3.6" height="14.6" rx="1.8" />
            <circle cx="16.7" cy="20.8" r="1.45" />
          </g>
        </svg>
        <span className="universal-brand-text">
          Commerce<span className="universal-logo-suffix">.ai</span>
        </span>
      </Link>

      {/* Center: Frosted navigation pills */}
      <nav id="site-nav" className="universal-nav" aria-label="Primary">
        <Link href="/#how-it-works" className="universal-nav-pill" onClick={() => setMenuOpen(false)}>
          <span>How It Works</span>
        </Link>
        <Link href="/#modules" className="universal-nav-pill" onClick={() => setMenuOpen(false)}>
          <span>Five Agents</span>
        </Link>
        <Link href="/#evidence" className="universal-nav-pill" onClick={() => setMenuOpen(false)}>
          <span>Evidence Chain</span>
        </Link>
        <Link href="/#faqs" className="universal-nav-pill" onClick={() => setMenuOpen(false)}>
          <span>FAQs</span>
        </Link>
      </nav>

      {/* Right: Header CTA button & Mobile burger */}
      <div className="universal-header-right">
        {isPipeline ? (
          <Link
            href="/"
            className="universal-btn universal-btn-solid"
          >
            <span>Back</span>
          </Link>
        ) : (
          <Link
            href="/pipeline"
            className="universal-btn universal-btn-solid"
          >
            <span>Launch Pipeline</span>
          </Link>
        )}

        <button
          type="button"
          className="universal-burger"
          aria-controls="site-nav"
          aria-expanded={menuOpen}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <span className="universal-burger-bar" />
          <span className="universal-burger-bar" />
          <span className="universal-burger-bar" />
        </button>
      </div>
    </header>
  );
}

const UNIVERSAL_HEADER_STYLES = `
.universal-site-header {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  width: 100%;
  max-width: 1600px;
  margin: 0 auto;
  padding: 20px 40px 16px;
  position: relative;
  z-index: 50;
  background: transparent;
  box-sizing: border-box;
}

.universal-logo {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  justify-self: start;
  font-size: 15.5px;
  font-weight: 600;
  letter-spacing: -0.03em;
  color: #0F172A;
  text-decoration: none;
}

.universal-logo-mark {
  color: #0F172A;
  transition: transform 0.3s ease;
}
.universal-logo:hover .universal-logo-mark {
  transform: rotate(-15deg);
}

.universal-brand-text {
  font-family: "Inter", system-ui, -apple-system, sans-serif;
  font-weight: 600;
  color: #0F172A;
}

.universal-logo-suffix {
  font-weight: 400;
  color: #64748B;
}

.universal-nav {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-self: center;
}

.universal-nav-pill {
  height: 40px;
  padding: 0 18px;
  border-radius: 7px;
  overflow: hidden;
  position: relative;
  border: 1px solid rgba(15, 23, 42, 0.14);
  background: linear-gradient(105deg, #FFFFFF 0%, #F1F5F9 48%, #E2E8F0 100%);
  color: #0F172A;
  font-size: 14px;
  font-weight: 450;
  letter-spacing: -0.01em;
  white-space: nowrap;
  display: flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.9);
  transition: all 0.35s ease;
  font-family: "Inter", system-ui, -apple-system, sans-serif;
}

.universal-nav-pill::before {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(115deg, transparent 30%, rgba(255, 255, 255, 0.8) 50%, transparent 70%);
  transform: translateX(-120%);
  transition: transform 0.6s ease;
}

.universal-nav-pill:hover::before {
  transform: translateX(120%);
}

.universal-nav-pill:hover {
  border-color: rgba(15, 23, 42, 0.35);
  background: linear-gradient(105deg, #FFFFFF 0%, #E2E8F0 45%, #CBD5E1 100%);
  box-shadow: 0 3px 12px rgba(15, 23, 42, 0.08), inset 0 1px 0 #FFFFFF;
  transform: translateY(-1px);
}

.universal-header-right {
  display: flex;
  align-items: center;
  gap: 12px;
  justify-self: end;
}

.universal-btn {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 40px;
  padding: 0 18px;
  border-radius: 6px;
  font-size: 13.5px;
  font-weight: 500;
  letter-spacing: -0.02em;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  text-decoration: none;
  font-family: "Inter", system-ui, -apple-system, sans-serif;
  transition: all 0.35s ease;
}

.universal-btn-solid {
  background: linear-gradient(180deg, #0F172A 0%, #1E293B 48%, #0F172A 100%);
  color: #FFFFFF !important;
  border: 1px solid #0F172A;
  box-shadow: 0 2px 6px rgba(15, 23, 42, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.2);
}

.universal-btn-solid:hover {
  background: linear-gradient(180deg, #1E293B 0%, #334155 42%, #1E293B 100%);
  border-color: #334155;
  box-shadow: 0 6px 20px rgba(15, 23, 42, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.3);
  transform: translateY(-1px);
}

.universal-burger {
  display: none;
  width: 40px;
  height: 40px;
  border-radius: 6px;
  border: 1px solid rgba(15, 23, 42, 0.14);
  background: rgba(255, 255, 255, 0.85);
  cursor: pointer;
  padding: 10px;
  flex-direction: column;
  justify-content: space-between;
  align-items: center;
  z-index: 60;
}

.universal-burger-bar {
  width: 16px;
  height: 1.5px;
  background: #0F172A;
  border-radius: 1px;
  transition: transform 0.25s ease, opacity 0.2s ease;
}

.universal-menu-backdrop {
  display: block;
  position: fixed;
  inset: 0;
  z-index: 40;
  background: rgba(15, 23, 42, 0.4);
  backdrop-filter: blur(20px);
}

@media (max-width: 900px) {
  .universal-site-header {
    grid-template-columns: 1fr auto auto;
    gap: 8px;
    padding: 10px 18px;
  }
  .universal-burger {
    display: flex;
  }
  .universal-nav {
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
  .menu-open .universal-nav {
    opacity: 1;
    visibility: visible;
    transform: translateY(0);
  }
  .universal-nav-pill {
    width: 100%;
    height: 52px;
    font-size: 18px;
    border-radius: 10px;
  }
  .menu-open .universal-burger .universal-burger-bar:nth-child(1) {
    transform: translateY(6.5px) rotate(45deg);
  }
  .menu-open .universal-burger .universal-burger-bar:nth-child(2) {
    opacity: 0;
  }
  .menu-open .universal-burger .universal-burger-bar:nth-child(3) {
    transform: translateY(-6.5px) rotate(-45deg);
  }
}
`;
