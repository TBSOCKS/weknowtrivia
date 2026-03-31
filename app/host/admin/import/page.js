'use client'
import { useState } from 'react'
import Link from 'next/link'
import NavBar from '@/components/NavBar'

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

export default function ImportPage() {
  const [step, setStep]         = useState('upload')
  const [rows, setRows]         = useState([])
  const [stats, setStats]       = useState(null)
  const [progress, setProgress] = useState('')
  const [result, setResult]     = useState(null)

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const parsed = parseCSV(ev.target.result)
      const first = parsed[0] ?? {}
      if (!('Castaway' in first) || !('Season' in first) || !('ID' in first) || !('Placement' in first)) {
        alert(`Missing required columns.\n\nFound: ${Object.keys(first).join(', ')}\nRequired: Castaway, Season, ID, Placement`)
        return
      }
      const seasons = new Set(parsed.map(r => r.Season))
      setRows(parsed)
      setStats({ total: parsed.length, seasons: seasons.size })
      setStep('preview')
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  async function handleImport() {
    setStep('importing')
    setProgress('Sending data to server…')
    try {
      const res = await fetch('/api/import-castaways', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      })
      const data = await res.json()
      setResult(data)
      setProgress(`Done! Imported ${data.seasons} seasons and ${data.castaways} castaways.`)
      setStep('done')
    } catch (err) {
      setResult({ errors: [err.message], seasons: 0, castaways: 0 })
      setProgress('Import failed.')
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
            <div className="text-brand-muted">Richard Hatch,1,US0016,1</div>
            <div className="text-brand-muted">Kelly Wiglesworth,1,US0015,2</div>
            <div className="text-brand-muted">Sonja Christopher,1,US0001,16</div>
            <div className="text-brand-muted">…</div>
          </div>
          <ul className="text-brand-muted text-xs space-y-1">
            <li>• <strong className="text-white">Castaway</strong> — player name</li>
            <li>• <strong className="text-white">Season</strong> — season number (1, 2, 3…)</li>
            <li>• <strong className="text-white">ID</strong> — castaway ID (e.g. US0001)</li>
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
          <div className="bg-brand-panel border border-brand-border rounded-2xl p-8 text-center">
            <div className="text-5xl mb-4 animate-pulse">⚙️</div>
            <h2 className="font-display text-3xl text-white tracking-wide mb-3">IMPORTING…</h2>
            <p className="text-brand-muted text-sm">{progress}</p>
          </div>
        )}

        {/* Done */}
        {step === 'done' && result && (
          <div className="bg-brand-panel border border-brand-border rounded-2xl p-8 animate-slide-up">
            <div className="text-5xl mb-4 text-center">{result.errors?.length === 0 ? '✅' : '⚠️'}</div>
            <h2 className="font-display text-3xl text-white tracking-wide mb-2 text-center">
              {result.errors?.length === 0 ? 'IMPORT COMPLETE!' : 'DONE WITH WARNINGS'}
            </h2>
            <p className="text-brand-muted text-sm text-center mb-6">{progress}</p>
            {result.errors?.length > 0 && (
              <div className="bg-brand-red/10 border border-brand-red/30 rounded-xl p-4 mb-6 max-h-48 overflow-y-auto">
                <p className="text-brand-red text-xs font-display tracking-wide mb-2">ERRORS ({result.errors.length})</p>
                {result.errors.map((e, i) => <p key={i} className="text-brand-muted text-xs">{e}</p>)}
              </div>
            )}
            <div className="flex gap-3">
              <Link href="/host/admin/lists"
                    className="flex-1 bg-brand-green hover:bg-green-500 text-white font-display text-2xl tracking-widest py-3 rounded-xl transition-colors text-center">
                BUILD LISTS →
              </Link>
              <button onClick={() => { setStep('upload'); setRows([]); setStats(null); setResult(null) }}
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
