import type { Metadata } from 'next';
import './globals.css';
import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';
import BackgroundShader from '@/components/BackgroundShader';
import UniversalHeader from '@/components/UniversalHeader';

export const metadata: Metadata = {
  title: 'Pancha Pandava — Operational AI Infrastructure',
  description: 'Pancha Pandava: Autonomous Five-Agent Multi-Tenant Physical Verification & Financial Audit Pipeline.',
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
          href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400..700;1,9..40,400..700&family=Plus+Jakarta+Sans:wght@500;600;700;800&family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=Instrument+Serif:ital@1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="relative flex flex-col min-h-screen antialiased text-slate-900 bg-white">
        <BackgroundShader />
        <ThemeToggle />
        <UniversalHeader />
        
        <main className="flex-1 w-full mx-auto relative z-10">
          {children}
        </main>

        {/* Soft Neumorphic Footer */}
        <footer className="mt-auto px-4 sm:px-6 lg:px-8 pb-6 pt-10 relative z-10">
          <div className="max-w-7xl mx-auto rounded-[32px] neu-pressed p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-700">Pod 8 Multi-Agent Architecture</span>
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
