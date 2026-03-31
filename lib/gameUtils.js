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
  const active = players.filter(p => !p.eliminated).sort((a, b) => a.turn_order - b.turn_order)
  if (active.length === 0) return null

  const n = active.length
  let idx

  if (pickStyle === 'snake') {
    const period = n === 1 ? 1 : 2 * (n - 1)
    const pos = guessCount % period
    idx = pos < n ? pos : period - pos
  } else {
    idx = guessCount % n
  }

  return active[idx] ?? active[0]
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
