'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

export default function ScatAnswerSearch({
  categoryId,
  categoryType,   // 'career' | 'season'
  seasonMin = 1,
  seasonMax = 50,
  onSelect,
  excluded = [],  // entry IDs already selected by this player
  placeholder = 'Search…',
  disabled = false,
}) {
  const [query, setQuery]     = useState('')
  const [all, setAll]         = useState([])
  const [results, setResults] = useState([])
  const [open, setOpen]       = useState(false)
  const [focused, setFocused] = useState(false)
  const [loading, setLoading] = useState(true)
  const containerRef          = useRef(null)

  useEffect(() => {
    if (!categoryId) return
    async function loadEntries() {
      setLoading(true)
      let q = supabase
        .from('scat_entries')
        .select('*, personalities(id, name, photo_url), castaways(id, castaway_id, name, seasons(id, name, version_season))')
        .eq('category_id', categoryId)
        .order('display_name')

      if (categoryType === 'season') {
        q = q.gte('season_number', seasonMin).lte('season_number', seasonMax)
      }

      const { data } = await q
      setAll(data ?? [])
      setLoading(false)
    }
    loadEntries()
  }, [categoryId, categoryType, seasonMin, seasonMax])

  useEffect(() => {
    function onClickOut(e) {
      if (!containerRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOut)
    return () => document.removeEventListener('mousedown', onClickOut)
  }, [])

  useEffect(() => {
    const q = query.toLowerCase()
    const filtered = all.filter(e =>
      !excluded.includes(e.id) &&
      (q === '' || e.display_name.toLowerCase().includes(q))
    )
    setResults(filtered.slice(0, 12))
    if (focused) setOpen(filtered.length > 0)
  }, [query, all, excluded, focused])

  function select(entry) {
    onSelect(entry)
    setQuery('')
    setOpen(false)
    setFocused(false)
  }

  function getPhoto(entry) {
    if (categoryType === 'career' && entry.personalities?.photo_url) {
      return entry.personalities.photo_url
    }
    if (categoryType === 'season' && entry.castaways) {
      const c = entry.castaways
      const vs = c.seasons?.version_season
      if (vs && c.castaway_id) {
        return `https://gradientdescending.com/survivor/castaways/colour/${vs}US${c.castaway_id}.png`
      }
    }
    return null
  }

  function getSubtitle(entry) {
    if (categoryType === 'season') {
      return entry.castaways?.seasons?.name ?? (entry.season_number ? `Season ${entry.season_number}` : '')
    }
    return null
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        onFocus={() => { setFocused(true); setOpen(results.length > 0) }}
        placeholder={loading ? 'Loading…' : placeholder}
        disabled={disabled || loading}
        className="w-full bg-brand-card border border-brand-border rounded-xl px-3 py-2.5 text-white placeholder-brand-muted focus:outline-none focus:border-brand-amber transition-colors disabled:opacity-50 text-sm"
      />
      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-brand-panel border border-brand-border rounded-xl shadow-2xl overflow-hidden max-h-52 overflow-y-auto">
          {results.map(entry => {
            const photo    = getPhoto(entry)
            const subtitle = getSubtitle(entry)
            return (
              <button key={entry.id} onMouseDown={() => select(entry)}
                className="w-full text-left px-3 py-2 hover:bg-brand-card flex items-center gap-2.5 border-b border-brand-border/30 last:border-0 transition-colors">
                <div className="w-8 h-8 rounded-full overflow-hidden bg-brand-card border border-brand-border flex-shrink-0">
                  {photo
                    ? <img src={photo} alt={entry.display_name} className="w-full h-full object-cover" onError={e => { e.target.style.display='none' }} />
                    : <div className="w-full h-full flex items-center justify-center text-brand-muted font-display text-xs">{entry.display_name[0]}</div>
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-white text-sm truncate">{entry.display_name}</div>
                  {subtitle && <div className="text-brand-muted text-xs">{subtitle}</div>}
                </div>
                <span className="text-brand-amber font-display text-sm flex-shrink-0">{entry.points}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
