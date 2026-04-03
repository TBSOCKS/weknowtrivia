'use client'
import { useState } from 'react'
import Link from 'next/link'
import NavBar from '@/components/NavBar'
import { supabase } from '@/lib/supabase'

// ── Per-show configuration ────────────────────────────────────────────────
const SHOW_CONFIG = {
  survivor: {
    label:      'Survivor',
    slug:       'survivor',
    emoji:      '🌴',
    seasonPrefix: 'US',
    nameCol:    'castaway',
    idCol:      'castaway_id',
    seasonCol:  'version_season',
    placeCol:   'place',
    parseSeasonNum: (val) => parseInt(val?.replace(/^[A-Z]+/, '')) || null,
    filterRow: (row) => row.version === 'US' || row.version_season?.startsWith('US'),
    instructions: [
      { step: 1, text: <span>Go to the <a href="https://docs.google.com/spreadsheets/d/1Xhod9FdVFr69hrX7No40WZAz0ZmhO_5x6WghxawuSno/edit" target="_blank" rel="noopener noreferrer" className="text-brand-amber underline">survivoR Google Sheet ↗</a></span> },
      { step: 2, text: <span>Click the <strong className="text-white">Castaways</strong> tab at the bottom</span> },
      { step: 3, text: <span>Go to <strong className="text-white">File → Download → Comma-separated values (.csv)</strong></span> },
      { step: 4, text: 'Upload the CSV below.' },
    ],
    requiredCols: 'version, version_season, castaway_id, castaway, place',
  },
  'big-brother': {
    label:      'Big Brother',
    slug:       'big-brother',
    emoji:      '👁️',
    seasonPrefix: 'BB',
    nameCol:    'houseguest',
    idCol:      'houseguest_id',
    seasonCol:  'season_number',
    placeCol:   'place',
    parseSeasonNum: (val) => parseInt(val) || null,
    filterRow: () => true,
    instructions: [
      { step: 1, text: 'Prepare a CSV with one row per houseguest.' },
      { step: 2, text: 'Upload the CSV below.' },
    ],
    requiredCols: 'houseguest_id, houseguest, season_number, place',
  },
  'the-challenge': {
    label:      'The Challenge',
    slug:       'the-challenge',
    emoji:      '🏆',
    seasonPrefix: 'TC',
    nameCol:    'challenger',
    idCol:      'challenger_id',
    seasonCol:  'season_number',
    placeCol:   'place',
    parseSeasonNum: (val) => parseInt(val) || null,
    filterRow: () => true,
    instructions: [
      { step: 1, text: 'Prepare a CSV with one row per challenger.' },
      { step: 2, text: 'Upload the CSV below.' },
    ],
    requiredCols: 'challenger_id, challenger, season_number, place',
  },
  'drag-race': {
    label:      'Drag Race',
    slug:       'drag-race',
    emoji:      '👑',
    seasonPrefix: 'DR',
    nameCol:    'queen',
    idCol:      'queen_id',
    seasonCol:  'season_number',
    placeCol:   'place',
    parseSeasonNum: (val) => parseInt(val) || null,
    filterRow: () => true,
    instructions: [
      { step: 1, text: 'Prepare a CSV with one row per queen.' },
      { step: 2, text: 'Upload the CSV below.' },
    ],
    requiredCols: 'queen_id, queen, season_number, place',
  },
}

