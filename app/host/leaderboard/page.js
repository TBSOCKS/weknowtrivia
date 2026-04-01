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

  useEffect(() => {
    if (!selectedShow) return
    async function loadEntries() {
      const { data } = await supabase
        .from('leaderboard')
        .select('*')
        .eq('show_id', selectedShow)
        .eq('mode', selectedMode)
        .order('wins', { ascending: false })
        .order('total_points', { ascending: false })
      setEntries(data ?? [])
    }
    loadEntries()
  }, [selectedShow, selectedMode])

  async function handleDeleteEntry(id) {
    if (!confirm('Remove this player from the leaderboard?')) return
    setDeleting(id)
    await supabase.from('leaderboard').delete().eq('id', id)
    setEntries(prev => prev.filter(e => e.id !== id))
    setDeleting(null)
  }

  async function handleClearAll() {
    if (!confirm('Clear ALL leaderboard records for this show + mode? This cannot be undone.')) return
    await supabase.from('leaderboard')
      .delete().eq('show_id', selectedShow).eq('mode', selectedMode)
    setEntries([])
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
              managing
                ? 'border-brand-red bg-brand-red/10 text-brand-red'
                : 'border-brand-border text-brand-muted hover:text-white'
            }`}>
            {managing ? 'DONE' : 'MANAGE'}
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6">
          <div className="flex gap-2 flex-wrap">
            {shows.map(s => (
              <button key={s.id} onClick={() => setSelectedShow(s.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl border font-display text-lg tracking-wide transition-all ${
                  selectedShow === s.id
                    ? 'border-brand-amber bg-brand-amber/10 text-brand-amber'
                    : 'border-brand-border text-brand-muted hover:text-white'
                }`}>
                <span>{SHOW_ICONS[s.slug] ?? '📺'}</span>
                {s.name.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            {modes.map(m => (
              <button key={m} onClick={() => setSelectedMode(m)}
                className={`px-4 py-2 rounded-xl border font-display text-lg tracking-wide transition-all ${
                  selectedMode === m
                    ? 'border-brand-red bg-brand-red/10 text-brand-red'
                    : 'border-brand-border text-brand-muted hover:text-white'
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
            {/* Column headers */}
            <div className="grid grid-cols-12 gap-4 px-5 py-3 border-b border-brand-border">
              <div className="col-span-1 text-brand-muted text-xs uppercase tracking-widest">#</div>
              <div className="col-span-5 text-brand-muted text-xs uppercase tracking-widest">Player</div>
              <div className="col-span-2 text-brand-muted text-xs uppercase tracking-widest text-center">Wins</div>
              <div className="col-span-2 text-brand-muted text-xs uppercase tracking-widest text-center">Games</div>
              <div className="col-span-2 text-brand-muted text-xs uppercase tracking-widest text-right">Points</div>
            </div>

            {entries.map((entry, i) => {
              const pers   = personalities[entry.personality_id]
              const winPct = entry.games_played > 0 ? Math.round((entry.wins / entry.games_played) * 100) : 0
              const isTop  = i === 0
              const isTied = i > 0 && entries[i - 1].wins === entry.wins && entries[i - 1].total_points === entry.total_points

              return (
                <div key={entry.id}
                  className={`grid grid-cols-12 gap-4 px-5 py-4 items-center border-b border-brand-border/50 last:border-0 hover:bg-brand-card transition-colors ${isTop ? 'bg-brand-amber/5' : ''}`}>

                  {/* Rank */}
                  <div className="col-span-1">
                    {i === 0 ? <span className="text-2xl">🥇</span>
                    : i === 1 ? <span className="text-2xl">🥈</span>
                    : i === 2 ? <span className="text-2xl">🥉</span>
                    : <span className="font-display text-2xl text-brand-muted">{isTied ? '=' : i + 1}</span>}
                  </div>

                  {/* Player */}
                  <div className="col-span-5 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full overflow-hidden bg-brand-card border border-brand-border flex-shrink-0">
                      {pers?.photo_url
                        ? <img src={pers.photo_url} alt={pers.name} className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center text-brand-muted font-display">{pers?.name?.[0] ?? '?'}</div>
                      }
                    </div>
                    <div>
                      <div className="text-white font-medium">{pers?.name ?? 'Unknown'}</div>
                      <div className="text-brand-muted text-xs">{winPct}% win rate</div>
                    </div>
                  </div>

                  {/* Wins */}
                  <div className="col-span-2 text-center">
                    <span className={`font-display text-3xl ${isTop ? 'text-brand-amber' : 'text-white'}`}>
                      {entry.wins}
                    </span>
                  </div>

                  {/* Games */}
                  <div className="col-span-2 text-center">
                    <span className="font-display text-3xl text-brand-muted">{entry.games_played}</span>
                  </div>

                  {/* Points + delete */}
                  <div className="col-span-2 flex items-center justify-end gap-2">
                    <span className="font-display text-3xl text-white">{entry.total_points}</span>
                    {managing && (
                      <button onClick={() => handleDeleteEntry(entry.id)} disabled={deleting === entry.id}
                        className="text-brand-red/50 hover:text-brand-red transition-colors text-lg disabled:opacity-50">
                        {deleting === entry.id ? '…' : '✕'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
