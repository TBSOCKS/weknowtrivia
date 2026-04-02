'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import NavBar from '@/components/NavBar'
import DraggablePlayerList from '@/components/DraggablePlayerList'
import { supabase } from '@/lib/supabase'

export default function BootOrderSetupPage() {
  const { show }  = useParams()
  const router    = useRouter()

  const [personalities, setPersonalities] = useState([])
  const [seasons, setSeasons]             = useState([])
  const [showData, setShowData]           = useState(null)
  const [loading, setLoading]             = useState(true)
  const [creating, setCreating]           = useState(false)
  const [trackLeaderboard, setTrackLeaderboard] = useState(false)
  const [error, setError]                 = useState('')

  // Players
  const [playerCount, setPlayerCount]     = useState(2)
  const [selectedPlayers, setSelectedPlayers] = useState([])

  // Season pool
  const [excludedSeasons, setExcludedSeasons] = useState(new Set())
  const [showSeasonFilter, setShowSeasonFilter] = useState(false)

  // Settings
  const [placementMin, setPlacementMin]   = useState(1)
  const [placementMax, setPlacementMax]   = useState(18)
  const [totalRounds, setTotalRounds]     = useState(10)
  const [gameType, setGameType]           = useState('host') // 'host' | 'code'

  useEffect(() => {
    async function load() {
      const [pRes, sRes, shRes] = await Promise.all([
        supabase.from('personalities').select('*').eq('active', true).order('name'),
        supabase.from('seasons').select('*, shows(slug)').order('season_number'),
        supabase.from('shows').select('*').eq('slug', show).single(),
      ])
      setPersonalities(pRes.data ?? [])
      setSeasons((sRes.data ?? []).filter(s => s.shows?.slug === show))
      setShowData(shRes.data)
      setLoading(false)
    }
    load()
  }, [show])

  useEffect(() => {
    setSelectedPlayers(prev => {
      const next = [...prev]
      while (next.length < playerCount) next.push('')
      return next.slice(0, playerCount)
    })
  }, [playerCount])

  function setPlayer(idx, id) {
    setSelectedPlayers(prev => { const n = [...prev]; n[idx] = id; return n })
  }

  function availableFor(idx) {
    const others = selectedPlayers.filter((_, i) => i !== idx)
    return personalities.filter(p => !others.includes(p.id))
  }

  function toggleSeason(id) {
    setExcludedSeasons(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function generateCode() {
    return Math.random().toString(36).substring(2, 6).toUpperCase()
  }

  async function handleStart() {
    const filled = selectedPlayers.filter(Boolean)
    if (filled.length < playerCount) { setError('Please select all players'); return }
    if (seasons.filter(s => !excludedSeasons.has(s.id)).length === 0) {
      setError('At least one season must be included'); return
    }
    setCreating(true); setError('')

    const includedSeasonIds = seasons.filter(s => !excludedSeasons.has(s.id)).map(s => s.id)
    const code = gameType === 'code' ? generateCode() : null

    const settings = {
      timer_seconds:    null,
      total_rounds:     totalRounds,
      current_round:    1,
      placement_min:    placementMin,
      placement_max:    placementMax,
      season_pool:      includedSeasonIds,
      game_type:        gameType,
      track_leaderboard: trackLeaderboard,
    }

    const { data: session, error: sessErr } = await supabase
      .from('game_sessions')
      .insert({ mode: 'boot_order', show_id: showData?.id, status: 'active', current_round: 1, settings, code })
      .select().single()

    if (sessErr) { setError(sessErr.message); setCreating(false); return }

    const playerRows = filled.map((pid, idx) => ({
      session_id: session.id, personality_id: pid,
      turn_order: idx + 1, score: 0, strikes: 0, eliminated: false,
    }))
    await supabase.from('session_players').insert(playerRows)

    router.push(`/host/game/boot-order/${session.id}`)
  }

  if (loading) return <div className="min-h-screen bg-brand-bg flex items-center justify-center text-brand-muted">Loading…</div>

  return (
    <div className="min-h-screen bg-brand-bg">
      <NavBar />
      <div className="max-w-5xl mx-auto px-4 py-10">
        <div className="mb-8">
          <Link href={`/host/game/setup/${show}`} className="text-brand-muted hover:text-white text-sm mb-2 inline-flex items-center gap-1 transition-colors">
            ← {showData?.name ?? 'Show'}
          </Link>
          <h1 className="font-display text-6xl text-white tracking-wide">BOOT ORDER SETUP</h1>
          <p className="text-brand-muted mt-1">{showData?.name}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left */}
          <div className="flex flex-col gap-6">

            {/* Players */}
            <div className="bg-brand-panel border border-brand-border rounded-2xl p-6">
              <h2 className="font-display text-2xl text-white tracking-wide mb-1">PLAYERS</h2>
              <p className="text-brand-muted text-xs mb-4">How many players?</p>

              <DraggablePlayerList
                playerCount={playerCount}
                setPlayerCount={setPlayerCount}
                selectedPlayers={selectedPlayers}
                setSelectedPlayers={setSelectedPlayers}
                personalities={personalities}
              />

            </div>

            {/* Season pool */}
            <div className="bg-brand-panel border border-brand-border rounded-2xl p-6">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="font-display text-2xl text-white tracking-wide">SEASON POOL</h2>
                  <p className="text-brand-muted text-xs">{seasons.length - excludedSeasons.size} of {seasons.length} seasons included</p>
                </div>
                <button onClick={() => setShowSeasonFilter(v => !v)}
                  className="text-sm text-brand-amber hover:underline">{showSeasonFilter ? 'Done' : 'Filter'}</button>
              </div>
              {showSeasonFilter && (
                <div className="mt-2 max-h-48 overflow-y-auto flex flex-col gap-1 animate-slide-up">
                  <div className="flex gap-2 mb-2">
                    <button onClick={() => setExcludedSeasons(new Set())} className="text-xs text-brand-green hover:underline">Select all</button>
                    <span className="text-brand-border">·</span>
                    <button onClick={() => setExcludedSeasons(new Set(seasons.map(s => s.id)))} className="text-xs text-brand-red hover:underline">Deselect all</button>
                  </div>
                  {seasons.map(s => {
                    const included = !excludedSeasons.has(s.id)
                    return (
                      <label key={s.id} className="flex items-center gap-2 cursor-pointer text-sm py-0.5">
                        <input type="checkbox" checked={included} onChange={() => toggleSeason(s.id)} className="accent-brand-amber w-3.5 h-3.5" />
                        <span className={included ? 'text-white' : 'text-brand-muted line-through'}>S{s.season_number}: {s.name}</span>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right */}
          <div className="flex flex-col gap-6">

            {/* Game type */}
            <div className="bg-brand-panel border border-brand-border rounded-2xl p-6">
              <h2 className="font-display text-2xl text-white tracking-wide mb-4">GAME TYPE</h2>
              <div className="flex flex-col gap-3">
                {[
                  { value: 'host', icon: '🎬', label: 'HOST-ONLY', desc: 'Host enters answers for all players after each round.' },
                  { value: 'code', icon: '📱', label: '4-DIGIT CODE', desc: 'Players submit answers from their own devices.' },
                ].map(opt => (
                  <button key={opt.value} onClick={() => setGameType(opt.value)}
                    className={`text-left p-4 rounded-xl border transition-all flex items-center gap-4 ${gameType === opt.value ? 'border-brand-amber bg-brand-amber/10' : 'border-brand-border bg-brand-card'}`}>
                    <span className="text-2xl">{opt.icon}</span>
                    <div>
                      <div className="font-display text-xl text-white tracking-wide">{opt.label}</div>
                      <div className="text-brand-muted text-xs">{opt.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Placement range */}
            <div className="bg-brand-panel border border-brand-border rounded-2xl p-6">
              <h2 className="font-display text-2xl text-white tracking-wide mb-4">PLACEMENT RANGE</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-brand-muted text-xs mb-1.5 uppercase tracking-widest">Min Placement</label>
                  <input type="number" min={1} max={placementMax}
                    value={placementMin || ''}
                    onChange={e => {
                      if (e.target.value === '') { setPlacementMin(0); return }
                      const n = parseInt(e.target.value)
                      if (!isNaN(n)) setPlacementMin(Math.min(n, placementMax))
                    }}
                    onBlur={() => { if (!placementMin || placementMin < 1) setPlacementMin(1) }}
                    className="w-full bg-brand-card border border-brand-border rounded-xl px-4 py-2.5 text-white text-center font-display text-2xl focus:outline-none focus:border-brand-amber" />
                  <p className="text-brand-muted text-xs mt-1 text-center">1 = winner</p>
                </div>
                <div>
                  <label className="block text-brand-muted text-xs mb-1.5 uppercase tracking-widest">Max Placement</label>
                  <input type="number" min={placementMin} max={50}
                    value={placementMax || ''}
                    onChange={e => {
                      if (e.target.value === '') { setPlacementMax(0); return }
                      const n = parseInt(e.target.value)
                      if (!isNaN(n)) setPlacementMax(n)
                    }}
                    onBlur={() => {
                      if (!placementMax || placementMax < placementMin) setPlacementMax(Math.max(placementMin, 18))
                    }}
                    className="w-full bg-brand-card border border-brand-border rounded-xl px-4 py-2.5 text-white text-center font-display text-2xl focus:outline-none focus:border-brand-amber" />
                </div>
              </div>
            </div>

            {/* Rounds + Timer */}
            <div className="bg-brand-panel border border-brand-border rounded-2xl p-6">
              <h2 className="font-display text-2xl text-white tracking-wide mb-4">ROUNDS & TIMER</h2>
              <div className="flex flex-col gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <label className="text-brand-muted text-xs uppercase tracking-widest">Total Rounds:</label>
                    <input type="number" min={1} max={50} value={totalRounds}
                      onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v) && v >= 1) setTotalRounds(v) }}
                      className="w-14 bg-brand-card border border-brand-border rounded-lg px-2 py-0.5 text-white text-sm font-display text-center focus:outline-none focus:border-brand-amber" />
                  </div>
                  <input type="range" min={1} max={50} value={totalRounds}
                    onChange={e => setTotalRounds(parseInt(e.target.value))} className="w-full accent-brand-amber" />
                </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Leaderboard tracking */}
        <div className="bg-brand-panel border border-brand-border rounded-2xl p-5 mt-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-2xl text-white tracking-wide">TRACK LEADERBOARD</h2>
              <p className="text-brand-muted text-xs mt-0.5">Record this game's results</p>
            </div>
            <button onClick={() => setTrackLeaderboard(v => !v)}
              className={`w-12 h-6 rounded-full transition-colors relative ${trackLeaderboard ? 'bg-brand-green' : 'bg-brand-border'}`}>
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${trackLeaderboard ? 'left-6' : 'left-0.5'}`} />
            </button>
          </div>
        </div>

        {error && <p className="text-brand-red text-sm mt-4 text-center">{error}</p>}
        <button onClick={handleStart} disabled={creating}
          className="w-full mt-6 bg-brand-red hover:bg-red-600 disabled:opacity-50 text-white font-display text-4xl tracking-widest py-5 rounded-2xl transition-colors shadow-[0_0_40px_rgba(230,57,70,0.2)]">
          {creating ? 'LAUNCHING…' : 'START GAME'}
        </button>
      </div>
    </div>
  )
}
