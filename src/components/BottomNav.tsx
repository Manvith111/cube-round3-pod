/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * BottomNav — Material Design 3 Navigation Bar (mobile, theme-aware)
 */
import React from 'react';

interface BottomNavProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  exceptionCount: number;
  onLogout: () => void;
}

const TABS = [
  { id: 'dashboard',       label: 'Home',     icon: 'dashboard' },
  { id: 'purchase-orders', label: 'POs',      icon: 'receipt_long' },
  { id: 'inspection',      label: 'Inspect',  icon: 'qr_code_scanner', primary: true },
  { id: 'exceptions',      label: 'Issues',   icon: 'warning' },
  { id: 'products',        label: 'Products', icon: 'inventory_2' },
] as const;

export function BottomNav({ currentTab, setCurrentTab, exceptionCount, onLogout }: BottomNavProps) {
  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around px-1 pb-safe"
      style={{
        background: 'var(--surface)',
        borderTop: '1px solid var(--outline-var)',
        boxShadow: '0 -2px 10px rgba(0,0,0,0.08)',
        paddingTop: 6,
        paddingBottom: 10,
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {TABS.map(tab => {
        const isActive = currentTab === tab.id;
        const isPrimary = 'primary' in tab && tab.primary;
        const showBadge = tab.id === 'exceptions' && exceptionCount > 0;

        if (isPrimary) {
          return (
            <button
              key={tab.id}
              onClick={() => setCurrentTab(tab.id)}
              className="flex flex-col items-center -mt-5 cursor-pointer"
              style={{ background: 'none', border: 'none' }}
            >
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center"
                style={{
                  background: 'var(--primary-action)',
                  boxShadow: '0 4px 16px rgba(0,74,198,0.35)',
                }}
              >
                <span className="material-symbols-outlined text-[28px]"
                  style={{ color: 'var(--on-primary-action)', fontVariationSettings: "'FILL' 1" }}>
                  {tab.icon}
                </span>
              </div>
              <span className="text-[10px] font-bold mt-0.5" style={{ color: 'var(--primary)' }}>{tab.label}</span>
            </button>
          );
        }

        return (
          <button
            key={tab.id}
            onClick={() => setCurrentTab(tab.id)}
            className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl relative cursor-pointer transition-all"
            style={{
              background: isActive ? 'var(--nav-active-bg)' : 'transparent',
              border: 'none',
              minWidth: 52,
            }}
          >
            <span
              className="material-symbols-outlined text-[22px]"
              style={{
                color: isActive ? 'var(--nav-active-fg)' : 'var(--outline)',
                fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0",
              }}
            >
              {tab.icon}
            </span>
            <span className="text-[10px] font-semibold" style={{ color: isActive ? 'var(--nav-active-fg)' : 'var(--outline)' }}>
              {tab.label}
            </span>
            {showBadge && (
              <span className="absolute top-0.5 right-1.5 w-2 h-2 rounded-full" style={{ background: 'var(--error)' }} />
            )}
          </button>
        );
      })}
    </nav>
  );
}
