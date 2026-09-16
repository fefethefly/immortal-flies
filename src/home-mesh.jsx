import React, { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import {
  createCreditLedger,
  saveCredit,
  restoreCredit,
  stakeCredit,
} from "./brain/flyswarm/credit.mjs";
import {
  createMesh,
  firstEmptyRegion,
  meshView,
  restoreMesh,
  saveMesh,
} from "./brain/flyswarm/mesh.mjs";
import {
  HOSTING_POLICY,
  createHosting,
  hostFromJoin,
  hostingView,
  restoreHosting,
  saveHosting,
} from "./brain/flyswarm/hosting.mjs";
import { SiteLink } from "./site-chrome.jsx";
import { HomeSwarmField } from "./home-swarm-field.jsx";
import "./home-mesh.css";

const STORAGE = "iff.mesh.demo";
const GUEST_SOUL = "soul-guest";
const GUEST_RUNNER = "paper:guest";

const REGION_COPY = {
  "sensory.food": "public.mesh.food",
  "sensory.threat": "public.mesh.threat",
  "sensory.light": "public.mesh.light",
  "motor.left": "public.mesh.left",
  "motor.right": "public.mesh.right",
  "inter.core": "public.mesh.inter",
};

function count(n) {
  return Number(n || 0).toLocaleString("en-US");
}

function seedDemo() {
  const mesh = createMesh();
  const hosting = createHosting();
  const credit = createCreditLedger();
  const stake = stakeCredit(credit, {
    soulId: GUEST_SOUL,
    amount: HOSTING_POLICY.ifsMin,
    tick: 0,
    priceAt: 1,
  });
  return { mesh, hosting, credit, stakeId: stake.id };
}

function loadDemo() {
  try {
    const raw = sessionStorage.getItem(STORAGE);
    if (!raw) return seedDemo();
    const saved = JSON.parse(raw);
    return {
      mesh: restoreMesh(saved.mesh),
      hosting: restoreHosting(saved.hosting),
      credit: restoreCredit(saved.credit),
      stakeId: saved.stakeId,
    };
  } catch {
    return seedDemo();
  }
}

function persist(state) {
  try {
    sessionStorage.setItem(
      STORAGE,
      JSON.stringify({
        mesh: saveMesh(state.mesh),
        hosting: saveHosting(state.hosting),
        credit: saveCredit(state.credit),
        stakeId: state.stakeId,
      }),
    );
  } catch {
    /* private mode */
  }
}

export function HomeMeshAtlas({ tx }) {
  const [bundle, setBundle] = useState(loadDemo);
  const [error, setError] = useState("");
  const [focusId, setFocusId] = useState(null);
  const view = meshView(bundle.mesh);
  const orders = hostingView(bundle.hosting);
  const guest = view.nodes.find((row) => row.soulId === GUEST_SOUL);
  const joined = Boolean(guest && guest.status !== "OFFLINE");
  const hosting = Boolean(guest && guest.status === "LIVE");
  const empty = firstEmptyRegion(bundle.mesh);

  function host() {
    try {
      setError("");
      hostFromJoin({
        mesh: bundle.mesh,
        hosting: bundle.hosting,
        credit: bundle.credit,
        soulId: GUEST_SOUL,
        runnerPub: GUEST_RUNNER,
        regionId: empty || "inter.core",
        asset: "IFS",
        amount: HOSTING_POLICY.ifsMin,
        stakeId: bundle.stakeId,
        tick: bundle.mesh.tick + 1,
      });
      persist(bundle);
      const next = meshView(bundle.mesh);
      const born = next.nodes.find((row) => row.soulId === GUEST_SOUL);
      setFocusId(born?.id || null);
      setBundle({ ...bundle });
    } catch (err) {
      setError(err.message || String(err));
    }
  }

  return (
    <section className="home-mesh" aria-label={tx("public.mesh.label")} data-reveal="wait">
      <div className="mesh-head">
        <div>
          <p className="mesh-kicker">{tx("public.mesh.kicker")}</p>
          <h2>
            {tx("public.mesh.title")}
            <em>{tx("public.mesh.accent")}</em>
          </h2>
          <p className="mesh-lead">{tx("public.mesh.lead")}</p>
        </div>
        <aside className="mesh-coverage">
          <small>{tx("public.mesh.coverage")}</small>
          <strong>{(view.coverageBps / 100).toFixed(2)}%</strong>
          <span>
            {count(view.hostedNeurons)}
            <i>/</i>
            {count(view.officialNeurons)}
          </span>
        </aside>
      </div>

      <div className="mesh-board">
        <div className="mesh-stage">
          <HomeSwarmField
            view={view}
            focusId={focusId}
            guestNodeId={guest?.id}
            onFocus={setFocusId}
            onHostEmpty={hosting || !empty ? undefined : host}
            label={tx("public.mesh.field")}
          />
          <ol className="mesh-legend">
            {view.regions.map((region, i) => {
              const ratio = region.officialCount
                ? (region.hostedCount / region.officialCount) * 100
                : 0;
              return (
                <li
                  key={region.id}
                  className={`is-${region.status.toLowerCase()}`}
                  style={{ "--i": i }}
                >
                  <small>{String(i + 1).padStart(2, "0")}</small>
                  <span>{tx(REGION_COPY[region.id])}</span>
                  <i>
                    <b style={{ width: `${ratio}%` }} />
                  </i>
                  <em>{tx(`public.mesh.${region.status.toLowerCase()}`)}</em>
                </li>
              );
            })}
          </ol>
        </div>
        <div className="mesh-side">
          <div className="mesh-side-head">
            <span>{tx("public.mesh.nodes")}</span>
            <small>
              {view.nodes.filter((row) => row.status === "LIVE").length} LIVE
            </small>
          </div>
          <ol>
            {view.nodes.map((node) => (
              <li
                key={node.id}
                className={`${node.soulId === GUEST_SOUL ? "is-you" : ""} ${node.id === focusId ? "is-focus" : ""}`}
              >
                <button type="button" onClick={() => setFocusId(node.id)}>
                  <b>{tx(`public.mesh.${node.status.toLowerCase()}`)}</b>
                  <span>{node.runnerPub}</span>
                  <small>
                    {node.shards} {tx("public.mesh.shards")}
                  </small>
                </button>
              </li>
            ))}
          </ol>
          <p className="mesh-order">
            {tx("public.mesh.orders")}
            <strong>{orders.open}</strong>
            <em>SIM</em>
          </p>
        </div>
      </div>

      <div className="mesh-actions">
        <button
          type="button"
          className="mesh-host"
          onClick={host}
          disabled={hosting || !empty}
        >
          {hosting
            ? tx("public.mesh.hosted")
            : joined
              ? tx("public.mesh.hostAgain")
              : tx("public.mesh.host")}
        </button>
        <SiteLink href="/swarm.html" className="mesh-go">
          {tx("public.mesh.toPit")}
          <ArrowUpRight size={14} />
        </SiteLink>
        <SiteLink href="/brain.html" className="mesh-go">
          {tx("public.mesh.toCanon")}
          <ArrowUpRight size={14} />
        </SiteLink>
        <SiteLink href="/economy.html" className="mesh-go">
          {tx("public.mesh.toEcon")}
          <ArrowUpRight size={14} />
        </SiteLink>
      </div>
      {error ? <p className="mesh-error">{error}</p> : null}
      <p className="mesh-note">{tx("public.mesh.note")}</p>
    </section>
  );
}
