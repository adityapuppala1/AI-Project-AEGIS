"use client";

import { Languages } from "lucide-react";
import { useId } from "react";
import { isLang, LANGUAGES } from "../lib/translations";
import { useLanguage } from "./language-provider";

export function LanguageSwitcher() {
  const { lang, setLang, t } = useLanguage();
  const id = useId();
  return <div className="flex items-center gap-1.5">
    <Languages size={16} aria-hidden="true" className="hidden text-muted sm:block"/>
    <label htmlFor={id} className="sr-only">{t("Language")}</label>
    <select id={id} className="field !h-10 !w-auto !py-0 text-xs max-sm:!h-11" value={lang}
      onChange={event => { if (isLang(event.target.value)) setLang(event.target.value); }}>
      {LANGUAGES.map(item => <option key={item.code} value={item.code} lang={item.code}>{item.native}</option>)}
    </select>
  </div>;
}
