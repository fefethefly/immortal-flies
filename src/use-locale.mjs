import { useEffect, useState } from "react";
import { applyDocument, readLocale, t, writeLocale } from "./i18n.mjs";

export function useLocale(titleKey, descKey) {
  const [locale, setLocale] = useState(readLocale);
  useEffect(() => {
    applyDocument(locale, titleKey ? t(locale, titleKey) : undefined);
    const meta = document.querySelector('meta[name="description"]');
    if (meta && descKey) meta.setAttribute("content", t(locale, descKey));
  }, [locale, titleKey, descKey]);
  return [
    locale,
    (next) => {
      setLocale(writeLocale(next));
    },
    (key, vars) => t(locale, key, vars),
  ];
}
