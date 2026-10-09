import type { Metadata } from 'next';
import './globals.css';
import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';
import { GridPulse } from '@/components/ui/grid-pulse';

export const metadata: Metadata = {
  title: 'Commerce Multi-Agent Pipeline | Pod System',
  description: 'Enterprise multi-agent pre-seal & post-sale commerce integrity system. 5-Agent orchestrated verification with cryptographic evidence chains.',
  icons: {
    icon: '/icon.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/icon.png" sizes="any" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400..700;1,9..40,400..700&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="relative flex flex-col min-h-screen antialiased text-slate-900 bg-[#E8EDF5]">
        <GridPulse />
        
        {/* Sticky Neumorphic Header */}
        <header className="sticky top-0 z-50 px-4 sm:px-6 lg:px-8 pt-4 pb-2">
          <div className="max-w-7xl mx-auto rounded-[28px] neu-flat px-6 h-18 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="w-11 h-11 rounded-2xl neu-icon-well flex items-center justify-center p-1.5 group-hover:scale-105 transition-transform duration-300 overflow-hidden">
                <img src="/icon.png" alt="Commerce Pipeline" className="w-full h-full object-contain" />
              </div>
              <div className="flex flex-col">
                <span className="font-display font-extrabold text-lg tracking-tight text-slate-900">
                  Commerce Pipeline
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#773C30]">
                  Pod 5-Agent Commerce Verification
                </span>
              </div>
            </Link>

            <nav className="flex items-center gap-2 sm:gap-4 text-sm font-semibold">
              <span className="px-3 py-1.5 rounded-2xl text-xs font-mono font-bold neu-pressed-sm text-[#773C30]">
                Evidence Contract v1.0
              </span>
            </nav>
          </div>
        </header>

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10">
          {children}
        </main>

        {/* Soft Neumorphic Footer */}
        <footer className="mt-auto px-4 sm:px-6 lg:px-8 pb-6 pt-10 relative z-10">
          <div className="max-w-7xl mx-auto rounded-[32px] neu-pressed p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-700 dark:text-slate-200">Pod 5-Agent Architecture</span>
              <span>•</span>
              <span>Receiving ➔ Prep | Pack ➔ Returns ➔ Recovery</span>
            </div>
            <div className="flex items-center gap-4 text-[11px] font-mono">
              <span>Immutable Evidence Bundle</span>
              <span>•</span>
              <span>Centralized Orchestration State</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
