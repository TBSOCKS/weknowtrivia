'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

export default function CastawaySearch({
  onSelect,
  placeholder = 'Search…',
  disabled = false,
  showSlug = 'survivor',
  seasonIds = null,  // array of season UUIDs to restrict results to
}) {
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen]       = useState(false)
  const [loading, setLoading] = useState(false)
  const containerRef          = useRef(null)

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
      let q = supabase
        .from('castaways')
        .select('id, name, castaway_id, placement, photo_url, seasons(id, name, version_season)')
        .ilike('name', `%${query}%`)
        .limit(20)

      // Filter by season IDs directly — reliable, no join syntax needed
      if (seasonIds && seasonIds.length > 0) {
        q = q.in('season_id', seasonIds)
      }

      const { data } = await q
      setResults(data ?? [])
      setOpen(true)
      setLoading(false)
    }, 200)
    return () => clearTimeout(t)
  }, [query, seasonIds])

  function getPhoto(c) {
    if (showSlug === 'survivor') {
      return `https://gradientdescending.com/survivor/castaways/colour/${c.seasons?.version_season}US${c.castaway_id}.png`
    }
    return c.photo_url ?? null
  }

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
          {results.map(c => {
            const photo = getPhoto(c)
            return (
              <button
                key={c.id}
                onMouseDown={() => select(c)}
                className="w-full text-left px-4 py-2.5 hover:bg-brand-card flex items-center gap-3 border-b border-brand-border/30 last:border-0 transition-colors"
              >
                <div className="w-8 h-8 rounded-full overflow-hidden bg-brand-card border border-brand-border flex-shrink-0">
                  {photo
                    ? <img src={photo} alt={c.name} className="w-full h-full object-cover" onError={e => { e.target.style.display = 'none' }} />
                    : <div className="w-full h-full flex items-center justify-center text-brand-muted font-display text-xs">{c.name[0]}</div>
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-white text-sm">{c.name}</div>
                  <div className="text-brand-muted text-xs">{c.seasons?.name}</div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}