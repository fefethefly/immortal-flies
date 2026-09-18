#!/usr/bin/env python3
"""Build MaleCNS v1.0 graphs for iff-runtime/1.

Official files come from Janelia FlyEM (CC BY):
https://male-cns.janelia.org/download/
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import struct
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CACHE = Path(__file__).resolve().parent / "cache"
PUBLIC = ROOT / "public" / "data"
BUCKET = "https://storage.googleapis.com/flyem-male-cns/v1.0/connectome-data/flat-connectome"
FILES = {
    "annotations": "body-annotations-male-cns-v1.0-minconf-0.5.feather",
    "transmitters": "body-neurotransmitters-male-cns-v1.0.feather",
    "weights": "connectome-weights-male-cns-v1.0-minconf-0.5-significant-only.feather",
}
MAGIC = 0x49464631
INHIBITORY = {"gaba", "glutamate", "glu", "gabaergic", "glutamatergic"}
EXCITATORY = {"acetylcholine", "ach", "cholinergic"}
def sha256(data: bytes) -> str:
    return "0x" + hashlib.sha256(data).hexdigest()

def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return "0x" + digest.hexdigest()


def download(name: str) -> Path:
    CACHE.mkdir(parents=True, exist_ok=True)
    dest = CACHE / name
    if dest.exists() and dest.stat().st_size > 0:
        print(f"cache hit {dest} ({dest.stat().st_size} bytes)", flush=True)
        return dest
    url = f"{BUCKET}/{name}"
    print(f"download {url}", flush=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    result = subprocess.run(["curl", "-L", "--fail", "--retry", "3", "-o", str(tmp), url], check=False)
    if result.returncode != 0:
        raise SystemExit(f"download failed: {url}")
    tmp.replace(dest)
    return dest


def col(df, names):
    lookup = {str(c).lower(): c for c in df.columns}
    for name in names:
        if name.lower() in lookup:
            return lookup[name.lower()]
    raise SystemExit(f"missing column {names}; have {list(df.columns)}")


def series_text(df, names, default=""):
    try:
        key = col(df, names)
    except SystemExit:
        return [default] * len(df)
    return df[key].fillna(default).astype(str).tolist()


def load_table(path):
    import pandas as pd
    return pd.read_feather(path)


def body_ids(df):
    key = col(df, ["bodyid", "body_id", "bodyId", "body"])
    return df[key].astype("int64")


def sign_of(value: str) -> int:
    token = re.sub(r"[^a-z]", "", value.lower())
    if token in INHIBITORY:
        return -1
    if token in EXCITATORY:
        return 1
    return 0


def positions(df, n):
    lower = {str(c).lower(): c for c in df.columns}
    if "position" in lower or "somalocation" in lower:
        source = df[lower.get("position") or lower["somalocation"]].tolist()
        pts = []
        for item in source:
            if hasattr(item, "__len__") and len(item) >= 3:
                pts.append((float(item[0]), float(item[1]), float(item[2])))
            else:
                pts.append(None)
    elif all(axis in lower for axis in ("x", "y", "z")):
        pts = list(zip(df[lower["x"]].tolist(), df[lower["y"]].tolist(), df[lower["z"]].tolist()))
    else:
        return None
    xs = [p[0] for p in pts if p]
    ys = [p[1] for p in pts if p]
    zs = [p[2] for p in pts if p]
    if not xs:
        return None
    bounds = [(min(xs), max(xs) or 1.0), (min(ys), max(ys) or 1.0), (min(zs), max(zs) or 1.0)]
    def norm(raw, lo, hi):
        span = (hi - lo) or 1.0
        return max(-1.0, min(1.0, (float(raw) - lo) / span * 2 - 1))
    out = []
    for p in pts:
        if p is None:
            out.append(None)
        else:
            out.append([round(norm(p[i], *bounds[i]), 4) for i in range(3)])
    return out


def encode_graph(adjacency):
    n = len(adjacency)
    edge_count = sum(len(item) for item in adjacency)
    buf = bytearray()
    buf += struct.pack("<III", MAGIC, n, edge_count)
    cursor = 0
    buf += struct.pack("<I", 0)
    for item in adjacency:
        cursor += len(item)
        buf += struct.pack("<I", cursor)
    for item in adjacency:
        for post, _weight in item:
            buf += struct.pack("<I", post)
    for item in adjacency:
        for _post, weight in item:
            buf += struct.pack("<I", weight)
    expected = 12 + (n + 1 + edge_count * 2) * 4
    if len(buf) != expected:
        raise SystemExit(f"graph size {len(buf)} != {expected}")
    return bytes(buf), edge_count


def pick_seeds(ann):
    types = series_text(ann, ["type"])
    classes = series_text(ann, ["class"])
    supers = series_text(ann, ["superclass"])
    synonyms = series_text(ann, ["synonyms", "hemibraintype"])
    sides = series_text(ann, ["somaside", "side", "rootside"])
    ids = body_ids(ann).tolist()
    buckets = {"food": [], "threat": [], "light": [], "left": [], "right": []}
    for i, body in enumerate(ids):
        kind, super_name, cell = classes[i].lower(), supers[i].lower(), types[i]
        side = sides[i].strip().upper()[:1]
        if kind in {"olfactory", "gustatory"}:
            buckets["food"].append(body)
        if "mechanosensory" in kind or cell.startswith("DNp") or re.search(r"giant fiber|escape", synonyms[i], re.I):
            buckets["threat"].append(body)
        if cell in {"R1-R6", "R7", "R8", "L1", "L2", "L3", "L4", "L5"}:
            buckets["light"].append(body)
        if super_name in {"descending_neuron", "vnc_motor", "cb_motor", "ascending_neuron"}:
            if side == "L":
                buckets["left"].append(body)
            elif side == "R":
                buckets["right"].append(body)
    for key, cap in (("food", 80), ("threat", 80), ("light", 80), ("left", 90), ("right", 90)):
        buckets[key] = sorted(set(int(body) for body in buckets[key]))[:cap]
        if not buckets[key]:
            raise SystemExit(f"no official neurons matched {key}")
    return buckets


def write_dataset(name, nodes, groups, adjacency, provenance):
    directory = PUBLIC / name
    directory.mkdir(parents=True, exist_ok=True)
    binary, edge_count = encode_graph(adjacency)
    metadata = {
        "schema": "iff.connectome/1",
        "dataset": "male-cns:v1.0",
        "subset": name.replace("malecns-", ""),
        "nodes": nodes,
        "groups": groups,
        "edgeCount": edge_count,
        "groupRules": {
            "food": "Product mapping: stimulate officially annotated olfactory/gustatory sensory neurons.",
            "threat": "Product mapping: stimulate annotated mechanosensory/escape-related neurons.",
            "light": "Product mapping: stimulate annotated photoreceptor / lamina neurons.",
            "left": "Product mapping: left-side descending/motor neurons decode turning.",
            "right": "Product mapping: right-side descending/motor neurons decode turning.",
        },
    }
    meta_bytes = json.dumps(metadata, ensure_ascii=False, separators=(",", ":")).encode()
    provenance_bytes = json.dumps(provenance, ensure_ascii=False, indent=2).encode()
    (directory / "graph.bin").write_bytes(binary)
    (directory / "metadata.json").write_bytes(meta_bytes)
    (directory / "provenance.json").write_bytes(provenance_bytes)
    manifest = {
        "schema": "iff.dataset/1",
        "id": name,
        "title": "MaleCNS v1.0 " + ("sensory-motor subgraph" if "circuit" in name else "annotated significant graph"),
        "dataset": "male-cns:v1.0",
        "license": "CC BY",
        "source": "https://male-cns.janelia.org/download/",
        "neurons": len(nodes),
        "edges": edge_count,
        "metadata": {"path": "metadata.json", "bytes": len(meta_bytes), "sha256": sha256(meta_bytes)},
        "connectivity": {"path": "graph.bin", "bytes": len(binary), "sha256": sha256(binary)},
        "provenance": {"path": "provenance.json", "bytes": len(provenance_bytes), "sha256": sha256(provenance_bytes)},
    }
    (directory / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"wrote {directory} neurons={len(nodes)} edges={edge_count} bytes={len(binary)}", flush=True)
    return manifest


def build_maps(ann, transmitters):
    ids = body_ids(ann)
    types = series_text(ann, ["type", "celltype", "cell_type"])
    classes = series_text(ann, ["class", "subclass"])
    sides = series_text(ann, ["side", "somaside", "soma_side", "rootside"])
    xyz = positions(ann, len(ann))
    nt_ids = body_ids(transmitters)
    nt_values = series_text(transmitters, ["consensus_nt", "predicted_nt", "top_nt", "neurotransmitter", "nt"])
    signs = {int(body): sign_of(value) for body, value in zip(nt_ids.tolist(), nt_values)}
    info = {}
    for i, body in enumerate(ids.tolist()):
        info[int(body)] = {
            "id": str(int(body)),
            "sign": signs.get(int(body), 0),
            "type": types[i],
            "side": sides[i][:8],
            "class": classes[i],
            **({"position": xyz[i]} if xyz and xyz[i] else {}),
        }
    return info


def load_weights(path, allowed=None, minimum=5, either=None):
    import pyarrow as pa
    import pyarrow.compute as pc
    import pyarrow.feather as feather
    table = feather.read_table(path, columns=["body_pre", "body_post", "weight"], memory_map=True)
    table = table.filter(pc.greater_equal(table["weight"], minimum))
    if either is not None:
        ids = pa.array(list(either), type=pa.int64())
        table = table.filter(pc.or_(pc.is_in(table["body_pre"], ids), pc.is_in(table["body_post"], ids)))
    if allowed is not None:
        ids = pa.array(list(allowed), type=pa.int64())
        table = table.filter(pc.and_(pc.is_in(table["body_pre"], ids), pc.is_in(table["body_post"], ids)))
    frame = table.to_pandas()
    return frame, "body_pre", "body_post", "weight"


def pack(nodes_info, selected, edges, pre, post, weight):
    order = sorted(selected)
    index = {body: i for i, body in enumerate(order)}
    nodes = [nodes_info[body] for body in order]
    adjacency = [[] for _ in order]
    for src, dst, value in edges[[pre, post, weight]].itertuples(index=False, name=None):
        src, dst, value = int(src), int(dst), int(value)
        if src in index and dst in index and value > 0:
            adjacency[index[src]].append((index[dst], min(value, 999999)))
    for lst in adjacency:
        lst.sort(key=lambda item: (item[0], item[1]))
        # Keep the strongest edge if a pair appears twice.
        compact = {}
        for dst, value in lst:
            compact[dst] = max(value, compact.get(dst, 0))
        lst[:] = sorted(compact.items())
    if sum(len(item) for item in adjacency) < 1:
        raise SystemExit("no edges survived filtering")
    return nodes, adjacency, index


def assign_groups(seeds, index):
    groups = {}
    for name, bodies in seeds.items():
        groups[name] = [index[body] for body in bodies if body in index]
        if not groups[name]:
            raise SystemExit(f"group {name} empty after edge filter")
    return groups


def build_circuit(info, seeds, weights_path, cap=1400):
    seed_ids = set().union(*seeds.values())
    hop, pre, post, weight = load_weights(weights_path, either=seed_ids, minimum=8)
    partners = set(seed_ids)
    degree = {}
    for src, dst, _value in hop[[pre, post, weight]].itertuples(index=False, name=None):
        src, dst = int(src), int(dst)
        partners.add(src)
        partners.add(dst)
        degree[src] = degree.get(src, 0) + 1
        degree[dst] = degree.get(dst, 0) + 1
    partners &= set(info)
    ranked = sorted(partners - seed_ids, key=lambda body: (-degree.get(body, 0), body))
    selected = set(seed_ids)
    for body in ranked:
        if len(selected) >= cap:
            break
        selected.add(body)
    selected &= set(info)
    inner, pre, post, weight = load_weights(weights_path, allowed=selected, minimum=8)
    nodes, adjacency, index = pack(info, selected, inner, pre, post, weight)
    groups = assign_groups(seeds, index)
    return nodes, groups, adjacency, {
        "minWeight": 8,
        "seedCount": len(seed_ids),
        "selectedCount": len(selected),
        "hop": 1,
        "cap": cap,
    }


def build_full(info, seeds, weights_path):
    allowed = set(info)
    minimum = 10
    edges, pre, post, weight = load_weights(weights_path, allowed, minimum=minimum)
    # Raise the threshold until the packed binary stays browser-sized.
    while True:
        selected = set(edges[pre]).union(set(edges[post])).union(*seeds.values())
        selected &= allowed
        n = len(selected)
        e = len(edges)
        size = 12 + (n + 1 + e * 2) * 4
        print(f"full candidate minWeight={minimum} n={n} e={e} bytes={size}", flush=True)
        if n >= 2 and e >= 1 and size <= 240 * 1024 * 1024:
            break
        minimum += 5
        edges = edges[edges[weight] >= minimum]
        if minimum > 80:
            raise SystemExit("could not fit a full graph under 240 MB")
    nodes, adjacency, index = pack(info, selected, edges, pre, post, weight)
    groups = assign_groups(seeds, index)
    return nodes, groups, adjacency, {"minWeight": minimum, "selectedCount": len(selected)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--circuit", action="store_true")
    parser.add_argument("--full", action="store_true")
    parser.add_argument(
        "--circuit-cap",
        type=int,
        default=1400,
        help="cap the circuit sample size (hero field density)",
    )
    args = parser.parse_args()
    if not args.circuit and not args.full:
        args.circuit = True
    try:
        import pandas  # noqa: F401
    except ImportError as exc:
        raise SystemExit("pip3 install pyarrow pandas") from exc
    ann_path = download(FILES["annotations"])
    nt_path = download(FILES["transmitters"])
    weight_path = download(FILES["weights"])
    print("read annotations", flush=True)
    ann = load_table(ann_path)
    transmitters = load_table(nt_path)
    if "body" in transmitters.columns:
        transmitters = transmitters.drop_duplicates("body", keep="last")
    print(f"annotations={len(ann)} columns={list(ann.columns)}", flush=True)
    print(f"transmitters={len(transmitters)} columns={list(transmitters.columns)}", flush=True)
    print("build neuron maps", flush=True)
    info = build_maps(ann, transmitters)
    seeds = pick_seeds(ann)
    print({key: len(value) for key, value in seeds.items()}, flush=True)
    print(f"annotated neurons={len(info)}", flush=True)
    source_files = []
    for key, name in FILES.items():
        path = CACHE / name
        source_files.append({
            "role": key,
            "name": name,
            "url": f"{BUCKET}/{name}",
            "bytes": path.stat().st_size,
            "sha256": sha256_file(path),
        })
    base_prov = {
        "schema": "iff.provenance/1",
        "dataset": "male-cns:v1.0",
        "license": "CC BY",
        "publisher": "Janelia FlyEM / Cambridge Drosophila Connectomics",
        "homepage": "https://male-cns.janelia.org/download/",
        "neuronIds": "Official MaleCNS body IDs are preserved as strings.",
        "dynamics": "Integer LIF in iff-runtime/1; not a claim of biological time constants.",
        "neurotransmitterRule": "GABA and glutamate -> inhibitory; acetylcholine -> excitatory; others silent. This is a project rule inspired by common Drosophila LIF models, not a synapse-resolved physiology claim.",
        "files": source_files,
    }
    if args.circuit:
        nodes, groups, adjacency, extra = build_circuit(
            info, seeds, weight_path, cap=args.circuit_cap
        )
        write_dataset("malecns-circuit", nodes, groups, adjacency, {**base_prov, "subset": "circuit", "processing": extra})
    if args.full:
        nodes, groups, adjacency, extra = build_full(info, seeds, weight_path)
        write_dataset("malecns-full", nodes, groups, adjacency, {**base_prov, "subset": "full", "processing": extra})


if __name__ == "__main__":
    sys.exit(main())
