'use client'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'

export default function NavBar() {
  const router   = useRouter()
  const pathname = usePathname()

  async function handleLogout() {
    await fetch('/api/auth', { method: 'DELETE' })
    router.push('/')
  }

  const links = [
    { href: '/host',                  label: 'Dashboard'   },
    { href: '/host/admin',            label: 'Admin'       },
    { href: '/host/game/setup',       label: 'New Game'    },
    { href: '/host/leaderboard',      label: 'Leaderboard' },
  ]

  return (
    <nav className="bg-brand-panel border-b border-brand-border sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/host" className="font-display text-2xl logo-gradient tracking-wider">
            WKT
          </Link>
          <div className="flex items-center gap-1">
            {links.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`px-3 py-1.5 rounded-lg text-sm font-body transition-colors ${
                  pathname === href
                    ? 'bg-brand-card text-white'
                    : 'text-brand-muted hover:text-white'
                }`}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="text-brand-muted hover:text-white text-sm transition-colors"
        >
          Log out
        </button>
      </div>
    </nav>
  )
}
