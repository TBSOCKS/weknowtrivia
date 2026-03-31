'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import NavBar from '@/components/NavBar'
import { supabase } from '@/lib/supabase'

export default function GameSetupPage() {
  const router = useRouter()

  const [personalities, setPersonalities] = useState([])
  const [lists, setLists]                 = useState([])
  const [loading, setLoading]             = useState(true)
  const [creating, setCreating]           = useState(false)
  const [error, setError]                 = useState('')

  // Settings
  const [selectedPlayers, setSelectedPlayers] = useState([])   // personality ids
  const [selectedList, setSelectedList]       = useState('')
  const [timerEnabled, setTimerEnabled]       = useState(false)
  const [timerSeconds, setTimerSeconds]       = useState(60)
  const [gameMode, setGameMode]               = useState('strike') // 'strike' | 'round'
  const [pickStyle, setPickStyle]             = useState('classic') // 'classic' | 'snake'
  const [totalRounds, setTotalRounds]         = useState(10)

  useEffect(() => {
    async function load() {
      const [pRes, lRes] = await Promise.all([
        supabase.from('personalities').select('*').eq('active', true).order('name'),
        supabase.from('lists').select('*, shows(name)').order('title'),
      ])
      setPersonalities(pRes.data ?? [])
      setLists(lRes.data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  function togglePlayer(id) {
    setSelectedPlayers(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    )
  }

  async function handleStart() {
    if (selectedPlayers.length < 1) { setError('Select at least 1 player'); return }
    if (!selectedList) { setError('Select a trivia list'); return }
    setCreating(true); setError('')

    const list = lists.find(l => l.id === selectedList)

    // Build settings JSONB
    const settings = {
      list_id:              selectedList,
      timer_seconds:        timerEnabled ? timerSeconds : null,
      mode:                 gameMode,
      pick_style:           gameMode === 'round' ? pickStyle : null,
      total_rounds:         gameMode === 'round' ? totalRounds : null,
      current_picker_index: 0,
      guess_count:          0,
    }

    // Create session
    const { data: session, error: sessErr } = await supabase
      .from('game_sessions')
      .insert({
        mode:         'lists',
        show_id:      list.show_id,
        status:       'active',
        current_round: 1,
        settings,
      })
      .select()
      .single()

    if (sessErr) { setError(sessErr.message); setCreating(false); return }

    // Create session players with turn order
    const playerRows = selectedPlayers.map((pid, idx) => ({
      session_id:     session.id,
      personality_id: pid,
      turn_order:     idx + 1,
      score:          0,
      strikes:        0,
      eliminated:     false,
    }))
    const { error: playErr } = await supabase.from('session_players').insert(playerRows)
    if (playErr) { setError(playErr.message); setCreating(false); return }

    // Create round 1
    await supabase.from('game_rounds').insert({
      session_id:    session.id,
      round_number:  1,
      question_data: { list_id: selectedList, current_answer_position: 1 },
      status:        'active',
    })

    router.push(`/host/game/${session.id}`)
  }

  if (loading) return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center text-brand-muted">
      <NavBar />Loading…
    </div>
  )

  return (
    <div className="min-h-screen bg-brand-bg">
      <NavBar />
      <div className="max-w-4xl mx-auto px-4 py-10">
        <div className="mb-8">
          <h1 className="font-display text-6xl text-white tracking-wide">GAME SETUP</h1>
          <p className="text-brand-muted mt-1">Configure your Lists game</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left column */}
          <div className="flex flex-col gap-6">
            {/* Player selection */}
            <div className="bg-brand-panel border border-brand-border rounded-2xl p-6">
              <h2 className="font-display text-2xl text-white tracking-wide mb-1">PLAYERS</h2>
              <p className="text-brand-muted text-xs mb-4">Select who is playing ({selectedPlayers.length} selected)</p>
              <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
                {personalities.map(p => {
                  const selected = selectedPlayers.includes(p.id)
                  return (
                    <button
                      key={p.id}
                      onClick={() => togglePlayer(p.id)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-left ${
                        selected
                          ? 'border-brand-red bg-brand-red/10'
                          : 'border-brand-border hover:border-brand-border/80 bg-brand-card'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 ${
                        selected ? 'bg-brand-red border-brand-red' : 'border-brand-border'
                      }`}>
                        {selected && <span className="text-white text-xs">✓</span>}
                      </div>
                      <div className="w-8 h-8 rounded-full overflow-hidden bg-brand-border flex-shrink-0">
                        {p.photo_url
                          ? <img src={p.photo_url} alt={p.name} className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center text-brand-muted text-sm">{p.name[0]}</div>
                        }
                      </div>
                      <span className="text-white text-sm">{p.name}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* List selection */}
            <div className="bg-brand-panel border border-brand-border rounded-2xl p-6">
              <h2 className="font-display text-2xl text-white tracking-wide mb-1">TRIVIA LIST</h2>
              <p className="text-brand-muted text-xs mb-4">What are players guessing?</p>
              <select
                value={selectedList}
                onChange={e => setSelectedList(e.target.value)}
                className="w-full bg-brand-card border border-brand-border rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand-red transition-colors"
              >
                <option value="">— Select a list —</option>
                {lists.map(l => (
                  <option key={l.id} value={l.id}>
                    [{l.shows?.name}] {l.title} ({l.answer_count} answers)
                  </option>
                ))}
              </select>
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
                  <button
                    key={opt.value}
                    onClick={() => setGameMode(opt.value)}
                    className={`text-left p-4 rounded-xl border transition-all ${
                      gameMode === opt.value
                        ? 'border-brand-amber bg-brand-amber/10'
                        : 'border-brand-border bg-brand-card hover:border-brand-border/80'
                    }`}
                  >
                    <div className="font-display text-xl text-white tracking-wide">{opt.label}</div>
                    <div className="text-brand-muted text-xs mt-0.5">{opt.desc}</div>
                  </button>
                ))}
              </div>

              {/* Round-mode extras */}
              {gameMode === 'round' && (
                <div className="mt-4 pt-4 border-t border-brand-border flex flex-col gap-4 animate-slide-up">
                  <div>
                    <label className="block text-brand-muted text-xs mb-2 uppercase tracking-widest">Pick Style</label>
                    <div className="flex gap-2">
                      {[
                        { value: 'classic', label: 'Classic (ABCABC)' },
                        { value: 'snake',   label: 'Snake (ABCCBA)' },
                      ].map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => setPickStyle(opt.value)}
                          className={`flex-1 py-2 rounded-xl border text-sm transition-all ${
                            pickStyle === opt.value
                              ? 'border-brand-green bg-brand-green/10 text-white'
                              : 'border-brand-border text-brand-muted hover:text-white'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-brand-muted text-xs mb-2 uppercase tracking-widest">
                      Total Rounds: {totalRounds}
                    </label>
                    <input
                      type="range" min={3} max={50} value={totalRounds}
                      onChange={e => setTotalRounds(parseInt(e.target.value))}
                      className="w-full accent-brand-green"
                    />
                    <div className="flex justify-between text-brand-muted text-xs mt-1">
                      <span>3</span><span>50</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Timer */}
            <div className="bg-brand-panel border border-brand-border rounded-2xl p-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-display text-2xl text-white tracking-wide">TIMER</h2>
                <button
                  onClick={() => setTimerEnabled(v => !v)}
                  className={`w-12 h-6 rounded-full transition-colors relative ${timerEnabled ? 'bg-brand-red' : 'bg-brand-border'}`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${timerEnabled ? 'left-6' : 'left-0.5'}`} />
                </button>
              </div>
              {timerEnabled && (
                <div className="animate-slide-up">
                  <label className="block text-brand-muted text-xs mb-2 uppercase tracking-widest">
                    {timerSeconds}s per guess
                  </label>
                  <input
                    type="range" min={10} max={120} step={5} value={timerSeconds}
                    onChange={e => setTimerSeconds(parseInt(e.target.value))}
                    className="w-full accent-brand-red"
                  />
                  <div className="flex justify-between text-brand-muted text-xs mt-1">
                    <span>10s</span><span>120s</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Launch button */}
        {error && <p className="text-brand-red text-sm mt-4 text-center">{error}</p>}
        <button
          onClick={handleStart}
          disabled={creating}
          className="w-full mt-6 bg-brand-red hover:bg-red-600 disabled:opacity-50 text-white font-display text-4xl tracking-widest py-5 rounded-2xl transition-colors shadow-[0_0_40px_rgba(230,57,70,0.2)] hover:shadow-[0_0_60px_rgba(230,57,70,0.35)]"
        >
          {creating ? 'LAUNCHING…' : 'START GAME'}
        </button>
      </div>
    </div>
  )
}
