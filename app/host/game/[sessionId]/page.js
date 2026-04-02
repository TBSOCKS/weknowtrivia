'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import NavBar from '@/components/NavBar'
import GameBoard from '@/components/GameBoard'
import PlayerCard from '@/components/PlayerCard'
import CastawaySearch from '@/components/CastawaySearch'
import { supabase } from '@/lib/supabase'
import { getCurrentPicker, formatTime, sortPlayers } from '@/lib/gameUtils'

export default function GameSessionPage() {
  const { sessionId } = useParams()
  const router        = useRouter()
    const [session, setSession]           = useState(null)
  const [players, setPlayers]           = useState([])       // session_players rows
  const [personalities, setPersonalities] = useState({})     // id → personality
  const [answers, setAnswers]           = useState([])       // list_answers with castaways
  const [revealedIds, setRevealedIds]   = useState(new Set())
  const [listTitle, setListTitle]       = useState('')
  const [feedback, setFeedback]         = useState(null)     // { type: 'correct'|'wrong'|'strike', message }
  const [loading, setLoading]           = useState(true)
  const [submitting, setSubmitting]     = useState(false)
  const [gameOver, setGameOver]         = useState(false)
  const [winner, setWinner]             = useState(null)
  const [suddenDeath, setSuddenDeath]   = useState(false)
  const [sdPlayers, setSdPlayers]       = useState([])   // player IDs in SD, in turn order
  const [sdCurrent, setSdCurrent]       = useState(0)    // index of current SD player
  const [sdSurvivors, setSdSurvivors]   = useState([])   // IDs who survived this round
  // Refs so timer closure always reads current values
  const sdPlayersRef    = useRef([])
  const sdCurrentRef    = useRef(0)
  const sdSurvivorsRef  = useRef([])
  const suddenDeathRef  = useRef(false)
  const [lastStrikeUndo, setLastStrikeUndo] = useState(null) // { playerId, prevStrikes, prevEliminated }
  const [lastTurnUndo, setLastTurnUndo]     = useState(null)

  // { prevGuessCount } for round mode  // Timer
  const [timeLeft, setTimeLeft]         = useState(null)
  const [paused, setPaused]             = useState(false)
  const timerRef                        = useRef(null)
  const pausedRef                       = useRef(false)

  // Initial full load
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
    const pMap = {}
    playersData.forEach(p => { pMap[p.personality_id] = p.personalities })
    setPersonalities(pMap)
    const listId = sess.settings?.list_id
    if (listId) {
      const { data: ansData } = await supabase
        .from('list_answers')
        .select('*, castaways(id, name, castaway_id, seasons(name, version_season))')
        .eq('list_id', listId)
        .order('position')
    setAnswers(ansData ?? [])      // Load list title
      const { data: listData } = await supabase.from('lists').select('title').eq('id', listId).single()
    if (listData?.title) setListTitle(listData.title)      // Build revealedIds from DB on initial load only
      const roundIds = await supabase
        .from('game_rounds').select('id').eq('session_id', sessionId)
        .then(r => r.data?.map(r => r.id) ?? [])
    const { data: correctAnswers } = roundIds.length
        ? await supabase.from('game_answers').select('answer_data').eq('result', 'correct').in('round_id', roundIds)
        : { data: [] }
    const revealed = new Set()
    const ansMap = {}
      ansData?.forEach(a => { ansMap[a.castaway_id] = a.id })
      ;(correctAnswers ?? []).forEach(ca => {
        const cid = ca.answer_data?.castaway_id
        if (cid && ansMap[cid]) revealed.add(ansMap[cid])
      })
    setRevealedIds(revealed)
    }
    setLoading(false)
  }, [sessionId, router])

  // Reload only players/scores after each guess — never touches revealedIds
  const reloadPlayers = useCallback(async () => {
    const [sessRes, playersRes] = await Promise.all([
      supabase.from('game_sessions').select('*, shows(name)').eq('id', sessionId).single(),
      supabase.from('session_players').select('*, personalities(*)').eq('session_id', sessionId).order('turn_order'),
    ])
    if (sessRes.data) setSession(sessRes.data)
    const playersData = playersRes.data ?? []
    setPlayers(playersData)
    const pMap = {}
    playersData.forEach(p => { pMap[p.personality_id] = p.personalities })
    setPersonalities(pMap)
  }, [sessionId])

  useEffect(() => { load() }, [load])

  // Start timer when session loads with timer setting
  useEffect(() => {
    if (!session?.settings?.timer_seconds) return
    resetTimer(session.settings.timer_seconds)
    return () => clearInterval(timerRef.current)
  }, [session?.id])

  function resetTimer(seconds, forSuddenDeath = false) {
    // Skip timer reset if SD timer is disabled and we're in sudden death
    if (forSuddenDeath && settings?.timer_sd_enabled === false) {
      clearInterval(timerRef.current)
    setTimeLeft(null)
      return
    }
    clearInterval(timerRef.current)
    pausedRef.current = false
    setPaused(false)
    setTimeLeft(seconds)
    timerRef.current = setInterval(() => {
      if (pausedRef.current) return
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current)
          // Advance turn on timeout
          advanceTurnOnTimeout()
    return 0
        }
    return prev - 1
      })
    }, 1000)
  }  function togglePause() {
    pausedRef.current = !pausedRef.current
    setPaused(pausedRef.current)
  }  async function advanceTurnOnTimeout() {
    // If in sudden death, use the clean advanceSdTurn(false) path
    if (suddenDeathRef.current) {
      const sdPickerId = sdPlayersRef.current[sdCurrentRef.current]
      const sdPicker   = players.find(p => p.id === sdPickerId)
      const name       = sdPicker?.personalities?.name?.split(' ')[0] ?? 'Player'
      setFeedback({ type: 'wrong', message: `⏰ Time's up! ${name} is eliminated from sudden death this round!` })
      await advanceSdTurn(false)
      await reloadPlayers()
      return
    }

    // Fetch fresh state from DB (avoids stale React state, especially after undo)
    const [sessRes, playersRes] = await Promise.all([
      supabase.from('game_sessions').select('settings').eq('id', sessionId).single(),
      supabase.from('session_players').select('*, personalities(*)').eq('session_id', sessionId).order('turn_order'),
    ])
    if (!sessRes.data) return
    const s = sessRes.data.settings ?? {}
    const freshPlayers = playersRes.data ?? []
    const newSettings = { ...s, guess_count: (s.guess_count ?? 0) + 1 }
    await supabase.from('game_sessions').update({ settings: newSettings }).eq('id', sessionId)
    // Strike mode — apply strike to current picker
    if ((s.mode ?? 'strike') === 'strike') {
      const freshPicker = getCurrentPicker(freshPlayers, s.guess_count ?? 0, s.pick_style ?? 'classic')
    if (freshPicker) {
        const newStrikes = (freshPicker.strikes ?? 0) + 1
        const eliminated = newStrikes >= 3
        await supabase.from('session_players')
          .update({ strikes: newStrikes, eliminated })
          .eq('id', freshPicker.id)
    setLastStrikeUndo({
          playerId: freshPicker.id,
          prevStrikes: freshPicker.strikes ?? 0,
          prevEliminated: freshPicker.eliminated ?? false,
          guessCount: s.guess_count ?? 0,
        })
    setFeedback({ type: 'strike', message: `⏰ Time's up! ${freshPicker.personalities?.name?.split(' ')[0]} gets a strike (${newStrikes}/3)` })
    const updatedPlayers = freshPlayers.map(p =>
          p.id === freshPicker.id ? { ...p, strikes: newStrikes, eliminated } : p
        )
    await checkStrikeGameOver(updatedPlayers, totalAnswers - revealedIds.size)
      }
    }

    // Round mode — advance turn and check if game/SD should start
    if ((s.mode ?? 'strike') !== 'strike') {
      const newGuessCount = (s.guess_count ?? 0) + 1
      setLastTurnUndo({ prevGuessCount: s.guess_count ?? 0 })
    setFeedback({ type: 'wrong', message: `⏰ Time's up! Turn advanced.` })
    if (s.total_rounds) {
        const active = freshPlayers.filter(p => !p.eliminated)
    const totalGuesses = s.total_rounds * active.length
        if (newGuessCount >= totalGuesses) {
          const sorted   = [...freshPlayers].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    const topScore = sorted[0]?.score ?? 0
          const tied     = sorted.filter(p => (p.score ?? 0) === topScore)
    if (tied.length > 1) {
            enterSuddenDeath(tied.map(p => p.id))
    setLastTurnUndo(null)
    await reloadPlayers()
    if (s.timer_seconds && s.timer_sd_enabled !== false) resetTimer(s.timer_seconds)
          } else {
            await supabase.from('game_sessions').update({ status: 'finished' }).eq('id', sessionId)
    await saveLeaderboard(freshPlayers, sorted[0])
    setWinner(sorted[0])
    setGameOver(true)
    await reloadPlayers()
          }
          return
        }
      }
    }
    await reloadPlayers()
    const secs = s.timer_seconds
    if (secs) resetTimer(secs)
  }  async function undoTurnAdvance() {
    if (!lastTurnUndo) return
    clearInterval(timerRef.current)
    const sess = await supabase.from('game_sessions').select('settings').eq('id', sessionId).single()
    if (sess.data) {
      await supabase.from('game_sessions')
        .update({ settings: { ...sess.data.settings, guess_count: lastTurnUndo.prevGuessCount } })
        .eq('id', sessionId)
    }
    setLastTurnUndo(null)
    setFeedback({ type: 'correct', message: '↩ Turn undone — timer reset' })
    await reloadPlayers()
    const secs = sess.data?.settings?.timer_seconds
    if (secs) resetTimer(secs)
  }  async function undoTimerStrike() {
    if (!lastStrikeUndo) return
    const { playerId, prevStrikes, prevEliminated, guessCount } = lastStrikeUndo
    // Restore player state
    await supabase.from('session_players')
      .update({ strikes: prevStrikes, eliminated: prevEliminated })
      .eq('id', playerId)
    // Restore guess count
    const sess = await supabase.from('game_sessions').select('settings').eq('id', sessionId).single()
    if (sess.data) {
      await supabase.from('game_sessions')
        .update({ settings: { ...sess.data.settings, guess_count: guessCount }, status: 'active' })
        .eq('id', sessionId)
    }
    setLastStrikeUndo(null)
    setGameOver(false)
    setWinner(null)
    setFeedback({ type: 'correct', message: '↩ Strike undone — timer reset' })
    await reloadPlayers()
    const secs = sess.data?.settings?.timer_seconds
    if (secs) resetTimer(secs)
  }  // Keep SD refs in sync with state
  function setSdPlayersSync(v)   { sdPlayersRef.current = v;   setSdPlayers(v) }
  function setSdCurrentSync(v)   { sdCurrentRef.current = v;   setSdCurrent(v) }
  function setSdSurvivorsSync(v) { sdSurvivorsRef.current = v; setSdSurvivors(v) }
  function setSuddenDeathSync(v) { suddenDeathRef.current = v; setSuddenDeath(v) }  // Derived state
  const settings     = session?.settings ?? {}
  const gameMode     = settings.mode ?? 'strike'
  const pickStyle    = settings.pick_style ?? 'classic'
  const guessCount   = settings.guess_count ?? 0
  const currentPicker = getCurrentPicker(players, guessCount, pickStyle)

  // During sudden death, override the current picker
  const sdActivePlayers = suddenDeath ? players.filter(p => sdPlayers.includes(p.id)) : []
  const sdCurrentPicker = suddenDeath && sdActivePlayers.length > 0
    ? sdActivePlayers[sdCurrent % Math.max(sdActivePlayers.length, 1)]
    : null
  const effectivePicker = suddenDeath ? sdCurrentPicker : currentPicker

  // Players who've already had their SD turn this round and didn't survive
  const sdEliminatedThisRound = new Set(
    sdPlayers
      .slice(0, sdCurrent)
      .filter(id => !sdSurvivors.includes(id))
  )

  const activePlayers  = players.filter(p => !p.eliminated)
  const totalAnswers   = answers.length
  const revealedCount  = revealedIds.size

  async function handleGuess(castaway) {
    if (submitting || !session) return
    setSubmitting(true)
    setFeedback(null)
    setLastStrikeUndo(null)
    setLastTurnUndo(null)
    try {    // Check if this castaway is in the answer list and not yet revealed
    const matchedAnswer = answers.find(
      a => a.castaway_id === castaway.id && !revealedIds.has(a.id)
    )    // Get or create current round
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
    setRevealedIds(newRevealed)      // Award point to current picker
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
    setFeedback({ type: 'correct', message: `✓ Correct! ${castaway.name} (${castaway.seasons?.name})` })      // Advance guess count
      const newGuessCount = guessCount + 1
      const newSettings = { ...settings, guess_count: newGuessCount }

      // Snapshot updated scores for winner calculation (before stale reloadPlayers)
    const updatedPlayersAfterCorrect = players.map(p =>
        p.id === currentPicker?.id ? { ...p, score: (p.score ?? 0) + 1 } : p
      )      // Check if all answered
      if (newRevealed.size >= totalAnswers) {
        // All answers revealed — end the game regardless of ties (ties stand as ties)
        await supabase.from('game_sessions').update({ status: 'finished', settings: newSettings }).eq('id', sessionId)
        const sorted = [...updatedPlayersAfterCorrect].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
        await saveLeaderboard(updatedPlayersAfterCorrect, sorted[0])
        setWinner(sorted[0])
        setGameOver(true)
      } else {
        await supabase.from('game_sessions').update({ settings: newSettings }).eq('id', sessionId)
        // Check mathematical game-over in strike mode
        if (gameMode === 'strike') {
          const remaining = totalAnswers - newRevealed.size
          await checkStrikeGameOver(updatedPlayersAfterCorrect, remaining)
        }

    // Check round mode end condition
        if (gameMode === 'round' && settings.total_rounds) {
          const totalPlayers = players.filter(p => !p.eliminated).length
          const totalGuesses = settings.total_rounds * totalPlayers
          if (newGuessCount >= totalGuesses) {
            const sorted = [...updatedPlayersAfterCorrect].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    const topScore = sorted[0].score ?? 0
            const tied = sorted.filter(p => (p.score ?? 0) === topScore)
    if (tied.length > 1) {
              await supabase.from('game_sessions').update({ settings: newSettings }).eq('id', sessionId)
          enterSuddenDeath(tied.map(p => p.id))
            } else {
              await supabase.from('game_sessions').update({ status: 'finished' }).eq('id', sessionId)
    await saveLeaderboard(updatedPlayersAfterCorrect, sorted[0])
    setWinner(sorted[0])
    setGameOver(true)
            }
          }
        }
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
    if (gameMode === 'strike') {
        const updatedPlayers = players.map(p =>
          p.id === currentPicker?.id
            ? { ...p, strikes: (p.strikes ?? 0) + 1, eliminated: (p.strikes ?? 0) + 1 >= 3 }
            : p
        )
    const remaining = totalAnswers - revealedIds.size
        await checkStrikeGameOver(updatedPlayers, remaining)
      }

    // Check round mode end on wrong guess too
      if (gameMode === 'round' && settings.total_rounds) {
        const totalPlayers = players.filter(p => !p.eliminated).length
        const totalGuesses = settings.total_rounds * totalPlayers
        if (newGuessCount >= totalGuesses) {
          const sorted = [...players].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    const topScore = sorted[0].score ?? 0
          const tied = sorted.filter(p => (p.score ?? 0) === topScore)
    if (tied.length > 1) {
            await supabase.from('game_sessions').update({ settings: { ...settings, guess_count: newGuessCount } }).eq('id', sessionId)
          enterSuddenDeath(tied.map(p => p.id))
          } else {
            await supabase.from('game_sessions').update({ status: 'finished' }).eq('id', sessionId)
    await saveLeaderboard(players, sorted[0])
    setWinner(sorted[0])
    setGameOver(true)
          }
        }
      }

      if (settings.timer_seconds) resetTimer(settings.timer_seconds)
    }

    // Reload players only — revealedIds managed in state
    await reloadPlayers()
    } catch (err) {
      console.error('handleGuess error:', err)
    setFeedback({ type: 'wrong', message: 'Something went wrong — please try again.' })
    } finally {
      setSubmitting(false)
    }
  }  // Save leaderboard if tracking is enabled
  async function saveLeaderboard(allPlayers, winnerPlayer) {
    const { data: freshSess } = await supabase
      .from('game_sessions').select('*').eq('id', sessionId).single()
    if (!freshSess?.settings?.track_leaderboard) return
    const showId = freshSess.show_id
    const mode   = freshSess.mode

    for (const p of allPlayers) {
      const isWinner  = p.id === winnerPlayer?.id
      const addPoints = p.score ?? 0

      // Write per-session row (for deletable history)
    await supabase.from('leaderboard_sessions').insert({
        session_id:     sessionId,
        personality_id: p.personality_id,
        show_id:        showId,
        mode,
        score:          addPoints,
        won:            isWinner,
      })      // Update aggregate leaderboard
      const { data: existing } = await supabase
        .from('leaderboard').select('*')
        .eq('personality_id', p.personality_id)
        .eq('show_id', showId).eq('mode', mode)
        .maybeSingle()
    if (existing) {
        await supabase.from('leaderboard').update({
          games_played: existing.games_played + 1,
          wins:         existing.wins + (isWinner ? 1 : 0),
          total_points: existing.total_points + addPoints,
          updated_at:   new Date().toISOString(),
        }).eq('id', existing.id)
      } else {
        await supabase.from('leaderboard').insert({
          personality_id: p.personality_id,
          show_id: showId, mode,
          games_played: 1,
          wins:         isWinner ? 1 : 0,
          total_points: addPoints,
        })
      }
    }
  }  // Handle a sudden death guess
  async function handleSuddenDeathGuess(castaway) {
    if (submitting) return
    setSubmitting(true)
    setFeedback(null)
    try {
      const isAlreadyRevealed = answers.some(a => a.castaway_id === castaway.id && revealedIds.has(a.id))
    if (isAlreadyRevealed) {
        setFeedback({ type: 'wrong', message: `${castaway.name} is already on the board!` })
    setSubmitting(false)
        return
      }
    const sdPickerId = sdPlayersRef.current[sdCurrentRef.current]
    const sdPicker   = players.find(p => p.id === sdPickerId)
    const name       = sdPicker?.personalities?.name?.split(' ')[0] ?? 'Player'
      const matchedAnswer = answers.find(a => a.castaway_id === castaway.id && !revealedIds.has(a.id))
    if (matchedAnswer) {
        const newRevealed = new Set(revealedIds)
        newRevealed.add(matchedAnswer.id)
    setRevealedIds(newRevealed)
    await supabase.from('session_players')
          .update({ score: (sdPicker?.score ?? 0) + 1 })
          .eq('id', sdPickerId)
    setFeedback({ type: 'correct', message: `✓ ${castaway.name} — ${name} survives!` })
    await advanceSdTurn(true)
      } else {
        setFeedback({ type: 'wrong', message: `✗ Wrong! ${name} is eliminated from sudden death this round!` })
    await advanceSdTurn(false)
      }
    await reloadPlayers()
    } catch (err) {
      console.error('SD error:', err)
    setFeedback({ type: 'wrong', message: 'Something went wrong — try again.' })
    } finally {
      setSubmitting(false)
    }
  }




  // Enter sudden death with a list of tied player IDs
  // Marks non-tied active players as eliminated in DB
  async function enterSuddenDeath(tiedPlayerIds) {
    // Mark players NOT in the tie as eliminated
    const nonTied = players.filter(p => !p.eliminated && !tiedPlayerIds.includes(p.id))
    for (const p of nonTied) {
      await supabase.from('session_players').update({ eliminated: true }).eq('id', p.id)
    }
    setSdPlayersSync(tiedPlayerIds)
    setSdCurrentSync(0)
    setSdSurvivorsSync([])
    setSuddenDeathSync(true)
    // Handle timer for SD entry
    if (!settings.timer_sd_enabled && settings.timer_sd_enabled !== undefined) {
      clearInterval(timerRef.current)
      setTimeLeft(null)
    } else if (settings.timer_seconds) {
      resetTimer(settings.timer_seconds)
    }
  }

  // Advance SD turn — call after each guess or timeout
  // correct=true means this player answered correctly
  async function advanceSdTurn(correct) {
    const players_   = sdPlayersRef.current
    const current_   = sdCurrentRef.current
    const survivors_ = sdSurvivorsRef.current
    const pickerId   = players_[current_]
    const newSurvivors = correct ? [...survivors_, pickerId] : survivors_
    const nextIdx      = current_ + 1
    const roundDone    = nextIdx >= players_.length

    if (!roundDone) {
      setSdSurvivorsSync(newSurvivors)
      setSdCurrentSync(nextIdx)
      // Reset timer for next SD player
      if (settings.timer_seconds && settings.timer_sd_enabled !== false) {
        resetTimer(settings.timer_seconds)
      }
      return
    }

    // Round complete — evaluate
    if (newSurvivors.length === 1) {
      const winnerPlayer = players.find(p => p.id === newSurvivors[0])
    await supabase.from('game_sessions').update({ status: 'finished' }).eq('id', sessionId)
    await saveLeaderboard(players, winnerPlayer)
    setSuddenDeathSync(false)
    setWinner(winnerPlayer)
    setGameOver(true)
    } else if (newSurvivors.length > 1) {
      setSdPlayersSync(newSurvivors)
      setSdCurrentSync(0)
      setSdSurvivorsSync([])
      if (settings.timer_seconds && settings.timer_sd_enabled !== false) resetTimer(settings.timer_seconds)
    } else {
      // Everyone failed — full reset, same players
      setSdCurrentSync(0)
      setSdSurvivorsSync([])
      if (settings.timer_seconds && settings.timer_sd_enabled !== false) resetTimer(settings.timer_seconds)
    }
  }

  // Check if strike game is mathematically over given a player snapshot
  async function checkStrikeGameOver(updatedPlayers, remainingAnswers) {
    const stillActive = updatedPlayers.filter(p => !p.eliminated)
    const eliminated  = updatedPlayers.filter(p => p.eliminated)
    let isOver = false

    if (stillActive.length === 0) {
      isOver = true
    } else if (stillActive.length === 1) {
      const active = stillActive[0]
      // Only 1 player left — if they already lead, game over
      // If no eliminated players yet, they're last standing
      const topElim = eliminated.length > 0 ? Math.max(...eliminated.map(p => p.score ?? 0)) : -1
      if (eliminated.length === 0 || (active.score ?? 0) > topElim) isOver = true
    } else {
      // Multiple active — leader's gap > remaining = insurmountable
      const sorted = [...stillActive].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    if ((sorted[0].score ?? 0) - (sorted[1].score ?? 0) > remainingAnswers) isOver = true
    }    if (isOver) {
      const sorted   = [...updatedPlayers].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    const topScore = sorted[0].score ?? 0
      const tied     = sorted.filter(p => (p.score ?? 0) === topScore)
    if (tied.length > 1) {
        // Tie — go to sudden death instead of ending
          enterSuddenDeath(tied.map(p => p.id))
    return true
      }
    await supabase.from('game_sessions').update({ status: 'finished' }).eq('id', sessionId)
    await saveLeaderboard(updatedPlayers, sorted[0])
    setWinner(sorted[0])
    setGameOver(true)
    }
    return isOver
  }  async function handleEndGame() {
    if (!confirm('End this game early?')) return
    await supabase.from('game_sessions').update({ status: 'finished' }).eq('id', sessionId)
    const sorted = [...players].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    await saveLeaderboard(players, sorted[0])
    setWinner(sorted[0])
    setGameOver(true)
  }  if (loading) return (
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
              <div className="text-brand-muted text-sm mt-1">WINNER · {sorted.find(p => p.id === winner.id)?.score ?? winner.score} pts</div>
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
          </div>          <div className="flex gap-3">
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
  }  return (
    <div className="h-screen bg-brand-bg flex flex-col overflow-hidden relative">
      <NavBar />      {/* Full-height content below nav */}
      <div className="flex-1 flex gap-3 px-3 py-3 min-h-0">        {/* Board — shrinks to grid content */}
        <div className="flex-[2] flex flex-col min-h-0">
          {/* Header */}
          <div className="flex items-center justify-between mb-2 flex-shrink-0">
            <div>
              <h1 className="font-display text-2xl text-white tracking-wide leading-none">
                {session?.shows?.name} · LISTS
              </h1>
              {listTitle && <p className="text-brand-amber text-sm font-medium mt-0.5 truncate max-w-xs">{listTitle}</p>}
              <p className="text-brand-muted text-xs mt-0.5">
                {revealedCount}/{totalAnswers} revealed ·{' '}
                {suddenDeath ? '⚡ SUDDEN DEATH' : gameMode === 'strike' ? '3-Strike' : `Round ${Math.min(Math.floor(guessCount / Math.max(players.filter(p=>!p.eliminated).length,1)) + 1, settings.total_rounds ?? 99)} of ${settings.total_rounds ?? '?'} (${pickStyle})`}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {settings.timer_seconds && timeLeft !== null && (
                <>
                  <div className={`font-display text-4xl tracking-wider ${timeLeft <= 10 && !paused ? 'timer-low' : 'text-white'}`}>
                    {paused ? <span className="text-brand-amber">PAUSED</span> : formatTime(timeLeft)}
                  </div>
                  <button
                    onClick={togglePause}
                    className={`text-sm border px-3 py-1.5 rounded-lg transition-colors ${paused ? 'border-brand-amber text-brand-amber hover:bg-brand-amber/10' : 'border-brand-border text-brand-muted hover:text-white'}`}
                  >
                    {paused ? '▶ Resume' : '⏸ Pause'}
                  </button>
                </>
              )}
              <button
                onClick={handleEndGame}
                className="text-brand-muted hover:text-brand-red text-sm border border-brand-border hover:border-brand-red/40 px-3 py-1.5 rounded-lg transition-colors"
              >
                End Game
              </button>
            </div>
          </div>          {/* Board fills remaining height */}
          <div className="flex-1 border border-brand-border rounded-2xl p-1 min-h-0 overflow-hidden flex items-center justify-start" style={{ background: '#0a0a10' }}>
            {answers.length > 0 ? (
              <GameBoard
                answers={answers}
                totalCount={totalAnswers}
                revealedIds={revealedIds}
                onGridWidth={w => setBoardWidth(w)}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-brand-muted">
                No answers loaded for this list.
              </div>
            )}
          </div>
        </div>        {/* Right sidebar: fills remaining space */}
        <div className="flex-[3] flex flex-col gap-3 min-h-0 min-w-0">          {/* Guess input */}
          <div className="bg-brand-panel border border-brand-border rounded-2xl p-3 flex-shrink-0">
            {/* Current picker */}
            {!suddenDeath && effectivePicker && personalities[effectivePicker.personality_id] && (
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-full overflow-hidden bg-brand-card flex-shrink-0">
                  {personalities[effectivePicker.personality_id].photo_url
                    ? <img src={personalities[effectivePicker.personality_id].photo_url} className="w-full h-full object-cover" alt="" />
                    : <div className="w-full h-full flex items-center justify-center text-brand-muted text-xs">
                        {personalities[effectivePicker.personality_id].name?.[0]}
                      </div>
                  }
                </div>
                <span className="text-white text-xs font-medium truncate">
                  {personalities[effectivePicker.personality_id].name?.split(' ')[0]}'s guess
                </span>
              </div>
            )}            {suddenDeath && (
              <div className="mb-2 px-3 py-2 bg-brand-red/20 border border-brand-red/50 rounded-xl text-center">
                <div className="font-display text-base text-brand-red tracking-wide">⚡ SUDDEN DEATH</div>
                {(() => {
                  const sdActive = players.filter(p => sdPlayers.includes(p.id))
    const picker = sdActive[sdCurrent % Math.max(sdActive.length, 1)]
    const name = personalities[picker?.personality_id]?.name?.split(' ')[0]
    return <div className="text-brand-muted text-xs mt-0.5">{name}'s guess{sdSurvivors.length > 0 ? ` · ${sdSurvivors.length} survived so far` : ''}</div>
                })()}
              </div>
            )}            <CastawaySearch
              onSelect={suddenDeath ? handleSuddenDeathGuess : handleGuess}
              disabled={submitting || (!suddenDeath && activePlayers.length === 0)}
              placeholder={submitting ? 'Processing…' : suddenDeath ? 'Sudden death guess…' : 'Guess a castaway…'}
            />            {/* Feedback */}
            {feedback && (
              <div className={`mt-2 px-3 py-2 rounded-xl font-display text-sm tracking-wide animate-slide-up ${
                feedback.type === 'correct'
                  ? 'bg-brand-green/20 border border-brand-green/40 text-brand-green'
                  : feedback.type === 'strike'
                  ? 'bg-brand-red/20 border border-brand-red/40 text-brand-red'
                  : 'bg-brand-border/40 border border-brand-border text-brand-muted'
              }`}>
                {feedback.message}
              </div>
            )}
            {lastStrikeUndo && (
              <button onClick={undoTimerStrike}
                className="mt-1.5 w-full text-xs text-brand-amber hover:text-amber-400 border border-brand-amber/30 hover:border-brand-amber/60 rounded-lg py-1 transition-colors">
                ↩ Undo timer strike
              </button>
            )}
            {lastTurnUndo && (
              <button onClick={undoTurnAdvance}
                className="mt-1.5 w-full text-xs text-brand-amber hover:text-amber-400 border border-brand-amber/30 hover:border-brand-amber/60 rounded-lg py-1 transition-colors">
                ↩ Undo turn advance
              </button>
            )}
          </div>          {/* Turn order strip — fixed positions, highlight moves */}
          {!suddenDeath && (
            <div className="flex-shrink-0 bg-brand-panel border border-brand-border rounded-xl px-4 py-2.5 flex items-center gap-3 overflow-x-auto">
              <span className="text-brand-muted text-xs uppercase tracking-widest whitespace-nowrap mr-1">Turn order</span>
              {[...players]
                .sort((a, b) => a.turn_order - b.turn_order)
                .map(p => {
                  const pers = personalities[p.personality_id]
                  const isCurrent = effectivePicker?.id === p.id
                  return (
                    <div key={p.id} className={`flex flex-col items-center gap-1 flex-shrink-0 transition-all duration-300 ${p.eliminated ? 'opacity-20' : isCurrent ? 'opacity-100' : 'opacity-40'}`}>
                      <div className={`rounded-full overflow-hidden border-2 transition-all duration-300 ${isCurrent ? 'w-10 h-10 border-brand-red shadow-[0_0_8px_rgba(230,57,70,0.6)]' : 'w-8 h-8 border-brand-border'}`}>
                        {pers?.photo_url
                          ? <img src={pers.photo_url} className="w-full h-full object-cover" alt="" />
                          : <div className="w-full h-full bg-brand-card flex items-center justify-center text-xs text-brand-muted">{pers?.name?.[0]}</div>
                        }
                      </div>
                      <span className={`text-[10px] font-medium whitespace-nowrap ${isCurrent ? 'text-white' : 'text-brand-muted'}`}>
                        {pers?.name?.split(' ')[0]}
                      </span>
                    </div>
                  )
                })
              }
            </div>
          )}

          {/* Player cards — fixed turn order, rank badge shows position */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="text-brand-muted text-xs uppercase tracking-widest px-1 mb-2">Players</div>
            {(() => {
              // Compute rank for each player by score
              const sorted = [...players].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
              const rankMap = {}
              let rank = 1
              sorted.forEach((p, i) => {
                if (i > 0 && (p.score ?? 0) < (sorted[i-1].score ?? 0)) rank = i + 1
                rankMap[p.id] = rank
              })
              // Display in fixed turn order
              const inTurnOrder = [...players].sort((a, b) => a.turn_order - b.turn_order)
              return (
                <div className="grid grid-cols-2 gap-2">
                  {inTurnOrder.map(p => (
                    <PlayerCard
                      key={p.id}
                      player={p}
                      personality={personalities[p.personality_id]}
                      isCurrentPicker={effectivePicker?.id === p.id}
                      gameMode={gameMode}
                      turnOrder={p.turn_order}
                      rank={rankMap[p.id]}
                      inSuddenDeath={suddenDeath && sdPlayers.includes(p.id)}
                      sdEliminatedThisRound={sdEliminatedThisRound.has(p.id)}
                    />
                  ))}
                </div>
              )
            })()}
          </div>
        </div>
      </div>      {/* Pause overlay */}
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
