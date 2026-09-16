import React from "react";
import {
  ArrowUpRight,
  Coins,
  FlaskConical,
  Landmark,
  LockKeyhole,
  Scale,
  ShieldCheck,
  Vault,
} from "lucide-react";
import { CREDIT_POLICY } from "./brain/flyswarm/credit.mjs";
import { PROTOCOL_POLICY } from "./brain/flyswarm/protocol.mjs";
import { VAULT_POLICY } from "./brain/flyswarm/vault.mjs";
import { FLYSWARM_POLICY } from "./brain/flyswarm/membership.mjs";
import { SiteLink } from "./site-chrome.jsx";

/**
 * 经济模型研究区：IFS 权益 + 机制全貌，参数直接从版本化策略读取，
 * 与运行中的账本保持一致。全部 SIM，不构成收益承诺。
 */
export function EconomicModel({ tx }) {
  const pct = (bps) => `${(bps / 100).toFixed(bps % 100 ? 1 : 0)}%`;
  return (
    <section className="em" aria-label={tx("em.title")}>
      <header className="em-head">
        <h2>{tx("em.title")}</h2>
        <p>{tx("em.lead")}</p>
      </header>

      {/* 1) 质押权益三层 */}
      <div className="em-grid">
        <article className="em-card">
          <span className="em-no">01</span>
          <FlaskConical size={18} />
          <h3>{tx("em.tier1")}</h3>
          <p>
            {tx("em.tier1P", {
              free: CREDIT_POLICY.freeSeed,
              decay: CREDIT_POLICY.freeDecayPerTick,
            })}
          </p>
        </article>
        <article className="em-card">
          <span className="em-no">02</span>
          <LockKeyhole size={18} />
          <h3>{tx("em.tier2")}</h3>
          <p>
            {tx("em.tier2P", {
              min: FLYSWARM_POLICY.bondedStakeMin,
              unlock: FLYSWARM_POLICY.bondedUnlockTicks,
            })}
          </p>
        </article>
        <article className="em-card">
          <span className="em-no">03</span>
          <Coins size={18} />
          <h3>{tx("em.tier3")}</h3>
          <p>
            {tx("em.tier3P", {
              cap: pct(CREDIT_POLICY.dividendCapBps),
              quota: pct(CREDIT_POLICY.rwaQuotaMultiplierBps),
              rwaCap: CREDIT_POLICY.rwaCap,
            })}
          </p>
        </article>
      </div>

      {/* 2) 权益明细：信用 + 分红 + RWA */}
      <div className="em-rows">
        <article className="em-row">
          <Scale size={18} />
          <div>
            <h4>{tx("em.creditT")}</h4>
            <p>{tx("em.creditP")}</p>
            <code>
              usable = min(collateral×LTV, profit×share, orders×reliability,
              cap) − debt − reserve
            </code>
            <ul>
              <li>{tx("em.creditFree", { free: CREDIT_POLICY.freeSeed })}</li>
              <li>
                {tx("em.creditLocked", { ltv: pct(CREDIT_POLICY.ltvBps) })}
              </li>
              <li>
                {tx("em.creditEarned", {
                  share: pct(CREDIT_POLICY.profitShareBps),
                })}
              </li>
              <li>{tx("em.creditLiquid")}</li>
            </ul>
          </div>
        </article>
        <article className="em-row">
          <Landmark size={18} />
          <div>
            <h4>{tx("em.divT")}</h4>
            <p>
              {tx("em.divP", {
                reward: pct(PROTOCOL_POLICY.stakeRewardBps),
                cap: pct(CREDIT_POLICY.dividendCapBps),
              })}
            </p>
            <ul>
              <li>{tx("em.divRealized")}</li>
              <li>{tx("em.divWeight")}</li>
              <li>{tx("em.divHalt")}</li>
            </ul>
          </div>
        </article>
        <article className="em-row">
          <Vault size={18} />
          <div>
            <h4>{tx("em.rwaT")}</h4>
            <p>
              {tx("em.rwaP", {
                quota: pct(CREDIT_POLICY.rwaQuotaMultiplierBps),
                cap: CREDIT_POLICY.rwaCap,
              })}
            </p>
            <ul>
              <li>{tx("em.rwaEligibility")}</li>
              <li>{tx("em.rwaIsolation")}</li>
            </ul>
          </div>
        </article>
      </div>

      {/* 3) 协议自有资金 */}
      <article className="em-block">
        <h3>
          <ShieldCheck size={18} />
          {tx("em.protoT")}
        </h3>
        <p>{tx("em.protoP")}</p>
        <code className="em-code">
          R = {tx("em.r")} · C = {tx("em.c")} · N = R − C · T = min(max(N,0),
          {tx("em.t")}) · D = max(N − T, 0)
        </code>
        <ul className="em-split">
          <li>
            <b>{pct(PROTOCOL_POLICY.ifsBudgetBps)}</b>
            <span>{tx("em.splitIfs")}</span>
          </li>
          <li>
            <b>{pct(PROTOCOL_POLICY.reserveBps)}</b>
            <span>{tx("em.splitReserve")}</span>
          </li>
          <li>
            <b>{pct(PROTOCOL_POLICY.ownCapitalBps)}</b>
            <span>{tx("em.splitCapital")}</span>
          </li>
          <li>
            <b>{pct(PROTOCOL_POLICY.stakeRewardBps)}</b>
            <span>{tx("em.splitReward")}</span>
          </li>
          <li>
            <b>{pct(PROTOCOL_POLICY.ecosystemBps)}</b>
            <span>{tx("em.splitEco")}</span>
          </li>
        </ul>
        <p>
          {tx("em.protoBuyback", {
            impact: pct(PROTOCOL_POLICY.buybackImpactBps),
          })}
        </p>
        <p>
          {tx("em.protoHalt", {
            loss: PROTOCOL_POLICY.lossStreakHalt,
            drop: pct(PROTOCOL_POLICY.ifsDropHaltBps),
          })}
        </p>
      </article>

      {/* 4) 用户金库 */}
      <article className="em-block">
        <h3>
          <Vault size={18} />
          {tx("em.vaultT")}
        </h3>
        <ul className="em-list">
          <li>{tx("em.vaultNav")}</li>
          <li>{tx("em.vaultBatch")}</li>
          <li>{tx("em.vaultOwn")}</li>
          <li>
            {tx("em.vaultQueue", {
              cap: pct(VAULT_POLICY.exitLiquidityCapBps),
            })}
          </li>
          <li>{tx("em.vaultFee", { fee: pct(VAULT_POLICY.perfFeeBps) })}</li>
          <li>{tx("em.vaultRealized")}</li>
        </ul>
      </article>

      {/* 5) 边界与去向 */}
      <footer className="em-foot">
        <p>{tx("em.boundary")}</p>
        <SiteLink className="em-link" href="/swarm.html">
          {tx("em.goto")} <ArrowUpRight size={13} />
        </SiteLink>
      </footer>
    </section>
  );
}
