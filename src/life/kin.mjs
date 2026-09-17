export function kinOf(souls, tokenId) {
  const id = Number(tokenId);
  const byId = new Map((souls || []).map((soul) => [Number(soul.tokenId), soul]));
  const me = byId.get(id);
  if (!me) return null;
  const node = (value) => {
    const n = Number(value);
    if (!n) return null;
    return byId.get(n) || { tokenId: n, generation: null, givenName: "" };
  };
  const parents = [node(me.parentA), node(me.parentB)].filter(Boolean);
  const grandparents = parents.flatMap((parent) =>
    [node(parent.parentA), node(parent.parentB)].filter(Boolean),
  );
  const children = (souls || []).filter(
    (soul) => Number(soul.parentA) === id || Number(soul.parentB) === id,
  );
  return {
    me,
    parents,
    grandparents,
    children,
    generation: Number(me.generation) || 0,
  };
}
