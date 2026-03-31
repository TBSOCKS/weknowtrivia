'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import NavBar from '@/components/NavBar'
import GameBoard from '@/components/GameBoard'
import PlayerCard from '@/components/PlayerCard'
import CastawaySearch from '@/components/CastawaySearch'
import { supabase } from '@/lib/supabase'
import { getCurrentPicker, formatTime } from '@/lib/gameUtils'

export default function GameSessionPage() {
  const { sessionId } = useParams()
  const router        = useRouter()

  const [session, setSession]           = useState(null)
  const [players, setPlayers]           = useState([])       // session_players rows
  const [personalities, setPersonalities] = useState({})     // id → personality
  const [answers, setAnswers]           = useState([])       // list_answers with castaways
  const [revealedIds, setRevealedIds]   = useState(new Set())
  const [feedback, setFeedback]         = useState(null)     // { type: 'correct'|'wrong'|'strike', message }
  const [loading, setLoading]           = useState(true)
  const [submitting, setSubmitting]     = useState(false)
  const [gameOver, setGameOver]         = useState(false)
  const [winner, setWinner]             = useState(null)

  // Timer
  const [timeLeft, setTimeLeft]         = useState(null)
  const timerRef                        = useRef(null)

  // Load everything
  const load = useCallback(async () => {
    const [sessRes, playersRes] = await Promise.all([
      supabase.from('game_sessions').select('*, shows(name)').eq('id', sessionId).single(),
      supabase.from('session_players').select('*, personalities(*)').eq('session_id', sessionId).order('turn_order'),
    ])

    if (sessRes.error || !sessRes.data) { router.push('/host'); return }
    const sess = sessRes.data
    setSession(sess)

    const playersData = playersRes.data ?? []
    setPlayers(playersData)

    // Map personalities
    const pMap = {}
    playersData.forEach(p => { pMap[p.personality_id] = p.personalities })
    setPersonalities(pMap)

    // Load answers for this list
    const listId = sess.settings?.list_id
    if (listId) {
      const { data: ansData } = await supabase
        .from('list_answers')
        .select('*, castaways(id, name, castaway_id, seasons(name, version_season))')
        .eq('list_id', listId)
        .order('position')
      setAnswers(ansData ?? [])

      // Load which positions have been correctly guessed (from game_answers)
      // We track revealed by checking game_answers with result='correct'
      const { data: correctAnswers } = await supabase
        .from('game_answers')
        .select('answer_data, result')
        .eq('result', 'correct')
        .in('round_id',
          (await supabase.from('game_rounds').select('id').eq('session_id', sessionId).then(r => r.data?.map(r => r.id) ?? []))
        )

      if (correctAnswers?.length) {
        const revealed = new Set()
        const ansMap = {}
        ansData?.forEach(a => { ansMap[a.castaway_id] = a.id })
        correctAnswers.forEach(ca => {
          const cid = ca.answer_data?.castaway_id
          if (cid && ansMap[cid]) revealed.add(ansMap[cid])
        })
        setRevealedIds(revealed)
      }
    }

    setLoading(false)
  }, [sessionId, router])

  useEffect(() => { load() }, [load])

  // Start timer when session loads with timer setting
  useEffect(() => {
    if (!session?.settings?.timer_seconds) return
    resetTimer(session.settings.timer_seconds)
    return () => clearInterval(timerRef.current)
  }, [session?.id])

  function resetTimer(seconds) {
    clearInterval(timerRef.current)
    setTimeLeft(seconds)
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  // Derived state
  const settings     = session?.settings ?? {}
  const gameMode     = settings.mode ?? 'strike'
  const pickStyle    = settings.pick_style ?? 'classic'
  const guessCount   = settings.guess_count ?? 0
  const currentPicker = getCurrentPicker(players, guessCount, pickStyle)

  const activePlayers  = players.filter(p => !p.eliminated)
  const totalAnswers   = answers.length
  const revealedCount  = revealedIds.size

  async function handleGuess(castaway) {
    if (submitting || !session) return
    setSubmitting(true)
    setFeedback(null)

    // Check if this castaway is in the answer list and not yet revealed
    const matchedAnswer = answers.find(
      a => a.castaway_id === castaway.id && !revealedIds.has(a.id)
    )

    // Get or create current round
    const { data: roundData } = await supabase
      .from('game_rounds')
      .select('id')
      .eq('session_id', sessionId)
      .eq('status', 'active')
      .single()

    const roundId = roundData?.id

    if (matchedAnswer) {
      // CORRECT
      const newRevealed = new Set(revealedIds)
      newRevealed.add(matchedAnswer.id)
      setRevealedIds(newRevealed)

      // Award point to current picker
      if (currentPicker) {
        await supabase
          .from('session_players')
          .update({ score: (currentPicker.score ?? 0) + 1 })
          .eq('id', currentPicker.id)
      }

      if (roundId) {
        await supabase.from('game_answers').insert({
          round_id:          roundId,
          session_player_id: currentPicker?.id,
          answer_data:       { castaway_id: castaway.id, season_id: castaway.seasons?.id },
          points_awarded:    1,
          result:            'correct',
        })
      }

      setFeedback({ type: 'correct', message: `✓ Correct! ${castaway.name} (${castaway.seasons?.name})` })

      // Advance guess count
      const newGuessCount = guessCount + 1
      const newSettings = { ...settings, guess_count: newGuessCount }

      // Check if all answered
      if (newRevealed.size >= totalAnswers) {
        await supabase.from('game_sessions').update({ status: 'finished', settings: newSettings }).eq('id', sessionId)
        setGameOver(true)
        const sorted = [...players].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
        setWinner(sorted[0])
      } else {
        await supabase.from('game_sessions').update({ settings: newSettings }).eq('id', sessionId)
      }

      if (settings.timer_seconds) resetTimer(settings.timer_seconds)
    } else {
      // WRONG
      const isAlreadyRevealed = answers.some(a => a.castaway_id === castaway.id && revealedIds.has(a.id))
      const notInList = !answers.some(a => a.castaway_id === castaway.id)

      if (isAlreadyRevealed) {
        setFeedback({ type: 'wrong', message: `${castaway.name} is already on the board!` })
        setSubmitting(false)
        return
      }

      if (roundId) {
        await supabase.from('game_answers').insert({
          round_id:          roundId,
          session_player_id: currentPicker?.id,
          answer_data:       { castaway_id: castaway.id },
          points_awarded:    0,
          result:            'wrong',
        })
      }

      // Strike logic
      const newGuessCount = guessCount + 1
      let newSettings = { ...settings, guess_count: newGuessCount }

      if (gameMode === 'strike' && currentPicker) {
        const newStrikes = (currentPicker.strikes ?? 0) + 1
        const eliminated = newStrikes >= 3
        await supabase.from('session_players')
          .update({ strikes: newStrikes, eliminated })
          .eq('id', currentPicker.id)

        setFeedback({
          type: 'strike',
          message: eliminated
            ? `✗ Wrong! ${currentPicker.personalities?.name?.split(' ')[0]} is ELIMINATED!`
            : `✗ Wrong! ${currentPicker.personalities?.name?.split(' ')[0]} gets a strike (${newStrikes}/3)`,
        })
      } else {
        setFeedback({ type: 'wrong', message: `✗ Not on the list!` })
      }

      await supabase.from('game_sessions').update({ settings: newSettings }).eq('id', sessionId)

      // Check if game over (all eliminated or rounds exhausted)
      const updatedPlayers = players.map(p =>
        p.id === currentPicker?.id
          ? { ...p, strikes: (p.strikes ?? 0) + 1, eliminated: (p.strikes ?? 0) + 1 >= 3 }
          : p
      )
      const stillActive = updatedPlayers.filter(p => !p.eliminated)
      if (gameMode === 'strike' && stillActive.length <= 1) {
        await supabase.from('game_sessions').update({ status: 'finished' }).eq('id', sessionId)
        setGameOver(true)
        const sorted = [...updatedPlayers].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
        setWinner(sorted[0])
      }

      if (settings.timer_seconds) resetTimer(settings.timer_seconds)
    }

    // Reload fresh state
    await load()
    setSubmitting(false)
  }

  async function handleEndGame() {
    if (!confirm('End this game early?')) return
    await supabase.from('game_sessions').update({ status: 'finished' }).eq('id', sessionId)
    const sorted = [...players].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    setWinner(sorted[0])
    setGameOver(true)
  }

  if (loading) return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center text-brand-muted">Loading…</div>
  )

  // GAME OVER screen
  if (gameOver) {
    const winnerPersonality = winner ? personalities[winner.personality_id] : null
    const sorted = [...players].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))

    return (
      <div className="min-h-screen bg-brand-bg flex flex-col items-center justify-center px-4">
        <div className="text-center max-w-lg w-full">
          <div className="text-6xl mb-4">🏆</div>
          <h1 className="font-display text-7xl logo-gradient tracking-wide mb-2">GAME OVER</h1>
          {winnerPersonality && (
            <div className="mt-6 mb-8">
              <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-brand-amber mx-auto mb-3">
                {winnerPersonality.photo_url
                  ? <img src={winnerPersonality.photo_url} alt={winnerPersonality.name} className="w-full h-full object-cover" />
                  : <div className="w-full h-full bg-brand-card flex items-center justify-center text-4xl font-display text-brand-amber">{winnerPersonality.name[0]}</div>
                }
              </div>
              <div className="font-display text-4xl text-brand-amber tracking-wide">{winnerPersonality.name}</div>
              <div className="text-brand-muted text-sm mt-1">WINNER · {winner.score} pts</div>
            </div>
          )}
          {/* Leaderboard */}
          <div className="bg-brand-panel border border-brand-border rounded-2xl p-5 mb-6">
            {sorted.map((p, i) => {
              const pers = personalities[p.personality_id]
              return (
                <div key={p.id} className={`flex items-center gap-4 py-2.5 ${i < sorted.length - 1 ? 'border-b border-brand-border' : ''}`}>
                  <span className="font-display text-2xl text-brand-muted w-6">{i + 1}</span>
                  <div className="w-9 h-9 rounded-full overflow-hidden bg-brand-card flex-shrink-0">
                    {pers?.photo_url
                      ? <img src={pers.photo_url} alt={pers.name} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-brand-muted">{pers?.name?.[0]}</div>
                    }
                  </div>
                  <div className="flex-1 text-left text-white">{pers?.name}</div>
                  <div className="font-display text-2xl text-white">{p.score}</div>
                </div>
              )
            })}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => router.push('/host/game/setup')}
              className="flex-1 bg-brand-red hover:bg-red-600 text-white font-display text-2xl tracking-widest py-3 rounded-xl transition-colors"
            >
              NEW GAME
            </button>
            <button
              onClick={() => router.push('/host')}
              className="flex-1 bg-brand-panel border border-brand-border text-white font-display text-2xl tracking-widest py-3 rounded-xl hover:border-white/30 transition-colors"
            >
              HOME
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col">
      <NavBar />

      <div className="flex-1 flex flex-col max-w-[1600px] mx-auto w-full px-4 py-4 gap-4">

        {/* Header bar */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl text-white tracking-wide">
              {session?.shows?.name} · LISTS
            </h1>
            <p className="text-brand-muted text-xs">
              {revealedCount}/{totalAnswers} revealed · {gameMode === 'strike' ? '3-Strike Mode' : `Round Mode (${pickStyle})`}
            </p>
          </div>
          <div className="flex items-center gap-4">
            {/* Timer */}
            {settings.timer_seconds && timeLeft !== null && (
              <div className={`font-display text-5xl tracking-wider ${timeLeft <= 10 ? 'timer-low' : 'text-white'}`}>
                {formatTime(timeLeft)}
              </div>
            )}
            <button
              onClick={handleEndGame}
              className="text-brand-muted hover:text-brand-red text-sm border border-brand-border hover:border-brand-red/40 px-3 py-1.5 rounded-lg transition-colors"
            >
              End Game
            </button>
          </div>
        </div>

        {/* Main layout: board + sidebar */}
        <div className="flex-1 flex gap-4 min-h-0">

          {/* Board */}
          <div className="flex-1 flex flex-col gap-4">
            <div className="flex-1 bg-brand-panel border border-brand-border rounded-2xl p-4 overflow-auto">
              {answers.length > 0 ? (
                <GameBoard
                  answers={answers}
                  totalCount={totalAnswers}
                  revealedIds={revealedIds}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-brand-muted">
                  No answers loaded for this list.
                </div>
              )}
            </div>

            {/* Guess input */}
            <div className="bg-brand-panel border border-brand-border rounded-2xl p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex items-center gap-2">
                  {currentPicker && personalities[currentPicker.personality_id] && (
                    <>
                      <div className="w-8 h-8 rounded-full overflow-hidden bg-brand-card">
                        {personalities[currentPicker.personality_id].photo_url
                          ? <img src={personalities[currentPicker.personality_id].photo_url} className="w-full h-full object-cover" alt="" />
                          : <div className="w-full h-full flex items-center justify-center text-brand-muted text-sm">
                              {personalities[currentPicker.personality_id].name?.[0]}
                            </div>
                        }
                      </div>
                      <span className="text-white text-sm font-medium">
                        {personalities[currentPicker.personality_id].name?.split(' ')[0]}'s guess
                      </span>
                    </>
                  )}
                </div>
              </div>

              <CastawaySearch
                onSelect={handleGuess}
                disabled={submitting || activePlayers.length === 0}
                placeholder={submitting ? 'Processing…' : 'Type a castaway name to guess…'}
              />

              {/* Feedback */}
              {feedback && (
                <div className={`mt-3 px-4 py-2.5 rounded-xl font-display text-xl tracking-wide animate-slide-up ${
                  feedback.type === 'correct'
                    ? 'bg-brand-green/20 border border-brand-green/40 text-brand-green'
                    : feedback.type === 'strike'
                    ? 'bg-brand-red/20 border border-brand-red/40 text-brand-red'
                    : 'bg-brand-border/40 border border-brand-border text-brand-muted'
                }`}>
                  {feedback.message}
                </div>
              )}
            </div>
          </div>

          {/* Player sidebar */}
          <div className="w-44 flex flex-col gap-2 overflow-y-auto">
            <div className="text-brand-muted text-xs uppercase tracking-widest mb-1 px-1">Players</div>
            {players.map(p => (
              <PlayerCard
                key={p.id}
                player={p}
                personality={personalities[p.personality_id]}
                isCurrentPicker={currentPicker?.id === p.id}
                gameMode={gameMode}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
