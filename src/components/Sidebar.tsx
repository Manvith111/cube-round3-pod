/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Sidebar — Material Design 3 Navigation Drawer (theme-aware via CSS vars)
 */
import React from 'react';
import { UserRole } from '../types';

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  userRole: UserRole;
  userName: string;
  onLogout: () => void;
  exceptionCount: number;
  openPoCount: number;
}

const NAV_ITEMS = [
  { id: 'dashboard',       label: 'Dashboard',          icon: 'dashboard',         managerOnly: false },
  { id: 'inspection',      label: 'Start Inspection',   icon: 'qr_code_scanner',   managerOnly: false },
  { id: 'scan',            label: 'Barcode Scanner',    icon: 'barcode_scanner',   managerOnly: false },
  { id: 'purchase-orders', label: 'Purchase Orders',    icon: 'receipt_long',      managerOnly: false },
  { id: 'exceptions',      label: 'Exceptions Queue',   icon: 'warning',           managerOnly: false },
  { id: 'products',        label: 'Product Catalogue',  icon: 'inventory_2',       managerOnly: false },
  { id: 'suppliers',       label: 'Suppliers',          icon: 'business',          managerOnly: false },
  { id: 'analytics',       label: 'Analytics',          icon: 'monitoring',        managerOnly: true  },
  { id: 'audit-logs',      label: 'Audit Ledger',       icon: 'history',           managerOnly: true  },
  { id: 'readiness',       label: 'Launch Readiness',   icon: 'rocket_launch',     managerOnly: false },
] as const;

function DPLogo() {
  return (
    <div className="w-8 h-8 flex items-center justify-center p-1 shrink-0"
      style={{ background: 'var(--primary-action)', borderRadius: 6, color: 'var(--on-primary-action)' }}>
      <svg className="w-full h-full" fill="none" viewBox="0 0 48 48">
        <path clipRule="evenodd" d="M24 18.4228L42 11.475V34.3663C42 34.7796 41.7457 35.1504 41.3601 35.2992L24 42V18.4228Z" fill="currentColor" fillRule="evenodd"/>
        <path clipRule="evenodd" d="M24 8.18819L33.4123 11.574L24 15.2071L14.5877 11.574L24 8.18819ZM9 15.8487L21 20.4805V37.6263L9 32.9945V15.8487ZM27 37.6263V20.4805L39 15.8487V32.9945L27 37.6263ZM25.354 2.29885C24.4788 1.98402 23.5212 1.98402 22.646 2.29885L4.98454 8.65208C3.7939 9.08038 3 10.2097 3 11.475V34.3663C3 36.0196 4.01719 37.5026 5.55962 38.098L22.9197 44.7987C23.6149 45.0671 24.3851 45.0671 25.0803 44.7987L42.4404 38.098C43.9828 37.5026 45 36.0196 45 34.3663V11.475C45 10.2097 44.2061 9.08038 43.0155 8.65208L25.354 2.29885Z" fill="currentColor" fillRule="evenodd"/>
      </svg>
    </div>
  );
}

export function Sidebar({ currentTab, setCurrentTab, userRole, userName, onLogout, exceptionCount, openPoCount }: SidebarProps) {
  const isManager = userRole === 'RECEIVING_MANAGER';

  const badges: Record<string, number> = {
    'exceptions': exceptionCount,
    'purchase-orders': openPoCount,
  };

  return (
    <aside
      className="w-64 hidden md:flex flex-col justify-between shrink-0"
      style={{
        background: 'var(--surface)',
        borderRight: '1px solid var(--outline-var)',
        minHeight: '100vh',
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <div>
        {/* Brand */}
        <div className="p-5 flex items-center gap-3" style={{ borderBottom: '1px solid var(--surface-high)' }}>
          <DPLogo />
          <div>
            <div className="font-bold text-sm tracking-tight" style={{ color: 'var(--on-surface)' }}>DockProof AI</div>
            <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--on-surface-var)', fontFamily: "'JetBrains Mono', monospace" }}>
              Industrial Inbound OS
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="p-3 space-y-0.5">
          <div className="px-3 pt-2 pb-1">
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--outline)', fontFamily: "'JetBrains Mono', monospace" }}>
              Operations
            </span>
          </div>

          {NAV_ITEMS.filter(item => !item.managerOnly || isManager).map(item => {
            const isActive = currentTab === item.id;
            const badge = badges[item.id];
            const isException = item.id === 'exceptions';

            return (
              <button
                key={item.id}
                onClick={() => setCurrentTab(item.id)}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all cursor-pointer"
                style={{
                  background: isActive ? 'var(--nav-active-bg)' : 'transparent',
                  color: isActive ? 'var(--nav-active-fg)' : 'var(--on-surface-var)',
                  fontWeight: isActive ? 700 : 500,
                  fontSize: 13,
                  border: 'none',
                  textAlign: 'left',
                }}
                onMouseEnter={e => {
                  if (!isActive) {
                    (e.currentTarget as HTMLElement).style.background = 'var(--surface-container)';
                    (e.currentTarget as HTMLElement).style.color = 'var(--on-surface)';
                  }
                }}
                onMouseLeave={e => {
                  if (!isActive) {
                    (e.currentTarget as HTMLElement).style.background = 'transparent';
                    (e.currentTarget as HTMLElement).style.color = 'var(--on-surface-var)';
                  }
                }}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="material-symbols-outlined text-[20px]"
                    style={{
                      fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0",
                      color: isActive ? 'var(--nav-active-fg)' : isException && badge ? 'var(--error)' : 'inherit',
                    }}
                  >
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </div>

                {badge !== undefined && badge > 0 && (
                  <span
                    className="text-[10px] font-bold px-1.5 rounded-full text-white min-w-[18px] text-center"
                    style={{
                      background: isException ? 'var(--error)' : 'var(--primary-action)',
                      fontFamily: "'JetBrains Mono', monospace",
                      lineHeight: '18px',
                    }}
                  >
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* User + Sign out footer */}
      <div className="p-4 space-y-3" style={{ borderTop: '1px solid var(--surface-high)' }}>
        {/* User card */}
        <div
          className="flex items-center gap-2.5 p-3 rounded-lg"
          style={{
            background: isManager ? 'var(--tertiary-soft)' : 'var(--surface-container)',
            border: `1px solid ${isManager ? 'var(--tertiary)' : 'var(--outline-var)'}`,
          }}
        >
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{
              background: isManager ? 'var(--tertiary-soft)' : 'var(--primary-fixed)',
              color: isManager ? 'var(--tertiary)' : 'var(--primary)',
            }}
          >
            <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              {isManager ? 'shield_person' : 'badge'}
            </span>
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold truncate" style={{ color: 'var(--on-surface)' }}>{userName}</div>
            <div className="text-[10px] font-semibold" style={{ color: isManager ? 'var(--tertiary)' : 'var(--primary)', fontFamily: "'JetBrains Mono', monospace" }}>
              {isManager ? 'RECEIVING MANAGER' : 'RECEIVING OPERATOR'}
            </div>
          </div>
        </div>

        {/* Sign out */}
        <button
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer"
          style={{
            background: 'var(--surface-low)',
            border: '1px solid var(--outline-var)',
            color: 'var(--on-surface-var)',
            fontFamily: "'Inter', sans-serif",
          }}
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
          Sign Out
        </button>

        <div className="text-center text-[10px]" style={{ color: 'var(--outline)', fontFamily: "'JetBrains Mono', monospace" }}>
          Supabase RLS • Gemini Vision • ZXing
        </div>
      </div>
    </aside>
  );
}
