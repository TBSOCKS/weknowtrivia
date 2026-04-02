'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import NavBar from '@/components/NavBar'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

const MODE_LABELS = { lists: 'Lists', boot_order: 'Boot Order' }
const SHOW_ICONS  = { 'survivor': '🌴', 'big-brother': '👁️', 'the-challenge': '🏆', 'drag-race': '👑' }

export default function PlayerProfilePage() {
  const { personalityId } = useParams()
  const router = useRouter()

  const [personality, setPersonality]     = useState(null)
  const [shows, setShows]                 = useState([])
  const [personalities, setPersonalities] = useState({})
  const [leaderboard, setLeaderboard]     = useState([])
  const [sessions, setSessions]           = useState([])
  const [loading, setLoading]             = useState(true)

  // H2H on profile
  const [h2hOpponent, setH2hOpponent]     = useState('')
  const [h2hResult, setH2hResult]         = useState(null)
  const [h2hLoading, setH2hLoading]       = useState(false)

  useEffect(() => {
    async function load() {
      const [persRes, showRes, allPersRes, lbRes, sessRes] = await Promise.all([
        supabase.from('personalities').select('*').eq('id', personalityId).single(),
        supabase.from('shows').select('*').order('name'),
        supabase.from('personalities').select('*').order('name'),
        supabase.from('leaderboard').select('*').eq('personality_id', personalityId),
        supabase.from('leaderboard_sessions').select('*').eq('personality_id', personalityId).order('played_at', { ascending: false }),
      ])
      setPersonality(persRes.data)
      setShows(showRes.data ?? [])
      const pMap = {}
      ;(allPersRes.data ?? []).forEach(p => { pMap[p.id] = p })
      setPersonalities(pMap)
      setLeaderboard(lbRes.data ?? [])
      setSessions(sessRes.data ?? [])
      setLoading(false)
    }
    load()
  }, [personalityId])

  // Aggregate stats
  const totalGames  = leaderboard.reduce((s, r) => s + (r.games_played ?? 0), 0)
  const totalWins   = leaderboard.reduce((s, r) => s + (r.wins ?? 0), 0)
  const totalPoints = leaderboard.reduce((s, r) => s + (r.total_points ?? 0), 0)
  const winPct      = totalGames > 0 ? Math.round((totalWins / totalGames) * 100) : 0
  const ppg         = totalGames > 0 ? (totalPoints / totalGames).toFixed(1) : '0.0'

  // Best show/mode
  const bestRow = leaderboard.length > 0
    ? leaderboard.reduce((best, r) => (r.wins ?? 0) > (best.wins ?? 0) ? r : best, leaderboard[0])
    : null
  const bestShow = shows.find(s => s.id === bestRow?.show_id)

  // Per show/mode breakdown
  const breakdown = leaderboard.map(r => ({
    ...r,
    show: shows.find(s => s.id === r.show_id),
    ppg: r.games_played > 0 ? (r.total_points / r.games_played).toFixed(1) : '0.0',
    winPct: r.games_played > 0 ? Math.round((r.wins / r.games_played) * 100) : 0,
  })).sort((a, b) => (b.wins ?? 0) - (a.wins ?? 0))

  async function runH2H() {
    if (!h2hOpponent || h2hLoading) return
    setH2hLoading(true)
    setH2hResult(null)
    const [resA, resB] = await Promise.all([
      supabase.from('leaderboard_sessions').select('session_id, won, score, show_id, mode, played_at').eq('personality_id', personalityId),
      supabase.from('leaderboard_sessions').select('session_id, won, score, show_id, mode, played_at').eq('personality_id', h2hOpponent),
    ])
    const aMap = {}
    ;(resA.data ?? []).forEach(s => { aMap[s.session_id] = s })
    const shared = (resB.data ?? []).filter(s => aMap[s.session_id])
    let myWins = 0, theirWins = 0, draws = 0
    const games = []
    shared.forEach(bRow => {
      const aRow = aMap[bRow.session_id]
      const show = shows.find(s => s.id === (aRow.show_id || bRow.show_id))
      if (aRow.won && !bRow.won)      { myWins++;    games.push({ date: aRow.played_at, winner: 'me',   myScore: aRow.score, theirScore: bRow.score, show: show?.name, mode: aRow.mode }) }
      else if (!aRow.won && bRow.won) { theirWins++; games.push({ date: aRow.played_at, winner: 'them', myScore: aRow.score, theirScore: bRow.score, show: show?.name, mode: aRow.mode }) }
      else                            { draws++;     games.push({ date: aRow.played_at, winner: 'draw', myScore: aRow.score, theirScore: bRow.score, show: show?.name, mode: aRow.mode }) }
    })
    games.sort((a, b) => new Date(b.date) - new Date(a.date))
    setH2hResult({ myWins, theirWins, draws, total: shared.length, games })
    setH2hLoading(false)
  }

  if (loading) return <div className="min-h-screen bg-brand-bg flex items-center justify-center text-brand-muted">Loading…</div>
  if (!personality) return <div className="min-h-screen bg-brand-bg flex items-center justify-center text-brand-muted">Player not found.</div>

  const opponent = personalities[h2hOpponent]

  return (
    <div className="min-h-screen bg-brand-bg">
      <NavBar />
      <div className="max-w-4xl mx-auto px-4 py-10">

        {/* Back */}
        <Link href="/host/leaderboard" className="text-brand-muted hover:text-white text-sm mb-6 inline-flex items-center gap-1 transition-colors">
          ← Leaderboard
        </Link>

        {/* Profile header */}
        <div className="flex items-center gap-6 mb-8 mt-3">
          <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-brand-amber flex-shrink-0">
            {personality.photo_url
              ? <img src={personality.photo_url} alt={personality.name} className="w-full h-full object-cover" />
              : <div className="w-full h-full bg-brand-card flex items-center justify-center text-4xl font-display text-brand-amber">{personality.name[0]}</div>}
          </div>
          <div>
            <h1 className="font-display text-5xl text-white tracking-wide">{personality.name.toUpperCase()}</h1>
            {bestShow && (
              <p className="text-brand-muted text-sm mt-1">
                Best: {SHOW_ICONS[bestShow.slug] ?? '📺'} {bestShow.name} · {MODE_LABELS[bestRow.mode] ?? bestRow.mode}
              </p>
            )}
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-8">
          {[
            { label: 'Games',   value: totalGames   },
            { label: 'Wins',    value: totalWins,   amber: true },
            { label: 'Win %',   value: `${winPct}%` },
            { label: 'Points',  value: totalPoints  },
            { label: 'Pts/Game', value: ppg         },
          ].map(stat => (
            <div key={stat.label} className="bg-brand-panel border border-brand-border rounded-2xl p-4 text-center">
              <div className={`font-display text-4xl ${stat.amber ? 'text-brand-amber' : 'text-white'}`}>{stat.value}</div>
              <div className="text-brand-muted text-xs uppercase tracking-widest mt-1">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Breakdown by show/mode */}
        {breakdown.length > 0 && (
          <div className="bg-brand-panel border border-brand-border rounded-2xl overflow-hidden mb-8">
            <div className="px-5 py-3 border-b border-brand-border">
              <h2 className="font-display text-xl text-white tracking-wide">BY SHOW & MODE</h2>
            </div>
            <div className="grid grid-cols-12 gap-2 px-5 py-2 text-xs uppercase tracking-widest border-b border-brand-border">
              <div className="col-span-4 text-brand-muted">Show / Mode</div>
              <div className="col-span-2 text-center text-brand-muted">Wins</div>
              <div className="col-span-2 text-center text-brand-muted">Win %</div>
              <div className="col-span-2 text-center text-brand-muted">Games</div>
              <div className="col-span-2 text-right text-brand-muted">Pts/G</div>
            </div>
            {breakdown.map(row => (
              <div key={`${row.show_id}-${row.mode}`} className="grid grid-cols-12 gap-2 px-5 py-3 border-b border-brand-border/40 last:border-0 items-center">
                <div className="col-span-4">
                  <div className="text-white text-sm">{SHOW_ICONS[row.show?.slug] ?? '📺'} {row.show?.name ?? '—'}</div>
                  <div className="text-brand-muted text-xs">{MODE_LABELS[row.mode] ?? row.mode}</div>
                </div>
                <div className="col-span-2 text-center font-display text-xl text-brand-amber">{row.wins}</div>
                <div className="col-span-2 text-center font-display text-xl text-white">{row.winPct}%</div>
                <div className="col-span-2 text-center font-display text-xl text-brand-muted">{row.games_played}</div>
                <div className="col-span-2 text-right font-display text-xl text-brand-muted">{row.ppg}</div>
              </div>
            ))}
          </div>
        )}

        {/* Head-to-head on profile */}
        <div className="bg-brand-panel border border-brand-border rounded-2xl p-5 mb-8">
          <h2 className="font-display text-xl text-white tracking-wide mb-4">HEAD TO HEAD</h2>
          <div className="flex flex-wrap gap-3 items-end mb-4">
            <div className="flex flex-col gap-1 flex-1 min-w-40">
              <label className="text-brand-muted text-xs uppercase tracking-widest">vs. opponent</label>
              <select value={h2hOpponent} onChange={e => { setH2hOpponent(e.target.value); setH2hResult(null) }}
                className="bg-brand-card border border-brand-border rounded-xl px-3 py-2 text-white focus:outline-none focus:border-brand-amber w-full">
                <option value="">— Select opponent —</option>
                {Object.values(personalities).filter(p => p.id !== personalityId).sort((a,b) => a.name.localeCompare(b.name)).map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <button onClick={runH2H} disabled={!h2hOpponent || h2hLoading}
              className="bg-brand-red hover:bg-red-600 disabled:opacity-50 text-white font-display text-xl tracking-widest px-6 py-2 rounded-xl transition-colors">
              {h2hLoading ? '…' : 'GO'}
            </button>
          </div>

          {h2hResult && (
            h2hResult.total === 0 ? (
              <p className="text-brand-muted text-sm">No shared games found with {opponent?.name}.</p>
            ) : (
              <div>
                <div className="flex items-center gap-4 mb-4">
                  <div className="flex-1 text-center">
                    <div className="w-14 h-14 rounded-full overflow-hidden bg-brand-card border-2 border-brand-border mx-auto mb-1">
                      {personality.photo_url ? <img src={personality.photo_url} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full flex items-center justify-center text-brand-muted font-display">{personality.name[0]}</div>}
                    </div>
                    <div className="text-white text-sm">{personality.name.split(' ')[0]}</div>
                    <div className={`font-display text-4xl mt-1 ${h2hResult.myWins > h2hResult.theirWins ? 'text-brand-amber' : 'text-white'}`}>{h2hResult.myWins}</div>
                  </div>
                  <div className="text-center">
                    {h2hResult.draws > 0 && <div className="text-brand-muted text-sm mb-1">{h2hResult.draws} draw{h2hResult.draws > 1 ? 's' : ''}</div>}
                    <div className="font-display text-2xl text-brand-muted">{h2hResult.total} game{h2hResult.total > 1 ? 's' : ''}</div>
                  </div>
                  <div className="flex-1 text-center">
                    <div className="w-14 h-14 rounded-full overflow-hidden bg-brand-card border-2 border-brand-border mx-auto mb-1">
                      {opponent?.photo_url ? <img src={opponent.photo_url} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full flex items-center justify-center text-brand-muted font-display">{opponent?.name?.[0]}</div>}
                    </div>
                    <div className="text-white text-sm">{opponent?.name?.split(' ')[0]}</div>
                    <div className={`font-display text-4xl mt-1 ${h2hResult.theirWins > h2hResult.myWins ? 'text-brand-amber' : 'text-white'}`}>{h2hResult.theirWins}</div>
                  </div>
                </div>
                <div className="border-t border-brand-border pt-3 flex flex-col gap-1.5">
                  {h2hResult.games.map((g, i) => (
                    <div key={i} className="flex items-center gap-3 text-sm py-1">
                      <span className="text-brand-muted text-xs w-20 flex-shrink-0">{new Date(g.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}</span>
                      <span className="text-brand-muted text-xs flex-1">{g.show} · {MODE_LABELS[g.mode] ?? g.mode}</span>
                      <span className={`font-display text-base w-6 text-center ${g.winner === 'me' ? 'text-brand-amber' : 'text-brand-muted'}`}>{g.myScore}</span>
                      <span className="text-brand-border">–</span>
                      <span className={`font-display text-base w-6 text-center ${g.winner === 'them' ? 'text-brand-amber' : 'text-brand-muted'}`}>{g.theirScore}</span>
                      <span className="text-xs w-16 text-right flex-shrink-0">
                        {g.winner === 'me' ? <span className="text-brand-amber">Win</span> : g.winner === 'them' ? <span className="text-brand-red">Loss</span> : <span className="text-brand-muted">Draw</span>}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
          )}
        </div>

        {/* Recent games */}
        {sessions.length > 0 && (
          <div className="bg-brand-panel border border-brand-border rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-brand-border">
              <h2 className="font-display text-xl text-white tracking-wide">RECENT GAMES</h2>
            </div>
            {sessions.slice(0, 15).map(s => {
              const sh = shows.find(sh => sh.id === s.show_id)
              return (
                <div key={s.id} className="flex items-center gap-4 px-5 py-3 border-b border-brand-border/40 last:border-0">
                  <span className="text-xl w-8">{s.won ? '🏆' : '—'}</span>
                  <div className="flex-1">
                    <div className="text-white text-sm">{SHOW_ICONS[sh?.slug] ?? '📺'} {sh?.name ?? '—'} · {MODE_LABELS[s.mode] ?? s.mode}</div>
                    <div className="text-brand-muted text-xs">{new Date(s.played_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                  </div>
                  <div className="text-right">
                    <div className={`font-display text-2xl ${s.won ? 'text-brand-amber' : 'text-white'}`}>{s.score}</div>
                    <div className="text-brand-muted text-xs">pts</div>
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
