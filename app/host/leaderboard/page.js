'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import NavBar from '@/components/NavBar'
import { supabase } from '@/lib/supabase'

const MODE_LABELS = { lists: 'Lists', boot_order: 'Boot Order' }
const SHOW_ICONS  = { 'survivor': '🌴', 'big-brother': '👁️', 'the-challenge': '🏆', 'drag-race': '👑' }
const SORT_OPTIONS = [
  { key: 'wins',         label: 'Wins'     },
  { key: 'win_pct',      label: 'Win %'    },
  { key: 'total_points', label: 'Points'   },
  { key: 'ppg',          label: 'Pts/Game' },
  { key: 'games_played', label: 'Games'    },
]

export default function LeaderboardPage() {
  const router = useRouter()
  const [shows, setShows]               = useState([])
  const [personalities, setPersonalities] = useState({})
  const [loading, setLoading]           = useState(true)

  // Navigation state
  const [selectedShow, setSelectedShow] = useState('all')   // 'all' | show.id
  const [selectedMode, setSelectedMode] = useState('all')   // 'all' | 'lists' | 'boot_order'

  // Main leaderboard data
  const [entries, setEntries]           = useState([])
  const [loadingEntries, setLoadingEntries] = useState(false)

  // Manage / session delete
  const [managing, setManaging]         = useState(false)
  const [expanded, setExpanded]         = useState(null)
  const [sessions, setSessions]         = useState({})
  const [deleting, setDeleting]         = useState(null)

  // Sort
  const [sortBy, setSortBy]             = useState('wins')
  const [sortDir, setSortDir]           = useState('desc')

  // Head-to-head
  const [h2hTab, setH2hTab]             = useState(false)
  const [h2hA, setH2hA]                 = useState('')
  const [h2hB, setH2hB]                 = useState('')
  const [h2hResult, setH2hResult]       = useState(null)
  const [h2hLoading, setH2hLoading]     = useState(false)

  useEffect(() => {
    async function load() {
      const [showRes, persRes] = await Promise.all([
        supabase.from('shows').select('*').order('name'),
        supabase.from('personalities').select('*').order('name'),
      ])
      setShows(showRes.data ?? [])
      const pMap = {}
      ;(persRes.data ?? []).forEach(p => { pMap[p.id] = p })
      setPersonalities(pMap)
      setLoading(false)
    }
    load()
  }, [])

  // Load entries whenever show/mode selection changes
  useEffect(() => {
    async function loadEntries() {
      setLoadingEntries(true)
      setExpanded(null)
      setSessions({})

      let query = supabase.from('leaderboard').select('*')
      if (selectedShow !== 'all') query = query.eq('show_id', selectedShow)
      if (selectedMode !== 'all') query = query.eq('mode', selectedMode)

      const { data } = await query
      const raw = data ?? []

      if (selectedShow === 'all' || selectedMode === 'all') {
        // Aggregate by personality_id
        const agg = {}
        raw.forEach(row => {
          if (!agg[row.personality_id]) {
            agg[row.personality_id] = { personality_id: row.personality_id, wins: 0, games_played: 0, total_points: 0, best_show_id: null, best_mode: null, _best_wins: -1 }
          }
          agg[row.personality_id].wins         += row.wins ?? 0
          agg[row.personality_id].games_played += row.games_played ?? 0
          agg[row.personality_id].total_points += row.total_points ?? 0
          // Track best show/mode by wins
          if ((row.wins ?? 0) > agg[row.personality_id]._best_wins) {
            agg[row.personality_id]._best_wins   = row.wins ?? 0
            agg[row.personality_id].best_show_id = row.show_id
            agg[row.personality_id].best_mode    = row.mode
          }
        })
        setEntries(Object.values(agg))
      } else {
        setEntries(raw)
      }
      setLoadingEntries(false)
    }
    if (!loading) loadEntries()
  }, [selectedShow, selectedMode, loading])

  async function loadSessions(personalityId) {
    if (sessions[personalityId] !== undefined) return
    let query = supabase.from('leaderboard_sessions').select('*')
      .eq('personality_id', personalityId)
      .order('played_at', { ascending: false })
    if (selectedShow !== 'all') query = query.eq('show_id', selectedShow)
    if (selectedMode !== 'all') query = query.eq('mode', selectedMode)
    const { data } = await query
    setSessions(prev => ({ ...prev, [personalityId]: data ?? [] }))
  }

  function toggleExpand(personalityId) {
    if (expanded === personalityId) { setExpanded(null); return }
    setExpanded(personalityId)
    loadSessions(personalityId)
  }

  function toggleSort(key) {
    if (sortBy === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortBy(key); setSortDir('desc') }
  }

  function computePpg(entry) {
    return entry.games_played > 0 ? (entry.total_points / entry.games_played).toFixed(1) : '0.0'
  }

  function computeWinPct(entry) {
    return entry.games_played > 0 ? Math.round((entry.wins / entry.games_played) * 100) : 0
  }

  const sortedEntries = [...entries].sort((a, b) => {
    let aVal, bVal
    if (sortBy === 'ppg')          { aVal = a.games_played > 0 ? a.total_points / a.games_played : 0; bVal = b.games_played > 0 ? b.total_points / b.games_played : 0 }
    else if (sortBy === 'win_pct') { aVal = computeWinPct(a); bVal = computeWinPct(b) }
    else                           { aVal = a[sortBy] ?? 0; bVal = b[sortBy] ?? 0 }
    return sortDir === 'desc' ? bVal - aVal : aVal - bVal
  })

  async function handleDeleteSession(sessionRow) {
    if (!confirm('Remove this game from the leaderboard?')) return
    setDeleting(sessionRow.id)
    await supabase.from('leaderboard_sessions').delete().eq('id', sessionRow.id)
    const { data: remaining } = await supabase
      .from('leaderboard_sessions').select('*')
      .eq('personality_id', sessionRow.personality_id)
      .eq('show_id', sessionRow.show_id).eq('mode', sessionRow.mode)
    const newGames  = remaining?.length ?? 0
    const newWins   = remaining?.filter(r => r.won).length ?? 0
    const newPoints = remaining?.reduce((sum, r) => sum + (r.score ?? 0), 0) ?? 0
    if (newGames === 0) {
      await supabase.from('leaderboard').delete()
        .eq('personality_id', sessionRow.personality_id)
        .eq('show_id', sessionRow.show_id).eq('mode', sessionRow.mode)
    } else {
      await supabase.from('leaderboard').update({
        games_played: newGames, wins: newWins, total_points: newPoints,
        updated_at: new Date().toISOString(),
      }).eq('personality_id', sessionRow.personality_id)
        .eq('show_id', sessionRow.show_id).eq('mode', sessionRow.mode)
    }
    setSessions(prev => ({ ...prev, [sessionRow.personality_id]: (prev[sessionRow.personality_id] ?? []).filter(s => s.id !== sessionRow.id) }))
    setDeleting(null)
  }

  // Head-to-head calculation
  async function runH2H() {
    if (!h2hA || !h2hB || h2hA === h2hB) return
    setH2hLoading(true)
    setH2hResult(null)

    // Find all session_ids that both players participated in
    const [resA, resB] = await Promise.all([
      supabase.from('leaderboard_sessions').select('session_id, won, score, show_id, mode, played_at').eq('personality_id', h2hA),
      supabase.from('leaderboard_sessions').select('session_id, won, score, show_id, mode, played_at').eq('personality_id', h2hB),
    ])
    const aMap = {}
    ;(resA.data ?? []).forEach(s => { aMap[s.session_id] = s })
    const shared = (resB.data ?? []).filter(s => aMap[s.session_id])

    let aWins = 0, bWins = 0, draws = 0
    const games = []
    shared.forEach(bRow => {
      const aRow = aMap[bRow.session_id]
      const show = shows.find(s => s.id === (aRow.show_id || bRow.show_id))
      if (aRow.won && !bRow.won) { aWins++; games.push({ date: aRow.played_at, winner: 'a', aScore: aRow.score, bScore: bRow.score, show: show?.name, mode: aRow.mode }) }
      else if (!aRow.won && bRow.won) { bWins++; games.push({ date: aRow.played_at, winner: 'b', aScore: aRow.score, bScore: bRow.score, show: show?.name, mode: aRow.mode }) }
      else { draws++; games.push({ date: aRow.played_at, winner: 'draw', aScore: aRow.score, bScore: bRow.score, show: show?.name, mode: aRow.mode }) }
    })
    games.sort((a, b) => new Date(b.date) - new Date(a.date))
    setH2hResult({ aWins, bWins, draws, total: shared.length, games })
    setH2hLoading(false)
  }

  const SortBtn = ({ col }) => (
    <button onClick={() => toggleSort(col)}
      className={`flex items-center gap-1 transition-colors ${sortBy === col ? 'text-brand-amber' : 'text-brand-muted hover:text-white'}`}>
      {SORT_OPTIONS.find(o => o.key === col)?.label}
      {sortBy === col && <span className="text-xs">{sortDir === 'desc' ? '↓' : '↑'}</span>}
    </button>
  )

  const showHasData = (showId) => {
    // We'll check this client-side after entries load — for now just show all
    return true
  }

  if (loading) return <div className="min-h-screen bg-brand-bg flex items-center justify-center text-brand-muted">Loading…</div>

  const persWithEntries = Object.values(personalities).filter(p => entries.some(e => e.personality_id === p.id))

  return (
    <div className="min-h-screen bg-brand-bg">
      <NavBar />
      <div className="max-w-5xl mx-auto px-4 py-10">

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="font-display text-6xl text-white tracking-wide">LEADERBOARD</h1>
            <p className="text-brand-muted mt-1">All-time standings</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setH2hTab(v => !v); setManaging(false) }}
              className={`px-4 py-2 rounded-xl border font-display text-lg tracking-wide transition-all ${
                h2hTab ? 'border-brand-red bg-brand-red/10 text-brand-red' : 'border-brand-border text-brand-muted hover:text-white'
              }`}>
              H2H
            </button>
            <button onClick={() => { setManaging(v => !v); setH2hTab(false) }}
              className={`px-4 py-2 rounded-xl border font-display text-lg tracking-wide transition-all ${
                managing ? 'border-brand-red bg-brand-red/10 text-brand-red' : 'border-brand-border text-brand-muted hover:text-white'
              }`}>
              {managing ? 'DONE' : 'MANAGE'}
            </button>
          </div>
        </div>

        {/* Show selector */}
        <div className="flex flex-wrap gap-2 mb-3">
          <button onClick={() => { setSelectedShow('all'); setSelectedMode('all') }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl border font-display text-lg tracking-wide transition-all ${
              selectedShow === 'all' ? 'border-brand-amber bg-brand-amber/10 text-brand-amber' : 'border-brand-border text-brand-muted hover:text-white'
            }`}>
            📺 ALL SHOWS
          </button>
          {shows.map(s => (
            <button key={s.id} onClick={() => { setSelectedShow(s.id); setSelectedMode('all') }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl border font-display text-lg tracking-wide transition-all ${
                selectedShow === s.id ? 'border-brand-amber bg-brand-amber/10 text-brand-amber' : 'border-brand-border text-brand-muted hover:text-white'
              }`}>
              <span>{SHOW_ICONS[s.slug] ?? '📺'}</span>{s.name.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Mode selector — only shown when a specific show is selected */}
        {selectedShow !== 'all' && (
          <div className="flex gap-2 mb-6">
            <button onClick={() => setSelectedMode('all')}
              className={`px-4 py-2 rounded-xl border font-display text-lg tracking-wide transition-all ${
                selectedMode === 'all' ? 'border-brand-red bg-brand-red/10 text-brand-red' : 'border-brand-border text-brand-muted hover:text-white'
              }`}>
              ALL MODES
            </button>
            {['lists', 'boot_order'].map(m => (
              <button key={m} onClick={() => setSelectedMode(m)}
                className={`px-4 py-2 rounded-xl border font-display text-lg tracking-wide transition-all ${
                  selectedMode === m ? 'border-brand-red bg-brand-red/10 text-brand-red' : 'border-brand-border text-brand-muted hover:text-white'
                }`}>
                {MODE_LABELS[m]}
              </button>
            ))}
          </div>
        )}
        {selectedShow === 'all' && <div className="mb-6" />}

        {/* HEAD-TO-HEAD panel */}
        {h2hTab && (
          <div className="bg-brand-panel border border-brand-border rounded-2xl p-6 mb-6">
            <h2 className="font-display text-2xl text-white tracking-wide mb-4">HEAD TO HEAD</h2>
            <div className="flex flex-wrap gap-3 items-end mb-5">
              <div className="flex flex-col gap-1">
                <label className="text-brand-muted text-xs uppercase tracking-widest">Player 1</label>
                <select value={h2hA} onChange={e => setH2hA(e.target.value)}
                  className="bg-brand-card border border-brand-border rounded-xl px-3 py-2 text-white focus:outline-none focus:border-brand-amber min-w-40">
                  <option value="">— Select —</option>
                  {Object.values(personalities).sort((a,b) => a.name.localeCompare(b.name)).map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div className="font-display text-3xl text-brand-muted pb-1">VS</div>
              <div className="flex flex-col gap-1">
                <label className="text-brand-muted text-xs uppercase tracking-widest">Player 2</label>
                <select value={h2hB} onChange={e => setH2hB(e.target.value)}
                  className="bg-brand-card border border-brand-border rounded-xl px-3 py-2 text-white focus:outline-none focus:border-brand-amber min-w-40">
                  <option value="">— Select —</option>
                  {Object.values(personalities).sort((a,b) => a.name.localeCompare(b.name)).filter(p => p.id !== h2hA).map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <button onClick={runH2H} disabled={!h2hA || !h2hB || h2hLoading}
                className="bg-brand-red hover:bg-red-600 disabled:opacity-50 text-white font-display text-xl tracking-widest px-6 py-2 rounded-xl transition-colors">
                {h2hLoading ? '…' : 'GO'}
              </button>
            </div>

            {h2hResult && (
              h2hResult.total === 0 ? (
                <p className="text-brand-muted text-sm">These two players haven't played in the same game yet.</p>
              ) : (
                <div>
                  {/* Score summary */}
                  <div className="flex items-center gap-4 mb-4">
                    <div className="flex-1 text-center">
                      <div className="w-14 h-14 rounded-full overflow-hidden bg-brand-card border-2 border-brand-border mx-auto mb-1">
                        {personalities[h2hA]?.photo_url
                          ? <img src={personalities[h2hA].photo_url} className="w-full h-full object-cover" alt="" />
                          : <div className="w-full h-full flex items-center justify-center text-brand-muted font-display">{personalities[h2hA]?.name?.[0]}</div>}
                      </div>
                      <div className="text-white text-sm font-medium">{personalities[h2hA]?.name?.split(' ')[0]}</div>
                      <div className={`font-display text-4xl mt-1 ${h2hResult.aWins > h2hResult.bWins ? 'text-brand-amber' : 'text-white'}`}>{h2hResult.aWins}</div>
                    </div>
                    <div className="text-center">
                      {h2hResult.draws > 0 && <div className="text-brand-muted text-sm mb-1">{h2hResult.draws} draw{h2hResult.draws > 1 ? 's' : ''}</div>}
                      <div className="font-display text-2xl text-brand-muted">{h2hResult.total} game{h2hResult.total > 1 ? 's' : ''}</div>
                    </div>
                    <div className="flex-1 text-center">
                      <div className="w-14 h-14 rounded-full overflow-hidden bg-brand-card border-2 border-brand-border mx-auto mb-1">
                        {personalities[h2hB]?.photo_url
                          ? <img src={personalities[h2hB].photo_url} className="w-full h-full object-cover" alt="" />
                          : <div className="w-full h-full flex items-center justify-center text-brand-muted font-display">{personalities[h2hB]?.name?.[0]}</div>}
                      </div>
                      <div className="text-white text-sm font-medium">{personalities[h2hB]?.name?.split(' ')[0]}</div>
                      <div className={`font-display text-4xl mt-1 ${h2hResult.bWins > h2hResult.aWins ? 'text-brand-amber' : 'text-white'}`}>{h2hResult.bWins}</div>
                    </div>
                  </div>
                  {/* Game log */}
                  <div className="border-t border-brand-border pt-3 flex flex-col gap-1.5">
                    {h2hResult.games.map((g, i) => (
                      <div key={i} className="flex items-center gap-3 text-sm py-1">
                        <span className="text-brand-muted text-xs w-20 flex-shrink-0">
                          {new Date(g.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                        </span>
                        <span className="text-brand-muted text-xs flex-1">{g.show} · {MODE_LABELS[g.mode] ?? g.mode}</span>
                        <span className={`font-display text-base w-6 text-center ${g.winner === 'a' ? 'text-brand-amber' : 'text-brand-muted'}`}>{g.aScore}</span>
                        <span className="text-brand-border">–</span>
                        <span className={`font-display text-base w-6 text-center ${g.winner === 'b' ? 'text-brand-amber' : 'text-brand-muted'}`}>{g.bScore}</span>
                        <span className="text-xs text-brand-muted w-16 text-right flex-shrink-0">
                          {g.winner === 'a' ? <span className="text-brand-amber">P1 wins</span> : g.winner === 'b' ? <span className="text-brand-amber">P2 wins</span> : 'Draw'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            )}
          </div>
        )}

        {/* Main leaderboard table */}
        {loadingEntries ? (
          <div className="text-brand-muted text-center py-20">Loading…</div>
        ) : entries.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">📊</div>
            <p className="text-brand-muted">No games tracked yet for this selection.</p>
            <p className="text-brand-muted text-sm mt-1">Enable "Track Leaderboard" when setting up a game.</p>
          </div>
        ) : (
          <div className="bg-brand-panel border border-brand-border rounded-2xl overflow-hidden">
            {/* Sortable header */}
            <div className="grid grid-cols-12 gap-2 px-5 py-3 border-b border-brand-border text-xs uppercase tracking-widest">
              <div className="col-span-1 text-brand-muted">#</div>
              <div className="col-span-3 text-brand-muted">Player</div>
              {(selectedShow === 'all' || selectedMode === 'all') && (
                <div className="col-span-2 text-brand-muted text-xs">Best</div>
              )}
              <div className={`${(selectedShow === 'all' || selectedMode === 'all') ? 'col-span-1' : 'col-span-2'} text-center`}><SortBtn col="wins" /></div>
              <div className={`${(selectedShow === 'all' || selectedMode === 'all') ? 'col-span-1' : 'col-span-2'} text-center`}><SortBtn col="win_pct" /></div>
              <div className="col-span-1 text-center"><SortBtn col="games_played" /></div>
              <div className="col-span-2 text-center"><SortBtn col="total_points" /></div>
              <div className="col-span-1 text-right"><SortBtn col="ppg" /></div>
            </div>

            {sortedEntries.map((entry, i) => {
              const pers       = personalities[entry.personality_id]
              const ppg        = computePpg(entry)
              const winPct     = computeWinPct(entry)
              const isTop      = i === 0
              const isExpanded = expanded === entry.personality_id
              const playerSessions = sessions[entry.personality_id] ?? []
              const bestShow   = shows.find(s => s.id === entry.best_show_id)
              const isAggView  = selectedShow === 'all' || selectedMode === 'all'

              return (
                <div key={entry.personality_id} className={`border-b border-brand-border/50 last:border-0 ${isTop ? 'bg-brand-amber/5' : ''}`}>
                  <div className="grid grid-cols-12 gap-2 px-5 py-4 items-center hover:bg-brand-card/50 transition-colors">
                    <div className="col-span-1">
                      {i === 0 ? <span className="text-xl">🥇</span>
                      : i === 1 ? <span className="text-xl">🥈</span>
                      : i === 2 ? <span className="text-xl">🥉</span>
                      : <span className="font-display text-xl text-brand-muted">{i+1}</span>}
                    </div>
                    <div className="col-span-3 flex items-center gap-2">
                      <button onClick={() => router.push(`/host/leaderboard/player/${entry.personality_id}`)}
                        className="w-9 h-9 rounded-full overflow-hidden bg-brand-card border border-brand-border flex-shrink-0 hover:border-brand-amber transition-colors">
                        {pers?.photo_url
                          ? <img src={pers.photo_url} alt={pers.name} className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center text-brand-muted font-display">{pers?.name?.[0] ?? '?'}</div>}
                      </button>
                      <button onClick={() => router.push(`/host/leaderboard/player/${entry.personality_id}`)}
                        className="text-white font-medium text-sm truncate hover:text-brand-amber transition-colors text-left">
                        {pers?.name ?? 'Unknown'}
                      </button>
                    </div>
                    {isAggView && (
                      <div className="col-span-2 text-xs text-brand-muted leading-tight">
                        {bestShow && <div>{SHOW_ICONS[bestShow.slug] ?? '📺'} {bestShow.name}</div>}
                        {entry.best_mode && <div className="text-brand-muted/60">{MODE_LABELS[entry.best_mode]}</div>}
                      </div>
                    )}
                    <div className={`${isAggView ? 'col-span-1' : 'col-span-2'} text-center`}>
                      <span className={`font-display text-2xl ${isTop && sortBy === 'wins' ? 'text-brand-amber' : 'text-white'}`}>{entry.wins}</span>
                    </div>
                    <div className={`${isAggView ? 'col-span-1' : 'col-span-2'} text-center`}>
                      <span className={`font-display text-2xl ${isTop && sortBy === 'win_pct' ? 'text-brand-amber' : 'text-white'}`}>{winPct}%</span>
                    </div>
                    <div className="col-span-1 text-center">
                      <span className="font-display text-2xl text-brand-muted">{entry.games_played}</span>
                    </div>
                    <div className="col-span-2 text-center">
                      <span className={`font-display text-2xl ${isTop && sortBy === 'total_points' ? 'text-brand-amber' : 'text-white'}`}>{entry.total_points}</span>
                    </div>
                    <div className="col-span-1 text-right flex items-center justify-end gap-1">
                      <span className={`font-display text-xl ${isTop && sortBy === 'ppg' ? 'text-brand-amber' : 'text-brand-muted'}`}>{ppg}</span>
                      {managing && (
                        <button onClick={() => toggleExpand(entry.personality_id)}
                          className="text-brand-amber/60 hover:text-brand-amber transition-colors text-xs ml-1">
                          {isExpanded ? '▲' : '▼'}
                        </button>
                      )}
                    </div>
                  </div>

                  {managing && isExpanded && (
                    <div className="px-5 pb-4">
                      <div className="bg-brand-bg rounded-xl p-3 border border-brand-border/50">
                        <p className="text-brand-muted text-xs uppercase tracking-widest mb-2">Game History — click ✕ to remove a game</p>
                        {playerSessions.length === 0 ? (
                          <p className="text-brand-muted text-xs italic">No session data found.</p>
                        ) : (
                          <div className="flex flex-col gap-1">
                            {playerSessions.map(s => {
                              const sh = shows.find(sh => sh.id === s.show_id)
                              return (
                                <div key={s.id} className="flex items-center gap-3 text-sm py-1.5 border-b border-brand-border/30 last:border-0">
                                  <span className={`font-display text-lg w-8 ${s.won ? 'text-brand-amber' : 'text-white'}`}>{s.won ? '🏆' : s.score}</span>
                                  <span className="text-brand-muted text-xs flex-1">
                                    {new Date(s.played_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                    {isAggView && sh && ` · ${sh.name} · ${MODE_LABELS[s.mode] ?? s.mode}`}
                                  </span>
                                  <span className="text-white text-xs">{s.score} pts{s.won ? ' · Win' : ''}</span>
                                  <button onClick={() => handleDeleteSession(s)} disabled={deleting === s.id}
                                    className="text-brand-red/50 hover:text-brand-red transition-colors disabled:opacity-50 ml-2 text-base">
                                    {deleting === s.id ? '…' : '✕'}
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {entries.length > 0 && (
          <p className="text-brand-muted text-xs text-center mt-4">Click a player name to view their profile · Click column headers to sort · Manage mode to delete individual games</p>
        )}
      </div>
    </div>
  )
}
