'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import NavBar from '@/components/NavBar'
import ScatAnswerSearch from '@/components/ScatAnswerSearch'
import { supabase } from '@/lib/supabase'
import { formatTime } from '@/lib/gameUtils'

export default function ScattergoriesGamePage() {
  const { sessionId } = useParams()
  const router        = useRouter()

  const [session, setSession]         = useState(null)
  const [players, setPlayers]         = useState([])
  const [personalities, setPersonalities] = useState({})
  const [category, setCategory]       = useState(null)
  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState(false)
  const [gameOver, setGameOver]       = useState(false)
  const [winner, setWinner]           = useState(null)

  // Entry phase: { [sessionPlayerId]: { [position]: { entryId, displayName, points } } }
  const [entryAnswers, setEntryAnswers] = useState({})

  // Reveal phase: loaded from DB
  const [revealAnswers, setRevealAnswers] = useState([]) // scat_round_answers rows
  // Track which answers have had their name revealed (step 1 of 2-step reveal)
  const [nameRevealed, setNameRevealed] = useState({})

  // Round scores for scores phase
  const [roundScores, setRoundScores] = useState([]) // { playerId, name, photo, roundPts, totalScore }

  // Timer
  const [timeLeft, setTimeLeft]   = useState(null)
  const [timerDone, setTimerDone] = useState(false)
  const timerRef                  = useRef(null)
  const [paused, setPaused]       = useState(false)
  const pausedRef                 = useRef(false)

  const settings = session?.settings ?? {}
  const phase    = settings.phase ?? 'timer'
  const currentRound = settings.current_round ?? 1
  const totalRounds  = settings.total_rounds ?? 1
  const answersPerPlayer = settings.answers_per_player ?? 5

  const load = useCallback(async () => {
    const [sessRes, playersRes, persRes] = await Promise.all([
      supabase.from('game_sessions').select('*, shows(name, slug)').eq('id', sessionId).single(),
      supabase.from('session_players').select('*, personalities(*)').eq('session_id', sessionId).order('turn_order'),
      supabase.from('personalities').select('*'),
    ])
    const sess = sessRes.data
    setSession(sess)

    const pData = playersRes.data ?? []
    setPlayers(pData)
    const pMap = {}
    ;(persRes.data ?? []).forEach(p => { pMap[p.id] = p })
    setPersonalities(pMap)

    if (sess?.status === 'finished') {
      const sorted = [...pData].sort((a,b) => (b.score??0)-(a.score??0))
      setWinner(sorted[0])
      setGameOver(true)
    }

    // Load category for this round
    await loadCategory(sess)

    if (sess?.settings?.phase === 'reveal') {
      await loadRevealAnswers(sess)
    }

    setLoading(false)
  }, [sessionId])

  async function loadCategory(sess) {
    if (!sess) return
    const s = sess.settings ?? {}
    const roundCats = s.round_categories ?? []
    const roundEntry = roundCats.find(r => r.round === (s.current_round ?? 1))
    let catId = roundEntry?.category_id

    if (!catId || catId === 'random') {
      // Pick random unused category
      const { data: allCats } = await supabase.from('scat_categories')
        .select('id').eq('show_id', sess.show_id)
      const used = s.used_category_ids ?? []
      const available = (allCats ?? []).filter(c => !used.includes(c.id))
      const pool = available.length > 0 ? available : (allCats ?? [])
      if (pool.length === 0) return
      catId = pool[Math.floor(Math.random() * pool.length)].id

      // Persist the resolved category
      const newRoundCats = roundCats.map(r =>
        r.round === (s.current_round ?? 1) ? { ...r, category_id: catId } : r
      )
      const newUsed = [...used, catId]
      await supabase.from('game_sessions').update({
        settings: { ...s, round_categories: newRoundCats, used_category_ids: newUsed }
      }).eq('id', sess.id)
    }

    const { data: cat } = await supabase.from('scat_categories').select('*').eq('id', catId).single()
    setCategory(cat)
  }

  async function loadRevealAnswers(sess) {
    const round = sess?.settings?.current_round ?? 1
    const { data } = await supabase
      .from('scat_round_answers')
      .select('*, scat_entries(display_name, points)')
      .eq('session_id', sessionId)
      .eq('round_number', round)
      .order('session_player_id').order('position')
    setRevealAnswers(data ?? [])
  }

  useEffect(() => { load() }, [load])

  // Timer
  useEffect(() => {
    if (phase !== 'timer' || !settings.timer_seconds) { setTimerDone(true); return }
    setTimeLeft(settings.timer_seconds)
    setTimerDone(false)
    timerRef.current = setInterval(() => {
      if (pausedRef.current) return
      setTimeLeft(prev => {
        if (prev <= 1) { clearInterval(timerRef.current); setTimerDone(true); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [phase, settings.timer_seconds])

  async function updatePhase(newPhase, extraSettings = {}) {
    const newSettings = { ...settings, phase: newPhase, ...extraSettings }
    await supabase.from('game_sessions').update({ settings: newSettings }).eq('id', sessionId)
    setSession(prev => ({ ...prev, settings: newSettings }))
  }

  async function moveToEntry() {
    clearInterval(timerRef.current)
    // Init empty answers for all players
    const init = {}
    players.forEach(p => { init[p.id] = {} })
    setEntryAnswers(init)
    await updatePhase('entry')
  }

  function setAnswer(playerId, position, entry) {
    setEntryAnswers(prev => ({
      ...prev,
      [playerId]: { ...prev[playerId], [position]: entry ? { entryId: entry.id, displayName: entry.display_name, points: entry.points } : null }
    }))
  }

  function getExcludedForPlayer(playerId) {
    const ans = entryAnswers[playerId] ?? {}
    return Object.values(ans).filter(Boolean).map(a => a.entryId)
  }

  async function saveAndReveal() {
    setSaving(true)
    const rows = []
    players.forEach(player => {
      const ans = entryAnswers[player.id] ?? {}
      for (let pos = 1; pos <= answersPerPlayer; pos++) {
        const a = ans[pos]
        rows.push({
          session_id:        sessionId,
          round_number:      currentRound,
          session_player_id: player.id,
          position:          pos,
          entry_id:          a?.entryId ?? null,
          display_name:      a?.displayName ?? null,
          points_possible:   a?.points ?? 0,
          points_awarded:    0,
          nullified:         false,
          revealed:          false,
        })
      }
    })
    await supabase.from('scat_round_answers').insert(rows)
    await updatePhase('reveal')
    await loadRevealAnswers({ settings: { ...settings, phase: 'reveal' }, id: sessionId })
    setSaving(false)
  }

  async function revealAnswer(answerId) {
    const answer = revealAnswers.find(a => a.id === answerId)
    if (!answer || answer.revealed || !answer.entry_id) return

    // Find all unrevealed answers with the same entry_id (across all players)
    const matches = revealAnswers.filter(a =>
      a.entry_id === answer.entry_id && !a.revealed
    )
    const isNullified = matches.length > 1

    // Update DB for all matches
    const ids = matches.map(a => a.id)
    await supabase.from('scat_round_answers')
      .update({
        revealed:       true,
        nullified:      isNullified,
        points_awarded: isNullified ? 0 : answer.points_possible,
      })
      .in('id', ids)

    // Update local state
    setRevealAnswers(prev => prev.map(a =>
      ids.includes(a.id)
        ? { ...a, revealed: true, nullified: isNullified, points_awarded: isNullified ? 0 : answer.points_possible }
        : a
    ))
  }

  async function handleRevealEmpty(answerId) {
    // Reveal an answer that has no entry (player left it blank)
    const answer = revealAnswers.find(a => a.id === answerId)
    if (!answer || answer.revealed) return
    await supabase.from('scat_round_answers').update({ revealed: true }).eq('id', answerId)
    setRevealAnswers(prev => prev.map(a => a.id === answerId ? { ...a, revealed: true } : a))
  }

  async function showRoundScores() {
    // Compute round points from revealed answers
    const roundPts = {}
    players.forEach(p => { roundPts[p.id] = 0 })
    revealAnswers.forEach(a => { if (a.revealed && !a.nullified) roundPts[a.session_player_id] = (roundPts[a.session_player_id] ?? 0) + a.points_awarded })

    // Update session_players scores
    for (const player of players) {
      const newScore = (player.score ?? 0) + (roundPts[player.id] ?? 0)
      await supabase.from('session_players').update({ score: newScore }).eq('id', player.id)
    }

    const updatedPlayers = players.map(p => ({ ...p, score: (p.score ?? 0) + (roundPts[p.id] ?? 0) }))
    setPlayers(updatedPlayers)

    const scores = updatedPlayers
      .map(p => ({
        playerId: p.id,
        name: p.personalities?.name,
        photo: p.personalities?.photo_url,
        roundPts: roundPts[p.id] ?? 0,
        totalScore: (p.score ?? 0),
      }))
      .sort((a,b) => b.totalScore - a.totalScore)
    setRoundScores(scores)
    await updatePhase('scores')
  }

  async function nextRound() {
    const nextRoundNum = currentRound + 1
    if (nextRoundNum > totalRounds) {
      // End game
      await supabase.from('game_sessions').update({ status: 'finished' }).eq('id', sessionId)
      if (settings.track_leaderboard) await saveLeaderboard()
      const sorted = [...players].sort((a,b) => (b.score??0)-(a.score??0))
      setWinner(sorted[0])
      setGameOver(true)
    } else {
      await updatePhase('timer', { current_round: nextRoundNum })
      setRevealAnswers([])
      setEntryAnswers({})
      setNameRevealed({})
      setTimerDone(false)
      setTimeLeft(settings.timer_seconds)
      // Load category for next round
      const nextSess = { ...session, settings: { ...settings, phase: 'timer', current_round: nextRoundNum } }
      await loadCategory(nextSess)
    }
  }

  async function saveLeaderboard() {
    const sorted = [...players].sort((a,b) => (b.score??0)-(a.score??0))
    const winner = sorted[0]
    for (const p of players) {
      const isWinner = p.id === winner.id
      await supabase.from('leaderboard_sessions').insert({
        session_id: sessionId, personality_id: p.personality_id,
        show_id: session.show_id, mode: 'scattergories',
        score: p.score ?? 0, won: isWinner,
      })
      const { data: existing } = await supabase.from('leaderboard').select('*')
        .eq('personality_id', p.personality_id)
        .eq('show_id', session.show_id).eq('mode', 'scattergories').maybeSingle()
      if (existing) {
        await supabase.from('leaderboard').update({
          games_played: existing.games_played + 1,
          wins: existing.wins + (isWinner ? 1 : 0),
          total_points: existing.total_points + (p.score ?? 0),
          updated_at: new Date().toISOString(),
        }).eq('id', existing.id)
      } else {
        await supabase.from('leaderboard').insert({
          personality_id: p.personality_id, show_id: session.show_id, mode: 'scattergories',
          games_played: 1, wins: isWinner ? 1 : 0, total_points: p.score ?? 0,
        })
      }
    }
  }

  if (loading) return <div className="min-h-screen bg-brand-bg flex items-center justify-center text-brand-muted">Loading…</div>

  // GAME OVER
  if (gameOver) {
    const sorted = [...players].sort((a,b) => (b.score??0)-(a.score??0))
    const winnerPers = personalities[winner?.personality_id]
    return (
      <div className="min-h-screen bg-brand-bg flex flex-col items-center justify-center px-4">
        <div className="text-center max-w-lg w-full">
          <div className="text-6xl mb-4">🏆</div>
          <h1 className="font-display text-7xl logo-gradient tracking-wide mb-2">GAME OVER</h1>
          {winnerPers && (
            <div className="mt-6 mb-8">
              <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-brand-amber mx-auto mb-3">
                {winnerPers.photo_url ? <img src={winnerPers.photo_url} className="w-full h-full object-cover" alt={winnerPers.name} /> : <div className="w-full h-full bg-brand-card flex items-center justify-center text-4xl font-display text-brand-amber">{winnerPers.name[0]}</div>}
              </div>
              <div className="font-display text-4xl text-brand-amber tracking-wide">{winnerPers.name}</div>
              <div className="text-brand-muted text-sm mt-1">WINNER · {winner?.score} pts</div>
            </div>
          )}
          <div className="bg-brand-panel border border-brand-border rounded-2xl p-5 mb-6">
            {sorted.map((p,i) => {
              const pers = personalities[p.personality_id]
              return (
                <div key={p.id} className={`flex items-center gap-4 py-2.5 ${i < sorted.length-1 ? 'border-b border-brand-border' : ''}`}>
                  <span className="font-display text-2xl text-brand-muted w-6">{i+1}</span>
                  <div className="w-9 h-9 rounded-full overflow-hidden bg-brand-card flex-shrink-0">
                    {pers?.photo_url ? <img src={pers.photo_url} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full flex items-center justify-center text-brand-muted">{pers?.name?.[0]}</div>}
                  </div>
                  <div className="flex-1 text-left text-white">{pers?.name}</div>
                  <div className="font-display text-2xl text-white">{p.score}</div>
                </div>
              )
            })}
          </div>
          <div className="flex gap-3">
            <button onClick={() => router.push(`/host/game/setup/${session?.shows?.slug ?? 'survivor'}/scattergories`)}
              className="flex-1 bg-brand-red hover:bg-red-600 text-white font-display text-2xl tracking-widest py-3 rounded-xl transition-colors">NEW GAME</button>
            <button onClick={() => router.push('/host')}
              className="flex-1 bg-brand-panel border border-brand-border text-white font-display text-2xl tracking-widest py-3 rounded-xl hover:border-white/30 transition-colors">HOME</button>
          </div>
        </div>
      </div>
    )
  }

  const catType   = category?.type ?? 'career'
  const seasonMin = settings.season_min ?? 1
  const seasonMax = settings.season_max ?? 50

  // ── TIMER PHASE ──────────────────────────────────────────────────────────
  if (phase === 'timer') {
    return (
      <div className="min-h-screen bg-brand-bg flex flex-col">
        <NavBar />
        <div className="flex-1 flex flex-col items-center justify-center gap-8 px-4">
          <div className="text-center">
            <div className="text-brand-muted text-xs uppercase tracking-widest mb-2">Round {currentRound} of {totalRounds}</div>
            <h1 className="font-display text-5xl text-white tracking-wide">{category?.name ?? 'Loading…'}</h1>
            <div className="text-brand-muted text-sm mt-1">{catType === 'career' ? 'Career stat' : `Season stat · S${seasonMin}–S${seasonMax}`}</div>
          </div>
          {settings.timer_seconds ? (
            <div className="text-center">
              <div className={`font-display text-[120px] leading-none tracking-wider ${timeLeft !== null && timeLeft <= 10 && !timerDone ? 'text-brand-red' : 'text-white'}`}>
                {timerDone ? '0:00' : timeLeft !== null ? formatTime(timeLeft) : formatTime(settings.timer_seconds)}
              </div>
              <div className="flex gap-3 mt-6 justify-center">
                {!timerDone && (
                  <button onClick={() => { pausedRef.current = !pausedRef.current; setPaused(p => !p) }}
                    className="px-6 py-2 border border-brand-border text-brand-muted hover:text-white rounded-xl font-display text-xl transition-colors">
                    {paused ? '▶ Resume' : '⏸ Pause'}
                  </button>
                )}
                <button onClick={moveToEntry}
                  className="px-8 py-2 bg-brand-red hover:bg-red-600 text-white rounded-xl font-display text-xl tracking-widest transition-colors">
                  {timerDone ? 'ENTER ANSWERS →' : 'SKIP TIMER →'}
                </button>
              </div>
            </div>
          ) : (
            <button onClick={moveToEntry}
              className="px-12 py-4 bg-brand-red hover:bg-red-600 text-white rounded-2xl font-display text-3xl tracking-widest transition-colors">
              ENTER ANSWERS →
            </button>
          )}
          <div className="text-brand-muted text-sm">Players: {players.map(p => p.personalities?.name?.split(' ')[0]).join(', ')}</div>
        </div>
      </div>
    )
  }

  // ── ENTRY PHASE ──────────────────────────────────────────────────────────
  if (phase === 'entry') {
    const allFilled = players.every(player =>
      Object.values(entryAnswers[player.id] ?? {}).filter(Boolean).length === answersPerPlayer
    )
    return (
      <div className="min-h-screen bg-brand-bg flex flex-col">
        <NavBar />
        <div className="px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-brand-muted text-xs uppercase tracking-widest">Round {currentRound} of {totalRounds}</div>
              <h1 className="font-display text-3xl text-white tracking-wide">{category?.name}</h1>
              <div className="text-brand-muted text-xs mt-0.5">{catType === 'career' ? 'Career stat' : `Season stat · S${seasonMin}–S${seasonMax}`} · {answersPerPlayer} answers per player</div>
            </div>
            <button onClick={saveAndReveal} disabled={saving}
              className="bg-brand-red hover:bg-red-600 disabled:opacity-50 text-white font-display text-xl tracking-widest px-6 py-2.5 rounded-xl transition-colors">
              {saving ? 'SAVING…' : 'READY TO REVEAL →'}
            </button>
          </div>

          {/* Player columns */}
          <div className="flex gap-3 overflow-x-auto pb-4" style={{ minWidth: 0 }}>
            {players.map(player => {
              const pers = player.personalities
              const ans = entryAnswers[player.id] ?? {}
              const filled = Object.values(ans).filter(Boolean).length
              return (
                <div key={player.id} className="flex-shrink-0 w-64 flex flex-col gap-2">
                  {/* Player header */}
                  <div className="bg-brand-panel border border-brand-border rounded-xl px-3 py-2.5 flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full overflow-hidden bg-brand-card flex-shrink-0">
                      {pers?.photo_url ? <img src={pers.photo_url} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full flex items-center justify-center text-brand-muted font-display">{pers?.name?.[0]}</div>}
                    </div>
                    <span className="font-display text-xl text-white tracking-wide">{pers?.name?.split(' ')[0]?.toUpperCase()}</span>
                    <span className="text-brand-muted text-xs ml-auto">{filled}/{answersPerPlayer}</span>
                  </div>

                  {/* Answer slots */}
                  {Array.from({ length: answersPerPlayer }, (_, i) => i + 1).map(pos => {
                    const a = ans[pos]
                    return (
                      <div key={pos} className="flex items-center gap-1.5">
                        <span className="text-brand-muted font-display text-sm w-4 flex-shrink-0">{pos}</span>
                        {a ? (
                          <div className="flex-1 bg-brand-card border border-brand-amber/40 rounded-xl px-3 py-2 flex items-center gap-2">
                            <span className="text-white text-sm flex-1 truncate">{a.displayName}</span>
                            <button onClick={() => setAnswer(player.id, pos, null)} className="text-brand-muted hover:text-brand-red text-xs ml-1">✕</button>
                          </div>
                        ) : (
                          <div className="flex-1">
                            <ScatAnswerSearch
                              categoryId={category?.id}
                              categoryType={catType}
                              seasonMin={seasonMin}
                              seasonMax={seasonMax}
                              onSelect={entry => setAnswer(player.id, pos, entry)}
                              excluded={getExcludedForPlayer(player.id)}
                              placeholder={`Answer ${pos}…`}
                            />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  // ── REVEAL PHASE ─────────────────────────────────────────────────────────
  if (phase === 'reveal') {
    const allRevealed = revealAnswers.every(a => a.revealed || !a.entry_id)
    // Group answers by player
    const byPlayer = {}
    players.forEach(p => { byPlayer[p.id] = [] })
    revealAnswers.forEach(a => {
      if (byPlayer[a.session_player_id]) byPlayer[a.session_player_id].push(a)
    })
    players.forEach(p => { byPlayer[p.id].sort((a,b) => a.position - b.position) })

    return (
      <div className="min-h-screen bg-brand-bg flex flex-col">
        <NavBar />
        <div className="px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-brand-muted text-xs uppercase tracking-widest">Round {currentRound} of {totalRounds} · Reveal</div>
              <h1 className="font-display text-3xl text-white tracking-wide">{category?.name}</h1>
            </div>
            <button onClick={showRoundScores}
              className="bg-brand-amber hover:bg-amber-400 text-black font-display text-xl tracking-widest px-6 py-2.5 rounded-xl transition-colors">
              SHOW SCORES →
            </button>
          </div>

          <div className="flex gap-3 overflow-x-auto pb-4">
            {players.map(player => {
              const pers = player.personalities
              const ans  = byPlayer[player.id] ?? []
              return (
                <div key={player.id} className="flex-shrink-0 w-64 flex flex-col gap-2">
                  {/* Player header */}
                  <div className="bg-brand-panel border border-brand-border rounded-xl px-3 py-2.5 flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full overflow-hidden bg-brand-card flex-shrink-0">
                      {pers?.photo_url ? <img src={pers.photo_url} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full flex items-center justify-center text-brand-muted font-display">{pers?.name?.[0]}</div>}
                    </div>
                    <span className="font-display text-xl text-white tracking-wide">{pers?.name?.split(' ')[0]?.toUpperCase()}</span>
                    <span className="text-brand-amber font-display text-sm ml-auto">
                      +{ans.filter(a => a.revealed && !a.nullified).reduce((s,a) => s + a.points_awarded, 0)} pts
                    </span>
                  </div>

                  {/* Answer tiles */}
                  {ans.map(a => (
                    <div key={a.id} className="flex items-center gap-1.5">
                      <span className="text-brand-muted font-display text-sm w-4 flex-shrink-0">{a.position}</span>
                      {a.revealed ? (
                        // Step 3: fully revealed — green (unique) or red (nullified)
                        <div className={`flex-1 rounded-xl px-3 py-2.5 border flex items-center gap-2 transition-all ${
                          a.nullified
                            ? 'bg-brand-red/10 border-brand-red/40'
                            : 'bg-brand-green/10 border-brand-green/40'
                        }`}>
                          {a.nullified
                            ? <span className="line-through text-brand-red/70 text-sm flex-1 truncate">{a.display_name ?? '—'}</span>
                            : <span className="text-white text-sm flex-1 truncate">{a.display_name ?? '—'}</span>
                          }
                          {!a.nullified && a.display_name && (
                            <span className="text-brand-green font-display text-sm">+{a.points_awarded}</span>
                          )}
                          {a.nullified && (
                            <span className="text-brand-red/60 font-display text-xs">0</span>
                          )}
                        </div>
                      ) : nameRevealed[a.id] ? (
                        // Step 2: name shown — tap to reveal score
                        <button
                          onClick={() => a.entry_id ? revealAnswer(a.id) : handleRevealEmpty(a.id)}
                          className="flex-1 bg-brand-card border border-brand-amber/30 rounded-xl px-3 py-2.5 flex items-center gap-2 hover:border-brand-amber transition-all text-left">
                          <span className="text-white text-sm flex-1 truncate">{a.display_name ?? '—'}</span>
                          <span className="text-brand-muted text-xs flex-shrink-0">TAP FOR SCORE</span>
                        </button>
                      ) : (
                        // Step 1: hidden — tap to reveal name
                        <button
                          onClick={() => {
                            if (!a.entry_id) {
                              handleRevealEmpty(a.id)
                            } else {
                              setNameRevealed(prev => ({ ...prev, [a.id]: true }))
                            }
                          }}
                          className="flex-1 bg-brand-card border border-brand-border rounded-xl px-3 py-2.5 text-brand-muted text-xs uppercase tracking-widest hover:border-brand-amber hover:text-white transition-all text-left">
                          TAP TO REVEAL
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  // ── SCORES PHASE ─────────────────────────────────────────────────────────
  if (phase === 'scores') {
    const isLastRound = currentRound >= totalRounds
    return (
      <div className="min-h-screen bg-brand-bg flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            <div className="text-brand-muted text-xs uppercase tracking-widest mb-1">Round {currentRound} Complete</div>
            <h1 className="font-display text-5xl text-white tracking-wide">{category?.name}</h1>
          </div>
          <div className="bg-brand-panel border border-brand-border rounded-2xl overflow-hidden mb-6">
            {roundScores.map((s, i) => (
              <div key={s.playerId} className={`flex items-center gap-4 px-5 py-4 ${i < roundScores.length-1 ? 'border-b border-brand-border' : ''}`}>
                <span className="font-display text-2xl text-brand-muted w-6">{i+1}</span>
                <div className="w-9 h-9 rounded-full overflow-hidden bg-brand-card flex-shrink-0">
                  {s.photo ? <img src={s.photo} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full flex items-center justify-center text-brand-muted">{s.name?.[0]}</div>}
                </div>
                <div className="flex-1">
                  <div className="text-white font-medium">{s.name}</div>
                  <div className="text-brand-green text-xs">+{s.roundPts} this round</div>
                </div>
                <div className="font-display text-3xl text-white">{s.totalScore}</div>
              </div>
            ))}
          </div>
          <button onClick={nextRound}
            className="w-full bg-brand-red hover:bg-red-600 text-white font-display text-3xl tracking-widest py-4 rounded-2xl transition-colors">
            {isLastRound ? 'FINISH GAME' : `ROUND ${currentRound + 1} →`}
          </button>
        </div>
      </div>
    )
  }

  return <div className="min-h-screen bg-brand-bg flex items-center justify-center text-brand-muted">Loading phase…</div>
}
