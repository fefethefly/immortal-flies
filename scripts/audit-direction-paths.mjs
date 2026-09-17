#!/usr/bin/env node
// Read-only wiring audit; only the CLI report below is written.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { loadGraphFromDir } from "../server/src/shared/graph-fs.mjs";
import { canonical, hash, hashBytes, requireValue } from "../src/brain/codec.mjs";

const LR = ["left", "right"];
const CHANNELS = ["food", "threat", "light"];
const ROOT = new URL("../", import.meta.url);
const REPORT = "reports/direction-paths-v1.json";
const safe = value => {
  requireValue(Number.isSafeInteger(value), "PATH_UNSAFE_INTEGER");
  return value;
};
const index = (value, n) => {
  requireValue(Number.isSafeInteger(value) && value >= 0 && value < n, "PATH_INDEX");
};
function group(values, n) {
  requireValue(Array.isArray(values), "PATH_GROUP");
  for (const value of values) index(value, n);
  requireValue(new Set(values).size === values.length, "PATH_GROUP_DUPLICATE");
  return new Set(values);
}
function validateSides(graph, sides) {
  requireValue(sides && typeof sides === "object" && sides.food, "PATH_SIDES");
  for (const [channel, pair] of Object.entries(sides)) {
    requireValue(CHANNELS.includes(channel) && pair, "PATH_SIDE_CHANNEL");
    const parent = group(graph.metadata.groups[channel], graph.n);
    const left = group(pair.left, graph.n), right = group(pair.right, graph.n);
    requireValue([...left, ...right].every(i => parent.has(i)), "PATH_SIDE_MEMBERSHIP");
    requireValue([...left].every(i => !right.has(i)), "PATH_SIDE_AMBIGUOUS");
  }
}
function validateGraph(graph) {
  requireValue(graph && Number.isSafeInteger(graph.n) && graph.n > 0 &&
    Number.isSafeInteger(graph.e) && graph.e >= 0, "PATH_GRAPH");
  const { n, e, metadata, offsets, targets, weights } = graph;
  requireValue(Array.isArray(metadata?.nodes) && metadata.nodes.length === n &&
    offsets?.length === n + 1 && targets?.length === e && weights?.length === e,
  "PATH_DIMENSIONS");
  requireValue(offsets[0] === 0 && offsets[n] === e, "PATH_OFFSETS");
  for (let i = 0; i < n; i++) {
    requireValue([-1, 0, 1].includes(metadata.nodes[i]?.sign), "PATH_SIGN");
    requireValue(Number.isSafeInteger(offsets[i + 1]) && offsets[i + 1] >= offsets[i] &&
      offsets[i + 1] <= e, "PATH_OFFSETS");
  }
  for (let edge = 0; edge < e; edge++) {
    index(targets[edge], n);
    requireValue(Number.isSafeInteger(weights[edge]) && weights[edge] > 0 &&
      weights[edge] < 1000000, "PATH_WEIGHT");
  }
  for (const name of [...CHANNELS, ...LR]) group(metadata.groups?.[name], n);
}
const intersection = (a, b) => [...a].filter(i => b.has(i)).length;


/**
 * Exact directed edge-walks of length 1 and 2, NOT shortest/simple paths.
 * Repeated nodes, self-loops and separate parallel edge records are counted.
 * raw = w(s,t) or w(s,m)*w(m,t); signed additionally multiplies sign(s)
 * and, for two hops, sign(m). The target's sign is irrelevant to arrival.
 * Silent outgoing nodes still count structurally, but contribute signed zero.
 * Reachability counts distinct targets regardless of sign/cancellation.
 * Normalization divides by ALL annotated sources (even disconnected ones);
 * an empty source group has null normalized raw. Integer arithmetic fails
 * before any unsafe result can enter a report; only the normalized ratio
 * uses floating point. These are wiring metrics, not LIF efficacy estimates.
 */
