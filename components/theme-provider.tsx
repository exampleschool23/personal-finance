"use client";

import { ThemeProvider as NextThemeProvider, useTheme } from 'next-themes';
import { Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return <NextThemeProvider attribute="data-theme" defaultTheme="dark" enableSystem={false} storageKey="hoggish-theme" disableTransitionOnChange>{children}</NextThemeProvider>;
}

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return <Button variant="outline" size="icon" className="theme-toggle" aria-label="Toggle light and dark mode" title="Toggle light and dark mode" onClick={() => setTheme(resolvedTheme === 'light' ? 'dark' : 'light')}><Sun className="theme-sun" size={18}/><Moon className="theme-moon" size={18}/></Button>;
}
