import {WebAppRegistration} from "@/components/web-app-registration";
import { ErrorReporter } from "@/components/error-reporter";
import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/onest";
import { fontBootScript } from "@/lib/fonts";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { headers } from "next/headers";
import { acceptedLanguages, detectLanguage, directionOf } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Hoggish Finance",
  manifest: "/manifest.webmanifest",
  appleWebApp: {capable:true,title:"Hoggish Finance"},
  description: "Accounts, spending, budgets, goals and investments in one clear view. Thirty languages, your currencies, no ads.",
  openGraph: { type: "website", siteName: "Hoggish Finance", title: "Hoggish Finance", description: "Accounts, spending, budgets, goals and investments in one clear view." },
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The request's language, so right-to-left pages are laid out that way before any script runs; the language provider updates both after loading.
  const language = detectLanguage(acceptedLanguages((await headers()).get("accept-language")));
  return (
    <html lang={language} dir={directionOf(language)} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: fontBootScript }}/></head>
      <body className="antialiased"><ThemeProvider>{children}<Toaster position="top-center" duration={4000} offset="max(24px, env(safe-area-inset-top))" mobileOffset="max(16px, env(safe-area-inset-top))" /><WebAppRegistration/><ErrorReporter/></ThemeProvider></body>
    </html>
  );
}
