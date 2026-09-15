import React, { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  ArrowDown,
  Play,
  Pause,
  RotateCcw,
  Download,
  Upload,
  Check,
  Copy,
  X,
  Activity,
  Droplets,
  Sun,
  Shield,
  Fingerprint,
  Infinity as InfinityIcon,
  Box,
  Volume2,
  VolumeX,
  Wallet,
  CircleHelp,
  ScanLine,
  Network,
  FlaskConical,
  Flag,
  Clock,
  FileCheck2,
  Menu,
  LockKeyhole,
  CircleDot,
} from "lucide-react";
import {
  createFly,
  tick,
  train,
  sleep,
  wake,
  rebirth,
  checkpoint,
  restoreCheckpoint,
  validateCheckpointEnvelope,
  proveContinuity,
  runMaze,
  MAZE,
} from "./engine.mjs";
import { loadLab, saveLab } from "./storage.mjs";
import {
  BSC_TESTNET,
  connectChain,
  explorerAddress,
  explorerTx,
  findOwnedTokenIds,
  loadDeployment,
  mintSeedFromDna,
  readFly,
  tokenIdFromReceipt,
  waitAction,
} from "./chain.mjs";
import {
  FlyMark,
  VitruvianFly,
  SectionLabel,
  SignalCanvas,
  NeuralBars,
  Modal,
  SoulCard,
  RuleTile,
} from "./components.jsx";
import { SwarmTape } from "./swarm-tape.jsx";
import { LocaleContext } from "./locale-context.jsx";
import { useLocale } from "./use-locale.mjs";
import { LocaleSwitch } from "./locale-switch.jsx";

const stimuli = [
  {
    label: "花蜜信号",
    english: "NECTAR",
    icon: Droplets,
    description: "强化气味偏好",
    color: "cyan",
  },
  {
    label: "光源脉冲",
    english: "LIGHT",
    icon: Sun,
    description: "强化趋光反应",
    color: "gold",
  },
  {
    label: "避障训练",
    english: "REFLEX",
    icon: Shield,
    description: "强化回避敏感",
    color: "violet",
  },
];
const timeLabel = (date) =>
  new Date(date).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
const downloadFile = (text, name, type) => {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 30000);
};
const go = (id) =>
  document.getElementById(id)?.scrollIntoView({
    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "instant"
      : "smooth",
    block: "start",
  });

