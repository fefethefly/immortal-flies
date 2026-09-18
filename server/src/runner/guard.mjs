import { getAddress } from "ethers";

export const MAINNET_IFS = "0x65b66BB4Adb0e244E19d290b6AAa0381B81A7777";
export const MAINNET_HIVE = "0xfAdb2FE136c89866Cd1CB0DD31298e08cc61a467";
export const DEFAULT_ARCHIVE_RETAIN_MS = 37 * 24 * 60 * 60 * 1000;

export function assertRunnerEnv({
  chainId,
  mainnetFlag,
  dataDir,
  defaultTestnetDir,
  listing,
}) {
  const id = Number(chainId);
  if (id === 97) {
    if (listing?.ifs && getAddress(listing.ifs) === getAddress(MAINNET_IFS)) {
      throw new Error("testnet runner cannot use live IFS");
    }
    return { audit: "TESTNET", yield: false, chainId: 97 };
  }
  if (id !== 56) throw new Error(`unsupported chainId ${id}`);
  if (mainnetFlag !== "1") {
    throw new Error("mainnet runner requires IFF_MAINNET_RUNNER=1");
  }
  if (!dataDir) throw new Error("mainnet runner requires a dedicated IFF_DATA_DIR");
  if (!defaultTestnetDir) throw new Error("missing default testnet data dir");
  if (dataDir === defaultTestnetDir) {
    throw new Error("mainnet runner cannot reuse the testnet data directory");
  }
  if (!listing?.ifs || getAddress(listing.ifs) !== getAddress(MAINNET_IFS)) {
    throw new Error("mainnet runner requires live IFS 0x65b66BB4…7777");
  }
  if (!listing?.hive || getAddress(listing.hive) !== getAddress(MAINNET_HIVE)) {
    throw new Error("mainnet hive must be 0xfAdb2FE1…1467");
  }
  if (listing.status === "UNDEPLOYED" || !listing.address) {
    throw new Error("mainnet MiningHub is UNDEPLOYED");
  }
  return { audit: "MAINNET", yield: false, chainId: 56 };
}
