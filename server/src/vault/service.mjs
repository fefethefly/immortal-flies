import {
  createUserVault,
  restoreVault,
  saveVault,
  vaultDeposit,
  vaultRequestExit,
  vaultSettleExits,
  vaultView,
} from "../../../src/brain/flyswarm/vault.mjs";
import { hashToken } from "../shared/tokens.mjs";
import { badRequest } from "../shared/errors.mjs";

/**
 * P5 用户金库服务：全局一份 iff.vault/1（落盘 vault.json）。
 * 身份 = owner token 的哈希（与 sessions 相同口径，磁盘不存明文）。
 * 全部 SIM：不签名、不转账、不持有真实资金。
 */
export function createVaultService({ store, logger }) {
  let vault = null;
  let loaded = false;

  async function getVault() {
    if (!loaded) {
      vault = restoreVault(await store.loadVault());
      loaded = true;
    }
    return vault;
  }

  async function persist() {
    try {
      await store.saveVault(saveVault(await getVault()));
    } catch (err) {
      logger.warn("vault persist failed", {
        error: err?.message || String(err),
      });
    }
  }

  function ownerOf(req) {
    const header = req.headers?.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) throw badRequest("MISSING_TOKEN", "Bearer token required");
    return `owner:${hashToken(token)}`;
  }

  async function view() {
    return vaultView(await getVault());
  }

  async function deposit(body, req) {
    const owner = ownerOf(req);
    const amount = Number(body?.amount);
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      throw badRequest("INVALID_AMOUNT", "amount must be a positive integer");
    }
    const v = await getVault();
    let batch;
    try {
      batch = vaultDeposit(v, { owner, amount });
    } catch (err) {
      throw badRequest("VAULT_RULE", err?.message || String(err));
    }
    await persist();
    return { schema: "iff.batch/1", ...batch, audit: "SIM" };
  }

  async function exit(body, req) {
    const owner = ownerOf(req);
    const shares = Number(body?.shares);
    if (!Number.isSafeInteger(shares) || shares <= 0) {
      throw badRequest("INVALID_SHARES", "shares must be a positive integer");
    }
    const v = await getVault();
    let exitRow;
    try {
      exitRow = vaultRequestExit(v, { owner, shares });
    } catch (err) {
      throw badRequest("VAULT_RULE", err?.message || String(err));
    }
    await persist();
    return { schema: "iff.exit/1", ...exitRow, audit: "SIM" };
  }

  async function settle() {
    const v = await getVault();
    const settled = vaultSettleExits(v);
    await persist();
    return { schema: "iff.vault-settle/1", settled, audit: "SIM" };
  }

  return { view, deposit, exit, settle, getVault };
}
