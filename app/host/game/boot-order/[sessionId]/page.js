'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import NavBar from '@/components/NavBar'
import CastawaySearch from '@/components/CastawaySearch'
import { supabase } from '@/lib/supabase'
import { formatTime } from '@/lib/gameUtils'

// Phases: idle → spinning → answering → revealed → finished
export default function BootOrderGamePage() {
  const { sessionId } = useParams()
  const router        = useRouter()

  const [session, setSession]       = useState(null)
  const [players, setPlayers]       = useState([])
  const [personalities, setPersonalities] = useState({})
  const [loading, setLoading]       = useState(true)
  const [phase, setPhase]           = useState('idle') // idle | spinning | answering | revealed | finished
  const [currentRound, setCurrentRound] = useState(null)

  // Spinner state
  const [spinSeason, setSpinSeason] = useState(null)   // displayed during spin
  const [spinPlacement, setSpinPlacement] = useState(null)
  const [targetSeason, setTargetSeason]   = useState(null)  // final result
  const [targetPlacement, setTargetPlacement] = useState(null)
  const [targetCastaway, setTargetCastaway]   = useState(null)
  const seasonPool  = useRef([])
  const spinSeasonRef    = useRef(null)
  const spinPlacementRef = useRef(null)

  // Answers per player: { [sessionPlayerId]: { castaway, score: null|0|1|3 } }
  const [answers, setAnswers]       = useState({})
  const [revealing, setRevealing]   = useState(false)

  // Timer
  const [timeLeft, setTimeLeft]     = useState(null)
  const [paused, setPaused]         = useState(false)
  const timerRef                    = useRef(null)
  const pausedRef                   = useRef(false)

  // Code game: track which players submitted
  const [submitted, setSubmitted]   = useState(new Set())

  const load = useCallback(async () => {
    const [sessRes, playersRes] = await Promise.all([
      supabase.from('game_sessions').select('*, shows(name, slug)').eq('id', sessionId).single(),
      supabase.from('session_players').select('*, personalities(*)').eq('session_id', sessionId).order('turn_order'),
    ])
    if (sessRes.error) { router.push('/host'); return }
    setSession(sessRes.data)
    const pData = playersRes.data ?? []
    setPlayers(pData)
    const pMap = {}
    pData.forEach(p => { pMap[p.id] = p.personalities })
    setPersonalities(pMap)

    // Load season pool
    const poolIds = sessRes.data.settings?.season_pool ?? []
    if (poolIds.length > 0) {
      const { data: seasons } = await supabase
        .from('seasons').select('*, castaways(*)')
        .in('id', poolIds)
      seasonPool.current = seasons ?? []
    }

    // Check if there's an active round already
    const { data: round } = await supabase
      .from('game_rounds').select('*')
      .eq('session_id', sessionId)
      .eq('status', 'active')
      .maybeSingle()
    if (round) {
      setCurrentRound(round)
      // Load the castaway for this round
      if (round.question_data?.correct_castaway_id) {
        const { data: cast } = await supabase
          .from('castaways').select('*, seasons(name, version_season)')
          .eq('id', round.question_data.correct_castaway_id).single()
        setTargetCastaway(cast)
        setTargetSeason(seasonPool.current.find(s => s.id === round.question_data.season_id) ?? null)
        setTargetPlacement(round.question_data.placement)
      }
      // Load existing answers
      const { data: existingAnswers } = await supabase
        .from('game_answers').select('*, session_players(personality_id)')
        .eq('round_id', round.id)
      if (existingAnswers?.length) {
        const aMap = {}
        existingAnswers.forEach(a => { aMap[a.session_player_id] = { castaway: a.answer_data?.castaway, score: a.points_awarded } })
        setAnswers(aMap)
        setSubmitted(new Set(existingAnswers.map(a => a.session_player_id)))
        setPhase('answering')
      } else {
        setPhase('answering')
      }
    } else {
      setPhase('idle')
    }

    if (sessRes.data.status === 'finished') setPhase('finished')
    setLoading(false)
  }, [sessionId, router])

  useEffect(() => { load() }, [load])

  // Realtime for code mode
  useEffect(() => {
    if (!session?.settings?.game_type !== 'code') return
    const channel = supabase.channel(`boot-${sessionId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'game_answers' }, payload => {
        const a = payload.new
        setSubmitted(prev => new Set([...prev, a.session_player_id]))
        setAnswers(prev => ({
          ...prev,
          [a.session_player_id]: { castaway: a.answer_data?.castaway, score: null }
        }))
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [session?.id, sessionId])

  function resetTimer(secs) {
    clearInterval(timerRef.current)
    pausedRef.current = false
    setPaused(false)
    setTimeLeft(secs)
    timerRef.current = setInterval(() => {
      if (pausedRef.current) return
      setTimeLeft(prev => {
        if (prev <= 1) { clearInterval(timerRef.current); return 0 }
        return prev - 1
      })
    }, 1000)
  }

  function togglePause() {
    pausedRef.current = !pausedRef.current
    setPaused(pausedRef.current)
  }

  // Pick a random season+placement and get correct castaway
  async function pickQuestion() {
    const pool = seasonPool.current
    if (!pool.length) return null

    const settings = session.settings ?? {}
    const pMin = settings.placement_min ?? 1
    const pMax = settings.placement_max ?? 18

    // Exclude seasons already used in this game
    const usedIds = new Set(settings.used_season_ids ?? [])
    const available = pool.filter(s => !usedIds.has(s.id))

    // If all seasons have been used, reset the pool (for long games)
    const pickFrom = available.length > 0 ? available : pool

    // Try up to 30 times to find a valid season+placement combo
    for (let attempt = 0; attempt < 30; attempt++) {
      const season    = pickFrom[Math.floor(Math.random() * pickFrom.length)]
      const placement = Math.floor(Math.random() * (pMax - pMin + 1)) + pMin
      const castaway  = season.castaways?.find(c => c.placement === placement)
      if (castaway) {
        // Mark this season as used in settings
        const newUsed = [...usedIds, season.id]
        await supabase.from('game_sessions')
          .update({ settings: { ...settings, used_season_ids: newUsed } })
          .eq('id', sessionId)
        setSession(prev => ({ ...prev, settings: { ...prev.settings, used_season_ids: newUsed } }))
        return { season, placement, castaway }
      }
    }
    return null
  }

  // Animated spinner
  function animateSpinners(finalSeason, finalPlacement, onDone) {
    const pool = seasonPool.current
    const settings = session.settings ?? {}
    const pMin = settings.placement_min ?? 1
    const pMax = settings.placement_max ?? 18

    let frame = 0
    const totalFrames = 30

    function tick() {
      frame++
      const progress = frame / totalFrames
      // Easing: fast at start, slow at end
      const delay = 50 + Math.pow(progress, 2) * 400

      if (frame < totalFrames) {
        // Random during spin
        const rSeason = pool[Math.floor(Math.random() * pool.length)]
        const rPlace  = Math.floor(Math.random() * (pMax - pMin + 1)) + pMin
        setSpinSeason(rSeason)
        setSpinPlacement(rPlace)
        spinSeasonRef.current    = setTimeout(tick, delay)
      } else {
        // Land on result
        setSpinSeason(finalSeason)
        setSpinPlacement(finalPlacement)
        onDone()
      }
    }
    tick()
  }

  async function handleSpin() {
    if (phase !== 'idle') return
    setPhase('spinning')
    setAnswers({})
    setSubmitted(new Set())
    setTargetCastaway(null)

    const q = await pickQuestion()
    if (!q) { setPhase('idle'); return }

    animateSpinners(q.season, q.placement, async () => {
      setTargetSeason(q.season)
      setTargetPlacement(q.placement)
      setTargetCastaway(q.castaway)

      // Create round in DB
      const roundNum = (session.settings?.current_round ?? 1)
      const { data: round } = await supabase.from('game_rounds').insert({
        session_id:    sessionId,
        round_number:  roundNum,
        question_data: {
          season_id:          q.season.id,
          version_season:     q.season.version_season,
          placement:          q.placement,
          correct_castaway_id: q.castaway.id,
        },
        status: 'active',
      }).select().single()
      setCurrentRound(round.data ?? round)

      setPhase('answering')

      // Start timer
      const timerSecs = session.settings?.timer_seconds
      if (timerSecs) resetTimer(timerSecs)
    })
  }

  function setPlayerAnswer(playerId, castaway) {
    setAnswers(prev => ({ ...prev, [playerId]: { castaway, score: null } }))
  }

  async function handleReveal() {
    if (revealing) return
    setRevealing(true)

    const roundId = currentRound?.id ?? currentRound?.data?.id
    const updates = []

    const awardedAnswers = { ...answers }
    for (const player of players) {
      const ans = answers[player.id]
      if (!ans?.castaway) {
        awardedAnswers[player.id] = { castaway: null, score: 0 }
        continue
      }

      const guessedPlacement = ans.castaway.placement
      const diff = Math.abs(guessedPlacement - targetPlacement)
      const pts  = diff === 0 ? 3 : diff === 1 ? 1 : 0
      awardedAnswers[player.id] = { ...ans, score: pts }

      if (roundId) {
        await supabase.from('game_answers').upsert({
          round_id:          roundId,
          session_player_id: player.id,
          answer_data:       { castaway_id: ans.castaway.id, castaway: ans.castaway },
          points_awarded:    pts,
          result:            diff === 0 ? 'correct' : diff === 1 ? 'close' : 'wrong',
        }, { onConflict: 'round_id,session_player_id' })
      }

      // Update player score
      await supabase.from('session_players')
        .update({ score: (player.score ?? 0) + pts })
        .eq('id', player.id)

      if (pts > 0) updates.push({ id: player.id, score: (player.score ?? 0) + pts })
    }

    setAnswers(awardedAnswers)

    // Mark round complete
    if (roundId) {
      await supabase.from('game_rounds').update({ status: 'complete' }).eq('id', roundId)
    }

    // Reload players for updated scores
    const { data: pData } = await supabase
      .from('session_players').select('*, personalities(*)').eq('session_id', sessionId).order('turn_order')
    setPlayers(pData ?? [])

    setPhase('revealed')
    setRevealing(false)
    clearInterval(timerRef.current)
  }

  async function handleNextRound() {
    const settings  = session.settings ?? {}
    const nextRound = (settings.current_round ?? 1) + 1

    if (nextRound > (settings.total_rounds ?? 10)) {
      // Check for tie before ending
      const sorted = [...players].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      const topScore = sorted[0]?.score ?? 0
      const isTie = sorted.filter(p => (p.score ?? 0) === topScore).length > 1

      if (isTie) {
        // Extend by one tiebreaker round
        const newTotal = nextRound
        await supabase.from('game_sessions')
          .update({ settings: { ...settings, current_round: nextRound, total_rounds: newTotal, in_tiebreaker: true }, current_round: nextRound })
          .eq('id', sessionId)
        setSession(prev => ({ ...prev, settings: { ...prev.settings, current_round: nextRound, total_rounds: newTotal, in_tiebreaker: true } }))
        setCurrentRound(null)
        setTargetCastaway(null)
        setTargetSeason(null)
        setTargetPlacement(null)
        setAnswers({})
        setSubmitted(new Set())
        setPhase('idle')
        clearInterval(timerRef.current)
        setTimeLeft(null)
        return
      }

      // No tie — end game
      await supabase.from('game_sessions').update({ status: 'finished' }).eq('id', sessionId)
      setPhase('finished')
      return
    }

    await supabase.from('game_sessions')
      .update({ settings: { ...settings, current_round: nextRound }, current_round: nextRound })
      .eq('id', sessionId)

    setSession(prev => ({ ...prev, settings: { ...prev.settings, current_round: nextRound } }))
    setCurrentRound(null)
    setTargetCastaway(null)
    setTargetSeason(null)
    setTargetPlacement(null)
    setAnswers({})
    setSubmitted(new Set())
    setPhase('idle')
    clearInterval(timerRef.current)
    setTimeLeft(null)
  }

  async function handleEndGame() {
    if (!confirm('End this game early?')) return
    await supabase.from('game_sessions').update({ status: 'finished' }).eq('id', sessionId)
    setPhase('finished')
  }

  if (loading) return <div className="min-h-screen bg-brand-bg flex items-center justify-center text-brand-muted">Loading…</div>

  const settings    = session?.settings ?? {}
  const totalRounds = settings.total_rounds ?? 10
  const roundNum    = settings.current_round ?? 1
  const isCodeGame  = settings.game_type === 'code'
  const inTiebreaker = settings.in_tiebreaker ?? false

  // FINISHED
  if (phase === 'finished') {
    const sorted = [...players].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    const winnerP = personalities[sorted[0]?.id]
    return (
      <div className="min-h-screen bg-brand-bg flex flex-col items-center justify-center px-4">
        <div className="text-center max-w-lg w-full">
          <div className="text-6xl mb-4">🏆</div>
          <h1 className="font-display text-7xl logo-gradient tracking-wide mb-6">GAME OVER</h1>
          {winnerP && (
            <div className="mb-6">
              <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-brand-amber mx-auto mb-3">
                {winnerP.photo_url
                  ? <img src={winnerP.photo_url} alt={winnerP.name} className="w-full h-full object-cover" />
                  : <div className="w-full h-full bg-brand-card flex items-center justify-center text-4xl font-display text-brand-amber">{winnerP.name[0]}</div>
                }
              </div>
              <div className="font-display text-4xl text-brand-amber tracking-wide">{winnerP.name}</div>
              <div className="text-brand-muted text-sm mt-1">WINNER · {sorted[0]?.score} pts</div>
            </div>
          )}
          <div className="bg-brand-panel border border-brand-border rounded-2xl p-5 mb-6">
            {sorted.map((p, i) => {
              const pers = personalities[p.id]
              return (
                <div key={p.id} className={`flex items-center gap-4 py-2.5 ${i < sorted.length - 1 ? 'border-b border-brand-border' : ''}`}>
                  <span className="font-display text-2xl text-brand-muted w-6">{i + 1}</span>
                  <div className="w-9 h-9 rounded-full overflow-hidden bg-brand-card flex-shrink-0">
                    {pers?.photo_url ? <img src={pers.photo_url} alt={pers.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-brand-muted">{pers?.name?.[0]}</div>}
                  </div>
                  <div className="flex-1 text-left text-white">{pers?.name}</div>
                  <div className="font-display text-2xl text-white">{p.score}</div>
                </div>
              )
            })}
          </div>
          <div className="flex gap-3">
            <button onClick={() => router.push(`/host/game/setup/${session.shows?.slug ?? 'survivor'}/boot-order`)}
              className="flex-1 bg-brand-red hover:bg-red-600 text-white font-display text-2xl tracking-widest py-3 rounded-xl transition-colors">NEW GAME</button>
            <button onClick={() => router.push('/host')}
              className="flex-1 bg-brand-panel border border-brand-border text-white font-display text-2xl tracking-widest py-3 rounded-xl hover:border-white/30 transition-colors">HOME</button>
          </div>
        </div>
      </div>
    )
  }

  const showSlug = session?.shows?.slug ?? 'survivor'
  const photoUrl = (castaway, season) => {
    if (showSlug === 'survivor') {
      return castaway && season
        ? `https://gradientdescending.com/survivor/castaways/colour/${season.version_season}US${castaway.castaway_id}.png`
        : null
    }
    return castaway?.photo_url ?? null
  }

  return (
    <div className="h-screen bg-brand-bg flex flex-col overflow-hidden relative">
      <NavBar />

      <div className="flex-1 flex gap-4 px-4 py-3 min-h-0">

        {/* Main area */}
        <div className="flex-1 flex flex-col gap-4 min-h-0">

          {/* Header */}
          <div className="flex items-center justify-between flex-shrink-0">
            <div>
              <h1 className="font-display text-3xl text-white tracking-wide">{session?.shows?.name} · BOOT ORDER</h1>
              <p className="text-brand-muted text-xs">{inTiebreaker ? '⚡ SUDDEN DEATH' : `Round ${roundNum} of ${totalRounds}`}{isCodeGame ? ` · Code: ${session?.code}` : ''}</p>
            </div>
            <div className="flex items-center gap-3">
              {settings.timer_seconds && timeLeft !== null && phase === 'answering' && (
                <>
                  <div className={`font-display text-4xl tracking-wider ${timeLeft <= 10 && !paused ? 'timer-low' : 'text-white'}`}>
                    {paused ? <span className="text-brand-amber">PAUSED</span> : formatTime(timeLeft)}
                  </div>
                  <button onClick={togglePause}
                    className={`text-sm border px-3 py-1.5 rounded-lg transition-colors ${paused ? 'border-brand-amber text-brand-amber' : 'border-brand-border text-brand-muted hover:text-white'}`}>
                    {paused ? '▶ Resume' : '⏸ Pause'}
                  </button>
                </>
              )}
              <button onClick={handleEndGame}
                className="text-brand-muted hover:text-brand-red text-sm border border-brand-border hover:border-brand-red/40 px-3 py-1.5 rounded-lg transition-colors">
                End Game
              </button>
            </div>
          </div>

          {/* Spinners */}
          <div className="flex-shrink-0 flex gap-6 justify-center">
            {/* Season spinner */}
            <div className="flex-1 max-w-sm">
              <div className="text-brand-muted text-xs uppercase tracking-widest text-center mb-2">Season</div>
              <div className={`bg-brand-panel border-2 rounded-2xl h-32 flex items-center justify-center transition-all ${
                phase === 'spinning' ? 'border-brand-amber shadow-[0_0_30px_rgba(244,162,97,0.3)]' :
                (phase === 'answering' || phase === 'revealed') ? 'border-brand-amber/60' : 'border-brand-border'
              }`}>
                {(phase === 'spinning' || phase === 'answering' || phase === 'revealed') && (spinSeason ?? targetSeason) ? (
                  <div className="text-center px-4">
                    <div className="font-display text-4xl text-brand-amber tracking-wide">
                      S{(spinSeason ?? targetSeason)?.season_number}
                    </div>
                    <div className="text-white text-lg font-medium mt-1 leading-tight">
                      {(spinSeason ?? targetSeason)?.name}
                    </div>
                  </div>
                ) : (
                  <div className="font-display text-5xl text-brand-border">?</div>
                )}
              </div>
            </div>

            {/* Placement spinner */}
            <div className="flex-1 max-w-sm">
              <div className="text-brand-muted text-xs uppercase tracking-widest text-center mb-2">Placement</div>
              <div className={`bg-brand-panel border-2 rounded-2xl h-32 flex items-center justify-center transition-all ${
                phase === 'spinning' ? 'border-brand-red shadow-[0_0_30px_rgba(230,57,70,0.3)]' :
                (phase === 'answering' || phase === 'revealed') ? 'border-brand-red/60' : 'border-brand-border'
              }`}>
                {(phase === 'spinning' || phase === 'answering' || phase === 'revealed') && (spinPlacement ?? targetPlacement) !== null ? (
                  <div className="text-center">
                    <div className="font-display text-7xl text-brand-red tracking-wide">
                      {spinPlacement ?? targetPlacement}
                    </div>
                    <div className="text-brand-muted text-sm">
                      {(spinPlacement ?? targetPlacement) === 1 ? 'Winner' : `Place`}
                    </div>
                  </div>
                ) : (
                  <div className="font-display text-5xl text-brand-border">?</div>
                )}
              </div>
            </div>
          </div>

          {/* Correct answer reveal */}
          {phase === 'revealed' && targetCastaway && (
            <div className="flex-shrink-0 bg-brand-green/10 border border-brand-green/50 rounded-2xl p-4 flex items-center gap-4 animate-slide-up">
              <img
                src={photoUrl(targetCastaway, targetSeason) ?? ''}
                alt={targetCastaway.name}
                className="w-16 h-16 rounded-full object-cover border-2 border-brand-green"
                style={{ objectPosition: 'center top' }}
                onError={e => { e.target.style.display = 'none' }}
              />
              <div>
                <div className="text-brand-muted text-xs uppercase tracking-widest">Correct Answer</div>
                <div className="font-display text-3xl text-brand-green tracking-wide">{targetCastaway.name}</div>
                <div className="text-brand-muted text-sm">{targetSeason?.name} · Placement #{targetPlacement}</div>
              </div>
              <div className="ml-auto text-right">
                <div className="text-brand-muted text-xs">Scoring</div>
                <div className="text-white text-sm">Exact match = <span className="text-brand-green font-bold">3 pts</span></div>
                <div className="text-white text-sm">±1 placement = <span className="text-yellow-400 font-bold">1 pt</span></div>
              </div>
            </div>
          )}

          {/* Spin button */}
          {phase === 'idle' && (
            <div className="flex-1 flex items-center justify-center">
              <button onClick={handleSpin}
                className="bg-brand-red hover:bg-red-600 text-white font-display text-6xl tracking-widest px-16 py-8 rounded-2xl transition-colors shadow-[0_0_60px_rgba(230,57,70,0.3)] hover:shadow-[0_0_80px_rgba(230,57,70,0.5)] animate-pulse-ring">
                SPIN
              </button>
            </div>
          )}

          {phase === 'spinning' && (
            <div className="flex-1 flex items-center justify-center">
              <div className="font-display text-5xl text-brand-muted tracking-widest animate-pulse">SPINNING…</div>
            </div>
          )}
        </div>

        {/* Right sidebar: players */}
        <div className="w-96 flex flex-col gap-3 flex-shrink-0 min-h-0 overflow-y-auto">
          <div className="text-brand-muted text-xs uppercase tracking-widest">Players</div>

          {[...players].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).map(player => {
            const pers = personalities[player.id]
            const ans  = answers[player.id]
            const hasSubmitted = submitted.has(player.id) || (ans?.castaway !== undefined && ans?.castaway !== null)
            const hasAnswer = !!ans?.castaway

            // Score color
            const scoreColor = phase === 'revealed'
              ? ans?.score === 3 ? 'bg-brand-green/20 border-brand-green/60'
              : ans?.score === 1 ? 'bg-yellow-400/20 border-yellow-400/60'
              : 'bg-brand-red/20 border-brand-red/40'
              : 'bg-brand-panel border-brand-border'

            return (
              <div key={player.id} className={`border rounded-2xl p-4 transition-all ${scoreColor}`}>
                {/* Player header */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-full overflow-hidden bg-brand-card flex-shrink-0">
                    {pers?.photo_url
                      ? <img src={pers.photo_url} alt={pers.name} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-brand-muted font-display">{pers?.name?.[0]}</div>
                    }
                  </div>
                  <div className="flex-1">
                    <div className="text-white text-sm font-medium">{pers?.name?.split(' ')[0]}</div>
                    <div className="text-brand-muted text-xs">{player.score ?? 0} pts total</div>
                  </div>
                  {phase === 'revealed' && (
                    <div className={`font-display text-2xl ${ans?.score === 3 ? 'text-brand-green' : ans?.score === 1 ? 'text-yellow-400' : 'text-brand-red'}`}>
                      {ans?.score > 0 ? `+${ans.score}` : '✗'}
                    </div>
                  )}
                  {phase === 'answering' && isCodeGame && (
                    <div className={`text-xs px-2 py-0.5 rounded-full ${hasSubmitted ? 'bg-brand-green/20 text-brand-green' : 'bg-brand-border text-brand-muted'}`}>
                      {hasSubmitted ? 'Submitted' : 'Waiting…'}
                    </div>
                  )}
                </div>

                {/* Answer display / input */}
                {phase === 'revealed' && (
                  <div className="flex items-center gap-2">
                    {ans?.castaway ? (
                      <>
                        <img
                          src={photoUrl(ans.castaway, targetSeason) ?? ''}
                          alt={ans.castaway.name}
                          className="w-8 h-8 rounded-full object-cover"
                          style={{ objectPosition: 'center top' }}
                          onError={e => { e.target.style.display = 'none' }}
                        />
                        <div>
                          <div className="text-white text-sm">{ans.castaway.name}</div>
                          <div className="text-brand-muted text-xs">Placement #{ans.castaway.placement}</div>
                        </div>
                      </>
                    ) : (
                      <div className="text-brand-muted text-sm italic">No answer</div>
                    )}
                  </div>
                )}

                {phase === 'answering' && !isCodeGame && (
                  <CastawaySearch
                    onSelect={c => setPlayerAnswer(player.id, c)}
                    placeholder={hasAnswer ? `✓ ${ans.castaway.name}` : 'Enter answer…'}
                    key={hasAnswer ? ans.castaway.id : 'empty'}
                    showSlug={showSlug}
                    seasonIds={seasonPool.current.map(s => s.id)}
                  />
                )}

                {phase === 'answering' && isCodeGame && hasSubmitted && ans?.castaway && (
                  <div className="flex items-center gap-2 mt-1">
                    <div className="w-5 h-5 rounded-full bg-brand-green/20 flex items-center justify-center">
                      <span className="text-brand-green text-xs">✓</span>
                    </div>
                    <span className="text-brand-green text-sm">Answer received</span>
                  </div>
                )}
              </div>
            )
          })}

          {/* Action buttons */}
          {phase === 'answering' && (
            <button onClick={handleReveal} disabled={revealing}
              className="w-full bg-brand-amber hover:bg-amber-500 disabled:opacity-50 text-brand-bg font-display text-2xl tracking-widest py-3 rounded-xl transition-colors mt-2">
              {revealing ? 'REVEALING…' : 'REVEAL ANSWER'}
            </button>
          )}

          {phase === 'revealed' && (
            <button onClick={handleNextRound}
              className="w-full bg-brand-red hover:bg-red-600 text-white font-display text-2xl tracking-widest py-3 rounded-xl transition-colors mt-2">
              {roundNum >= totalRounds
                ? (() => {
                    const sorted = [...players].sort((a,b) => (b.score??0)-(a.score??0))
                    const topScore = sorted[0]?.score ?? 0
                    const isTie = sorted.filter(p => (p.score??0) === topScore).length > 1
                    if (inTiebreaker && isTie) return 'SUDDEN DEATH SPIN →'
                    return isTie ? 'TIEBREAKER SPIN →' : 'FINISH GAME'
                  })()
                : `ROUND ${roundNum + 1} →`}
            </button>
          )}
        </div>
      </div>

      {/* Pause overlay */}
      {paused && (
        <div className="absolute inset-0 z-50 flex items-center justify-center"
             style={{ backdropFilter: 'blur(8px)', backgroundColor: 'rgba(12,12,15,0.7)' }}>
          <div className="text-center">
            <div className="font-display text-9xl text-brand-amber tracking-widest drop-shadow-2xl">PAUSED</div>
            <button onClick={togglePause}
                    className="mt-6 bg-brand-amber hover:bg-amber-500 text-brand-bg font-display text-3xl tracking-widest px-10 py-4 rounded-2xl transition-colors">
              ▶ RESUME
            </button>
          </div>
        </div>
      )}
    </div>
  )
}