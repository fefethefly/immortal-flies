import React, { useEffect, useRef, useState } from "react";
import { ACTS, MAPS } from "./sim.mjs";
import "../fonts.css";
import "./live.css";

export function FlyLivePage() {
  const hostRef = useRef(null);
  const apiRef = useRef(null);
  const actNode = useRef(null);
  const tickNode = useRef(null);
  const mapNode = useRef(null);
  const hintNode = useRef(null);
  const pausedRef = useRef(false);
  const forcedRef = useRef(null);
  const viewRef = useRef("chase");
  const [paused, setPaused] = useState(false);
  const [forced, setForced] = useState(null);
  const [view, setView] = useState(() => (new URLSearchParams(window.location.search).get("view") === "pilot" ? "pilot" : "chase"));

  useEffect(() => {
    document.title = "FLY LIVE — 3D table";
    document.documentElement.lang = "zh";
  }, []);

  useEffect(() => {
    pausedRef.current = paused;
    apiRef.current?.setPaused(paused);
  }, [paused]);

  useEffect(() => {
    forcedRef.current = forced;
    apiRef.current?.setAct(forced);
  }, [forced]);

  useEffect(() => {
    viewRef.current = view;
    apiRef.current?.setView(view);
  }, [view]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    let dead = false;
    let live;
    import("./game.mjs").then(({ createLiveGame }) => {
      if (dead || !hostRef.current) return;
      live = createLiveGame(hostRef.current, {
        onForced: (act) => setForced(act),
        onFrame: (sim) => {
          if (actNode.current) actNode.current.textContent = sim.fly.motor || sim.fly.act;
          if (tickNode.current) {
            tickNode.current.textContent = String(Math.floor(sim.tick)).padStart(6, "0");
          }
          const map = MAPS[sim.mapId] || MAPS.kitchen;
          if (mapNode.current) mapNode.current.textContent = map.title;
          if (hintNode.current) hintNode.current.textContent = map.hint;
          host.classList.toggle("is-travel", sim.travel > 0.08);
        },
      });
      apiRef.current = live;
      live.setPaused(pausedRef.current);
      live.setAct(forcedRef.current);
      live.setView(viewRef.current);
    });
    return () => {
      dead = true;
      apiRef.current = null;
      live?.destroy();
    };
  }, []);

  return (
    <main className={`fly-live ${view === "pilot" ? "is-pilot" : ""}`}>
      <div className="fly-live-stage">
        <div
          ref={hostRef}
          className="fly-live-game"
          aria-label="三维餐桌上的一只程序控制果蝇"
        />
        <div className="fly-live-hud">
          <div className="fly-live-top">
            <div>
              <b>FLY LIVE</b>
              <small>
                <span ref={mapNode}>厨房</span>
                {" · "}
                飞出房间换地图 · 不是链上生命
              </small>
            </div>
            <a href="/">返回首页</a>
          </div>
          <div className="fly-live-act">
            <b>MOTOR</b>
            <strong ref={actNode}>WALK</strong>
          </div>
          <div className="fly-live-bottom">
            <div>
              <div className="fly-live-tick">
                TICK <span ref={tickNode}>000000</span>
              </div>
              <p className="fly-live-hint">
                <span ref={hintNode}>飞向发光窗口可以出门</span>
              </p>
            </div>
            <div className="fly-live-controls">
              {ACTS.map((act) => (
                <button
                  key={act}
                  type="button"
                  aria-pressed={forced === act}
                  onClick={() => setForced(forced === act ? null : act)}
                >
                  {act}
                </button>
              ))}
              <button
                type="button"
                aria-pressed={view === "pilot"}
                onClick={() => setView(view === "pilot" ? "chase" : "pilot")}
              >
                {view === "pilot" ? "跟随镜头" : "第一人称"}
              </button>
              <button
                type="button"
                aria-pressed={paused}
                onClick={() => setPaused((value) => !value)}
              >
                {paused ? "RESUME" : "PAUSE"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
