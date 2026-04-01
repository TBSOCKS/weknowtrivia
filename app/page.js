'use client'
import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function HomeContent() {
  const [view, setView]         = useState('home')   // 'home' | 'host' | 'join'
  const [password, setPassword] = useState('')
  const [code, setCode]         = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const router       = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (searchParams.get('redirect') === 'host') window.location.href = '/host'
  }, [searchParams])

  async function handleHostLogin(e) {
    e?.preventDefault()
    window.location.href = '/host'
  }

  function handleJoin(e) {
    e.preventDefault()
    const trimmed = code.trim().toUpperCase()
    if (trimmed.length !== 4) {
      setError('Please enter a 4-digit code.')
      return
    }
    router.push(`/join/${trimmed}`)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden">
      {/* Background texture */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_#1a0a0c_0%,_#0c0c0f_60%)] pointer-events-none" />
      <div className="absolute inset-0 opacity-5 pointer-events-none"
           style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'1\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")', backgroundSize: '60px 60px' }} />

      <div className="relative z-10 w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 mb-3">
            <span className="text-2xl">🔥</span>
            <h1 className="font-display text-7xl logo-gradient tracking-wider leading-none">
              WE KNOW
            </h1>
            <span className="text-2xl">🔥</span>
          </div>
          <div>
            <h1 className="font-display text-7xl logo-gradient tracking-wider leading-none">
              TRIVIA
            </h1>
          </div>
          <p className="text-brand-muted text-sm mt-3 tracking-widest uppercase font-body">
            A Rob Has a Podcast Experience
          </p>
        </div>

        {/* Cards */}
        {view === 'home' && (
          <div className="flex flex-col gap-4 animate-fade-in">
            <button
              onClick={handleHostLogin}
              disabled={loading}
              className="group relative overflow-hidden bg-brand-panel border border-brand-border rounded-2xl p-6 text-left hover:border-brand-red transition-all duration-300 hover:shadow-[0_0_30px_rgba(230,57,70,0.15)] disabled:opacity-50"
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-xl bg-brand-red/10 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                  🎬
                </div>
                <div>
                  <div className="font-display text-3xl text-white tracking-wide">I'M A HOST</div>
                  <div className="text-brand-muted text-sm">Set up and run a game</div>
                </div>
              </div>
              <div className="absolute right-6 top-1/2 -translate-y-1/2 text-brand-muted group-hover:text-brand-red transition-colors text-xl">→</div>
            </button>

            <button
              onClick={() => { setView('join'); setError('') }}
              className="group relative overflow-hidden bg-brand-panel border border-brand-border rounded-2xl p-6 text-left hover:border-brand-amber transition-all duration-300 hover:shadow-[0_0_30px_rgba(244,162,97,0.15)]"
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-xl bg-brand-amber/10 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                  📱
                </div>
                <div>
                  <div className="font-display text-3xl text-white tracking-wide">JOIN A GAME</div>
                  <div className="text-brand-muted text-sm">Enter your 4-digit code</div>
                </div>
              </div>
              <div className="absolute right-6 top-1/2 -translate-y-1/2 text-brand-muted group-hover:text-brand-amber transition-colors text-xl">→</div>
            </button>
          </div>
        )}

        {/* Host Login */}
        {view === 'host' && (
          <div className="bg-brand-panel border border-brand-border rounded-2xl p-8 animate-slide-up">
            <button onClick={() => { setView('home'); setError('') }}
                    className="text-brand-muted hover:text-white text-sm mb-6 flex items-center gap-2 transition-colors">
              ← Back
            </button>
            <h2 className="font-display text-4xl text-white tracking-wide mb-1">HOST LOGIN</h2>
            <p className="text-brand-muted text-sm mb-6">Enter the host password to continue</p>
            <form onSubmit={handleHostLogin} className="flex flex-col gap-4">
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Password"
                autoFocus
                className="w-full bg-brand-card border border-brand-border rounded-xl px-4 py-3 text-white placeholder-brand-muted focus:outline-none focus:border-brand-red transition-colors"
              />
              {error && <p className="text-brand-red text-sm">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-brand-red hover:bg-red-600 disabled:opacity-50 text-white font-display text-2xl tracking-widest py-3 rounded-xl transition-colors"
              >
                {loading ? 'LOGGING IN…' : 'ENTER'}
              </button>
            </form>
          </div>
        )}

        {/* Join Game */}
        {view === 'join' && (
          <div className="bg-brand-panel border border-brand-border rounded-2xl p-8 animate-slide-up">
            <button onClick={() => { setView('home'); setError('') }}
                    className="text-brand-muted hover:text-white text-sm mb-6 flex items-center gap-2 transition-colors">
              ← Back
            </button>
            <h2 className="font-display text-4xl text-white tracking-wide mb-1">JOIN GAME</h2>
            <p className="text-brand-muted text-sm mb-6">Enter the 4-digit code from your host</p>
            <form onSubmit={handleJoin} className="flex flex-col gap-4">
              <input
                type="text"
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4))}
                placeholder="XXXX"
                maxLength={4}
                autoFocus
                className="w-full bg-brand-card border border-brand-border rounded-xl px-4 py-4 text-white placeholder-brand-muted text-center text-4xl font-display tracking-[0.5em] focus:outline-none focus:border-brand-amber transition-colors"
              />
              {error && <p className="text-brand-red text-sm text-center">{error}</p>}
              <button
                type="submit"
                className="w-full bg-brand-amber hover:bg-amber-500 text-brand-bg font-display text-2xl tracking-widest py-3 rounded-xl transition-colors"
              >
                JOIN
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}

export default function Home() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-brand-muted">Loading…</div>}>
      <HomeContent />
    </Suspense>
  )
}
