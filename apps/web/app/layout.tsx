import type { Metadata } from "next";
import { headers } from "next/headers";
import "maplibre-gl/dist/maplibre-gl.css";
import "@fontsource-variable/anek-latin/wdth.css";
import "./globals.css";
import { ThemeProvider } from "../components/theme-provider";
import { LanguageProvider } from "../components/language-provider";
import { SessionProvider } from "../components/session-provider";
import { BrandProvider } from "../components/brand-provider";
import { fetchBrand } from "../lib/brand-proxy";
import { brandLogoUrl } from "../lib/brand";

// The product name comes from the brand settings (docs/BRANDING.md); a failed read uses the default, IndTrana.
export async function generateMetadata(): Promise<Metadata> {
  const brand = await fetchBrand();
  const logo = brandLogoUrl(brand);
  return {
    title: { default: `${brand.name} | Command Center`, template: `%s | ${brand.name}` },
    description: `${brand.name} exercise-only disaster intelligence and multi-agency command center`,
    ...(logo ? { icons: { icon: logo } } : {}),
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Per-request nonce from middleware.ts. Reading it also makes every page render per request, which the nonce needs.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const brand = await fetchBrand();
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-canvas font-sans text-ink antialiased">
        <ThemeProvider nonce={nonce}><BrandProvider initial={brand}><LanguageProvider><SessionProvider>{children}</SessionProvider></LanguageProvider></BrandProvider></ThemeProvider>
      </body>
    </html>
  );
}