export function auditPaths(graph, sides) {
  validateGraph(graph);
  validateSides(graph, sides);
  const { metadata, offsets, targets, weights } = graph;
  const motors = Object.fromEntries(LR.map(side => [side, new Set(metadata.groups[side])]));
  const motorUnion = new Set([...motors.left, ...motors.right]);
  const overlap = values => {
    const set = new Set(values);
    return { left: intersection(set, motors.left), right: intersection(set, motors.right),
      either: intersection(set, motorUnion) };
  };
  const groupSets = Object.fromEntries(Object.entries(metadata.groups).map(([name, values]) =>
    [name, group(values, graph.n)]));
  const overlaps = {
    motorLeftRight: intersection(motors.left, motors.right),
    sensoryToMotor: Object.fromEntries(CHANNELS.map(name => [name, overlap(metadata.groups[name])])),
    annotatedToMotor: Object.fromEntries(Object.entries(sides).map(([name, pair]) =>
      [name, Object.fromEntries(LR.map(side => [side, overlap(pair[side])]))])),
    groupPairs: Object.fromEntries(Object.entries(groupSets).map(([name, set]) =>
      [name, Object.fromEntries(Object.entries(groupSets).map(([other, values]) =>
        [other, intersection(set, values)]))])),
  };
  const rows = [];
  for (const sourceChannel of Object.keys(sides)) for (const sourceSide of LR) for (const targetSide of LR) {
    const sources = sides[sourceChannel][sourceSide], targetSet = motors[targetSide];
    const metrics = [1, 2].map(() => ({ rawWeightSum: 0, signedWeightSum: 0, walkCount: 0 }));
    const reached = [new Set(), new Set()];
    const add = (hop, target, raw, sign) => {
      if (!targetSet.has(target)) return;
      safe(raw);
      const metric = metrics[hop];
      metric.rawWeightSum = safe(metric.rawWeightSum + raw);
      metric.signedWeightSum = safe(metric.signedWeightSum + raw * sign);
      metric.walkCount = safe(metric.walkCount + 1);
      reached[hop].add(target);
    };
    for (const source of sources) {
      const sign = metadata.nodes[source].sign;
      for (let a = offsets[source]; a < offsets[source + 1]; a++) {
        const middle = targets[a];
        add(0, middle, weights[a], sign);
        for (let b = offsets[middle]; b < offsets[middle + 1]; b++) {
          add(1, targets[b], weights[a] * weights[b], sign * metadata.nodes[middle].sign);
        }
      }
    }
    metrics.forEach((metric, i) => rows.push({ sourceChannel, sourceSide, targetSide,
      hops: i + 1, sourceCount: sources.length, targetCount: targetSet.size, ...metric,
      meanWeightPerWalk: metric.walkCount ? metric.rawWeightSum / metric.walkCount : null,
      reachableTargetCount: reached[i].size,
      normalizedRawPerSource: sources.length ? metric.rawWeightSum / sources.length : null }));
  }
  return { neurons: graph.n, edges: graph.e, overlaps, rows };
}

/** Verify the self-hashed side file against the hash-checked circuit manifest. */
export async function verifySideFile(document, circuit) {
  const { reportHash, ...payload } = document;
  requireValue(document.schema === "iff.side-groups/1" && await hash(payload) === reportHash,
    "PATH_SIDE_HASH");
  const binding = document.binding?.dataset;
  requireValue(binding?.id === circuit.manifest.id &&
    canonical(binding.metadata) === canonical(circuit.manifest.metadata) &&
    canonical(binding.connectivity) === canonical(circuit.manifest.connectivity) &&
    binding.metadata.sha256 === circuit.metadataHash, "PATH_SIDE_BINDING");
  validateSides(circuit, document.sideGroups);
  return document.sideGroups;
}

/** Circuit indices are NEVER reused in the full graph: map official body IDs. */
export function remapSidesByBodyId(circuit, full, sides) {
  validateSides(circuit, sides);
  const idMap = graph => {
    const map = new Map();
    graph.metadata.nodes.forEach((node, i) => {
      requireValue(typeof node.id === "string" && /^[1-9]\d*$/.test(node.id) &&
        !map.has(node.id), "PATH_BODY_ID");
      map.set(node.id, i);
    });
    return map;
  };
  idMap(circuit);
  const fullIndices = idMap(full);
  const remapped = Object.fromEntries(Object.entries(sides).map(([channel, pair]) =>
    [channel, Object.fromEntries(LR.map(side => [side, pair[side].map(i => {
      const target = fullIndices.get(circuit.metadata.nodes[i].id);
      requireValue(target !== undefined, "PATH_BODY_ID_MISSING");
      return target;
    }).sort((a, b) => a - b)]))]));
  validateSides(full, remapped);
  return remapped;
}

