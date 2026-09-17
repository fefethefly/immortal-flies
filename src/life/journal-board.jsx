import React from "react";
import { journalView } from "./journal.mjs";

export function JournalBoard({
  tx,
  record,
  replay,
  unread,
  loading,
  busy,
  canWrite,
  onSeal,
  onDownload,
}) {
  const head = record?.head;
  const known = record?.inputs?.length || 0;
  const view = journalView(head, replay?.status || "idle", known, loading);
  const last = record?.inputs?.at(-1);
  const lastLabel = last
    ? `${tx(`life.stim.${last.kind}`)} · ${last.intensity}`
    : head?.inputCount
      ? tx("life.journal.lastMiss")
      : tx("life.journal.none");

  return (
    <section className="life-journal" aria-label={tx("life.journal.title")}>
      <h3>{tx("life.journal.title")}</h3>
      <p className="life-note">{tx("life.journal.lead")}</p>
      {unread ? <p className="life-note">{tx("life.journal.unread")}</p> : null}
      <dl>
        <div>
          <dt>{tx("life.journal.chain")}</dt>
          <dd data-state={view.chain}>
            {view.chain === "recorded"
              ? tx("life.journal.inputs", { n: head.inputCount })
              : view.chain === "loading"
                ? tx("life.journal.loading")
                : tx("life.journal.empty")}
          </dd>
          <dd>{tx("life.journal.last", { value: lastLabel })}</dd>
          {view.pendingInputs ? (
            <dd>{tx("life.journal.unsealed", { n: view.pendingInputs })}</dd>
          ) : view.sealed ? (
            <dd>{tx("life.journal.sealed", { n: head.sequence })}</dd>
          ) : null}
        </div>
        <div>
          <dt>{tx("life.journal.replay")}</dt>
          <dd data-state={view.replay}>{tx(`life.journal.${view.replay}`)}</dd>
          <dd>{tx("life.journal.circuit")}</dd>
          <dd>{tx("life.journal.runnerOff")}</dd>
        </div>
      </dl>
      <div className="life-actions">
        <button
          className="ghost"
          disabled={
            busy ||
            !canWrite ||
            !view.pendingInputs ||
            view.replay !== "matched"
          }
          onClick={onSeal}
        >
          {tx("life.journal.seal")}
        </button>
        <button
          className="ghost"
          disabled={busy || !replay?.archive}
          onClick={onDownload}
        >
          {tx("life.journal.download")}
        </button>
      </div>
    </section>
  );
}
