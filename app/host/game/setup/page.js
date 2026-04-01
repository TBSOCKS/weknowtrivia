'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import NavBar from '@/components/NavBar'
import { supabase } from '@/lib/supabase'

const SHOW_ICONS = {
  'survivor':      '🌴',
  'big-brother':   '👁️',
  'the-challenge': '🏆',
  'drag-race':     '👑',
}

export default function SetupShowPage() {
  const [shows, setShows]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('shows').select('*').order('name').then(({ data }) => {
      setShows(data ?? [])
      setLoading(false)
    })
  }, [])

  return (
    <div className="min-h-screen bg-brand-bg">
      <NavBar />
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="mb-10">
          <Link href="/host" className="text-brand-muted hover:text-white text-sm mb-3 inline-flex items-center gap-1 transition-colors">
            ← Dashboard
          </Link>
          <h1 className="font-display text-6xl text-white tracking-wide">SELECT SHOW</h1>
          <p className="text-brand-muted mt-1">Which show are you playing?</p>
        </div>

        {loading ? (
          <div className="text-brand-muted text-center py-16">Loading…</div>
        ) : (
          <div className="flex flex-col gap-4">
            {shows.map(show => (
              <Link key={show.id} href={`/host/game/setup/${show.slug}`}
                className="group bg-brand-panel border border-brand-border rounded-2xl p-6 flex items-center gap-5 hover:border-brand-red hover:shadow-[0_0_30px_rgba(230,57,70,0.12)] transition-all duration-300">
                <div className="text-4xl group-hover:scale-110 transition-transform w-14 text-center">
                  {SHOW_ICONS[show.slug] ?? '📺'}
                </div>
                <div className="flex-1">
                  <div className="font-display text-3xl text-white tracking-wide">{show.name.toUpperCase()}</div>
                </div>
                <div className="text-brand-muted group-hover:text-white transition-colors text-xl">→</div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
