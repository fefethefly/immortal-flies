import { useEffect, useState } from "react";

const LISTING = "/contract/life/PrivateRunner.testnet.json";

/**
 * 只读：Railway 私有轨全脑是否在跑。不把挖矿 Runner 当成交易执行器。
 */
export function useRunnerStatus() {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    let gone = false;
    (async () => {
      try {
        const listing = await fetch(LISTING, { cache: "no-store" }).then((res) =>
          res.ok ? res.json() : null,
        );
        if (!listing?.url) {
          if (!gone) setStatus({ ok: false });
          return;
        }
        const health = await fetch(listing.health || `${listing.url}/health`, {
          cache: "no-store",
        }).then((res) => (res.ok ? res.json() : null));
        const detail = await fetch(`${listing.url}/status`, {
          cache: "no-store",
        })
          .then((res) => (res.ok ? res.json() : null))
          .catch(() => null);
        if (!gone) {
          setStatus({
            ok: Boolean(health?.ok || detail?.ready),
            dataset: listing.dataset || detail?.dataset || "malecns-full",
            lastTick: detail?.lastTick || null,
            url: listing.url,
          });
        }
      } catch {
        if (!gone) setStatus({ ok: false });
      }
    })();
    return () => {
      gone = true;
    };
  }, []);
  return status;
}
