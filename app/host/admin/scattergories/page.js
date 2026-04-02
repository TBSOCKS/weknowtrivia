'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import NavBar from '@/components/NavBar'
import { supabase } from '@/lib/supabase'

function parseCSV(text) {
  return text.trim().split('\n').slice(1).map(line => {
    const parts = line.split(',').map(s => s.trim().replace(/^"|"$/g, ''))
    return parts
  }).filter(p => p.length >= 2 && p[0])
}

export default function ScatCategoriesPage() {
  const [shows, setShows]             = useState([])
  const [categories, setCategories]   = useState([])
  const [personalities, setPersonalities] = useState([])
  const [loading, setLoading]         = useState(true)

  // New category form
  const [selectedShow, setSelectedShow] = useState('')
  const [name, setName]               = useState('')
  const [type, setType]               = useState('career')
  const [csvText, setCsvText]         = useState('')
  const [preview, setPreview]         = useState([])
  const [importing, setImporting]     = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [error, setError]             = useState('')

  // Expanded category
  const [expanded, setExpanded]       = useState(null)
  const [entries, setEntries]         = useState({})

  useEffect(() => {
    async function load() {
      const [showRes, catRes, persRes] = await Promise.all([
        supabase.from('shows').select('*').order('name'),
        supabase.from('scat_categories').select('*').order('name'),
        supabase.from('personalities').select('id, name').order('name'),
      ])
      setShows(showRes.data ?? [])
      setCategories(catRes.data ?? [])
      setPersonalities(persRes.data ?? [])
      if (showRes.data?.length) setSelectedShow(showRes.data[0].id)
      setLoading(false)
    }
    load()
  }, [])

  // Parse CSV preview whenever text changes
  useEffect(() => {
    if (!csvText.trim()) { setPreview([]); return }
    const rows = parseCSV(csvText)
    setPreview(rows.slice(0, 5))
  }, [csvText])

  async function loadEntries(catId) {
    if (entries[catId]) return
    const { data } = await supabase.from('scat_entries').select('*').eq('category_id', catId).order('points', { ascending: false })
    setEntries(prev => ({ ...prev, [catId]: data ?? [] }))
  }

  async function handleImport() {
    if (!name.trim() || !selectedShow || !csvText.trim()) { setError('Fill in all fields'); return }
    setImporting(true); setError(''); setImportResult(null)

    const rows = parseCSV(csvText)
    if (rows.length === 0) { setError('No valid rows found in CSV'); setImporting(false); return }

    // For season type, build a castaway lookup keyed by "name_lower|season_number"
    let castawayLookup = {}
    if (type === 'season') {
      const { data: castawayData } = await supabase
        .from('castaways')
        .select('id, name, seasons(season_number)')
      ;(castawayData ?? []).forEach(c => {
        const sn = c.seasons?.season_number
        if (sn) {
          // Primary key: exact lowercase name
          const key = `${c.name.toLowerCase().trim()}|${sn}`
          castawayLookup[key] = c.id
        }
      })
    }

    // Create category
    const { data: cat, error: catErr } = await supabase.from('scat_categories').insert({
      show_id: selectedShow, name: name.trim(), type, entry_count: 0,
    }).select().single()
    if (catErr) { setError(catErr.message); setImporting(false); return }

    // Build entries
    const entryRows = []
    let matched = 0

    for (const row of rows) {
      if (type === 'career') {
        const [entryName, pts] = row
        const points = parseInt(pts) || 0
        const pers = personalities.find(p => p.name.toLowerCase() === entryName.toLowerCase().trim())
        entryRows.push({
          category_id:    cat.id,
          display_name:   entryName.trim(),
          personality_id: pers?.id ?? null,
          points,
        })
        if (pers) matched++
      } else {
        const [entryName, seasonNum, pts] = row
        const sNum   = parseInt(seasonNum) || 0
        const points = parseInt(pts) || 0

        // Try exact match first, then strip hyphens/punctuation as fallback
        const nameLower = entryName.toLowerCase().trim()
        let castawayId = castawayLookup[`${nameLower}|${sNum}`] ?? null
        if (!castawayId) {
          const normalized = nameLower.replace(/[-'.]/g, ' ').replace(/\s+/g, ' ').trim()
          const fallback = Object.entries(castawayLookup).find(([k]) => {
            const [kName, kSeason] = k.split('|')
            return parseInt(kSeason) === sNum &&
              kName.replace(/[-'.]/g, ' ').replace(/\s+/g, ' ').trim() === normalized
          })
          if (fallback) castawayId = fallback[1]
        }

        entryRows.push({
          category_id:   cat.id,
          display_name:  entryName.trim(),
          season_number: sNum,
          castaway_id:   castawayId,
          points,
        })
        if (castawayId) matched++
      }
    }

    const { error: entErr } = await supabase.from('scat_entries').insert(entryRows)
    if (entErr) { setError(entErr.message); setImporting(false); return }

    // Update entry_count
    await supabase.from('scat_categories').update({ entry_count: entryRows.length }).eq('id', cat.id)

    setImportResult({ total: entryRows.length, matched })
    setCategories(prev => [...prev, { ...cat, entry_count: entryRows.length }])
    setName(''); setCsvText(''); setPreview([])
    setImporting(false)
  }

  async function handleDelete(catId) {
    if (!confirm('Delete this category and all its entries?')) return
    await supabase.from('scat_categories').delete().eq('id', catId)
    setCategories(prev => prev.filter(c => c.id !== catId))
  }

  // ── BACKFILL ─────────────────────────────────────────────────────────────
  const [backfilling, setBackfilling]     = useState(false)
  const [backfillResult, setBackfillResult] = useState(null)

  async function handleBackfill() {
    setBackfilling(true)
    setBackfillResult(null)

    // Fetch all entries that have a season_number but no castaway_id
    // (season_number being set is what distinguishes season entries from career entries)
    const { data: missingEntries, error: fetchErr } = await supabase
      .from('scat_entries')
      .select('id, display_name, season_number')
      .is('castaway_id', null)
      .not('season_number', 'is', null)

    if (fetchErr) {
      setBackfillResult({ error: fetchErr.message })
      setBackfilling(false)
      return
    }

    const seasonEntries = missingEntries ?? []

    if (seasonEntries.length === 0) {
      setBackfillResult({ total: 0, matched: 0, castaways: 0 })
      setBackfilling(false)
      return
    }

    // Build castaway lookup keyed by "name_lower|season_number"
    const { data: castawayData, error: castErr } = await supabase
      .from('castaways')
      .select('id, name, seasons(season_number)')

    if (castErr) {
      setBackfillResult({ error: castErr.message })
      setBackfilling(false)
      return
    }

    const castawayLookup = {}
    ;(castawayData ?? []).forEach(c => {
      const sn = c.seasons?.season_number
      if (sn) {
        castawayLookup[`${c.name.toLowerCase().trim()}|${sn}`] = c.id
      }
    })

    // Match entries to castaways
    const updates = []
    const unmatched = []
    for (const entry of seasonEntries) {
      const nameLower = entry.display_name.toLowerCase().trim()
      const sn = entry.season_number

      let castawayId = castawayLookup[`${nameLower}|${sn}`] ?? null

      // Fuzzy fallback: strip hyphens, apostrophes, periods
      if (!castawayId) {
        const normalized = nameLower.replace(/[-'.]/g, ' ').replace(/\s+/g, ' ').trim()
        const fallback = Object.entries(castawayLookup).find(([k]) => {
          const [kName, kSeason] = k.split('|')
          return parseInt(kSeason) === sn &&
            kName.replace(/[-'.]/g, ' ').replace(/\s+/g, ' ').trim() === normalized
        })
        if (fallback) castawayId = fallback[1]
      }

      if (castawayId) {
        updates.push({ id: entry.id, castaway_id: castawayId })
      } else {
        unmatched.push(`${entry.display_name} (S${sn})`)
      }
    }

    // Batch update in groups of 50
    let updateErrors = 0
    for (const u of updates) {
      const { error } = await supabase
        .from('scat_entries')
        .update({ castaway_id: u.castaway_id })
        .eq('id', u.id)
      if (error) updateErrors++
    }

    setBackfillResult({
      total: seasonEntries.length,
      matched: updates.length - updateErrors,
      castaways: Object.keys(castawayLookup).length,
      unmatched: unmatched.slice(0, 10), // show first 10 unmatched for debugging
    })
    setBackfilling(false)
  }

  if (loading) return <div className="min-h-screen bg-brand-bg flex items-center justify-center text-brand-muted">Loading…</div>

  return (
    <div className="min-h-screen bg-brand-bg">
      <NavBar />
      <div className="max-w-5xl mx-auto px-4 py-10">
        <Link href="/host/admin" className="text-brand-muted hover:text-white text-sm mb-6 inline-flex items-center gap-1 transition-colors">← Admin</Link>
        <h1 className="font-display text-5xl text-white tracking-wide mb-8">SCATTERGORIES CATEGORIES</h1>

        {/* Backfill card */}
        <div className="bg-brand-panel border border-brand-border rounded-2xl p-5 mb-6 flex items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-xl text-white tracking-wide">BACKFILL CASTAWAY PHOTOS</h2>
            <p className="text-brand-muted text-xs mt-0.5">
              Links existing season entries to castaway records so photos show in-game.
              Safe to run multiple times.
            </p>
            {backfillResult && (
              <div className="mt-2 text-xs space-y-0.5">
                {backfillResult.error ? (
                  <p className="text-brand-red">Error: {backfillResult.error}</p>
                ) : backfillResult.total === 0 ? (
                  <p className="text-brand-muted">All entries already linked — nothing to do.</p>
                ) : (
                  <>
                    <p className={backfillResult.matched > 0 ? 'text-brand-green' : 'text-brand-red'}>
                      ✓ Matched {backfillResult.matched} of {backfillResult.total} entries
                      {backfillResult.castaways != null && ` · ${backfillResult.castaways} castaways in DB`}
                    </p>
                    {backfillResult.unmatched?.length > 0 && (
                      <p className="text-brand-muted">
                        Unmatched: {backfillResult.unmatched.join(', ')}
                        {backfillResult.total - backfillResult.matched > 10 ? ` +${backfillResult.total - backfillResult.matched - 10} more` : ''}
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
          <button
            onClick={handleBackfill}
            disabled={backfilling}
            className="flex-shrink-0 bg-brand-amber hover:bg-amber-400 disabled:opacity-50 text-black font-display text-lg tracking-widest px-5 py-2.5 rounded-xl transition-colors">
            {backfilling ? 'RUNNING…' : 'RUN BACKFILL'}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: existing categories */}
          <div>
            <h2 className="font-display text-2xl text-white tracking-wide mb-4">EXISTING CATEGORIES</h2>
            {categories.length === 0 ? (
              <p className="text-brand-muted text-sm">No categories yet. Import one →</p>
            ) : (
              <div className="flex flex-col gap-2">
                {categories.map(cat => {
                  const show = shows.find(s => s.id === cat.show_id)
                  return (
                    <div key={cat.id} className="bg-brand-panel border border-brand-border rounded-xl overflow-hidden">
                      <div className="flex items-center gap-3 px-4 py-3">
                        <div className="flex-1">
                          <div className="text-white font-medium text-sm">{cat.name}</div>
                          <div className="text-brand-muted text-xs mt-0.5">
                            {show?.name} · {cat.type === 'career' ? 'Career' : 'Season-specific'} · {cat.entry_count} entries
                          </div>
                        </div>
                        <button onClick={() => {
                          if (expanded === cat.id) { setExpanded(null) }
                          else { setExpanded(cat.id); loadEntries(cat.id) }
                        }} className="text-brand-muted hover:text-white text-xs transition-colors">
                          {expanded === cat.id ? '▲ Hide' : '▼ Show'}
                        </button>
                        <button onClick={() => handleDelete(cat.id)} className="text-brand-red/50 hover:text-brand-red text-xs transition-colors ml-2">✕</button>
                      </div>
                      {expanded === cat.id && entries[cat.id] && (
                        <div className="border-t border-brand-border px-4 py-2 max-h-48 overflow-y-auto">
                          {entries[cat.id].slice(0, 20).map(e => (
                            <div key={e.id} className="flex justify-between text-xs py-1 border-b border-brand-border/30 last:border-0">
                              <span className="text-white">{e.display_name}{e.season_number ? ` (S${e.season_number})` : ''}</span>
                              <span className="text-brand-amber font-display">{e.points}</span>
                            </div>
                          ))}
                          {entries[cat.id].length > 20 && (
                            <p className="text-brand-muted text-xs mt-1">+{entries[cat.id].length - 20} more</p>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Right: import new */}
          <div>
            <h2 className="font-display text-2xl text-white tracking-wide mb-4">IMPORT NEW CATEGORY</h2>
            <div className="bg-brand-panel border border-brand-border rounded-2xl p-5 flex flex-col gap-4">

              <div>
                <label className="text-brand-muted text-xs uppercase tracking-widest block mb-1.5">Show</label>
                <select value={selectedShow} onChange={e => setSelectedShow(e.target.value)}
                  className="w-full bg-brand-card border border-brand-border rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-brand-amber">
                  {shows.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              <div>
                <label className="text-brand-muted text-xs uppercase tracking-widest block mb-1.5">Category Name</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Days Played All-Time"
                  className="w-full bg-brand-card border border-brand-border rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-brand-amber placeholder-brand-muted" />
              </div>

              <div>
                <label className="text-brand-muted text-xs uppercase tracking-widest block mb-1.5">Type</label>
                <div className="flex gap-2">
                  {[{v:'career',l:'Career'},{v:'season',l:'Season-Specific'}].map(opt => (
                    <button key={opt.v} onClick={() => setType(opt.v)}
                      className={`flex-1 py-2 rounded-xl border text-sm transition-all ${type===opt.v ? 'border-brand-amber bg-brand-amber/10 text-white' : 'border-brand-border text-brand-muted hover:text-white'}`}>
                      {opt.l}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-brand-muted text-xs uppercase tracking-widest block mb-1.5">
                  CSV {type === 'career' ? '(Name, Points)' : '(Name, Season#, Points)'}
                </label>
                <div className="text-brand-muted text-xs mb-1.5">
                  First row = header (will be skipped). {type === 'career'
                    ? 'e.g. Name,Points / Boston Rob,117'
                    : 'e.g. Name,Season,Points / Ozzy Lusth,13,39'}
                </div>
                <textarea value={csvText} onChange={e => setCsvText(e.target.value)} rows={6}
                  placeholder={type === 'career' ? 'Name,Points\nBoston Rob,117\nRupert Boneham,108' : 'Name,Season,Points\nOzzy Lusth,13,39\nOzzy Lusth,23,36'}
                  className="w-full bg-brand-card border border-brand-border rounded-xl px-3 py-2.5 text-white text-xs font-mono focus:outline-none focus:border-brand-amber placeholder-brand-muted resize-none" />
              </div>

              {preview.length > 0 && (
                <div className="bg-brand-bg rounded-xl p-3 border border-brand-border/50">
                  <p className="text-brand-muted text-xs uppercase tracking-widest mb-2">Preview (first 5 rows)</p>
                  {preview.map((row, i) => (
                    <div key={i} className="text-xs text-white py-0.5">
                      {type === 'career'
                        ? <><span className="text-brand-muted mr-2">{i+1}.</span>{row[0]} <span className="text-brand-amber ml-2">{row[1]} pts</span></>
                        : <><span className="text-brand-muted mr-2">{i+1}.</span>{row[0]} <span className="text-brand-muted mx-1">S{row[1]}</span> <span className="text-brand-amber ml-2">{row[2]} pts</span></>
                      }
                    </div>
                  ))}
                </div>
              )}

              {error && <p className="text-brand-red text-sm">{error}</p>}
              {importResult && (
                <div className="bg-brand-green/10 border border-brand-green/30 rounded-xl p-3 text-sm text-brand-green">
                  ✓ Imported {importResult.total} entries · {importResult.matched} photo matches found
                </div>
              )}

              <button onClick={handleImport} disabled={importing || !name.trim() || !csvText.trim()}
                className="w-full bg-brand-red hover:bg-red-600 disabled:opacity-50 text-white font-display text-2xl tracking-widest py-3 rounded-xl transition-colors">
                {importing ? 'IMPORTING…' : 'IMPORT'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}