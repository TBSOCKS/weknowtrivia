'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import NavBar from '@/components/NavBar'
import { supabase } from '@/lib/supabase'

export default function ListsPage() {
  const [shows, setShows]       = useState([])
  const [lists, setLists]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [form, setForm]         = useState({ show_id: '', title: '', answer_count: '' })

  // For managing answers in an expanded list
  const [expandedList, setExpandedList]   = useState(null)
  const [answers, setAnswers]             = useState({})   // listId → [{position, castaway_id, castaway}]
  const [castawaySearch, setCastawaySearch] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching]         = useState(false)
  const [addingPos, setAddingPos]         = useState(null) // position being filled

  async function load() {
    setLoading(true)
    const [showRes, listRes] = await Promise.all([
      supabase.from('shows').select('*').order('name'),
      supabase.from('lists').select('*, shows(name)').order('created_at', { ascending: false }),
    ])
    setShows(showRes.data ?? [])
    setLists(listRes.data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function loadAnswers(listId, answerCount) {
    const { data } = await supabase
      .from('list_answers')
      .select('*, castaways(id, name, castaway_id, seasons(name, version_season))')
      .eq('list_id', listId)
      .order('position')
    setAnswers(a => ({ ...a, [listId]: data ?? [] }))
  }

  async function handleToggleList(list) {
    if (expandedList === list.id) {
      setExpandedList(null)
    } else {
      setExpandedList(list.id)
      await loadAnswers(list.id, list.answer_count)
    }
  }

  async function handleAddList(e) {
    e.preventDefault()
    if (!form.title || !form.show_id || !form.answer_count) { setError('All fields required'); return }
    setSaving(true); setError('')
    const { error: err } = await supabase.from('lists').insert({
      show_id:      form.show_id,
      title:        form.title.trim(),
      answer_count: parseInt(form.answer_count),
    })
    if (err) setError(err.message)
    else {
      setForm({ show_id: '', title: '', answer_count: '' })
      setShowForm(false)
      await load()
    }
    setSaving(false)
  }

  async function handleDeleteList(id) {
    if (!confirm('Delete this list and all its answers?')) return
    await supabase.from('lists').delete().eq('id', id)
    await load()
    if (expandedList === id) setExpandedList(null)
  }

  // Castaway search for assigning answers
  useEffect(() => {
    if (!castawaySearch || castawaySearch.length < 2) { setSearchResults([]); return }
    const t = setTimeout(async () => {
      setSearching(true)
      const { data } = await supabase
        .from('castaways')
        .select('id, name, castaway_id, seasons(name, version_season, show_id)')
        .ilike('name', `%${castawaySearch}%`)
        .limit(20)
      setSearchResults(data ?? [])
      setSearching(false)
    }, 250)
    return () => clearTimeout(t)
  }, [castawaySearch])

  async function assignAnswer(listId, position, castaway) {
    // Upsert: remove existing answer for this position if any, then insert
    const existing = answers[listId]?.find(a => a.position === position)
    if (existing) {
      await supabase.from('list_answers').delete().eq('id', existing.id)
    }
    await supabase.from('list_answers').insert({
      list_id:     listId,
      castaway_id: castaway.id,
      position,
    })
    setCastawaySearch('')
    setSearchResults([])
    setAddingPos(null)
    const list = lists.find(l => l.id === listId)
    await loadAnswers(listId, list?.answer_count)
  }

  async function removeAnswer(listId, answerId) {
    await supabase.from('list_answers').delete().eq('id', answerId)
    const list = lists.find(l => l.id === listId)
    await loadAnswers(listId, list?.answer_count)
  }

  return (
    <div className="min-h-screen bg-brand-bg">
      <NavBar />
      <div className="max-w-5xl mx-auto px-4 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link href="/host/admin" className="text-brand-muted hover:text-white text-sm mb-2 inline-flex items-center gap-1 transition-colors">
              ← Admin
            </Link>
            <h1 className="font-display text-5xl text-white tracking-wide">TRIVIA LISTS</h1>
          </div>
          <button
            onClick={() => { setShowForm(v => !v); setError('') }}
            className="bg-brand-green hover:bg-green-500 text-white px-5 py-2.5 rounded-xl font-display text-xl tracking-wider transition-colors"
          >
            {showForm ? 'CANCEL' : '+ NEW LIST'}
          </button>
        </div>

        {/* Add list form */}
        {showForm && (
          <form onSubmit={handleAddList} className="bg-brand-panel border border-brand-border rounded-2xl p-6 mb-6 animate-slide-up">
            <h2 className="font-display text-2xl text-white tracking-wide mb-4">NEW TRIVIA LIST</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-brand-muted text-xs mb-1.5 uppercase tracking-widest">Show</label>
                <select value={form.show_id} onChange={e => setForm(f => ({ ...f, show_id: e.target.value }))}
                        className="w-full bg-brand-card border border-brand-border rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-brand-green transition-colors">
                  <option value="">Select Show</option>
                  {shows.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="sm:col-span-1">
                <label className="block text-brand-muted text-xs mb-1.5 uppercase tracking-widest">Title / Prompt</label>
                <input type="text" value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="All Survivor winners"
                  className="w-full bg-brand-card border border-brand-border rounded-xl px-4 py-2.5 text-white placeholder-brand-muted focus:outline-none focus:border-brand-green transition-colors" />
              </div>
              <div>
                <label className="block text-brand-muted text-xs mb-1.5 uppercase tracking-widest"># of Answers</label>
                <input type="number" value={form.answer_count} min={1} max={50}
                  onChange={e => setForm(f => ({ ...f, answer_count: e.target.value }))}
                  placeholder="47"
                  className="w-full bg-brand-card border border-brand-border rounded-xl px-4 py-2.5 text-white placeholder-brand-muted focus:outline-none focus:border-brand-green transition-colors" />
              </div>
            </div>
            {error && <p className="text-brand-red text-sm mb-3">{error}</p>}
            <button type="submit" disabled={saving}
                    className="bg-brand-green hover:bg-green-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl font-display text-xl tracking-wider transition-colors">
              {saving ? 'SAVING…' : 'CREATE LIST'}
            </button>
          </form>
        )}

        {/* Lists */}
        {loading ? (
          <div className="text-brand-muted text-center py-20">Loading…</div>
        ) : lists.length === 0 ? (
          <div className="text-center py-20 text-brand-muted">
            <div className="text-5xl mb-4">📋</div>
            <p>No lists yet. Create one above!</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {lists.map(list => {
              const listAnswers = answers[list.id] ?? []
              const filled = listAnswers.length
              const total  = list.answer_count

              return (
                <div key={list.id} className="bg-brand-panel border border-brand-border rounded-xl overflow-hidden">
                  {/* Header */}
                  <div className="flex items-center gap-4 p-4">
                    <button onClick={() => handleToggleList(list)} className="flex-1 flex items-center gap-4 text-left">
                      <div className="flex-1">
                        <div className="text-white font-medium">{list.title}</div>
                        <div className="text-brand-muted text-xs mt-0.5">
                          {list.shows?.name} · {filled}/{total} answers filled
                        </div>
                      </div>
                      {/* Progress bar */}
                      <div className="w-32 bg-brand-card rounded-full h-1.5 overflow-hidden">
                        <div className="h-full bg-brand-green rounded-full transition-all"
                             style={{ width: `${Math.min(100, (filled / total) * 100)}%` }} />
                      </div>
                      <span className="text-brand-muted text-sm ml-2">{expandedList === list.id ? '▲' : '▼'}</span>
                    </button>
                    <button onClick={() => handleDeleteList(list.id)}
                            className="text-brand-red/50 hover:text-brand-red text-sm transition-colors ml-2">
                      ✕
                    </button>
                  </div>

                  {/* Expanded answer grid */}
                  {expandedList === list.id && (
                    <div className="border-t border-brand-border p-4 animate-fade-in">
                      <p className="text-brand-muted text-xs uppercase tracking-widest mb-3">
                        Click a slot to assign an answer. Slots are in board order (position 1 = top-left).
                      </p>
                      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(6, total)}, minmax(0, 1fr))` }}>
                        {Array.from({ length: total }, (_, i) => i + 1).map(pos => {
                          const ans = listAnswers.find(a => a.position === pos)
                          const isAdding = addingPos === pos

                          return (
                            <div key={pos} className="relative">
                              <button
                                onClick={() => {
                                  setAddingPos(isAdding ? null : pos)
                                  setCastawaySearch('')
                                  setSearchResults([])
                                }}
                                className={`w-full aspect-square rounded-xl border text-xs flex flex-col items-center justify-center gap-1 transition-all ${
                                  ans
                                    ? 'border-brand-green/50 bg-brand-green/10'
                                    : isAdding
                                    ? 'border-brand-amber bg-brand-amber/10'
                                    : 'border-brand-border bg-brand-card hover:border-brand-border/80'
                                }`}
                              >
                                <span className="text-brand-muted text-[10px]">#{pos}</span>
                                {ans ? (
                                  <>
                                    <img
                                      src={`https://gradientdescending.com/survivor/castaways/colour/${ans.castaways?.seasons?.version_season}US${ans.castaways?.castaway_id}.png`}
                                      alt={ans.castaways?.name}
                                      className="w-8 h-8 rounded-full object-cover"
                                      onError={e => { e.target.style.display = 'none' }}
                                    />
                                    <span className="text-white text-[10px] text-center leading-tight px-1 truncate w-full text-center">
                                      {ans.castaways?.name?.split(' ')[0]}
                                    </span>
                                  </>
                                ) : (
                                  <span className="text-brand-muted text-lg">{isAdding ? '✕' : '+'}</span>
                                )}
                              </button>

                              {ans && (
                                <button
                                  onClick={() => removeAnswer(list.id, ans.id)}
                                  className="absolute -top-1 -right-1 w-4 h-4 bg-brand-red rounded-full text-white text-[10px] flex items-center justify-center hover:bg-red-600 transition-colors"
                                >
                                  ✕
                                </button>
                              )}

                              {/* Inline search dropdown */}
                              {isAdding && (
                                <div className="absolute top-full left-0 z-50 mt-1 w-64 bg-brand-panel border border-brand-border rounded-xl shadow-2xl">
                                  <input
                                    type="text"
                                    autoFocus
                                    value={castawaySearch}
                                    onChange={e => setCastawaySearch(e.target.value)}
                                    placeholder="Search castaway…"
                                    className="w-full bg-transparent px-3 py-2 text-white text-sm placeholder-brand-muted focus:outline-none border-b border-brand-border"
                                  />
                                  <div className="search-dropdown">
                                    {searching && <div className="text-brand-muted text-xs px-3 py-2">Searching…</div>}
                                    {!searching && castawaySearch.length >= 2 && searchResults.length === 0 && (
                                      <div className="text-brand-muted text-xs px-3 py-2">No results</div>
                                    )}
                                    {searchResults.map(c => (
                                      <button
                                        key={`${c.id}`}
                                        onClick={() => assignAnswer(list.id, pos, c)}
                                        className="w-full text-left px-3 py-2 hover:bg-brand-card text-sm text-white border-b border-brand-border/30 last:border-0 flex items-center gap-2"
                                      >
                                        <img
                                          src={`https://gradientdescending.com/survivor/castaways/colour/${c.seasons?.version_season}US${c.castaway_id}.png`}
                                          alt={c.name}
                                          className="w-6 h-6 rounded-full object-cover bg-brand-card"
                                          onError={e => { e.target.style.display = 'none' }}
                                        />
                                        <span>{c.name}</span>
                                        <span className="text-brand-muted text-xs ml-auto">{c.seasons?.name}</span>
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