export default function App() {
  const [locale, setLocale, tx] = useLocale(
    "meta.altarTitle",
    "meta.altarDesc",
  );
  const [initial] = useState(loadLab),
    [fly, setFly] = useState(initial.fly),
    [events, setEvents] = useState(initial.events),
    [archive, setArchive] = useState(initial.archive);
  const [labTab, setLabTab] = useState("train"),
    [heroView, setHeroView] = useState("specimen"),
    [modal, setModal] = useState(null),
    [toast, setToast] = useState(null),
    [busy, setBusy] = useState(false),
    [stimulus, setStimulus] = useState(null),
    [proof, setProof] = useState(null),
    [proving, setProving] = useState(false),
    [reborn, setReborn] = useState(false),
    [maze, setMaze] = useState(null),
    [mazeFrame, setMazeFrame] = useState(0),
    [wallet, setWallet] = useState(null),
    [deployment, setDeployment] = useState(null),
    [tokenId, setTokenId] = useState(null),
    [chainMode, setChainMode] = useState(false),
    [pendingTx, setPendingTx] = useState(null),
    [sound, setSound] = useState(false),
    [navOpen, setNavOpen] = useState(false),
    [activeSection, setActiveSection] = useState("home"),
    [storageWarning, setStorageWarning] = useState(false),
    [exportData, setExportData] = useState("");
  const fileInput = useRef(null),
    latest = useRef(fly),
    timers = useRef([]),
    audio = useRef(null),
    noticeTimer = useRef(null),
    currentBusy = useRef(false),
    operation = useRef(0),
    chainRef = useRef(null),
    chainModeRef = useRef(false);
  latest.current = fly;
  chainModeRef.current = chainMode;
  const soulNo = String(tokenId ?? 1).padStart(4, "0");
  const contractReady = Boolean(deployment?.address);
  function beginOperation() {
    if (currentBusy.current) return null;
    currentBusy.current = true;
    setBusy(true);
    return ++operation.current;
  }
  function finishOperation(token) {
    if (token !== operation.current) return;
    currentBusy.current = false;
    setBusy(false);
  }
  function commitFly(next) {
    latest.current = next;
    setFly(next);
  }
  function notify(message, type = "success") {
    setToast({ message, type });
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setToast(null), 4500);
  }
  function record(label, type = "state") {
    setEvents((prev) =>
      [{ label, type, date: new Date().toISOString() }, ...prev].slice(0, 60),
    );
  }
  function later(fn, ms) {
    const id = setTimeout(fn, ms);
    timers.current.push(id);
    return id;
  }
  useEffect(
    () => () => {
      operation.current++;
      timers.current.forEach(clearTimeout);
      clearTimeout(noticeTimer.current);
      audio.current?.close();
    },
    [],
  );
  useEffect(() => {
    loadDeployment()
      .then(setDeployment)
      .catch(() => setDeployment(null));
  }, []);
  useEffect(() => {
    const id = setInterval(() => {
      if (chainModeRef.current) return;
      if (!document.hidden && !currentBusy.current)
        setFly((current) => tick(current));
    }, 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (chainMode) return;
    if (!saveLab({ fly, events, archive })) setStorageWarning(true);
  }, [fly, events, archive, chainMode]);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setActiveSection(e.target.id);
        });
      },
      { rootMargin: "-15% 0px -60% 0px" },
    );
    ["home", "lab", "genesis", "archive"].forEach((id) =>
      observer.observe(document.getElementById(id)),
    );
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!maze || !busy) return;
    const id = setInterval(
      () => setMazeFrame((frame) => Math.min(frame + 1, maze.path.length - 1)),
      110,
    );
    return () => clearInterval(id);
  }, [maze, busy]);
  useEffect(() => {
    const ethereum = window.ethereum;
    if (!ethereum?.on) return undefined;
    const onAccounts = (accounts) => {
      if (!chainModeRef.current) return;
      if (!accounts?.length) {
        leaveChain();
        return;
      }
      if (
        chainRef.current &&
        accounts[0].toLowerCase() !== chainRef.current.address.toLowerCase()
      )
        connectWallet();
    };
    const onChain = (id) => {
      if (!chainModeRef.current) return;
      if (id !== BSC_TESTNET.hexChainId)
        notify("请切回 BSC 测试网（chainId 97）", "error");
    };
    ethereum.on("accountsChanged", onAccounts);
    ethereum.on("chainChanged", onChain);
    return () => {
      ethereum.removeListener?.("accountsChanged", onAccounts);
      ethereum.removeListener?.("chainChanged", onChain);
    };
  }, [deployment]);
  function tone(freq = 440) {
    if (!sound) return;
    try {
      if (!audio.current) audio.current = new AudioContext();
      audio.current.resume();
      const osc = audio.current.createOscillator(),
        gain = audio.current.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, audio.current.currentTime);
      gain.gain.setValueAtTime(0.04, audio.current.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        audio.current.currentTime + 0.35,
      );
      osc.connect(gain);
      gain.connect(audio.current.destination);
      osc.start();
      osc.stop(audio.current.currentTime + 0.35);
    } catch {}
  }
  function requireSession() {
    const session = chainRef.current;
    if (!session) throw new Error("请先连接测试网钱包");
    return session;
  }
  async function pullChainFly(id, label, type) {
    const session = requireSession();
    const next = await readFly(session.contract, id);
    commitFly(next);
    setTokenId(Number(id));
    if (label) record(label, type);
    return next;
  }
  async function sendChain(write, label, type) {
    const token = beginOperation();
    if (token === null) return null;
    try {
      const session = requireSession();
      if (tokenId == null) throw new Error("请先在测试网铸造一只果蝇");
      const receipt = await waitAction(write(session.contract, tokenId));
      setPendingTx(receipt.hash);
      if (token !== operation.current) return null;
      await pullChainFly(tokenId, label, type);
      return receipt;
    } catch (error) {
      notify(
        error.code === 4001
          ? "已取消签名"
          : error.shortMessage || error.message,
        "error",
      );
      return null;
    } finally {
      finishOperation(token);
    }
  }
  async function handleTraining(channel) {
    const token = beginOperation();
    if (token === null) return;
    try {
      setStimulus(channel);
      tone(300 + channel * 180);
      if (chainModeRef.current) {
        finishOperation(token);
        const before = latest.current;
        const receipt = await sendChain(
          (contract, id) => contract.train(id, channel),
          `${stimuli[channel].label} · 已写入测试网`,
          "train",
        );
        setStimulus(null);
        if (receipt)
          notify(
            `${stimuli[channel].label}已上链${
              latest.current.brain.learning[channel] !==
              before.brain.learning[channel]
                ? ` · 学习参数 +${latest.current.brain.learning[channel] - before.brain.learning[channel]}`
                : ""
            }`,
          );
        return;
      }
      const before = latest.current,
        next = train(before, channel);
      commitFly(next);
      record(
        `${stimuli[channel].label} · 学习参数 +${next.brain.learning[channel] - before.brain.learning[channel]}`,
        "train",
      );
      later(() => {
        if (token !== operation.current) return;
        finishOperation(token);
        setStimulus(null);
        notify(`${stimuli[channel].label}已写入学习状态`);
      }, 1300);
    } catch (error) {
      finishOperation(token);
      setStimulus(null);
      notify(error.message, "error");
    }
  }
  async function handleSleep() {
    if (currentBusy.current) return;
    try {
      if (chainModeRef.current) {
        const waking = latest.current.brain.dormant;
        const receipt = await sendChain(
          (contract, id) => (waking ? contract.wake(id) : contract.sleep(id)),
          waking ? "测试网苏醒" : "测试网休眠",
          waking ? "wake" : "sleep",
        );
        if (receipt) {
          tone(waking ? 550 : 180);
          notify(waking ? "链上已苏醒" : "链上已休眠");
        }
        return;
      }
      if (latest.current.brain.dormant) {
        commitFly(wake(latest.current));
        record("从休眠中苏醒", "wake");
        tone(550);
      } else {
        commitFly(sleep(latest.current));
        record("进入休眠 · 模拟时钟暂停", "sleep");
        tone(180);
      }
    } catch (error) {
      notify(error.message, "error");
    }
  }
  async function handleRebirth() {
    if (chainModeRef.current) {
      setReborn(true);
      tone(740);
      const receipt = await sendChain(
        (contract, id) => contract.rebirth(id),
        "测试网转生 · 学习状态保留",
        "rebirth",
      );
      later(() => setReborn(false), 2200);
      if (receipt) notify("转生已上链，记忆仍然属于它");
      return;
    }
    const token = beginOperation();
    if (token === null) return;
    setReborn(true);
    tone(740);
    later(() => {
      if (token !== operation.current) return;
      commitFly(rebirth(latest.current));
      record("新的一世 · 学习与神经状态保留", "rebirth");
      finishOperation(token);
      notify("转生完成，记忆仍然属于它");
    }, 900);
    later(() => setReborn(false), 2200);
  }
  async function handleMint() {
    const token = beginOperation();
    if (token === null) return;
    try {
      const session = requireSession();
      const seed = mintSeedFromDna(latest.current.dna);
      const receipt = await waitAction(session.contract.mint(seed));
      setPendingTx(receipt.hash);
      const minted =
        tokenIdFromReceipt(session.contract, receipt) ??
        (
          await findOwnedTokenIds(
            session.contract,
            session.address,
            deployment?.fromBlock ?? 0,
          )
        ).at(-1);
      if (minted == null) throw new Error("铸造后未读到 tokenId");
      if (token !== operation.current) return;
      await pullChainFly(minted, `测试网铸造 · token #${minted}`, "mint");
      notify(`已铸造测试网灵魂 #${minted}`);
    } catch (error) {
      notify(
        error.code === 4001
          ? "已取消签名"
          : error.shortMessage || error.message,
        "error",
      );
    } finally {
      finishOperation(token);
    }
  }
  function leaveChain() {
    chainRef.current = null;
    chainModeRef.current = false;
    setChainMode(false);
    setWallet(null);
    setTokenId(null);
    setPendingTx(null);
    const local = loadLab();
    commitFly(local.fly);
    setEvents(local.events);
    setArchive(local.archive);
    setMaze(null);
    setProof(null);
    notify("已回到本地仪式");
  }
  async function saveCheckpoint() {
    const token = beginOperation();
    if (token === null) return;
    try {
      const snapshot = await checkpoint(latest.current);
      if (token !== operation.current) return;
      setArchive(snapshot);
      record("记忆已封存 · SHA-256 校验", "save");
      notify("记忆已封存在此浏览器，可导出到其他设备");
      tone(600);
    } catch (error) {
      notify(error.message, "error");
    } finally {
      finishOperation(token);
    }
  }
  async function exportCheckpoint() {
    const token = beginOperation();
    if (token === null) return;
    try {
      const snapshot = await checkpoint(latest.current);
      if (token !== operation.current) return;
      setArchive(snapshot);
      setExportData(JSON.stringify(snapshot, null, 2));
      setModal("export");
      record("完整生命档案已准备 · 可下载或复制", "export");
    } catch (error) {
      notify(error.message, "error");
    } finally {
      finishOperation(token);
    }
  }
  async function importCheckpoint(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (chainModeRef.current) {
      notify("链上灵魂请用合约交易改写，不要用本地档案覆盖", "error");
      return;
    }
    const token = beginOperation();
    if (token === null) return;
    try {
      if (file.size > 100000) throw new Error("档案超过大小限制（100 KB）");
      const snapshot = validateCheckpointEnvelope(
        JSON.parse(await file.text()),
      );
      const state = await restoreCheckpoint(snapshot);
      if (token !== operation.current) return;
      commitFly(state);
      setArchive(snapshot);
      setMaze(null);
      setProof(null);
      record("从外部档案恢复 · 完整性校验通过", "restore");
      notify("已恢复同一只果蝇的完整状态");
      tone(680);
    } catch (error) {
      notify(error.message || "无法读取档案", "error");
    } finally {
      finishOperation(token);
    }
  }
  async function restoreLocal() {
    if (!archive) return;
    if (chainModeRef.current) {
      notify("链上状态以合约为准，本地封存只作备份", "error");
      return;
    }
    const token = beginOperation();
    if (token === null) return;
    try {
      const state = await restoreCheckpoint(archive);
      if (token !== operation.current) return;
      commitFly(state);
      setMaze(null);
      setProof(null);
      record("回到已封存的生命状态", "restore");
      notify("学习参数、随机状态和模拟时钟已恢复");
    } catch (error) {
      notify(error.message, "error");
    } finally {
      finishOperation(token);
    }
  }
  async function prove() {
    setProving(true);
    setProof(null);
    try {
      const result = await proveContinuity(latest.current);
      await new Promise((resolve) => setTimeout(resolve, 600));
      setProof(result);
      record(
        result.equal
          ? "恢复验证完成 · 连续 64 步完全一致"
          : "恢复验证未通过 · 状态不一致",
        "proof",
      );
      tone(820);
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setProving(false);
    }
  }
  function startMaze() {
    const token = beginOperation();
    if (token === null) return;
    try {
      const result = runMaze(latest.current);
      setMaze(result);
      setMazeFrame(0);
      tone(400);
      later(
        () => {
          if (token !== operation.current) return;
          if (!chainModeRef.current) commitFly(result.state);
          finishOperation(token);
          record(
            result.success
              ? `寻果挑战完成 · ${result.steps} 步 · ${result.score} 分`
              : "寻果挑战结束 · 等待下一次探索",
            "maze",
          );
          notify(
            result.success
              ? "找到花蜜！已获得「初次觅食者」成就"
              : "这一轮没有找到出口，再训练后试试",
          );
        },
        result.path.length * 110 + 100,
      );
    } catch (error) {
      finishOperation(token);
      notify(error.message, "error");
    }
  }
  async function connectWallet() {
    if (wallet && chainMode) {
      setModal("wallet");
      return;
    }
    if (!window.ethereum) {
      setModal("wallet");
      return;
    }
    try {
      const nextDeployment = deployment || (await loadDeployment());
      setDeployment(nextDeployment);
      if (!nextDeployment?.address) {
        setModal("wallet");
        notify("测试网合约尚未部署，先完成本地发布脚本", "error");
        return;
      }
      const session = await connectChain(window.ethereum, nextDeployment);
      chainRef.current = session;
      chainModeRef.current = true;
      setChainMode(true);
      setWallet(session.address);
      const ids = await findOwnedTokenIds(
        session.contract,
        session.address,
        nextDeployment.fromBlock ?? 0,
      );
      if (ids.length) {
        await pullChainFly(ids[0], `读取测试网灵魂 #${ids[0]}`, "restore");
        notify(`已接入 BSC 测试网 · #${ids[0]}`);
      } else {
        notify("已切到 BSC 测试网。此地址还没有果蝇，可在祭坛铸造。");
      }
      setModal("wallet");
    } catch (error) {
      notify(
        error.code === 4001
          ? "已取消钱包连接"
          : error.shortMessage || error.message || "钱包连接失败，请重试",
        "error",
      );
    }
  }
  const status = fly.brain.dormant ? "DORMANT" : reborn ? "REBORN" : "AWAKE",
    spikes = fly.brain.spikes.toString(2).replaceAll("0", "").length;
  const nav = (id) => {
    setNavOpen(false);
    go(id);
  };
  return (
    <LocaleContext.Provider value={{ locale, tx }}>
      <a className="skip-link" href="/swarm.html">
        {tx("altar.skip")}
      </a>
      <header className="site-header">
        <a
          className="brand"
          href="#home"
          onClick={(e) => {
            e.preventDefault();
            nav("home");
          }}
          aria-label={tx("altar.aria")}
        >
          <FlyMark />
          <span>
            IMMORTAL<small>FRUIT FLIES</small>
          </span>
        </a>
        <nav className={navOpen ? "open" : ""} aria-label={tx("nav.label")}>
          <a href="/" onClick={() => setNavOpen(false)}>
            <small>00</small>
            {tx("nav.home")}
          </a>
          <a href="/swarm.html" onClick={() => setNavOpen(false)}>
            <small>01</small>
            {tx("nav.pit")}
          </a>
          {[
            ["lab", tx("altar.lab"), "01"],
            ["genesis", tx("altar.genesis"), "02"],
            ["archive", tx("altar.archive"), "03"],
          ].map(([id, label, no]) => (
            <button
              key={id}
              className={activeSection === id ? "active" : ""}
              onClick={() => nav(id)}
            >
              <small>{no}</small>
              {label}
            </button>
          ))}
          <a href="/brain.html" onClick={() => setNavOpen(false)}>
            <small>04</small>
            {tx("nav.canon")}
          </a>
        </nav>
        <div className="header-actions">
          <LocaleSwitch locale={locale} onChange={setLocale} />
          <button
            className={`network-pill ${chainMode ? "chain" : ""}`}
            onClick={() =>
              setModal(chainMode || contractReady ? "wallet" : "about")
            }
          >
            <i />
            {chainMode ? "BSC TESTNET" : "LOCAL RITE"}
            <span>{chainMode ? tx("altar.testnet") : tx("altar.local")}</span>
          </button>
          <button className="wallet-button" onClick={connectWallet}>
            <Wallet size={14} />
            <span>
              {wallet
                ? `${wallet.slice(0, 5)}…${wallet.slice(-4)}`
                : tx("altar.sign")}
            </span>
            <ArrowUpRight size={13} />
          </button>
          <button
            className="menu-button icon-button"
            onClick={() => setNavOpen(!navOpen)}
            aria-label={tx("altar.menu")}
            aria-expanded={navOpen}
          >
            {navOpen ? <X /> : <Menu />}
          </button>
        </div>
      </header>

      <main>
        <section id="home" className="hero container">
          <div className="hero-topline">
            <span>
              <span className="tiny-cross">+</span> A SWARM THAT TRADES TO LIVE
            </span>
            <span>
              EST. 2026 <i /> WRITTEN FOR THE CHAIN
            </span>
          </div>
          <div className="hero-main">
            <div className="hero-copy">
              <div className="hero-eyebrow">
                <span /> APPROACH BECOMES BUY.
              </div>
              <h1>
                THE SWARM
                <br />
                <span>TRADES.</span>
              </h1>
              <div className="hero-chinese">
                {tx("altar.heroLead")}
                <span>{tx("altar.heroTrade")}</span>
              </div>
              <p className="hero-description">
                {tx("altar.heroP")}
                <br />
                {tx("altar.heroP2")}
              </p>
              <div className="hero-buttons">
                <a className="button primary" href="/swarm.html">
                  {tx("altar.enterPit")}
                  <ArrowUpRight size={18} />
                </a>
                <button
                  className="button text-button"
                  onClick={() => {
                    setModal("proof");
                    setProof(null);
                  }}
                >
                  <span className="play-circle">
                    <Play size={11} fill="currentColor" />
                  </span>
                  {tx("altar.witness")}
                </button>
              </div>
              <div className="hero-caption">
                <span className="caption-line" /> SAME REFLEX. ANOTHER MARKET.
              </div>
            </div>
            <div
              className={`hero-stage ${heroView === "neural" ? "neural-mode" : ""} ${fly.brain.dormant ? "dormant" : ""} ${reborn ? "reborn" : ""}`}
            >
              <VitruvianFly
                annotated
                dormant={fly.brain.dormant}
                reborn={reborn}
                neural={heroView === "neural"}
                ticks={fly.brain.ticks}
                status={status}
              />
              {heroView === "neural" && (
                <SignalCanvas brain={fly.brain} variant="network" />
              )}
              <div className="specimen-foot">
                <div>
                  <span
                    className={`status-dot ${fly.brain.dormant ? "amber" : ""}`}
                  />
                  <strong>SOUL #{soulNo}</strong>
                  <small>{status}</small>
                </div>
                <div className="view-switch" aria-label={tx("altar.view")}>
                  <button
                    className={heroView === "specimen" ? "selected" : ""}
                    onClick={() => setHeroView("specimen")}
                    aria-pressed={heroView === "specimen"}
                  >
                    <ScanLine size={13} />
                    {tx("altar.mark")}
                  </button>
                  <button
                    className={heroView === "neural" ? "selected" : ""}
                    onClick={() => setHeroView("neural")}
                    aria-pressed={heroView === "neural"}
                  >
                    <Network size={13} />
                    {tx("altar.nerve")}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="hero-stats">
            <div>
              <small>FIRST FINANCIAL ACT</small>
              <strong>
                TRADE
                <span>{tx("altar.paperBook")}</span>
              </strong>
            </div>
            <div>
              <small>NEXT ACTS</small>
              <strong>
                03<span>{tx("altar.nextActs")}</span>
              </strong>
            </div>
            <div>
              <small>IDENTITY LAYER</small>
              <strong>
                {String(fly.brain.ticks).padStart(4, "0")}
                <span>{tx("altar.sameSoul")}</span>
              </strong>
            </div>
            <a className="scroll-cue" href="/swarm.html">
              <span>
                ENTER THE
                <br />
                PIT
              </span>
              <ArrowDown size={24} />
            </a>
          </div>
        </section>

        <div className="ticker" aria-hidden="true">
          <div>
            {Array.from({ length: 4 }, (_, i) => (
              <React.Fragment key={i}>
                <span>APPROACH BECOMES BUY</span>
                <FlyMark small />
                <span>RETREAT BECOMES SELL</span>
                <span className="ticker-diamond">+</span>
                <span>CULL THE WEAK</span>
                <FlyMark small />
                <span>THE LINEAGE TRADES ON</span>
                <FlyMark small />
              </React.Fragment>
            ))}
          </div>
        </div>

        <SwarmTape />

        <section id="lab" className="lab-section container">
          <SectionLabel number="01" right="OBSERVE · INSCRIBE · AWAKEN">
            THE ALTAR
          </SectionLabel>
          <div className="section-heading">
            <div>
              <h2>
                {tx("altar.labRemember")}
                <br />
                <span>{tx("altar.labWritten")}</span>
              </h2>
            </div>
            <p>
              {tx("altar.labP")}
              <br />
              {tx("altar.labP2")}
            </p>
          </div>
          <div className="lab-shell">
            <div className="lab-topbar">
              <div className="lab-tabs" role="tablist" aria-label="实验模式">
                {[
                  ["train", "感知训练", FlaskConical],
                  ["maze", "寻果挑战", Flag],
                  ["brain", "神经图谱", Network],
                ].map(([id, label, Icon]) => (
                  <button
                    key={id}
                    role="tab"
                    aria-selected={labTab === id}
                    className={labTab === id ? "selected" : ""}
                    onClick={() => {
                      if (!busy) setLabTab(id);
                    }}
                    disabled={busy}
                  >
                    <Icon size={14} />
                    {label}
                  </button>
                ))}
              </div>
              <span className="lab-live">
                <i className={fly.brain.dormant ? "amber" : ""} />
                {fly.brain.dormant ? "SIMULATION PAUSED" : "SIMULATION ACTIVE"}
              </span>
            </div>
            <div className="lab-body">
              <div
                className={`experiment-view ${stimulus !== null ? "stimulated" : ""} ${reborn ? "rebirth-flash" : ""}`}
                role="tabpanel"
                aria-label={
                  labTab === "maze"
                    ? "寻果挑战"
                    : labTab === "brain"
                      ? "神经图谱"
                      : "感知训练"
                }
              >
                <div className="viewport-meta">
                  <span>
                    {labTab === "train"
                      ? "CONSECRATION TABLE"
                      : labTab === "maze"
                        ? "FORAGING CIRCUIT / 001"
                        : "NEURAL OBSERVATORY"}
                  </span>
                  <span>SOUL_{soulNo}</span>
                </div>
                {labTab === "train" && (
                  <>
                    <div className="chamber-grid" />
                    <div className="chamber-orbit o1" />
                    <div className="chamber-orbit o2" />
                    <div
                      className={`chamber-specimen ${fly.brain.dormant ? "resting" : ""}`}
                    >
                      <VitruvianFly
                        dormant={fly.brain.dormant}
                        reborn={reborn}
                        ticks={fly.brain.ticks}
                        status={status}
                      />
                    </div>
                    <div className="stimulus-target target-one">
                      <Droplets size={15} />
                      <span>NECTAR</span>
                    </div>
                    <div className="stimulus-target target-two">
                      <Sun size={15} />
                      <span>LIGHT</span>
                    </div>
                    <div className="stimulus-target target-three">
                      <Shield size={15} />
                      <span>REFLEX</span>
                    </div>
                    {stimulus !== null && (
                      <div
                        className={`stimulus-wave ${stimuli[stimulus].color}`}
                      />
                    )}
                    <div className="chamber-caption">
                      {stimulus !== null
                        ? `${stimuli[stimulus].english} SIGNAL RECEIVED`
                        : fly.brain.dormant
                          ? "等待下一次苏醒"
                          : "选择一个信号，观察生命的回应"}
                      <span>
                        {stimulus !== null
                          ? "学习参数正在改变"
                          : "每次训练执行 32 步确定性模拟"}
                      </span>
                    </div>
                  </>
                )}
                {labTab === "brain" && (
                  <>
                    <SignalCanvas brain={fly.brain} variant="network" />
                    <div className="brain-legend">
                      <span>
                        <i />
                        膜电位
                      </span>
                      <span>
                        <i />
                        脉冲传递
                      </span>
                      <a href="/brain.html">打开 MaleCNS 活体实验室</a>
                    </div>
                  </>
                )}
                {labTab === "maze" && (
                  <>
                    <div className="maze-grid" style={{ "--cols": 15 }}>
                      {MAZE.flatMap((row, y) =>
                        row.split("").map((cell, x) => {
                          const visited = maze?.path
                              .slice(0, mazeFrame + 1)
                              .some(([a, b]) => a === x && b === y),
                            current = maze ? maze.path[mazeFrame] : [1, 1];
                          return (
                            <div
                              className={`maze-cell ${cell === "1" ? "wall" : ""} ${visited ? "visited" : ""} ${x === 13 && y === 7 ? "goal" : ""}`}
                              key={`${x}-${y}`}
                            >
                              {current[0] === x && current[1] === y ? (
                                <FlyMark small />
                              ) : x === 13 && y === 7 ? (
                                <Droplets size={14} />
                              ) : visited ? (
                                <i />
                              ) : null}
                            </div>
                          );
                        }),
                      )}
                    </div>
                    <div className="maze-caption">
                      <span>
                        {busy
                          ? "果蝇正在自主探索"
                          : maze
                            ? `${maze.success ? "挑战完成" : "探索结束"} · ${maze.steps} 步 · ${maze.score} 分`
                            : "跟随气味，找到迷宫深处的花蜜。"}
                      </span>
                      <small>
                        {chainMode
                          ? "本地挑战 · 不改写链上状态"
                          : "本地挑战 · 不涉及奖励或排名结算"}
                      </small>
                    </div>
                  </>
                )}
                <div className="viewport-footer">
                  <span>
                    <span className="tiny-cross">+</span> BRAIN /{" "}
                    {fly.brain.ticks.toLocaleString()} STEPS
                  </span>
                  <button
                    className="sound-button"
                    onClick={() => setSound(!sound)}
                    aria-label={sound ? "关闭交互音效" : "开启交互音效"}
                  >
                    {sound ? <Volume2 size={14} /> : <VolumeX size={14} />}
                    <span>SOUND {sound ? "ON" : "OFF"}</span>
                  </button>
                </div>
              </div>
              <aside className="brain-panel">
                <div className="panel-heading">
                  <span>ALTAR READINGS</span>
                  <Activity size={14} />
                </div>
                <div className="panel-specimen">
                  <span className="specimen-avatar">
                    <FlyMark />
                  </span>
                  <div>
                    <h3>
                      {chainMode ? "On-chain" : "Amber"} <span>#{soulNo}</span>
                    </h3>
                    <p>
                      GEN 0 <span>·</span> 第 {fly.brain.incarnation} 世
                      {chainMode ? " · 97" : ""}
                    </p>
                  </div>
                  <span
                    className={`status-dot ${fly.brain.dormant ? "amber" : ""}`}
                  />
                </div>
                <div className="energy-label">
                  <span>生命能量</span>
                  <strong>
                    {Math.round(fly.brain.energy / 10)}
                    <small> / 100</small>
                  </strong>
                </div>
                <div className="energy-track">
                  <i style={{ width: `${fly.brain.energy / 10}%` }} />
                </div>
                <div className="learning-title">
                  <span>LEARNED BEHAVIOUR</span>
                  <span>习性</span>
                </div>
                {["嗅觉偏好", "趋光反应", "回避敏感"].map((label, i) => (
                  <div className="learning-row" key={label}>
                    <span>{label}</span>
                    <div>
                      <i style={{ width: `${fly.brain.learning[i] / 10}%` }} />
                    </div>
                    <b>{Math.round(fly.brain.learning[i] / 10)}</b>
                  </div>
                ))}
                <div className="neural-meter">
                  <div>
                    <span>NEURAL ACTIVITY</span>
                    <strong>
                      {spikes}
                      <small> / 16 FIRING</small>
                    </strong>
                  </div>
                  <NeuralBars brain={fly.brain} />
                </div>
                <div className="life-controls">
                  <button
                    onClick={handleSleep}
                    disabled={busy || (chainMode && tokenId == null)}
                  >
                    {fly.brain.dormant ? (
                      <Play size={13} />
                    ) : (
                      <Pause size={13} />
                    )}{" "}
                    {fly.brain.dormant ? "唤醒" : "休眠"}
                  </button>
                  <button
                    onClick={handleRebirth}
                    disabled={busy || (chainMode && tokenId == null)}
                  >
                    <RotateCcw size={13} /> 转生
                  </button>
                  {chainMode && tokenId == null ? (
                    <button onClick={handleMint} disabled={busy}>
                      <Fingerprint size={13} /> 铸造
                    </button>
                  ) : (
                    <button onClick={saveCheckpoint} disabled={busy}>
                      <Box size={13} /> 封存
                    </button>
                  )}
                </div>
                <p className="local-note">
                  <LockKeyhole size={11} />
                  {chainMode
                    ? tokenId == null
                      ? "已连测试网 · 铸造后状态以合约为准"
                      : `链上灵魂 #${tokenId} · 每次改写需要签名`
                    : "状态自动保存在此浏览器"}
                </p>
              </aside>
            </div>
            <div className="stimulus-controls">
              {labTab === "maze" ? (
                <>
                  <div className="challenge-description">
                    <Flag size={18} />
                    <span>
                      第一场挑战<small>学习偏好会影响路径选择</small>
                    </span>
                  </div>
                  <button
                    className="button primary"
                    disabled={busy || fly.brain.dormant}
                    onClick={startMaze}
                  >
                    {busy ? "正在探索…" : maze ? "再次挑战" : "开始寻果"}
                    <ArrowUpRight size={16} />
                  </button>
                </>
              ) : labTab === "brain" ? (
                <div className="model-description">
                  <CircleDot size={17} />
                  <span>
                    16 个节点。3 组学习参数。一个连续的状态。
                    <small>
                      图中电位和脉冲来自当前轻量模型；连接布局为示意。
                    </small>
                  </span>
                  <button
                    className="text-link"
                    onClick={() => setModal("about")}
                  >
                    了解模型
                    <ArrowUpRight size={14} />
                  </button>
                </div>
              ) : chainMode && tokenId == null ? (
                <>
                  <div className="challenge-description">
                    <Fingerprint size={18} />
                    <span>
                      测试网还没有属于你的果蝇
                      <small>
                        铸造会把当前 DNA 写成 seed，状态随后以合约为准
                      </small>
                    </span>
                  </div>
                  <button
                    className="button primary"
                    disabled={busy}
                    onClick={handleMint}
                  >
                    铸造到 BSC 测试网
                    <ArrowUpRight size={16} />
                  </button>
                </>
              ) : (
                stimuli.map((s, i) => (
                  <button
                    key={s.english}
                    className={`stimulus-button ${s.color} ${stimulus === i ? "sending" : ""}`}
                    onClick={() => handleTraining(i)}
                    disabled={busy || fly.brain.dormant}
                  >
                    <span className="stimulus-icon">
                      <s.icon size={20} />
                    </span>
                    <span>
                      <strong>{s.label}</strong>
                      <small>{s.description}</small>
                    </span>
                    <span className="stimulus-code">
                      0{i + 1}
                      <ArrowUpRight size={15} />
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
          <div className="below-lab">
            <span>
              <i />
              {chainMode
                ? tokenId == null
                  ? "BSC TESTNET · 已连接，等待铸造"
                  : `BSC TESTNET · TOKEN #${tokenId}`
                : contractReady
                  ? "BSC TESTNET READY · 连接钱包后上链"
                  : "INDEPENDENT RITE · 本地模拟，测试网待部署"}
            </span>
            <button onClick={() => setModal("about")}>
              关于这个生命模型
              <CircleHelp size={13} />
            </button>
          </div>
        </section>

        <section id="genesis" className="genesis-section container">
          <SectionLabel number="02" right="THE ORIGINAL BLOODLINE">
            THE BLOODLINE
          </SectionLabel>
          <div className="section-heading">
            <div>
              <h2>
                1,024 个被量过的身体。
                <br />
                <span>各自不同的以后。</span>
              </h2>
            </div>
            <div className="genesis-description">
              <p>
                圆规先写下身份。
                <br />
                经历，才让它成为独一无二的那一只。
              </p>
              <span className="outlined-tag">GEN 0 · 发行计划</span>
            </div>
          </div>
          <div className="collection-grid">
            <SoulCard
              index="0001"
              name="AMBER"
              tone="gold"
              descriptor="琥珀躯干 / 被量过的第一只"
              brain={fly.brain}
              onOpen={() =>
                setModal({
                  type: "card",
                  name: "AMBER",
                  id: "0001",
                  tone: "gold",
                })
              }
            />
            <SoulCard
              index="0007"
              name="ECHO"
              tone="cyan"
              descriptor="回声翅脉 / 光的抄本"
              onOpen={() =>
                setModal({
                  type: "card",
                  name: "ECHO",
                  id: "0007",
                  tone: "cyan",
                })
              }
            />
            <SoulCard
              index="0042"
              name="PHANTOM"
              tone="violet"
              descriptor="幽影神经 / 边界上的名字"
              onOpen={() =>
                setModal({
                  type: "card",
                  name: "PHANTOM",
                  id: "0042",
                  tone: "violet",
                })
              }
            />
          </div>
          <div className="collection-caption">
            <span>01 — 03 / VISUAL STUDIES</span>
            <p>创世卡面概念 · 具体性状与发行规则将在开放铸造前公布</p>
            <button className="text-link" onClick={() => setModal("genesis")}>
              查看创世计划
              <ArrowUpRight size={14} />
            </button>
          </div>
        </section>

        <section className="manifesto-section">
          <div className="container">
            <div className="manifesto-eyebrow">
              <FlyMark small /> THE CONTINUITY PROTOCOL
            </div>
            <h2>
              人扮演了造物者。
              <br />
              <span>果蝇被写回生命。</span>
            </h2>
            <p>
              身份被量过，状态被写下。
              <br />
              一次新的苏醒，仍是同一只。
            </p>
            <div className="rule-grid">
              <RuleTile icon={Fingerprint} number="I" title="一个身份">
                编号与基因保持一致。每一世都属于同一只果蝇。
              </RuleTile>
              <RuleTile icon={Network} number="II" title="完整的状态">
                保存学习参数、神经电位、随机状态和模拟时钟。
              </RuleTile>
              <RuleTile icon={InfinityIcon} number="III" title="下一次苏醒">
                导出档案，在另一台设备继续。让延续可以被验证。
              </RuleTile>
            </div>
          </div>
        </section>

        <section id="archive" className="archive-section container">
          <SectionLabel number="03" right="PRESERVE · VERIFY · RESUME">
            THE SCRIPTORIUM
          </SectionLabel>
          <div className="section-heading">
            <div>
              <h2>
                把这一刻，
                <br />
                <span>交给下一个自己。</span>
              </h2>
            </div>
            <p>
              封存完整状态，带走生命档案。
              <br />
              换一台设备，它仍能从同一个瞬间继续。
            </p>
          </div>
          <div className="vault-grid">
            <div className="vault-main">
              <div className="vault-title">
                <Box size={20} />
                <span>SOUL #{soulNo} / MEMORY CORE</span>
                <span className="local-tag">
                  {chainMode ? "TESTNET" : "LOCAL"}
                </span>
              </div>
              <div className="memory-visual">
                <div className="memory-ring r1" />
                <div className="memory-ring r2" />
                <div className="memory-ring r3" />
                <div className="memory-cube">
                  <Fingerprint size={42} />
                </div>
                <span className="memory-label left">
                  IDENTITY
                  <br />
                  <b>{soulNo}</b>
                </span>
                <span className="memory-label right">
                  INCARNATION
                  <br />
                  <b>{String(fly.brain.incarnation).padStart(2, "0")}</b>
                </span>
              </div>
              <div className="hash-record">
                <small>LAST CHECKPOINT / SHA-256</small>
                <div>
                  <code>
                    {archive
                      ? `${archive.sha256.slice(0, 20)}…${archive.sha256.slice(-12)}`
                      : "等待第一次封存"}
                  </code>
                  {archive && (
                    <button
                      className="icon-button"
                      aria-label="复制档案校验值"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(archive.sha256);
                          notify("校验值已复制");
                        } catch {
                          notify("无法访问剪贴板，请从导出文件读取", "error");
                        }
                      }}
                    >
                      <Copy size={13} />
                    </button>
                  )}
                </div>
                <p>
                  {archive
                    ? `${new Date(archive.savedAt).toLocaleString("zh-CN")} · ${archive.state.brain.ticks} 模拟步`
                    : chainMode
                      ? "链上状态请用交易改写；此处封存只作本机备份。"
                      : "当前状态已自动保存在本地，可随时导出。"}
                </p>
              </div>
              <div className="vault-actions">
                <button
                  className="button primary"
                  onClick={exportCheckpoint}
                  disabled={busy}
                >
                  <Download size={15} />
                  导出生命档案
                  <ArrowUpRight size={15} />
                </button>
                <button
                  className="button secondary"
                  onClick={() => fileInput.current.click()}
                  disabled={busy || chainMode}
                >
                  <Upload size={15} />
                  导入恢复
                </button>
              </div>
              <input
                ref={fileInput}
                type="file"
                accept=".json,application/json"
                className="file-input"
                onChange={importCheckpoint}
                aria-label="导入生命档案"
              />
              <button
                className="restore-link"
                onClick={restoreLocal}
                disabled={!archive || busy || chainMode}
              >
                <RotateCcw size={12} />
                回到上次封存的状态
              </button>
            </div>
            <div className="timeline-panel">
              <div className="timeline-title">
                <span>生命的足迹</span>
                <small>{String(events.length).padStart(2, "0")} RECORDS</small>
              </div>
              <div className="timeline">
                {events.slice(0, 6).map((event, i) => (
                  <div
                    className={`timeline-event ${i === 0 ? "latest" : ""}`}
                    key={`${event.date}-${i}`}
                  >
                    <i />
                    <div>
                      <span>{event.label}</span>
                      <small>
                        {new Date(event.date).toLocaleDateString("zh-CN")} /{" "}
                        {timeLabel(event.date)}
                      </small>
                    </div>
                    {i === 0 && <span className="new-tag">最新</span>}
                  </div>
                ))}
              </div>
              <div className="continuity-test">
                <div>
                  <FileCheck2 size={19} />
                  <span>
                    恢复，是可以验证的。
                    <small>比较保存前后连续 64 步的完整状态。</small>
                  </span>
                </div>
                <button
                  className="text-link"
                  onClick={() => {
                    setModal("proof");
                    setProof(null);
                  }}
                >
                  运行恢复验证
                  <ArrowUpRight size={16} />
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="closing container">
          <div className="closing-rule" />
          <div>
            <span>SMALL LIFE.</span>
            <span>
              WRITTEN AGAIN<span className="closing-star">+</span>
            </span>
          </div>
          <p>
            下一世见。
            <button onClick={() => go("lab")}>
              回到实验室
              <ArrowUpRight size={15} />
            </button>
          </p>
        </section>
      </main>
      <footer className="site-footer container">
        <a className="brand" href="#home">
          <FlyMark />
          <span>
            IMMORTAL<small>FRUIT FLIES</small>
          </span>
        </a>
        <p>
          一个先交易、再扩展金融行为的数字生命实验。
          <br />
          <span>
            {chainMode
              ? "BSC 测试网闭环 · 纸面蜂群另开 · 主网未开放"
              : contractReady
                ? "身份可写测试网 · 交易蜂群仍是纸面账本"
                : "纸面交易已运行 · 身份测试网待部署"}
          </span>
        </p>
        <div>
          <button onClick={() => setModal("about")}>
            实验说明
            <ArrowUpRight size={12} />
          </button>
          <a href="/swarm.html">
            交易场
            <ArrowUpRight size={12} />
          </a>
          <a href="/brain.html">
            连接组
            <ArrowUpRight size={12} />
          </a>
          <a
            href="https://www.research.google/blog/a-connectomics-milestone-mapping-the-complete-male-fruit-fly-brain/"
            target="_blank"
            rel="noreferrer"
          >
            研究起点
            <ArrowUpRight size={12} />
          </a>
          <small>© 2026 IMMORTAL</small>
        </div>
      </footer>
      {storageWarning && (
        <div className="storage-warning" role="alert">
          浏览器无法保存状态，请导出生命档案以保留进度。
          <button onClick={exportCheckpoint}>立即导出</button>
        </div>
      )}
      {toast && (
        <div className={`toast ${toast.type}`} role="status">
          {toast.type === "error" ? (
            <CircleHelp size={17} />
          ) : (
            <Check size={17} />
          )}
          <span>{toast.message}</span>
          <button
            className="icon-button"
            onClick={() => setToast(null)}
            aria-label="关闭提示"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {modal === "export" && (
        <Modal
          title="把这一世，带在身边。"
          eyebrow="LIFE ARCHIVE / EXPORT"
          onClose={() => setModal(null)}
        >
          <p>
            这份档案包含身份、习性与完整模型状态。下载 JSON
            文件后，可通过「导入恢复」继续；也可以复制全文，自行保存为 .json
            文件。
          </p>
          <textarea
            className="archive-json"
            aria-label="完整生命档案 JSON"
            value={exportData}
            readOnly
            spellCheck={false}
          />
          <div className="export-actions">
            <button
              className="button primary"
              onClick={() => {
                downloadFile(
                  exportData,
                  `immortal-soul-0001-${Date.now()}.json`,
                  "application/json",
                );
                notify("已发起下载；若浏览器未保存，可复制完整档案");
              }}
            >
              <Download size={16} />
              下载 JSON 文件
            </button>
            <button
              className="button secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(exportData);
                  notify("完整档案已复制，可保存为 .json 文件");
                } catch {
                  notify("请选中上方档案文本并手动复制", "error");
                }
              }}
            >
              <Copy size={15} />
              复制完整档案
            </button>
          </div>
        </Modal>
      )}
      {modal === "about" && (
        <Modal title="生命的边界，也应该透明。" onClose={() => setModal(null)}>
          <div className="note-badge">
            <FlaskConical size={14} />
            {chainMode
              ? "BSC 测试网 / CANONICAL ON-CHAIN"
              : "本地实验 / LOCAL PROTOTYPE"}
          </div>
          <p>
            产品主循环是<a href="/swarm.html">交易场</a>
            ：趋近与退避被读成买入与卖出，先跑纸面账本。这一页祭坛保存身份、训练与转生，用的是
            16 个节点、3 组学习参数的确定性模型，不是完整生物连接组。MaleCNS 在
            <a href="/brain.html">连接组</a>
            中运行。后续才会打开出借、金库与预测。Flap 嵌入界面尚未制作。
          </p>
          <div className="modal-facts">
            <div>
              <Check size={15} />
              <span>训练确实改变模型参数；休眠会停止模拟时钟。</span>
            </div>
            <div>
              <Check size={15} />
              <span>导出文件包含完整模型状态，可在其他设备恢复。</span>
            </div>
            <div>
              <Check size={15} />
              <span>恢复验证对比相同输入下 64 步的完整结果。</span>
            </div>
          </div>
          <p>
            本地进度保存在浏览器中。测试网模式下，身份与脑状态以合约为准，每次训练、休眠、转生都要签名。迷宫和本地档案仍是本机实验。主网尚未开放。
          </p>
          <p>
            印记、圆规线与旧金属于美术。神经图谱中的电位和脉冲来自当前轻量模型。部署说明见仓库
            docs/TESTNET.md；私钥不要贴进聊天。
          </p>
          <button
            className="button primary"
            onClick={() => {
              setModal(null);
              go("archive");
            }}
          >
            带走我的生命档案
            <ArrowUpRight size={16} />
          </button>
        </Modal>
      )}
      {modal === "proof" && (
        <Modal
          title="同一个瞬间。相同的以后。"
          eyebrow="CONTINUITY / VERIFICATION"
          onClose={() => setModal(null)}
        >
          <p>
            我们复制当前状态，将一份序列化为文件后恢复，再让两份模型接收相同的
            64 步输入。比较最终完整状态，验证恢复有没有丢失信息。
          </p>
          <div className="proof-flow">
            <span>
              <Activity size={19} />
              连续运行
            </span>
            <i />
            <span>
              <Box size={19} />
              保存 → 恢复
            </span>
            <i />
            <span>
              <FileCheck2 size={19} />
              状态对比
            </span>
          </div>
          {proof ? (
            <div className="proof-result">
              <div>
                <Check size={20} />
                <strong>
                  {proof.equal ? "64 / 64 · 轨迹一致" : "状态未通过对比"}
                </strong>
              </div>
              <span>REFERENCE</span>
              <code>{proof.referenceHash}</code>
              <span>RESTORED</span>
              <code>{proof.restoredHash}</code>
              <p>
                校验在当前设备独立执行，未修改你的果蝇。跨设备验证可使用「导出生命档案」。
              </p>
            </div>
          ) : (
            <div className="proof-placeholder">
              <Fingerprint size={45} />
              <span>等待验证你的生命状态</span>
            </div>
          )}
          <button
            className="button primary full"
            onClick={prove}
            disabled={proving}
          >
            {proving
              ? "正在运行两条状态轨迹…"
              : proof
                ? "再次验证"
                : "开始恢复验证"}
            {proving ? (
              <span className="spinner" />
            ) : (
              <ArrowUpRight size={17} />
            )}
          </button>
        </Modal>
      )}
      {modal === "wallet" && (
        <Modal
          title={
            chainMode
              ? "已接入 BSC 测试网"
              : wallet
                ? "钱包已连接"
                : contractReady
                  ? "连接后才能写入测试网。"
                  : "实验无需钱包，也能在本地开始。"
          }
          eyebrow="WALLET / TESTNET"
          onClose={() => setModal(null)}
        >
          {chainMode && wallet ? (
            <>
              <code className="wallet-address">{wallet}</code>
              <p>
                网络 {BSC_TESTNET.name}（{BSC_TESTNET.chainId}）。
                {tokenId == null
                  ? " 此地址还没有果蝇，可在祭坛免费铸造。"
                  : ` 当前灵魂 #${tokenId}，状态以 getFly 为准。`}
              </p>
              {deployment?.address && (
                <p>
                  合约{" "}
                  <a
                    href={explorerAddress(deployment.address)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {deployment.address.slice(0, 8)}…
                    {deployment.address.slice(-6)}
                  </a>
                  {pendingTx && (
                    <>
                      {" "}
                      · 最近交易{" "}
                      <a
                        href={explorerTx(pendingTx)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {pendingTx.slice(0, 10)}…
                      </a>
                    </>
                  )}
                </p>
              )}
              <div className="export-actions">
                {tokenId == null && (
                  <button
                    className="button primary"
                    disabled={busy}
                    onClick={() => {
                      setModal(null);
                      handleMint();
                    }}
                  >
                    铸造到测试网
                  </button>
                )}
                <button
                  className="button secondary"
                  onClick={() => {
                    leaveChain();
                    setModal(null);
                  }}
                >
                  断开并回到本地
                </button>
              </div>
            </>
          ) : !window.ethereum ? (
            <>
              <p>
                当前浏览器未检测到钱包扩展。你仍然可以在本地训练、挑战迷宫，并导出或恢复档案。要把状态写进测试网，请使用带钱包的桌面浏览器。
              </p>
              <div className="note-badge">
                <LockKeyhole size={14} />
                主网铸造尚未开放
              </div>
              <button
                className="button primary"
                onClick={() => {
                  setModal(null);
                  go("lab");
                }}
              >
                进入本地祭坛
                <ArrowUpRight size={17} />
              </button>
            </>
          ) : (
            <>
              <p>
                {contractReady
                  ? "连接后会请求切换到 BSC 测试网，并读取你已有的 ImmortalFly。没有代币时可以免费铸造。每次训练都要签名。"
                  : "测试网合约还没部署。设置 IFF_DEPLOY_KEY 后运行 npm run contracts:deploy:testnet，再刷新本页。在此之前祭坛仍是本地仪式。"}
              </p>
              <div className="note-badge">
                <LockKeyhole size={14} />
                只要测试网 tBNB，不要使用主网私钥流程
              </div>
              <button
                className="button primary"
                onClick={() => {
                  setModal(null);
                  if (contractReady) connectWallet();
                  else go("lab");
                }}
              >
                {contractReady ? "连接并切换测试网" : "先用本地祭坛"}
                <ArrowUpRight size={17} />
              </button>
            </>
          )}
        </Modal>
      )}
      {modal === "genesis" && (
        <Modal
          title="1,024 个最初的身份。"
          eyebrow="GENESIS / COLLECTION PLAN"
          onClose={() => setModal(null)}
        >
          <p>
            Gen0 计划限量 1,024
            只。当前展示的是美术与交互原型，卡面样本不代表已经铸造、可购买或归你所有。
          </p>
          <div className="genesis-steps">
            <div>
              <span>01</span>
              <section>
                <h3>先验证生命延续</h3>
                <p>训练、封存、换设备恢复，公开实验结果。</p>
              </section>
              <Check size={15} />
            </div>
            <div>
              <span>02</span>
              <section>
                <h3>再完成测试网闭环</h3>
                <p>部署 ImmortalFly，用本站祭坛铸造并改写状态。</p>
              </section>
              <Clock size={15} />
            </div>
            <div>
              <span>03</span>
              <section>
                <h3>最后开放创世发行</h3>
                <p>提前公布数量、性状、分配和后续繁衍规则。</p>
              </section>
              <LockKeyhole size={15} />
            </div>
          </div>
          <button
            className="button primary"
            onClick={() => {
              setModal(null);
              go("lab");
            }}
          >
            先认识第一只被量过的果蝇
            <ArrowUpRight size={16} />
          </button>
        </Modal>
      )}
      {modal?.type === "card" && (
        <Modal
          title={modal.name}
          eyebrow={`GENESIS SPECIMEN / SOUL #${modal.id}`}
          onClose={() => setModal(null)}
        >
          <div className={`detail-specimen ${modal.tone}`}>
            <VitruvianFly label={`SOUL #${modal.id}`} />
            <span>GEN 0 / SEAL STUDY</span>
          </div>
          <div className="detail-traits">
            <span>
              原生性状
              <strong>
                {modal.tone === "gold"
                  ? "琥珀躯干"
                  : modal.tone === "cyan"
                    ? "回声翅脉"
                    : "幽影神经"}
              </strong>
            </span>
            <span>
              身份状态<strong>美术样本 · 未发行</strong>
            </span>
            <span>
              计划系列<strong>1,024 GENESIS</strong>
            </span>
          </div>
          <p>
            出生特征保持稳定；未来获得的成就和当前生命状态会改变卡面表现。
            {modal.id === "0001"
              ? "Amber 对应本地实验室里的可交互果蝇。"
              : "该样本展示另一种视觉方向，尚未接入独立实验体。"}
          </p>
          <button
            className="button primary"
            onClick={() => {
              setModal(null);
              go("lab");
            }}
          >
            与 Amber 互动
            <ArrowUpRight size={16} />
          </button>
        </Modal>
      )}
    </LocaleContext.Provider>
  );
}
