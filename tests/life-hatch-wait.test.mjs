import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { t } from "../src/i18n.mjs";
import {
  habitatShowsHatch,
  hatchActionKey,
  hatchBlocksLeft,
  hatchWaitFilled,
  hatchWaitStage,
} from "../src/life/hatch-wait.mjs";

const pending = { requestId: 4, entropyBlock: 100 };

test("hatch wait counts remaining blocks until the entropy hash is readable", () => {
  assert.equal(hatchBlocksLeft(null, 90), 0);
  assert.equal(hatchBlocksLeft(pending, 0), null);
  assert.equal(hatchBlocksLeft(pending, 98), 3);
  assert.equal(hatchBlocksLeft(pending, 99), 2);
  assert.equal(hatchBlocksLeft(pending, 100), 1);
  assert.equal(hatchBlocksLeft(pending, 101), 0);
  assert.equal(hatchWaitFilled(null), 0);
  assert.equal(hatchWaitFilled(3), 0);
  assert.equal(hatchWaitFilled(2), 1);
  assert.equal(hatchWaitFilled(1), 2);
  assert.equal(hatchWaitFilled(0), 3);
});

test("hatch wait stage follows sign, wait, second prompt, retry, expire", () => {
  assert.equal(
    hatchWaitStage({ busy: false, pending: null, phase: "none" }),
    "",
  );
  assert.equal(
    hatchWaitStage({ busy: true, pending: null, phase: "none" }),
    "sign1",
  );
  assert.equal(hatchWaitStage({ busy: false, pending, phase: "wait" }), "wait");
  assert.equal(
    hatchWaitStage({ busy: true, pending, phase: "ready" }),
    "sign2",
  );
  assert.equal(
    hatchWaitStage({ busy: false, pending, phase: "ready" }),
    "sign2",
  );
  assert.equal(
    hatchWaitStage({
      busy: false,
      pending,
      phase: "ready",
      needRetry: true,
    }),
    "retry",
  );
  assert.equal(
    hatchWaitStage({ busy: false, pending, phase: "expired" }),
    "expired",
  );
  assert.equal(hatchActionKey(""), "hatch.request");
  assert.equal(hatchActionKey("sign1"), "hatch.signingRequestAction");
  assert.equal(hatchActionKey("wait"), "hatch.waitingAction");
  assert.equal(hatchActionKey("sign2"), "hatch.signingCompleteAction");
});

test("hatch wait copy is paired and tells the user not to click again", () => {
  const keys = [
    "hatch.signingRequest",
    "hatch.signingRequestLead",
    "hatch.waitingTitle",
    "hatch.waitingLead",
    "hatch.waitingBlocks",
    "hatch.waitingUnknown",
    "hatch.signingComplete",
    "hatch.signingCompleteLead",
    "hatch.retryTitle",
    "hatch.expiredTitle",
    "hatch.expiredLead",
    "hatch.stepWait",
    "hatch.stepFinish",
    "hatch.signingRequestAction",
    "hatch.waitingAction",
    "hatch.signingCompleteAction",
  ];
  for (const key of keys) {
    assert.notEqual(t("en", key), key);
    assert.notEqual(t("zh", key), key);
  }
  assert.match(t("zh", "hatch.waitingLead"), /不用再点/);
  assert.match(t("zh", "hatch.waitingBlocks", { n: 2 }), /还差 2/);
  assert.match(t("en", "hatch.waitingBlocks", { n: 2 }), /2 blocks left/);
  assert.match(t("zh", "hatch.signingCompleteLead"), /不要点拒绝/);
});

test("habitat hatch stays available until used, and while a request is open", () => {
  assert.equal(habitatShowsHatch({ used: false }), true);
  assert.equal(habitatShowsHatch({ used: true }), false);
  assert.equal(habitatShowsHatch({ used: true, pending }), true);
  assert.equal(habitatShowsHatch({ used: true, hatchStage: "wait" }), true);
  assert.equal(habitatShowsHatch({ used: true, needRetry: true }), true);
});

test("hatch wait jsx imports React so the classic runtime does not black the page", () => {
  const src = readFileSync(
    new URL("../src/life/hatch-wait.jsx", import.meta.url),
    "utf8",
  );
  assert.match(src, /import React from "react"/);
});
