'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import NavBar from '@/components/NavBar'
import { supabase } from '@/lib/supabase'

const MODES = [
  {
    slug:  'lists',
    icon:  '📋',
    label: 'LISTS',
    desc:  'Players take turns guessing answers from a trivia list. 3-strike or round mode.',
    available: true,
  },
  {
    slug:  'boot-order',
    icon:  '🎡',
    label: 'BOOT ORDER',
    desc:  'Spin for a season and placement — guess who finished there.',
    available: false,
  },
  {
    slug:  'scattergories',
    icon:  '🔤',
    label: 'SCATTERGORIES',
    desc:  'Category + letter — name something that fits.',
    available: false,
  },
]

export default function SetupModePage() {
  const { show } = useParams()
  const [showName, setShowName] = useState('')

  useEffect(() => {
    supabase.from('shows').select('name').eq('slug', show).single()
      .then(({ data }) => setShowName(data?.name ?? show))
  }, [show])

  return (
    <div className="min-h-screen bg-brand-bg">
      <NavBar />
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="mb-10">
          <Link href="/host/game/setup" className="text-brand-muted hover:text-white text-sm mb-3 inline-flex items-center gap-1 transition-colors">
            ← Shows
          </Link>
          <h1 className="font-display text-6xl text-white tracking-wide">SELECT MODE</h1>
          <p className="text-brand-muted mt-1">{showName}</p>
        </div>

        <div className="flex flex-col gap-4">
          {MODES.map(mode => (
            mode.available ? (
              <Link key={mode.slug} href={`/host/game/setup/${show}/${mode.slug}`}
                className="group bg-brand-panel border border-brand-border rounded-2xl p-6 flex items-center gap-5 hover:border-brand-amber hover:shadow-[0_0_30px_rgba(244,162,97,0.12)] transition-all duration-300">
                <div className="text-4xl group-hover:scale-110 transition-transform w-14 text-center">{mode.icon}</div>
                <div className="flex-1">
                  <div className="font-display text-3xl text-white tracking-wide">{mode.label}</div>
                  <div className="text-brand-muted text-sm mt-0.5">{mode.desc}</div>
                </div>
                <div className="text-brand-muted group-hover:text-white transition-colors text-xl">→</div>
              </Link>
            ) : (
              <div key={mode.slug}
                className="bg-brand-panel border border-brand-border/40 rounded-2xl p-6 flex items-center gap-5 opacity-40 cursor-not-allowed">
                <div className="text-4xl w-14 text-center">{mode.icon}</div>
                <div className="flex-1">
                  <div className="font-display text-3xl text-white tracking-wide">{mode.label}</div>
                  <div className="text-brand-muted text-sm mt-0.5">{mode.desc}</div>
                </div>
                <div className="text-brand-muted text-xs uppercase tracking-widest">Coming soon</div>
              </div>
            )
          ))}
        </div>
      </div>
    </div>
  )
}
