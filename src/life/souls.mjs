import { expressPhenotype } from "../brain/flyswarm/phenotype.mjs";
import { soulGenome } from "./identity.mjs";
import { givenNameOf, setGivenName } from "./names.mjs";

export function perchIndex(life, count) {
  const hex = String(life || "").replace(/^0x/i, "");
  if (!/^[0-9a-f]{64}$/i.test(hex) || !count) return 0;
  return Number(BigInt(`0x${hex}`) % BigInt(count));
}

export function decorateSoul(raw, { genesisRoot, chainId, fieldCount }) {
  const generation = Number(raw.generation) || 0;
  const parentSouls = [raw.parentLifeA, raw.parentLifeB].filter(Boolean);
  const genome = soulGenome({
    life: raw.life,
    genesisRoot,
    seed: raw.seed,
    chainId,
    generation,
    parentSouls,
  });
  const given = raw.givenName || givenNameOf(chainId, raw.life);
  return {
    ...raw,
    chainId: chainId || 0,
    generation,
    parentA: Number(raw.parentA) || 0,
    parentB: Number(raw.parentB) || 0,
    genome,
    phenotype: expressPhenotype(genome),
    perch: perchIndex(raw.life, fieldCount || 1),
    givenName: given,
  };
}

async function readLineage(soul, tokenId) {
  if (
    typeof soul.givenName !== "function" ||
    typeof soul.getDescent !== "function"
  ) {
    return { givenName: "", parentA: 0, parentB: 0, generation: 0 };
  }
  try {
    const [givenName, descent] = await Promise.all([
      soul.givenName(tokenId),
      soul.getDescent(tokenId),
    ]);
    return {
      givenName,
      parentA: Number(descent.parentA),
      parentB: Number(descent.parentB),
      generation: Number(descent.generation),
    };
  } catch {
    return { givenName: "", parentA: 0, parentB: 0, generation: 0 };
  }
}

function rememberGiven(chainId, life, given) {
  if (chainId && life && given) setGivenName(chainId, life, given);
}

function withParents(cards) {
  const lives = new Map(cards.map((card) => [card.tokenId, card.life]));
  return cards.map((card) => {
    const parentLifeA = lives.get(card.parentA);
    const parentLifeB = lives.get(card.parentB);
    if (!parentLifeA && !parentLifeB) return card;
    return {
      ...card,
      parentLifeA,
      parentLifeB,
      genome: soulGenome({
        life: card.life,
        genesisRoot: card.genome?.genesisId,
        seed: card.seed,
        chainId: card.chainId,
        generation: card.generation,
        parentSouls: [parentLifeA, parentLifeB].filter(Boolean),
      }),
    };
  });
}

export async function readSoulCard(soul, tokenId, extras = {}) {
  const [owner, life, genome, lineage] = await Promise.all([
    soul.ownerOf(tokenId),
    soul.lifeId(tokenId),
    soul.getGenome(tokenId),
    readLineage(soul, tokenId),
  ]);
  rememberGiven(extras.chainId, life, lineage.givenName);
  return decorateSoul(
    {
      tokenId: Number(tokenId),
      owner,
      life,
      seed: Number(genome.seed),
      bornAt: Number(genome.bornAt),
      bornBlock: Number(genome.bornBlock),
      ...lineage,
    },
    extras,
  );
}

const COLONY_BATCH = 12;

export async function loadColony(
  soul,
  { genesisRoot, chainId, fieldCount } = {},
  onProgress,
) {
  const extras = { genesisRoot, chainId, fieldCount };
  const total = Number(await soul.totalSupply());
  if (!total) return [];
  const cards = [];
  for (let start = 1; start <= total; start += COLONY_BATCH) {
    const ids = [];
    for (
      let id = start;
      id <= Math.min(total, start + COLONY_BATCH - 1);
      id += 1
    ) {
      ids.push(id);
    }
    const rows = await Promise.all(
      ids.map((id) => readSoulCard(soul, id, extras).catch(() => null)),
    );
    cards.push(...rows.filter(Boolean));
    onProgress?.(Math.min(start + COLONY_BATCH - 1, total), total);
  }
  return withParents(cards);
}

export function querySoulId(search = "") {
  const id = Number(
    new URLSearchParams(String(search || "").replace(/^\?/, "")).get("soul"),
  );
  return Number.isFinite(id) && id > 0 ? id : 0;
}

export function pickFocusedSoul(
  souls = [],
  { queryId = 0, current = null } = {},
) {
  const wanted = Number(queryId) || 0;
  if (wanted) {
    const hit = souls.find((item) => item.tokenId === wanted);
    if (hit) return hit;
    if (current?.tokenId === wanted) return current;
    return null;
  }
  if (current) {
    return souls.find((item) => item.tokenId === current.tokenId) || current;
  }
  return souls[0] || null;
}

export function mergeSoul(list, card) {
  if (!card) return list;
  return [...list.filter((item) => item.tokenId !== card.tokenId), card].sort(
    (a, b) => a.tokenId - b.tokenId,
  );
}

export async function loadSoulFamily(soul, tokenId, extras = {}) {
  const card = await readSoulCard(soul, tokenId, extras);
  const ids = [card.parentA, card.parentB].filter((id) => id > 0);
  const parents = [];
  for (const id of ids) {
    try {
      parents.push(await readSoulCard(soul, id, extras));
    } catch {
      /* parent unread */
    }
  }
  return withParents([card, ...parents]);
}

export async function hydrateColony(
  soul,
  extras = {},
  taggedId = 0,
  onProgress,
) {
  let roster = [];
  let colonyFailed = false;
  try {
    roster = await loadColony(soul, extras, onProgress);
  } catch {
    colonyFailed = true;
  }
  if (taggedId && !roster.some((item) => item.tokenId === taggedId)) {
    try {
      const family = await loadSoulFamily(soul, taggedId, extras);
      for (const card of family) roster = mergeSoul(roster, card);
    } catch {
      /* tagged unread */
    }
  }
  return {
    roster,
    rosterError: colonyFailed && roster.length === 0,
  };
}

export function shortAddr(value) {
  const text = String(value || "");
  return text.length > 12 ? `${text.slice(0, 6)}…${text.slice(-4)}` : text;
}
