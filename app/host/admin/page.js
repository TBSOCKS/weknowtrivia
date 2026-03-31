'use client'
import { useState } from 'react'
import Link from 'next/link'
import NavBar from '@/components/NavBar'
import { supabase } from '@/lib/supabase'

function parseCSV(text) {
  const lines = text.trim().split('\n')
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
  return lines.slice(1).filter(l => l.trim()).map(line => {
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
    headers.forEach((h, i) => { obj[h] = (values[i] ?? '').replace(/^"|"$/g, '') })
    return obj
  })
}

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
  43:'Season 43',44:'Season 44',45:'Season 45',46:'Season 46',47:'Season 47',
  48:'Season 48',49:'Season 49',50:'Season 50',
}

export default function ImportPage() {
  const [step, setStep]         = useState('upload')
  const [rows, setRows]         = useState([])
  const [stats, setStats]       = useState(null)
  const [progress, setProgress] = useState('')
  const [errors, setErrors]     = useState([])

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const parsed = parseCSV(ev.target.result)

      // Validate columns
      const first = parsed[0] ?? {}
      const hasCastaway  = 'Castaway'  in first
      const hasSeason    = 'Season'    in first
      const hasID        = 'ID'        in first
      const hasPlacement = 'Placement' in first

      if (!hasCastaway || !hasSeason || !hasID || !hasPlacement) {
        alert(`CSV is missing required columns.\n\nFound: ${Object.keys(first).join(', ')}\n\nRequired: Castaway, Season, ID, Placement`)
        return
      }

      const seasons = new Set(parsed.map(r => r.Season))
      setRows(parsed)
      setStats({ total: parsed.length, seasons: seasons.size })
      setStep('preview')
    }
    reader.readAsText(file)
    // reset so same file can be re-uploaded
    e.target.value = ''
  }

  async function handleImport() {
    setStep('importing')
    setErrors([])
    const errs = []

    try {
      // Get Survivor show id
      setProgress('Finding Survivor show…')
      const { data: showData } = await supabase
        .from('shows').select('id').eq('slug', 'survivor').single()

      let survivorShowId = showData?.id
      if (!survivorShowId) {
        const { data: created } = await supabase
          .from('shows')
          .insert({ name: 'Survivor', slug: 'survivor' })
          .select('id').single()
        survivorShowId = created?.id
      }
      if (!survivorShowId) { errs.push('Could not find or create Survivor show.'); setErrors(errs); setStep('done'); return }

      // Group rows by season number
      const bySeason = {}
      rows.forEach(r => {
        const s = String(r.Season).trim()
        if (!s) return
        if (!bySeason[s]) bySeason[s] = []
        bySeason[s].push(r)
      })

      const seasonNums = Object.keys(bySeason).sort((a, b) => parseInt(a) - parseInt(b))
      let totalCastaways = 0

      for (const seasonNum of seasonNums) {
        const seasonInt = parseInt(seasonNum)
        const name = SEASON_NAMES[seasonInt] ?? `Season ${seasonNum}`
        const version_season = `US${String(seasonInt).padStart(2, '0')}`

        setProgress(`Importing Season ${seasonNum}: ${name}…`)

        // Upsert season
        let seasonId
        const { data: existing } = await supabase
          .from('seasons')
          .select('id')
          .eq('show_id', survivorShowId)
          .eq('season_number', seasonInt)
          .single()

        if (existing) {
          seasonId = existing.id
        } else {
          const { data: created, error } = await supabase
            .from('seasons')
            .insert({ show_id: survivorShowId, name, season_number: seasonInt, version_season })
            .select('id').single()
          if (error) { errs.push(`Season ${seasonNum}: ${error.message}`); continue }
          seasonId = created.id
        }

        // Delete existing castaways and re-insert
        await supabase.from('castaways').delete().eq('season_id', seasonId)

        const castawayRows = bySeason[seasonNum].map(r => {
          // ID in CSV is like "US0001" — strip the "US" prefix to get 4-digit part
          const rawId   = String(r.ID ?? '').trim()
          const numPart = rawId.replace(/^[A-Za-z]+/, '').padStart(4, '0')
          return {
            season_id:   seasonId,
            name:        String(r.Castaway ?? '').trim(),
            castaway_id: numPart,
            placement:   parseInt(r.Placement) || 0,
          }
        }).filter(r => r.name && r.castaway_id && r.placement > 0)

        if (castawayRows.length === 0) continue

        const { error } = await supabase.from('castaways').insert(castawayRows)
        if (error) errs.push(`Castaways S${seasonNum}: ${error.message}`)
        else totalCastaways += castawayRows.length
      }

      setErrors(errs)
      setProgress(`Done! Imported ${seasonNums.length} seasons and ${totalCastaways} castaways.`)
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
          <p className="text-brand-muted mt-1">Bulk import all Survivor seasons and castaways from a CSV</p>
        </div>

        {/* Format guide */}
        <div className="bg-brand-panel border border-brand-amber/40 rounded-2xl p-6 mb-6">
          <h2 className="font-display text-2xl text-brand-amber tracking-wide mb-3">REQUIRED CSV FORMAT</h2>
          <p className="text-brand-muted text-sm mb-3">Your CSV must have exactly these four column headers in row 1:</p>
          <div className="bg-brand-bg rounded-xl p-4 font-mono text-sm mb-3">
            <div className="text-brand-amber">Castaway,Season,ID,Placement</div>
            <div className="text-brand-muted">Sonja Christopher,1,US0001,16</div>
            <div className="text-brand-muted">B.B. Andersen,1,US0002,15</div>
            <div className="text-brand-muted">Richard Hatch,1,US0016,1</div>
            <div className="text-brand-muted">…</div>
          </div>
          <ul className="text-brand-muted text-xs space-y-1">
            <li>• <strong className="text-white">Castaway</strong> — player name</li>
            <li>• <strong className="text-white">Season</strong> — season number (1, 2, 3…)</li>
            <li>• <strong className="text-white">ID</strong> — castaway ID from the photo URL (e.g. US0001)</li>
            <li>• <strong className="text-white">Placement</strong> — finish position (1 = winner)</li>
          </ul>
        </div>

        {/* Upload */}
        {step === 'upload' && (
          <div className="bg-brand-panel border border-brand-border rounded-2xl p-8 text-center animate-fade-in">
            <div className="text-5xl mb-4">📂</div>
            <h2 className="font-display text-3xl text-white tracking-wide mb-2">UPLOAD CSV</h2>
            <p className="text-brand-muted text-sm mb-6">Select your castaways CSV file</p>
            <label className="cursor-pointer inline-block bg-brand-amber hover:bg-amber-500 text-brand-bg font-display text-2xl tracking-widest px-8 py-3 rounded-xl transition-colors">
              CHOOSE FILE
              <input type="file" accept=".csv" onChange={handleFile} className="hidden" />
            </label>
          </div>
        )}

        {/* Preview */}
        {step === 'preview' && stats && (
          <div className="bg-brand-panel border border-brand-border rounded-2xl p-6 animate-slide-up">
            <h2 className="font-display text-3xl text-white tracking-wide mb-4">READY TO IMPORT</h2>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-brand-card rounded-xl p-4 text-center">
                <div className="font-display text-5xl text-brand-green">{stats.seasons}</div>
                <div className="text-brand-muted text-xs mt-1 uppercase tracking-widest">Seasons</div>
              </div>
              <div className="bg-brand-card rounded-xl p-4 text-center">
                <div className="font-display text-5xl text-brand-amber">{stats.total}</div>
                <div className="text-brand-muted text-xs mt-1 uppercase tracking-widest">Castaways</div>
              </div>
            </div>

            {/* Sample rows */}
            <div className="bg-brand-bg rounded-xl p-4 mb-6 overflow-x-auto">
              <p className="text-brand-muted text-xs uppercase tracking-widest mb-2">Sample (first 5 rows)</p>
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="text-brand-muted border-b border-brand-border">
                    <th className="text-left pb-1 pr-4">Castaway</th>
                    <th className="text-left pb-1 pr-4">Season</th>
                    <th className="text-left pb-1 pr-4">ID</th>
                    <th className="text-left pb-1">Placement</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 5).map((r, i) => (
                    <tr key={i} className="text-white border-b border-brand-border/30">
                      <td className="py-1 pr-4">{r.Castaway}</td>
                      <td className="py-1 pr-4">{r.Season}</td>
                      <td className="py-1 pr-4">{r.ID}</td>
                      <td className="py-1">{r.Placement}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-brand-red/10 border border-brand-red/30 rounded-xl p-3 mb-6 text-xs text-brand-muted">
              ⚠️ Existing castaways for any imported season will be replaced.
            </div>

            <div className="flex gap-3">
              <button onClick={handleImport}
                      className="flex-1 bg-brand-green hover:bg-green-500 text-white font-display text-2xl tracking-widest py-3 rounded-xl transition-colors">
                IMPORT NOW
              </button>
              <button onClick={() => { setStep('upload'); setRows([]); setStats(null) }}
                      className="bg-brand-panel border border-brand-border text-brand-muted hover:text-white font-display text-xl tracking-widest px-6 py-3 rounded-xl transition-colors">
                CANCEL
              </button>
            </div>
          </div>
        )}

        {/* Importing */}
        {step === 'importing' && (
          <div className="bg-brand-panel border border-brand-border rounded-2xl p-8 text-center animate-fade-in">
            <div className="text-5xl mb-4 animate-pulse">⚙️</div>
            <h2 className="font-display text-3xl text-white tracking-wide mb-3">IMPORTING…</h2>
            <p className="text-brand-muted text-sm">{progress}</p>
          </div>
        )}

        {/* Done */}
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
              <Link href="/host/admin/lists"
                    className="flex-1 bg-brand-green hover:bg-green-500 text-white font-display text-2xl tracking-widest py-3 rounded-xl transition-colors text-center">
                BUILD LISTS →
              </Link>
              <button onClick={() => { setStep('upload'); setRows([]); setStats(null); setErrors([]) }}
                      className="bg-brand-panel border border-brand-border text-brand-muted hover:text-white font-display text-xl tracking-widest px-6 py-3 rounded-xl transition-colors">
                IMPORT MORE
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
