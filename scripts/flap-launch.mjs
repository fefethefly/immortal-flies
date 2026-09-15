#!/usr/bin/env node
/**
 * Prepare a Flap tax-token + Split Vault launch. Does not broadcast unless
 * FLAP_BROADCAST=1 and FLAP_PRIVATE_KEY are set. Never put the key in git.
 */
import { readFile } from "node:fs/promises";
import { AbiCoder, isAddress, parseEther } from "ethers";
import { normalizeToken } from "../src/token.mjs";

const MAINNET = Object.freeze({
  chainId: 56,
  portal: "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0",
  vaultPortal: "0x90497450f2a706f1951b5bdda52B4E5d16f34C06",
  splitVaultFactory: "0xfab75Dc774cB9B38b91749B8833360B46a52345F",
  taxTokenV3: "0x024f18294970B5c76c0691b87f138A0317156422",
});

const token = normalizeToken(JSON.parse(await readFile(new URL("../public/token/official.json", import.meta.url), "utf8")));
const hive = process.env.FLAP_HIVE_ADDRESS || "";
const ops = process.env.FLAP_OPS_ADDRESS || "";
const quoteBnb = process.env.FLAP_QUOTE_BNB || "0.05";
const broadcast = process.env.FLAP_BROADCAST === "1";
const key = process.env.FLAP_PRIVATE_KEY || "";

function encodeSplitVault(hiveAddr, opsAddr, hiveBps, opsBps) {
  return AbiCoder.defaultAbiCoder().encode(
    ["tuple(address recipient,uint16 bps)[]"],
    [
      [
        { recipient: hiveAddr, bps: hiveBps },
        { recipient: opsAddr, bps: opsBps },
      ],
    ],
  );
}

if (token.status === "live") {
  console.log(`官方代币已记录：${token.symbol} ${token.address}`);
  process.exit(0);
}

console.log(`准备发射 ${token.name} ($${token.symbol})`);
console.log(`链：BSC ${MAINNET.chainId}`);
console.log(`VaultPortal：${MAINNET.vaultPortal}`);
console.log(`Split Vault Factory：${MAINNET.splitVaultFactory}`);
console.log(`买卖税：${token.buyTaxBps / 100}% / ${token.sellTaxBps / 100}%`);
console.log(`分账：金库 ${token.hiveBps / 100}% · 运营 ${token.opsBps / 100}%`);
console.log(`建议初始报价：${quoteBnb} BNB`);
console.log("");
  console.log("不要用 IFF / FLY / FRUITFLIES / IFLY。官方 ticker 是 IFS。");
console.log("");

if (!isAddress(hive) || !isAddress(ops)) {
  console.log("还缺两个收款地址。写入环境变量后重跑：");
  console.log("  FLAP_HIVE_ADDRESS=0x...   # 80% 金库 / 多签");
  console.log("  FLAP_OPS_ADDRESS=0x...    # 20% 运营");
  console.log("  FLAP_QUOTE_BNB=0.05");
  console.log("");
  console.log("地址齐了之后，到 https://flap.sh 选 Launch Token → Custom Vault，");
  console.log("工厂填 Split Vault，收款人按上面比例填写。盐值必须让合约地址以 7777 结尾。");
  console.log("本脚本不会替你签名。私钥不要发给任何人，包括我。");
  process.exit(1);
}

if (hive.toLowerCase() === ops.toLowerCase()) {
  console.error("金库地址和运营地址不能相同。");
  process.exit(1);
}

const vaultData = encodeSplitVault(hive, ops, token.hiveBps, token.opsBps);
console.log("Split vaultData:");
console.log(vaultData);
console.log("");
console.log("Flap UI 对照：");
console.log(`  name        ${token.name}`);
console.log(`  symbol      ${token.symbol}`);
console.log(`  buy/sell    ${token.buyTaxBps} / ${token.sellTaxBps} bps`);
console.log(`  factory     ${MAINNET.splitVaultFactory}`);
console.log(`  quoteAmt    ${parseEther(quoteBnb)} wei`);
console.log("");

if (!broadcast) {
  console.log("这是预演。要广播需要你在本机设置 FLAP_BROADCAST=1 和 FLAP_PRIVATE_KEY。");
  console.log("即便如此，盐值 vanity 仍建议用 Flap 页面生成，避免打错 CREATE2。");
  process.exit(0);
}

if (!key) {
  console.error("FLAP_BROADCAST=1 但没有 FLAP_PRIVATE_KEY。已停止，没有发送交易。");
  process.exit(1);
}

console.error("广播路径尚未接到 Portal ABI 的 vanity 盐值搜索。请用 Flap 页面完成签名，避免打到错误地址。");
process.exit(2);
