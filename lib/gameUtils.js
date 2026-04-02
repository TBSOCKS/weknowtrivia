/**
 * Calculate optimal grid columns for a given answer count.
 */
export function getGridCols(count) {
  const map = {
    1: 1, 2: 2, 3: 3, 4: 2, 5: 3, 6: 3, 7: 4, 8: 4,
    9: 3, 10: 5, 11: 4, 12: 4, 13: 5, 14: 5, 15: 5,
    16: 4, 17: 6, 18: 6, 19: 5, 20: 5,
  }
  return map[count] ?? Math.ceil(Math.sqrt(count))
}

/**
 * Get the active (non-eliminated) picker given state.
 * guessCount = total guesses made so far (0-indexed round).
 */
export function getCurrentPicker(players, guessCount, pickStyle) {
  const all    = [...players].sort((a, b) => a.turn_order - b.turn_order)
  const active = all.filter(p => !p.eliminated)
  if (active.length === 0) return null

  if (pickStyle === 'snake') {
    // Snake uses active-player count only
    const n      = active.length
    const period = n === 1 ? 1 : 2 * n
    const pos    = guessCount % period
    const idx    = pos < n ? pos : 2 * n - 1 - pos
    return active[idx] ?? active[0]
  } else {
    // Classic: maintain original slot positions after eliminations.
    // e.g. with A(1) B(2) C(3), C eliminated: slot 3 → A, not B
    const n   = all.length
    const pos = guessCount % n
    for (let offset = 0; offset < n; offset++) {
      const candidate = all[(pos + offset) % n]
      if (!candidate.eliminated) return candidate
    }
    return active[0]
  }
}

/**
 * Format seconds as M:SS
 */
export function formatTime(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * Generate a random 4-character uppercase code.
 */
export function generateCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase()
}

/**
 * Sort players by score desc, ties alphabetical by personality name.
 * personalities = { [personality_id]: { name } }
 */
export function sortPlayers(players, personalities) {
  return [...players].sort((a, b) => {
    const scoreDiff = (b.score ?? 0) - (a.score ?? 0)
    if (scoreDiff !== 0) return scoreDiff
    const nameA = personalities[a.personality_id]?.name ?? ''
    const nameB = personalities[b.personality_id]?.name ?? ''
    return nameA.localeCompare(nameB)
  })
}
