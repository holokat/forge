/** Simple subsequence fuzzy matcher. Returns score (higher = better) or -1. */
export function fuzzyScore(query: string, text: string): number {
  if (!query) return 0
  const q = query.toLowerCase()
  const t = text.toLowerCase()

  // Substring matches always win
  const idx = t.indexOf(q)
  if (idx >= 0) return 1000 - idx - (t.length - q.length) * 0.1

  let score = 0
  let ti = 0
  let streak = 0
  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi]
    let found = -1
    while (ti < t.length) {
      if (t[ti] === ch) {
        found = ti
        break
      }
      ti++
    }
    if (found === -1) return -1
    // Bonus for word starts and consecutive characters
    const prev = found > 0 ? t[found - 1] : ' '
    if (/[\s\-_/.]/.test(prev)) score += 12
    if (streak > 0) score += 8
    streak = 1
    score += 1
    ti = found + 1
  }
  return score - t.length * 0.05
}

export function fuzzyFilter<T>(query: string, items: T[], key: (item: T) => string, limit = 60): T[] {
  const scored = items
    .map((item) => ({ item, score: fuzzyScore(query, key(item)) }))
    .filter((s) => s.score >= 0)
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit).map((s) => s.item)
}