const SURVIVOR_SEASON_NAMES = {
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

function parseCSV(text) {
  const lines = text.trim().split('\n')
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
  return lines.slice(1).map(line => {
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
    headers.forEach((h, i) => { obj[h] = values[i]?.replace(/^"|"$/g, '') ?? '' })
    return obj
  }).filter(r => Object.values(r).some(v => v !== ''))
}

export default function ImportPage() {
  const [selectedShow, setSelectedShow] = useState(null)
  const [step, setStep]         = useState('upload')
  const [rows, setRows]         = useState([])
  const [stats, setStats]       = useState(null)
  const [progress, setProgress] = useState('')
  const [errors, setErrors]     = useState([])

  const config = selectedShow ? SHOW_CONFIG[selectedShow] : null

  function reset() {
    setStep('upload'); setRows([]); setStats(null); setErrors([]); setProgress('')
  }

  function handleShowSelect(slug) { setSelectedShow(slug); reset() }

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file || !config) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const parsed   = parseCSV(ev.target.result)
      const filtered = parsed.filter(config.filterRow)
      const seasons  = new Set(filtered.map(r => config.parseSeasonNum(r[config.seasonCol])).filter(Boolean))
      setRows(filtered)
      setStats({ total: filtered.length, seasons: seasons.size })
      setStep('preview')
    }
    reader.readAsText(file)
  }

  async function getOrCreateShow(slug, name) {
    const { data } = await supabase.from('shows').select('id').eq('slug', slug).single()
    if (data) return data.id
    const { data: created } = await supabase.from('shows').insert({ name, slug }).select('id').single()
    return created.id
  }

  async function handleImport() {
    setStep('importing'); setErrors([])
    const errs = []
    try {
      setProgress(`Finding ${config.label} show…`)
      const showId = await getOrCreateShow(config.slug, config.label)

      const bySeason = {}
      rows.forEach(r => {
        const sn = config.parseSeasonNum(r[config.seasonCol])
        if (!sn) return
        if (!bySeason[sn]) bySeason[sn] = []
        bySeason[sn].push(r)
      })

      const seasonNums = Object.keys(bySeason).map(Number).sort((a, b) => a - b)
      const seasonIds  = {}

      setProgress(`Importing ${seasonNums.length} seasons…`)
      for (const sn of seasonNums) {
        const name = config.slug === 'survivor'
          ? (SURVIVOR_SEASON_NAMES[sn] ?? `Season ${sn}`)
          : `Season ${sn}`
        const insertData = { show_id: showId, name, season_number: sn, version_season: `${config.seasonPrefix}${sn}` }

        const { data: existing } = await supabase.from('seasons').select('id')
          .eq('show_id', showId).eq('season_number', sn).single()

        if (existing) {
          seasonIds[sn] = existing.id
        } else {
          const { data: created, error } = await supabase.from('seasons')
            .insert(insertData).select('id').single()
          if (error) { errs.push(`Season ${sn}: ${error.message}`); continue }
          seasonIds[sn] = created.id
        }
      }

      let totalPlayers = 0
      for (const sn of seasonNums) {
        const seasonId = seasonIds[sn]
        if (!seasonId) continue
        setProgress(`Importing ${config.label} S${sn} (${bySeason[sn].length} players)…`)

        const castawayRows = bySeason[sn].map(r => {
          const fullId  = r[config.idCol] ?? ''
          const numPart = config.slug === 'survivor' ? fullId.replace(/^[A-Z]+/, '') : fullId
          return {
            season_id:  seasonId,
            name:       r[config.nameCol] ?? '',
            castaway_id: numPart,
            placement:  parseInt(r[config.placeCol]) || 0,
          }
        }).filter(r => r.name && r.castaway_id)

        if (castawayRows.length === 0) continue
        await supabase.from('castaways').delete().eq('season_id', seasonId)
        const { error } = await supabase.from('castaways').insert(castawayRows)
        if (error) errs.push(`S${sn}: ${error.message}`)
        else totalPlayers += castawayRows.length
      }

      setErrors(errs)
      setProgress(`Done! Imported ${seasonNums.length} seasons and ${totalPlayers} players.`)
      setStep('done')
    } catch (err) {
      errs.push(`Unexpected error: ${err.message}`)
      setErrors(errs); setStep('done')
    }
  }

  return (
    <div className="min-h-screen bg-brand-bg">
      <NavBar />
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="mb-8">
          <Link href="/host/admin" className="text-brand-muted hover:text-white text-sm mb-2 inline-flex items-center gap-1 transition-colors">← Admin</Link>
          <h1 className="font-display text-5xl text-white tracking-wide">IMPORT PLAYERS</h1>
          <p className="text-brand-muted mt-1">Bulk import seasons and contestants from a CSV</p>
        </div>

        {/* Show selector */}
        <div className="bg-brand-panel border border-brand-border rounded-2xl p-5 mb-6">
          <h2 className="font-display text-xl text-white tracking-wide mb-3">SELECT SHOW</h2>
          <div className="flex flex-wrap gap-2">
            {Object.entries(SHOW_CONFIG).map(([slug, cfg]) => (
              <button key={slug} onClick={() => handleShowSelect(slug)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl border font-display text-lg tracking-wide transition-all ${
                  selectedShow === slug
                    ? 'border-brand-amber bg-brand-amber/10 text-brand-amber'
                    : 'border-brand-border text-brand-muted hover:text-white'
                }`}>
                {cfg.emoji} {cfg.label.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {config && (
          <>
            {/* Instructions */}
            <div className="bg-brand-panel border border-brand-amber/40 rounded-2xl p-6 mb-6">
              <h2 className="font-display text-2xl text-brand-amber tracking-wide mb-3">HOW TO GET THE DATA</h2>
              <ol className="text-sm text-brand-muted space-y-3">
                {config.instructions.map(({ step: s, text }) => (
                  <li key={s} className="flex gap-3">
                    <span className="text-brand-amber font-display text-lg w-6 flex-shrink-0">{s}.</span>
                    <span>{text}</span>
                  </li>
                ))}
              </ol>
              <div className="mt-4 bg-brand-bg rounded-xl p-3 text-xs text-brand-muted font-mono">
                Required columns: <span className="text-white">{config.requiredCols}</span>
              </div>
            </div>

            {/* Upload */}
            {step === 'upload' && (
              <div className="bg-brand-panel border border-brand-border rounded-2xl p-8 text-center animate-fade-in">
                <div className="text-5xl mb-4">📂</div>
                <h2 className="font-display text-3xl text-white tracking-wide mb-2">UPLOAD CSV</h2>
                <p className="text-brand-muted text-sm mb-6">Select your {config.label} CSV file</p>
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
                    <div className="text-brand-muted text-xs mt-1 uppercase tracking-widest">Player Rows</div>
                  </div>
                </div>
                <div className="bg-brand-bg rounded-xl p-4 mb-6">
                  <p className="text-brand-muted text-xs uppercase tracking-widest mb-2">Sample rows (first 5)</p>
                  <div className="overflow-x-auto text-xs font-mono">
                    <table className="w-full">
                      <thead>
                        <tr className="text-brand-muted border-b border-brand-border">
                          <th className="text-left pb-1 pr-4">{config.seasonCol}</th>
                          <th className="text-left pb-1 pr-4">{config.idCol}</th>
                          <th className="text-left pb-1 pr-4">{config.nameCol}</th>
                          <th className="text-left pb-1">{config.placeCol}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.slice(0, 5).map((r, i) => (
                          <tr key={i} className="text-white border-b border-brand-border/30">
                            <td className="py-1 pr-4">{r[config.seasonCol]}</td>
                            <td className="py-1 pr-4">{r[config.idCol]}</td>
                            <td className="py-1 pr-4">{r[config.nameCol]}</td>
                            <td className="py-1">{r[config.placeCol]}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="bg-brand-red/10 border border-brand-red/30 rounded-xl p-3 mb-6 text-xs text-brand-muted">
                  ⚠️ This will <strong className="text-white">replace all players</strong> for any season that already exists.
                </div>
                <div className="flex gap-3">
                  <button onClick={handleImport}
                    className="flex-1 bg-brand-green hover:bg-green-500 text-white font-display text-2xl tracking-widest py-3 rounded-xl transition-colors">
                    IMPORT NOW
                  </button>
                  <button onClick={reset}
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
                  <Link href="/host/admin/seasons"
                    className="flex-1 bg-brand-amber hover:bg-amber-500 text-brand-bg font-display text-2xl tracking-widest py-3 rounded-xl transition-colors text-center">
                    VIEW SEASONS
                  </Link>
                  <button onClick={() => { setSelectedShow(null); reset() }}
                    className="flex-1 bg-brand-panel border border-brand-border text-white font-display text-2xl tracking-widest py-3 rounded-xl hover:border-white/30 transition-colors">
                    IMPORT ANOTHER
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}