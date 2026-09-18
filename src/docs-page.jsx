import React, { useEffect, useMemo, useState } from "react";
import { BookOpen, Download, FlaskConical, Landmark } from "lucide-react";
import { useLocale } from "./use-locale.mjs";
import { SiteLink, SitePage } from "./site-chrome.jsx";
import { renderMarkdown } from "./docs-markdown.mjs";
import "./public.css";
import "./docs.css";

import lifeZh from "../docs/LIFE-PROTOCOL.md?raw";
import lifeEn from "../docs/LIFE-PROTOCOL.en.md?raw";
import testnetZh from "../docs/TESTNET.md?raw";
import testnetEn from "../docs/TESTNET.en.md?raw";
import apiZh from "../docs/API-V1.md?raw";
import apiEn from "../docs/API-V1.en.md?raw";
import replayUrl from "../reports/protocol-replay-smoke-v1.json?url";

const SECTIONS = [
  {
    id: "life-protocol",
    titleKey: "docs.section.life",
    summaryKey: "docs.summary.life",
  },
  {
    id: "economy",
    titleKey: "docs.section.econ",
    summaryKey: "docs.summary.econ",
  },
  {
    id: "testnet",
    titleKey: "docs.section.testnet",
    summaryKey: "docs.summary.testnet",
  },
  { id: "api", titleKey: "docs.section.api", summaryKey: "docs.summary.api" },
  {
    id: "contracts",
    titleKey: "docs.section.contracts",
    summaryKey: "docs.summary.contracts",
  },
  {
    id: "replay",
    titleKey: "docs.section.replay",
    summaryKey: "docs.summary.replay",
  },
];

const SECTION_IDS = SECTIONS.map((s) => s.id);

const TITLE_KEY = Object.fromEntries(SECTIONS.map((s) => [s.id, s.titleKey]));

const GROUPS = [
  { key: "docs.group.protocol", ids: ["life-protocol", "economy"] },
  { key: "docs.group.eng", ids: ["testnet", "api", "contracts"] },
  { key: "docs.group.evidence", ids: ["replay"] },
];

const MD_SOURCES = {
  "life-protocol": { zh: lifeZh, en: lifeEn },
  testnet: { zh: testnetZh, en: testnetEn },
  api: { zh: apiZh, en: apiEn },
};

const MANIFESTS = [
  ["ImmortalSoul", "/contract/life/ImmortalSoul.deployment.json"],
  ["ImmortalSoul (testnet)", "/contract/life/ImmortalSoul.testnet.json"],
  ["SoulMarket", "/contract/life/SoulMarket.deployment.json"],
  ["SoulMarket (testnet)", "/contract/life/SoulMarket.testnet.json"],
  ["MiningHub", "/contract/life/MiningHub.deployment.json"],
  ["MiningHub (testnet)", "/contract/life/MiningHub.testnet.json"],
  ["PrivateRunner", "/contract/life/PrivateRunner.deployment.json"],
  ["PrivateRunner (testnet)", "/contract/life/PrivateRunner.testnet.json"],
];

const explorerFor = (chainId) =>
  chainId === 97
    ? "https://testnet.bscscan.com/address/"
    : "https://bscscan.com/address/";

// Manifest status values are LIVE / BSC_TESTNET / UNDEPLOYED / RETIRED.
// BSC_TESTNET is a live testnet deployment; RETIRED is a superseded pointer.
const normalizeStatus = (raw) => {
  const status = String(raw || "").toLowerCase();
  if (status === "bsc_testnet") return "live";
  return ["live", "retired", "undeployed"].includes(status)
    ? status
    : "pending";
};

