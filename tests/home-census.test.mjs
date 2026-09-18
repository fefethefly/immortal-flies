import test from "node:test";
import assert from "node:assert/strict";
import { t } from "../src/i18n.mjs";

test("homepage census uses the published MaleCNS count", () => {
  assert.match(t("en", "home.crossLead"), /166,691/);
  assert.match(t("zh", "home.crossLead"), /166,691/);
  assert.match(t("en", "public.censusKicker"), /Fig\. 1/);
  assert.match(t("zh", "public.censusKicker"), /图 1/);
  assert.match(
    t("en", "public.censusNote"),
    /do not call this swarm intelligence/i,
  );
  assert.match(t("zh", "public.censusNote"), /不把这称作已经实现的群体智能/);
  for (const locale of ["en", "zh"]) {
    assert.doesNotMatch(t(locale, "public.censusNote"), /\bT3\b|\bT4\b/);
    assert.notEqual(t(locale, "public.censusWorld"), "public.censusWorld");
  }
});
