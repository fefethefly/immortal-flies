import { useEffect, useRef, useState } from "react";
import {
  createHomeSession,
  recordHomeStimulus,
  replayHomeStimulus,
} from "./home-life-session.mjs";

const EMPTY_FRAME = {
  tick: 0,
  spikes: [],
  action: "REST",
  body: { x: 5000, y: 5000, heading: 0, energy: 1000 },
};
export function useLocalLife(graph, reduced) {
  const session = useRef(null),
    lock = useRef(false),
    generation = useRef(0),
    interval = useRef(null);
  const [frame, setFrame] = useState(EMPTY_FRAME);
  const [frameIndex, setFrameIndex] = useState(0);
  const [records, setRecords] = useState([]);
  const [activeRecord, setActiveRecord] = useState(null);
  const [verified, setVerified] = useState([]);
  const [status, setStatus] = useState("ready");
  const [total, setTotal] = useState(0);
  useEffect(() => {
    generation.current++;
    session.current = graph ? createHomeSession(graph) : null;
    lock.current = false;
    setFrame(EMPTY_FRAME);
    setFrameIndex(0);
    setRecords([]);
    setActiveRecord(null);
    setStatus("ready");
    setVerified([]);
    setTotal(0);
    return () => {
      generation.current++;
      clearInterval(interval.current);
    };
  }, [graph]);
  const present = (record, frames, done) => {
    clearInterval(interval.current);
    setActiveRecord(record);
    const show = (i) => {
      setFrame(frames[i]);
      setFrameIndex(i);
    };
    if (reduced) {
      show(frames.length - 1);
      setStatus(done);
      lock.current = false;
      return;
    }
    let i = 0;
    show(i);
    interval.current = setInterval(() => {
      if (document.hidden) return;
      show(++i);
      if (i >= frames.length - 1) {
        clearInterval(interval.current);
        setStatus(done);
        lock.current = false;
      }
    }, 160);
  };
  async function stimulate(kind) {
    if (!session.current || lock.current || status === "error") return;
    lock.current = true;
    setStatus("running");
    const version = generation.current;
    try {
      const record = await recordHomeStimulus(session.current, kind);
      if (version !== generation.current) return;
      // A bounded on-screen chronicle; the exported session retains every event.
      setRecords((rows) => [...rows.slice(-23), record]);
      setTotal((n) => n + 1);
      present(record, record.frames, "recorded");
    } catch {
      if (version === generation.current) {
        setStatus("error");
        lock.current = false;
      }
    }
  }
  async function replay(record = activeRecord || records.at(-1)) {
    if (!record || lock.current || status === "error") return;
    lock.current = true;
    setStatus("replaying");
    const version = generation.current;
    try {
      const frames = await replayHomeStimulus(graph, record);
      if (version !== generation.current) return;
      setVerified((roots) => [
        ...new Set([...roots.slice(-23), record.historyRoot]),
      ]);
      present(record, frames, "verified");
    } catch {
      if (version === generation.current) {
        setStatus("error");
        lock.current = false;
      }
    }
  }
  function seek(record, index) {
    if (!record || lock.current || status === "error") return;
    const i = Math.max(
      0,
      Math.min(record.frames.length - 1, Math.round(index)),
    );
    setActiveRecord(record);
    setFrame(record.frames[i]);
    setFrameIndex(i);
    setStatus("reviewing");
  }
  function returnToPresent() {
    if (lock.current || status === "error") return;
    const record = records.at(-1);
    if (record) {
      seek(record, record.frames.length - 1);
      setStatus("recorded");
    }
  }
  async function save() {
    if (!session.current || lock.current) return;
    try {
      const archive = await session.current.checkpoint();
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(archive, null, 2)], {
          type: "application/json",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "immortal-observatory-recording.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setStatus("error");
    }
  }
  return {
    frame,
    frameIndex,
    records,
    activeRecord,
    verified,
    total,
    status,
    stimulate,
    replay,
    seek,
    returnToPresent,
    save,
    busy: status === "running" || status === "replaying",
  };
}
