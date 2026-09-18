import React, { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { FlyMark } from "./vitruvian.jsx";
import { createSwarm, formatBnb, formatPrice, summarize, tickSwarm } from "./swarm.mjs";
import { useTx } from "./locale-context.jsx";

export function SwarmTape() {
  const tx = useTx();
  const [swarm, setSwarm] = useState(() => createSwarm({ seed: 20260915, size: 5, cullEvery: 180 }));
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) setSwarm((current) => tickSwarm(current));
    }, 1000);
    return () => clearInterval(id);
  }, []);
  const stats = summarize(swarm);
  const last = swarm.trades[0];
  const champ = stats.board.find((row) => row.status === "alive");
  return (
    <section className="swarm-tape" aria-label={tx("tape.aria")}>
      <div className="swarm-tape-copy">
        <small>THE PIT / PAPER</small>
        <strong>{tx("tape.title")}</strong>
        <p>{tx("tape.body")}</p>
      </div>
      <div className="tape-seals" aria-hidden="true">
        {stats.board
          .filter((row) => row.status === "alive")
          .slice(0, 5)
          .map((row) => (
            <span key={row.id} className={row.id === champ?.id ? "lead" : ""}>
              <FlyMark small inherit />
              #{row.id}
            </span>
          ))}
      </div>
      <dl>
        <div>
          <dt>PRICE</dt>
          <dd>{formatPrice(stats.price)}</dd>
        </div>
        <div>
          <dt>LAST REFLEX</dt>
          <dd>
            {last
              ? `${last.side} #${last.flyId} · ${last.side === "BUY" ? `${formatBnb(last.amount)} BNB` : "SELL"}`
              : tx("tape.noFill")}
          </dd>
        </div>
      </dl>
      <a href="/swarm.html">
        {tx("tape.enter")}
        <ArrowUpRight size={15} />
      </a>
    </section>
  );
}
