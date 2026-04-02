import Link from 'next/link'
import NavBar from '@/components/NavBar'

const sections = [
  {
    href:  '/host/admin/personalities',
    icon:  '👤',
    label: 'PERSONALITIES',
    desc:  'Add and manage RHAP personalities and their photos',
    color: 'hover:border-purple-500 hover:shadow-[0_0_20px_rgba(168,85,247,0.15)]',
  },
  {
    href:  '/host/admin/import',
    icon:  '📥',
    label: 'IMPORT PLAYERS',
    desc:  'Bulk import players from any show via CSV',
    color: 'hover:border-brand-amber hover:shadow-[0_0_20px_rgba(244,162,97,0.15)]',
  },
  {
    href:  '/host/admin/seasons',
    icon:  '📺',
    label: 'SHOWS & SEASONS',
    desc:  'Manually add or edit seasons and castaway rosters',
    color: 'hover:border-blue-500 hover:shadow-[0_0_20px_rgba(59,130,246,0.15)]',
  },
  {
    href:  '/host/admin/lists',
    icon:  '📋',
    label: 'TRIVIA LISTS',
    desc:  'Create list prompts and assign the correct answers',
    color: 'hover:border-brand-green hover:shadow-[0_0_20px_rgba(46,194,126,0.15)]',
  },
]

export default function AdminPage() {
  return (
    <div className="min-h-screen bg-brand-bg">
      <NavBar />
      <div className="max-w-3xl mx-auto px-4 py-12">
        <div className="mb-10">
          <Link href="/host" className="text-brand-muted hover:text-white text-sm mb-4 inline-flex items-center gap-1 transition-colors">
            ← Dashboard
          </Link>
          <h1 className="font-display text-6xl text-white tracking-wide">ADMIN</h1>
          <p className="text-brand-muted mt-1">Manage your game content</p>
        </div>

        <div className="flex flex-col gap-4">
          {sections.map(s => (
            <Link key={s.href} href={s.href}
              className={`group bg-brand-panel border border-brand-border rounded-2xl p-6 flex items-center gap-5 transition-all duration-300 ${s.color}`}>
              <div className="text-4xl group-hover:scale-110 transition-transform w-14 text-center">{s.icon}</div>
              <div className="flex-1">
                <div className="font-display text-3xl text-white tracking-wide">{s.label}</div>
                <div className="text-brand-muted text-sm">{s.desc}</div>
              </div>
              <div className="text-brand-muted group-hover:text-white transition-colors text-xl">→</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
