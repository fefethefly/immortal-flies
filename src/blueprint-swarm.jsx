import React from "react";
import {
  BadgeCheck,
  Eye,
  Fingerprint,
  FlaskConical,
  GitBranch,
  Layers,
  MessageSquare,
  Network,
  Radio,
  Shield,
} from "lucide-react";

const IFACES = [
  ["01", "blue.iface.task", "blue.iface.taskp", FlaskConical],
  ["02", "blue.iface.message", "blue.iface.messagep", MessageSquare],
  ["03", "blue.iface.learn", "blue.iface.learnp", GitBranch],
  ["04", "blue.iface.pool", "blue.iface.poolp", Layers],
  ["05", "blue.iface.identity", "blue.iface.identityp", Fingerprint],
];

const OBJECTS = [
  ["blue.obj.master", "blue.obj.masterp"],
  ["blue.obj.life", "blue.obj.lifep"],
  ["blue.obj.runner", "blue.obj.runnerp"],
  ["blue.obj.node", "blue.obj.nodep"],
  ["blue.obj.swarm", "blue.obj.swarmp"],
];

const VERBS = [
  ["observe", "blue.verb.observep", Eye],
  ["propose", "blue.verb.proposep", Radio],
  ["confirm", "blue.verb.confirmp", BadgeCheck],
  ["outcome", "blue.verb.outcomep", FlaskConical],
  ["claim", "blue.verb.claimp", Shield],
];

const SPLITS = [
  ["blue.split.quorum", "blue.split.quorump", "open"],
  ["blue.split.pool", "blue.split.poolp", "drawn"],
  ["blue.split.mesh", "blue.split.meshp", "open"],
];

const TIERS = ["t0", "t1", "t2", "t3", "t4"];
const STEPS = ["s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7"];
const HONEST = [
  "honest1",
  "honest2",
  "honest3",
  "honest4",
  "honest5",
  "honest6",
];

export function BlueprintSwarm({ tx }) {
  return (
    <section id="swarm" className="blue-swarm" data-reveal>
      <p className="kicker">{tx("blue.swarmKicker")}</p>
      <h2>
        <Network size={18} />
        {tx("blue.swarmTitle")}
      </h2>
      <p className="blue-swarm-lead">{tx("blue.swarmLead")}</p>

      <h3>{tx("blue.swarmIfaces")}</h3>
      <ol className="blue-ifaces">
        {IFACES.map(([no, title, body, Icon]) => (
          <li key={no} className="rite-card">
            <Icon size={18} />
            <small>{no}</small>
            <strong>{tx(title)}</strong>
            <p>{tx(body)}</p>
          </li>
        ))}
      </ol>

      <h3>{tx("blue.swarmObjects")}</h3>
      <ol className="blue-objects">
        {OBJECTS.map(([title, body]) => (
          <li key={title}>
            <strong>{tx(title)}</strong>
            <p>{tx(body)}</p>
          </li>
        ))}
      </ol>
      <p className="blue-mother">{tx("blue.swarmMother")}</p>

      <h3>{tx("blue.swarmVerbs")}</h3>
      <ol className="blue-verbs">
        {VERBS.map(([code, body, Icon]) => (
          <li key={code}>
            <Icon size={16} />
            <code>{code}</code>
            <p>{tx(body)}</p>
          </li>
        ))}
      </ol>

      <h3>{tx("blue.swarmSplit")}</h3>
      <ol className="blue-split">
        {SPLITS.map(([title, body, state]) => (
          <li key={title} data-state={state}>
            <small>{tx(`blue.state.${state === "open" ? "now" : "later"}`)}</small>
            <strong>{tx(title)}</strong>
            <p>{tx(body)}</p>
          </li>
        ))}
      </ol>

      <h3>{tx("blue.swarmTiers")}</h3>
      <ol className="blue-tiers">
        {TIERS.map((id) => (
          <li key={id}>
            <small>{tx(`blue.${id}`)}</small>
            <p>{tx(`blue.${id}p`)}</p>
          </li>
        ))}
      </ol>
      <p className="blue-swarm-note">{tx("blue.swarmTierNote")}</p>

      <h3>{tx("blue.swarmTrack")}</h3>
      <ol className="blue-track">
        {STEPS.map((id) => (
          <li key={id}>{tx(`blue.${id}`)}</li>
        ))}
      </ol>
      <p className="blue-swarm-note">{tx("blue.swarmTrackNote")}</p>

      <h3>{tx("blue.swarmHonest")}</h3>
      <ol className="blue-honest">
        {HONEST.map((id, i) => (
          <li key={id}>
            <small>{String(i + 1).padStart(2, "0")}</small>
            <p>{tx(`blue.${id}`)}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
