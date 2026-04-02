'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

export default function PersonalitySearch({ onSelect, placeholder = 'Search personalities…', excluded = [] }) {
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState([])
  const [all, setAll]         = useState([])
  const [open, setOpen]       = useState(false)
  const [focused, setFocused] = useState(false)
  const containerRef          = useRef(null)

  // Load all active personalities once
  useEffect(() => {
    supabase.from('personalities').select('*').eq('active', true).order('name')
      .then(({ data }) => setAll(data ?? []))
  }, [])

  // Filter on query — only open if user has focused the input
  useEffect(() => {
    const q = query.trim().toLowerCase()
    const filtered = all.filter(p =>
      !excluded.includes(p.id) &&
      (q === '' || p.name.toLowerCase().includes(q))
    )
    const sliced = filtered.slice(0, 10)
    setResults(sliced)
    if (focused) setOpen(sliced.length > 0)
  }, [query, all, excluded, focused])

  useEffect(() => {
    function onClick(e) {
      if (!containerRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  function select(p) {
    onSelect(p)
    setQuery('')
    setOpen(false)
    setFocused(false)
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        onFocus={() => setFocused(true)}
        placeholder={placeholder}
        className="w-full bg-brand-card border border-brand-border rounded-xl px-4 py-3 text-white placeholder-brand-muted focus:outline-none focus:border-brand-red transition-colors"
      />

      {open && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-brand-panel border border-brand-border rounded-xl shadow-2xl overflow-hidden animate-slide-up">
          {results.map(p => (
            <button
              key={p.id}
              onMouseDown={() => select(p)}
              className="w-full text-left px-4 py-2.5 hover:bg-brand-card flex items-center gap-3 border-b border-brand-border/30 last:border-0 transition-colors"
            >
              <div className="w-8 h-8 rounded-full overflow-hidden bg-brand-card border border-brand-border flex-shrink-0">
                {p.photo_url
                  ? <img src={p.photo_url} alt={p.name} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-brand-muted font-display text-sm">{p.name[0]}</div>
                }
              </div>
              <span className="text-white text-sm">{p.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
