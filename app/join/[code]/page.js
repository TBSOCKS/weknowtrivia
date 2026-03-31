'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function JoinCodePage() {
  const { code }          = useParams()
  const [session, setSession] = useState(null)
  const [players, setPlayers] = useState([])
  const [revealedCount, setRevealedCount] = useState(0)
  const [totalCount, setTotalCount]       = useState(0)
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState('')

  useEffect(() => {
    async function load() {
      const { data: sess, error: sessErr } = await supabase
        .from('game_sessions')
        .select('*, shows(name)')
        .eq('code', code.toUpperCase())
        .neq('status', 'finished')
        .single()

      if (sessErr || !sess) {
        setError(`No active game found with code "${code.toUpperCase()}". Ask your host to check the code.`)
        setLoading(false)
        return
      }
      setSession(sess)

      const { data: playersData } = await supabase
        .from('session_players')
        .select('*, personalities(name, photo_url)')
        .eq('session_id', sess.id)
        .order('turn_order')
      setPlayers(playersData ?? [])

      const listId = sess.settings?.list_id
      if (listId) {
        const { count: total } = await supabase
          .from('list_answers')
          .select('id', { count: 'exact', head: true })
          .eq('list_id', listId)
        setTotalCount(total ?? 0)
      }

      setLoading(false)
    }
    load()

    const channel = supabase
      .channel(`session-${code}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_sessions' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'session_players' }, () => load())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [code])

  if (loading) return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center">
      <div className="text-brand-muted font-display text-3xl tracking-widest animate-pulse">LOADING…</div>
    </div>
  )

  if (error) return (
    <div className="min-h-screen bg-brand-bg flex flex-col items-center justify-center px-4">
      <div className="text-5xl mb-4">❌</div>
      <h1 className="font-display text-4xl text-white tracking-wide mb-2">GAME NOT FOUND</h1>
      <p className="text-brand-muted text-center max-w-xs mb-6">{error}</p>
      <a href="/" className="text-brand-amber hover:underline text-sm">← Back to home</a>
    </div>
  )

  const sorted = [...players].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))

  return (
    <div className="min-h-screen bg-brand-bg px-4 py-8">
      <div className="text-center mb-8">
        <div className="font-display text-5xl logo-gradient tracking-wide">WE KNOW TRIVIA</div>
        <div className="text-brand-muted text-sm mt-1 tracking-widest uppercase">
          {session?.shows?.name} · Lists
        </div>
        <div className="inline-block mt-3 bg-brand-panel border border-brand-border px-6 py-1 rounded-full">
          <span className="font-display text-3xl text-white tracking-widest">{code.toUpperCase()}</span>
        </div>
      </div>

      <div className="max-w-sm mx-auto">
        <div className="bg-brand-panel border border-brand-border rounded-2xl p-5 mb-4 text-center">
          <div className="text-brand-muted text-xs uppercase tracking-widest mb-1">Game Status</div>
          <div className={`font-display text-3xl tracking-wide ${
            session?.status === 'active' ? 'text-brand-green' : 'text-brand-muted'
          }`}>
            {session?.status === 'active' ? 'IN PROGRESS' :
             session?.status === 'setup'  ? 'WAITING TO START' : 'FINISHED'}
          </div>
          {totalCount > 0 && (
            <div className="mt-3">
              <div className="flex justify-between text-xs text-brand-muted mb-1">
                <span>Answers revealed</span>
                <span>{revealedCount}/{totalCount}</span>
              </div>
              <div className="w-full bg-brand-card rounded-full h-2 overflow-hidden">
                <div className="h-full bg-brand-green rounded-full transition-all"
                     style={{ width: `${totalCount ? (revealedCount / totalCount) * 100 : 0}%` }} />
              </div>
            </div>
          )}
        </div>

        <div className="bg-brand-panel border border-brand-border rounded-2xl p-5">
          <div className="text-brand-muted text-xs uppercase tracking-widest mb-4">Scoreboard</div>
          <div className="flex flex-col gap-3">
            {sorted.map((p, i) => (
              <div key={p.id} className={`flex items-center gap-3 ${p.eliminated ? 'opacity-40' : ''}`}>
                <span className="font-display text-xl text-brand-muted w-5">{i + 1}</span>
                <div className="w-10 h-10 rounded-full overflow-hidden bg-brand-card border border-brand-border flex-shrink-0">
                  {p.personalities?.photo_url
                    ? <img src={p.personalities.photo_url} alt={p.personalities.name} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-brand-muted font-display">{p.personalities?.name?.[0]}</div>
                  }
                </div>
                <div className="flex-1">
                  <div className="text-white text-sm">{p.personalities?.name}</div>
                  {p.eliminated && <div className="text-brand-red text-xs">Eliminated</div>}
                  {!p.eliminated && session?.settings?.mode === 'strike' && (
                    <div className="flex gap-1 mt-0.5">
                      {[1,2,3].map(n => (
                        <div key={n} className={`strike-dot ${n <= (p.strikes ?? 0) ? 'active' : ''}`} style={{ width: 8, height: 8 }} />
                      ))}
                    </div>
                  )}
                </div>
                <div className="font-display text-3xl text-white">{p.score ?? 0}</div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-center text-brand-muted text-xs mt-6">
          Watch the host's screen to see the board · Scores update live
        </p>
      </div>
    </div>
  )
}
