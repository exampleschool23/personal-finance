import {WebAppRegistration} from "@/components/web-app-registration";
import type { Metadata } from "next";
import "./globals.css";
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
      <body className="antialiased"><ThemeProvider>{children}<WebAppRegistration/></ThemeProvider></body>
    </html>
  );
}