async function main() {
  requireValue(process.argv.length === 2, "PATH_CLI_ARGS", "Usage: node scripts/audit-direction-paths.mjs");
  const dirs = { circuit: "public/data/malecns-circuit", full: "public/data/malecns-full" };
  // The official loader validates both metadata and connectivity bytes/hashes.
  const circuit = await loadGraphFromDir(fileURLToPath(new URL(dirs.circuit, ROOT)));
  const full = await loadGraphFromDir(fileURLToPath(new URL(dirs.full, ROOT)));
  const sideFile = JSON.parse(await readFile(new URL("reports/side-groups.json", ROOT), "utf8"));
  const sides = await verifySideFile(sideFile, circuit);
  const fullSides = remapSidesByBodyId(circuit, full, sides);
  const sourcePaths = ["scripts/audit-direction-paths.mjs", "tests/direction-paths.test.mjs",
    "src/brain/graph.mjs", "src/brain/runtime.mjs", "src/brain/codec.mjs",
    "server/src/shared/graph-fs.mjs", "reports/side-groups.json",
    ...Object.values(dirs).map(dir => `${dir}/manifest.json`)];
  const sources = Object.fromEntries(await Promise.all(sourcePaths.map(async path =>
    [path, await hashBytes(await readFile(new URL(path, ROOT)))])));
  const graphs = {};
  for (const [name, graph, mapped] of [["circuit", circuit, sides], ["full", full, fullSides]]) {
    graphs[name] = { path: dirs[name], manifest: graph.manifest,
      metadataHash: graph.metadataHash, connectivityHash: graph.datasetHash,
      sideGroups: mapped, sideGroupsHash: await hash(mapped), ...auditPaths(graph, mapped) };
  }
  const payload = {
    schema: "iff.direction-paths/1", audit: "READ-ONLY", sources,
    sideGroupsHash: sideFile.reportHash, annotationBinding: sideFile.binding.annotations,
    semantics: {
      walks: "Directed exact 1/2-hop edge walks; repeated nodes, self-loops and parallel edge records allowed. Not cumulative reachability or simple paths.",
      rawWeightSum: "Sum w(s,t), or sum w(s,m)*w(m,t) for two hops.",
      signedWeightSum: "Raw terms times sign(s), and also sign(m) for two hops; no target sign or runtime gain. Silent outgoing sign=0 contributes zero signed weight, not zero structural walks.",
      reachableTargetCount: "Distinct structural targets per row regardless of silent signs or cancellation.",
      normalizedRawPerSource: "Raw sum divided by every annotated source on that side, including disconnected sources; null for an empty source group. The ratio is floating point; all sums/products/counts are safe integers or fail.",
      remapping: "Circuit side groups remapped by official body ID using full metadata; each graph uses its own motor groups. Full sources are the same selected annotated cohort, not all full-graph sensory neurons.",
      overlaps: "Set intersection counts; either is a union, not left+right. Group-pair diagonals are group sizes. Overlap alone is not a zero-hop walk in these metrics.",
      limitations: "Structural presence and signed weight are not efficacy: no thresholds, leak, gain, refractory dynamics, stimulation or behavioral inference. Annotation side is position, not response tuning. Sensory/motor overlap, including threat overlap, can cause direct motor-group injection under sensory stimulation.",
    },
    graphs,
  };
  const report = { ...payload, reportHash: await hash(payload) };
  await writeFile(new URL(REPORT, ROOT), JSON.stringify(report, null, 2) + "\n");
  const { reportHash, ...stored } = JSON.parse(await readFile(new URL(REPORT, ROOT), "utf8"));
  requireValue(await hash(stored) === reportHash, "PATH_REPORT_HASH");
  console.log(JSON.stringify({ report: REPORT, reportHash, graphs: Object.fromEntries(
    Object.entries(graphs).map(([name, graph]) => [name, { rows: graph.rows,
      sensoryToMotor: graph.overlaps.sensoryToMotor }])) }, null, 2));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
