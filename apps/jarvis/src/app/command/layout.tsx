import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'HAT3X Command — Oficina Virtual',
}

const NAV = [
  { href: '/command', label: 'Overview', icon: '⬡' },
  { href: '/command/proyectos', label: 'Proyectos', icon: '◈' },
  { href: '/command/equipo', label: 'Equipo', icon: '◉' },
  { href: '/command/checkpoints', label: 'Checkpoints', icon: '◆' },
]

export default function CommandLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex" style={{ background: '#040810', color: '#e2e8f0', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Sidebar */}
      <aside style={{ width: 200, background: '#07101f', borderRight: '1px solid #0f2040', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        {/* Logo */}
        <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid #0f2040' }}>
          <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#3b82f6', letterSpacing: '0.15em', marginBottom: 4 }}>HAT3X</div>
          <div style={{ fontSize: 13, color: '#94a3b8', fontWeight: 500 }}>Command Center</div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 0' }}>
          {NAV.map(({ href, label, icon }) => (
            <Link
              key={href}
              href={href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 20px',
                fontSize: 13,
                color: '#94a3b8',
                textDecoration: 'none',
                transition: 'color 0.15s',
              }}
              className="cmd-nav-link"
            >
              <span style={{ fontSize: 14, color: '#3b82f6' }}>{icon}</span>
              {label}
            </Link>
          ))}
        </nav>

        {/* Footer */}
        <div style={{ padding: '16px 20px', borderTop: '1px solid #0f2040' }}>
          <Link
            href="/"
            style={{ fontSize: 11, fontFamily: 'monospace', color: '#475569', textDecoration: 'none', letterSpacing: '0.1em' }}
          >
            ← Jarvis
          </Link>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflow: 'auto' }}>
        {children}
      </main>

      <style>{`
        .cmd-nav-link:hover { color: #e2e8f0 !important; background: rgba(59,130,246,0.06); }
      `}</style>
    </div>
  )
}
