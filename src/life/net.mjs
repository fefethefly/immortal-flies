export function withNet(
  path,
  search = typeof window === "undefined" ? "" : window.location.search,
) {
  const next = new URL(path, "https://immortalflies.invalid");
  if (new URLSearchParams(search).get("net") === "test") {
    next.searchParams.set("net", "test");
  }
  return `${next.pathname}${next.search}`;
}
