'use client';

import { useState, useEffect } from 'react';
import { getTheme, toggleTheme, type Theme } from '@/lib/theme';

/**
 * Binary dark/light theme toggle.
 * Renders as a compact button for use in topbars.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    setTheme(getTheme());
  }, []);

  const handleToggle = () => {
    const next = toggleTheme();
    setTheme(next);
  };

  return (
    <button
      onClick={handleToggle}
      className="rq-theme-toggle"
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
    >
      {theme === 'dark' ? '☀' : '☾'}
    </button>
  );
}
