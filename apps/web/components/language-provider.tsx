"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { isLang, translate, type Lang } from "../lib/translations";

const STORAGE_KEY = "aegis-language";

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
  const value = useMemo(() => ({ lang, setLang, t: (text: string) => translate(lang, text) }), [lang, setLang]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export const useLanguage = () => useContext(LanguageContext);
export const useT = () => useContext(LanguageContext).t;
