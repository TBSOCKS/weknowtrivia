'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import NavBar from '@/components/NavBar'
import { supabase } from '@/lib/supabase'

export default function PersonalitiesPage() {
  const [personalities, setPersonalities] = useState([])
  const [loading, setLoading]             = useState(true)
  const [saving, setSaving]               = useState(false)
  const [showForm, setShowForm]           = useState(false)
  const [form, setForm]                   = useState({ name: '', photo_url: '', active: true })
  const [error, setError]                 = useState('')

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('personalities')
      .select('*')
      .order('name')
    setPersonalities(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Name is required'); return }
    setSaving(true)
    setError('')
    const { error: err } = await supabase
      .from('personalities')
      .insert({ name: form.name.trim(), photo_url: form.photo_url.trim() || null, active: form.active })
    if (err) { setError(err.message) }
    else {
      setForm({ name: '', photo_url: '', active: true })
      setShowForm(false)
      await load()
    }
    setSaving(false)
  }

  async function toggleActive(p) {
    await supabase.from('personalities').update({ active: !p.active }).eq('id', p.id)
    await load()
  }

  async function handleDelete(id) {
    if (!confirm('Delete this personality?')) return
    await supabase.from('personalities').delete().eq('id', id)
    await load()
  }

  return (
    <div className="min-h-screen bg-brand-bg">
      <NavBar />
      <div className="max-w-4xl mx-auto px-4 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link href="/host/admin" className="text-brand-muted hover:text-white text-sm mb-2 inline-flex items-center gap-1 transition-colors">
              ← Admin
            </Link>
            <h1 className="font-display text-5xl text-white tracking-wide">PERSONALITIES</h1>
          </div>
          <button
            onClick={() => { setShowForm(v => !v); setError('') }}
            className="bg-brand-red hover:bg-red-600 text-white px-5 py-2.5 rounded-xl font-display text-xl tracking-wider transition-colors"
          >
            {showForm ? 'CANCEL' : '+ ADD'}
          </button>
        </div>

        {/* Add form */}
        {showForm && (
          <form onSubmit={handleSubmit} className="bg-brand-panel border border-brand-border rounded-2xl p-6 mb-6 animate-slide-up">
            <h2 className="font-display text-2xl text-white tracking-wide mb-4">NEW PERSONALITY</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-brand-muted text-xs mb-1.5 uppercase tracking-widest">Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Rob Cesternino"
                  className="w-full bg-brand-card border border-brand-border rounded-xl px-4 py-2.5 text-white placeholder-brand-muted focus:outline-none focus:border-brand-red transition-colors"
                />
              </div>
              <div>
                <label className="block text-brand-muted text-xs mb-1.5 uppercase tracking-widest">Photo URL</label>
                <input
                  type="url"
                  value={form.photo_url}
                  onChange={e => setForm(f => ({ ...f, photo_url: e.target.value }))}
                  placeholder="https://..."
                  className="w-full bg-brand-card border border-brand-border rounded-xl px-4 py-2.5 text-white placeholder-brand-muted focus:outline-none focus:border-brand-red transition-colors"
                />
              </div>
            </div>
            <div className="flex items-center gap-3 mb-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))}
                       className="w-4 h-4 accent-brand-red" />
                <span className="text-sm text-brand-muted">Active</span>
              </label>
            </div>
            {error && <p className="text-brand-red text-sm mb-3">{error}</p>}
            <button type="submit" disabled={saving}
                    className="bg-brand-red hover:bg-red-600 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl font-display text-xl tracking-wider transition-colors">
              {saving ? 'SAVING…' : 'SAVE PERSONALITY'}
            </button>
          </form>
        )}

        {/* List */}
        {loading ? (
          <div className="text-brand-muted text-center py-20">Loading…</div>
        ) : personalities.length === 0 ? (
          <div className="text-center py-20 text-brand-muted">
            <div className="text-5xl mb-4">👤</div>
            <p>No personalities yet. Add some above!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {personalities.map(p => (
              <div key={p.id}
                   className={`bg-brand-panel border rounded-xl p-4 flex items-center gap-4 transition-colors ${p.active ? 'border-brand-border' : 'border-brand-border opacity-50'}`}>
                {/* Avatar */}
                <div className="w-12 h-12 rounded-full overflow-hidden bg-brand-card border border-brand-border flex-shrink-0">
                  {p.photo_url ? (
                    <img src={p.photo_url} alt={p.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-brand-muted text-xl">
                      {p.name[0]}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-white font-medium truncate">{p.name}</div>
                  <div className={`text-xs ${p.active ? 'text-brand-green' : 'text-brand-muted'}`}>
                    {p.active ? '● Active' : '○ Inactive'}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => toggleActive(p)}
                          className="text-xs text-brand-muted hover:text-white px-2 py-1 rounded-lg border border-brand-border hover:border-white/20 transition-colors">
                    {p.active ? 'Deactivate' : 'Activate'}
                  </button>
                  <button onClick={() => handleDelete(p.id)}
                          className="text-xs text-brand-red/60 hover:text-brand-red px-2 py-1 rounded-lg border border-brand-border hover:border-brand-red/40 transition-colors">
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
