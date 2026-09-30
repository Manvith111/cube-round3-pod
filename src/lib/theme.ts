/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * useTheme — Light / Dark theme toggle with localStorage persistence.
 * Sets data-theme="dark"|"light" on <html> so CSS vars auto-switch.
 */
import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'dockproof_theme';

function applyTheme(dark: boolean) {
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
}

export function useTheme() {
  const [isDark, setIsDark] = useState<boolean>(() => {
    // Prefer saved preference, fall back to OS preference
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return saved === 'dark';
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  });

  // Apply on mount and whenever isDark changes
  useEffect(() => {
    applyTheme(isDark);
    localStorage.setItem(STORAGE_KEY, isDark ? 'dark' : 'light');
  }, [isDark]);

  const toggleTheme = useCallback(() => setIsDark(d => !d), []);

  return { isDark, toggleTheme };
}
