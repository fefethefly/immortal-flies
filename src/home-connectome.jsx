import React, { useEffect, useMemo, useState } from "react";
import { loadGraph } from "./brain/graph.mjs";

// Geometry is illustrative. IDs and edges come from the hash-checked dataset.
export function HomeConnectome({ locale }) {
  const zh = locale === "zh";
  const [graph, setGraph] = useState(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState(0);
  useEffect(() => {
    let active = true;
    loadGraph("/data/malecns-circuit/manifest.json")
      .then((g) => {
        if (active) setGraph(g);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);
  const scene = useMemo(() => {
    if (!graph) return null;
    const points = graph.metadata.nodes.map((node, i) => {
      // Some source nodes have no position. Keep their IDs using an explicitly
      // illustrative, deterministic spherical layout instead of crashing.
      const t = i * 2.399963229728653;
      const v = 1 - (2 * (i + 0.5)) / graph.n;
      const r = Math.sqrt(1 - v * v);
      const [x, y, z] = node.position || [r * Math.cos(t), v, r * Math.sin(t)];
      return [300 + (x * 0.88 + z * 0.3) * 200, 220 + y * 170];
    });
    const edges = [];
    for (let a = 0; a < graph.n; a += 2) {
      const start = graph.offsets[a],
        end = graph.offsets[a + 1];
      if (start < end)
        edges.push([a, graph.targets[start + (a % (end - start))]]);
    }
    return { points, edges };
  }, [graph]);
  return (
    <div className="hc-view">
      {!scene ? (
        <p role="status">
          {failed
            ? zh
              ? "连接组暂不可用，请刷新重试。"
              : "Connectome unavailable. Please reload."
            : zh
              ? "正在校验连接组…"
              : "Verifying connectome…"}
        </p>
      ) : (
        <>
          <svg viewBox="0 0 600 460" aria-hidden="true" className="hc-graph">
            {scene.edges.map(([a, b]) => (
              <line
                key={a}
                x1={scene.points[a][0]}
                y1={scene.points[a][1]}
                x2={scene.points[b][0]}
                y2={scene.points[b][1]}
                stroke={
                  a === selected || b === selected ? "#f0b90b" : "#a9c4bb"
                }
                opacity={a === selected || b === selected ? 0.9 : 0.13}
                strokeWidth="0.7"
              />
            ))}
            {scene.points.map(([x, y], i) => (
              <circle
                key={i}
                cx={x}
                cy={y}
                r={i === selected ? 5 : 1.4}
                fill={i === selected ? "#fcd535" : "#d1c9b1"}
                opacity={i === selected ? 1 : 0.65}
              />
            ))}
          </svg>
          <div className="hc-readout">
            <b>
              {graph.n.toLocaleString("en-US")} {zh ? "神经元" : "neurons"} /{" "}
              {graph.e.toLocaleString("en-US")} {zh ? "连接边" : "edges"}
            </b>
            <label>
              {zh ? "追踪节点" : "Inspect node"}
              <select
                value={selected}
                onChange={(e) => setSelected(Number(e.target.value))}
              >
                {graph.metadata.nodes.map((node, i) => (
                  <option value={i} key={node.id}>
                    {node.id} · {node.type || "—"}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </>
      )}
      <small>
        {zh
          ? "MaleCNS 子图 · 连线抽样 / 布局示意 · 非实时放电"
          : "MaleCNS subgraph · sampled edges / illustrative layout · not live firing"}
      </small>
    </div>
  );
}
