'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import NavBar from '@/components/NavBar'
import { supabase } from '@/lib/supabase'

export default function HostDashboard() {
  const [stats, setStats] = useState({ personalities: 0, lists: 0, seasons: 0 })

  useEffect(() => {
    async function load() {
      const [p, l, s] = await Promise.all([
        supabase.from('personalities').select('id', { count: 'exact', head: true }),
        supabase.from('lists').select('id', { count: 'exact', head: true }),
        supabase.from('seasons').select('id', { count: 'exact', head: true }),
      ])
      setStats({
        personalities: p.count ?? 0,
        lists:         l.count ?? 0,
        seasons:       s.count ?? 0,
      })
    }
    load()
  }, [])

  const tiles = [
    {
      href:  '/host/game/setup',
      icon:  '🎮',
      label: 'START A GAME',
      desc:  'Set up and launch a new Lists game',
      color: 'hover:border-brand-red hover:shadow-[0_0_30px_rgba(230,57,70,0.15)]',
      badge: null,
    },
    {
      href:  '/host/admin',
      icon:  '⚙️',
      label: 'ADMIN',
      desc:  'Manage personalities, seasons & lists',
      color: 'hover:border-brand-amber hover:shadow-[0_0_30px_rgba(244,162,97,0.15)]',
      badge: null,
    },
  ]

  const statCards = [
    { label: 'Personalities', value: stats.personalities, icon: '👤' },
    { label: 'Trivia Lists',  value: stats.lists,         icon: '📋' },
    { label: 'Seasons',       value: stats.seasons,       icon: '📺' },
  ]

  return (
    <div className="min-h-screen bg-brand-bg">
      <NavBar />
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="mb-10">
          <h1 className="font-display text-6xl text-white tracking-wide">HOST DASHBOARD</h1>
          <p className="text-brand-muted mt-1">Welcome back. Ready to play?</p>
        </div>

        {/* Stat row */}
        <div className="grid grid-cols-3 gap-4 mb-10">
          {statCards.map(s => (
            <div key={s.label} className="bg-brand-panel border border-brand-border rounded-xl p-4 text-center">
              <div className="text-2xl mb-1">{s.icon}</div>
              <div className="font-display text-4xl text-white">{s.value}</div>
              <div className="text-brand-muted text-xs mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Action tiles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {tiles.map(t => (
            <Link key={t.href} href={t.href}
              className={`group bg-brand-panel border border-brand-border rounded-2xl p-7 transition-all duration-300 ${t.color}`}>
              <div className="text-4xl mb-4 group-hover:scale-110 transition-transform inline-block">{t.icon}</div>
              <div className="font-display text-4xl text-white tracking-wide mb-1">{t.label}</div>
              <div className="text-brand-muted text-sm">{t.desc}</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
