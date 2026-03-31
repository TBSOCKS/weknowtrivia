'use client'
import { useState } from 'react'
import Link from 'next/link'
import NavBar from '@/components/NavBar'
import { supabase } from '@/lib/supabase'

// Parse CSV text into array of objects
function parseCSV(text) {
  const lines = text.trim().split('\n')
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
  return lines.slice(1).map(line => {
    // Handle quoted commas
    const values = []
    let current = ''
    let inQuotes = false
    for (const char of line) {
      if (char === '"') { inQuotes = !inQuotes }
      else if (char === ',' && !inQuotes) { values.push(current.trim()); current = '' }
      else { current += char }
    }
    values.push(current.trim())
    const obj = {}
    headers.forEach((h, i) => { obj[h] = values[i] ?? '' })
    return obj
  })
}

// Season name map (season number → human name)
const SEASON_NAMES = {
  1:'Borneo',2:'Australian Outback',3:'Africa',4:'Marquesas',5:'Thailand',
  6:'Amazon',7:'Pearl Islands',8:'All-Stars',9:'Vanuatu',10:'Palau',
  11:'Guatemala',12:'Panama',13:'Cook Islands',14:'Fiji',15:'China',
  16:'Micronesia',17:'Gabon',18:'Tocantins',19:'Samoa',20:'Heroes vs. Villains',
  21:'Nicaragua',22:'Redemption Island',23:'South Pacific',24:'One World',
  25:'Philippines',26:'Caramoan',27:'Blood vs. Water',28:'Cagayan',
  29:'San Juan del Sur',30:'Worlds Apart',31:'Cambodia',32:'Kaôh Rōng',
  33:'Millennials vs. Gen X',34:'Game Changers',35:'Heroes vs. Healers vs. Hustlers',
  36:'Ghost Island',37:'David vs. Goliath',38:'Edge of Extinction',
  39:'Island of the Idols',40:'Winners at War',41:'Season 41',42:'Season 42',
  43:'Season 43',44:'Season 44',45:'Season 45',46:'Season 46',47:'Season 47',48:'Season 48',
}

