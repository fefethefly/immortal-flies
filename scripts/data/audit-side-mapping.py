#!/usr/bin/env python3
"""Read-only audits for official MaleCNS side annotations.

Writes two self-hashed reports and never rewrites datasets, graph.bin or
metadata.json:
  reports/side-mapping-audit.json  (iff.side-mapping-audit/1) evidence summary
  reports/side-groups.json         (iff.side-groups/1) side index groups for
                                   the separately versioned side-route/1 plan.
Requires pyarrow+pandas, e.g.:
  /usr/local/bin/python3 scripts/data/audit-side-mapping.py
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "scripts" / "data" / "cache"
DATASET = ROOT / "public" / "data" / "malecns-circuit"
REPORT = ROOT / "reports" / "side-mapping-audit.json"
SIDE_GROUPS = ROOT / "reports" / "side-groups.json"
ANNOTATIONS = CACHE / "body-annotations-male-cns-v1.0-minconf-0.5.feather"
SIDE_COLUMN = {"food": "rootSide", "threat": "somaSide"}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return "0x" + digest.hexdigest()


def canonical(payload) -> bytes:
    return json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()


def digest(payload) -> str:
    return "0x" + hashlib.sha256(canonical(payload)).hexdigest()


def side_counts(frame, column: str) -> dict:
    values = frame[column].fillna("").astype(str).str.upper().str[:1].replace("", "unknown")
    return {key: int(count) for key, count in sorted(values.value_counts().items())}


def write_self_hashed(path: Path, payload: dict) -> None:
    payload = {**payload, "reportHash": digest(payload)}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
    stored = json.loads(path.read_text())
    expected = stored.pop("reportHash")
    if expected != digest(stored):
        raise SystemExit(f"{path.name}: self hash mismatch")


def main() -> None:
    import pandas as pd

    metadata = json.loads((DATASET / "metadata.json").read_text())
    manifest = json.loads((DATASET / "manifest.json").read_text())
    annotations = pd.read_feather(ANNOTATIONS)
    columns = {str(column).lower(): column for column in annotations.columns}
    key = columns["bodyid"]
    motor = set(metadata["groups"]["left"]) | set(metadata["groups"]["right"])
    groups, overlap, matched_frames = {}, {}, {}
    for name in ["food", "threat", "light", "left", "right"]:
        indices = metadata["groups"][name]
        ids = {int(metadata["nodes"][index]["id"]) for index in indices}
        matched = annotations[annotations[key].isin(ids)]
        matched_frames[name] = matched
        groups[name] = {
            "neurons": len(indices),
            "matched": int(len(matched)),
            "sideCounts": {
                column: side_counts(matched, columns[column.lower()])
                for column in ["somaSide", "rootSide"]
            },
        }
        overlap[name] = len(set(indices) & motor)
    audit = {
        "schema": "iff.side-mapping-audit/1",
        "audit": "READ-ONLY",
        "dataset": {"path": "public/data/malecns-circuit", "manifest": manifest},
        "annotations": {"file": ANNOTATIONS.name, "sha256": sha256_file(ANNOTATIONS)},
        "sideColumns": {"somaSide": "official soma side", "rootSide": "official root side"},
        "groups": groups,
        "motorOverlap": overlap,
        "notes": [
            "Selected food neurons carry rootSide sides; their raw somaSide is empty.",
            "Selected threat sides come from somaSide; light has no bilateral split.",
            "No official annotation distinguishes front from back.",
            "Motor readout groups must not receive directional stimulation.",
        ],
    }
    write_self_hashed(REPORT, audit)

    side_groups, counts = {}, {}
    for name, column in SIDE_COLUMN.items():
        matched = matched_frames[name]
        sides = dict(zip(matched[key].astype("int64").tolist(),
                         matched[columns[column.lower()]].fillna("").astype(str).str.upper().str[:1]))
        left, right, unknown = [], [], 0
        for index in metadata["groups"][name]:
            letter = sides.get(int(metadata["nodes"][index]["id"]), "")
            if letter == "L":
                left.append(index)
            elif letter == "R":
                right.append(index)
            else:
                unknown += 1
        side_groups[name] = {"left": sorted(left), "right": sorted(right)}
        counts[name] = {"left": len(left), "right": len(right), "unknownSide": unknown}
    binding = {
        "schema": "iff.side-groups/1",
        "sideColumn": SIDE_COLUMN,
        "binding": {
            "annotations": {"file": ANNOTATIONS.name, "sha256": sha256_file(ANNOTATIONS)},
            "dataset": {"id": manifest["id"], "metadata": manifest["metadata"],
                        "connectivity": manifest["connectivity"]},
        },
        "sideGroups": side_groups,
        "counts": counts,
        "excluded": {"light": "no bilateral split in the selected group",
                     "forward": "no official annotation distinguishes front from back"},
        "notes": ["Indices refer to metadata.json node positions; L/R labels are official "
                  "annotation sides locating neuron position, not response-tuning evidence."],
    }
    write_self_hashed(SIDE_GROUPS, binding)
    print(f"wrote {REPORT}")
    print(f"wrote {SIDE_GROUPS}")
    print(f"food.rootSide={groups['food']['sideCounts']['rootSide']}")
    print(f"threat.somaSide={groups['threat']['sideCounts']['somaSide']}")
    print(f"sideGroups counts={counts}")
    print(f"motorOverlap={overlap}")


if __name__ == "__main__":
    main()
