'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import NavBar from '@/components/NavBar'
import { supabase } from '@/lib/supabase'

export default function SeasonsPage() {
  const [shows, setShows]             = useState([])
  const [seasons, setSeasons]         = useState([])
  const [castaways, setCastaways]     = useState({}) // seasonId → []
  const [selectedShow, setSelectedShow] = useState('')
  const [loading, setLoading]         = useState(true)

  // Forms
  const [seasonForm, setSeasonForm]   = useState({ name: '', season_number: '', version_season: '' })
  const [showSeasonForm, setShowSeasonForm] = useState(false)
  const [savingSeason, setSavingSeason] = useState(false)
  const [seasonError, setSeasonError] = useState('')

  const [castawayForm, setCastawayForm] = useState({ name: '', castaway_id: '', placement: '' })
  const [castawayTarget, setCastawayTarget] = useState(null) // season id
  const [savingCastaway, setSavingCastaway] = useState(false)
  const [castawayError, setCastawayError] = useState('')

  const [expandedSeason, setExpandedSeason] = useState(null)

  async function load(showId) {
    setLoading(true)
    const [showRes, seasonRes] = await Promise.all([
      supabase.from('shows').select('*').order('name'),
      showId
        ? supabase.from('seasons').select('*').eq('show_id', showId).order('season_number')
        : supabase.from('seasons').select('*').order('season_number'),
    ])
    setShows(showRes.data ?? [])
    setSeasons(seasonRes.data ?? [])
    setLoading(false)
  }

  useEffect(() => { load(selectedShow || null) }, [selectedShow])

  async function loadCastaways(seasonId) {
    if (castaways[seasonId]) return
    const { data } = await supabase
      .from('castaways')
      .select('*')
      .eq('season_id', seasonId)
      .order('placement')
    setCastaways(c => ({ ...c, [seasonId]: data ?? [] }))
  }

  async function handleToggleSeason(seasonId) {
    if (expandedSeason === seasonId) {
      setExpandedSeason(null)
    } else {
      setExpandedSeason(seasonId)
      await loadCastaways(seasonId)
    }
  }

  async function handleAddSeason(e) {
    e.preventDefault()
    if (!selectedShow) { setSeasonError('Please select a show first'); return }
    if (!seasonForm.name || !seasonForm.season_number || !seasonForm.version_season) {
      setSeasonError('All fields are required'); return
    }
    setSavingSeason(true)
    setSeasonError('')
    const { error } = await supabase.from('seasons').insert({
      show_id:       selectedShow,
      name:          seasonForm.name.trim(),
      season_number: parseInt(seasonForm.season_number),
      version_season: seasonForm.version_season.trim().toUpperCase(),
    })
    if (error) setSeasonError(error.message)
    else {
      setSeasonForm({ name: '', season_number: '', version_season: '' })
      setShowSeasonForm(false)
      await load(selectedShow)
    }
    setSavingSeason(false)
  }

  async function handleAddCastaway(e) {
    e.preventDefault()
    if (!castawayForm.name || !castawayForm.castaway_id) {
      setCastawayError('Name and ID are required'); return
    }
    setSavingCastaway(true)
    setCastawayError('')
    const { error } = await supabase.from('castaways').insert({
      season_id:   castawayTarget,
      name:        castawayForm.name.trim(),
      castaway_id: castawayForm.castaway_id.trim().padStart(4, '0'),
      placement:   castawayForm.placement ? parseInt(castawayForm.placement) : null,
    })
    if (error) setCastawayError(error.message)
    else {
      setCastawayForm({ name: '', castaway_id: '', placement: '' })
      setCastawayTarget(null)
      setCastaways(c => ({ ...c, [castawayTarget]: undefined })) // refresh
      await loadCastaways(castawayTarget)
    }
    setSavingCastaway(false)
  }

  async function deleteCastaway(id, seasonId) {
    if (!confirm('Delete this castaway?')) return
    await supabase.from('castaways').delete().eq('id', id)
    setCastaways(c => ({ ...c, [seasonId]: undefined }))
    await loadCastaways(seasonId)
  }

  const filteredSeasons = selectedShow
    ? seasons.filter(s => s.show_id === selectedShow)
    : seasons

  return (
    <div className="min-h-screen bg-brand-bg">
      <NavBar />
      <div className="max-w-4xl mx-auto px-4 py-10">
        <div className="flex items-start justify-between mb-8">
          <div>
            <Link href="/host/admin" className="text-brand-muted hover:text-white text-sm mb-2 inline-flex items-center gap-1 transition-colors">
              ← Admin
            </Link>
            <h1 className="font-display text-5xl text-white tracking-wide">SHOWS & SEASONS</h1>
          </div>
        </div>

        {/* Show filter + add season */}
        <div className="bg-brand-panel border border-brand-border rounded-2xl p-5 mb-6">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-brand-muted text-xs mb-1.5 uppercase tracking-widest">Filter by Show</label>
              <select
                value={selectedShow}
                onChange={e => setSelectedShow(e.target.value)}
                className="w-full bg-brand-card border border-brand-border rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-brand-amber transition-colors"
              >
                <option value="">All Shows</option>
                {shows.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <button
              onClick={() => { setShowSeasonForm(v => !v); setSeasonError('') }}
              disabled={!selectedShow}
              className="bg-brand-amber hover:bg-amber-500 disabled:opacity-40 text-brand-bg px-5 py-2.5 rounded-xl font-display text-lg tracking-wider transition-colors"
            >
              {showSeasonForm ? 'CANCEL' : '+ ADD SEASON'}
            </button>
          </div>

          {showSeasonForm && (
            <form onSubmit={handleAddSeason} className="mt-4 pt-4 border-t border-brand-border animate-slide-up">
              <h3 className="font-display text-xl text-white tracking-wide mb-3">ADD SEASON TO {shows.find(s => s.id === selectedShow)?.name}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                <div>
                  <label className="block text-brand-muted text-xs mb-1 uppercase tracking-widest">Season Name</label>
                  <input type="text" value={seasonForm.name}
                    onChange={e => setSeasonForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Borneo"
                    className="w-full bg-brand-bg border border-brand-border rounded-xl px-3 py-2 text-white placeholder-brand-muted focus:outline-none focus:border-brand-amber text-sm" />
                </div>
                <div>
                  <label className="block text-brand-muted text-xs mb-1 uppercase tracking-widest">Season #</label>
                  <input type="number" value={seasonForm.season_number}
                    onChange={e => setSeasonForm(f => ({ ...f, season_number: e.target.value }))}
                    placeholder="1"
                    className="w-full bg-brand-bg border border-brand-border rounded-xl px-3 py-2 text-white placeholder-brand-muted focus:outline-none focus:border-brand-amber text-sm" />
                </div>
                <div>
                  <label className="block text-brand-muted text-xs mb-1 uppercase tracking-widest">Version Season (Photo URL key)</label>
                  <input type="text" value={seasonForm.version_season}
                    onChange={e => setSeasonForm(f => ({ ...f, version_season: e.target.value }))}
                    placeholder="e.g. US01"
                    className="w-full bg-brand-bg border border-brand-border rounded-xl px-3 py-2 text-white placeholder-brand-muted focus:outline-none focus:border-brand-amber text-sm" />
                </div>
              </div>
              {seasonError && <p className="text-brand-red text-sm mb-2">{seasonError}</p>}
              <button type="submit" disabled={savingSeason}
                      className="bg-brand-amber hover:bg-amber-500 disabled:opacity-50 text-brand-bg px-5 py-2 rounded-xl font-display text-lg tracking-wider transition-colors">
                {savingSeason ? 'SAVING…' : 'SAVE SEASON'}
              </button>
            </form>
          )}
        </div>

        {/* Season list */}
        {loading ? (
          <div className="text-brand-muted text-center py-16">Loading…</div>
        ) : filteredSeasons.length === 0 ? (
          <div className="text-center py-16 text-brand-muted">
            <div className="text-4xl mb-3">📺</div>
            <p>{selectedShow ? 'No seasons for this show yet.' : 'No seasons yet.'}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filteredSeasons.map(season => (
              <div key={season.id} className="bg-brand-panel border border-brand-border rounded-xl overflow-hidden">
                <button
                  onClick={() => handleToggleSeason(season.id)}
                  className="w-full flex items-center justify-between p-4 hover:bg-brand-card transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-brand-muted font-display text-xl w-8">S{season.season_number}</span>
                    <span className="text-white font-medium">{season.name}</span>
                    <span className="text-brand-muted text-xs bg-brand-card px-2 py-0.5 rounded">{season.version_season}</span>
                  </div>
                  <span className="text-brand-muted text-sm">{expandedSeason === season.id ? '▲' : '▼'}</span>
                </button>

                {expandedSeason === season.id && (
                  <div className="border-t border-brand-border p-4 animate-fade-in">
                    {/* Add castaway form */}
                    {castawayTarget === season.id ? (
                      <form onSubmit={handleAddCastaway} className="mb-4 bg-brand-bg rounded-xl p-4">
                        <h4 className="font-display text-lg text-white tracking-wide mb-3">ADD CASTAWAY</h4>
                        <div className="grid grid-cols-3 gap-3 mb-3">
                          <div>
                            <label className="block text-brand-muted text-xs mb-1">Name</label>
                            <input type="text" value={castawayForm.name}
                              onChange={e => setCastawayForm(f => ({ ...f, name: e.target.value }))}
                              placeholder="Richard Hatch"
                              className="w-full bg-brand-card border border-brand-border rounded-lg px-3 py-2 text-white text-sm placeholder-brand-muted focus:outline-none focus:border-brand-red" />
                          </div>
                          <div>
                            <label className="block text-brand-muted text-xs mb-1">Castaway ID (4 digits)</label>
                            <input type="text" value={castawayForm.castaway_id}
                              onChange={e => setCastawayForm(f => ({ ...f, castaway_id: e.target.value }))}
                              placeholder="0001"
                              maxLength={4}
                              className="w-full bg-brand-card border border-brand-border rounded-lg px-3 py-2 text-white text-sm placeholder-brand-muted focus:outline-none focus:border-brand-red" />
                          </div>
                          <div>
                            <label className="block text-brand-muted text-xs mb-1">Placement <span className="text-brand-muted/50">(optional)</span></label>
                            <input type="number" value={castawayForm.placement}
                              onChange={e => setCastawayForm(f => ({ ...f, placement: e.target.value }))}
                              placeholder="1"
                              min={1}
                              className="w-full bg-brand-card border border-brand-border rounded-lg px-3 py-2 text-white text-sm placeholder-brand-muted focus:outline-none focus:border-brand-red" />
                          </div>
                        </div>
                        {castawayError && <p className="text-brand-red text-xs mb-2">{castawayError}</p>}
                        <div className="flex gap-2">
                          <button type="submit" disabled={savingCastaway}
                                  className="bg-brand-red hover:bg-red-600 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg font-display text-sm tracking-wider">
                            {savingCastaway ? 'SAVING…' : 'ADD'}
                          </button>
                          <button type="button" onClick={() => { setCastawayTarget(null); setCastawayError('') }}
                                  className="text-brand-muted hover:text-white px-4 py-1.5 rounded-lg text-sm border border-brand-border">
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : (
                      <button
                        onClick={() => { setCastawayTarget(season.id); setCastawayForm({ name: '', castaway_id: '', placement: '' }); setCastawayError('') }}
                        className="mb-4 text-sm text-brand-red hover:text-red-400 border border-brand-red/30 hover:border-brand-red/60 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        + Add Castaway
                      </button>
                    )}

                    {/* Castaway table */}
                    {castaways[season.id] ? (
                      castaways[season.id].length === 0 ? (
                        <p className="text-brand-muted text-sm">No castaways yet.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-brand-muted text-xs uppercase tracking-widest border-b border-brand-border">
                                <th className="text-left pb-2 pr-4">Place</th>
                                <th className="text-left pb-2 pr-4">Name</th>
                                <th className="text-left pb-2 pr-4">ID</th>
                                <th className="text-left pb-2">Photo</th>
                                <th className="pb-2"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {castaways[season.id].map(c => (
                                <tr key={c.id} className="border-b border-brand-border/50 hover:bg-brand-card transition-colors">
                                  <td className="py-2 pr-4 text-brand-amber font-display text-lg">{c.placement ?? <span className="text-brand-muted text-sm">TBD</span>}</td>
                                  <td className="py-2 pr-4 text-white">{c.name}</td>
                                  <td className="py-2 pr-4 text-brand-muted font-mono">{c.castaway_id}</td>
                                  <td className="py-2 pr-4">
                                    <img
                                      src={`https://gradientdescending.com/survivor/castaways/colour/${season.version_season}US${c.castaway_id}.png`}
                                      alt={c.name}
                                      className="w-8 h-8 rounded-full object-cover bg-brand-card"
                                      onError={e => { e.target.style.display = 'none' }}
                                    />
                                  </td>
                                  <td className="py-2">
                                    <button onClick={() => deleteCastaway(c.id, season.id)}
                                            className="text-brand-red/50 hover:text-brand-red text-xs transition-colors">
                                      ✕
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )
                    ) : (
                      <p className="text-brand-muted text-sm">Loading castaways…</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
