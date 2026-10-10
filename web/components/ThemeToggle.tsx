'use client';

import React, { useEffect, useState } from 'react';
import { PullCord } from 'pullcord';
import 'pullcord/pullcord.css';

export default function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setMounted(true);
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

  const handlePull = () => {
    setIsDark((prev) => {
      const next = !prev;
      if (next) {
        document.documentElement.classList.add('dark');
        localStorage.setItem('theme', 'dark');
      } else {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('theme', 'light');
      }
      return next;
    });
  };

  if (!mounted) {
    return null;
  }

  return (
    <PullCord
      onPull={handlePull}
      pulled={isDark}
      ariaLabel="Toggle Light / Dark Mode"
      config={{
        gravity: 1250,   // hang tension / fall speed
        damping: 0.94,   // snappier retract
        iterations: 20,  // rope stiffness
        stretchMax: 26,  // pull travel past rest
      }}
    />
  );
}
