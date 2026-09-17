import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { t } from "../i18n.mjs";
import { decorateSoul } from "./souls.mjs";
import { describeBirth } from "./birth-card.mjs";
import { renderBirthPng } from "./birth-card-draw.mjs";
import { BirthCardDialog } from "./birth-card.jsx";
import "./birth-card.css";

const ROOT = `0x${"ab".repeat(32)}`;

function soul(tokenId, seed, extra = {}) {
  return decorateSoul(
    {
      tokenId,
      owner: "0x1111111111111111111111111111111111111111",
      life: `0x${tokenId.toString(16).padStart(2, "0")}${"cd".repeat(31)}`,
      seed,
      givenName: extra.givenName,
      parentA: extra.parentA || 0,
      parentB: extra.parentB || 0,
      generation: extra.generation || 0,
    },
    { genesisRoot: ROOT, chainId: 97, fieldCount: 12 },
  );
}

function Plate({ card, label }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    renderBirthPng(card, ref.current).catch(() => {});
  }, [card]);
  return (
    <figure className="plate-figure">
      <canvas ref={ref} className="birth-card" width={1400} height={1400} />
      <figcaption>{label}</figcaption>
    </figure>
  );
}

function Preview() {
  const locale = "en";
  const tx = (key, vars) => t(locale, key, vars);
  const [dialog, setDialog] = useState(
    () => new URLSearchParams(window.location.search).get("dialog") === "1",
  );
  const gen0 = soul(1, 1963528436, { givenName: "Wrenen" });
  const a = soul(2, 43, { givenName: "Sunny" });
  const b = soul(3, 99, { givenName: "Cora" });
  const child = soul(4, 77, {
    givenName: "Pip",
    parentA: 2,
    parentB: 3,
    generation: 2,
  });
  const rose = soul(12, 1927, { givenName: "Wrenen" });
  const cards = [
    [
      describeBirth(rose, [rose], {
        locale,
        origin: "https://immortalflies.example",
        tx,
      }),
      "Gen0 · wine · white-eyed · petite",
    ],
    [
      describeBirth(gen0, [gen0], {
        locale,
        origin: "https://immortalflies.example",
        tx,
      }),
      "Gen0 · seed 1963528436",
    ],
    [
      describeBirth(child, [a, b, child], {
        locale,
        origin: "https://immortalflies.example",
        tx,
      }),
      "Gen2 · bred",
    ],
  ];
  return (
    <main className="plate-preview">
      {dialog ? (
        <BirthCardDialog
          soul={rose}
          souls={[rose]}
          locale={locale}
          tx={tx}
          onClose={() => setDialog(false)}
        />
      ) : (
        <>
          <div className="birth-stage plate-hero">
            <p className="birth-lead">{cards[0][0].lead}</p>
            <Plate card={cards[0][0]} label={cards[0][1]} />
          </div>
          <div className="plate-row">
            {cards.slice(1).map(([card, label]) => (
              <Plate key={label} card={card} label={label} />
            ))}
          </div>
        </>
      )}
    </main>
  );
}

const css = document.createElement("style");
css.textContent = `
  .plate-preview { padding: 36px 24px 80px; }
  .plate-hero {
    width: min(680px, 100%);
    margin: 0 auto 36px;
  }
  .plate-row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 320px));
    justify-content: center;
    gap: 28px;
  }
  .plate-figure { margin: 0; }
  .plate-figure figcaption {
    margin-top: 12px;
    color: #8a8172;
    font: 11px/1.4 "IBM Plex Mono", monospace;
    letter-spacing: 0.04em;
  }
  @media (max-width: 1100px) {
    .plate-row { grid-template-columns: minmax(0, 320px); }
  }
`;
document.head.appendChild(css);

createRoot(document.getElementById("root")).render(<Preview />);
