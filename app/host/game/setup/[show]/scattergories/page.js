'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import NavBar from '@/components/NavBar'
import DraggablePlayerList from '@/components/DraggablePlayerList'
import { supabase } from '@/lib/supabase'

export default function ScattergoriesSetupPage() {
  const { show } = useParams()
  const router   = useRouter()

  const [personalities, setPersonalities] = useState([])
  const [categories, setCategories]       = useState([])
  const [showData, setShowData]           = useState(null)
  const [loading, setLoading]             = useState(true)
  const [creating, setCreating]           = useState(false)
  const [error, setError]                 = useState('')

  // Players
  const [playerCount, setPlayerCount]         = useState(2)
  const [selectedPlayers, setSelectedPlayers] = useState([])

  // Game settings
  const [answersPerPlayer, setAnswersPerPlayer] = useState(5)
  const [totalRounds, setTotalRounds]           = useState(3)
  const [timerEnabled, setTimerEnabled]         = useState(true)
  const [timerSeconds, setTimerSeconds]         = useState(120)
  const [trackLeaderboard, setTrackLeaderboard] = useState(false)

  // Round category selections: array of category IDs or 'random'
  const [roundCategories, setRoundCategories] = useState(['random'])

  // Season filter for season-specific categories
  const [seasonFilterEnabled, setSeasonFilterEnabled] = useState(false)
  const [seasonMin, setSeasonMin]                       = useState(1)
  const [seasonMax, setSeasonMax]                       = useState(50)

  useEffect(() => {
    async function load() {
      const [pRes, sRes, shRes, catRes] = await Promise.all([
        supabase.from('personalities').select('*').eq('active', true).order('name'),
        supabase.from('shows').select('*').eq('slug', show).single(),
        supabase.from('shows').select('*').eq('slug', show).single(),
        supabase.from('scat_categories').select('*').order('name'),
      ])
      setPersonalities(pRes.data ?? [])
      setShowData(sRes.data)
      const showCats = (catRes.data ?? []).filter(c => c.show_id === sRes.data?.id)
      setCategories(showCats)
      setLoading(false)
    }
    load()
  }, [show])

  // Sync selectedPlayers array when playerCount changes
  useEffect(() => {
    setSelectedPlayers(prev => {
      const next = [...prev]
      while (next.length < playerCount) next.push('')
      return next.slice(0, playerCount)
    })
  }, [playerCount])

  // Sync round categories array when totalRounds changes
  useEffect(() => {
    setRoundCategories(prev => {
      const next = [...prev]
      while (next.length < totalRounds) next.push('random')
      return next.slice(0, totalRounds)
    })
  }, [totalRounds])

  function setRoundCategory(idx, val) {
    setRoundCategories(prev => {
      const next = [...prev]
      next[idx] = val
      return next
    })
  }

  async function handleStart() {
    const filled = selectedPlayers.filter(Boolean)
    if (filled.length < playerCount) { setError('Please select all players'); return }
    setCreating(true); setError('')

    const settings = {
      mode:               'scattergories',
      answers_per_player: answersPerPlayer,
      timer_seconds:      timerEnabled ? timerSeconds : null,
      total_rounds:       totalRounds,
      track_leaderboard:  trackLeaderboard,
      season_min:         seasonFilterEnabled ? seasonMin : 1,
      season_max:         seasonFilterEnabled ? seasonMax : 50,
      round_categories:   roundCategories.map((cid, i) => ({ round: i + 1, category_id: cid })),
      current_round:      1,
      phase:              'timer',
      used_category_ids:  [],
      guess_count:        0,
    }

    const { data: session, error: sessErr } = await supabase
      .from('game_sessions')
      .insert({ mode: 'scattergories', show_id: showData?.id, status: 'active', current_round: 1, settings })
      .select().single()

    if (sessErr) { setError(sessErr.message); setCreating(false); return }

    const playerRows = filled.map((pid, idx) => ({
      session_id: session.id, personality_id: pid,
      turn_order: idx + 1, score: 0, strikes: 0, eliminated: false,
    }))
    const { error: playErr } = await supabase.from('session_players').insert(playerRows)
    if (playErr) { setError(playErr.message); setCreating(false); return }

    router.push(`/host/game/scattergories/${session.id}`)
  }

  if (loading) return <div className="min-h-screen bg-brand-bg flex items-center justify-center text-brand-muted">Loading…</div>

  return (
    <div className="min-h-screen bg-brand-bg">
      <NavBar />
      <div className="max-w-4xl mx-auto px-4 py-10">
        <div className="mb-8">
          <Link href={`/host/game/setup/${show}`} className="text-brand-muted hover:text-white text-sm mb-2 inline-flex items-center gap-1 transition-colors">
            ← {showData?.name ?? 'Show'}
          </Link>
          <h1 className="font-display text-6xl text-white tracking-wide">SCATTERGORIES SETUP</h1>
          <p className="text-brand-muted mt-1">{showData?.name}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left column */}
          <div className="flex flex-col gap-6">
            {/* Players */}
            <div className="bg-brand-panel border border-brand-border rounded-2xl p-6">
              <h2 className="font-display text-2xl text-white tracking-wide mb-1">PLAYERS</h2>
              <p className="text-brand-muted text-xs mb-4">Who's playing? (no turn order needed)</p>
              <DraggablePlayerList
                playerCount={playerCount}
                setPlayerCount={setPlayerCount}
                selectedPlayers={selectedPlayers}
                setSelectedPlayers={setSelectedPlayers}
                personalities={personalities}
              />
            </div>

            {/* Timer */}
            <div className="bg-brand-panel border border-brand-border rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="font-display text-2xl text-white tracking-wide">TIMER</h2>
                  <p className="text-brand-muted text-xs mt-0.5">Countdown per round</p>
                </div>
                <button onClick={() => setTimerEnabled(v => !v)}
                  className={`w-12 h-6 rounded-full transition-colors relative ${timerEnabled ? 'bg-brand-red' : 'bg-brand-border'}`}>
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${timerEnabled ? 'left-6' : 'left-0.5'}`} />
                </button>
              </div>
              {timerEnabled && (
                <div className="pt-3 border-t border-brand-border">
                  <div className="flex items-center gap-2 mb-1">
                    <label className="text-brand-muted text-xs uppercase tracking-widest">Seconds:</label>
                    <input type="number" min={10} max={600} value={timerSeconds}
                      onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v) && v >= 10) setTimerSeconds(v) }}
                      className="w-16 bg-brand-card border border-brand-border rounded-lg px-2 py-0.5 text-white text-sm font-display text-center focus:outline-none focus:border-brand-red" />
                  </div>
                  <input type="range" min={10} max={600} step={10} value={timerSeconds}
                    onChange={e => setTimerSeconds(parseInt(e.target.value))} className="w-full accent-brand-red" />
                  <div className="flex justify-between text-brand-muted text-xs mt-1"><span>10s</span><span>10m</span></div>
                </div>
              )}
            </div>

            {/* Leaderboard */}
            <div className="bg-brand-panel border border-brand-border rounded-2xl p-5">
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
          </div>

          {/* Right column */}
          <div className="flex flex-col gap-6">
            {/* Rounds + Categories */}
            <div className="bg-brand-panel border border-brand-border rounded-2xl p-6">
              <h2 className="font-display text-2xl text-white tracking-wide mb-4">ROUNDS & CATEGORIES</h2>
              <div className="flex items-center gap-4 mb-4">
                <div className="flex items-center gap-2">
                  <label className="text-brand-muted text-xs uppercase tracking-widest">Rounds:</label>
                  <input type="number" min={1} max={10} value={totalRounds}
                    onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v) && v >= 1 && v <= 10) setTotalRounds(v) }}
                    className="w-14 bg-brand-card border border-brand-border rounded-lg px-2 py-0.5 text-white text-sm font-display text-center focus:outline-none focus:border-brand-amber" />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-brand-muted text-xs uppercase tracking-widest">Answers/player:</label>
                  <input
                    type="number" min={3} max={8}
                    value={answersPerPlayer === 5 ? '' : answersPerPlayer}
                    placeholder="5"
                    onChange={e => {
                      const v = parseInt(e.target.value)
                      if (e.target.value === '') { setAnswersPerPlayer(5); return }
                      if (!isNaN(v) && v >= 3 && v <= 8) setAnswersPerPlayer(v)
                    }}
                    className="w-14 bg-brand-card border border-brand-border rounded-lg px-2 py-0.5 text-white text-sm font-display text-center focus:outline-none focus:border-brand-amber placeholder-brand-muted" />
                </div>
              </div>
              <input type="range" min={1} max={10} value={totalRounds}
                onChange={e => setTotalRounds(parseInt(e.target.value))} className="w-full accent-brand-amber mb-5" />

              {categories.length === 0 ? (
                <div className="text-brand-muted text-sm">
                  No categories for {showData?.name} yet.{' '}
                  <Link href="/host/admin/scat-categories" className="text-brand-amber hover:underline">Import one →</Link>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {roundCategories.map((val, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-brand-muted font-display text-sm w-16 flex-shrink-0">Round {idx + 1}</span>
                      <select value={val} onChange={e => setRoundCategory(idx, e.target.value)}
                        className="flex-1 min-w-0 bg-brand-card border border-brand-border rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-brand-amber truncate">
                        <option value="random">🎲 Random</option>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.name} ({c.type === 'career' ? 'Career' : 'Season'})</option>)}
                      </select>
                    </div>
                  ))}
                  <button onClick={() => setRoundCategories(roundCategories.map(() => 'random'))}
                    className="text-brand-muted text-xs hover:text-white transition-colors self-start">
                    Set all to random
                  </button>
                </div>
              )}
            </div>

            {/* Season filter */}
            <div className="bg-brand-panel border border-brand-border rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="font-display text-2xl text-white tracking-wide">SEASON FILTER</h2>
                  <p className="text-brand-muted text-xs mt-0.5">Limit valid answers to a season range (season-specific categories only)</p>
                </div>
                <button onClick={() => setSeasonFilterEnabled(v => !v)}
                  className={`w-12 h-6 rounded-full transition-colors relative ${seasonFilterEnabled ? 'bg-brand-amber' : 'bg-brand-border'}`}>
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${seasonFilterEnabled ? 'left-6' : 'left-0.5'}`} />
                </button>
              </div>
              {seasonFilterEnabled && (
                <div className="pt-3 border-t border-brand-border flex gap-4">
                  <div className="flex-1">
                    <label className="text-brand-muted text-xs uppercase tracking-widest block mb-1">Min Season</label>
                    <input type="number" min={1} max={50} value={seasonMin}
                      onChange={e => setSeasonMin(Math.max(1, Math.min(50, parseInt(e.target.value)||1)))}
                      className="w-full bg-brand-card border border-brand-border rounded-lg px-2 py-1.5 text-white text-sm font-display text-center focus:outline-none focus:border-brand-amber" />
                  </div>
                  <div className="flex-1">
                    <label className="text-brand-muted text-xs uppercase tracking-widest block mb-1">Max Season</label>
                    <input type="number" min={1} max={50} value={seasonMax}
                      onChange={e => setSeasonMax(Math.max(1, Math.min(50, parseInt(e.target.value)||50)))}
                      className="w-full bg-brand-card border border-brand-border rounded-lg px-2 py-1.5 text-white text-sm font-display text-center focus:outline-none focus:border-brand-amber" />
                  </div>
                </div>
              )}
            </div>
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