export default function ImportPage() {
  const [step, setStep]           = useState('upload') // upload | preview | importing | done
  const [rows, setRows]           = useState([])
  const [stats, setStats]         = useState(null)
  const [progress, setProgress]   = useState('')
  const [errors, setErrors]       = useState([])
  const [showId, setShowId]       = useState(null)

  async function getOrCreateSurvivorShow() {
    const { data } = await supabase.from('shows').select('id').eq('slug', 'survivor').single()
    if (data) return data.id
    const { data: created } = await supabase.from('shows').insert({ name: 'Survivor', slug: 'survivor' }).select('id').single()
    return created.id
  }

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target.result
      const parsed = parseCSV(text)
      // Filter US only
      const us = parsed.filter(r => r.version === 'US' || r.version_season?.startsWith('US'))
      setRows(us)

      // Build preview stats
      const seasons = new Set(us.map(r => r.version_season))
      setStats({ total: us.length, seasons: seasons.size })
      setStep('preview')
    }
    reader.readAsText(file)
  }

  async function handleImport() {
    setStep('importing')
    setErrors([])
    const errs = []

    try {
      // Get/create Survivor show
      setProgress('Finding Survivor show…')
      const survivorShowId = await getOrCreateSurvivorShow()
      setShowId(survivorShowId)

      // Group rows by version_season
      const bySeason = {}
      rows.forEach(r => {
        const vs = r.version_season
        if (!vs) return
        if (!bySeason[vs]) bySeason[vs] = []
        bySeason[vs].push(r)
      })

      const seasonIds = {}
      const vsList = Object.keys(bySeason).sort()

      // Upsert seasons
      setProgress(`Importing ${vsList.length} seasons…`)
      for (const vs of vsList) {
        const seasonRows = bySeason[vs]
        const seasonNum = parseInt(vs.replace('US', ''))
        if (isNaN(seasonNum)) continue

        const name = SEASON_NAMES[seasonNum] ?? `Season ${seasonNum}`

        // Check if season already exists
        const { data: existing } = await supabase
          .from('seasons')
          .select('id')
          .eq('show_id', survivorShowId)
          .eq('season_number', seasonNum)
          .single()

        let seasonId
        if (existing) {
          seasonId = existing.id
        } else {
          const { data: created, error } = await supabase
            .from('seasons')
            .insert({ show_id: survivorShowId, name, season_number: seasonNum, version_season: vs })
            .select('id')
            .single()
          if (error) { errs.push(`Season ${vs}: ${error.message}`); continue }
          seasonId = created.id
        }
        seasonIds[vs] = seasonId
      }

      // Upsert castaways
      let totalCastaways = 0
      for (const vs of vsList) {
        const seasonId = seasonIds[vs]
        if (!seasonId) continue
        const seasonRows = bySeason[vs]
        setProgress(`Importing castaways for ${vs} (${seasonRows.length} players)…`)

        // The castaway_id in survivoR is like "US0001"
        // We extract just the 4-digit numeric part
        const castawayRows = seasonRows.map(r => {
          const fullId = r.castaway_id ?? ''
          // Extract numeric part: US0001 → 0001
          const numPart = fullId.replace(/^[A-Z]+/, '')
          const place = parseInt(r.place) || 0
          const name = r.castaway ?? r.full_name ?? ''
          return { season_id: seasonId, name, castaway_id: numPart, placement: place }
        }).filter(r => r.name && r.castaway_id && r.placement > 0)

        if (castawayRows.length === 0) continue

        // Delete existing castaways for this season and re-insert
        await supabase.from('castaways').delete().eq('season_id', seasonId)

        const { error } = await supabase.from('castaways').insert(castawayRows)
        if (error) errs.push(`Castaways ${vs}: ${error.message}`)
        else totalCastaways += castawayRows.length
      }

      setErrors(errs)
      setProgress(`Done! Imported ${vsList.length} seasons and ${totalCastaways} castaways.`)
      setStep('done')
    } catch (err) {
      errs.push(`Unexpected error: ${err.message}`)
      setErrors(errs)
      setStep('done')
    }
  }

  return (
    <div className="min-h-screen bg-brand-bg">
      <NavBar />
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="mb-8">
          <Link href="/host/admin" className="text-brand-muted hover:text-white text-sm mb-2 inline-flex items-center gap-1 transition-colors">
            ← Admin
          </Link>
          <h1 className="font-display text-5xl text-white tracking-wide">IMPORT CASTAWAYS</h1>
          <p className="text-brand-muted mt-1">Bulk import all Survivor seasons and castaways from the survivoR dataset</p>
        </div>

        {/* Instructions */}
        <div className="bg-brand-panel border border-brand-amber/40 rounded-2xl p-6 mb-6">
          <h2 className="font-display text-2xl text-brand-amber tracking-wide mb-3">HOW TO GET THE DATA</h2>
          <ol className="text-sm text-brand-muted space-y-3">
            <li className="flex gap-3">
              <span className="text-brand-amber font-display text-lg w-6 flex-shrink-0">1.</span>
              <span>
                Go to the{' '}
                <a
                  href="https://docs.google.com/spreadsheets/d/1Xhod9FdVFr69hrX7No40WZAz0ZmhO_5x6WghxawuSno/edit"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-amber underline"
                >
                  survivoR Google Sheet ↗
                </a>
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-brand-amber font-display text-lg w-6 flex-shrink-0">2.</span>
              <span>Click the <strong className="text-white">Castaways</strong> tab at the bottom of the sheet</span>
            </li>
            <li className="flex gap-3">
              <span className="text-brand-amber font-display text-lg w-6 flex-shrink-0">3.</span>
              <span>Go to <strong className="text-white">File → Download → Comma-separated values (.csv)</strong></span>
            </li>
            <li className="flex gap-3">
              <span className="text-brand-amber font-display text-lg w-6 flex-shrink-0">4.</span>
              <span>Upload that CSV file below. The importer will handle everything automatically.</span>
            </li>
          </ol>
          <div className="mt-4 bg-brand-bg rounded-xl p-3 text-xs text-brand-muted font-mono">
            Required columns: <span className="text-white">version, version_season, castaway_id, castaway, place</span>
          </div>
        </div>

        {/* Upload step */}
        {step === 'upload' && (
          <div className="bg-brand-panel border border-brand-border rounded-2xl p-8 text-center animate-fade-in">
            <div className="text-5xl mb-4">📂</div>
            <h2 className="font-display text-3xl text-white tracking-wide mb-2">UPLOAD CSV</h2>
            <p className="text-brand-muted text-sm mb-6">Select the castaways.csv file you downloaded</p>
            <label className="cursor-pointer inline-block bg-brand-amber hover:bg-amber-500 text-brand-bg font-display text-2xl tracking-widest px-8 py-3 rounded-xl transition-colors">
              CHOOSE FILE
              <input type="file" accept=".csv" onChange={handleFile} className="hidden" />
            </label>
          </div>
        )}

        {/* Preview step */}
        {step === 'preview' && stats && (
          <div className="bg-brand-panel border border-brand-border rounded-2xl p-6 animate-slide-up">
            <h2 className="font-display text-3xl text-white tracking-wide mb-4">READY TO IMPORT</h2>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-brand-card rounded-xl p-4 text-center">
                <div className="font-display text-5xl text-brand-green">{stats.seasons}</div>
                <div className="text-brand-muted text-xs mt-1 uppercase tracking-widest">US Seasons</div>
              </div>
              <div className="bg-brand-card rounded-xl p-4 text-center">
                <div className="font-display text-5xl text-brand-amber">{stats.total}</div>
                <div className="text-brand-muted text-xs mt-1 uppercase tracking-widest">Castaway Rows</div>
              </div>
            </div>

            <div className="bg-brand-bg rounded-xl p-4 mb-6">
              <p className="text-brand-muted text-xs uppercase tracking-widest mb-2">Sample rows (first 5)</p>
              <div className="overflow-x-auto text-xs font-mono">
                <table className="w-full">
                  <thead>
                    <tr className="text-brand-muted border-b border-brand-border">
                      <th className="text-left pb-1 pr-4">version_season</th>
                      <th className="text-left pb-1 pr-4">castaway_id</th>
                      <th className="text-left pb-1 pr-4">castaway</th>
                      <th className="text-left pb-1">place</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 5).map((r, i) => (
                      <tr key={i} className="text-white border-b border-brand-border/30">
                        <td className="py-1 pr-4">{r.version_season}</td>
                        <td className="py-1 pr-4">{r.castaway_id}</td>
                        <td className="py-1 pr-4">{r.castaway}</td>
                        <td className="py-1">{r.place}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-brand-red/10 border border-brand-red/30 rounded-xl p-3 mb-6 text-xs text-brand-muted">
              ⚠️ This will <strong className="text-white">replace all castaways</strong> for any season that already exists in the database.
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleImport}
                className="flex-1 bg-brand-green hover:bg-green-500 text-white font-display text-2xl tracking-widest py-3 rounded-xl transition-colors"
              >
                IMPORT NOW
              </button>
              <button
                onClick={() => { setStep('upload'); setRows([]); setStats(null) }}
                className="bg-brand-panel border border-brand-border text-brand-muted hover:text-white font-display text-xl tracking-widest px-6 py-3 rounded-xl transition-colors"
              >
                CANCEL
              </button>
            </div>
          </div>
        )}

        {/* Importing step */}
        {step === 'importing' && (
          <div className="bg-brand-panel border border-brand-border rounded-2xl p-8 text-center animate-fade-in">
            <div className="text-5xl mb-4 animate-pulse">⚙️</div>
            <h2 className="font-display text-3xl text-white tracking-wide mb-3">IMPORTING…</h2>
            <p className="text-brand-muted text-sm">{progress}</p>
          </div>
        )}

        {/* Done step */}
        {step === 'done' && (
          <div className="bg-brand-panel border border-brand-border rounded-2xl p-8 animate-slide-up">
            <div className="text-5xl mb-4 text-center">{errors.length === 0 ? '✅' : '⚠️'}</div>
            <h2 className="font-display text-3xl text-white tracking-wide mb-2 text-center">
              {errors.length === 0 ? 'IMPORT COMPLETE!' : 'DONE WITH WARNINGS'}
            </h2>
            <p className="text-brand-muted text-sm text-center mb-6">{progress}</p>

            {errors.length > 0 && (
              <div className="bg-brand-red/10 border border-brand-red/30 rounded-xl p-4 mb-6">
                <p className="text-brand-red text-xs font-display tracking-wide mb-2">ERRORS ({errors.length})</p>
                {errors.map((e, i) => <p key={i} className="text-brand-muted text-xs">{e}</p>)}
              </div>
            )}

            <div className="flex gap-3">
              <Link href="/host/admin/seasons"
                    className="flex-1 bg-brand-amber hover:bg-amber-500 text-brand-bg font-display text-2xl tracking-widest py-3 rounded-xl transition-colors text-center">
                VIEW SEASONS
              </Link>
              <Link href="/host/admin/lists"
                    className="flex-1 bg-brand-panel border border-brand-border text-white font-display text-2xl tracking-widest py-3 rounded-xl hover:border-white/30 transition-colors text-center">
                CREATE LISTS
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
