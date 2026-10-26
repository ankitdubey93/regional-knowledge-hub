export interface Fused { id: string; score: number; ranks: (number | null)[] }

/** Reciprocal rank fusion: score = sum of 1 / (k + rank), rank 1-based. Sorted by score desc, then id asc. */
export function fuseRankings(lists: string[][], k = 60): Fused[] {
  const byId = new Map<string, Fused>();
  lists.forEach((list, listIndex) => {
    list.forEach((id, position) => {
      const rank = position + 1;
      let entry = byId.get(id);
      if (!entry) {
        entry = { id, score: 0, ranks: lists.map(() => null) };
        byId.set(id, entry);
      }
      entry.score += 1 / (k + rank);
      entry.ranks[listIndex] = rank;
    });
  });
  return [...byId.values()].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
