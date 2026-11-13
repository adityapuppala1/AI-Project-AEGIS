"use client";

// Current brand for the whole app (docs/BRANDING.md). The layout passes the brand it read on the server; the
// provider refreshes it once from /api/brand and after an administrator saves. A failed read keeps the defaults.
// The configured name reaches the screen only through the translation hook (useT), <BrandName /> and useBrand().text
// on reviewed interface strings. Nothing rewrites the page: record content, notes, audit lines, CAP text and anything
// fetched from the API are shown exactly as they are.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_BRAND, brandLogoUrl, brandText, parseBrand, type Brand } from "../lib/brand";

interface BrandValue { brand: Brand; refresh: () => Promise<void>; text: (value: string) => string; name: string }
const BrandContext = createContext<BrandValue>({ brand: DEFAULT_BRAND, refresh: async () => undefined, text: value => value, name: DEFAULT_BRAND.name });

export function BrandProvider({ initial, children }: Readonly<{ initial?: Brand; children: ReactNode }>) {
  const [brand, setBrand] = useState<Brand>(initial ?? DEFAULT_BRAND);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/brand", { cache: "no-store" });
      if (response.ok) setBrand(parseBrand(await response.json()));
    } catch { /* keep the brand already shown */ }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const url = brandLogoUrl(brand);
    let link = document.querySelector<HTMLLinkElement>("link[data-brand-icon]");
    if (!url) { link?.remove(); return; }
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      link.setAttribute("data-brand-icon", "");
      document.head.appendChild(link);
    }
    link.href = url;
  }, [brand]);
  const value = useMemo(() => ({ brand, refresh, name: brand.name, text: (input: string) => brandText(input, brand.name) }), [brand, refresh]);
  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}

export const useBrand = () => useContext(BrandContext);