function useSection() {
  const fromHash = () => {
    const id = (location.hash || "").replace(/^#/, "");
    return SECTION_IDS.includes(id) ? id : "life-protocol";
  };
  const [active, setActive] = useState(fromHash);
  useEffect(() => {
    const onHash = () => setActive(fromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const select = (id) => (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    if (event.button && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    history.pushState(null, "", `#${id}`);
    setActive(id);
    window.scrollTo(0, 0);
  };
  return [active, select];
}

function ContractsTable({ tx }) {
  const [rows, setRows] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    setRows(null);
    setFailed(false);
    Promise.all(
      [["$IFS", "/token/official.json"], ...MANIFESTS].map(
        async ([name, url]) => {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`${url} ${res.status}`);
          const json = await res.json();
          return { name, url, ...json };
        },
      ),
    )
      .then((next) => alive && setRows(next))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);
  if (failed)
    return <p className="docs-table-note">{tx("docs.contracts.failed")}</p>;
  if (!rows)
    return <p className="docs-table-note">{tx("docs.contracts.loading")}</p>;
  const tokenRow = rows.find((row) => row.schema === "iff.token/1");
  const manifests = rows.filter((row) => row.schema !== "iff.token/1");
  return (
    <div className="docs-table-wrap">
      {tokenRow && (
        <p className="docs-contract-token">
          <strong>{tokenRow.symbol}</strong> {tokenRow.name} ·{" "}
          <a
            href={explorerFor(tokenRow.chainId) + tokenRow.address}
            target="_blank"
            rel="noopener"
          >
            {tokenRow.address}
          </a>{" "}
          ·{" "}
          <a href={tokenRow.url} download>
            {tx("docs.contracts.col.manifest")} ↓
          </a>
        </p>
      )}
      <div className="docs-table">
        <table>
          <thead>
            <tr>
              <th>{tx("docs.contracts.col.name")}</th>
              <th>{tx("docs.contracts.col.network")}</th>
              <th>{tx("docs.contracts.col.status")}</th>
              <th>Address</th>
            </tr>
          </thead>
          <tbody>
            {manifests.map((row) => {
              const status = normalizeStatus(row.status);
              return (
                <tr key={row.name + row.chainId} data-status={status}>
                  <td>
                    <a
                      href={row.url}
                      download
                      title={tx("docs.contracts.col.manifest")}
                    >
                      {row.name}
                    </a>
                  </td>
                  <td>
                    {row.chainId === 97
                      ? tx("docs.contracts.chain.testnet")
                      : row.chainId
                        ? tx("docs.contracts.chain.mainnet")
                        : "—"}
                  </td>
                  <td>
                    <span className={`docs-status is-${status}`}>
                      {tx(`docs.contracts.status.${status}`)}
                    </span>
                  </td>
                  <td className="docs-addr">
                    {row.address ? (
                      <a
                        href={explorerFor(row.chainId) + row.address}
                        target="_blank"
                        rel="noopener"
                      >
                        {row.address}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function useScrollSpy(toc) {
  const [heading, setHeading] = useState("");
  useEffect(() => {
    setHeading("");
    if (!toc.length) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setHeading(entry.target.id);
        }
      },
      { rootMargin: "0px 0px -72% 0px" },
    );
    for (const { id } of toc) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [toc]);
  return heading;
}

const scrollToHeading = (id) => (event) => {
  event.preventDefault();
  event.stopPropagation();
  document
    .getElementById(id)
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
};

export function DocsPage() {
  const [locale, setLocale, tx] = useLocale("meta.docsTitle", "meta.docsDesc");
  const [active, select] = useSection();

  const meta = SECTIONS.find((s) => s.id === active);
  const rendered = useMemo(() => {
    const source = MD_SOURCES[active];
    if (!source) return null;
    return renderMarkdown(locale === "zh" ? source.zh : source.en, {
      lede: tx(meta.summaryKey),
    });
  }, [active, locale, meta, tx]);
  const toc = useMemo(() => {
    if (rendered) return rendered.toc;
    if (active === "economy")
      return [{ level: 2, id: "economy-model", text: tx("docs.section.econ") }];
    if (active === "contracts")
      return [
        { level: 2, id: "deployments", text: tx("docs.section.contracts") },
        {
          level: 3,
          id: "official-token",
          text: tx("docs.contracts.tokenTitle"),
        },
        {
          level: 3,
          id: "life-manifests",
          text: tx("docs.contracts.manifestsTitle"),
        },
      ];
    if (active === "replay")
      return [
        { level: 2, id: "replay-packets", text: tx("docs.section.replay") },
        { level: 3, id: "protocol-lab", text: tx("docs.replay.lab") },
        { level: 3, id: "replay-bundle", text: tx("docs.replay.bundle") },
        { level: 3, id: "verify", text: tx("docs.replay.verify") },
      ];
    return [];
  }, [rendered, active, locale, tx]);

  const currentHeading = useScrollSpy(toc);

  return (
    <SitePage
      className="home docs"
      locale={locale}
      setLocale={setLocale}
      tx={tx}
      current="docs"
    >
      <main className="docs-main">
        <header className="docs-hero">
          <p className="kicker">{tx("nav.docs")}</p>
          <h1>{tx("docs.h1")}</h1>
          <p className="docs-hero-lead">{tx("docs.lead")}</p>
          <p className="docs-hero-lead">
            <a href="https://github.com/fefethefly/immortal-flies/blob/main/docs/README.md">
              {tx("docs.catalog")}
            </a>
          </p>
        </header>

        <div className="docs-grid">
          <aside className="docs-side">
            {GROUPS.map((group) => (
              <div key={group.key} className="docs-group">
                <span className="docs-group-title">{tx(group.key)}</span>
                {group.ids.map((id) => (
                  <a
                    key={id}
                    href={`#${id}`}
                    className={id === active ? "is-on" : ""}
                    aria-current={id === active ? "true" : undefined}
                    onClick={select(id)}
                  >
                    {tx(TITLE_KEY[id])}
                  </a>
                ))}
              </div>
            ))}
          </aside>

          <article id={active} className="docs-article">
            {rendered ? (
              <div
                className="docs-md"
                dangerouslySetInnerHTML={{ __html: rendered.html }}
              />
            ) : active === "economy" ? (
              <section>
                <h2 id="economy-model">{tx("docs.section.econ")}</h2>
                <p className="docs-lede">{tx("docs.summary.econ")}</p>
                <p className="docs-formula">
                  <code>R − C = N</code> · <code>T = min(max(N, 0), gap)</code>{" "}
                  · <code>D = max(N − T, 0)</code>
                </p>
                <p className="docs-card-cta">
                  <SiteLink className="docs-go" href="/economy.html">
                    <Landmark size={16} />
                    {tx("docs.econ.go")} →
                  </SiteLink>
                </p>
              </section>
            ) : active === "contracts" ? (
              <section>
                <h2 id="deployments">{tx("docs.section.contracts")}</h2>
                <p className="docs-lede">{tx("docs.summary.contracts")}</p>
                <p>{tx("docs.contracts.lead")}</p>
                <h3 id="official-token">{tx("docs.contracts.tokenTitle")}</h3>
                <h3 id="life-manifests">
                  {tx("docs.contracts.manifestsTitle")}
                </h3>
                <ContractsTable tx={tx} />
              </section>
            ) : (
              <section>
                <h2 id="replay-packets">{tx("docs.section.replay")}</h2>
                <p className="docs-lede">{tx("docs.summary.replay")}</p>
                <p>{tx("docs.replay.lead")}</p>
                <div className="docs-cards">
                  <article className="docs-card">
                    <h3 id="protocol-lab">
                      <FlaskConical size={16} />
                      {tx("docs.replay.lab")}
                    </h3>
                    <p>{tx("docs.replay.labP")}</p>
                    <SiteLink className="docs-go" href="/protocol.html">
                      {tx("nav.protocol")} →
                    </SiteLink>
                  </article>
                  <article className="docs-card">
                    <h3 id="replay-bundle">
                      <Download size={16} />
                      {tx("docs.replay.bundle")}
                    </h3>
                    <p>{tx("docs.replay.bundleP")}</p>
                    <a className="docs-go" href={replayUrl} download>
                      {tx("docs.replay.bundle")} ↓
                    </a>
                  </article>
                </div>
                <h3 id="verify">{tx("docs.replay.verify")}</h3>
                <pre data-lang="sh">
                  <code>node scripts/protocol-replay.mjs verify</code>
                </pre>
                <p className="docs-aside">{tx("docs.replay.more")}</p>
              </section>
            )}
          </article>

          <aside className="docs-toc">
            <span className="docs-group-title">{tx("docs.tocTitle")}</span>
            {toc.map((heading) => (
              <a
                key={heading.id}
                href={`#${heading.id}`}
                data-level={heading.level}
                className={heading.id === currentHeading ? "is-on" : ""}
                onClick={scrollToHeading(heading.id)}
              >
                {heading.text}
              </a>
            ))}
          </aside>
        </div>

        <p className="docs-foot">
          <BookOpen size={14} />
          {tx("docs.foot")}
        </p>
      </main>
    </SitePage>
  );
}
