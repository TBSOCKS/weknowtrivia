'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

export default function CastawaySearch({ onSelect, placeholder = 'Search castaway…', disabled = false }) {
  const [query, setQuery]       = useState('')
  const [results, setResults]   = useState([])
  const [open, setOpen]         = useState(false)
  const [loading, setLoading]   = useState(false)
  const containerRef            = useRef(null)

  useEffect(() => {
    function onClick(e) {
      if (!containerRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  useEffect(() => {
    if (query.length < 2) { setResults([]); setOpen(false); return }
    const t = setTimeout(async () => {
      setLoading(true)
      const { data } = await supabase
        .from('castaways')
        .select('id, name, castaway_id, seasons(name, version_season)')
        .ilike('name', `%${query}%`)
        .limit(20)
      setResults(data ?? [])
      setOpen(true)
      setLoading(false)
    }, 200)
    return () => clearTimeout(t)
  }, [query])

  function select(castaway) {
    onSelect(castaway)
    setQuery('')
    setResults([])
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          disabled={disabled}
          placeholder={placeholder}
          className="w-full bg-brand-card border border-brand-border rounded-xl px-4 py-3 text-white placeholder-brand-muted focus:outline-none focus:border-brand-amber transition-colors disabled:opacity-50"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-muted text-sm">…</div>
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-brand-panel border border-brand-border rounded-xl shadow-2xl search-dropdown animate-slide-up">
          {results.map(c => (
            <button
              key={c.id}
              onMouseDown={() => select(c)}
              className="w-full text-left px-4 py-2.5 hover:bg-brand-card flex items-center gap-3 border-b border-brand-border/30 last:border-0 transition-colors"
            >
              <img
                src={`https://gradientdescending.com/survivor/castaways/colour/${c.seasons?.version_season}${c.castaway_id}.png`}
                alt={c.name}
                className="w-8 h-8 rounded-full object-cover bg-brand-card flex-shrink-0"
                onError={e => { e.target.style.display = 'none' }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-white text-sm">{c.name}</div>
                <div className="text-brand-muted text-xs">{c.seasons?.name}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
