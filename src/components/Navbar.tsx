/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Navbar — Material Design 3 top app bar with Light/Dark theme toggle
 */
import React from 'react';
import { UserRole, OperatingMode } from '../types';

interface NavbarProps {
  userRole: UserRole;
  userName: string;
  onRoleChange: (role: UserRole) => void;
  mode: OperatingMode;
  onModeChange: (mode: OperatingMode) => void;
  onLogout: () => void;
  isDark: boolean;
  onToggleTheme: () => void;
}

function DPLogo() {
  return (
    <div className="w-7 h-7 flex items-center justify-center p-1 shadow-sm shrink-0"
      style={{ background: 'var(--primary-action)', borderRadius: 4, color: 'var(--on-primary-action)' }}>
      <svg className="w-full h-full" fill="none" viewBox="0 0 48 48">
        <path clipRule="evenodd" d="M24 18.4228L42 11.475V34.3663C42 34.7796 41.7457 35.1504 41.3601 35.2992L24 42V18.4228Z" fill="currentColor" fillRule="evenodd"/>
        <path clipRule="evenodd" d="M24 8.18819L33.4123 11.574L24 15.2071L14.5877 11.574L24 8.18819ZM9 15.8487L21 20.4805V37.6263L9 32.9945V15.8487ZM27 37.6263V20.4805L39 15.8487V32.9945L27 37.6263ZM25.354 2.29885C24.4788 1.98402 23.5212 1.98402 22.646 2.29885L4.98454 8.65208C3.7939 9.08038 3 10.2097 3 11.475V34.3663C3 36.0196 4.01719 37.5026 5.55962 38.098L22.9197 44.7987C23.6149 45.0671 24.3851 45.0671 25.0803 44.7987L42.4404 38.098C43.9828 37.5026 45 36.0196 45 34.3663V11.475C45 10.2097 44.2061 9.08038 43.0155 8.65208L25.354 2.29885Z" fill="currentColor" fillRule="evenodd"/>
      </svg>
    </div>
  );
}

export function Navbar({ userRole, userName, onRoleChange, mode, onModeChange, onLogout, isDark, onToggleTheme }: NavbarProps) {
  const isManager = userRole === 'RECEIVING_MANAGER';

  const pillStyle: React.CSSProperties = {
    background: 'var(--surface-container)',
    border: '1px solid var(--outline-var)',
    color: 'var(--on-surface-var)',
    fontFamily: "'JetBrains Mono', monospace",
    borderRadius: 6,
    padding: '4px 10px',
    fontSize: 11,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontWeight: 600,
  };

  const btnStyle: React.CSSProperties = {
    background: 'var(--surface-low)',
    border: '1px solid var(--outline-var)',
    color: 'var(--on-surface-var)',
    borderRadius: 6,
    padding: '5px 10px',
    fontSize: 12,
    fontWeight: 600,
    fontFamily: "'Inter', sans-serif",
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    cursor: 'pointer',
  };

  return (
    <header
      className="h-14 flex items-center justify-between px-4 shrink-0 z-30"
      style={{
        background: 'var(--header-bg)',
        borderBottom: '1px solid var(--header-border)',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {/* ── Left: Logo + title ──────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <DPLogo />
        <div className="hidden md:block">
          <div className="font-bold text-sm tracking-tight leading-none" style={{ color: 'var(--on-surface)' }}>DockProof AI</div>
          <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--on-surface-var)', fontFamily: "'JetBrains Mono', monospace" }}>
            Industrial Inbound OS
          </div>
        </div>
        <span className="md:hidden font-bold text-sm" style={{ color: 'var(--on-surface)' }}>DockProof AI</span>
      </div>

      {/* ── Center: Mode indicator (desktop) ───────────────────── */}
      <div className="hidden lg:flex items-center gap-2 text-xs" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
        <span className={`w-2 h-2 rounded-full ${mode === 'PILOT' ? 'animate-pulse' : ''}`}
          style={{ background: mode === 'PILOT' ? '#f59e0b' : 'var(--tertiary)' }} />
        <span className="font-semibold" style={{ color: 'var(--on-surface-var)' }}>
          {mode === 'PILOT' ? 'PILOT MODE' : 'PRODUCTION MODE'}
        </span>
        {isManager && (
          <button
            onClick={() => onModeChange(mode === 'PILOT' ? 'PRODUCTION' : 'PILOT')}
            className="ml-1 underline font-bold cursor-pointer"
            style={{ color: 'var(--primary)', background: 'none', border: 'none', fontSize: 11 }}
          >
            Switch
          </button>
        )}
      </div>

      {/* ── Right: pills + theme toggle + logout ───────────────── */}
      <div className="flex items-center gap-2">
        {/* WiFi pill */}
        <div className="hidden sm:flex" style={pillStyle}>
          <span className="material-symbols-outlined text-[14px]" style={{ color: 'var(--tertiary)', fontVariationSettings: "'FILL' 1" }}>wifi</span>
          <span>Online</span>
        </div>

        {/* Mobile mode pill */}
        <div className="flex lg:hidden" style={pillStyle}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: mode === 'PILOT' ? '#f59e0b' : 'var(--tertiary)' }} />
          <span>{mode === 'PILOT' ? 'PILOT' : 'PROD'}</span>
          {isManager && (
            <button onClick={() => onModeChange(mode === 'PILOT' ? 'PRODUCTION' : 'PILOT')}
              style={{ color: 'var(--primary)', background: 'none', border: 'none', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
              ⇄
            </button>
          )}
        </div>

        {/* User badge */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs font-semibold"
          style={{
            background: isManager ? 'var(--tertiary-soft)' : 'var(--primary-fixed)',
            borderColor: isManager ? 'var(--tertiary)' : 'var(--primary-dim)',
            color: isManager ? 'var(--tertiary)' : 'var(--primary)',
            fontFamily: "'JetBrains Mono', monospace",
            borderRadius: 6,
          }}>
          <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: "'FILL' 1" }}>
            {isManager ? 'shield_person' : 'badge'}
          </span>
          <span className="hidden sm:inline max-w-[110px] truncate">{userName}</span>
          <span className="hidden sm:inline text-[10px] opacity-60">({isManager ? 'MGR' : 'OPR'})</span>
        </div>

        {/* ── Theme Toggle button ──────────────────────────────── */}
        <button
          onClick={onToggleTheme}
          title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          style={btnStyle}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-container)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-low)'; }}
        >
          <span className="material-symbols-outlined text-[18px]" style={{ color: 'var(--primary)' }}>
            {isDark ? 'light_mode' : 'dark_mode'}
          </span>
          <span className="hidden sm:inline">{isDark ? 'Light' : 'Dark'}</span>
        </button>

        {/* Logout */}
        <button
          onClick={onLogout}
          title="Sign Out"
          style={btnStyle}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.background = 'var(--error-soft)';
            (e.currentTarget as HTMLElement).style.color = 'var(--error)';
            (e.currentTarget as HTMLElement).style.borderColor = 'var(--error)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.background = 'var(--surface-low)';
            (e.currentTarget as HTMLElement).style.color = 'var(--on-surface-var)';
            (e.currentTarget as HTMLElement).style.borderColor = 'var(--outline-var)';
          }}
        >
          <span className="material-symbols-outlined text-[16px]">logout</span>
          <span className="hidden sm:inline">Sign Out</span>
        </button>
      </div>
    </header>
  );
}
