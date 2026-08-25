import { createContext, useContext, useEffect, useMemo, useState } from "react";

type Language = "en" | "ar";
type LanguageContextValue = { language: Language; isArabic: boolean; setLanguage: (language: Language) => void; toggleLanguage: () => void };

const LanguageContext = createContext<LanguageContextValue | null>(null);
const storageKey = "marasi-language";

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => (typeof window !== "undefined" && window.localStorage.getItem(storageKey) === "ar" ? "ar" : "en"));
  const setLanguage = (next: Language) => { setLanguageState(next); if (typeof window !== "undefined") window.localStorage.setItem(storageKey, next); };
  useEffect(() => { document.documentElement.lang = language; document.documentElement.dir = language === "ar" ? "rtl" : "ltr"; }, [language]);
  const value = useMemo(() => ({ language, isArabic: language === "ar", setLanguage, toggleLanguage: () => setLanguage(language === "ar" ? "en" : "ar") }), [language]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value) throw new Error("useLanguage must be used inside LanguageProvider");
  return value;
}

export function LanguageToggle() {
  const { isArabic, toggleLanguage } = useLanguage();
  return <button type="button" onClick={toggleLanguage} aria-label={isArabic ? "Switch to English" : "التبديل إلى العربية"} className="rounded-full border border-black/[.08] bg-white px-3 py-1.5 text-[11px] font-semibold text-body shadow-sm transition hover:border-accent hover:text-accent">{isArabic ? "English" : "عربي"}</button>;
}
