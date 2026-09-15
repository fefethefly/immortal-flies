import React, { useState, useRef, useEffect } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUpRight,
  ArrowRight,
  Flame,
  Swords,
  Skull,
  Shield,
  Hexagon,
  Coins,
  Layers,
  LockKeyhole,
  Scale,
  ChartNoAxesCombined,
  ChevronRight,
  X,
  Dna,
  BookOpen,
  Orbit,
  Landmark,
  Box,
  Activity,
} from "lucide-react";
import {
  ECONOMY_DEFAULTS,
  FEE_SPLIT,
  calculateEconomy,
  teamVested,
} from "./economy.mjs";
import { FlyMark } from "./vitruvian.jsx";
import { useLocale } from "./use-locale.mjs";
import { LocaleSwitch } from "./locale-switch.jsx";
import "./economy.css";
const money = (v) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: Number.isInteger(v) ? 0 : 2,
  }).format(v);
const number = (v) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(v);
const fields = [
  ["players", "econ.fields.players", 0, 100000, 100, ""],
  ["payerRate", "econ.fields.payerRate", 0, 60, 1, "%"],
  ["spend", "econ.fields.spend", 0, 100, 1, "$"],
  ["marketVolume", "econ.fields.marketVolume", 0, 100, 1, "$"],
  ["fixedCost", "econ.fields.fixedCost", 0, 100000, 500, "$"],
  ["variableCost", "econ.fields.variableCost", 0, 3, 0.05, "$"],
  ["genesis", "econ.fields.genesis", 1, 992, 1, ""],
  ["tokenPrice", "econ.fields.tokenPrice", 0.0001, 0.02, 0.0001, "$"],
];
const allocation = [
  ["生态奖励", 35, "至少 48 个月；赛季上限"],
  ["流动性计划", 20, "须配有真实对手资产"],
  ["团队长期激励", 15, "12 个月锁定 + 36 个月线性"],
  ["生态国库", 15, "多签、时间锁、公开用途"],
  ["创世社区", 10, "18 个月分期；首批最多 2%"],
  ["创作者与合作", 5, "按交付与归属期释放"],
];
const places = [
  {
    title: "神经熔炉",
    en: "NEURAL FORGE",
    icon: Flame,
    tag: "消耗与成长",
    body: "分解装备，重铸词缀。生命身份始终保留，装备与材料形成持续消耗。",
    detail:
      "6 个装备槽：复眼、神经核、翼膜、外骨骼、肢刃、遗物。普通材料通过游玩取得，付费重铸与外观交付明确。灵魂 NFT 本身不烧毁。",
  },
  {
    title: "血统祭坛",
    en: "BLOODLINE ALTAR",
    icon: Dna,
    tag: "直接授权",
    body: "租用一份稀有基因，缔造新的身体。亲本提供服务，获得一次授权费。",
    detail:
      "授权费付给实际提供性状的亲本持有人；不向祖父母持续抽成。示例总价 30，其中亲本授权 10、协议服务 20，只有协议的 20 进入收入分配。",
  },
  {
    title: "灵魂交易所",
    en: "SOUL EXCHANGE",
    icon: Scale,
    tag: "2.5% · 费率提案",
    body: "基因、装备与历史在这里交换。每一笔交易，公开价格与费用去向。",
    detail:
      "100 的玩家装备交易，97.5 属于卖家，2.5 才是协议收入。代币在公开 DEX 交易，不能把 DEX 成交本金计入项目收入。",
  },
  {
    title: "永生方舟",
    en: "IMMORTAL ARK",
    icon: Box,
    tag: "可独立复原",
    body: "即使世界停止运转，已保存的灵魂仍应拥有下一次苏醒的方法。",
    detail:
      "核心身份、最低完整状态与恢复器公开。代币价格、项目收入或团队是否在线，不能成为读取与基础复原的前置条件。链与数据继续可用仍是必要条件。",
  },
];
function Emblem() {
  return <FlyMark />;
}
function App() {
  const [tab, setTab] = useState("world"),
    [values, setValues] = useState({ ...ECONOMY_DEFAULTS }),
    [preset, setPreset] = useState("growth"),
    [detail, setDetail] = useState(null),
    [month, setMonth] = useState(12);
  const main = useRef(null),
    dialog = useRef(null);
  const r = calculateEconomy(values);
  useEffect(() => {
    if (!detail) return;
    const d = dialog.current,
      previous = document.activeElement;
    d.showModal();
    return () => previous?.focus();
  }, [detail]);
  function navigate(next) {
    setTab(next);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function selectPreset(id) {
    setPreset(id);
    setValues({
      ...ECONOMY_DEFAULTS,
      ...(id === "early"
        ? { players: 1000 }
        : id === "scale"
          ? { players: 50000 }
          : id === "stress"
            ? { payerRate: 5, spend: 10, marketVolume: 3 }
            : {}),
    });
  }
  return (
    <>
      <header className="under-header">
        <a className="under-brand" href="/economy.html">
          <Emblem />
          <span>
            IMMORTAL<small>THE UNDERHIVE</small>
          </span>
        </a>
        <nav aria-label="世界导航">
          {[
            ["world", "深巢圣所", Skull],
            ["economy", "资金沙盘", ChartNoAxesCombined],
            ["token", "发行与归属", Coins],
          ].map(([id, label, Icon]) => (
            <button
              key={id}
              className={tab === id ? "active" : ""}
              onClick={() => navigate(id)}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </nav>
        <span className="world-status">
          <i />
          设计预览 <span>· 未发行</span>
        </span>
      </header>
      <main ref={main}>
        {tab === "world" && (
          <>
            <section className="sanctum">
              <div className="sanctum-art" />
              <div className="scene-grid" />
              <div className="embers" aria-hidden="true">
                {Array.from({ length: 16 }, (_, i) => (
                  <i key={i} style={{ "--i": i }} />
                ))}
              </div>
              <div className="scene-top">
                <span>
                  ACT I <b>/</b> THE UNDERHIVE
                </span>
                <span>
                  <Hexagon size={12} /> BNB CHAIN · WORLD CONCEPT
                </span>
              </div>
              <div className="world-copy">
                <div className="world-eyebrow">
                  <span /> THE SOUL SURVIVES.
                </div>
                <h1>
                  死亡，
                  <br />
                  只是<span>序章。</span>
                </h1>
                <p>
                  在神经圣所苏醒，深入机械深渊。
                  <br />
                  夺取遗物，重铸身体，让血统穿越每一世。
                </p>
                <div className="world-cta">
                  <button
                    className="infernal-button"
                    onClick={() => navigate("economy")}
                  >
                    <Flame size={18} />
                    推演经济循环
                    <ArrowUpRight size={17} />
                  </button>
                  <a href="/" className="world-secondary">
                    进入现有可玩实验
                    <ArrowRight size={15} />
                  </a>
                </div>
                <div className="chapter-rule">
                  <span>01</span>
                  <i />
                  <p>
                    身份永存
                    <br />
                    <small>装备消耗 · 记忆延续</small>
                  </p>
                </div>
              </div>
              <div className="soul-presentation">
                <div className="soul-orbit" />
                <img
                  src="/assets/fly-specimen.png"
                  alt="悬浮在地下神经圣所中的赛博朋克果蝇"
                />
                <span className="soul-label">
                  <i /> AMBER / SOUL 0001<small>GENESIS · 角色概念</small>
                </span>
              </div>
              <aside className="relic-panel">
                <div>
                  <Orbit size={13} />
                  灵魂装备<small>槽位方案</small>
                </div>
                {[
                  [Dna, "神经核", "学习 / 感知"],
                  [Shield, "外骨骼", "抗性 / 耐久"],
                  [Swords, "肢刃", "攻击 / 词缀"],
                ].map(([Icon, title, sub]) => (
                  <button
                    key={title}
                    onClick={() =>
                      setDetail({
                        title,
                        detail:
                          "装备设计提案：" +
                          sub +
                          "影响副本策略。稀有外观、词缀与赛季履历形成差异。此面板展示槽位方向，尚未铸造或拥有这些装备。",
                      })
                    }
                  >
                    <span>
                      <Icon size={20} />
                    </span>
                    <p>
                      {title}
                      <small>{sub}</small>
                    </p>
                    <ChevronRight size={12} />
                  </button>
                ))}
              </aside>
              <div className="scene-footer">
                <span>
                  魂不灭。身可铸。<small>ANOTHER BODY. THE SAME SOUL.</small>
                </span>
                <span>
                  01 / 04 <i>◆</i> 深巢圣所
                </span>
              </div>
            </section>
            <section className="districts">
              {places.map((p) => (
                <button
                  className="district"
                  key={p.title}
                  onClick={() => setDetail(p)}
                >
                  <div className="district-top">
                    <p.icon size={25} />
                    <span>{p.tag}</span>
                  </div>
                  <small>{p.en}</small>
                  <h2>
                    {p.title}
                    <ArrowUpRight size={17} />
                  </h2>
                  <p>{p.body}</p>
                </button>
              ))}
            </section>
            <div className="world-strip">
              <Flame size={20} />
              <p>
                世界越繁盛，已有身份拥有更多被使用的机会。
                <span>奖励由已实现收入支持；持有本身不承诺回报。</span>
              </p>
              <button onClick={() => navigate("economy")}>
                查看资金去向
                <ArrowRight size={16} />
              </button>
            </div>
          </>
        )}
        {tab === "economy" && (
          <section className="economy-layout">
            <div className="page-title">
              <div>
                <small>THE TREASURY / SCENARIO LAB</small>
                <h1>
                  每一笔消费，<span>都有去处。</span>
                </h1>
                <p>
                  调整人数、付费与成本，检查早期权益和团队经营是否同时成立。
                </p>
              </div>
              <span className="scenario-badge">
                <Activity size={13} />
                全部为情景假设 · 非行情或收益预测
              </span>
            </div>
            <div className="preset-bar">
              {[
                ["early", "起步 · 1,000 人"],
                ["growth", "增长 · 10,000 人"],
                ["scale", "规模 · 50,000 人"],
                ["stress", "付费下滑 · 压力"],
              ].map(([id, label]) => (
                <button
                  className={preset === id ? "active" : ""}
                  key={id}
                  onClick={() => selectPreset(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="kpi-grid">
              <Kpi
                title="合格经营收入"
                value={money(r.revenue)}
                note="游戏消费 + 市场实际费用"
              />
              <Kpi
                title="团队经营结余"
                value={money(r.profit)}
                note="45% 收入份额 − 全部运营成本"
                color={r.profit < 0 ? "red" : "cyan"}
              />
              <Kpi
                title="Genesis 贡献池"
                value={money(r.genesisPool)}
                note={`${number(values.genesis)} 枚等权样本：${money(r.genesisSample)} / 枚`}
              />
              <Kpi
                title="回购 / 销毁预算"
                value={money(r.burn)}
                note="同一笔资金只计一次，不代表涨价"
                color="red"
              />
            </div>
            <div className="calculator-grid">
              <aside className="scenario-controls">
                <div className="box-title">
                  <span>01 / 修改假设</span>
                  <button onClick={() => selectPreset("growth")}>重置</button>
                </div>
                {fields.map(([key, label, min, max, step, unit]) => (
                  <div className="scenario-field" key={key}>
                    <label htmlFor={"input-" + key}>{label}</label>
                    <div>
                      <input
                        id={"input-" + key}
                        type="number"
                        min={min}
                        max={max}
                        step={step}
                        value={values[key]}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          if (Number.isFinite(n)) {
                            setPreset("custom");
                            setValues((v) => ({
                              ...v,
                              [key]: Math.max(
                                min,
                                Math.min(max, step >= 1 ? Math.round(n) : n),
                              ),
                            }));
                          }
                        }}
                      />
                      <span>{unit}</span>
                    </div>
                    <input
                      aria-label={label + "滑块"}
                      type="range"
                      min={min}
                      max={max}
                      step={step}
                      value={values[key]}
                      onChange={(e) => {
                        setPreset("custom");
                        setValues((v) => ({
                          ...v,
                          [key]: Number(e.target.value),
                        }));
                      }}
                    />
                  </div>
                ))}
              </aside>
              <div className="ledger-column">
                <div className="ledger-box">
                  <div className="box-title">
                    <span>02 / 收入口径</span>
                    <small>USD 等值 / 月</small>
                  </div>
                  <div className="income-row">
                    <span>自愿游戏消费</span>
                    <strong>{money(r.game)}</strong>
                  </div>
                  <div className="income-row">
                    <span>
                      市场实际手续费{" "}
                      <small>成交 {money(r.traded)} × 2.5%</small>
                    </span>
                    <strong>{money(r.marketFees)}</strong>
                  </div>
                  <p className="ledger-note">
                    卖家所得、DEX
                    交易本金、质押本金与代币融资款不进入分配。未实现币价升值也不是经营收入。
                  </p>
                  <div className="income-total">
                    <span>可分配收入 R</span>
                    <b>{money(r.revenue)}</b>
                  </div>
                </div>
                <div className="ledger-box">
                  <div className="box-title">
                    <span>03 / 资金分配</span>
                    <small>合计 100%</small>
                  </div>
                  <div className="split-bar">
                    {FEE_SPLIT.map((s) => (
                      <i
                        key={s.key}
                        style={{
                          width: s.rate * 100 + "%",
                          background: s.color,
                        }}
                      />
                    ))}
                  </div>
                  {FEE_SPLIT.map((s) => (
                    <div className="split-row" key={s.key}>
                      <i style={{ background: s.color }} />
                      <span>{s.label}</span>
                      <small>{s.rate * 100}%</small>
                      <b>{money(r[s.key])}</b>
                    </div>
                  ))}
                  <div className="burn-calculation">
                    <Flame size={18} />
                    <p>
                      按假设单价折算的销毁量
                      <strong>{number(r.burnTokens)} NECTAR</strong>
                      <small>
                        不含滑点；费用已用 NECTAR 支付时直接销毁对应份额。
                      </small>
                    </p>
                  </div>
                </div>
                <div className="break-even">
                  <Landmark size={23} />
                  <div>
                    <small>团队盈亏平衡</small>
                    <strong>
                      {r.breakEven === null
                        ? "当前单客贡献为负，无法靠扩量回本"
                        : `约 ${number(r.breakEven)} 月活玩家`}
                    </strong>
                    <p>
                      团队收入 {money(r.team)} − 运营成本 {money(r.cost)} ={" "}
                      {money(r.profit)}。代币价格未用于计算经营利润。
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="principle-note">
              <Scale size={20} />
              <p>
                后来者可以增加需求与收入，但不会自动使早期玩家赚钱。
                <span>
                  Genesis 样本假设等权、有效贡献且池中有收入；这里没有计算 NFT
                  买入成本、税费或持仓价格变化，不能换算成承诺年化。
                </span>
              </p>
            </div>
          </section>
        )}
        {tab === "token" && (
          <section className="token-layout">
            <div className="page-title">
              <div>
                <small>NECTAR / ALLOCATION & VESTING</small>
                <h1>
                  团队的收益，<span>写在明处。</span>
                </h1>
                <p>经营收入支持建设，公开的归属代币绑定长期激励。</p>
              </div>
              <span className="scenario-badge">
                <LockKeyhole size={13} />
                参数提案 · 代币未发行
              </span>
            </div>
            <div className="token-summary">
              <div>
                <Coins size={26} />
                <span>
                  NECTAR<small>BEP-20 · 暂用名</small>
                </span>
              </div>
              <div>
                <small>建议创世总量</small>
                <strong>1,000,000,000</strong>
              </div>
              <div>
                <small>持续增发</small>
                <strong>
                  0<span>仅解锁与销毁</span>
                </strong>
              </div>
            </div>
            <div className="allocation-grid">
              <div className="ledger-box">
                <div className="box-title">
                  <span>01 / 公开分配</span>
                  <small>建议值</small>
                </div>
                {allocation.map(([name, percent, note], i) => (
                  <div className="allocation-row" key={name}>
                    <span className="allocation-number">0{i + 1}</span>
                    <div>
                      <strong>{name}</strong>
                      <small>{note}</small>
                    </div>
                    <b>
                      {percent}
                      <small>%</small>
                    </b>
                  </div>
                ))}
              </div>
              <div className="ledger-box vesting-box">
                <div className="box-title">
                  <span>02 / 团队归属</span>
                  <LockKeyhole size={15} />
                </div>
                <h2>
                  前 12 个月零解锁。
                  <br />
                  <span>之后 36 个月，线性归属。</span>
                </h2>
                <label className="month-label" htmlFor="vesting-month">
                  发行后第 <strong>{month}</strong> 个月
                </label>
                <input
                  id="vesting-month"
                  type="range"
                  min="0"
                  max="48"
                  step="1"
                  value={month}
                  onChange={(e) => setMonth(Number(e.target.value))}
                />
                <div className="vesting-track">
                  <i
                    style={{
                      width: (teamVested(month) / 150000000) * 100 + "%",
                    }}
                  />
                </div>
                <div className="vested-value">
                  <small>累计归属的团队代币</small>
                  <strong>
                    {number(teamVested(month))}
                    <span> NECTAR</span>
                  </strong>
                </div>
                <p>
                  归属不等于卖出，更不等于可以按屏幕价格全部套现。池子深度、交易成本与公开持仓都必须一并披露。
                </p>
                <div className="cliff-note">
                  <Shield size={17} />
                  <span>
                    用户质押本金独立保管
                    <br />
                    <small>不用于团队开支或奖励兑付</small>
                  </span>
                </div>
              </div>
            </div>
            <div className="token-utilities">
              {[
                [Flame, "使用与销毁", "锻造、外观、服务；真实收入支持销毁。"],
                [
                  LockKeyhole,
                  "功能性锁定",
                  "队列、投票、服务资格；不承诺自动生息。",
                ],
                [Swords, "NFT 出征", "材料、经验与预算内赛季奖励。"],
                [Layers, "Genesis 权益", "限量身份、直接授权与有效贡献。"],
              ].map(([Icon, title, body]) => (
                <div key={title}>
                  <Icon size={22} />
                  <h3>{title}</h3>
                  <p>{body}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
      <footer className="under-footer">
        <span>
          IMMORTAL <b>◆</b> THE UNDERHIVE
        </span>
        <p>V2 世界与经济提案 · 机制未接链 · 无真实资产交易</p>
        <a href="/swarm.html">交易坑</a>
        <a href="/brain.html">活体连接组</a>
        <a href="/">
          返回主站
          <ArrowUpRight size={12} />
        </a>
      </footer>
      {detail && (
        <dialog
          ref={dialog}
          className="world-dialog"
          onCancel={(e) => {
            e.preventDefault();
            setDetail(null);
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setDetail(null);
          }}
        >
          <div>
            <button
              className="close-detail"
              aria-label="关闭详情"
              onClick={() => setDetail(null)}
            >
              <X size={19} />
            </button>
            <small>CODEX OF THE UNDERHIVE / 机制提案</small>
            <h2>{detail.title}</h2>
            <p>{detail.detail}</p>
            <button
              className="infernal-button"
              onClick={() => {
                setDetail(null);
                navigate("economy");
              }}
            >
              查看资金沙盘
              <ArrowRight size={16} />
            </button>
          </div>
        </dialog>
      )}
    </>
  );
}
function Kpi({ title, value, note, color = "" }) {
  return (
    <div className={"kpi " + color}>
      <span>{title}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
