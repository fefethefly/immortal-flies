import { createContext, useContext } from "react";
import { DEFAULT_LOCALE, t } from "./i18n.mjs";

export const LocaleContext = createContext({
  locale: DEFAULT_LOCALE,
  tx: (key, vars) => t(DEFAULT_LOCALE, key, vars),
});

export function useTx() {
  return useContext(LocaleContext).tx;
}
