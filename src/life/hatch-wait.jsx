import {
  HATCH_WAIT_TICKS,
  hatchBlocksLeft,
  hatchWaitFilled,
} from "./hatch-wait.mjs";
import "./hatch-wait.css";

const TITLE = {
  sign1: "hatch.signingRequest",
  wait: "hatch.waitingTitle",
  sign2: "hatch.signingComplete",
  retry: "hatch.retryTitle",
  expired: "hatch.expiredTitle",
};

const LEAD = {
  sign1: "hatch.signingRequestLead",
  wait: "hatch.waitingLead",
  sign2: "hatch.signingCompleteLead",
  retry: "hatch.autoRetry",
  expired: "hatch.expiredLead",
};

export function HatchWait({ stage, pending, blockNow, compact, tx }) {
  if (!stage) return null;
  const left = hatchBlocksLeft(pending, blockNow);
  const filled = hatchWaitFilled(left);
  const vars = pending
    ? { id: pending.requestId, deadline: pending.entropyBlock + 256 }
    : {};
  const step =
    stage === "sign2" || stage === "retry"
      ? "hatch.stepFinish"
      : "hatch.stepWait";
  return (
    <div
      className={`hatch-wait${compact ? " is-compact" : ""}`}
      data-stage={stage}
      role="status"
      aria-live="polite"
    >
      <span className="hatch-wait-kicker">{tx(step)}</span>
      <p className="hatch-wait-title">{tx(TITLE[stage], vars)}</p>
      <p className="hatch-wait-lead">{tx(LEAD[stage], vars)}</p>
      {stage === "wait" ? (
        <>
          <div className="hatch-wait-track" aria-hidden="true">
            {Array.from({ length: HATCH_WAIT_TICKS }, (_, index) => {
              const on = index < filled;
              const now = left == null ? index === 0 : !on && index === filled;
              return (
                <i
                  key={index}
                  className={`hatch-wait-tick${on ? " is-on" : ""}${now ? " is-now" : ""}`}
                />
              );
            })}
          </div>
          <p className="hatch-wait-count">
            {left == null
              ? tx("hatch.waitingUnknown")
              : tx("hatch.waitingBlocks", { n: left })}
          </p>
        </>
      ) : null}
    </div>
  );
}
