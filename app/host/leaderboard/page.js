'use client'
import { useEffect, useState } from 'react'
import NavBar from '@/components/NavBar'
import { supabase } from '@/lib/supabase'

const MODE_LABELS = { lists: 'Lists', boot_order: 'Boot Order' }
const SHOW_ICONS  = { 'survivor': '🌴', 'big-brother': '👁️', 'the-challenge': '🏆', 'drag-race': '👑' }

export default function LeaderboardPage() {
  const [shows, setShows]               = useState([])
  const [entries, setEntries]           = useState([])
  const [personalities, setPersonalities] = useState({})
  const [loading, setLoading]           = useState(true)
  const [selectedShow, setSelectedShow] = useState('')
  const [selectedMode, setSelectedMode] = useState('lists')
  const [managing, setManaging]         = useState(false)
  const [expanded, setExpanded]         = useState(null) // personality_id with sessions expanded
  const [sessions, setSessions]         = useState({})  // personality_id → session rows
  const [deleting, setDeleting]         = useState(null)

  useEffect(() => {
    async function load() {
      const [showRes, persRes] = await Promise.all([
        supabase.from('shows').select('*').order('name'),
        supabase.from('personalities').select('*').order('name'),
      ])
      const showData = showRes.data ?? []
      setShows(showData)
      if (showData.length > 0) setSelectedShow(showData[0].id)
      const pMap = {}
      ;(persRes.data ?? []).forEach(p => { pMap[p.id] = p })
      setPersonalities(pMap)
      setLoading(false)
    }
    load()
  }, [])

  async function loadEntries() {
    if (!selectedShow) return
    const { data } = await supabase
      .from('leaderboard').select('*')
      .eq('show_id', selectedShow).eq('mode', selectedMode)
      .order('wins', { ascending: false })
      .order('total_points', { ascending: false })
    setEntries(data ?? [])
  }

  useEffect(() => { loadEntries() }, [selectedShow, selectedMode])

  async function loadSessions(personalityId) {
    if (sessions[personalityId]) return // already loaded
    const { data } = await supabase
      .from('leaderboard_sessions').select('*')
      .eq('personality_id', personalityId)
      .eq('show_id', selectedShow).eq('mode', selectedMode)
      .order('played_at', { ascending: false })
    setSessions(prev => ({ ...prev, [personalityId]: data ?? [] }))
  }

  function toggleExpand(personalityId) {
    if (expanded === personalityId) {
      setExpanded(null)
    } else {
      setExpanded(personalityId)
      loadSessions(personalityId)
    }
  }

  async function handleDeleteSession(sessionRow) {
    if (!confirm('Remove this game from the leaderboard?')) return
    setDeleting(sessionRow.id)

    // Delete the session row
    await supabase.from('leaderboard_sessions').delete().eq('id', sessionRow.id)

    // Rebuild the aggregate for this personality from remaining sessions
    const { data: remaining } = await supabase
      .from('leaderboard_sessions').select('*')
      .eq('personality_id', sessionRow.personality_id)
      .eq('show_id', selectedShow).eq('mode', selectedMode)

    const newGames  = remaining?.length ?? 0
    const newWins   = remaining?.filter(r => r.won).length ?? 0
    const newPoints = remaining?.reduce((sum, r) => sum + (r.score ?? 0), 0) ?? 0

    if (newGames === 0) {
      await supabase.from('leaderboard').delete()
        .eq('personality_id', sessionRow.personality_id)
        .eq('show_id', selectedShow).eq('mode', selectedMode)
    } else {
      await supabase.from('leaderboard').update({
        games_played: newGames, wins: newWins, total_points: newPoints,
        updated_at: new Date().toISOString(),
      }).eq('personality_id', sessionRow.personality_id)
        .eq('show_id', selectedShow).eq('mode', selectedMode)
    }

    // Refresh UI
    setSessions(prev => ({
      ...prev,
      [sessionRow.personality_id]: (prev[sessionRow.personality_id] ?? []).filter(s => s.id !== sessionRow.id)
    }))
    await loadEntries()
    setDeleting(null)
  }

  async function handleClearAll() {
    if (!confirm('Clear ALL leaderboard records for this show + mode?')) return
    await Promise.all([
      supabase.from('leaderboard').delete().eq('show_id', selectedShow).eq('mode', selectedMode),
      supabase.from('leaderboard_sessions').delete().eq('show_id', selectedShow).eq('mode', selectedMode),
    ])
    setEntries([])
    setSessions({})
    setExpanded(null)
  }

  const modes = ['lists', 'boot_order']

  return (
    <div className="min-h-screen bg-brand-bg">
      <NavBar />
      <div className="max-w-4xl mx-auto px-4 py-10">

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="font-display text-6xl text-white tracking-wide">LEADERBOARD</h1>
            <p className="text-brand-muted mt-1">All-time standings</p>
          </div>
          <button onClick={() => setManaging(v => !v)}
            className={`px-4 py-2 rounded-xl border font-display text-lg tracking-wide transition-all ${
              managing ? 'border-brand-red bg-brand-red/10 text-brand-red' : 'border-brand-border text-brand-muted hover:text-white'
            }`}>
            {managing ? 'DONE' : 'MANAGE'}
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6">
          <div className="flex gap-2 flex-wrap">
            {shows.map(s => (
              <button key={s.id} onClick={() => { setSelectedShow(s.id); setExpanded(null); setSessions({}) }}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl border font-display text-lg tracking-wide transition-all ${
                  selectedShow === s.id ? 'border-brand-amber bg-brand-amber/10 text-brand-amber' : 'border-brand-border text-brand-muted hover:text-white'
                }`}>
                <span>{SHOW_ICONS[s.slug] ?? '📺'}</span>{s.name.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            {modes.map(m => (
              <button key={m} onClick={() => { setSelectedMode(m); setExpanded(null); setSessions({}) }}
                className={`px-4 py-2 rounded-xl border font-display text-lg tracking-wide transition-all ${
                  selectedMode === m ? 'border-brand-red bg-brand-red/10 text-brand-red' : 'border-brand-border text-brand-muted hover:text-white'
                }`}>
                {MODE_LABELS[m] ?? m}
              </button>
            ))}
          </div>
        </div>

        {/* Clear all */}
        {managing && entries.length > 0 && (
          <div className="flex justify-end mb-3">
            <button onClick={handleClearAll}
              className="text-sm text-brand-red hover:underline border border-brand-red/30 hover:border-brand-red/60 px-3 py-1.5 rounded-lg transition-colors">
              Clear all records for this view
            </button>
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="text-brand-muted text-center py-20">Loading…</div>
        ) : entries.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">📊</div>
            <p className="text-brand-muted">No games tracked yet for this mode.</p>
            <p className="text-brand-muted text-sm mt-1">Enable "Track Leaderboard" when setting up a game.</p>
          </div>
        ) : (
          <div className="bg-brand-panel border border-brand-border rounded-2xl overflow-hidden">
            <div className="grid grid-cols-12 gap-4 px-5 py-3 border-b border-brand-border">
              <div className="col-span-1 text-brand-muted text-xs uppercase tracking-widest">#</div>
              <div className="col-span-5 text-brand-muted text-xs uppercase tracking-widest">Player</div>
              <div className="col-span-2 text-brand-muted text-xs uppercase tracking-widest text-center">Wins</div>
              <div className="col-span-2 text-brand-muted text-xs uppercase tracking-widest text-center">Games</div>
              <div className="col-span-2 text-brand-muted text-xs uppercase tracking-widest text-right">Points</div>
            </div>

            {entries.map((entry, i) => {
              const pers    = personalities[entry.personality_id]
              const winPct  = entry.games_played > 0 ? Math.round((entry.wins / entry.games_played) * 100) : 0
              const isTop   = i === 0
              const isTied  = i > 0 && entries[i-1].wins === entry.wins && entries[i-1].total_points === entry.total_points
              const isExpanded = expanded === entry.personality_id
              const playerSessions = sessions[entry.personality_id] ?? []

              return (
                <div key={entry.id} className={`border-b border-brand-border/50 last:border-0 ${isTop ? 'bg-brand-amber/5' : ''}`}>
                  {/* Main row */}
                  <div className="grid grid-cols-12 gap-4 px-5 py-4 items-center hover:bg-brand-card transition-colors">
                    <div className="col-span-1">
                      {i === 0 ? <span className="text-2xl">🥇</span>
                      : i === 1 ? <span className="text-2xl">🥈</span>
                      : i === 2 ? <span className="text-2xl">🥉</span>
                      : <span className="font-display text-2xl text-brand-muted">{isTied ? '=' : i+1}</span>}
                    </div>
                    <div className="col-span-5 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full overflow-hidden bg-brand-card border border-brand-border flex-shrink-0">
                        {pers?.photo_url
                          ? <img src={pers.photo_url} alt={pers.name} className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center text-brand-muted font-display">{pers?.name?.[0] ?? '?'}</div>}
                      </div>
                      <div>
                        <div className="text-white font-medium">{pers?.name ?? 'Unknown'}</div>
                        <div className="text-brand-muted text-xs">{winPct}% win rate</div>
                      </div>
                    </div>
                    <div className="col-span-2 text-center">
                      <span className={`font-display text-3xl ${isTop ? 'text-brand-amber' : 'text-white'}`}>{entry.wins}</span>
                    </div>
                    <div className="col-span-2 text-center">
                      <span className="font-display text-3xl text-brand-muted">{entry.games_played}</span>
                    </div>
                    <div className="col-span-2 flex items-center justify-end gap-2">
                      <span className="font-display text-3xl text-white">{entry.total_points}</span>
                      {managing && (
                        <button onClick={() => toggleExpand(entry.personality_id)}
                          className="text-brand-amber/60 hover:text-brand-amber transition-colors text-sm ml-1">
                          {isExpanded ? '▲' : '▼'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded sessions */}
                  {managing && isExpanded && (
                    <div className="px-5 pb-3 animate-fade-in">
                      <div className="bg-brand-bg rounded-xl p-3 border border-brand-border/50">
                        <p className="text-brand-muted text-xs uppercase tracking-widest mb-2">Game History</p>
                        {playerSessions.length === 0 ? (
                          <p className="text-brand-muted text-xs">No session data available for older games.</p>
                        ) : (
                          <div className="flex flex-col gap-1">
                            {playerSessions.map((s, si) => (
                              <div key={s.id} className="flex items-center gap-3 text-sm py-1.5 border-b border-brand-border/30 last:border-0">
                                <span className={`w-12 font-display text-lg ${s.won ? 'text-brand-amber' : 'text-brand-muted'}`}>
                                  {s.won ? '🏆' : `+${s.score}`}
                                </span>
                                <span className="text-brand-muted text-xs flex-1">
                                  {new Date(s.played_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </span>
                                <span className="text-white text-xs">{s.score} pts{s.won ? ' · Win' : ''}</span>
                                <button onClick={() => handleDeleteSession(s)} disabled={deleting === s.id}
                                  className="text-brand-red/50 hover:text-brand-red transition-colors disabled:opacity-50 ml-2">
                                  {deleting === s.id ? '…' : '✕'}
                                </button>
                              </div>
                            ))}
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
      </div>
    </div>
  )
}
