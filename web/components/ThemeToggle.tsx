'use client';

import { useState, useEffect } from 'react';
import { Sun, Moon } from 'lucide-react';

export default function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (saved === 'dark' || (!saved && prefersDark)) {
      setIsDark(true);
      document.documentElement.classList.add('dark');
    } else {
      setIsDark(false);
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const toggle = () => {
    if (isDark) {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
      setIsDark(false);
    } else {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
      setIsDark(true);
    }
  };

  return (
    <button
      onClick={toggle}
      title="Toggle Light / Dark Mode"
      aria-label="Toggle Light / Dark Mode"
      className="w-10 h-10 rounded-2xl neu-flat hover:neu-flat-hover flex items-center justify-center text-slate-700 dark:text-slate-200 transition-all cursor-pointer"
    >
      {isDark ? (
        <Sun className="w-4 h-4 stroke-[2.2] text-[#6BFF86]" />
      ) : (
        <Moon className="w-4 h-4 stroke-[2.2] text-[#773C30]" />
      )}
    </button>
  );
}
