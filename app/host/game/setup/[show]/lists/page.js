'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import NavBar from '@/components/NavBar'
import DraggablePlayerList from '@/components/DraggablePlayerList'
import { supabase } from '@/lib/supabase'

export default function ListsSetupPage() {
  const { show }  = useParams()
  const router    = useRouter()

  const [personalities, setPersonalities] = useState([])
  const [lists, setLists]                 = useState([])
  const [showData, setShowData]           = useState(null)
  const [loading, setLoading]             = useState(true)
  const [creating, setCreating]           = useState(false)
  const [error, setError]                 = useState('')

  // Player selection: pick a count, then fill dropdowns
  const [playerCount, setPlayerCount]     = useState(2)
  const [selectedPlayers, setSelectedPlayers] = useState([]) // array of personality ids, length = playerCount

  // Other settings
  const [selectedList, setSelectedList]   = useState('')
  const [gameMode, setGameMode]           = useState('strike')
  const [pickStyle, setPickStyle]         = useState('classic')
  const [totalRounds, setTotalRounds]     = useState(10)
  const [trackLeaderboard, setTrackLeaderboard] = useState(false)
  const [timerEnabled, setTimerEnabled]         = useState(false)
  const [timerSeconds, setTimerSeconds]         = useState(60)
  const [timerSdEnabled, setTimerSdEnabled]     = useState(true)

  useEffect(() => {
    async function load() {
      const [pRes, lRes, sRes] = await Promise.all([
        supabase.from('personalities').select('*').eq('active', true).order('name'),
        supabase.from('lists').select('*, shows(name, slug)').order('title'),
        supabase.from('shows').select('*').eq('slug', show).single(),
      ])
      setPersonalities(pRes.data ?? [])
      // Filter lists to this show only
      const showLists = (lRes.data ?? []).filter(l => l.shows?.slug === show)
      setLists(showLists)
      setShowData(sRes.data)
      setLoading(false)
    }
    load()
  }, [show])

  // When playerCount changes, resize selectedPlayers array
  useEffect(() => {
    setSelectedPlayers(prev => {
      const next = [...prev]
      while (next.length < playerCount) next.push('')
      return next.slice(0, playerCount)
    })
  }, [playerCount])

  function setPlayer(idx, id) {
    setSelectedPlayers(prev => {
      const next = [...prev]
      next[idx] = id
      return next
    })
  }

  // Personalities available for a given slot (not already picked in another slot)
  function availableFor(idx) {
    const others = selectedPlayers.filter((_, i) => i !== idx)
    return personalities.filter(p => !others.includes(p.id))
  }

  async function handleStart() {
    const filled = selectedPlayers.filter(Boolean)
    if (filled.length < playerCount) { setError('Please select all players'); return }
    if (!selectedList) { setError('Select a trivia list'); return }
    setCreating(true); setError('')

    const list = lists.find(l => l.id === selectedList)
    const settings = {
      list_id:              selectedList,
      timer_seconds:        timerEnabled ? timerSeconds : null,
      timer_sd_enabled:     timerEnabled ? timerSdEnabled : false,
      mode:                 gameMode,
      pick_style:           pickStyle,
      total_rounds:         gameMode === 'round' ? totalRounds : null,
      current_picker_index: 0,
      guess_count:          0,
      track_leaderboard:    trackLeaderboard,
    }

    const { data: session, error: sessErr } = await supabase
      .from('game_sessions')
      .insert({ mode: 'lists', show_id: showData?.id, status: 'active', current_round: 1, settings })
      .select().single()

    if (sessErr) { setError(sessErr.message); setCreating(false); return }

    const playerRows = filled.map((pid, idx) => ({
      session_id: session.id, personality_id: pid,
      turn_order: idx + 1, score: 0, strikes: 0, eliminated: false,
    }))
    const { error: playErr } = await supabase.from('session_players').insert(playerRows)
    if (playErr) { setError(playErr.message); setCreating(false); return }

    await supabase.from('game_rounds').insert({
      session_id: session.id, round_number: 1,
      question_data: { list_id: selectedList, current_answer_position: 1 },
      status: 'active',
    })

    router.push(`/host/game/${session.id}`)
  }

  if (loading) return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center text-brand-muted">Loading…</div>
  )

  return (
    <div className="min-h-screen bg-brand-bg">
      <NavBar />
      <div className="max-w-4xl mx-auto px-4 py-10">
        <div className="mb-8">
          <Link href={`/host/game/setup/${show}`} className="text-brand-muted hover:text-white text-sm mb-2 inline-flex items-center gap-1 transition-colors">
            ← {showData?.name ?? 'Show'}
          </Link>
          <h1 className="font-display text-6xl text-white tracking-wide">LISTS SETUP</h1>
          <p className="text-brand-muted mt-1">{showData?.name}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left column */}
          <div className="flex flex-col gap-6">

            {/* Player count + dropdowns */}
            <div className="bg-brand-panel border border-brand-border rounded-2xl p-6">
              <h2 className="font-display text-2xl text-white tracking-wide mb-1">PLAYERS</h2>
              <p className="text-brand-muted text-xs mb-4">How many players, and who?</p>

              <DraggablePlayerList
                playerCount={playerCount}
                setPlayerCount={setPlayerCount}
                selectedPlayers={selectedPlayers}
                setSelectedPlayers={setSelectedPlayers}
                personalities={personalities}
              />
            </div>

            {/* List selection */}
            <div className="bg-brand-panel border border-brand-border rounded-2xl p-6">
              <h2 className="font-display text-2xl text-white tracking-wide mb-1">TRIVIA LIST</h2>
              <p className="text-brand-muted text-xs mb-4">What are players guessing?</p>
              {lists.length === 0 ? (
                <div className="text-brand-muted text-sm">
                  No lists for {showData?.name} yet.{' '}
                  <Link href="/host/admin/lists" className="text-brand-amber hover:underline">Create one →</Link>
                </div>
              ) : (
                <select value={selectedList} onChange={e => setSelectedList(e.target.value)}
                  className="w-full bg-brand-card border border-brand-border rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand-red transition-colors">
                  <option value="">— Select a list —</option>
                  {lists.map(l => (
                    <option key={l.id} value={l.id}>{l.title} ({l.answer_count} answers)</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Right column */}
          <div className="flex flex-col gap-6">
            {/* Game mode */}
            <div className="bg-brand-panel border border-brand-border rounded-2xl p-6">
              <h2 className="font-display text-2xl text-white tracking-wide mb-4">GAME MODE</h2>
              <div className="flex flex-col gap-3">
                {[
                  { value: 'strike', label: '3-STRIKE MODE', desc: '3 strikes and you\'re eliminated. Last player standing wins.' },
                  { value: 'round',  label: 'ROUND MODE',    desc: 'No elimination. Most points after N rounds wins.' },
                ].map(opt => (
                  <button key={opt.value} onClick={() => setGameMode(opt.value)}
                    className={`text-left p-4 rounded-xl border transition-all ${
                      gameMode === opt.value
                        ? 'border-brand-amber bg-brand-amber/10'
                        : 'border-brand-border bg-brand-card hover:border-brand-border/80'
                    }`}>
                    <div className="font-display text-xl text-white tracking-wide">{opt.label}</div>
                    <div className="text-brand-muted text-xs mt-0.5">{opt.desc}</div>
                  </button>
                ))}
              </div>

              <div className="mt-4 pt-4 border-t border-brand-border flex flex-col gap-4">
                <div>
                  <label className="block text-brand-muted text-xs mb-2 uppercase tracking-widest">Pick Style</label>
                  <div className="flex gap-2">
                    {[{ value: 'classic', label: 'Classic (ABCABC)' }, { value: 'snake', label: 'Snake (ABCCBA)' }].map(opt => (
                      <button key={opt.value} onClick={() => setPickStyle(opt.value)}
                        className={`flex-1 py-2 rounded-xl border text-sm transition-all ${
                          pickStyle === opt.value
                            ? 'border-brand-green bg-brand-green/10 text-white'
                            : 'border-brand-border text-brand-muted hover:text-white'
                        }`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                {gameMode === 'round' && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <label className="text-brand-muted text-xs uppercase tracking-widest">Total Rounds:</label>
                      <input
                        type="number" min={1} max={100} value={totalRounds}
                        onChange={e => {
                          const v = parseInt(e.target.value)
                          if (!isNaN(v) && v >= 1 && v <= 100) setTotalRounds(v)
                        }}
                        className="w-14 bg-brand-card border border-brand-border rounded-lg px-2 py-0.5 text-white text-sm font-display text-center focus:outline-none focus:border-brand-green"
                      />
                    </div>
                    <input type="range" min={1} max={100} value={totalRounds}
                      onChange={e => setTotalRounds(parseInt(e.target.value))}
                      className="w-full accent-brand-green" />
                    <div className="flex justify-between text-brand-muted text-xs mt-1"><span>1</span><span>100</span></div>
                  </div>
                )}
              </div>
            </div>

            {/* Timer */}
            <div className="bg-brand-panel border border-brand-border rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="font-display text-2xl text-white tracking-wide">TIMER</h2>
                  <p className="text-brand-muted text-xs mt-0.5">Countdown per turn</p>
                </div>
                <button onClick={() => setTimerEnabled(v => !v)}
                  className={`w-12 h-6 rounded-full transition-colors relative ${timerEnabled ? 'bg-brand-red' : 'bg-brand-border'}`}>
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${timerEnabled ? 'left-6' : 'left-0.5'}`} />
                </button>
              </div>
              {timerEnabled && (
                <div className="flex flex-col gap-3 pt-3 border-t border-brand-border">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <label className="text-brand-muted text-xs uppercase tracking-widest">Seconds per turn:</label>
                      <input type="number" min={5} max={300} value={timerSeconds}
                        onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v) && v >= 5) setTimerSeconds(v) }}
                        className="w-16 bg-brand-card border border-brand-border rounded-lg px-2 py-0.5 text-white text-sm font-display text-center focus:outline-none focus:border-brand-red" />
                    </div>
                    <input type="range" min={5} max={300} step={5} value={timerSeconds}
                      onChange={e => setTimerSeconds(parseInt(e.target.value))} className="w-full accent-brand-red" />
                    <div className="flex justify-between text-brand-muted text-xs mt-1"><span>5s</span><span>5m</span></div>
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="text-brand-muted text-xs uppercase tracking-widest">Timer active in sudden death</label>
                    <button onClick={() => setTimerSdEnabled(v => !v)}
                      className={`w-10 h-5 rounded-full transition-colors relative ${timerSdEnabled ? 'bg-brand-amber' : 'bg-brand-border'}`}>
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${timerSdEnabled ? 'left-5' : 'left-0.5'}`} />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Leaderboard tracking */}
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
        </div>

        {error && <p className="text-brand-red text-sm mt-4 text-center">{error}</p>}
        <button onClick={handleStart} disabled={creating}
          className="w-full mt-6 bg-brand-red hover:bg-red-600 disabled:opacity-50 text-white font-display text-4xl tracking-widest py-5 rounded-2xl transition-colors shadow-[0_0_40px_rgba(230,57,70,0.2)] hover:shadow-[0_0_60px_rgba(230,57,70,0.35)]">
          {creating ? 'LAUNCHING…' : 'START GAME'}
        </button>
      </div>
    </div>
  )
}
