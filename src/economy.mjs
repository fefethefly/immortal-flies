/** Scenario math only. No oracle, token quote, revenue feed, or yield prediction. */
export const ECONOMY_DEFAULTS = Object.freeze({
  players: 10000,
  payerRate: 15,
  spend: 25,
  marketVolume: 10,
  fixedCost: 12000,
  variableCost: 0.3,
  genesis: 800,
  tokenPrice: 0.002,
});
export const FEE_SPLIT = Object.freeze([
  { key: "team", label: "开发与运营", rate: 0.45, color: "#c8a16c" },
  { key: "burn", label: "回购 / 销毁", rate: 0.2, color: "#d55b48" },
  { key: "genesisPool", label: "Genesis 贡献池", rate: 0.15, color: "#af93d2" },
  { key: "season", label: "全体玩家赛季池", rate: 0.1, color: "#67b9b0" },
  { key: "preservation", label: "状态保存储备", rate: 0.1, color: "#818c9b" },
]);
export function calculateEconomy(input) {
  const p = { ...ECONOMY_DEFAULTS, ...input };
  for (const [key, value] of Object.entries(p))
    if (!Number.isFinite(value) || value < 0)
      throw new Error(`Invalid scenario input: ${key}`);
  if (
    p.payerRate > 100 ||
    !Number.isInteger(p.players) ||
    !Number.isInteger(p.genesis) ||
    p.genesis < 1 ||
    p.genesis > 992 ||
    p.tokenPrice <= 0
  )
    throw new Error("Invalid scenario range");
  const game = ((p.players * p.payerRate) / 100) * p.spend;
  const traded = p.players * p.marketVolume;
  const marketFees = traded * 0.025;
  const revenue = game + marketFees;
  const amounts = Object.fromEntries(
    FEE_SPLIT.map((x) => [x.key, revenue * x.rate]),
  );
  const cost = p.fixedCost + p.players * p.variableCost;
  const contribution =
    ((p.payerRate / 100) * p.spend + p.marketVolume * 0.025) * 0.45 -
    p.variableCost;
  return {
    ...p,
    game,
    traded,
    marketFees,
    revenue,
    ...amounts,
    cost,
    profit: amounts.team - cost,
    genesisSample: amounts.genesisPool / p.genesis,
    burnTokens: amounts.burn / p.tokenPrice,
    breakEven: contribution > 0 ? Math.ceil(p.fixedCost / contribution) : null,
  };
}
export function teamVested(month) {
  if (!Number.isFinite(month) || month < 0) throw new Error("Invalid month");
  return 150000000 * Math.min(1, Math.max(0, month - 12) / 36);
}
