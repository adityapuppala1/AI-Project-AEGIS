import type { Metadata } from "next";
import { headers } from "next/headers";
import "maplibre-gl/dist/maplibre-gl.css";
import "@fontsource-variable/anek-latin/wdth.css";
import "./globals.css";
import { ThemeProvider } from "../components/theme-provider";
import { LanguageProvider } from "../components/language-provider";
import { SessionProvider } from "../components/session-provider";

export const metadata: Metadata = {
  title: { default: "AEGIS | Command Center", template: "%s | AEGIS" },
  description: "AEGIS exercise-only disaster intelligence and multi-agency command center",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Per-request nonce from middleware.ts. Reading it also makes every page render per request, which the nonce needs.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-canvas font-sans text-ink antialiased">
        <ThemeProvider nonce={nonce}><LanguageProvider><SessionProvider>{children}</SessionProvider></LanguageProvider></ThemeProvider>
      </body>
    </html>
  );
}
