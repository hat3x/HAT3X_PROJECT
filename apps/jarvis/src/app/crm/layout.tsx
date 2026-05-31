import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'HAT3X CRM' }

const NAV = [
  { href: '/crm',           label: 'Pipeline',  icon: '◈' },
  { href: '/crm/projects',  label: 'Proyectos', icon: '◆' },
  { href: '/crm/clients',   label: 'Clientes',  icon: '◉' },
  { href: '/crm/finanzas',  label: 'Finanzas',  icon: '◇' },
]

export default function CRMLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex" style={{ background: '#040810', color: '#e2e8f0', fontFamily: 'system-ui,-apple-system,sans-serif' }}>
      <aside style={{ width: 200, background: '#07101f', borderRight: '1px solid #0f2040', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid #0f2040' }}>
          <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#10b981', letterSpacing: '0.15em', marginBottom: 4 }}>HAT3X</div>
          <div style={{ fontSize: 13, color: '#94a3b8', fontWeight: 500 }}>CRM</div>
        </div>
        <nav style={{ flex: 1, padding: '12px 0' }}>
          {NAV.map(({ href, label, icon }) => (
            <Link key={href} href={href} className="crm-nav-link"
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px', fontSize: 13, color: '#94a3b8', textDecoration: 'none', transition: 'color 0.15s' }}>
              <span style={{ fontSize: 14, color: '#10b981' }}>{icon}</span>
              {label}
            </Link>
          ))}
        </nav>
        <div style={{ padding: '16px 20px', borderTop: '1px solid #0f2040', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Link href="/command" style={{ fontSize: 11, fontFamily: 'monospace', color: '#475569', textDecoration: 'none', letterSpacing: '0.1em' }}>⬡ Command</Link>
          <Link href="/" style={{ fontSize: 11, fontFamily: 'monospace', color: '#475569', textDecoration: 'none', letterSpacing: '0.1em' }}>← Jarvis</Link>
        </div>
      </aside>
      <main style={{ flex: 1, overflow: 'auto' }}>
        {children}
      </main>
      <style>{`.crm-nav-link:hover { color: #e2e8f0 !important; background: rgba(16,185,129,0.06); }`}</style>
    </div>
  )
}
