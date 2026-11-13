"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { isLang, translate, TRANSLATION_ENTRIES, type Lang } from "../lib/translations";
import { PENDING_NATIVE_REVIEW } from "../lib/translations-pending";
import { brandText } from "../lib/brand";
import { useBrand } from "./brand-provider";

const STORAGE_KEY = "aegis-language";
const INTERFACE_TEXT: ReadonlySet<string> = new Set([...TRANSLATION_ENTRIES.map(entry => entry[0]), ...PENDING_NATIVE_REVIEW]);

interface LanguageValue { lang: Lang; setLang: (lang: Lang) => void; t: (text: string) => string }
const LanguageContext = createContext<LanguageValue>({ lang: "en", setLang: () => undefined, t: text => text });

/** Per-browser language preference. Falls back to English and keeps working when storage is blocked. */
export function LanguageProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [lang, setLangState] = useState<Lang>("en");
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (isLang(stored)) setLangState(stored);
    } catch { /* storage unavailable: stay in English */ }
  }, []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* preference simply is not remembered */ }
  }, []);
  // The configured brand name replaces the default one at render time, single pass, plain text, and only in reviewed
  // interface strings (the translation table or the pending-review register). Record content passed through t()
  // is never rewritten. A no-op when the brand is unchanged.
  const { brand } = useBrand();
  const value = useMemo(() => ({ lang, setLang, t: (text: string) => {
    const out = translate(lang, text);
    return INTERFACE_TEXT.has(text) ? brandText(out, brand.name) : out;
  } }), [lang, setLang, brand.name]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export const useLanguage = () => useContext(LanguageContext);
export const useT = () => useContext(LanguageContext).t;
