import {WebAppRegistration} from "@/components/web-app-registration";
import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: "Hoggish Finance",
  manifest: "/manifest.webmanifest",
  appleWebApp: {capable:true,title:"Hoggish Finance"},
  description: "Your personal finance workspace.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased"><ThemeProvider>{children}<Toaster position="top-center" duration={4000} offset="max(24px, env(safe-area-inset-top))" mobileOffset="max(16px, env(safe-area-inset-top))" /><WebAppRegistration/></ThemeProvider></body>
    </html>
  );
}
